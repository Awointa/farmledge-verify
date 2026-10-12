// Receipt claims: a chain read beside the proof check, with its own tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readClaims } from '../src/claims.js';
import { serveChain } from './support/mockrpc.js';
import { CONTRACT, account, pagesEntry, indexEntry, receiptEntry } from './support/sdk.js';
import { fixtures } from './support/fixtures.js';

const big = (x) => (typeof x === 'bigint' ? x.toString() : x);
async function claimsOf(chain, wh = 'FIXTURE_WH', depositNo = 101) {
  const rpc = await serveChain(chain);
  try { return await readClaims({ rpcUrl: rpc.url, contractId: CONTRACT, timeoutMs: 1500 }, wh, depositNo); } finally { await rpc.close(); }
}

for (const fx of fixtures().filter((f) => f.claims)) {
  test(`claims: ${fx.name}: ${fx.description}`, async () => {
    const c = await claimsOf(fx.chain);
    const statuses = Object.fromEntries(c.receipts.map((r) => [String(r.receiptId), r.status]));
    assert.deepEqual(statuses, fx.claims.statuses);
    for (const [k, v] of Object.entries(fx.claims.kg)) assert.equal(c.summary.kg[k], BigInt(v), `kg ${k}`);
    const sumOfStates = ['Active', 'Pledged', 'Recovery', 'Exited', 'Revoked'].reduce((s, k) => s + c.summary.kg[k], 0n);
    assert.equal(sumOfStates, c.summary.kg.total, 'every kilogram is in exactly one state');
    assert.equal(c.summary.recovery, fx.claims.recovery);
    assert.equal(c.summary.archived, fx.claims.archived);
    // Another lot's receipt in the same warehouse is never counted.
    assert.ok(!c.receipts.some((r) => r.receiptId === 999n));
  });
}

test('the loan reference never leaves the claims reader', async () => {
  for (const fx of fixtures().filter((f) => f.claims)) {
    const text = JSON.stringify(await claimsOf(fx.chain), (k, v) => big(v));
    assert.ok(!text.includes('FIXTURE-LOAN-REF-MUST-NOT-SHOW'), fx.name);
    assert.ok(!/loan_?ref/i.test(text), fx.name);
  }
});

test('a pledge shows its lender, due date and grace period', async () => {
  const fx = fixtures().find((f) => f.name === 'claims-pledged');
  const c = await claimsOf(fx.chain);
  assert.deepEqual(c.summary.pledges.map((p) => ({ ...p, weightKg: big(p.weightKg) })), [
    { status: 'Pledged', lender: account('lender'), dueDate: 1_796_947_200, gracePeriod: 14 * 86400, weightKg: '1200' },
  ]);
});

const R = { id: 1, status: 'Active', kg: 4000, warehouseId: 'FIXTURE_WH', depositNo: 101, depositId: 'FIXTURE-LOT-101', owner: account('owner') };
const chainWith = (entries) => ({ closeTime: 20738 * 86400, latestLedger: 5_100_000, entries });

test('an indexed receipt the chain does not return is unreadable, not absent', async () => {
  await assert.rejects(claimsOf(chainWith([pagesEntry('FIXTURE_WH', 1), indexEntry('FIXTURE_WH', 0, [1])])), /indexed but was not returned/);
});

test('an index page the chain does not return is unreadable', async () => {
  await assert.rejects(claimsOf(chainWith([pagesEntry('FIXTURE_WH', 2), indexEntry('FIXTURE_WH', 0, [1]), receiptEntry(R)])), /index page 1/);
});

test('a receipt in another layout version is refused, not guessed at', async () => {
  await assert.rejects(claimsOf(chainWith([pagesEntry('FIXTURE_WH', 1), indexEntry('FIXTURE_WH', 0, [1]), receiptEntry({ ...R, dataVersion: 4 })])), /data_version 3/);
});

test('a status code the contract does not define is refused, not guessed at', async () => {
  await assert.rejects(claimsOf(chainWith([pagesEntry('FIXTURE_WH', 1), indexEntry('FIXTURE_WH', 0, [1]), receiptEntry({ ...R, statusCode: 9 })])), /status code 9/);
});

test('the same deposit number in another warehouse is another lot', async () => {
  const c = await claimsOf(chainWith([pagesEntry('FIXTURE_WH', 1), indexEntry('FIXTURE_WH', 0, [1, 2]), receiptEntry(R), receiptEntry({ ...R, id: 2, warehouseId: 'OTHER_WH' })]));
  assert.deepEqual(c.receipts.map((r) => r.receiptId), [1n]);
});

test('an unreachable chain throws: the caller can only say it could not check', async () => {
  for (const fail of ['refused', 'http500', 'jsonrpc', 'noresult', 'html']) {
    await assert.rejects(claimsOf({ ...chainWith([pagesEntry('FIXTURE_WH', 1)]), fail }), { name: 'ChainUnreadable' }, fail);
  }
});
