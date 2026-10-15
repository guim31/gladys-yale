# Yale fixtures

Real answers of the Yale Home / August cloud, as published in the tests of:

- [yalexs](https://github.com/bdraco/yalexs) (`tests/fixtures`, `tests/test_pubnub_activity.py`),
  MIT License, Copyright (c) 2017 Joe Lu — the messages of `pubnub-messages.json` are the ones of
  `test_pubnub_activity.py`;
- [Home Assistant](https://github.com/home-assistant/core) (`tests/components/yale/fixtures`, the
  files whose name contains `ha_`, `lock.keypad.json` and `lock.low_keypad_battery.json`), Apache
  License 2.0.

Anonymized: MAC addresses, serial numbers, e-mail addresses, phone numbers and keys are replaced
with invented values; the rest is as published.

| File                           | Origin                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `locks.json`                   | yalexs `get_locks.json` (`/users/locks/mine`)                  |
| `lock.doorsense.json`          | yalexs `get_lock.online_with_doorsense.json` (`/locks/{id}`)   |
| `lock.keypad.json`             | Home Assistant `get_lock.online.json`                          |
| `lock.low_keypad_battery.json` | Home Assistant `get_lock.low_keypad_battery.json`              |
| `lock.offline.json`            | yalexs `get_lock.offline.json`                                 |
| `lock.unlatch.json`            | yalexs `lock_with_unlatch.online.json` (Linus L2, Yale Home)   |
| `house-activities.json`        | yalexs `get_house_activities.json` (`/houses/{id}/activities`) |
| `activity.*.json`              | yalexs `*_activity*.json`, Home Assistant `get_activity.*`     |
| `pubnub-messages.json`         | yalexs `test_pubnub_activity.py`                               |

MIT License (yalexs):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions: The above copyright notice
> and this permission notice shall be included in all copies or substantial portions of the
> Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
