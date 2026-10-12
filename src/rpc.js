// Read-only Soroban RPC: getLedgerEntries, getLatestLedger, getLedgers.
// Any failure throws ChainUnreadable, which every caller turns into
// "could not check", never into a result.
import { address, concat, decodeScVal, equal, u32 } from './xdr.js';

export class ChainUnreadable extends Error { name = 'ChainUnreadable'; }

export const PERSISTENT = 1;
export const TEMPORARY = 0;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function rpcCall(ctx, method, params) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ctx.timeoutMs ?? 20_000);
  try {
    const res = await (ctx.fetch ?? fetch)(ctx.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reply = await res.json();
    if (reply === null || typeof reply !== 'object') throw new Error('not a JSON-RPC reply');
    if ('error' in reply) throw new Error(JSON.stringify(reply.error));
    if (!('result' in reply)) throw new Error('no result');
    return reply.result;
  } catch (e) {
    throw new ChainUnreadable(`${method}: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** A contract-data ledger key, as verify_proof.py's entry() builds it. */
export const ledgerKey = (contract, key, durability) => concat(u32(6), address(contract), key, u32(durability));

/**
 * Reads contract-data entries. Returns one result per key, in order: null
 * when the chain has no such entry, else {value, ledger, liveUntil}. An
 * archived entry is still returned by RPC, with its value and a liveUntil
 * below the latest ledger (0 once evicted): `archived` says so.
 */
export async function readEntries(ctx, contract, items, onProgress = () => {}) {
  const out = [];
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    const keys = chunk.map(({ key, durability }) => b64(ledgerKey(contract, key, durability)));
    const result = await rpcCall(ctx, 'getLedgerEntries', { keys });
    const found = new Map();
    for (const e of result?.entries ?? []) found.set(e.key, e);
    chunk.forEach(({ key, durability }, j) => {
      const e = found.get(keys[j]);
      if (!e) { out.push(null); return; }
      let data;
      try { data = unb64(e.xdr); } catch { throw new ChainUnreadable('entry is not base64'); }
      // LedgerEntryData: type, ext, contract, key, durability, then the value.
      const prefix = concat(u32(6), u32(0), address(contract), key, u32(durability));
      if (!equal(data.slice(0, prefix.length), prefix)) throw new ChainUnreadable('unexpected entry layout');
      let value;
      try {
        const d = decodeScVal(data, prefix.length);
        if (d.end !== data.length) throw new Error('unexpected bytes after the value');
        value = d.value;
      } catch (err) {
        throw new ChainUnreadable(`unreadable entry value: ${err.message}`);
      }
      const liveUntil = e.liveUntilLedgerSeq ?? null;
      out.push({ value, raw: data.slice(prefix.length), ledger: e.lastModifiedLedgerSeq ?? null, liveUntil,
        archived: liveUntil !== null && Number(liveUntil) < Number(result.latestLedger) });
    });
    onProgress(out.length);
  }
  return out;
}

export async function latestLedger(ctx) {
  const r = await rpcCall(ctx, 'getLatestLedger', {});
  const closeTime = Number(r?.closeTime);
  if (!Number.isFinite(closeTime) || !Number.isInteger(r?.sequence)) throw new ChainUnreadable('getLatestLedger: no closeTime');
  return { sequence: r.sequence, closeTime };
}

/** The close time of one ledger, or null when this RPC no longer holds it. */
export async function ledgerCloseTime(ctx, sequence) {
  try {
    const r = await rpcCall(ctx, 'getLedgers', { startLedger: Number(sequence), pagination: { limit: 1 } });
    const l = r?.ledgers?.[0];
    return l && l.sequence === Number(sequence) ? Number(l.ledgerCloseTime) : null;
  } catch {
    return null; // outside this RPC's retention: unknown, not wrong
  }
}
