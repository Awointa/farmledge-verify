// The page itself, in a real browser. Each state is driven by the page's
// own controls; requests to the page's RPC endpoint are answered from a
// fixture's chain (the page is not changed, and has no test mode). The
// Testnet example runs against the real Testnet when LIVE=1.
//
// SCREENSHOTS=1 writes docs/screenshots/*.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { NETWORK } from '../src/config.js';
import { serveStatic } from './support/static.js';
import { serveChain } from './support/mockrpc.js';
import { fixtures } from './support/fixtures.js';
import { dayRootEntry, headEntry, indexEntry, pagesEntry, receiptEntry, account, sha } from './support/sdk.js';

const SKIP = process.env.FARMLEDGE_SKIP_BROWSER === '1';
const LIVE = process.env.LIVE === '1';
const SHOTS = process.env.SCREENSHOTS === '1';
const SHOT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
let browser;
let site;
let built;

before(async () => {
  if (SKIP) return;
  // Serve the site exactly as deployed: a file the build leaves out fails here.
  const root = fileURLToPath(new URL('../', import.meta.url));
  built = join(mkdtempSync(join(tmpdir(), 'farmledge-site-')), '_site');
  execFileSync(join(root, 'scripts/build-site.sh'), [built], { cwd: root });
  site = await serveStatic(built);
  try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch(); }
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
});
after(async () => { await browser?.close(); await site?.close(); if (built) rmSync(join(built, '..'), { recursive: true, force: true }); });

/** A page whose RPC requests go to `chain` (a fixture chain), or to the real network when chain is null. */
async function open(chain, { hook } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  let rpc = null;
  if (chain) {
    rpc = await serveChain(chain);
    let n = 0;
    await page.route(`${NETWORK.rpcUrl}**`, async (route) => {
      n++;
      const body = route.request().postData();
      if (hook) {
        const done = await hook(route, n, body);
        if (done) return;
      }
      try {
        const res = await fetch(rpc.url, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
        await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text(), headers: { 'access-control-allow-origin': '*' } });
      } catch {
        await route.abort('connectionrefused');
      }
    });
  }
  await page.goto(`${site.url}/index.html`);
  return { page, hosts, close: async () => { await page.close(); await rpc?.close(); } };
}

const settle = (page, where = '#result') => page.waitForFunction((w) => {
  const r = document.querySelector(`${w} .result`);
  return r && !document.querySelector(`${w} [aria-busy="true"]`) && !['CHECKING', 'IDLE'].includes(r.dataset.state);
}, where, { timeout: 30_000 });

/**
 * Synthetic screenshots carry the label in the image itself, so it travels
 * with the file into a slide. The banner is injected here, by the harness:
 * the page has no such mode.
 */
async function shot(page, name, { live = false } = {}) {
  if (!SHOTS) return;
  const [num, ...rest] = name.split('-');
  const file = `${num}-${live ? 'live-testnet' : 'synthetic'}-${rest.join('-')}`;
  if (!live) {
    await page.evaluate(() => {
      const label = 'SYNTHETIC TEST DATA \u00b7 served by the test harness \u00b7 not a real anchor, not a real deposit';
      const banner = () => {
        const b = document.createElement('div');
        b.textContent = label;
        // CSSOM, not a style attribute: the page's CSP (style-src 'self') stays in force.
        Object.assign(b.style, { padding: '8px', background: '#5b2d8e', color: '#fff', font: '700 13px/1.3 system-ui,sans-serif', textAlign: 'center' });
        return b;
      };
      document.body.prepend(banner());
      document.body.append(banner());
      document.body.style.position = 'relative';
      document.documentElement.style.overflowX = 'hidden';
      for (let y = 300; y < document.body.scrollHeight; y += 700) {
        const w = document.createElement('div');
        w.textContent = 'SYNTHETIC';
        Object.assign(w.style, { position: 'absolute', top: `${y}px`, left: '0', right: '0', zIndex: '98', textAlign: 'center',
          font: '900 64px/1 system-ui,sans-serif', color: 'rgba(91,45,142,.18)', transform: 'rotate(-28deg)', pointerEvents: 'none' });
        document.body.append(w);
      }
    });
  }
  await page.screenshot({ path: `${SHOT_DIR}${file}.png`, fullPage: true });
}

async function paste(page, text) {
  await page.fill('#bundle', text);
  await page.click('#check');
  await settle(page);
}

const fx = (name) => fixtures().find((f) => f.name === name);
const state = (page) => page.getAttribute('#result .result', 'data-state');

