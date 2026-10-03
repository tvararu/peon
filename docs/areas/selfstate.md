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
confirming field update that clears the mount adds no second event. A name
or position reread that still shows the mount before it is ignored. A fresh
mount-field update that still shows the mount is an authoritative remount,
even with the same display id and taxi bit; the `SMSG_DISMOUNT` path
handles the Brewfest mount transformation this way because removing the
mounted aura dismounts and the recast of the selected mount, even when it
matches the current one, sends the dismount first while the update carries
only the final values (`Entities/Unit/Unit.cpp:10301-10303`,
`Entities/Unit/Unit.cpp:10283-10290`).
`SMSG_MOUNTSPECIAL_ANIM`
for another guid fires `mount_anim`. The act `dismount` refuses
`not_mounted` and then `in_flight` without a send, otherwise sends the
empty `CMSG_CANCEL_MOUNT_AURA` and settles `ok` on `dismounted` or
`no_answer` after 2 s. The act `mountSpecialAnim` refuses `not_mounted`, otherwise sends the empty `CMSG_MOUNTSPECIAL_ANIM`.

The `spell` verbs `mount` and `dismount` ride out and get off again. `mount` refuses `already_mounted` from the state before any send, `no_mount` when no learned spell carries aura 78 (`SPELL_AURA_MOUNTED`), and maps the server's `affecting_combat`, `only_outdoors`/`no_mounts_allowed` and `only_abovewater` refusals to `in_combat`, `indoors` and `in_water`; with no spell it picks the learned ground mount (aura 78 without aura 207) with the highest speed, last learned first. It subscribes to `mounted` before the cast, casts through the spell `castFlow` on the self, and settles `ok` on the `mounted` event or `no_reply` after 2 s. `dismount` races the `dismount` act against its own abort, settling `DONE` on `ok`, the refusal reason on a refusal, and `UNCONFIRMED` `no_reply` with no answer. `look` and `[now]` add ", mounted" when the state is mounted.

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

## Condition

