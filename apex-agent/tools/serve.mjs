#!/usr/bin/env node
// Local preview server that is honest about production.
//
// `python3 -m http.server` serves the files, but it does not send the headers the app actually runs
// under — so a preview could "work" locally and break on Vercel (or the other way round). This server
// reads the same Content-Security-Policy and hard headers from vercel.json and sends them, which is
// what makes `npm run render -- --base http://127.0.0.1:8080` a real test of the deployed app.
//
//   node tools/serve.mjs            # 0.0.0.0:8080
//   node tools/serve.mjs --port 9000 --no-headers
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const ROOT = path.resolve(APP_ROOT, arg('root', '.'));
const PORT = Number(arg('port', process.env.PORT || 8080));
const HOST = arg('host', '0.0.0.0');
const WITH_HEADERS = !argv.includes('--no-headers');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
};

/** vercel.json header rules, applied by source pattern — not all of them on every request. */
function deploymentRules() {
  // Only the shapes this file uses: "/(.*)", "/assets/(.*)" and exact paths.
  const toRegExp = (source) =>
    new RegExp(
      '^' +
        String(source)
          .replace(/\(\.\*\)/g, '*')
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$',
    );
  try {
    const conf = JSON.parse(readFileSync(path.join(APP_ROOT, 'vercel.json'), 'utf8'));
    return (conf.headers || []).map((rule) => ({ match: toRegExp(rule.source), headers: rule.headers || [] }));
  } catch {
    return [];
  }
}

/** Merged headers for one path: matching rules in order, later values win. */
function headersFor(pathname) {
  const out = {};
  for (const rule of WITH_HEADERS ? deploymentRules() : []) {
    if (!rule.match.test(pathname)) continue;
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  // What the browser asks for is what vercel.json patterns are written against.
  const extra = headersFor(url);
  const rel = url === '/' ? '/index.html' : url.replace(/\/$/, '/index.html');
  const unsafe = path.normalize(rel).replace(/^([/\\])+/, '');
  const file = path.join(ROOT, unsafe);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { ...extra, 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  // A rule may pin a Content-Type (the manifest); otherwise the file extension decides. One header
  // per name: sending two would let the browser pick the wrong one.
  const headers = { ...extra };
  if (!headers['content-type']) headers['content-type'] = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (!headers['cache-control']) headers['cache-control'] = 'no-store';
  res.writeHead(200, headers);
  res.end(readFileSync(file));
});

server.listen(PORT, HOST, () => {
  const csp = headersFor('/')['content-security-policy'] ? 'production CSP + hard headers' : 'no CSP (--no-headers)';
  console.log(`apex preview: http://${HOST}:${PORT}/  ·  ${csp}`);
});
