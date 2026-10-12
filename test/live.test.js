// Against the real Testnet: the committed example must keep verifying, in
// both verifiers, and its lot must keep its claims. Run with LIVE=1 (CI runs
// it daily), so the example cannot break silently.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { NETWORK } from '../src/config.js';
import { parseJson, verifyBundle } from '../src/verify.js';
import { readClaims } from '../src/claims.js';
import { warehouseRecord } from '../src/warehouse.js';

const EXAMPLE = fileURLToPath(new URL('../example/testnet-example.bundle.json', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/verify_proof.py', import.meta.url));
const live = process.env.LIVE === '1';
const ctx = { rpcUrl: NETWORK.rpcUrl, contractId: NETWORK.contractId };

test('the Testnet example verifies in the browser verifier', { skip: !live }, async () => {
  const r = await verifyBundle(parseJson(readFileSync(EXAMPLE, 'utf8')), ctx);
  assert.ok(r.code === 'OK' || r.code === 'DAY_ROOT_EXPIRED', `${r.code}: ${r.detail}`);
});

test('the Testnet example verifies in verify_proof.py', { skip: !live }, () => {
  const out = execFileSync('python3', ['-I', SCRIPT, EXAMPLE, '--rpc', NETWORK.rpcUrl], { encoding: 'utf8' });
  assert.match(out.trim().split('\n').at(-1), /^RESULT (OK|DAY_ROOT_EXPIRED)$/);
});

test("the Testnet example's lot keeps its claims", { skip: !live }, async () => {
  const b = parseJson(readFileSync(EXAMPLE, 'utf8'));
  const { summary } = await readClaims(ctx, b.leaf.warehouse_id, b.leaf.deposit_no);
  assert.equal(summary.kg.total, 4000n);
  assert.equal(summary.kg.Active, 2400n);
  assert.equal(summary.kg.Pledged, 1200n);
  assert.equal(summary.kg.Exited, 400n);
});

test("the example warehouse's head is on chain", { skip: !live }, async () => {
  const r = await warehouseRecord(ctx, 'TESTNET_EXAMPLE_WH');
  assert.ok(r.head && r.head.lastDay >= 20737);
});
