// Shared byte-level image helpers (no dependencies, no imports of its own, so the editing engine,
// the upscaler and the worker can all use them without an import cycle).

/** The biggest picture Hermes will carry into or out of an edit (Telegram and the KV both stay sane). */
export const EDIT_MAX_BYTES = 8 * 1024 * 1024;

const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** JPEG dimensions from the SOFn frame header. Scanning stops at the image data. */
function jpegInfo(b) {
  const end = Math.min(b.length - 8, 1 << 20);
  let i = 2;
  while (i < end) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    if (marker === 0xda) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) break;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame && i + 8 < b.length) return { mime: 'image/jpeg', height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return { mime: 'image/jpeg', width: 0, height: 0 };
}

/** WebP dimensions for the three container flavours. */
function webpInfo(b) {
  const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (kind === 'VP8X') return { mime: 'image/webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  if (kind === 'VP8 ') return { mime: 'image/webp', width: ((b[26] | (b[27] << 8)) & 0x3fff), height: ((b[28] | (b[29] << 8)) & 0x3fff) };
  if (kind === 'VP8L') { const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  return { mime: 'image/webp', width: 0, height: 0 };
}

/**
 * Real dimensions and format of an encoded image, or null when the bytes are not an image we know.
 * This is how the pipeline proves that a provider returned actual pixels of a sane size.
 */
export function imageInfo(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const info = { mime: 'image/png', width: be32(b, 16), height: be32(b, 20) };
    return info.width && info.height ? info : null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) { const info = jpegInfo(b); return info.width ? info : null; }
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const info = webpInfo(b); return info.width ? info : null;
  }
  return null;
}

/** How far the delivered frame drifted from the original, in percent of aspect ratio. */
export function frameDrift(before, after) {
  if (!before || !after || !before.width || !after.width || !before.height || !after.height) return 0;
  const a = before.width / before.height, b = after.width / after.height;
  return Math.abs(a - b) / a * 100;
}

/** MIME type guessed from the magic bytes (fallback when a provider does not say). */
export const mimeOf = (bytes) => (bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png'
  : bytes[0] === 0x52 && bytes[1] === 0x49 ? 'image/webp' : 'image/jpeg');

/** base64 (as every image API speaks) to raw bytes. */
export const base64Bytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Raw bytes to base64, in chunks so big pictures do not blow the call stack. */
export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Persian digits for anything a user reads. */
export const faDigits = (v) => String(v).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
