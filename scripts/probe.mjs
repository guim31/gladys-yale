#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe of the real Yale Home / August clouds, with the code of the
// integration (src/yale). Read-only: it never locks nor unlocks. Nothing
// sensitive is printed: no token, no password, no address, no phone number,
// no lock id in clear (masked), only the names of the JSON keys.
//
// Without an account (default):
//
//   node scripts/probe.mjs
//
// (Node's fetch ignores HTTPS_PROXY: behind a proxy, Node 24 needs
// NODE_USE_ENV_PROXY=1.)
//
// For each brand (Yale Home, Yale Access, August):
//   1. signs in with a made-up account: the cloud must refuse the ACCOUNT
//      (401, or vPassword false). A 403 means it refuses the APPLICATION KEY:
//      the integration cannot sign in anyone with that key (yalexs README:
//      "partner keys only" since January 2025);
//   2. calls the API without a token: 401 or 403;
//   3. opens the PubNub subscription with the brand's subscribe key: 200
//      means the key is alive, 403 that it was revoked.
// The exit code is 0 when every answer is the expected refusal of a made-up
// account, 1 otherwise — the summary says which key is refused.
//
// With an account (read-only):
//
//   YALE_BRAND=yale_home YALE_LOGIN=email YALE_USERNAME=name@example.com \
//   YALE_PASSWORD_FILE=./password.txt YALE_STATE_FILE=./probe-state.json \
//   node scripts/probe.mjs
//
// The password comes from a file, never an argument (shell history). The
// state file keeps the installation id (mode 0600) so the code is asked once:
// the first run sends the code and stops; run again with YALE_CODE=123456.
// Then it lists the locks (kinds of features found), the actions of the last
// activities, and checks the PubNub subscription on the locks' channels.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { BRANDS } from '../src/yale/brands.js';
import { ERROR_KINDS, YaleClient } from '../src/yale/client.js';
import { httpRequest } from '../src/yale/http.js';
import { parseActivity, parseLockDetail, parseLocks } from '../src/yale/model.js';
import { PUBNUB_ORIGIN } from '../src/yale/pubnub.js';

const say = (line = '') => process.stdout.write(`${line}\n`);
const mask = (id) => `…${String(id ?? '').slice(-4)}`;
let failures = 0;
const check = (ok, message) => {
  say(`${ok ? 'OK  ' : 'FAIL'} ${message}`);
  if (!ok) failures += 1;
};
const summary = [];

/** Only the shape of an answer: its keys, never its values. */
const shape = (body) => {
  try {
    const data = JSON.parse(body);
    return data && typeof data === 'object'
      ? `keys [${Object.keys(data).join(', ')}]`
      : typeof data;
  } catch {
    return `${String(body ?? '').length} bytes, not JSON`;
  }
};

async function madeUpSignIn(brand) {
  // The raw answer first (status and keys), then the client's reading of it.
  const client = new YaleClient({ brand: brand.key });
  const response = await httpRequest({
    method: 'POST',
    url: `${brand.baseUrl}/session`,
    headers: client.headers(null),
    json: {
      installId: randomUUID(),
      identifier: 'email:gladys-probe@example.invalid',
      password: 'made-up-password-0123',
    },
  });
  const token = Boolean(YaleClient.tokenOf(response));
  say(
    `     ${brand.name}: POST /session → HTTP ${response.status}, ${shape(response.body)}, token header: ${token}`,
  );
  try {
    await client.startSession({
      installId: randomUUID(),
      method: 'email',
      username: 'gladys-probe@example.invalid',
      password: 'made-up-password-0123',
    });
    check(false, `${brand.name}: a made-up account was accepted`);
  } catch (err) {
    if (err.kind === ERROR_KINDS.APP_KEY) {
      summary.push(`${brand.name}: the cloud REFUSES the application key (sign-in impossible)`);
      check(false, `${brand.name}: application key refused (${err.message})`);
    } else {
      if (err.kind === ERROR_KINDS.BAD_CREDENTIALS) {
        summary.push(`${brand.name}: application key accepted, made-up account refused`);
      }
      check(
        err.kind === ERROR_KINDS.BAD_CREDENTIALS,
        `${brand.name}: made-up account refused: ${err.kind} (${err.message})`,
      );
    }
  }
}

async function noToken(brand) {
  const client = new YaleClient({ brand: brand.key, getToken: () => null });
  try {
    await client.locks();
    check(false, `${brand.name}: the locks were listed without a token`);
  } catch (err) {
    check(
      err.status === 401 || err.status === 403,
      `${brand.name}: API without a token: ${err.message}`,
    );
  }
}

