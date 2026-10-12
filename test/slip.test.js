// The slip check: a page-level check that runs after verification
// (src/slip.js). verify_proof.py cannot make it, so it has no result code
// and no conformance fixture: these tests are its whole specification.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NETWORK } from '../src/config.js';
import { OUTCOMES, parseJson } from '../src/verify.js';
import { render } from '../src/render.js';
import { compareSlip, formatRef, leafRef, parseRef, slipFromFragment } from '../src/slip.js';
import { fixtures, runBrowser } from './support/fixtures.js';

const text = (n) => (typeof n === 'string' || typeof n === 'number' || typeof n === 'bigint' ? String(n) : n.children.map(text).join(''));
const all = (n, pred, acc = []) => { if (typeof n === 'object') { if (pred(n)) acc.push(n); n.children.forEach((c) => all(c, pred, acc)); } return acc; };
const byClass = (n, cls) => all(n, (x) => (x.props.class ?? '').split(' ').includes(cls));
const attr = (n, a) => all(n, (x) => x.props[a] !== undefined)[0]?.props[a];

const TOKEN = 'Xq3vR9k2LmN8pQ4sT6uW1yZ0'; // 24 characters, as the API issues

async function viewFor(name, fragment) {
  const fx = fixtures().find((f) => f.name === name);
  const r = await runBrowser(fx);
  return { kind: 'result', result: r.result, leaf: parseJson(fx.bundleText).leaf, source: { how: 'token', detail: 'https://api.example/proofs/x' },
    slip: fragment === undefined ? null : slipFromFragment(fragment) };
}

