// What the page shows for every state, tested without a browser. The
// browser test (test/page.test.js) checks the same states in Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NETWORK } from '../src/config.js';
import { OUTCOMES, parseJson } from '../src/verify.js';
import { readClaims } from '../src/claims.js';
import { VERIFIED, render } from '../src/render.js';
import { serveChain } from './support/mockrpc.js';
import { CONTRACT } from './support/sdk.js';
import { fixtures, runBrowser } from './support/fixtures.js';

const text = (n) => (typeof n === 'string' || typeof n === 'number' || typeof n === 'bigint' ? String(n) : n.children.map(text).join(''));
const all = (n, pred, acc = []) => { if (typeof n === 'object') { if (pred(n)) acc.push(n); n.children.forEach((c) => all(c, pred, acc)); } return acc; };
const byClass = (n, cls) => all(n, (x) => (x.props.class ?? '').split(' ').includes(cls));
const tone = (n) => all(n, (x) => x.props['data-tone'])[0]?.props['data-tone'];
const headline = (n) => text(byClass(n, 'verdict-head')[0]);

async function viewFor(name, source = { how: 'pasted' }) {
  const fx = fixtures().find((f) => f.name === name);
  const r = await runBrowser(fx);
  const leaf = r.code === 'BAD_BUNDLE' && !r.result ? null : parseJson(fx.bundleText).leaf;
  const view = { kind: 'result', result: r.result ?? { code: 'BAD_BUNDLE', verified: false, facts: {}, detail: '' }, leaf, source };
  if (fx.claims) {
    const rpc = await serveChain(fx.chain);
    try { view.claims = { status: 'ok', data: await readClaims({ rpcUrl: rpc.url, contractId: CONTRACT }, leaf.warehouse_id, leaf.deposit_no) }; } finally { await rpc.close(); }
  }
  return view;
}

const ONE_PER_CODE = {
  OK: 'valid', DAY_ROOT_EXPIRED: 'valid-root-expired', NOT_YET_ANCHORED: 'not-yet-anchored', PROOF_DOES_NOT_FIT: 'short-proof',
  DAY_IN_FUTURE: 'day-in-future', DAY_ROOT_DIFFERS: 'tampered-leaf', NO_HEAD: 'no-head', HEAD_MISMATCH: 'unchained-root',
  BAD_BUNDLE: 'slip-leaf-as-bundle', COULD_NOT_CHECK: 'rpc-refused',
};

test('every outcome has its own headline, and only the two verified codes look verified', async () => {
  const seen = new Map();
  for (const [code, name] of Object.entries(ONE_PER_CODE)) {
    const node = render(await viewFor(name), NETWORK);
    assert.equal(all(node, (x) => x.props['data-state'])[0].props['data-state'], code);
    const h = headline(node);
    assert.ok(!seen.has(h), `${code} and ${seen.get(h)} share the headline "${h}"`);
    seen.set(h, code);
    assert.equal(tone(node) === 'verified', VERIFIED.includes(code), `${code} tone ${tone(node)}`);
    assert.equal(byClass(node, 'icon-check').length > 0, VERIFIED.includes(code), `${code}: the tick`);
  }
  // WRONG_NETWORK too.
  const fx = fixtures().find((f) => f.name === 'valid');
  const b = { ...parseJson(fx.bundleText), contract_id: 'CDLSGBNIO6NGYBHFA2WZNZK3RJKEQTE7N4JTZ7TBZYW6KH42KXKLZJW3' };
  const { verifyBundle } = await import('../src/verify.js');
  const r = await verifyBundle(b, { rpcUrl: 'http://127.0.0.1:9', contractId: CONTRACT });
  const node = render({ kind: 'result', result: r, leaf: b.leaf }, NETWORK);
  assert.equal(tone(node), 'refused');
  assert.ok(!seen.has(headline(node)));
  assert.equal(Object.keys(OUTCOMES).length, Object.keys(ONE_PER_CODE).length + 1);
});

test('"could not check" can never render as anything like verified', async () => {
  for (const fx of fixtures().filter((f) => f.chain.fail)) {
    const node = render(await viewFor(fx.name), NETWORK);
    // The slip instruction is the reader's check, not a result, and is on every screen.
    const t = text(node).replace('Check this matches the deposit number printed on the slip.', '');
    assert.equal(tone(node), 'nocheck', fx.name);
    assert.match(headline(node), /^Could not check/, fx.name);
    assert.match(t, /This is not a result/, fx.name);
    assert.doesNotMatch(t, /verified|matches|anchored in ledger|chained/i, fx.name);
    assert.equal(byClass(node, 'icon-check').length, 0, fx.name);
    for (const cls of ['honesty', 'facts', 'claims']) assert.equal(byClass(node, cls).length, 0, `${fx.name} shows ${cls}`);
  }
});

test('a result whose flag and code disagree is shown as no result', async () => {
  const v = await viewFor('valid');
  for (const result of [{ ...v.result, verified: false }, { ...v.result, code: 'COULD_NOT_CHECK', verified: true }, { ...v.result, code: 'NOT_YET_ANCHORED', verified: true }]) {
    const node = render({ ...v, result }, NETWORK);
    assert.notEqual(tone(node), 'verified');
    assert.equal(byClass(node, 'icon-check').length, 0);
  }
});

