// Domain-separated keys: possession of a setup key cannot open the app or forge Telegram updates.
const digest = async (text, length) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
};

export const appKey = (env) => digest(`app:v2:${env.TELEGRAM_BOT_TOKEN}:${String(env.ALLOWED_USER_ID).trim()}`, 40);
export const webhookSecret = (env) => digest(`hermes:${env.TELEGRAM_BOT_TOKEN}`, 48);
export const setupKey = (env) => digest(`setup:v1:${env.TELEGRAM_BOT_TOKEN}:${String(env.ALLOWED_USER_ID).trim()}`, 48);
