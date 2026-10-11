#!/usr/bin/env node
'use strict';

/**
 * Statusline: model | ctx ━━━━────── N% | ▸ Tool target | 2/5 task | $cost Nt Nf | dir
 *
 * One width-bounded line. The context gauge sits right after the model and is
 * never dropped, so it stays visible without wrapping into the conversation.
 * Everything comes from Claude Code's stdin and local files: zero model tokens.
 */

const path = require('path');
const { layoutStatusline, resolveMaxWidth } = require('./layout');
const { formatAction, readTodoProgress, formatTask } = require('./activity');
const { readState } = require('./state');

const AUTO_COMPACT_BUFFER_PCT = 16.5;
const MAX_STDIN = 1024 * 1024;

/** Used % of the usable window (the auto-compact buffer excluded). */
function contextUsedPct(data) {
  const cw = (data && data.context_window) || {};
  let remaining = cw.remaining_percentage;
  if (remaining === undefined && Number.isFinite(cw.used_percentage)) remaining = 100 - cw.used_percentage;
  if (remaining === null || remaining === undefined || !Number.isFinite(Number(remaining))) return null;
  const usable = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
  return Math.max(0, Math.min(100, Math.round(100 - usable)));
}

function contextColor(used) {
  if (used < 50) return '\x1b[32m';
  if (used < 65) return '\x1b[33m';
  if (used < 80) return '\x1b[38;5;208m';
  return '\x1b[31m';
}

function contextBar(used) {
  if (used === null) return '';
  const filled = Math.floor(used / 10);
  const color = contextColor(used);
  const bar = `${color}${'━'.repeat(filled)}\x1b[0m\x1b[2m${'─'.repeat(10 - filled)}\x1b[0m`;
  return `\x1b[2mctx\x1b[0m ${bar} ${color}${used}%\x1b[0m`;
}

function contextCompact(used) {
  return used === null ? '' : `\x1b[2mctx\x1b[0m ${contextColor(used)}${used}%\x1b[0m`;
}

function metrics(data, state) {
  const parts = [];
  const cost = data.cost && data.cost.total_cost_usd;
  if (cost > 0) parts.push(`$${cost.toFixed(2)}`);
  if (state && state.tool_count > 0) parts.push(`${state.tool_count}t`);
  if (state && state.files && state.files.length > 0) parts.push(`${state.files.length}f`);
  return parts.length ? `\x1b[38;5;117m${parts.join(' ')}\x1b[0m` : '';
}

function render(data, maxWidth) {
  const used = contextUsedPct(data);
  const sessionId = data.session_id || '';
  const state = sessionId ? readState(sessionId) : null;
  const action = formatAction(state);
  const dir = (data.workspace && data.workspace.current_dir) || process.cwd();
  return layoutStatusline(
    {
      model: `\x1b[2m${(data.model && data.model.display_name) || 'Claude'}\x1b[0m`,
      context: contextBar(used),
      contextCompact: contextCompact(used),
      activity: action ? `\x1b[36m${action}\x1b[0m` : '',
      task: sessionId ? formatTask(readTodoProgress(sessionId)) : '',
      metrics: metrics(data, state),
      dir: `\x1b[2m${path.basename(dir)}\x1b[0m`
    },
    maxWidth
  );
}

if (require.main === module) {
  let input = '';
  const timer = setTimeout(() => process.exit(0), 3000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (input.length < MAX_STDIN) input += chunk.slice(0, MAX_STDIN - input.length);
  });
  process.stdin.on('end', () => {
    clearTimeout(timer);
    try {
      process.stdout.write(render(JSON.parse(input), resolveMaxWidth()));
    } catch {
      // A broken statusline must never disturb the session.
    }
  });
}

module.exports = { contextUsedPct, render };
