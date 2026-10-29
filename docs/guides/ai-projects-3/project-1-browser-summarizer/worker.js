// Worker: the only place the model runs. Keeping it here (not in app.js) is what stops the
// page from freezing while BART tokenises 8,000 characters.
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
import {
  MODEL, DTYPE, generationOptions, prepareText, progressPercent, readSummary,
} from './summarizer-core.mjs';

let summarizer = null;
let loading = null;

/** Load once, share the promise: two fast clicks must not download the model twice. */
function load() {
  if (summarizer) return Promise.resolve(summarizer);
  if (!loading) {
    loading = pipeline('summarization', MODEL, {
      dtype: DTYPE,
      progress_callback: (event) => {
        const percent = progressPercent(event);
        if (percent !== null) self.postMessage({ type: 'progress', percent, file: event.file || '' });
      },
    })
      .then((pipe) => { summarizer = pipe; self.postMessage({ type: 'ready' }); return pipe; })
      .catch((error) => { loading = null; throw error; });
  }
  return loading;
}

self.onmessage = async (event) => {
  const { id, text, maxTokens } = event.data || {};
  if (typeof text !== 'string') {
    self.postMessage({ type: 'error', id, message: 'متن ورودی نامعتبر است.' });
    return;
  }
  const prepared = prepareText(text);
  if (prepared.reason) {
    self.postMessage({ type: 'error', id, message: 'متن کوتاه‌تر از آن است که خلاصه شود (دست‌کم ۴۰ کاراکتر).' });
    return;
  }
  try {
    const pipe = await load();
    const output = await pipe(prepared.text, generationOptions(maxTokens));
    const summary = readSummary(output);
    if (!summary) throw new Error('مدل خلاصه‌ای برنگرداند.');
    self.postMessage({ type: 'result', id, summary, truncated: prepared.truncated, chars: prepared.text.length });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error?.message || String(error) });
  }
};