test('a verified result always states what was and was not checked, beside the tick', async () => {
  for (const name of ['valid', 'valid-root-expired', 'claims-pledged']) {
    const node = render(await viewFor(name), NETWORK);
    const honest = text(byClass(node, 'honesty')[0] ?? { children: [] });
    for (const s of ['What this checked', 'What this did not check', 'grain is physically in the warehouse',
      'weight was measured correctly', 'grade is accurate', 'who they say they are']) assert.ok(honest.includes(s), `${name}: ${s}`);
    assert.doesNotMatch(text(node), /certif|guarantee|safe to lend/i);
  }
});

test('DAY_ROOT_EXPIRED says why the head chain alone is enough', async () => {
  assert.match(text(render(await viewFor('valid-root-expired'), NETWORK)), /only ever appends to the head.*breaking SHA-256/s);
});

test('an archived head is said to be archived and read, not missing', async () => {
  const t = text(render(await viewFor('valid-head-archived'), NETWORK));
  assert.match(t, /archived on the ledger.*Archived is not missing.*read and matched/s);
});

test('the claims: recovery is a red banner above everything; each state has its own display', async () => {
  const states = new Map();
  for (const name of ['claims-active', 'claims-pledged', 'claims-recovery', 'claims-exited', 'claims-revoked', 'claims-archived', 'claims-none']) {
    const node = render(await viewFor(name), NETWORK);
    const claims = all(node, (x) => x.props['data-claims'])[0];
    states.set(name, claims.props['data-claims']);
    const first = node.children[0];
    assert.equal(first.props['data-banner'] === 'recovery', name === 'claims-recovery', name);
    if (name === 'claims-recovery') assert.match(text(first), /Do not accept it as collateral/);
  }
  assert.deepEqual(Object.fromEntries(states), {
    'claims-active': 'active', 'claims-pledged': 'pledged', 'claims-recovery': 'recovery', 'claims-exited': 'exited',
    'claims-revoked': 'revoked', 'claims-archived': 'active', 'claims-none': 'none',
  });
  const archived = text(render(await viewFor('claims-archived'), NETWORK));
  assert.match(archived, /Archived entry.*archived is not invalid/s);
  const pledged = text(render(await viewFor('claims-pledged'), NETWORK));
  assert.match(pledged, /4,000 kg total.*2,400 kg unencumbered.*1,200 kg pledged to lender G\w+, due 2026-12-11, 14-day grace period.*400 kg released/s);
});

test('never shown: loan references, names, phone numbers, money', async () => {
  for (const fx of fixtures().filter((f) => f.claims || f.expect === 'OK')) {
    const t = text(render(await viewFor(fx.name), NETWORK));
    assert.doesNotMatch(t, /FIXTURE-LOAN-REF|loan.?ref|₦|NGN|naira|price|value of|LTV|loan size|phone|farmer name/i, fx.name);
  }
});

test('where the bundle came from, and which endpoint was used, are always shown', async () => {
  for (const [how, detail, expect] of [['pasted', null, /pasted into this page/], ['file', 'b.json', /uploaded from a file b\.json/],
    ['qr', null, /scanned from a QR code/], ['link', null, /carried in the link/], ['fetched', 'https://farmledge.example/b/1', /fetched from https:\/\/farmledge\.example\/b\/1/],
    ['example', null, /Testnet example/]]) {
    const t = text(render(await viewFor('valid', { how, detail }), NETWORK));
    assert.match(t, expect, how);
    assert.match(t, /The bundle is a claim; whoever supplied it, the check read only the ledger/);
    assert.match(t, /The bundle suggested https:\/\/rpc\.example\.invalid: not used/);
  }
});

test('the slip QR forms are explained, not checked', () => {
  const capture = text(render({ kind: 'capture', depositId: 'abc' }, NETWORK));
  assert.match(capture, /This is a capture receipt from a tablet that had not yet synced\. It proves nothing\. Nothing has been anchored for this deposit yet\./);
  const leaf = render({ kind: 'leaf', leaf: { warehouse_id: 'W', deposit_no: 5n, kg: 100n, index: null, owner: 'GABC' } }, NETWORK);
  assert.match(text(leaf), /This is a deposit record in the form Farmledge uses\. It is a claim, not a proof\. To check it you need the proof bundle for this deposit\./);
  assert.match(text(leaf), /unverified/);
  for (const n of [render({ kind: 'capture', depositId: 'abc' }, NETWORK), leaf]) {
    assert.equal(byClass(n, 'icon-check').length, 0);
    assert.notEqual(tone(n), 'verified');
  }
});

test('the warehouse record says it is about the warehouse, not a deposit', () => {
  const rec = { warehouseId: 'W', chainDay: 20738, head: { lastDay: 20737, ledger: 1, archived: false }, days: [{ day: 20735, leaves: 2 }, { day: 20737, leaves: 2 }], gaps: [20736] };
  const t = text(render({ kind: 'warehouse', warehouse: { status: 'ok', record: rec } }, NETWORK));
  assert.match(t, /It says nothing about any particular deposit/);
  assert.match(t, /No: 1 day\(s\) missing \(2026-10-10\)/);
  assert.match(text(render({ kind: 'warehouse', warehouse: { status: 'error' } }, NETWORK)), /Could not check.*This is not a result/s);
});
