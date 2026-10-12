// src/xdr.js is written by hand to mirror verify_proof.py. Here it is
// checked against the Stellar SDK, an independent implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, StrKey, xdr } from '@stellar/stellar-base';

import { decodeScVal, encodeStrkey, fromHex, strkey, toHex } from '../src/xdr.js';
import { leafHash, leafXdr, parseJson } from '../src/verify.js';
import { leafHash as sdkLeafHash, leafScVal, sha } from './support/sdk.js';
import { fixtures } from './support/fixtures.js';

test('leaf XDR and hash equal the SDK\'s for every well-formed fixture leaf', async () => {
  let n = 0;
  for (const fx of fixtures().filter((f) => f.expect !== 'BAD_BUNDLE')) {
    const leaf = parseJson(fx.bundleText).leaf;
    const plain = JSON.parse(fx.bundleText).leaf;
    if (!Number.isSafeInteger(plain.deposited_at)) continue; // the SDK side reads plain JSON
    assert.equal(toHex(leafXdr(leaf)), leafScVal(plain).toXDR('hex'), fx.name);
    assert.equal(toHex(await leafHash(leaf)), sdkLeafHash(plain).toString('hex'), fx.name);
    n++;
  }
  assert.ok(n > 20);
});

test('strkeys decode and encode as the SDK does', () => {
  for (let i = 0; i < 50; i++) {
    const kp = Keypair.fromRawEd25519Seed(sha(Buffer.from(`strkey:${i}`)));
    const g = kp.publicKey();
    assert.deepEqual(strkey(g), { kind: 'account', key: Uint8Array.from(kp.rawPublicKey()) });
    assert.equal(encodeStrkey('account', kp.rawPublicKey()), g);
    const c = StrKey.encodeContract(sha(Buffer.from(`contract:${i}`)));
    assert.equal(strkey(c).kind, 'contract');
    assert.equal(encodeStrkey('contract', strkey(c).key), c);
  }
});

test('strkeys the SDK rejects are rejected', () => {
  const g = Keypair.fromRawEd25519Seed(sha(Buffer.from('x'))).publicKey();
  const flipped = g.slice(0, 10) + (g[10] === 'A' ? 'B' : 'A') + g.slice(11);
  for (const bad of [flipped, g.toLowerCase(), g.slice(0, -1), `${g}A`, '', `S${g.slice(1)}`]) {
    assert.equal(StrKey.isValidEd25519PublicKey(bad) || StrKey.isValidContract(bad), false, bad);
    assert.throws(() => strkey(bad), /bad address/, bad);
  }
});

test('hex reads as Python bytes.fromhex does', () => {
  assert.deepEqual(fromHex('00ff'), Uint8Array.of(0, 255));
  assert.deepEqual(fromHex('00 FF\n10'), Uint8Array.of(0, 255, 16));
  for (const bad of ['0', '0g', '0 0', 'zz']) assert.throws(() => fromHex(bad), bad);
});

test('stored values decode as the SDK decodes them', () => {
  for (const fx of fixtures().filter((f) => f.claims)) {
    for (const e of fx.chain.entries) {
      const data = xdr.LedgerEntryData.fromXDR(e.xdr, 'base64');
      const val = data.contractData().val();
      const raw = new Uint8Array(val.toXDR());
      const { value, end } = decodeScVal(raw);
      assert.equal(end, raw.length);
      assert.deepEqual(normalise(value), sdkNative(val), fx.name);
    }
  }
});

const normalise = (v) => (v instanceof Uint8Array ? toHex(v) : Array.isArray(v) ? v.map(normalise) : typeof v === 'bigint' ? v.toString() : v);
function sdkNative(v) {
  switch (v.switch().name) {
    case 'scvU32': return v.u32();
    case 'scvU64': return v.u64().toString();
    case 'scvBytes': return Buffer.from(v.bytes()).toString('hex');
    case 'scvString': case 'scvSymbol': return v.value().toString();
    case 'scvVoid': return null;
    case 'scvVec': return v.vec().map(sdkNative);
    case 'scvAddress': {
      const a = v.address();
      return a.switch().name === 'scAddressTypeAccount'
        ? StrKey.encodeEd25519PublicKey(a.accountId().ed25519()) : StrKey.encodeContract(a.contractId());
    }
    default: throw new Error(v.switch().name);
  }
}

test('a value cut short is refused, never read as a shorter one', () => {
  const full = new Uint8Array(xdr.ScVal.scvBytes(Buffer.alloc(32, 7)).toXDR());
  assert.equal(decodeScVal(full).value.length, 32);
  for (const cut of [4, 12, 20]) assert.throws(() => decodeScVal(full.subarray(0, full.length - cut)), /truncated/);
});
