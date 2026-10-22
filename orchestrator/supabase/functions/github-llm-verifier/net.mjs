// SSRF guard for the verifier's outbound probes: only public unicast hosts over HTTPS.
// Hosts come from WHATWG URL parsing, so IPv4 shorthand (2130706433, 0x7f.1) is already dotted and
// IPv6 is compressed lowercase hex — e.g. [::ffff:127.0.0.1] arrives as [::ffff:7f00:1].

function ipv4IsPublic(a, b) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-net, private, loopback, multicast/reserved
  if (a === 169 && b === 254) return false; // link-local (cloud metadata)
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

/** Expands an IPv6 literal (optionally ending in dotted IPv4) to 8 hextets, or null when malformed. */
function ipv6Hextets(host) {
  let h = host;
  const tail = h.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail) {
    const o = tail.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    h = `${h.slice(0, -tail[0].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const part = (s) => (s ? s.split(':') : []);
  const head = part(halves[0]), rest = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...rest];
  if (all.length !== 8 || all.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return all.map((x) => parseInt(x, 16));
}

export function ipIsPublic(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    return !o.some((n) => n > 255) && ipv4IsPublic(o[0], o[1]);
  }
  if (!h.includes(':')) return true; // DNS name: resolveHostPublic() checks its addresses before any fetch
  const x = ipv6Hextets(h);
  if (!x) return false;
  if (x.slice(0, 7).every((n) => n === 0)) return false; // :: and ::1
  // Embedded IPv4: mapped ::ffff:a.b.c.d, deprecated compatible ::a.b.c.d, NAT64 64:ff9b::/96.
  const mapped = x.slice(0, 5).every((n) => n === 0) && (x[5] === 0xffff || x[5] === 0);
  const nat64 = x[0] === 0x64 && x[1] === 0xff9b && x.slice(2, 6).every((n) => n === 0);
  if (mapped || nat64) return ipv4IsPublic(x[6] >> 8, x[6] & 0xff);
  if ((x[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((x[0] & 0xffc0) === 0xfe80 || (x[0] & 0xffc0) === 0xfec0) return false; // link-local, site-local
  if ((x[0] & 0xff00) === 0xff00) return false; // multicast
  if (x[0] === 0x2001 && x[1] === 0x0db8) return false; // documentation
  return true;
}

export function isSafePublicHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && ipIsPublic(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Decide whether a resolved DNS answer set is safe to connect to.
 *
 * Fails closed on purpose, because this is the DNS-rebinding guard: the same hostname can answer a
 * public address on one lookup and a private one on the next, and the connection may land on either.
 * So an empty answer set is refused (nothing was proven public), a junk entry is refused, and a
 * single private address among public ones is refused — `some` here would be the vulnerability.
 *
 * @param {unknown} answers addresses as returned by the resolver (strings, no brackets)
 * @returns {boolean} true only when every answer is a public address
 */
export function dnsAnswersArePublic(answers) {
  if (!Array.isArray(answers) || answers.length === 0) return false;
  return answers.every((ip) => typeof ip === 'string' && ip.trim() !== '' && ipIsPublic(ip.trim()));
}
