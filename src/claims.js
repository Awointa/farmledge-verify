// The claims against one lot, read from the chain: every receipt minted
// from it, with its weight and state. A lot has no single status: it may be
// part free, part pledged and part released. This is a chain read beside
// the proof check, not part of it; verify_proof.py does not read receipts.
import { sv } from './xdr.js';
import { ChainUnreadable, PERSISTENT, readEntries } from './rpc.js';

/** Contract status codes (contracts/receipt/src/layout.rs), in the words the page uses. */
export const STATUS = Object.freeze(['Active', 'Pledged', 'Recovery', 'Exited', 'Revoked']);
const DATA_VERSION = 3;

const receiptKey = (id) => sv('vec', [sv('symbol', 'Receipt'), sv('u64', id)]);

/**
 * One stored receipt (layout.rs StoredReceipt, data_version 3) as the page
 * may show it. The lock's loan_ref is deliberately dropped: it is free text
 * a lender wrote, and this page has a shareable URL (protocol issue #12).
 */
export function receiptView(id, v, archived) {
  if (!Array.isArray(v) || v.length !== 21 || v[0] !== DATA_VERSION) {
    throw new ChainUnreadable(`receipt ${id} is not a data_version ${DATA_VERSION} record`);
  }
  const status = STATUS[v[13]];
  if (status === undefined) throw new ChainUnreadable(`receipt ${id} has status code ${v[13]}`);
  const lock = v[14].length === 1
    ? { lender: v[14][0][0], dueDate: Number(v[14][0][2]), gracePeriod: Number(v[14][0][3]) }
    : null;
  return {
    receiptId: BigInt(id),
    parentId: v[2],
    warehouseId: v[9],
    depositNo: v[20],
    commodity: v[3],
    grade: v[4],
    weightKg: v[5],
    weightSource: v[6] === 1 ? 'Scale' : 'BagEstimate',
    owner: v[12],
    status,
    lock,
    recoveryOpen: v[15].length === 1,
    exitDate: v[18] === null ? null : Number(v[18]),
    archived,
  };
}

/** Every receipt ever minted from (warehouse_id, deposit_no), from the warehouse's index. */
export async function readClaims(ctx, warehouseId, depositNo) {
  const wh = sv('symbol', warehouseId);
  const [pagesEntry] = await readEntries(ctx, ctx.contractId, [{ key: sv('vec', [sv('symbol', 'WarehousePages'), wh]), durability: PERSISTENT }]);
  const pages = pagesEntry === null ? 0 : pagesEntry.value;
  if (typeof pages !== 'number') throw new ChainUnreadable('unexpected page count');
  const pageEntries = await readEntries(ctx, ctx.contractId, Array.from({ length: pages }, (_, p) =>
    ({ key: sv('vec', [sv('symbol', 'WarehouseIndex'), wh, sv('u32', p)]), durability: PERSISTENT })));
  const ids = [];
  pageEntries.forEach((e, p) => {
    if (e === null || !Array.isArray(e.value)) throw new ChainUnreadable(`index page ${p} could not be read`);
    ids.push(...e.value);
  });
  const entries = await readEntries(ctx, ctx.contractId, ids.map((id) => ({ key: receiptKey(id), durability: PERSISTENT })));
  const receipts = [];
  entries.forEach((e, i) => {
    // Persistent entries are never deleted, so an indexed receipt is always there, archived or not.
    if (e === null) throw new ChainUnreadable(`receipt ${ids[i]} is indexed but was not returned`);
    const r = receiptView(ids[i], e.value, e.archived);
    if (r.warehouseId === warehouseId && r.depositNo === BigInt(depositNo)) receipts.push(r);
  });
  return { receipts, summary: summarize(receipts) };
}

/** How much of the lot is in each state, with pledges grouped by their terms. */
export function summarize(receipts) {
  const kg = { total: 0n, Active: 0n, Pledged: 0n, Recovery: 0n, Exited: 0n, Revoked: 0n };
  const pledges = new Map();
  for (const r of receipts) {
    kg.total += r.weightKg;
    kg[r.status] += r.weightKg;
    if (r.lock && (r.status === 'Pledged' || r.status === 'Recovery')) {
      const k = `${r.status}|${r.lock.lender}|${r.lock.dueDate}|${r.lock.gracePeriod}`;
      const p = pledges.get(k) ?? { status: r.status, ...r.lock, weightKg: 0n };
      p.weightKg += r.weightKg;
      pledges.set(k, p);
    }
  }
  return {
    kg,
    pledges: [...pledges.values()],
    recovery: receipts.some((r) => r.status === 'Recovery'),
    archived: receipts.some((r) => r.archived),
  };
}
