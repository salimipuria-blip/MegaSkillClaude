#!/usr/bin/env node
// Deterministic SBOM generator (CycloneDX 1.5) with zero dependencies.
//
// Why not `cyclonedx-npm`: it is another package to trust, needs network, and
// its output changes with the tool version. This script only reads the
// lockfiles that are already committed, so the SBOM is reproducible offline and
// a diff in the SBOM always means a diff in a lockfile.
//
// Usage: node scripts/audit/make_sbom.mjs [--out docs/audit/sbom.cdx.json]
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {createHash} from 'node:crypto';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..', '..');
const APPS = ['psk', 'lithos', 'fjcod', 'bison-brand-book', 'hermes'];

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = resolve(ROOT, outIdx >= 0 ? args[outIdx + 1] : 'docs/audit/sbom.cdx.json');

const purlFor = (name, version) =>
  `pkg:npm/${name.replace('@', '%40').replace('/', '%2F')}@${version}`;

const components = [];
const appMetadata = [];

for (const app of APPS) {
  const pkgPath = join(ROOT, app, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  appMetadata.push({
    type: 'application',
    name: pkg.name || app,
    version: pkg.version || '0.0.0',
    'bom-ref': `app:${app}`,
    purl: `pkg:npm/${pkg.name || app}@${pkg.version || '0.0.0'}`,
  });

  const lockPath = join(ROOT, app, 'package-lock.json');
  if (!existsSync(lockPath)) {
    appMetadata.at(-1).properties = [
      {name: 'sbom:note', value: 'no lockfile committed (zero runtime dependencies)'},
    ];
    continue;
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  for (const [path, meta] of Object.entries(lock.packages || {})) {
    if (!path || !path.startsWith('node_modules/')) continue;
    const name = meta.name || path.replace(/^node_modules\//, '');
    if (!meta.version) continue;
    const dev = meta.dev === true;
    const component = {
      type: 'library',
      'bom-ref': `${app}:${purlFor(name, meta.version)}`,
      group: name.startsWith('@') ? name.split('/')[0] : undefined,
      name: name.startsWith('@') ? name.split('/')[1] : name,
      version: meta.version,
      purl: purlFor(name, meta.version),
      scope: dev ? 'optional' : 'required',
      properties: [
        {name: 'sbom:app', value: app},
        {name: 'sbom:dev', value: String(dev)},
        {name: 'sbom:integrity', value: meta.integrity || 'missing'},
      ],
    };
    if (!component.group) delete component.group;
    if (!meta.integrity) {
      component.properties.push({name: 'sbom:warning', value: 'lockfile entry has no integrity hash'});
    }
    components.push(component);
  }
}

components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']));

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${createHash('sha256')
    .update(components.map((c) => c['bom-ref']).join('\n'))
    .digest('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5')}`,
  version: 1,
  metadata: {
    timestamp: new Date(0).toISOString(), // fixed: the SBOM must not churn per run
    tools: [{vendor: 'MegaSkillClaude', name: 'scripts/audit/make_sbom.mjs', version: '1.0.0'}],
    component: {type: 'application', name: 'MegaSkillClaude', version: '2026.11.0'},
    properties: [
      {name: 'sbom:source', value: 'package-lock.json (lockfileVersion 3)'},
      {name: 'sbom:deterministic', value: 'true'},
    ],
  },
  components: [...appMetadata, ...components],
};

mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, JSON.stringify(bom, null, 2) + '\n');
const missingIntegrity = components.filter((c) => c.properties.some((p) => p.name === 'sbom:warning')).length;
console.log(`SBOM: ${components.length} packages + ${appMetadata.length} apps -> ${OUT}`);
console.log(`missing integrity hashes: ${missingIntegrity}`);
