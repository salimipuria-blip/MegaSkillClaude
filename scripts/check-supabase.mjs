#!/usr/bin/env node
/**
 * Read-only Supabase readiness check for the VIKING team workspace (backlog task 37).
 *
 * Contract — this script is safe to run against a live project:
 *  - it needs only the project URL and the *publishable/anon* key (never `service_role`);
 *  - it performs no write: tables are probed with `GET …?select=…&limit=1`, storage with `GET`,
 *    and functions with `POST /rest/v1/<fn>` carrying an empty `{}` body (PostgREST has no
 *    GET form for RPC; an empty argument list cannot change data);
 *  - it never prints, logs or stores the key — the report only says a key of N chars was used;
 *  - it exits non-zero when something the SQL files promise is actually missing, so it can gate
 *    a deploy conversation instead of adding another unchecked claim to the docs.
 *
 * Why permission errors are *good* news: `sql/viking_supabase_schema.sql` revokes `execute` on
 * `viking_is_active_member()`/`viking_is_admin()` from `public, anon` and the trigger function is
 * revoked from everyone. So with an anon key:
 *   42501 (insufficient_privilege) ⇒ the function exists and is locked down as the SQL intends;
 *   42883 (undefined_function)     ⇒ it was never created — that is the failure this reports;
 *   200                            ⇒ somebody granted execute to anon: flagged as insecure.
 * Tables are expected to answer 200 with rows filtered by RLS (often zero rows for a non-member);
 * a missing table answers 404 + 42P01, a renamed column 400 + 42703.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node scripts/check-supabase.mjs [--json]
 *   (SUPABASE_KEY / SUPABASE_ANON_KEY are accepted as aliases; `.env.example` uses SUPABASE_KEY)
 *   node scripts/check-supabase.mjs --url https://<ref>.supabase.co --key <publishable> [--json]
 *   node scripts/check-supabase.mjs --expected-only        # no network, prints what it would check
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');

/** What `viking-team/sql/*.sql` promises, so "ready" has a definition instead of a vibe. */
export const EXPECTED = Object.freeze({
  tables: Object.freeze([
    { name: 'viking_team_members', columns: ['email', 'role', 'active', 'added_at'] },
    { name: 'viking_workspace_records', columns: ['id', 'kind', 'title', 'trip_id', 'payload', 'created_at', 'updated_at'] },
    { name: 'viking_trip_media', columns: ['id', 'trip_id', 'storage_path', 'display_name', 'mime_type', 'size_bytes', 'created_at'] },
  ]),
  functions: Object.freeze(['viking_is_active_member', 'viking_is_admin', 'viking_enforce_five_active_members']),
  bucket: 'viking-private',
  clientFile: 'viking-team/team/app.js',
  sqlFiles: Object.freeze(['viking-team/sql/viking_supabase_schema.sql', 'viking-team/sql/viking_limit_five_active_members.sql']),
});

/** Postgres SQLSTATE codes PostgREST forwards verbatim in the JSON error body. */
export const PG = Object.freeze({
  undefinedTable: '42P01',
  undefinedColumn: '42703',
  undefinedFunction: '42883',
  insufficientPrivilege: '42501',
});

const FAILING = new Set(['missing', 'drift', 'insecure']);

