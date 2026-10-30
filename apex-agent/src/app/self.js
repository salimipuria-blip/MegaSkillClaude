// Working on itself: the app can load its own source into the agent's workspace and audit it.
//
// Honest boundary: editing `self/*` does not hot-swap the running page. It produces a real diff you
// can review, export and redeploy — a human gate, exactly like the repository's self-improvement
// skill requires. What is real here is the reading, the measurement and the patch.

// Persian digits, locally: this module stays free of DOM imports so it can be read and tested in Node.
const faDigits = (input) => String(input).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const faNum = (n) =>
  Number.isFinite(Number(n)) ? faDigits(new Intl.NumberFormat('en-US').format(Number(n))).replace(/,/g, '٬') : '—';
const fixed = (n, digits = 2) =>
  Number.isFinite(Number(n)) ? faDigits(Number(n).toFixed(digits)).replace('.', '٫') : '—';

export const SELF_FILES = [
  'index.html',
  'assets/apex.css',
  'src/app/boot.js',
  'src/app/ui.js',
  'src/app/views.js',
  'src/app/state.js',
  'src/core/agent.js',
  'src/core/skills.js',
  'src/core/compress.js',
  'src/core/diff.js',
  'src/core/evals.js',
  'src/core/evaluate.js',
  'src/core/evolution.js',
  'src/core/genome.js',
  'src/core/memory.js',
  'src/core/providers.js',
  'src/core/reflex.js',
  'src/core/sandbox.js',
  'src/core/selftest.js',
  'src/core/tokens.js',
  'src/core/triad.js',
  'src/core/vfs.js',
  'src/core/zip.js',
];

const RISK_PATTERNS = [
  { re: /\beval\s*\(/, label: 'eval', severity: 3 },
  { re: /new\s+Function\s*\(/, label: 'new Function', severity: 2 },
  { re: /innerHTML\s*=/, label: 'innerHTML', severity: 2 },
  { re: /console\.log\(/, label: 'console.log', severity: 1 },
  { re: /\bTODO\b|\bFIXME\b/, label: 'TODO', severity: 1 },
  { re: /https?:\/\/(?!cdn\.jsdelivr|api\.|openrouter|groq|cerebras|mistral|github|together|deepseek|openai|anthropic|googleapis|ollama|localhost)/, label: 'external URL', severity: 2 },
];

const count = (text, re) => (text.match(re) || []).length;

/** Load the app's own source into the workspace under `self/`. */
export async function loadSelfSource(app, { fetchImpl = typeof fetch !== 'undefined' ? fetch : null } = {}) {
  if (!fetchImpl) throw new Error('fetch در این محیط نیست');
  const loaded = [];
  const base = new URL('.', window.location.href);
  for (const path of SELF_FILES) {
    try {
      const url = new URL(path, base).href;
      const res = await fetchImpl(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      app.vfs.write(`self/${path}`, text, 'self-audit');
      loaded.push({ path, bytes: text.length });
    } catch {
      /* a missing file is reported by omission, not by a crash */
    }
  }
  if (!loaded.length) throw new Error('هیچ فایل داخلی بارگیری نشد (شاید آفلاین هستی).');
  const snapshot = app.vfs.snapshot('self-audit');
  return { loaded, snapshot, audit: auditSelf(app.vfs, loaded.map((l) => `self/${l.path}`)) };
}

/** Measure the source: size, docs, risk patterns, largest functions, test coverage signals. */
export function auditSelf(vfs, paths) {
  const files = [];
  const findings = [];
  let totalLines = 0;
  let totalBytes = 0;
  let docLines = 0;

  for (const path of paths) {
    const text = vfs.read(path) || '';
    const lines = text.split('\n');
    const codeLines = lines.filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*|#)/.test(l));
    const comments = lines.filter((l) => /^\s*(\/\/|\*|\/\*)/.test(l)).length;
    const exports = count(text, /\bexport\s+(async\s+)?(function|const|let|class)/g);
    const functions = count(text, /\bfunction\b|=>/g);
    const longest = lines.reduce((max, l) => Math.max(max, l.length), 0);
    const risks = RISK_PATTERNS.map((r) => ({ ...r, hits: count(text, r.re) })).filter((r) => r.hits > 0);
    totalLines += lines.length;
    totalBytes += text.length;
    docLines += comments;

    files.push({
      path: path.replace(/^self\//, ''),
      lines: lines.length,
      codeLines: codeLines.length,
      comments,
      exports,
      functions,
      longest,
      risks,
    });

    if (longest > 220) {
      findings.push({
        severity: 1,
        path: path.replace(/^self\//, ''),
        text: `خطِ ${longest} کاراکتری؛ خواندن و دیف‌کردنش سخت است.`,
        action: 'رشته یا تابع را به چند خط بشکن.',
      });
    }
    const ratio = comments / Math.max(1, lines.length);
    if (ratio < 0.02 && lines.length > 120) {
      findings.push({
        severity: 1,
        path: path.replace(/^self\//, ''),
        text: `پوشش کامنت ${fixed(ratio * 100, 1)}٪ برای ${faNum(lines.length)} خط.`,
        action: 'دلیلِ تصمیم‌های غیربدیهی را یک خط بنویس، نه توضیحِ کد.',
      });
    }
    for (const risk of risks) {
      if (risk.label === 'console.log') continue;
      findings.push({
        severity: risk.severity,
        path: path.replace(/^self\//, ''),
        text: `الگوی «${risk.label}» ${risk.hits} بار.`,
        action: risk.label === 'new Function' ? 'اگر برای سندباکس است، مستند و محدود نگهش دار.' : 'بازبینی کن که لازم و امن است.',
      });
    }
  }

  // The sandbox is the only place `new Function` is legitimate; say so instead of flagging it as a bug.
  const sandboxed = files.find((f) => f.path === 'src/core/sandbox.js');
  const evalFindings = findings.filter((f) => f.text.includes('new Function'));
  for (const f of evalFindings) {
    if (sandboxed && f.path === 'src/core/sandbox.js') {
      f.severity = 0;
      f.text += ' (داخل سندباکسِ ایزوله — مورد انتظار)';
    }
  }

  const bySeverity = [...findings].sort((a, b) => b.severity - a.severity);
  return {
    files,
    totals: {
      files: files.length,
      lines: totalLines,
      bytes: totalBytes,
      docRatio: totalLines ? docLines / totalLines : 0,
      exports: files.reduce((s, f) => s + f.exports, 0),
      functions: files.reduce((s, f) => s + f.functions, 0),
    },
    findings: bySeverity,
    worst: bySeverity.slice(0, 5),
  };
}

/** Persian report used in the chat transcript and the journal. */
export function auditReport(audit) {
  const t = audit.totals;
  const lines = [
    `کدِ خودِ اپ خوانده شد: ${faNum(t.files)} فایل · ${faNum(t.lines)} خط · ${fixed(t.bytes / 1024, 1)}KB · ${faNum(t.exports)} صادرات · پوشش کامنت ${fixed(t.docRatio * 100, 1)}٪.`,
  ];
  if (!audit.findings.length) lines.push('هیچ یافتهٔ ساختاری پیدا نشد.');
  for (const f of audit.worst) {
    if (f.severity <= 0) continue;
    lines.push(`• ${f.path}: ${f.text} → ${f.action}`);
  }
  lines.push('فایل‌ها زیر self/ در فضای کاری هستند؛ می‌توانی دیف بدهی، تست کنی و صادر کنی. اعمال روی اپِ زنده فقط با انتشار دوباره.');
  return lines.join('\n');
}
