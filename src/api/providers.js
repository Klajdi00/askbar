// Per-provider HTTP details: how to build a streaming request and how to read
// one streamed event. Messages use one neutral shape for every provider:
//
//   { role: 'user' | 'assistant', text: string, image?: { mime, base64 } }
//
// Images are only ever placed in the request body sent to the provider the
// user picked. Nothing here touches the disk.

const ANTHROPIC_VERSION = '2023-06-01';

export const ADAPTERS = {
  claude: {
    buildRequest({ apiKey, model, system, messages, maxTokens }) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: {
          model,
          max_tokens: maxTokens,
          stream: true,
          ...(system ? { system } : {}),
          messages: messages.map((m) => ({
            role: m.role,
            content: m.image
              ? [
                  { type: 'image', source: { type: 'base64', media_type: m.image.mime, data: m.image.base64 } },
                  { type: 'text', text: m.text },
                ]
              : m.text,
          })),
        },
      };
    },
    parseEvent({ data }) {
      const json = safeJson(data);
      if (!json) return {};
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') return { text: json.delta.text };
      if (json.type === 'message_delta' && json.delta?.stop_reason === 'max_tokens') return { truncated: true };
      if (json.type === 'message_stop') return { done: true };
      if (json.type === 'error') return { error: json.error?.message || 'The Claude API returned an error.' };
      return {};
    },
  },

  openai: {
    buildRequest({ apiKey, model, system, messages }) {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          stream: true,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            ...messages.map((m) => ({
              role: m.role,
              content: m.image
                ? [
                    { type: 'text', text: m.text },
                    { type: 'image_url', image_url: { url: `data:${m.image.mime};base64,${m.image.base64}` } },
                  ]
                : m.text,
            })),
          ],
        },
      };
    },
    parseEvent({ data }) {
      if (data.trim() === '[DONE]') return { done: true };
      const json = safeJson(data);
      if (!json) return {};
      if (json.error) return { error: json.error.message || 'The OpenAI API returned an error.' };
      const choice = json.choices?.[0];
      return {
        text: choice?.delta?.content || undefined,
        truncated: choice?.finish_reason === 'length' || undefined,
      };
    },
  },

  gemini: {
    buildRequest({ apiKey, model, system, messages }) {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [
              ...(m.image ? [{ inlineData: { mimeType: m.image.mime, data: m.image.base64 } }] : []),
              { text: m.text },
            ],
          })),
        },
      };
    },
    parseEvent({ data }) {
      const json = safeJson(data);
      if (!json) return {};
      if (json.error) return { error: json.error.message || 'The Gemini API returned an error.' };
      if (json.promptFeedback?.blockReason) {
        return { error: `Gemini blocked this request (${json.promptFeedback.blockReason}).` };
      }
      const candidate = json.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('');
      return {
        text: text || undefined,
        truncated: candidate?.finishReason === 'MAX_TOKENS' || undefined,
      };
    },
  },
};

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
