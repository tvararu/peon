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

The store keeps the stand state, the fatigue, breath and fire timers,
whether a ghost is pending, and the self-resurrection spell from the self
`PLAYER_SELF_RES_SPELL` field. The spell id is restored at death and
cleared on the return to life; the first non-zero value fires
`self_res_available` with the spell's name from the combat catalog. The stand state starts from byte 0 of the
self `UNIT_FIELD_BYTES_1` and follows `SMSG_STANDSTATE_UPDATE`;
`stand_changed` fires on a change only. `SMSG_START_MIRROR_TIMER` and
`SMSG_STOP_MIRROR_TIMER` fill and clear a timer and fire `mirror_timer`.
`breath_low` fires once when a draining breath timer falls to 10 s.
`SMSG_PRE_RESURRECT` for the self guid sets `ghostPending` and fires
`ghost_pending`; the ghost bit 0x10 of the self `PLAYER_FLAGS` clears it.
The act `setStandState` sends `CMSG_STANDSTATECHANGE` for stand, sit,
sleep or kneel and settles `ok` on the reply, `refused` with
`invalid_state` for any other state, or `no_answer` after 2 s.

The store reads the mount from the self `UNIT_FIELD_FLAGS` and
`UNIT_FIELD_MOUNTDISPLAYID`: `mounted` is the `UNIT_FLAG_MOUNT` bit with a
non-zero display id, and either alone is not a mount. The first reading,
such as a login while mounted, sets the state without an event. Each
change fires `mounted` (with the display id) or `dismounted`, and both
carry `taxi`, true when `TAXI_FLIGHT` is set in the update that mounts or
in the state before the one that dismounts, since a taxi flight mounts the
character too. A self `SMSG_DISMOUNT` clears the state at once, so the
field update that follows adds no second event. `SMSG_MOUNTSPECIAL_ANIM`
for another guid fires `mount_anim`. The act `dismount` refuses
`not_mounted` and then `in_flight` without a send, otherwise sends the
empty `CMSG_CANCEL_MOUNT_AURA` and settles `ok` on `dismounted` or
`no_answer` after 2 s. The act `mountSpecialAnim` refuses `not_mounted`,
otherwise sends the empty `CMSG_MOUNTSPECIAL_ANIM`.

The harness area turns the breath and transfer events into game-log rows:
a started breath timer wakes the agent with `selfstate/under_water` and
the seconds left, the stop logs `selfstate/surfaced`, `breath_low` wakes
it to surface, and a refused transfer wakes it with
`selfstate/transfer_aborted`, naming the map id and the reason in words.
`stand_changed` and `ghost_pending` write no row, and reattaching with a
draining breath timer rewrites the under-water row. `self_res_available`
logs `selfstate/self_res_available`: "You can come back where you died
(<name>)." `mounted` and `dismounted` log `selfstate/mounted` and
`selfstate/dismounted`, except for a taxi flight, which `travel` already
describes; `dismount` is a world act.

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
- `SMSG_MOVE_SET_COLLISION_HGT` is the packed guid, a `uint32` counter and
  the `f32` height (`Entities/Unit/Unit.cpp:10272-10275`). The store keeps
  the height and forwards `collision_height` to control, which acks with
  the packet's counter and height and no motion abort
  (`Handlers/MovementHandler.cpp:689-693`); the server relays the ack to
  the players in view as `MSG_MOVE_SET_COLLISION_HGT`. Every mount and
  dismount changes the height, so the probe flow `selfstate-mount` casts
  a mount spell and waits for it.
- `SMSG_FORCE_PITCH_RATE_CHANGE` is the packed guid, a `uint32` counter
  and the `f32` rate (`Entities/Unit/Unit.h:661`). It joins the
  speed-ack loop, and control echoes the packet's value in
  `CMSG_FORCE_PITCH_RATE_CHANGE_ACK`, since an ack above the server's
  rate kicks (`Handlers/MovementHandler.cpp:765-777`). Nothing changes a
  player's pitch rate on this server, so the pair stays `mock` and not
  seen live.
- `CMSG_MOVE_TIME_SKIPPED` is the packed guid and a `uint32` of skipped
  ms (`Handlers/MovementHandler.cpp:894-901`); the server adds the ms to
  the mover's time and relays it as `MSG_MOVE_TIME_SKIPPED`. Control
  sends it through `timeSkipped` with no automatic caller.
