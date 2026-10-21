#!/usr/bin/env node
// Per-project doctor - one precise command per project, no dependencies, no network.
//
//   node scripts/doctor.mjs                 # every project, in order, human report
//   node scripts/doctor.mjs psk lithos      # only the projects you name
//   node scripts/doctor.mjs --list          # ids, folders and the exact steps
//   node scripts/doctor.mjs --json          # machine-readable result
//   node scripts/doctor.mjs --fix           # print the exact command to fix each failure
//   node scripts/doctor.mjs --timeout=900   # per-step timeout in seconds (default 600)
//
// It runs the same commands as .github/workflows/ci.yml, plus the deeper checks that CI keeps out
// of the fast job (routing accuracy, golden snapshot, audit, index freshness). A step is:
//   pass  - exit 0
//   fail  - non-zero exit; the report prints the exact command and the last lines of output
//   skip  - a required tool is absent (deno, a browser, node_modules) - never treated as failure
// Exit code: 0 when nothing failed, 1 otherwise.
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argTimeout = process.argv.find((a) => a.startsWith('--timeout='));
const TIMEOUT_MS = (Number(argTimeout?.split('=')[1]) || 600) * 1000;
const JSON_OUT = process.argv.includes('--json');
const SHOW_FIX = process.argv.includes('--fix');

const has = (p) => existsSync(path.join(root, p));
const nodeModules = (p) => existsSync(path.join(root, p, 'node_modules'));
const tool = (name) => spawnSync('which', [name], {stdio: 'ignore'}).status === 0;
// A missing interpreter or module is an environment gap, not a broken project: skip with the exact
// install command instead of reporting a failure that looks like a code regression.
const hasModule = (name) =>
  spawnSync('python3', ['-c', `import ${name}`], {stdio: 'ignore'}).status === 0;
const PYTHON_MODULE_HINT = {pytest: 'python3 -m pip install --user pytest'};

