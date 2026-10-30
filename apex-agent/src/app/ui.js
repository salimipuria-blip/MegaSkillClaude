// Chat + inspector + workbench. Rendering is plain DOM, escaping is centralised in `h`.
//
// The rule this file follows: the screen may only show what the core actually produced. Nothing is
// dressed up — a red test is red, a rejected candidate is rejected, a missing key is missing.

import { createAgent } from '../core/agent.js';
import { TASKS, publicTask } from '../core/evals.js';
import { taskForPrompt } from '../core/reflex.js';
import { compressContext } from '../core/compress.js';
import { conversationTokens, estimateTokens, formatTokens } from '../core/tokens.js';
import { runInSandbox } from '../core/sandbox.js';
import { STRATEGY_META } from '../core/triad.js';
import { makeZip } from '../core/zip.js';
import { chat } from '../core/providers.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export class RawHTML extends String {
  constructor(value) {
    super(String(value ?? ''));
    this.value = String(value ?? '');
  }
  toString() {
    return this.value;
  }
}
export const raw = (value) => new RawHTML(value);

/**
 * Tagged template that escapes every interpolation unless it is wrapped in raw().
 * Used for all HTML built in this app; there is no other way in.
 */
export function h(strings, ...values) {
  let out = '';
  strings.forEach((chunk, i) => {
    out += chunk;
    if (i < values.length) {
      const v = values[i];
      if (v instanceof RawHTML) out += v.value;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof RawHTML ? x.value : esc(x))).join('');
      else if (v instanceof Node) out += v.outerHTML;
      else out += esc(v);
    }
  });
  // Returning RawHTML (a String subclass) is what makes nesting work: h`...${h`...`}...` keeps the
  // inner markup instead of showing it as text. Forgetting raw() used to leak escaped tags onto
  // the screen — the workspace file tree shipped that way once.
  return new RawHTML(out);
}

export const faDigits = (input) => String(input).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
export const faNum = (n) => (Number.isFinite(Number(n)) ? faDigits(new Intl.NumberFormat('en-US').format(Number(n))) : '—');
export const pct = (v) => `${faDigits(String(Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100)))}٪`;


// ---------------------------------------------------------------- in-app dialogs
// A sandboxed iframe (every preview pane, including this repo's) ignores prompt()/confirm():
// the call is dropped and the button quietly does nothing. These two helpers keep the same
// questions inside the page, so they work everywhere and are testable without a browser modal.
function askOverlay({ title, message, value = null, okLabel = 'تأیید' }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'ask-overlay';
    overlay.innerHTML = h`<div class="ask-card" role="dialog" aria-modal="true" aria-labelledby="askTitle">
      <h2 id="askTitle">${title}</h2>
      ${message ? h`<p class="ask-msg">${message}</p>` : ''}
      ${value !== null ? h`<input class="ask-input" aria-label="${title}" value="${value}" />` : ''}
      <div class="ask-actions">
        <button class="btn primary" data-ask="ok">${okLabel}</button>
        <button class="btn ghost" data-ask="cancel">لغو</button>
      </div>
    </div>`;
    const card = overlay.querySelector('.ask-card');
    const input = overlay.querySelector('.ask-input');
    const okButton = overlay.querySelector('[data-ask="ok"]');
    const focusables = () => [...overlay.querySelectorAll('button, input')].filter((el) => !el.disabled);

    const finish = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      // A dialog that swallows focus leaves the keyboard nowhere; hand it back where it came from.
      try {
        if (opener && document.contains(opener)) opener.focus();
      } catch {
        /* the opener may be gone */
      }
      resolve(result);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
        return;
      }
      if (event.key === 'Tab') {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const inside = card.contains(document.activeElement);
        if (event.shiftKey && (!inside || document.activeElement === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      // Confirm dialogs have no field, so Enter must answer from anywhere in the dialog.
      if (event.key === 'Enter' && !input && card.contains(document.activeElement || card)) {
        event.preventDefault();
        finish(true);
      }
    };

    okButton.addEventListener('click', () => finish(value === null ? true : input.value.trim()));
    overlay.querySelector('[data-ask="cancel"]').addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(null);
    });
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') finish(input.value.trim());
      });
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    (input || okButton).focus();
    input?.select();
  });
}