- `CMSG_MOVE_FALL_RESET` is the packed guid and the movement info
  (`Handlers/MovementHandler.cpp:362-381,399`); control sends it through
  `resetFall` with `fallTime` 0 and `FALLING` cleared, also with no
  automatic caller.
- `CMSG_SELF_RES` is empty. The server casts the stored
  `PLAYER_SELF_RES_SPELL` on the sender and clears it, refusing silently
  under a no-resurrection aura (`Handlers/SpellHandler.cpp:707-721`), so
  the act `selfResurrect` refuses `not_dead` when the character is alive
  and `no_self_res` when the field is 0, then settles `ok` when the self
  health turns positive within 5 s or `no_answer` on silence. Two live
  tries on a `fresh` level-1 character at Fairbreeze never died, and
  the character did not know Reincarnation 20608: its login
  `SMSG_INITIAL_SPELLS` listed 39 spells without it and no
  `SMSG_LEARNED_SPELL` arrived, so the staging did not apply. The Ankh
  17030 was present (not seen live).
- The login spell send `SMSG_INITIAL_SPELLS` rebuilds from the stored
  spells, so the offline `spells/learn` of a Shaman spell on a priest
  preset never sticks: its next login has no Reincarnation row, and the
  first `t6-selfstate-res` run (round 68, not committed) showed it. The
  priest died, `recover how:"self"` refused `no_self_res` twice, and the
  final truth had no spells. `Player::SendInitialSpells` packs
  `SMSG_INITIAL_SPELLS` from `m_spells`
  (`Entities/Player/Player.cpp:2789-2800`); the delete of the row happens
  in the login spell load, which the scenario's blockedBy names. The eval
  may not use GM commands, so a Shaman preset or a Warlock partner is
  needed.
- `CMSG_CORPSE_MAP_POSITION_QUERY` is a `uint32` 0
  (`Server/Packets/QueryPackets.cpp:55-58`); the server answers with four
  `f32`, always zero in AzerothCore
  (`Handlers/QueryHandler.cpp:399-409`). The act
  `queryCorpseMapPosition` sends the query and settles `ok` with the four
  floats or `no_answer` after 3 s. Live: sent `00000000` (4 bytes),
  received 32 zero hex chars (16 bytes).
- `UNIT_FLAG_MOUNT` is 0x08000000 (`Entities/Unit/UnitDefines.h:284`).

- `Unit::Dismount` clears `UNIT_FIELD_MOUNTDISPLAYID` and the flag, then
  sends `SMSG_DISMOUNT`, a packed guid, to the set including the rider
  (`Entities/Unit/Unit.cpp:10283-10303`). The height packet comes first
  and the field update last, so the store also clears on the packet.
- `CMSG_CANCEL_MOUNT_AURA` is empty. The server answers a character on
  foot or in flight with a system message and nothing else, and otherwise
  dismounts and removes the mount auras
  (`Handlers/MiscHandler.cpp:1475-1494`).
