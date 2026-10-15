// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the fake Yale cloud, a
// temporary /data and a manual clock, with the integration wired on top
// through registerHandlers. No timer runs unless `timers: true`: the tests
// read the cloud with `world.hub.refresh()`, push messages with
// `world.hub.onPush()` and check the doors with `world.hub.checkDoors()`.
// -----------------------------------------------------------------------------

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { accountOf, normalizeConfig } from '../../src/config.js';
import { Store, digest } from '../../src/store.js';
import { EMAIL, FakeCloud, PASSWORD } from './fakeCloud.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const BASE_CONFIG = {
  brand: 'yale_home',
  login_method: 'email',
  username: EMAIL,
  password: PASSWORD,
  allow_unlock: false,
  refresh_interval: '5',
  language: 'en',
};

export const INSTALL_ID = '0b5e7a52-6f3c-4a8e-9d43-1c2b3a4d5e6f';

/** A manual clock. */
export function createClock(start = Date.UTC(2026, 9, 15, 12, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/** Let the handlers and the fake network settle. */
export async function settle(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {boolean} [options.signedIn] a validated installation and a token in /data
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  cloud = new FakeCloud({ now: clock.now }),
  config = BASE_CONFIG,
  devices = [],
  signedIn = true,
  connect = true,
  timers = false,
  timings = {},
  pushTimings = {},
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-yale-')),
} = {}) {
  if (signedIn) {
    cloud.validated.add(INSTALL_ID);
    const token = cloud.newToken();
    cloud.tokens.set(token, INSTALL_ID);
    writeFileSync(
      join(dataDir, 'yale-state.json'),
      JSON.stringify({
        installId: INSTALL_ID,
        account: digest(accountOf(normalizeConfig(config))),
        token,
        expiresAt: clock.now() + 120 * 24 * 3600_000,
      }),
    );
  }
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: cloud.request,
    timers,
    timings: { activityDelaysMs: [5, 20], ...timings },
    pushTimings: { retryBaseMs: 5, retryMaxMs: 20, ...pushTimings },
    now: clock.now,
  });
  const world = { gladys, fake: gladys.fake, cloud, app, hub: app.hub, clock, dataDir };
  if (connect) {
    await gladys.connect();
    await app.ready;
    await settle();
  }
  return world;
}

export const lockIds = (gladys, id) => gladys.externalIds('lock', id);

export const discovered = (world, externalId) =>
  world.fake.discoveredDevices.find((device) => device.external_id === externalId);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  await settle();
}

/** An activity of the feed, from a fixture, for a lock, at a time. */
export function activityFor(fixture, lockId, at) {
  const activity = structuredClone(fixture);
  activity.deviceID = lockId;
  if ('timestamp' in activity) activity.timestamp = at;
  else activity.dateTime = at;
  if (activity.entities) activity.entities = { ...activity.entities, activity: `act-${at}` };
  else activity.id = `act-${at}`;
  return activity;
}
