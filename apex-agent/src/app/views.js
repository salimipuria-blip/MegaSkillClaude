// Evolution, memory and settings views.

import { evolveOnce, runSuite } from '../core/evolution.js';
import { runInSandbox } from '../core/sandbox.js';
import { runSelfTests, CASES } from '../core/selftest.js';
import { PROVIDERS, getProvider } from '../core/providers.js';
import { compressContext } from '../core/compress.js';
import { estimateTokens, formatTokens } from '../core/tokens.js';
import { validateGenome, diffGenomes } from '../core/genome.js';
import { memoryToMarkdown } from '../core/memory.js';
import { auditReport, loadSelfSource } from './self.js';
import { buildExport, applyBundle, download, parseImport, storageInfo } from './state.js';
import { $, $$, esc, h, faNum, pct, timeAgo, toast, testBrain, askConfirm } from './ui.js';

const GENE_LABELS = {
  temperature: ['دما', (v) => Number(v).toFixed(2)],
  maxSteps: ['سقف گام', (v) => faNum(v)],
  contextBudget: ['بودجهٔ کانتکست', (v) => formatTokens(v)],
  keepRecent: ['پیام‌های تازه', (v) => faNum(v)],
  probeDepth: ['عمق پروب', (v) => faNum(v)],
  retryOnFail: ['تلاش ترمیم', (v) => faNum(v)],
  compression: ['شدت فشرده‌سازی', (v) => pct(v)],
  maxTokens: ['سقف خروجی', (v) => faNum(v)],
};

// ------------------------------------------------------------------ evolve