- `SMSG_MOUNTSPECIAL_ANIM` is a full `u64` guid, not packed. The server
  relays the empty `CMSG_MOUNTSPECIAL_ANIM` to the set without the sender,
  so the rider never sees its own packet and `mount_anim` needs a witness
  (`Handlers/MovementHandler.cpp:816-822`).
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
| `SMSG_MOVE_GRAVITY_DISABLE` | `mock` | `store.test.ts` gravity pair test; only mount-check scripts call `SetDisableGravity` for a player, so the server never sent it (not seen live) | `Entities/Unit/Unit.cpp:16107-16114` |
| `SMSG_MOVE_SET_COLLISION_HGT` | `live` | probe flow `selfstate-mount` (default spell 458, Brown Horse) on a throwaway `eversong10` character with 33388 and 458 staged offline via `spells/learn`: `CMSG_CAST_SPELL` drew `SMSG_SPELL_GO` then `SMSG_MOVE_SET_COLLISION_HGT` and `SMSG_AURA_UPDATE`, and the cancel drew `SMSG_AURA_UPDATE`, `SMSG_MOVE_SET_COLLISION_HGT` and `SMSG_DISMOUNT` | `Entities/Unit/Unit.cpp:10272-10275` |
| `CMSG_MOVE_SET_COLLISION_HGT_ACK` | `live` | the same `selfstate-mount` run: the trace shows `CMSG_MOVE_SET_COLLISION_HGT_ACK` after each height packet, once for the mount and once for the dismount | `Handlers/MovementHandler.cpp:689-693` |
| `SMSG_FORCE_PITCH_RATE_CHANGE` | `mock` | `protocol.test.ts` pitch-rate case through the speed acks; nothing on this server changes a player's pitch rate (not seen live) | `Entities/Unit/Unit.h:661` |
| `CMSG_FORCE_PITCH_RATE_CHANGE_ACK` | `mock` | `control-flags.test.ts` pitch-rate case, echoing the packet value; nothing on this server changes a player's pitch rate (not seen live) | `Handlers/MovementHandler.cpp:765-777` |
| `CMSG_MOVE_TIME_SKIPPED` | `builder` | sent live with `buildTimeSkipped` over the self guid (probe `--send`, exit 0, no disconnect) while a second `max80` witness ran concurrently with `--expect MSG_MOVE_TIME_SKIPPED`; the witness logged in and stayed in view but the relay never arrived, so only the send was accepted without observed effect | `Handlers/MovementHandler.cpp:894-901` |
| `CMSG_MOVE_FALL_RESET` | `builder` | sent live with the current position (probe `--send`, exit 0, no disconnect); the truth position after logout matched, so the server accepted it but the effect was not seen | `Handlers/MovementHandler.cpp:362-381,399` |
| `CMSG_MOVE_SET_CAN_TRANSITION_BETWEEN_SWIM_AND_FLY_ACK` | `dead` | registered as `STATUS_NEVER` with `Handle_NULL` | `Server/Protocol/Opcodes.cpp:963` |
| `SMSG_PAUSE_MIRROR_TIMER` | `dead` | registered as `STATUS_NEVER`; its packet class is never constructed | `Server/Packets/MiscPackets.cpp:113` |
| `SMSG_TRANSFER_ABORTED` | `mock` | `store.test.ts` transfer-aborted tests; one live try teleported into a non-raid dungeon and gave no abort, since GM tele bypasses `PlayerCannotEnter` (not seen live) | `Entities/Player/Player.cpp:11956-11972` |
| `CMSG_SELF_RES` | `mock` | `runtime-selfres.test.ts` send/refusal/timeout/dispose cases from the writer shape; two live tries on a `fresh` level-1 character at Fairbreeze never died, and the spell was not known: the login `SMSG_INITIAL_SPELLS` had 39 spells without Reincarnation 20608 and no `SMSG_LEARNED_SPELL` arrived, while the Ankh 17030 was present (not seen live; runs not committed) | `Handlers/SpellHandler.cpp:707-721` |
| `CMSG_CORPSE_MAP_POSITION_QUERY` | `live` | probe `--send CMSG_CORPSE_MAP_POSITION_QUERY --body 00000000 --expect SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE --bodies` on a `fresh` character, exit 0; sent `00000000` (4 bytes, not committed) | `Server/Packets/QueryPackets.cpp:55-58` |
| `CMSG_CANCEL_MOUNT_AURA` | `live` | probe flow `selfstate-mount` on a throwaway `max80` Blood Elf priest teleported to Durotar (Dalaran refuses the cast as indoors) with 33388 and 458 staged offline via `spells/learn`, exit 0; `act.dismount()` sent the empty packet (0 bytes) and settled `ok` (trace not committed) | `Handlers/MiscHandler.cpp:1475-1494` |
| `SMSG_DISMOUNT` | `live` | the same run; received `032411` (packed guid of the rider) after the second `SMSG_MOVE_SET_COLLISION_HGT`, and the store emitted one `dismounted` | `Entities/Unit/Unit.cpp:10283-10303` |
| `CMSG_MOUNTSPECIAL_ANIM` | `live` | partner B on a second `max80` in the same Durotar spot ran `selfstate-mount --arg special=1`, exit 0; sent the empty packet once after mounting and the flow reported `special: ok` (trace not committed) | `Handlers/MovementHandler.cpp:816-822` |
| `SMSG_MOUNTSPECIAL_ANIM` | `live` | partner A, watching with `--wait 45 --expect SMSG_MOUNTSPECIAL_ANIM`, exit 0; received `2511000000000000` (8 bytes, B's guid as a full `u64`) in the same millisecond B sent the request (trace not committed) | `Handlers/MovementHandler.cpp:816-822` |
| `SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE` | `live` | the same run; received 32 zero hex chars (16 bytes, not committed) | `Handlers/QueryHandler.cpp:399-409` |
