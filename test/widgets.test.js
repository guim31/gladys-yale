// -----------------------------------------------------------------------------
// The `lock` widget: rendered exactly as sent (validateWidgetContent of the
// SDK), within the core budget, bound to features that exist, with the
// unlock button only when the configuration allows it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { MESSAGES } from '../src/texts.js';
import { BACK, FLAT, FRONT } from './helpers/fakeCloud.js';
import { BASE_CONFIG, createWorld, lockIds, settle } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings, language = 'en') {
  const answer = await w.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(answer.success, true, JSON.stringify(answer));
  return answer.data.content;
}

const featureIds = (w) =>
  new Set(w.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)));

test('the content of every lock, in every language, fits the core vocabulary', async (t) => {
  for (const allowUnlock of [false, true]) {
    const w = await world(t, { config: { ...BASE_CONFIG, allow_unlock: allowUnlock } });
    const known = featureIds(w);
    for (const id of [FRONT, BACK, FLAT]) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        const body = await content(w, { lock: lockIds(w.gladys, id).device }, language);
        assert.deepEqual(validateWidgetContent(body), [], `${id} ${language}`);
        assert.ok(body.components.length <= 8);
        assert.ok(body.components.filter((c) => c.type === 'text').length <= 2);
        for (const component of body.components) {
          if (component.device_feature) {
            assert.ok(known.has(component.device_feature), component.device_feature);
          }
        }
        const buttons = body.components.filter((c) => c.type === 'button');
        assert.deepEqual(
          buttons.map((b) => b.action.key),
          allowUnlock ? ['lock', 'unlock'] : ['lock'],
        );
        for (const button of buttons)
          assert.notEqual(button.style, 'primary', 'invisible in dark mode');
        if (allowUnlock) {
          assert.equal(buttons[1].action.confirm, true, 'unlocking asks first');
        }
      }
    }
  }
});

test('the state, the door, the last operation and the link', async (t) => {
  const w = await world(t);
  const body = await content(w, { lock: lockIds(w.gladys, BACK).device }, 'fr');
  const status = body.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Serrure', 'Verrouillée'],
      ['Porte', 'Ouverte'],
      ['Liaison', 'En ligne'],
    ],
  );
  const lock = body.components.find((c) => c.type === 'button');
  assert.equal(lock.icon, 'check-circle', 'locked: the current state is marked by the icon');
  assert.ok(body.components.some((c) => c.type === 'text' && c.variant === 'caption'));
});

test('no lock chosen: the only one, or a request to choose', async (t) => {
  const w = await world(t);
  const several = await content(w, {});
  assert.deepEqual(several.components, [
    { type: 'text', variant: 'body', text: MESSAGES.chooseLock.en },
  ]);
  const gone = await content(w, { lock: lockIds(w.gladys, 'GONE').device });
  assert.equal(gone.components[0].text, MESSAGES.unknownLock.en);
  for (const id of [BACK, FLAT]) delete w.cloud.details[id];
  await w.hub.refresh();
  const only = await content(w, {});
  assert.equal(only.components[0].text, 'Front Door Lock');
});

test('not signed in: the card says where to sign in', async (t) => {
  const w = await world(t, { signedIn: false });
  const body = await content(w, {}, 'de');
  assert.match(body.components[0].text, /Konfiguration/);
});

test('the buttons lock, and unlock only when allowed', async (t) => {
  const w = await world(t);
  const front = lockIds(w.gladys, FRONT).device;
  const locked = await w.fake.widgetAction(WIDGET_KEY, 'lock', { lock: front }, { settings: {} });
  assert.equal(locked.success, true, JSON.stringify(locked));
  const refused = await w.fake.widgetAction(
    WIDGET_KEY,
    'unlock',
    { lock: front },
    { settings: {} },
  );
  assert.deepEqual(refused.error, MESSAGES.unlockOff);
  await w.fake.configUpdated({ ...BASE_CONFIG, allow_unlock: true });
  await settle();
  const unlocked = await w.fake.widgetAction(
    WIDGET_KEY,
    'unlock',
    { lock: front },
    { settings: {} },
  );
  assert.equal(unlocked.success, true);
  assert.equal(w.hub.locks.get(FRONT).state, 'unlocked');
  const unknown = await w.fake.widgetAction(WIDGET_KEY, 'open', { lock: front }, { settings: {} });
  assert.equal(unknown.success, false);
});
