// The committed fixtures, and the browser verifier run against one.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJson, verifyBundle } from '../../src/verify.js';
import { serveChain } from './mockrpc.js';
import { CONTRACT } from './sdk.js';

const DIR = fileURLToPath(new URL('../fixtures/', import.meta.url));

export const fixtures = () => readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));

export async function runBrowser(fx) {
  const rpc = await serveChain(fx.chain);
  try {
    let bundle;
    try { bundle = parseJson(fx.bundleText); } catch { return { code: 'BAD_BUNDLE', verified: false, facts: {}, result: null, calls: 0 }; }
    const r = await verifyBundle(bundle, { rpcUrl: rpc.url, contractId: CONTRACT, timeoutMs: 1500 });
    return { ...r, result: r, calls: rpc.state.calls };
  } finally {
    await rpc.close();
  }
}
