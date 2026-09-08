import fs from 'fs';
import path from 'path';
import { buildNfoContent, cleanMusicVideoFilename, moveToCleanFilename } from '../utils/nfo';
import { triggerKodiLibraryScan } from './kodi';
import { buildYtDlpArgs, runYtDlpWithProgress } from './ytdlp';

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

function isAuthRejectedError(stderr: string) {
  return stderr.includes('cookies are no longer valid') || stderr.includes("Sign in to confirm you're not a bot");
}
