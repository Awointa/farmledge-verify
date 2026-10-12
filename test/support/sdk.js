// Test-only: builds leaves, trees and ledger entries with the Stellar SDK,
// an implementation independent of both src/xdr.js and verify_proof.py.
import { createHash } from 'node:crypto';
import { Address, Keypair, xdr } from '@stellar/stellar-base';

export const CONTRACT = 'CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN';

export const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest();

/** A deterministic, obviously synthetic account for a role in a fixture. */
export const account = (role) => Keypair.fromRawEd25519Seed(sha(Buffer.from(`fixture:${role}`))).publicKey();

const LEAF = {
  version: 'u32', kind: 'u32', warehouse_id: 'symbol', day: 'u32',
  index: 'u32', deposit_no: 'u64', deposit_id: 'string', receipt_id: 'u64',
  receipt_version: 'u32', owner: 'address', commodity: 'symbol',
  grade: 'symbol', kg: 'u64', bags: 'u32', moisture_bps: 'u32',
  custodian: 'address', verifier: 'address', deposited_at: 'u64',
  at: 'u64', salt: 'bytes',
};

export function scv(t, v) {
  switch (t) {
    case 'u32': return xdr.ScVal.scvU32(Number(v));
    case 'u64': return xdr.ScVal.scvU64(xdr.Uint64.fromString(String(v)));
    case 'bytes': return xdr.ScVal.scvBytes(Buffer.from(v));
    case 'string': return xdr.ScVal.scvString(v);
    case 'symbol': return xdr.ScVal.scvSymbol(v);
    case 'address': return new Address(v).toScVal();
    case 'vec': return xdr.ScVal.scvVec(v);
    case 'void': return xdr.ScVal.scvVoid();
    default: throw new Error(t);
  }
}

export function leafScVal(leaf) {
  const fields = Object.entries(LEAF).map(([k, t]) => [k, scv(t, t === 'bytes' ? Buffer.from(leaf[k], 'hex') : leaf[k])]);
  fields.push(['weight_source', scv('vec', [scv('symbol', leaf.weight_source)])]);
  fields.sort(([a], [b]) => (a < b ? -1 : 1));
  return xdr.ScVal.scvMap(fields.map(([k, val]) => new xdr.ScMapEntry({ key: scv('symbol', k), val })));
}

export const leafHash = (leaf) => sha([0], leafScVal(leaf).toXDR());

/** Root and per-leaf proofs, padded to a power of two with sha256(0x00) (docs/events.md). */
export function tree(leaves) {
  let level = leaves.map(leafHash);
  while (level.length & (level.length - 1)) level.push(sha([0]));
  const proofs = leaves.map(() => []);
  const pos = leaves.map((_, i) => i);
  while (level.length > 1) {
    pos.forEach((p, k) => { proofs[k].push(level[p ^ 1]); pos[k] = p >> 1; });
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha([1], level[i], level[i + 1]));
    level = next;
  }
  return { root: level[0], proofs };
}

export const chainHead = (prev, day, leaves, root) => {
  const b = Buffer.alloc(8);
  b.writeUInt32BE(day, 0); b.writeUInt32BE(leaves, 4);
  return sha(prev, b.subarray(0, 4), b.subarray(4), root);
};

const durability = (d) => (d === 'temporary' ? xdr.ContractDataDurability.temporary() : xdr.ContractDataDurability.persistent());

/** One getLedgerEntries result row, as stellar-rpc returns it. */
export function entry(key, d, val, { ledger = 5_000_000, liveUntil = 9_000_000 } = {}) {
  const contract = new Address(CONTRACT).toScAddress();
  const lk = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract, key, durability: durability(d) }));
  const data = xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({
    ext: new xdr.ExtensionPoint(0), contract, key, durability: durability(d), val,
  }));
  return { key: lk.toXDR('base64'), xdr: data.toXDR('base64'), lastModifiedLedgerSeq: ledger, liveUntilLedgerSeq: liveUntil };
}

const dk = (...parts) => scv('vec', parts);
export const headEntry = (wh, lastDay, head, opts) =>
  entry(dk(scv('symbol', 'Head'), scv('symbol', wh)), 'persistent', scv('vec', [scv('u32', lastDay), scv('bytes', head)]), opts);
export const headEntryRaw = (wh, val, opts) => entry(dk(scv('symbol', 'Head'), scv('symbol', wh)), 'persistent', val, opts);
export const dayRootEntry = (wh, day, root, leaves, opts) =>
  entry(dk(scv('symbol', 'DayRoot'), scv('symbol', wh), scv('u32', day)), 'temporary', scv('vec', [scv('bytes', root), scv('u32', leaves)]), opts);
export const pagesEntry = (wh, pages) =>
  entry(dk(scv('symbol', 'WarehousePages'), scv('symbol', wh)), 'persistent', scv('u32', pages));
export const indexEntry = (wh, page, ids) =>
  entry(dk(scv('symbol', 'WarehouseIndex'), scv('symbol', wh), scv('u32', page)), 'persistent', scv('vec', ids.map((i) => scv('u64', i))));

const STATUS_CODE = { Active: 0, Pledged: 1, Recovery: 2, Exited: 3, Revoked: 4 };
const opt = (t, v) => (v === null || v === undefined ? scv('void') : scv(t, v));

/** A stored receipt (layout.rs StoredReceipt, data_version 3). */
export function receiptEntry(r, opts) {
  const lock = r.lock ? [scv('vec', [scv('address', r.lock.lender), scv('string', r.lock.loanRef),
    scv('u64', r.lock.dueDate), scv('u64', r.lock.gracePeriod)])] : [];
  const recovery = r.status === 'Recovery' ? [scv('vec', [scv('address', r.lock.lender), scv('string', r.lock.loanRef),
    scv('address', r.owner), scv('u64', r.lock.dueDate + r.lock.gracePeriod + 60), scv('u32', 0),
    scv('void'), scv('void'), scv('void'), scv('void')])] : [];
  const v = [
    scv('u32', r.dataVersion ?? 3), scv('string', r.depositId), opt('u64', r.parentId),
    scv('symbol', 'MAIZE_WHITE'), scv('symbol', 'GRADE_1'), scv('u64', r.kg), scv('u32', 1),
    scv('u32', r.bags ?? 10), scv('u32', 1250), scv('symbol', r.warehouseId),
    scv('address', account('custodian')), scv('address', account('verifier')), scv('address', r.owner),
    scv('u32', r.statusCode ?? STATUS_CODE[r.status]), scv('vec', lock), scv('vec', recovery), scv('vec', []),
    scv('u64', r.depositDate ?? 1_790_000_000), opt('u64', r.exitDate), opt('u64', r.exitWeightKg), scv('u64', r.depositNo),
  ];
  return entry(dk(scv('symbol', 'Receipt'), scv('u64', r.id)), 'persistent', scv('vec', v), opts);
}
