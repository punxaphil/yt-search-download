const form = document.getElementById('download-form');
const recentVideosField = document.getElementById('recent-videos-field');
const recentVideosSelect = document.getElementById('recent-videos');
const urlInput = document.getElementById('url');
const searchVideoInput = document.getElementById('video-search');
const fileSearchInput = document.getElementById('file-search');
const searchResults = document.getElementById('search-results');
const submitButton = document.getElementById('submit-button');
const kodiRefreshButton = document.getElementById('kodi-refresh-button');
const status = document.getElementById('status');
const debugBox = document.getElementById('debug-box');
const videoInfo = document.getElementById('video-info');
const videoSearchSpinner = document.getElementById('video-search-spinner');
const videoSearchResults = document.getElementById('video-search-results');

let searchTimer = null;
let searchRequestId = 0;
let videoSearchRequestId = 0;
let identifyTimer = null;
let identifyRequestId = 0;
let lastIdentifiedYoutubeId = '';
let lastClipboardCandidate = '';
let clipboardCheckInFlight = false;

const basePath = window.location.pathname === '/' ? '' : window.location.pathname;

const initialRecentVideos = readInitialRecentVideos();

recentVideosSelect.addEventListener('change', () => {
  if (recentVideosSelect.value) urlInput.value = recentVideosSelect.value;
});

renderRecentVideos(initialRecentVideos);
void loadRecentVideos();
void loadDebugInfo();

fileSearchInput.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void runFileSearch(fileSearchInput.value);
  }, 1700);
});

urlInput.addEventListener('input', () => {
  const youtubeId = extractYouTubeIdFromInput(urlInput.value);
  if (!youtubeId) {
    clearVideoInfo();
    lastIdentifiedYoutubeId = '';
    return;
  }
  fileSearchInput.value = youtubeId;
  if (searchTimer) clearTimeout(searchTimer);
  void runFileSearch(youtubeId);
  scheduleVideoInfoLookup();
});

searchVideoInput.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void runYouTubeSearch(searchVideoInput.value);
  }, 1700);
});

searchResults.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const index = target.dataset.index;
  if (!index) return;
  if (action === 'show-search-rename') showSearchRenameRow(target, index);
  if (action === 'save-search-rename') void renameSearchFile(index);
  if (action === 'cancel-search-rename') hideSearchRenameRow(index);
});

status.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.action === 'rename-downloaded') {
    void renameDownloadedFile();
  }
});

