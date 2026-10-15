// -----------------------------------------------------------------------------
// The PubNub long poll: subscribe, messages, failure and retry.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PushStream, timetokenToMs } from '../src/yale/pubnub.js';
import { FakeCloud } from './helpers/fakeCloud.js';

test('timetokens are tenths of microseconds', () => {
  assert.equal(timetokenToMs('17000000000000000'), 1_700_000_000_000);
  assert.equal(timetokenToMs(undefined), null);
});

test('subscribes to the lock channels and relays the messages', async (t) => {
  const cloud = new FakeCloud();
  const urls = [];
  const stream = new PushStream({
    subscribeKey: 'sub-c-test',
    request: (call) => {
      urls.push(call.url);
      return cloud.request(call);
    },
  });
  t.after(() => stream.stop());
  const up = once(stream, 'up');
  stream.start(['channel-a', 'channel b'], 'cccca94e-aaaa');
  await up;
  assert.equal(stream.connected, true);
  const first = new URL(urls[0]);
  assert.equal(first.pathname, '/v2/subscribe/sub-c-test/channel-a,channel%20b/0');
  assert.equal(first.searchParams.get('tt'), '0');
  assert.equal(first.searchParams.get('uuid'), 'pn-CCCCA94E-AAAA');

  const message = once(stream, 'message');
  cloud.publish('channel-a', { status: 'locked' });
  const [event] = await message;
  assert.equal(event.channel, 'channel-a');
  assert.deepEqual(event.message, { status: 'locked' });
  assert.ok(event.at > 1_700_000_000_000);
  const next = new URL(urls.at(-1));
  assert.equal(next.searchParams.get('tr'), '12');
  assert.notEqual(next.searchParams.get('tt'), '0');
});

// The stream's retry timers are unref'd (the SDK socket keeps the process
// alive in production): keep the test's event loop busy meanwhile.
function keepAlive(t) {
  const timer = setInterval(() => {}, 5);
  t.after(() => clearInterval(timer));
}

test('a failure is reported once, retried, and the recovery reported', async (t) => {
  keepAlive(t);
  const cloud = new FakeCloud();
  cloud.online = false;
  const stream = new PushStream({
    subscribeKey: 'sub-c-test',
    request: cloud.request,
    timings: { retryBaseMs: 5, retryMaxMs: 10 },
  });
  t.after(() => stream.stop());
  const downs = [];
  stream.on('down', (event) => downs.push(event.error.code));
  stream.start(['channel-a'], 'u');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(downs, ['ENOTFOUND'], 'one warning, however many tries');
  const up = once(stream, 'up');
  cloud.online = true;
  await up;
  assert.equal(stream.connected, true);
});

test('a refused key (HTTP 403) is a failure, nothing without channels', async (t) => {
  keepAlive(t);
  const stream = new PushStream({
    subscribeKey: 'sub-c-test',
    request: async () => ({ status: 403, headers: {}, body: '{"error":true}' }),
    timings: { retryBaseMs: 1000 },
  });
  t.after(() => stream.stop());
  const down = once(stream, 'down');
  stream.start(['a'], 'u');
  const [{ error }] = await down;
  assert.equal(error.code, 'HTTP 403');
  stream.stop();
  const idle = new PushStream({ subscribeKey: 'k', request: async () => assert.fail('no call') });
  idle.start([], 'u');
  assert.equal(idle.running, false);
});
