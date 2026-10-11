'use strict';

/**
 * Live activity for the statusline: what the agent is doing right now and how
 * far through its checklist it is. Everything here is read from local files
 * written by hooks, so showing it costs no model tokens.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const MAX_SESSION_ID_LENGTH = 64;

/** Session id safe for use in a file name, or null. */
function sanitizeSessionId(raw) {
  if (!raw || typeof raw !== 'string' || /[/\\]|\.\./.test(raw)) return null;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, MAX_SESSION_ID_LENGTH) || null;
}

const TARGET_MAX = 24;

/**
 * Short, non-sensitive label for a tool call's target: a file's basename, the
 * first word of a shell command, or a search pattern. Never full commands,
 * which can carry secrets.
 * @param {string} toolName
 * @param {object} toolInput
 * @returns {string}
 */
function actionTarget(toolName, toolInput) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {};
  let target = '';
  if (typeof input.file_path === 'string') target = path.basename(input.file_path);
  else if (typeof input.notebook_path === 'string') target = path.basename(input.notebook_path);
  else if (/^bash$/i.test(toolName) && typeof input.command === 'string') {
    // Skip leading VAR=value assignments: they can hold secrets.
    const program = input.command.trim().split(/\s+/).find(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) || '';
    target = path.basename(program);
  } else if (typeof input.pattern === 'string') target = input.pattern;
  else if (typeof input.subagent_type === 'string') target = input.subagent_type;
  else if (typeof input.skill === 'string') target = input.skill;
  // eslint-disable-next-line no-control-regex
  target = target.replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
  return target.length > TARGET_MAX ? `${target.slice(0, TARGET_MAX - 1)}…` : target;
}

/**
 * Format the last action recorded in the bridge, e.g. "▸ Edit app.js".
 * @param {object|null} bridge
 * @returns {string} plain text, or '' when there is nothing to show
 */
function formatAction(bridge) {
  const last = bridge && bridge.last_action;
  if (!last || !last.tool) return '';
  // Drop MCP prefixes so "mcp__github__create_pull_request" reads as the action.
  const raw = String(last.tool);
  const tool = raw.startsWith('mcp__') ? raw.split('__').pop() : raw;
  return `▸ ${tool}${last.target ? ` ${last.target}` : ''}`;
}

/**
 * Read the session's newest todo list.
 * @param {string} sessionId
 * @returns {{active: string, done: number, total: number}}
 */
function readTodoProgress(sessionId) {
  const empty = { active: '', done: 0, total: 0 };
  try {
    const safeSessionId = sanitizeSessionId(sessionId);
    if (!safeSessionId) return empty;

    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const todosDir = path.join(claudeDir, 'todos');
    if (!fs.existsSync(todosDir)) return empty;

    const files = fs
      .readdirSync(todosDir)
      .filter(f => f.startsWith(safeSessionId) && f.includes('-agent-') && f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) return empty;

    const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
    if (!Array.isArray(todos)) return empty;
    const inProgress = todos.find(t => t && t.status === 'in_progress');
    return {
      active: (inProgress && inProgress.activeForm) || '',
      done: todos.filter(t => t && t.status === 'completed').length,
      total: todos.length
    };
  } catch {
    return empty;
  }
}

/**
 * Task label with progress, e.g. "2/5 Fixing auth flow".
 * @param {{active: string, done: number, total: number}} progress
 * @returns {string}
 */
function formatTask(progress) {
  if (!progress || !progress.total) return progress && progress.active ? progress.active : '';
  const counter = `${progress.done}/${progress.total}`;
  return progress.active ? `${counter} ${progress.active}` : counter;
}

module.exports = { TARGET_MAX, sanitizeSessionId, actionTarget, formatAction, readTodoProgress, formatTask };
