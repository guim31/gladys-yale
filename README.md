# Yale Home for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for **Yale** and **August** smart
locks, through the Yale Home cloud (Europe and the rest of the world) or the August / Yale Access
cloud (United States): bolt state, door (DoorSense), batteries, who operated the lock and how, in
real time, and locking from Gladys.

> **Developed without the hardware: feedback welcome.** This integration was written from the code
> and the recorded API answers of the yalexs library and of the Home Assistant `yale` integration,
> without a lock nor an account. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-yale/issues).
>
> Not affiliated with Yale, August or ASSA ABLOY. Yale, August, Linus and DoorSense are trademarks
> of their owners.

> **Important — the application key.** The Yale clouds only accept requests carrying the key of
> an application they know. This integration signs in like the apps did, with the public keys
> that the yalexs library published. Yale told users in January 2025 that Yale Home now accepts
> partner keys only, and the yalexs README reports the same for August; Home Assistant has since
> moved to an OAuth account linking reserved to it. If the cloud refuses the key, the integration
> says so in its status ("the cloud refused the application key, not your account") and stops
> there. A user holding a key issued by Yale can type it in the configuration. See
> [`scripts/probe.mjs`](scripts/probe.mjs) to check the keys from a machine with network access.

## Features

- **One device per lock** of the account: lock state (unlocked, locked, moving, jammed), door
  (DoorSense: open or closed), battery level, keypad battery low, online (the cloud reaches the
  lock through its bridge), last user and last method (app remote or Bluetooth, keypad,
  fingerprint, by hand, automatic, key tag, Home Key).
- **Locking** from the dashboard widget, a scene action or an action of the configuration.
  **Unlocking is off by default**: an option, with a warning, then from the widget (after a
  confirmation) and the scenes only. Nothing is ever a switch: every feature is read only, no voice
  command nor "turn everything off" scene can open the door.
- **Real time**: the PubNub channel of each lock, like the app, then the activity feed for who and
  how; the integration also reads the cloud on its own timer (1 to 30 minutes without real time,
  every 30 minutes with it).
- **Scene triggers**: "Yale lock unlocked" (by whom and how), "Door left open" (1 minute to 1
  hour), "Yale battery low" (lock or keypad, once per drop).
- **Scene actions**: "Lock a Yale lock", "Unlock a Yale lock" (only when allowed).
- **Dashboard widget**: state, door, battery, last user, link, lock button (and unlock with
  confirmation when allowed).
- Texts in English, French, German and Spanish.

Locks targeted: the locks of the Yale Home / August apps with a bridge (Connect Bridge, August
Connect, Wi-Fi built in) — Yale Linus, Linus L2, Assure Lock 2, Conexis L2, August Smart Lock.

## Requirements

- Gladys 5.1.0 or later.
- The lock set up in the Yale Home (or August / Yale Access) app, with its bridge.
- The e-mail address (or phone number) and password of an account that owns the lock, and access
  to that mailbox or phone for a verification code, once.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-yale`.
2. In the configuration, choose the app (Yale Home, Yale Access, August), fill in the e-mail
   address (or phone number) and password, save.
3. Run the **Send the code** action, then **Enter the code** with the code received by e-mail or
   SMS.
4. Add the locks from the Discovery tab.

The complete guide, in four languages: [English](docs/en.md), [Français](docs/fr.md),
[Deutsch](docs/de.md), [Español](docs/es.md).

## Limits

- The application key, see above: the integration may be unable to sign in at all until Yale
  accepts a key again.
- Unofficial API, the one of the apps; no published quota. The integration never wakes a lock up
  to read it, pauses when the cloud asks to slow down, and reads only the changes it needs.
- Locks only: no doorbell, camera nor Yale Home alarm. No unlatch of the Linus L2.
- A guest access is not enough: the account must own the lock. A lock without bridge is offline.

## Development

```bash
npm install
npm test               # node --test, against the fake Gladys of the SDK and a fake cloud
npm run lint
npm run format:check
node scripts/probe.mjs # the real clouds, read-only (NODE_USE_ENV_PROXY=1 behind a proxy)
```

Architecture, rules and pitfalls: [`CLAUDE.md`](CLAUDE.md).

Releases go through **Actions → Release** (it bumps `package.json`, the manifest `version` and
`docker_image`, moves the `## [Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md), tags,
builds the multi-arch image to `ghcr.io` and publishes the GitHub Release). A hand-pushed
`git tag vX.Y.Z` also builds, but bumps nothing: bump `version` in `package.json` and in the
manifest (with the `docker_image` tag) and commit before tagging.

## Credits

- [yalexs](https://github.com/bdraco/yalexs) (MIT, Joe Lu, J. Nick Koston and contributors): the
  sign-in, the endpoints, the brands, the lock and door vocabularies, the activities, the PubNub
  messages, and the API answers used as test fixtures.
- The Home Assistant
  [`yale`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/yale) and
  [`august`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/august)
  integrations (Apache-2.0): what each entity reads, and recorded answers used as fixtures.
- Built on [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
  from the official template.

## License

[Apache-2.0](LICENSE)
