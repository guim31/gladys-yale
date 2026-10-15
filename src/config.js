// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// The password and the application key are `secret` fields: Gladys never
// sends them back to the browser. The token the sign-in gives lives in /data
// (src/store.js), never in the configuration.
// -----------------------------------------------------------------------------

import { BRAND_KEYS } from './yale/brands.js';
import { LOGIN_METHODS } from './yale/client.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two reads of the locks. The real-time stream brings the
// operations as they happen; the reads catch what it missed, the batteries
// and the bridge. While the stream is up, the reads slow down to
// STREAM_REFRESH_MS. Values stored in the configuration: never change one.
export const REFRESH_INTERVALS = ['1', '5', '15', '30'];

export const STREAM_REFRESH_MS = 30 * 60_000;

export const DEFAULT_CONFIG = {
  brand: 'yale_home',
  login_method: 'email',
  allow_unlock: false,
  refresh_interval: '5',
  language: 'fr',
};

const pickOption = (value, options, fallback) =>
  options.includes(String(value ?? '')) ? String(value) : fallback;

// A boolean field may arrive as a string from older form engines.
const flag = (value, fallback) =>
  value === undefined || value === null || value === ''
    ? fallback
    : value === true || value === 'true';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** "+33 6 12 34 56 78" → "+33612345678"; an address is kept as typed, trimmed. */
export function normalizeUsername(value, method) {
  const raw = text(value);
  return method === 'phone' ? raw.replace(/[\s().-]/g, '') : raw;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const loginMethod = pickOption(source.login_method, LOGIN_METHODS, DEFAULT_CONFIG.login_method);
  return {
    brand: pickOption(source.brand, BRAND_KEYS, DEFAULT_CONFIG.brand),
    loginMethod,
    username: normalizeUsername(source.username, loginMethod),
    password: typeof source.password === 'string' ? source.password : '',
    apiKey: text(source.api_key),
    allowUnlock: flag(source.allow_unlock, DEFAULT_CONFIG.allow_unlock),
    refreshMs:
      Number(
        pickOption(source.refresh_interval, REFRESH_INTERVALS, DEFAULT_CONFIG.refresh_interval),
      ) * 60_000,
    language: pickOption(source.language, LANGUAGES, DEFAULT_CONFIG.language),
  };
}

/** The values that identify the account: when one changes, the saved sign-in is dropped. */
export const accountOf = (config) =>
  JSON.stringify([config.brand, config.loginMethod, config.username.toLowerCase(), config.apiKey]);
