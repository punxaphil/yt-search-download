import { getRuntimeOptions } from '../config';

export async function triggerKodiLibraryScan() {
  const options = getRuntimeOptions();

  const kodiUser = options.kodiUsername || '';
  const kodiPassword = options.kodiPassword || '';
  const kodiHost = options.kodiHost || '';
  const kodiPort = options.kodiPort || '';

  if (!kodiHost || !kodiPort || !kodiUser || !kodiPassword) {
    throw new Error('Missing Kodi env vars. Required: KODI_USER, KODI_PASSWORD, KODI_HOST, KODI_PORT.');
  }

  const auth = Buffer.from(`${kodiUser}:${kodiPassword}`).toString('base64');
  const kodiUrl = `http://${kodiHost}:${kodiPort}/jsonrpc`;

  const response = await fetch(kodiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json;',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'VideoLibrary.Scan', id: 'mybash' }),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`Kodi refresh failed (${response.status}): ${rawBody}`);
  }

  let parsed: { error?: { message?: string } } | null = null;
  try {
    parsed = rawBody ? (JSON.parse(rawBody) as { error?: { message?: string } }) : null;
  } catch {
    parsed = null;
  }

  if (parsed?.error) {
    throw new Error(`Kodi error: ${parsed?.error.message || 'Unknown error'}`);
  }
}
