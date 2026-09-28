# time

The `time` area parses the game time the server sends at login and asks
the server once per login for the seconds until the daily quest reset.
World-service code reads it through `session.areas.time.state()` and
sends a fresh query with `claim.areas.time.query()`.

## Wire notes

AzerothCore and wow_messages agree on all three bodies.

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

## Left out

None.

## Capabilities row

No agent verb; the world-service act `time.query` only (R9).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_LOGIN_SETTIMESPEED` | `live` | probe flow `login`, exit 0 | `Entities/Player/Player.cpp:11803` |
| `CMSG_QUERY_TIME` | `live` | probe `--send CMSG_QUERY_TIME`, exit 0; the reply follows | `Server/Protocol/Opcodes.cpp:593` |
| `SMSG_QUERY_TIME_RESPONSE` | `live` | probe flow `login`, exit 0; harness run `time/synced` row | `Server/Packets/QueryPackets.cpp:47` |
