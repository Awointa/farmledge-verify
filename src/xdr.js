// The XDR, strkey and hex this page needs, written out by hand so that it
// mirrors scripts/verify_proof.py line for line and loads no library. The
// Stellar SDK checks it independently in test/xdr.test.js.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ACCOUNT = 6 << 3;
const CONTRACT = 2 << 3;

export class BadInput extends Error { name = 'BadInput'; }

function crc16(bytes) { // CRC16-XModem
  let c = 0;
  for (const byte of bytes) {
    c ^= byte << 8;
    for (let i = 0; i < 8; i++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff;
  }
  return c;
}

/** G... account or C... contract -> {kind, key}; throws BadInput as verify_proof.py's strkey() exits. */
export function strkey(s) {
  if (typeof s !== 'string' || s.length !== 56) throw new BadInput(`bad address ${s}`); // one spelling per key
  let bits = '';
  for (const c of s) {
    const i = B32.indexOf(c);
    if (i < 0) throw new BadInput(`bad address ${s}`);
    bits += i.toString(2).padStart(5, '0');
  }
  const raw = [];
  for (let i = 0; i < bits.length - 7; i += 8) raw.push(parseInt(bits.slice(i, i + 8), 2));
  const body = raw.slice(0, Math.max(0, raw.length - 2));
  const tail = raw.slice(Math.max(0, raw.length - 2));
  const crc = tail.reduce((acc, b, i) => acc | (b << (8 * i)), 0);
  if (body.length === 0) throw new BadInput(`bad address ${s}`);
  const kind = body[0] === ACCOUNT ? 'account' : body[0] === CONTRACT ? 'contract' : null;
  if (crc16(body) !== crc || kind === null || body.length !== 33) throw new BadInput(`bad address ${s}`);
  return { kind, key: Uint8Array.from(body.slice(1)) };
}

/** The inverse, for addresses read from the chain. */
export function encodeStrkey(kind, key) {
  const body = [kind === 'account' ? ACCOUNT : CONTRACT, ...key];
  const crc = crc16(body);
  const raw = [...body, crc & 0xff, crc >> 8];
  let bits = raw.map((b) => b.toString(2).padStart(8, '0')).join('');
  bits = bits.padEnd(Math.ceil(bits.length / 5) * 5, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

const WHITESPACE = ' \t\n\r\x0b\x0c';
const HEX = '0123456789abcdefABCDEF';

/** Python's bytes.fromhex: pairs of hex digits, ASCII whitespace allowed between pairs. */
export function fromHex(s) {
  if (typeof s !== 'string') throw new BadInput('hex must be a string');
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (WHITESPACE.includes(s[i])) { i++; continue; }
    if (i + 1 >= s.length || !HEX.includes(s[i]) || !HEX.includes(s[i + 1])) throw new BadInput('not hex');
    out.push(parseInt(s.slice(i, i + 2), 16));
    i += 2;
  }
  return Uint8Array.from(out);
}

export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function equal(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- XDR, just the ScVal types a leaf and its keys use --------------------
export function u32(n) {
  const v = BigInt(n);
  if (v < 0n || v > 0xffffffffn) throw new BadInput(`${n} is not a u32`);
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, Number(v));
  return b;
}

export function u64(n) {
  const v = BigInt(n);
  if (v < 0n || v > 0xffffffffffffffffn) throw new BadInput(`${n} is not a u64`);
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v);
  return b;
}

const opaque = (b) => concat(u32(b.length), b, new Uint8Array((4 - (b.length % 4)) % 4));

function utf8(s) {
  if (typeof s !== 'string') throw new BadInput('expected a string');
  // Python's str.encode() refuses a lone surrogate; TextEncoder would replace it.
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s)) {
    throw new BadInput('string is not valid Unicode');
  }
  return new TextEncoder().encode(s);
}

export function address(s) {
  const { kind, key } = strkey(s);
  return kind === 'account' ? concat(u32(0), u32(0), key) : concat(u32(1), key);
}

/** ScVal, as verify_proof.py's sv(). */
export function sv(t, v) {
  switch (t) {
    case 'u32': return concat(u32(3), u32(v));
    case 'u64': return concat(u32(5), u64(v));
    case 'bytes': return concat(u32(13), opaque(v));
    case 'string': return concat(u32(14), opaque(utf8(v)));
    case 'symbol': return concat(u32(15), opaque(utf8(v)));
    case 'address': return concat(u32(18), address(v));
    case 'vec': return concat(u32(16), u32(1), u32(v.length), ...v);
    case 'map': { // keys sorted, as the host requires
      const keys = Object.keys(v).sort();
      return concat(u32(17), u32(1), u32(keys.length), ...keys.map((k) => concat(sv('symbol', k), v[k])));
    }
    default: throw new Error(`ScVal type ${t}`);
  }
}

// --- reading values back --------------------------------------------------
// Decodes the ScVal types the contract's stored entries use into plain
// values: u32 -> number, u64 -> BigInt, bytes -> Uint8Array, string and
// symbol -> string, address -> strkey, vec -> array, void -> null.
export function decodeScVal(bytes, offset = 0) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = offset;
  const need = (n) => { if (o + n > bytes.length) throw new Error('truncated XDR'); };
  const rU32 = () => { need(4); const v = dv.getUint32(o); o += 4; return v; };
  const rOpaque = () => {
    const n = rU32(); need(n + ((4 - (n % 4)) % 4));
    const b = bytes.slice(o, o + n); o += n + ((4 - (n % 4)) % 4); return b;
  };
  const rAddress = () => {
    const t = rU32();
    if (t === 0) { if (rU32() !== 0) throw new Error('key type'); need(32); const k = bytes.slice(o, o + 32); o += 32; return encodeStrkey('account', k); }
    if (t === 1) { need(32); const k = bytes.slice(o, o + 32); o += 32; return encodeStrkey('contract', k); }
    throw new Error(`ScAddress type ${t}`);
  };
  const one = () => {
    const t = rU32();
    switch (t) {
      case 0: return rU32() !== 0;
      case 1: return null;
      case 3: return rU32();
      case 5: { need(8); const v = dv.getBigUint64(o); o += 8; return v; }
      case 13: return rOpaque();
      case 14: case 15: return new TextDecoder('utf-8', { fatal: true }).decode(rOpaque());
      case 16: {
        if (rU32() !== 1) return null; // absent vec
        const n = rU32(); const out = [];
        for (let i = 0; i < n; i++) out.push(one());
        return out;
      }
      case 18: return rAddress();
      default: throw new Error(`ScVal type ${t}`);
    }
  };
  const value = one();
  return { value, end: o };
}
