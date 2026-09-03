import fs from 'fs';
import path from 'path';

export function buildNfoContent(outputFilename: string) {
  const baseName = path.parse(outputFilename).name;
  const match = baseName.match(/^(.*) \[([^\]]+)\]$/);
  const artistAndTitle = match ? match[1] : baseName;
  const separatorIndex = artistAndTitle.indexOf(' - ');

  const artist = separatorIndex >= 0 ? artistAndTitle.slice(0, separatorIndex).trim() : 'Unknown Artist';
  const title = separatorIndex >= 0 ? artistAndTitle.slice(separatorIndex + 3).trim() : artistAndTitle.trim();

  return `<musicvideo>\n  <title>${escapeXml(title)}</title>\n  <artist>${escapeXml(artist)}</artist>\n  <original_filename>${escapeXml(outputFilename)}</original_filename>\n</musicvideo>\n`;
}

export function cleanMusicVideoFilename(filename: string) {
  const parsed = path.parse(filename);
  const idMatch = parsed.name.match(/\s*\[[-_A-Za-z0-9]{11}\]$/);
  const idSuffix = idMatch ? idMatch[0].trimStart() : '';
  let titlePart = idMatch ? parsed.name.slice(0, -idMatch[0].length) : parsed.name;

  titlePart = titlePart
    .replace(/[\uF020-\uF07E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xf000))
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

  if (!titlePart) {
    titlePart = parsed.name
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const cleanedName = idSuffix ? `${titlePart} ${idSuffix}` : titlePart;
  return `${cleanedName}${parsed.ext}`;
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
