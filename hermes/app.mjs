// Hermes web chat: one self-contained page, installable on the iPhone home screen.
// The page talks to /api/* with a private key the bot sends via the /app command in Telegram.
//
// Look: an "agent world" in the style of APEX-UI by Ruben Mouradian (MIT). Navy backdrop with a
// faint wave shader, a gold-ringed particle core, and a constellation of Hermes' abilities wired
// to it like a circuit board. The core, the web and the status bar follow the chat:
// STANDBY, PROCESSING (the consulted abilities light up and particles flow), then SPEAKING.
// Everything here is drawn by this file (SVG, canvas 2D and one WebGL shader); no libraries.

export const MANIFEST = JSON.stringify({
  name: 'Hermes',
  short_name: 'Hermes',
  start_url: '/app',
  display: 'standalone',
  background_color: '#07111f',
  theme_color: '#07111f',
  lang: 'fa',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
});

export const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#143049"/><stop offset=".6" stop-color="#0a1a2c"/><stop offset="1" stop-color="#050b14"/></radialGradient>
<radialGradient id="core" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#c8f7ff"/><stop offset=".65" stop-color="#00e5ff" stop-opacity=".5"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="112" fill="url(#bg)"/>
<circle cx="256" cy="256" r="196" fill="none" stroke="#1b5f78" stroke-width="3" stroke-dasharray="2 12"/>
<circle cx="256" cy="256" r="146" fill="none" stroke="#f5a623" stroke-opacity=".25" stroke-width="26"/>
<circle cx="256" cy="256" r="146" fill="none" stroke="#ffd080" stroke-width="7"/>
<circle cx="256" cy="256" r="96" fill="url(#core)"/>
</svg>`;

// String.raw keeps the page's own regex backslashes intact. The page script must not use
// backticks or dollar-brace sequences, since this is a template literal.
export const APP_HTML = String.raw`<!doctype html>
<html lang="fa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#07111f">
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
    --text: #f0ede8; --label: #dfeaf3; --minor: #93a8ba; --dorm: #546a7d;
    --cyan: #00e5ff; --cyan-hi: #a5f3fc; --gold: #f5a623; --gold-hi: #ffd080; --grey: #7f9bb3; --ok: #34d399;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --fa: Vazirmatn, system-ui, -apple-system, Tahoma, sans-serif;
    --safe-b: env(safe-area-inset-bottom, 0px); --safe-t: env(safe-area-inset-top, 0px);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body { background: #07111f; color: var(--text); font-family: var(--sans); -webkit-font-smoothing: antialiased; -webkit-user-select: none; user-select: none; }
  .fa { font-family: var(--fa); direction: rtl; }
  button { font: inherit; color: inherit; }

  /* Backdrop: navy radial, faint waves, cyan light cast behind the core */
  .backdrop { position: fixed; inset: 0; background: radial-gradient(ellipse 95% 88% at 50% 42%, #122c43 0%, #0c1d30 38%, #07111f 72%, #050b14 100%); }
  #bg { position: fixed; inset: 0; width: 100%; height: 100%; opacity: .14; pointer-events: none; }
  #cast { position: fixed; inset: 0; pointer-events: none; mix-blend-mode: screen; transition: opacity .6s; opacity: .18; }

  /* The world: 680x480 design units, scaled into the free area by layout() */
  #world { position: fixed; left: 0; top: 0; width: 680px; height: 480px; transform-origin: 0 0; transition: transform .8s cubic-bezier(.2,.9,.2,1); }
  body.instant #world { transition: none; }
  #web { position: absolute; inset: 0; width: 680px; height: 480px; overflow: visible; }
  .lbl { font-family: var(--sans); fill: var(--label); paint-order: stroke; stroke: rgba(7,17,31,.6); stroke-width: 3px; }
  .lbl.minor { fill: var(--minor); } .lbl.dorm { fill: var(--dorm); }
  .node { cursor: pointer; }
  .node .ring { transition: stroke-width .3s, r .3s; }
  .node.hot .ring { stroke-width: 3; }
  .node.hot .halo { opacity: .55; }
  .node.locked .ring { stroke: #ff6b6b; stroke-dasharray: 2 2.4; opacity: .7; }
  .node.locked .lbl { fill: #8a5560; }
  .node.locked .pulse { animation: none; }
  .halo { opacity: 0; transition: opacity .4s; }
  .node:focus { outline: none; } .node:focus-visible .ring { stroke: #fff; }
  .spoke { transition: stroke .4s, opacity .4s, stroke-width .4s; }
  .spoke.hot { stroke: #33eaff; opacity: .95; stroke-width: 1.4; }
  .pulse { animation: pulse 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }

  #orb { position: absolute; left: 238px; top: 138px; width: 204px; height: 204px; cursor: pointer; border-radius: 50%; outline: none; }
  #orb svg, #orb canvas { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .spin-cw { transform-box: view-box; transform-origin: 200px 200px; animation: rot 24s linear infinite; }
  .spin-ccw { transform-box: view-box; transform-origin: 200px 200px; animation: rot 16s linear infinite reverse; }
  .spin-fast { transform-box: view-box; transform-origin: 200px 200px; animation: rot 5s linear infinite; }
  body[data-state="thinking"] .spin-cw { animation-duration: 6s; } body[data-state="thinking"] .spin-ccw { animation-duration: 4s; }
  .orbit { opacity: 0; transition: opacity .4s; } body[data-state="thinking"] .orbit { opacity: 1; }
  .wave { transform-box: view-box; transform-origin: 200px 200px; animation: wave 3.6s ease-out infinite; opacity: 0; }
  .wave:nth-of-type(2) { animation-delay: .9s; } .wave:nth-of-type(3) { animation-delay: 1.8s; } .wave:nth-of-type(4) { animation-delay: 2.7s; }
  body[data-state="thinking"] .wave, body[data-state="speaking"] .wave { animation-name: waveHot; animation-duration: 2s; }
  .breathe { animation: breathe 3s ease-in-out infinite; } body[data-state="speaking"] .breathe { animation-duration: .9s; }
  @keyframes rot { to { transform: rotate(360deg); } }
  @keyframes wave { 0% { transform: scale(1); opacity: .16; } 100% { transform: scale(1.5); opacity: 0; } }
  @keyframes waveHot { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(1.6); opacity: 0; } }
  @keyframes breathe { 0%,100% { opacity: .82; } 50% { opacity: 1; } }
  @keyframes blink { 0%,100% { opacity: .2; } 50% { opacity: 1; } }

  /* Overview lamp (top-left HUD) */
  .overview { position: fixed; top: calc(var(--safe-t) + 10px); left: 0; z-index: 30; width: 540px; max-width: 100vw; pointer-events: none; }
  .cone { position: absolute; top: 14px; left: 8px; width: min(520px, 94vw); height: 240px; filter: blur(10px); transition: all .5s;
    background: radial-gradient(ellipse 48% 70% at 46% 0%, rgba(0,229,255,.16), rgba(0,229,255,.04) 46%, transparent 72%); }
  .overview.open .cone { background: radial-gradient(ellipse 48% 70% at 46% 0%, rgba(0,229,255,.33), rgba(0,229,255,.04) 46%, transparent 72%); }
  .lamp { position: relative; height: 40px; width: min(330px, calc(100vw - 150px)); cursor: pointer; pointer-events: auto; outline: none; }
  .fil { position: absolute; top: 14px; left: 8px; width: min(320px, calc(100vw - 160px)); height: 2px; border-radius: 2px; background: #a5f3fc;
    box-shadow: 0 0 10px var(--cyan), 0 0 26px var(--cyan); transition: all .5s; }
  .overview.open .fil { width: min(480px, calc(100vw - 160px)); box-shadow: 0 0 10px var(--cyan), 0 0 26px var(--cyan), 0 0 54px var(--cyan); }
  .knob { position: absolute; top: 11px; left: 6px; width: 8px; height: 8px; border-radius: 50%; background: #e0fbff; box-shadow: 0 0 10px var(--cyan), 0 0 18px var(--cyan); transition: left .5s; }
  .overview.open .knob { left: min(480px, calc(100vw - 160px)); }
  .lamp span { position: absolute; top: 20px; left: 10px; font: 9px/1 var(--mono); letter-spacing: .34em; color: rgba(165,243,252,.55); transition: color .4s; }
  .overview.open .lamp span { color: rgba(165,243,252,.9); }
  .clockbox { position: relative; padding: 6px 0 0 14px; display: flex; align-items: flex-end; gap: 26px; width: fit-content; pointer-events: auto; }
  .time { font-size: 34px; font-weight: 300; letter-spacing: .04em; line-height: 1; text-shadow: 0 0 22px rgba(0,229,255,.2); }
  .date { font-size: 10.5px; letter-spacing: .2em; color: rgba(240,237,232,.55); margin-top: 4px; text-transform: uppercase; }
  .temp { font-size: 22px; font-weight: 300; color: rgba(0,229,255,.9); }
  .city { font-size: 9.5px; letter-spacing: .12em; color: rgba(240,237,232,.5); margin-top: 2px; text-transform: uppercase; }
  .tiles { display: none; position: relative; margin: 16px 0 0 14px; width: 250px; flex-direction: column; gap: 8px; pointer-events: auto; }
  .overview.open .tiles { display: flex; }
  .tile { display: flex; align-items: center; gap: 11px; padding: 11px 14px; border-radius: 10px; cursor: pointer; text-align: right; width: 100%;
    background: rgba(6,14,26,.72); border: 1px solid rgba(0,229,255,.16); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    color: rgba(240,237,232,.9); text-decoration: none; font-size: 13px; transition: border-color .2s, background .2s; direction: rtl; font-family: var(--fa); }
  .tile:hover { border-color: rgba(0,229,255,.45); background: rgba(10,24,40,.85); }
  .tile svg { flex: none; color: var(--cyan); }

  .pill { position: fixed; top: calc(var(--safe-t) + 16px); right: clamp(16px, 3vw, 40px); z-index: 40; cursor: pointer;
    font: 10.5px/1 var(--mono); letter-spacing: .24em; text-transform: uppercase; color: rgba(240,237,232,.7);
    border: 1px solid rgba(240,237,232,.2); border-radius: 20px; padding: 8px 15px; background: rgba(4,8,15,.5);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); transition: border-color .2s, color .2s; }
  .pill:hover { color: #fff; border-color: rgba(240,237,232,.45); }

  /* Status bar: equalizer + core dot + label */
  #status { position: fixed; left: 0; right: 0; z-index: 18; display: flex; justify-content: center; pointer-events: none; }
  #status svg { width: min(420px, 100vw); height: auto; overflow: visible; }
  .bar { transform-box: fill-box; transform-origin: center; }
  body[data-state="thinking"] .bar, body[data-state="speaking"] .bar { animation: sb .6s ease-in-out infinite alternate; }
  @keyframes sb { from { transform: scaleY(.35); } to { transform: scaleY(1.15); } }
  .sdot { animation: blink 1.2s ease-in-out infinite; }

  /* Dock: latest reply + composer */
  #dock { position: fixed; left: 50%; bottom: 0; z-index: 35; width: min(720px, 100vw); transform: translateX(-50%); padding: 0 12px calc(var(--safe-b) + 12px); }
  #reply, #login {
    display: none; position: fixed; left: 50%; z-index: 34; width: min(720px, calc(100vw - 24px)); transform: translateX(-50%);
    max-height: 34vh; overflow: hidden; flex-direction: column; border-radius: 16px;
    background: rgba(4,9,20,.82); -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px);
    border: 1px solid rgba(245,166,35,.22); box-shadow: 0 0 40px rgba(245,166,35,.06), 0 8px 32px rgba(0,0,0,.55);
    -webkit-user-select: text; user-select: text; animation: rise .45s cubic-bezier(.2,.9,.2,1);
  }
  #reply.show, .locked #login { display: flex; }
  #login { width: min(400px, calc(100vw - 24px)); max-height: none; border-color: rgba(0,229,255,.22); }
  #reply.err { border-color: rgba(255,107,107,.35); }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 12px); } }
  .rhead { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid rgba(245,166,35,.12);
    background: linear-gradient(135deg, rgba(245,166,35,.05), transparent); flex: none; }
  .rdot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 10px var(--gold); }
  #reply.err .rdot { background: #ff6b6b; box-shadow: 0 0 10px #ff6b6b; }
  .rname { font: 600 11px/1 var(--mono); letter-spacing: .24em; color: var(--gold); }
  .rtime { flex: 1; font: 10px/1 var(--mono); letter-spacing: .12em; color: rgba(255,255,255,.3); }
  .rbtn { background: none; border: 0; color: rgba(255,255,255,.35); cursor: pointer; font: 10px/1 var(--mono); letter-spacing: .2em; padding: 6px 8px; border-radius: 6px; }
  .rbtn:hover { color: rgba(255,255,255,.85); }
  .rbody { padding: 12px 16px 14px; overflow-y: auto; font: 15px/1.85 var(--fa); direction: rtl; white-space: pre-wrap; overflow-wrap: anywhere; color: rgba(240,237,232,.92); }
  .md code { background: rgba(245,166,35,.1); color: var(--gold-hi); padding: 1px 7px; border-radius: 6px; font-family: inherit; unicode-bidi: isolate; }
  .md pre { background: rgba(2,5,9,.85); border: 1px solid rgba(255,255,255,.07); padding: 12px 14px; border-radius: 10px; overflow-x: auto; direction: ltr; text-align: left; white-space: pre; margin: 8px 0; }
  .md pre code { background: none; color: #d6e6ee; padding: 0; font: 13px/1.6 var(--mono); }
  .md a { color: var(--cyan); text-decoration: none; border-bottom: 1px solid rgba(0,229,255,.35); }
  .md b { color: #fff; }
  .picbox { margin: 2px 0 10px; }
  .pic { display: block; position: relative; margin: 0; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); white-space: normal; }
  .pick { display: block; width: 100%; margin: 6px 0 0; padding: 7px 10px; border-radius: 9px; background: rgba(245,166,35,.14); border: 1px solid rgba(245,166,35,.45); color: var(--gold-hi); font: 600 12.5px/1.5 var(--fa); cursor: pointer; }
  .pick:active { background: rgba(245,166,35,.24); }
  .pick[disabled] { opacity: .6; cursor: default; }
  canvas.pic { width: 100%; height: auto; }
  .pick.small { display: inline-block; width: auto; margin: 6px 4px 0 0; padding: 6px 11px; background: rgba(0,229,255,.10); border-color: rgba(0,229,255,.4); color: var(--cyan-hi); }
  .pick.small.on { background: rgba(0,229,255,.26); border-color: var(--cyan); }
  .lhint { margin-top: 6px; color: var(--minor); font: 500 11.5px/1.7 var(--fa); }
  .lrow { display: flex; flex-wrap: wrap; align-items: center; }
  .pic img { display: block; width: 100%; height: auto; }
  .pic span { position: absolute; left: 8px; bottom: 8px; padding: 3px 9px; border-radius: 99px; background: rgba(0,0,0,.65); color: var(--gold); font: 600 11px/1.6 ui-monospace, monospace; letter-spacing: .08em; }
  .caret { display: inline-block; width: 7px; height: 1.05em; vertical-align: -3px; margin-right: 2px; background: var(--gold); box-shadow: 0 0 10px var(--gold); animation: blink .7s infinite; }
  .scan { height: 9px; border-radius: 5px; margin: 6px 0 0 auto; width: 70%;
    background: linear-gradient(90deg, rgba(245,166,35,.05) 0%, rgba(245,166,35,.4) 50%, rgba(245,166,35,.05) 100%); background-size: 200% 100%; animation: scan 1.1s linear infinite; }
  .scan + .scan { width: 45%; margin-top: 10px; opacity: .7; }
  @keyframes scan { from { background-position: 200% 0; } to { background-position: -200% 0; } }

  .composer { display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 8px; border-radius: 26px;
    background: rgba(4,9,20,.8); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    border: 1px solid rgba(0,229,255,.16); box-shadow: 0 10px 40px rgba(0,0,0,.45); transition: border-color .3s, box-shadow .3s; }
  .composer:focus-within { border-color: rgba(0,229,255,.45); box-shadow: 0 10px 40px rgba(0,0,0,.45), 0 0 0 4px rgba(0,229,255,.06), 0 0 30px rgba(0,229,255,.12); }
  textarea { flex: 1; resize: none; border: 0; outline: 0; background: none; color: var(--text); font: 16px/1.6 var(--fa); max-height: 140px; padding: 9px 12px; direction: rtl; -webkit-user-select: text; user-select: text; }
  textarea::placeholder { color: rgba(147,168,186,.55); }
  .send { width: 42px; height: 42px; flex: none; border: 0; border-radius: 50%; cursor: pointer; display: grid; place-items: center; color: #1a0f00;
    background: radial-gradient(circle at 50% 40%, #fff3d6, var(--gold-hi) 35%, var(--gold) 75%);
    box-shadow: 0 0 0 1px rgba(255,208,128,.6), 0 0 18px rgba(245,166,35,.55); transition: opacity .2s, transform .1s; }
  .tool { width: 38px; height: 42px; flex: none; border: 0; background: none; color: rgba(147,168,186,.8); cursor: pointer; display: grid; place-items: center; border-radius: 50%; transition: color .2s, background .2s; }
  .tool:hover { color: var(--text); } .tool.on { color: var(--gold); background: rgba(245,166,35,.12); }
  .tool.rec { color: #ff5d5d; background: rgba(255,60,60,.14); animation: blink 1s infinite; }
  .send:active { transform: scale(.92); } .send:disabled { opacity: .25; box-shadow: none; cursor: default; }

  /* Agent overview card */
  #card { display: none; position: fixed; z-index: 60; left: 50%; top: max(90px, 14vh); transform: translateX(-50%); width: min(340px, 92vw);
    background: rgba(4,3,12,.92); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); border-radius: 16px; overflow: hidden; animation: rise .35s ease-out; }
  #card.show { display: block; }
  .chead { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
  .cicon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: none; }
  .cicon i { width: 10px; height: 10px; border-radius: 50%; }
  .cname { font-size: 13px; font-weight: 600; letter-spacing: .08em; }
  .crole { font: 12px/1.5 var(--fa); color: rgba(255,255,255,.45); direction: rtl; text-align: left; }
  .cx { margin-left: auto; background: none; border: 0; color: rgba(255,255,255,.3); cursor: pointer; font-size: 20px; line-height: 1; padding: 6px 8px; }
  .cx:hover { color: rgba(255,255,255,.8); }
  .cbody { padding: 14px 16px; display: flex; flex-direction: column; gap: 16px; }
  .ctitle { font: 9px/1 var(--mono); letter-spacing: .14em; margin-bottom: 9px; }
  .caps { display: flex; flex-direction: column; gap: 5px; direction: rtl; }
  .caps div { display: flex; gap: 8px; font: 12.5px/1.6 var(--fa); color: rgba(255,255,255,.62); }
  .caps div::before { content: ""; width: 3px; height: 3px; border-radius: 50%; background: currentColor; margin-top: 10px; flex: none; opacity: .8; }
  .asks { display: flex; flex-wrap: wrap; gap: 6px; direction: rtl; }
  .ask { padding: 5px 11px; border-radius: 20px; font: 12px/1.5 var(--fa); cursor: pointer; background: none; transition: background .2s; }
  .cstat { display: flex; align-items: center; gap: 8px; padding-top: 12px; font: 11.5px/1.4 var(--fa); color: rgba(255,255,255,.5); direction: rtl; }
  .cstat i { width: 7px; height: 7px; border-radius: 50%; flex: none; }

  /* Session log */
  #log { position: fixed; z-index: 70; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); display: flex; flex-direction: column;
    background: rgba(4,9,20,.94); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); border-left: 1px solid rgba(0,229,255,.14);
    transform: translateX(105%); transition: transform .5s cubic-bezier(.2,.9,.2,1); -webkit-user-select: text; user-select: text; }
  #log.show { transform: none; }
  .lhead { display: flex; align-items: center; gap: 10px; padding: calc(var(--safe-t) + 16px) 18px 14px; border-bottom: 1px solid rgba(0,229,255,.12); }
  .lhead b { font: 600 11px/1 var(--mono); letter-spacing: .3em; color: var(--cyan-hi); }
  .lhead span { font: 10px/1 var(--mono); letter-spacing: .14em; color: var(--dorm); }
  .lhead .cx { margin-left: auto; }
  .lbody { flex: 1; overflow-y: auto; padding: 18px 16px calc(var(--safe-b) + 24px); display: flex; flex-direction: column; gap: 18px; }
  .notes { border: 1px solid rgba(0,229,255,.16); border-radius: 12px; padding: 10px 14px; background: rgba(0,229,255,.04); direction: rtl; }
  .notes .nt { display: flex; align-items: center; gap: 8px; font: 10px/1 var(--mono); letter-spacing: .24em; color: var(--cyan-hi); margin-bottom: 8px; direction: ltr; justify-content: flex-end; }
  .notes .nt button { margin-right: auto; background: none; border: 0; color: var(--dorm); cursor: pointer; font: 10px/1 var(--mono); letter-spacing: .14em; }
  .notes .nt button:hover { color: #ff8a8a; }
  .notes div.n { font: 13.5px/1.8 var(--fa); color: rgba(240,237,232,.85); }
  .notes div.n::before { content: "◆ "; color: var(--cyan); font-size: 9px; }
  .notes div.n.rmrow { display: flex; align-items: baseline; gap: 6px; }
  .notes div.n.rmrow::before { content: "⏰"; font-size: 10px; }
  .notes .rtxt { flex: 1; }
  .notes .rdel { background: none; border: 0; color: var(--dorm); cursor: pointer; font: 12px/1 var(--mono); padding: 2px 4px; }
  .notes .rdel:hover { color: #ff8a8a; }
  .notes .hint { font: 12px/1.7 var(--fa); color: var(--dorm); }
  .lbody:empty::after { content: "NO MESSAGES YET"; font: 10px/1 var(--mono); letter-spacing: .3em; color: var(--dorm); text-align: center; margin-top: 30vh; }
  .m { font: 15px/1.85 var(--fa); direction: rtl; white-space: pre-wrap; overflow-wrap: anywhere; }
  .m.me { align-self: flex-end; max-width: 88%; padding: 9px 15px; border-radius: 16px 16px 16px 5px; background: linear-gradient(135deg, rgba(0,229,255,.12), rgba(0,229,255,.04)); border: 1px solid rgba(0,229,255,.18); }
  .m.bot { position: relative; padding-right: 14px; color: rgba(240,237,232,.9); }
  .m.bot::before { content: ""; position: absolute; right: 0; top: 6px; bottom: 6px; width: 1.5px; background: linear-gradient(var(--gold), rgba(245,166,35,.05)); box-shadow: 0 0 10px rgba(245,166,35,.4); }

  .locked #dock, .locked #reply, .locked .pill, .locked .tiles { display: none !important; }
  .lform { display: flex; flex-direction: column; gap: 10px; padding: 16px; direction: rtl; }
  .lform input { width: 100%; font: 16px/1.4 var(--mono); color: var(--text); background: rgba(2,6,12,.7); border: 1px solid rgba(0,229,255,.18);
    border-radius: 12px; padding: 12px 14px; outline: none; text-align: left; -webkit-user-select: text; user-select: text; transition: border-color .2s, box-shadow .2s; }
  .lform input:focus { border-color: rgba(0,229,255,.5); box-shadow: 0 0 0 3px rgba(0,229,255,.08); }
  .lform input::placeholder { font-family: var(--fa); color: rgba(147,168,186,.55); text-align: right; }
  .lbtn { margin-top: 4px; border: 0; border-radius: 12px; padding: 12px; cursor: pointer; font: 600 15px/1 var(--fa); color: #1a0f00;
    background: radial-gradient(circle at 50% 30%, #fff3d6, var(--gold-hi) 40%, var(--gold) 90%); box-shadow: 0 0 18px rgba(245,166,35,.4); }
  .lbtn:disabled { opacity: .5; }
  .lerr { min-height: 1.2em; font: 13px/1.5 var(--fa); color: #ff8a8a; }
  .lnote { font: 12px/1.7 var(--fa); color: var(--dorm); }
  .lnote code { font-family: var(--mono); color: var(--gold-hi); background: rgba(245,166,35,.1); padding: 1px 6px; border-radius: 5px; }
  .who { padding: 10px 0 0 14px; font: 10px/1 var(--mono); letter-spacing: .2em; color: rgba(165,243,252,.6); pointer-events: none; position: relative; }
  .who b { font: 600 12px/1 var(--fa); letter-spacing: 0; color: var(--text); margin-right: 6px; }
  .tile.hide { display: none; }
  @media (max-height: 540px) {
    #login { width: min(640px, calc(100vw - 24px)); }
    #login .rhead { display: none; }
    .lform { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; padding: 10px; }
    .lform input { padding: 10px 12px; }
    .lbtn { margin: 0; padding: 0 22px; }
    .lerr, .lnote { grid-column: 1 / -1; min-height: 0; }
    .lerr:empty { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .001s !important; animation-iteration-count: 1 !important; transition: none !important; }
  }
</style>
</head>
<body data-state="idle" class="instant">
<div class="backdrop"></div>
<canvas id="bg" aria-hidden="true"></canvas>
<div id="cast" aria-hidden="true"></div>

<div id="world">
  <svg id="web" viewBox="0 0 680 480" aria-label="توانایی‌های هرمس"></svg>
  <div id="orb" role="button" tabindex="0" aria-label="Hermes core">
    <svg viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="rf" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#f5a623" stop-opacity="0"/><stop offset=".7" stop-color="#f5a623" stop-opacity=".04"/>
          <stop offset=".88" stop-color="#f5a623" stop-opacity=".16"/><stop offset="1" stop-color="#ffd080" stop-opacity=".45"/>
        </radialGradient>
        <filter id="gl" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g><circle class="wave" cx="200" cy="200" r="150" stroke="#f5a623" stroke-width="1"/><circle class="wave" cx="200" cy="200" r="150" stroke="#f5a623" stroke-width="1"/><circle class="wave" cx="200" cy="200" r="150" stroke="#f5a623" stroke-width="1"/><circle class="wave" cx="200" cy="200" r="150" stroke="#f5a623" stroke-width="1"/></g>
      <g class="orbit"><circle cx="200" cy="200" r="172" stroke="#ffd080" stroke-width="1.2" stroke-opacity=".5" stroke-dasharray="8 14" class="spin-fast"/></g>
      <circle cx="200" cy="200" r="150" fill="url(#rf)" class="breathe"/>
      <circle cx="200" cy="200" r="150" stroke="#f5a623" stroke-width="18" stroke-opacity=".08" filter="url(#gl)" class="breathe"/>
      <circle cx="200" cy="200" r="150" stroke="#f5a623" stroke-width="6" stroke-opacity=".4" filter="url(#gl)"/>
      <circle cx="200" cy="200" r="150" stroke="#ffd080" stroke-width="2.6" stroke-opacity=".95" class="breathe"/>
      <circle cx="200" cy="200" r="87" stroke="#f5a623" stroke-width="1.4" stroke-opacity=".2" stroke-dasharray="55 25" class="spin-cw"/>
      <circle cx="200" cy="200" r="52" stroke="#f5a623" stroke-width="1" stroke-opacity=".12" stroke-dasharray="28 18" class="spin-ccw"/>
    </svg>
    <canvas id="core"></canvas>
  </div>
</div>

<div class="overview" id="overview">
  <div class="cone"></div>
  <div class="lamp" id="lamp" role="button" tabindex="0" aria-label="Overview" aria-expanded="false"><div class="fil"></div><div class="knob"></div><span>OVERVIEW</span></div>
  <div class="clockbox">
    <div><div class="time" id="time">--:--</div><div class="date" id="date"></div></div>
    <div><div class="temp" id="temp">-</div><div class="city" id="city">&nbsp;</div></div>
  </div>
  <div class="who" id="who"></div>
  <div class="tiles">
    <a class="tile hide" id="tTg" href="https://t.me/Pouragent_bot" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/></svg>هرمس در تلگرام</a>
    <button class="tile" id="tNew"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>گفتگوی جدید (قبلی بایگانی می‌شود)</button>
    <button class="tile" id="tLog"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>تاریخچهٔ گفتگو</button>
    <button class="tile hide" id="tTeam"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>حساب‌های تیم</button>
    <button class="tile hide" id="tPass"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/></svg>تغییر رمز</button>
    <button class="tile" id="tForget"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z"/></svg>خروج از حساب</button>
  </div>
</div>

<button class="pill" id="pill">Log ↗</button>

<div id="status" aria-live="polite">
  <svg viewBox="0 0 420 110" fill="none">
    <defs><filter id="sbBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <line x1="60" y1="40" x2="182" y2="40" stroke="#f5a623" stroke-dasharray="4 3" class="ext" opacity=".18"/>
    <line x1="238" y1="40" x2="360" y2="40" stroke="#f5a623" stroke-dasharray="4 3" class="ext" opacity=".18"/>
    <g id="eq"></g>
    <circle cx="210" cy="40" r="20" stroke="#f5a623" stroke-width="1.5" stroke-opacity=".7" fill="#030200" filter="url(#sbBlur)" class="breathe"/>
    <circle cx="210" cy="40" r="6" fill="#ffd080" style="filter: drop-shadow(0 0 10px #f5a623)"/>
    <text id="label" x="210" y="84" text-anchor="middle" fill="#f5a623" font-size="13" font-family="ui-monospace, Menlo, monospace" letter-spacing="5.2" opacity=".78">STANDBY</text>
    <circle cx="198" cy="100" r="2.5" fill="#f5a623" class="sdot"/><circle cx="210" cy="100" r="2.5" fill="#f5a623" class="sdot" style="animation-delay:.4s"/><circle cx="222" cy="100" r="2.5" fill="#f5a623" class="sdot" style="animation-delay:.8s"/>
  </svg>
</div>

<section id="login" aria-label="ورود">
  <div class="rhead"><span class="rdot" style="background:#00e5ff;box-shadow:0 0 10px #00e5ff"></span><span class="rname" style="color:#a5f3fc">ACCESS</span><span class="rtime">HERMES · VIKING OFFROAD</span></div>
  <form class="lform" id="lform" autocomplete="on">
    <input id="lu" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="نام کاربری" dir="ltr" required>
    <input id="lp" name="password" type="password" autocomplete="current-password" placeholder="رمز عبور" dir="ltr" required>
    <button class="lbtn" id="lgo" type="submit">ورود</button>
    <div class="lerr" id="lerr" role="alert"></div>
    <div class="lnote">مالک سیستم: در تلگرام به بات <code>/app</code> بفرست.</div>
  </form>
</section>

<section id="reply" aria-live="polite">
  <div class="rhead"><span class="rdot"></span><span class="rname" id="rname">HERMES</span><span class="rtime" id="rtime"></span>
    <button class="rbtn" id="rcopy">COPY</button><button class="rbtn" id="rclose" aria-label="Close">✕</button></div>
  <div class="rbody md" id="rbody"></div>
</section>

<div id="dock">
  <form class="composer" id="form">
    <input type="file" id="file" accept="image/*" hidden>
    <button class="tool" id="attach" type="button" aria-label="فرستادن عکس"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg></button>
    <button class="tool" id="mic" type="button" aria-label="ویس"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
    <textarea id="input" rows="1" placeholder="به هرمس بگو…" autocomplete="off"></textarea>
    <button class="send" id="send" type="submit" aria-label="ارسال" disabled>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </button>
  </form>
</div>

<div id="card" role="dialog" aria-modal="true"></div>

<aside id="log" aria-label="Session log">
  <div class="lhead"><b>SESSION LOG</b><span id="lcount"></span><button class="cx" id="lclose" aria-label="Close">×</button></div>
  <div class="lbody" id="lbody"></div>
</aside>

<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body, input = $('input'), send = $('send');
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
                  del: (k) => { try { localStorage.removeItem(k); } catch {} } };
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('k')) { store.set('hermes-key', hash.get('k')); history.replaceState(null, '', location.pathname); }
  const key = store.get('hermes-key') || store.get('hermes-session');
  let busy = false, messages = [], me = null, locks = [];

  // ── Hermes' abilities: id, label, kind, x, y, live, label side, radius, Persian card ──
  const COL = { core: '#00e5ff', skill: '#f5a623', soon: '#7f9bb3' };
  const STATUS = {
    online: ['#34d399', 'آنلاین · هرمس خودکار از آن استفاده می‌کند'],
    locked: ['#ff6b6b', 'قفل · این توانایی برای حساب تو بسته است'],
    queued: ['#c9a84c', 'در صف ساخت · مرحلهٔ بعدی پروژه'],
    planned: ['#7f9bb3', 'برنامه‌ریزی‌شده · هنوز وصل نیست'],
  };
  const ROSTER = [
    ['brain', 'Brain', 'core', 250, 212, true, 'l', 9, 'مغز هرمس', 'online',
      ['جواب‌ها را با Gemini می‌سازد', 'اگر جمینی در دسترس نبود، خودکار به Workers AI می‌رود', 'به زبان خودت، کوتاه و دقیق جواب می‌دهد'], ['خودت را معرفی کن']],
    ['memory', 'Memory', 'core', 452, 250, true, 'r', 8, 'حافظهٔ گفتگو', 'online',
      ['همهٔ پیام‌ها را ذخیره می‌کند؛ ۴۰ پیام آخر در پاسخ دیده می‌شود', 'گفتگوی مالک بین تلگرام و اپ مشترک است', 'با «گفتگوی جدید» بایگانی می‌شود، نه حذف'], ['آخرین چیزی که گفتم چه بود؟']],
    ['telegram', 'Telegram', 'core', 296, 118, true, 'l', 6.5, 'هرمس در تلگرام · ‎@Pouragent_bot', 'online',
      ['۲۴ ساعته روی Cloudflare روشن است', 'فقط به تو جواب می‌دهد', 'دستورها: /start /reset /app'], []],
    ['research', 'Research', 'core', 182, 150, true, 'l', 6.5, 'پژوهش و تحلیل', 'online',
      ['خلاصه و مقایسهٔ موضوع‌ها', 'تحلیل بازار و رقبا از دانش مدل', 'جواب‌ها را با «مطمئن نیستم» صادقانه علامت می‌زند'], ['بازار تور آفرود در ایران را تحلیل کن']],
    ['edge', 'Edge AI', 'core', 436, 148, true, 'r', 6.5, 'Workers AI · مغز پشتیبان', 'online',
      ['مدل‌های رایگان Cloudflare: Gemma و Llama', 'بدون کلید و بدون VPN', 'وقتی گوگل 403 بدهد، جواب را این می‌دهد'], []],
    ['app', 'App', 'core', 584, 208, true, 'r', 6.5, 'همین اپ', 'online',
      ['روی صفحهٔ اصلی آیفون نصب می‌شود', 'لینک خصوصی با /app در تلگرام', 'حافظه با تلگرام یکی است'], []],
    ['content', 'Content', 'skill', 158, 266, true, 'l', 6.5, 'تولید محتوا', 'online',
      ['ایدهٔ پست، ریلز و استوری', 'تقویم محتوای هفتگی', 'لحن برند وایکینگ آفرود'], ['ایدهٔ محتوا برای وایکینگ آفرود بده', 'تقویم محتوای این هفته را بچین']],
    ['captions', 'Captions', 'skill', 195, 298, true, 'l', 6.5, 'کپشن و هشتگ', 'online',
      ['کپشن کوتاه و جذاب اینستاگرام', 'هشتگ‌های مرتبط', 'نسخهٔ فارسی و انگلیسی'], ['یک کپشن اینستاگرام برای تور آفرود بنویس']],
    ['planner', 'Planner', 'skill', 232, 330, true, 'l', 6.5, 'برنامه‌ریزی روزانه', 'online',
      ['اولویت‌بندی کارهای روز', 'تقسیم کار بزرگ به قدم‌های کوچک', 'چک‌لیست سفر و تور'], ['برنامهٔ امروزم را مرتب کن', 'چک‌لیست تور آفرود دوروزه بده']],
    ['viking', 'Viking', 'skill', 330, 374, true, 't', 6.5, 'وایکینگ آفرود', 'online',
      ['متن معرفی تور و مسیر', 'جواب آمادهٔ سؤال‌های مشتری', 'ایدهٔ پکیج و قیمت‌گذاری'], ['متن معرفی تور آخر هفته بنویس', 'به مشتری که قیمت می‌پرسد چه بگویم؟']],
    ['translate', 'Translate', 'skill', 426, 350, true, 'r', 6.5, 'ترجمه', 'online',
      ['فارسی ↔ انگلیسی و زبان‌های دیگر', 'حفظ لحن متن', 'ترجمهٔ پیام مشتری خارجی'], ['این را به انگلیسی ترجمه کن: ']],
    ['editor', 'Editor', 'skill', 502, 312, true, 'r', 6.5, 'ویرایش متن', 'online',
      ['روان و کوتاه کردن متن', 'رسمی یا خودمانی کردن لحن', 'غلط‌گیری'], ['این متن را روان‌تر کن: ']],
    ['voice', 'Voice', 'skill', 118, 356, true, 'l', 6, 'پیام صوتی', 'online',
      ['ویس تلگرام را می‌فهمد', 'در اپ: دکمهٔ میکروفون، بزن و حرف بزن'], []],
    ['vision', 'Vision', 'skill', 256, 388, true, 't', 5.5, 'دیدن عکس', 'online',
      ['عکس را تحلیل می‌کند و توضیح می‌دهد', 'برای عکس کپشن می‌نویسد', 'در اپ: دکمهٔ دوربین کنار پیام'], []],
    ['photolab', 'Photo Lab', 'core', 150, 418, true, 'l', 6.5, 'ویرایش حرفه‌ای عکس', 'online',
      ['عکس خودت را بفرست و بگو چه تغییری می‌خواهی؛ قبل از خروج، عکس را یک ریتوشِر بازبینی می‌کند',
       'متن هم می‌شود: «روی عکس بنویس: …» — با فونت واقعی وزیرمتن می‌نشیند و بالا/وسط/پایین و ذخیره دارد',
       'همان متن با پیام هم می‌چرخد: «بالاتر ببر»، «سفیدش کن»، «درشت‌ترش کن»، «بدون نوار»، «متن رو عوض کن…»، «متن رو بردار»',
       'ریتوش پرتره، پس‌زمینهٔ جدید، نورپردازی، گرید سینمایی، بازسازی عکس قدیمی، افزایش کیفیت، حذف شیء، عکس محصول استودیویی',
       'هویت و چهره دست‌نخورده می‌ماند؛ متن را مدل تصویر نمی‌کشد (فارسی را خراب می‌کند) — فونت واقعی روی عکس می‌نشیند'],
      ['این عکس رو ریتوش کن', 'این عکس قدیمی رو بازسازی کن', 'بالاتر ببر']],
    ['remind', 'Reminders', 'skill', 414, 392, true, 't', 5.5, 'یادآور و خلاصهٔ صبح', 'online',
      ['یادآوری سر ساعت در تلگرام', 'هر صبح خلاصهٔ روز'], []],
    ['calendar', 'Calendar', 'soon', 560, 356, true, 'r', 5.5, 'تقویم و رزرو تور', 'planned',
      ['ثبت رزرو تورها', 'یادآوری قبل از حرکت'], []],
    ['search', 'Search', 'skill', 608, 286, true, 'r', 5.5, 'جست‌وجوی وب', 'online',
      ['خبر و قیمت روز', 'منبع‌دار جواب می‌دهد'], []],
    ['fjcod', 'FJCod', 'soon', 582, 132, false, 'r', 5.5, 'اتصال به FJCod', 'planned',
      ['دسترسی به داده‌های پروژهٔ FJCod'], []],
  ];
  const AX = 340, AY = 240;

  // ── Build the web (SVG) ──
  const web = $('web');
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  web.innerHTML = '<defs><filter id="rw-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<filter id="rw-line" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  const gPcb = mk('g', { filter: 'url(#rw-line)' }), gRings = mk('g', {}), gField = mk('g', { filter: 'url(#rw-line)' }),
        gSpokes = mk('g', { filter: 'url(#rw-line)' }), gMotes = mk('g', {}), gNodes = mk('g', {});
  web.append(gPcb, gRings, gField, gSpokes, gMotes, gNodes);
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  [128, 186, 236].forEach((r) => gRings.append(mk('circle', { cx: AX, cy: AY, r: r, fill: 'none', stroke: '#1b5f78', opacity: .32, 'stroke-width': 1, 'stroke-dasharray': '1 7' })));
  gRings.append(mk('path', { d: 'M340 4v14M340 462v14', stroke: '#1b5f78', opacity: .5 }));
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 6; i++) {
      const y = AY + (i - 2.5) * 52 + (rnd() * 16 - 8);
      const x0 = AX + side * (128 + rnd() * 34);
      const mid = side < 0 ? 40 + rnd() * 56 : 584 + rnd() * 56;
      const y2 = y + (rnd() * 30 - 15);
      const end = side < 0 ? 10 + rnd() * 18 : 652 + rnd() * 18;
      gPcb.append(mk('path', { d: 'M' + x0 + ' ' + y + ' H' + mid + ' V' + y2 + ' H' + end, fill: 'none', stroke: '#1c5f7a', opacity: .5, 'stroke-width': 1 }));
      gPcb.append(mk('circle', { cx: end, cy: y2, r: 2.4, fill: '#37d6ef', opacity: .85 }));
      gPcb.append(mk('circle', { cx: x0, cy: y, r: 1.3, fill: '#2bd0e6', opacity: .45 }));
    }
  });
  for (let i = 0; i < 16; i++) {
    const x = 36 + rnd() * 608, y = 30 + rnd() * 420;
    if (Math.hypot(x - AX, y - AY) < 200) continue;
    const a = rnd() * 6.28, l = 20 + rnd() * 50;
    gField.append(mk('line', { x1: x, y1: y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, stroke: '#143f4f', opacity: .7, 'stroke-width': .8 }));
    gField.append(mk('circle', { cx: x, cy: y, r: 1.1, fill: '#2bd0e6', opacity: .5 }));
  }

  const nodes = {};
  ROSTER.forEach((r, idx) => {
    const [id, label, kind, x, y, live, side, rad] = r;
    const col = COL[kind];
    const dx = x - AX, dy = y - AY, l = Math.hypot(dx, dy), bend = (idx % 2 ? 1 : -1) * (8 + (idx * 7) % 22);
    const mx = (AX + x) / 2 + (-dy / l) * bend, my = (AY + y) / 2 + (dx / l) * bend;
    const spoke = mk('path', { d: 'M' + AX + ' ' + AY + ' Q' + mx + ' ' + my + ' ' + x + ' ' + y, fill: 'none', stroke: '#22566b', opacity: live ? .75 : .35, 'stroke-width': 1, class: 'spoke' });
    gSpokes.append(spoke);
    const g = mk('g', { class: 'node', tabindex: 0, role: 'button', 'aria-label': label });
    const halo = mk('circle', { cx: x, cy: y, r: rad + 9, fill: col, opacity: 0, class: 'halo', filter: 'url(#rw-glow)' });
    const inner = mk('g', { class: live ? 'pulse' : '' });
    inner.style.animationDelay = (idx * .37 % 3) + 's';
    inner.append(mk('circle', { cx: x, cy: y, r: rad + 4, fill: col, opacity: .08 }));
    inner.append(mk('circle', { cx: x, cy: y, r: rad, fill: '#081626', stroke: col, 'stroke-width': live ? 2.2 : 1.4, 'stroke-dasharray': live ? '' : '2 2.4', opacity: live ? 1 : .55, class: 'ring', filter: 'url(#rw-glow)' }));
    const t = mk('text', { class: 'lbl' + (live ? (rad < 6 ? ' minor' : '') : ' dorm'), 'dominant-baseline': 'middle' });
    if (side === 't') { t.setAttribute('x', x); t.setAttribute('y', y - rad - 12); t.setAttribute('text-anchor', 'middle'); }
    else { t.setAttribute('x', x + (side === 'l' ? -(rad + 9) : rad + 9)); t.setAttribute('y', y); t.setAttribute('text-anchor', side === 'l' ? 'end' : 'start'); }
    t.textContent = label;
    g.append(halo, inner, t, mk('circle', { cx: x, cy: y, r: 20, fill: 'transparent' }));
    g.addEventListener('click', () => openCard(r));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(r); } });
    gNodes.append(g);
    nodes[id] = { g, spoke, row: r, len: 0, label: t };
  });
  Object.values(nodes).forEach((n) => { n.len = n.spoke.getTotalLength(); });

  // ── Layout: fit the 680x480 world into the free area between the HUD and the dock ──
  let scale = 1;
  function layout() {
    const W = innerWidth, H = innerHeight, narrow = W < 700, short = H < 540;
    const dockH = $('dock').offsetHeight;
    const st = $('status'), stH = short ? 0 : narrow ? 92 : 104;
    st.style.display = short ? 'none' : '';
    st.style.bottom = (dockH - 6) + 'px';
    const reply = $('reply'), loginBox = $('login');
    const panelBottom = Math.max(12, dockH + stH - 6);
    reply.style.bottom = loginBox.style.bottom = panelBottom + 'px';
    const panel = body.classList.contains('locked') ? loginBox : reply.classList.contains('show') ? reply : null;
    const topY = narrow ? 128 : short ? 40 : 64;
    let bottomY = H - dockH - stH + 4;
    if (panel) bottomY = Math.min(bottomY, H - panelBottom - panel.offsetHeight - 6);
    const aw = W, ah = Math.max(160, bottomY - topY);
    scale = Math.min(aw / (narrow ? 690 : 640), ah / 430, 2.4);
    const cx = W / 2, cy = topY + ah / 2;
    $('world').style.transform = 'translate(' + (cx - AX * scale) + 'px,' + (cy - AY * scale) + 'px) scale(' + scale + ')';
    const fs = Math.max(10.5, Math.min(13 * scale, 21)) / scale;
    web.querySelectorAll('.lbl').forEach((t) => { t.style.fontSize = fs + 'px'; });
    $('cast').style.background = 'radial-gradient(circle at 50% ' + (cy / H * 100) + '%, rgba(13,210,255,1) 0%, rgba(13,170,228,.45) ' + (130 * scale) + 'px, rgba(8,17,31,0) ' + (300 * scale) + 'px)';
  }
  addEventListener('resize', layout);
  new ResizeObserver(layout).observe($('dock'));
  new ResizeObserver(layout).observe($('reply'));
  new ResizeObserver(layout).observe($('login'));

  // ── State: idle | thinking | speaking ──
  const LABEL = { idle: 'STANDBY', thinking: 'PROCESSING', speaking: 'SPEAKING' };
  const fx = { voice: 0, voiceT: 0 };
  let lit = [];
  function setState(s, consult) {
    body.dataset.state = s;
    $('label').textContent = LABEL[s];
    $('label').setAttribute('letter-spacing', s === 'idle' ? 5.2 : 4.2);
    fx.voiceT = s === 'idle' ? 0 : s === 'thinking' ? .5 : 1;
    $('cast').style.opacity = s === 'speaking' ? .3 : s === 'thinking' ? .24 : .18;
    document.querySelectorAll('.ext').forEach((e) => e.setAttribute('opacity', s === 'idle' ? .18 : .5));
    lit.forEach((id) => { nodes[id].g.classList.remove('hot'); nodes[id].spoke.classList.remove('hot'); });
    lit = s === 'idle' ? [] : (consult || lit);
    lit.forEach((id) => { nodes[id].g.classList.add('hot'); nodes[id].spoke.classList.add('hot'); });
    if (reduced) requestAnimationFrame(frame);
  }
  // Which abilities a message "consults": simple keyword routing, Brain and Memory always.
  function consultFor(text) {
    const t = text.toLowerCase(), ids = ['brain', 'memory'];
    const rules = [['captions', /کپشن|هشتگ|caption/], ['content', /محتوا|پست|ریلز|استوری|اینستا/], ['planner', /برنامه|کار|چک|لیست|امروز|فردا/],
      ['viking', /وایکینگ|تور|آفرود|مشتری|viking/], ['translate', /ترجمه|انگلیسی|translate/], ['editor', /روان|متن|غلط|املا|کلمه/],
      ['photolab', /ریتوش|رتوش|ادیت|ویرایش(?:\s*عکس)?|پس\s*زمینه|بک\s*گراند|بازسازی|کیفیت عکس|وضوح|حذف کن|retouch|upscale|restore|background|edit/],
      ['research', /تحلیل|بازار|رقبا|بررسی|مقایسه|چیست|چرا/], ['search', /خبر|امروز|الان|قیمت|هوا|جدید|آخرین|news|latest/],
      ['vision', /عکس|تصویر|photo|image/]];
    rules.forEach(([id, re]) => { if (re.test(t)) ids.push(id); });
    if (ids.length === 2) ids.push('research');
    return ids.filter((id) => !locks.includes(id));
  }

  // ── Status bar equalizer ──
  const eq = $('eq');
  for (let i = 0; i < 28; i++) {
    const x = 125 + i * 6.1, h = 3 + Math.abs(Math.sin(i * .8)) * 22, hb = 3 + Math.abs(Math.sin(i * .6)) * 5;
    if (Math.abs(x - 210) < 24) continue;
    const r = mk('rect', { x: x, y: 40 - hb / 2, width: 3, height: hb, rx: 1.5, fill: '#f5a623', opacity: .3, class: 'bar' });
    r.dataset.h = h; r.dataset.hb = hb;
    r.style.animationDuration = (.55 + (i % 5) * .16) + 's'; r.style.animationDelay = ((i % 7) * .07) + 's';
    eq.append(r);
  }
  function eqLevel(on) {
    eq.querySelectorAll('rect').forEach((r) => { const h = on ? +r.dataset.h : +r.dataset.hb; r.setAttribute('height', h); r.setAttribute('y', 40 - h / 2); r.setAttribute('opacity', on ? .85 : .3); });
  }

  // ── Clock + weather ──
  function tick() {
    const d = new Date();
    $('time').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('date').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  tick(); setInterval(tick, 30000);
  const WCODE = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Snow', 80: 'Showers', 81: 'Showers', 82: 'Showers', 95: 'Storm', 96: 'Storm', 99: 'Storm' };
  async function loadWeather() {
    if (!key) { $('city').textContent = 'HERMES · LOCKED'; return; }
    try {
      const w = await api('/api/weather');
      $('temp').textContent = w.temp == null ? '-' : Math.round(w.temp) + '°C';
      $('city').textContent = (w.city || '') + (w.code != null && WCODE[w.code] ? ' · ' + WCODE[w.code] : '');
    } catch {}
  }

  const ov = $('overview');
  const toggleLamp = () => { ov.classList.toggle('open'); $('lamp').setAttribute('aria-expanded', ov.classList.contains('open')); };
  $('lamp').addEventListener('click', toggleLamp);
  $('lamp').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLamp(); } });

  // ── Wave shader (WebGL), half resolution ──
  const bg = $('bg');
  const gl = bg.getContext('webgl', { antialias: false });
  let drawBg = null;
  if (gl) {
    const FS = [
      'precision mediump float;',
      'uniform vec2 R; uniform float F; uniform float V;',
      'float rnd(float t){ return (cos(t) + cos(t*1.3+1.3) + cos(t*1.4+1.4)) / 3.0; }',
      'float py(float x, float hf, float off, float amp){ return rnd(x*0.14 + F*0.11) * hf * amp + off; }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / R;',
      '  vec2 sp = (gl_FragCoord.xy - R*0.5) / R.x * 10.0;',
      '  float hf = 1.0 - (cos(uv.x*6.28)*0.5 + 0.5);',
      '  float vf = 1.0 - (cos(uv.y*6.28)*0.5 + 0.5);',
      '  sp.y += rnd(sp.x*0.4 + F*0.033) * 1.6 * (0.5 + hf);',
      '  sp.x += rnd(sp.y*0.4 + F*0.033 + 2.0) * 1.6 * hf;',
      '  float amp = 0.65 * (1.0 + V*2.8);',
      '  vec4 lines = vec4(0.0);',
      '  for (int l = 0; l < 10; l++) {',
      '    float n = float(l) / 10.0;',
      '    float op = float(l) + sp.x*0.45;',
      '    float r = rnd(op + F*0.121) * 0.5 + 0.5;',
      '    float hw = mix(0.025, 0.32, r*hf) / 2.0;',
      '    float off = rnd(op + F*0.121*(1.0+n)) * mix(0.7, 2.4, hf);',
      '    float lp = py(sp.x, hf, off, amp);',
      '    float ln = smoothstep(hw, 0.0, abs(lp - sp.y)) / 2.0 + smoothstep(hw*0.15 + 0.015, hw*0.15, abs(lp - sp.y));',
      '    float cx = mod(float(l) + F*0.11, 25.0) - 12.0;',
      '    ln += smoothstep(0.025, 0.01, length(vec2(cx, py(cx, hf, off, amp)) - sp)) * 4.0;',
      '    lines += ln * mix(vec4(0.03,0.28,0.38,1.0), vec4(0.06,0.45,0.55,1.0), uv.y*0.4 + n*0.3) * r;',
      '  }',
      '  gl_FragColor = vec4(0.0,0.0,0.0,1.0) + lines * (1.0 + V*2.2) * (vf*0.92 + 0.08);',
      '}',
    ].join('\n');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (vs && fs) {
      const pg = gl.createProgram(); gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
      if (gl.getProgramParameter(pg, gl.LINK_STATUS)) {
        gl.useProgram(pg);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const uR = gl.getUniformLocation(pg, 'R'), uF = gl.getUniformLocation(pg, 'F'), uV = gl.getUniformLocation(pg, 'V');
        let flow = 30;
        drawBg = (dt) => {
          const w = Math.round(bg.clientWidth * .5), h = Math.round(bg.clientHeight * .5);
          if (bg.width !== w || bg.height !== h) { bg.width = w; bg.height = h; gl.viewport(0, 0, w, h); }
          flow += dt * (1 + fx.voice * 2.4);
          gl.uniform2f(uR, w, h); gl.uniform1f(uF, flow); gl.uniform1f(uV, fx.voice);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
      }
    }
  }

  // ── Particle core (canvas 2D, additive glow) ──
  const core = $('core'), ctx = core.getContext('2d');
  const N = 900, P = [];
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    P.push({ x: s * Math.cos(a), y: u, z: s * Math.sin(a), ph: Math.random() * 6.28, k: .6 + Math.random() * 1.6, d: Math.pow(Math.random(), .4) });
  }
  const cs = { boil: .05, size: 1, spin: .2, rot: 0, spread: 0 };
  function drawCore(t, dt) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const px = Math.max(64, Math.round(204 * scale * dpr));
    if (core.width !== px) { core.width = core.height = px; }
    const st = body.dataset.state;
    const talk = st === 'speaking' ? .5 + .5 * Math.sin(t * 11) * Math.sin(t * 3.7) : 0;
    const e = reduced ? 1 : Math.min(dt * 4, 1);
    cs.boil += ((st === 'thinking' ? .22 : st === 'speaking' ? .12 : .06) - cs.boil) * e;
    cs.spin += ((st === 'thinking' ? 1.3 : st === 'speaking' ? .5 : .2) - cs.spin) * e;
    cs.spread += ((st === 'speaking' ? 1 : 0) - cs.spread) * e;
    cs.size += (((st === 'thinking' ? 1.12 : 1) + talk * .1 + cs.spread * .25) - cs.size) * (reduced ? 1 : Math.min(dt * 8, 1));
    cs.rot += dt * cs.spin;
    const c = px / 2, R = px * .2 * cs.size;
    ctx.clearRect(0, 0, px, px);
    const halo = ctx.createRadialGradient(c, c, 0, c, c, R * 1.7);
    halo.addColorStop(0, 'rgba(0,229,255,' + (.16 + fx.voice * .1) + ')'); halo.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, px, px);
    const co = Math.cos(cs.rot), si = Math.sin(cs.rot), ct = Math.cos(.3), stl = Math.sin(.3);
    const dot = Math.max(1, 1.5 * dpr * Math.min(scale, 1.6));
    for (let i = 0; i < N; i++) {
      const p = P[i];
      const rr = p.d * (1 + Math.sin(t * p.k * 2.2 + p.ph) * cs.boil);
      const x = p.x * co - p.z * si, z0 = p.x * si + p.z * co;
      const y = p.y * ct - z0 * stl, z = p.y * stl + z0 * ct;
      const persp = 1 / (1.8 - z * .5);
      const sx = c + x * rr * R * persp * 1.8, sy = c + y * rr * R * persp * 1.8;
      const a = Math.max(.15, Math.min(1, .45 + z * .45));
      ctx.fillStyle = z > .35 && p.d < .5 ? 'rgba(200,247,255,' + a + ')' : 'rgba(0,214,240,' + (a * .85) + ')';
      ctx.fillRect(sx - dot / 2, sy - dot / 2, dot, dot);
    }
  }

  // ── Motes flowing along the spokes ──
  const motes = [];
  let spawnAcc = 0;
  function spawnMote(id, hot) {
    const n = nodes[id];
    const el = mk('circle', { r: hot ? 1.5 : .9, fill: hot ? '#bff6ff' : '#5fe0f2', filter: 'url(#rw-glow)' });
    gMotes.append(el); motes.push({ el, n, t0: performance.now(), dur: hot ? 900 + Math.random() * 500 : 2600 + Math.random() * 1600, back: !hot && Math.random() < .5 });
  }
  function stepMotes(now, dt) {
    const st = body.dataset.state;
    const rate = st === 'thinking' ? 14 : st === 'speaking' ? 7 : 1.2;
    spawnAcc += dt * rate;
    while (spawnAcc > 1) {
      spawnAcc -= 1;
      if (lit.length && st !== 'idle') spawnMote(lit[Math.floor(Math.random() * lit.length)], true);
      else { const live = ROSTER.filter((r) => r[5]); spawnMote(live[Math.floor(Math.random() * live.length)][0], false); }
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i], k = (now - m.t0) / m.dur;
      if (k >= 1) { m.el.remove(); motes.splice(i, 1); continue; }
      const p = m.n.spoke.getPointAtLength(m.n.len * (m.back ? 1 - k : k));
      m.el.setAttribute('cx', p.x); m.el.setAttribute('cy', p.y);
      m.el.setAttribute('opacity', Math.sin(k * Math.PI));
    }
  }

  let last = performance.now(), raf = 0;
  function frame(now) {
    now = now || performance.now();
    const dt = Math.min((now - last) / 1000, .05); last = now;
    fx.voice = reduced ? fx.voiceT : fx.voice + (fx.voiceT - fx.voice) * Math.min(dt * (fx.voiceT > fx.voice ? 3 : 1), 1);
    if (drawBg) drawBg(dt);
    drawCore(now / 1000, dt);
    if (!reduced) stepMotes(now, dt);
    raf = reduced ? 0 : requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // Tap the core: cycle the states for a few seconds, like a pulse check.
  let surge = 0;
  function poke() {
    if (busy) return;
    clearTimeout(surge);
    const next = body.dataset.state === 'idle' ? 'thinking' : body.dataset.state === 'thinking' ? 'speaking' : 'idle';
    setState(next, ['brain', 'memory', 'edge']); eqLevel(next !== 'idle');
    surge = setTimeout(() => { if (!busy) { setState('idle'); eqLevel(false); } }, 6000);
  }
  $('orb').addEventListener('click', poke);
  $('orb').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); } });

  // ── Agent card ──
  const card = $('card');
  function openCard(r) {
    const [id, label, kind, , , , , , role, status0, caps, asks0] = r;
    const isLocked = locks.includes(id), status = isLocked ? 'locked' : status0, asks = isLocked ? [] : asks0;
    const c = isLocked ? '#ff6b6b' : COL[kind], s = STATUS[status];
    card.style.border = '1px solid ' + c + '44';
    card.style.boxShadow = '0 0 40px ' + c + '18, 0 8px 32px rgba(0,0,0,.6)';
    card.innerHTML = '';
    const head = document.createElement('div'); head.className = 'chead';
    head.style.borderBottom = '1px solid ' + c + '22'; head.style.background = 'linear-gradient(135deg, ' + c + '0a 0%, transparent 100%)';
    const icon = document.createElement('div'); icon.className = 'cicon'; icon.style.background = c + '14'; icon.style.border = '1px solid ' + c + '44';
    const dotI = document.createElement('i'); dotI.style.background = c; dotI.style.boxShadow = '0 0 10px ' + c; icon.append(dotI);
    const names = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'cname'; nm.style.color = c; nm.textContent = label.toUpperCase();
    const rl = document.createElement('div'); rl.className = 'crole'; rl.textContent = role;
    names.append(nm, rl);
    const x = document.createElement('button'); x.className = 'cx'; x.textContent = '×'; x.setAttribute('aria-label', 'Close'); x.onclick = closeCard;
    head.append(icon, names, x);
    const bodyEl = document.createElement('div'); bodyEl.className = 'cbody';
    const sec = (title) => { const d = document.createElement('div'); const t = document.createElement('div'); t.className = 'ctitle'; t.style.color = c + '99'; t.textContent = title; d.append(t); bodyEl.append(d); return d; };
    const capBox = document.createElement('div'); capBox.className = 'caps';
    caps.forEach((txt) => { const d = document.createElement('div'); d.textContent = txt; d.style.color = 'rgba(255,255,255,.62)'; capBox.append(d); });
    sec('WHAT IT HANDLES').append(capBox);
    if (asks.length && key) {
      const box = document.createElement('div'); box.className = 'asks';
      asks.forEach((a) => {
        const b = document.createElement('button'); b.className = 'ask'; b.textContent = a.trim() + (a.endsWith(': ') ? '…' : '');
        b.style.border = '1px solid ' + c + '2a'; b.style.color = c + 'cc'; b.style.background = c + '0d';
        b.onclick = () => { closeCard(); input.value = a; resize(); if (a.endsWith(': ')) input.focus(); else submit(); };
        box.append(b);
      });
      sec('TRY IT').append(box);
    }
    const stl = document.createElement('div'); stl.className = 'cstat'; stl.style.borderTop = '1px solid ' + c + '1a';
    const si = document.createElement('i'); si.style.background = s[0]; si.style.boxShadow = '0 0 8px ' + s[0];
    stl.append(si, document.createTextNode(s[1])); bodyEl.append(stl);
    card.append(head, bodyEl); card.classList.add('show');
    x.focus();
  }
  function closeCard() { card.classList.remove('show'); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCard(); $('log').classList.remove('show'); } });

  // ── Chat ──
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BT = String.fromCharCode(96), FENCE = BT + BT + BT;
  const reFence = new RegExp(FENCE + '[\\w-]*\\n?([\\s\\S]*?)' + FENCE, 'g');
  const reCode = new RegExp(BT + '([^' + BT + '\\n]+)' + BT, 'g');
  function md(src) {
    const blocks = [];
    let s = esc(src).replace(reFence, (_, code) => { blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
    s = s.replace(reCode, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
         .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  }
  const hhmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const reply = $('reply'), rbody = $('rbody');
  let replyText = '';
  function showReply(mode, text, time) {
    reply.classList.add('show'); reply.classList.toggle('err', mode === 'error');
    $('rname').textContent = mode === 'error' ? 'ERROR' : mode === 'thinking' ? 'PROCESSING' : 'HERMES';
    $('rtime').textContent = time || '';
    $('rcopy').style.display = mode === 'reply' ? '' : 'none';
    if (mode === 'thinking') rbody.innerHTML = '<div class="scan"></div><div class="scan"></div>';
    else if (mode === 'error') rbody.textContent = text;
    else rbody.innerHTML = md(text || '');
    replyText = text || '';
    layout();
  }
  $('rclose').onclick = () => { reply.classList.remove('show'); layout(); };
  $('rcopy').onclick = async () => { try { await navigator.clipboard.writeText(replyText); $('rcopy').textContent = 'COPIED ✓'; setTimeout(() => { $('rcopy').textContent = 'COPY'; }, 1500); } catch {} };

  function reveal(text) {
    return new Promise((done) => {
      if (reduced || text.length < 2) { rbody.innerHTML = md(text); return done(); }
      let i = 0;
      const step = Math.max(2, Math.ceil(text.length / 110));
      const go = () => {
        i = Math.min(text.length, i + step);
        let part = text.slice(0, i);
        if ((part.split('**').length - 1) % 2) part = part.slice(0, part.lastIndexOf('**')) + part.slice(part.lastIndexOf('**') + 2);
        rbody.innerHTML = md(part) + (i < text.length ? '<span class="caret"></span>' : '');
        rbody.scrollTop = rbody.scrollHeight;
        if (i < text.length) setTimeout(go, 16); else done();
      };
      go();
    });
  }

  // A generated image with a save link (long-press also works on iPhone). A variations take also
  // carries a button that asks the studio to refine that exact version.
  function picture(src, pick) {
    const box = document.createElement('div'); box.className = 'picbox';
    const a = document.createElement('a'); a.className = 'pic'; a.href = src; a.download = 'hermes-' + Date.now() + '.jpg';
    const img = document.createElement('img'); img.src = src; img.alt = pick ? 'نسخهٔ ' + pick.take : 'generated image';
    const s = document.createElement('span'); s.textContent = 'SAVE ↓';
    a.append(img, s);
    box.append(a);
    if (pick) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pick';
      b.textContent = 'همین را انتخاب کن' + (pick.label ? ' (' + pick.label + ')' : '');
      b.onclick = () => pickThis(pick.take, b);
      box.append(b);
    }
    return box;
  }

  // ── The text layer: a real font on a canvas, exactly what the server planned ──
  // The server sends lines, geometry and style (displayList); this draws them with Vazirmatn, which
  // shapes Persian properly. The user can move the words up/middle/down and save the PNG.
  function drawLayerText(g, l, position, W, H) {
    const scale = W / (l.width || W);
    const centre = l.positions[position] || l.positions.bottom;
    const top = centre - ((l.lines.length - 1) * l.lineHeight) / 2;
    g.save();
    g.textAlign = l.align || 'center';
    g.direction = l.direction || 'rtl';
    g.textBaseline = 'middle';
    g.font = (l.weight || 600) + ' ' + (l.fontSize * scale) + 'px ' + l.font;
    if (l.bar) {
      g.fillStyle = l.barFill;
      g.fillRect(0, centre - (l.barHeight * scale) / 2, W, l.barHeight * scale);
    }
    l.lines.forEach((line, i) => {
      const y = top + i * l.lineHeight * scale;
      g.lineWidth = Math.max(1, l.strokeWidth * scale);
      g.strokeStyle = l.stroke;
      g.shadowColor = l.shadow.color;
      g.shadowBlur = l.shadow.blur * scale;
      g.shadowOffsetY = l.shadow.dy * scale;
      g.strokeText(line, l.x * scale, y);
      g.shadowColor = 'transparent';
      g.fillStyle = l.fill;
      g.fillText(line, l.x * scale, y);
    });
    g.restore();
  }

  const LAYER_POSITIONS = ['top', 'middle', 'bottom'];
  const LAYER_LABEL = { top: 'بالا', middle: 'وسط', bottom: 'پایین' };

  // An editable picture: the server's layer is drawn on a canvas, with save + position buttons.
  function layeredPicture(src, layer) {
    const box = document.createElement('div'); box.className = 'picbox';
    const canvas = document.createElement('canvas');
    canvas.className = 'pic';
    const title = document.createElement('div'); title.className = 'lhint';
    title.textContent = '✍️ متن را بگذار روی عکس:';
    const tune = document.createElement('div'); tune.className = 'lhint';
    tune.textContent = 'با پیام هم می‌چرخد: «بالاتر ببر» · «کمی پایین‌تر» · «سفیدش کن» · «بدون نوار» · «متن رو بردار»';
    const note = document.createElement('div'); note.className = 'lhint';
    const bar = document.createElement('div'); bar.className = 'lrow';
    const save = document.createElement('a'); save.className = 'pick'; save.textContent = 'ذخیرهٔ عکس با متن ↓';
    let position = layer.position || 'bottom';
    const im = new Image();
    const paint = () => {
      const W = im.naturalWidth || 1024, H = im.naturalHeight || 1024;
      canvas.width = W; canvas.height = H;
      const g = canvas.getContext('2d');
      g.drawImage(im, 0, 0, W, H);
      drawLayerText(g, layer, position, W, H);
      save.href = canvas.toDataURL('image/png');
      save.download = 'hermes-text-' + Date.now() + '.png';
      note.textContent = 'متن: «' + layer.text + '» · ' + (LAYER_LABEL[position] || '');
    };
    const buttons = LAYER_POSITIONS.map((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pick small';
      b.textContent = LAYER_LABEL[p];
      b.onclick = () => { position = p; paint(); buttons.forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
      bar.append(b); return b;
    });
    bar.append(save);
    im.onload = () => { buttons[LAYER_POSITIONS.indexOf(position)]?.classList.add('on'); paint(); };
    im.onerror = () => { note.textContent = 'این عکس باز نشد.'; };
    im.src = src;
    box.append(canvas, title, tune, bar, note);
    return box;
  }

  // Ask the studio to continue the chosen take; the refined picture replaces the pick buttons.
  async function pickThis(take, btn) {
    if (busy) return;
    busy = true; btn.disabled = true; btn.textContent = 'در حال دقیق‌تر کردن…';
    setState('thinking', ['photolab']); eqLevel(true); showReply('thinking');
    try {
      const { reply: answer, image } = await api('/api/pick', { take });
      messages.push({ role: 'assistant', text: answer, image, textLayer });
      showReply('reply', '', hhmm());
      setState('speaking');
      await reveal(answer);
      if (image) { rbody.prepend(picture(image)); layout(); }
      replyText = answer;
    } catch (err) {
      showReply('error', err.message);
      btn.disabled = false; btn.textContent = 'همین را انتخاب کن';
    } finally {
      busy = false; eqLevel(false);
    }
  }
  function renderLog() {
    const lb = $('lbody'); lb.innerHTML = '';
    messages.forEach((m) => {
      const d = document.createElement('div'); d.className = 'm ' + (m.role === 'user' ? 'me' : 'bot md');
      if (m.role === 'user') d.textContent = m.text; else d.innerHTML = md(m.text);
      if (m.textLayer && m.image) d.prepend(layeredPicture(m.image, m.textLayer));
      else if (m.images && m.images.length) m.images.slice().reverse().forEach((src) => d.prepend(picture(src)));
      else if (m.image) d.prepend(picture(m.image));
      lb.append(d);
    });
    $('lcount').textContent = messages.length ? messages.length + ' MSG' : '';
    $('pill').textContent = (innerWidth < 500 ? 'Log' : 'Session log') + (messages.length ? ' · ' + messages.length : '') + ' ↗';
  }
  async function renderReminders() {
    let list = [];
    try { list = (await api('/api/reminders')).reminders || []; } catch { return; }
    const box = document.createElement('div'); box.className = 'notes';
    const head = document.createElement('div'); head.className = 'nt';
    head.textContent = 'REMINDERS · ' + list.length;
    box.append(head);
    list.forEach((r) => {
      const row = document.createElement('div'); row.className = 'n rmrow';
      const when = document.createElement('span');
      when.textContent = new Date(r.due).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const txt = document.createElement('span'); txt.className = 'rtxt'; txt.textContent = ' ' + r.text;
      const del = document.createElement('button'); del.textContent = '✕'; del.className = 'rdel';
      del.onclick = async () => { try { await api('/api/reminders/delete', { id: r.id }); row.remove(); } catch (err) { alert(err.message); } };
      row.append(when, txt, del);
      box.append(row);
    });
    if (!list.length) {
      const h = document.createElement('div'); h.className = 'hint';
      h.textContent = 'یادآوری بگذار با «یادم بنداز ساعت ۹: ...» — هم در اپ، هم در تلگرام.';
      box.append(h);
    }
    $('lbody').prepend(box);
  }
  async function renderNotes() {
    let notes = [];
    try { notes = (await api('/api/notes')).notes || []; } catch { return; }
    const box = document.createElement('div'); box.className = 'notes';
    const head = document.createElement('div'); head.className = 'nt'; head.textContent = 'LONG-TERM MEMORY · ' + notes.length;
    if (notes.length) {
      const clear = document.createElement('button'); clear.textContent = 'CLEAR';
      clear.onclick = async () => { if (!confirm('یادداشت‌های حافظه پاک شود؟')) return; try { await api('/api/notes/clear', {}); box.remove(); } catch (err) { alert(err.message); } };
      head.prepend(clear);
    }
    box.append(head);
    notes.forEach((n) => { const d = document.createElement('div'); d.className = 'n'; d.textContent = n; box.append(d); });
    if (!notes.length) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'بنویس «یادت باشه ...» تا برای همیشه به خاطر بسپارم.'; box.append(h); }
    $('lbody').prepend(box);
  }
  const openLog = () => { renderLog(); renderReminders(); renderNotes(); $('log').classList.add('show'); const lb = $('lbody'); lb.scrollTop = lb.scrollHeight; };
  $('pill').onclick = openLog; $('tLog').onclick = () => { toggleLamp(); openLog(); };
  $('lclose').onclick = () => $('log').classList.remove('show');

  async function api(path, payload) {
    const res = await fetch(path, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { store.del('hermes-key'); store.del('hermes-session'); location.reload(); throw new Error('نشست منقضی شد. دوباره وارد شو.'); }
    if (!res.ok) throw new Error(data.error || 'خطای ارتباط (' + res.status + ')');
    return data;
  }

  async function submit() {
    const photo = pendingImage;
    const text = input.value.trim() || (photo ? 'این عکس رو ببین و بگو چی توشه.' : '');
    if (!text || busy) return;
    busy = true; clearTimeout(surge); input.value = ''; setImage(null); resize();
    messages.push({ role: 'user', text, image: photo || undefined });
    setState('thinking', consultFor(text)); eqLevel(true);
    showReply('thinking');
    try {
      const { reply: answer, image, images, picks, textLayer } = await api('/api/chat', photo ? { message: text, image: photo } : { message: text });
      messages.push({ role: 'assistant', text: answer, image });
      showReply('reply', '', hhmm());
      setState('speaking');
      await reveal(answer);
      // A text layer gets the canvas tools (move up/middle/down, save the PNG).
      if (textLayer && image) { rbody.prepend(layeredPicture(image, textLayer)); layout(); }
      // An edit sends the best version; a variations turn sends the whole studio set with pick buttons.
      else if (images && images.length) {
        const labels = (picks && picks.length) ? picks : images.map((_, i) => 'نسخهٔ ' + (i + 1));
        const frag = document.createDocumentFragment();
        images.forEach((src, i) => frag.prepend(picture(src, { take: i + 1, label: labels[i] })));
        rbody.prepend(frag); layout();
      } else if (image) { rbody.prepend(picture(image)); layout(); }
      replyText = answer;
    } catch (err) {
      showReply('error', err.message);
    } finally {
      busy = false; setState('idle'); eqLevel(false); resize(); renderLog();
      if (!('ontouchstart' in window)) input.focus();
    }
  }

  function resize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; send.disabled = busy || (!input.value.trim() && !pendingImage); }

  // Photo: shrink on the device (max 1600px JPEG) before sending.
  let pendingImage = null;
  function setImage(src) {
    pendingImage = src; $('attach').classList.toggle('on', !!src);
    input.placeholder = src ? 'عکس آماده است — چه تغییری می‌خواهی؟ (ریتوش، پس‌زمینه، نور، یا «روی عکس بنویس: …»)' : 'به هرمس بگو…'; resize();
  }
  $('attach').onclick = () => { if (pendingImage) setImage(null); else $('file').click(); };
  $('file').onchange = () => {
    const f = $('file').files[0]; $('file').value = ''; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      setImage(c.toDataURL('image/jpeg', 0.85)); input.focus();
    };
    img.onerror = () => { URL.revokeObjectURL(url); showReply('error', 'این عکس باز نشد.'); };
    img.src = url;
  };

  // Voice: tap to record, tap again to send. The transcript is sent as a normal message.
  let recorder = null;
  $('mic').onclick = async () => {
    if (busy) return;
    if (recorder) { recorder.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { showReply('error', 'این مرورگر ضبط صدا را پشتیبانی نمی‌کند.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { showReply('error', 'اجازهٔ میکروفون داده نشد.'); return; }
    const parts = []; recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); $('mic').classList.remove('rec');
      const blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' }); recorder = null;
      if (!blob.size) return;
      const fr = new FileReader();
      fr.onload = async () => {
        busy = true; resize(); setState('thinking', ['brain', 'voice']); showReply('thinking');
        try {
          const { text } = await api('/api/transcribe', { audio: fr.result });
          busy = false; input.value = text; resize(); submit();
        } catch (err) { busy = false; resize(); setState('idle'); showReply('error', err.message); }
      };
      fr.readAsDataURL(blob);
    };
    recorder.start(); $('mic').classList.add('rec');
  };
  input.addEventListener('input', resize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); submit(); } });
  $('form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  $('tNew').onclick = async () => {
    if (busy || !confirm('گفتگوی جدید شروع شود؟ گفتگوی فعلی بایگانی می‌شود و یادداشت‌ها می‌مانند.')) return;
    try { await api('/api/reset', {}); messages = []; renderLog(); reply.classList.remove('show'); layout(); toggleLamp(); }
    catch (err) { showReply('error', err.message); }
  };
  $('tForget').onclick = () => { if (confirm('از حساب خارج شوی؟')) { store.del('hermes-key'); store.del('hermes-session'); location.reload(); } };
  // Owner only: team accounts (create, disable/enable, new password) — shown in the log panel.
  async function renderTeam() {
    let data;
    try { data = await api('/api/admin/accounts'); } catch (err) { alert(err.message); return; }
    const box = document.createElement('div'); box.className = 'notes';
    const head = document.createElement('div'); head.className = 'nt'; head.textContent = 'TEAM · ' + data.accounts.length;
    const add = document.createElement('button'); add.textContent = '+ NEW';
    add.onclick = async () => {
      const username = prompt('نام کاربری (انگلیسی کوچک، مثلاً sara):'); if (!username) return;
      const name = prompt('نام نمایشی:'); if (!name) return;
      const role = confirm('مدیر (admin) باشد؟ «Cancel» = عضو عادی') ? 'admin' : 'member';
      try {
        const r = (await api('/api/admin/accounts', { username, name, role })).account;
        prompt('حساب ساخته شد. این رمز فقط یک بار نشان داده می‌شود؛ خصوصی به خودش بده:', r.password);
        box.remove(); renderTeam();
      } catch (err) { alert(err.message); }
    };
    head.prepend(add); box.append(head);
    data.accounts.forEach((a) => {
      const row = document.createElement('div'); row.className = 'n rmrow';
      const txt = document.createElement('span'); txt.className = 'rtxt';
      txt.textContent = (a.disabled ? '⛔ ' : '') + a.name + ' · ' + a.username + ' · ' + a.role + (a.locks.length ? ' 🔒' + a.locks.join(',') : '');
      const reset = document.createElement('button'); reset.textContent = 'رمز'; reset.className = 'rdel';
      reset.onclick = async () => {
        if (!confirm('رمز تازه برای ' + a.name + '؟ از همهٔ دستگاه‌ها خارج می‌شود.')) return;
        try { const r = await api('/api/admin/accounts/reset', { username: a.username }); prompt('رمز جدید (یک بار نشان داده می‌شود):', r.password); }
        catch (err) { alert(err.message); }
      };
      const tog = document.createElement('button'); tog.textContent = a.disabled ? 'فعال' : 'غیرفعال'; tog.className = 'rdel';
      tog.onclick = async () => {
        if (!a.disabled && !confirm(a.name + ' غیرفعال شود؟')) return;
        try { await api('/api/admin/accounts/disable', { username: a.username, disabled: !a.disabled }); box.remove(); renderTeam(); }
        catch (err) { alert(err.message); }
      };
      row.append(txt, reset, tog); box.append(row);
    });
    $('lbody').prepend(box);
  }
  $('tTeam').onclick = () => { toggleLamp(); renderLog(); renderTeam(); $('log').classList.add('show'); };

  $('tPass').onclick = async () => {
    const old = prompt('رمز فعلی:'); if (!old) return;
    const next = prompt('رمز جدید (حداقل ۸ حرف):'); if (!next) return;
    if (prompt('رمز جدید را دوباره بنویس:') !== next) { alert('دو رمز یکی نیستند.'); return; }
    try { await api('/api/password', { old, new: next }); alert('رمز عوض شد.'); } catch (err) { alert(err.message); }
  };

  $('lform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('lgo'); btn.disabled = true; $('lerr').textContent = '';
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: $('lu').value, password: $('lp').value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) throw new Error(data.error || 'ورود ناموفق بود.');
      store.set('hermes-session', data.token);
      location.reload();
    } catch (err) { $('lerr').textContent = err.message; btn.disabled = false; }
  });
  const ROLE = { owner: 'OWNER', admin: 'ADMIN', member: 'VIKING' };
  async function loadMe() {
    try {
      me = await api('/api/me');
      const w = $('who'); w.textContent = ROLE[me.role] || '';
      const b = document.createElement('b'); b.textContent = me.role === 'owner' ? 'پوریا' : me.name; w.prepend(b);
      $('tTg').classList.toggle('hide', me.role !== 'owner');
      $('tPass').classList.toggle('hide', me.role === 'owner');
      $('tTeam').classList.toggle('hide', me.role !== 'owner');
      locks = me.locks || [];
      locks.forEach((id) => { const n = nodes[id]; if (!n) return; n.g.classList.add('locked'); n.label.textContent = n.row[1] + ' 🔒'; });
    } catch {}
  }

  if (!key) body.classList.add('locked'); else loadMe();
  layout(); setState('idle');
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => body.classList.remove('instant')));
  loadWeather(); setInterval(loadWeather, 1200000);
  if (!key) return;
  (async () => {
    try {
      const data = await api('/api/history');
      messages = data.messages || [];
      renderLog();
      const lastBot = [...messages].reverse().find((m) => m.role !== 'user');
      if (lastBot) showReply('reply', lastBot.text);
    } catch (err) { showReply('error', err.message); }
  })();
})();
</script>
</body>
</html>`;
