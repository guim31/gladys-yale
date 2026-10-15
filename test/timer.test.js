// -----------------------------------------------------------------------------
// The integration refreshes by itself: the core may never call onPoll
// (GladysAssistant/Gladys#3198), the states still follow the cloud — every
// 30 minutes while the real-time stream is up, at the configured pace while it
// is down. And onPoll, the fallback, never reads faster than the timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRONT } from './helpers/fakeCloud.js';
import { BASE_CONFIG, createAll, createWorld, lockIds, settle } from './helpers/world.js';

async function timedWorld(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true, ...options });
  t.after(async () => {
    await w.app.stop();
    t.mock.timers.reset();
  });
  await createAll(w);
  // The SDK must not be the one reading: count the core's polls.
  w.polls = 0;
  const poll = w.hub.poll.bind(w.hub);
  w.hub.poll = async () => {
    w.polls += 1;
    return poll();
  };
  return w;
}

/** Advance the manual clock and the mocked timers together. */
async function elapse(w, t, ms) {
  w.clock.advance(ms);
  t.mock.timers.tick(ms);
  await settle(60);
}

const battery = (w) => w.fake.lastState(lockIds(w.gladys, FRONT).feature('battery'));

test('with real-time events, the locks are read again every 30 minutes, without onPoll', async (t) => {
  const w = await timedWorld(t);
  assert.equal(w.hub.live, true, 'the stream is up');
  assert.equal(w.hub.periodMs(), 30 * 60_000);
  w.cloud.lock(FRONT).battery = 0.42;
  await elapse(w, t, 29 * 60_000);
  assert.equal(battery(w), 88, 'not yet');
  await elapse(w, t, 60_000);
  assert.equal(battery(w), 42);
  assert.equal(w.polls, 0);
});

test('without real-time events, the locks are read at the configured pace, without onPoll', async (t) => {
  const w = await timedWorld(t, {
    config: { ...BASE_CONFIG, refresh_interval: '1' },
    cloud: undefined,
  });
  w.cloud.pubnubDown = true;
  // Let the stream notice it is down (its next long poll fails).
  w.hub.stream.stop();
  w.hub.streamKey = null;
  w.hub.startStream();
  await settle(60);
  assert.equal(w.hub.live, false);
  assert.equal(w.hub.periodMs(), 60_000);
  w.cloud.lock(FRONT).battery = 0.33;
  await elapse(w, t, 60_000);
  await elapse(w, t, 60_000);
  assert.equal(battery(w), 33);
  assert.equal(w.polls, 0);
});

test("the core's onPoll is a fallback that never reads faster than the timer", async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  await createAll(w);
  const device = w.fake.discoveredDevices[0];
  const reads = () => w.cloud.requests.filter((r) => r.path === '/users/locks/mine').length;
  const before = reads();
  await w.fake.poll(device);
  assert.equal(reads(), before, 'just read by the timer');
  w.clock.advance(5 * 60_000);
  await w.fake.poll(device);
  assert.equal(reads(), before + 1, 'the timer stalled: the core takes over');
});

test('the heartbeat re-sends unchanged values at least every 12 hours', async (t) => {
  // The SDK dates what it published with Date.now: mock the clock it reads.
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 15, 12) });
  const w = await createWorld();
  t.after(() => w.app.stop());
  await createAll(w);
  const id = lockIds(w.gladys, FRONT).feature('battery');
  const count = () => w.fake.states.filter((s) => s.device_feature_external_id === id).length;
  const before = count();
  w.clock.advance(60 * 60_000);
  t.mock.timers.tick(60 * 60_000);
  await w.hub.refresh();
  assert.equal(count(), before, 'unchanged an hour later: not sent');
  w.clock.advance(11 * 60 * 60_000);
  t.mock.timers.tick(11 * 60 * 60_000);
  await w.hub.refresh();
  assert.equal(count(), before + 1, 'unchanged for 12 hours: sent again');
});
