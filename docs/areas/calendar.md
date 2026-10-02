# calendar

The `calendar` area reads the character's calendar: its invites, events, saved-instance binds, raid reset periods and holidays, one event's details, and the pending-invite count. World-service code reads it through `session.areas.calendar.state()`: `invites`, `events`, `serverTime` (Unix seconds), `zoneTime` (packed), `serverOffsetSeconds`, `binds`, `relationTime`, `resets`, `holidays`, `details` (by event id) and `pending`. The area emits `calendar` on every send-calendar reply, `event` with its `sendType` on every send-event reply, `pending` on every pending-count reply, and `command_result` with the server's error code on every command result.

The read acts need no staging and no guild:

- `get()` sends `CMSG_CALENDAR_GET_CALENDAR` and settles `ok` on the matching `SMSG_CALENDAR_SEND_CALENDAR`, which also recomputes `serverOffsetSeconds`.
- `event(id)` sends `CMSG_CALENDAR_GET_EVENT` and settles `ok` with the stored detail when the send-event reply for that id arrives, or `refused` with the server's error and name on a command result.
- `pending()` sends `CMSG_CALENDAR_GET_NUM_PENDING` and settles `ok` with the count from `SMSG_CALENDAR_SEND_NUM_PENDING`.

Each act rejects after 5 seconds of silence.

## Wire notes

- `CMSG_CALENDAR_GET_CALENDAR` has an empty body and needs a logged-in character (`Handlers/CalendarHandler.cpp:53-193`).
- `SMSG_CALENDAR_SEND_CALENDAR` carries the invite count then each invite (`uint64` event id, `uint64` invite id, `uint8` status, `uint8` rank, `uint8` guild event, packed creator guid), the event count then each event (`uint64` id, CString title, `uint32` type, packed time, `uint32` flags, `int32` dungeon id, packed creator guid), the `uint32` server time (Unix seconds), the packed zone time, the permanent-bind count then each bind (`uint32` map, `uint32` difficulty, `uint32` seconds left, raw `uint64` instance guid), the `uint32` relation time, the reset-period count then each period (`int32` map, `int32` period, `int32` offset), and the holiday count then each holiday (`uint32` id, region, looping, priority, filter, 26 `uint32` dates, 10 durations, 10 flags, CString texture) (`Handlers/CalendarHandler.cpp:60-192`).
- The zone time is the same clock as the server time but packed with minute precision; the area reads it as UTC and keeps `serverOffsetSeconds` as zone-as-UTC minus server time, so the local epoch is server time plus the offset. The offset is recomputed on every send-calendar reply because daylight saving changes it.
- `CMSG_CALENDAR_GET_EVENT` is one `uint64` event id (`Server/Packets/CalendarPackets.cpp:21-24`).
- `SMSG_CALENDAR_SEND_EVENT` carries `uint8` send type, the packed creator guid, the `uint64` event id, the CString title, the CString description after the title, `uint8` type, `uint8` repeat, `uint32` max invites, `int32` dungeon id, `uint32` flags, the packed event time, the packed zone time, the `uint32` guild id, then the invite count and each invite (packed invitee guid, `uint8` level, status, rank, guild event, `uint64` invite id, packed status time, CString text) (`Calendar/CalendarMgr.cpp:627-671`). The wowm file has no description field, so AzerothCore wins here.
- `CMSG_CALENDAR_GET_NUM_PENDING` has an empty body (`Handlers/CalendarHandler.cpp:781-791`).
- `SMSG_CALENDAR_SEND_NUM_PENDING` is one `uint32` (`Handlers/CalendarHandler.cpp:788-790`).
- `SMSG_CALENDAR_COMMAND_RESULT` is `uint32` 0, `uint8` 0, the name (a CString, set only for errors 4, 10 and 13, else empty), then the `uint32` error (`Calendar/CalendarMgr.cpp:696-719`).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_CALENDAR_GET_CALENDAR` | `live` | flow `calendar-read` (run `probe-calendar-read`, not committed) | `Handlers/CalendarHandler.cpp:53-193` |
| `SMSG_CALENDAR_SEND_CALENDAR` | `live` | same run; the trace shows the 3921-byte reply with 23 reset periods and 16 holidays on a fresh `max80` | `Handlers/CalendarHandler.cpp:60-192` |
| `CMSG_CALENDAR_GET_EVENT` | `live` | same run with `--arg id=<2^40+7>`; the trace shows the 8-byte request | `Server/Packets/CalendarPackets.cpp:21-24` |
| `SMSG_CALENDAR_SEND_EVENT` | `mock` | builder test from the writer; not seen live (guild-10 proves it live) | `Calendar/CalendarMgr.cpp:627-671` |
| `CMSG_CALENDAR_GET_NUM_PENDING` | `live` | same run; the trace shows the empty request | `Handlers/CalendarHandler.cpp:781-791` |
| `SMSG_CALENDAR_SEND_NUM_PENDING` | `live` | same run; the trace shows the 4-byte reply | `Handlers/CalendarHandler.cpp:788-790` |
| `SMSG_CALENDAR_COMMAND_RESULT` | `live` | same run; the trace shows error 6 for the bad event id | `Calendar/CalendarMgr.cpp:696-719` |
