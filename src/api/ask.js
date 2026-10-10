import { ADAPTERS } from './providers.js';
import { readSSE } from './sse.js';

export class AIError extends Error {
  constructor(message, { code = 'API', status } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.status = status;
  }
}

/**
 * askAI(): the one entry point for every provider, for text-only or
 * text + image conversations. Always streams; `onText` gets each new piece
 * of the answer as it arrives.
 *
 * @param {object} opts
 * @param {'claude'|'openai'|'gemini'} opts.provider
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} [opts.system]       system prompt
 * @param {Array<{role:'user'|'assistant', text:string, image?:{mime:string, base64:string}}>} opts.messages
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @param {typeof fetch} [opts.fetch]  injected so the main process can use Electron's net.fetch
 * @param {(delta: string) => void} [opts.onText]
 * @returns {Promise<{ text: string, truncated: boolean }>}
 */
export async function askAI({
  provider,
  apiKey,
  model,
  system,
  messages,
  maxTokens = 4096,
  signal,
  fetch: fetchImpl = globalThis.fetch,
  onText,
}) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new AIError(`Unknown provider "${provider}".`, { code: 'CONFIG' });
  if (!apiKey) throw new AIError('No API key set for this provider.', { code: 'NO_KEY' });
  if (!model) throw new AIError('No model set for this provider.', { code: 'CONFIG' });

  const req = adapter.buildRequest({ apiKey, model, system, messages, maxTokens });

  let res;
  try {
    res = await fetchImpl(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw cancelled();
    throw new AIError(`Could not reach the API: ${err.message}`, { code: 'NETWORK' });
  }

  if (!res.ok) throw await httpError(res);
  if (!res.body) throw new AIError('The API returned an empty response.');

  let text = '';
  let truncated = false;
  try {
    for await (const event of readSSE(res.body)) {
      if (signal?.aborted) throw cancelled();
      const r = adapter.parseEvent(event);
      if (r.error) throw new AIError(r.error);
      if (r.truncated) truncated = true;
      if (r.text) {
        text += r.text;
        onText?.(r.text);
      }
      if (r.done) break;
    }
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (signal?.aborted) throw cancelled();
    throw new AIError(`The connection dropped: ${err.message}`, { code: 'NETWORK' });
  }
  if (signal?.aborted) throw cancelled();

  return { text, truncated };
}

function cancelled() {
  return new AIError('Cancelled.', { code: 'CANCELLED' });
}

/** Turns a non-2xx response into a readable error, using the provider's own message when present. */
async function httpError(res) {
  let detail = '';
  try {
    const body = await res.text();
    const json = JSON.parse(body);
    const err = Array.isArray(json) ? json[0]?.error : json.error;
    detail = (typeof err === 'string' ? err : err?.message) || body;
  } catch {
    // body was not JSON; keep the status-based message only
  }
  detail = String(detail).trim().slice(0, 400);

  const status = res.status;
  let message;
  if (status === 401 || status === 403) message = 'The API key was rejected. Check it in Settings.';
  else if (status === 404) message = 'Model not found. Check the model name in Settings.';
  else if (status === 429) message = 'Rate limit or quota reached for this API key.';
  else if (status >= 500) message = 'The provider is overloaded or unavailable. Try again in a moment.';
  else message = 'The API rejected the request.';

  return new AIError(detail ? `${message}\n${detail}` : message, { code: 'HTTP', status });
}
