// -----------------------------------------------------------------------------
// A fake Yale Home / August cloud behind the HTTP seam of the integration
// (src/yale/http.js `request`). It plays the sign-in (session, code, renewal),
// the reads (user, locks, details, house activities), the commands and the
// PubNub long poll, with the real answers of test/fixtures/yale as data.
//
// Tests drive it: `cloud.online = false`, `cloud.keyRefused = true`,
// `cloud.addActivity(...)`, `cloud.publish(channel, message)`…
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { NetworkError } from '../../src/yale/http.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/yale/${name}`, import.meta.url), 'utf8'));

export const EMAIL = 'owner@example.com';
export const PASSWORD = 'correct horse battery staple';
export const CODE = '123456';
export const USER_ID = 'cccca94e-373e-aaaa-bbbb-333396827777';

// The three locks of the account, from the fixtures:
//   FRONT  lock.keypad.json    keypad, DoorSense (closed), bridge, users
//   BACK   lock.doorsense.json DoorSense (open), Wi-Fi bridge online
//   FLAT   lock.unlatch.json   Linus L2 (Yale Home), no DoorSense
export const FRONT = 'A6697750D607098BAE8D6BAA11EF8063';
export const BACK = 'B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0';
export const FLAT = '68895DD075A1444FAD4C00B273EEEF28';
export const HOUSE = '000000000000';
export const FLAT_HOUSE = 'a550ffff-a111-4e70-b18f-a70121223b92';

