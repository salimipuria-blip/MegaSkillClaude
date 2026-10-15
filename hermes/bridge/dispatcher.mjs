// Job dispatcher for the Hermes local bridge (P0: read-only actions only).
import { realpathSync, statSync } from 'node:fs';
import { BridgeError } from './paths.mjs';
import { gitStatusTool, listDirTool, readFileTool, searchTool } from './tools.mjs';

// Only these actions exist in P0. propose_edit, run_allowlisted and commit are added in later phases.
export const P0_ACTIONS = Object.freeze({
  read_file: readFileTool,
  list_dir: listDirTool,
  search: searchTool,
  git_status: gitStatusTool,
});

const MAX_RESULT_CHARS = 256 * 1024;

export function createContext(root) {
  if (typeof root !== 'string' || root.length === 0) throw new BridgeError('BAD_ROOT', 'root is required');
  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch {
    throw new BridgeError('BAD_ROOT', 'root does not exist');
  }
  if (!statSync(rootReal).isDirectory()) throw new BridgeError('BAD_ROOT', 'root is not a directory');
  return Object.freeze({ rootReal });
}

export async function runJob(ctx, job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new BridgeError('BAD_JOB', 'job must be an object');
  const action = job.action;
  if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(P0_ACTIONS, action)) {
    throw new BridgeError('NOT_ALLOWED', `action "${String(action)}" is not available in P0`);
  }
  const args = job.args && typeof job.args === 'object' && !Array.isArray(job.args) ? job.args : {};
  const result = await P0_ACTIONS[action](ctx, args);
  const serialized = JSON.stringify(result);
  if (serialized.length > MAX_RESULT_CHARS) throw new BridgeError('RESULT_TOO_LARGE', 'result exceeds the size limit');
  return { ok: true, action, result };
}