/** Ask a question in the page. Resolves true/false; never silently drops the click. */
export const askConfirm = (message, title = 'تأیید') => askOverlay({ title, message }).then((v) => v === true);

/** Ask for one line of text. Resolves the trimmed string, or null when cancelled. */
export const askText = (message, value = '', title = 'ورودی') => askOverlay({ title, message, value });

export function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - Number(ts)) / 1000;
  if (diff < 60) return 'همین حالا';
  if (diff < 3600) return `${faNum(Math.round(diff / 60))} دقیقه پیش`;
  if (diff < 86400) return `${faNum(Math.round(diff / 3600))} ساعت پیش`;
  return `${faNum(Math.round(diff / 86400))} روز پیش`;
}

export function toast(message, tone = 'info', ms = 3600) {
  const host = $('#toasts');
  if (!host) return;
  const icon = tone === 'ok' ? 'i-check' : tone === 'bad' ? 'i-warn' : 'i-bolt';
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.innerHTML = h`<svg aria-hidden="true"><use href="#${icon}"/></svg><div>${message}</div>`;
  host.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    node.style.transition = 'opacity .2s, transform .2s';
    setTimeout(() => node.remove(), 240);
  }, ms);
}

export function setOrb(state) {
  document.body.dataset.orb = state;
}

// ------------------------------------------------------------------ chat

