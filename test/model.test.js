// -----------------------------------------------------------------------------
// The cloud answers → plain objects, on the real answers of yalexs and Home
// Assistant (test/fixtures/yale).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  METHODS,
  doorStateOf,
  keypadLow,
  lockStateOf,
  parseActivity,
  parseLockDetail,
  parseLocks,
  parsePushMessage,
} from '../src/yale/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/yale/${name}`, import.meta.url), 'utf8'));
const messages = fixture('pubnub-messages.json');

test('the lock and door states of every vocabulary', () => {
  assert.equal(lockStateOf('kAugLockState_Locked'), 'locked');
  assert.equal(lockStateOf('secure'), 'locked');
  assert.equal(lockStateOf('kAugLockState_Unlatched'), 'unlocked');
  assert.equal(lockStateOf('kAugLockState_Unlatching'), 'unlocking');
  assert.equal(lockStateOf('kAugLockState_Locking'), 'locking');
  assert.equal(lockStateOf('FAILED_BRIDGE_ERROR_LOCK_JAMMED'), 'jammed');
  assert.equal(lockStateOf('DoorStateChanged'), 'unknown');
  assert.equal(doorStateOf('kAugDoorState_Open'), 'open');
  assert.equal(doorStateOf('closed'), 'closed');
  assert.equal(doorStateOf('init'), 'disabled');
  assert.equal(doorStateOf(undefined), 'disabled');
  assert.equal(doorStateOf('weird'), 'unknown');
});

test('only the locks the account owns are operable', () => {
  const locks = parseLocks(fixture('locks.json'));
  assert.deepEqual(
    locks.map((lock) => [lock.name, lock.operable]),
    [
      ['Front Door Lock', true],
      ['Back Door Lock', false],
    ],
  );
  assert.deepEqual(parseLocks(null), []);
  assert.deepEqual(parseLocks([]), []);
});

test('a lock with a keypad, DoorSense and a bridge without status', () => {
  const lock = parseLockDetail(fixture('lock.keypad.json'));
  assert.equal(lock.id, 'A6697750D607098BAE8D6BAA11EF8063');
  assert.equal(lock.name, 'Front Door Lock');
  assert.equal(lock.battery, 88);
  assert.equal(lock.state, 'locked');
  assert.equal(lock.stateAt, Date.parse('2017-12-10T04:48:30.272Z'));
  assert.equal(lock.doorsense, true);
  assert.equal(lock.door, 'closed');
  assert.equal(lock.online, true, 'an operative bridge without status is online');
  assert.deepEqual(lock.keypad, { batteryLevel: 'Medium' });
  assert.equal(keypadLow(lock.keypad), false);
  assert.equal(lock.model, 'AUG-SL02-M02-S02');
  assert.equal(lock.pubsubChannel, '3333a674-ffff-aaaa-b351-b3a4473f3333');
  assert.deepEqual(lock.users, { 'cccca94e-373e-aaaa-bbbb-333396827777': 'Foo Bar' });
});

test('a low keypad battery', () => {
  const lock = parseLockDetail(fixture('lock.low_keypad_battery.json'));
  assert.equal(keypadLow(lock.keypad), true);
});

test('an offline lock: no bridge, battery unknown, state unknown', () => {
  const lock = parseLockDetail(fixture('lock.offline.json'));
  assert.equal(lock.online, false);
  assert.equal(lock.hasBridge, false);
  assert.equal(lock.battery, null);
  assert.equal(lock.state, 'unknown');
  assert.equal(lock.doorsense, false);
  assert.equal(lock.door, null);
});

test('a Linus L2 of Yale Home: no DoorSense (init), named by its type, battery warning', () => {
  const lock = parseLockDetail(fixture('lock.unlatch.json'));
  assert.equal(lock.name, 'Wohnung');
  assert.equal(lock.model, 'Linus L2');
  assert.equal(lock.doorsense, false);
  assert.equal(lock.online, true);
  assert.equal(lock.battery, 61);
  assert.equal(lock.batteryWarning, false);
  const warned = fixture('lock.unlatch.json');
  warned.batteryInfo.warningState = 'lock_state_battery_warning_low';
  assert.equal(parseLockDetail(warned).batteryWarning, true);
});

test('DoorSense open, bridge online', () => {
  const lock = parseLockDetail(fixture('lock.doorsense.json'));
  assert.equal(lock.door, 'open');
  assert.equal(lock.doorsense, true);
  assert.equal(lock.online, true);
});

