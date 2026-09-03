import fs from 'fs';
import { resolveExistingDir } from '../config';

export function ensureStateFiles(stateDirOption?: string) {
  const stateDir =
    resolveExistingDir([stateDirOption, process.env.STATE_DIR, '/state', 'state']) ||
    stateDirOption ||
    process.env.STATE_DIR ||
    '/state';
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  const stateFileDone = `${stateDir}/done.txt`;
  if (!fs.existsSync(stateFileDone)) {
    fs.writeFileSync(stateFileDone, '');
  }

  const stateFileFailed = `${stateDir}/failed.txt`;
  if (!fs.existsSync(stateFileFailed)) {
    fs.writeFileSync(stateFileFailed, '');
  }

  const singleVideosFile = `${stateDir}/single_videos.txt`;
  if (!fs.existsSync(singleVideosFile)) {
    fs.writeFileSync(singleVideosFile, '');
  }

  return { stateFileDone, stateFileFailed, singleVideosFile };
}

export function getRecentSingleVideos(stateDirOption?: string, limit = 10) {
  const { singleVideosFile } = ensureStateFiles(stateDirOption);
  const lines = fs
    .readFileSync(singleVideosFile, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const videos: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const url = lines[i];
    if (seen.has(url)) continue;
    seen.add(url);
    videos.push(url);
    if (videos.length === limit) break;
  }

  return videos;
}
