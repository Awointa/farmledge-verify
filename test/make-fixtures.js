// Writes test/fixtures/*.json: proof bundles and the chain state each is
// checked against, built with the Stellar SDK. Every fixture is synthetic
// test data for the test suite only; the page never loads them.
//
//     node test/make-fixtures.js          (re-generate; the output is deterministic)
//
// test/fixtures.test.js fails if the committed files differ from what this writes.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StrKey } from '@stellar/stellar-base';
import {
  CONTRACT, account, chainHead, headEntryRaw, scv, dayRootEntry, headEntry, indexEntry, pagesEntry, receiptEntry, sha, tree,
} from './support/sdk.js';

export const DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));
const WH = 'FIXTURE_WH';
const DAY = 20700;
const TODAY = 20738;
const N = 5; // not a power of two, so the padding is exercised
const LATEST = 5_100_000;
const PREV = sha(Buffer.from('fixture:prev_head'));
const OWNER = account('owner');
const LENDER = account('lender');

function leaf(i, day = DAY) {
  return {
    version: 1, kind: i < 3 ? 0 : 2, warehouse_id: WH, day, index: i,
    deposit_no: 100 + i, deposit_id: `FIXTURE-LOT-${100 + i}`, receipt_id: 0, receipt_version: 0,
    owner: OWNER, commodity: 'MAIZE_WHITE', grade: 'GRADE_1', kg: 4000, weight_source: 'Scale',
    bags: 40, moisture_bps: 1250, custodian: account('custodian'), verifier: account('verifier'),
    deposited_at: day * 86400 + 36000, at: day * 86400 + 36000 + i,
    salt: sha(Buffer.from(`fixture:salt:${day}:${i}`)).toString('hex'),
  };
}

const LEAVES = Array.from({ length: N }, (_, i) => leaf(i));
const { root: ROOT, proofs: PROOFS } = tree(LEAVES);
const HEAD = chainHead(PREV, DAY, N, ROOT);
const LATER_ROOT = sha(Buffer.from('fixture:later-root'));
const LATER = { day: DAY + 35, leaves: 3, root: LATER_ROOT.toString('hex') };
const HEAD_LATER = chainHead(HEAD, LATER.day, LATER.leaves, LATER_ROOT);

function bundle(i = 1, over = {}) {
  return {
    rpc: 'https://rpc.example.invalid', contract_id: CONTRACT, leaf: structuredClone(LEAVES[i]),
    proof: PROOFS[i].map((p) => p.toString('hex')), day_leaves: N,
    prev_head: PREV.toString('hex'), later_days: [], ...over,
  };
}

const fresh = () => [headEntry(WH, DAY, HEAD), dayRootEntry(WH, DAY, ROOT, N)];
const expired = (opts) => [headEntry(WH, LATER.day, HEAD_LATER, opts)];
const chain = (entries, more = {}) => ({ closeTime: TODAY * 86400 + 3600, latestLedger: LATEST, entries, ...more });
const tamper = (b, f) => { f(b); return b; };

// The lot's receipts, for the claims fixtures: 4,000 kg minted, then split.
const due = 1_796_947_200;
const lock = { lender: LENDER, loanRef: 'FIXTURE-LOAN-REF-MUST-NOT-SHOW', dueDate: due, gracePeriod: 14 * 86400 };
const r = (id, status, kg, extra = {}) => ({ id, status, kg, warehouseId: WH, depositNo: 101, depositId: 'FIXTURE-LOT-101', owner: OWNER, ...extra });
const receipts = (rs, opts = {}) => [
  pagesEntry(WH, 1),
  indexEntry(WH, 0, [...rs.map((x) => x.id), 999]),
  ...rs.map((x) => receiptEntry(x, opts[x.id])),
  receiptEntry({ ...r(999, 'Active', 7000), depositNo: 555, depositId: 'FIXTURE-OTHER-LOT' }), // another lot: never counted
];

