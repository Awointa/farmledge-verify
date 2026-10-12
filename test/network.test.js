// The page checks one network. A bundle for another contract is refused
// before anything is read, and the bundle's own rpc is never used.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NETWORK } from '../src/config.js';
import { parseJson, verifyBundle } from '../src/verify.js';
import { serveChain } from './support/mockrpc.js';
import { CONTRACT } from './support/sdk.js';
import { fixtures } from './support/fixtures.js';

const valid = () => fixtures().find((f) => f.name === 'valid');

test('the page is configured for the published Testnet deployment', () => {
  assert.equal(NETWORK.contractId, 'CBW6TA5UJMXJY2VYPJV6WUVWNUP3PKZNPXFMC2CNVCWZDF3SKIT4UAIN');
  assert.equal(NETWORK.passphrase, 'Test SDF Network ; September 2015');
  assert.equal(NETWORK.isTestNetwork, true);
});

test('a bundle for another contract is WRONG_NETWORK, and the chain is never read', async () => {
  const fx = valid();
  const rpc = await serveChain(fx.chain);
  try {
    for (const other of ['CDLSGBNIO6NGYBHFA2WZNZK3RJKEQTE7N4JTZ7TBZYW6KH42KXKLZJW3', '', null, 42]) {
      const b = { ...parseJson(fx.bundleText), contract_id: other };
      const r = await verifyBundle(b, { rpcUrl: rpc.url, contractId: CONTRACT });
      assert.equal(r.code, 'WRONG_NETWORK');
      assert.equal(r.verified, false);
    }
    const b = parseJson(fx.bundleText);
    delete b.contract_id;
    assert.equal((await verifyBundle(b, { rpcUrl: rpc.url, contractId: CONTRACT })).code, 'WRONG_NETWORK');
    assert.equal(rpc.state.calls, 0);
  } finally { await rpc.close(); }
});

test("the bundle's rpc is ignored: only the page's RPC is read", async () => {
  const fx = valid();
  const liar = await serveChain({ ...fx.chain, entries: [] }); // would say NO_HEAD
  const honest = await serveChain(fx.chain);
  try {
    const b = { ...parseJson(fx.bundleText), rpc: liar.url };
    const r = await verifyBundle(b, { rpcUrl: honest.url, contractId: CONTRACT });
    assert.equal(r.code, 'OK');
    assert.equal(liar.state.calls, 0);
    assert.equal(r.facts.rpcUrl, honest.url);
  } finally { await liar.close(); await honest.close(); }
});
