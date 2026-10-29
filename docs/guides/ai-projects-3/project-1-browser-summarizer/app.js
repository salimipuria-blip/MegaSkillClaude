// UI wiring only. Every decision that can be tested lives in summarizer-core.mjs.
import { downloadNotice, MAX_INPUT_CHARS, prepareText } from './summarizer-core.mjs';

const $ = (id) => document.getElementById(id);
const input = $('input');
const run = $('run');
const stop = $('stop');
const copy = $('copy');
const status = $('status');
const progress = $('progress');
const output = $('output');
const counter = $('counter');
const tokens = $('tokens');
const tokensLabel = $('tokens-label');

let worker = null;
let requestId = 0;
let busy = false;
let latest = '';

$('notice').textContent = downloadNotice();

function setStatus(text, kind = '') {
  status.textContent = text;
  status.dataset.kind = kind;
}

function setBusy(value) {
  busy = value;
  run.disabled = value;
  stop.disabled = !value;
  progress.hidden = !value;
  if (!value) progress.value = 0;
}

function startWorker() {
  // A fresh worker per run keeps "توقف" honest: terminate() is the only reliable way to
  // abort a synchronous ONNX call that is already inside the model.
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const data = event.data || {};
    if (data.type === 'progress') {
      progress.value = data.percent;
      setStatus(`در حال آماده‌سازی مدل… ${data.percent}٪`);
      return;
    }
    if (data.type === 'ready') { setStatus('مدل آماده است؛ در حال خلاصه‌سازی…'); return; }
    if (data.type === 'result' && data.id === requestId) {
      latest = data.summary;
      output.textContent = data.summary;
      copy.disabled = !latest;
      setStatus(
        data.truncated
          ? `خلاصه شد (متن ورودی برای مدل کوتاه شد: ${data.chars.toLocaleString('fa-IR')} کاراکتر).`
          : 'خلاصه شد.',
        'ok',
      );
      finish();
      return;
    }
    if (data.type === 'error' && data.id === requestId) {
      setStatus(data.message, 'error');
      output.textContent = '';
      finish();
    }
  };
  worker.onerror = (event) => {
    setStatus(`خطای ورکر: ${event.message || 'بارگذاری ماژول ناموفق بود.'}`, 'error');
    finish();
  };
}

function finish() {
  setBusy(false);
  if (worker) { worker.terminate(); worker = null; }
}

run.addEventListener('click', () => {
  if (busy) return;
  const prepared = prepareText(input.value);
  if (prepared.reason === 'empty') { setStatus('متنی برای خلاصه کردن نیست.', 'error'); return; }
  if (prepared.reason === 'too-short') { setStatus('متن کوتاه‌تر از آن است که خلاصه شود (دست‌کم ۴۰ کاراکتر).', 'error'); return; }
  requestId += 1;
  latest = '';
  output.textContent = '';
  copy.disabled = true;
  setBusy(true);
  setStatus('در حال آماده‌سازی مدل…');
  startWorker();
  worker.postMessage({ id: requestId, text: input.value, maxTokens: Number(tokens.value) });
});

stop.addEventListener('click', () => {
  if (!busy) return;
  requestId += 1; // any late message from the old worker is now stale
  finish();
  setStatus('متوقف شد.');
});

copy.addEventListener('click', async () => {
  if (!latest) return;
  try {
    await navigator.clipboard.writeText(latest);
    setStatus('خلاصه در کلیپ‌بورد کپی شد.', 'ok');
  } catch {
    setStatus('مرورگر اجازه‌ی کپی نداد؛ متن را دستی انتخاب کن.', 'error');
  }
});

input.addEventListener('input', () => {
  const { length } = input.value;
  counter.textContent = `${length.toLocaleString('fa-IR')} از ${MAX_INPUT_CHARS.toLocaleString('fa-IR')} کاراکتر`;
  counter.dataset.over = String(length > MAX_INPUT_CHARS);
});

tokens.addEventListener('input', () => {
  tokensLabel.textContent = `${Number(tokens.value).toLocaleString('fa-IR')} توکن`;
});

// The example is the Eiffel Tower paragraph every Transformers.js demo uses, so a learner
// can compare their output with the official one.
$('sample').addEventListener('click', () => {
  input.value = 'برج ایفل ۳۲۴ متر ارتفاع دارد، حدوداً به بلندی یک ساختمان ۸۱ طبقه، و بلندترین سازه‌ی پاریس است. ' +
    'قاعده‌ی آن مربع است و هر ضلع ۱۲۵ متر اندازه دارد. در جریان ساخت، برج ایفل از بنای یادبود واشینگتن پیشی گرفت و ' +
    'بلندترین سازهٔ ساخته‌ی دستِ بشر شد؛ عنوانی که ۴۱ سال نگه داشت تا ساختمان کرایسلر در نیویورک در سال ۱۹۳۰ تمام شد. ' +
    'این بنا اولین سازه‌ای بود که به ارتفاع ۳۰۰ متر رسید. با افزودن آنتن رادیویی در سال ۱۹۵۷، اکنون ۵٫۲ متر از ساختمان ' +
    'کرایسلر بلندتر است. بدون احتساب آنتن‌ها، برج ایفل دومین سازهٔ آزادِ بلند در فرانسه است، پس از پل میلو.';
  input.dispatchEvent(new Event('input'));
});

setBusy(false);
setStatus('آماده.');
