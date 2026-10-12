// Explicit owner action; never invoked by install/test hooks. Secrets come from the local environment.
import { pathToFileURL } from 'node:url';
import { setupKey } from './security.mjs';

export async function connectWebhook(env, fetchFn = fetch) {
  for (const key of ['HERMES_URL', 'TELEGRAM_BOT_TOKEN', 'ALLOWED_USER_ID']) {
    if (!env[key] || !String(env[key]).trim()) throw new Error(`Set ${key} in your local environment (not in Git).`);
  }
  let url;
  try { url = new URL(env.HERMES_URL); } catch { throw new Error('HERMES_URL must be the HTTPS Worker origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('HERMES_URL must be the HTTPS Worker origin, with no credentials, path, query or fragment.');
  }
  url.pathname = '/setup';
  let response;
  try {
    response = await fetchFn(url.href, { method: 'POST', headers: { authorization: `Bearer ${await setupKey(env)}` }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
  } catch {
    // Don't print a fetch exception: an arbitrary transport/response may contain sensitive headers.
    throw new Error('Webhook setup request failed. Check connectivity and HERMES_URL.');
  }
  await response.body?.cancel().catch(() => {});
  if (!response.ok) throw new Error(`Webhook setup failed (${response.status}); check the server configuration and owner environment.`);
  return 'Webhook connected. Open the private Telegram chat and send /app for a fresh link.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectWebhook(process.env).then((message) => console.log(message)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