`state().condition` holds `drunkValue`, `drunkState`, `restedXp`,
`restState` and `resting`; `NO_CONDITION` is the empty value. Each datum has
one writer. `drunkState` is set only by the inebriation threshold packet,
which emits `drunk_changed { from, to, item }`; a packet that repeats the
stored state, names a state above 3 or comes from another guid does nothing.
`drunkValue` is read only from byte 1 of `PLAYER_BYTES_3`
(`Entities/Player/Player.h:514`). On the first read of the self object the
state is derived silently from the value with the server's thresholds (above
0 tipsy, 50 or more drunk, 90 or more smashed;
`Entities/Player/Player.cpp:1022-1028`) and emits no event, because the
value is saved with the character and a login can start drunk. Later field
changes move `drunkValue` only. `restedXp` is `PLAYER_REST_STATE_EXPERIENCE`
(`Entities/Player/Player.cpp:10409`), `resting` is bit 0x20 of `PLAYER_FLAGS`
(`Entities/Player/Player.h:464`) and `restState` is the high byte of
`PLAYER_BYTES_2`: `rested` 1, `normal` 2, `tired` 3, `tired_reduced` 4,
`exhausted` 5, `recruit_linked` 6, anything else `unknown`
(`Entities/Player/Player.h:978-983`). A field update that lacks a field keeps
the last value. The harness logs one `selfstate/drunk_changed` row per
change ("You feel tipsy.", "drunk.", "completely smashed.", "sober
again."; the strings are the client's, the server sends only the number)
and none for the silent first read. Death clears the value and so sends
state 0 (`Entities/Player/Player.cpp:1095`).

The server clears no stale `PLAYER_FLAGS_RESTING` bit on login: the flag is
saved with the character, `RemoveRestFlag` clears it only when its in-memory
mask was set, and the mask is not saved. A character teleported offline from
a capital city to the open country therefore logs in with `resting` true and
loses it only after it has been in a capital in the same session
(`Entities/Player/Player.cpp:16525`, `Entities/Player/PlayerUpdates.cpp:1355-1362`).
A capital city sets the flag through `AREA_FLAG_CAPITAL`
(`Entities/Player/PlayerUpdates.cpp:1355-1362`) and a tavern trigger through
`SetRestFlag` (`Handlers/MiscHandler.cpp:738`); the store reads the flag as
sent and does not guess which.

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
  health turns positive within 5 s or `no_answer` on silence.
- `SMSG_INITIAL_SPELLS` packs the `m_spells` map
  (`Entities/Player/Player.cpp:2796-2799`).
- `Player::CheckSkillLearnedBySpell` drops a stored spell whose skill line
  fits neither the race nor the class, logging that the row is deleted
  (`Entities/Player/Player.cpp:3233-3236`); the login spell load deletes
  the row from the character database
  (`Entities/Player/PlayerStorage.cpp:6678-6681`). A stored Reincarnation
  20608 row on a non-shaman never survives login, so `t6-selfstate-res`
  runs on the `eversong1-shaman` preset, an Orc shaman staged to the
  Eversong point at level 1, and its setup teaches 20608 and adds 1 Ankh
  17030 before the baseline.
- `Player::GetResurrectionSpellId` offers Reincarnation 21169 only when
  20608 is known, 21169 is off cooldown, and the Glyph of Renewed Life
  aura or 1 Ankh 17030 is held
  (`Entities/Player/Player.cpp:12958-12960`).
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
- `SMSG_CROSSED_INEBRIATION_THRESHOLD` is a full `u64` guid, a `u32` state
  (0 sober, 1 tipsy, 2 drunk, 3 smashed) and a `u32` item id. It goes to
  the whole set including the drinker, so the store drops another guid's
  packet, and it is sent only when the value crosses a state boundary
  (`Server/Packets/MiscPackets.cpp:128-135`,
  `Entities/Player/Player.cpp:1043-1055`).
- Control sends the swim and fly moves on request; routes across swim-depth water also swim on their own. The navigation liquid query reports the surface where the navmesh marks a liquid polygon, the planner follows that surface, and the route follower sends `MSG_MOVE_START_SWIM` on entering and `MSG_MOVE_STOP_SWIM` on leaving (`Handlers/MovementHandler.cpp:362-414`). A walk or `walkToward` still refuses `swimming` and `flying`; the server does not check the swim bit against the water, it flips its own in-water state to match (`Handlers/MovementHandler.cpp:651-656`). Shallow water under the swim-depth gate is waded, not swum. Predicted swim and flight motion also needs swim and flight speeds, which control does not store (the swim, flight and pitch rows of `SPEED_ACKS` have no field).

## Capabilities row

`spell do:"mount"` rides a learned ground mount and reports on `mounted`; `spell do:"dismount"` gets off and reports on `dismounted`. `recover how:"self"` comes with a later task.

Live proof (no new opcode): `t9-selfstate-mount` replica 6 of round 355 passed 6/6 with the ordering checks: `selfstate/mounted` at `gamelog.jsonl:21` precedes `nav/route_start` at `:25`, and `selfstate/dismounted` at `:34` follows `nav/route_end` (arrived) at `:29`. The round-355 gates in the same round read: `t1-walk-to-npc` replica 1 pass 2/2 (final truth 2.7 yd from Marniel), `t7-halt-resume` replica 1 pass 3/3 (no fight or movement between the stop and resume steers, then 3 Smite-only kills), `t3-ghostlands-kill` replica 1 fail 1/4 on the staged-DBC baseline cause (only gray L9-10 Ghostclaws in view, no kill credit, 0 kill XP; round-290 baseline showed the same level-10 gray cause). A `max80` Blood Elf at Tranquillien called `spell do:"mount"` and got `selfstate/mounted` (display id 19482), `travel` rode 55 yd to the flight master, and `spell do:"dismount"` gave `selfstate/dismounted`. A throwaway probe cast of Brown Horse 458 at Crossroads drew `SMSG_SPELL_GO`, `SMSG_MOVE_SET_COLLISION_HGT` and, after the cancel, `SMSG_DISMOUNT`; the same cast at Dalaran's start point drew `SMSG_CAST_FAILED` reason 93 `only_outdoors`, the `indoors` refusal. Replica 5 at Fairbreeze showed the server ending a mount (`SMSG_DISMOUNT`, no `CMSG_CANCEL_MOUNT_AURA` sent) during a walk to a vendor, cause not determined; the scenario avoids that place. Northrend has no navmesh in `~

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
| `SMSG_CROSSED_INEBRIATION_THRESHOLD` | `live` | probe flow `selfstate-drink --arg item=2594 --arg count=5 --expect SMSG_CROSSED_INEBRIATION_THRESHOLD` on a throwaway `eversong10` character with five Flagons of Mead staged by `soap setup items/add`, exit 0, `missing` empty; the trace of an earlier run of the same flow shows `021300000000000001000000220a0000`, `...02000000220a0000` and `...03000000220a0000`: the self guid, states 1, 2 and 3, item 2594; the store emitted `sober` to `tipsy`, `drunk` and `smashed`, each with item 2594, and ended at `drunkValue` 100 (traces not committed) | `Server/Packets/MiscPackets.cpp:128-135` |
| `PLAYER_FLAGS` resting bit, `restedXp` and `restState` fields | `live` | probe flow `selfstate-drink --arg rest=yes --arg seconds=45` on the same character after `soap gm tele SilvermoonCity` (offline): `resting` true, `restState` `rested`, `restedXp` 849 in every sample; `soap gm tele EversongWoods` issued online 22 s into the run: `resting` false from sample 22 on. A second account's login started `smashed` at `drunkValue` 93 with no event, the silent first read | `Entities/Player/PlayerUpdates.cpp:1355-1362` |

## Sent from control

Control sends the ten swim and fly moves as explicit actions on the
world handle: `setSwimming(on)`, `pitch("up" | "down" | "stop" | radians)`,
`setFlying(on)`, `ascend("start" | "stop")` and `descend()`. Each one
writes the packed self guid and the movement info with its flag bit set
(`SWIMMING`, `PITCH_UP`, `PITCH_DOWN`, `FLYING`, `ASCENDING`,
`DESCENDING`); the info carries the pitch float while `SWIMMING` or
`FLYING` is set, as `ReadMovementInfo` reads it
(`Server/WorldSession.cpp:1130-1131`). All ten opcodes go through
`HandleMovementOpcodes`, which relays the info to the players in view
(`Server/Protocol/Opcodes.cpp:322-324,333-334,350,969,988-989,1066`,
`Handlers/MovementHandler.cpp:362-414`). A send changes the stored flags
first, so the bit stays in every later move until the matching stop.
Entering or leaving the water or the air first stops a walk in progress.

A send is refused with the control reason when the character is
teleporting, in a taxi flight, rooted, without control or
`DISABLE_MOVE`. A pitch needs `SWIMMING` or `FLYING` (`not_swimming_or_flying`)
and a value within half a turn of level (`invalid_pitch`); `setFlying(true)`
needs `CAN_FLY` from `SMSG_MOVE_SET_CAN_FLY` (`cannot_fly`); ascend and
descend need `FLYING` (`not_flying`). A descend ends with
`MSG_MOVE_STOP_ASCEND`, since there is no stop-descend opcode
(`Server/Protocol/Opcodes.cpp:988-989,1066`).

`ReadMovementInfo` strips `FLYING` and `CAN_FLY` from a player move
when the mover has no flight aura
(`Server/WorldSession.cpp:1212-1213`).

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `MSG_MOVE_START_SWIM` | `live` | probe flow `selfstate-swim --arg lead=6000` on an `eversong10` character at the deep-water point off Eversong (map 530, 9251.47 -6340.63 -16.8), exit 0 and no disconnect; a second `eversong10` witness 2 yd away (probe `--wait 60 --expect`, exit 0) received one relay | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_STOP_SWIM` | `live` | the same run; the witness received one relay 6 s after the start | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_START_PITCH_UP` | `live` | the same run; one relay | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_START_PITCH_DOWN` | `live` | the same run; one relay | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_STOP_PITCH` | `live` | the same run; two relays, one after each pitch | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_SET_PITCH` | `live` | the same run; one relay of the 0.25 rad pitch | `Handlers/MovementHandler.cpp:362-414` |
| `CMSG_MOVE_SET_FLY` | `live` | probe flow `selfstate-swim --arg mode=fly --arg spell=32243` on a `max80` character in Nagrand with 33388, 33391, 34090 and the Tawny Wind Rider 32243 staged offline via `spells/learn`, exit 0; the witness (a second `eversong10` character beside it) received two relays, takeoff and landing, and `MSG_MOVE_UPDATE_CAN_FLY` showed the server had granted flight | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_START_ASCEND` | `live` | the same run; one relay | `Handlers/MovementHandler.cpp:362-414` |
| `MSG_MOVE_STOP_ASCEND` | `live` | the same run; two relays, the end of the climb and the end of the descent | `Server/Protocol/Opcodes.cpp:988-989` |
| `MSG_MOVE_START_DESCEND` | `live` | the same run; one relay, 1 ms after the end of the climb | `Server/Protocol/Opcodes.cpp:1066` |
