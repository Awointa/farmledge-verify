// The warehouse anchoring record: a chain read about a warehouse, never a lot.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isWarehouseId, warehouseRecord } from '../src/warehouse.js';
import { serveChain } from './support/mockrpc.js';
import { CONTRACT, dayRootEntry, headEntry, sha } from './support/sdk.js';

const TODAY = 20738;
const WH = 'FIXTURE_WH';
async function record(entries, extra = {}) {
  const rpc = await serveChain({ closeTime: TODAY * 86400 + 60, latestLedger: 5_100_000, entries, ...extra });
  try { return await warehouseRecord({ rpcUrl: rpc.url, contractId: CONTRACT, timeoutMs: 1500 }, WH); } finally { await rpc.close(); }
}
const root = (d) => dayRootEntry(WH, d, sha(Buffer.from(`root:${d}`)), 2);

test('no head: the warehouse never anchored', async () => {
  const r = await record([]);
  assert.equal(r.head, null);
  assert.deepEqual(r.days, []);
});

test('continuous daily anchoring has no gaps', async () => {
  const r = await record([headEntry(WH, TODAY - 1, sha(Buffer.from('h'))), ...[5, 4, 3, 2, 1].map((k) => root(TODAY - k))]);
  assert.equal(r.head.lastDay, TODAY - 1);
  assert.deepEqual(r.days.map((d) => d.day), [TODAY - 5, TODAY - 4, TODAY - 3, TODAY - 2, TODAY - 1]);
  assert.deepEqual(r.gaps, []);
});

test('a missed day is a gap', async () => {
  const r = await record([headEntry(WH, TODAY - 1, sha(Buffer.from('h'))), root(TODAY - 4), root(TODAY - 1)]);
  assert.deepEqual(r.gaps, [TODAY - 3, TODAY - 2]);
});

test('roots older than the window are not looked for', async () => {
  const r = await record([headEntry(WH, TODAY - 1, sha(Buffer.from('h'))), root(TODAY - 40), root(TODAY - 1)]);
  assert.deepEqual(r.days.map((d) => d.day), [TODAY - 1]);
});

test('an archived head is reported as archived, with its value', async () => {
  const r = await record([headEntry(WH, TODAY - 200, sha(Buffer.from('h')), { liveUntil: 0 })]);
  assert.equal(r.head.archived, true);
  assert.equal(r.head.lastDay, TODAY - 200);
});

test('an unreachable chain throws', async () => {
  await assert.rejects(record([], { fail: 'refused' }), { name: 'ChainUnreadable' });
});

test('warehouse ids are Soroban symbols', () => {
  for (const ok of ['FL_TN_ACTIVE', 'A', 'x'.repeat(32)]) assert.ok(isWarehouseId(ok), ok);
  for (const bad of ['', 'x'.repeat(33), 'KN-DAWANAU', 'a b', null]) assert.ok(!isWarehouseId(bad), String(bad));
});
