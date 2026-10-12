// What the page shows, as a plain tree: render(view) -> node. Pure, so every
// state can be tested without a browser (test/render.test.js); src/dom.js
// mounts it. Every string from a bundle is text, never markup.
//
// Shown: only what is on chain or derivable from the proof. Never names,
// phone numbers, prices, values or loan sizes, and never a lender's loan_ref.

import { compareSlip, leafRef } from './slip.js';

export const h = (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) });

/** The two codes that count as verified. Everything else is not. */
export const VERIFIED = Object.freeze(['OK', 'DAY_ROOT_EXPIRED']);

const day = (d) => new Date(Number(d) * 86_400_000).toISOString().slice(0, 10);
const when = (t) => `${new Date(Number(t) * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
const due = (t) => (Number(t) % 86_400 === 0 ? day(Number(t) / 86_400) : when(t));
const kg = (n) => `${BigInt(n).toLocaleString('en-US')} kg`;
const graceDays = (s) => { const d = Number(s) / 86_400; return `${Number.isInteger(d) ? d : d.toFixed(1)}-day grace period`; };
const mono = (s) => h('code', { class: 'mono' }, String(s));
const KIND = { 0: 'deposit', 1: 'dispatch', 2: 'end-of-day balance' };
const kind = (k) => KIND[Number(k)] ?? `record kind ${k}`;

/** The verdict for each outcome: tone, icon and headline are distinct for every code. */
export function verdict(code, r, net) {
  const f = r?.facts ?? {};
  const wh = f.warehouseId ? mono(f.warehouseId) : 'the warehouse';
  const d = f.day !== undefined ? `${day(f.day)} (UTC day ${f.day})` : 'its day';
  switch (code) {
    case 'OK': return { tone: 'verified', icon: 'check', headline: 'Verified against the ledger',
      body: ['This record is in ', wh, "'s books for ", d, ', exactly as the warehouse committed them on Stellar.'] };
    case 'DAY_ROOT_EXPIRED': return { tone: 'verified', icon: 'check', headline: "Verified through the warehouse's chain of commitments",
      body: ['This record is in ', wh, "'s books for ", d, ". That day's own root has left the ledger after 30 days, as designed, so it was verified through the chain of daily commitments, which is enough: see below."] };
    case 'NOT_YET_ANCHORED': return { tone: 'pending', icon: 'clock', headline: 'Not checkable yet: these books have not been committed',
      body: [wh, ' has not anchored its books for ', d, ' yet. This is not a failure, and it is not a confirmation: nothing on the ledger speaks to this record yet. Check again after the warehouse next anchors its books: its anchoring record, below, shows when it has anchored so far.',
        f.lastAnchoredDay !== undefined && f.chainDay !== undefined && f.lastAnchoredDay < f.chainDay - 1
          ? ` The warehouse has not anchored since ${day(f.lastAnchoredDay)}.` : ''] };
    case 'DAY_ROOT_DIFFERS': return { tone: 'failed', icon: 'cross', headline: 'Does not match: this record has been altered or forged',
      body: ['The books ', wh, ' committed on Stellar for ', d, ' do not contain this record as written. Do not rely on it.'] };
    case 'HEAD_MISMATCH': return { tone: 'failed', icon: 'cross', headline: "Not chained: this record is not in the warehouse's committed history",
      body: ['The days this bundle claims do not reproduce the chain of commitments ', wh, ' has on Stellar today. Either the record or its claimed history has been altered: this is how backdating shows up.',
        r?.detail?.includes('later_days is missing') ? ' (The bundle may also just be out of date: it lacks the anchors after its day. A genuine bundle with those days added will pass.)' : ''] };
    case 'NO_HEAD': return { tone: 'failed', icon: 'cross', headline: 'Nothing anchored this claim',
      body: [wh, ' has never committed any books on Stellar. No anchor stands behind this record.'] };
    case 'PROOF_DOES_NOT_FIT': return { tone: 'failed', icon: 'cross', headline: "Malformed proof: it cannot belong to that day's books",
      body: ["The proof's shape does not fit the size of the day it claims. Do not rely on this record."] };
    case 'DAY_IN_FUTURE': return { tone: 'failed', icon: 'cross', headline: 'Impossible date: the record claims a day the ledger has not reached',
      body: ['It claims ', d, '. No anchor can exist for it. Do not rely on this record.'] };
    case 'WRONG_NETWORK': return { tone: 'refused', icon: 'stop', headline: 'Refused: this bundle is for a different ledger',
      body: ['This page checks only ', net.name, ' contract ', mono(net.contractId), '. The bundle names ', mono(r?.detail?.match(/contract (\S*);/)?.[1] || '(none)'), '. Nothing was checked.'] };
    case 'BAD_BUNDLE': return { tone: 'nocheck', icon: 'question', headline: 'Not a readable proof bundle: nothing was checked',
      body: ['The file is not a well-formed Farmledge proof bundle, so it could not be checked at all.', r?.detail ? ` (${r.detail})` : ''] };
    case 'COULD_NOT_CHECK': default: return { tone: 'nocheck', icon: 'question', headline: 'Could not check: the ledger could not be reached',
      body: ['This is not a result. Nothing is known about this record from this attempt. Try again, perhaps on a better connection.'] };
  }
}

function icon(name) {
  return h('span', { class: `icon icon-${name}`, 'aria-hidden': 'true' });
}

function verdictBlock(r, net) {
  const v = verdict(r.code, r, net);
  return h('section', { class: `verdict tone-${v.tone}`, 'data-code': r.code, 'data-tone': v.tone },
    h('h2', { class: 'verdict-head' }, icon(v.icon), h('span', null, v.headline)),
    h('p', null, ...v.body),
    v.tone === 'verified' ? null : h('p', { class: 'code-line' }, 'Result code: ', mono(r.code)));
}

const HONESTY_CHECKED = (wh, d) => ["That this record's contents hash into the books ", wh, ' committed on Stellar for ', d, ", chained to that warehouse's commitments today; and the lot's current claims as the ledger holds them now."];
const HONESTY_NOT = [
  'that the grain is physically in the warehouse',
  'that the weight was measured correctly',
  'that the grade is accurate',
  'that the people behind the addresses are who they say they are',
];

function honesty(r) {
  const f = r.facts;
  return h('section', { class: 'honesty' },
    h('h3', null, 'What this checked'),
    h('p', null, ...HONESTY_CHECKED(mono(f.warehouseId), day(f.day))),
    h('h3', null, 'What this did not check'),
    h('ul', null, HONESTY_NOT.map((t) => h('li', null, t))),
    h('p', { class: 'small' }, 'Those rest on the warehouse and on your own diligence. A ledger record is evidence of what was recorded, not of what is in the store.'));
}

function deposit(leaf) {
  const row = (k, ...v) => h('div', { class: 'row' }, h('dt', null, k), h('dd', null, ...v));
  return h('section', { class: 'facts' },
    h('h3', null, 'The record, as proven'),
    h('dl', null,
      row('Record', kind(leaf.kind)),
      row('Warehouse', mono(leaf.warehouse_id)),
      row('Deposit number', String(leaf.deposit_no)),
      row('Commodity', mono(leaf.commodity)),
      row('Grade', mono(leaf.grade)),
      row('Weight', kg(leaf.kg), ' ', h('span', { class: 'muted' }, leaf.weight_source === 'Scale' ? '(weighed on a scale)' : '(estimated from bag count)')),
      row('Owner address', mono(leaf.owner))));
}

function anchor(r, anchorTime) {
  const f = r.facts;
  const items = [];
  if (f.dayRoot) {
    items.push(h('p', null, 'Books for ', h('strong', null, `${day(f.day)} (UTC day ${f.day})`), ', ', String(f.dayRoot.leaves), ' records. Day root: ', mono(f.dayRoot.root)));
    items.push(h('p', null, 'Anchored in ledger ', mono(Number(f.dayRoot.ledger).toLocaleString('en-US')),
      anchorTime ? [' at ', h('strong', null, when(anchorTime))] : '. (Its time is no longer held by this RPC endpoint, which keeps about 7 days of ledger history; the ledger number is permanent.)'));
  } else {
    items.push(h('p', null, 'Books for ', h('strong', null, `${day(f.day)} (UTC day ${f.day})`), ". The day's own root has left the ledger after 30 days, by design, so its anchoring ledger and time are no longer readable from it. Proven root: ", mono(f.root)));
  }
  return h('section', { class: 'facts' },
    h('h3', null, 'Where it is anchored'),
    ...items,
    h('h3', null, 'Chained to every other day'),
    h('p', null, "The warehouse's head on Stellar today, ", mono(f.head), ' (last anchored day ', day(f.lastAnchoredDay), '), is a hash chain over every day it has anchored, this one included, and was reproduced exactly from this record.'),
    h('p', null, h('strong', null, 'This is what makes backdating detectable: '), "each day's commitment includes the one before it, so no day's books can be changed, or a day inserted, after the fact without breaking the chain."),
    r.code === 'DAY_ROOT_EXPIRED'
      ? h('p', { class: 'small' }, "Why that is enough without the day's own root: the contract only ever appends to the head, so a root that, followed by the later days, recomputes exactly to today's head is the root committed for that day. Producing a different one that does would mean breaking SHA-256.")
      : null,
    f.headArchived ? h('p', { class: 'small' }, "The warehouse's head entry is archived on the ledger (its storage rent has lapsed). Archived is not missing: the entry and its value are still on the ledger, and that value was read and matched.") : null);
}

const STATE_WORD = { Active: 'Unencumbered', Pledged: 'Pledged', Recovery: 'In recovery', Exited: 'Released', Revoked: 'Revoked' };

function claimsBlock(claims) {
  if (!claims) return null;
  if (claims.status === 'loading') {
    const p = claims.progress;
    return h('section', { class: 'claims loading', 'aria-busy': 'true' },
      h('h3', null, 'Claims on this lot, from the ledger now'),
      h('p', null, h('span', { class: 'spinner', 'aria-hidden': 'true' }), p
        ? `Reading the warehouse's receipts from the ledger: ${p.step === 'pages' ? `index page ${p.done} of ${p.total}` : `receipt ${p.done} of ${p.total}`}…`
        : 'Reading the warehouse\'s receipts from the ledger…'));
  }
  if (claims.status === 'error') {
    return h('section', { class: 'claims tone-nocheck', 'data-claims': 'error' },
      h('h3', null, 'Claims on this lot: could not be read'),
      h('p', null, "The lot's current claims could not be read from the ledger. The proof above stands, but the lot's current state is unknown: do not assume it is unencumbered."));
  }
  const { receipts, summary } = claims.data;
  if (receipts.length === 0) {
    return h('section', { class: 'claims', 'data-claims': 'none' },
      h('h3', null, 'Claims on this lot, from the ledger now'),
      h('p', null, h('strong', null, 'No receipt has been issued on the ledger for this lot.'), ' Nothing on the ledger encumbers it.'));
  }
  const k = summary.kg;
  const line = (state, text) => (k[state] > 0n ? h('li', { class: `sum sum-${state}` }, h('span', { class: 'sum-kg' }, kg(k[state])), ' ', text) : null);
  const pledgeText = (p) => [p.status === 'Recovery' ? 'in recovery by lender ' : 'pledged to lender ', mono(p.lender), `, due ${due(p.dueDate)}, ${graceDays(p.gracePeriod)}`];
  return h('section', { class: 'claims', 'data-claims': summary.recovery ? 'recovery' : k.Pledged > 0n ? 'pledged' : k.Revoked > 0n ? 'revoked' : k.Active > 0n ? 'active' : 'exited' },
    h('h3', null, 'Claims on this lot, from the ledger now'),
    h('p', { class: 'small' }, 'A lot has no single status: it can be part free, part pledged and part released. Each receipt issued from it is a claim; here they all are.'),
    h('ul', { class: 'summary' },
      h('li', { class: 'sum sum-total' }, h('span', { class: 'sum-kg' }, kg(k.total)), ' total on receipts'),
      line('Active', 'unencumbered'),
      summary.pledges.map((p) => h('li', { class: `sum sum-${p.status}` }, h('span', { class: 'sum-kg' }, kg(p.weightKg)), ' ', ...pledgeText(p))),
      line('Exited', 'released: recorded on the ledger as having left the warehouse'),
      line('Revoked', 'revoked by the contract admin: void')),
    h('table', { class: 'receipts' },
      h('thead', null, h('tr', null, h('th', null, 'Receipt'), h('th', null, 'Weight'), h('th', null, 'State'), h('th', null, 'On the ledger'))),
      h('tbody', null, receipts.map((r) => h('tr', { class: `state-${r.status}` },
        h('td', null, mono(`#${r.receiptId}`)),
        h('td', null, kg(r.weightKg)),
        h('td', null, h('span', { class: `badge badge-${r.status}` }, STATE_WORD[r.status])),
        h('td', null,
          r.lock && (r.status === 'Pledged' || r.status === 'Recovery') ? h('div', null, 'Lender ', mono(r.lock.lender), h('br'), `Due ${due(r.lock.dueDate)}, ${graceDays(r.lock.gracePeriod)}`) : null,
          r.status === 'Exited' && r.exitDate ? h('div', null, `Released ${when(r.exitDate)}`) : null,
          r.status === 'Revoked' ? h('div', null, 'Voided by the contract admin; it confers nothing.') : null,
          r.weightSource === 'BagEstimate' ? h('div', { class: 'muted' }, 'Weight estimated from bag count') : null,
          r.archived ? h('div', { class: 'archived' }, h('strong', null, 'Archived entry. '), 'Its storage rent has lapsed, so Stellar moved it out of fast storage. It is still on the ledger and was read: archived is not invalid.') : null))))));
}

