// The page's words, as a list of sentences: every text node of index.html
// and every string literal in the page's scripts (comments skipped). Used by
// test/claims.test.js to hold each sentence about what Farmledge or a
// warehouse does to docs/claims.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');

/** The scripts whose strings reach the reader. */
export const COPY_SCRIPTS = ['src/render.js', 'src/app.js'];

/** String literals in JavaScript source, skipping comments; a template's ${…} becomes "…". */
export function literals(src) {
  const out = [];
  let i = 0;
  const str = (q) => {
    let s = '';
    for (i++; i < src.length && src[i] !== q; i++) {
      if (src[i] === '\\') { i++; s += src[i] === 'n' ? '\n' : src[i]; continue; }
      if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
        let depth = 1;
        for (i += 2; depth > 0; i++) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          else if (src[i] === '\'' || src[i] === '"' || src[i] === '`') { str(src[i]); }
        }
        i--;
        s += '…';
        continue;
      }
      s += src[i];
    }
    out.push(s);
  };
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') str(c);
  }
  return out;
}

/** Text nodes of an HTML document, outside <script>, <style> and comments. */
export function htmlText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<\/(p|li|h[1-6]|label|button|ol|ul|div|section|header|footer|title|noscript)>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
    .split('\n');
}

const sentences = (text) => text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z("'])/).map((s) => s.trim()).filter(Boolean);

/** Every sentence of the page's copy, with where it is. */
export function pageSentences() {
  const out = [];
  for (const line of htmlText(read('index.html'))) for (const s of sentences(line)) out.push({ where: 'index.html', s });
  for (const f of COPY_SCRIPTS) for (const lit of literals(read(f))) for (const s of sentences(lit)) out.push({ where: f, s });
  return out;
}

/**
 * Sentences that can describe what Farmledge, a warehouse or anyone in the
 * system does. Deliberately broad: a sentence that only names one of these
 * is listed in docs/claims.md as not a claim, with the reason.
 */
export const ABOUT_THE_SYSTEM = /\b(farmledge|warehouses?|farmers?|sms|text.messages?|slips?|tablets?|lenders?|custodians?|verifiers?|admin|anchor\w*|nightly|deliver\w*|sent|sends?|print\w*|reprint\w*|servers?|issued?|recorded|registered)\b/i;
