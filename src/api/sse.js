// Minimal Server-Sent Events reader for fetch() response bodies.
// All three providers stream as SSE ("data: {...}" lines separated by blank lines).

/**
 * Yields { event, data } for every complete SSE event in a ReadableStream.
 * Handles events split across network chunks and CRLF line endings.
 */
export async function* readSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = null;
  let data = [];
  let finished = false;

  const takeEvent = () => {
    const out = data.length ? { event, data: data.join('\n') } : null;
    event = null;
    data = [];
    return out;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);

        if (line === '') {
          const ev = takeEvent();
          if (ev) yield ev;
        } else if (line.startsWith(':')) {
          // comment / keep-alive
        } else {
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          let value = colon === -1 ? '' : line.slice(colon + 1);
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'data') data.push(value);
          else if (field === 'event') event = value;
        }
      }

      if (done) break;
    }

    // Stream ended without a trailing blank line.
    if (buffer.trim()) {
      const line = buffer.replace(/\r$/, '');
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    finished = true;
    const last = takeEvent();
    if (last) yield last;
  } finally {
    // The consumer stopped early (done event, error, cancel): close the connection.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock?.();
  }
}
