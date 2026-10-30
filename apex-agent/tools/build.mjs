// Publish only application code and skill prose; never vendor scripts or credentials.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const library = path.resolve(root, '../plugins/mega-skills-router/skills/mega-skills-router');
const index = JSON.parse(readFileSync(path.join(library, 'references/triggers.json'), 'utf8'));
rmSync(output, { recursive: true, force: true });
mkdirSync(path.join(output, 'skills/bodies'), { recursive: true });
for (const name of ['index.html', 'assets', 'manifest.webmanifest', 'src/app', 'src/core']) {
  cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
const skills = index.skills.filter(s => !s.incomplete).map((s, i) => {
  const source = path.resolve(library, s.source_path);
  if (!source.startsWith(library + path.sep)) throw new Error('Skill path escapes library');
  const body = readFileSync(source, 'utf8');
  writeFileSync(path.join(output, `skills/bodies/${i}.txt`), body);
  return { id: i, name: s.name, domain: s.domain, triggers: s.triggers };
});
writeFileSync(path.join(output, 'skills/index.json'), JSON.stringify({ version: 1, count: skills.length, skills }));
cpSync(path.join(library, 'references/licenses'), path.join(output, 'skills/licenses'), { recursive: true });
console.log(`Built dist: ${skills.length} skill bodies, application and upstream licenses; imported scripts excluded.`);