export function mountChat(app) {
  const dom = {
    goal: $('#goal'),
    run: $('#btnRun'),
    stop: $('#btnStop'),
    transcript: $('#transcript'),
    runline: $('#runline'),
    runlineText: $('#runlineText'),
    runlineBar: $('#runlineBar'),
    triadList: $('#triadList'),
    triadSub: $('#triadSub'),
    triadBadge: $('#triadBadge'),
    selectionNote: $('#selectionNote'),
    console: $('#console'),
    verifyBadge: $('#verifyBadge'),
    ctxBefore: $('#ctxBefore'),
    ctxAfter: $('#ctxAfter'),
    ctxSaved: $('#ctxSaved'),
    ctxBadge: $('#ctxBadge'),
    budgetBar: $('#budgetBar'),
    ctxFine: $('#ctxFine'),
    sbState: $('#sbState'),
    sbSteps: $('#sbSteps'),
    sbTokens: $('#sbTokens'),
    sbDot: $('#sbDot'),
  };

  let currentAgent = null;
  let abortController = null;
  let running = false;
  let streamEl = null;

  function setRunning(value, label = 'در حال اجرا…') {
    running = value;
    dom.run.disabled = value;
    dom.stop.disabled = !value;
    dom.runline.hidden = !value;
    if (label) dom.runlineText.textContent = label;
    dom.sbState.textContent = value ? label : 'آماده';
    dom.sbDot.dataset.tone = value ? 'gold' : 'ok';
    setOrb(value ? 'thinking' : 'idle');
  }

  function progress(value) {
    dom.runlineBar.style.width = `${Math.max(4, Math.min(100, value))}%`;
  }

  function clearEmpty() {
    const empty = $('#emptyChat');
    if (empty) empty.remove();
  }

  function scroll() {
    dom.transcript.scrollTop = dom.transcript.scrollHeight;
  }

  function message(role, text) {
    clearEmpty();
    const node = document.createElement('div');
    node.className = `msg ${role}`;
    const who = role === 'user' ? 'شما' : role === 'assistant' ? 'متاکد' : 'سیستم';
    node.innerHTML = h`<span class="who">${who}</span><div class="bubble">${text}</div>`;
    dom.transcript.appendChild(node);
    scroll();
    return node.querySelector('.bubble');
  }

  function phase(text, tone = '') {
    clearEmpty();
    const node = document.createElement('span');
    node.className = `phase ${tone}`.trim();
    node.textContent = text;
    dom.transcript.appendChild(node);
    scroll();
    return node;
  }

  function steps(list) {
    clearEmpty();
    const node = document.createElement('ol');
    node.className = 'step-list';
    node.innerHTML = list.map((s, i) => h`<li><span class="k">${faNum(i + 1)}</span><span>${s}</span></li>`).join('');
    dom.transcript.appendChild(node);
    scroll();
  }

  function log(text, kind = '') {
    const el = document.createElement('div');
    el.className = `l ${kind}`.trim();
    el.innerHTML = h`<span class="t">${new Date().toLocaleTimeString('fa-IR', { hour12: false })}</span><span>${text}</span>`;
    dom.console.appendChild(el);
    dom.console.scrollTop = dom.console.scrollHeight;
  }

  function clearConsole() {
    dom.console.innerHTML = '<span class="dim">در حال اجرا…</span>';
  }

  function renderCompression(stats) {
    if (!stats) return;
    dom.ctxBefore.textContent = faNum(stats.before);
    dom.ctxAfter.textContent = faNum(stats.after);
    dom.ctxSaved.textContent = `${faNum(stats.savedPct)}٪`;
    dom.ctxBadge.textContent = stats.pressure ? 'زیر فشار' : 'آزاد';
    const ratio = stats.budget ? Math.min(1, stats.after / stats.budget) : 0;
    dom.budgetBar.style.width = `${(ratio * 100).toFixed(1)}%`;
  }

  function renderTriad(selection, scored) {
    if (!scored?.length) return;
    dom.triadList.innerHTML = scored
      .map((s) => {
        const meta = STRATEGY_META[s.strategy] || { label: s.strategy };
        const isWinner = selection?.winner?.id === s.id;
        const pub = s.tests?.public || { pass: 0, total: 0 };
        const hid = s.tests?.hidden || { pass: 0, total: 0 };
        const parts = [
          ['درستی', s.parts.correctness],
          ['کوچکی', s.parts.minimality],
          ['ایمنی', s.parts.safety],
          ['وضوح', s.parts.clarity],
          ['کارایی', s.parts.efficiency],
        ]
          .map(
            ([label, value]) => h`<div class="part ${value < 0.5 ? 'low' : ''}"><span>${label}</span><i style="--v:${Math.round(value * 100)}%"></i></div>`,
          )
          .join('');
        const hyps = (s.hypotheses || [])
          .map(
            (hy) => h`<li><span class="status ${hy.confirmed ? 'confirmed' : hy.probed ? '' : 'unprobed'}"></span><span>${hy.claim}</span></li>`,
          )
          .join('');
        return h`<article class="candidate ${isWinner ? 'winner' : ''}" data-cand="${s.id}">
          <div class="cand-head">
            <span class="cand-id">${s.id}</span>
            <div><div class="cand-title">${meta.label}</div>
              <div class="cand-sub">${s.candidate?.path || ''} · +${faNum(s.churn)} تغییر</div></div>
            <span class="cand-score">${Number(s.total).toFixed(2)}</span>
          </div>
          <p class="cand-blurb">${meta.blurb || ''}</p>
          <div class="cand-parts">${raw(parts)}</div>
          <ul class="hyp">${raw(hyps)}</ul>
          <div class="cand-foot">
            <span class="cand-tests">عمومی <b>${faNum(pub.pass)}/${faNum(pub.total)}</b>${hid.total ? ` · پنهان ${faNum(hid.pass)}/${faNum(hid.total)}` : ''}</span>
            ${isWinner ? '' : h`<button class="btn sm" data-apply="${s.id}">اعمال این</button>`}
          </div>
        </article>`;
      })
      .join('');

    dom.triadSub.textContent = selection?.winner ? `برنده: ${selection.winner.id} · ${STRATEGY_META[selection.winner.strategy]?.label || ''}` : 'بدون برنده';
    dom.triadBadge.textContent = `${faNum(scored.length)} × ${faNum(3)}`;
    dom.selectionNote.hidden = false;
    dom.selectionNote.textContent = selection?.explanation || '';

    $$('[data-apply]', dom.triadList).forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = scored.find((s) => s.id === btn.dataset.apply);
        if (target) applyCandidate(target);
      });
    });

    app.state.lastTriad = { scored, selection, at: Date.now() };
    app.save({ quiet: true });
  }

  function applyCandidate(scored) {
    try {
      app.vfs.snapshot('manual apply');
      const res = app.vfs.writeFile(scored.candidate.path, scored.candidate.content, `manual ${scored.id}`);
      message('system', `نامزد ${scored.id} دستی اعمال شد روی ${res.path} (نسخهٔ ${faNum(res.rev)}). دیف در «کارگاه» است.`);
      app.workbench?.showDiff(res.diff, res.path);
      app.workbench?.refresh();
      app.refreshStatus();
      toast(`نامزد ${scored.id} اعمال شد.`, 'ok');
      log(`applied ${scored.id} → ${res.path} (+${res.stats.added}/-${res.stats.removed})`, 'info');
    } catch (err) {
      toast(`اعمال نشد: ${err.message}`, 'bad');
    }
  }

  function handleEvent(event) {
    switch (event.type) {
      case 'start':
        message('user', app.state.pendingGoal || '—');
        phase(event.mode === 'model' ? 'حالت مدل · سه نامزد در یک فراخوانی' : 'حالت Reflex · بدون کلید', 'gold');
        progress(8);
        break;
      case 'phase':
        phase(event.text, event.ok === false ? 'bad' : event.ok ? 'ok' : '');
        log(event.text, event.ok === false ? 'fail' : event.ok ? 'pass' : 'info');
        progress(Math.min(92, 12 + (dom.transcript.childElementCount * 2) % 70));
        break;
      case 'generate':
        log(`candidate ${event.candidate.id} (${event.candidate.strategy}) → ${event.candidate.path}`, 'info');
        break;
      case 'candidate':
        log(
          `${event.candidate.id} ${event.candidate.strategy} score=${event.score.total} tests=${event.score.tests.public.pass}/${event.score.tests.public.total}`,
          event.score.tests.public.pass === event.score.tests.public.total ? 'pass' : 'fail',
        );
        (event.publicRun?.results || []).forEach((r) => log(`${event.candidate.id} ${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` → ${r.got}`}`, r.pass ? 'pass' : 'fail'));
        (event.hypotheses || [])
          .filter((hy) => hy.confirmed)
          .forEach((hy) => log(`${event.candidate.id} ${hy.id} تأیید شد: ${hy.claim}`, 'warn'));
        break;
      case 'selection':
        renderTriad(event, event.ranked);
        break;
      case 'compression':
        renderCompression(event.stats);
        app.state.tokens = event.stats.after;
        break;
      case 'usage':
        dom.sbTokens.textContent = faNum((event.in || 0) + (event.out || 0));
        break;
      case 'delta':
        if (!streamEl) streamEl = message('assistant', '');
        streamEl.textContent += event.text;
        scroll();
        break;
      case 'message':
        streamEl = null;
        message(event.role === 'assistant' ? 'assistant' : 'system', event.text);
        break;
      case 'tool':
        phase(`ابزار: ${event.name}`, 'gold');
        log(`tool ${event.name} ${JSON.stringify(event.args || {}).slice(0, 160)}`, 'info');
        break;
      case 'tool-result':
        log(`${event.name} ${event.ok ? 'ok' : 'failed'}${event.text ? ` — ${String(event.text).slice(0, 200)}` : ''}`, event.ok ? 'pass' : 'fail');
        if (event.diff) app.workbench?.showDiff(event.diff, '');
        break;
      case 'verify': {
        dom.verifyBadge.textContent = event.ok ? 'سبز' : 'قرمز';
        dom.verifyBadge.className = `badge ${event.ok ? 'ok' : 'bad'}`;
        log(event.text, event.ok ? 'pass' : 'fail');
        break;
      }
      case 'reflect':
        progress(100);
        dom.sbSteps.textContent = faNum(app.state.steps || 0);
        if (event.compression) {
          renderCompression(event.compression);
          app.state.tokens = event.compression.after;
        }
        break;
      case 'error':
        phase('خطا', 'bad');
        message('system', event.text);
        log(event.text, 'fail');
        break;
      case 'done':
        setRunning(false);
        phase(event.ok ? 'تمام · تأییدشده با اجرا' : 'تمام · بدون تأیید', event.ok ? 'ok' : 'bad');
        log(event.ok ? 'done (verified)' : `done (unverified)${event.error ? ` — ${event.error}` : ''}`, event.ok ? 'pass' : 'fail');
        app.workbench?.refresh();
        app.refreshStatus();
        app.persistNow();
        break;
      default:
        break;
    }
  }

  async function runGoal(goalArg) {
    if (running) return;
    const goal = String(goalArg ?? dom.goal.value ?? '').trim();
    if (!goal) {
      toast('هدف را بنویس.', 'info');
      dom.goal.focus();
      return;
    }
    app.state.pendingGoal = goal;
    app.state.steps = 0;
    clearEmpty();
    clearConsole();
    dom.selectionNote.hidden = true;
    dom.triadList.innerHTML = '';
    dom.verifyBadge.textContent = '—';
    dom.verifyBadge.className = 'badge';
    streamEl = null;
    setRunning(true, 'در حال برنامه‌ریزی…');

    const task = taskForPrompt(goal, TASKS);
    const llm = app.makeLLM();
    const controller = new AbortController();
    abortController = controller;
    currentAgent = createAgent({
      vfs: app.vfs,
      genome: app.genome,
      memory: app.memory,
      llm,
      sandbox: runInSandbox,
      onEvent: handleEvent,
      signal: controller.signal,
    });

    try {
      const wantsTools = app.state.mode === 'tools';
      if (wantsTools && !llm.available) {
        message('system', 'حالت ابزار به مدلِ وصل‌شده نیاز دارد. بدون کلید، حالت «شورا» با Reflex اجرا می‌شود.');
        toast('بدون کلید، حالت ابزار ممکن نیست؛ شورا اجرا می‌شود.', 'info');
      }
      const result = wantsTools && llm.available
        ? await currentAgent.toolLoop({ goal })
        : await currentAgent.run({ goal, task: task ? publicTask(task) : null });
      if (result && (result.scored || result.selection)) {
        app.state.lastRun = {
          at: Date.now(),
          goal,
          ok: Boolean(result.ok),
          winner: result.selection.winner?.id || null,
          score: result.selection.winner?.total ?? null,
        };
        app.pushJournal({ at: Date.now(), goal, ok: Boolean(result.ok), score: result.selection.winner?.total ?? null, mode: result.mode });
      }
      app.refreshStatus();
      app.workbench?.refresh();
    } catch (err) {
      setRunning(false);
      message('system', `اجرا متوقف شد: ${err.message}`);
      log(err.message, 'fail');
      toast(err.message, 'bad');
    } finally {
      currentAgent = null;
      if (running) setRunning(false);
    }
  }

  function stop() {
    if (!currentAgent) return;
    try {
      currentAgent.state.cancelled = true;
      abortController?.abort();
    } catch {
      /* nothing to abort */
    }
    setRunning(false, 'متوقف شد');
    phase('توقف به‌درخواست کاربر', 'bad');
    toast('اجرا متوقف شد.', 'info');
  }

  dom.run.addEventListener('click', () => runGoal());
  dom.stop.addEventListener('click', stop);
  dom.goal.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runGoal();
    }
  });
  $$('#presets .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      dom.goal.value = chip.dataset.goal || '';
      dom.goal.focus();
    });
  });
  $$('.mode-switch .seg').forEach((seg) => {
    seg.addEventListener('click', () => {
      $$('.mode-switch .seg').forEach((s) => s.classList.remove('active'));
      seg.classList.add('active');
      app.state.mode = seg.dataset.mode;
      const usesTools = app.state.mode === 'tools';
      dom.runlineText.textContent = usesTools ? 'حالت ابزار به مدل نیاز دارد' : 'در حال اجرا…';
      if (usesTools) toast('حالت ابزار به مدل وصل‌شده نیاز دارد؛ در تنظیمات کلید بگذار.', 'info');
      app.save({ quiet: true });
    });
  });

  return { runGoal, stop, message, phase, log, renderTriad, renderCompression, get running() { return running; } };
}

