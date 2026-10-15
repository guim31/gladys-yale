# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration keeps:

- In the Gladys configuration: the e-mail address (or phone number), the
  password and the optional application key of the Yale account. The password
  and the key are `secret` fields: Gladys never sends them back to the browser.
- In `/data/yale-state.json` (mode 0600, the only writable path of the
  container): the installation id validated by the verification code, the
  access token and its expiry, the token of a sign-in waiting for its code, and
  the batteries already reported low. "Sign out" deletes the token and the
  installation.
- Nothing else: no history, no picture, no list of users.

Network: HTTPS to the Yale cloud of the chosen app (`api.aaecosystem.com` for
Yale Home, `api-production.august.com` for August and Yale Access) and to
PubNub (`ps.pndsn.com`) for the real-time events. Nothing listens on a port.

The logs never contain the password, a token, the e-mail address, the phone
number, the application key nor the name of a user (`test/logs.test.js`).
Unlocking from Gladys is off by default; no feature can be written, so no voice
command or switch-like control can open a door.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Yale and August clouds, the locks and their apps.
