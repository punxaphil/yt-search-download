import { runYtDlpWithProgress } from './ytdlp';

export async function searchYouTubeVideo(query: string) {
  // yt-dlp --skip-download --print '%(title)s\n%(webpage_url)s' 'ytsearch1:Colbie Callait Sheryl Crow Ill be there'
  // Reuse runYtDlpWithProgress for consistency
  let commandResult = await runYtDlpWithProgress('search', [
    '--print',
    '%(title)s\n%(webpage_url)s',
    '--skip-download',
    `ytsearch1:${query}`,
  ]);
  console.log(`yt-dlp search result for query "${query}":`, commandResult.stdout);
  const lines = commandResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const url = lines.pop();
  const title = lines.pop() || '';
  return { url: url || '', title };
}
