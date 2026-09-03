import { spawn } from 'child_process';

export async function fetchYoutubeTitle(url: string, cookiesFile?: string) {
  const errors: string[] = [];

  try {
    return await runYtDlpTitleLookup(url);
  } catch (e) {
    errors.push(`yt-dlp(no-cookies): ${(e as Error).message}`);
  }

  if (cookiesFile) {
    try {
      return await runYtDlpTitleLookup(url, cookiesFile);
    } catch (e) {
      errors.push(`yt-dlp(cookies): ${(e as Error).message}`);
    }
  }

  try {
    const title = await fetchTitleFromOEmbed(url);
    if (title) return title;
    errors.push('oEmbed returned empty title');
  } catch (e) {
    errors.push(`oEmbed: ${(e as Error).message}`);
  }

  try {
    const title = await fetchTitleFromWatchHtml(url);
    if (title) return title;
    errors.push('watch html returned empty title');
  } catch (e) {
    errors.push(`watch html: ${(e as Error).message}`);
  }

  throw new Error(`Unable to identify YouTube title. ${errors.join(' | ')}`);
}

async function runYtDlpTitleLookup(url: string, cookiesFile?: string) {
  return await new Promise<string>((resolve, reject) => {
    const args = ['--ignore-config', '--no-playlist', '--skip-download', '--no-warnings', '--print', '%(title)s'];
    if (cookiesFile) {
      args.push('--cookies', cookiesFile);
    }
    args.push(url);

    const child = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Timed out while identifying video'));
    }, 25000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if ((code ?? 1) !== 0) {
        reject(new Error(stderr || 'yt-dlp metadata lookup failed'));
        return;
      }
      const title = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .pop();
      if (!title) {
        reject(new Error('yt-dlp returned empty title'));
        return;
      }
      resolve(title);
    });
  });
}

async function fetchTitleFromOEmbed(url: string) {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { title?: string };
  return String(payload.title || '').trim();
}

async function fetchTitleFromWatchHtml(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) return decodeHtmlEntities(ogMatch[1].trim());

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch?.[1]) return '';
  return decodeHtmlEntities(titleMatch[1].replace(/\s*-\s*YouTube\s*$/i, '').trim());
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
