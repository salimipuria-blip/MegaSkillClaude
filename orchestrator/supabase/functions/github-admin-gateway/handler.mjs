// The Supabase gateway's verify_jwt setting is NOT authorization: anon JWTs also pass it.
// Resolve the caller through Auth and compare its server-verified id with an explicit allowlist.
const API = 'https://api.github.com';
const VERSION = '2026-03-10';
const READ_ACTIONS = new Set(['health', 'whoami', 'list_repos', 'get_repo']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
class HttpError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(`${name} is required`, 400);
  return value.trim();
}

export function createGithubAdminHandler({ getEnv, fetchImpl = globalThis.fetch }) {
  const env = (name) => String(getEnv(name) || '').trim();

  async function authorize(request) {
    const ids = env('GITHUB_ADMIN_USER_IDS').split(',').map((id) => id.trim().toLowerCase()).filter(Boolean);
    const base = env('SUPABASE_URL');
    const key = env('SUPABASE_ANON_KEY');
    if (!ids.length || ids.some((id) => !UUID.test(id)) || !base || !key) {
      throw new HttpError('Admin authorization is not configured', 503);
    }
    let url;
    try { url = new URL('/auth/v1/user', base); } catch { throw new HttpError('Admin authorization is not configured', 503); }
    if (url.protocol !== 'https:') throw new HttpError('Admin authorization is not configured', 503);
    const auth = request.headers.get('authorization') || '';
    if (auth.length > 8192 || !/^Bearer \S+$/i.test(auth)) throw new HttpError('Authentication required', 401);
    let response;
    try {
      response = await fetchImpl(url.href, {
        headers: { apikey: key, Authorization: auth }, signal: AbortSignal.timeout(8000), redirect: 'error',
      });
    } catch { throw new HttpError('Authentication service unavailable', 503); }
    if (response.status === 401 || response.status === 403) throw new HttpError('Invalid user session', 401);
    if (!response.ok) throw new HttpError('Authentication service unavailable', 503);
    const user = await response.json().catch(() => null);
    // Never authorize from decoded JWT claims, user_metadata, email or a caller-supplied user id.
    if (!user || typeof user.id !== 'string' || !UUID.test(user.id)) throw new HttpError('Invalid user session', 401);
    if (!ids.includes(user.id.toLowerCase())) throw new HttpError('Owner access required', 403);
  }

  async function github(path, init = {}) {
    const token = env('GITHUB_ADMIN_TOKEN');
    if (!token) throw new HttpError('GitHub administration is not configured', 503);
    const response = await fetchImpl(API + path, {
      ...init, signal: AbortSignal.timeout(15000), redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': VERSION,
        'User-Agent': 'mega-skills-github-admin', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      },
    });
    const data = await response.json().catch(() => null);
    // Upstream bodies can contain private repository details; do not return them on an error.
    if (!response.ok) throw new HttpError(`GitHub request failed (${response.status})`, 502);
    return data;
  }

  return async function handler(request) {
    if (!['GET', 'POST'].includes(request.method)) {
      const response = json({ ok: false, error: 'GET or POST required' }, 405);
      response.headers.set('Allow', 'GET, POST');
      return response;
    }
    try {
      await authorize(request);
      const url = new URL(request.url);
      let body = Object.fromEntries(url.searchParams);
      if (request.method === 'POST') {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 32_768) throw new HttpError('Request too large', 413);
        try { body = JSON.parse(raw); } catch { throw new HttpError('Invalid JSON', 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError('Invalid request body', 400);
      }
      const action = body.action || 'health';
      if (request.method === 'GET' && !READ_ACTIONS.has(action)) throw new HttpError('Writes require POST', 405);
      if (action === 'health') return json({ ok: true, service: 'github-admin-gateway', version: '2.0.0', token_configured: !!env('GITHUB_ADMIN_TOKEN') });
      if (action === 'whoami') {
        const user = await github('/user');
        return json({ ok: true, user: { login: user.login, id: user.id, name: user.name } });
      }
      if (action === 'list_repos') {
        const repos = await github('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated');
        return json({ ok: true, repositories: (repos || []).map((r) => ({ full_name: r.full_name, private: r.private, permissions: r.permissions, default_branch: r.default_branch })) });
      }
      if (action === 'create_repo') {
        const payload = { name: required(body.name, 'name'), private: body.private !== false, auto_init: !!body.auto_init };
        if (typeof body.description === 'string') payload.description = body.description;
        const path = body.org ? `/orgs/${encodeURIComponent(required(body.org, 'org'))}/repos` : '/user/repos';
        const repo = await github(path, { method: 'POST', body: JSON.stringify(payload) });
        return json({ ok: true, repository: { full_name: repo.full_name, html_url: repo.html_url, private: repo.private, default_branch: repo.default_branch } }, 201);
      }
      const owner = required(body.owner, 'owner'), repo = required(body.repo, 'repo');
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      if (action === 'get_repo') return json({ ok: true, repository: await github(base) });
      if (action === 'update_repo') {
        const patch = {};
        for (const field of ['name', 'description', 'homepage', 'private', 'default_branch', 'archived']) if (body[field] !== undefined) patch[field] = body[field];
        return json({ ok: true, repository: await github(base, { method: 'PATCH', body: JSON.stringify(patch) }) });
      }
      if (action === 'create_branch') {
        const branch = required(body.branch, 'branch');
        let sha = body.sha;
        if (!sha) {
          const ref = required(body.base_ref || 'heads/main', 'base_ref').replace(/^refs\//, '');
          sha = (await github(`${base}/git/ref/${encodeURIComponent(ref)}`)).object.sha;
        }
        const result = await github(`${base}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
        return json({ ok: true, ref: result.ref, sha: result.object.sha });
      }
      if (action === 'put_file' || action === 'delete_file') {
        const path = required(body.path, 'path');
        if (path.split('/').some((part) => !part || part === '.' || part === '..')) throw new HttpError('Invalid file path', 400);
        const payload = { message: required(body.message || `${action === 'put_file' ? 'update' : 'delete'} ${path}`, 'message') };
        if (body.branch) payload.branch = body.branch;
        if (action === 'put_file') {
          const content = required(body.content, 'content');
          payload.content = body.encoding === 'base64' ? content : btoa(String.fromCharCode(...new TextEncoder().encode(content)));
          if (body.sha) payload.sha = body.sha;
        } else payload.sha = required(body.sha, 'sha');
        const result = await github(`${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { method: action === 'put_file' ? 'PUT' : 'DELETE', body: JSON.stringify(payload) });
        return json({ ok: true, ...(action === 'put_file' ? { content_sha: result.content?.sha } : {}), commit_sha: result.commit?.sha });
      }
      return json({ ok: false, error: 'Unknown action' }, 400);
    } catch (error) {
      return json({ ok: false, error: error instanceof HttpError ? error.message : 'Administration request failed' }, error instanceof HttpError ? error.status : 502);
    }
  };
}
