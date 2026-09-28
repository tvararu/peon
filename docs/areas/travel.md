# travel

The `travel` area keeps the character's home inn. World-service code reads
it through `session.areas.travel.state()`: `home` (map, x, y, z and area of
the bind point), `offer` (the innkeeper that offered a bind through its
gossip menu, for 60 seconds), `lastBound` (the binder and area of the last
bind) and `bindPending`. The area emits `bind_point` (reason `login` at
every login, `bound` when it answers a bind), `bind_offer` and `bound`.
The area act `bindActivate(npc)` makes an innkeeper's inn the home
and settles as `ok` with the new home, `refused` with `busy` while another
bind is pending, or `no_answer` after 5 seconds of silence.

## Wire notes

- `SMSG_BINDPOINTUPDATE` is x, y, z as `float`, then the map and the area
  as `uint32`. The server sends it at every login
  (`Entities/Player/Player.cpp:11775-11779`) and when the bind spell hits
  (`Spells/SpellEffects.cpp:6652-6658`).
- `SMSG_PLAYERBOUND` is the full `uint64` guid of the binder, then the
  area as `uint32` (`Spells/SpellEffects.cpp:6663-6666`). It follows the
  bind point update of the same bind.
- `SMSG_BINDER_CONFIRM` is the innkeeper's guid only
  (`Entities/Player/Player.cpp:9118-9122`). wow_messages adds an `Area`
  after the guid for 3.3.5
  (`wow_message_parser/wowm/world/item/smsg_binder_confirm.wowm:7-13`),
  which AzerothCore does not write. AzerothCore wins: the area reads 8
  bytes.
- `CMSG_BINDER_ACTIVATE` is the innkeeper's guid
  (`Handlers/NPCHandler.cpp:293-296`). The act sends no gossip first:
  the gossip option only makes the server offer the bind.
- The server answers a bind with nothing when the character is dead, is
  not near the innkeeper, or is on an instanceable map
  (`Handlers/NPCHandler.cpp:298-307,317-319`), so the act waits 5
  seconds and then settles as `no_answer`.
- A bind casts spell 3286 and ends with a trainer buy-succeeded packet
  for that spell (`Handlers/NPCHandler.cpp:321-331`). The trainer store
  counts it only when a `train` request for that trainer and spell is
  pending, so a bind never reads as a purchase.

## Left out

- `CMSG_TAXINODE_STATUS_QUERY`, `SMSG_TAXINODE_STATUS`,
  `CMSG_TAXIQUERYAVAILABLENODES`, `CMSG_ENABLETAXI`, `SMSG_NEW_TAXI_PATH`
  and `CMSG_SET_TAXI_BENCHMARK_MODE`: built by travel-2.
- `CMSG_ACTIVATETAXI`, `CMSG_ACTIVATETAXIEXPRESS` and
  `SMSG_ACTIVATETAXIREPLY`: built by travel-3.
- `CMSG_MOVE_SPLINE_DONE`: built by travel-4.

## Capabilities row

Proposed in travel-5.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_BINDPOINTUPDATE` | `live` | probe flow `login` (`--expect SMSG_BINDPOINTUPDATE`) on an `eversong10` character, exit 0; the report has no `not_implemented` notice for it | `Entities/Player/Player.cpp:11775-11779` |
| `SMSG_PLAYERBOUND` | `live` | probe flow `travel-bind` (`--expect SMSG_PLAYERBOUND --expect SMSG_BINDPOINTUPDATE`) at Falconwing Square, exit 0; the binder is the innkeeper | `Spells/SpellEffects.cpp:6663-6666` |
| `SMSG_BINDER_CONFIRM` | `live` | probe flow `travel-bind` with `--arg gossip=1` (`--expect SMSG_BINDER_CONFIRM`), exit 0; an 8-byte body | `Entities/Player/Player.cpp:9118-9122` |
| `CMSG_BINDER_ACTIVATE` | `live` | probe flow `travel-bind`, exit 0; `SMSG_BINDPOINTUPDATE` with the inn's area and `SMSG_PLAYERBOUND` follow the send, and the act settles `ok` | `Handlers/NPCHandler.cpp:293-296` |
| `SMSG_FLIGHT_SPLINE_SYNC` | `dead` | registered as `STATUS_NEVER` and no AzerothCore code writes it: the only other mention is its enum line (`Server/Protocol/Opcodes.h:934`) | `Server/Protocol/Opcodes.cpp:1035` |
