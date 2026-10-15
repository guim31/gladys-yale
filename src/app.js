// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the hub, so index.js stays a few lines and the tests drive the
// very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { YaleHub } from './hub.js';
import { SCENE_ACTIONS } from './scenes.js';
import { Store } from './store.js';
import { INIT_FAILED, commandDone } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'yale-app' });

// Manifest actions (`actions`) and their handlers: keys are permanent.
export const ACTIONS = {
  send_code: (hub) => hub.sendCode(),
  enter_code: (hub, fields = {}) => hub.enterCode(fields.code),
  lock_now: async (hub, fields = {}) => {
    const { lock } = await hub.operate(fields.lock || null, 'lock', 'configuration');
    return commandDone('lock', lock.name);
  },
  test_connection: (hub) => hub.testConnection(),
  sign_out: (hub) => hub.signOut(),
};

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: store, request, timers, timings, pushTimings, now
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new YaleHub({
    gladys,
    store: options.store ?? new Store(),
    request: options.request,
    timers: options.timers ?? true,
    timings: options.timings,
    pushTimings: options.pushTimings,
    now: options.now,
  });

  // Resolved once the hub has started; every handler waits for it, so a
  // command arriving during the first read is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): send again what Gladys may have lost.
        await hub.resync(config);
        return;
      }
      started = true;
      await hub.start(config);
    } catch (err) {
      logger.error(`Initialization failed (${err.message})`);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.rediscover()));

  // The hub reads the cloud on its own timer (GladysAssistant/Gladys#3198);
  // this only serves a Gladys that polls anyway, never faster than the timer.
  gladys.onPoll(
    whenReady(async () => {
      await hub.poll();
    }),
  );

  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));
  gladys.onDeviceUpdated(whenReady((device) => hub.onDeviceCreated(device)));

  gladys.onConfigUpdated(whenReady((newConfig) => hub.reconfigure(normalizeConfig(newConfig))));

  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(
      key,
      whenReady((fields) => handler(hub, fields)),
    );
  }

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, { fields })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
    gladys.onWidgetAction(
      key,
      whenReady((actionKey, params, extra) => widget.action(hub, { actionKey, params, ...extra })),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
