// Hermes web chat: one self-contained page (RTL, dark, installable on the iPhone home screen).
// The page talks to /api/* with a private key the bot sends via the /app command in Telegram.

export const MANIFEST = JSON.stringify({
  name: 'Hermes',
  short_name: 'Hermes',
  start_url: '/app',
  display: 'standalone',
  background_color: '#0f0f12',
  theme_color: '#0f0f12',
  dir: 'rtl',
  lang: 'fa',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
});

export const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="#6d5dfc"/>
<path d="M156 128v256M356 128v256M156 256h200" stroke="#fff" stroke-width="56" stroke-linecap="round"/>
</svg>`;

export const APP_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#0f0f12">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hermes">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css">
<title>Hermes</title>
<style>
  :root {
    --bg: #0f0f12; --panel: #17171c; --bubble: #23232b; --mine: #6d5dfc; --text: #ececf1;
    --muted: #8e8ea0; --line: #2a2a33; --danger: #ff6b6b;
    --safe-b: env(safe-area-inset-bottom, 0px); --safe-t: env(safe-area-inset-top, 0px);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; margin: 0; }
  body {
    background: var(--bg); color: var(--text);
    font: 16px/1.75 Vazirmatn, -apple-system, "Segoe UI", Tahoma, sans-serif;
    display: flex; flex-direction: column; height: 100dvh; overflow: hidden;
  }
  header {
    display: flex; align-items: center; gap: 12px;
    padding: calc(var(--safe-t) + 10px) 16px 10px; border-bottom: 1px solid var(--line);
    background: rgba(15,15,18,.85); backdrop-filter: blur(12px);
  }
  .logo { width: 36px; height: 36px; border-radius: 10px; flex: none; }
  .title { flex: 1; min-width: 0; }
  .title b { display: block; font-size: 17px; }
  .title small { color: var(--muted); font-size: 12px; }
  .icon-btn {
    width: 40px; height: 40px; border: 0; border-radius: 12px; background: var(--panel);
    color: var(--text); display: grid; place-items: center; cursor: pointer;
  }
  .icon-btn:active { transform: scale(.95); }
  main { flex: 1; overflow-y: auto; padding: 20px 16px 8px; scroll-behavior: smooth; }
  .wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
  .msg { display: flex; gap: 10px; align-items: flex-start; animation: in .18s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
  .msg.me { flex-direction: row-reverse; }
  .avatar { width: 30px; height: 30px; border-radius: 9px; flex: none; margin-top: 2px; }
  .bubble {
    max-width: 85%; padding: 10px 14px; border-radius: 18px; background: var(--bubble);
    white-space: pre-wrap; overflow-wrap: anywhere; position: relative;
  }
  .me .bubble { background: var(--mine); color: #fff; border-start-end-radius: 6px; }
  .bot .bubble { border-start-start-radius: 6px; }
  .bubble.error { background: #3a1d22; color: #ffd5d5; }
  .bubble code { background: #0006; padding: 1px 6px; border-radius: 6px; font-family: inherit; unicode-bidi: isolate; }
  .bubble pre {
    background: #0b0b0e; border: 1px solid var(--line); padding: 10px 12px; border-radius: 12px;
    overflow-x: auto; direction: ltr; text-align: left; white-space: pre; margin: 6px 0;
  }
  .bubble pre code { background: none; padding: 0; font: 13px/1.6 ui-monospace, Menlo, Consolas, monospace; }
  .bubble a { color: #a99bff; }
  .tools { display: flex; gap: 6px; margin-top: 4px; }
  .tools button {
    border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px;
    padding: 2px 6px; border-radius: 8px; cursor: pointer;
  }
  .tools button:active { background: var(--panel); }
  .typing span {
    display: inline-block; width: 7px; height: 7px; margin: 0 2px; border-radius: 50%;
    background: var(--muted); animation: blink 1.2s infinite;
  }
  .typing span:nth-child(2) { animation-delay: .2s; } .typing span:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
  .empty { text-align: center; color: var(--muted); margin: 12vh auto 0; max-width: 420px; }
  .empty h1 { color: var(--text); font-size: 24px; margin: 14px 0 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
  .chip {
    border: 1px solid var(--line); background: var(--panel); color: var(--text); font: inherit;
    font-size: 14px; padding: 8px 14px; border-radius: 999px; cursor: pointer;
  }
  footer { padding: 8px 12px calc(var(--safe-b) + 10px); }
  .composer {
    max-width: 760px; margin: 0 auto; display: flex; align-items: flex-end; gap: 8px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 24px; padding: 6px 6px 6px 8px;
  }
  textarea {
    flex: 1; resize: none; border: 0; outline: 0; background: none; color: var(--text);
    font: inherit; max-height: 160px; padding: 8px 10px; line-height: 1.6;
  }
  textarea::placeholder { color: var(--muted); }
  .send {
    width: 40px; height: 40px; border: 0; border-radius: 50%; background: var(--mine); color: #fff;
    display: grid; place-items: center; cursor: pointer; flex: none;
  }
  .send:disabled { opacity: .35; cursor: default; }
  .locked { margin: 18vh auto 0; max-width: 360px; text-align: center; color: var(--muted); }
  .locked h1 { color: var(--text); font-size: 22px; }
  .locked code { background: var(--panel); padding: 2px 8px; border-radius: 8px; color: var(--text); }
</style>
</head>
<body>
<header>
  <img class="logo" src="/icon.svg" alt="">
  <div class="title"><b>هرمس</b><small id="status">دستیار شخصی پوریا</small></div>
  <button class="icon-btn" id="newChat" title="گفتگوی جدید" aria-label="گفتگوی جدید">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>
</header>
<main id="scroller"><div class="wrap" id="log"></div></main>
<footer>
  <form class="composer" id="form">
    <textarea id="input" rows="1" placeholder="پیام به هرمس…" autocomplete="off"></textarea>
    <button class="send" id="send" type="submit" aria-label="ارسال" disabled>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </button>
  </form>
</footer>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const log = $('log'), input = $('input'), send = $('send'), scroller = $('scroller'), status = $('status');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('k')) { store.set('hermes-key', hash.get('k')); history.replaceState(null, '', location.pathname); }
  const key = store.get('hermes-key');
  let busy = false;

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function md(src) {
    const blocks = [];
    let s = esc(src).replace(/\`\`\`[\\w-]*\\n?([\\s\\S]*?)\`\`\`/g, (_, code) => {
      blocks.push('<pre><code>' + code.replace(/\\n$/, '') + '</code></pre>');
      return '\\u0000' + (blocks.length - 1) + '\\u0000';
    });
    s = s.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>')
         .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>')
         .replace(/(https?:\\/\\/[^\\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\\u0000(\\d+)\\u0000/g, (_, i) => blocks[+i]);
  }

  function bubble(role, content, opts = {}) {
    document.querySelector('.empty')?.remove();
    const row = document.createElement('div');
    row.className = 'msg ' + (role === 'user' ? 'me' : 'bot');
    if (role !== 'user') row.innerHTML = '<img class="avatar" src="/icon.svg" alt="">';
    const col = document.createElement('div');
    const b = document.createElement('div');
    b.className = 'bubble' + (opts.error ? ' error' : '');
    if (opts.typing) b.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    else if (role === 'user') b.textContent = content; else b.innerHTML = md(content);
    col.appendChild(b);
    if (role !== 'user' && !opts.typing && !opts.error) {
      const tools = document.createElement('div');
      tools.className = 'tools';
      const copy = document.createElement('button');
      copy.textContent = 'کپی';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(content); copy.textContent = 'کپی شد ✓'; setTimeout(() => copy.textContent = 'کپی', 1500); } catch {} };
      tools.appendChild(copy);
      col.appendChild(tools);
    }
    row.appendChild(col);
    log.appendChild(row);
    scroller.scrollTop = scroller.scrollHeight;
    return row;
  }

  function emptyState() {
    log.innerHTML = '<div class="empty"><img src="/icon.svg" width="56" height="56" style="border-radius:16px" alt="">' +
      '<h1>سلام پوریا 👋</h1><div>هر چه می‌خواهی بپرس. حافظه با تلگرام مشترک است.</div><div class="chips"></div></div>';
    const chips = log.querySelector('.chips');
    ['یک کپشن اینستاگرام برای تور آفرود بنویس', 'برنامهٔ امروزم را مرتب کن', 'ایدهٔ محتوا برای وایکینگ آفرود بده'].forEach((t) => {
      const c = document.createElement('button');
      c.className = 'chip'; c.textContent = t;
      c.onclick = () => { input.value = t; submit(); };
      chips.appendChild(c);
    });
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('لینک ورود معتبر نیست. در تلگرام دوباره /app بفرست.');
    if (!res.ok) throw new Error(data.error || 'خطای ارتباط (' + res.status + ')');
    return data;
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; input.value = ''; resize(); send.disabled = true;
    bubble('user', text);
    const typing = bubble('bot', '', { typing: true });
    status.textContent = 'در حال نوشتن…';
    try {
      const { reply } = await api('/api/chat', { message: text });
      typing.remove(); bubble('bot', reply);
    } catch (err) {
      typing.remove(); bubble('bot', err.message, { error: true });
    } finally {
      busy = false; status.textContent = 'دستیار شخصی پوریا'; input.focus();
    }
  }

  function resize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; send.disabled = !input.value.trim(); }
  input.addEventListener('input', resize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); submit(); }
  });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  $('newChat').onclick = async () => {
    if (busy || !confirm('گفتگو و حافظه پاک شود؟')) return;
    try { await api('/api/reset', {}); emptyState(); } catch (err) { bubble('bot', err.message, { error: true }); }
  };

  if (!key) {
    document.querySelector('footer').remove(); $('newChat').remove();
    log.innerHTML = '<div class="locked"><h1>🔒 قفل است</h1><p>در تلگرام به بات هرمس پیام <code>/app</code> بفرست و لینک خصوصی را باز کن.</p></div>';
    return;
  }
  (async () => {
    try {
      const { messages } = await api('/api/history');
      if (!messages.length) emptyState();
      messages.forEach((m) => bubble(m.role, m.text));
    } catch (err) { emptyState(); bubble('bot', err.message, { error: true }); }
  })();
})();
</script>
</body>
</html>`;
