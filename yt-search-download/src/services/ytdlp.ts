import { spawn } from 'child_process';
import { setJob } from './download';

export function buildYtDlpArgs(format: string, saveDir: string, cookiesFile: string, url: string) {
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

export async function runYtDlpWithProgress(jobId: string, args: string[]) {
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

function normalizeProgressLine(line: string) {
  if (line.startsWith('download:')) {
    return line.replace(/^download:/, '[download] ').trim();
  }
  return line;
}