/** Every project: id, folder, why it exists, and the exact ordered checks. */
const PROJECTS = [
  {
    id: 'repo', folder: '.', label: 'ریشهٔ مخزن (سلامت، هم‌گام‌سازی، تست‌های مشترک)',
    steps: [
      {name: 'health', cmd: 'bash scripts/repo_health_check.sh', why: 'بررسی سبک بدون نصب وابستگی'},
      {name: 'common-tests', cmd: 'python3 -m unittest discover -s tests -p "test_*.py"', why: 'تست‌های مشترک ریشه'},
      {name: 'skill-library-sync', cmd: 'python3 scripts/sync_skill_library.py --check', why: 'کتابخانهٔ مهارت‌ها با منبعش یکسان است'},
    ],
  },
  {
    id: 'psk', folder: 'psk', label: 'MEGA SKILLS 3000 (موتور مهارت‌ها)',
    steps: [
      {name: 'check', cmd: 'npm --ignore-scripts run check', cwd: 'psk', why: 'سینتکس همهٔ فایل‌های اجرایی'},
      {name: 'tests', cmd: 'npm --ignore-scripts test', cwd: 'psk', why: '۵۷ تست شامل قرارداد مسیریابی و سیگنال‌های نیت'},
      {name: 'golden', cmd: 'node scripts/routing-golden.mjs --check', cwd: 'psk', why: 'خروجی مسیریاب عیناً تغییر نکرده'},
      {name: 'accuracy', cmd: 'node scripts/routing-accuracy.mjs', cwd: 'psk', why: 'دقت مسیریاب روی مجموعهٔ طلایی'},
      {name: 'bench', cmd: 'node scripts/bench-routing.mjs', cwd: 'psk', optional: true, why: 'کارایی مسیریابی (اختیاری)'},
    ],
  },
  {
    id: 'lithos', folder: 'lithos', label: 'Lithos (داشبورد خصوصی)',
    needs: ['lithos/node_modules'],
    steps: [
      {name: 'check', cmd: 'node --check api/buffer-sync.js', cwd: 'lithos', why: 'سینتکس تابع سرورلس'},
      {name: 'tests', cmd: 'node --test tests/*.test.mjs', cwd: 'lithos', why: '۱۶ تست: سنک Buffer (مالک‌فقط، timeout، ۵۰۳) + قرارداد داشبورد'},
      {name: 'build', cmd: 'npm run build', cwd: 'lithos', why: 'بیلد Vite'},
    ],
  },
  {
    id: 'fjcod', folder: 'fjcod', label: 'CHAM Store OS (فروشگاه چام)',
    needs: ['fjcod/node_modules'],
    steps: [
      {name: 'check', cmd: 'npm run check', cwd: 'fjcod', why: 'typecheck + ۴۵ تست vitest (شامل حساب مرجوعی) + بیلد'},
      {name: 'e2e', cmd: 'npm run e2e', cwd: 'fjcod', optional: true, why: 'اسموک مرورگر (اگر Chromium باشد)'},
    ],
  },
  {
    id: 'bison-brand-book', folder: 'bison-brand-book', label: 'BISON Brand Book',
    needs: ['bison-brand-book/node_modules'],
    steps: [
      {name: 'contract', cmd: 'npm test', cwd: 'bison-brand-book', why: 'قرارداد ایستا: مسیرهای asset، لنگرها، ZIP و reduced-motion'},
      {name: 'build', cmd: 'npm run build', cwd: 'bison-brand-book', why: 'بیلد Vite/GSAP'},
      {name: 'audit', cmd: 'npm audit --omit=dev', cwd: 'bison-brand-book', why: 'صفر آسیب‌پذیری در وابستگی‌های اجرا'},
    ],
  },
  {
    id: 'viking-team', folder: 'viking-team', label: 'Viking Experience Command',
    steps: [
      {name: 'node-tests', cmd: 'node --test tests/*.test.mjs', cwd: 'viking-team', why: 'رگرسیون رفتار رسانه'},
      {name: 'app-syntax', cmd: 'node --check --input-type=module < team/app.js', cwd: 'viking-team', shell: true, why: 'سینتکس کلاینت'},
      {name: 'python-tests', cmd: 'python3 -m unittest discover -s tests', cwd: 'viking-team', why: '۱۵ تست: یکپارچگی HTML/CSS/JS، قرارداد SQL/RLS و نبود کلید سرویس'},
      {name: 'no-secret-keys', cmd: "! grep -R -E 'service_role|sb_secret_' team", cwd: 'viking-team', shell: true, why: 'هیچ کلید مدیریتی در کلاینت نیست'},
    ],
  },
  {
    id: 'hermes', folder: 'hermes', label: 'Hermes (دستیار ۲۴/۷ تلگرام)',
    needs: ['hermes/node_modules'],
    steps: [
      {name: 'shell-syntax', cmd: 'bash -n hermes/setup.sh hermes/config.sh hermes/logger.sh', why: 'سینتکس نصب‌کننده'},
      {name: 'check', cmd: 'npm run check --prefix hermes', why: 'سینتکس همهٔ ماژول‌ها'},
      {name: 'tests', cmd: 'npm test --prefix hermes', why: '۲۶۳ تست واحد (استودیو، لایهٔ متن، fetch با timeout، یادآورها، کدنویسی و دانش پروژه‌ها)'},
      {name: 'integration', cmd: 'npm run test:integration --prefix hermes', why: '۱۰ رگرسیون روی workerd محلی'},
      {name: 'skills-build', cmd: 'node hermes/build-skills.mjs', optional: true, why: 'ساخت دارایی‌های مهارت'},
    ],
  },
  {
    id: 'mobile', folder: 'mobile', label: 'کنسول آیفون مگااسکیل',
    steps: [
      {name: 'index-cache', cmd: 'python3 mobile/build-index.py --check', why: 'ایندکس و اثرانگشت همهٔ assetهای PWA تازه است'},
      {name: 'search-tests', cmd: 'node --test mobile/search.test.mjs mobile/index.test.mjs', why: 'جست‌وجو، escape، schema، مسیرهای canonical و بودجهٔ وزن ایندکس'},
      {name: 'syntax', cmd: 'node --check mobile/app.js && node --check mobile/sw.js && node --check mobile/search.mjs', shell: true, why: 'نحو ماژول UI، موتور جست‌وجو و Service Worker'},
    ],
  },
  {
    id: 'brand-stickers', folder: 'brands/viking-offroad', label: 'استیکرهای وایکینگ آفرود',
    steps: [
      {name: 'asset-contract', cmd: 'python3 scripts/check_brand_assets.py --stickers', why: '۱۲ پک، ۳۶۰ PNG شفاف ۵۱۲×۵۱۲، preview و cover'},
      {name: 'manifest', cmd: 'python3 scripts/build_sticker_manifest.py --check', why: 'MANIFEST.json با سورس (packs.js + duos.js) و PNGها یکی است'},
    ],
  },
  {
    id: 'brand-viking', folder: 'brand/viking', label: 'قالب محتوای وایکینگ',
    steps: [
      {name: 'asset-contract', cmd: 'python3 scripts/check_brand_assets.py --templates', why: 'قالب‌ها و assetهای محلی resolve می‌شوند'},
      {name: 'renderer-syntax', cmd: 'node --check brand/viking/render.mjs', why: 'نحو رندرر ES module'},
      {name: 'renderer-tests', cmd: 'node --test brand/viking/tests/render.test.mjs', why: 'رندرهای fake و بستن مرورگر در شکست'},
      {name: 'content-contract', cmd: 'node --test brand/viking/tests/content.test.mjs', why: 'ادعاهای کمپین در brief.json هستند و assetها محلی‌اند'},
    ],
  },
  {
    id: 'viking-motion', folder: 'viking-team/motion', label: 'Viking Cinematic Motion Study (prototype)',
    needs: ['viking-team/motion/node_modules'],
    steps: [
      {name: 'typecheck', cmd: 'npm run check', cwd: 'viking-team/motion', why: 'TypeScript strict/noEmit'},
      {name: 'spec', cmd: 'npm test', cwd: 'viking-team/motion', why: 'قفل مشخصات: ۱۰۸۰×۱۹۲۰، ۳۰fps، ۱۸۰ فریم، پالت و نبود انیمیشن CSS'},
    ],
  },
  {
    id: 'orchestrator', folder: 'orchestrator', label: 'Omni LLM Orchestrator (تاریخی)',
    steps: [
      {name: 'contract', cmd: 'python3 scripts/audit/check_repository_contract.py', cwd: 'orchestrator', why: 'قرارداد مخزن'},
      {name: 'pytest', cmd: 'python3 -m pytest -q -ra tests', cwd: 'orchestrator', needsModule: 'pytest', why: '۲۱ تست + ۳ اسکیپ مستند شده'},
      {name: 'deno-gateway', cmd: 'deno check --no-remote supabase/functions/github-admin-gateway/index.ts', cwd: 'orchestrator', needsTool: 'deno', why: 'قابل‌استقرار بودن توابع Edge'},
    ],
  },
  {
    id: 'router', folder: 'plugins/mega-skills-router', label: 'مسیریاب و کتابخانهٔ مهارت‌ها',
    steps: [
      {name: 'sync', cmd: 'python3 scripts/sync_skill_library.py --check', why: 'پلاگین با منبع canonical یکسان'},
      {name: 'python-tests', cmd: 'python3 -m unittest discover -s tests -p "test_*.py"', why: 'تست‌های مسیریاب'},
      {name: 'verify-skills', cmd: 'python3 scripts/verify_skills.py --strict', optional: true, why: 'هش SKILL.md ها (گزارشی)'},
    ],
  },
];

