// The mutation pass. Each mutation removes or disables exactly one check in
// the browser verifier or its chain reads, then runs the test suite, which
// must fail. A check no test catches is not a check: one surviving mutation
// fails this script, and CI.
//
//     node test/mutate.js [name ...]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export const MUTATIONS = [
  // --- src/verify.js: the proof check ---
  ['network gate', 'src/verify.js', 'if (b.contract_id !== ctx.contractId) {', 'if (false) {'],
  ['not an object', 'src/verify.js', "if (!isObject(b)) return result('BAD_BUNDLE', 'not a JSON object', facts, endpoint);", ''],
  ['integers are integers', 'src/verify.js', "if (!ints.every(isInt)) throw new BadInput('integer fields must be JSON integers');", ''],
  ['later_days are u32', 'src/verify.js', 'for (const d of later) await chain(prev, ...d); // rejects days or counts that are not u32', ''],
  ['hashes are 32 bytes', 'src/verify.js', "if ([...proof, prev, ...later.map((d) => d[2])].some((x) => x.length !== 32)) throw new BadInput('hashes are 32 bytes');", ''],
  ['fit: leaf count in range', 'src/verify.js', "if (!(n >= 1n && n <= 2n ** 20n)) throw new Outcome('PROOF_DOES_NOT_FIT', `${n} leaves`);", ''],
  ['fit: proof depth', 'src/verify.js', "if (BigInt(proof.length) !== BigInt((n - 1n).toString(2).replace(/^0$/, '').length)) throw new Outcome('PROOF_DOES_NOT_FIT', `${proof.length} siblings for ${n} leaves`);", ''],
  ['fit: index inside the day', 'src/verify.js', "if (!(idx >= 0n && idx < n)) throw new Outcome('PROOF_DOES_NOT_FIT', `index ${idx} of ${n}`);", ''],
  ['leaf prefix 0x00', 'src/verify.js', 'export const leafHash = async (leaf) => sha(Uint8Array.of(0), leafXdr(leaf));', 'export const leafHash = async (leaf) => sha(leafXdr(leaf));'],
  ['fold: left or right', 'src/verify.js', 'h = i % 2n === 0n ?', 'h = true ?'],
  ['no head', 'src/verify.js', "if (head === null) throw new Outcome('NO_HEAD', leaf.warehouse_id);", ''],
  ['day in the future', 'src/verify.js', "if (day > BigInt(today)) throw new Outcome('DAY_IN_FUTURE', `day ${day}`);", ''],
  ['not yet anchored', 'src/verify.js', "if (day > BigInt(lastDay)) throw new Outcome('NOT_YET_ANCHORED', `day ${day}, last anchored ${lastDay}`);", ''],
  ['day root: root', 'src/verify.js', 'if (!(equal(onChainRoot, root) && BigInt(leaves) === n))', 'if (!(BigInt(leaves) === n))'],
  ['day root: leaf count', 'src/verify.js', 'if (!(equal(onChainRoot, root) && BigInt(leaves) === n))', 'if (!(equal(onChainRoot, root)))'],
  ['head chain: compare', 'src/verify.js', 'if (!equal(hd, onChainHead)) {', 'if (false) {'],
  ['head chain: later days', 'src/verify.js', 'for (const d of later) hd = await chain(hd, ...d);', ''],
  ['expired is not fresh', 'src/verify.js', "return dayRoot !== null ? 'OK' : 'DAY_ROOT_EXPIRED';", "return 'OK';"],
  ['value shape from the chain', 'src/verify.js', "if (!ok) throw new ChainUnreadable('unexpected value shape');", ''],
  ['chain hashes are 32 bytes', 'src/verify.js', 'x instanceof Uint8Array && x.length === 32', 'x instanceof Uint8Array'],
  ['could-not-check shows nothing', 'src/verify.js', "const shown = code === 'COULD_NOT_CHECK' ? {} : { ...facts };", 'const shown = { ...facts };'],
  ['results are frozen', 'src/verify.js', "return Object.freeze({ code, verified: OUTCOMES[code].verified, detail: detail ?? '', facts: Object.freeze(shown), endpoint });", "return { code, verified: OUTCOMES[code].verified, detail: detail ?? '', facts: shown, endpoint };"],
  ['endpoint is the page\'s', 'src/verify.js', 'const endpoint = Object.freeze({ used: ctx.rpcUrl, suggested });', 'const endpoint = Object.freeze({ used: suggested ?? ctx.rpcUrl, suggested });'],
  ['only two codes are verified', 'src/verify.js', 'COULD_NOT_CHECK: { verified: false, exit: 3 },', 'COULD_NOT_CHECK: { verified: true, exit: 3 },'],
  ['pending is not verified', 'src/verify.js', 'NOT_YET_ANCHORED: { verified: false, exit: 2 },', 'NOT_YET_ANCHORED: { verified: true, exit: 2 },'],
  ['exact integers', 'src/verify.js', 'return /^-?(0|[1-9][0-9]*)$/.test(ctx.source) ? BigInt(ctx.source) : v;', 'return Number.isInteger(v) ? BigInt(v) : v;'],
  // --- src/xdr.js ---
  ['strkey checksum', 'src/xdr.js', 'if (crc16(body) !== crc || kind === null', 'if (kind === null'],
  ['strkey version byte', 'src/xdr.js', '|| kind === null || body.length !== 33', '|| body.length !== 33'],
  ['strkey one spelling', 'src/xdr.js', "if (typeof s !== 'string' || s.length !== 56)", "if (typeof s !== 'string')"],
  ['map keys sorted', 'src/xdr.js', 'const keys = Object.keys(v).sort((a, b) => compareBytes(utf8(a), utf8(b)));', 'const keys = Object.keys(v);'],
  ['map keys sorted by bytes', 'src/xdr.js', 'const keys = Object.keys(v).sort((a, b) => compareBytes(utf8(a), utf8(b)));', 'const keys = Object.keys(v).sort();'],
  ['u32 range', 'src/xdr.js', "if (v < 0n || v > 0xffffffffn) throw new BadInput(`${n} is not a u32`);", ''],
  ['u64 range', 'src/xdr.js', "if (v < 0n || v > 0xffffffffffffffffn) throw new BadInput(`${n} is not a u64`);", ''],
  ['valid Unicode only', 'src/xdr.js', "throw new BadInput('string is not valid Unicode');", ''],
  ['hex: whitespace between pairs', 'src/xdr.js', "if (WHITESPACE.includes(s[i])) { i++; continue; }", ''],
  ['truncated XDR', 'src/xdr.js', "const need = (n) => { if (o + n > bytes.length) throw new Error('truncated XDR'); };", 'const need = () => {};'],
  // --- src/rpc.js ---
  ['HTTP status', 'src/rpc.js', 'if (!res.ok) throw new Error(`HTTP ${res.status}`);', ''],
  ['JSON-RPC error', 'src/rpc.js', "if ('error' in reply) throw new Error(JSON.stringify(reply.error));", ''],
  ['JSON-RPC result present', 'src/rpc.js', "if (!('result' in reply)) throw new Error('no result');", ''],
  ['timeout', 'src/rpc.js', 'const timer = setTimeout(() => ctl.abort(), ctx.timeoutMs ?? 20_000);', 'const timer = 0;'],
  ['entry is for the key asked', 'src/rpc.js', "if (!equal(data.slice(0, prefix.length), prefix)) throw new ChainUnreadable('unexpected entry layout');", ''],
  ['no bytes after the value', 'src/rpc.js', "if (d.end !== data.length) throw new Error('unexpected bytes after the value');", ''],
  ['archived is reported', 'src/rpc.js', 'archived: liveUntil !== null && Number(liveUntil) < Number(result.latestLedger) });', 'archived: false });'],
  // --- src/claims.js ---
  ['claims: layout version', 'src/claims.js', '|| v[0] !== DATA_VERSION) {', ') {'],
  ['claims: unknown status', 'src/claims.js', 'if (status === undefined) throw new ChainUnreadable(`receipt ${id} has status code ${v[13]}`);', ''],
  ['claims: indexed receipt present', 'src/claims.js', 'if (e === null) throw new ChainUnreadable(`receipt ${ids[i]} is indexed but was not returned`);', 'if (e === null) return;'],
  ['claims: index page present', 'src/claims.js', 'if (e === null || !Array.isArray(e.value)) throw new ChainUnreadable(`index page ${p} could not be read`);', 'if (e === null) return;'],
  ['claims: same warehouse', 'src/claims.js', 'if (r.warehouseId === warehouseId && r.depositNo === BigInt(depositNo))', 'if (r.depositNo === BigInt(depositNo))'],
  ['claims: same lot', 'src/claims.js', 'if (r.warehouseId === warehouseId && r.depositNo === BigInt(depositNo))', 'if (r.warehouseId === warehouseId)'],
  ['claims: loan_ref withheld', 'src/claims.js', '{ lender: v[14][0][0], dueDate:', '{ lender: v[14][0][0], loanRef: v[14][0][1], dueDate:'],
  ['claims: recovery flagged', 'src/claims.js', "recovery: receipts.some((r) => r.status === 'Recovery'),", 'recovery: false,'],
  // --- src/warehouse.js ---
  ['warehouse: gaps', 'src/warehouse.js', 'if (!have.has(d)) gaps.push(d);', ''],
  ['warehouse: no head', 'src/warehouse.js', 'if (head === null) return { warehouseId, chainDay: today, head: null, days: [], gaps: [] };', ''],
  // --- src/render.js: what the page shows ---
  ['render: code and flag must agree', 'src/render.js', "const consistent = VERIFIED.includes(view.result.code) === (view.result.verified === true);", 'const consistent = true;'],
  ['render: honesty beside the tick', 'src/render.js', 'verified && !mismatch ? [honesty(r), deposit(view.leaf)', 'verified && !mismatch ? [deposit(view.leaf)'],
  ['render: recovery banner', 'src/render.js', "claims?.status === 'ok' && claims.data.summary.recovery ? recoveryBanner() : null,", ''],
  ['render: could-not-check tone', 'src/render.js', "case 'COULD_NOT_CHECK': default: return { tone: 'nocheck', icon: 'question',", "case 'COULD_NOT_CHECK': default: return { tone: 'verified', icon: 'check',"],
  ['render: pending is not verified', 'src/render.js', "case 'NOT_YET_ANCHORED': return { tone: 'pending', icon: 'clock',", "case 'NOT_YET_ANCHORED': return { tone: 'verified', icon: 'check',"],
  ['render: source shown', 'src/render.js', '    sourceLine(view.source),\n', ''],
  ['render: suggested endpoint shown', 'src/render.js', ": ['The bundle suggested ', mono(e.suggested), ': not used. A bundle cannot choose what it is checked against.']);", ": '');"],
  ['render: why expired suffices', 'src/render.js', "r.code === 'DAY_ROOT_EXPIRED'\n      ? h('p'", "false\n      ? h('p'"],
  // --- src/slip.js and its display: the page-level slip check ---
  ['slip: same warehouse', 'src/slip.js', 'const sameWarehouse = leaf?.warehouse_id === slipRef.warehouseId;', 'const sameWarehouse = true;'],
  ['slip: same deposit number', 'src/slip.js', 'sameNumber = BigInt(leaf?.deposit_no) === slipRef.depositNo;', 'sameNumber = true;'],
  ['slip: a deposit record', 'src/slip.js', 'aDeposit = BigInt(leaf?.kind) === 0n;', 'aDeposit = true;'],
  ['slip: one spelling of the number', 'src/slip.js', 'const REF = /^([A-Za-z0-9_]{1,32})\\.(0|[1-9][0-9]{0,19})$/;', 'const REF = /^([A-Za-z0-9_]{1,32})\\.([0-9]{1,20})$/;'],
  ['slip: u64 range', 'src/slip.js', 'if (depositNo > U64_MAX) return null;', ''],
  ['slip: token shape', 'src/slip.js', 'token: token !== null && isToken(token) ? token : null,', 'token,'],
  ['slip: unreadable reference reported', 'src/slip.js', 'refBad: refText !== null && ref === null,', 'refBad: false,'],
  ['render: verification failure first', 'src/render.js', 'const check = verified ? compareSlip(view.slip?.ref, view.leaf) : null;', 'const check = compareSlip(view.slip?.ref, view.leaf);'],
  ['render: mismatch overrides verified', 'src/render.js', "const mismatch = check === 'mismatch';", 'const mismatch = false;'],
  ['render: no claims for another lot', 'src/render.js', 'const claims = verified && !mismatch ? view.claims : null;', 'const claims = verified ? view.claims : null;'],
  ['render: reference on every result', 'src/render.js', '    refPanel(view, verified, check),\n', ''],
  ['render: missing reference said', 'src/render.js', "!slip.ref ? 'missing' :", "!slip.ref ? 'none' :"],
  ['slip: resolver gets a token only', 'src/slip.js', "if (!isToken(token)) throw new Error('not a proof token');", ''],
  // --- the copy: docs/claims.md is enforced (test/copy-claims.test.js) ---
  ['copy: the old SMS claim comes back', 'src/render.js', 'Its text-message sending is a placeholder that only writes to a log.', 'Within 24 hours the farmer is sent the proof bundle by SMS link.'],
  ['copy: a nightly anchor is promised', 'src/render.js', 'Check again after the warehouse next anchors its books:', "Check again after the warehouse's next nightly anchor:"],
  // --- src/input.js ---
  ['input: capture receipts recognised', 'src/input.js', "if (m) return { kind: 'capture', depositId: m[1] };", ''],
  ['input: slip leaf fields only', 'src/input.js', 'for (const k of LEAF_FIELDS) if (k in v) leaf[k] = v[k];', 'Object.assign(leaf, v);'],
  ['input: a slip leaf is not a bundle', 'src/input.js', "if ('salt' in v && 'warehouse_id' in v && 'deposit_no' in v) {", "if (false) {"],
];

