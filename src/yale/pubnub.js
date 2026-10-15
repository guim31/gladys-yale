// -----------------------------------------------------------------------------
// Real-time events of the locks, over PubNub, as yalexs does (pubnub_async.py)
// — without the PubNub SDK: its subscribe protocol is one long-polled GET.
//
//   GET https://ps.pndsn.com/v2/subscribe/<subscribe key>/<channels>/0
//       ?tt=<timetoken>&tr=<region>&uuid=pn-<USER ID>
//
// The first call (tt=0) answers at once with the current timetoken; each next
// one waits up to ~5 minutes for messages published after it, then answers
// { t: { t, r }, m: [{ c: channel, d: message, p: { t } }] }. The channels are
// the `pubsubChannel` of each lock; only the subscribe key is needed (yalexs
// also sets the publish key, never used to subscribe).
//
// Events: 'up' (subscribed, again after a failure), 'down' ({ error }, once
// per failure), 'message' ({ channel, message, at }). A failure is retried
// after 5 s, doubled up to 5 minutes; the caller keeps its periodic reads
// while the stream is down.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { httpRequest, NetworkError } from './http.js';

export const PUBNUB_ORIGIN = 'https://ps.pndsn.com';

export const PUBNUB_TIMINGS = {
  // PubNub holds a subscribe request up to 280 s.
  requestTimeoutMs: 310_000,
  retryBaseMs: 5_000,
  retryMaxMs: 5 * 60_000,
};

/** PubNub timetokens are in tenths of microseconds. */
export const timetokenToMs = (timetoken) => {
  const value = Number(BigInt(String(timetoken ?? '0')) / 10_000n);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export class PushStream extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.subscribeKey
   * @param {Function} [options.request] the HTTP seam
   * @param {object} [options.timings] PUBNUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ subscribeKey, request = httpRequest, timings = {}, now = () => Date.now() }) {
    super();
    this.subscribeKey = subscribeKey;
    this.request = request;
    this.timings = { ...PUBNUB_TIMINGS, ...timings };
    this.now = now;
    this.running = false;
    this.connected = false;
    this.controller = null;
    this.retryTimer = null;
    this.failures = 0;
  }

  /**
   * @param {string[]} channels
   * @param {string} userId the account's user id (/users/me UserID)
   */
  start(channels, userId) {
    this.stop();
    if (!this.subscribeKey || channels.length === 0) return;
    this.channels = [...channels];
    this.uuid = `pn-${String(userId ?? '').toUpperCase()}`;
    this.running = true;
    this.failures = 0;
    this.loop({ t: '0', r: null });
  }

  stop() {
    this.running = false;
    this.connected = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.controller?.abort();
    this.controller = null;
  }

  url({ t, r }) {
    const channels = this.channels.map(encodeURIComponent).join(',');
    const query = new URLSearchParams({ tt: t, uuid: this.uuid });
    if (r !== null && r !== undefined) query.set('tr', String(r));
    return `${PUBNUB_ORIGIN}/v2/subscribe/${encodeURIComponent(this.subscribeKey)}/${channels}/0?${query}`;
  }

  async loop(cursor) {
    let next = cursor;
    while (this.running) {
      const controller = new AbortController();
      this.controller = controller;
      try {
        const response = await this.request({
          url: this.url(next),
          timeoutMs: this.timings.requestTimeoutMs,
          signal: controller.signal,
        });
        if (!this.running || controller.signal.aborted) return;
        if (response.status !== 200) throw new NetworkError(`HTTP ${response.status}`);
        const data = JSON.parse(response.body);
        if (!data?.t?.t) throw new NetworkError('UNEXPECTED');
        this.failures = 0;
        if (!this.connected) {
          this.connected = true;
          this.emit('up');
        }
        for (const entry of Array.isArray(data.m) ? data.m : []) {
          this.emit('message', {
            channel: entry.c,
            message: entry.d,
            at: timetokenToMs(entry.p?.t) ?? this.now(),
          });
        }
        next = { t: String(data.t.t), r: data.t.r ?? next.r };
      } catch (err) {
        if (!this.running || controller.signal.aborted) return;
        // A long poll that timed out on our side is not a failure: ask again.
        if (err?.code === 'TIMEOUT' && this.connected) continue;
        this.fail(err, next);
        return;
      }
    }
  }

  fail(error, cursor) {
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected || this.failures === 0) {
      this.emit('down', { error });
    }
    const delay = Math.min(this.timings.retryBaseMs * 2 ** this.failures, this.timings.retryMaxMs);
    this.failures += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // After a failure, start again from the timetoken we had: PubNub
      // replays what was published meanwhile (a few minutes of history).
      if (this.running) this.loop(cursor);
    }, delay);
    this.retryTimer.unref?.();
  }
}