async function probe(fetchImpl, url, key, path, { method = 'GET', body = null, requests = [] } = {}) {
  const target = `${url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  requests.push({ method, path, body });
  let response;
  try {
    response = await fetchImpl(target, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(body === null ? {} : { Prefer: 'return=minimal' }),
      },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    return { status: 0, code: null, message: `network error: ${error?.message ?? error}`, data: null };
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return {
    status: response.status,
    code: data && typeof data === 'object' ? data.code ?? null : null,
    message: data && typeof data === 'object' ? data.message ?? null : null,
    data,
  };
}

/**
 * Run every readiness probe. Pure enough to test: the caller injects `fetchImpl`, so no test ever
 * touches the network. `requests` is filled with every call made, which is how the test proves the
 * script stayed read-only.
 */
export async function runChecks({
  url,
  key,
  fetchImpl,
  expected = EXPECTED,
  clientSource = null,
  requests = [],
} = {}) {
  if (!url || !/^https:\/\/[^\s]+$/u.test(url)) throw new Error('a https:// Supabase URL is required');
  if (!key) throw new Error('a publishable/anon key is required (never the service_role key)');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl is required');

  const checks = [];
  const warnings = [];
  const send = (path, options) => probe(fetchImpl, url, key, path, { ...options, requests });

  for (const table of expected.tables) {
    const probeUrl = `${table.name}?select=${table.columns.join(',')}&limit=1`;
    const result = await send(`rest/v1/${probeUrl}`);
    let state = 'unknown';
    let detail = '';
    if (result.status === 200 || result.status === 206) {
      state = 'ready';
      const rows = Array.isArray(result.data) ? result.data.length : null;
      detail = rows === 0
        ? 'reachable; RLS returned 0 rows for this key (expected for a non-member)'
        : `reachable; ${rows} row(s) visible to this key`;
    } else if (result.code === PG.undefinedTable) {
      state = 'missing';
      detail = `table ${table.name} does not exist — run ${expected.sqlFiles[0]} first`;
    } else if (result.code === PG.undefinedColumn) {
      state = 'drift';
      detail = `a column of ${table.columns.join('/')} is gone: ${result.message ?? 'undefined_column'}`;
    } else if (result.code === PG.insufficientPrivilege || result.status === 401 || result.status === 403) {
      state = 'blocked';
      detail = 'the key was rejected or SELECT was revoked; the browser client could not read this table either';
    } else {
      detail = `HTTP ${result.status}${result.code ? ` ${result.code}` : ''}: ${result.message ?? 'no detail'}`;
    }
    checks.push({ kind: 'table', name: table.name, state, status: result.status, code: result.code, detail });
  }

  for (const fn of expected.functions) {
    const result = await send(`rest/v1/rpc/${fn}`, { method: 'POST', body: {} });
    let state = 'unknown';
    let detail = '';
    if (result.code === PG.insufficientPrivilege || result.status === 403) {
      state = 'ready';
      detail = 'exists and execute is revoked from this key, exactly as the SQL intends';
    } else if (result.code === PG.undefinedFunction) {
      state = 'missing';
      detail = `function ${fn}() does not exist — the SQL file was not applied (or the trigger file was skipped)`;
    } else if (result.status === 200) {
      state = 'insecure';
      detail = 'callable with the publishable key: execute is granted to anon/public, contrary to the SQL file';
    } else {
      detail = `HTTP ${result.status}${result.code ? ` ${result.code}` : ''}: ${result.message ?? 'no detail'}`;
    }
    checks.push({ kind: 'function', name: fn, state, status: result.status, code: result.code, detail });
  }

  const bucket = await send(`storage/v1/bucket/${expected.bucket}`);
  let bucketState = 'unknown';
  let bucketDetail = '';
  if (bucket.status === 200) {
    const isPublic = bucket.data && typeof bucket.data === 'object' ? bucket.data.public === true : null;
    bucketState = isPublic ? 'insecure' : 'ready';
    bucketDetail = isPublic
      ? `bucket ${expected.bucket} is PUBLIC — the SQL sets public=false`
      : `bucket ${expected.bucket} exists and is private`;
  } else if (bucket.status === 404) {
    bucketState = 'missing';
    bucketDetail = `bucket ${expected.bucket} does not exist — run ${expected.sqlFiles[0]}`;
  } else if (bucket.status === 401 || bucket.status === 403 || bucket.status === 400) {
    bucketState = 'unknown';
    bucketDetail = 'a private bucket is not readable with the publishable key; confirm it in the dashboard (Storage → Buckets)';
  } else {
    bucketDetail = `HTTP ${bucket.status}${bucket.code ? ` ${bucket.code}` : ''}: ${bucket.message ?? 'no detail'}`;
  }
  checks.push({ kind: 'bucket', name: expected.bucket, state: bucketState, status: bucket.status, code: bucket.code, detail: bucketDetail });

  if (typeof clientSource === 'string') {
    const match = clientSource.match(/SUPABASE_URL\s*=\s*'(https:\/\/[^']+)'/u);
    if (!match) warnings.push(`could not read SUPABASE_URL out of ${expected.clientFile}`);
    else if (match[1].replace(/\/+$/, '') !== url.replace(/\/+$/, '')) {
      warnings.push(`the browser client points at a different project (${match[1]}) than the one checked here`);
    }
  }

  const failing = checks.filter((check) => FAILING.has(check.state));
  const unknown = checks.filter((check) => check.state === 'unknown' || check.state === 'blocked');
  return {
    ok: failing.length === 0,
    url: url.replace(/\/+$/, ''),
    keyLength: String(key).length,
    checks,
    warnings,
    requests,
    counts: {
      total: checks.length,
      ready: checks.filter((check) => check.state === 'ready').length,
      missing: checks.filter((check) => check.state === 'missing').length,
      drift: checks.filter((check) => check.state === 'drift').length,
      insecure: checks.filter((check) => check.state === 'insecure').length,
      needsOwner: unknown.length,
    },
  };
}

/** Human-readable report. The key is never part of it — only its length, as a sanity hint. */
export function renderReport(report) {
  const icon = { ready: 'PASS', missing: 'MISSING', drift: 'DRIFT', insecure: 'INSECURE', blocked: 'BLOCKED', unknown: 'NEEDS-OWNER' };
  const lines = [`Supabase readiness — ${report.url} (publishable key, ${report.keyLength} chars)`, ''];
  for (const check of report.checks) {
    lines.push(`${(icon[check.state] ?? check.state).padEnd(12)} ${check.kind.padEnd(9)} ${check.name.padEnd(28)} ${check.detail}`);
  }
  for (const warning of report.warnings) lines.push(`WARNING      ${warning}`);
  lines.push('');
  lines.push('Remaining work for the owner (this script cannot do it):');
  lines.push('  - insert the first admin row into viking_team_members (see viking-team/SETUP.md, step 3)');
  lines.push('  - Auth → Providers → Email → Confirm email = ON');
  lines.push('  - Auth → URL Configuration: Site/Redirect URL = <vercel-domain>/team/');
  lines.push(`  - re-run with a real member session to prove RLS (0 rows for a non-member)`);
  lines.push('');
  const { ready, missing, drift, insecure, needsOwner, total } = report.counts;
  lines.push(`${ready}/${total} ready · ${missing} missing · ${drift} drift · ${insecure} insecure · ${needsOwner} need the owner`);
  lines.push(report.ok ? 'VERDICT: nothing promised by the SQL files is missing.' : 'VERDICT: apply viking-team/sql/*.sql — see the MISSING/DRIFT rows above.');
  return lines.join('\n');
}

/** Expected-only mode: proves what would be probed without any credential or network call. */
export function describeExpectations(expected = EXPECTED) {
  return [
    `tables:    ${expected.tables.map((table) => `${table.name}(${table.columns.length} cols)`).join(', ')}`,
    `functions: ${expected.functions.join(', ')}`,
    `bucket:    ${expected.bucket}`,
    `sql:       ${expected.sqlFiles.join(', ')}`,
    `client:    ${expected.clientFile}`,
    'network:   GET tables/storage only; POST /rest/v1/rpc/<fn> with an empty {} body; no writes',
  ].join('\n');
}

function parseArgv(argv) {
  const options = { json: false, expectedOnly: false, url: null, key: null, checkClient: true };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') options.json = true;
    else if (token === '--expected-only') options.expectedOnly = true;
    else if (token === '--no-client-check') options.checkClient = false;
    else if (token === '--url') options.url = argv[++index];
    else if (token === '--key') options.key = argv[++index];
    else throw new Error(`unknown argument: ${token}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch) {
  let options;
  try {
    options = parseArgv(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (options.expectedOnly) {
    process.stdout.write(`${describeExpectations()}\n`);
    return 0;
  }
  const url = options.url ?? env.SUPABASE_URL ?? null;
  const key = options.key ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_KEY ?? env.SUPABASE_ANON_KEY ?? null;
  if (!url || !key) {
    process.stderr.write('needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (env is safer than --key: argv is world-readable via ps)\n');
    process.stderr.write('dry run without credentials: node scripts/check-supabase.mjs --expected-only\n');
    return 2;
  }
  let clientSource = null;
  if (options.checkClient) {
    try {
      clientSource = readFileSync(join(ROOT, EXPECTED.clientFile), 'utf8');
    } catch {
      clientSource = null;
    }
  }
  const report = await runChecks({ url, key, fetchImpl, clientSource });
  process.stdout.write(`${options.json ? JSON.stringify({ ...report, requests: undefined }, null, 2) : renderReport(report)}\n`);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
