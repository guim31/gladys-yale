// -----------------------------------------------------------------------------
// The REST client: headers of each brand, the sign-in states, the error kinds.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRANDS, BRAND_KEYS, brandOf } from '../src/yale/brands.js';
import { ERROR_KINDS, YaleClient, jwtExpiry } from '../src/yale/client.js';
import { NetworkError } from '../src/yale/http.js';
import { CODE, EMAIL, FakeCloud, PASSWORD, makeToken } from './helpers/fakeCloud.js';

const INSTALL = '11111111-2222-3333-4444-555555555555';

function recorder(answer) {
  const calls = [];
  const request = async (call) => {
    calls.push(call);
    return typeof answer === 'function' ? answer(call) : answer;
  };
  return { calls, request };
}

test('the three brands and their headers', () => {
  assert.deepEqual(BRAND_KEYS, ['yale_home', 'yale_access', 'august']);
  assert.equal(brandOf('nope'), BRANDS.yale_home);
  const { calls, request } = recorder({ status: 200, headers: {}, body: '{}' });
  const home = new YaleClient({ brand: 'yale_home', request, getToken: () => 'T' });
  const august = new YaleClient({ brand: 'august', request, getToken: () => 'T' });
  return Promise.all([home.user(), august.user()]).then(() => {
    assert.equal(calls[0].url, 'https://api.aaecosystem.com/users/me');
    assert.equal(calls[0].headers['x-api-key'], BRANDS.yale_home.apiKey);
    assert.equal(calls[0].headers['x-branding'], 'yale');
    assert.equal(calls[0].headers['x-access-token'], 'T');
    assert.equal(calls[1].url, 'https://api-production.august.com/users/me');
    assert.equal(calls[1].headers['x-august-api-key'], BRANDS.august.apiKey);
    assert.equal(calls[1].headers['x-august-branding'], 'august');
    assert.equal(calls[1].headers['x-august-access-token'], 'T');
    assert.equal(calls[1].headers['Accept-Version'], '0.0.1');
  });
});

test('another application key replaces the public one', async () => {
  const { calls, request } = recorder({ status: 200, headers: {}, body: '[]' });
  await new YaleClient({ brand: 'yale_access', apiKey: 'partner-key', request }).houseActivities(
    'h1',
    5,
  );
  assert.equal(calls[0].headers['x-august-api-key'], 'partner-key');
  assert.equal(calls[0].headers['x-august-branding'], 'yale');
  assert.equal(calls[0].headers['Accept-Version'], '4.0.0');
  assert.match(calls[0].url, /\/houses\/h1\/activities\?limit=5$/);
});

test('sign-in: a new installation needs a code, then it is authenticated', async () => {
  const cloud = new FakeCloud();
  const client = new YaleClient({ brand: 'yale_home', request: cloud.request });
  const login = { installId: INSTALL, method: 'email', username: EMAIL, password: PASSWORD };
  const first = await client.startSession(login);
  assert.equal(first.state, 'needs_code');
  assert.ok(first.expiresAt > Date.now());
  await client.sendCode({ token: first.token, method: 'email', username: EMAIL });
  assert.deepEqual(cloud.requests.at(-1).json, { value: EMAIL });
  await assert.rejects(
    client.validateCode({ token: first.token, method: 'email', username: EMAIL, code: '000000' }),
    (err) => err.kind === ERROR_KINDS.BAD_CODE,
  );
  await client.validateCode({ token: first.token, method: 'email', username: EMAIL, code: CODE });
  assert.deepEqual(cloud.requests.at(-1).json, { email: EMAIL, code: CODE });
  const second = await client.startSession(login);
  assert.equal(second.state, 'authenticated');
});

test('a phone sign-in sends the SMS hash like the app', async () => {
  const { calls, request } = recorder({ status: 200, headers: {}, body: '' });
  await new YaleClient({ request }).sendCode({
    token: 't',
    method: 'phone',
    username: '+33612345678',
  });
  assert.match(calls[0].url, /\/validation\/phone$/);
  assert.deepEqual(calls[0].json, { smsHashString: 'anY0ZsRmXw+', value: '+33612345678' });
});

