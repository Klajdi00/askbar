import { net, session } from 'electron';
import { askAI } from '../api/ask.js';
import { PROVIDERS } from '../config/providers.js';
import { cleanTransformOutput, prepareConversation } from '../api/conversation.js';
import { createRedactionMap, createStreamRestorer, redactText, restoreText, redactionCount } from '../api/redact.js';
import { LIMITS, PROMPTS } from '../config/defaults.js';

// All AI requests go through Electron's net.fetch (Chromium's network stack),
// so the system proxy settings of work PCs are respected. These are the only
// network calls the app makes.
const fetchViaChromium = (url, init) => net.fetch(url, init);

/**
 * Resolves the Windows proxy configuration for the provider's API ahead of
 * time. With "Automatically detect settings" on, the first lookup can take
 * ~2 s; doing it when the bar opens keeps that out of the first answer.
 * No request is sent to the provider and no data leaves the machine.
 */
export function warmUpProxy(provider) {
  const origin = PROVIDERS[provider]?.apiOrigin;
  if (origin) session.defaultSession.resolveProxy(origin).catch(() => {});
}

/**
 * Sends a chat (with an optional screenshot in the latest turn) and streams
 * the answer. With redact mode on, the provider only sees placeholders and
 * `onDelta` receives the answer with the real values restored.
 */
export async function runChat({ settings, apiKey, messages, signal, onMeta, onDelta }) {
  const { messages: prepared, redactionMap } = prepareConversation(messages, {
    redact: settings.redact,
    maxMessages: LIMITS.maxHistoryMessages,
    defaultImageText: PROMPTS.defaultScreenQuestion,
  });
  const redacted = redactionCount(redactionMap);
  onMeta?.({ redacted });

  const system = [PROMPTS.chat, redacted ? PROMPTS.redaction : ''].filter(Boolean).join('\n\n');
  const restorer = createStreamRestorer(redactionMap);

  const result = await askAI({
    provider: settings.provider,
    apiKey,
    model: settings.models[settings.provider],
    system,
    messages: prepared,
    maxTokens: LIMITS.maxTokens,
    signal,
    fetch: fetchViaChromium,
    onText: (delta) => {
      const out = restorer.push(delta);
      if (out) onDelta(out);
    },
  });
  const tail = restorer.flush();
  if (tail) onDelta(tail);

  return { text: restoreText(result.text, redactionMap), truncated: result.truncated, redacted };
}

/** One-shot text transform (clipboard rewrite). Returns the final text. */
export async function runTransform({ settings, apiKey, instruction, text, signal }) {
  const map = settings.redact ? createRedactionMap() : null;
  const input = map ? redactText(text, map) : text;
  const system = [PROMPTS.clipboard, redactionCount(map) ? PROMPTS.redaction : ''].filter(Boolean).join('\n\n');

  const result = await askAI({
    provider: settings.provider,
    apiKey,
    model: settings.models[settings.provider],
    system,
    messages: [{ role: 'user', text: `${instruction}\n\n<text>\n${input}\n</text>` }],
    maxTokens: LIMITS.maxTokens,
    signal,
    fetch: fetchViaChromium,
  });

  return { text: restoreText(cleanTransformOutput(result.text), map), truncated: result.truncated };
}
