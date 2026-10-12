// The page: takes a bundle from any source, checks it against the chain,
// and renders what the chain says. The RPC endpoint is NETWORK.rpcUrl, page
// configuration; nothing a bundle says can change it.
import { NETWORK } from './config.js';
import { classifyInput } from './input.js';
import { verifyBundle } from './verify.js';
import { readClaims } from './claims.js';
import { ledgerCloseTime } from './rpc.js';
import { isWarehouseId, warehouseRecord } from './warehouse.js';
import { VERIFIED, render } from './render.js';
import { mount } from './dom.js';
import { canScan, scanCamera } from './qr.js';
import { compareSlip, resolverUrl, slipFromFragment } from './slip.js';

const ctx = Object.freeze({ rpcUrl: NETWORK.rpcUrl, contractId: NETWORK.contractId });
const $ = (id) => document.getElementById(id);
const out = $('result');
let current = 0; // a newer check supersedes an older one
// The slip named by the link that opened this page (#p=, #d=), or null.
// Every bundle checked on this page is compared with it, after verifying.
let slip = null;

function show(view) { mount(out, render(view, NETWORK)); }
function status(text) { $('input-status').textContent = text; }

async function check(text, source) {
  const run = ++current;
  status('');
  const input = classifyInput(text);
  if (input.kind !== 'bundle') {
    show({ ...input, source, slip });
    out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  show({ kind: 'checking' });
  out.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const result = await verifyBundle(input.bundle, ctx);
  if (run !== current) return;
  const view = { kind: 'result', result, leaf: input.bundle.leaf, source, slip };
  show(view);
  if (!(VERIFIED.includes(result.code) && result.verified)) return;
  if (compareSlip(slip?.ref, input.bundle.leaf) === 'mismatch') return; // not the slip's lot: its claims are not read

  // The lot's claims and the anchor's time: further chain reads, shown as they arrive.
  view.claims = { status: 'loading' };
  show(view);
  const leaf = input.bundle.leaf;
  const time = result.facts.dayRoot ? ledgerCloseTime(ctx, result.facts.dayRoot.ledger) : Promise.resolve(null);
  const claims = readClaims(ctx, leaf.warehouse_id, leaf.deposit_no, (progress) => {
    if (run !== current) return;
    view.claims = { status: 'loading', progress };
    show(view);
  }).then((data) => ({ status: 'ok', data }), () => ({ status: 'error' }));
  view.anchorTime = await time;
  if (run !== current) return;
  show(view);
  view.claims = await claims;
  if (run !== current) return;
  show(view);
}

$('check').addEventListener('click', () => {
  const text = $('bundle').value;
  if (!text.trim()) { status('Paste a bundle first, upload a file, or scan a QR code.'); return; }
  check(text, { how: 'pasted' });
});

$('file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) { status('That file is too large to be a proof bundle.'); return; }
  const text = await file.text();
  $('bundle').value = text;
  check(text, { how: 'file', detail: file.name });
  e.target.value = '';
});

let stopScan = null;
$('scan').addEventListener('click', async () => {
  if (!canScan()) {
    status("This browser cannot scan QR codes. Paste the bundle's text, or upload the file, instead.");
    return;
  }
  $('scanner').hidden = false;
  status('Point the camera at the QR code.');
  const ctl = new AbortController();
  stopScan = () => ctl.abort();
  try {
    const text = await scanCamera($('video'), ctl.signal);
    if (text !== null) { $('bundle').value = text; check(text, { how: 'qr' }); }
  } catch (e) {
    status(e.name === 'NotAllowedError' ? 'Camera permission was refused. Paste or upload the bundle instead.' : 'The camera could not be used. Paste or upload the bundle instead.');
  } finally {
    $('scanner').hidden = true;
    stopScan = null;
  }
});
$('scan-stop').addEventListener('click', () => { stopScan?.(); status(''); });

$('example').addEventListener('click', async () => {
  try {
    const res = await fetch('example/testnet-example.bundle.json', { cache: 'no-cache' });
    const text = await res.text();
    $('bundle').value = text;
    check(text, { how: 'example' });
  } catch {
    status('The example could not be loaded from this site.');
  }
});

