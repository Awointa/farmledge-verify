// "Could not reach the chain" must never be able to pass for "verified".
// At the verifier: every way the chain can fail gives COULD_NOT_CHECK, with
// verified false and no facts at all. (The page's rendering of it is tested
// with the page.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OUTCOMES } from '../src/verify.js';
import { fixtures, runBrowser } from './support/fixtures.js';

test('only OK and DAY_ROOT_EXPIRED are verified', () => {
  const verified = Object.entries(OUTCOMES).filter(([, o]) => o.verified).map(([c]) => c).sort();
  assert.deepEqual(verified, ['DAY_ROOT_EXPIRED', 'OK']);
  assert.ok(Object.isFrozen(OUTCOMES));
});

test('every chain failure is COULD_NOT_CHECK: not verified, and nothing to show', async () => {
  const failing = fixtures().filter((f) => f.chain.fail);
  assert.ok(failing.length >= 8);
  for (const fx of failing) {
    const r = await runBrowser(fx);
    assert.equal(r.code, 'COULD_NOT_CHECK', fx.name);
    assert.equal(r.verified, false, fx.name);
    assert.deepEqual(Object.keys(r.facts), [], `${fx.name} carries facts: ${JSON.stringify(r.facts)}`);
    assert.ok(Object.isFrozen(r.result) && Object.isFrozen(r.result.facts), fx.name);
  }
});

test('the same bundle verifies once the chain answers: the failures above are the chain, not the bundle', async () => {
  for (const fx of fixtures().filter((f) => f.chain.fail)) {
    const r = await runBrowser({ ...fx, chain: { ...fx.chain, fail: undefined } });
    assert.equal(r.code, 'OK', fx.name);
  }
});

test('a result cannot be edited into "verified" after the fact', async () => {
  const r = await runBrowser(fixtures().find((f) => f.name === 'rpc-refused'));
  assert.throws(() => { r.result.verified = true; }, TypeError);
  assert.equal(r.result.verified, false);
});
