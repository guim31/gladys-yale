// -----------------------------------------------------------------------------
// The account end to end, against the SDK's fake Gladys and the fake cloud:
// sign-in and its failures, reads, states, scene triggers, commands, pushed
// messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONNECTION_TEXT, MESSAGES } from '../src/texts.js';
import { TRIGGERS } from '../src/hub.js';
import { LOCK_STATE } from '../src/devices.js';
import { BACK, CODE, FLAT, FRONT, FakeCloud, HOUSE, PASSWORD } from './helpers/fakeCloud.js';
import {
  BASE_CONFIG,
  activityFor,
  createAll,
  createClock,
  createWorld,
  lockIds,
  settle,
} from './helpers/world.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/yale/${name}`, import.meta.url), 'utf8'));
const messages = fixture('pubnub-messages.json');

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, lockId, key) => w.fake.lastState(lockIds(w.gladys, lockId).feature(key));
const sessions = (cloud) => cloud.requests.filter((r) => r.path === '/session').length;
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('a signed-in account: three locks, the guest lock left out, connected', async (t) => {
  const w = await world(t);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Front Door Lock', 'Back Door', 'Wohnung'],
  );
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.match(w.fake.connectionStatus.message.en, /^Connected: 3 locks/);
  assert.equal(sessions(w.cloud), 0, 'the saved token is used, no new session');
  await createAll(w);
  assert.equal(state(w, FRONT, 'lock_state'), LOCK_STATE.LOCKED);
  assert.equal(state(w, FRONT, 'door'), 1, 'closed is 1 for an opening sensor');
  assert.equal(state(w, BACK, 'door'), 0, 'open is 0');
  assert.equal(state(w, FRONT, 'battery'), 88);
  assert.equal(state(w, FRONT, 'keypad_battery_low'), 0);
  assert.equal(state(w, FLAT, 'online'), 1);
});

test('first sign-in: send the code, a wrong code, the right one, then no code after a restart', async (t) => {
  const clock = createClock();
  const cloud = new FakeCloud({ now: clock.now });
  const w = await world(t, { signedIn: false, clock, cloud });
  assert.equal(w.hub.status, 'needs_code');
  assert.deepEqual(w.fake.connectionStatus.message, CONNECTION_TEXT.needsCode);
  assert.equal(w.fake.discoveredDevices.length, 0);

  const enteredTooSoon = await w.fake.action('enter_code', { code: CODE });
  assert.equal(enteredTooSoon.success, false);

  const sent = await w.fake.action('send_code', {});
  assert.deepEqual(sent.data.message, MESSAGES.codeSent);
  assert.ok(cloud.requests.some((r) => r.path === '/validation/email'));

  const wrong = await w.fake.action('enter_code', { code: '000 000' });
  assert.equal(wrong.success, false);
  assert.deepEqual(wrong.error, MESSAGES.badCode);

  const right = await w.fake.action('enter_code', { code: ` ${CODE} ` });
  assert.equal(right.success, true, JSON.stringify(right));
  assert.match(
    right.data.message.en,
    /^Signed in: 3 locks \(Front Door Lock, Back Door, Wohnung\)/,
  );
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.discoveredDevices.length, 3);
  await w.app.stop();

  // Restart on the same /data: no code, no new installation.
  const before = cloud.requests.length;
  const again = await world(t, { signedIn: false, clock, cloud, dataDir: w.dataDir });
  assert.equal(again.hub.status, 'connected');
  const after = cloud.requests.slice(before).map((r) => r.path);
  assert.ok(!after.some((path) => path.startsWith('/validat')), after.join(' '));
});

test('an expired token signs in again with the password, without a code', async (t) => {
  const w = await world(t);
  w.cloud.expireTokens();
  await w.hub.refresh();
  assert.equal(w.hub.status, 'connected');
  assert.equal(sessions(w.cloud), 1);
  assert.ok(!w.cloud.requests.some((r) => r.path.startsWith('/validat')));
});

test('a token close to its expiry is renewed', async (t) => {
  const w = await world(t);
  const old = w.hub.store.get('token');
  w.clock.advance(115 * 24 * 3600_000);
  await w.hub.refresh();
  assert.notEqual(w.hub.store.get('token'), old);
  assert.ok(w.cloud.requests.some((r) => r.path === '/users/houses/mine'));
  assert.equal(w.hub.status, 'connected');
});

