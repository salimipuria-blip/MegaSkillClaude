// Path guard for the Hermes local bridge (P0: read-only).
// Every path coming from a job is resolved against the configured root, symlinks are
// followed with realpath, and protected files are refused both by name and by target.
import { realpathSync } from 'node:fs';
import path from 'node:path';

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

const MAX_PATH_LENGTH = 500;
// Files that look secret-like but are documented templates with empty values.
const ALLOW_EXACT = new Set(['.env.example']);
const DENY_BASENAME = [
  /^\.env(\..+)?$/,
  /^\.netrc$/,
  /^\.git-credentials$/,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
];

/** True when a root-relative POSIX path must never be read or listed. */
export function isDeniedRelative(relPosix) {
  const parts = relPosix.split('/');
  if (parts.includes('.git')) return true;
  const base = parts[parts.length - 1];
  if (ALLOW_EXACT.has(base)) return false;
  return DENY_BASENAME.some((re) => re.test(base));
}

/**
 * Resolve a job-supplied relative path inside an already-realpath'd root.
 * Returns { abs, rel } where rel is the real root-relative POSIX path.
 */
export function resolveReadPath(rootReal, requested) {
  let rel = requested === undefined || requested === null || requested === '' ? '.' : requested;
  if (typeof rel !== 'string') throw new BridgeError('BAD_PATH', 'path must be a string');
  if (rel.length > MAX_PATH_LENGTH) throw new BridgeError('BAD_PATH', 'path is too long');
  if (rel.includes('\0') || rel.includes('\\')) throw new BridgeError('BAD_PATH', 'path contains forbidden characters');
  if (path.posix.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) throw new BridgeError('BAD_PATH', 'absolute paths are not allowed');

  const norm = path.posix.normalize(rel);
  if (norm === '..' || norm.startsWith('../')) throw new BridgeError('OUTSIDE_ROOT', 'path escapes the bridge root');

  let real;
  try {
    real = realpathSync(path.join(rootReal, norm));
  } catch {
    throw new BridgeError('NOT_FOUND', 'path does not exist');
  }
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
    throw new BridgeError('OUTSIDE_ROOT', 'path resolves outside the bridge root');
  }
  const relReal = path.relative(rootReal, real).split(path.sep).join('/') || '.';
  if (relReal !== '.' && isDeniedRelative(relReal)) {
    throw new BridgeError('DENIED', 'path is protected');
  }
  return { abs: real, rel: relReal };
}