export function mountEvolve(app) {
  const dom = {
    genes: $('#genes'),
    sub: $('#genomeSub'),
    fitness: $('#genomeFitness'),
    chart: $('#fitnessChart'),
    parts: $('#fitnessParts'),
    mutants: $('#mutants'),
    mutantsSub: $('#mutantsSub'),
    bench: $('#benchTable'),
    benchSub: $('#benchSub'),
    log: $('#evoLog'),
    badge: $('#fitnessBadge'),
    evolve: $('#btnEvolve'),
    infinite: $('#btnInfinite'),
    rollback: $('#btnRollback'),
  };

  let busy = false;
  let stopRequested = false;

  function renderGenome() {
    const g = validateGenome(app.genome);
    dom.sub.textContent = `نسل ${faNum(g.generation)} · ${g.id} · ${faNum(g.fragments.length)} قطعهٔ پرامپت`;
    dom.fitness.textContent = g.fitness ? `${Number(g.fitness.score).toFixed(3)}` : 'بدون سنجش';
    dom.fitness.className = `badge ${g.fitness ? 'ok' : ''}`;
    dom.genes.innerHTML = Object.entries(GENE_LABELS)
      .map(([key, [label, fmt]]) => {
        const value = g.genes[key];
        const ratio = key === 'contextBudget' ? Math.min(1, value / 64000) : key === 'maxTokens' ? Math.min(1, value / 8000) : key === 'maxSteps' ? value / 24 : key === 'keepRecent' ? value / 20 : key === 'probeDepth' ? value / 4 : key === 'retryOnFail' ? value / 3 : key === 'temperature' ? value / 1.2 : value;
        return h`<div class="gene"><span>${label}</span><b>${fmt(value)}</b><i style="--v:${Math.round(ratio * 100)}%"></i></div>`;
      })
      .join('');
    dom.rollback.disabled = !app.state.previousChampion;
  }

  function renderChart() {
    const points = app.state.lineage || [];
    const width = 480;
    const height = 180;
    const pad = { l: 30, r: 10, t: 14, b: 24 };
    const series = points.length ? points : [{ generation: 0, score: app.genome.fitness?.score ?? 0, accepted: false }];
    const scores = series.map((p) => Number(p.score) || 0);
    const min = Math.max(0, Math.min(...scores) - 0.03);
    const max = Math.min(1, Math.max(...scores) + 0.03);
    const span = Math.max(0.05, max - min);
    const x = (i) => pad.l + (i / Math.max(1, series.length - 1)) * (width - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - min) / span) * (height - pad.t - pad.b);
    const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Number(p.score)).toFixed(1)}`).join(' ');
    const area = `${line} L${x(series.length - 1).toFixed(1)},${height - pad.b} L${x(0).toFixed(1)},${height - pad.b} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const gy = pad.t + f * (height - pad.t - pad.b);
        const value = (max - f * span).toFixed(2);
        return `<line class="chart-grid" x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}"/><text class="chart-label" x="4" y="${gy + 3}">${value}</text>`;
      })
      .join('');
    const dots = series
      .map((p, i) => `<circle class="chart-dot ${p.accepted ? '' : 'rejected'}" cx="${x(i).toFixed(1)}" cy="${y(Number(p.score)).toFixed(1)}" r="3"/>`)
      .join('');
    dom.chart.innerHTML = `<defs><linearGradient id="fitnessFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00e5ff" stop-opacity="0.28"/><stop offset="100%" stop-color="#00e5ff" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${dots}`;
    dom.badge.textContent = points.length ? `${faNum(points.length)} نسل` : '—';
  }

  function renderFitnessParts() {
    const f = app.genome.fitness;
    if (!f) {
      dom.parts.innerHTML = '<p class="dim" style="font-size:11px">هنوز سنجیده نشده. «یک نسل تکامل» را بزن.</p>';
      return;
    }
    const rows = [
      ['بنچمارک', f.parts.benchmark],
      ['حل‌شده', f.parts.solvedRate],
      ['پایداری', f.parts.stability],
      ['کارایی توکن', f.parts.efficiency],
    ];
    dom.parts.innerHTML = rows.map(([label, value]) => h`<div><span>${label}</span><b>${Number(value).toFixed(2)}</b></div>`).join('') +
      h`<div><span>رگرسیون</span><b>${f.parts.regressionFree ? 'ندارد' : 'دارد'}</b></div>`;
  }

  function renderLog() {
    const entries = app.state.evoLog || [];
    dom.log.innerHTML = entries.length
      ? entries
          .slice(0, 40)
          .map((e) => h`<div class="evo-item"><b>${e.accepted ? 'قبول' : 'رد'}</b><span>${e.text}</span></div>`)
          .join('')
      : '<p class="dim">—</p>';
  }

  function renderBench() {
    const rows = app.state.bench || [];
    if (!rows.length) {
      dom.bench.innerHTML = '<p class="dim" style="font-size:11px">اجرا نشده.</p>';
      return;
    }
    const solved = rows.filter((r) => r.score?.solved).length;
    dom.benchSub.textContent = `${faNum(rows.length)} تسک · ${faNum(solved)} حل‌شده`;
    dom.bench.innerHTML =
      h`<div class="bench-row head"><span>تسک</span><span>امتیاز</span><span>برنده</span><span>زمان</span><span>پیشرفت</span></div>` +
      rows
        .map((r) => {
          const score = Number(r.score?.score) || 0;
          const cls = score > 0.85 ? '' : score > 0.5 ? 'mid' : 'low';
          return h`<div class="bench-row">
            <span>${r.title || r.id}</span>
            <b>${score.toFixed(2)}</b>
            <b>${r.winner?.id || '—'}</b>
            <b>${faNum(Math.round(r.ms || 0))}ms</b>
            <span class="bar"><i class="${cls}" style="width:${Math.round(score * 100)}%"></i></span>
          </div>`;
        })
        .join('');
  }

  function renderMutants(list) {
    if (!list?.length) {
      dom.mutants.innerHTML = '<p class="dim" style="font-size:11px">در حال ساخت جهش‌ها…</p>';
      return;
    }
    dom.mutantsSub.textContent = `${faNum(list.length)} جهش · هر کدام روی کل بنچمارک سنجیده می‌شود`;
    dom.mutants.innerHTML = list
      .map((m) => {
        const fit = m.fitness;
        const delta = fit ? Number(fit.score) - Number(app.genome.fitness?.score || 0) : null;
        const changes = m.mutant?.genome ? diffGenomes(app.genome, m.mutant.genome) : [];
        return h`<div class="mutant ${m.accepted ? 'accepted' : ''}">
          <div class="mutant-head"><b>${m.mutant?.label || '—'}</b>
            ${delta == null ? '<span class="dim">…</span>' : h`<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta.toFixed(3)}</span>`}
          </div>
          <p class="fine">${m.mutant?.blurb || ''}</p>
          ${changes.length ? h`<p class="fine">${changes.slice(0, 3).map((c) => `${c.key}: ${String(c.from)}→${String(c.to)}`).join(' · ')}</p>` : ''}
          ${fit ? h`<p class="fine">حل‌شده ${faNum(fit.suite?.solved ?? 0)}/${faNum(fit.suite?.total ?? 0)} · تناسب ${Number(fit.score).toFixed(3)}</p>` : ''}
        </div>`;
      })
      .join('');
  }

  async function bench() {
    if (busy) return;
    busy = true;
    dom.evolve.disabled = true;
    app.setBusy(true, 'بنچمارک');
    try {
      const run = await runSuite({ genome: app.genome, sandbox: runInSandbox });
      app.state.bench = run.results;
      renderBench();
      app.genome.fitness = app.scoreGenome(run);
      app.state.lineage = [...(app.state.lineage || []), { generation: app.genome.generation, score: app.genome.fitness.score, accepted: true, at: Date.now() }];
      renderGenome();
      renderChart();
      renderFitnessParts();
      app.save({ quiet: true });
      toast(`بنچمارک: ${faNum(run.suite.solved)}/${faNum(run.suite.total)} حل‌شده`, run.suite.solved === run.suite.total ? 'ok' : 'info');
    } catch (err) {
      toast(`بنچمارک شکست خورد: ${err.message}`, 'bad');
    } finally {
      busy = false;
      dom.evolve.disabled = false;
      app.setBusy(false);
    }
  }

  async function evolve() {
    if (busy) return { accepted: false };
    busy = true;
    stopRequested = false;
    dom.evolve.disabled = true;
    app.setBusy(true, 'تکامل');
    document.body.dataset.orb = 'evolving';
    const collected = [];
    try {
      const out = await evolveOnce({
        champion: app.genome,
        sandbox: runInSandbox,
        onPhase: (event) => {
          if (event.phase === 'mutants') {
            renderMutants(event.mutants.map((m) => ({ mutant: m })));
            collected.push(...event.mutants.map((m) => ({ mutant: m })));
          }
          if (event.phase === 'measured') {
            const row = collected.find((c) => c.mutant.id === event.mutant.id);
            if (row) {
              row.fitness = event.fitness;
              row.suite = event.suite;
            }
            renderMutants(collected);
          }
        },
      });
      if (out.accepted) {
        if (out.challengers?.length) {
          const winner = out.challengers.find((c) => c.mutant.id === out.champion.id);
          if (winner) {
            const target = collected.find((c) => c.mutant.id === winner.mutant.id);
            if (target) target.accepted = true;
          }
        }
        app.state.previousChampion = app.state.previousChampion || app.genome;
        app.state.championLineage = [...(app.state.championLineage || []), app.genome].slice(-10);
        app.genome = { ...out.champion, fitness: out.champion.fitness };
      } else {
        app.genome = { ...app.genome, fitness: out.champion.fitness || app.genome.fitness };
      }
      renderMutants(collected);
      const row = {
        at: Date.now(),
        accepted: out.accepted,
        text: out.note,
        generation: out.record?.generation,
        best: out.record?.best,
      };
      app.state.evoLog = [row, ...(app.state.evoLog || [])].slice(0, 60);
      app.state.lineage = [...(app.state.lineage || []), { generation: out.record?.generation ?? app.genome.generation, score: Number(out.record?.best ?? app.genome.fitness?.score ?? 0), accepted: out.accepted, at: Date.now() }];
      app.state.bench = out.championRun?.results || app.state.bench;
      renderGenome();
      renderChart();
      renderFitnessParts();
      renderBench();
      renderLog();
      app.save({ quiet: true });
      toast(out.note, out.accepted ? 'ok' : 'info', 5000);
      return out;
    } catch (err) {
      toast(`تکامل شکست خورد: ${err.message}`, 'bad');
      return { accepted: false, error: err.message };
    } finally {
      busy = false;
      document.body.dataset.orb = 'idle';
      dom.evolve.disabled = false;
      app.setBusy(false);
    }
  }

  async function infinite() {
    if (busy) {
      stopRequested = true;
      app.state.infinite = false;
      toast('حالت بی‌نهایت متوقف می‌شود…', 'info');
      return;
    }
    app.state.infinite = true;
    stopRequested = false;
    dom.infinite.classList.add('danger');
    dom.infinite.querySelector('span').textContent = 'توقفِ بی‌نهایت';
    const max = Math.max(1, Math.min(30, Number(app.settings.infiniteGenerations) || 12));
    let accepted = 0;
    for (let i = 0; i < max && !stopRequested; i += 1) {
      const out = await evolve();
      if (out?.accepted) accepted += 1;
      if (out?.error) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    app.state.infinite = false;
    dom.infinite.classList.remove('danger');
    dom.infinite.querySelector('span').textContent = 'حالت بی‌نهایت';
    toast(`حالت بی‌نهایت تمام شد: ${faNum(accepted)} نسل پذیرفته‌شده از ${faNum(max)}.`, accepted ? 'ok' : 'info');
  }

  function rollback() {
    const prev = app.state.previousChampion;
    if (!prev) return;
    const current = app.genome;
    app.genome = prev;
    app.state.previousChampion = null;
    app.state.evoLog = [{ at: Date.now(), accepted: false, text: `بازگشت به ${prev.id} (نسل ${faNum(prev.generation)})` }, ...(app.state.evoLog || [])];
    app.save({ quiet: true });
    renderGenome();
    renderChart();
    renderFitnessParts();
    renderLog();
    toast(`به ${prev.id} برگشتیم.`, 'ok');
    void current;
  }

  async function selfAudit() {
    if (busy) return;
    busy = true;
    app.setBusy(true, 'خودکاوی');
    try {
      const res = await loadSelfSource(app);
      const report = auditReport(res.audit);
      const row = { at: Date.now(), accepted: false, text: `خودکاوی: ${res.loaded.length} فایل خوانده شد · ${res.audit.findings.length} یافته` };
      app.state.evoLog = [row, ...(app.state.evoLog || [])].slice(0, 60);
      renderLog();
      app.workbench?.refresh();
      app.setView('workbench');
      app.chat?.message('system', report);
      app.save({ quiet: true });
      toast(`${faNum(res.loaded.length)} فایل زیر self/ بارگیری شد.`, 'ok');
    } catch (err) {
      toast(`خودکاوی نشد: ${err.message}`, 'bad');
    } finally {
      busy = false;
      app.setBusy(false);
    }
  }

  $('#btnSelfAudit').addEventListener('click', selfAudit);
  dom.evolve.addEventListener('click', evolve);
  dom.infinite.addEventListener('click', infinite);
  dom.rollback.addEventListener('click', rollback);
  $('#btnBench').addEventListener('click', bench);

  renderGenome();
  renderChart();
  renderFitnessParts();
  renderBench();
  renderLog();

  return { evolve, infinite, bench, selfAudit, renderGenome, renderBench, renderMutants, get busy() { return busy; } };
}

