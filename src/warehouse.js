// A warehouse's anchoring record, read from the chain. It says whether the
// warehouse has committed its books and how regularly. It says nothing
// about any particular deposit.
import { sv } from './xdr.js';
import { ChainUnreadable, PERSISTENT, TEMPORARY, latestLedger, readEntries } from './rpc.js';

/** A day's root stays on chain for 30 days; probe one more for the edge. */
export const WINDOW_DAYS = 31;

/** A Soroban Symbol: what a warehouse id must be. */
export const isWarehouseId = (s) => typeof s === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(s);

export async function warehouseRecord(ctx, warehouseId) {
  if (!isWarehouseId(warehouseId)) throw new TypeError('a warehouse id is 1 to 32 letters, digits or underscores');
  const wh = sv('symbol', warehouseId);
  const [head] = await readEntries(ctx, ctx.contractId, [{ key: sv('vec', [sv('symbol', 'Head'), wh]), durability: PERSISTENT }]);
  const today = Math.floor((await latestLedger(ctx)).closeTime / 86400);
  if (head === null) return { warehouseId, chainDay: today, head: null, days: [], gaps: [] };
  const v = head.value;
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number') throw new ChainUnreadable('unexpected head');
  const lastDay = v[0];

  const probe = Array.from({ length: WINDOW_DAYS + 1 }, (_, i) => today - WINDOW_DAYS + i);
  const roots = await readEntries(ctx, ctx.contractId, probe.map((d) =>
    ({ key: sv('vec', [sv('symbol', 'DayRoot'), wh, sv('u32', d)]), durability: TEMPORARY })));
  const days = [];
  roots.forEach((e, i) => {
    if (e === null) return;
    if (!Array.isArray(e.value) || e.value.length !== 2 || typeof e.value[1] !== 'number') throw new ChainUnreadable('unexpected day root');
    days.push({ day: probe[i], leaves: e.value[1], ledger: e.ledger });
  });
  // Missing days between the earliest root still on chain and the head's last day.
  const gaps = [];
  if (days.length) {
    const have = new Set(days.map((d) => d.day));
    for (let d = days[0].day; d <= lastDay; d++) if (!have.has(d)) gaps.push(d);
  }
  return {
    warehouseId,
    chainDay: today,
    head: { lastDay, ledger: head.ledger, archived: head.archived },
    days,
    gaps,
  };
}
