'use strict';

/**
 * Per-session state shared by the PostToolUse hook (writer) and the statusline
 * (reader). Lives in the OS temp dir, so it never touches the repo or costs tokens.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeSessionId } = require('./activity');

function statePath(sessionId) {
  const safe = sanitizeSessionId(sessionId);
  if (!safe) return null;
  const dir = process.env.MEGA_STATUSLINE_DIR || path.join(os.tmpdir(), 'claude-statusline');
  return path.join(dir, `${safe}.json`);
}

function readState(sessionId) {
  const file = statePath(sessionId);
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(sessionId, state) {
  const file = statePath(sessionId);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}

module.exports = { statePath, readState, writeState };
