// -----------------------------------------------------------------------------
// The `lock` dashboard widget: the state of one lock (bolt, door, battery,
// last operation, link) and the buttons the configuration allows.
//
// Budget of the core: 8 components, 2 texts, 1 status, 4 buttons. Here: one
// heading, one live battery tile, one status list, up to two buttons and a
// caption. The current state is marked by the check-circle icon, never by the
// `primary` style, invisible in dark mode (Gladys#3153). Unlocking only
// appears when the configuration allows it, and asks for a confirmation.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, lockIds } from './devices.js';
import { UserError, WIDGET_KEY } from './hub.js';
import { FEATURE_NAMES, MESSAGES, METHOD_NAMES, STATE_NAMES, commandDone, pick } from './texts.js';

// Texts of the widget, by language.
export const TEXT = {
  en: {
    lock: 'Lock',
    unlock: 'Unlock',
    state: 'Lock',
    door: 'Door',
    last: 'Last',
    link: 'Link',
    unlockOff: 'Unlocking from Gladys is off (configuration).',
    empty: 'Sign in to Yale from the configuration of the integration.',
  },
  fr: {
    lock: 'Verrouiller',
    unlock: 'Déverrouiller',
    state: 'Serrure',
    door: 'Porte',
    last: 'Dernier',
    link: 'Liaison',
    unlockOff: 'Déverrouillage depuis Gladys désactivé (configuration).',
    empty: 'Connectez Yale depuis la configuration de l’intégration.',
  },
  de: {
    lock: 'Verriegeln',
    unlock: 'Entriegeln',
    state: 'Schloss',
    door: 'Tür',
    last: 'Zuletzt',
    link: 'Verbindung',
    unlockOff: 'Entriegeln über Gladys ist aus (Konfiguration).',
    empty: 'Melde Yale in der Konfiguration der Integration an.',
  },
  es: {
    lock: 'Bloquear',
    unlock: 'Desbloquear',
    state: 'Cerradura',
    door: 'Puerta',
    last: 'Último',
    link: 'Conexión',
    unlockOff: 'Desbloqueo desde Gladys desactivado (configuración).',
    empty: 'Conecte Yale desde la configuración de la integración.',
  },
};

const STATE_COLORS = {
  locked: WIDGET_COLORS.SUCCESS,
  unlocked: WIDGET_COLORS.WARNING,
  locking: WIDGET_COLORS.INFO,
  unlocking: WIDGET_COLORS.INFO,
  jammed: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The widget content of a lock (exported for the tests). */
export function lockContent(hub, lock, language) {
  const t = pick(TEXT, language);
  const states = pick(STATE_NAMES, language);
  const ids = lockIds(hub.gladys, lock.id);
  const state = lock.state ?? 'unknown';
  const items = [
    { label: t.state, value: states[state] ?? states.unknown, color: STATE_COLORS[state] },
  ];
  if (lock.doorsense) {
    items.push({
      label: t.door,
      value: lock.door ? states[lock.door] : states.unknown,
      color: lock.door === 'open' ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (lock.lastMethod) {
    const method = pick(METHOD_NAMES, language)[lock.lastMethod];
    items.push({
      label: t.last,
      value: clip(lock.lastUser ? `${lock.lastUser} · ${method}` : method, 40),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  items.push({
    label: t.link,
    value: lock.online ? states.online : states.offline,
    color: lock.online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
  });

  const components = [
    { type: 'text', variant: 'heading', text: clip(lock.name ?? '', 40) || 'Yale' },
    {
      type: 'value',
      label: pick(FEATURE_NAMES, language)[FEATURE_KEYS.BATTERY],
      device_feature: ids.feature(FEATURE_KEYS.BATTERY),
    },
    { type: 'status', items },
    {
      type: 'button',
      label: t.lock,
      icon: state === 'locked' ? 'check-circle' : 'lock',
      style: 'secondary',
      action: { key: 'lock', params: { lock: ids.device } },
    },
  ];
  if (hub.config.allowUnlock) {
    components.push({
      type: 'button',
      label: t.unlock,
      icon: state === 'unlocked' ? 'check-circle' : 'unlock',
      style: 'danger',
      action: { key: 'unlock', params: { lock: ids.device }, confirm: true },
    });
  } else {
    components.push({ type: 'text', variant: 'caption', text: t.unlockOff });
  }
  return components;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(hub, { settings = {}, language = 'en' } = {}) {
      const t = pick(TEXT, language);
      let lock;
      try {
        lock = hub.locks.size > 0 ? hub.lockOf(settings.lock || null) : null;
      } catch {
        // Several locks and none chosen, or a lock gone: said in the card.
        lock = null;
      }
      if (!lock) {
        const text =
          hub.locks.size === 0
            ? t.empty
            : pick(
                hub.locks.size > 1 && !settings.lock ? MESSAGES.chooseLock : MESSAGES.unknownLock,
                language,
              );
        return { ttl_seconds: 60, components: [{ type: 'text', variant: 'body', text }] };
      }
      return { ttl_seconds: 60, components: lockContent(hub, lock, language) };
    },

    async action(hub, { actionKey, params = {}, settings = {} }) {
      if (!['lock', 'unlock'].includes(actionKey)) throw new UserError(MESSAGES.failed);
      const target = params.lock || settings.lock || null;
      const result = await hub.operate(target, actionKey, 'widget');
      return commandDone(actionKey, result.lock.name);
    },
  },
};
