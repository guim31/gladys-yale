// -----------------------------------------------------------------------------
// The HTTP seam: one function over the global fetch of Node 22+. The tests
// replace it with the fake cloud of test/helpers/fakeCloud.js; nothing else in
// the code touches the network.
//
//   httpRequest({ method, url, headers, json, timeoutMs, signal })
//     → { status, headers (lower-case names), body: string }
//
// A network failure throws a NetworkError with a `code` (ENOTFOUND,
// ECONNREFUSED, TIMEOUT…), never the address it tried.
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 20_000;
// The answers are a few dozen kilobytes; the sandbox has 256 MB.
const MAX_BYTES = 2 * 1024 * 1024;

export class NetworkError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
  }
}

async function readBody(response, controller) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      controller.abort();
      throw new NetworkError('TOO_LARGE', `Answer larger than ${MAX_BYTES} bytes`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The code of a fetch failure: ENOTFOUND, ECONNREFUSED… (a DOMException in
 * the chain carries a numeric code: skipped), PROXY_403 when a proxy refused
 * the tunnel.
 */
export function networkCode(err) {
  const chain = [err, err?.cause, err?.cause?.cause].filter(Boolean);
  for (const link of chain) {
    const proxy = String(link.message ?? '').match(/Proxy response \((\d+)\)/);
    if (proxy) return `PROXY_${proxy[1]}`;
  }
  const code = chain.map((link) => link.code).find((value) => typeof value === 'string');
  return code ?? 'NETWORK';
}

/** The production request, over fetch. */
export async function httpRequest({
  method = 'GET',
  url,
  headers = {},
  json,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const init = { method, headers: { ...headers }, redirect: 'manual', signal: controller.signal };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
  }
  try {
    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (signal?.aborted) throw new NetworkError('ABORTED');
      if (controller.signal.aborted) {
        throw new NetworkError('TIMEOUT', `No answer within ${timeoutMs / 1000} s`);
      }
      throw new NetworkError(networkCode(err));
    }
    try {
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await readBody(response, controller),
      };
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      if (signal?.aborted) throw new NetworkError('ABORTED');
      throw new NetworkError('TIMEOUT', `Answer interrupted (${err.name})`);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
