import fs from 'fs';
import path from 'path';

const youtubeIdSuffixPattern = /\s*\[[-_A-Za-z0-9]{11}\]$/;

export function buildNfoContent(outputFilename: string) {
  const { artist, title } = getMusicVideoMetadata(outputFilename);

  return `<musicvideo>\n  <title>${escapeXml(title)}</title>\n  <artist>${escapeXml(artist)}</artist>\n  <original_filename>${escapeXml(outputFilename)}</original_filename>\n</musicvideo>\n`;
}

export function getMusicVideoMetadata(filename: string) {
  const baseName = normalizeFilenameCharacters(path.parse(filename).name).replace(youtubeIdSuffixPattern, '').trim();
  const artistAndTitle = cleanMusicVideoTitle(baseName);
  const separatorMatch = artistAndTitle.match(/\s+[-–—]\s+|[-–—]/);

  if (!separatorMatch || separatorMatch.index === undefined) {
    return {
      artist: 'Unknown Artist',
      title: artistAndTitle || 'Unknown Title',
    };
  }

  const artist = artistAndTitle.slice(0, separatorMatch.index).trim();
  const title = artistAndTitle.slice(separatorMatch.index + separatorMatch[0].length).trim();
  return {
    artist: artist || 'Unknown Artist',
    title: title || 'Unknown Title',
  };
}

export function cleanMusicVideoFilename(filename: string) {
  const parsed = path.parse(filename);
  const normalizedName = normalizeFilenameCharacters(parsed.name);
  const idMatch = normalizedName.match(youtubeIdSuffixPattern);
  const idSuffix = idMatch ? idMatch[0].trimStart() : '';
  let titlePart = idMatch ? normalizedName.slice(0, -idMatch[0].length) : normalizedName;

  titlePart = cleanMusicVideoTitle(titlePart);

  if (!titlePart) {
    titlePart = normalizedName
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const cleanedName = idSuffix ? `${titlePart} ${idSuffix}` : titlePart;
  return `${cleanedName}${parsed.ext}`;
}

function normalizeFilenameCharacters(value: string) {
  return value.replace(/[\uF020-\uF07E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xf000));
}

function cleanMusicVideoTitle(title: string) {
  return title
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s*\([^)]*\b(?:official|officical|remaster(?:ed)?|music\s+video)\b[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*\b(?:official|officical|remaster(?:ed)?|music\s+video)\b[^\]]*\]/gi, '')
    .replace(/\b(?:official|officical)(?:\s+music)?\s+video\b/gi, '')
    .replace(/\b(?:official|officical)\s+audio\b/gi, '')
    .replace(/\b[0-9]{4}\s+remaster(?:ed)?\b/gi, '')
    .replace(/\bremaster(?:ed)?(?:\s+(?:version|edit|mix))?\b/gi, '')
    .replace(/\s*\(\)/g, '')
    .replace(/\s*\[\]/g, '')
    .replace(/\s*-\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function moveToCleanFilename(originalPath: string, cleanedFilename: string) {
  const dir = path.dirname(originalPath);
  const originalFilename = path.basename(originalPath);
  if (originalFilename === cleanedFilename) {
    return originalPath;
  }
  const targetPath = getUniquePath(dir, cleanedFilename);
  fs.renameSync(originalPath, targetPath);
  return targetPath;
}

export function getUniquePath(dir: string, filename: string) {
  let candidate = path.join(dir, filename);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }
  const parsed = path.parse(filename);
  let attempt = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name} (${attempt})${parsed.ext}`);
    attempt++;
  }
  return candidate;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
