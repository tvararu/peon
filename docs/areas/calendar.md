# calendar

The `calendar` area reads the character's calendar: its invites, events, saved-instance binds, raid reset periods and holidays, one event's details, and the pending-invite count. World-service code reads it through `session.areas.calendar.state()`: `invites`, `events`, `serverTime` (Unix seconds), `zoneTime` (packed), `serverOffsetSeconds`, `binds`, `relationTime`, `resets`, `holidays`, `details` (by event id) and `pending`. The area emits `calendar` on every send-calendar reply, `event` with its `sendType` on every send-event reply, `pending` on every pending-count reply, and `command_result` with the server's error code on every command result.

The read acts need no staging and no guild:

- `get()` sends `CMSG_CALENDAR_GET_CALENDAR` and settles `ok` on the matching `SMSG_CALENDAR_SEND_CALENDAR`, which also recomputes `serverOffsetSeconds`.
- `event(id)` sends `CMSG_CALENDAR_GET_EVENT` and settles `ok` with the stored detail when the send-event reply for that id arrives, or `refused` with the server's error and name on a command result.
- `pending()` sends `CMSG_CALENDAR_GET_NUM_PENDING` and settles `ok` with the count from `SMSG_CALENDAR_SEND_NUM_PENDING`.

The write acts need no guild either: `create(spec)` sends `CMSG_CALENDAR_ADD_EVENT` and settles `ok` with the new event id once the send-event reply arrives. `update`, `remove` and `copy` send `CMSG_CALENDAR_UPDATE_EVENT`, `CMSG_CALENDAR_REMOVE_EVENT` and `CMSG_CALENDAR_COPY_EVENT` and settle on the matching alert or command result. `invite`, `rsvp`, `signup`, `status`, `removeInvite`, `moderatorStatus`, `guildFilter` and `arenaTeam` send their request opcodes and settle `ok` or `refused` the same way. A refusal carries the server's error code and name.

Each act rejects after 5 seconds of silence.

The harness `calendar` tool (`list`, `read`, `create`, `update`, `remove`, `copy`, `invite`, `rsvp`, `status`) drives these acts; `t9-calendar-event` creates an event and renames it.

## Wire notes

- `CMSG_CALENDAR_GET_CALENDAR` has an empty body and needs a logged-in character (`Handlers/CalendarHandler.cpp:53-193`).
- `SMSG_CALENDAR_SEND_CALENDAR` carries the invite count then each invite (`uint64` event id, `uint64` invite id, `uint8` status, `uint8` rank, `uint8` guild event, packed creator guid), the event count then each event (`uint64` id, CString title, `uint32` type, packed time, `uint32` flags, `int32` dungeon id, packed creator guid), the `uint32` server time (Unix seconds), the packed zone time, the permanent-bind count then each bind (`uint32` map, `uint32` difficulty, `uint32` seconds left, raw `uint64` instance guid), the `uint32` relation time, the reset-period count then each period (`int32` map, `int32` period, `int32` offset), and the holiday count then each holiday (`uint32` id, region, looping, priority, filter, 26 `uint32` dates, 10 durations, 10 flags, CString texture) (`Handlers/CalendarHandler.cpp:60-192`).
- The zone time is the same clock as the server time but packed with minute precision; the area reads it as UTC and keeps `serverOffsetSeconds` as zone-as-UTC minus server time, so the local epoch is server time plus the offset. The offset is recomputed on every send-calendar reply because daylight saving changes it.
- `CMSG_CALENDAR_GET_EVENT` is one `uint64` event id (`Server/Packets/CalendarPackets.cpp:21-24`).
- `SMSG_CALENDAR_SEND_EVENT` carries `uint8` send type, the packed creator guid, the `uint64` event id, the CString title, the CString description after the title, `uint8` type, `uint8` repeat, `uint32` max invites, `int32` dungeon id, `uint32` flags, the packed event time, the packed zone time, the `uint32` guild id, then the invite count and each invite (packed invitee guid, `uint8` level, status, rank, guild event, `uint64` invite id, packed status time, CString text) (`Calendar/CalendarMgr.cpp:627-671`). The wowm file has no description field, so AzerothCore wins here.
- `CMSG_CALENDAR_GET_NUM_PENDING` has an empty body (`Handlers/CalendarHandler.cpp:781-791`).
- `SMSG_CALENDAR_SEND_NUM_PENDING` is one `uint32` (`Handlers/CalendarHandler.cpp:788-790`).
- `SMSG_CALENDAR_COMMAND_RESULT` is `uint32` 0, `uint8` 0, the name (a CString, set only for errors 4, 10 and 13, else empty), then the `uint32` error (`Calendar/CalendarMgr.cpp:696-719`).