window.addEventListener('focus', () => {
  void maybeUseClipboardYouTubeUrl();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void maybeUseClipboardYouTubeUrl();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  urlInput.disabled = true;
  recentVideosSelect.disabled = true;
  submitButton.disabled = true;
  kodiRefreshButton.disabled = true;
  submitButton.textContent = 'Loading...';
  status.className = 'status loading show';
  status.textContent = 'Checking existing downloads...';

  let allowRedownload = false;
  try {
    const precheckResponse = await fetch(basePath + '/check-downloaded?url=' + encodeURIComponent(urlInput.value));
    const precheckResult = await precheckResponse.json();
    if (precheckResponse.ok && precheckResult.alreadyDownloaded) {
      const matchingFiles = Array.isArray(precheckResult.matchingFiles) ? precheckResult.matchingFiles : [];
      const filesDetails =
        matchingFiles.length > 0
          ? '\n\nExisting downloaded file(s):\n- ' + matchingFiles.map((file) => String(file)).join('\n- ')
          : '';
      const confirmed = window.confirm(
        'A downloaded video already contains this YouTube ID (' +
          precheckResult.youtubeId +
          '). Do you want to redownload it?' +
          filesDetails,
      );
      if (!confirmed) {
        enableForm();
        return;
      }
      allowRedownload = true;
    }
  } catch (error) {
    console.error(error);
  }

  const payload = new URLSearchParams({ url: urlInput.value, allowRedownload: allowRedownload ? '1' : '0' });
  status.className = 'status loading show';
  status.textContent = 'Downloading and generating NFO...';
  let started = false;

  try {
    const response = await fetch(basePath + '/download-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });
    const result = await response.json();
    if (!response.ok) {
      status.className = 'status error show';
      status.textContent = result.error || 'Download failed';
      return;
    }
    started = true;
    const jobId = result.jobId;
    if (!jobId) {
      status.className = 'status error show';
      status.textContent = 'Download started but no job ID was returned';
      return;
    }
    await pollDownloadStatus(jobId);
  } catch (error) {
    status.className = 'status error show';
    status.textContent = 'Request failed';
    console.error(error);
  } finally {
    if (started) await loadRecentVideos();
    enableForm();
  }
});

async function loadRecentVideos() {
  try {
    const response = await fetch(basePath + '/recent-videos');
    const result = await response.json();
    if (!response.ok) return;
    renderRecentVideos(Array.isArray(result.videos) ? result.videos : []);
  } catch (error) {
    console.error(error);
  }
}

async function loadDebugInfo() {
  try {
    const runtimeResponse = await fetch(basePath + '/debug/runtime');
    const runtimeResult = await runtimeResponse.json();
    const recentResponse = await fetch(basePath + '/recent-videos');
    const recentResult = await recentResponse.json();
    const searchProbeResponse = await fetch(basePath + '/search-files?q=' + encodeURIComponent('test'));
    const searchProbeResult = await searchProbeResponse.json();
    const lines = [
      '[debug/runtime] ' + runtimeResponse.status,
      JSON.stringify(runtimeResult, null, 2),
      '',
      '[recent-videos] ' + recentResponse.status,
      JSON.stringify(recentResult, null, 2),
      '',
      '[search-files?q=test] ' + searchProbeResponse.status,
      JSON.stringify(searchProbeResult, null, 2),
    ];
    debugBox.className = 'debug-box show';
    debugBox.textContent = lines.join('\n');
  } catch (error) {
    debugBox.className = 'debug-box show';
    debugBox.textContent = 'Debug load failed: ' + String(error);
  }
}

function renderRecentVideos(videos) {
  const list = Array.isArray(videos) ? videos : [];
  if (list.length === 0) {
    recentVideosField.style.display = 'none';
    return;
  }
  recentVideosField.style.display = 'block';
  recentVideosSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose from ' + list.length + ' most recent...';
  recentVideosSelect.appendChild(placeholder);
  for (const video of list) {
    const option = document.createElement('option');
    option.value = String(video);
    option.textContent = String(video);
    recentVideosSelect.appendChild(option);
  }
}

async function pollDownloadStatus(jobId) {
  while (true) {
    const response = await fetch(basePath + '/download-status/' + encodeURIComponent(jobId));
    const job = await response.json();
    if (!response.ok) {
      status.className = 'status error show';
      status.textContent = job.error || 'Failed to fetch download status';
      return;
    }
    if (job.status === 'running') {
      status.className = 'status loading show';
      status.textContent = '[' + (job.phase || 'running') + '] ' + (job.message || 'Working...');
      await delay(900);
      continue;
    }
    if (job.status === 'error') {
      status.className = 'status error show';
      status.textContent = job.message || 'Download failed';
      return;
    }
    status.className = 'status success show';
    let message = 'Downloaded: ' + escapeHtml(job.downloaded || '') + '<br/>Created NFO: ' + escapeHtml(job.nfo || '');
    if (job.kodiMessage) message += '<br/>Kodi: ' + escapeHtml(job.kodiMessage);
    message +=
      '<br/><div class="rename-row" id="rename-downloaded">' +
      '<input type="text" id="rename-downloaded-input" value="' +
      escapeHtml(job.downloaded || '') +
      '" />' +
      '<button type="button" data-action="rename-downloaded">Rename</button></div>';
    status.innerHTML = message;
    return;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function showVideoInfo(kind, text) {
  videoInfo.className = 'video-info show ' + kind;
  videoInfo.textContent = String(text || '');
}
function clearVideoInfo() {
  videoInfo.className = 'video-info';
  videoInfo.textContent = '';
}

function scheduleVideoInfoLookup() {
  if (identifyTimer) clearTimeout(identifyTimer);
  identifyTimer = setTimeout(() => {
    void lookupVideoInfo();
  }, 260);
}

async function lookupVideoInfo() {
  const url = String(urlInput.value || '').trim();
  const youtubeId = extractYouTubeIdFromInput(url);
  if (!youtubeId) {
    clearVideoInfo();
    return;
  }
  if (youtubeId === lastIdentifiedYoutubeId) return;
  const requestId = ++identifyRequestId;
  showVideoInfo('loading', 'Identifying video...');
  try {
    const response = await fetch(basePath + '/video-info?url=' + encodeURIComponent(url));
    const result = await response.json();
    if (requestId !== identifyRequestId) return;
    if (!response.ok) {
      showVideoInfo('error', result.error || 'Unable to identify video');
      return;
    }
    lastIdentifiedYoutubeId = youtubeId;
    showVideoInfo('success', "Video identified as '" + String(result.displayName || '') + "'");
  } catch (error) {
    if (requestId !== identifyRequestId) return;
    showVideoInfo('error', 'Unable to identify video');
  }
}

async function maybeUseClipboardYouTubeUrl() {
  if (clipboardCheckInFlight || !document.hasFocus() || !navigator.clipboard || !navigator.clipboard.readText) return;
  clipboardCheckInFlight = true;
  try {
    const clipboardText = await navigator.clipboard.readText();
    const candidate = extractFirstYouTubeUrlFromText(clipboardText);
    if (!candidate) return;
    const currentValue = String(urlInput.value || '').trim();
    if (candidate === currentValue || candidate === lastClipboardCandidate) return;
    lastClipboardCandidate = candidate;
    const useClipboard = window.confirm('Detected a YouTube URL in clipboard. Use it for download?');
    if (!useClipboard) return;
    urlInput.value = candidate;
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
  } finally {
    clipboardCheckInFlight = false;
  }
}

function extractFirstYouTubeUrlFromText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  if (extractYouTubeIdFromInput(text)) return text;
  const parts = text
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const rawPart of parts) {
    const candidate = rawPart.replace(/[),.;]+$/, '');
    if (extractYouTubeIdFromInput(candidate)) return candidate;
  }
  return null;
}

