// -----------------------------------------------------------------------------
// The HTTP seam, against a local server (127.0.0.1, never the Internet):
// status and headers, JSON body, timeout, and the codes of network failures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { httpRequest, networkCode } from '../src/yale/http.js';

async function server(t, handler) {
  const http = createServer(handler);
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => http.close(resolve)));
  return `http://127.0.0.1:${http.address().port}`;
}

test('status, lower-case headers, JSON sent and body read', async (t) => {
  let received;
  const base = await server(t, (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received = { method: req.method, body, key: req.headers['x-api-key'] };
      res.writeHead(200, { 'X-August-Access-Token': 'fresh' });
      res.end('{"ok":true}');
    });
  });
  const answer = await httpRequest({
    method: 'POST',
    url: `${base}/session`,
    headers: { 'x-api-key': 'k' },
    json: { a: 1 },
  });
  assert.equal(answer.status, 200);
  assert.equal(answer.headers['x-august-access-token'], 'fresh');
  assert.equal(answer.body, '{"ok":true}');
  assert.deepEqual(received, { method: 'POST', body: '{"a":1}', key: 'k' });
});

test('a server that does not answer in time is a TIMEOUT', async (t) => {
  const base = await server(t, () => {});
  await assert.rejects(httpRequest({ url: base, timeoutMs: 50 }), (err) => err.code === 'TIMEOUT');
});

test('an aborted long poll is ABORTED', async (t) => {
  const base = await server(t, () => {});
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(
    httpRequest({ url: base, timeoutMs: 5_000, signal: controller.signal }),
    (err) => err.code === 'ABORTED',
  );
});

test('the codes of network failures', () => {
  const dom = Object.assign(new Error('Request was cancelled.'), { code: 0 });
  dom.cause = Object.assign(new Error('Proxy response (403) !== 200 when HTTP Tunneling'), {
    code: 'UND_ERR_ABORTED',
  });
  assert.equal(networkCode(Object.assign(new Error('fetch failed'), { cause: dom })), 'PROXY_403');
  const dns = Object.assign(new Error('fetch failed'), {
    cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
  });
  assert.equal(networkCode(dns), 'ENOTFOUND');
  assert.equal(networkCode(new Error('x')), 'NETWORK');
});
