// Opt-in, server-side, technical-only request telemetry for the routing endpoints.
//
// - Off unless PSK_TELEMETRY is exactly "1" or "true" (case-insensitive). Default: no output at all.
// - When on: one JSON line per handled request via console.log (Vercel runtime logs). This module
//   performs no network I/O, no file writes, no storage and no aggregation.
// - Fields are an explicit allowlist built from validated primitives. Request/response bodies,
//   query text, query tokens, skill content, headers, tokens/keys, IP addresses, user identifiers,
//   task ids, hashes and Error objects are never read here, so they cannot be logged by mistake.
// - Failure-inert: any exception in building or writing the line is swallowed. Handlers keep the same
//   return value, status, body and thrown error whether telemetry is on, off or broken.
import {performance} from 'node:perf_hooks';

export const EVENT_NAME = 'psk.request';
export const EVENT_VERSION = 1;
const ROUTES = new Set(['skills', 'tasks']);
const METHODS = new Set(['GET', 'POST']);
const MODES = new Set(['plan', 'answer']);
const MAX_RESULTS = 25;
const MAX_MS = 60000; // the function's own maxDuration

export function telemetryEnabled(env = process.env) {
  return ['1', 'true'].includes(String(env?.PSK_TELEMETRY ?? '').trim().toLowerCase());
}

/** Allowlisted, clamped event. Unknown inputs become 'other'/0 or are omitted. */
export function buildEvent(fields) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const event = {
    evt: EVENT_NAME,
    v: EVENT_VERSION,
    route: ROUTES.has(f.route) ? f.route : 'other',
    method: METHODS.has(f.method) ? f.method : 'other',
    status: Number.isInteger(f.status) && f.status >= 100 && f.status <= 599 ? f.status : 0,
    ms: typeof f.ms === 'number' && Number.isFinite(f.ms) && f.ms >= 0 ? Math.min(Math.round(f.ms), MAX_MS) : 0,
  };
  if (Number.isInteger(f.results) && f.results >= 0) event.results = Math.min(f.results, MAX_RESULTS);
  if (MODES.has(f.mode)) event.mode = f.mode;
  return event;
}

/** Writes one line when enabled. Returns true only when a line was written; never throws. */
export function recordEvent(fields, {env = process.env, sink = console.log} = {}) {
  try {
    if (!telemetryEnabled(env)) return false;
    sink(JSON.stringify(buildEvent(fields)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Wraps a Vercel handler. The wrapped handler receives a third argument `ctx` that it may fill with
 * `results` (number of selected skills) and `mode` (validated plan|answer). The wrapper returns exactly
 * what the handler returns (sync stays sync, promises resolve/reject with the same value/error).
 */
export function instrument(route, handler) {
  return function instrumented(req, res) {
    const started = performance.now();
    const ctx = {};
    const finish = (failed) => {
      try {
        recordEvent({
          route,
          method: req?.method,
          status: failed ? 500 : res?.statusCode,
          ms: performance.now() - started,
          results: ctx.results,
          mode: ctx.mode,
        });
      } catch {
        // telemetry must never affect the response
      }
    };
    let out;
    try {
      out = handler(req, res, ctx);
    } catch (error) {
      finish(true);
      throw error;
    }
    if (out && typeof out.then === 'function') {
      return out.then((value) => { finish(false); return value; }, (error) => { finish(true); throw error; });
    }
    finish(false);
    return out;
  };
}