test('the reference is WAREHOUSE.NUMBER, one spelling only', () => {
  assert.equal(formatRef('TESTNET_EXAMPLE_WH', 1n), 'TESTNET_EXAMPLE_WH.1');
  assert.equal(formatRef('FIXTURE_WH', 101), 'FIXTURE_WH.101');
  assert.deepEqual({ ...parseRef('FIXTURE_WH.101') }, { warehouseId: 'FIXTURE_WH', depositNo: 101n, text: 'FIXTURE_WH.101' });
  assert.equal(parseRef('W.0').depositNo, 0n);
  assert.equal(parseRef(`W.${2n ** 64n - 1n}`).depositNo, 2n ** 64n - 1n);
  assert.equal(parseRef(`${'W'.repeat(32)}.1`).warehouseId, 'W'.repeat(32));
  for (const bad of ['', '101', 'FIXTURE_WH', 'FIXTURE_WH.', '.101', 'FIXTURE_WH.0101', 'FIXTURE_WH.-1', 'FIXTURE_WH.1.2', 'FIXTURE WH.1',
    ' FIXTURE_WH.1', 'FIXTURE_WH.1 ', 'FIXTURE-WH.1', `W.${2n ** 64n}`, `${'W'.repeat(33)}.1`, 'FIXTURE_WH.1e3', 'FIXTURE_WH.١']) {
    assert.equal(parseRef(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseRef(null), null);
  // Symbols are case-sensitive on chain: the case is kept, never folded.
  assert.equal(parseRef('fixture_wh.1').warehouseId, 'fixture_wh');
  for (const [w, n] of [['A', 0n], ['TESTNET_EXAMPLE_WH', 2n], ['Z_9', 2n ** 64n - 1n]]) assert.equal(parseRef(formatRef(w, n)).text, formatRef(w, n));
});

test("the farmledge-app slip link is read as the app builds it", () => {
  // farmledge-app apps/warehouse/src/print/proofLink.ts: `${verifyPageUrl}#p=${token}&d=${warehouseSymbol}.${depositNo}`
  const s = slipFromFragment(`#p=${TOKEN}&d=TESTNET_EXAMPLE_WH.1`);
  assert.equal(s.token, TOKEN);
  assert.equal(s.ref.text, 'TESTNET_EXAMPLE_WH.1');
  assert.equal(s.tokenBad || s.refBad, false);
  assert.deepEqual([slipFromFragment(`#p=${TOKEN}`).ref, slipFromFragment(`#p=${TOKEN}`).refBad], [null, false]);
  assert.equal(slipFromFragment(`#p=${TOKEN}&d=101`).refBad, true);
  assert.equal(slipFromFragment('#p=../../admin&d=W.1').tokenBad, true);
  assert.equal(slipFromFragment('#p=../../admin&d=W.1').token, null);
  assert.equal(slipFromFragment('#p=short&d=W.1').tokenBad, true);
});

test('the slip names a deposit: warehouse, number and record kind must all agree', () => {
  const leaf = { kind: 0n, warehouse_id: 'FIXTURE_WH', deposit_no: 101n };
  assert.equal(compareSlip(null, leaf), 'none');
  assert.equal(compareSlip(parseRef('FIXTURE_WH.101'), leaf), 'match');
  assert.equal(compareSlip(parseRef('FIXTURE_WH.101'), { ...leaf, deposit_no: 101 }), 'match');
  // The A1 flaw: the same number at another warehouse is another deposit.
  assert.equal(compareSlip(parseRef('OTHER_WH.101'), leaf), 'mismatch');
  assert.equal(compareSlip(parseRef('FIXTURE_WH.102'), leaf), 'mismatch');
  assert.equal(compareSlip(parseRef('fixture_wh.101'), leaf), 'mismatch');
  // The same lot's dispatch or balance record carries the same reference.
  assert.equal(compareSlip(parseRef('FIXTURE_WH.101'), { ...leaf, kind: 1n }), 'mismatch');
  assert.equal(compareSlip(parseRef('FIXTURE_WH.101'), { ...leaf, kind: 2n }), 'mismatch');
  for (const bad of [null, {}, { ...leaf, deposit_no: 'x' }, { ...leaf, kind: undefined }, { ...leaf, warehouse_id: undefined }]) {
    assert.equal(compareSlip(parseRef('FIXTURE_WH.101'), bad), 'mismatch');
  }
  assert.equal(leafRef(leaf), 'FIXTURE_WH.101');
  for (const bad of [null, { ...leaf, warehouse_id: 'A B' }, { ...leaf, deposit_no: -1n }, { ...leaf, deposit_no: 1.5 }, { ...leaf, deposit_no: 2n ** 64n }]) assert.equal(leafRef(bad), null);
});

test('verified and the slip matches: verified, with the reference at the top', async () => {
  const node = render(await viewFor('valid', `#p=${TOKEN}&d=FIXTURE_WH.101`), NETWORK);
  assert.equal(attr(node, 'data-state'), 'OK');
  assert.equal(attr(node, 'data-slip'), 'match');
  assert.equal(node.children[0].props['data-slip'], 'match', 'the reference comes first');
  assert.equal(text(byClass(node, 'ref-big')[0]), 'FIXTURE_WH.101');
  assert.equal(byClass(node, 'icon-check').length, 1);
  assert.match(text(node), /Check it against the one printed beneath the QR/);
});

test('verified but another deposit: a red failure that says both things, and no claims', async () => {
  for (const ref of ['OTHER_WH.101', 'FIXTURE_WH.102']) {
    const view = await viewFor('claims-pledged', `#p=${TOKEN}&d=${ref}`);
    view.claims = { status: 'ok', data: { receipts: [{ receiptId: 1n, weightKg: 1n, status: 'Recovery' }], summary: { recovery: true, kg: {}, pledges: [] } } };
    const node = render(view, NETWORK);
    const t = text(node);
    assert.equal(attr(node, 'data-state'), 'SLIP_MISMATCH', ref);
    assert.equal(all(node, (x) => x.props['data-code'])[0].props['data-code'], 'SLIP_MISMATCH');
    assert.equal(attr(node, 'data-tone'), 'failed');
    assert.match(t, /This proof is valid, and it is for a different deposit than your slip/);
    assert.match(t, new RegExp(`your slip is for deposit ${ref}`));
    assert.match(t, /Verifier result: OK\. Slip check: SLIP_MISMATCH, made by this page only/);
    for (const cls of ['icon-check', 'tone-verified', 'honesty', 'claims', 'banner-recovery']) assert.equal(byClass(node, cls).length, 0, `${ref}: ${cls}`);
    assert.doesNotMatch(t, /Verified against the ledger/);
  }
});

test("the same lot's dispatch record is not the deposit on the slip", async () => {
  const view = await viewFor('valid', `#p=${TOKEN}&d=FIXTURE_WH.101`);
  view.leaf = { ...view.leaf, kind: 1n };
  const node = render(view, NETWORK);
  assert.equal(attr(node, 'data-state'), 'SLIP_MISMATCH');
  assert.match(text(node), /The same lot, but this is its dispatch record, not the deposit on your slip/);
  assert.match(text(node), /checks out against the ledger for a dispatch record of FIXTURE_WH\.101/);
});

test('a verification failure comes first, whatever the slip says', async () => {
  for (const [name, code] of [['tampered-leaf', 'DAY_ROOT_DIFFERS'], ['unchained-root', 'HEAD_MISMATCH'], ['not-yet-anchored', 'NOT_YET_ANCHORED'], ['rpc-refused', 'COULD_NOT_CHECK']]) {
    const node = render(await viewFor(name, `#p=${TOKEN}&d=OTHER_WH.9`), NETWORK);
    assert.equal(attr(node, 'data-state'), code, name);
    assert.equal(attr(node, 'data-slip'), 'unchecked', name);
    assert.match(text(node), /Not compared: the proof itself did not verify, and that comes first/, name);
    assert.doesNotMatch(text(node), /SLIP_MISMATCH|different deposit than your slip/, name);
  }
});

test('the reference is at the top of every result, whatever the outcome', async () => {
  for (const name of ['valid', 'valid-root-expired', 'tampered-leaf', 'not-yet-anchored', 'no-head', 'rpc-refused', 'day-in-future']) {
    const node = render(await viewFor(name), NETWORK);
    assert.ok(node.children[0].props['data-slip'] !== undefined, name);
    assert.equal(text(byClass(node, 'ref-big')[0]), formatRef('FIXTURE_WH', parseJson(fixtures().find((f) => f.name === name).bundleText).leaf.deposit_no), name);
    assert.match(text(node), /compare this with the reference printed beneath its QR code: this page did not see it/, name);
  }
});

test('a missing or unreadable slip reference is said, not hidden', async () => {
  const missing = render(await viewFor('valid', `#p=${TOKEN}`), NETWORK);
  assert.equal(attr(missing, 'data-slip'), 'missing');
  assert.match(text(missing), /The link carried no slip reference, so this page could not compare this proof with your slip\. Compare the reference above with the one printed beneath the QR code on your slip yourself\./);
  assert.equal(attr(missing, 'data-state'), 'OK');
  const bad = render(await viewFor('valid', `#p=${TOKEN}&d=FIXTURE_WH.0101`), NETWORK);
  assert.equal(attr(bad, 'data-slip'), 'unreadable');
  assert.match(text(bad), /The link's slip reference could not be read \(FIXTURE_WH\.0101 is not in the printed form/);
});

test('a slip link with nothing fetched shows the slip, and nothing like a result', () => {
  const node = render({ kind: 'slip-waiting', slip: slipFromFragment(`#p=${TOKEN}&d=FIXTURE_WH.101`), reason: 'This page has no Farmledge address set to fetch the bundle the link names, so nothing was fetched.' }, NETWORK);
  assert.equal(attr(node, 'data-state'), 'SLIP_WAITING');
  assert.equal(text(byClass(node, 'ref-big')[0]), 'FIXTURE_WH.101');
  assert.match(text(node), /Nothing checked yet.*no Farmledge address.*Paste or upload the proof bundle/s);
  assert.equal(byClass(node, 'icon-check').length, 0);
});

test("the slip check is not a verifier result: the shared codes are unchanged", () => {
  assert.equal('SLIP_MISMATCH' in OUTCOMES, false);
  assert.deepEqual(Object.keys(OUTCOMES).sort(), ['BAD_BUNDLE', 'COULD_NOT_CHECK', 'DAY_IN_FUTURE', 'DAY_ROOT_DIFFERS', 'DAY_ROOT_EXPIRED',
    'HEAD_MISMATCH', 'NOT_YET_ANCHORED', 'NO_HEAD', 'OK', 'PROOF_DOES_NOT_FIT', 'WRONG_NETWORK'].sort());
});