const NPM_INSTALL_HINT = {
  lithos: 'npm install --prefix lithos',
  fjcod: 'npm ci --prefix fjcod',
  'bison-brand-book': 'npm ci --prefix bison-brand-book',
  hermes: 'npm ci --prefix hermes --ignore-scripts',
  'viking-motion': 'npm ci --prefix viking-team/motion --ignore-scripts --no-audit --no-fund',
};

/** Split a command without invoking a shell; support quoted args and escapes. */
function splitCommand(command) {
  const args = [];
  let token = '';
  let quote = null;
  let escaped = false;
  let started = false;

  for (const character of command) {
    if (escaped) {
      token += character;
      escaped = false;
      started = true;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (started) args.push(token);
      token = '';
      started = false;
      continue;
    }
    token += character;
    started = true;
  }

  if (escaped || quote) return {executable: '', args: []};
  if (started) args.push(token);
  return {executable: args.shift() || '', args};
}

function runStep(project, step) {
  if (step.cwd && !has(step.cwd)) return {status: 'fail', note: `folder ${step.cwd} is missing`, output: ''};
  if (project.needs) {
    const missing = project.needs.filter((p) => !existsSync(path.join(root, p)));
    if (missing.length) return {status: 'skip', note: `install first: ${NPM_INSTALL_HINT[project.id] || 'npm ci'}`, output: ''};
  }
  if (step.needsTool && !tool(step.needsTool)) return {status: 'skip', note: `${step.needsTool} is not installed`, output: ''};
  if (step.needsModule && !hasModule(step.needsModule)) {
    return {status: 'skip', note: `python module '${step.needsModule}' is missing; install: ${PYTHON_MODULE_HINT[step.needsModule] || 'python3 -m pip install --user ' + step.needsModule}`, output: ''};
  }
  const cwd = path.join(root, step.cwd || '.');
  const parsed = step.shell ? {executable: 'bash', args: ['-c', step.cmd]} : splitCommand(step.cmd);
  if (!parsed.executable) return {status: 'fail', note: `invalid command: ${step.cmd}`, output: ''};
  const started = Date.now();
  const res = spawnSync(parsed.executable, parsed.args, {cwd, timeout: TIMEOUT_MS, encoding: 'utf8'});
  const ms = Date.now() - started;
  const output = `${res.stdout || ''}${res.stderr || ''}`.trim();
  if (res.error?.code === 'ETIMEDOUT') return {status: 'fail', ms, note: `timeout after ${TIMEOUT_MS / 1000}s`, output};
  if (res.error) return {status: 'fail', ms, note: `${res.error.code}: ${parsed.executable} not runnable`, output};
  if (res.status !== 0) return {status: 'fail', ms, note: `exit ${res.status}`, output};
  return {status: 'pass', ms, output};
}