test('a wrong password stops the attempts until the configuration changes', async (t) => {
  const w = await world(t, { signedIn: false, config: { ...BASE_CONFIG, password: 'wrong' } });
  assert.equal(w.hub.status, 'bad_credentials');
  assert.deepEqual(w.fake.connectionStatus.message, CONNECTION_TEXT.badCredentials);
  const tries = sessions(w.cloud);
  await w.hub.refresh();
  await w.hub.refresh();
  assert.equal(sessions(w.cloud), tries, 'no new attempt with the same password');
  await w.fake.configUpdated({ ...BASE_CONFIG, password: PASSWORD });
  await settle();
  assert.equal(w.hub.status, 'needs_code');
  assert.equal(sessions(w.cloud), tries + 1);
});

test('a refused application key says so, and another key can be typed', async (t) => {
  const cloud = new FakeCloud();
  cloud.keyRefused = true;
  const w = await world(t, { signedIn: false, cloud });
  assert.equal(w.hub.status, 'app_key');
  assert.deepEqual(w.fake.connectionStatus.message, CONNECTION_TEXT.appKey);
  const sent = await w.fake.action('send_code', {});
  assert.deepEqual(sent.error, MESSAGES.appKey);
  cloud.keyRefused = false;
  await w.fake.configUpdated({ ...BASE_CONFIG, api_key: 'partner-key' });
  await settle();
  assert.equal(w.hub.status, 'needs_code');
  assert.equal(cloud.requests.at(-1).headers['x-api-key'], 'partner-key');
});

test('another account in the configuration drops the saved sign-in', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ ...BASE_CONFIG, username: 'someone@example.com' });
  await settle();
  assert.equal(w.hub.signedIn, false);
  assert.equal(w.hub.status, 'bad_credentials');
});

test('missing credentials: the status says what to fill in', async (t) => {
  const w = await world(t, { signedIn: false, config: { ...BASE_CONFIG, password: '' } });
  assert.equal(w.hub.status, 'not_configured');
  assert.deepEqual(w.fake.connectionStatus.message, CONNECTION_TEXT.notConfigured);
  const sent = await w.fake.action('send_code', {});
  assert.deepEqual(sent.error, MESSAGES.notConfigured);
});

test('a new unlock activity fires "unlocked" once, with who and how', async (t) => {
  const w = await world(t);
  await createAll(w);
  w.clock.advance(60_000);
  w.cloud.addActivity(
    HOUSE,
    activityFor(fixture('activity.pin_unlock_activity.json'), FRONT, w.clock.now() - 5_000),
  );
  await w.hub.refresh();
  const fired = events(w, TRIGGERS.UNLOCKED);
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0].data, {
    lock: lockIds(w.gladys, FRONT).device,
    lock_name: 'Front Door Lock',
    method: 'keypad',
    method_label: 'Keypad',
    user: 'Sample Person',
  });
  assert.equal(state(w, FRONT, 'lock_state'), LOCK_STATE.UNLOCKED);
  assert.equal(state(w, FRONT, 'last_user'), 'Sample Person');
  assert.equal(state(w, FRONT, 'last_method'), 'Keypad');
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.UNLOCKED).length, 1, 'never twice for the same activity');
});

test('the activities seen at start, or too old, fire nothing', async (t) => {
  const clock = createClock();
  const cloud = new FakeCloud({ now: clock.now });
  cloud.addActivity(
    HOUSE,
    activityFor(fixture('activity.manual_unlock_activity.json'), FRONT, clock.now() - 60_000),
  );
  const w = await world(t, { clock, cloud });
  assert.equal(events(w, TRIGGERS.UNLOCKED).length, 0, 'start: a starting point only');
  assert.equal(w.hub.locks.get(FRONT).lastMethod, 'manual');
  assert.equal(w.hub.locks.get(FRONT).state, 'unlocked', 'newer than the detail');
  w.clock.advance(60 * 60_000);
  cloud.addActivity(
    HOUSE,
    activityFor(fixture('activity.finger_unlock_activity.json'), FRONT, clock.now() - 30 * 60_000),
  );
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.UNLOCKED).length, 0, 'half an hour old: no trigger');
  assert.equal(w.hub.locks.get(FRONT).lastMethod, 'fingerprint');
});

