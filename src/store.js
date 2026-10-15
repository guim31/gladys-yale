// -----------------------------------------------------------------------------
// Small persistence under /data (the only writable path of the container), in
// /data/yale-state.json, mode 0600:
//   - installId: the "installation" of this integration for the cloud, drawn
//     once, as the app draws one per phone. The verification code validates
//     this id: keeping it is what spares a new code at every restart;
//   - account: a digest of the brand, login and key the sign-in belongs to;
//   - token, expiresAt: the access token and its expiry;
//   - pending: the token of a sign-in waiting for its code;
//   - lowBatteries: the batteries already reported low (one event per drop,
//     not one per restart).
// Nothing of this goes to the Gladys configuration, nor to the logs.
// (Adapted from guim31/gladys-simplisafe.)
// -----------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'yale-store' });
const FILE_NAME = 'yale-state.json';

/** A digest that identifies an account without storing the address in clear. */
export const digest = (value) => createHash('sha256').update(String(value)).digest('hex');

export class Store {
  constructor(directory = process.env.YALE_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.data = {};
    this.pending = null;
    this.writing = null;
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      this.data = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      this.data = {};
    }
    if (typeof this.data.installId !== 'string' || !/^[0-9a-f-]{36}$/i.test(this.data.installId)) {
      this.data.installId = randomUUID();
      this.save();
    }
    return this.data;
  }

  get(key) {
    return this.data[key];
  }

  /** Set several keys at once (`undefined` or `null` removes one), then write. */
  update(values) {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) {
        delete this.data[key];
      } else {
        this.data[key] = value;
      }
    }
    return this.save();
  }

  // Writes are coalesced and atomic (temporary file + rename): a crash never
  // leaves half a JSON file behind.
  save() {
    if (!this.pending) {
      this.pending = (this.writing ?? Promise.resolve()).then(async () => {
        this.pending = null;
        const snapshot = JSON.stringify(this.data);
        try {
          await mkdir(this.directory, { recursive: true });
          const temporary = `${this.path}.tmp`;
          await writeFile(temporary, snapshot, { mode: 0o600 });
          await chmod(temporary, 0o600);
          await rename(temporary, this.path);
        } catch (err) {
          logger.warn(`Cannot write ${this.path}: ${err.message}`);
        }
      });
      this.writing = this.pending;
    }
    return this.pending;
  }

  /** Resolves once every write requested so far is on disk. */
  flush() {
    return this.writing ?? Promise.resolve();
  }
}
