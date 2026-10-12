// The slip check. A page-level check, not a verifier result: it runs after
// verifyBundle and can only make the display stricter. verify_proof.py never
// sees a slip and cannot make it, so it has no code in OUTCOMES and the
// conformance test does not cover it (README "The slip check").
//
// A deposit is (warehouse_id, deposit_no): the key of the contract's
// duplicate guard (storage.rs claim_key), so a bare deposit number would
// match another warehouse's lot. A reprinted slip's QR links here with
//     #p=<token>&d=<warehouse_id>.<deposit_no>
// and prints the same reference, in the same form, beneath the QR. Identity
// only: every other field is already bound by the proof.

const SYMBOL = /^[A-Za-z0-9_]{1,32}$/;
const REF = /^([A-Za-z0-9_]{1,32})\.(0|[1-9][0-9]{0,19})$/;
const U64_MAX = 0xffffffffffffffffn;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

/** The one printed form of a deposit reference: WAREHOUSE_ID.123, as on the slip. */
export function formatRef(warehouseId, depositNo) {
  return `${warehouseId}.${BigInt(depositNo)}`;
}

/** A slip reference from a link, or null if it is not exactly the printed form. */
export function parseRef(text) {
  const m = typeof text === 'string' ? REF.exec(text) : null;
  if (m === null) return null;
  const depositNo = BigInt(m[2]);
  if (depositNo > U64_MAX) return null;
  return Object.freeze({ warehouseId: m[1], depositNo, text });
}

/** The reference a bundle's leaf claims, or null if the leaf has no well-formed one. */
export function leafRef(leaf) {
  if (typeof leaf?.warehouse_id !== 'string' || !SYMBOL.test(leaf.warehouse_id)) return null;
  const n = leaf.deposit_no;
  if (!(typeof n === 'bigint' || Number.isSafeInteger(n)) || n < 0 || BigInt(n) > U64_MAX) return null;
  return formatRef(leaf.warehouse_id, n);
}

/**
 * 'match' or 'mismatch' against the slip; 'none' when there is no slip
 * reference to compare. The slip is a deposit slip, so the record must be
 * the deposit itself (kind 0): the same lot's dispatch or end-of-day
 * balance carries the same reference and is not the record on the slip.
 */
export function compareSlip(slipRef, leaf) {
  if (!slipRef) return 'none';
  const sameWarehouse = leaf?.warehouse_id === slipRef.warehouseId;
  let sameNumber = false;
  let aDeposit = false;
  try {
    sameNumber = BigInt(leaf?.deposit_no) === slipRef.depositNo;
    aDeposit = BigInt(leaf?.kind) === 0n;
  } catch { /* not numbers: not the slip's */ }
  return sameWarehouse && sameNumber && aDeposit ? 'match' : 'mismatch';
}

export const isToken = (s) => typeof s === 'string' && TOKEN.test(s);

/**
 * What a link's fragment says about a slip: { token, tokenBad, ref, refText, refBad }.
 * A reference that is present but unreadable is reported, never dropped.
 */
export function slipFromFragment(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const token = q.get('p');
  const refText = q.get('d');
  const ref = refText === null ? null : parseRef(refText);
  return Object.freeze({
    token: token !== null && isToken(token) ? token : null,
    tokenBad: token !== null && !isToken(token),
    ref,
    refText,
    refBad: refText !== null && ref === null,
  });
}
