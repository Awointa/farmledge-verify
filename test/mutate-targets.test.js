// Every mutation in test/mutate.js names text that is in its file exactly
// once. A copy or code edit that moves a target otherwise breaks the
// mutation pass only in CI, minutes later. Skipped while mutating: there, a
// target is missing by design, and this test would "catch" every mutation.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { MUTATIONS } from './mutate.js';

test('every mutation target is in its file exactly once', { skip: process.env.FARMLEDGE_MUTATING === '1' }, () => {
  for (const [name, file, find] of MUTATIONS) {
    const src = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    assert.equal(src.split(find.replace(/\\n/g, '\n')).length - 1, 1, `mutation "${name}": its text is not in ${file} exactly once`);
  }
});
