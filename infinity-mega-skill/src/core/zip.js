// Minimal ZIP writer (STORE, no compression, UTF-8 names). ~120 lines instead of a 30 KB dependency.
//
// Used for one thing: take the workspace out of the browser as a real .zip that opens everywhere —
// Finder, Explorer, `unzip`, Netlify Drop. CRC32 is the only subtle part and it is table-driven.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE 802.3) of a byte array. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = (s) => new TextEncoder().encode(s);

function dosDateTime(date = new Date()) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

/**
 * Build a zip file in memory.
 * @param {Array<{path:string, content:string|Uint8Array}>} files
 * @param {{date?: Date}} [opts]
 * @returns {Blob|Uint8Array} Blob in the browser, Uint8Array in Node
 */
export function buildZipBytes(files, { date = new Date() } = {}) {
  const { time, day } = dosDateTime(date);
  const entries = [];
  const chunks = [];
  let offset = 0;

  for (const file of files) {
    const raw = String(file.path ?? '');
    // A zip entry named "/etc/passwd" or "../x" can be extracted outside the chosen folder
    // (zip-slip). The workspace already refuses such paths; the writer refuses them too.
    if (!raw || raw.includes('..') || /^[a-zA-Z]:[\\/]/.test(raw)) {
      throw new Error(`unsafe zip entry: ${raw}`);
    }
    const nameBytes = enc(raw.replace(/^\/+/, ''));
    const data = typeof file.content === 'string' ? enc(file.content) : file.content;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);
    entries.push({ nameBytes, crc, size: data.length, offset });
    offset += local.length + data.length;
  }

  const centralStart = offset;
  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true); // central directory signature
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, time, true);
    dv.setUint16(14, day, true);
    dv.setUint32(16, entry.crc, true);
    dv.setUint32(20, entry.size, true);
    dv.setUint32(24, entry.size, true);
    dv.setUint16(28, entry.nameBytes.length, true);
    dv.setUint16(30, 0, true); // extra
    dv.setUint16(32, 0, true); // comment
    dv.setUint16(34, 0, true); // disk
    dv.setUint16(36, 0, true); // internal attrs
    dv.setUint32(38, 0, true); // external attrs
    dv.setUint32(42, entry.offset, true);
    cd.set(entry.nameBytes, 46);
    chunks.push(cd);
    offset += cd.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, offset - centralStart, true);
  ev.setUint32(16, centralStart, true);
  chunks.push(end);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}

/** The download helper wants a Blob; everywhere else wants bytes. Both come from one builder. */
export function makeZip(files, { date = new Date() } = {}) {
  const out = buildZipBytes(files, { date });
  if (typeof Blob !== 'undefined') return new Blob([out], { type: 'application/zip' });
  return out;
}

/** Bytes of a zip made from a path -> text map. */
export function zipBytes(files, opts = {}) {
  return buildZipBytes(Object.entries(files).map(([path, content]) => ({ path, content })), opts);
}
