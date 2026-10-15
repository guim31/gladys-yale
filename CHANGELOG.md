# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Yale and August smart locks over the Yale Home cloud (Europe and the rest of
  the world) or the August / Yale Access cloud (United States), signed in with
  the e-mail address (or phone number) and password of the app, and a
  verification code asked once ("Send the code", "Enter the code").
- One device per lock: lock state (unlocked, locked, moving, jammed), door
  (DoorSense), battery, keypad battery low, online, last user and last method
  (app, Bluetooth, keypad, fingerprint, by hand, automatic, key tag, Home Key).
- Locking from the dashboard widget, a scene action or the configuration.
  Unlocking is off by default; once allowed, from the widget (with a
  confirmation) and the scenes only. No feature is writable: no voice command
  nor switch can open a door.
- Real-time events over the PubNub channel of each lock, and the integration's
  own reading timer (1 to 30 minutes without real time, 30 minutes with it).
- Scene triggers "Yale lock unlocked" (by whom and how), "Door left open"
  (1 minute to 1 hour) and "Yale battery low" (lock or keypad).
- Scene actions "Lock a Yale lock" and "Unlock a Yale lock".
- The "Yale lock" dashboard widget: state, door, battery, last user, link and
  the lock button.
- A clear status when the cloud refuses the application key (Yale now accepts
  partner keys only), and an optional field for a key issued by Yale.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-yale/commits/main