function tail(text, lines = 6) {
  const kept = String(text || '').split('\n').filter(Boolean).slice(-lines);
  return kept.map((l) => `        ${l.slice(0, 160)}`).join('\n');
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const selected = wanted.length ? PROJECTS.filter((p) => wanted.includes(p.id)) : PROJECTS;

if (process.argv.includes('--list')) {
  for (const p of PROJECTS) {
    console.log(`\n${p.id}  (${p.folder})  ${p.label}`);
    for (const s of p.steps) console.log(`   ${s.name.padEnd(16)} ${s.cmd}${s.optional ? '   [optional]' : ''}`);
  }
  process.exit(0);
}

if (!selected.length) {
  console.error(`unknown project id: ${wanted.join(', ')}\nknown: ${PROJECTS.map((p) => p.id).join(', ')}`);
  process.exit(2);
}

const startedAll = Date.now();
const results = [];
for (const project of selected) {
  const rows = [];
  for (const step of project.steps) {
    const out = runStep(project, step);
    const status = out.status === 'fail' && step.optional ? 'warn' : out.status;
    rows.push({step: step.name, cmd: step.cmd, why: step.why, optional: !!step.optional, ...out, status});
  }
  results.push({project: project.id, label: project.label, folder: project.folder, rows});
}

const failures = results.flatMap((r) => r.rows.filter((x) => x.status === 'fail').map((x) => ({project: r.project, ...x})));

if (JSON_OUT) {
  console.log(JSON.stringify({generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAll,
    failures: failures.length, results}, null, 1));
} else {
  const mark = {pass: '\u2713', fail: '\u2717', skip: '\u2013', warn: '!'};
  console.log('per-project doctor  (node ' + process.version + ', ' + path.basename(root) + ')');
  for (const r of results) {
    const bad = r.rows.some((x) => x.status === 'fail');
    console.log(`\n${bad ? '\u2717' : '\u2713'} ${r.project}  -  ${r.label}   [${r.folder}]`);
    for (const row of r.rows) {
      const ms = row.ms ? `${(row.ms / 1000).toFixed(1)}s` : '-';
      console.log(`   ${mark[row.status]} ${row.step.padEnd(16)} ${ms.padStart(7)}   ${row.why || ''}`);
      if (row.note) console.log(`        ${row.note}`);
      if (row.status === 'fail' && row.output) console.log(tail(row.output));
    }
  }
  console.log('');
  if (failures.length) {
    console.log(`FAILED ${failures.length} step(s):`);
    for (const f of failures) {
      console.log(`  ${f.project} :: ${f.step}`);
      console.log(`    run: ${f.cmd}${f.cwd ? `   (cwd ${f.cwd})` : ''}`);
      if (SHOW_FIX) console.log(`    fix: inspect the output above, then re-run: node scripts/doctor.mjs ${f.project}`);
    }
  } else {
    const skipped = results.flatMap((r) => r.rows.filter((x) => x.status === 'skip').map((x) => `${r.project}:${x.step}`));
    console.log(`all required checks passed in ${((Date.now() - startedAll) / 1000).toFixed(1)}s`);
    if (skipped.length) console.log(`skipped (missing tool/deps): ${skipped.join(', ')}`);
  }
}
process.exit(failures.length ? 1 : 0);