// ------------------------------------------------------------------ memory

export function mountMemory(app) {
  const dom = {
    laws: $('#laws'),
    lawsBadge: $('#lawsBadge'),
    notes: $('#notes'),
    notesSub: $('#notesSub'),
    journal: $('#journal'),
    noteSearch: $('#noteSearch'),
    forgeOut: $('#forgeOut'),
    forgeStats: $('#forgeStats'),
    forgeBadge: $('#forgeBadge'),
  };

  function renderLaws() {
    const laws = app.memory.laws;
    dom.lawsBadge.textContent = `${faNum(laws.length)} قانون`;
    dom.laws.innerHTML = laws
      .map((l) => h`<div class="law">${l.text}<small>${l.source || 'مالک'} · قفل‌شده</small></div>`)
      .join('');
  }

  function renderNotes() {
    const q = dom.noteSearch.value.trim();
    const notes = q ? app.memory.search(q).notes : app.memory.notes;
    dom.notesSub.textContent = `${faNum(app.memory.notes.length)} یادداشت`;
    dom.notes.innerHTML = notes.length
      ? notes
          .map(
            (n) => h`<div class="note"><span>${n.text}</span><small>${timeAgo(n.at)}</small><button data-del="${n.id}" aria-label="حذف یادداشت">✕</button></div>`,
          )
          .join('')
      : '<p class="dim" style="font-size:11px">یادداشتی نیست.</p>';
    $$('[data-del]', dom.notes).forEach((btn) =>
      btn.addEventListener('click', () => {
        app.memory.removeNote(btn.dataset.del);
        renderNotes();
        app.save({ quiet: true });
      }),
    );
  }

  function renderJournal() {
    const rows = app.memory.journal;
    dom.journal.innerHTML = rows.length
      ? rows
          .slice(0, 40)
          .map(
            (j) => h`<div class="jrow"><time>${timeAgo(j.at)}</time><span>${j.goal || j.event || '—'}</span><b>${j.ok ? '✓' : '✕'}${j.score != null ? ` ${Number(j.score).toFixed(2)}` : ''}</b></div>`,
          )
          .join('')
      : '<p class="dim">دفتر خالی است.</p>';
  }

  function forge() {
    const text = $('#forgeInput').value;
    if (!text.trim()) return toast('متنی برای فشرده‌سازی نیست.', 'info');
    const budget = Math.max(120, Math.round(estimateTokens(text) * 0.55));
    const out = compressContext({
      messages: [
        { role: 'system', content: 'قانون: هرگز بدون تست تغییر نده.', protected: true },
        { role: 'user', content: text },
      ],
      budgetTokens: budget,
      keepRecent: 0,
      query: 'هدف',
    });
    dom.forgeStats.textContent = `${faNum(out.stats.before)} → ${faNum(out.stats.after)} توکن · ${faNum(out.stats.savedPct)}٪ کمتر`;
    dom.forgeBadge.textContent = `${faNum(out.stats.kept)}/${faNum(out.stats.atoms)} واحد`;
    dom.forgeOut.textContent = out.messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n');
    toast('فشرده شد؛ عصارهٔ حذف‌شده‌ها در متن آمده است.', 'ok');
  }

  $('#btnAddLaw').addEventListener('click', () => {
    const input = $('#lawInput');
    const law = app.memory.addLaw(input.value.trim());
    if (!law) return;
    input.value = '';
    renderLaws();
    app.save({ quiet: true });
    toast('قانون ثبت شد.', 'ok');
  });
  $('#btnAddNote').addEventListener('click', () => {
    const input = $('#noteInput');
    const note = app.memory.remember(input.value.trim(), 'note');
    if (!note) return;
    input.value = '';
    renderNotes();
    app.save({ quiet: true });
  });
  $('#btnForge').addEventListener('click', forge);
  dom.noteSearch.addEventListener('input', renderNotes);
  $('#btnExportJournal').addEventListener('click', () => {
    download('metacode-memory.md', memoryToMarkdown(app.memory), 'text/markdown');
    toast('دفتر جریان صادر شد.', 'ok');
  });

  renderLaws();
  renderNotes();
  renderJournal();

  return { renderLaws, renderNotes, renderJournal };
}

