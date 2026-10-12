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

const ctx = Object.freeze({ rpcUrl: NETWORK.rpcUrl, contractId: NETWORK.contractId });
const $ = (id) => document.getElementById(id);
const out = $('result');
let current = 0; // a newer check supersedes an older one

function show(view) { mount(out, render(view, NETWORK)); }
function status(text) { $('input-status').textContent = text; }

async function check(text, source) {
  const run = ++current;
  status('');
  const input = classifyInput(text);
  if (input.kind !== 'bundle') {
    show({ ...input, source });
    out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  show({ kind: 'checking' });
  out.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const result = await verifyBundle(input.bundle, ctx);
  if (run !== current) return;
  const view = { kind: 'result', result, leaf: input.bundle.leaf, source };
  show(view);
  if (!(VERIFIED.includes(result.code) && result.verified)) return;

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
// sent to any server), or ?src=<https URL> to fetch it from anywhere,
// Farmledge included. Either way it is only a claim, and the page says so.
async function fromLink() {
  const hash = new URLSearchParams(location.hash.slice(1)).get('bundle');
  if (hash) {
    try {
      const text = new TextDecoder().decode(Uint8Array.from(atob(hash.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
      $('bundle').value = text;
      check(text, { how: 'link' });
    } catch { status('The link carries a bundle that could not be decoded.'); }
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

$('network-name').textContent = NETWORK.name;
$('network-contract').textContent = NETWORK.contractId;
if (!NETWORK.isTestNetwork) $('network-note').textContent = 'The Stellar public network.';
document.documentElement.dataset.network = NETWORK.id;
show({ kind: 'idle' });
fromLink();
