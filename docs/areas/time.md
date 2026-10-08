# time

The `time` area parses the game time the server sends at login and asks
the server once per login for the seconds until the daily quest reset.
World-service code reads it through `session.areas.time.state()`. The
area's `query` act sends a fresh query, and its `requestUiTime` act asks
for the server's game clock and fills `uiTime` (Unix seconds) and `uiTimeAt`. The `ui_time` event
writes no log row.

## Wire notes

AzerothCore and wow_messages agree on all five bodies.

- The server sends `SMSG_LOGIN_SETTIMESPEED` from
  `Player::SendInitialPacketsBeforeAddToMap`, so it arrives at every
  login and after every far teleport. The body is the packed game time
  (`uint32`), the game speed (`float`, 0.01666667) and a `uint32` 0
  (`Entities/Player/Player.cpp:11803`,
  `wow_message_parser/wowm/world/login_logout/smsg_login_settimespeed.wowm`).
- The packed time is `(tm_year - 100) << 24 | tm_mon << 20 |
  (tm_mday - 1) << 14 | tm_wday << 11 | tm_hour << 6 | tm_min`
  (`src/server/shared/Packets/ByteBuffer.cpp:140`). `tm_mon` counts from
  0, so the parsed month and day both add 1 and the year adds 2000.
- `CMSG_QUERY_TIME` has an empty body and needs a logged-in character
  (`Server/Protocol/Opcodes.cpp:593`).
- `SMSG_QUERY_TIME_RESPONSE` carries the server Unix time and then the
  seconds until the next daily quest reset, both `uint32`
  (`Server/Packets/QueryPackets.cpp:47`,
  `wow_message_parser/wowm/world/queries/smsg_query_time_response.wowm`).
  The server also sends it when a character asks for its GM ticket.
- `CMSG_WORLD_STATE_UI_TIMER_UPDATE` has an empty body and needs a
  logged-in character (`Handlers/MiscHandler.cpp:1614`,
  `Server/Protocol/Opcodes.cpp:1401`,
  `wow_message_parser/wowm/world/queries/cmsg_world_state_ui_timer_update.wowm`).
  Nothing sends it by itself; only `requestUiTime` does.
- `SMSG_WORLD_STATE_UI_TIMER_UPDATE` is one `uint32`, the game time in
  Unix seconds (`Server/Packets/MiscPackets.cpp:137`,
  `wow_message_parser/wowm/world/queries/smsg_world_state_ui_timer_update.wowm`).
  The reply carries no request id, so two requests in flight share one
  packet and one answer.

## Left out

None.

## Capabilities row

No agent verb; the world-service acts `time.query` and
`time.requestUiTime` only (R9).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_LOGIN_SETTIMESPEED` | `live` | probe flow `login`, exit 0 | `Entities/Player/Player.cpp:11803` |
| `CMSG_QUERY_TIME` | `live` | probe `--send CMSG_QUERY_TIME`, exit 0; the reply follows | `Server/Protocol/Opcodes.cpp:593` |
| `SMSG_QUERY_TIME_RESPONSE` | `live` | probe flow `login`, exit 0; harness run `time/synced` row | `Server/Packets/QueryPackets.cpp:47` |
| `CMSG_WORLD_STATE_UI_TIMER_UPDATE` | `live` | probe `--send CMSG_WORLD_STATE_UI_TIMER_UPDATE`, exit 0; the reply follows | `Handlers/MiscHandler.cpp:1614` |
| `SMSG_WORLD_STATE_UI_TIMER_UPDATE` | `live` | the same probe run, `outcome` `handled` | `Server/Packets/MiscPackets.cpp:137` |
