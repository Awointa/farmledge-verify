// The self-hosted fonts are subsets (fonts/subset.py). Text that uses a
// character outside a subset falls back to another font mid-word. This
// fails before that can ship: Hausa's ɓ ɗ ƙ above all, which none of the
// three families has.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { OUTCOMES } from '../src/verify.js';
import { verdict } from '../src/render.js';
import { NETWORK } from '../src/config.js';

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');
const { fonts } = JSON.parse(read('fonts/coverage.json'));
const covered = (file) => new Set(fonts[file]);
const outside = (text, set) => [...new Set([...text].filter((c) => !set.has(c.codePointAt(0)) && c !== '\n' && c !== '\t' && c !== '\r'))];

test('body text uses only characters the DM Sans subsets cover', () => {
  const text = read('index.html') + read('src/render.js') + read('src/app.js');
  for (const f of ['dm-sans-400.woff2', 'dm-sans-700.woff2']) assert.deepEqual(outside(text, covered(f)), [], f);
});

test('headings use only characters the Fraunces subset covers', () => {
  const headlines = Object.keys(OUTCOMES).map((c) => verdict(c, { facts: {}, detail: '' }, NETWORK).headline);
  const html = [...read('index.html').matchAll(/<h[1-3][^>]*>([^<]*)</g)].map((m) => m[1]);
  const render = [...read('src/render.js').matchAll(/h\('h[23]', (?:null|\{[^}]*\}), ([`'"])(.*?)\1/g)].map((m) => m[2]);
  const brand = 'Farmledge Verify';
  assert.ok(headlines.length && html.length && render.length);
  assert.deepEqual(outside([...headlines, ...html, ...render, brand].join(''), covered('fraunces-600.woff2')), []);
});

test('the Hausa hooked letters are not in these fonts: a Hausa page needs another family', () => {
  const hausa = [...'ɓɗƙƁƊƘ'].map((c) => c.codePointAt(0));
  for (const f of Object.keys(fonts)) assert.deepEqual(hausa.filter((c) => covered(f).has(c)), [], `${f} now covers Hausa: update this test and the note in fonts/subset.py`);
  assert.doesNotMatch(read('index.html') + read('src/render.js'), /[ɓɗƙƁƊƘ]/, 'Hausa text needs a font family that has ɓ ɗ ƙ');
});
