// -----------------------------------------------------------------------------
// REST client of the Yale Home / August cloud, read as yalexs (MIT) calls it
// (yalexs/api_common.py, api_async.py, authenticator_common.py).
//
// Sign-in (no OAuth: the password flow of the apps):
//   POST /session { installId, identifier: "email:<address>" | "phone:<+33…>",
//                   password }
//     → 200, token in the x-access-token / x-august-access-token header,
//       { expiresAt, vPassword, vInstallId }. vPassword false: wrong password;
//       vInstallId false: this installation must be validated by a code.
//   POST /validation/email|phone { value }          → sends the code
//   POST /validate/email|phone { email|phone, code } → validates it
//   then POST /session again: vInstallId is now true.
// A token lasts months; it is renewed by any authenticated GET, whose answer
// carries a new one in the same header (yalexs reads /users/houses/mine).
//
// Reads: /users/me, /users/locks/mine, /locks/{id},
// /houses/{id}/activities?limit=N (Accept-Version 4.0.0).
// Commands: PUT /remoteoperate/{id}/lock|unlock — the synchronous form, that
// answers once the lock moved (or failed) through its bridge, up to a minute.
// The status "wake-up" endpoint is never called: it wakes the lock and drains
// its batteries, yalexs rate-limits it to one call per 26 minutes.
//
// Errors carry a `kind` (ERROR_KINDS) the hub turns into a message. The
// headers and bodies are never logged: they hold the token and the password.
// -----------------------------------------------------------------------------

import { brandOf } from './brands.js';
import { httpRequest, NetworkError } from './http.js';

export const ERROR_KINDS = Object.freeze({
  NETWORK: 'network',
  // The cloud refused the application key (403 on /session): yalexs reports
  // that Yale Home and August now accept partner keys only.
  APP_KEY: 'app_key',
  BAD_CREDENTIALS: 'bad_credentials',
  BAD_CODE: 'bad_code',
  // A token call refused: the token expired or was revoked, sign in again.
  AUTH: 'auth',
  RATE_LIMIT: 'rate_limit',
  BRIDGE_OFFLINE: 'bridge_offline',
  BRIDGE_BUSY: 'bridge_busy',
  TIMEOUT: 'timeout',
  SERVER: 'server',
  UNEXPECTED: 'unexpected',
});

export class YaleError extends Error {
  constructor(kind, message, status = null) {
    super(message);
    this.name = 'YaleError';
    this.kind = kind;
    this.status = status;
  }
}

const USER_AGENT = 'August/Luna-22.17.0 (Android; SDK 31; gphone64_arm64)';
const COMMAND_TIMEOUT_MS = 65_000;

export const LOGIN_METHODS = ['email', 'phone'];

function kindOfStatus(status, { session = false } = {}) {
  if (status === 401) return session ? ERROR_KINDS.BAD_CREDENTIALS : ERROR_KINDS.AUTH;
  if (status === 403) return session ? ERROR_KINDS.APP_KEY : ERROR_KINDS.AUTH;
  if (status === 408) return ERROR_KINDS.TIMEOUT;
  if (status === 422) return ERROR_KINDS.BRIDGE_OFFLINE;
  if (status === 423) return ERROR_KINDS.BRIDGE_BUSY;
  if (status === 429) return ERROR_KINDS.RATE_LIMIT;
  if (status >= 500) return ERROR_KINDS.SERVER;
  return ERROR_KINDS.UNEXPECTED;
}

