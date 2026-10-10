import { createRedactionMap, redactText } from './redact.js';

/**
 * Turns the renderer's raw chat history into what gets sent:
 *  - keeps the last `maxMessages` turns, starting on a user turn
 *  - sends only the most recent screenshot; older ones become a short note
 *  - merges consecutive same-role turns (e.g. after a failed answer)
 *  - applies redaction to every text when `redact` is on
 *
 * Redaction runs over the whole history in order on every request, so a value
 * gets the same placeholder in every turn.
 */
export function prepareConversation(rawMessages, { redact = false, maxMessages = 20, defaultImageText = '' } = {}) {
  let msgs = rawMessages.slice(-maxMessages);
  while (msgs.length && msgs[0].role !== 'user') msgs = msgs.slice(1);

  let lastImage = -1;
  msgs.forEach((m, i) => {
    if (m.image) lastImage = i;
  });

  const map = redact ? createRedactionMap() : null;
  const out = [];

  msgs.forEach((m, i) => {
    let text = (m.text || '').trim();
    const image = i === lastImage ? m.image : undefined;
    if (m.image && !image) text = `[An earlier screenshot was attached here.]\n${text}`.trim();
    if (map) text = redactText(text, map);

    if (!text && m.role === 'assistant') return; // e.g. a cancelled answer
    if (!text) text = (image && defaultImageText) || '(no text)'; // screenshot sent without a question

    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.text += `\n\n${text}`;
      if (image) prev.image = image;
      return;
    }
    out.push({ role: m.role, text, ...(image ? { image } : {}) });
  });

  while (out.length && out[out.length - 1].role !== 'user') out.pop();

  return { messages: out, redactionMap: map };
}

/** Clipboard rewrite: models sometimes wrap the result in the <text> tags or a code fence anyway. */
export function cleanTransformOutput(text) {
  let out = text.trim();
  const tagged = out.match(/^<text>\s*([\s\S]*?)\s*<\/text>$/);
  if (tagged) out = tagged[1];
  const fenced = out.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (fenced) out = fenced[1];
  return out;
}
