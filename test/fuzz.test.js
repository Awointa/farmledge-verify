// Differential fuzz of the hand-rolled XDR (src/xdr.js) against the Stellar
// SDK, and of verify_proof.py's encoder against both. Every verification
// rests on these bytes being identical.
//
// Each run uses a fixed seed and a random one, FUZZ_CASES cases each
// (default 10,000). Reproduce a failure with FUZZ_SEED=<seed>.
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { StrKey, xdr } from '@stellar/stellar-base';

import { sv, toHex } from '../src/xdr.js';
import { leafXdr } from '../src/verify.js';
import { leafScVal } from './support/sdk.js';

const CASES = Number(process.env.FUZZ_CASES ?? 10_000);
const FIXED_SEED = 0x5eed_f00d;
const SEEDS = process.env.FUZZ_SEED ? [Number(process.env.FUZZ_SEED)] : [FIXED_SEED, randomInt(2 ** 31)];
const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url));

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (xs) => xs[int(xs.length)];
  const bytes = (n) => Uint8Array.from({ length: n }, () => int(256));
  const big = (bits) => { let v = 0n; for (let i = 0; i < bits; i += 16) v = (v << 16n) | BigInt(int(2 ** 16)); return v & ((1n << BigInt(bits)) - 1n); };
  return { int, pick, bytes, big };
}

const SYMBOL_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
// One, two, three and four UTF-8 bytes; U+E000..U+FFFF sort after astral
// characters by UTF-16 code unit but before them by code point and by byte.
const CHARS = ['a', 'Z', '_', '-', ' ', '0', 'é', 'ß', 'ŋ', '中', '\u{E000}', '\u{FFFD}', '\u{FF21}', '😀', '\u{10000}', '\u{1F33E}', '\u{10FFFF}'];

function gen(r) {
  const u32 = () => r.pick([0n, 1n, 2n ** 32n - 1n, 2n ** 31n, r.big(32)]);
  const u64 = () => r.pick([0n, 1n, 2n ** 64n - 1n, 2n ** 53n, 2n ** 53n + 1n, 2n ** 63n, r.big(64), r.big(32)]);
  const symbol = () => {
    const n = r.pick([0, 1, 32, r.int(33)]);
    return Array.from({ length: n }, () => r.pick([...SYMBOL_CHARS])).join('');
  };
  const string = () => {
    const n = r.pick([0, 1, 64, r.int(80), r.int(300)]);
    return Array.from({ length: n }, () => r.pick(CHARS)).join('');
  };
  const address = () => (r.int(2) ? StrKey.encodeEd25519PublicKey(Buffer.from(r.bytes(32))) : StrKey.encodeContract(Buffer.from(r.bytes(32))));
  return {
    version: u32(), kind: u32(), warehouse_id: symbol(), day: u32(), index: u32(),
    deposit_no: u64(), deposit_id: string(), receipt_id: u64(), receipt_version: u32(),
    owner: address(), commodity: symbol(), grade: symbol(), kg: u64(),
    weight_source: r.pick(['Scale', 'BagEstimate']), bags: u32(), moisture_bps: u32(),
    custodian: address(), verifier: address(), deposited_at: u64(), at: u64(),
    salt: toHex(r.bytes(r.pick([32, 32, 32, 0, 1, 31, 33, 64]))),
  };
}

/** A map whose keys sort differently by UTF-16 code unit than by byte. */
function genMap(r) {
  const keys = new Set();
  const n = 1 + r.int(8);
  while (keys.size < n) {
    let k = '';
    while (new TextEncoder().encode(k).length < 1 + r.int(8)) k += r.pick(CHARS);
    if (new TextEncoder().encode(k).length <= 32) keys.add(k);
  }
  return Object.fromEntries([...keys].map((k) => [k, r.big(32)]));
}

