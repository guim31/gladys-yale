// -----------------------------------------------------------------------------
// The Yale account: sign-in, the refresh timer, the reads, the real-time
// stream, the states, the scene triggers, the commands, the connection status
// and the logs.
//
// Sign-in. The password flow of the apps (src/yale/client.js): with the
// e-mail (or phone) and password of the configuration, POST /session gives a
// token; the first time, the cloud wants this installation validated by a
// code sent by e-mail or SMS — the "Send the code" then "Enter the code"
// actions. The installation id is kept in /data, so a restart, a renewal or
// an expired token signs in again without a new code. A wrong password or a
// refused application key stops the attempts until the configuration
// changes: insisting would only get the account locked.
//
// Reads. The core does not poll external devices reliably
// (GladysAssistant/Gladys#3198): the hub reads the cloud on its own timer —
// the locks, the detail of each lock (state, door, batteries, bridge), and the
// last activities of each house (who operated a lock, and how). Every
// `refresh_interval` minutes while the real-time stream is down, every 30
// minutes while it is up. The core's onPoll is a fallback that never reads
// faster than the timer. The lock is never woken up to read it (no
// "status" command): the cloud's last known state is what the app shows too.
//
// Real time. The PubNub channel of each lock (src/yale/pubnub.js) brings the
// operations and the door as they happen; each message is applied at once
// and asks for the house activities a few seconds later, to know who
// operated the lock and how (the message rarely says it).
//
// States go through publishChangedStates (only the changes, plus a heartbeat
// every 6 hours so a stable value never shows "no recent value"), and all of
// them again when a device is added (Gladys drops the states of a feature it
// does not know yet).
//
// Logs: the lifecycle at info (sign-in, stream up, a lock offline and back, a
// command); a failure that repeats is a warning once and an info line when it
// ends; everything else is debug. Never the password, a token, the e-mail
// address or the phone number, the application key, a user's name.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { STREAM_REFRESH_MS, accountOf } from './config.js';
import { buildLockDevice, lockIdOf, lockStates } from './devices.js';
import { createIssueLog } from './issues.js';
import { digest } from './store.js';
import {
  CONNECTION_TEXT,
  INIT_FAILED,
  KIND_MESSAGES,
  MESSAGES,
  METHOD_NAMES,
  connectedText,
  pick,
  signedInText,
} from './texts.js';
import { brandOf } from './yale/brands.js';
import { ERROR_KINDS, YaleClient, YaleError } from './yale/client.js';
import { httpRequest } from './yale/http.js';
import {
  keypadLow,
  parseActivity,
  parseLockDetail,
  parseLocks,
  parsePushMessage,
} from './yale/model.js';
import { PushStream } from './yale/pubnub.js';

const logger = createLogger({ name: 'yale-hub' });

// Scene trigger keys (manifest `scene_triggers`): permanent.
export const TRIGGERS = Object.freeze({
  UNLOCKED: 'door_unlocked',
  LEFT_OPEN: 'door_left_open',
  BATTERY_LOW: 'battery_low',
});

export const WIDGET_KEY = 'lock';

// Minutes after which "door left open" fires, one event per step: a scene
// picks its step in the trigger (the core filters by equality only).
// Values stored in scenes: never change one.
export const LEFT_OPEN_MINUTES = ['1', '2', '5', '10', '15', '30', '60'];

// Battery levels: below LOW a lock battery is reported once; it must climb
// back above RECOVERED to be reported again (no event on every percent).
export const BATTERY_LOW_PERCENT = 20;
const BATTERY_RECOVERED_PERCENT = 25;

export const HUB_TIMINGS = {
  // A token is renewed when it has less than this left.
  renewBeforeMs: 7 * 24 * 3600_000,
  heartbeatMs: 6 * 3600_000,
  // After a pushed message, read the house activities twice: the feed may
  // lag behind the message.
  activityDelaysMs: [4_000, 30_000],
  // An activity older than this when first seen updates the states but fires
  // no trigger: an "unlocked" scene must not run for an old event.
  triggerMaxAgeMs: 10 * 60_000,
  rateLimitBaseMs: 10 * 60_000,
  rateLimitMaxMs: 2 * 3600_000,
  activityLimit: 10,
};

export class UserError extends Error {
  /** @param {object} text multi-language message shown to the user */
  constructor(text) {
    super(text.en);
    this.name = 'UserError';
    // The SDK sends `message` back to Gladys, which shows the user's language.
    this.message = text;
    this.text = text;
  }
}