export const FIXTURES = {
  // --- verification outcomes: both verifiers must agree on every one ----
  'valid': { description: 'genuine bundle, day root on chain', expect: 'OK', bundle: bundle(), chain: chain(fresh()) },
  'valid-every-index': { description: 'genuine bundle for the last leaf, beside the padding', expect: 'OK', bundle: bundle(4), chain: chain(fresh()) },
  'valid-single-leaf-day': (() => {
    const l = { ...leaf(0), day: DAY };
    const t = tree([l]);
    const h = chainHead(PREV, DAY, 1, t.root);
    return { description: 'a one-leaf day: empty proof', expect: 'OK',
      bundle: { ...bundle(0), leaf: l, proof: [], day_leaves: 1 }, chain: chain([headEntry(WH, DAY, h), dayRootEntry(WH, DAY, t.root, 1)]) };
  })(),
  'valid-root-expired': { description: 'day root gone after 30 days; verified through the head chain', expect: 'DAY_ROOT_EXPIRED',
    bundle: bundle(1, { later_days: [LATER] }), chain: chain(expired()) },
  'valid-head-archived': { description: "the warehouse's head is archived (liveUntil 0): archived is not invalid", expect: 'OK',
    bundle: bundle(), chain: chain([headEntry(WH, DAY, HEAD, { liveUntil: 0 }), dayRootEntry(WH, DAY, ROOT, N)]) },
  'tampered-leaf': { description: 'weight altered on a fresh day', expect: 'DAY_ROOT_DIFFERS',
    bundle: tamper(bundle(), (b) => { b.leaf.kg += 1000; }), chain: chain(fresh()) },
  'tampered-leaf-owner': { description: 'owner swapped on a fresh day', expect: 'DAY_ROOT_DIFFERS',
    bundle: tamper(bundle(), (b) => { b.leaf.owner = account('impostor'); }), chain: chain(fresh()) },
  'tampered-leaf-expired': { description: 'grade altered, day root expired', expect: 'HEAD_MISMATCH',
    bundle: tamper(bundle(1, { later_days: [LATER] }), (b) => { b.leaf.grade = 'GRADE_2'; }), chain: chain(expired()) },
  'tampered-path': { description: 'one sibling hash altered', expect: 'DAY_ROOT_DIFFERS',
    bundle: tamper(bundle(), (b) => { b.proof[1] = 'ff'.repeat(32); }), chain: chain(fresh()) },
  'tampered-index': { description: "the leaf's index moved within the tree", expect: 'DAY_ROOT_DIFFERS',
    bundle: tamper(bundle(), (b) => { b.leaf.index = 0; }), chain: chain(fresh()) },
  'wrong-root': { description: 'the chain holds a different root for the day', expect: 'DAY_ROOT_DIFFERS',
    bundle: bundle(), chain: chain([headEntry(WH, DAY, HEAD), dayRootEntry(WH, DAY, sha(Buffer.from('other')), N)]) },
  'wrong-leaf-count': { description: 'the chain holds a different leaf count for the day', expect: 'DAY_ROOT_DIFFERS',
    bundle: bundle(), chain: chain([headEntry(WH, DAY, HEAD), dayRootEntry(WH, DAY, ROOT, 6)]) },
  'unchained-root': { description: 'the root is on chain but the claimed chain to it is not', expect: 'HEAD_MISMATCH',
    bundle: bundle(1, { prev_head: '11'.repeat(32) }), chain: chain(fresh()) },
  'later-days-missing': { description: 'an old bundle without the later anchors', expect: 'HEAD_MISMATCH',
    bundle: bundle(), chain: chain([...expired(), dayRootEntry(WH, DAY, ROOT, N)]) },
  'later-days-tampered': { description: 'a later root altered', expect: 'HEAD_MISMATCH',
    bundle: bundle(1, { later_days: [{ ...LATER, root: '22'.repeat(32) }] }), chain: chain(expired()) },
  'not-yet-anchored': { description: "the warehouse has not anchored the leaf's day yet", expect: 'NOT_YET_ANCHORED',
    bundle: bundle(), chain: chain([headEntry(WH, DAY - 1, sha(Buffer.from('yesterday')))]) },
  'day-in-future': { description: "the leaf's day is after the chain's day", expect: 'DAY_IN_FUTURE',
    bundle: bundle(), chain: chain([headEntry(WH, DAY - 1, sha(Buffer.from('yesterday')))], { closeTime: (DAY - 1) * 86400 + 60 }) },
  'no-head': { description: 'the warehouse never anchored anything', expect: 'NO_HEAD', bundle: bundle(), chain: chain([]) },
  'short-proof': { description: 'a sibling missing', expect: 'PROOF_DOES_NOT_FIT',
    bundle: tamper(bundle(), (b) => { b.proof.pop(); }), chain: chain(fresh()) },
  'index-outside-day': { description: 'an index beyond the day\'s leaves', expect: 'PROOF_DOES_NOT_FIT',
    bundle: tamper(bundle(), (b) => { b.leaf.index = N; }), chain: chain(fresh()) },
  'zero-leaves': { description: 'day_leaves 0', expect: 'PROOF_DOES_NOT_FIT', bundle: bundle(1, { day_leaves: 0 }), chain: chain(fresh()) },
  'too-many-leaves': { description: 'day_leaves above 2^20', expect: 'PROOF_DOES_NOT_FIT',
    bundle: bundle(1, { day_leaves: 2 ** 20 + 1, proof: Array(21).fill('00'.repeat(32)) }), chain: chain(fresh()) },
  'slip-leaf-as-bundle': { description: 'a counter-slip leaf (index null) inside a bundle', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.leaf.index = null; }), chain: chain(fresh()) },
  'other-strkey-type': { description: 'an owner that is a valid strkey of another type (pre-auth tx)', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.leaf.owner = StrKey.encodePreAuthTx(sha(Buffer.from('fixture:preauth'))); }), chain: chain(fresh()) },
  'bad-address': { description: 'an owner strkey with a broken checksum', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.leaf.owner = `${b.leaf.owner.slice(0, -1)}${b.leaf.owner.endsWith('A') ? 'B' : 'A'}`; }), chain: chain(fresh()) },
  'long-address': { description: 'an owner strkey with an extra character: same key, not its spelling', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.leaf.owner = `${b.leaf.owner}A`; }), chain: chain(fresh()) },
  'float-integer': { description: 'kg written as 4000.0', expect: 'BAD_BUNDLE',
    bundleText: JSON.stringify(bundle()).replace('"kg":4000', '"kg":4000.0'), chain: chain(fresh()) },
  'bool-integer': { description: 'bags written as true', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.leaf.bags = true; }), chain: chain(fresh()) },
  'short-hash': { description: 'a 31-byte sibling', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.proof[0] = b.proof[0].slice(2); }), chain: chain(fresh()) },
  'null-later-days': { description: 'later_days null', expect: 'BAD_BUNDLE', bundle: bundle(1, { later_days: null }), chain: chain(fresh()) },
  'missing-field': { description: 'the leaf has no salt', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { delete b.leaf.salt; }), chain: chain(fresh()) },
  'u32-overflow': { description: 'bags above 2^32', expect: 'BAD_BUNDLE',
    bundle: tamper(bundle(), (b) => { b.leaf.bags = 2 ** 32; }), chain: chain(fresh()) },
  'big-u64-exact': { description: 'deposited_at above 2^53, read exactly: still a genuine-looking leaf, wrong for this day', expect: 'DAY_ROOT_DIFFERS',
    bundleText: JSON.stringify(bundle()).replace(/"deposited_at":\d+/, '"deposited_at":18446744073709551615'), chain: chain(fresh()) },
  'not-an-object': { description: 'a JSON array', expect: 'BAD_BUNDLE', bundleText: '[1, 2]', chain: chain(fresh()) },
  'later-day-overflow': { description: 'a later day above 2^32', expect: 'BAD_BUNDLE',
    bundle: bundle(1, { later_days: [{ ...LATER, day: 2 ** 32 }] }), chain: chain(expired()) },
  'lone-surrogate': { description: 'a deposit id that is not valid Unicode', expect: 'BAD_BUNDLE',
    bundleText: JSON.stringify(bundle()).replace('"deposit_id":"FIXTURE-LOT-101"', '"deposit_id":"FIXTURE-\\ud800"'), chain: chain(fresh()) },
  'u64-negative': { description: 'kg below zero', expect: 'BAD_BUNDLE', bundle: tamper(bundle(), (b) => { b.leaf.kg = -1; }), chain: chain(fresh()) },
  'not-json': { description: 'truncated JSON', expect: 'BAD_BUNDLE', bundleText: JSON.stringify(bundle()).slice(0, 80), chain: chain(fresh()) },
  'rpc-http-error': { description: 'HTTP 500 (with a body that would verify)', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'http500' }) },
  'rpc-html': { description: 'a proxy error page', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'html' }) },
  'rpc-jsonrpc-error': { description: 'a JSON-RPC error (beside a result that would verify)', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'jsonrpc' }) },
  'rpc-no-result': { description: 'a reply with neither result nor error', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'noresult' }) },
  'rpc-refused': { description: 'nothing listening', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'refused' }) },
  'rpc-timeout': { description: 'the RPC never answers', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'hang' }) },
  'rpc-fails-midway': { description: 'the head reads, then the RPC fails', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'after1' }) },
  'rpc-bad-layout': { description: "another warehouse's entries, served for this one's keys", expect: 'COULD_NOT_CHECK', bundle: bundle(),
    chain: chain(fresh(), { fail: 'badlayout', decoys: {
      [headEntry(WH, DAY, HEAD).key]: headEntry('DECOY_WH_X', DAY, HEAD).xdr, // same length as FIXTURE_WH
      [dayRootEntry(WH, DAY, ROOT, N).key]: dayRootEntry('DECOY_WH_X', DAY, ROOT, N).xdr } }) },
  'rpc-trailing-bytes': { description: 'entries with bytes after the value', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'trailing' }) },
  'rpc-head-short-hash': { description: 'a head holding a 20-byte hash', expect: 'COULD_NOT_CHECK', bundle: bundle(),
    chain: chain(fresh(), { fail: 'shape', shapes: { [headEntry(WH, DAY, HEAD).key]: headEntryRaw(WH, scv('vec', [scv('u32', DAY), scv('bytes', HEAD.subarray(0, 20))])).xdr } }) },
  'rpc-head-wrong-type': { description: 'a head holding two numbers', expect: 'COULD_NOT_CHECK', bundle: bundle(),
    chain: chain(fresh(), { fail: 'shape', shapes: { [headEntry(WH, DAY, HEAD).key]: headEntryRaw(WH, scv('vec', [scv('u32', DAY), scv('u32', 1)])).xdr } }) },
  'rpc-truncated': { description: 'an entry cut short', expect: 'COULD_NOT_CHECK', bundle: bundle(), chain: chain(fresh(), { fail: 'truncated' }) },

  // --- receipt claims: verification is OK; the claims are a separate read --
  'claims-active': { description: 'one unencumbered receipt', expect: 'OK', bundle: bundle(), chain: chain([...fresh(), ...receipts([r(1, 'Active', 4000)])]),
    claims: { statuses: { 1: 'Active' }, kg: { total: 4000, Active: 4000 }, recovery: false, archived: false } },
  'claims-pledged': { description: 'split: part pledged, part free, part exited', expect: 'OK',
    bundle: bundle(), chain: chain([...fresh(), ...receipts([r(1, 'Active', 2400), r(2, 'Pledged', 1200, { parentId: 1, lock }), r(3, 'Exited', 400, { parentId: 1, exitDate: 1_791_000_000, exitWeightKg: 398 })])]),
    claims: { statuses: { 1: 'Active', 2: 'Pledged', 3: 'Exited' }, kg: { total: 4000, Active: 2400, Pledged: 1200, Exited: 400 }, recovery: false, archived: false } },
  'claims-recovery': { description: 'a lender has begun recovery against part of the lot', expect: 'OK',
    bundle: bundle(), chain: chain([...fresh(), ...receipts([r(1, 'Active', 3000), r(2, 'Recovery', 1000, { parentId: 1, lock })])]),
    claims: { statuses: { 1: 'Active', 2: 'Recovery' }, kg: { total: 4000, Active: 3000, Recovery: 1000 }, recovery: true, archived: false } },
  'claims-exited': { description: 'the whole lot released', expect: 'OK',
    bundle: bundle(), chain: chain([...fresh(), ...receipts([r(1, 'Exited', 4000, { exitDate: 1_791_000_000, exitWeightKg: 3990 })])]),
    claims: { statuses: { 1: 'Exited' }, kg: { total: 4000, Exited: 4000 }, recovery: false, archived: false } },
  'claims-revoked': { description: 'the receipt voided by the admin', expect: 'OK',
    bundle: bundle(), chain: chain([...fresh(), ...receipts([r(1, 'Revoked', 4000)])]),
    claims: { statuses: { 1: 'Revoked' }, kg: { total: 4000, Revoked: 4000 }, recovery: false, archived: false } },
  'claims-archived': { description: 'an exited receipt left to archive (liveUntil 0)', expect: 'OK',
    bundle: bundle(), chain: chain([...fresh(), ...receipts([r(1, 'Active', 3000), r(2, 'Exited', 1000, { parentId: 1, exitDate: 1_791_000_000 })], { 2: { liveUntil: 0 } })]),
    claims: { statuses: { 1: 'Active', 2: 'Exited' }, kg: { total: 4000, Active: 3000, Exited: 1000 }, recovery: false, archived: true } },
  'claims-none': { description: 'no receipt minted for the lot', expect: 'OK', bundle: bundle(), chain: chain([...fresh(), ...receipts([])]),
    claims: { statuses: {}, kg: { total: 0 }, recovery: false, archived: false } },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  for (const [name, f] of Object.entries(FIXTURES)) {
    const { bundle: b, bundleText, ...rest } = f;
    const out = { name, ...rest, bundleText: bundleText ?? JSON.stringify(b, null, 2) };
    writeFileSync(`${DIR}${name}.json`, `${JSON.stringify(out, null, 2)}\n`);
  }
  console.log(`wrote ${readdirSync(DIR).length} fixtures to ${DIR}`);
}
