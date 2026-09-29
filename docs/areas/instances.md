# instances

The `instances` area keeps the character's dungeon and raid difficulty,
the difficulty of the map it stands in, the maps it holds a permanent
save to, the last instance warning the server sent and the timer that
moves a character out of a dungeon whose group it left. It also keeps
the last raid lockout list with its arrival time and the save prompt the
server is waiting on. World-service code reads it through
`session.areas.instances.state()`. The area emits `difficulty`,
`map_difficulty`, `saved_maps`, `warning`, `homebind_timer`,
`corpse_elsewhere`, `lockouts`, `bind_offer` and `bound` events. The map
difficulty, the homebind timer and the pending bind clear at login and on
each far teleport. A pending bind reads as absent once its timeout has
passed.

Three acts settle on the server's reply, or on `no_answer` after 5 s:
`requestLockouts()`, `answerBind(accept)` and
`setLockoutExtended({ mapId, difficulty, extended })`. Only one runs at a
time; a second one refuses with `busy`. `answerBind` refuses with
`no_bind_offer` and sends nothing without a pending bind, and
`setLockoutExtended` refuses with `no_matching_lock` unless the last
lockout list holds that map and difficulty with the other flag. It then
asks for the lockouts again and settles `ok` when the flag changed and
`refused("unchanged")` when not.

## Wire notes

- `MSG_SET_DUNGEON_DIFFICULTY` and `MSG_SET_RAID_DIFFICULTY` from the
  server are the difficulty, a constant `uint32` 1 and a `uint32` group
  flag (`Server/Packets/InstancePackets.cpp:35-42`,
  `Server/Packets/InstancePackets.cpp:56-63`). The server sends the
  dungeon difficulty at every login, before `SMSG_LOGIN_VERIFY_WORLD`
  (`Handlers/CharacterHandler.cpp:822`). The area handles the server form
  only; the client form is a request.
- Dungeon difficulties are 0 to 2 (normal, heroic, epic) and raid
  difficulties 0 to 3 (10 and 25 normal, 10 and 25 heroic)
  (`src/server/shared/DataStores/DBCEnums.h:267-282`).
- `SMSG_INSTANCE_DIFFICULTY` is the map's difficulty and a dynamic
  difficulty flag (`Entities/Player/Player.cpp:11788-11792`). It arrives
  at login and after each far teleport. The body does not say whether
  the map is a raid, so the area names the value on the dungeon scale.
- On a far teleport the server sends `SMSG_UPDATE_INSTANCE_OWNERSHIP`
  right after `SMSG_NEW_WORLD`, and one `SMSG_UPDATE_LAST_INSTANCE` per
  permanent save when the flag is 1
  (`Entities/Player/Player.cpp:1629-1637`,
  `Entities/Player/PlayerStorage.cpp:6782-6798`). Each ownership packet
  starts a new list.
- `SMSG_RAID_INSTANCE_MESSAGE` kind 4 (welcome) ends with a `uint8`
  locked and a `uint8` extended, which
  `wow_message_parser/wowm/world/raid/smsg_raid_instance_message.wowm`
  does not have (`Entities/Player/Player.cpp:12002-12006`). AzerothCore
  wins.
- The welcome warning on entering a dungeon map carries the dungeon
  difficulty, and on a raid map the raid difficulty
  (`Handlers/MovementHandler.cpp:257`).
- A character in a dungeon that leaves the group loses its claim on the
  instance (`Groups/Group.cpp:2402-2406`).
- `SMSG_RAID_GROUP_ONLY` then sends (60000, 1), and (0, 0) to hide the
  timer (`Entities/Player/PlayerUpdates.cpp:1421-1460`). Code 0 is not in
  `wow_message_parser/wowm/world/social/smsg_raid_group_only.wowm`.
  AzerothCore wins.
- `SMSG_CORPSE_NOT_IN_INSTANCE` has an empty body
  (`Maps/MapMgr.cpp:206-211`).
- `CMSG_REQUEST_RAID_INFO` has an empty body
  (`Handlers/GroupHandler.cpp:1137-1141`).
- `SMSG_RAID_INSTANCE_INFO` lists only permanent saves: a `uint32`
  count, then per lock a `uint32` map, a `uint32` difficulty, a `uint64`
  instance guid, a `uint8` that is always 1, a `uint8` extended flag and
  a `uint32` of seconds to the reset
  (`Entities/Player/PlayerStorage.cpp:6726-6758`). The fifth field is
  `locked`; `wow_message_parser/wowm/world/raid/smsg_raid_instance_info.wowm`
  calls it `expired`, and the server always sends 1 (same range). A
  character with no saves gets a count of 0, which is a real reply.
- `SMSG_INSTANCE_LOCK_WARNING_QUERY` is a `uint32` timeout in ms (60000),
  a `uint32` completed-encounter mask and a `uint8` 0 (`Maps/Map.cpp:2131-2139`).
  The server sends it to a grouped character entering a dungeon that is
  not yet saved, and expects `CMSG_INSTANCE_LOCK_RESPONSE` within the
  timeout. `SMSG_INSTANCE_SAVE_CREATED` follows an accepted bind, with a
  `uint32` 0 (`Entities/Player/PlayerStorage.cpp:6720-6722`).
- `CMSG_INSTANCE_LOCK_RESPONSE` is one `uint8`
  (`Server/Packets/InstancePackets.cpp:70-73`). The server ignores it
  without a pending bind, accepts by binding and declines by repopping
  the character at the graveyard, which is a map change
  (`Handlers/MiscHandler.cpp:1707-1721`).
