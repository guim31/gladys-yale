// -----------------------------------------------------------------------------
// Cloud answers → plain objects, pure functions. The vocabularies are the ones
// of yalexs (MIT): lock.py (lock and door states), activity.py (actions of the
// activity feed and how a lock was operated), pubnub_activity.py (pushed
// messages), bridge.py (is the lock reachable).
// -----------------------------------------------------------------------------

// Lock states of the integration. Unlatched (Linus L2 "open") counts as
// unlocked: the bolt is out of the frame.
export const LOCK_STATES = ['locked', 'unlocked', 'locking', 'unlocking', 'jammed', 'unknown'];

const RAW_LOCK_STATES = {
  locked: [
    'lock',
    'locked',
    'secure',
    'securemode',
    'kAugLockState_Locked',
    'kAugLockState_SecureMode',
  ],
  locking: ['kAugLockState_Locking'],
  unlocked: [
    'unlock',
    'unlocked',
    'kAugLockState_Unlocked',
    'unlatched',
    'kAugLockState_Unlatched',
  ],
  unlocking: ['kAugLockState_Unlocking', 'kAugLockState_Unlatching'],
  jammed: ['kAugLockState_UnknownStaticPosition', 'FAILED_BRIDGE_ERROR_LOCK_JAMMED'],
};

const RAW_DOOR_STATES = {
  closed: ['closed', 'kAugLockDoorState_Closed', 'kAugDoorState_Closed'],
  open: ['open', 'kAugLockDoorState_Open', 'kAugDoorState_Open'],
  // DoorSense not installed or not calibrated.
  disabled: ['init', 'kAugDoorState_Init', ''],
};

/** @returns {'locked'|'unlocked'|'locking'|'unlocking'|'jammed'|'unknown'} */
export function lockStateOf(raw) {
  for (const [state, values] of Object.entries(RAW_LOCK_STATES)) {
    if (values.includes(raw)) return state;
  }
  return 'unknown';
}

/** @returns {'open'|'closed'|'disabled'|'unknown'} */
export function doorStateOf(raw) {
  if (raw === undefined || raw === null) return 'disabled';
  for (const [state, values] of Object.entries(RAW_DOOR_STATES)) {
    if (values.includes(raw)) return state;
  }
  return 'unknown';
}

// How a lock was operated: the values sent with the scene triggers and stored
// in scenes. Permanent: never rename one.
export const METHODS = [
  'remote',
  'bluetooth',
  'keypad',
  'fingerprint',
  'manual',
  'auto',
  'tag',
  'homekey',
  'other',
];

// Actions of the activity feed (yalexs activity.py), with the state they
// leave the lock in and how it was operated.
const LOCK_ACTIONS = {
  lock: ['locked', null],
  unlock: ['unlocked', null],
  unlatch: ['unlocked', null],
  locking: ['locking', null],
  unlocking: ['unlocking', null],
  unlatching: ['unlocking', null],
  jammed: ['jammed', null],
  remote_lock: ['locked', 'remote'],
  remote_unlock: ['unlocked', 'remote'],
  remote_unlatch: ['unlocked', 'remote'],
  ble_lock: ['locked', 'bluetooth'],
  ble_unlock: ['unlocked', 'bluetooth'],
  ble_unlatch: ['unlocked', 'bluetooth'],
  pin_lock: ['locked', 'keypad'],
  pin_unlock: ['unlocked', 'keypad'],
  pin_unlatch: ['unlocked', 'keypad'],
  onetouchlock: ['locked', 'keypad'],
  one_touch_lock: ['locked', 'keypad'],
  finger_lock: ['locked', 'fingerprint'],
  finger_unlock: ['unlocked', 'fingerprint'],
  manual_lock: ['locked', 'manual'],
  manual_unlock: ['unlocked', 'manual'],
  manual_unlatch: ['unlocked', 'manual'],
  auto_lock: ['locked', 'auto'],
  rf_lock: ['locked', 'tag'],
  rf_secure: ['locked', 'tag'],
  rf_unlock: ['unlocked', 'tag'],
  rf_unlatch: ['unlocked', 'tag'],
  homekey_lock: ['locked', 'homekey'],
  homekey_unlock: ['unlocked', 'homekey'],
  homekey_unlatch: ['unlocked', 'homekey'],
  linked_lock: ['locked', 'other'],
  linked_unlock: ['unlocked', 'other'],
};