// ------------------------------------------------------------------ workbench

export function mountWorkbench(app) {
  const dom = {
    tree: $('#fileTree'),
    path: $('#editorPath'),
    meta: $('#editorMeta'),
    code: $('#code'),
    gutter: $('#gutter'),
    save: $('#btnSave'),
    revert: $('#btnRevert'),
    status: $('#editorStatus'),
    dirty: $('#editorDirty'),
    diff: $('#diffView'),
    diffSub: $('#diffSub'),
    history: $('#history'),
    filesSub: $('#filesSub'),
    search: $('#fileSearch'),
  };

  let openPath = null;
  let isDirty = false;
  let query = '';

  function renderTree() {
    const files = app.vfs.list();
    dom.filesSub.textContent = `${faNum(files.length)} فایل · ${formatTokens(app.vfs.size)} بایت`;
    const filtered = query ? files.filter((f) => f.path.toLowerCase().includes(query.toLowerCase())) : files;
    if (!filtered.length) {
      dom.tree.innerHTML = '<p class="dim" style="padding:10px 8px">فایلی نیست.</p>';
      return;
    }
    const byDir = new Map();
    for (const file of filtered) {
      const parts = file.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(file);
    }
    dom.tree.innerHTML = [...byDir.entries()]
      .map(
        ([dir, items]) => h`${dir !== '.' ? h`<div class="tree-dir">${dir}</div>` : ''}
        ${items.map(
          (f) => h`<button class="tree-file ${openPath === f.path ? 'active' : ''}" data-path="${f.path}" role="treeitem" aria-selected="${openPath === f.path}">
            <svg aria-hidden="true"><use href="#i-file"/></svg><span>${f.path.split('/').pop()}</span><small>${faNum(f.bytes)}</small>
          </button>`,
        )}`,
      )
      .join('');
    $$('.tree-file', dom.tree).forEach((btn) =>
      btn.addEventListener('click', () => {
        if (isDirty) {
          askConfirm('تغییرات ذخیره نشده‌اند. ادامه؟').then((okay) => {
            if (okay) openFile(btn.dataset.path);
          });
          return;
        }
        openFile(btn.dataset.path);
      }),
    );
  }

  function gutter() {
    const lines = dom.code.value.split('\n').length;
    dom.gutter.textContent = Array.from({ length: Math.max(1, lines) }, (_, i) => i + 1).join('\n');
    dom.gutter.scrollTop = dom.code.scrollTop;
  }

  function openFile(path) {
    const content = app.vfs.read(path);
    if (!app.vfs.has(path)) return toast('فایل پیدا نشد.', 'bad');
    openPath = path;
    dom.code.value = content;
    dom.code.disabled = false;
    dom.save.disabled = false;
    dom.revert.disabled = app.vfs.revisionsOf(path).length < 2;
    dom.path.textContent = path;
    dom.meta.textContent = `${faNum(content.length)} کاراکتر · ${faNum(app.vfs.revisionsOf(path).length)} نسخه`;
    isDirty = false;
    dom.dirty.textContent = '';
    dom.status.textContent = `≈ ${faNum(estimateTokens(content, { code: true }))} توکن`;
    gutter();
    renderTree();
    renderHistory();
    app.state.openPath = path;
  }

  function save() {
    if (!openPath) return;
    try {
      const res = app.vfs.writeFile(openPath, dom.code.value, 'edit');
      isDirty = false;
      dom.dirty.textContent = 'ذخیره شد';
      dom.meta.textContent = `${faNum(dom.code.value.length)} کاراکتر · نسخهٔ ${faNum(res.rev)}`;
      dom.revert.disabled = false;
      showDiff(res.diff, openPath);
      renderTree();
      renderHistory();
      app.refreshStatus();
      app.persistNow();
      toast(`ذخیره شد · +${faNum(res.stats.added)}/−${faNum(res.stats.removed)}`, 'ok', 1800);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function revert() {
    if (!openPath) return;
    const revs = app.vfs.revisionsOf(openPath);
    if (revs.length < 2) return;
    const previous = revs[1];
    const res = app.vfs.restore(openPath, previous.rev);
    openFile(openPath);
    toast(`بازگشت به نسخهٔ ${faNum(previous.rev)}`, 'ok');
    showDiff(res.diff || '', openPath);
    app.persistNow();
  }

  function renderHistory() {
    const entries = [];
    for (const [path, revs] of app.vfs.files) void path;
    const paths = app.vfs.list().map((f) => f.path);
    for (const path of paths) {
      for (const rev of app.vfs.revisionsOf(path).slice(0, 2)) {
        entries.push({ path, rev });
      }
    }
    entries.sort((a, b) => b.rev.ts - a.rev.ts);
    dom.history.innerHTML = entries.length
      ? entries
          .slice(0, 20)
          .map(
            (e) => h`<div class="hist-item">
              <b>${e.path.split('/').pop()} · r${faNum(e.rev.rev)}</b>
              <span>${e.rev.note || '—'} · ${timeAgo(e.rev.ts)}</span>
            </div>`,
          )
          .join('')
      : '<p class="dim" style="padding:10px">هنوز نسخه‌ای نیست.</p>';
    const snaps = app.vfs.snapshots;
    if (snaps.length) {
      dom.history.insertAdjacentHTML(
        'beforeend',
        h`<div class="tree-dir">عکس‌های فوری</div>
        ${snaps
          .slice(-6)
          .reverse()
          .map(
            (s) => h`<div class="hist-item"><b>${s.note}</b><span>${timeAgo(s.ts)} · ${faNum(Object.keys(s.files).length)} فایل</span>
            <button class="btn sm ghost" data-snap="${s.id}">بازگردانی</button></div>`,
          )}`,
      );
      $$('[data-snap]', dom.history).forEach((btn) =>
        btn.addEventListener('click', () => {
          app.vfs.restoreSnapshot(Number(btn.dataset.snap));
          refresh();
          app.persistNow();
          toast('عکس فوری بازگردانده شد.', 'ok');
        }),
      );
    }
  }

  function showDiff(patch, path = '') {
    if (!patch) return;
    dom.diffSub.textContent = path ? `${path} · دیفِ یکپارچه` : 'دیفِ یکپارچه';
    dom.diff.innerHTML = patch
      .split('\n')
      .map((line) => {
        const cls = line.startsWith('+++') || line.startsWith('---') ? 'meta' : line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
        return h`<span class="${cls}">${line || ' '}</span>`;
      })
      .join('\n');
    app.state.lastDiff = patch;
  }

  function zip() {
    const files = Object.entries(app.vfs.exportFiles()).map(([path, content]) => ({ path, content }));
    if (!files.length) return toast('فضای کاری خالی است.', 'info');
    const blob = makeZip(files);
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metacode-workspace-${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`زیپ ${faNum(files.length)} فایل ساخته شد.`, 'ok');
  }

  async function newFile() {
    const path = await askText('مسیر فایل تازه را بنویس.', 'src/util.js', 'فایل تازه');
    if (!path) return;
    if (app.vfs.has(path)) return toast('این فایل از قبل هست.', 'bad');
    app.vfs.write(path, '// فایل تازه\n', 'create');
    refresh();
    openFile(path);
    app.persistNow();
  }

  function importFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    let done = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        app.vfs.write(file.name, String(reader.result || ''), 'import');
        done += 1;
        if (done === files.length) {
          refresh();
          openFile(file.name);
          app.persistNow();
          toast(`${faNum(done)} فایل بارگذاری شد.`, 'ok');
        }
      };
      reader.readAsText(file);
    });
  }

  function refresh() {
    renderTree();
    renderHistory();
  }

  dom.code.addEventListener('input', () => {
    isDirty = true;
    dom.dirty.textContent = 'ذخیره نشده';
    gutter();
  });
  dom.code.addEventListener('scroll', () => {
    dom.gutter.scrollTop = dom.code.scrollTop;
  });
  dom.code.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: start, selectionEnd: end, value } = dom.code;
      dom.code.value = `${value.slice(0, start)}  ${value.slice(end)}`;
      dom.code.selectionStart = dom.code.selectionEnd = start + 2;
      isDirty = true;
      dom.dirty.textContent = 'ذخیره نشده';
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });
  dom.save.addEventListener('click', save);
  dom.revert.addEventListener('click', revert);
  dom.search.addEventListener('input', () => {
    query = dom.search.value;
    renderTree();
  });
  $('#btnZip').addEventListener('click', zip);
  $('#btnSnapshot').addEventListener('click', () => {
    app.vfs.snapshot('دستی');
    renderHistory();
    toast('عکس فوری ثبت شد.', 'ok');
  });
  $('#btnNewFile').addEventListener('click', newFile);
  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => importFiles(e.target.files));
  $('#btnCopyDiff').addEventListener('click', async () => {
    if (!app.state.lastDiff) return toast('دیفی نیست.', 'info');
    try {
      await navigator.clipboard.writeText(app.state.lastDiff);
      toast('دیف کپی شد.', 'ok');
    } catch {
      toast('کپی نشد؛ از انتخاب دستی استفاده کن.', 'bad');
    }
  });

  // Open a code file first: the workbench is for code, not for the notes file.
  const files = app.vfs.list();
  const first = files.find((f) => /\.(m?js|ts|json|css|html)$/.test(f.path)) || files[0];
  if (first) openFile(first.path);
  refresh();

  return { refresh, openFile, showDiff, zip, save, get path() { return openPath; } };
}

/** Context estimate for the status bar, without running the model. */
export function contextPressure(messages, budget) {
  const before = conversationTokens(messages);
  const { stats } = compressContext({ messages, budgetTokens: budget, keepRecent: 4 });
  return { before, after: stats.after, stats };
}

/** One cheap call to prove the provider works. Returns a Persian sentence. */
export async function testBrain(settings) {
  const provider = settings.providerId;
  const key = provider === 'proxy' ? settings.proxyToken : settings.key;
  if (provider !== 'ollama' && provider !== 'proxy' && !key) {
    return { ok: false, text: 'کلید خالی است. برای Reflex نیازی نیست؛ برای مدل، کلید لازم است.' };
  }
  const res = await chat({
    providerId: provider,
    model: settings.model,
    key,
    baseUrl: settings.baseUrl,
    messages: [{ role: 'user', content: 'فقط بنویس: آماده' }],
    temperature: 0,
    maxTokens: 24,
    stream: false,
    retries: 0,
  });
  return { ok: Boolean(res.text), text: res.text?.slice(0, 120) || 'پاسخ خالی بود.', usage: res.usage };
}

export { runInSandbox };
