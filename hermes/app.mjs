// Hermes web chat: one self-contained page (RTL, installable on the iPhone home screen).
// The page talks to /api/* with a private key the bot sends via the /app command in Telegram.
//
// Look: a living "core" (gold ring + cyan particle ball) over animated plasma waves. It reacts
// to the chat: STANDBY when idle, PROCESSING while Hermes thinks, RESPONDING while a reply appears.
// The ring and the wave shader are adapted from APEX-UI by Ruben Mouradian (MIT); the shader is
// itself based on an MIT community component from 21st.dev. Keep this credit if you reuse them.

export const MANIFEST = JSON.stringify({
  name: 'Hermes',
  short_name: 'Hermes',
  start_url: '/app',
  display: 'standalone',
  background_color: '#03060b',
  theme_color: '#03060b',
  dir: 'rtl',
  lang: 'fa',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
});

export const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<radialGradient id="bg" cx="50%" cy="50%" r="65%"><stop offset="0" stop-color="#0c1824"/><stop offset="1" stop-color="#02040a"/></radialGradient>
<radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#c8f7ff"/><stop offset=".65" stop-color="#00e5ff" stop-opacity=".55"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="112" fill="url(#bg)"/>
<circle cx="256" cy="256" r="186" fill="none" stroke="#f5a623" stroke-opacity=".35" stroke-width="3" stroke-dasharray="6 14"/>
<circle cx="256" cy="256" r="150" fill="none" stroke="#f5a623" stroke-opacity=".22" stroke-width="26"/>
<circle cx="256" cy="256" r="150" fill="none" stroke="#ffd080" stroke-width="7"/>
<circle cx="256" cy="256" r="104" fill="url(#core)"/>
</svg>`;

// String.raw keeps the page's own regex backslashes intact. The page script must not use
// backticks or dollar-brace sequences, since this is a template literal.
export const APP_HTML = String.raw`<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#03060b">
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
    --bg: #03060b; --text: #eef3f6; --muted: #7f8c98; --dim: #4b5762;
    --gold: #f5a623; --gold-hi: #ffd080; --cyan: #00e5ff; --ice: #c8f7ff; --danger: #ff6b6b;
    --line: rgba(245,166,35,.16); --line-c: rgba(0,229,255,.18);
    --glass: rgba(8,14,22,.58); --glass-hi: rgba(14,22,32,.72);
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    --safe-b: env(safe-area-inset-bottom, 0px); --safe-t: env(safe-area-inset-top, 0px);
    --head: calc(var(--safe-t) + 64px);
    --orb: min(74vw, 42vh, 340px);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; margin: 0; }
  body {
    background: radial-gradient(ellipse 120% 90% at 50% 30%, #0a121c 0%, #04070d 55%, #010204 100%) var(--bg);
    color: var(--text); font: 16px/1.8 Vazirmatn, -apple-system, "Segoe UI", Tahoma, sans-serif;
    display: flex; flex-direction: column; height: 100dvh; overflow: hidden; -webkit-font-smoothing: antialiased;
  }
  #bg { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; opacity: .6; pointer-events: none; }
  .vignette {
    position: fixed; inset: 0; z-index: 1; pointer-events: none;
    background: radial-gradient(ellipse 80% 60% at 50% 38%, transparent 40%, rgba(1,2,4,.75) 100%);
  }
  .grain {
    position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: .05;
    background-image: repeating-linear-gradient(0deg, rgba(0,229,255,.5) 0 1px, transparent 1px 3px);
  }

  /* HUD header */
  header {
    position: relative; z-index: 20; height: var(--head); flex: none;
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--safe-t) 18px 0;
    transition: background .5s, border-color .5s;
    border-bottom: 1px solid transparent;
  }
  body.chatting header {
    background: linear-gradient(rgba(3,6,11,.92), rgba(3,6,11,.7));
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border-bottom-color: var(--line);
  }
  .brand { display: flex; flex-direction: column; gap: 4px; direction: ltr; align-items: flex-end; }
  .mark {
    font: 600 13px/1 var(--mono); letter-spacing: .42em; margin-right: -.42em;
    background: linear-gradient(90deg, var(--gold-hi), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sys { font: 10px/1 var(--mono); letter-spacing: .24em; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .sys i { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); animation: blinkDot 2.4s infinite; }
  body[data-state="thinking"] .sys i { background: var(--gold); box-shadow: 0 0 8px var(--gold); animation-duration: .6s; }
  body[data-state="speaking"] .sys i { background: var(--gold-hi); box-shadow: 0 0 10px var(--gold); animation-duration: .35s; }
  .hud-btn {
    width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; cursor: pointer;
    background: rgba(8,14,22,.5); border: 1px solid var(--line); color: var(--gold-hi);
    transition: border-color .2s, box-shadow .2s, transform .1s;
  }
  .hud-btn:hover { border-color: rgba(245,166,35,.45); box-shadow: 0 0 18px rgba(245,166,35,.15); }
  .hud-btn:active { transform: scale(.94); }

  /* The core */
  #orb {
    position: fixed; z-index: 25; left: 50%; top: calc(var(--head) + 4px);
    width: var(--orb); height: var(--orb); transform: translateX(-50%);
    cursor: pointer; border-radius: 50%; outline: none; -webkit-user-select: none; user-select: none;
    transition: width .7s cubic-bezier(.2,.9,.2,1), height .7s cubic-bezier(.2,.9,.2,1), top .7s cubic-bezier(.2,.9,.2,1);
  }
  #orb:focus-visible { box-shadow: 0 0 0 2px rgba(255,208,128,.5); }
  body.chatting #orb { width: 52px; height: 52px; top: calc(var(--safe-t) + 6px); }
  body.instant #orb { transition: none; }
  #orb svg, #orb canvas { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .far { transition: opacity .5s; }
  body.chatting #orb .far { opacity: 0; }
  .spin-cw  { transform-box: view-box; transform-origin: 200px 200px; animation: rot 26s linear infinite; }
  .spin-ccw { transform-box: view-box; transform-origin: 200px 200px; animation: rot 18s linear infinite reverse; }
  .spin-fast { transform-box: view-box; transform-origin: 200px 200px; animation: rot 5s linear infinite; }
  body[data-state="thinking"] .spin-cw  { animation-duration: 6s; }
  body[data-state="thinking"] .spin-ccw { animation-duration: 4s; }
  .orbit { opacity: 0; transition: opacity .4s; }
  body[data-state="thinking"] .orbit { opacity: 1; }
  .wave { transform-box: view-box; transform-origin: 200px 200px; animation: wave 3.6s ease-out infinite; opacity: 0; }
  .wave:nth-of-type(2) { animation-delay: .9s; } .wave:nth-of-type(3) { animation-delay: 1.8s; } .wave:nth-of-type(4) { animation-delay: 2.7s; }
  body[data-state="thinking"] .wave, body[data-state="speaking"] .wave { animation-name: waveHot; animation-duration: 2s; }
  .breathe { animation: breathe 3s ease-in-out infinite; }
  body[data-state="speaking"] .breathe { animation-duration: .9s; }
  @keyframes rot { to { transform: rotate(360deg); } }
  @keyframes wave { 0% { transform: scale(1); opacity: .2; } 100% { transform: scale(1.55); opacity: 0; } }
  @keyframes waveHot { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(1.65); opacity: 0; } }
  @keyframes breathe { 0%,100% { opacity: .78; } 50% { opacity: 1; } }
  @keyframes blinkDot { 0%,100% { opacity: .35; } 50% { opacity: 1; } }

  /* Scroll area */
  main { position: relative; z-index: 10; flex: 1; overflow-y: auto; overscroll-behavior: contain; }
  .hero {
    min-height: 100%; display: flex; flex-direction: column; align-items: center;
    padding: calc(var(--orb) + 14px) 20px 24px; text-align: center;
  }
  body.chatting .hero { display: none; }
  .status { display: flex; flex-direction: column; align-items: center; gap: 8px; direction: ltr; }
  .eq { display: flex; align-items: center; gap: 3px; height: 26px; }
  .eq span {
    width: 3px; border-radius: 2px; background: linear-gradient(var(--gold-hi), var(--gold));
    box-shadow: 0 0 6px rgba(245,166,35,.5); transform: scaleY(.3); opacity: .45;
    animation: eq 1s ease-in-out infinite alternate;
  }
  body[data-state="thinking"] .eq span, body[data-state="speaking"] .eq span { opacity: .95; animation-duration: .45s; }
  @keyframes eq { from { transform: scaleY(.25); } to { transform: scaleY(1); } }
  .label { font: 11px/1 var(--mono); letter-spacing: .5em; margin-right: -.5em; color: var(--gold); opacity: .8; text-shadow: 0 0 12px rgba(245,166,35,.6); }
  .dots { display: flex; gap: 7px; } .dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--gold); animation: blinkDot 1.2s infinite; }
  .dots i:nth-child(2) { animation-delay: .4s; } .dots i:nth-child(3) { animation-delay: .8s; }
  .hero h1 { margin: 22px 0 4px; font-size: 26px; font-weight: 700; letter-spacing: -.01em; }
  .hero h1 em { font-style: normal; background: linear-gradient(90deg, var(--gold-hi), var(--gold)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .hero p { margin: 0; color: var(--muted); font-size: 14px; }
  .clock { margin-top: 14px; font: 11px/1 var(--mono); letter-spacing: .28em; color: var(--dim); direction: ltr; }
  .clock span { font-family: Vazirmatn, sans-serif; letter-spacing: 0; }
  .chips { display: grid; gap: 10px; width: 100%; max-width: 460px; margin-top: 22px; }
  .chip {
    position: relative; display: flex; align-items: center; gap: 12px; text-align: right;
    padding: 13px 16px; border-radius: 14px; cursor: pointer; font: inherit; font-size: 14.5px; color: var(--text);
    background: var(--glass); border: 1px solid rgba(255,255,255,.06);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    transition: border-color .2s, transform .15s, background .2s;
  }
  .chip::before, .chip::after { content: ""; position: absolute; width: 10px; height: 10px; border: 1.5px solid var(--gold); opacity: .55; }
  .chip::before { top: -1px; right: -1px; border-left: 0; border-bottom: 0; border-top-right-radius: 14px; }
  .chip::after { bottom: -1px; left: -1px; border-right: 0; border-top: 0; border-bottom-left-radius: 14px; }
  .chip:hover { border-color: var(--line); background: var(--glass-hi); }
  .chip:active { transform: scale(.985); }
  .chip b { font: 600 10px/1 var(--mono); color: var(--gold); letter-spacing: .1em; flex: none; direction: ltr; }

  /* Messages */
  .log { max-width: 780px; margin: 0 auto; padding: 18px 16px 10px; display: flex; flex-direction: column; gap: 22px; }
  .log:empty { display: none; }
  .msg { animation: rise .35s cubic-bezier(.2,.9,.2,1); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); filter: blur(4px); } }
  .msg.me { align-self: flex-start; max-width: 86%; }
  .msg.me .b {
    padding: 10px 16px; border-radius: 18px 18px 6px 18px; white-space: pre-wrap; overflow-wrap: anywhere;
    background: linear-gradient(135deg, rgba(0,229,255,.12), rgba(0,229,255,.04));
    border: 1px solid var(--line-c); box-shadow: 0 0 24px rgba(0,229,255,.06) inset;
  }
  .msg.bot { position: relative; padding-right: 16px; }
  .msg.bot::before {
    content: ""; position: absolute; right: 0; top: 4px; bottom: 4px; width: 1.5px; border-radius: 2px;
    background: linear-gradient(var(--gold), rgba(245,166,35,.05));
    box-shadow: 0 0 10px rgba(245,166,35,.4);
  }
  .meta { display: flex; align-items: center; gap: 8px; font: 10px/1 var(--mono); letter-spacing: .3em; color: var(--gold); margin-bottom: 8px; direction: ltr; justify-content: flex-end; }
  .meta span { color: var(--dim); letter-spacing: .12em; }
  .msg.bot .b { white-space: pre-wrap; overflow-wrap: anywhere; }
  .b code { background: rgba(245,166,35,.1); color: var(--gold-hi); padding: 1px 7px; border-radius: 6px; font-family: inherit; unicode-bidi: isolate; }
  .b pre {
    background: rgba(2,5,9,.85); border: 1px solid rgba(255,255,255,.07); padding: 12px 14px; border-radius: 12px;
    overflow-x: auto; direction: ltr; text-align: left; white-space: pre; margin: 8px 0;
  }
  .b pre code { background: none; color: #d6e6ee; padding: 0; font: 13px/1.6 var(--mono); }
  .b a { color: var(--cyan); text-decoration: none; border-bottom: 1px solid rgba(0,229,255,.35); }
  .b b { color: #fff; }
  .caret { display: inline-block; width: 8px; height: 1.1em; vertical-align: -3px; margin-right: 2px; background: var(--gold); box-shadow: 0 0 10px var(--gold); animation: blinkDot .7s infinite; }
  .msg.error .b { color: #ffd0d0; }
  .msg.error::before { background: linear-gradient(var(--danger), transparent); box-shadow: 0 0 10px rgba(255,107,107,.5); }
  .msg.error .meta { color: var(--danger); }
  .tools { display: flex; gap: 4px; margin-top: 8px; direction: ltr; justify-content: flex-end; }
  .tools button {
    border: 1px solid transparent; background: none; color: var(--dim); cursor: pointer;
    font: 10px/1 var(--mono); letter-spacing: .2em; padding: 6px 8px; border-radius: 8px; transition: color .2s, border-color .2s;
  }
  .tools button:hover { color: var(--gold-hi); border-color: var(--line); }
  .scan { height: 10px; width: min(260px, 70%); border-radius: 6px; margin: 4px 0 0 auto;
    background: linear-gradient(90deg, rgba(245,166,35,.06) 0%, rgba(245,166,35,.45) 50%, rgba(245,166,35,.06) 100%);
    background-size: 200% 100%; animation: scan 1.1s linear infinite; }
  .scan + .scan { width: min(180px, 50%); margin-top: 8px; opacity: .7; }
  @keyframes scan { from { background-position: 200% 0; } to { background-position: -200% 0; } }

  /* Composer */
  footer { position: relative; z-index: 20; flex: none; padding: 8px 12px calc(var(--safe-b) + 12px); }
  .composer {
    position: relative; max-width: 780px; margin: 0 auto; display: flex; align-items: flex-end; gap: 8px;
    padding: 6px 6px 6px 8px; border-radius: 26px;
    background: rgba(6,11,18,.78); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,.08);
    box-shadow: 0 10px 40px rgba(0,0,0,.45);
    transition: border-color .3s, box-shadow .3s;
  }
  .composer:focus-within { border-color: rgba(245,166,35,.45); box-shadow: 0 10px 40px rgba(0,0,0,.45), 0 0 0 4px rgba(245,166,35,.07), 0 0 30px rgba(245,166,35,.12); }
  textarea {
    flex: 1; resize: none; border: 0; outline: 0; background: none; color: var(--text);
    font: inherit; max-height: 160px; padding: 9px 12px; line-height: 1.6;
  }
  textarea::placeholder { color: var(--dim); }
  .send {
    width: 42px; height: 42px; flex: none; border: 0; border-radius: 50%; cursor: pointer;
    display: grid; place-items: center; color: #1a0f00;
    background: radial-gradient(circle at 50% 40%, #fff3d6, var(--gold-hi) 35%, var(--gold) 75%);
    box-shadow: 0 0 0 1px rgba(255,208,128,.6), 0 0 18px rgba(245,166,35,.55);
    transition: opacity .2s, transform .1s, box-shadow .2s;
  }
  .send:active { transform: scale(.92); }
  .send:disabled { opacity: .28; box-shadow: none; cursor: default; }

  .locked .chips, .locked footer { display: none; }
  .locked .hero code { font-family: var(--mono); color: var(--gold-hi); background: rgba(245,166,35,.1); padding: 2px 8px; border-radius: 6px; }

  @media (min-width: 900px) { :root { --orb: min(40vh, 360px); } .hero h1 { font-size: 30px; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001s !important; animation-iteration-count: 1 !important; transition: none !important; }
  }
</style>
</head>
<body data-state="idle" class="instant">
<canvas id="bg" aria-hidden="true"></canvas>
<div class="vignette"></div><div class="grain"></div>

<header>
  <div class="brand"><span class="mark">HERMES</span><span class="sys"><i></i><span id="sys">ONLINE</span></span></div>
  <button class="hud-btn" id="newChat" title="گفتگوی جدید" aria-label="گفتگوی جدید">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>
</header>

<div id="orb" role="button" tabindex="0" aria-label="هستهٔ هرمس">
  <svg viewBox="0 0 400 400" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="rf" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#f5a623" stop-opacity="0"/><stop offset=".7" stop-color="#f5a623" stop-opacity=".04"/>
        <stop offset=".9" stop-color="#f5a623" stop-opacity=".16"/><stop offset="1" stop-color="#ffd080" stop-opacity=".45"/>
      </radialGradient>
      <radialGradient id="amb" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#f5a623" stop-opacity=".1"/><stop offset="1" stop-color="#f5a623" stop-opacity="0"/>
      </radialGradient>
      <filter id="gl" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g class="far">
      <circle cx="200" cy="200" r="196" fill="url(#amb)" class="breathe"/>
      <circle cx="200" cy="200" r="140" stroke="#f5a623" stroke-width=".8" stroke-opacity=".16"/>
      <circle cx="200" cy="200" r="152" stroke="#f5a623" stroke-width=".5" stroke-opacity=".14" stroke-dasharray="3 7" class="spin-ccw"/>
      <circle cx="200" cy="200" r="166" stroke="#f5a623" stroke-width=".5" stroke-opacity=".1"/>
      <circle cx="200" cy="200" r="180" stroke="#f5a623" stroke-width=".5" stroke-opacity=".1" stroke-dasharray="2 10" class="spin-cw"/>
      <path d="M200 6v18M200 376v18M6 200h14M380 200h14" stroke="#f5a623" stroke-opacity=".35"/>
      <g><circle class="wave" cx="200" cy="200" r="120" stroke="#f5a623" stroke-width="1"/><circle class="wave" cx="200" cy="200" r="120" stroke="#f5a623" stroke-width="1"/><circle class="wave" cx="200" cy="200" r="120" stroke="#f5a623" stroke-width="1"/><circle class="wave" cx="200" cy="200" r="120" stroke="#f5a623" stroke-width="1"/></g>
      <g class="orbit"><circle cx="200" cy="200" r="134" stroke="#ffd080" stroke-width="1.2" stroke-opacity=".55" stroke-dasharray="8 14" class="spin-fast"/></g>
    </g>
    <circle cx="200" cy="200" r="120" fill="url(#rf)" class="breathe"/>
    <circle cx="200" cy="200" r="120" stroke="#f5a623" stroke-width="16" stroke-opacity=".08" filter="url(#gl)" class="breathe"/>
    <circle cx="200" cy="200" r="120" stroke="#f5a623" stroke-width="5" stroke-opacity=".4" filter="url(#gl)"/>
    <circle cx="200" cy="200" r="120" stroke="#ffd080" stroke-width="2.4" stroke-opacity=".95" class="breathe"/>
    <circle cx="200" cy="200" r="78" stroke="#f5a623" stroke-width="1.2" stroke-opacity=".18" stroke-dasharray="44 22" class="spin-cw far"/>
  </svg>
  <canvas id="core"></canvas>
</div>

<main id="scroller">
  <section class="hero" id="hero">
    <div class="status">
      <div class="eq" id="eq"></div>
      <div class="label" id="label">STANDBY</div>
      <div class="dots"><i></i><i></i><i></i></div>
    </div>
    <h1 id="title">سلام <em>پوریا</em></h1>
    <p id="sub">دستیار شخصی تو · حافظه با تلگرام مشترک است</p>
    <div class="clock" id="clock"></div>
    <div class="chips" id="chips"></div>
  </section>
  <div class="log" id="log"></div>
</main>

<footer>
  <form class="composer" id="form">
    <textarea id="input" rows="1" placeholder="به هرمس بگو…" autocomplete="off"></textarea>
    <button class="send" id="send" type="submit" aria-label="ارسال" disabled>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </button>
  </form>
</footer>

<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body, log = $('log'), input = $('input'), send = $('send'), scroller = $('scroller');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('k')) { store.set('hermes-key', hash.get('k')); history.replaceState(null, '', location.pathname); }
  const key = store.get('hermes-key');
  let busy = false;

  // State: idle | thinking | speaking
  const LABELS = { idle: 'STANDBY', thinking: 'PROCESSING', speaking: 'RESPONDING' };
  const SYS = { idle: 'ONLINE', thinking: 'PROCESSING', speaking: 'RESPONDING' };
  const fx = { voice: 0, voiceT: 0, gold: .25, goldT: .25 };
  function setState(s) {
    body.dataset.state = s;
    $('label').textContent = LABELS[s]; $('sys').textContent = SYS[s];
    fx.voiceT = s === 'idle' ? 0 : s === 'thinking' ? .55 : 1;
    fx.goldT = s === 'speaking' ? 1 : s === 'thinking' ? .6 : .25;
    if (reduced) requestAnimationFrame(frame);
  }

  const eq = $('eq');
  for (let i = 0; i < 21; i++) {
    const d = Math.abs(i - 10) / 10, s = document.createElement('span');
    s.style.height = (6 + (1 - d) * 20) + 'px';
    s.style.animationDelay = ((i % 7) * .09) + 's';
    s.style.animationDuration = (.8 + (i % 5) * .17) + 's';
    eq.appendChild(s);
  }

  function tick() {
    const d = new Date(), clock = $('clock');
    clock.textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    try {
      const s = document.createElement('span');
      s.textContent = '  ·  ' + new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
      clock.appendChild(s);
    } catch {}
  }
  tick(); setInterval(tick, 30000);

  // Plasma-wave background (WebGL), rendered at half resolution.
  const bg = $('bg');
  const gl = bg.getContext('webgl', { antialias: false });
  let draw = null;
  if (gl) {
    const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
    const FS = [
      'precision mediump float;',
      'uniform vec2 R; uniform float F; uniform float V; uniform float G;',
      'float rnd(float t){ return (cos(t) + cos(t*1.3+1.3) + cos(t*1.4+1.4)) / 3.0; }',
      'float py(float x, float hf, float off, float amp){ return rnd(x*0.14 + F*0.11) * hf * amp + off; }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / R;',
      '  vec2 sp = (gl_FragCoord.xy - R*0.5) / R.x * 2.0 * 5.0;',
      '  float hf = 1.0 - (cos(uv.x*6.28)*0.5 + 0.5);',
      '  float vf = 1.0 - (cos(uv.y*6.28)*0.5 + 0.5);',
      '  sp.y += rnd(sp.x*0.4 + F*0.033) * 1.6 * (0.5 + hf);',
      '  sp.x += rnd(sp.y*0.4 + F*0.033 + 2.0) * 1.6 * hf;',
      '  vec4 cBase = mix(vec4(0.06,0.45,0.55,1.0), vec4(0.62,0.40,0.06,1.0), G);',
      '  vec4 cCool = mix(vec4(0.03,0.28,0.38,1.0), vec4(0.42,0.27,0.04,1.0), G);',
      '  float amp = 0.65 * (1.0 + V*2.2);',
      '  vec4 col = vec4(0.004,0.007,0.012,1.0) * (vf*0.92 + 0.08);',
      '  vec4 lines = vec4(0.0);',
      '  for (int l = 0; l < 8; l++) {',
      '    float n = float(l) / 8.0;',
      '    float op = float(l) + sp.x*0.45;',
      '    float r = rnd(op + F*0.121) * 0.5 + 0.5;',
      '    float hw = mix(0.025, 0.32, r*hf) / 2.0;',
      '    float off = rnd(op + F*0.121*(1.0+n)) * mix(0.7, 2.4, hf);',
      '    float lp = py(sp.x, hf, off, amp);',
      '    float ln = smoothstep(hw, 0.0, abs(lp - sp.y)) / 2.0 + smoothstep(hw*0.15 + 0.015, hw*0.15, abs(lp - sp.y));',
      '    float cx = mod(float(l) + F*0.11, 25.0) - 12.0;',
      '    ln += smoothstep(0.025, 0.01, length(vec2(cx, py(cx, hf, off, amp)) - sp)) * 4.0;',
      '    lines += ln * mix(cCool, cBase, uv.y*0.4 + n*0.3) * r;',
      '  }',
      '  gl_FragColor = col + lines * (1.0 + V*1.6);',
      '}',
    ].join('\n');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (vs && fs) {
      const pg = gl.createProgram(); gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
      if (gl.getProgramParameter(pg, gl.LINK_STATUS)) {
        gl.useProgram(pg);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const uR = gl.getUniformLocation(pg, 'R'), uF = gl.getUniformLocation(pg, 'F'), uV = gl.getUniformLocation(pg, 'V'), uG = gl.getUniformLocation(pg, 'G');
        let flow = 40;
        draw = (dt) => {
          const w = Math.round(bg.clientWidth * .5), h = Math.round(bg.clientHeight * .5);
          if (bg.width !== w || bg.height !== h) { bg.width = w; bg.height = h; gl.viewport(0, 0, w, h); }
          flow += dt * (1 + fx.voice * 2.4);
          gl.uniform2f(uR, w, h); gl.uniform1f(uF, flow); gl.uniform1f(uV, fx.voice); gl.uniform1f(uG, fx.gold);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
      }
    }
  }

  // Particle core (canvas 2D, additive glow).
  const core = $('core'), ctx = core.getContext('2d');
  const N = 460, P = [];
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    P.push({ x: s * Math.cos(a), y: u, z: s * Math.sin(a), ph: Math.random() * 6.28, k: .6 + Math.random() * 1.6, d: Math.pow(Math.random(), .35) });
  }
  const sprite = document.createElement('canvas'); sprite.width = sprite.height = 32;
  { const g = sprite.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(220,252,255,1)'); r.addColorStop(.3, 'rgba(120,240,255,.7)'); r.addColorStop(1, 'rgba(0,229,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32); }
  const cs = { boil: .05, size: 1, spin: .25, rot: 0 };
  function drawCore(t, dt) {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = core.clientWidth;
    if (!W) return;
    const px = Math.round(W * dpr);
    if (core.width !== px) { core.width = core.height = px; }
    const st = body.dataset.state;
    const talk = st === 'speaking' ? (.5 + .5 * Math.sin(t * 11) * Math.sin(t * 3.7)) : 0;
    const boilT = st === 'thinking' ? .2 : st === 'speaking' ? .1 : .05;
    const spinT = st === 'thinking' ? 1.4 : st === 'speaking' ? .6 : .25;
    const sizeT = (st === 'thinking' ? 1.08 : 1) + talk * .12;
    const e = reduced ? 1 : Math.min(dt * 4, 1);
    cs.boil += (boilT - cs.boil) * e; cs.spin += (spinT - cs.spin) * e;
    cs.size += (sizeT - cs.size) * (reduced ? 1 : Math.min(dt * 10, 1));
    cs.rot += dt * cs.spin;
    const c = px / 2, R = px * .2 * cs.size, small = W < 120;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, px, px);
    const halo = ctx.createRadialGradient(c, c, 0, c, c, R * 1.9);
    halo.addColorStop(0, 'rgba(0,229,255,' + (.28 + fx.voice * .12) + ')'); halo.addColorStop(.5, 'rgba(0,229,255,.07)'); halo.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, px, px);
    ctx.globalCompositeOperation = 'lighter';
    const co = Math.cos(cs.rot), si = Math.sin(cs.rot), ct = Math.cos(.35), stl = Math.sin(.35);
    const step = small ? 2 : 1;
    for (let i = 0; i < N; i += step) {
      const p = P[i];
      const rr = p.d * (1 + Math.sin(t * p.k * 2.2 + p.ph) * cs.boil);
      const x = p.x * co - p.z * si, z0 = p.x * si + p.z * co;
      const y = p.y * ct - z0 * stl, z = p.y * stl + z0 * ct;
      const persp = 1 / (1.9 - z * .55);
      const sx = c + x * rr * R * persp * 1.9, sy = c + y * rr * R * persp * 1.9;
      const sz = (small ? 4.5 : 4.2 + (1 - p.d) * 2.5) * dpr * persp * 1.4;
      ctx.globalAlpha = Math.max(.08, Math.min(1, (.35 + z * .45) * (.55 + (1 - p.d) * .6)));
      ctx.drawImage(sprite, sx - sz / 2, sy - sz / 2, sz, sz);
    }
    ctx.globalAlpha = .9;
    const hot = ctx.createRadialGradient(c, c, 0, c, c, R * .55);
    hot.addColorStop(0, 'rgba(235,253,255,.9)'); hot.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(c, c, R * .55, 0, 6.29); ctx.fill();
    ctx.globalAlpha = 1;
  }

  let last = performance.now(), raf = 0;
  function frame(now) {
    now = now || performance.now();
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (reduced) { fx.voice = fx.voiceT; fx.gold = fx.goldT; }
    else {
      fx.voice += (fx.voiceT - fx.voice) * Math.min(dt * (fx.voiceT > fx.voice ? 3 : 1.2), 1);
      fx.gold += (fx.goldT - fx.gold) * Math.min(dt * 2, 1);
    }
    if (draw) draw(dt);
    drawCore(now / 1000, dt);
    raf = reduced ? 0 : requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  if (reduced) new ResizeObserver(() => requestAnimationFrame(frame)).observe($('orb'));

  // Tap the core: a short surge, just for fun.
  let surge = 0;
  function poke() {
    if (busy) return;
    clearTimeout(surge);
    setState(body.dataset.state === 'idle' ? 'thinking' : body.dataset.state === 'thinking' ? 'speaking' : 'idle');
    surge = setTimeout(() => { if (!busy) setState('idle'); }, 4000);
  }
  $('orb').addEventListener('click', poke);
  $('orb').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); } });

  // Chat
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BT = String.fromCharCode(96), FENCE = BT + BT + BT;
  const reFence = new RegExp(FENCE + '[\\w-]*\\n?([\\s\\S]*?)' + FENCE, 'g');
  const reCode = new RegExp(BT + '([^' + BT + '\\n]+)' + BT, 'g');
  function md(src) {
    const blocks = [];
    let s = esc(src).replace(reFence, (_, code) => {
      blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    s = s.replace(reCode, '<code>$1</code>')
         .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
         .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  }
  const hhmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const toBottom = () => { scroller.scrollTop = scroller.scrollHeight; };
  const chatting = (on) => body.classList.toggle('chatting', on);

  function userMsg(text) {
    chatting(true);
    const row = document.createElement('div'); row.className = 'msg me';
    const b = document.createElement('div'); b.className = 'b'; b.textContent = text;
    row.appendChild(b); log.appendChild(row); toBottom();
  }

  function botMsg(opts) {
    chatting(true);
    const row = document.createElement('div');
    row.className = 'msg bot' + (opts.error ? ' error' : '');
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = opts.error ? 'ERROR' : opts.thinking ? 'PROCESSING' : 'HERMES';
    if (opts.time) { const t = document.createElement('span'); t.textContent = opts.time; meta.appendChild(t); }
    const b = document.createElement('div'); b.className = 'b';
    row.append(meta, b); log.appendChild(row);
    if (opts.thinking) b.innerHTML = '<div class="scan"></div><div class="scan"></div>';
    else if (opts.error) b.textContent = opts.text;
    else if (opts.text) { b.innerHTML = md(opts.text); addTools(row, opts.text); }
    toBottom();
    return { row, b };
  }

  function addTools(row, text) {
    const tools = document.createElement('div'); tools.className = 'tools';
    const copy = document.createElement('button'); copy.textContent = 'COPY';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'COPIED ✓'; setTimeout(() => { copy.textContent = 'COPY'; }, 1500); } catch {} };
    tools.appendChild(copy); row.appendChild(tools);
  }

  // Reveal the reply progressively while the core "speaks".
  function reveal(el, text) {
    return new Promise((done) => {
      if (reduced || text.length < 2) { el.innerHTML = md(text); return done(); }
      let i = 0;
      const step = Math.max(2, Math.ceil(text.length / 110));
      const go = () => {
        i = Math.min(text.length, i + step);
        let part = text.slice(0, i);
        if ((part.split('**').length - 1) % 2) part = part.slice(0, part.lastIndexOf('**')) + part.slice(part.lastIndexOf('**') + 2);
        el.innerHTML = md(part) + (i < text.length ? '<span class="caret"></span>' : '');
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160) toBottom();
        if (i < text.length) setTimeout(go, 16); else done();
      };
      go();
    });
  }

  async function api(path, payload) {
    const res = await fetch(path, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('لینک ورود معتبر نیست. در تلگرام دوباره /app بفرست.');
    if (!res.ok) throw new Error(data.error || 'خطای ارتباط (' + res.status + ')');
    return data;
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true; clearTimeout(surge); input.value = ''; resize();
    userMsg(text);
    setState('thinking');
    const pending = botMsg({ thinking: true });
    try {
      const { reply } = await api('/api/chat', { message: text });
      pending.row.remove();
      const m = botMsg({ time: hhmm() });
      setState('speaking');
      await reveal(m.b, reply);
      addTools(m.row, reply);
    } catch (err) {
      pending.row.remove(); botMsg({ text: err.message, error: true });
    } finally {
      busy = false; setState('idle'); resize();
      if (!('ontouchstart' in window)) input.focus();
    }
  }

  function chips() {
    const box = $('chips'); box.innerHTML = '';
    [['01', 'یک کپشن اینستاگرام برای تور آفرود بنویس'], ['02', 'برنامهٔ امروزم را مرتب کن'], ['03', 'ایدهٔ محتوا برای وایکینگ آفرود بده']].forEach(([n, t]) => {
      const c = document.createElement('button'); c.className = 'chip';
      const b = document.createElement('b'); b.textContent = n;
      c.append(b, document.createTextNode(t));
      c.onclick = () => { input.value = t; submit(); };
      box.appendChild(c);
    });
  }

  function resize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; send.disabled = busy || !input.value.trim(); }
  input.addEventListener('input', resize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); submit(); }
  });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  $('newChat').onclick = async () => {
    if (busy || !confirm('گفتگو و حافظه پاک شود؟')) return;
    try { await api('/api/reset', {}); log.innerHTML = ''; chatting(false); }
    catch (err) { botMsg({ text: err.message, error: true }); }
  };

  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('instant')));

  if (!key) {
    body.classList.add('locked'); $('newChat').remove();
    $('title').textContent = 'دسترسی قفل است';
    $('sub').innerHTML = 'در تلگرام به بات هرمس <code>/app</code> بفرست و لینک خصوصی را باز کن.';
    ready();
    return;
  }
  chips();
  (async () => {
    try {
      const { messages } = await api('/api/history');
      messages.forEach((m) => { if (m.role === 'user') userMsg(m.text); else botMsg({ text: m.text }); });
    } catch (err) { botMsg({ text: err.message, error: true }); }
    ready(); if (log.children.length) toBottom();
  })();
})();
</script>
</body>
</html>`;