$('wh-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('wh').value.trim();
  const target = $('wh-result');
  if (!isWarehouseId(id)) {
    $('wh-status').textContent = 'A warehouse id is 1 to 32 letters, digits or underscores, exactly as the warehouse uses it.';
    target.replaceChildren();
    return;
  }
  $('wh-status').textContent = '';
  mount(target, render({ kind: 'warehouse', warehouse: { status: 'loading' } }, NETWORK));
  let warehouse;
  try {
    warehouse = { status: 'ok', record: await warehouseRecord(ctx, id) };
  } catch {
    warehouse = { status: 'error' };
  }
  mount(target, render({ kind: 'warehouse', warehouse }, NETWORK));
});

// A bundle can also arrive in the link: #bundle=<base64url JSON> (never
// sent to any server), ?src=<https URL> to fetch it from anywhere,
// Farmledge included, or a reprinted slip's #p=<token>&d=<warehouse>.<no>.
// Whatever the route it is only a claim, and the page says where it came from.
async function fromLink() {
  const frag = new URLSearchParams(location.hash.slice(1));
  if (frag.has('p') || frag.has('d')) slip = slipFromFragment(location.hash);
  const hash = frag.get('bundle');
  if (hash) {
    try {
      const text = new TextDecoder().decode(Uint8Array.from(atob(hash.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
      $('bundle').value = text;
      check(text, { how: 'link' });
    } catch { status('The link carries a bundle that could not be decoded.'); }
    return;
  }
  if (slip?.token) { await fromToken(slip.token); return; }
  if (slip) {
    show({ kind: 'slip-waiting', slip, reason: slip.tokenBad ? "The link's proof token is damaged, so no bundle was fetched." : 'The link carries no bundle.' });
    return;
  }
  const src = new URLSearchParams(location.search).get('src');
  if (src) {
    let url;
    try { url = new URL(src); } catch { status('The link names a bundle address that is not a URL.'); return; }
    if (url.protocol !== 'https:') { status('Bundles are fetched over https only.'); return; }
    try {
      const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      $('bundle').value = text;
      check(text, { how: 'fetched', detail: url.href });
    } catch {
      status(`The bundle could not be fetched from ${url.href}. Paste or upload it instead.`);
    }
  }
}

// A reprinted slip's token (API D58). It stays in the fragment, so this
// page's host never sees it; it goes only to Farmledge's proof API, which
// is page configuration, to fetch the bundle it names.
async function fromToken(token) {
  const wait = (reason) => show({ kind: 'slip-waiting', slip, reason });
  if (!NETWORK.proofApi) { wait('This page has no Farmledge address set to fetch the bundle the link names, so nothing was fetched.'); return; }
  const url = resolverUrl(NETWORK.proofApi, token);
  status('Fetching the bundle from Farmledge…');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NETWORK.proofTimeoutMs);
  let res, text;
  try {
    res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    if (res.ok) text = await res.text();
  } catch {
    res = null;
  } finally {
    clearTimeout(timer);
    status('');
  }
  if (res === null) { wait(ctl.signal.aborted ? `Farmledge did not answer within ${NETWORK.proofTimeoutMs / 1000} seconds, so nothing was fetched.` : 'The bundle could not be fetched from Farmledge: no answer.'); return; }
  if (res.status === 404) { wait('Farmledge has no proof for the token in this link.'); return; }
  if (res.status === 429) { wait('Farmledge is refusing requests: too many were made. Reload the page shortly.'); return; }
  if (!res.ok) { wait(`The bundle could not be fetched from Farmledge (HTTP ${res.status}).`); return; }
  $('bundle').value = text;
  check(text, { how: 'token', detail: url });
}

$('network-name').textContent = NETWORK.name;
$('network-contract').textContent = NETWORK.contractId;
if (!NETWORK.isTestNetwork) $('network-note').textContent = 'The Stellar public network.';
document.documentElement.dataset.network = NETWORK.id;
show({ kind: 'idle' });
fromLink();