- `CMSG_SET_SAVED_INSTANCE_EXTEND` is a `uint32` map, a `uint32`
  difficulty and a `uint8` flag, 9 bytes. `wow_message_parser/wowm/world/raid/cmsg_set_saved_instance_extend.wowm`
  makes the difficulty a `uint8`; AzerothCore wins
  (`Handlers/CalendarHandler.cpp:793-817`). The server ignores it for a
  map without a permanent save or a flag that does not change
  (`Handlers/CalendarHandler.cpp:799-805`).

## Left out

- `CMSG_RESET_INSTANCES`, `SMSG_INSTANCE_RESET`,
  `SMSG_INSTANCE_RESET_FAILED` and `SMSG_RESET_FAILED_NOTIFY`: built by
  `instances-3`, which also adds the client form of the two
  `MSG_SET_*_DIFFICULTY` opcodes.
- `SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT`: built by `instances-4`.

## Capabilities row

Proposed in instances-5.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `MSG_SET_DUNGEON_DIFFICULTY` | `live` | probe flow `login` (`--expect` 0x329, 0x33b), exit 0; received once and handled | `Server/Packets/InstancePackets.cpp:35-42` |
| `MSG_SET_RAID_DIFFICULTY` | `mock` | `packages/core/src/wow/areas/instances/store.test.ts` "a raid difficulty body sets the raid difficulty with its name"; not seen live | `Server/Packets/InstancePackets.cpp:56-63` |
| `SMSG_INSTANCE_DIFFICULTY` | `live` | probe flow `login`, exit 0; then a probe flow `login` on an `eversong10` staged in Orgrimmar with `soap gm tele Orgrimmar`, with `soap gm tele SilvermoonCity` during the wait, exit 0; received twice (login and after the far teleport) and handled | `Entities/Player/Player.cpp:11788-11792` |
| `SMSG_UPDATE_INSTANCE_OWNERSHIP` | `live` | the same far-teleport probe (`--expect` 0x32b), exit 0; received right after `SMSG_NEW_WORLD` and handled | `Entities/Player/PlayerStorage.cpp:6782-6784` |
| `SMSG_UPDATE_LAST_INSTANCE` | `mock` | `packages/core/src/wow/areas/instances/store.test.ts` "ownership then last-instance bodies set the saved maps, and a new ownership body starts over"; not seen live (needs a permanent save) | `Entities/Player/PlayerStorage.cpp:6796-6798` |
| `SMSG_RAID_INSTANCE_MESSAGE` | `mock` | `packages/core/src/wow/areas/instances/store.test.ts` "a raid instance message sets the last warning and emits warning"; not seen live | `Entities/Player/Player.cpp:11975-12008` |
| `SMSG_RAID_GROUP_ONLY` | `live` | puppet run with `--packet-trace headers`: two `ghostlands20` in a party, both moved into the Deadmines with `soap gm tele Deadmines`, then one left the group; its trace shows the packet handled and its `homebind_timer` event reads started, 60000 ms, code 1 | `Entities/Player/PlayerUpdates.cpp:1421-1460` |
| `SMSG_CORPSE_NOT_IN_INSTANCE` | `mock` | `packages/core/src/wow/areas/instances/store.test.ts` "SMSG_CORPSE_NOT_IN_INSTANCE with an empty body emits corpse_elsewhere"; not seen live (a ghost cannot be staged by SOAP) | `Maps/MapMgr.cpp:206-211` |
| `CMSG_REQUEST_RAID_INFO` | `live` | probe flow `instances-raid-info` on a fresh `eversong10`, exit 0; the request left and the reply followed | `Handlers/GroupHandler.cpp:1137-1141` |
| `SMSG_RAID_INSTANCE_INFO` | `live` | the same probe (`--expect` `SMSG_RAID_INSTANCE_INFO`), exit 0; a count-0 reply handled with no packet error | `Entities/Player/PlayerStorage.cpp:6726-6758` |
| `SMSG_INSTANCE_SAVE_CREATED` | `mock` | `packages/core/src/wow/areas/instances/store.test.ts` "SMSG_INSTANCE_SAVE_CREATED clears the pending bind and emits bound" and `runtime.test.ts` "accepting sends the response and settles ok on SMSG_INSTANCE_SAVE_CREATED"; not seen live (needs a group entering an unsaved dungeon and accepting) | `Entities/Player/PlayerStorage.cpp:6720-6722` |
| `SMSG_INSTANCE_LOCK_WARNING_QUERY` | `mock` | `packages/core/src/wow/areas/instances/store.test.ts` "a lock warning sets pendingBind with its deadline and emits bind_offer"; not seen live (needs a group entering an unsaved dungeon) | `Maps/Map.cpp:2131-2139` |
| `CMSG_INSTANCE_LOCK_RESPONSE` | `accepted` | `protocol.test.ts` builder test; `mise protocol:probe --send CMSG_INSTANCE_LOCK_RESPONSE --body 01` sent one byte with no pending bind, exit 0, no packet error, no disconnect | `Server/Packets/InstancePackets.cpp:70-73` |
| `CMSG_SET_SAVED_INSTANCE_EXTEND` | `accepted` | `protocol.test.ts` builder test; `--send CMSG_SET_SAVED_INSTANCE_EXTEND --body 770200000100000001` sent 9 bytes with no raid lock, exit 0, no packet error, no disconnect | `Handlers/CalendarHandler.cpp:793-817` |
