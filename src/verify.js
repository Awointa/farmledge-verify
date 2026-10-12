// The proof check, in the browser. The same algorithm as
// scripts/verify_proof.py, in the same order, with the same outcome codes;
// test/conformance.test.js runs both on every fixture and fails on any
// disagreement. It reads only the chain, through the RPC the page is
// configured with: never the RPC a bundle names.
import { BadInput, concat, equal, fromHex, sv, toHex, u32 } from './xdr.js';
import { ChainUnreadable, PERSISTENT, TEMPORARY, latestLedger, readEntries } from './rpc.js';

/** `verified` is true for exactly two codes. Nothing else may render as verified. */
export const OUTCOMES = Object.freeze({
  OK: { verified: true, exit: 0 },
  DAY_ROOT_EXPIRED: { verified: true, exit: 0 },
  NOT_YET_ANCHORED: { verified: false, exit: 2 },
  PROOF_DOES_NOT_FIT: { verified: false, exit: 1 },
  DAY_IN_FUTURE: { verified: false, exit: 1 },
  DAY_ROOT_DIFFERS: { verified: false, exit: 1 },
  NO_HEAD: { verified: false, exit: 1 },
  HEAD_MISMATCH: { verified: false, exit: 1 },
  BAD_BUNDLE: { verified: false, exit: 4 },
  COULD_NOT_CHECK: { verified: false, exit: 3 },
  // The page's own gate, before any check: verify_proof.py has no notion of
  // which network a page is for.
  WRONG_NETWORK: { verified: false, exit: null },
});

const LEAF = {
  version: 'u32', kind: 'u32', warehouse_id: 'symbol', day: 'u32',
  index: 'u32', deposit_no: 'u64', deposit_id: 'string', receipt_id: 'u64',
  receipt_version: 'u32', owner: 'address', commodity: 'symbol',
  grade: 'symbol', kg: 'u64', bags: 'u32', moisture_bps: 'u32',
  custodian: 'address', verifier: 'address', deposited_at: 'u64',
  at: 'u64', salt: 'bytes',
};

class Outcome extends Error {
  constructor(code, detail = '') { super(detail); this.code = code; }
}

const sha = async (...parts) => new Uint8Array(await crypto.subtle.digest('SHA-256', concat(...parts)));

export function leafXdr(leaf) {
  const f = {};
  for (const [k, t] of Object.entries(LEAF)) f[k] = sv(t, t === 'bytes' ? fromHex(leaf[k]) : leaf[k]);
  f.weight_source = sv('vec', [sv('symbol', leaf.weight_source)]);
  return sv('map', f);
}

export const leafHash = async (leaf) => sha(Uint8Array.of(0), leafXdr(leaf));

export async function fold(h, index, proof) {
  let i = BigInt(index);
  for (const sib of proof) {
    h = i % 2n === 0n ? await sha(Uint8Array.of(1), h, sib) : await sha(Uint8Array.of(1), sib, h);
    i /= 2n;
  }
  return h;
}

export const chain = (prev, day, leaves, root) => sha(prev, u32(day), u32(leaves), root);

/**
 * JSON.parse that keeps integers exact, as Python's json does: every integer
 * literal becomes a BigInt, and 1000.0 stays a float. Needs JSON.parse's
 * source text access; a browser without it cannot read a bundle exactly.
 */
export function parseJson(text) {
  let exact = true;
  const value = JSON.parse(text, (k, v, ctx) => {
    if (typeof v !== 'number') return v;
    if (!ctx || typeof ctx.source !== 'string') { exact = false; return v; }
    return /^-?(0|[1-9][0-9]*)$/.test(ctx.source) ? BigInt(ctx.source) : v;
  });
  if (!exact) throw new ChainUnreadable('this browser cannot read numbers exactly; use a current browser or verify_proof.py');
  return value;
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x) => typeof x === 'bigint';

function result(code, detail, facts, endpoint) {
  // A check that could not run has no facts to show: nothing that could pass for a result.
  const shown = code === 'COULD_NOT_CHECK' ? {} : { ...facts };
  return Object.freeze({ code, verified: OUTCOMES[code].verified, detail: detail ?? '', facts: Object.freeze(shown), endpoint });
}

/**
 * Checks a bundle (already parsed with parseJson) against the chain.
 * ctx: { rpcUrl, contractId, fetch?, timeoutMs? }. Never throws: every
 * failure is an outcome, and a chain that cannot be read is COULD_NOT_CHECK.
 */
export async function verifyBundle(b, ctx) {
  const facts = { rpcUrl: ctx.rpcUrl };
  // The endpoint is the page's configuration. The bundle's rpc is a
  // suggestion from whoever made it: shown beside the one used, never dialled.
  const suggested = isObject(b) && typeof b.rpc === 'string' ? b.rpc : null;
  const endpoint = Object.freeze({ used: ctx.rpcUrl, suggested });
  try {
    if (!isObject(b)) return result('BAD_BUNDLE', 'not a JSON object', facts, endpoint);
    if (b.contract_id !== ctx.contractId) {
      return result('WRONG_NETWORK', `the bundle is for contract ${String(b.contract_id)}; this page checks ${ctx.contractId}`, facts, endpoint);
    }
    return result(await check(b, ctx, facts), '', facts, endpoint);
  } catch (e) {
    if (e instanceof Outcome) return result(e.code, e.message, facts, endpoint);
    // Anything unforeseen, above all in what the chain returned: no result.
    return result('COULD_NOT_CHECK', e.message, {}, endpoint);
  }
}

