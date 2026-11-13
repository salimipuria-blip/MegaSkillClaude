// BISON · THE ASCENDANT — ember-gold 3D rite over the hero.
// A slow-crowned sun ring, iron monolith shards drifting in perspective, an ember
// storm rising and cold ash falling. Self-contained; no assets, no libraries.
(() => {
  const canvas = document.getElementById('bisonAscendant');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, tick = 0, raf = 0, mx = 0, my = 0;

  let seed = 9021;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // monolith shards: deterministic pseudo-3D polyhedra (irregular wedges)
  let shards = [];
  function buildShards() {
    shards = [];
    seed = 4242;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.8;
      const R = 0.16 + rnd() * 0.24;
      shards.push({
        x: Math.cos(a) * R * 1.5,
        y: -0.05 + (rnd() - 0.5) * 0.55,
        z: Math.sin(a) * R + rnd() * 0.3,
        size: 0.045 + rnd() * 0.055,
        rot: rnd() * TAU,
        spin: (rnd() - 0.5) * 0.008,
        bob: rnd() * TAU,
      });
    }
  }
  let embers = [], ash = [], motes = [];
  function buildParticles() {
    embers = Array.from({ length: 110 }, () => ({ x: Math.random(), y: 0.45 + Math.random() * 0.6, vy: 0.0016 + Math.random() * 0.0026, sway: Math.random() * TAU, r: Math.random() * 1.9 + 0.7, p: Math.random() * TAU, hot: Math.random() }));
    ash = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random() * 0.75, vy: 0.00045 + Math.random() * 0.001, sway: Math.random() * TAU, r: Math.random() * 1.5 + 0.5, p: Math.random() * TAU }));
    motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * TAU, r: Math.random() * 1.1 + 0.4 }));
  }
  function resize() {
    const host = canvas.closest('.hero-media') || canvas.parentElement;
    W = host ? host.clientWidth : innerWidth;
    H = host ? host.clientHeight : innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildShards(); buildParticles();
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  if (matchMedia('(pointer:fine)').matches) {
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  }

  const FOV = () => Math.min(W, H) * 1.6;
  function project(x, y, z, cx, cy) {
    const f = FOV();
    const d = f + z * f * 0.9 + f * 0.55;
    const s = f / d;
    return { sx: cx + x * f * s, sy: cy + y * f * s, s };
  }

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
  }

  function drawFrame() {
    tick++;
    const t = tick * 0.016;
    ctx.clearRect(0, 0, W, H);
    const cx = W * 0.5 + mx * 46, cy = H * 0.34 + my * 26;

    // crowned sun halo — two slow tilted rings
    ctx.save();
    ctx.translate(cx, cy);
    const crownPulse = 1 + 0.03 * Math.sin(t * 0.7);
    for (const [ry, rot, alpha, width] of [[0.46, 0.16, 0.8, 2.6], [0.34, -0.3, 0.5, 1.4], [0.58, 0.4, 0.3, 1.0]]) {
      ctx.save();
      ctx.rotate(rot + t * 0.05);
      ctx.scale(1, ry);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(W, H) * 0.30 * crownPulse, 0, TAU);
      ctx.strokeStyle = `rgba(226, 183, 106, ${alpha})`;
      ctx.lineWidth = width;
      ctx.shadowColor = '#e2b76a';
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.42);
    glow.addColorStop(0, 'rgba(255, 209, 138, .5)');
    glow.addColorStop(0.35, 'rgba(198, 161, 91, .16)');
    glow.addColorStop(1, 'rgba(198, 161, 91, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // monolith shards — painter's algorithm, iron lit by gold rim
    const order = shards.map((s) => ({ s, p: project(s.x + mx * 0.05, s.y + Math.sin(t * 0.6 + s.bob) * 0.03, s.z + Math.sin(t * 0.4 + s.bob) * 0.02, cx, cy) }));
    order.sort((a, b) => b.p.s - a.p.s); // far → near
    for (const { s, p } of order) {
      const size = s.size * Math.min(W, H) * p.s;
      const rot = s.rot + t * s.spin;
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.rotate(rot);
      // wedge silhouette
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.6);
      ctx.lineTo(size * 0.72, -size * 0.2);
      ctx.lineTo(size * 0.5, size * 1.25);
      ctx.lineTo(-size * 0.6, size * 0.9);
      ctx.lineTo(-size * 0.78, -size * 0.35);
      ctx.closePath();
      const body = ctx.createLinearGradient(0, -size * 1.6, 0, size * 1.3);
      body.addColorStop(0, 'rgba(46, 40, 34, .92)');
      body.addColorStop(0.55, 'rgba(22, 19, 17, .95)');
      body.addColorStop(1, 'rgba(9, 8, 7, .96)');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = 'rgba(226, 183, 106, .85)';
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.shadowColor = '#e2b76a';
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // rim facet line
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.6);
      ctx.lineTo(size * 0.1, size * 0.4);
      ctx.strokeStyle = 'rgba(255, 231, 176, .5)';
      ctx.lineWidth = Math.max(.6, size * 0.025);
      ctx.stroke();
      ctx.restore();
    }

    // motes — dust in the light shaft
    for (const m of motes) {
      ctx.globalAlpha = 0.18 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.8 + m.p));
      ctx.fillStyle = '#f5e2b8';
      ctx.beginPath();
      ctx.arc((m.x * W + t * 6) % W, m.y * H, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // embers rising — additive
    ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      e.y -= e.vy * (1 + 0.4 * Math.sin(t + e.p));
      if (e.y < 0.18) { e.y = 1.03; e.x = Math.random(); }
      const sway = Math.sin(t * 1.6 + e.sway) * 18;
      const a = 0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + e.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = e.hot > 0.6 ? '#ffd76a' : '#f2943a';
      ctx.shadowColor = '#ff8a2a';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(e.x * W + sway, e.y * H, e.r, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // ash falling — source-over, cold and pale
    ctx.globalCompositeOperation = 'source-over';
    for (const f of ash) {
      f.y += f.vy;
      if (f.y > 1.0) { f.y = -0.05; f.x = Math.random(); }
      const sway = Math.sin(t * 1.1 + f.sway) * 26;
      ctx.globalAlpha = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2 + f.p));
      ctx.fillStyle = '#cfc6b8';
      ctx.beginPath();
      ctx.arc(f.x * W + sway, f.y * H, f.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    drawFrame();
    if (!reduced && visible) raf = requestAnimationFrame(render);
    else if (!reduced) raf = requestAnimationFrame(render);
  }
  render();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !reduced) { cancelAnimationFrame(raf); render(); }
  });
})();