/** "…8063": a lock id in the logs. */
const mask = (id) => `…${String(id ?? '').slice(-4)}`;

export class YaleHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store src/store.js Store
   * @param {Function} [options.request] the HTTP seam
   * @param {boolean} [options.timers] run the refresh and door timers
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {object} [options.pushTimings] PUBNUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request = httpRequest, timers = true, timings, pushTimings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timers = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.pushTimings = pushTimings;
    this.now = now ?? (() => Date.now());
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    this.stream = null;
    this.streamKey = null;
    this.locks = new Map();
    this.userId = null;
    // 'not_configured' | 'needs_code' | 'code_sent' | 'connected' | an error kind
    this.status = null;
    this.blocked = null;
    this.pausedUntil = 0;
    this.pauseMs = 0;
    this.lastRefreshAt = null;
    this.refreshing = null;
    this.refreshTimer = null;
    this.doorTimer = null;
    this.activityTimers = new Set();
    this.publishedDevices = null;
    this.connectionShown = null;
    this.signedInLogged = false;
    this.streamLogged = false;
    this.stopped = false;
  }

  get brand() {
    return brandOf(this.config?.brand);
  }

  get signedIn() {
    return Boolean(this.store.get('token'));
  }

  get live() {
    return Boolean(this.stream?.connected);
  }

  // --- Lifecycle ------------------------------------------------------------------

  async start(config) {
    await this.store.load();
    await this.applyConfig(config);
    await this.refresh();
    this.schedule();
  }

  /** Gladys came back (reconnection): send again what it may have lost. */
  async resync(config) {
    this.publishedDevices = null;
    this.connectionShown = null;
    this.gladys.forgetPublishedStates?.();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    await this.applyConfig(config);
    await this.refresh();
    this.schedule();
  }

  async applyConfig(config) {
    const previous = this.config;
    this.config = config;
    const account = digest(accountOf(config));
    if (this.store.get('account') !== account) {
      // Another account, brand or key: the saved sign-in belongs to the old one.
      if (this.store.get('account') !== undefined) {
        logger.info('Account changed in the configuration: signing in again');
      }
      await this.store.update({
        account,
        token: null,
        expiresAt: null,
        pending: null,
        signedOut: null,
      });
      this.locks.clear();
      this.userId = null;
      this.publishedDevices = null;
      this.signedInLogged = false;
    }
    if (
      !previous ||
      previous.password !== config.password ||
      previous.username !== config.username ||
      previous.apiKey !== config.apiKey ||
      previous.brand !== config.brand
    ) {
      // New credentials: worth one more try, even after a refusal.
      this.blocked = null;
      this.pausedUntil = 0;
    }
    this.client = new YaleClient({
      brand: config.brand,
      apiKey: config.apiKey,
      request: this.request,
      getToken: () => this.store.get('token') ?? null,
    });
    if (previous && previous.language !== config.language) {
      // The texts (last method) follow the language.
      this.publishedDevices = null;
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    clearTimeout(this.doorTimer);
    for (const timer of this.activityTimers) clearTimeout(timer);
    this.activityTimers.clear();
    this.stream?.stop();
    await this.refreshing?.catch(() => {});
    await this.store.flush();
  }

  /** Milliseconds between two reads: slower while the stream is up. */
  periodMs() {
    const configured = this.config?.refreshMs ?? 5 * 60_000;
    return this.live ? Math.max(configured, STREAM_REFRESH_MS) : configured;
  }

  schedule() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (!this.timers || this.stopped) return;
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      try {
        await this.refresh();
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        this.schedule();
      }
    }, this.periodMs());
    this.refreshTimer.unref?.();
  }

  /** The core's onPoll: a fallback, never faster than the timer. */
  async poll() {
    if (this.lastRefreshAt !== null && this.now() - this.lastRefreshAt < this.periodMs() * 0.9) {
      return;
    }
    await this.refresh();
  }

  // --- Sign-in -------------------------------------------------------------------

  credentialsMissing() {
    return !this.config?.username || !this.config?.password;
  }

  async saveSession({ token, expiresAt }) {
    await this.store.update({ token, expiresAt, pending: null, signedOut: null });
  }

  async dropToken() {
    await this.store.update({ token: null, expiresAt: null });
    this.stream?.stop();
    this.streamKey = null;
  }

  /**
   * POST /session with the configured credentials.
   * @returns {Promise<'authenticated'|'needs_code'>}
   */
  async openSession() {
    const session = await this.client.startSession({
      installId: this.store.get('installId'),
      method: this.config.loginMethod,
      username: this.config.username,
      password: this.config.password,
    });
    if (session.state === 'authenticated') {
      await this.saveSession(session);
    } else {
      await this.store.update({ pending: session.token, token: null, expiresAt: null });
    }
    return session.state;
  }

  /**
   * A usable token, or false with this.status saying why. Renews a token
   * close to its expiry, signs in again (without a code) after an expiry.
   */
  async ensureSession() {
    if (this.credentialsMissing()) {
      this.status = 'not_configured';
      return false;
    }
    if (this.blocked) {
      this.status = this.blocked;
      return false;
    }
    if (this.store.get('signedOut') && !this.signedIn) {
      this.status = 'needs_code';
      return false;
    }
    const expiresAt = this.store.get('expiresAt');
    if (this.signedIn && Number.isFinite(expiresAt) && expiresAt <= this.now()) {
      logger.debug('Token expired: signing in again');
      await this.store.update({ token: null, expiresAt: null });
    }
    if (this.signedIn) {
      if (Number.isFinite(expiresAt) && expiresAt - this.now() < this.timings.renewBeforeMs) {
        try {
          await this.saveSession(await this.client.renewToken());
          logger.debug('Token renewed');
        } catch (err) {
          if (err.kind === ERROR_KINDS.AUTH) {
            await this.dropToken();
            return this.ensureSession();
          }
          logger.debug(`Token renewal failed (${err.message}), the current one still works`);
        }
      }
      return true;
    }
    if (this.store.get('pending')) {
      this.status = this.status === 'code_sent' ? 'code_sent' : 'needs_code';
      return false;
    }
    const state = await this.openSession();
    if (state === 'needs_code') {
      this.status = 'needs_code';
      logger.info('The Yale cloud asks for a verification code (actions of the configuration)');
      return false;
    }
    return true;
  }

  /** Action "Send the code". */
  async sendCode() {
    if (this.credentialsMissing()) throw new UserError(MESSAGES.notConfigured);
    this.blocked = null;
    await this.store.update({ signedOut: null });
    try {
      // A fresh session each time: the token of an older one may have expired
      // while the user waited.
      await this.store.update({ pending: null });
      if (!this.signedIn && (await this.openSession()) === 'authenticated') {
        await this.refresh();
        return MESSAGES.alreadySignedIn;
      }
      if (this.signedIn) return MESSAGES.alreadySignedIn;
      await this.client.sendCode({
        token: this.store.get('pending'),
        method: this.config.loginMethod,
        username: this.config.username,
      });
    } catch (err) {
      throw await this.userErrorOf(err, { session: true });
    }
    this.status = 'code_sent';
    logger.info(`Verification code requested (${this.config.loginMethod})`);
    await this.showConnection();
    return MESSAGES.codeSent;
  }

  /** Action "Enter the code". */
  async enterCode(rawCode) {
    if (this.credentialsMissing()) throw new UserError(MESSAGES.notConfigured);
    const code = String(rawCode ?? '').replace(/\s/g, '');
    const token = this.store.get('pending');
    if (!token) {
      if (this.signedIn) return MESSAGES.alreadySignedIn;
      throw new UserError(MESSAGES.noPending);
    }
    if (!/^\d{4,8}$/.test(code)) throw new UserError(MESSAGES.badCode);
    try {
      await this.client.validateCode({
        token,
        method: this.config.loginMethod,
        username: this.config.username,
        code,
      });
      await this.store.update({ pending: null });
      if ((await this.openSession()) !== 'authenticated') {
        // The cloud took the code but still wants one: start over.
        throw new UserError(MESSAGES.badCode);
      }
    } catch (err) {
      throw await this.userErrorOf(err, { session: true });
    }
    this.blocked = null;
    logger.info('Verification code accepted');
    await this.refresh();
    return signedInText(this.lockNames());
  }

  /** Action "Sign out": forgets the token and this installation (a new code next time). */
  async signOut() {
    this.stream?.stop();
    this.streamKey = null;
    await this.store.update({
      token: null,
      expiresAt: null,
      pending: null,
      installId: null,
      signedOut: true,
    });
    await this.store.load(); // draws a new installation id
    this.status = 'needs_code';
    this.signedInLogged = false;
    logger.info('Signed out from the Yale cloud');
    await this.showConnection();
    return MESSAGES.signedOut;
  }

  /** Action "Test the connection". */
  async testConnection() {
    await this.refresh();
    if (this.status !== 'connected') {
      throw new UserError(this.statusText());
    }
    return signedInText(this.lockNames());
  }

  // --- Errors ---------------------------------------------------------------------

  /** The multi-language text of the current status. */
  statusText() {
    switch (this.status) {
      case 'connected':
        return connectedText({ locks: this.locks.size, live: this.live });
      case 'not_configured':
        return CONNECTION_TEXT.notConfigured;
      case 'needs_code':
        return CONNECTION_TEXT.needsCode;
      case 'code_sent':
        return CONNECTION_TEXT.codeSent;
      case 'no_lock':
        return CONNECTION_TEXT.noLock;
      case null:
        return INIT_FAILED;
      default:
        return KIND_MESSAGES[this.status] ?? MESSAGES.failed;
    }
  }

  async showConnection() {
    const connected = this.status === 'connected';
    const text = this.statusText();
    const key = JSON.stringify([connected, text]);
    if (key === this.connectionShown) return;
    try {
      await this.gladys.setConnectionStatus(connected, text);
      this.connectionShown = key;
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  /**
   * Book-keeping of a cloud error; returns the UserError to throw to the user.
   * @param {Error} err
   * @param {{ session?: boolean }} [context]
   */
  async userErrorOf(err, { session = false } = {}) {
    if (err instanceof UserError) return err;
    if (!(err instanceof YaleError)) {
      logger.error(`Unexpected error: ${err.message}`);
      return new UserError(MESSAGES.failed);
    }
    if ([ERROR_KINDS.APP_KEY, ERROR_KINDS.BAD_CREDENTIALS].includes(err.kind)) {
      // Do not insist with the same credentials: the account would get locked.
      this.blocked = err.kind;
      this.status = err.kind;
      await this.dropToken();
      logger.warn(
        err.kind === ERROR_KINDS.APP_KEY
          ? `The ${this.brand.name} cloud refused the application key (${err.message})`
          : `The ${this.brand.name} cloud refused the credentials (${err.message})`,
      );
      await this.showConnection();
    } else if (err.kind === ERROR_KINDS.AUTH && !session) {
      await this.dropToken();
    } else if (err.kind === ERROR_KINDS.RATE_LIMIT) {
      this.pause();
    }
    return new UserError(KIND_MESSAGES[err.kind] ?? MESSAGES.failed);
  }

  pause() {
    this.pauseMs = this.pauseMs
      ? Math.min(this.pauseMs * 2, this.timings.rateLimitMaxMs)
      : this.timings.rateLimitBaseMs;
    this.pausedUntil = this.now() + this.pauseMs;
  }

  // --- Reads ----------------------------------------------------------------------

  /** One read of the cloud (single flight). Never throws. */
  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    if (this.stopped || !this.config) return;
    if (this.pausedUntil > this.now()) {
      logger.debug('Reads paused (the cloud asked to slow down)');
      return;
    }
    this.lastRefreshAt = this.now();
    try {
      if (!(await this.ensureSession())) {
        this.stream?.stop();
        this.streamKey = null;
        await this.showConnection();
        return;
      }
      try {
        await this.readAll();
      } catch (err) {
        if (err.kind !== ERROR_KINDS.AUTH) throw err;
        // The token was refused: sign in again (no code: the install is known).
        logger.debug('Token refused: signing in again');
        await this.dropToken();
        if (!(await this.ensureSession())) {
          await this.showConnection();
          return;
        }
        await this.readAll();
      }
      this.issues.ok('cloud', `The ${this.brand.name} cloud answers again`);
      this.pauseMs = 0;
      this.status = this.locks.size > 0 ? 'connected' : 'no_lock';
      if (!this.signedInLogged) {
        this.signedInLogged = true;
        logger.info(`Signed in to ${this.brand.name}: ${this.locks.size} lock(s)`);
      }
    } catch (err) {
      await this.userErrorOf(err);
      if (err instanceof YaleError && !this.blocked) {
        this.status = err.kind;
        this.issues.fail('cloud', `The ${this.brand.name} cloud cannot be read (${err.message})`);
      } else if (!(err instanceof YaleError)) {
        this.status = ERROR_KINDS.UNEXPECTED;
      }
    }
    await this.showConnection();
  }

  /** Locks, their details and the house activities, then devices, states, events. */
  async readAll() {
    if (!this.userId) {
      const user = await this.client.user();
      this.userId = typeof user.UserID === 'string' ? user.UserID : null;
    }
    const listed = parseLocks(await this.client.locks());
    const operable = listed.filter((lock) => lock.operable);
    if (operable.length < listed.length) {
      logger.debug(`${listed.length - operable.length} guest lock(s) ignored`);
    }
    const ids = new Set(operable.map((lock) => lock.id));
    for (const id of [...this.locks.keys()]) {
      if (!ids.has(id)) this.locks.delete(id);
    }
    const lowEvents = [];
    for (const listedLock of operable) {
      const detail = parseLockDetail(await this.client.lockDetail(listedLock.id));
      lowEvents.push(...this.mergeDetail(listedLock, detail));
    }
    const houses = new Set([...this.locks.values()].map((lock) => lock.houseId).filter(Boolean));
    for (const houseId of houses) {
      await this.readActivities(houseId, { publish: false });
    }
    await this.publishDevices();
    await this.publishAllStates();
    for (const event of lowEvents) await this.fire(TRIGGERS.BATTERY_LOW, event);
    this.startStream();
    this.scheduleDoorCheck();
  }

  /**
   * A fresh detail into the lock kept by the hub. The detail's state is the
   * cloud's last known one, dated: it only wins over a newer activity or
   * pushed message when it is newer itself.
   * @returns {object[]} the battery-low events to fire
   */
  mergeDetail(listed, detail) {
    const previous = this.locks.get(listed.id);
    const lock = previous ?? {
      id: listed.id,
      stateAt: null,
      doorAt: null,
      lastActivityAt: null,
      lastUser: null,
      lastMethod: null,
      doorOpenedAt: null,
      doorFired: new Set(),
      firstRead: true,
    };
    const wasOnline = previous?.online;
    Object.assign(lock, {
      name: detail.name ?? listed.name ?? lock.name ?? null,
      houseId: detail.houseId ?? listed.houseId ?? lock.houseId ?? null,
      model: detail.model,
      battery: detail.battery,
      batteryWarning: detail.batteryWarning,
      doorsense: detail.doorsense || Boolean(lock.doorsense),
      online: detail.online,
      hasBridge: detail.hasBridge,
      keypad: detail.keypad,
      pubsubChannel: detail.pubsubChannel,
      users: detail.users,
    });
    if (
      detail.state !== 'unknown' &&
      (lock.stateAt === null || (detail.stateAt ?? 0) >= lock.stateAt)
    ) {
      lock.state = detail.state;
      lock.stateAt = detail.stateAt ?? lock.stateAt;
    }
    lock.state ??= detail.state;
    if (detail.door && (lock.doorAt === null || (detail.stateAt ?? 0) >= lock.doorAt)) {
      this.setDoor(lock, detail.door, detail.stateAt ?? this.now(), { baseline: lock.firstRead });
    }
    this.locks.set(lock.id, lock);
    if (wasOnline !== undefined && wasOnline !== lock.online) {
      logger.info(`${this.label(lock)} is ${lock.online ? 'online again' : 'offline'}`);
    } else if (wasOnline === undefined && !lock.online) {
      logger.info(`${this.label(lock)} is offline (bridge or Wi-Fi)`);
    }
    return this.batteryEvents(lock);
  }

  /** "Front Door (…8063)" for the logs: the name users gave, the id masked. */
  label(lock) {
    return `${lock.name ?? 'Lock'} (${mask(lock.id)})`;
  }

  lockNames() {
    return [...this.locks.values()].map((lock) => lock.name ?? mask(lock.id));
  }

  /** Battery-low events of a lock not reported yet (kept in /data across restarts). */
  batteryEvents(lock) {
    const reported = new Set(this.store.get('lowBatteries') ?? []);
    const events = [];
    const track = (part, low, recovered, level) => {
      const key = `${lock.id}:${part}`;
      if (low && !reported.has(key)) {
        reported.add(key);
        events.push({ lock, part, level });
      } else if (recovered && reported.has(key)) {
        reported.delete(key);
      }
    };
    if (Number.isFinite(lock.battery)) {
      track(
        'lock',
        lock.battery < BATTERY_LOW_PERCENT || lock.batteryWarning,
        lock.battery >= BATTERY_RECOVERED_PERCENT && !lock.batteryWarning,
        lock.battery,
      );
    }
    if (lock.keypad?.batteryLevel) {
      const low = keypadLow(lock.keypad);
      track('keypad', low, !low, null);
    }
    const list = [...reported].sort();
    if (
      JSON.stringify(list) !== JSON.stringify([...(this.store.get('lowBatteries') ?? [])].sort())
    ) {
      this.store.update({ lowBatteries: list });
    }
    return events;
  }

  /**
   * The house activities: who operated each lock, and how; the unlock
   * triggers for the new ones. The first read only sets the starting point.
   */
  async readActivities(houseId, { publish = true } = {}) {
    const raw = await this.client.houseActivities(houseId, this.timings.activityLimit);
    const activities = raw
      .map(parseActivity)
      .filter((activity) => activity && this.locks.has(activity.lockId))
      .sort((a, b) => a.at - b.at);
    const events = [];
    for (const activity of activities) {
      const lock = this.locks.get(activity.lockId);
      if (lock.lastActivityAt !== null && activity.at <= lock.lastActivityAt) continue;
      const fresh = !lock.firstRead && this.now() - activity.at <= this.timings.triggerMaxAgeMs;
      if (activity.kind === 'lock') {
        if (lock.stateAt === null || activity.at >= lock.stateAt) {
          lock.state = activity.state;
          lock.stateAt = activity.at;
        }
        if (['locked', 'unlocked'].includes(activity.state)) {
          lock.lastMethod = activity.method;
          lock.lastUser = activity.user;
          if (activity.state === 'unlocked' && fresh) events.push({ lock, activity });
        }
      } else if (activity.kind === 'door') {
        lock.doorsense = true;
        if (lock.doorAt === null || activity.at >= lock.doorAt) {
          this.setDoor(lock, activity.door, activity.at, { baseline: lock.firstRead });
        }
      } else if (activity.kind === 'bridge' && !lock.firstRead) {
        lock.online = activity.online;
      }
    }
    for (const lock of this.locks.values()) {
      if (lock.houseId !== houseId) continue;
      const last = activities.filter((a) => a.lockId === lock.id).at(-1);
      if (last && (lock.lastActivityAt === null || last.at > lock.lastActivityAt)) {
        lock.lastActivityAt = last.at;
      }
      lock.firstRead = false;
    }
    if (publish) {
      await this.publishDevices();
      await this.publishAllStates();
      this.scheduleDoorCheck();
    }
    for (const { lock, activity } of events) {
      await this.fire(TRIGGERS.UNLOCKED, {
        lock,
        method: activity.method,
        user: activity.user,
      });
    }
  }

  /** Read the activities of a house after a pushed message (errors logged). */
  scheduleActivities(houseId) {
    if (!houseId || !this.timers) return;
    for (const delay of this.timings.activityDelaysMs) {
      const timer = setTimeout(async () => {
        this.activityTimers.delete(timer);
        if (this.stopped || !this.signedIn) return;
        try {
          await this.readActivities(houseId);
        } catch (err) {
          logger.debug(`House activities not read (${err.message})`);
        }
      }, delay);
      timer.unref?.();
      this.activityTimers.add(timer);
    }
  }

  // --- Door left open ---------------------------------------------------------------

  setDoor(lock, door, at, { baseline = false } = {}) {
    const changed = lock.door !== door;
    lock.door = door;
    lock.doorAt = at;
    if (door === 'open') {
      if (changed || lock.doorOpenedAt === null) {
        lock.doorOpenedAt = at;
        lock.doorFired = new Set();
        if (baseline) {
          // Open since before the start: no event for the steps already past.
          for (const minutes of LEFT_OPEN_MINUTES) {
            if (this.now() - at >= Number(minutes) * 60_000) lock.doorFired.add(minutes);
          }
        }
      }
    } else {
      lock.doorOpenedAt = null;
      lock.doorFired = new Set();
    }
  }

  /** Fires the "left open" steps that are due; returns how many fired. */
  async checkDoors() {
    let fired = 0;
    for (const lock of this.locks.values()) {
      if (lock.door !== 'open' || lock.doorOpenedAt === null) continue;
      for (const minutes of LEFT_OPEN_MINUTES) {
        if (lock.doorFired.has(minutes)) continue;
        if (this.now() - lock.doorOpenedAt < Number(minutes) * 60_000) break;
        lock.doorFired.add(minutes);
        fired += 1;
        await this.fire(TRIGGERS.LEFT_OPEN, { lock, minutes });
      }
    }
    this.scheduleDoorCheck();
    return fired;
  }

  scheduleDoorCheck() {
    clearTimeout(this.doorTimer);
    this.doorTimer = null;
    if (!this.timers || this.stopped) return;
    let next = Infinity;
    for (const lock of this.locks.values()) {
      if (lock.door !== 'open' || lock.doorOpenedAt === null) continue;
      const step = LEFT_OPEN_MINUTES.find((minutes) => !lock.doorFired.has(minutes));
      if (step) next = Math.min(next, lock.doorOpenedAt + Number(step) * 60_000);
    }
    if (next === Infinity) return;
    this.doorTimer = setTimeout(
      () => {
        this.doorTimer = null;
        this.checkDoors().catch((err) => logger.error(`Door check failed (${err.message})`));
      },
      Math.max(0, next - this.now()),
    );
    this.doorTimer.unref?.();
  }

  // --- Real time ----------------------------------------------------------------------

  startStream() {
    const channels = [...this.locks.values()]
      .map((lock) => lock.pubsubChannel)
      .filter(Boolean)
      .sort();
    const key = JSON.stringify([this.brand.key, this.userId, channels]);
    if (key === this.streamKey) return;
    this.streamKey = key;
    this.stream?.stop();
    if (!this.timers || !this.userId || channels.length === 0 || !this.brand.pubnubSubscribeKey) {
      return;
    }
    if (!this.stream || this.stream.subscribeKey !== this.brand.pubnubSubscribeKey) {
      this.stream?.removeAllListeners();
      this.stream = this.createStream();
    }
    this.stream.start(channels, this.userId);
  }

  createStream() {
    const stream = new PushStream({
      subscribeKey: this.brand.pubnubSubscribeKey,
      request: this.request,
      timings: this.pushTimings,
      now: this.now,
    });
    stream.on('up', () => {
      this.issues.ok('stream', 'Real-time events are back');
      if (!this.streamLogged) {
        this.streamLogged = true;
        logger.info('Real-time events connected');
      }
      this.schedule();
      this.showConnection();
    });
    stream.on('down', ({ error }) => {
      this.issues.fail(
        'stream',
        `Real-time events unavailable (${error?.code ?? error?.message ?? 'error'}), periodic reads go on`,
      );
      this.schedule();
      this.showConnection();
    });
    stream.on('message', (event) => {
      this.onPush(event).catch((err) => logger.debug(`Pushed message ignored (${err.message})`));
    });
    return stream;
  }

  /** A message pushed on a lock's channel. */
  async onPush({ channel, message, at }) {
    const lock = [...this.locks.values()].find((entry) => entry.pubsubChannel === channel);
    if (!lock) return;
    const update = parsePushMessage(message, at);
    logger.debug(
      `Pushed message for ${this.label(lock)}: ${update ? Object.keys(update) : 'none'}`,
    );
    if (!update) return;
    if (update.state && (lock.stateAt === null || update.at >= lock.stateAt)) {
      lock.state = update.state;
      lock.stateAt = update.at;
      if (update.method) lock.lastMethod = update.method;
      if (update.userId) lock.lastUser = lock.users?.[update.userId] ?? null;
    }
    if (update.door && (lock.doorAt === null || update.at >= lock.doorAt)) {
      lock.doorsense = true;
      this.setDoor(lock, update.door, update.at);
    }
    if (update.online !== undefined && update.online !== lock.online) {
      lock.online = update.online;
      logger.info(`${this.label(lock)} is ${lock.online ? 'online again' : 'offline'}`);
    }
    await this.publishDevices();
    await this.publishLockStates(lock);
    this.scheduleDoorCheck();
    if (update.state || update.door) this.scheduleActivities(lock.houseId);
  }

  // --- Gladys ---------------------------------------------------------------------------

  devices() {
    return [...this.locks.values()].map((lock) =>
      buildLockDevice(this.gladys, lock, {
        language: this.config.language,
        brandName: this.brand.name,
      }),
    );
  }

  /** Publishes the discovered devices when they changed. */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (!force && signature === this.publishedDevices) return;
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.publishedDevices = signature;
      this.issues.ok('discovery', 'Devices published again');
    } catch (err) {
      this.issues.fail('discovery', `Devices not published (${err.message})`);
    }
  }

  async rediscover() {
    await this.refresh();
    await this.publishDevices({ force: true });
  }

  async publishStates(states) {
    if (states.length === 0) return;
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeatMs,
      });
      this.issues.ok('states', 'States accepted again');
      // The widget shows texts, not live tiles: ask the core to pull it again.
      if (count > 0) this.nudgeWidget();
    } catch (err) {
      this.issues.fail('states', `States not published (${err.message})`);
    }
  }

  async publishLockStates(lock) {
    await this.publishStates(lockStates(this.gladys, lock, this.config.language));
  }

  async publishAllStates() {
    await this.publishStates(
      [...this.locks.values()].flatMap((lock) =>
        lockStates(this.gladys, lock, this.config.language),
      ),
    );
  }

  /** The user added (or updated) a device: send its states now, refresh the widget. */
  async onDeviceCreated(device) {
    const lock = this.locks.get(lockIdOf(this.gladys, device?.external_id));
    if (!lock) return;
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishLockStates(lock);
    this.nudgeWidget();
  }

  /** "Re-pull the widget now" (rate-limited by the core, dropped while disconnected). */
  nudgeWidget() {
    try {
      Promise.resolve(this.gladys.requestWidgetRefresh?.(WIDGET_KEY)).catch(() => {});
    } catch {
      // Never let a nudge break a read.
    }
  }

  /** Fires a scene trigger; the flat data the manifest declares. */
  async fire(key, { lock, ...details }) {
    const language = this.config.language;
    const data = {
      lock: this.gladys.externalIds('lock', lock.id).device,
      lock_name: lock.name ?? '',
    };
    if (key === TRIGGERS.UNLOCKED) {
      data.method = details.method;
      data.method_label = pick(METHOD_NAMES, language)[details.method];
      data.user = details.user ?? '';
    } else if (key === TRIGGERS.LEFT_OPEN) {
      data.minutes = details.minutes;
    } else if (key === TRIGGERS.BATTERY_LOW) {
      data.part = details.part;
      data.level = details.level;
    }
    try {
      await this.gladys.publishSceneEvent(key, data);
      logger.debug(`Scene trigger ${key} for ${this.label(lock)}`);
    } catch (err) {
      this.issues.fail(`trigger:${key}`, `Scene trigger ${key} refused (${err.message})`);
    }
  }

  // --- Commands ---------------------------------------------------------------------------

  /** The lock of a device external id (or the only lock when none is given). */
  lockOf(externalId) {
    if (!externalId) {
      if (this.locks.size === 1) return [...this.locks.values()][0];
      throw new UserError(MESSAGES.chooseLock);
    }
    const lock = this.locks.get(lockIdOf(this.gladys, externalId));
    if (!lock) throw new UserError(MESSAGES.unknownLock);
    return lock;
  }

  /**
   * Lock or unlock, from the widget, a scene or an action.
   * @param {string|null} externalId the device chosen (null: the only lock)
   * @param {'lock'|'unlock'} operation
   * @param {string} origin for the log line ("widget", "scene"…)
   * @returns {Promise<{ lock: object, state: string }>}
   */
  async operate(externalId, operation, origin) {
    if (operation === 'unlock' && !this.config.allowUnlock) {
      throw new UserError(MESSAGES.unlockOff);
    }
    if (!this.signedIn) {
      throw new UserError(
        this.status && this.status !== 'connected' ? this.statusText() : MESSAGES.auth,
      );
    }
    const lock = this.lockOf(externalId);
    let answer;
    try {
      answer = await this.client.operate(lock.id, operation);
    } catch (err) {
      logger.warn(`${operation} of ${this.label(lock)} from the ${origin} failed (${err.message})`);
      throw await this.userErrorOf(err);
    }
    const parsed = parsePushMessage(
      { status: answer.status, doorState: answer.doorState, info: answer.info },
      this.now(),
    );
    const state = parsed?.state ?? (operation === 'lock' ? 'locked' : 'unlocked');
    lock.state = state;
    lock.stateAt = Math.max(this.now(), lock.stateAt ?? 0);
    lock.lastMethod = 'remote';
    if (parsed?.door) this.setDoor(lock, parsed.door, this.now());
    logger.info(`${this.label(lock)} ${operation}ed from the ${origin} (${state})`);
    await this.publishLockStates(lock);
    this.scheduleDoorCheck();
    this.scheduleActivities(lock.houseId);
    if (state === 'jammed') throw new UserError(MESSAGES.jammed);
    return { lock, state };
  }
}
