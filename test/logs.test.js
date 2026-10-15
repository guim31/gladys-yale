// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal cycle — reads, pushed messages, activities, polls, widget
// contents — writes nothing; a failure that repeats is logged once, and its
// end once. Never the password, a token, the e-mail address, the phone
// number, the application key or the name of a user — at any level, debug
// included.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WIDGET_KEY } from '../src/hub.js';
import { CODE, FRONT, FakeCloud, HOUSE } from './helpers/fakeCloud.js';
import {
  BASE_CONFIG,
  activityFor,
  createAll,
  createWorld,
  lockIds,
  settle,
} from './helpers/world.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/yale/${name}`, import.meta.url), 'utf8'));
const messages = fixture('pubnub-messages.json');

/** Capture the lines of the SDK logger at a level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  t.mock.method(console, 'info', record('out'));
  t.mock.method(console, 'debug', record('out'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text.replace(/^\[[^\]]+\] /, '')),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.deepEqual(logs.texts(), ['[INFO] [yale-hub] Signed in to Yale Home: 3 lock(s)']);
  await createAll(w);
  logs.clear();
  const front = w.hub.locks.get(FRONT);
  for (let i = 0; i < 3; i += 1) {
    w.clock.advance(5 * 60_000);
    w.cloud.addActivity(
      HOUSE,
      activityFor(fixture('activity.remote_unlock_activity_v4.json'), FRONT, w.clock.now() - 1000),
    );
    await w.hub.refresh();
    await w.hub.onPush({
      channel: front.pubsubChannel,
      message: messages.unlocked_by_user,
      at: w.clock.now(),
    });
    await w.hub.onPush({
      channel: front.pubsubChannel,
      message: messages.status_poll,
      at: w.clock.now(),
    });
    await w.fake.poll(w.fake.discoveredDevices[0]);
    await w.fake.widgetGet(WIDGET_KEY, {
      settings: { lock: lockIds(w.gladys, FRONT).device },
      language: 'fr',
      units: 'metric',
    });
    await w.hub.checkDoors();
  }
  await settle();
  assert.ok(w.fake.sceneEvents.length >= 3, 'the triggers fired, silently');
  assert.deepEqual(logs.texts(), []);
});

test('a cloud that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.cloud.online = false;
  for (let i = 0; i < 4; i += 1) {
    w.clock.advance(5 * 60_000);
    await w.hub.refresh();
  }
  w.cloud.online = true;
  w.clock.advance(5 * 60_000);
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(logs.texts(), [
    '[WARN] [yale-hub] The Yale Home cloud cannot be read (network: ENOTFOUND)',
    '[INFO] [yale-hub] The Yale Home cloud answers again',
  ]);
});

test('a lock that goes offline is said once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.cloud.lock(FRONT).Bridge.operative = false;
  await w.hub.refresh();
  w.clock.advance(5 * 60_000);
  await w.hub.refresh();
  w.cloud.lock(FRONT).Bridge.operative = true;
  w.clock.advance(5 * 60_000);
  await w.hub.refresh();
  assert.deepEqual(logs.texts(), [
    '[INFO] [yale-hub] Front Door Lock (…8063) is offline',
    '[INFO] [yale-hub] Front Door Lock (…8063) is online again',
  ]);
});

test('a user command is one line', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('lock_door', { lock: lockIds(w.gladys, FRONT).device });
  assert.deepEqual(logs.texts(), [
    '[INFO] [yale-hub] Front Door Lock (…8063) locked from the scene (locked)',
  ]);
});

test('no secret, address, phone number or user name in the logs, even at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const cloud = new FakeCloud();
  const w = await world(t, {
    cloud,
    signedIn: false,
    config: { ...BASE_CONFIG, api_key: '6e2a2093-6118-42c5-8a41-e1fd25dce7a1' },
  });
  await w.fake.action('send_code', {});
  await w.fake.action('enter_code', { code: '000000' });
  await w.fake.action('enter_code', { code: CODE });
  await createAll(w);
  const front = w.hub.locks.get(FRONT);
  await w.hub.onPush({
    channel: front.pubsubChannel,
    message: messages.unlocked_by_user,
    at: Date.now(),
  });
  cloud.addActivity(
    HOUSE,
    activityFor(fixture('activity.finger_unlock_activity.json'), FRONT, Date.now()),
  );
  await w.hub.refresh();
  await w.fake.sceneAction('lock_door', { lock: lockIds(w.gladys, FRONT).device });
  cloud.expireTokens();
  await w.hub.refresh();
  w.clock.advance(115 * 24 * 3600_000);
  await w.hub.refresh();
  await w.fake.action('test_connection', {});
  cloud.keyRefused = true;
  await w.fake.configUpdated({ ...BASE_CONFIG, password: 'another secret password' });
  await settle();
  await w.fake.action('sign_out', {});
  await settle();
  const text = logs.texts().join('\n');
  assert.ok(text.includes('[DEBUG]'), 'debug lines were captured');
  for (const secret of [
    ...cloud.secrets(),
    'another secret password',
    'Foo Bar',
    'Sample Person',
    '+1555555',
  ]) {
    assert.ok(!text.includes(secret), `the logs hold "${secret}"`);
  }
});
