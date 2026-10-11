'use strict';

/**
 * Statusline layout helpers.
 *
 * Keeps the statusline to a single, width-bounded line so the context gauge is
 * always visible without wrapping into (or pushing) the conversation view.
 * The context gauge is placed right after the model name and is the last
 * segment to give way when space runs out.
 */

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const SEPARATOR = ' \x1b[2m│\x1b[0m ';
const SEPARATOR_WIDTH = 3;
const TASK_MAX = 40;
const TASK_MIN = 8;

/**
 * Visible width of a string, ignoring ANSI SGR escape sequences.
 * @param {string} str
 * @returns {number}
 */
function visibleWidth(str) {
  return Array.from(String(str || '').replace(ANSI_PATTERN, '')).length;
}

/**
 * Truncate plain text to a visible width, appending an ellipsis when cut.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncate(text, max) {
  const chars = Array.from(String(text || ''));
  if (chars.length <= max) return chars.join('');
  if (max <= 1) return '…'.slice(0, Math.max(0, max));
  return chars.slice(0, max - 1).join('') + '…';
}

/**
 * Resolve the maximum statusline width, or null when unknown.
 * ECC_STATUSLINE_MAX_WIDTH wins, then COLUMNS, then the stdout TTY width.
 * @param {object} [env]
 * @param {object} [stdout]
 * @returns {number|null}
 */
function resolveMaxWidth(env = process.env, stdout = process.stdout) {
  for (const raw of [env.ECC_STATUSLINE_MAX_WIDTH, env.COLUMNS]) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const cols = stdout && stdout.columns;
  return Number.isFinite(cols) && cols > 0 ? cols : null;
}

/**
 * Lay out statusline segments on one line within maxWidth.
 *
 * Order: model │ context │ activity │ task │ metrics │ dir
 * Drop order when too wide: dir → metrics → task (shrinks first) → model →
 * activity → context falls back to its compact form. Context is never dropped.
 *
 * @param {object} parts
 * @param {string} [parts.model] - styled model label
 * @param {string} [parts.context] - styled context gauge (full form)
 * @param {string} [parts.contextCompact] - styled context gauge (short form)
 * @param {string} [parts.activity] - styled live action, e.g. "▸ Edit app.js"
 * @param {string} [parts.task] - plain task text (styled here)
 * @param {string} [parts.metrics] - styled metrics
 * @param {string} [parts.dir] - styled directory label
 * @param {number|null} maxWidth
 * @returns {string}
 */
function layoutStatusline(parts, maxWidth) {
  const style = text => `\x1b[97m${text}\x1b[0m`;
  // Strip control characters so task text can never break onto a second line.
  // eslint-disable-next-line no-control-regex
  const rawTask = String(parts.task || '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
  let taskText = rawTask ? truncate(rawTask, TASK_MAX) : '';
  let { model, activity, metrics, dir } = parts;
  let context = parts.context || '';

  const build = () => {
    const segments = [model, context, activity, taskText ? style(taskText) : '', metrics, dir].filter(Boolean);
    return segments.join(SEPARATOR);
  };

  if (!maxWidth) return build();

  const fits = () => visibleWidth(build()) <= maxWidth;
  if (fits()) return build();

  dir = '';
  if (fits()) return build();

  metrics = '';
  if (fits()) return build();

  if (taskText) {
    const others = [model, context, activity].filter(Boolean);
    const used = others.reduce((sum, s) => sum + visibleWidth(s), 0) + others.length * SEPARATOR_WIDTH;
    const room = maxWidth - used;
    taskText = room >= TASK_MIN ? truncate(taskText, room) : '';
    if (fits()) return build();
  }

  model = '';
  if (fits()) return build();

  activity = '';
  if (fits()) return build();

  if (parts.contextCompact) context = parts.contextCompact;
  return build();
}

module.exports = {
  SEPARATOR,
  TASK_MAX,
  TASK_MIN,
  visibleWidth,
  truncate,
  resolveMaxWidth,
  layoutStatusline
};
