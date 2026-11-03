import { fetchWithTimeout } from './resilience.mjs';
// Google connectors for the OWNER only: Gmail (read + drafts, never sends), Calendar, Drive (read) and Sheets.
// One-time setup: secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, then the owner opens /connect/google?k=<app key>
// (Telegram: /google). The refresh token lives in KV, never in the repo or chat.
// Gemini calls these as tools (function calling) when the owner asks for something that needs them.

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];
const TZ = 'Asia/Tehran';
const MAX_TEXT = 6000;

export const googleConfigured = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.MEMORY);
export const googleConnected = async (env) => googleConfigured(env) && !!(await env.MEMORY.get('google:refresh'));
const redirectUri = (origin) => `${origin}/connect/google/callback`;

// Step 1: send the owner to Google's consent screen with a one-time state (CSRF guard, 10 minutes).
export async function connectUrl(env, origin) {
  const state = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.MEMORY.put(`google:state:${state}`, '1', { expirationTtl: 600 });
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(origin), response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `${AUTH}?${q}`;
}

// Step 2: Google redirects back with ?code; keep only the refresh token.
export async function finishConnect(env, origin, code, state) {
  if (!state || !(await env.MEMORY.get(`google:state:${state}`))) throw new Error('لینک اتصال منقضی شده؛ دوباره /google را بزن.');
  await env.MEMORY.delete(`google:state:${state}`);
  const res = await fetchWithTimeout(TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(origin), grant_type: 'authorization_code' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) throw new Error(`گوگل اتصال را نپذیرفت (${data.error || res.status}).`);
  await env.MEMORY.put('google:refresh', data.refresh_token);
  if (data.access_token) await env.MEMORY.put('google:access', JSON.stringify({ token: data.access_token, exp: Date.now() + (data.expires_in - 120) * 1000 }));
}

export async function disconnect(env) {
  await env.MEMORY.delete('google:refresh');
  await env.MEMORY.delete('google:access');
}

async function accessToken(env) {
  const cached = await env.MEMORY.get('google:access', 'json');
  if (cached && cached.exp > Date.now()) return cached.token;
  const refresh = await env.MEMORY.get('google:refresh');
  if (!refresh) throw new Error('گوگل وصل نیست؛ در تلگرام /google را بزن.');
  const res = await fetchWithTimeout(TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refresh, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    if (data.error === 'invalid_grant') await disconnect(env);
    throw new Error('دسترسی گوگل منقضی شده؛ دوباره /google را بزن.');
  }
  await env.MEMORY.put('google:access', JSON.stringify({ token: data.access_token, exp: Date.now() + (data.expires_in - 120) * 1000 }));
  return data.access_token;
}