const DOOR_ACTIONS = {
  dooropen: 'open',
  door_open: 'open',
  doorclosed: 'closed',
  door_close: 'closed',
};

const BRIDGE_ACTIONS = {
  associated_bridge_online: true,
  associated_bridge_offline: false,
};

// "Unknown User" / "deleted": the feed's placeholder for a removed account.
function userName(user) {
  if (!user || typeof user !== 'object') return null;
  if (user.UserID === 'deleted' || user.UserName === 'deleteduser') return null;
  const name = [user.FirstName, user.LastName]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .join(' ')
    .trim();
  return name || null;
}

/** The flags of an activity (`info.remote`, `info.keypad`…) when the action says nothing. */
function methodOfFlags(info, userId) {
  if (info.keypad === true) return 'keypad';
  if (info.remote === true) return 'remote';
  if (info.manual === true) return 'manual';
  if (info.tag === true) return 'tag';
  // A phone operating the lock over Bluetooth signs it (yalexs fixture
  // bluetooth_lock_activity: plain "lock", with mechanical/crypto results).
  if (info.crypto === 'success') return 'bluetooth';
  if (userId === 'automaticrelock') return 'auto';
  if (typeof userId === 'string' && userId.startsWith('manual')) return 'manual';
  return 'other';
}

const percent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.max(0, Math.min(100, Math.round(number * 100)));
};

const time = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// --- Locks ------------------------------------------------------------------

// Lock types yalexs names (lock.py); the others go by their SKU.
const TYPE_NAMES = { 7: 'Doorman', 10: 'Doorman', 17: 'Linus L2' };

/** "AUG-SL02-M02-S02", "Linus L2"…, or null. */
function modelOf(data) {
  const sku = typeof data.skuNumber === 'string' ? data.skuNumber.trim() : '';
  if (sku && sku.toUpperCase() !== 'NONE') return sku;
  return TYPE_NAMES[data.Type] ?? null;
}

/**
 * /users/locks/mine → the locks this account can operate. Like Home Assistant,
 * only the locks where the account is an owner ("superuser"): a guest account
 * cannot read their details nor operate them remotely.
 */
export function parseLocks(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  return Object.entries(json)
    .filter(([, lock]) => lock && typeof lock === 'object')
    .map(([id, lock]) => ({
      id,
      name: typeof lock.LockName === 'string' && lock.LockName.trim() ? lock.LockName : null,
      houseId: lock.HouseID ?? null,
      operable: lock.UserType === 'superuser',
    }));
}

/** Is the lock reachable from the cloud? (yalexs LockDetail.bridge_is_online) */
function bridgeOnline(bridge) {
  if (!bridge || typeof bridge !== 'object') return false;
  if (bridge.status && typeof bridge.status === 'object') {
    return bridge.status.current === 'online';
  }
  // An older bridge that reports no status.
  return bridge.operative === true;
}

/** /locks/{id} → the lock. */
export function parseLockDetail(json) {
  const data = json && typeof json === 'object' ? json : {};
  const status = data.LockStatus && typeof data.LockStatus === 'object' ? data.LockStatus : {};
  const door = doorStateOf(status.doorState);
  const users = {};
  for (const [id, user] of Object.entries(data.users ?? {})) {
    const name = userName(user);
    if (name) users[id] = name;
  }
  const keypad =
    data.keypad && typeof data.keypad === 'object'
      ? {
          batteryLevel:
            typeof data.keypad.batteryLevel === 'string' ? data.keypad.batteryLevel : null,
        }
      : null;
  return {
    id: data.LockID ?? null,
    name: typeof data.LockName === 'string' && data.LockName.trim() ? data.LockName : null,
    houseId: data.HouseID ?? null,
    serial: data.SerialNumber ?? null,
    model: modelOf(data),
    firmware: data.currentFirmwareVersion ?? null,
    battery: percent(data.battery),
    // Newer answers (Yale Home) carry the warning the app shows.
    batteryWarning:
      typeof data.batteryInfo?.warningState === 'string' &&
      !/none/i.test(data.batteryInfo.warningState),
    state: lockStateOf(status.status),
    stateAt: time(status.dateTime),
    // DoorSense is there when the state says so, even if it is not known now.
    doorsense: 'doorState' in status && door !== 'disabled',
    door: door === 'open' || door === 'closed' ? door : null,
    online: bridgeOnline(data.Bridge),
    hasBridge: Boolean(data.Bridge),
    keypad,
    pubsubChannel: typeof data.pubsubChannel === 'string' ? data.pubsubChannel : null,
    users,
  };
}