const CASES = [
  ['02-ok-active', 'claims-active', 'OK'],
  ['03-ok-pledged', 'claims-pledged', 'OK'],
  ['04-ok-recovery', 'claims-recovery', 'OK'],
  ['05-ok-exited', 'claims-exited', 'OK'],
  ['06-ok-revoked', 'claims-revoked', 'OK'],
  ['07-ok-archived-receipt', 'claims-archived', 'OK'],
  ['08-ok-no-receipt', 'claims-none', 'OK'],
  ['09-day-root-expired', 'valid-root-expired', 'DAY_ROOT_EXPIRED'],
  ['10-head-archived', 'valid-head-archived', 'OK'],
  ['11-not-yet-anchored', 'not-yet-anchored', 'NOT_YET_ANCHORED'],
  ['12-forged-day-root-differs', 'tampered-leaf', 'DAY_ROOT_DIFFERS'],
  ['13-unchained-head-mismatch', 'unchained-root', 'HEAD_MISMATCH'],
  ['14-stale-bundle-head-mismatch', 'later-days-missing', 'HEAD_MISMATCH'],
  ['15-no-head', 'no-head', 'NO_HEAD'],
  ['16-proof-does-not-fit', 'short-proof', 'PROOF_DOES_NOT_FIT'],
  ['17-day-in-future', 'day-in-future', 'DAY_IN_FUTURE'],
  ['18-bad-bundle', 'slip-leaf-as-bundle', 'BAD_BUNDLE'],
  ['19-could-not-check-refused', 'rpc-refused', 'COULD_NOT_CHECK'],
  ['20-could-not-check-http-error', 'rpc-http-error', 'COULD_NOT_CHECK'],
];

for (const [name, fixture, code] of CASES) {
  test(`page: ${name} renders ${code}`, { skip: SKIP }, async () => {
    const f = fx(fixture);
    const p = await open(f.chain);
    try {
      await paste(p.page, f.bundleText);
      assert.equal(await state(p.page), code);
      const verified = code === 'OK' || code === 'DAY_ROOT_EXPIRED';
      assert.equal(await p.page.locator('#result .tone-verified').count() > 0, verified);
      assert.equal(await p.page.locator('#result .icon-check').count() > 0, verified);
      if (verified) assert.equal(await p.page.locator('#result .honesty').count(), 1);
      await shot(p.page, name);
      // Only the page and its RPC endpoint are ever contacted.
      assert.deepEqual([...p.hosts].filter((h) => h !== new URL(site.url).host && h !== new URL(NETWORK.rpcUrl).host), []);
    } finally { await p.close(); }
  });
}

test('page: could not reach the chain renders as nothing like verified', { skip: SKIP }, async () => {
  const f = fx('valid');
  const p = await open(f.chain, { hook: async (route) => { await route.abort('internetdisconnected'); return true; } });
  try {
    await paste(p.page, f.bundleText);
    assert.equal(await state(p.page), 'COULD_NOT_CHECK');
    const t = await p.page.locator('#result').innerText();
    assert.match(t, /Could not check/);
    assert.match(t, /This is not a result/);
    assert.doesNotMatch(t, /verified|matches|chained|anchored in ledger/i);
    assert.equal(await p.page.locator('#result .tone-verified, #result .icon-check, #result .honesty, #result .facts, #result .claims').count(), 0);
    await shot(p.page, '21-could-not-check-offline');
  } finally { await p.close(); }
});

test('page: a bundle for another contract is refused, and nothing is read', { skip: SKIP }, async () => {
  const f = fx('valid');
  let calls = 0;
  const p = await open(f.chain, { hook: async () => { calls++; return false; } });
  try {
    const b = JSON.parse(f.bundleText);
    b.contract_id = 'CDLSGBNIO6NGYBHFA2WZNZK3RJKEQTE7N4JTZ7TBZYW6KH42KXKLZJW3';
    await paste(p.page, JSON.stringify(b, null, 2));
    assert.equal(await state(p.page), 'WRONG_NETWORK');
    assert.equal(calls, 0);
    await shot(p.page, '22-wrong-network');
  } finally { await p.close(); }
});

test('page: claims show progress while the index is walked', { skip: SKIP }, async () => {
  const f = fx('valid');
  const ids = Array.from({ length: 450 }, (_, i) => i + 1);
  const chain = { ...f.chain, entries: [...f.chain.entries, pagesEntry('FIXTURE_WH', 1), indexEntry('FIXTURE_WH', 0, ids),
    ...ids.map((id) => receiptEntry({ id, status: 'Active', kg: 10, warehouseId: 'FIXTURE_WH', depositNo: id === 1 ? 101 : 900 + id, depositId: 'FIXTURE-LOT', owner: account('owner') }))] };
  const p = await open(chain, { hook: async (route, n, body) => { if (JSON.parse(body).params?.keys?.length > 100) await new Promise((r) => setTimeout(r, 1500)); return false; } });
  try {
    await p.page.fill('#bundle', f.bundleText);
    await p.page.click('#check');
    await p.page.waitForFunction(() => /receipt \d+ of 450/.test(document.querySelector('.claims')?.textContent ?? ''), null, { timeout: 20_000 });
    await shot(p.page, '23-claims-progress');
    await settle(p.page);
    assert.match(await p.page.locator('.claims').innerText(), /10 kg total/);
  } finally { await p.close(); }
});

