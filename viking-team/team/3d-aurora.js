// Viking Experience Command · «شب‌فروز» — a 3D twilight rally sky.
// Stars + triple aurora ribbons + low sun + four parallax mountain ridges + rising embers.
// Self-contained canvas renderer; no external assets or libraries. Respects reduced motion.
(() => {
  const canvas = document.getElementById('vikingSky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, tick = 0, raf = 0, mx = 0, my = 0;

  // deterministic seeded RNG so the ridge skyline is identical on every device
  let seed = 1873;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ridges = [];
  function buildRidges() {
    ridges.length = 0;
    seed = 1873;
    for (let layer = 0; layer < 4; layer++) {
      const n = 9 + layer * 4, amp = 0.10 + layer * 0.075, base = 0.60 + layer * 0.085;
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push({ x: i / n, y: base - (rnd() * amp + rnd() * amp * 0.6) });
      ridges.push({ pts, fill: ['#22332c', '#18241d', '#10180f', '#080e09'][layer], par: 0.010 + layer * 0.011 });
    }
  }
  let stars = [], embers = [], meteor = null;
  function buildSky() {
    stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random() * 0.52, r: Math.random() * 1.25 + 0.3, p: Math.random() * TAU, s: 0.6 + Math.random() * 0.8 }));
    embers = Array.from({ length: 60 }, () => ({ x: Math.random(), y: 0.55 + Math.random() * 0.45, vy: 0.00055 + Math.random() * 0.0009, sway: Math.random() * TAU, r: Math.random() * 1.7 + 0.6, p: Math.random() * TAU }));
    meteor = null;
  }
  function resize() {
    const hero = canvas.closest('.hero') || canvas.parentElement;
    W = hero ? hero.clientWidth : innerWidth;
    H = hero ? hero.clientHeight : 510;
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildRidges(); buildSky();
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  if (matchMedia('(pointer:fine)').matches) {
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  }

  function ridgePath(ridge, t, mxShift) {
    ctx.beginPath();
    const off = mxShift * ridge.par * 60;
    ctx.moveTo(-40, H + 40);
    ctx.lineTo(-40, H * ridge.pts[0].y + Math.sin(t * 0.13 + ridge.par * 90) * 3);
    for (let i = 0; i < ridge.pts.length; i++) {
      const p = ridge.pts[i];
      const y = H * p.y + Math.sin(t * 0.13 + i * 1.7 + ridge.par * 90) * 4;
      ctx.lineTo(p.x * (W + 120) - 60 + off, y);
    }
    ctx.lineTo(W + 40, H + 40);
    ctx.closePath();
  }

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
  }

  function drawFrame() {
    tick++;
    const t = tick * 0.016;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#070d1c');
    sky.addColorStop(0.34, '#0d1b2a');
    sky.addColorStop(0.58, '#12303a');
    sky.addColorStop(0.74, '#1d3a2f');
    sky.addColorStop(1, '#0c1510');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // low sun — the rally sun touching the ridge line
    const sunX = W * 0.62 + mx * 30, sunY = H * 0.66;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.52);
    sun.addColorStop(0, 'rgba(255,178,102,.95)');
    sun.addColorStop(0.12, 'rgba(255,140,60,.75)');
    sun.addColorStop(0.4, 'rgba(210,90,40,.22)');
    sun.addColorStop(1, 'rgba(120,50,20,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(sunX, sunY, H * 0.085, 0, TAU);
    ctx.fillStyle = '#ffd9a8'; ctx.fill();
    // stars
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(tick * 0.022 * s.s + s.p));
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * (1 + 0.15 * Math.sin(tick * 0.03 + s.p)), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // aurora ribbons — additive glow layers
    ctx.globalCompositeOperation = 'lighter';
    const ribbons = [
      { base: 0.16, amp: 34, f: 0.011, v: 0.24, thick: 44, hue: [70, 255, 170], ph: 0 },
      { base: 0.24, amp: 46, f: 0.0075, v: 0.17, thick: 62, hue: [56, 205, 255], ph: 2.1 },
      { base: 0.30, amp: 30, f: 0.0135, v: 0.31, thick: 36, hue: [166, 110, 255], ph: 4.4 },
    ];
    for (const rb of ribbons) {
      ctx.beginPath();
      const step = 16;
      for (let x = -20; x <= W + 20; x += step) {
        const y = H * rb.base + Math.sin(x * rb.f + t * rb.v * 2 + rb.ph) * rb.amp + Math.sin(x * rb.f * 2.7 - t * rb.v * 1.4 + rb.ph * 1.7) * rb.amp * 0.4 + my * 14;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let x = W + 20; x >= -20; x -= step) {
        const y = H * rb.base + Math.sin(x * rb.f + t * rb.v * 2 + rb.ph) * rb.amp + Math.sin(x * rb.f * 2.7 - t * rb.v * 1.4 + rb.ph * 1.7) * rb.amp * 0.4 + my * 14;
        ctx.lineTo(x, y + rb.thick * (1 + 0.35 * Math.sin(x * 0.02 + t)));
      }
      ctx.closePath();
      const [r, g, b] = rb.hue;
      const grad = ctx.createLinearGradient(0, H * rb.base - rb.amp, 0, H * rb.base + rb.thick + rb.amp);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.42, `rgba(${r},${g},${b},.34)`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},.5)`);
      grad.addColorStop(0.75, `rgba(${r},${g},${b},.18)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // meteor, rare
    if (!reduced && (meteor || Math.random() < 0.008)) {
      if (!meteor) meteor = { x: W * (0.35 + Math.random() * 0.55), y: H * (0.05 + Math.random() * 0.14), vx: -(6.5 + Math.random() * 4), vy: 3 + Math.random() * 2, life: 1 };
      ctx.globalAlpha = meteor.life;
      const grad = ctx.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * 9, meteor.y - meteor.vy * 9);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, 'rgba(160,220,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(meteor.x, meteor.y); ctx.lineTo(meteor.x - meteor.vx * 9, meteor.y - meteor.vy * 9); ctx.stroke();
      ctx.globalAlpha = 1;
      meteor.x += meteor.vx; meteor.y += meteor.vy; meteor.life -= 0.022;
      if (meteor.life <= 0) meteor = null;
    }
    // ridges back → front
    for (const ridge of ridges) {
      ridgePath(ridge, t, mx * 1000);
      ctx.fillStyle = ridge.fill;
      ctx.fill();
    }
    // rising embers — campfire at the trailhead
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      e.y -= e.vy;
      if (e.y < 0.3) { e.y = 1.02; e.x = Math.random(); }
      const sway = Math.sin(tick * 0.02 + e.sway) * 14;
      ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(tick * 0.05 + e.p));
      ctx.fillStyle = '#ffb056';
      ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(e.x * W + sway, e.y * H, e.r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function render() {
    drawFrame();
    if (!reduced && visible) raf = requestAnimationFrame(render);
    else if (!reduced && !visible) raf = requestAnimationFrame(render);
  }
  render();
  addEventListener('pointermove', () => { if (reduced) render(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !reduced) { cancelAnimationFrame(raf); render(); }
  });
})();