async function g(env, url, init = {}) {
  const res = await fetchWithTimeout(url, { ...init, headers: { authorization: `Bearer ${await accessToken(env)}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `Google ${res.status}`);
  return data;
}

const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const header = (m, name) => ((m.payload && m.payload.headers) || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);

function plainBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) return fromB64url(payload.body.data);
  for (const part of payload.parts || []) { const t = plainBody(part); if (t) return t; }
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) return fromB64url(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return '';
}

// The tools Gemini may call. Writes are limited to drafts, calendar events and sheet rows; nothing is ever sent or deleted.
export const DECLARATIONS = [
  { name: 'gmail_search', description: 'Search the owner\'s Gmail. Returns id, from, subject, date and a snippet for each message. Use Gmail search syntax (from:, subject:, newer_than:2d, is:unread).',
    parameters: { type: 'object', properties: { query: { type: 'string' }, max: { type: 'integer', description: 'max results, default 10' } }, required: ['query'] } },
  { name: 'gmail_read', description: 'Read one Gmail message in full (plain text) by its id from gmail_search.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'gmail_draft', description: 'Create a Gmail DRAFT (it is not sent; the owner reviews and sends it). Use for replies and new emails.',
    parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } },
  { name: 'calendar_list', description: 'List the owner\'s Google Calendar events from now for the next N days (Tehran time).',
    parameters: { type: 'object', properties: { days: { type: 'integer', description: 'default 7' }, query: { type: 'string', description: 'optional text filter' } } } },
  { name: 'calendar_create', description: 'Create a Google Calendar event. Times as ISO 8601 local Tehran time, e.g. 2026-10-20T09:00:00.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' } }, required: ['title', 'start', 'end'] } },
  { name: 'drive_search', description: 'Search Google Drive files by name or content. Returns id, name, type, modified time and link.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'sheets_read', description: 'Read a range from a Google Sheet (spreadsheet id from drive_search). Range like "Sheet1!A1:F50"; omit for the first sheet.',
    parameters: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheetId'] } },
  { name: 'sheets_append', description: 'Append rows to a Google Sheet. rows is a list of rows, each a list of cell values.',
    parameters: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'e.g. Sheet1!A1' }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } }, required: ['spreadsheetId', 'rows'] } },
];

export async function runTool(env, name, args = {}) {
  switch (name) {
    case 'gmail_search': {
      const list = await g(env, `${GMAIL}/messages?${new URLSearchParams({ q: String(args.query || ''), maxResults: String(Math.min(Number(args.max) || 10, 20)) })}`);
      const out = [];
      for (const { id } of list.messages || []) {
        const m = await g(env, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
        out.push({ id, from: header(m, 'From'), subject: header(m, 'Subject'), date: header(m, 'Date'), snippet: m.snippet, unread: (m.labelIds || []).includes('UNREAD') });
      }
      return { messages: out };
    }
    case 'gmail_read': {
      const m = await g(env, `${GMAIL}/messages/${encodeURIComponent(args.id)}?format=full`);
      return { from: header(m, 'From'), to: header(m, 'To'), subject: header(m, 'Subject'), date: header(m, 'Date'), body: plainBody(m.payload).slice(0, MAX_TEXT) };
    }
    case 'gmail_draft': {
      const raw = [`To: ${args.to}`, `Subject: ${encodeWord(String(args.subject || ''))}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', String(args.body || '')].join('\r\n');
      const d = await g(env, `${GMAIL}/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw: b64url(raw) } }) });
      return { draftId: d.id, note: 'Draft saved in Gmail; not sent.' };
    }
    case 'calendar_list': {
      const days = Math.min(Number(args.days) || 7, 60);
      const q = new URLSearchParams({ timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + days * 864e5).toISOString(),
        singleEvents: 'true', orderBy: 'startTime', maxResults: '50', timeZone: TZ, ...(args.query ? { q: String(args.query) } : {}) });
      const data = await g(env, `${CAL}?${q}`);
      return { events: (data.items || []).map((e) => ({ title: e.summary, start: (e.start || {}).dateTime || (e.start || {}).date, end: (e.end || {}).dateTime || (e.end || {}).date, location: e.location || '' })) };
    }
    case 'calendar_create': {
      const e = await g(env, CAL, { method: 'POST', body: JSON.stringify({ summary: args.title, description: args.description || '', location: args.location || '',
        start: { dateTime: args.start, timeZone: TZ }, end: { dateTime: args.end, timeZone: TZ } }) });
      return { created: true, link: e.htmlLink };
    }
    case 'drive_search': {
      const s = String(args.query || '').replace(/['\\]/g, ' ');
      const q = new URLSearchParams({ q: `(name contains '${s}' or fullText contains '${s}') and trashed = false`, pageSize: '15',
        fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', orderBy: 'modifiedTime desc' });
      return { files: (await g(env, `${DRIVE}?${q}`)).files || [] };
    }
    case 'sheets_read': {
      const id = encodeURIComponent(args.spreadsheetId);
      let range = args.range;
      if (!range) range = ((await g(env, `${SHEETS}/${id}?fields=sheets.properties.title`)).sheets || [{}])[0].properties.title;
      const data = await g(env, `${SHEETS}/${id}/values/${encodeURIComponent(range)}`);
      return { range: data.range, values: (data.values || []).slice(0, 200) };
    }
    case 'sheets_append': {
      const id = encodeURIComponent(args.spreadsheetId);
      const range = encodeURIComponent(args.range || 'A1');
      const data = await g(env, `${SHEETS}/${id}/values/${range}:append?valueInputOption=USER_ENTERED`, { method: 'POST', body: JSON.stringify({ values: args.rows || [] }) });
      return { updatedRange: (data.updates || {}).updatedRange, rows: (data.updates || {}).updatedRows };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

// What the brain gets for the owner when Google is connected; null otherwise.
export async function googleTools(env) {
  if (!(await googleConnected(env))) return null;
  return { declarations: DECLARATIONS, run: (name, args) => runTool(env, name, args) };
}
