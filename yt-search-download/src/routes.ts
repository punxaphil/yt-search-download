import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { getRuntimeOptions } from './config';
import { ensureStateFiles, getRecentSingleVideos } from './utils/state';
import {
  listAllFilesRecursively,
  matchesFilenameQuery,
  extractYouTubeId,
  isYoutubeUrl,
  findFilesContainingYoutubeId,
} from './utils/files';
import { buildNfoContent } from './utils/nfo';
import { triggerKodiLibraryScan } from './services/kodi';
import { fetchYoutubeTitle } from './services/title';
import { getJob, setJob, runDownloadJob } from './services/download';
import { renderIndexPage } from './views/index-page';
import { searchYouTubeVideo } from './services/search';

export const router = Router();

router.use(express.urlencoded({ extended: false }));
router.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'views')));

router.get('/download-status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.status(200).json(job);
});

router.get('/recent-videos', (_req, res) => {
  try {
    const options = getRuntimeOptions();
    const { singleVideosFile } = ensureStateFiles(options.stateDir);
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
      if (videos.length === 10) break;
    }
    res.status(200).json({ videos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load recent videos' });
  }
});

router.get('/search-files', (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.status(200).json({ matches: [] });
      return;
    }
    const options = getRuntimeOptions();
    const saveDir = options.saveDir;
    if (!saveDir || !fs.existsSync(saveDir)) {
      res.status(500).json({ error: 'Missing or invalid --saveDir' });
      return;
    }
    const allFiles = listAllFilesRecursively(saveDir);
    const matches = allFiles
      .filter((filePath) => matchesFilenameQuery(path.basename(filePath), query))
      .slice(0, 20)
      .map((filePath) => path.relative(saveDir, filePath));
    res.status(200).json({ matches });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

router.get('/check-downloaded', (req, res) => {
  try {
    const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) {
      res.status(400).json({ error: 'Invalid YouTube URL' });
      return;
    }
    const options = getRuntimeOptions();
    const saveDir = options.saveDir;
    if (!saveDir || !fs.existsSync(saveDir)) {
      res.status(500).json({ error: 'Missing or invalid --saveDir' });
      return;
    }
    const matchingFiles = findFilesContainingYoutubeId(saveDir, youtubeId);
    res.status(200).json({ alreadyDownloaded: matchingFiles.length > 0, youtubeId, matchingFiles });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to check existing downloads' });
  }
});

router.get('/video-info', async (req, res) => {
  try {
    const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) {
      res.status(400).json({ error: 'Invalid YouTube URL' });
      return;
    }
    const options = getRuntimeOptions();
    const cookiesFile = options.cookiesFile || process.env.YTDLP_COOKIES_FILE || '/app/cookie.txt';
    let title = 'Unknown title';
    try {
      title = await fetchYoutubeTitle(url, fs.existsSync(cookiesFile) ? cookiesFile : undefined);
    } catch (e) {
      console.warn('video-info title lookup failed, falling back to placeholder title:', e);
    }
    res.status(200).json({ youtubeId, title, displayName: `${title} [${youtubeId}]` });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Failed to identify video' });
  }
});

router.get('/debug/runtime', (_req, res) => {
  try {
    const options = getRuntimeOptions();
    const stateDir = options.stateDir || '';
    const saveDir = options.saveDir || '';
    const stateFiles = ensureStateFiles(stateDir);

    const singleVideosExists = fs.existsSync(stateFiles.singleVideosFile);
    const singleVideosLines = singleVideosExists
      ? fs
          .readFileSync(stateFiles.singleVideosFile, 'utf-8')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean).length
      : 0;

    const saveDirExists = !!saveDir && fs.existsSync(saveDir);
    let saveDirEntries = 0;
    if (saveDirExists) {
      saveDirEntries = listAllFilesRecursively(saveDir).length;
    }

    res.status(200).json({
      argv: process.argv,
      runtimeOptionsResolved: options,
      state: {
        stateDir,
        exists: !!stateDir && fs.existsSync(stateDir),
        singleVideosFile: stateFiles.singleVideosFile,
        singleVideosExists,
        singleVideosLines,
      },
      save: { saveDir, exists: saveDirExists, fileCount: saveDirEntries },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message || 'debug runtime failed' });
  }
});

router.get('/', (_req, res) => {
  const options = getRuntimeOptions();
  const initialRecentVideos = getRecentSingleVideos(options.stateDir, 10);
  const html = renderIndexPage(options, initialRecentVideos);
  res.status(200).send(html);
});

