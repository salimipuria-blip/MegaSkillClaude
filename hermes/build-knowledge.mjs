// Deploy-time step (npm postinstall): copy the portfolio and each project's brief/roadmap/progress docs into
// ./public/knowledge (gitignored) so the Worker can read them as static assets. Never fails the build.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS, focusDoc } from './knowledge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT = join(here, 'public', 'knowledge');
const MAX_DOC = 12000; // stored per project; the prompt clips further

try {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const portfolio = join(ROOT, 'docs', 'PORTFOLIO.md');
  if (existsSync(portfolio)) writeFileSync(join(OUT, 'portfolio.md'), readFileSync(portfolio, 'utf8'));
  let written = 0;
  for (const p of PROJECTS) {
    const parts = p.docs
      .map((d) => [d, join(ROOT, p.dir || p.id, d)])
      .filter(([, f]) => existsSync(f))
      .map(([d, f]) => focusDoc(d, readFileSync(f, 'utf8')).trim());
    if (!parts.length) continue;
    writeFileSync(join(OUT, `${p.id}.md`), parts.join('\n\n').slice(0, MAX_DOC));
    written++;
  }
  console.log(`[build-knowledge] portfolio ${existsSync(portfolio) ? 'ok' : 'missing'} + ${written} projects → public/knowledge`);
} catch (err) {
  console.log(`[build-knowledge] skipped: ${err.message}`);
}