/** Expiry (ms since epoch) of a JWT, read without checking it; null if unreadable. */
export function jwtExpiry(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'),
    );
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class YaleClient {
  /**
   * @param {object} options
   * @param {string} [options.brand] a key of BRANDS
   * @param {string} [options.apiKey] replaces the brand's public application key
   * @param {Function} [options.request] the HTTP seam (src/yale/http.js)
   * @param {() => string|null} [options.getToken] the current access token
   */
  constructor({ brand, apiKey, request = httpRequest, getToken = () => null } = {}) {
    this.brand = brandOf(brand);
    this.apiKey = apiKey || this.brand.apiKey;
    this.request = request;
    this.getToken = getToken;
  }

  headers(token, version = '0.0.1') {
    const { headers } = this.brand;
    const result = {
      [headers.apiKey]: this.apiKey,
      [headers.branding]: this.brand.branding,
      'Accept-Version': version,
      'Content-Type': 'application/json; charset=UTF-8',
      'x-august-country': 'US',
      'User-Agent': USER_AGENT,
    };
    if (token) result[headers.token] = token;
    return result;
  }

  /** The access token of an answer, from either header name. */
  static tokenOf(response) {
    const headers = response.headers ?? {};
    return headers['x-access-token'] || headers['x-august-access-token'] || null;
  }

  async call(
    path,
    { method = 'GET', json, token, version, session = false, timeoutMs, signal } = {},
  ) {
    let response;
    try {
      response = await this.request({
        method,
        url: `${this.brand.baseUrl}${path}`,
        headers: this.headers(token === undefined ? this.getToken() : token, version),
        json,
        timeoutMs,
        signal,
      });
    } catch (err) {
      if (err instanceof NetworkError) {
        throw new YaleError(
          err.code === 'TIMEOUT' ? ERROR_KINDS.TIMEOUT : ERROR_KINDS.NETWORK,
          `network: ${err.code}`,
        );
      }
      throw err;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new YaleError(
        kindOfStatus(response.status, { session }),
        `HTTP ${response.status}`,
        response.status,
      );
    }
    let data = null;
    if (response.body) {
      try {
        data = JSON.parse(response.body);
      } catch {
        data = null;
      }
    }
    return { data, response };
  }

  // --- Sign-in ----------------------------------------------------------------

  /**
   * @returns {Promise<{ token: string, expiresAt: number|null,
   *   state: 'authenticated'|'needs_code' }>}
   * @throws YaleError BAD_CREDENTIALS (wrong password), APP_KEY…
   */
  async startSession({ installId, method, username, password }) {
    const { data, response } = await this.call('/session', {
      method: 'POST',
      token: null,
      session: true,
      json: { installId, identifier: `${method}:${username}`, password },
    });
    const token = YaleClient.tokenOf(response);
    if (!token || !data || typeof data !== 'object') {
      throw new YaleError(ERROR_KINDS.UNEXPECTED, 'session without a token');
    }
    if (data.vPassword === false) {
      throw new YaleError(ERROR_KINDS.BAD_CREDENTIALS, 'password refused', response.status);
    }
    const parsed = Date.parse(data.expiresAt);
    return {
      token,
      expiresAt: Number.isFinite(parsed) ? parsed : jwtExpiry(token),
      state: data.vInstallId === false ? 'needs_code' : 'authenticated',
    };
  }

  /** Sends the verification code by e-mail or SMS. */
  async sendCode({ token, method, username }) {
    const json =
      method === 'phone' ? { smsHashString: 'anY0ZsRmXw+', value: username } : { value: username };
    await this.call(`/validation/${method}`, { method: 'POST', token, json });
  }

  /** @throws YaleError BAD_CODE when the cloud refuses the code */
  async validateCode({ token, method, username, code }) {
    try {
      await this.call(`/validate/${method}`, {
        method: 'POST',
        token,
        json: { [method]: username, code: String(code) },
      });
    } catch (err) {
      if (err instanceof YaleError && [400, 401, 403, 404, 409, 422].includes(err.status)) {
        throw new YaleError(ERROR_KINDS.BAD_CODE, `code refused (HTTP ${err.status})`, err.status);
      }
      throw err;
    }
  }

  /** Renews the access token: the answer carries a fresh one. */
  async renewToken() {
    const { response } = await this.call('/users/houses/mine');
    const token = YaleClient.tokenOf(response);
    if (!token) throw new YaleError(ERROR_KINDS.UNEXPECTED, 'renewal without a token');
    return { token, expiresAt: jwtExpiry(token) };
  }

  // --- Reads ------------------------------------------------------------------

  async user() {
    return (await this.call('/users/me')).data ?? {};
  }

  async locks() {
    return (await this.call('/users/locks/mine')).data ?? {};
  }

  async lockDetail(lockId) {
    return (await this.call(`/locks/${encodeURIComponent(lockId)}`)).data ?? {};
  }

  async houseActivities(houseId, limit = 10) {
    const { data } = await this.call(
      `/houses/${encodeURIComponent(houseId)}/activities?limit=${limit}`,
      { version: '4.0.0' },
    );
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.events) ? data.events : [];
  }

  // --- Commands ---------------------------------------------------------------

  /** @param {'lock'|'unlock'} operation */
  async operate(lockId, operation) {
    const { data } = await this.call(`/remoteoperate/${encodeURIComponent(lockId)}/${operation}`, {
      method: 'PUT',
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    return data ?? {};
  }
}