function recoveryBanner() {
  return h('div', { class: 'banner banner-recovery', role: 'alert', 'data-banner': 'recovery' },
    h('strong', null, 'A lender has begun recovery against part of this lot. Do not accept it as collateral.'));
}

function endpointLine(r) {
  const e = r.endpoint;
  if (!e) return null;
  return h('p', { class: 'small endpoint' }, 'Checked against ', mono(e.used), " (this page's setting). ",
    e.suggested === null ? 'The bundle suggested no endpoint.'
      : e.suggested === e.used ? 'The bundle suggested the same endpoint.'
        : ['The bundle suggested ', mono(e.suggested), ': not used. A bundle cannot choose what it is checked against.']);
}

const SOURCE = {
  pasted: 'pasted into this page',
  file: 'uploaded from a file',
  qr: 'scanned from a QR code',
  link: 'carried in the link that opened this page',
  fetched: 'fetched from',
  token: "fetched from Farmledge with the token in your slip's link, at",
  example: "this site's Testnet example",
};

function sourceLine(source) {
  if (!source) return null;
  return h('p', { class: 'small source' }, h('strong', null, 'Where this bundle came from: '), SOURCE[source.how] ?? source.how,
    source.detail ? [' ', mono(source.detail)] : '',
    '. The bundle is a claim; whoever supplied it, the check read only the ledger.');
}

