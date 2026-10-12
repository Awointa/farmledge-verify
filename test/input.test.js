// What the page accepts. Only a bundle is ever checked; the slip QR forms
// that exist today are recognised and explained.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEAF_FIELDS, classifyInput } from '../src/input.js';
import { fixtures } from './support/fixtures.js';

const bundleText = () => fixtures().find((f) => f.name === 'valid').bundleText;

test('a bundle is a bundle', () => {
  assert.equal(classifyInput(bundleText()).kind, 'bundle');
  assert.equal(classifyInput(`\n  ${bundleText()}  \n`).kind, 'bundle');
});

test('a capture receipt from an unsynced tablet is recognised, and carries no proof', () => {
  const r = classifyInput('farmledge:capture:5f0c8a7e-2b1d-4c3e-9a8f-0123456789ab');
  assert.deepEqual(r, { kind: 'capture', depositId: '5f0c8a7e-2b1d-4c3e-9a8f-0123456789ab' });
});

test('the post-sync slip leaf is recognised as an unverified claim, never as a bundle', () => {
  const leaf = { ...JSON.parse(bundleText()).leaf, index: null };
  const r = classifyInput(JSON.stringify(leaf));
  assert.equal(r.kind, 'leaf');
  assert.equal(r.leaf.index, null);
});

test('a slip leaf shows only leaf fields: anything else on it is dropped', () => {
  const leaf = { ...JSON.parse(bundleText()).leaf, index: null, farmer_name: 'must not show', phone: '0800' };
  const r = classifyInput(JSON.stringify(leaf));
  assert.deepEqual(Object.keys(r.leaf).sort(), [...LEAF_FIELDS].sort());
  assert.ok(!JSON.stringify(r.leaf, (k, v) => (typeof v === 'bigint' ? String(v) : v)).includes('must not show'));
});

test('anything else is unknown or an unreadable bundle, never checked', () => {
  assert.equal(classifyInput('FL1:KN-DAWANAU:1042:7QK3').kind, 'unknown');
  assert.equal(classifyInput('1042').kind, 'unknown');
  assert.equal(classifyInput('').kind, 'unknown');
  assert.equal(classifyInput('[1,2]').kind, 'unknown');
  assert.equal(classifyInput('{"proof": [').kind, 'unreadable-bundle');
});