test('how each activity of the feed operated the lock', () => {
  const cases = [
    ['activity.remote_unlock_activity_v4.json', 'unlocked', 'remote', '89 House'],
    ['activity.finger_unlock_activity.json', 'unlocked', 'fingerprint', 'Sample Person'],
    ['activity.manual_unlock_activity.json', 'unlocked', 'manual', null],
    ['activity.pin_unlock_activity.json', 'unlocked', 'keypad', 'Sample Person'],
    ['activity.auto_lock_activity.json', 'locked', 'auto', null],
    ['activity.homekey_unlock_activity_v4.json', 'unlocked', 'homekey', '89 House'],
    ['activity.rf_unlock_activity_v4.json', 'unlocked', 'tag', '89 House'],
    ['activity.bluetooth_lock_activity.json', 'locked', 'bluetooth', 'I have a picture'],
    ['activity.ha_lock_from_keypad.json', 'locked', 'keypad', 'Your favorite elven princess'],
  ];
  for (const [file, state, method, user] of cases) {
    const raw = fixture(file);
    const activity = parseActivity(Array.isArray(raw) ? raw[0] : raw);
    assert.equal(activity.kind, 'lock', file);
    assert.equal(activity.state, state, file);
    assert.equal(activity.method, method, file);
    if (user !== null || method === 'manual' || method === 'auto') {
      assert.equal(activity.user, user, file);
    }
    assert.ok(METHODS.includes(activity.method));
    assert.ok(Number.isFinite(activity.at));
  }
});

test('door, bridge and jammed activities; doorbells are ignored', () => {
  assert.deepEqual(
    (({ kind, door }) => ({ kind, door }))(
      parseActivity(fixture('activity.door_open_activity.json')),
    ),
    { kind: 'door', door: 'open' },
  );
  assert.equal(parseActivity(fixture('activity.door_closed_activity.json')).door, 'closed');
  const bridge = parseActivity(fixture('activity.ha_bridge_offline.json')[0]);
  assert.deepEqual([bridge.kind, bridge.online], ['bridge', false]);
  const jammed = parseActivity(fixture('activity.ha_jammed.json')[0]);
  assert.deepEqual([jammed.kind, jammed.state], ['lock', 'jammed']);
  assert.equal(parseActivity({ deviceType: 'doorbell', action: 'doorbell_motion_detected' }), null);
  assert.equal(parseActivity({ deviceType: 'lock', action: 'lock' }), null, 'no device, no time');
});

test('the house activities of yalexs all parse', () => {
  const activities = fixture('house-activities.json').map(parseActivity).filter(Boolean);
  assert.ok(activities.length >= 5);
  for (const activity of activities) assert.ok(['lock', 'door', 'bridge'].includes(activity.kind));
});

test('pushed messages', () => {
  const at = Date.UTC(2026, 9, 15);
  const unlatching = parsePushMessage(messages.unlatching_remote, at);
  assert.equal(unlatching.state, 'unlocking');
  assert.equal(unlatching.at, Date.parse('2021-03-20T18:19:05.373Z'));
  assert.equal(parsePushMessage(messages.jammed, at).state, 'jammed');

  const locked = parsePushMessage(messages.locked_door_open, at);
  assert.deepEqual(locked, { at, state: 'locked', door: 'open' }, 'no user without a time');

  const byUser = parsePushMessage(messages.unlocked_by_user, at);
  assert.equal(byUser.userId, 'cccca94e-373e-aaaa-bbbb-333396827777');
  assert.equal(byUser.door, 'closed');

  const manual = parsePushMessage(messages.manual_unlock_door_open, at);
  assert.equal(manual.method, 'manual');
  assert.equal(manual.state, 'unlocked');

  assert.equal(parsePushMessage(messages.status_poll, at), null, 'a status answer is no operation');
  assert.equal(parsePushMessage(messages.door_state_changed, at), null);
  assert.equal(parsePushMessage(messages.door_init, at), null);
  assert.equal(parsePushMessage(messages.bridge_offline, at).online, false);
  assert.equal(parsePushMessage(messages.bridge_online, at).online, true);
  assert.equal(
    parsePushMessage({ error: { name: 'ERRNO_BRIDGE_OFFLINE' }, status: 'locked' }, at).online,
    false,
  );
  assert.equal(parsePushMessage(null, at), null);
});