function exampleNote() {
  return h('div', { class: 'banner banner-example', 'data-banner': 'example' },
    h('strong', null, 'Testnet example: a real anchor on Stellar\'s test network. Not a real deposit.'));
}

const bigRef = (s) => h('code', { class: 'mono ref-big' }, s);
const clip = (s) => (s.length > 80 ? `${s.slice(0, 80)}…` : s);

/**
 * The deposit reference, at the top of every result whatever the outcome,
 * in the form the slip prints beneath its QR: the human half of the slip
 * check. `check` is compareSlip's answer, or null when nothing verified.
 */
function refPanel(view, verified, check) {
  const slip = view.slip ?? null;
  const proofRef = leafRef(view.leaf);
  const CHECK = 'Check this matches the deposit number printed on the slip.';
  const ONLY_YOU = 'Only your own comparison with the slip guards against a swapped bundle.';
  const said = !slip ? 'none' : slip.refBad ? 'unreadable' : !slip.ref ? 'missing' : check ?? 'unchecked';
  return h('section', { class: `ref-panel ref-${said}`, 'data-slip': said },
    h('p', { class: 'ref-label' }, verified ? 'This proof is for deposit' : 'This bundle claims to be for deposit (its claim, unconfirmed)'),
    proofRef ? [h('p', null, bigRef(proofRef)), h('p', { class: 'ref-check' }, h('strong', null, CHECK))] : h('p', null, h('strong', null, 'It names no readable deposit.')),
    said === 'match' ? h('p', null, "It is the deposit your slip's QR code names. This page cannot see the paper, so the check above is still yours to make.") : null,
    said === 'mismatch' ? [h('p', { class: 'ref-label' }, "Your slip's QR code names deposit"), h('p', null, bigRef(slip.ref.text)),
      h('p', null, h('strong', null, leafRef(view.leaf) === slip.ref.text ? `The same lot, but this is its ${kind(view.leaf.kind)} record, not the deposit on your slip.` : 'A different deposit.'))] : null,
    said === 'unchecked' ? [h('p', { class: 'ref-label' }, "Your slip's QR code names deposit"), h('p', null, bigRef(slip.ref.text)), h('p', null, 'Not compared: the proof itself did not verify, and that comes first.')] : null,
    said === 'unreadable' ? h('p', null, h('strong', null, "The link's slip reference could not be read"), ' (', mono(clip(slip.refText)), ' is not in the form WAREHOUSE.NUMBER), so this page could not compare this proof with your slip. ', ONLY_YOU) : null,
    said === 'missing' ? h('p', null, h('strong', null, 'The link carried no slip reference, so this page could not compare this proof with your slip. '), ONLY_YOU) : null,
    said === 'none' ? h('p', null, 'No slip reference came with this bundle, so this page could not compare it with a slip. ', ONLY_YOU) : null);
}

