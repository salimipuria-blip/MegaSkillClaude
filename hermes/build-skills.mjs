// Deploy-time step (npm postinstall): turn the repo's Mega Skills router index into static assets for the Worker.
// Reads ../plugins/mega-skills-router/... and writes ./public/skills/ (gitignored). Never fails the build.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPostings, SKILL_CHARS } from './skill-router.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROUTER = join(here, '..', 'plugins', 'mega-skills-router', 'skills', 'mega-skills-router');
const OUT = join(here, 'public', 'skills');

function trim(md) {
  let s = md.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  if (s.length <= SKILL_CHARS) return s;
  s = s.slice(0, SKILL_CHARS);
  const cut = s.lastIndexOf('\n\n');
  return (cut > SKILL_CHARS * 0.6 ? s.slice(0, cut) : s) + '\n\n[…trimmed]';
}

try {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 't'), { recursive: true });
  mkdirSync(join(OUT, 's'), { recursive: true });
  const indexPath = join(ROUTER, 'references', 'triggers.json');
  if (!existsSync(indexPath)) throw new Error(`skill index not found at ${indexPath}`);
  const { skills } = JSON.parse(readFileSync(indexPath, 'utf8'));
  let written = 0;
  skills.forEach((s, id) => {
    let body = '';
    try { body = trim(readFileSync(join(ROUTER, s.source_path), 'utf8')); } catch { /* missing file: keep the name only */ }
    writeFileSync(join(OUT, 's', `${id}.md`), `# ${s.name}\n${body}`);
    written++;
  });
  buildPostings(skills).forEach((shard, n) => writeFileSync(join(OUT, 't', `${n}.json`), JSON.stringify(shard)));
  const active = skills.filter((s) => !s.incomplete).length;
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ total: active, packaged: skills.length, excludedIncomplete: skills.length - active }));
  console.log(`[build-skills] ${written} skills → public/skills (${active} routable; ${skills.length - active} incomplete excluded)`);
} catch (err) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ total: 0 }));
  console.log(`[build-skills] skipped: ${err.message}`);
}