test('page: verified, but the claims could not be read', { skip: SKIP }, async () => {
  const f = fx('claims-pledged');
  const p = await open(f.chain, { hook: async (route, n, body) => {
    const m = JSON.parse(body);
    if (n > 3 && m.method === 'getLedgerEntries') { await route.abort('timedout'); return true; }
    return false;
  } });
  try {
    await paste(p.page, f.bundleText);
    assert.equal(await state(p.page), 'OK');
    assert.match(await p.page.locator('.claims').innerText(), /could not be read.*do not assume it is unencumbered/s);
    await shot(p.page, '24-ok-claims-unreadable');
  } finally { await p.close(); }
});

test('page: the slip QR forms and other input are explained, not checked', { skip: SKIP }, async () => {
  const p = await open(fx('valid').chain);
  try {
    for (const [name, input, st] of [
      ['25-capture-receipt', 'farmledge:capture:5f0c8a7e-2b1d-4c3e-9a8f-0123456789ab', 'CAPTURE'],
      ['26-slip-leaf-unverified', JSON.stringify({ ...JSON.parse(fx('valid').bundleText).leaf, index: null }), 'SLIP_LEAF'],
      ['27-not-a-bundle', '1042', 'UNKNOWN'],
    ]) {
      await paste(p.page, input);
      assert.equal(await state(p.page), st);
      assert.equal(await p.page.locator('#result .icon-check').count(), 0);
      await shot(p.page, name);
    }
  } finally { await p.close(); }
});

test('page: the warehouse anchoring record', { skip: SKIP }, async () => {
  const today = 20738;
  const roots = [today - 6, today - 5, today - 3, today - 2, today - 1].map((d) => dayRootEntry('FIXTURE_WH', d, sha(Buffer.from(`r${d}`)), 3));
  const chain = { closeTime: today * 86400 + 3600, latestLedger: 5_100_000, entries: [headEntry('FIXTURE_WH', today - 1, sha(Buffer.from('h'))), ...roots] };
  const p = await open(chain);
  try {
    await p.page.fill('#wh', 'FIXTURE_WH');
    await p.page.click('#wh-form button');
    await settle(p.page, '#wh-result');
    assert.match(await p.page.locator('#wh-result').innerText(), /says nothing about any particular deposit.*1 day\(s\) missing/s);
    await p.page.locator('#wh-form').scrollIntoViewIfNeeded();
    await shot(p.page, '28-warehouse-gap');
    await p.page.fill('#wh', 'NO_SUCH_WH');
    await p.page.click('#wh-form button');
    await settle(p.page, '#wh-result');
    assert.match(await p.page.locator('#wh-result').innerText(), /No anchor on the ledger/);
    await shot(p.page, '29-warehouse-none');
  } finally { await p.close(); }
});

test('page: the landing page, and the network it checks, always visible', { skip: SKIP }, async () => {
  const p = await open(fx('valid').chain);
  try {
    assert.match(await p.page.locator('#network').innerText(), /Checking against: Stellar Testnet.*A test network\. Nothing checked here is a real deposit\./s);
    await shot(p.page, '01-landing');
  } finally { await p.close(); }
});

test('page: the Testnet example, against the real Testnet', { skip: SKIP || !LIVE }, async () => {
  const p = await open(null);
  try {
    await p.page.click('#example');
    await settle(p.page);
    assert.match(await state(p.page), /^(OK|DAY_ROOT_EXPIRED)$/);
    const t = await p.page.locator('#result').innerText();
    assert.match(t, /Testnet example: a real anchor on Stellar's test network\. Not a real deposit\./);
    assert.match(t, /4,000 kg total.*2,400 kg unencumbered.*1,200 kg pledged.*400 kg released/s);
    await shot(p.page, '00-testnet-example', { live: true });
    await p.page.fill('#wh', 'TESTNET_EXAMPLE_WH');
    await p.page.click('#wh-form button');
    await settle(p.page, '#wh-result');
    await p.page.locator('#wh-form').scrollIntoViewIfNeeded();
    await shot(p.page, '30-warehouse-record', { live: true });
  } finally { await p.close(); }
});
