// The committed fixtures are exactly what test/make-fixtures.js builds, and
// the shipped verify_proof.py is the protocol's, byte for byte.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { DIR, FIXTURES } from './make-fixtures.js';

test('fixtures are generated, not hand-edited', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(files, Object.keys(FIXTURES).map((n) => `${n}.json`).sort());
  for (const [name, f] of Object.entries(FIXTURES)) {
    const { bundle, bundleText, ...rest } = f;
    const want = `${JSON.stringify({ name, ...rest, bundleText: bundleText ?? JSON.stringify(bundle, null, 2) }, null, 2)}\n`;
    assert.equal(readFileSync(`${DIR}${name}.json`, 'utf8'), want, name);
  }
});

test('scripts/verify_proof.py is the pinned protocol version', () => {
  const pin = JSON.parse(readFileSync(fileURLToPath(new URL('../scripts/verify_proof.pin.json', import.meta.url)), 'utf8'));
  const got = createHash('sha256').update(readFileSync(fileURLToPath(new URL('../scripts/verify_proof.py', import.meta.url)))).digest('hex');
  assert.equal(got, pin.sha256, `verify_proof.py differs from farmledge-protocol ${pin.commit}`);
});

test("the page and README link the protocol at the pinned commit", () => {
  const pin = JSON.parse(readFileSync(fileURLToPath(new URL('../scripts/verify_proof.pin.json', import.meta.url)), 'utf8'));
  for (const f of ['../index.html', '../README.md']) {
    const text = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
    const commits = [...text.matchAll(/farmledge-protocol\/blob\/([0-9a-f]{40})\//g)].map((m) => m[1]);
    assert.ok(commits.length >= 2, f);
    for (const c of commits) assert.equal(c, pin.commit, `${f} links ${c}`);
  }
});