- `CMSG_CALENDAR_ADD_EVENT` is the title, description, type, repeat, max invites, dungeon id, packed event time, packed zone time, flags and, for guild events, the guild-event invite sets (`Handlers/CalendarHandler.cpp:235-362`). A guildless character asking for a guild event gets error 9 (`GUILD_PLAYER_NOT_IN_GUILD`). The server allows one create or copy every 5 seconds (`CALENDAR_CREATE_EVENT_COOLDOWN`) and 30 events per player (`CALENDAR_MAX_EVENTS`); a create inside the cooldown or past the cap gets a command result.
- A successful create answers `SMSG_CALENDAR_EVENT_INVITE` for the creator's own invite, `SMSG_CALENDAR_EVENT_INVITE_ALERT` and `SMSG_CALENDAR_SEND_EVENT`.
- `CMSG_CALENDAR_UPDATE_EVENT` repeats the add body after the event id and invite id and answers `SMSG_CALENDAR_EVENT_UPDATED_ALERT` (`Handlers/CalendarHandler.cpp:364-419`). `CMSG_CALENDAR_REMOVE_EVENT` is the event id, invite id and a flags `uint32` and answers `SMSG_CALENDAR_EVENT_REMOVED_ALERT` (`Handlers/CalendarHandler.cpp:421-430`). `CMSG_CALENDAR_COPY_EVENT` is the event id, invite id and the packed new time, answers `SMSG_CALENDAR_SEND_EVENT` plus an invite alert, and inside the 5 second cooldown answers a command result (`Handlers/CalendarHandler.cpp:432-515`).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_CALENDAR_GET_CALENDAR` | `live` | flow `calendar-read` (`tmp/probe/FAC6AC569BE4E-20261006T213604Z`, not committed): the empty request out | `Handlers/CalendarHandler.cpp:53-193` |
| `SMSG_CALENDAR_SEND_CALENDAR` | `live` | same run: the 3921-byte reply with 23 reset periods and 16 holidays on a fresh `max80` | `Handlers/CalendarHandler.cpp:60-192` |
| `CMSG_CALENDAR_GET_EVENT` | `live` | same run with `--arg id=<2^40+7>`: the 8-byte request | `Server/Packets/CalendarPackets.cpp:21-24` |
| `SMSG_CALENDAR_SEND_EVENT` | `live` | `calendar-write` (`tmp/probe/FAC6AC569BE4E-20261006T213745Z`): a 93-byte reply after the create and a 75-byte reply after the copy | `Calendar/CalendarMgr.cpp:627-671` |
| `CMSG_CALENDAR_GET_NUM_PENDING` | `live` | `calendar-read`: the empty request | `Handlers/CalendarHandler.cpp:781-791` |
| `SMSG_CALENDAR_SEND_NUM_PENDING` | `live` | same run: the 4-byte reply | `Handlers/CalendarHandler.cpp:788-790` |
| `SMSG_CALENDAR_COMMAND_RESULT` | `live` | `calendar-read`: a 10-byte reply (error 6) for the bad event id; `calendar-write` (`tmp/probe/FAC6AC569BE4E-20261006T213658Z`): the same reply to a copy inside the 5 second cooldown | `Calendar/CalendarMgr.cpp:696-719` |
| `CMSG_CALENDAR_ADD_EVENT` | `live` | `calendar-write`: the 62-byte request is answered by `SMSG_CALENDAR_EVENT_INVITE` (23 bytes), `SMSG_CALENDAR_EVENT_INVITE_ALERT` (51) and `SMSG_CALENDAR_SEND_EVENT` (93) | `Handlers/CalendarHandler.cpp:235-362` |
| `CMSG_CALENDAR_UPDATE_EVENT` | `live` | same run: the 71-byte request is answered by `SMSG_CALENDAR_EVENT_UPDATED_ALERT` (68 bytes) | `Handlers/CalendarHandler.cpp:364-419` |
| `CMSG_CALENDAR_COPY_EVENT` | `live` | the second run: the 20-byte request is answered by `SMSG_CALENDAR_SEND_EVENT` (75) and `SMSG_CALENDAR_EVENT_INVITE_ALERT` (53); the first run, inside the cooldown, got a command result | `Handlers/CalendarHandler.cpp:432-515` |
| `CMSG_CALENDAR_REMOVE_EVENT` | `live` | the second run removes the original and the copy; each 20-byte request is answered by `SMSG_CALENDAR_EVENT_REMOVED_ALERT` (13 bytes) | `Handlers/CalendarHandler.cpp:421-430` |
| `SMSG_CALENDAR_EVENT_INVITE` | `live` | the create reply above | `Calendar/CalendarMgr.cpp:503-535` |
| `SMSG_CALENDAR_EVENT_INVITE_ALERT` | `live` | the create and copy replies above | `Calendar/CalendarMgr.cpp:603-625` |
| `SMSG_CALENDAR_EVENT_UPDATED_ALERT` | `live` | the update reply above | `Calendar/CalendarMgr.cpp:537-555` |
| `SMSG_CALENDAR_EVENT_REMOVED_ALERT` | `live` | the remove replies above | `Calendar/CalendarMgr.cpp:571-579` |

The invite, rsvp, signup, status, moderator, guild filter, arena team, lockout, complain and invite-removed opcodes are covered by builder and reader tests only: they need a second player or a guild, and no scenario stages one. Cooldown and cap: a create inside 5 seconds of the last create is refused, and a character holds 30 personal events at most.
