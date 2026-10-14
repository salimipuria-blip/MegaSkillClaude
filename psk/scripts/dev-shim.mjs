// Local stand-in for the subset of Vercel's response object used by api/*.js handlers.
// Mirrors Node's ServerResponse.statusCode (set on both the shim and the raw response) so that
// server-side telemetry reads the real status instead of 0.
export function vercelResponse(res) {
  const shim = {
    statusCode: undefined,
    status(n) { res.statusCode = n; shim.statusCode = n; return shim; },
    setHeader(k, v) { res.setHeader(k, v); return shim; },
    json(v) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); return shim; },
  };
  return shim;
}
