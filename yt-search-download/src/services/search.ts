import { runYtDlpWithProgress } from './ytdlp';

export async function searchYouTubeVideo(query: string) {
  // yt-dlp --skip-download --print '%(title)s\n%(webpage_url)s' 'ytsearch1:Colbie Callait Sheryl Crow Ill be there'
  // Reuse runYtDlpWithProgress for consistency
  let commandResult = await runYtDlpWithProgress('search', [
    '--print',
    '%(title)s\n%(webpage_url)s',
    '--skip-download',
    `ytsearch10:${query}`,
  ]);
  console.log(`yt-dlp search result for query "${query}":`, commandResult.stdout);
  const lines = commandResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const results: { title: string; url: string }[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const title = lines[i];
    const url = lines[i + 1];
    if (title && url) {
      results.push({ title, url });
    }
  }
  return results;
}