async function runFileSearch(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    searchResults.className = 'search-results';
    searchResults.innerHTML = '';
    return;
  }
  const requestId = ++searchRequestId;
  try {
    const response = await fetch(basePath + '/search-files?q=' + encodeURIComponent(query));
    const result = await response.json();
    if (requestId !== searchRequestId) return;
    if (!response.ok) {
      searchResults.className = 'search-results show';
      searchResults.innerHTML = '<div class="search-empty">Search failed</div>';
      return;
    }
    const matches = Array.isArray(result.matches) ? result.matches : [];
    searchResults.className = 'search-results show';
    if (matches.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">No matches</div>';
      return;
    }
    const countLine =
      '<div class="search-results-count">' + matches.length + ' hit' + (matches.length === 1 ? '' : 's') + '</div>';
    const items = matches
      .map((item, idx) => {
        const escaped = escapeHtml(String(item));
        const basename = String(item).split('/').pop() || String(item);
        return (
          '<div class="search-result-item">' +
          '<span>' +
          escaped +
          '</span>' +
          '<button type="button" class="rename-btn" data-action="show-search-rename" data-index="' +
          idx +
          '">Rename</button>' +
          '<div class="rename-row" id="search-rename-row-' +
          idx +
          '" style="display:none;">' +
          '<input type="text" data-old-name="' +
          escaped +
          '" value="' +
          escapeHtml(basename) +
          '" />' +
          '<button type="button" data-action="save-search-rename" data-index="' +
          idx +
          '">Save</button>' +
          '<button type="button" class="secondary" data-action="cancel-search-rename" data-index="' +
          idx +
          '">Cancel</button>' +
          '</div></div>'
        );
      })
      .join('');
    searchResults.innerHTML = countLine + items;
  } catch (error) {
    if (requestId !== searchRequestId) return;
    searchResults.className = 'search-results show';
    searchResults.innerHTML = '<div class="search-empty">Search failed</div>';
    console.error(error);
  }
}

async function runYouTubeSearch(query) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) {
    videoSearchResults.innerHTML = '';
    return;
  }
  const requestId = ++videoSearchRequestId;
  searchVideoInput.disabled = true;
  videoSearchSpinner.style.display = 'inline-block';
  try {
    const response = await fetch(basePath + '/search-video?q=' + encodeURIComponent(trimmedQuery));
    const result = await response.json();
    if (requestId !== videoSearchRequestId) return;
    if (!response.ok) throw new Error(result.error || 'Search failed');
    if (result && result.url) {
      urlInput.value = result.url;
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      videoSearchResults.innerHTML = '<div class="search-item">' + escapeHtml(result.title || '') + '</div>';
    } else {
      videoSearchResults.innerHTML = '<div class="search-empty">No video found</div>';
    }
  } catch (error) {
    if (requestId !== videoSearchRequestId) return;
    console.error(error);
  } finally {
    if (requestId === videoSearchRequestId) {
      videoSearchSpinner.style.display = 'none';
      searchVideoInput.disabled = false;
    }
  }
}