/** A JWT-shaped token (the client only reads its expiry). */
export function makeToken(serial, expMs) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ exp: Math.floor(expMs / 1000), n: serial })}.sig${serial}`;
}

function lockDetails() {
  const front = fixture('lock.keypad.json');
  const back = { ...fixture('lock.doorsense.json'), LockID: BACK, HouseID: HOUSE };
  back.LockName = 'Back Door';
  back.pubsubChannel = 'channel-back';
  const flat = fixture('lock.unlatch.json');
  return { [FRONT]: front, [BACK]: back, [FLAT]: flat };
}

export class FakeCloud {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.online = true;
    this.pubnubDown = false;
    this.pubnubRequests = 0;
    this.keyRefused = false;
    this.password = PASSWORD;
    this.validated = new Set();
    this.codes = new Map(); // pending token -> install id
    this.tokens = new Map(); // valid token -> install id
    this.pendingTokens = new Map(); // token -> install id
    this.serial = 0;
    this.details = lockDetails();
    this.guestLocks = {
      GUEST0000000000000000000000000000: {
        LockName: 'Neighbour',
        UserType: 'user',
        HouseID: 'other-house',
      },
    };
    this.activities = { [HOUSE]: [], [FLAT_HOUSE]: [] };
    this.requests = [];
    this.statusOverride = null; // { path: RegExp, status }
    this.operationAnswer = null;
    this.subscribers = [];
    this.pubnubQueue = [];
    this.pubnubTimetoken = 17000000000000000n;
    this.request = this.request.bind(this);
  }

  /** Every secret the cloud gave or received: none may reach the logs. */
  secrets() {
    return [
      PASSWORD,
      EMAIL,
      ...this.tokens.keys(),
      ...this.pendingTokens.keys(),
      'd9984f29',
      '6e2a2093',
    ];
  }

  newToken() {
    this.serial += 1;
    return makeToken(this.serial, this.now() + 120 * 24 * 3600_000);
  }

  expireTokens() {
    this.tokens.clear();
  }

  lock(id) {
    return this.details[id];
  }

  /** Adds an activity (a fixture, re-targeted) to the feed of a house. */
  addActivity(houseId, activity) {
    this.activities[houseId].unshift(activity);
  }

  // --- PubNub ------------------------------------------------------------------------

  publish(channel, message) {
    this.pubnubTimetoken += 10_000_000n;
    this.pubnubQueue.push({ c: channel, d: message, p: { t: String(this.pubnubTimetoken) } });
    const waiting = this.subscribers.splice(0);
    for (const resolve of waiting) resolve();
  }

  async pubnub({ url, signal }) {
    const query = new URL(url).searchParams;
    this.pubnubRequests += 1;
    if (!this.online || this.pubnubDown) throw new NetworkError('ENOTFOUND');
    if (query.get('tt') === '0') {
      return this.json(200, { t: { t: String(this.pubnubTimetoken), r: 12 }, m: [] });
    }
    if (this.pubnubQueue.length === 0) {
      await new Promise((resolve, reject) => {
        this.subscribers.push(resolve);
        signal?.addEventListener('abort', () => reject(new NetworkError('ABORTED')), {
          once: true,
        });
      });
    }
    const messages = this.pubnubQueue.splice(0);
    return this.json(200, { t: { t: String(this.pubnubTimetoken), r: 12 }, m: messages });
  }

  // --- HTTP --------------------------------------------------------------------------

  json(status, body, headers = {}) {
    return {
      status,
      headers,
      body: body === undefined ? '' : JSON.stringify(body),
    };
  }

  async request({ method = 'GET', url, headers = {}, json, signal }) {
    const parsed = new URL(url);
    if (parsed.hostname === 'ps.pndsn.com') return this.pubnub({ url, signal });
    this.requests.push({ method, path: `${parsed.pathname}${parsed.search}`, headers, json });
    if (!this.online) throw new NetworkError('ENOTFOUND');
    const path = parsed.pathname;
    if (this.statusOverride && this.statusOverride.path.test(path)) {
      return this.json(this.statusOverride.status, { message: 'overridden' });
    }
    const apiKey = headers['x-api-key'] ?? headers['x-august-api-key'];
    if (!apiKey) return this.json(401, { message: 'no key' });
    if (path === '/session' && method === 'POST') return this.session(json, apiKey);
    if (this.keyRefused) return this.json(403, { message: 'Forbidden' });
    const token = headers['x-access-token'] ?? headers['x-august-access-token'];
    const match = (pattern) => path.match(pattern);
    if (method === 'POST' && match(/^\/validation\/(email|phone)$/)) {
      if (!this.pendingTokens.has(token)) return this.json(401, {});
      this.codes.set(token, this.pendingTokens.get(token));
      return this.json(200, {});
    }
    if (method === 'POST' && match(/^\/validate\/(email|phone)$/)) {
      if (!this.codes.has(token)) return this.json(401, {});
      if (json?.code !== CODE) return this.json(400, { message: 'invalid code' });
      this.validated.add(this.codes.get(token));
      this.codes.delete(token);
      return this.json(200, {});
    }
    if (!this.tokens.has(token)) return this.json(401, { message: 'Unauthorized' });
    if (path === '/users/me') return this.json(200, { UserID: USER_ID, FirstName: 'Foo' });
    if (path === '/users/houses/mine') {
      const fresh = this.newToken();
      this.tokens.set(fresh, this.tokens.get(token));
      return this.json(200, [{ HouseID: HOUSE }], { 'x-august-access-token': fresh });
    }
    if (path === '/users/locks/mine') {
      const mine = Object.fromEntries(
        Object.values(this.details).map((lock) => [
          lock.LockID,
          { LockName: lock.LockName, UserType: 'superuser', HouseID: lock.HouseID },
        ]),
      );
      return this.json(200, { ...mine, ...this.guestLocks });
    }
    let found = match(/^\/locks\/([^/]+)$/);
    if (found && method === 'GET') {
      const lock = this.details[decodeURIComponent(found[1])];
      return lock ? this.json(200, lock) : this.json(404, {});
    }
    found = match(/^\/houses\/([^/]+)\/activities$/);
    if (found) {
      const limit = Number(parsed.searchParams.get('limit') ?? 8);
      return this.json(200, (this.activities[decodeURIComponent(found[1])] ?? []).slice(0, limit));
    }
    found = match(/^\/remoteoperate\/([^/]+)\/(lock|unlock)$/);
    if (found && method === 'PUT') return this.operate(decodeURIComponent(found[1]), found[2]);
    return this.json(404, { message: `unknown ${method} ${path}` });
  }

  session(json, apiKey) {
    if (
      this.keyRefused ||
      ![
        '6e2a2093-6118-42c5-8a41-e1fd25dce7a1',
        'd9984f29-07a6-816e-e1c9-44ec9d1be431',
        'partner-key',
      ].includes(apiKey)
    ) {
      return this.json(403, { message: 'Forbidden' });
    }
    const [method, ...rest] = String(json?.identifier ?? '').split(':');
    if (
      !['email', 'phone'].includes(method) ||
      rest.join(':') !== EMAIL ||
      json.password !== this.password
    ) {
      return this.json(401, { message: 'Unauthorized' });
    }
    const token = this.newToken();
    const validated = this.validated.has(json.installId);
    if (validated) this.tokens.set(token, json.installId);
    else this.pendingTokens.set(token, json.installId);
    return this.json(
      200,
      {
        expiresAt: new Date(this.now() + 120 * 24 * 3600_000).toISOString(),
        vPassword: true,
        vInstallId: validated,
      },
      { 'x-august-access-token': token },
    );
  }

  operate(lockId, operation) {
    const lock = this.details[lockId];
    if (!lock) return this.json(404, {});
    if (this.operationAnswer)
      return this.json(this.operationAnswer.status, this.operationAnswer.body ?? {});
    const status = operation === 'lock' ? 'kAugLockState_Locked' : 'kAugLockState_Unlocked';
    lock.LockStatus = {
      ...lock.LockStatus,
      status: operation === 'lock' ? 'locked' : 'unlocked',
      dateTime: new Date(this.now()).toISOString(),
    };
    const door = { open: 'kAugDoorState_Open', closed: 'kAugDoorState_Closed' }[
      lock.LockStatus.doorState
    ];
    return this.json(200, {
      status,
      ...(door ? { doorState: door } : {}),
      info: { action: operation, startTime: new Date(this.now()).toISOString() },
    });
  }
}
