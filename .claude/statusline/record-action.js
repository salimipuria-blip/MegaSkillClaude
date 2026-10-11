#!/usr/bin/env node
'use strict';

/**
 * PostToolUse hook: remember the last tool call (name + short, non-sensitive
 * target) and the tool count so the statusline can show live activity.
 * Never blocks: any error exits 0.
 */

const { actionTarget } = require('./activity');
const { readState, writeState } = require('./state');

const MAX_STDIN = 1024 * 1024;

function record(raw) {
  const data = JSON.parse(raw);
  const sessionId = data.session_id;
  const tool = data.tool_name;
  if (!sessionId || !tool) return;
  const state = readState(sessionId) || { tool_count: 0, files: [] };
  state.tool_count = (state.tool_count || 0) + 1;
  state.last_action = { tool, target: actionTarget(tool, data.tool_input), at: new Date().toISOString() };
  const file = data.tool_input && data.tool_input.file_path;
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool) && typeof file === 'string') {
    const files = new Set(state.files || []);
    files.add(file);
    state.files = [...files].slice(-500);
  }
  writeState(sessionId, state);
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (input.length < MAX_STDIN) input += chunk.slice(0, MAX_STDIN - input.length);
  });
  process.stdin.on('end', () => {
    try {
      record(input);
    } catch (err) {
      process.stderr.write(`[StatuslineRecord] ${err.message}\n`);
    }
    process.exit(0);
  });
}

module.exports = { record };
