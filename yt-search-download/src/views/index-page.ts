import fs from 'fs';
import { RuntimeOptions } from '../config';

export function renderIndexPage(
  options: RuntimeOptions & { stateDir: string; saveDir: string },
  initialRecentVideos: string[],
) {
  const debugSummary = {
    resolvedStateDir: options.stateDir || '',
    resolvedSaveDir: options.saveDir || '',
    stateDirExists: !!options.stateDir && fs.existsSync(options.stateDir),
    saveDirExists: !!options.saveDir && fs.existsSync(options.saveDir),
    initialRecentVideosCount: initialRecentVideos.length,
  };

  return `
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>YouTube Video Downloader</title>
        <style>${getStyles()}</style>
      </head>
      <body data-initial-recent-videos="${escapeHtml(JSON.stringify(initialRecentVideos))}">
        <main class="panel">
          <h1>YouTube Video Downloader</h1>
          <p class="subtitle">Download one video at a time and auto-generate matching Kodi NFO metadata.</p>
          <form id="download-form">
            <div id="recent-videos-field" class="field" style="display: none;">
              <label for="recent-videos">Recent submissions</label>
              <select id="recent-videos" name="recent-videos">
                <option value="">Choose from recent...</option>
              </select>
            </div>

            <div class="field">
              <label for="url">URL</label>
              <input id="url" name="url" type="url" required placeholder="https://www.youtube.com/watch?v=cmSbXsFE3l8" />
              <div id="video-info" class="video-info" aria-live="polite"></div>
            </div>

            <div class="field">
              <label for="video-search">Search (updates URL field on the fly if a result is found)</label>
              <input id="video-search" name="video-search" type="text" placeholder="Type to search YouTube..." />
              <div id="video-search-spinner" class="spinner" style="display: none;"></div>
              <div id="video-search-results" aria-live="polite"></div>
            </div>

            <div class="field">
              <label for="file-search">Search Downloaded Files</label>
              <input id="file-search" name="file-search" type="text" placeholder="Type to search in saveDir (e.g. donna pray)" />
              <div id="search-results" class="search-results" aria-live="polite"></div>
            </div>

            <div class="actions">
              <button id="submit-button" type="submit">Download</button>
              <button id="kodi-refresh-button" class="secondary" type="button">Refresh Kodi Library</button>
            </div>
          </form>
          <div id="status" class="status" aria-live="polite"></div>
          <div class="debug-summary">Debug (server-rendered)
resolvedStateDir: ${escapeHtml(String(debugSummary.resolvedStateDir))}
resolvedSaveDir: ${escapeHtml(String(debugSummary.resolvedSaveDir))}
stateDirExists: ${String(debugSummary.stateDirExists)}
saveDirExists: ${String(debugSummary.saveDirExists)}
initialRecentVideosCount: ${String(debugSummary.initialRecentVideosCount)}
Inspect full JSON: <a id="debug-runtime-link" href="#" target="_blank" rel="noreferrer">/debug/runtime</a></div>
          <div id="debug-box" class="debug-box" aria-live="polite"></div>
        </main>
        <script>
          window.appBasePath = window.location.pathname === '/' ? '' : window.location.pathname;
          document.getElementById('debug-runtime-link').href = window.appBasePath + '/debug/runtime';
          const script = document.createElement('script');
          script.src = window.appBasePath + '/index-page.js';
          document.head.appendChild(script);
        </script>
      </body>
    </html>
  `;
}