function run(only) {
  const survivors = [];
  const list = MUTATIONS.filter(([name]) => only.length === 0 || only.includes(name));
  for (let [name, file, find, replace] of list) {
    const path = `${ROOT}${file}`;
    const original = readFileSync(path, 'utf8');
    find = find.replace(/\\n/g, '\n'); replace = replace.replace(/\\n/g, '\n');
    const count = original.split(find).length - 1;
    if (count !== 1) throw new Error(`mutation "${name}": expected the text once in ${file}, found it ${count} times`);
    writeFileSync(path, original.replace(find, replace));
    let res;
    try {
      res = spawnSync(process.execPath, ['--test', '--test-timeout=20000', 'test/*.test.js'], {
        cwd: ROOT, env: { ...process.env, FARMLEDGE_SKIP_PYTHON: '1', FARMLEDGE_SKIP_BROWSER: '1', FARMLEDGE_MUTATING: '1' }, encoding: 'utf8',
      });
    } finally {
      writeFileSync(path, original);
    }
    const failed = /^ℹ fail (\d+)/m.exec(res.stdout)?.[1] ?? '?';
    const caught = res.status !== 0;
    console.log(`${caught ? 'caught  ' : 'SURVIVED'}  ${name.padEnd(36)} ${file.padEnd(17)} ${caught ? `${failed} test(s) failed` : ''}`);
    if (!caught) survivors.push(name);
  }
  console.log(`\n${list.length - survivors.length} of ${list.length} mutations caught.`);
  if (survivors.length) {
    console.log(`Survived: ${survivors.join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv.slice(2));
