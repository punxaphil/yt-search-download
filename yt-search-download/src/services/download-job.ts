import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { buildNfoContent, cleanMusicVideoFilename, moveToCleanFilename } from '../utils/nfo';
import { triggerKodiLibraryScan } from './kodi';

export type DownloadJobState = {
  status: 'running' | 'success' | 'error';
  phase: string;
  message: string;
  downloaded?: string;
  nfo?: string;
  kodiMessage?: string;
};

const downloadJobs = new Map<string, DownloadJobState>();

export function getJob(jobId: string) {
  return downloadJobs.get(jobId);
}

export function setJob(jobId: string, state: DownloadJobState) {
  downloadJobs.set(jobId, state);
}

export async function runDownloadJob(jobId: string, url: string, saveDir: string, cookiesFile: string) {
  try {
    setJob(jobId, { status: 'running', phase: 'starting', message: 'Starting yt-dlp...' });

    const ytDlpArgsBase = buildYtDlpArgs('bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]', saveDir, cookiesFile, url);

    let commandResult = await runYtDlpWithProgress(jobId, ytDlpArgsBase);

    const firstAttemptStderr = commandResult.stderr || '';
    const shouldRetry =
      commandResult.status !== 0 &&
      (firstAttemptStderr.includes('Requested format is not available') ||
        firstAttemptStderr.includes('Signature solving failed') ||
        firstAttemptStderr.includes('nsig') ||
        firstAttemptStderr.includes('Only images are available for download'));

    if (shouldRetry) {
      setJob(jobId, {
        status: 'running',
        phase: 'fallback',
        message: 'Preferred format unavailable, trying fallback format...',
      });
      const fallbackArgs = buildYtDlpArgs(
        'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        saveDir,
        cookiesFile,
        url,
      );
      commandResult = await runYtDlpWithProgress(jobId, fallbackArgs);
    }

    if (commandResult.status !== 0) {
      const finalStderr = commandResult.stderr || 'Unknown yt-dlp error';
      console.error(finalStderr);
      if (isAuthRejectedError(finalStderr)) {
        setJob(jobId, {
          status: 'error',
          phase: 'failed',
          message: `Download failed: YouTube rejected cookie.txt (${cookiesFile}). Re-export fresh cookies and rebuild/redeploy the image.`,
        });
        return;
      }
      setJob(jobId, { status: 'error', phase: 'failed', message: `Download failed: ${finalStderr}` });
      return;
    }

    const outputPath = commandResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();

    if (!outputPath) {
      setJob(jobId, {
        status: 'error',
        phase: 'failed',
        message: 'Download succeeded but output file path could not be detected',
      });
      return;
    }

    setJob(jobId, { status: 'running', phase: 'nfo', message: 'Download complete. Generating NFO...' });

    const outputFilename = path.basename(outputPath);
    const cleanedOutputFilename = cleanMusicVideoFilename(outputFilename);
    const finalVideoPath = moveToCleanFilename(outputPath, cleanedOutputFilename);
    const finalVideoFilename = path.basename(finalVideoPath);

    const nfoContent = buildNfoContent(finalVideoFilename);
    const nfoPath = path.join(saveDir, `${path.parse(finalVideoFilename).name}.nfo`);
    fs.writeFileSync(nfoPath, nfoContent);

    setJob(jobId, {
      status: 'running',
      phase: 'kodi',
      message: 'NFO generated. Triggering Kodi library scan...',
      downloaded: finalVideoFilename,
      nfo: path.basename(nfoPath),
    });

    let kodiMessage: string;
    try {
      await triggerKodiLibraryScan();
      kodiMessage = 'Library scan triggered.';
    } catch (kodiError) {
      kodiMessage = `Automatic refresh failed: ${(kodiError as Error).message}`;
    }

    setJob(jobId, {
      status: 'success',
      phase: 'done',
      message: 'Download complete.',
      downloaded: finalVideoFilename,
      nfo: path.basename(nfoPath),
      kodiMessage,
    });
  } catch (e) {
    console.error(e);
    setJob(jobId, { status: 'error', phase: 'failed', message: 'Error downloading video' });
  }
}

export async function searchYouTubeVideo(query: string) {
  // yt-dlp --skip-download --print '%(title)s\n%(webpage_url)s' 'ytsearch1:Colbie Callait Sheryl Crow Ill be there'
  // Reuse runYtDlpWithProgress for consistency
  let commandResult = await runYtDlpWithProgress('search', [
    '--print',
    '%(title)s\n%(webpage_url)s',
    '--skip-download',
    `ytsearch1:${query}`,
  ]);
  const lines = commandResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const url = lines.pop();
  const title = lines.pop() || '';
  return { url: url || '', title };
}

function buildYtDlpArgs(format: string, saveDir: string, cookiesFile: string, url: string) {
  return [
    '--js-runtimes',
    'node',
    '--progress',
    '--newline',
    '--progress-template',
    'download:%(progress._percent_str)s eta=%(progress.eta)s speed=%(progress.speed)s',
    '-f',
    format,
    '--merge-output-format',
    'mp4',
    '-o',
    '%(title)s [%(id)s].%(ext)s',
    '--print',
    'after_move:filepath',
    '--paths',
    saveDir,
    '--cookies',
    cookiesFile,
    url,
  ];
}

function onData(chunk: Buffer, stdout: string, jobId: string) {
  const text = chunk.toString();
  stdout += text;
  const lastLine = text
    .split(/[\r\n]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (lastLine) {
    const progressLine = normalizeProgressLine(lastLine);
    const phase = progressLine.toLowerCase().includes('download') ? 'downloading' : 'processing';
    setJob(jobId, { status: 'running', phase, message: progressLine });
  }
  return stdout;
}

async function runYtDlpWithProgress(jobId: string, args: string[]) {
  return await new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => (stdout = onData(chunk, stdout, jobId)));
    child.stderr.on('data', (chunk: Buffer) => (stderr = onData(chunk, stderr, jobId)));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ status: code ?? 1, stdout, stderr }));
  });
}

function normalizeProgressLine(line: string) {
  if (line.startsWith('download:')) {
    return line.replace(/^download:/, '[download] ').trim();
  }
  return line;
}

function isAuthRejectedError(stderr: string) {
  return stderr.includes('cookies are no longer valid') || stderr.includes("Sign in to confirm you're not a bot");
}
