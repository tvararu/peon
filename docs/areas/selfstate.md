# selfstate

The `selfstate` area reads the packets that change the character's own
movement flags and hands them to control. `SMSG_MOVE_WATER_WALK`,
`SMSG_MOVE_LAND_WALK`, `SMSG_MOVE_SET_HOVER`, `SMSG_MOVE_UNSET_HOVER`,
`SMSG_MOVE_FEATHER_FALL`, `SMSG_MOVE_NORMAL_FALL`,
`SMSG_MOVE_GRAVITY_DISABLE` and `SMSG_MOVE_GRAVITY_ENABLE` become a
`move_flag` self event; control sets or clears the flag bit, acks with
the packet's counter and keeps the bit in every later move. A character
with gravity off refuses a move with `disable_gravity`.
`SMSG_MULTIPLE_MOVES`, which the server sends at login, splits into one
self event per entry in wire order: a root entry becomes `force_root`
and the others `move_flag`, each acked with its own counter. An entry
for another guid is dropped, and an entry with an unknown opcode is
skipped by its length.

The store keeps the stand state, the fatigue, breath and fire timers and
whether a ghost is pending. The stand state starts from byte 0 of the
self `UNIT_FIELD_BYTES_1` and follows `SMSG_STANDSTATE_UPDATE`;
`stand_changed` fires on a change only. `SMSG_START_MIRROR_TIMER` and
`SMSG_STOP_MIRROR_TIMER` fill and clear a timer and fire `mirror_timer`.
`breath_low` fires once when a draining breath timer falls to 10 s.
`SMSG_PRE_RESURRECT` for the self guid sets `ghostPending` and fires
`ghost_pending`; the ghost bit 0x10 of the self `PLAYER_FLAGS` clears it.
The act `setStandState` sends `CMSG_STANDSTATECHANGE` for stand, sit,
sleep or kneel and settles `ok` on the reply, `refused` with
`invalid_state` for any other state, or `no_answer` after 2 s.

## Wire notes

- For a player the server does not set water walk or hover itself: it
  sends the change with an order counter and copies the flags from the
  client's ack (`Entities/Unit/Unit.cpp:16225-16235,16278-16288`,
  `Handlers/MiscHandler.cpp:1527`). A later move without the bit clears
  it again (`Handlers/MovementHandler.cpp:435`), so control keeps each
  acked bit in its movement flags.
- `SMSG_MOVE_WATER_WALK`, `SMSG_MOVE_LAND_WALK`, `SMSG_MOVE_SET_HOVER`
  and `SMSG_MOVE_UNSET_HOVER` are the packed guid and a `uint32` counter
  (`Entities/Unit/Unit.cpp:16261-16268,16297-16302`); AzerothCore and
  wow_messages agree
  (`wow_message_parser/wowm/world/movement/smsg/smsg_move_water_walk.wowm`).
- `CMSG_MOVE_WATER_WALK_ACK` and `CMSG_MOVE_HOVER_ACK` are the packed
  guid, the `uint32` counter, the movement info and a `uint32` applied
  flag (`Handlers/MiscHandler.cpp:1505-1520`). wow_messages writes a plain
  8-byte guid
  (`wow_message_parser/wowm/world/movement/cmsg/cmsg_move_water_walk_ack.wowm`);
  AzerothCore reads a packed guid, and AzerothCore wins.
- At death the server unsets hover (`Entities/Unit/Unit.cpp:11113`) and
  roots the character (`Entities/Player/Player.cpp:4643`); the release
  sets water walk while the root holds (`Entities/Player/Player.cpp:4539`)
  and the reclaim clears it (`Entities/Player/Player.cpp:4580`). The
  server drops a rooted mover's packet without `ROOT`
  (`Handlers/MovementHandler.cpp:606-609`), so an ack sent while rooted
  carries `ROOT`.
- The server relays each accepted ack to the players in view as
  `MSG_MOVE_HOVER` or `MSG_MOVE_WATER_WALK` (`Handlers/MiscHandler.cpp:1546-1557`),
  both for setting and for clearing the flag.
- `SMSG_MOVE_FEATHER_FALL`, `SMSG_MOVE_NORMAL_FALL`,
  `SMSG_MOVE_GRAVITY_DISABLE` and `SMSG_MOVE_GRAVITY_ENABLE` are the
  packed guid and a `uint32` counter
  (`Entities/Unit/Unit.cpp:16103-16114,16199-16214`).
  `CMSG_MOVE_FEATHER_FALL_ACK` carries `FALLING_SLOW` 0x20000000 and the
  trailing `uint32` applied flag. AzerothCore reads its guid packed
  (`Handlers/MiscHandler.cpp:1505`), while wow_messages declares a full
  `Guid`
  (`wow_message_parser/wowm/world/movement/cmsg/cmsg_move_feather_fall_ack.wowm:2`);
  AzerothCore wins, so the ack writes a packed guid.
  `CMSG_MOVE_GRAVITY_DISABLE_ACK` and `CMSG_MOVE_GRAVITY_ENABLE_ACK` carry
  `DISABLE_GRAVITY` 0x400 set or clear and **no** applied flag
  (`Handlers/MiscHandler.cpp:1505-1520`).