// ------------------------------------------------------------------ settings

export function mountSettings(app) {
  const dom = {
    providers: $('#providers'),
    model: $('#model'),
    key: $('#apiKey'),
    base: $('#baseUrl'),
    proxy: $('#proxyToken'),
    remember: $('#rememberKey'),
    note: $('#brainNote'),
    badge: $('#brainBadge'),
    sliders: $('#sliders'),
    selfTests: $('#selfTests'),
    selfBadge: $('#selfBadge'),
    dataStats: $('#dataStats'),
  };

  const SLIDERS = [
    ['temperature', 'دما', 0, 1.2, 0.05],
    ['contextBudget', 'بودجهٔ کانتکست', 4000, 64000, 1000],
    ['maxSteps', 'سقف گام', 2, 24, 1],
    ['keepRecent', 'پیام‌های تازه', 2, 20, 1],
    ['probeDepth', 'عمق پروب', 0, 4, 1],
    ['retryOnFail', 'تلاش ترمیم', 0, 3, 1],
    ['compression', 'شدت فشرده‌سازی', 0, 1, 0.05],
    ['maxTokens', 'سقف خروجی', 256, 8000, 64],
  ];

  function renderProviders() {
    dom.providers.innerHTML = PROVIDERS.map(
      (p) => h`<button class="provider ${app.settings.providerId === p.id ? 'active' : ''}" data-provider="${p.id}">
        <b>${p.label}</b><small>${p.free ? 'رایگان' : 'پولی'}${p.browser ? ' · مرورگر' : ' · پروکسی لازم'}</small>
      </button>`,
    ).join('');
    $$('[data-provider]', dom.providers).forEach((btn) =>
      btn.addEventListener('click', () => {
        app.settings.providerId = btn.dataset.provider;
        const p = getProvider(app.settings.providerId);
        app.settings.model = p.models[0] || '';
        dom.model.value = app.settings.model;
        dom.badge.textContent = p.label;
        dom.note.textContent = p.note || `کلید از ${p.docs || 'سایت ارائه‌دهنده'} گرفته می‌شود.`;
        renderProviders();
        app.save({ quiet: true });
        app.refreshBrainPill();
      }),
    );
  }

  function renderSliders() {
    dom.sliders.innerHTML = SLIDERS.map(([key, label, min, max, step]) => {
      const value = app.genome.genes[key];
      return h`<label><span>${label}<b data-out="${key}">${value}</b></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-gene="${key}" /></label>`;
    }).join('');
    $$('[data-gene]', dom.sliders).forEach((input) =>
      input.addEventListener('input', () => {
        const key = input.dataset.gene;
        app.genome.genes[key] = Number(input.value);
        const out = $(`[data-out="${key}"]`, dom.sliders);
        if (out) out.textContent = input.value;
        app.evolve?.renderGenome?.();
        app.save({ quiet: true });
      }),
    );
  }

  function renderDataStats() {
    const info = storageInfo();
    const rows = [
      ['فایل‌های فضای کاری', faNum(app.vfs.list().length)],
      ['حجم فضای کاری', `${formatTokens(app.vfs.size)} بایت`],
      ['نسخه‌های ذخیره‌شده', faNum([...app.vfs.revisions.values()].reduce((s, r) => s + r.length, 0))],
      ['قوانین', faNum(app.memory.laws.length)],
      ['یادداشت‌ها', faNum(app.memory.notes.length)],
      ['نسل ژنوم', faNum(app.genome.generation)],
      ['حافظهٔ مرورگر', info.available ? `${formatTokens(info.bytes)} بایت` : 'ندارد'],
      ['خودآزمایی', `${faNum(CASES.length)} سنجه`],
    ];
    dom.dataStats.innerHTML = rows.map(([k, v]) => h`<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  async function selfTest() {
    dom.selfBadge.textContent = 'در حال اجرا…';
    dom.selfTests.innerHTML = '<p class="dim">اجرا…</p>';
    const out = await runSelfTests();
    dom.selfBadge.textContent = `${faNum(out.passed)}/${faNum(out.total)}`;
    dom.selfBadge.className = `badge ${out.ok ? 'ok' : 'bad'}`;
    dom.selfTests.innerHTML = out.results
      .map(
        (r) => h`<div class="st-row ${r.ok ? 'ok' : 'bad'}">
          <svg aria-hidden="true"><use href="#${r.ok ? 'i-check' : 'i-x'}"/></svg>
          <span>${r.name}${r.ok ? '' : `<br><small>${r.error || ''}</small>`}</span>
          <small>${faNum(r.ms)}ms</small>
        </div>`,
      )
      .join('');
    toast(out.ok ? `خودآزمایی سبز: ${faNum(out.total)} سنجه در ${faNum(out.ms)}ms` : `${faNum(out.failed)} سنجهٔ قرمز`, out.ok ? 'ok' : 'bad');
  }

  function fill() {
    const p = getProvider(app.settings.providerId);
    dom.model.value = app.settings.model || p.models[0] || '';
    dom.key.value = app.settings.key || '';
    dom.base.value = app.settings.baseUrl || '';
    dom.proxy.value = app.settings.proxyToken || '';
    dom.remember.checked = Boolean(app.settings.rememberKey);
    dom.badge.textContent = p.label;
    dom.note.textContent = p.note || `کلید از ${p.docs || 'سایت ارائه‌دهنده'} گرفته می‌شود.`;
    const list = $('#modelList');
    if (list) list.innerHTML = p.models.map((m) => `<option value="${esc(m)}"></option>`).join('');
    renderProviders();
    renderSliders();
    renderDataStats();
  }

  dom.model.addEventListener('change', () => {
    app.settings.model = dom.model.value.trim();
    app.save({ quiet: false });
    app.refreshBrainPill();
  });
  dom.key.addEventListener('change', () => {
    app.settings.key = dom.key.value.trim();
    app.save({ quiet: true });
    app.refreshBrainPill();
  });
  dom.base.addEventListener('change', () => {
    app.settings.baseUrl = dom.base.value.trim();
    app.save({ quiet: true });
  });
  dom.proxy.addEventListener('change', () => {
    app.settings.proxyToken = dom.proxy.value.trim();
    app.save({ quiet: true });
    app.refreshBrainPill();
  });
  dom.remember.addEventListener('change', () => {
    app.settings.rememberKey = dom.remember.checked;
    app.save({ quiet: false });
  });
  $('#btnTestBrain').addEventListener('click', async () => {
    dom.note.textContent = 'در حال تست…';
    try {
      const out = await testBrain(app.settings);
      dom.note.textContent = out.text;
      toast(out.ok ? 'اتصال برقرار است.' : out.text, out.ok ? 'ok' : 'bad', 5000);
    } catch (err) {
      dom.note.textContent = err.message;
      toast(err.message, 'bad', 6000);
    }
  });
  $('#btnSelfTest').addEventListener('click', selfTest);
  $('#btnExportAll').addEventListener('click', () => {
    const bundle = buildExport({
      files: app.vfs.exportFiles(),
      genome: app.genome,
      memory: app.memory.export(),
      settings: app.settings,
      lineage: app.state.lineage,
      bench: app.state.bench,
    });
    download(`metacode-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
    toast('همه‌چیز صادر شد (بدون کلید).', 'ok');
  });
  $('#btnImportAll').addEventListener('click', () => $('#importAllInput').click());
  $('#importAllInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = parseImport(await file.text());
      const applied = applyBundle(app, data);
      app.save({ quiet: false });
      app.rerenderAll();
      toast(`وارد شد: ${applied.length ? applied.join('، ') : 'هیچ بخشی معتبر نبود'}`, applied.length ? 'ok' : 'info');
    } catch (err) {
      toast(err.message, 'bad');
    }
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!(await askConfirm('همه‌چیز پاک شود؟ فایل‌ها، ژنوم، حافظه و کلید حذف می‌شوند.', 'پاک‌سازی'))) return;
    app.reset();
  });

  fill();

  return { fill, selfTest, renderDataStats };
}
