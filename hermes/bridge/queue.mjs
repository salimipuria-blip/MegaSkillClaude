// Job queue and device-token registry for the Hermes bridge.
// Pure logic with an injectable clock and id source, so it runs in tests today and can later sit
// behind Durable Object storage without changing the rules below.
//
// Rules:
// - Jobs are created only by the Hermes side (enqueue). A device can never create work.
// - A device sees only jobs of its own owner. Tokens are stored as SHA-256 hashes only.
// - A claimed job is leased. Only the device holding the lease can complete or fail it.
// - Expired leases are requeued until maxAttempts; expired jobs are never handed out.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export class QueueError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QueueError';
    this.code = code;
  }
}

export const QUEUE_LIMITS = Object.freeze({
  defaultTtlMs: 60 * 60 * 1000,
  minTtlMs: 60 * 1000,
  maxTtlMs: 24 * 60 * 60 * 1000,
  leaseMs: 60 * 1000,
  maxAttempts: 3,
  maxResultChars: 256 * 1024,
  maxErrorChars: 500,
  maxQueued: 500,
});

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

export function createQueue({
  allowedActions,
  now = () => Date.now(),
  newId = () => randomUUID(),
  limits = QUEUE_LIMITS,
} = {}) {
  if (!(allowedActions instanceof Set) || allowedActions.size === 0) {
    throw new QueueError('BAD_CONFIG', 'allowedActions must be a non-empty Set');
  }
  const jobs = new Map();
  const devices = new Map(); // deviceId -> { ownerId, tokenHash, revoked }

  function expire(at) {
    for (const job of jobs.values()) {
      if (job.status === 'running' && job.leaseUntil <= at) {
        job.leaseUntil = 0;
        job.deviceId = null;
        if (job.attempts >= limits.maxAttempts) {
          job.status = 'failed';
          job.error = { code: 'LEASE_EXPIRED', message: 'lease expired too many times' };
        } else {
          job.status = 'queued';
        }
      }
      if ((job.status === 'queued' || job.status === 'running') && job.expiresAt <= at) {
        job.status = 'expired';
        job.leaseUntil = 0;
        job.deviceId = null;
      }
    }
  }

  function enqueue({ ownerId, action, args = {}, ttlMs = limits.defaultTtlMs }) {
    if (typeof ownerId !== 'string' || ownerId.length === 0) throw new QueueError('BAD_OWNER', 'ownerId is required');
    if (typeof action !== 'string' || !allowedActions.has(action)) {
      throw new QueueError('NOT_ALLOWED', `action "${String(action)}" is not allowed`);
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new QueueError('BAD_ARGS', 'args must be an object');
    if (!Number.isInteger(ttlMs) || ttlMs < limits.minTtlMs || ttlMs > limits.maxTtlMs) {
      throw new QueueError('BAD_TTL', 'ttl is outside the allowed range');
    }
    const at = now();
    expire(at);
    let open = 0;
    for (const job of jobs.values()) if (job.status === 'queued' || job.status === 'running') open += 1;
    if (open >= limits.maxQueued) throw new QueueError('QUEUE_FULL', 'too many open jobs');

    const id = newId();
    jobs.set(id, {
      id,
      ownerId,
      action,
      args,
      status: 'queued',
      attempts: 0,
      deviceId: null,
      leaseUntil: 0,
      createdAt: at,
      expiresAt: at + ttlMs,
      result: null,
      error: null,
    });
    return { id, expiresAt: at + ttlMs };
  }

  function issueDevice(ownerId) {
    if (typeof ownerId !== 'string' || ownerId.length === 0) throw new QueueError('BAD_OWNER', 'ownerId is required');
    const deviceId = newId();
    const token = randomBytes(32).toString('base64url');
    devices.set(deviceId, { ownerId, tokenHash: sha256Hex(token), revoked: false });
    // The raw token is returned once; the queue keeps only its hash.
    return { deviceId, token };
  }

  function authenticate(token) {
    if (typeof token !== 'string' || token.length === 0 || token.length > 200) return null;
    const presented = Buffer.from(sha256Hex(token), 'hex');
    for (const [deviceId, device] of devices) {
      if (device.revoked) continue;
      if (timingSafeEqual(presented, Buffer.from(device.tokenHash, 'hex'))) {
        return { deviceId, ownerId: device.ownerId };
      }
    }
    return null;
  }

  function revokeDevice(deviceId) {
    const device = devices.get(deviceId);
    if (!device) return false;
    device.revoked = true;
    for (const job of jobs.values()) {
      if (job.status === 'running' && job.deviceId === deviceId) {
        job.status = 'queued';
        job.deviceId = null;
        job.leaseUntil = 0;
      }
    }
    return true;
  }

  function claim(deviceId) {
    const device = devices.get(deviceId);
    if (!device || device.revoked) throw new QueueError('UNAUTHORIZED', 'device is not active');
    const at = now();
    expire(at);
    let next = null;
    for (const job of jobs.values()) {
      if (job.status !== 'queued' || job.ownerId !== device.ownerId) continue;
      if (!next || job.createdAt < next.createdAt) next = job;
    }
    if (!next) return null;
    next.status = 'running';
    next.attempts += 1;
    next.deviceId = deviceId;
    next.leaseUntil = at + limits.leaseMs;
    return { id: next.id, action: next.action, args: next.args, attempt: next.attempts, leaseUntil: next.leaseUntil };
  }

  function holds(deviceId, id) {
    const job = jobs.get(id);
    const device = devices.get(deviceId);
    if (!job || !device || device.revoked) throw new QueueError('NOT_HOLDER', 'job is not leased to this device');
    if (job.status !== 'running' || job.deviceId !== deviceId || job.ownerId !== device.ownerId) {
      throw new QueueError('NOT_HOLDER', 'job is not leased to this device');
    }
    if (job.leaseUntil <= now()) throw new QueueError('LEASE_EXPIRED', 'lease has expired');
    return job;
  }

  function complete(deviceId, id, result) {
    const job = holds(deviceId, id);
    if (JSON.stringify(result ?? null).length > limits.maxResultChars) {
      throw new QueueError('RESULT_TOO_LARGE', 'result exceeds the size limit');
    }
    job.status = 'done';
    job.result = result ?? null;
    job.deviceId = null;
    job.leaseUntil = 0;
    return { id, status: job.status };
  }

  function fail(deviceId, id, { code = 'FAILED', message = '' } = {}) {
    const job = holds(deviceId, id);
    job.deviceId = null;
    job.leaseUntil = 0;
    job.error = {
      code: String(code).slice(0, 40),
      message: String(message).slice(0, limits.maxErrorChars),
    };
    job.status = job.attempts >= limits.maxAttempts ? 'failed' : 'queued';
    return { id, status: job.status };
  }

  function status(ownerId, id) {
    const job = jobs.get(id);
    if (!job || job.ownerId !== ownerId) return null;
    expire(now());
    return { id, action: job.action, status: job.status, attempts: job.attempts, result: job.result, error: job.error };
  }

  return { enqueue, issueDevice, authenticate, revokeDevice, claim, complete, fail, status, expire };
}
