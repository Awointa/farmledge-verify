// What a reader pasted, uploaded or scanned. Only a proof bundle can be
// checked. The two QR forms printed on counter slips today are recognised
// and explained, never checked: neither carries a proof.
import { parseJson } from './verify.js';
import { ChainUnreadable } from './rpc.js';

/** The fields of a leaf (docs/events.md, "Bundle format"). Nothing else from a slip is ever shown. */
export const LEAF_FIELDS = Object.freeze(['version', 'kind', 'warehouse_id', 'day', 'index', 'deposit_no',
  'deposit_id', 'receipt_id', 'receipt_version', 'owner', 'commodity', 'grade', 'kg', 'weight_source',
  'bags', 'moisture_bps', 'custodian', 'verifier', 'deposited_at', 'at', 'salt']);

const CAPTURE = /^farmledge:capture:(\S+)$/;

/**
 * -> {kind: 'bundle', bundle} | {kind: 'capture', depositId} | {kind: 'leaf', leaf}
 *  | {kind: 'unreadable-bundle', reason} | {kind: 'browser-too-old'} | {kind: 'unknown'}
 */
export function classifyInput(text) {
  const t = String(text ?? '').trim();
  const m = CAPTURE.exec(t);
  if (m) return { kind: 'capture', depositId: m[1] };
  let v;
  try {
    v = parseJson(t);
  } catch (e) {
    if (e instanceof ChainUnreadable) return { kind: 'browser-too-old' };
    return t.startsWith('{') ? { kind: 'unreadable-bundle', reason: 'not valid JSON' } : { kind: 'unknown' };
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { kind: 'unknown' };
  if ('proof' in v || 'day_leaves' in v || 'contract_id' in v) return { kind: 'bundle', bundle: v };
  if ('salt' in v && 'warehouse_id' in v && 'deposit_no' in v) {
    // The post-sync slip QR: a leaf, as Farmledge recorded it. Unverified.
    const leaf = {};
    for (const k of LEAF_FIELDS) if (k in v) leaf[k] = v[k];
    return { kind: 'leaf', leaf };
  }
  return { kind: 'unknown' };
}