const sdkMap = (m) => xdr.ScVal.scvMap(Object.entries(m)
  .sort(([a], [b]) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
  .map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: xdr.ScVal.scvU32(Number(v)) })));

const plain = (leaf) => JSON.parse(JSON.stringify(leaf, (k, v) => (typeof v === 'bigint' ? Number.isSafeInteger(Number(v)) ? Number(v) : String(v) : v)));
// Exact JSON for Python: integers as digits, however large.
const exactJson = (leaf) => JSON.stringify(leaf, (k, v) => (typeof v === 'bigint' ? `@@${v}@@` : v)).replace(/"@@(\d+)@@"/g, '$1');

function report(kind, seed, i, input, ours, theirs, who) {
  return `${kind} diverges at seed ${seed}, case ${i}\ninput: ${input}\nsrc/xdr.js: ${ours}\n${who}: ${theirs}`;
}

for (const seed of SEEDS) {
  test(`leaf XDR: src/xdr.js, the Stellar SDK and verify_proof.py agree on ${CASES} random leaves (seed ${seed})`, (t) => {
    t.diagnostic(`seed ${seed}${seed === FIXED_SEED ? ' (fixed)' : ' (random; reproduce with FUZZ_SEED)'}`);
    const r = rng(seed);
    const leaves = Array.from({ length: CASES }, () => gen(r));
    const ours = leaves.map((l) => toHex(leafXdr(l)));
    const failures = [];
    leaves.forEach((l, i) => {
      // The SDK side reads u64 values as decimal strings, so it is exact too.
      const theirs = leafScVal(plain(l)).toXDR('hex');
      if (ours[i] !== theirs && failures.length < 3) failures.push(report('leaf', seed, i, exactJson(l), ours[i], theirs, 'Stellar SDK'));
    });
    assert.equal(failures.length, 0, failures.join('\n\n'));

    // verify_proof.py's leaf_xdr on the same leaves, in one process.
    const dir = mkdtempSync(join(tmpdir(), 'farmledge-fuzz-'));
    try {
      writeFileSync(join(dir, 'leaves.jsonl'), leaves.map(exactJson).join('\n'));
      const py = `import json, sys\nsys.path.insert(0, sys.argv[1])\nimport verify_proof as vp\nfor line in open(sys.argv[2], encoding="utf-8"):\n    print(vp.leaf_xdr(json.loads(line)).hex())\n`;
      const out = execFileSync('python3', ['-I', '-c', py, SCRIPTS, join(dir, 'leaves.jsonl')], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim().split('\n');
      assert.equal(out.length, CASES);
      const pyFailures = [];
      out.forEach((hex, i) => { if (hex !== ours[i] && pyFailures.length < 3) pyFailures.push(report('leaf', seed, i, exactJson(leaves[i]), ours[i], hex, 'verify_proof.py')); });
      assert.equal(pyFailures.length, 0, pyFailures.join('\n\n'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`maps: keys sorted by bytes, as the SDK is given them and the host requires (seed ${seed})`, () => {
    const r = rng(seed ^ 0x9e3779b9);
    const failures = [];
    let reordered = 0;
    for (let i = 0; i < CASES; i++) {
      const m = genMap(r);
      const keys = Object.keys(m);
      const byUnit = [...keys].sort();
      const byByte = [...keys].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
      if (byUnit.join('\u0000') !== byByte.join('\u0000')) reordered++;
      const ours = toHex(sv('map', Object.fromEntries(Object.entries(m).map(([k, v]) => [k, sv('u32', v)]))));
      const theirs = sdkMap(m).toXDR('hex');
      if (ours !== theirs && failures.length < 3) failures.push(report('map', seed, i, JSON.stringify(keys), ours, theirs, 'Stellar SDK'));
    }
    assert.equal(failures.length, 0, failures.join('\n\n'));
    assert.ok(reordered > CASES / 20, `only ${reordered} maps sort differently by UTF-16 unit and by byte`);
  });
}
