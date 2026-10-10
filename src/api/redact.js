// Redact mode: mask obvious personal data locally, before anything leaves the
// machine, and put the real values back into the answer afterwards.
//
//   "Mail jane@corp.com"  ->  sent as "Mail [EMAIL_1]"  ->  answer "[EMAIL_1]" shown as "jane@corp.com"
//
// Regex based, so it catches obvious patterns only. It applies to text, not to
// screenshots (that would need OCR).

const PATTERNS = [
  // IBAN-like: 2 letters, 2 check digits, 11–30 alphanumerics, optionally grouped by 4 with spaces.
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g },
  { kind: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  // 9+ digits, optionally separated by spaces, dots or dashes: card, phone, account and ID numbers.
  // (Dates such as 2026-10-10 have 8 digits and stay untouched.)
  { kind: 'NUMBER', re: /(?<![\w.])\+?\d(?:[ .-]?\d){8,}(?![\w])/g },
];

const PLACEHOLDER_RE = /\[(?:EMAIL|IBAN|NUMBER)_\d+\]/g;

/** One map per request, so the same value always gets the same placeholder. */
export function createRedactionMap() {
  return { byValue: new Map(), byPlaceholder: new Map(), counts: { EMAIL: 0, IBAN: 0, NUMBER: 0 } };
}

/** Returns the text with sensitive-looking values replaced by placeholders. */
export function redactText(text, map) {
  let out = text;
  for (const { kind, re } of PATTERNS) {
    out = out.replace(re, (value) => {
      let placeholder = map.byValue.get(value);
      if (!placeholder) {
        placeholder = `[${kind}_${++map.counts[kind]}]`;
        map.byValue.set(value, placeholder);
        map.byPlaceholder.set(placeholder, value);
      }
      return placeholder;
    });
  }
  return out;
}

/** Puts the real values back into text that came from the AI. */
export function restoreText(text, map) {
  if (!map || map.byPlaceholder.size === 0) return text;
  return text.replace(PLACEHOLDER_RE, (p) => map.byPlaceholder.get(p) ?? p);
}

/**
 * Streaming version of restoreText(): a placeholder can be split across two
 * chunks ("[EMA" + "IL_1]"), so a trailing partial placeholder is held back
 * until the next chunk (or flush()).
 */
export function createStreamRestorer(map) {
  if (!map || map.byPlaceholder.size === 0) return { push: (chunk) => chunk, flush: () => '' };
  let pending = '';
  return {
    push(chunk) {
      pending += chunk;
      const open = pending.lastIndexOf('[');
      let hold = '';
      if (open !== -1 && !pending.includes(']', open) && /^\[[A-Z_0-9]{0,12}$/.test(pending.slice(open))) {
        hold = pending.slice(open);
        pending = pending.slice(0, open);
      }
      const ready = restoreText(pending, map);
      pending = hold;
      return ready;
    },
    flush() {
      const rest = restoreText(pending, map);
      pending = '';
      return rest;
    },
  };
}

export function redactionCount(map) {
  return map ? map.byPlaceholder.size : 0;
}
