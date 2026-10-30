// Boot: build the app object, mount the five views, and make the whole thing feel like one machine.
//
// If anything here throws, the failure is shown on screen instead of leaving a blank page: a
// static app that fails silently in a phone browser is the worst possible outcome.

import { VirtualFS, DEFAULT_FILES } from '../core/vfs.js';
import { createMemory } from '../core/memory.js';
import { defaultGenome, validateGenome, scoreFitness } from '../core/genome.js';
import { TASKS } from '../core/evals.js';
import { chat, getProvider } from '../core/providers.js';
import { disposeSandbox } from '../core/sandbox.js';
import { mountChat, mountWorkbench, $, $$, esc, faNum, toast, setOrb } from './ui.js';
import { mountEvolve, mountMemory, mountSettings } from './views.js';
import { DEFAULT_SETTINGS, loadPersisted, persist, saveKeys, clearAll, download } from './state.js';

function fail(err) {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'position:fixed;inset:auto 12px 12px 12px;z-index:999;padding:14px 16px;border-radius:12px;border:1px solid #ff6b6b;background:#1a0d12;color:#ffd7d7;font:13px/1.7 system-ui;direction:rtl';
  box.textContent = `راه‌اندازی شکست خورد: ${err?.message || err}. کنسول مرورگر را ببین.`;
  document.body.appendChild(box);
  console.error(err);
}