test('"door left open" fires each step once, and stops when the door closes', async (t) => {
  const w = await world(t);
  assert.equal(await w.hub.checkDoors(), 0, 'the back door was open before the start');
  const front = w.hub.locks.get(FRONT);
  await w.hub.onPush({
    channel: front.pubsubChannel,
    message: { status: 'locked', doorState: 'open' },
    at: w.clock.now(),
  });
  w.clock.advance(59_000);
  assert.equal(await w.hub.checkDoors(), 0);
  w.clock.advance(1_000);
  assert.equal(await w.hub.checkDoors(), 1);
  w.clock.advance(4 * 60_000);
  assert.equal(await w.hub.checkDoors(), 2, '2 and 5 minutes');
  assert.deepEqual(
    events(w, TRIGGERS.LEFT_OPEN).map((event) => [event.data.lock_name, event.data.minutes]),
    [
      ['Front Door Lock', '1'],
      ['Front Door Lock', '2'],
      ['Front Door Lock', '5'],
    ],
  );
  await w.hub.onPush({
    channel: front.pubsubChannel,
    message: { status: 'locked', doorState: 'closed' },
    at: w.clock.now(),
  });
  w.clock.advance(60 * 60_000);
  assert.equal(await w.hub.checkDoors(), 0);
});

test('a low battery fires once per drop, even across a restart', async (t) => {
  const clock = createClock();
  const cloud = new FakeCloud({ now: clock.now });
  const w = await world(t, { clock, cloud });
  cloud.lock(FRONT).battery = 0.15;
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.BATTERY_LOW).map((event) => [event.data.part, event.data.level]),
    [['lock', 15]],
  );
  await w.app.stop();
  const again = await world(t, { clock, cloud, signedIn: false, dataDir: w.dataDir });
  assert.equal(
    events(again, TRIGGERS.BATTERY_LOW).length,
    0,
    'already reported before the restart',
  );
  cloud.lock(FRONT).battery = 0.9;
  await again.hub.refresh();
  cloud.lock(FRONT).battery = 0.1;
  cloud.lock(FRONT).keypad.batteryLevel = 'Low';
  await again.hub.refresh();
  assert.deepEqual(
    events(again, TRIGGERS.BATTERY_LOW).map((event) => [event.data.part, event.data.level]),
    [
      ['lock', 10],
      ['keypad', null],
    ],
  );
  assert.equal(state(again, FRONT, 'keypad_battery_low'), 1);
});

test('locking from a scene; unlocking refused until the configuration allows it', async (t) => {
  const w = await world(t);
  await createAll(w);
  w.cloud.lock(FRONT).LockStatus.status = 'unlocked';
  await w.hub.refresh();
  const front = lockIds(w.gladys, FRONT).device;
  const locked = await w.fake.sceneAction('lock_door', { lock: front });
  assert.deepEqual(locked.data.outputs, { state: 'locked' });
  assert.equal(state(w, FRONT, 'lock_state'), LOCK_STATE.LOCKED);

  const refused = await w.fake.sceneAction('unlock_door', { lock: front });
  assert.equal(refused.success, false);
  assert.deepEqual(refused.error, MESSAGES.unlockOff);
  assert.ok(!w.cloud.requests.some((r) => r.path.endsWith('/unlock')), 'never sent to the cloud');

  await w.fake.configUpdated({ ...BASE_CONFIG, allow_unlock: true });
  await settle();
  const unlocked = await w.fake.sceneAction('unlock_door', { lock: front });
  assert.deepEqual(unlocked.data.outputs, { state: 'unlocked' });
  assert.equal(state(w, FRONT, 'lock_state'), LOCK_STATE.UNLOCKED);
});