/** Is the keypad battery low? ("Low", "Critical"…, as the app shows it.) */
export const keypadLow = (keypad) =>
  Boolean(keypad?.batteryLevel) && /low|critical|replace/i.test(keypad.batteryLevel);

// --- Activities ---------------------------------------------------------------

/**
 * One entry of /houses/{id}/activities → { id, lockId, at, kind, … } or null
 * for what the integration does not follow (doorbells, unknown actions).
 *   kind 'lock':   state, method, user (a display name or null)
 *   kind 'door':   door ('open' | 'closed')
 *   kind 'bridge': online
 */
export function parseActivity(raw) {
  if (!raw || typeof raw !== 'object' || raw.deviceType !== 'lock') return null;
  const action = raw.action;
  const at = time(raw.dateTime ?? raw.timestamp);
  const lockId = raw.deviceID ?? null;
  if (!lockId || at === null) return null;
  const id = raw.entities?.activity ?? raw.id ?? `${lockId}:${at}:${action}`;
  const base = { id: String(id), lockId, at };
  if (action in LOCK_ACTIONS) {
    const [state, actionMethod] = LOCK_ACTIONS[action];
    const user = raw.callingUser ?? raw.user ?? {};
    const info = raw.info && typeof raw.info === 'object' ? raw.info : {};
    const method = actionMethod ?? methodOfFlags(info, user.UserID);
    // Automatic and manual operations have no person behind them.
    const person = ['auto', 'manual'].includes(method) ? null : userName(user);
    return { ...base, kind: 'lock', state, method, user: person };
  }
  if (action in DOOR_ACTIONS) {
    return { ...base, kind: 'door', door: DOOR_ACTIONS[action] };
  }
  if (action in BRIDGE_ACTIONS) {
    return { ...base, kind: 'bridge', online: BRIDGE_ACTIONS[action] };
  }
  return null;
}

// --- Pushed messages ------------------------------------------------------------

/**
 * A message pushed on the lock's PubNub channel → what it says, or null.
 *   { at, state?, door?, online?, userId?, method? }
 * `at` is the time of the operation when the message has one, else the time
 * PubNub received it. A "status" answer to the app (no operation) is null,
 * like in yalexs.
 */
export function parsePushMessage(message, receivedAt) {
  if (!message || typeof message !== 'object') return null;
  const info = message.info && typeof message.info === 'object' ? message.info : {};
  if (info.action === 'status' && !message.error && message.result !== 'failed') return null;
  const operationAt = time(info.startTime) ?? time(info.context?.startDate);
  const result = { at: operationAt ?? receivedAt };
  const error = message.error && typeof message.error === 'object' ? message.error : {};
  if (error.restCode === 98 || error.name === 'ERRNO_BRIDGE_OFFLINE') {
    result.online = false;
  }
  const status = message.lockAction ?? message.status;
  if (status in BRIDGE_ACTIONS) {
    result.online = BRIDGE_ACTIONS[status];
  } else if (status !== undefined && result.online !== false) {
    const state = lockStateOf(status);
    if (state !== 'unknown') result.state = state;
  }
  const door = doorStateOf(message.doorState);
  if (door === 'open' || door === 'closed') result.door = door;
  if (result.state && ['locked', 'unlocked'].includes(result.state)) {
    const userId = typeof message.callingUserID === 'string' ? message.callingUserID : null;
    // Only an operation with its own time names its user (yalexs: otherwise
    // the user is the one of the previous operation).
    if (userId && operationAt !== null) result.userId = userId;
    if (userId === 'automaticrelock') result.method = 'auto';
    else if (userId?.startsWith('manual')) result.method = 'manual';
    else if ('remoteEvent' in message) result.method = 'remote';
  }
  return Object.keys(result).length > 1 ? result : null;
}