kodiRefreshButton.addEventListener('click', async () => {
  submitButton.disabled = true;
  kodiRefreshButton.disabled = true;
  const originalKodiText = kodiRefreshButton.textContent;
  kodiRefreshButton.textContent = 'Refreshing...';
  status.className = 'status loading show';
  status.textContent = 'Triggering Kodi library scan...';
  try {
    const response = await fetch(basePath + '/kodi-refresh', { method: 'POST' });
    const result = await response.json();
    if (response.ok) {
      status.className = 'status success show';
      status.textContent = result.message || 'Kodi scan started.';
    } else {
      status.className = 'status error show';
      status.textContent = result.error || 'Kodi refresh failed';
    }
  } catch (error) {
    status.className = 'status error show';
    status.textContent = 'Kodi refresh request failed';
    console.error(error);
  } finally {
    submitButton.disabled = false;
    kodiRefreshButton.disabled = false;
    kodiRefreshButton.textContent = originalKodiText;
  }
});

function enableForm() {
  urlInput.disabled = false;
  recentVideosSelect.disabled = false;
  submitButton.disabled = false;
  kodiRefreshButton.disabled = false;
  submitButton.textContent = 'Download';
}

function readInitialRecentVideos() {
  try {
    const videos = JSON.parse(document.body.dataset.initialRecentVideos || '[]');
    return Array.isArray(videos) ? videos : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function renameDownloadedFile() {
  const input = document.getElementById('rename-downloaded-input');
  const newName = input.value.trim();
  const oldName = input.defaultValue.trim();
  if (!newName || newName === oldName) return;
  try {
    const response = await fetch(basePath + '/rename-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert('Rename failed: ' + (result.error || 'Unknown error'));
      return;
    }
    input.defaultValue = result.newName;
    input.value = result.newName;
    status
      .querySelector('#rename-downloaded')
      .insertAdjacentHTML(
        'afterend',
        '<div style="color:var(--ok-ink);font-size:0.88rem;margin-top:4px;">Renamed successfully' +
          (result.nfoUpdated ? ' (NFO updated)' : '') +
          '</div>',
      );
  } catch (error) {
    alert('Rename request failed');
    console.error(error);
  }
}

function showSearchRenameRow(button, index) {
  button.style.display = 'none';
  document.getElementById('search-rename-row-' + index).style.display = 'flex';
}

function hideSearchRenameRow(index) {
  const row = document.getElementById('search-rename-row-' + index);
  row.style.display = 'none';
  row.parentElement.querySelector('.rename-btn').style.display = '';
}

async function renameSearchFile(index) {
  const row = document.getElementById('search-rename-row-' + index);
  const input = row.querySelector('input');
  const oldName = input.getAttribute('data-old-name');
  const newName = input.value.trim();
  if (!newName || newName === oldName.split('/').pop()) {
    hideSearchRenameRow(index);
    return;
  }
  try {
    const response = await fetch(basePath + '/rename-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    });
    const result = await response.json();
    if (!response.ok) {
      alert('Rename failed: ' + (result.error || 'Unknown error'));
      return;
    }
    await runFileSearch(fileSearchInput.value);
  } catch (error) {
    alert('Rename request failed');
    console.error(error);
  }
}

function extractYouTubeIdFromInput(rawValue) {
  try {
    const parsed = new URL(String(rawValue || '').trim());
    if (parsed.hostname === 'youtu.be') {
      const id = (parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname).trim();
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

(function () {
  const sse = new EventSource(basePath + '/hot-reload');
  sse.onerror = function () {
    sse.close();
    const poll = setInterval(function () {
      fetch(basePath + '/')
        .then(function (response) {
          if (response.ok) {
            clearInterval(poll);
            window.location.reload();
          }
        })
        .catch(function () {});
    }, 1500);
  };
})();
