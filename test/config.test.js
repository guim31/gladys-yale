// -----------------------------------------------------------------------------
// Normalization of the configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountOf, normalizeConfig, normalizeUsername } from '../src/config.js';

test('defaults for an empty configuration', () => {
  assert.deepEqual(normalizeConfig({}), {
    brand: 'yale_home',
    loginMethod: 'email',
    username: '',
    password: '',
    apiKey: '',
    allowUnlock: false,
    refreshMs: 5 * 60_000,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(null), normalizeConfig({}));
});

test('values are checked against their options', () => {
  const config = normalizeConfig({
    brand: 'august',
    login_method: 'phone',
    username: ' +33 6 12-34-56 78 ',
    password: '  spaces kept  ',
    api_key: ' key ',
    allow_unlock: 'true',
    refresh_interval: '15',
    language: 'de',
  });
  assert.equal(config.brand, 'august');
  assert.equal(config.username, '+33612345678');
  assert.equal(config.password, '  spaces kept  ', 'a password is never trimmed');
  assert.equal(config.apiKey, 'key');
  assert.equal(config.allowUnlock, true);
  assert.equal(config.refreshMs, 15 * 60_000);
  assert.equal(config.language, 'de');
  const wrong = normalizeConfig({
    brand: 'nest',
    refresh_interval: '2',
    language: 'it',
    allow_unlock: 'no',
  });
  assert.equal(wrong.brand, 'yale_home');
  assert.equal(wrong.refreshMs, 5 * 60_000);
  assert.equal(wrong.language, 'fr');
  assert.equal(wrong.allowUnlock, false);
});

test('an e-mail address is kept as typed; the account ignores its case', () => {
  assert.equal(normalizeUsername(' Name@Example.com ', 'email'), 'Name@Example.com');
  const a = normalizeConfig({ username: 'Name@Example.com', password: 'x' });
  const b = normalizeConfig({ username: 'name@example.com', password: 'y' });
  assert.equal(accountOf(a), accountOf(b), 'a new password is the same account');
  assert.notEqual(accountOf(a), accountOf({ ...a, brand: 'august' }));
});
