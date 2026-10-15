# Yale Home

Follow and lock your **Yale** and **August** smart locks from Gladys, through the Yale Home cloud (or
the August / Yale Access cloud in the United States): bolt state, door (DoorSense), battery, who
operated the lock and how, in real time when the cloud allows it.

**Developed without the hardware: feedback welcome.** The integration was written from the
published behaviour of the cloud (yalexs library, Home Assistant integration) and tested against
recorded answers, never against a real lock. Please report what works and what does not on
[github.com/guim31/gladys-yale/issues](https://github.com/guim31/gladys-yale/issues).

This integration is not affiliated with Yale, August or ASSA ABLOY. Yale, August, Linus and
DoorSense are trademarks of their owners.

## Overview

- One Gladys device per lock of the account: **Lock** (locked, unlocked, moving, jammed),
  **Door** (open or closed, with DoorSense), **Battery**, **Keypad battery low** (with a keypad),
  **Online** (the cloud reaches the lock), **Last user** and **Last method**.
- Lock from the dashboard widget, a scene or the configuration. Unlocking is **off by default** and
  never possible by voice nor like a switch.
- Three scene triggers: **Yale lock unlocked** (by whom and how), **Door left open**, **Yale battery
  low**.

Locks targeted: every lock of the Yale Home / August app, Yale Linus, Linus L2, Assure Lock 2, Yale
Conexis L2, August Smart Lock (3rd and 4th generation, Wi-Fi), with their bridge (Connect, Wi-Fi
built in) to be reached remotely.

## Requirements

- Gladys 5.1.0 or later.
- A lock already set up in the Yale Home (or August / Yale Access) app, with its **bridge**:
  Yale Connect Bridge, August Connect, or Wi-Fi built in. Without a bridge, the cloud cannot reach the
  lock: no remote locking, and the states only change when a phone syncs over Bluetooth.
- The e-mail address (or phone number) and password of an account that **owns** the lock (an owner,
  "superuser" in the app). A guest access is not enough.
- Access to that e-mail box or phone for the verification code, once.

## Configuration

### Sign in

1. In Gladys, **Integrations → Install from GitHub**, then open the configuration of Yale Home.
2. Choose the **App** you use: **Yale Home** (Europe and the rest of the world), **Yale Access
   (United States)** or **August (United States)**.
3. In **Sign in with**, choose e-mail address or phone number; fill in **E-mail address or phone
   number** (a phone number starts with + and the country code, e.g. +33612345678) and
   **Password**, then save.
4. The first time, the status asks for a code. At the bottom of the page, click **Send the code**:
   a code arrives by e-mail or SMS.
5. Type it in **Enter the code** and run the action. The status then shows "Connected" and the
   number of locks; the locks appear in the Discovery tab, add them to Gladys.

The code validates this installation of the integration: a restart, a new token or an expired one
need no new code. **Sign out** forgets the token and the installation; a new code is then needed.

### Settings

| Setting                         | Default   | Use                                                                                  |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| App                             | Yale Home | The cloud of your app.                                                               |
| Sign in with                    | E-mail    | E-mail address or phone number, as in the app.                                       |
| E-mail address or phone number  | —         | The identifier of the account.                                                       |
| Password                        | —         | Never shown again by Gladys; the integration keeps only the token in `/data`.        |
| Application key (advanced)      | empty     | Leave empty. Only if you hold another key issued by Yale (see Limits).               |
| Allow unlocking from Gladys     | off       | Off: lock only. On: the widget (after a confirmation) and the scenes can unlock.     |
| Reading of the locks            | 5 minutes | Pace of the reads when real-time events are unavailable; every 30 minutes otherwise. |
| Language of the names and texts | Français  | Names of the features (kept by Gladys once added), last method, trigger texts.       |

## Devices

Each lock of the account becomes a device named like in the app, model "Yale Home" (or August)
followed by the model of the lock. Every feature is read only: nothing can open the door like a
switch, nor through a voice command or a "turn everything off" scene.

### Features

| Feature            | Type in Gladys       | Values                                                        |
| ------------------ | -------------------- | ------------------------------------------------------------- |
| Lock               | lock state           | 0 unlocked, 1 locked, 2 moving, 3 jammed                      |
| Door               | opening sensor       | 0 open, 1 closed (DoorSense only)                             |
| Battery            | battery, %           | battery level of the lock                                     |
| Keypad battery low | low battery (yes/no) | 1 when the keypad says its batteries are low (with a keypad)  |
| Online             | input                | 1 when the cloud reaches the lock through its bridge          |
| Last user          | text                 | name of the last person who locked or unlocked, as in the app |
| Last method        | text                 | how it was done (see below)                                   |

The methods: **App (remote)**, **App (Bluetooth)**, **Keypad**, **Fingerprint**, **By hand** (inside
knob or key), **Automatic** (auto-lock), **Key tag or card**, **Home Key**, **Other**. They come from
the activity feed of the app; a lock that does not report it shows **Other**.

## Widget

The **Yale lock** widget shows one lock: its name, the battery (live), the state of the bolt, the
door, the last user and method, the link with the cloud. Its **Lock** button locks; the **Unlock**
button only appears when unlocking from Gladys is allowed, in red, and asks for a confirmation. The
current state is marked by a check-circle icon. Choose the lock in the widget settings (empty: the
only lock of the account).

## Scene triggers

- **Yale lock unlocked**: a lock was unlocked. Filters: the lock, how (keypad, fingerprint, app…),
  the user exactly as written in the app. Variables: `lock_name`, `user`, `method` (key: `keypad`,
  `fingerprint`, `remote`, `bluetooth`, `manual`, `auto`, `tag`, `homekey`, `other`) and
  `method_label` (in the language of the configuration).
- **Door left open**: the door of a lock with DoorSense has stayed open for 1, 2, 5, 10, 15, 30
  minutes or 1 hour (one choice per scene; one event at each step while the door stays open).
  Variables: `lock_name`, `minutes`.
- **Yale battery low**: the lock batteries fell below 20 % (or the lock warns about them), or the
  keypad batteries are low. Once per drop, even across restarts. Variables: `lock_name`, `part`
  (`lock` or `keypad`), `level` (%).

An "unlocked" event comes from the activity feed: with real-time events, a few seconds after the
operation; without them, at the next reading. An activity seen more than 10 minutes late fires
nothing.

## Scene actions

- **Lock a Yale lock**: locks the chosen lock; output `state` (`locked`, or `jammed`).
- **Unlock a Yale lock**: unlocks it, only if **Allow unlocking from Gladys** is on; the action
  fails otherwise.

## Actions of the configuration

- **Send the code**: asks the cloud for a verification code.
- **Enter the code**: validates this installation with the code received.
- **Lock a lock**: locks the chosen lock now.
- **Test the connection**: reads the locks of the account, without operating them.
- **Sign out**: deletes the token and this installation (a new code will be needed).

## Real time and quotas

The integration subscribes, like the app, to the real-time channel (PubNub) of each lock: an
operation or the door arrive within seconds, then the activity feed tells who and how. When this
channel is unavailable, the locks are read every **Reading of the locks**.

A reading is one request for the list of locks, one per lock (state, door, batteries, bridge) and one
per home (the last 10 activities). With two locks in one home and real time down, that is 4 requests
every 5 minutes; with real time up, every 30 minutes. Yale publishes no quota for this unofficial
API; when it answers "too many requests", the integration pauses 10 minutes, then up to 2 hours. It
never wakes a lock up to read it (that drains the batteries): the state shown is the last one the
cloud knows, as in the app.

## Scene examples

- **Welcome home**: trigger **Yale lock unlocked**, how = Keypad or Fingerprint → turn on the
  hallway light and send "{{triggerEvent.data.user}} is home".
- **Forgotten door**: trigger **Door left open**, 10 minutes → notification "The
  {{triggerEvent.data.lock_name}} door has been open for 10 minutes".
- **Night lock**: every day at 23:00, if the lock state is not 1 → **Lock a Yale lock**.
- **Batteries**: trigger **Yale battery low** → a reminder to buy batteries.

## Troubleshooting

- **"The cloud refused the application key, not your account"**: see Limits below.
- **"The cloud refused the e-mail address, phone number or password"**: check them in the app,
  then save the configuration again. The integration stops trying until the configuration changes,
  so the account does not get locked.
- **The code is refused**: it is valid a few minutes; run **Send the code** again and type the
  newest one.
- **"The lock cannot be reached: its bridge is offline"**: check the Connect bridge or the Wi-Fi of
  the lock in the app.
- **No lock found**: the account must own the lock; a guest access is not enough.
- **Nothing in real time**: the status says "periodic reads"; the states still follow, at the
  reading pace.
- More details: set the environment variable `LOG_LEVEL=debug` on the container. The logs never
  contain the password, the token, the e-mail address nor the application key.

## Limits

- **Application key.** The cloud only accepts the requests of an app it knows, by its key. The
  integration uses the public keys of the apps, the ones the yalexs library published. Yale told
  users in January 2025 that Yale Home now accepts partner keys only, and yalexs reports the same
  for August: since then, Home Assistant signs in through an official partner account linking
  that is reserved to it. If the cloud refuses the key, the status says so clearly; nothing in your
  account is at fault, and the integration cannot work until Yale accepts a key again. If you hold a
  key issued by Yale, type it in **Application key (advanced)**.
- Unofficial API, the one of the apps: it can change without notice.
- No doorbell, camera nor alarm (Yale Home alarms): locks only. No unlatch ("open") of the Linus
  L2: unlocking is enough to open the door.
- A Bluetooth-only lock (without bridge) is shown offline and cannot be operated remotely.
- Developed without the hardware nor an account: the exact vocabulary of some recent locks may
  differ.

## Credits

Built on what the [yalexs](https://github.com/bdraco/yalexs) library (MIT, by Joe Lu, J. Nick Koston
and contributors) and the [Home Assistant Yale integration](https://www.home-assistant.io/integrations/yale)
(Apache 2.0) taught about the cloud; their recorded answers are the test fixtures.
