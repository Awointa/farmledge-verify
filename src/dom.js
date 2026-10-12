// Mounts a render.js tree. Text is set with text nodes only: nothing from a
// bundle ever becomes markup.
const ALLOWED = new Set(['class', 'role', 'aria-hidden', 'aria-busy']);

export function toDom(node) {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') return document.createTextNode(String(node));
  const el = document.createElement(node.tag);
  for (const [k, v] of Object.entries(node.props)) {
    if (v === null || v === undefined) continue;
    if (k.startsWith('data-') || ALLOWED.has(k)) el.setAttribute(k, String(v));
  }
  for (const c of node.children) el.append(toDom(c));
  return el;
}

export function mount(target, node) {
  target.replaceChildren(toDom(node));
}