- `SMSG_MULTIPLE_MOVES` is a `uint32` byte count, then per entry a
  `uint8` length (opcode, guid and counter, not the length byte), a
  `uint16` opcode, the packed guid and a `uint32` counter. The server
  writes root, feather fall, water walk and hover entries in that order,
  each only when the state holds (`Entities/Player/Player.cpp:11866-11912`);
  wow_messages agrees (`movement/smsg/smsg_multiple_moves.wowm:1-25`).
  A ghost that logs in gets one water-walk entry.
- `SMSG_START_MIRROR_TIMER` is the timer id, the value, the maximum, a
  signed `int32` scale, a `uint8` paused flag and a spell id
  (`Server/Packets/MiscPackets.cpp:101-111`).
- The scale is -1 while a timer drains and 10 while it refills
  (`Entities/Player/Player.cpp:909,935`). AzerothCore names the timer ids
  fatigue 0, breath 1 and fire 2 (`Entities/Player/Player.h:557-562`);
  wow_messages names 2 `FEIGN_DEATH`
  (`wow_message_parser/wowm/world/spell/spell_common.wowm`), and
  AzerothCore wins.
- At a death and at the release the server stops all three timers,
  whether a timer ran or not (`Entities/Player/Player.h:2088-2093`,
  `Entities/Player/Player.cpp:4551,4645`); the store fires `mirror_timer`
  only when a running timer stops.
- `CMSG_STANDSTATECHANGE` is a `uint32` state, and the server ignores
  every state but stand 0, sit 1, sleep 3 and kneel 8
  (`Handlers/MiscHandler.cpp:560-576`). It answers an accepted state with
  `SMSG_STANDSTATE_UPDATE` even when the state does not change
  (`Entities/Unit/Unit.cpp:12690-12701`), so `setStandState` settles `ok`
  without a send when the character already holds that state.

## Left out

- `SMSG_TRANSFER_ABORTED`: built by `self-state-4`.
- `SMSG_MOVE_SET_COLLISION_HGT`, `CMSG_MOVE_SET_COLLISION_HGT_ACK`,
  `SMSG_FORCE_PITCH_RATE_CHANGE`, `CMSG_FORCE_PITCH_RATE_CHANGE_ACK`,
  `CMSG_MOVE_TIME_SKIPPED` and `CMSG_MOVE_FALL_RESET`: built by
  `self-state-3`.
- `CMSG_SELF_RES`, `CMSG_CORPSE_MAP_POSITION_QUERY` and
  `SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE`: built by `self-state-7`.
- `CMSG_CANCEL_MOUNT_AURA`, `SMSG_DISMOUNT`, `CMSG_MOUNTSPECIAL_ANIM` and
  `SMSG_MOUNTSPECIAL_ANIM`: built by `self-state-6`.
- `SMSG_CROSSED_INEBRIATION_THRESHOLD`: built by `self-state-8`.

## Capabilities row

