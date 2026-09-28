# instances

The `instances` area keeps the character's dungeon and raid difficulty,
the difficulty of the map it stands in, the maps it holds a permanent
save to, the last instance warning the server sent and the timer that
moves a character out of a dungeon whose group it left. World-service
code reads it through `session.areas.instances.state()`. The area emits
`difficulty`, `map_difficulty`, `saved_maps`, `warning`, `homebind_timer`
and `corpse_elsewhere` events. The map difficulty and the homebind timer
clear at login and on each far teleport.

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

## Left out

- `CMSG_REQUEST_RAID_INFO`, `SMSG_RAID_INSTANCE_INFO`,
  `SMSG_INSTANCE_SAVE_CREATED`, `SMSG_INSTANCE_LOCK_WARNING_QUERY`,
  `CMSG_INSTANCE_LOCK_RESPONSE` and `CMSG_SET_SAVED_INSTANCE_EXTEND`:
  built by `instances-2`.
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
