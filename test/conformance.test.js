// The most important test in the repo. Every fixture goes through the
// browser verifier (src/verify.js) and the standalone one
// (scripts/verify_proof.py), each against its own stand-in RPC serving the
// fixture's chain. Both must give the fixture's expected outcome, so they
// agree with each other, including on which failure it is.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { serveChain } from './support/mockrpc.js';
import { fixtures, runBrowser } from './support/fixtures.js';

const SCRIPT = fileURLToPath(new URL('../scripts/verify_proof.py', import.meta.url));
// The mutation pass changes only the browser verifier: it skips the Python half.
const PYTHON = process.env.FARMLEDGE_SKIP_PYTHON !== '1';
const tmp = mkdtempSync(join(tmpdir(), 'farmledge-verify-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

async function runPython(fx) {
  const rpc = await serveChain(fx.chain);
  const file = join(tmp, `${fx.name}.json`);
  writeFileSync(file, fx.bundleText);
  try {
    const { stdout } = await new Promise((resolve) => {
      execFile('python3', ['-I', SCRIPT, file, '--rpc', rpc.url], { timeout: 90_000 }, (err, out, stderr) => resolve({ stdout: out, stderr }));
    });
    const last = stdout.trim().split('\n').at(-1) ?? '';
    return { code: last.startsWith('RESULT ') ? last.slice(7) : 'NO RESULT LINE', stdout };
  } finally {
    await rpc.close();
  }
}

describe('conformance: browser verifier and verify_proof.py agree on every fixture', () => {
  const all = fixtures();
  test('the fixture set covers every verification outcome', () => {
    const codes = new Set(all.map((f) => f.expect));
    for (const c of ['OK', 'DAY_ROOT_EXPIRED', 'NOT_YET_ANCHORED', 'PROOF_DOES_NOT_FIT', 'DAY_IN_FUTURE',
      'DAY_ROOT_DIFFERS', 'NO_HEAD', 'HEAD_MISMATCH', 'BAD_BUNDLE', 'COULD_NOT_CHECK']) {
      assert.ok(codes.has(c), `no fixture expects ${c}`);
    }
  });

  for (const fx of all) {
    test(`${fx.name}: ${fx.description} -> ${fx.expect}`, async () => {
      const [js, py] = await Promise.all([runBrowser(fx), PYTHON ? runPython(fx) : null]);
      assert.equal(js.code, fx.expect, `browser verifier: ${js.detail ?? ''}`);
      if (py) {
        assert.equal(py.code, fx.expect, `verify_proof.py:\n${py.stdout}`);
        assert.equal(py.code, js.code);
      }
    });
  }
});