/** The slip check's failure: shown only after the proof verified, so both are said. */
function slipMismatchBlock(r, view) {
  return h('section', { class: 'verdict tone-failed', 'data-code': 'SLIP_MISMATCH', 'data-tone': 'failed' },
    h('h2', { class: 'verdict-head' }, icon('cross'), h('span', null, 'This proof is valid, and it is for a different deposit than your slip')),
    h('p', null, 'It checks out against the ledger for ', Number(view.leaf.kind) === 0 ? 'deposit ' : `a ${kind(view.leaf.kind)} record of `, mono(leafRef(view.leaf)),
      ', but your slip is for deposit ', mono(view.slip.ref.text), '. Do not accept it for the deposit on your slip: ask for the proof of that deposit.'),
    h('p', { class: 'code-line' }, 'Verifier result: ', mono(r.code), '. Slip check: ', mono('SLIP_MISMATCH'),
      ', made by this page only. The standalone script never sees your slip, so it cannot make this check.'));
}

function result(view, net) {
  // Verified needs both: one of the two codes, and the verifier's own flag.
  // Anything inconsistent is shown as no result, never as verified.
  const consistent = VERIFIED.includes(view.result.code) === (view.result.verified === true);
  const r = consistent ? view.result : { ...view.result, code: 'COULD_NOT_CHECK', verified: false, facts: {} };
  // r is consistent here, so the code alone decides; the guard above is the check.
  const verified = VERIFIED.includes(r.code);
  // The slip check runs only on a verified proof: a verification failure is
  // more fundamental, and is shown as it is whatever the slip says.
  const check = verified ? compareSlip(view.slip?.ref, view.leaf) : null;
  const mismatch = check === 'mismatch';
  const claims = verified && !mismatch ? view.claims : null;
  return h('div', { class: 'result', 'data-state': mismatch ? 'SLIP_MISMATCH' : r.code },
    claims?.status === 'ok' && claims.data.summary.recovery ? recoveryBanner() : null,
    view.source?.how === 'example' ? exampleNote() : null,
    refPanel(view, verified, check),
    mismatch ? slipMismatchBlock(r, view) : verdictBlock(r, net),
    verified && !mismatch ? [honesty(r), deposit(view.leaf), claimsBlock(claims), anchor(r, view.anchorTime)] : null,
    mismatch ? deposit(view.leaf) : null,
    sourceLine(view.source),
    endpointLine(r));
}

