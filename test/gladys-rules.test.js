// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of yalexs and Home Assistant (test/fixtures/yale): a lock with a
// keypad and DoorSense, a lock with DoorSense open on Wi-Fi, a Linus L2
// without DoorSense, an offline lock without bridge — in every feature-name
// language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { FakeCloud } from './helpers/fakeCloud.js';
import { BASE_CONFIG, createAll, createClock, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/yale/${name}`, import.meta.url), 'utf8'));

/** The fake account, plus an offline lock without bridge. */
function cloudWithOfflineLock(clock) {
  const cloud = new FakeCloud({ now: clock.now });
  const offline = { ...fixture('lock.offline.json'), LockID: 'OFFLINE0000000000000000000000001' };
  cloud.details[offline.LockID] = offline;
  cloud.activities[offline.HouseID] = [];
  return cloud;
}

const scenarios = ['en', 'fr', 'de', 'es'];

for (const language of scenarios) {
  test(`every discovered device follows the Gladys rules (${language} names)`, async () => {
    const clock = createClock();
    const w = await createWorld({
      clock,
      cloud: cloudWithOfflineLock(clock),
      config: { ...BASE_CONFIG, language },
    });
    try {
      const devices = w.fake.discoveredDevices;
      assert.equal(devices.length, 4, 'the four fixture locks');

      const allExternalIds = new Set();
      for (const device of devices) {
        const where = device.name;
        assert.ok(device.name.length > 0 && device.name.length <= 100, `${where}: name`);
        assert.ok(!allExternalIds.has(device.external_id), `${where}: duplicate device id`);
        allExternalIds.add(device.external_id);

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!allExternalIds.has(feature.external_id), `${at}: duplicate external_id`);
          allExternalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);
        }
      }
    } finally {
      await w.app.stop();
    }
  });
}

test('nothing can open a door like a switch: every feature is read only', async () => {
  const w = await createWorld();
  try {
    for (const device of w.fake.discoveredDevices) {
      for (const feature of device.features) {
        assert.equal(feature.read_only, true, `${device.name} / ${feature.name}`);
        assert.notEqual(`${feature.category}/${feature.type}`, 'lock/binary', 'no lock toggle');
        assert.notEqual(feature.category, 'switch');
      }
    }
    // And Gladys has nothing to call: no feature accepts a value.
    const [device] = w.fake.discoveredDevices;
    const answer = await w.fake.setValue(device, device.features[0], 0);
    assert.equal(answer.success, false);
  } finally {
    await w.app.stop();
  }
});

test('the states published are values Gladys accepts', async () => {
  const clock = createClock();
  const w = await createWorld({ clock, cloud: cloudWithOfflineLock(clock) });
  try {
    await createAll(w);
    const features = new Map(
      w.fake.discoveredDevices.flatMap((d) => d.features.map((f) => [f.external_id, f])),
    );
    assert.ok(w.fake.states.length > 10);
    for (const state of w.fake.states) {
      const feature = features.get(state.device_feature_external_id);
      assert.ok(feature, `state for an unknown feature ${state.device_feature_external_id}`);
      if (feature.category === 'text') {
        assert.ok(typeof state.text === 'string' && state.text.length > 0);
      } else {
        assert.ok(
          state.state >= feature.min && state.state <= feature.max,
          `${feature.name}: ${state.state}`,
        );
      }
    }
  } finally {
    await w.app.stop();
  }
});