async function pubnub(brand, channels = ['gladys-probe'], uuid = 'pn-GLADYS-PROBE') {
  const url = `${PUBNUB_ORIGIN}/v2/subscribe/${brand.pubnubSubscribeKey}/${channels.map(encodeURIComponent).join(',')}/0?tt=0&uuid=${uuid}`;
  const response = await httpRequest({ url, timeoutMs: 20_000 });
  const alive = response.status === 200 && /"t":\{"t":"\d+"/.test(response.body);
  summary.push(
    `${brand.name}: PubNub subscribe key ${alive ? 'alive' : `refused (HTTP ${response.status})`}`,
  );
  check(
    response.status === 200 || response.status === 403,
    `${brand.name}: PubNub subscribe → HTTP ${response.status}${alive ? ', timetoken received' : ''}`,
  );
}

async function account() {
  const brand = BRANDS[process.env.YALE_BRAND] ?? BRANDS.yale_home;
  const method = process.env.YALE_LOGIN === 'phone' ? 'phone' : 'email';
  const username = process.env.YALE_USERNAME;
  const password = (await readFile(process.env.YALE_PASSWORD_FILE, 'utf8')).replace(/\r?\n$/, '');
  const stateFile = process.env.YALE_STATE_FILE ?? './probe-state.json';
  let state = {};
  try {
    state = JSON.parse(await readFile(stateFile, 'utf8'));
  } catch {
    state = {};
  }
  state.installId ??= randomUUID();
  const save = async () => {
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    await chmod(stateFile, 0o600);
  };
  await save();
  let token = null;
  const client = new YaleClient({ brand: brand.key, getToken: () => token });
  const login = { installId: state.installId, method, username, password };
  let session = await client.startSession(login);
  if (session.state === 'needs_code') {
    if (!process.env.YALE_CODE) {
      await client.sendCode({ token: session.token, method, username });
      check(true, `${brand.name}: code sent by ${method}; run again with YALE_CODE=<code>`);
      return;
    }
    await client.validateCode({
      token: session.token,
      method,
      username,
      code: process.env.YALE_CODE,
    });
    session = await client.startSession(login);
  }
  check(
    session.state === 'authenticated',
    `${brand.name}: signed in (token expires ${new Date(session.expiresAt).toISOString().slice(0, 10)})`,
  );
  token = session.token;
  const user = await client.user();
  const listed = parseLocks(await client.locks());
  check(true, `${listed.length} lock(s), ${listed.filter((l) => l.operable).length} owned`);
  const channels = [];
  const houses = new Set();
  for (const lock of listed.filter((l) => l.operable)) {
    const detail = parseLockDetail(await client.lockDetail(lock.id));
    if (detail.pubsubChannel) channels.push(detail.pubsubChannel);
    if (detail.houseId) houses.add(detail.houseId);
    say(
      `     lock ${mask(lock.id)}: model ${detail.model ?? '?'}, state ${detail.state}, DoorSense ${detail.doorsense ? (detail.door ?? 'unknown') : 'no'}, ` +
        `battery ${detail.battery ?? '?'} %, keypad ${detail.keypad ? (detail.keypad.batteryLevel ?? '?') : 'no'}, ` +
        `bridge ${detail.hasBridge ? (detail.online ? 'online' : 'offline') : 'none'}, channel ${detail.pubsubChannel ? 'yes' : 'no'}`,
    );
  }
  for (const houseId of houses) {
    const raw = await client.houseActivities(houseId, 20);
    const actions = {};
    for (const entry of raw) actions[entry.action] = (actions[entry.action] ?? 0) + 1;
    const parsed = raw.map(parseActivity).filter(Boolean);
    say(
      `     home ${mask(houseId)}: ${raw.length} activities, ${parsed.length} understood, actions ${JSON.stringify(actions)}`,
    );
  }
  if (channels.length && user.UserID) {
    await pubnub(brand, channels, `pn-${String(user.UserID).toUpperCase()}`);
  }
}

for (const brand of Object.values(BRANDS)) {
  for (const step of [madeUpSignIn, noToken, pubnub]) {
    try {
      await step(brand);
    } catch (err) {
      check(false, `${brand.name} ${step.name}: ${err.kind ?? err.code ?? ''} ${err.message}`);
    }
  }
}
if (process.env.YALE_USERNAME && process.env.YALE_PASSWORD_FILE) {
  try {
    await account();
  } catch (err) {
    check(false, `account: ${err.kind ?? err.code ?? ''} ${err.message}`);
  }
}
say('');
for (const line of summary) say(`  - ${line}`);
say(failures === 0 ? 'Probe OK' : `Probe: ${failures} unexpected result(s)`);
process.exit(failures === 0 ? 0 : 1);