function boot() {
  const { state: savedState, keys: savedKeys } = loadPersisted();
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(savedState?.settings || {}),
    key: savedKeys?.key || '',
    proxyToken: savedKeys?.proxyToken || '',
  };

  const vfs = new VirtualFS(savedState?.files || DEFAULT_FILES);
  const memory = createMemory(savedState?.memory || {});
  let genome = validateGenome(savedState?.genome || defaultGenome({ seed: 1337 }));

  const app = {
    vfs,
    memory,
    settings,
    genome,
    state: {
      view: 'chat',
      lineage: savedState?.lineage || [],
      evoLog: savedState?.evoLog || [],
      bench: savedState?.bench || [],
      previousChampion: savedState?.previousChampion || null,
      championLineage: savedState?.championLineage || [],
      lastTriad: null,
      lastDiff: savedState?.lastDiff || '',
      mode: settings.mode || 'triad',
      steps: 0,
      infinite: false,
    },
    workbench: null,
    evolve: null,
    memoryView: null,
    settingsView: null,
    chat: null,
  };

  // ---------------------------------------------------------------- plumbing
  app.save = ({ quiet = true } = {}) => {
    const result = persist({
      files: vfs.exportFiles(),
      genome: app.genome,
      memory: memory.export(),
      settings: { ...app.settings, key: undefined, proxyToken: undefined },
      lineage: app.state.lineage,
      evoLog: app.state.evoLog,
      bench: app.state.bench,
      previousChampion: app.state.previousChampion,
      championLineage: app.state.championLineage,
      lastDiff: app.state.lastDiff,
    });
    saveKeys({ key: app.settings.key, proxyToken: app.settings.proxyToken, remember: app.settings.rememberKey });
    if (result?.error && !quiet) toast(result.error, 'bad', 6000);
    return result;
  };
  app.persistNow = () => app.save({ quiet: false });

  app.refreshStatus = () => {
    $('#sbFiles').textContent = faNum(vfs.list().length);
    $('#sbSteps').textContent = faNum(app.state.steps || 0);
    const tokens = app.state.tokens || 0;
    $('#sbTokens').textContent = tokens ? faNum(tokens) : '۰';
    app.settingsView?.renderDataStats?.();
    app.evolve?.renderGenome?.();
  };

  app.pushJournal = (entry) => {
    memory.journalEntry(entry);
    app.memoryView?.renderJournal?.();
    app.save({ quiet: true });
  };

  app.refreshBrainPill = () => {
    const p = getProvider(app.settings.providerId);
    const usable =
      app.settings.providerId === 'proxy'
        ? Boolean(app.settings.proxyToken)
        : app.settings.providerId === 'ollama'
          ? true
          : Boolean(app.settings.key);
    const label = usable ? `${p.label} · ${app.settings.model || p.models[0] || '—'}` : 'Reflex · بدون کلید';
    $('#pillBrainText').textContent = label;
    $('#pillBrain').dataset.mode = usable ? 'model' : 'reflex';
    const dot = $('#pillBrain .dot');
    if (dot) dot.dataset.tone = usable ? 'ok' : 'cyan';
  };

  app.makeLLM = () => {
    const usable =
      app.settings.providerId === 'proxy'
        ? Boolean(app.settings.proxyToken)
        : app.settings.providerId === 'ollama'
          ? true
          : Boolean(app.settings.key);
    return {
      available: usable,
      async complete({ messages, system, temperature, maxTokens, tools, onDelta, signal }) {
        return chat({
          providerId: app.settings.providerId,
          model: app.settings.model,
          key: app.settings.providerId === 'proxy' ? app.settings.proxyToken : app.settings.key,
          baseUrl: app.settings.baseUrl,
          messages,
          system,
          temperature,
          maxTokens,
          tools,
          onDelta,
          signal,
        });
      },
    };
  };

  app.scoreGenome = (run) =>
    scoreFitness({
      suite: run.suite,
      tokensUsed: run.tokensUsed,
      budget: Math.max(1, TASKS.length * 500),
      regressionFree: true,
    });

  app.setBusy = (busy, label = '') => {
    const pill = $('#pillBrain');
    if (pill) pill.dataset.busy = busy ? '1' : '';
    setOrb(busy ? (label === 'تکامل' ? 'evolving' : 'thinking') : 'idle');
    if (busy) $('#sbState').textContent = label || 'مشغول';
    else $('#sbState').textContent = 'آماده';
    $('#sbDot').dataset.tone = busy ? 'gold' : 'ok';
  };

  app.reset = () => {
    clearAll();
    window.location.reload();
  };

  app.rerenderAll = () => {
    app.workbench?.refresh?.();
    app.evolve?.renderGenome?.();
    app.evolve?.renderBench?.();
    app.memoryView?.renderLaws?.();
    app.memoryView?.renderNotes?.();
    app.memoryView?.renderJournal?.();
    app.settingsView?.fill?.();
    app.refreshStatus();
    app.refreshBrainPill();
  };

  // ---------------------------------------------------------------- views
  app.chat = mountChat(app);
  app.workbench = mountWorkbench(app);
  app.evolve = mountEvolve(app);
  app.memoryView = mountMemory(app);
  app.settingsView = mountSettings(app);

  // ---------------------------------------------------------------- navigation
  function setView(name) {
    const valid = ['chat', 'workbench', 'evolve', 'memory', 'settings'];
    if (!valid.includes(name)) name = 'chat';
    app.state.view = name;
    document.body.dataset.view = name;
    $$('.view').forEach((view) => {
      view.hidden = view.id !== `view-${name}`;
    });
    $$('.tabs .tab').forEach((tab) => {
      const active = tab.dataset.view === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $$('.mobile-nav button').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
    if (window.location.hash !== `#${name}`) window.history.replaceState(null, '', `#${name}`);
    if (name === 'workbench') app.workbench.refresh();
    if (name === 'evolve') {
      app.evolve.renderGenome();
      app.evolve.renderBench();
    }
    if (name === 'memory') {
      app.memoryView.renderLaws();
      app.memoryView.renderNotes();
      app.memoryView.renderJournal();
    }
    if (name === 'settings') app.settingsView.fill();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  app.setView = setView;

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
    tab.addEventListener('keydown', (e) => {
      const tabs = $$('.tab');
      const idx = tabs.indexOf(tab);
      if (e.key === 'ArrowLeft') tabs[(idx + 1) % tabs.length].focus();
      if (e.key === 'ArrowRight') tabs[(idx - 1 + tabs.length) % tabs.length].focus();
    });
  });
  $$('.mobile-nav button').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));

  // ---------------------------------------------------------------- palette
  const actions = [
    { id: 'go-chat', label: 'گفتگو', icon: 'i-chat', hint: '1', run: () => setView('chat') },
    { id: 'go-workbench', label: 'کارگاه', icon: 'i-code', hint: '2', run: () => setView('workbench') },
    { id: 'go-evolve', label: 'تکامل', icon: 'i-dna', hint: '3', run: () => setView('evolve') },
    { id: 'go-memory', label: 'حافظه', icon: 'i-brain', hint: '4', run: () => setView('memory') },
    { id: 'go-settings', label: 'تنظیمات', icon: 'i-gear', hint: '5', run: () => setView('settings') },
    { id: 'run', label: 'اجرای هدف', icon: 'i-play', hint: '⌘↵', run: () => app.chat.runGoal() },
    { id: 'bench', label: 'اجرای بنچمارک', icon: 'i-bolt', hint: '', run: () => { setView('evolve'); app.evolve.bench(); } },
    { id: 'evolve', label: 'یک نسل تکامل', icon: 'i-dna', hint: '', run: () => { setView('evolve'); app.evolve.evolve(); } },
    { id: 'infinite', label: 'حالت بی‌نهایت', icon: 'i-refresh', hint: '', run: () => { setView('evolve'); app.evolve.infinite(); } },
    { id: 'selftest', label: 'خودآزمایی', icon: 'i-check', hint: '', run: () => { setView('settings'); app.settingsView.selfTest(); } },
    { id: 'self-audit', label: 'خودکاوی: کدِ خودِ اپ را بخوان', icon: 'i-search', hint: '', run: () => { setView('evolve'); app.evolve.selfAudit(); } },
    { id: 'zip', label: 'دریافت ZIP فضای کاری', icon: 'i-download', hint: '', run: () => app.workbench.zip() },
    { id: 'snapshot', label: 'عکس فوری از فضای کاری', icon: 'i-refresh', hint: '', run: () => { vfs.snapshot('دستی'); toast('عکس فوری ثبت شد.', 'ok'); } },
    { id: 'export', label: 'صدور همه (بدون کلید)', icon: 'i-download', hint: '', run: () => $('#btnExportAll').click() },
    { id: 'copy-diff', label: 'کپی آخرین دیف', icon: 'i-code', hint: '', run: () => $('#btnCopyDiff').click() },
  ];

  const palette = $('#palette');
  const paletteInput = $('#paletteInput');
  const paletteList = $('#paletteList');
  let paletteIndex = 0;
  let paletteItems = actions;

  function renderPalette(query = '') {
    const q = query.trim().toLowerCase();
    paletteItems = actions.filter((a) => !q || a.label.toLowerCase().includes(q) || a.id.includes(q));
    paletteIndex = 0;
    paletteList.innerHTML = paletteItems
      .map(
        (a, i) => `<button class="palette-item" id="pal-${a.id}" role="option" aria-selected="${i === 0}" data-action="${a.id}">
          <svg aria-hidden="true"><use href="#${a.icon}"/></svg><span>${esc(a.label)}</span><small>${esc(a.hint || '')}</small></button>`,
      )
      .join('') || '<p class="dim" style="padding:14px">چیزی پیدا نشد.</p>';
    paletteInput.setAttribute('aria-activedescendant', paletteItems.length ? `pal-${paletteItems[0].id}` : '');
    $$('.palette-item', paletteList).forEach((btn) =>
      btn.addEventListener('click', () => {
        const action = actions.find((a) => a.id === btn.dataset.action);
        closePalette();
        action?.run();
      }),
    );
  }

  function openPalette() {
    palette.hidden = false;
    paletteInput.setAttribute('aria-expanded', 'true');
    paletteInput.value = '';
    renderPalette('');
    setTimeout(() => paletteInput.focus(), 20);
    document.body.style.overflow = 'hidden';
  }
  function closePalette() {
    palette.hidden = true;
    paletteInput.setAttribute('aria-expanded', 'false');
    paletteInput.setAttribute('aria-activedescendant', '');
    document.body.style.overflow = '';
    $('#btnPalette')?.focus();
  }
  function movePalette(delta) {
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
    $$('.palette-item', paletteList).forEach((btn, i) => btn.setAttribute('aria-selected', String(i === paletteIndex)));
    // The list itself never takes focus; the combobox carries the selection for screen readers.
    paletteInput.setAttribute('aria-activedescendant', `pal-${paletteItems[paletteIndex].id}`);
    $$('.palette-item', paletteList)[paletteIndex]?.scrollIntoView?.({ block: 'nearest' });
  }
  $('#btnPalette').addEventListener('click', openPalette);
  paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));
  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      movePalette(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      movePalette(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const action = paletteItems[paletteIndex];
      closePalette();
      action?.run();
    } else if (e.key === 'Escape') {
      closePalette();
    }
  });
  palette.addEventListener('click', (e) => {
    if (e.target === palette) closePalette();
  });

  // ---------------------------------------------------------------- keyboard
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }
    if (e.key === 'Escape' && !palette.hidden) {
      closePalette();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      setView('chat');
      app.chat.runGoal();
      return;
    }
    if (!typing && /^[1-5]$/.test(e.key)) {
      const names = ['chat', 'workbench', 'evolve', 'memory', 'settings'];
      setView(names[Number(e.key) - 1]);
    }
    if (!typing && e.key === '?') {
      openPalette();
    }
  });

  // ---------------------------------------------------------------- ambient field + orb
  const disposers = [];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  let fieldStop = null;
  function startField() {
    const canvas = $('#field');
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let dots = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.min(46, Math.floor((w * h) / 42000)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: Math.random() * 1.4 + 0.4,
      }));
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
    let last = 0;
    function frame(t) {
      fieldStop = requestAnimationFrame(frame);
      if (t - last < 33) return;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(140, 210, 240, 0.32)';
        ctx.fill();
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < dots.length; i += 1) {
        for (let j = i + 1; j < dots.length; j += 1) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${0.05 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }
    }
    fieldStop = requestAnimationFrame(frame);
    return () => {
      if (fieldStop) cancelAnimationFrame(fieldStop);
    };
  }

  function startOrb() {
    const canvas = $('#orbCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const dpr = 2;
    void dpr;
    const particles = Array.from({ length: 90 }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      return { theta, phi, speed: 0.0015 + Math.random() * 0.003, r: Math.random() * 0.9 + 0.4 };
    });
    const ticks = $('#ticks');
    if (ticks) {
      ticks.innerHTML = Array.from({ length: 36 }, (_, i) => {
        const angle = (i / 36) * Math.PI * 2;
        const inner = i % 3 === 0 ? 26 : 29;
        const x1 = 60 + Math.cos(angle) * inner;
        const y1 = 60 + Math.sin(angle) * inner;
        const x2 = 60 + Math.cos(angle) * 33;
        const y2 = 60 + Math.sin(angle) * 33;
        return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" opacity="${i % 3 === 0 ? 0.5 : 0.22}"/>`;
      }).join('');
    }
    let t = 0;
    let frameId = null;
    function draw() {
      if (reduced) return;
      frameId = requestAnimationFrame(draw);
      t += 0.016;
      ctx.clearRect(0, 0, size, size);
      const evolving = document.body.dataset.orb === 'evolving';
      const thinking = document.body.dataset.orb === 'thinking';
      const base = evolving ? [245, 166, 35] : [0, 229, 255];
      const glow = ctx.createRadialGradient(center, center, 2, center, center, size * 0.42);
      glow.addColorStop(0, `rgba(${base.join(',')},${thinking ? 0.5 : 0.28})`);
      glow.addColorStop(0.45, `rgba(${base.join(',')},0.06)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const speedBoost = thinking ? 2.4 : evolving ? 1.7 : 1;
      for (const p of particles) {
        p.theta += p.speed * speedBoost;
        const r = size * 0.24;
        const x = center + Math.cos(p.theta) * Math.sin(p.phi) * r;
        const y = center + Math.cos(p.phi) * r * 0.92;
        const z = Math.sin(p.theta) * Math.sin(p.phi);
        ctx.beginPath();
        ctx.arc(x, y, p.r * (0.7 + (z + 1) * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${base.join(',')},${0.24 + (z + 1) * 0.22})`;
        ctx.fill();
      }
      const coreR = size * 0.06 * (1 + Math.sin(t * (thinking ? 4 : 1.6)) * 0.08);
      const core = ctx.createRadialGradient(center, center, 0, center, center, coreR * 2.6);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.35, `rgba(${base.join(',')},0.9)`);
      core.addColorStop(1, `rgba(${base.join(',')},0)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(center, center, coreR * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduced) frameId = requestAnimationFrame(draw);
    else {
      ctx.fillStyle = 'rgba(0,229,255,0.5)';
      ctx.beginPath();
      ctx.arc(center, center, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    return () => frameId && cancelAnimationFrame(frameId);
  }

  // ---------------------------------------------------------------- context meter
  function updateMeter() {
    const meter = $('#ctxMeter');
    const arc = $('#ctxArc');
    const pctLabel = $('#ctxPct');
    const budget = app.genome.genes.contextBudget;
    const guess = app.state.tokens || 0;
    const ratio = Math.min(1, guess / Math.max(1, budget));
    const circumference = 2 * Math.PI * 15;
    if (arc) arc.style.strokeDashoffset = String(circumference * (1 - ratio));
    if (pctLabel) pctLabel.textContent = `${faNum(Math.round(ratio * 100))}٪`;
    meter.classList.toggle('warn', ratio > 0.7 && ratio <= 0.88);
    meter.classList.toggle('bad', ratio > 0.88);
  }

  // ---------------------------------------------------------------- start
  setView(window.location.hash?.replace('#', '') || 'chat');
  app.refreshStatus();
  app.refreshBrainPill();
  updateMeter();
  const stopField = startField();
  const stopOrb = startOrb();
  if (stopField) disposers.push(stopField);
  if (stopOrb) disposers.push(stopOrb);
  const statusTimer = setInterval(() => {
    if (!document.hidden) {
      updateMeter();
      app.refreshStatus();
    }
  }, 8000);
  disposers.push(() => clearInterval(statusTimer));

  /** Release every handle: timers, animation frames, sandbox worker. Tests and bfcache need this. */
  app.dispose = () => {
    for (const fn of disposers) {
      try {
        fn();
      } catch {
        /* already gone */
      }
    }
    disposeSandbox();
  };

  window.addEventListener('beforeunload', () => {
    app.save({ quiet: true });
    app.dispose();
  });

  window.__apex = app;
  document.documentElement.dataset.booted = '1';
}

try {
  boot();
} catch (err) {
  fail(err);
}