function captureView(v) {
  return h('div', { class: 'result', 'data-state': 'CAPTURE' },
    h('section', { class: 'verdict tone-nocheck', 'data-tone': 'nocheck' },
      h('h2', { class: 'verdict-head' }, icon('question'), h('span', null, 'A capture receipt: it proves nothing')),
      h('p', null, 'This is a capture receipt from a tablet that had not yet synced. It proves nothing. Nothing has been anchored for this deposit yet.'),
      h('p', { class: 'small' }, 'Tablet reference: ', mono(v.depositId))),
    howToGetBundle());
}

function leafView(v) {
  const l = v.leaf;
  const row = (k, ...val) => h('div', { class: 'row' }, h('dt', null, k), h('dd', null, ...val));
  const has = (k) => l[k] !== undefined && l[k] !== null;
  return h('div', { class: 'result', 'data-state': 'SLIP_LEAF' },
    h('section', { class: 'verdict tone-nocheck', 'data-tone': 'nocheck' },
      h('h2', { class: 'verdict-head' }, icon('question'), h('span', null, 'A claim, not a proof: nothing was checked')),
      h('p', null, 'This is a deposit record in the form Farmledge uses. It is a claim, not a proof. To check it you need the proof bundle for this deposit.')),
    h('section', { class: 'facts unverified' },
      h('h3', null, 'The record as given: ', h('span', { class: 'stamp' }, 'unverified')),
      h('dl', null,
        has('kind') ? row('Record', kind(l.kind)) : null,
        has('warehouse_id') ? row('Warehouse', mono(l.warehouse_id)) : null,
        has('deposit_no') ? row('Deposit number', String(l.deposit_no)) : null,
        has('commodity') ? row('Commodity', mono(l.commodity)) : null,
        has('grade') ? row('Grade', mono(l.grade)) : null,
        has('kg') ? row('Weight', kg(l.kg)) : null,
        has('day') ? row('Day recorded', `${day(l.day)} (UTC)`) : null,
        has('owner') ? row('Owner address', mono(l.owner)) : null)),
    howToGetBundle());
}

