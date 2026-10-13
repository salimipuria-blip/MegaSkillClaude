// Runs on Cloudflare Workers Builds (npm postinstall), before `wrangler deploy`.
// Secrets entered under Settings → Build → Variables and secrets exist only at build time;
// this copies them to the Worker's runtime secrets so the bot can read them. Values are never printed.
import { writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const NAMES = ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'ALLOWED_USER_ID', 'GITHUB_MODELS_TOKEN', 'GROQ_API_KEY', 'CEREBRAS_API_KEY',
  'MISTRAL_API_KEY', 'HF_TOKEN', 'OPENROUTER_API_KEY'];
const found = Object.fromEntries(NAMES.filter((n) => process.env[n]).map((n) => [n, process.env[n].trim()]));

if (!process.env.CLOUDFLARE_API_TOKEN || Object.keys(found).length === 0) {
  console.log('[sync-secrets] nothing to sync');
  process.exit(0);
}
const file = '.secrets.tmp.json';
try {
  writeFileSync(file, JSON.stringify(found), { mode: 0o600 });
  execFileSync('npx', ['wrangler', 'secret', 'bulk', file, '--name', 'hermes'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`[sync-secrets] synced: ${Object.keys(found).join(', ')}`);
} catch (err) {
  console.error('[sync-secrets] failed (build continues):', err.message);
} finally {
  rmSync(file, { force: true });
}
