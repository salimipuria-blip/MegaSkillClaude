import { useEffect, useRef } from 'react';

/**
 * «سِرِشته» — 3D khatam constellation backdrop for the login screen.
 * A slow tumble of two golden 8-pointed girih stars with rising dust,
 * drawn on a plain 2D canvas in false perspective. No assets, no dependencies.
 * Purely decorative: aria-hidden, pointer-events none, honors reduced motion.
 */
export function LoginBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const TAU = Math.PI * 2;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, tick = 0, raf = 0;
    let mx = 0;

    // deterministic ornament field
    let seed = 88;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dust = Array.from({ length: 70 }, () => ({
      x: rnd(), y: rnd(), r: rnd() * 1.7 + 0.5, p: rnd() * TAU, vy: 0.00035 + rnd() * 0.0008,
    }));

    const resize = () => {
      const host = canvas.parentElement;
      W = host?.clientWidth ?? innerWidth;
      H = host?.clientHeight ?? innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize, { passive: true });
    const onMove = (e: PointerEvent) => { mx = e.clientX / innerWidth - 0.5; };
    if (matchMedia('(pointer:fine)').matches) addEventListener('pointermove', onMove, { passive: true });

    // 8-pointed girih star path (khatam)
    const star8 = (rOut: number, rIn: number, rot: number) => {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? rOut : rIn;
        const a = rot + (i * Math.PI) / 8 - Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const drawStar3D = (cx: number, cy: number, R: number, tilt: number, rot: number, alpha: number, lw: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, Math.cos(tilt) * 0.9 + 0.12);
      ctx.rotate(rot);
      // outer eight-point, inner square rotated 45°, thin girih lattice
      star8(R, R * 0.62, 0);
      ctx.strokeStyle = `rgba(176, 141, 87, ${alpha})`;
      ctx.lineWidth = lw;
      ctx.stroke();
      star8(R * 0.62, R * 0.36, TAU / 16);
      ctx.strokeStyle = `rgba(176, 141, 87, ${alpha * 0.75})`;
      ctx.lineWidth = lw * 0.75;
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8 - Math.PI / 2;
        ctx.moveTo(Math.cos(a) * R * 0.36, Math.sin(a) * R * 0.36);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      }
      ctx.strokeStyle = `rgba(176, 141, 87, ${alpha * 0.4})`;
      ctx.lineWidth = lw * 0.5;
      ctx.stroke();
      ctx.restore();
    };

    const frame = () => {
      tick++;
      const t = tick * 0.016;
      ctx.clearRect(0, 0, W, H);

      // two large khatam mandalas, counter-rotating, parallaxed by pointer
      const cx = W * 0.5 + mx * 30;
      drawStar3D(cx, H * 0.16 - 40, Math.min(W, H) * 0.52, 0.9 + Math.sin(t * 0.4) * 0.16, t * 0.05, 0.5, 1.6);
      drawStar3D(cx, H * 0.16 - 40, Math.min(W, H) * 0.34, 1.15 + Math.sin(t * 0.4 + 1) * 0.14, -t * 0.08, 0.38, 1.1);
      drawStar3D(cx - mx * 60, H * 0.86 + 60, Math.min(W, H) * 0.6, 1.05 + Math.cos(t * 0.33) * 0.15, -t * 0.04, 0.4, 1.4);

      // rising sand-gold dust
      for (const p of dust) {
        p.y -= p.vy;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        const sway = Math.sin(t * 0.9 + p.p) * 12;
        ctx.globalAlpha = 0.22 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7 + p.p));
        ctx.fillStyle = '#b08d57';
        ctx.beginPath();
        ctx.arc(p.x * W + sway, p.y * H, p.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const render = () => {
      frame();
      if (!reduced) raf = requestAnimationFrame(render);
    };
    render();
    const onVis = () => {
      if (!document.hidden && !reduced) { cancelAnimationFrame(raf); render(); }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      if (matchMedia('(pointer:fine)').matches) removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="login-backdrop" aria-hidden="true" />;
}