router.post('/download-video', async (req, res) => {
  try {
    const url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
    if (!isYoutubeUrl(url)) {
      res.status(400).json({ error: 'Invalid YouTube URL' });
      return;
    }
    const youtubeId = extractYouTubeId(url);
    if (!youtubeId) {
      res.status(400).json({ error: 'Unable to extract YouTube ID from URL' });
      return;
    }
    const allowRedownload = String(req.body.allowRedownload || '') === '1';

    const options = getRuntimeOptions();
    if (!options.saveDir) {
      res.status(500).json({ error: 'Missing required option: --saveDir' });
      return;
    }
    fs.mkdirSync(options.saveDir, { recursive: true });

    const matchingFiles = findFilesContainingYoutubeId(options.saveDir, youtubeId);
    if (matchingFiles.length > 0 && !allowRedownload) {
      let error = `Video appears already downloaded for YouTube ID ${youtubeId}. Confirm redownload to continue.`;
      res.statusMessage = error;
      res.status(409).json({
        error,
        alreadyDownloaded: true,
        youtubeId,
        matchingFiles,
      });
      return;
    }

    const cookiesFile = options.cookiesFile || process.env.YTDLP_COOKIES_FILE || '/app/cookie.txt';
    if (!fs.existsSync(cookiesFile)) {
      res.status(500).json({
        error: `Missing cookies file at ${cookiesFile}. Add cookie.txt to the image or set YTDLP_COOKIES_FILE.`,
      });
      return;
    }

    const { singleVideosFile } = ensureStateFiles(options.stateDir);
    fs.appendFileSync(singleVideosFile, `${url}\n`);

    const jobId = randomUUID();
    setJob(jobId, { status: 'running', phase: 'queued', message: 'Job queued...' });
    void runDownloadJob(jobId, url, options.saveDir, cookiesFile);
    res.status(202).json({ jobId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error starting download job' });
  }
});

router.post('/rename-file', express.json(), async (req, res) => {
  try {
    const oldName = typeof req.body.oldName === 'string' ? req.body.oldName.trim() : '';
    const newName = typeof req.body.newName === 'string' ? req.body.newName.trim() : '';

    if (!oldName || !newName) {
      res.status(400).json({ error: 'Both oldName and newName are required' });
      return;
    }
    if (newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
      res.status(400).json({ error: 'Invalid new filename' });
      return;
    }

    const options = getRuntimeOptions();
    const saveDir = options.saveDir;
    if (!saveDir || !fs.existsSync(saveDir)) {
      res.status(500).json({ error: 'Missing or invalid --saveDir' });
      return;
    }

    const oldPath = path.resolve(saveDir, oldName);
    if (!oldPath.startsWith(path.resolve(saveDir))) {
      res.status(400).json({ error: 'Invalid old filename' });
      return;
    }
    if (!fs.existsSync(oldPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const oldDir = path.dirname(oldPath);
    const oldParsed = path.parse(path.basename(oldPath));
    const newParsed = path.parse(newName);
    const finalNewName = newParsed.ext ? newName : `${newName}${oldParsed.ext}`;
    const newPath = path.join(oldDir, finalNewName);

    if (!newPath.startsWith(path.resolve(saveDir))) {
      res.status(400).json({ error: 'Invalid new filename' });
      return;
    }

    fs.renameSync(oldPath, newPath);

    const oldNfoPath = path.join(oldDir, `${oldParsed.name}.nfo`);
    const newNfoParsed = path.parse(finalNewName);
    const newNfoPath = path.join(oldDir, `${newNfoParsed.name}.nfo`);

    if (fs.existsSync(oldNfoPath)) {
      const nfoContent = buildNfoContent(finalNewName);
      fs.writeFileSync(oldNfoPath, nfoContent);
      if (oldNfoPath !== newNfoPath) {
        fs.renameSync(oldNfoPath, newNfoPath);
      }
    }

    res.status(200).json({
      success: true,
      oldName: path.relative(saveDir, oldPath),
      newName: path.relative(saveDir, newPath),
      nfoUpdated: fs.existsSync(newNfoPath),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message || 'Rename failed' });
  }
});

router.post('/kodi-refresh', async (_req, res) => {
  try {
    await triggerKodiLibraryScan();
    res.status(200).json({ message: 'Kodi library scan triggered.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message || 'Error triggering Kodi refresh' });
  }
});

router.get('/search-video', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }
    const result = await searchYouTubeVideo(query);
    res.status(200).json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: (e as Error).message || 'Search failed' });
  }
});
