// -----------------------------------------------------------------------------
// Gladys devices and feature values, pure functions.
//
// One device per lock, keyed on the LockID the cloud gives (permanent):
//   - lock_state  lock/state, read only: 0 unlocked, 1 locked, 2 moving,
//                 3 jammed (Gladys LOCK.STATE). Never a writable lock/binary:
//                 a toggle in the dashboard, the voice or a "turn off all
//                 devices" scene must not open the door. Locking goes
//                 through the widget, the scene action or a manifest action;
//                 unlocking too, only when the configuration allows it;
//   - door        opening-sensor/binary (DoorSense), 0 open, 1 closed
//                 (Gladys OPENING_SENSOR_STATE: the reverse of the other
//                 detectors);
//   - battery     battery/integer, %;
//   - keypad_battery_low  battery-low/binary, when a keypad is paired;
//   - online      input/binary: the cloud reaches the lock (bridge, Wi-Fi);
//   - last_user, last_method  text/text: who operated it last, and how.
//
// The devices are published with should_poll and the one-minute frequency
// for the core's onPoll, a fallback only: the hub reads the cloud on its own
// timer (GladysAssistant/Gladys#3198).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { keypadLow } from './yale/model.js';
import { DEVICE_NAMES, FEATURE_NAMES, METHOD_NAMES, pick } from './texts.js';

export const DEVICE_TYPE = 'lock';

// Feature keys: part of the external ids, permanent.
export const FEATURE_KEYS = Object.freeze({
  LOCK_STATE: 'lock_state',
  DOOR: 'door',
  BATTERY: 'battery',
  KEYPAD_BATTERY_LOW: 'keypad_battery_low',
  ONLINE: 'online',
  LAST_USER: 'last_user',
  LAST_METHOD: 'last_method',
});

// Values of the lock/state feature (Gladys server/utils/constants.js LOCK.STATE).
export const LOCK_STATE = Object.freeze({ UNLOCKED: 0, LOCKED: 1, MOVING: 2, ERROR: 3 });

// Values of the opening sensor (Gladys OPENING_SENSOR_STATE).
export const DOOR_STATE = Object.freeze({ OPEN: 0, CLOSED: 1 });

const LOCK_STATE_VALUES = {
  locked: LOCK_STATE.LOCKED,
  unlocked: LOCK_STATE.UNLOCKED,
  locking: LOCK_STATE.MOVING,
  unlocking: LOCK_STATE.MOVING,
  jammed: LOCK_STATE.ERROR,
};

export const lockIds = (gladys, lockId) => gladys.externalIds(DEVICE_TYPE, lockId);

/** The LockID of one of our device external ids, or null. */
export function lockIdOf(gladys, externalId) {
  const prefix = lockIds(gladys, '').device;
  const value = String(externalId ?? '');
  return value.startsWith(prefix) ? value.slice(prefix.length).split(':')[0] || null : null;
}

function feature(ids, key, language, category, type, extra = {}) {
  return {
    name: pick(FEATURE_NAMES, language)[key],
    external_id: ids.feature(key),
    category,
    type,
    read_only: true,
    has_feedback: false,
    min: 0,
    max: 1,
    ...extra,
  };
}

/**
 * @param {object} gladys GladysIntegration (for the external ids)
 * @param {object} lock a lock of the hub (src/yale/model.js parseLockDetail)
 * @param {object} options
 * @param {string} options.language language of the names
 * @param {string} options.brandName "Yale Home", "August"…
 */
export function buildLockDevice(gladys, lock, { language, brandName }) {
  const ids = lockIds(gladys, lock.id);
  const features = [
    feature(ids, FEATURE_KEYS.LOCK_STATE, language, C.LOCK, T.LOCK.STATE, { max: 3 }),
  ];
  if (lock.doorsense) {
    features.push(feature(ids, FEATURE_KEYS.DOOR, language, C.OPENING_SENSOR, T.SENSOR.BINARY));
  }
  features.push(
    feature(ids, FEATURE_KEYS.BATTERY, language, C.BATTERY, T.BATTERY.INTEGER, {
      unit: U.PERCENT,
      max: 100,
    }),
  );
  if (lock.keypad) {
    features.push(
      feature(ids, FEATURE_KEYS.KEYPAD_BATTERY_LOW, language, C.BATTERY_LOW, T.BATTERY_LOW.BINARY),
    );
  }
  features.push(
    feature(ids, FEATURE_KEYS.ONLINE, language, C.INPUT, T.INPUT.BINARY),
    // min/max are NOT NULL in Gladys, text features included.
    feature(ids, FEATURE_KEYS.LAST_USER, language, C.TEXT, T.TEXT.TEXT, { max: 0 }),
    feature(ids, FEATURE_KEYS.LAST_METHOD, language, C.TEXT, T.TEXT.TEXT, { max: 0 }),
  );
  return {
    name: lock.name || pick(DEVICE_NAMES, language).lock,
    external_id: ids.device,
    model: lock.model ? `${brandName} ${lock.model}` : brandName,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features,
  };
}

/**
 * The feature values of a lock, in the publishStates format. A value the
 * cloud does not know (yet) is left out rather than invented.
 */
export function lockStates(gladys, lock, language) {
  const ids = lockIds(gladys, lock.id);
  const states = [];
  const put = (key, state) => states.push({ device_feature_external_id: ids.feature(key), state });
  // A text/text state is never empty: Gladys ignores an empty text.
  const putText = (key, text) => {
    if (typeof text === 'string' && text.trim() !== '') {
      states.push({ device_feature_external_id: ids.feature(key), text: text.slice(0, 100) });
    }
  };
  if (lock.state in LOCK_STATE_VALUES) put(FEATURE_KEYS.LOCK_STATE, LOCK_STATE_VALUES[lock.state]);
  if (lock.doorsense && lock.door) {
    put(FEATURE_KEYS.DOOR, lock.door === 'open' ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED);
  }
  if (Number.isFinite(lock.battery)) put(FEATURE_KEYS.BATTERY, lock.battery);
  if (lock.keypad) put(FEATURE_KEYS.KEYPAD_BATTERY_LOW, keypadLow(lock.keypad) ? 1 : 0);
  put(FEATURE_KEYS.ONLINE, lock.online ? 1 : 0);
  putText(FEATURE_KEYS.LAST_USER, lock.lastUser);
  if (lock.lastMethod)
    putText(FEATURE_KEYS.LAST_METHOD, pick(METHOD_NAMES, language)[lock.lastMethod]);
  return states;
}
