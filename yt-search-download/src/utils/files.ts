import fs from 'fs';
import path from 'path';

export function listAllFilesRecursively(rootDir: string) {
  const result: string[] = [];
  const walk = (dirPath: string) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  };
  walk(rootDir);
  return result;
}

export function matchesFilenameQuery(filename: string, query: string) {
  const normalizedName = filename.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.every((token) => normalizedName.includes(token));
}

export function extractYouTubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').trim();
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v') || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isYoutubeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('youtube.com') || parsed.hostname === 'youtu.be';
  } catch {
    return false;
  }
}

export function findFilesContainingYoutubeId(saveDir: string, youtubeId: string) {
  return listAllFilesRecursively(saveDir)
    .filter((filePath) => isVideoFile(filePath) && path.basename(filePath).includes(youtubeId))
    .map((filePath) => path.relative(saveDir, filePath));
}

export function isVideoFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'].includes(ext);
}