async function check(b, ctx, facts) {
  let leaf, proof, day, n, idx, h, prev, later, wh;
  const laterDays = 'later_days' in b ? b.later_days : [];
  // THE SOLE SHAPE GATE. This try block is the only thing standing between a
  // malformed bundle and the chain reads: every BAD_BUNDLE fixture (wrong
  // shape, null later_days, float or boolean integers, bad strkeys, short
  // hashes, out-of-range numbers, invalid Unicode) is caught here, as a
  // BadInput or a TypeError. verify_proof.py has an explicit shape check
  // first; here a wrong shape fails a line or two later with the same
  // outcome. Do not narrow the catch below without adding that check back.
  try {
    leaf = b.leaf;
    proof = b.proof.map(fromHex);
    [day, n, idx] = [leaf.day, b.day_leaves, leaf.index];
    const ints = [day, n, idx, ...Object.entries(LEAF).filter(([, t]) => t === 'u32' || t === 'u64').map(([k]) => leaf[k])];
    for (const d of laterDays) ints.push(d.day, d.leaves);
    if (!ints.every(isInt)) throw new BadInput('integer fields must be JSON integers');
    h = await leafHash(leaf);
    prev = fromHex(b.prev_head);
    later = laterDays.map((d) => [d.day, d.leaves, fromHex(d.root)]);
    for (const d of later) await chain(prev, ...d); // rejects days or counts that are not u32
    if ([...proof, prev, ...later.map((d) => d[2])].some((x) => x.length !== 32)) throw new BadInput('hashes are 32 bytes');
    wh = sv('symbol', leaf.warehouse_id);
  } catch (e) {
    if (e instanceof BadInput || e instanceof TypeError) throw new Outcome('BAD_BUNDLE', e.message);
    throw e;
  }
  if (!(n >= 1n && n <= 2n ** 20n)) throw new Outcome('PROOF_DOES_NOT_FIT', `${n} leaves`);
  if (BigInt(proof.length) !== BigInt((n - 1n).toString(2).replace(/^0$/, '').length)) throw new Outcome('PROOF_DOES_NOT_FIT', `${proof.length} siblings for ${n} leaves`);
  if (!(idx >= 0n && idx < n)) throw new Outcome('PROOF_DOES_NOT_FIT', `index ${idx} of ${n}`);
  const root = await fold(h, idx, proof);
  Object.assign(facts, { leafHash: toHex(h), root: toHex(root), warehouseId: leaf.warehouse_id, day: Number(day) });

  try {
    // The latest anchored day is in the warehouse's head; today is the chain's.
    const [head] = await readEntries(ctx, ctx.contractId, [{ key: sv('vec', [sv('symbol', 'Head'), wh]), durability: PERSISTENT }]);
    if (head === null) throw new Outcome('NO_HEAD', leaf.warehouse_id);
    const [lastDay, onChainHead] = vec2(head.value, 'number', 'bytes');
    const today = Math.floor((await latestLedger(ctx)).closeTime / 86400);
    Object.assign(facts, { lastAnchoredDay: lastDay, chainDay: today, headLedger: head.ledger, headArchived: head.archived });
    if (day > BigInt(today)) throw new Outcome('DAY_IN_FUTURE', `day ${day}`);
    if (day > BigInt(lastDay)) throw new Outcome('NOT_YET_ANCHORED', `day ${day}, last anchored ${lastDay}`);

    const [dayRoot] = await readEntries(ctx, ctx.contractId, [{ key: sv('vec', [sv('symbol', 'DayRoot'), wh, sv('u32', day)]), durability: TEMPORARY }]);
    if (dayRoot !== null) {
      const [onChainRoot, leaves] = vec2(dayRoot.value, 'bytes', 'number');
      facts.dayRoot = { root: toHex(onChainRoot), leaves, ledger: dayRoot.ledger };
      if (!(equal(onChainRoot, root) && BigInt(leaves) === n)) throw new Outcome('DAY_ROOT_DIFFERS', `day ${day}: on-chain ${toHex(onChainRoot)}, ${leaves} leaves`);
    }

    // The head commits to every anchored day: recompute it from this day on.
    let hd = await chain(prev, day, n, root);
    for (const d of later) hd = await chain(hd, ...d);
    if (!equal(hd, onChainHead)) {
      throw new Outcome('HEAD_MISMATCH', later.length === 0 && BigInt(lastDay) !== day
        ? 'later_days is missing the anchors after this day' : `on-chain head ${toHex(onChainHead)}`);
    }
    facts.head = toHex(onChainHead);
    return dayRoot !== null ? 'OK' : 'DAY_ROOT_EXPIRED';
  } catch (e) {
    if (e instanceof ChainUnreadable) throw new Outcome('COULD_NOT_CHECK', e.message);
    throw e;
  }
}

/** A two-element Vec of the given types, as verify_proof.py's vec_of() unpacks it. */
function vec2(v, ...types) {
  const ok = Array.isArray(v) && v.length === 2 && v.every((x, i) =>
    types[i] === 'bytes' ? x instanceof Uint8Array && x.length === 32 : typeof x === 'number');
  if (!ok) throw new ChainUnreadable('unexpected value shape');
  return v;
}