test('sign-in errors: wrong password, refused key, answer without token', async () => {
  const cloud = new FakeCloud();
  const client = new YaleClient({ request: cloud.request });
  const login = { installId: INSTALL, method: 'email', username: EMAIL, password: 'wrong' };
  await assert.rejects(
    client.startSession(login),
    (err) => err.kind === ERROR_KINDS.BAD_CREDENTIALS,
  );
  cloud.keyRefused = true;
  await assert.rejects(
    client.startSession({ ...login, password: PASSWORD }),
    (err) => err.kind === ERROR_KINDS.APP_KEY && err.status === 403,
  );
  const vPassword = recorder({
    status: 200,
    headers: { 'x-access-token': 't' },
    body: JSON.stringify({
      expiresAt: '2030-01-01T00:00:00.000Z',
      vPassword: false,
      vInstallId: false,
    }),
  });
  await assert.rejects(
    new YaleClient({ request: vPassword.request }).startSession(login),
    (err) => err.kind === ERROR_KINDS.BAD_CREDENTIALS,
  );
  const noToken = recorder({ status: 200, headers: {}, body: '{}' });
  await assert.rejects(
    new YaleClient({ request: noToken.request }).startSession(login),
    (err) => err.kind === ERROR_KINDS.UNEXPECTED,
  );
});

test('the error kinds of the token calls and of the bridge', async () => {
  const cases = [
    [401, ERROR_KINDS.AUTH],
    [403, ERROR_KINDS.AUTH],
    [408, ERROR_KINDS.TIMEOUT],
    [422, ERROR_KINDS.BRIDGE_OFFLINE],
    [423, ERROR_KINDS.BRIDGE_BUSY],
    [429, ERROR_KINDS.RATE_LIMIT],
    [502, ERROR_KINDS.SERVER],
    [404, ERROR_KINDS.UNEXPECTED],
  ];
  for (const [status, kind] of cases) {
    const { request } = recorder({ status, headers: {}, body: '' });
    await assert.rejects(
      new YaleClient({ request }).operate('L', 'lock'),
      (err) => err.kind === kind,
    );
  }
  const offline = new YaleClient({
    request: async () => {
      throw new NetworkError('ENOTFOUND');
    },
  });
  await assert.rejects(
    offline.locks(),
    (err) => err.kind === ERROR_KINDS.NETWORK && err.message === 'network: ENOTFOUND',
  );
  const slow = new YaleClient({
    request: async () => {
      throw new NetworkError('TIMEOUT');
    },
  });
  await assert.rejects(slow.locks(), (err) => err.kind === ERROR_KINDS.TIMEOUT);
});

test('commands are the synchronous remote operations, with a long timeout', async () => {
  const { calls, request } = recorder({
    status: 200,
    headers: {},
    body: '{"status":"kAugLockState_Locked"}',
  });
  const answer = await new YaleClient({ request }).operate('ABC', 'lock');
  assert.equal(answer.status, 'kAugLockState_Locked');
  assert.equal(calls[0].method, 'PUT');
  assert.match(calls[0].url, /\/remoteoperate\/ABC\/lock$/);
  assert.ok(calls[0].timeoutMs >= 60_000);
});

test('the renewal reads the new token in the answer headers', async () => {
  const exp = Date.UTC(2027, 0, 1);
  const fresh = makeToken(9, exp);
  const { request } = recorder({
    status: 200,
    headers: { 'x-august-access-token': fresh },
    body: '[]',
  });
  const renewed = await new YaleClient({ request, getToken: () => 'old' }).renewToken();
  assert.equal(renewed.token, fresh);
  assert.equal(renewed.expiresAt, exp);
  assert.equal(jwtExpiry('not a jwt'), null);
});
