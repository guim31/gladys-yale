// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_INTERVALS } from '../src/config.js';
import { LEFT_OPEN_MINUTES, TRIGGERS } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { BRAND_KEYS } from '../src/yale/brands.js';
import { LOGIN_METHODS } from '../src/yale/client.js';
import { METHODS } from '../src/yale/model.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const valuesOf = (field) => field.options.map((option) => option.value);
const configField = (key) => manifest.config_schema.find((field) => field.key === key);
const trigger = (key) => manifest.scene_triggers.find((entry) => entry.key === key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('the identity of the integration', () => {
  assert.equal(manifest.name, 'Yale Home');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.equal(manifest.type, 'device');
  assert.deepEqual(manifest.categories, ['security']);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-yale:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-yale/main/cover.png',
  );
});

test('every manifest action has a handler, and every handler an action', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
  // An action applies no default and cannot fill a secret (Gladys#3154, #3155).
  for (const action of manifest.actions) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret', `action ${action.key}: secret field`);
      assert.equal(field.default, undefined, `action ${action.key}: default ignored by the core`);
    }
  }
});

test('the credentials are configuration fields, the password and the key secret', () => {
  assert.equal(configField('password').type, 'secret');
  assert.equal(configField('api_key').type, 'secret');
  assert.equal(configField('username').type, 'string');
  for (const key of ['password', 'api_key', 'username']) {
    assert.equal(configField(key).default, undefined, `${key}: no default`);
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), [4, 86, 0]));
});

test('scene triggers, scene actions and widgets require Gladys >= 5.1.0', () => {
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), manifest.gladys_version);
  // No widget button opens a form (#3168, Gladys 5.2.0): 5.1.0 is enough.
  assert.equal(manifest.gladys_version, '>=5.1.0');
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a content and an action handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
    assert.equal(typeof widget.action, 'function');
  }
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
});

test('the filters and variables of the triggers are the data the code sends', () => {
  const field = (key, name) => trigger(key).fields.find((entry) => entry.key === name);
  assert.deepEqual(valuesOf(field(TRIGGERS.UNLOCKED, 'method')), METHODS);
  assert.deepEqual(valuesOf(field(TRIGGERS.LEFT_OPEN, 'minutes')), LEFT_OPEN_MINUTES);
  assert.equal(field(TRIGGERS.LEFT_OPEN, 'minutes').required, true, 'one event per step');
  assert.deepEqual(valuesOf(field(TRIGGERS.BATTERY_LOW, 'part')), ['lock', 'keypad']);
  // The keys the code sends (src/hub.js fire): a key neither filtered nor
  // declared as a variable is dropped by the core.
  const declared = (key) =>
    [
      ...new Set([
        ...trigger(key).fields.map((entry) => entry.key),
        ...trigger(key).variables.map((entry) => entry.key),
      ]),
    ].sort();
  assert.deepEqual(declared(TRIGGERS.UNLOCKED), [
    'lock',
    'lock_name',
    'method',
    'method_label',
    'user',
  ]);
  assert.deepEqual(declared(TRIGGERS.LEFT_OPEN), ['lock', 'lock_name', 'minutes']);
  assert.deepEqual(declared(TRIGGERS.BATTERY_LOW), ['level', 'lock', 'lock_name', 'part']);
});

test('the select options of the configuration are the values the code knows', () => {
  assert.deepEqual(valuesOf(configField('brand')), BRAND_KEYS);
  assert.deepEqual(valuesOf(configField('login_method')), LOGIN_METHODS);
  assert.deepEqual(valuesOf(configField('refresh_interval')), REFRESH_INTERVALS);
  assert.deepEqual(valuesOf(configField('language')), LANGUAGES);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  // The safe choice: no unlocking from Gladys until the user says so.
  assert.equal(configField('allow_unlock').default, false);
  assert.equal(configField('language').default, 'fr');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined, `section "${section.key}": placeholder`);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
