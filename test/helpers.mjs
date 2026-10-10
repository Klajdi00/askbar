// Test helpers: fake streaming responses and a recording fetch.

/** A ReadableStream that delivers the given string pieces as separate chunks. */
export function streamOf(pieces) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of pieces) controller.enqueue(encoder.encode(p));
      controller.close();
    },
  });
}

/** An SSE body from JSON payloads (or raw strings), split at awkward places. */
export function sseBody(events, { splitEvery = 7 } = {}) {
  const text = events
    .map((e) => (typeof e === 'string' ? `data: ${e}\n\n` : `data: ${JSON.stringify(e)}\n\n`))
    .join('');
  const pieces = [];
  for (let i = 0; i < text.length; i += splitEvery) pieces.push(text.slice(i, i + splitEvery));
  return streamOf(pieces);
}

/** fetch() stand-in that records the request and replies with `response`. */
export function fakeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return typeof response === 'function' ? response(url, init) : response;
  };
  fn.calls = calls;
  return fn;
}