test('the lock action of the configuration, and the bridge errors', async (t) => {
  const w = await world(t);
  const back = lockIds(w.gladys, BACK).device;
  const done = await w.fake.action('lock_now', { lock: back });
  assert.equal(done.data.message.en, 'Back Door: locked');
  assert.equal(done.data.message.fr, 'Back Door : verrouillée');
  w.cloud.operationAnswer = { status: 422 };
  const offline = await w.fake.action('lock_now', { lock: back });
  assert.deepEqual(offline.error, MESSAGES.bridgeOffline);
  w.cloud.operationAnswer = { status: 200, body: { status: 'FAILED_BRIDGE_ERROR_LOCK_JAMMED' } };
  const jammed = await w.fake.action('lock_now', { lock: back });
  assert.deepEqual(jammed.error, MESSAGES.jammed);
  assert.equal(w.hub.locks.get(BACK).state, 'jammed');
  const unknown = await w.fake.action('lock_now', { lock: lockIds(w.gladys, 'NOPE').device });
  assert.deepEqual(unknown.error, MESSAGES.unknownLock);
});

test('a pushed message updates the states at once', async (t) => {
  const w = await world(t);
  await createAll(w);
  const front = w.hub.locks.get(FRONT);
  w.clock.advance(60_000);
  await w.hub.onPush({
    channel: front.pubsubChannel,
    message: messages.unlocked_by_user,
    at: w.clock.now(),
  });
  assert.equal(state(w, FRONT, 'lock_state'), LOCK_STATE.UNLOCKED);
  assert.equal(state(w, FRONT, 'last_user'), 'Foo Bar');
  await w.hub.onPush({ channel: front.pubsubChannel, message: messages.jammed, at: w.clock.now() });
  assert.equal(state(w, FRONT, 'lock_state'), LOCK_STATE.ERROR, 'newer operation time');
  await w.hub.onPush({
    channel: front.pubsubChannel,
    message: messages.bridge_offline,
    at: w.clock.now(),
  });
  assert.equal(state(w, FRONT, 'online'), 0);
  await w.hub.onPush({
    channel: front.pubsubChannel,
    message: messages.status_poll,
    at: w.clock.now(),
  });
  await w.hub.onPush({
    channel: 'unknown-channel',
    message: messages.locked_door_open,
    at: w.clock.now(),
  });
  assert.equal(state(w, FRONT, 'online'), 0);
});

test('an added device gets all its states again, and the widget a refresh', async (t) => {
  const w = await world(t);
  const device = w.fake.discoveredDevices.find(
    (d) => d.external_id === lockIds(w.gladys, FLAT).device,
  );
  const before = w.fake.states.length;
  await w.fake.deviceCreated(device);
  await settle();
  const sent = w.fake.states
    .slice(before)
    .map((s) => s.device_feature_external_id.split(':').pop());
  assert.deepEqual(sent.sort(), ['battery', 'lock_state', 'online']);
  assert.ok(w.fake.widgetRefreshes.includes('lock'));
});

test('sign out forgets the token and the installation: a code is needed again', async (t) => {
  const w = await world(t);
  const install = w.hub.store.get('installId');
  const out = await w.fake.action('sign_out', {});
  assert.deepEqual(out.data.message, MESSAGES.signedOut);
  assert.equal(w.hub.signedIn, false);
  assert.notEqual(w.hub.store.get('installId'), install);
  const saved = JSON.parse(readFileSync(join(w.dataDir, 'yale-state.json'), 'utf8'));
  assert.equal(saved.token, undefined);
  const tries = sessions(w.cloud);
  await w.hub.refresh();
  assert.equal(sessions(w.cloud), tries, 'no automatic sign-in after a sign-out');
  assert.equal(w.hub.status, 'needs_code');
});

test('a cloud asking to slow down pauses the reads', async (t) => {
  const w = await world(t);
  w.cloud.statusOverride = { path: /^\/users\/locks\/mine$/, status: 429 };
  await w.hub.refresh();
  assert.equal(w.hub.status, 'rate_limit');
  const count = w.cloud.requests.length;
  w.clock.advance(5 * 60_000);
  await w.hub.refresh();
  assert.equal(w.cloud.requests.length, count, 'paused');
  w.cloud.statusOverride = null;
  w.clock.advance(6 * 60_000);
  await w.hub.refresh();
  assert.equal(w.hub.status, 'connected');
});

test('test the connection: the locks, or what is wrong', async (t) => {
  const w = await world(t);
  const ok = await w.fake.action('test_connection', {});
  assert.match(ok.data.message.fr, /^Connecté : 3 serrures/);
  w.cloud.online = false;
  const down = await w.fake.action('test_connection', {});
  assert.deepEqual(down.error, MESSAGES.network);
});
