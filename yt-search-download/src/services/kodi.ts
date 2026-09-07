export async function triggerKodiLibraryScan() {
  const kodiUser = process.env.KODI_USER || '';
  const kodiPassword = process.env.KODI_PASSWORD || '';
  const kodiHost = process.env.KODI_HOST || '';
  const kodiPort = process.env.KODI_PORT || '';

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