function getStyles() {
  return `
    :root {
      --bg-top: #0f172a; --bg-bottom: #1e293b; --card: #fffaf0; --ink: #1f2937;
      --muted: #5b6472; --accent: #ff6a3d; --accent-strong: #e64f21;
      --ok-bg: #e8fff4; --ok-ink: #0a6a3b; --err-bg: #fff1f2; --err-ink: #9f1239;
      --ring: rgba(230, 79, 33, 0.28);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: 'Avenir Next', 'Trebuchet MS', 'Segoe UI', sans-serif; color: var(--ink); background: radial-gradient(circle at 15% 10%, #1d4ed8 0%, transparent 34%), radial-gradient(circle at 85% 0%, #f97316 0%, transparent 30%), linear-gradient(170deg, var(--bg-top), var(--bg-bottom)); display: grid; place-items: center; padding: 18px; }
    .panel { width: min(760px, 100%); background: var(--card); border-radius: 16px; box-shadow: 0 22px 45px rgba(0,0,0,0.24); padding: 22px; border: 1px solid rgba(15,23,42,0.15); }
    h1 { margin: 0 0 6px; font-size: clamp(1.4rem, 4vw, 2rem); line-height: 1.1; }
    .subtitle { margin: 0 0 18px; color: var(--muted); font-size: 0.95rem; }
    .field { margin-top: 12px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.95rem; }
    input, select { width: 100%; border: 1px solid #cfd6df; border-radius: 10px; padding: 10px 12px; font-size: 0.98rem; transition: box-shadow 0.18s ease, border-color 0.18s ease; background: #ffffff; color: var(--ink); }
    input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--ring); outline: none; }
    .actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
    button { border: 0; border-radius: 10px; padding: 11px 16px; font-size: 1rem; font-weight: 700; color: #ffffff; background: linear-gradient(120deg, var(--accent), #ff8a3d); cursor: pointer; transition: transform 0.15s ease, filter 0.15s ease; }
    .secondary { background: linear-gradient(120deg, #2563eb, #0ea5e9); }
    button:hover { transform: translateY(-1px); filter: brightness(1.03); }
    button:disabled { cursor: not-allowed; opacity: 0.65; transform: none; }
    .status { margin-top: 14px; padding: 11px 12px; border-radius: 10px; font-size: 0.95rem; display: none; border: 1px solid transparent; line-height: 1.35; }
    .status.show { display: block; }
    .status.loading { display: block; background: #eef4ff; color: #1e3a8a; border-color: #c7d2fe; }
    .status.success { background: var(--ok-bg); color: var(--ok-ink); border-color: #8de7bf; }
    .status.error { background: var(--err-bg); color: var(--err-ink); border-color: #f8a8bc; white-space: pre-wrap; }
    .search-results { margin-top: 8px; border: 1px solid #d8dde5; border-radius: 10px; background: #ffffff; max-height: min(60vh, 720px); overflow: auto; display: none; }
    .search-results.show { display: block; }
    .search-result-item { padding: 8px 10px; border-bottom: 1px solid #edf0f5; font-size: 0.92rem; line-height: 1.25; word-break: break-word; }
    .search-results-count { padding: 8px 10px; border-bottom: 1px solid #edf0f5; font-size: 0.86rem; color: var(--muted); background: #fafcff; }
    .search-result-item:last-child { border-bottom: 0; }
    .search-empty { padding: 9px 10px; color: var(--muted); font-size: 0.9rem; }
    .video-info { margin-top: 8px; border-radius: 10px; padding: 9px 10px; font-size: 0.92rem; line-height: 1.3; display: none; border: 1px solid transparent; }
    .video-info.show { display: block; }
    .video-info.loading { background: #eef4ff; color: #1e3a8a; border-color: #c7d2fe; }
    .video-info.success { background: var(--ok-bg); color: var(--ok-ink); border-color: #8de7bf; }
    .video-info.error { background: var(--err-bg); color: var(--err-ink); border-color: #f8a8bc; }
    .debug-box { margin-top: 14px; border: 1px dashed #9aa4b2; border-radius: 10px; padding: 10px; background: #f8fbff; font-size: 0.83rem; color: #334155; display: none; white-space: pre-wrap; line-height: 1.3; }
    .debug-box.show { display: block; }
    .debug-summary { margin-top: 14px; border: 1px solid #d8dde5; border-radius: 10px; background: #ffffff; padding: 10px; font-size: 0.84rem; line-height: 1.3; color: #334155; white-space: pre-wrap; }
    .debug-summary a { color: #1d4ed8; }
    .rename-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
    .rename-row input { flex: 1; min-width: 180px; padding: 6px 8px; font-size: 0.88rem; border-radius: 8px; }
    .rename-row button { padding: 6px 10px; font-size: 0.85rem; border-radius: 8px; }
    .rename-btn { padding: 4px 8px; font-size: 0.82rem; border-radius: 6px; background: linear-gradient(120deg, #6366f1, #818cf8); margin-left: 6px; }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(0, 0, 0, 0.1); border-radius: 50%; border-top-color: #6366f1; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) { .panel { padding: 16px; border-radius: 12px; } button { width: 100%; } }
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