No verb yet; `recover how:"self"` and the mount verbs come with later
tasks.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_MOVE_UNSET_HOVER` | `live` | probe flow `selfstate-death` on a `fresh` character at East Sanctum, exit 0; received at death with counter 1, before `SMSG_FORCE_MOVE_ROOT` | `Entities/Unit/Unit.cpp:16261-16268` |
| `SMSG_MOVE_WATER_WALK` | `live` | probe flow `selfstate-death`, exit 0; received at the release, after the root | `Entities/Unit/Unit.cpp:16297-16302` |
| `SMSG_MOVE_LAND_WALK` | `live` | probe flow `selfstate-death`, exit 0; received at the reclaim | `Entities/Unit/Unit.cpp:16297-16302` |
| `CMSG_MOVE_HOVER_ACK` | `live` | the same run: a `max80` witness in view (probe `--expect MSG_MOVE_HOVER --expect MSG_MOVE_WATER_WALK`, exit 0) received one `MSG_MOVE_HOVER` relay of the ack | `Handlers/MiscHandler.cpp:1505-1520` |
| `CMSG_MOVE_WATER_WALK_ACK` | `live` | the same witness received two `MSG_MOVE_WATER_WALK` relays: the release ack with `WATERWALKING` and the reclaim ack without it | `Handlers/MiscHandler.cpp:1505-1520` |
| `SMSG_STANDSTATE_UPDATE` | `live` | probe flow `selfstate-stand` on an `eversong10` character, exit 0; received `01` after the sit and `00` after the stand | `Entities/Unit/Unit.cpp:12690-12701` |
| `CMSG_STANDSTATECHANGE` | `live` | probe flow `selfstate-stand`, exit 0; sent `01000000` and `00000000`, each answered by `SMSG_STANDSTATE_UPDATE` with the same state | `Handlers/MiscHandler.cpp:560-576` |
| `SMSG_START_MIRROR_TIMER` | `live` | probe `--wait 30 --expect SMSG_START_MIRROR_TIMER`, exit 0, after a login under the sea off Eversong; breath timer 1, value and maximum 60000, scale -1 | `Server/Packets/MiscPackets.cpp:101-111` |
| `SMSG_STOP_MIRROR_TIMER` | `live` | probe flow `selfstate-death --arg reclaim=no` on a `fresh` character at East Sanctum, exit 0; timers 0, 1 and 2 at the death and again at the release | `Server/Packets/MiscPackets.cpp:121-126` |
| `SMSG_PRE_RESURRECT` | `live` | the same run, exit 0; the self packed guid right after `CMSG_REPOP_REQUEST` | `Entities/Player/Player.cpp:4508-4512` |
| `SMSG_MOVE_SET_HOVER` | `mock` | `store.test.ts` "SMSG_MOVE_SET_HOVER and SMSG_MOVE_UNSET_HOVER become move_flag self events"; no normal-play trigger for a player | `Entities/Unit/Unit.cpp:16261-16268` |
| `SMSG_MOVE_FEATHER_FALL` | `live` | probe flow `selfstate-slowfall` on an `eversong10-mage` character with Slow Fall 130 and Light Feathers 17056, exit 0; received `03240e01000000` (counter 1) after `CMSG_CAST_SPELL` 130 | `Entities/Unit/Unit.cpp:16199-16214` |
| `SMSG_MOVE_NORMAL_FALL` | `live` | the same run; received `03240e02000000` (counter 2) when the 30 s aura expired | `Entities/Unit/Unit.cpp:16199-16214` |
| `CMSG_MOVE_FEATHER_FALL_ACK` | `live` | the same run; sent with counter 1, `FALLING_SLOW` and applied 1, then with counter 2, no flag and applied 0; the character stayed in the world until the logout | `Handlers/MiscHandler.cpp:1505-1520` |
| `SMSG_MULTIPLE_MOVES` | `live` | probe `--wait 20 --expect SMSG_MULTIPLE_MOVES` after `selfstate-death --arg reclaim=no`, exit 0; received `0a00000009de0003240e03000000` (one water-walk entry, counter 3) at the ghost's login and sent `CMSG_MOVE_WATER_WALK_ACK` with counter 3 and `WATERWALKING` | `Entities/Player/Player.cpp:11866-11912` |
| `SMSG_MOVE_GRAVITY_DISABLE` | `mock` | `store.test.ts` gravity pair test; only scripts call `SetDisableGravity` for a player (`src/server/scripts/Spells/spell_generic.cpp:2866`) | `Entities/Unit/Unit.cpp:16086-16119` |
| `SMSG_MOVE_GRAVITY_ENABLE` | `mock` | the same test | `Entities/Unit/Unit.cpp:16086-16119` |
| `CMSG_MOVE_GRAVITY_DISABLE_ACK` | `mock` | `control-flags.test.ts` gravity ack test | `Handlers/MiscHandler.cpp:1505-1520` |
| `CMSG_MOVE_GRAVITY_ENABLE_ACK` | `mock` | the same test | `Handlers/MiscHandler.cpp:1505-1520` |
| `SMSG_MOUNTRESULT` | `dead` | registered as `STATUS_NEVER` and no AzerothCore code writes it; mount failures arrive as `SMSG_CAST_FAILED` | `Server/Protocol/Opcodes.cpp:497` |
| `SMSG_RESURRECT_FAILED` | `dead` | registered as `STATUS_NEVER` and no AzerothCore code writes it | `Server/Protocol/Opcodes.cpp:725` |
| `SMSG_FORCED_DEATH_UPDATE` | `dead` | registered as `STATUS_NEVER` and no AzerothCore code writes it | `Server/Protocol/Opcodes.cpp:1021` |
| `CMSG_MOVE_SET_CAN_TRANSITION_BETWEEN_SWIM_AND_FLY_ACK` | `dead` | registered as `STATUS_NEVER` with `Handle_NULL` | `Server/Protocol/Opcodes.cpp:963` |
| `SMSG_PAUSE_MIRROR_TIMER` | `dead` | registered as `STATUS_NEVER`; its packet class is never constructed | `Server/Packets/MiscPackets.cpp:113` |