function howToGetBundle() {
  return h('section', { class: 'facts' },
    h('h3', null, 'How to get the proof bundle'),
    h('p', null, 'Farmledge has no way to give you one yet. Its text-message sending is a placeholder that only writes to a log. When a bundle for this deposit does reach you, by any route, paste it, upload it or scan it here.'));
}

function plainView(state, tone, iconName, headline, body) {
  return h('div', { class: 'result', 'data-state': state },
    h('section', { class: `verdict tone-${tone}`, 'data-tone': tone },
      h('h2', { class: 'verdict-head' }, icon(iconName), h('span', null, headline)), h('p', null, body)));
}

export function warehouseView(w) {
  const head = w.record?.head;
  const r = w.record;
  const st = w.status === 'loading' ? 'WAREHOUSE_LOADING' : w.status === 'error' ? 'WAREHOUSE_UNREADABLE' : !head ? 'WAREHOUSE_NONE' : 'WAREHOUSE';
  return h('div', { class: 'result', 'data-state': st, 'aria-busy': w.status === 'loading' ? 'true' : null },
    h('section', { class: 'facts warehouse' },
      h('h2', null, 'Warehouse anchoring record'),
      h('p', { class: 'small' }, 'This says how a warehouse has committed its books to the ledger. It says nothing about any particular deposit.'),
      w.status === 'loading' ? h('p', null, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Reading the ledger…') : null,
      w.status === 'error' ? h('p', { class: 'tone-nocheck' }, h('strong', null, 'Could not check: the ledger could not be reached. '), 'This is not a result.') : null,
      w.status === 'ok' && !head ? [h('p', null, h('strong', null, 'No anchor on the ledger for '), mono(r.warehouseId), h('strong', null, '.')), h('p', { class: 'small' }, 'Either this warehouse has never committed its books, or the id is not exactly right: ids are case-sensitive.')] : null,
      w.status === 'ok' && head ? h('dl', null,
        h('div', { class: 'row' }, h('dt', null, 'Warehouse'), h('dd', null, mono(r.warehouseId))),
        h('div', { class: 'row' }, h('dt', null, 'Has anchored'), h('dd', null, 'Yes: a head exists on the ledger', head.archived ? ' (archived, and still readable)' : '')),
        h('div', { class: 'row' }, h('dt', null, 'Last anchored day'), h('dd', null, `${day(head.lastDay)}`, r.chainDay - head.lastDay > 1 ? h('span', { class: 'warn' }, ` · nothing anchored in the ${r.chainDay - head.lastDay - 1} day(s) since`) : '')),
        h('div', { class: 'row' }, h('dt', null, 'Most recent day root on the ledger'), h('dd', null, r.days.length ? `${day(r.days.at(-1).day)}` : 'none: every day root still held is older than 30 days')),
        h('div', { class: 'row' }, h('dt', null, 'Days with a root still on the ledger'), h('dd', null, r.days.length ? `${r.days.length}, from ${day(r.days[0].day)} to ${day(r.days.at(-1).day)}` : '0')),
        h('div', { class: 'row' }, h('dt', null, 'Continuous?'), h('dd', null, r.days.length === 0 ? 'Cannot tell: no day roots in the last 30 days.' : r.gaps.length === 0 ? 'Yes: no day missing between those dates.' : h('span', { class: 'warn' }, `No: ${r.gaps.length} day(s) missing (${r.gaps.map(day).join(', ')}).`)))) : null,
      w.status === 'ok' ? h('p', { class: 'small' }, "Day roots stay on the ledger for 30 days; older days are committed in the warehouse's head chain, which this record does not unpack.") : null));
}

/** The slip's reference, when there is no bundle to compare it with. */
function slipOnlyPanel(slip) {
  return h('section', { class: `ref-panel ${slip.ref ? '' : 'ref-missing'}`, 'data-slip': slip.ref ? 'waiting' : slip.refBad ? 'unreadable' : 'missing' },
    slip.ref ? [h('p', { class: 'ref-label' }, "Your slip's QR code names deposit"), h('p', null, bigRef(slip.ref.text)), h('p', { class: 'ref-check' }, h('strong', null, 'Check this matches the deposit number printed on the slip.'))]
      : h('p', null, h('strong', null, slip.refBad ? "The link's slip reference could not be read, so no bundle can be compared with your slip." : 'The link carried no slip reference, so no bundle can be compared with your slip.')));
}

/** The page's result area for a view. A slip, when the page was opened from one, heads every view. */
export function render(view, net) {
  const node = renderView(view, net);
  if (view.slip && view.kind !== 'result' && view.kind !== 'slip-waiting' && node.props.class === 'result') node.children.unshift(slipOnlyPanel(view.slip));
  return node;
}

function renderView(view, net) {
  switch (view.kind) {
    case 'idle': return h('div', { class: 'result', 'data-state': 'IDLE' });
    case 'checking': return h('div', { class: 'result', 'data-state': 'CHECKING', 'aria-busy': 'true' },
      h('section', { class: 'verdict tone-working', 'data-tone': 'working' }, h('h2', { class: 'verdict-head' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', null, 'Checking against the ledger…')),
        h('p', null, 'Reading ', net.name, ' directly from ', mono(net.rpcUrl), '.')));
    case 'result': return result(view, net);
    case 'capture': return captureView(view);
    case 'leaf': return leafView(view);
    case 'unreadable-bundle': return plainView('UNREADABLE', 'nocheck', 'question', 'Not a readable proof bundle: nothing was checked', 'This looks like a bundle but is not valid JSON. Copy it again in full, or upload the file.');
    case 'browser-too-old': return plainView('BROWSER', 'nocheck', 'question', 'This browser cannot check a bundle exactly', 'It cannot read large numbers exactly. Use a current browser, or check with the standalone script linked below.');
    case 'unknown': return plainView('UNKNOWN', 'nocheck', 'question', 'Not a proof bundle: nothing was checked',
      'This page checks Farmledge proof bundles. A deposit number or a slip reference cannot be checked against the ledger: it carries no record and no proof.');
    case 'warehouse': return warehouseView(view.warehouse);
    case 'slip-waiting': return h('div', { class: 'result', 'data-state': 'SLIP_WAITING' },
      slipOnlyPanel(view.slip),
      h('section', { class: 'verdict tone-nocheck', 'data-tone': 'nocheck' },
        h('h2', { class: 'verdict-head' }, icon('question'), h('span', null, 'Nothing checked yet')),
        h('p', null, view.reason, ' Paste or upload the proof bundle for this deposit: it will be checked against the ledger, and compared with your slip.')));
    default: return h('div', { class: 'result' });
  }
}
