// docs/claims.md, enforced. The standing rule: every sentence this page
// says about what Farmledge, a warehouse or anyone in the system does is
// true of the deployed system today. docs/claims.md lists each one with its evidence; this test makes
// the list impossible to skip:
//
//   - every sentence of the page's copy that mentions the system must be
//     quoted, exactly, in docs/claims.md;
//   - every quote there must still be on the page;
//   - every capability claim must carry evidence and the date it was checked;
//   - any change to the copy at all, mentioning the system or not, changes
//     the copy hash, and fails until docs/claims.md is re-checked and its
//     hash updated.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { ABOUT_THE_SYSTEM, pageSentences } from './support/copy.js';

const CLAIMS = readFileSync(fileURLToPath(new URL('../docs/claims.md', import.meta.url)), 'utf8');
const quoted = new Set(CLAIMS.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2).trim()));
const sentences = pageSentences();
/** Code, not copy: import paths, ids, CSS classes and state names never reach the reader as words. */
const CODE = /^([a-z0-9_.\/-]+|[A-Z0-9_]+|(facts|claims|result|verdict|ref)( [a-z-]+)+)$/;
const aboutTheSystem = [...new Set(sentences.map((x) => x.s).filter((s) => ABOUT_THE_SYSTEM.test(s) && !CODE.test(s)))];

test('every sentence about the system is in docs/claims.md, word for word', () => {
  const missing = aboutTheSystem.filter((s) => !quoted.has(s));
  assert.deepEqual(missing, [], `Not in docs/claims.md. Check each is true of the deployed system today, then quote it there:\n${missing.map((s) => `> ${s}`).join('\n')}`);
});

test('nothing quoted in docs/claims.md has left the page', () => {
  const onPage = new Set(sentences.map((x) => x.s));
  const stale = [...quoted].filter((q) => !onPage.has(q));
  assert.deepEqual(stale, [], 'Quoted in docs/claims.md but no longer on the page: remove or update them');
});

test('every capability claim names its evidence and when it was checked', () => {
  const section = CLAIMS.split(/^## /m).find((s) => s.startsWith('Capability claims'));
  assert.ok(section, 'docs/claims.md has a "## Capability claims" section');
  const claims = section.split(/^### /m).slice(1);
  assert.ok(claims.length >= 5);
  for (const c of claims) {
    const title = c.split('\n')[0];
    assert.match(c, /^> /m, `${title}: quotes no copy`);
    assert.match(c, /^- \*\*Evidence:\*\*\s+\S/m, `${title}: no evidence`);
    assert.match(c, /^- \*\*False when:\*\* \S/m, `${title}: no condition that would make it false`);
    assert.match(c, /^- \*\*Checked:\*\* \d{4}-\d{2}-\d{2}/m, `${title}: no date checked`);
  }
});

test('the copy has not changed since docs/claims.md was last checked', () => {
  const hash = createHash('sha256').update(sentences.map((x) => `${x.where}\t${x.s}`).join('\n')).digest('hex');
  const recorded = /^copy-sha256: ([0-9a-f]{64})$/m.exec(CLAIMS)?.[1];
  assert.equal(recorded, hash, `The page's copy changed. Re-check every claim in docs/claims.md against the deployed system, then set:\ncopy-sha256: ${hash}`);
});
