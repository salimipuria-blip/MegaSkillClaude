// Read-only tools for the Hermes local bridge (P0).
// No function here writes, deletes, renames or spawns a shell. Git is called through
// execFile with a fixed argument list.
import { execFile } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { BridgeError, isDeniedRelative, resolveReadPath } from './paths.mjs';

export const LIMITS = Object.freeze({
  readDefaultBytes: 64 * 1024,
  readMaxBytes: 128 * 1024,
  listMaxEntries: 500,
  searchMaxFiles: 5000,
  searchMaxFileBytes: 512 * 1024,
  searchDefaultResults: 50,
  searchMaxResults: 200,
  searchLineChars: 300,
  searchQueryMin: 2,
  searchQueryMax: 200,
  gitMaxLines: 500,
  gitTimeoutMs: 10000,
});

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);

function clampInt(value, fallback, min, max) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value)) throw new BridgeError('BAD_ARGS', 'expected an integer');
  return Math.min(Math.max(value, min), max);
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

function childRel(rel, name) {
  return rel === '.' ? name : `${rel}/${name}`;
}

export function readFileTool(ctx, args) {
  const max = clampInt(args.maxBytes, LIMITS.readDefaultBytes, 1, LIMITS.readMaxBytes);
  const { abs, rel } = resolveReadPath(ctx.rootReal, args.path);
  const st = statSync(abs);
  if (!st.isFile()) throw new BridgeError('NOT_A_FILE', 'path is not a regular file');
  if (st.size > max) throw new BridgeError('TOO_LARGE', `file is ${st.size} bytes; limit is ${max}`);
  const buf = readFileSync(abs);
  if (isBinary(buf)) throw new BridgeError('BINARY', 'binary files are not returned');
  return { path: rel, bytes: buf.length, content: buf.toString('utf8') };
}

export function listDirTool(ctx, args) {
  const { abs, rel } = resolveReadPath(ctx.rootReal, args.path);
  if (!statSync(abs).isDirectory()) throw new BridgeError('NOT_A_DIRECTORY', 'path is not a directory');
  const entries = [];
  for (const dirent of readdirSync(abs, { withFileTypes: true })) {
    if (entries.length >= LIMITS.listMaxEntries) break;
    let resolved;
    try {
      resolved = resolveReadPath(ctx.rootReal, childRel(rel, dirent.name));
    } catch {
      continue; // protected, broken or escaping entries are simply not shown
    }
    const st = statSync(resolved.abs);
    entries.push({ name: dirent.name, path: resolved.rel, type: st.isDirectory() ? 'dir' : 'file' });
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return { path: rel, entries, truncated: entries.length >= LIMITS.listMaxEntries };
}

export function searchTool(ctx, args) {
  if (typeof args.query !== 'string') throw new BridgeError('BAD_ARGS', 'query must be a string');
  const query = args.query.trim();
  if (query.length < LIMITS.searchQueryMin || query.length > LIMITS.searchQueryMax) {
    throw new BridgeError('BAD_ARGS', `query length must be ${LIMITS.searchQueryMin}-${LIMITS.searchQueryMax}`);
  }
  const maxResults = clampInt(args.maxResults, LIMITS.searchDefaultResults, 1, LIMITS.searchMaxResults);
  const start = resolveReadPath(ctx.rootReal, args.path);
  if (!statSync(start.abs).isDirectory()) throw new BridgeError('NOT_A_DIRECTORY', 'search path must be a directory');

  const needle = query.toLowerCase();
  const matches = [];
  const queue = [start.rel];
  let filesScanned = 0;
  let truncated = false;

  outer: while (queue.length) {
    const dirRel = queue.shift();
    const dirAbs = resolveReadPath(ctx.rootReal, dirRel).abs;
    for (const dirent of readdirSync(dirAbs, { withFileTypes: true })) {
      if (dirent.isSymbolicLink()) continue; // never follow links during a walk
      if (SKIP_DIRS.has(dirent.name)) continue;
      const rel = childRel(dirRel, dirent.name);
      if (isDeniedRelative(rel)) continue;
      if (dirent.isDirectory()) {
        queue.push(rel);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (filesScanned >= LIMITS.searchMaxFiles) {
        truncated = true;
        break outer;
      }
      filesScanned += 1;
      const abs = path.join(ctx.rootReal, rel);
      if (lstatSync(abs).size > LIMITS.searchMaxFileBytes) continue;
      const buf = readFileSync(abs);
      if (isBinary(buf)) continue;
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].toLowerCase().includes(needle)) {
          matches.push({ path: rel, line: i + 1, text: lines[i].slice(0, LIMITS.searchLineChars) });
          if (matches.length >= maxResults) {
            truncated = true;
            break outer;
          }
        }
      }
    }
  }
  return { query, path: start.rel, matches, filesScanned, truncated };
}

export function gitStatusTool(ctx) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', ctx.rootReal, 'status', '--porcelain=v1', '--branch'],
      { timeout: LIMITS.gitTimeoutMs, maxBuffer: 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) {
          reject(new BridgeError('GIT_FAILED', 'git status failed'));
          return;
        }
        const lines = stdout.split('\n').filter(Boolean);
        resolve({
          branch: lines[0] ?? '',
          changes: lines.slice(1, 1 + LIMITS.gitMaxLines),
          truncated: lines.length - 1 > LIMITS.gitMaxLines,
        });
      },
    );
  });
}
