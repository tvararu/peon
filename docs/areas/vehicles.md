# vehicles

The `vehicles` area passively records vehicle state: which units are
vehicles (`SMSG_PLAYER_VEHICLE_DATA`), which units ride on another unit
(`SMSG_MONSTER_MOVE_TRANSPORT`), and the ride-aura cancel
(`SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`). The store keeps
`vehicleIds` per guid and `passengers` per rider; control and the
`vehicle` tool arrive in later tasks. The area also peeks
`SMSG_UPDATE_OBJECT` and `SMSG_COMPRESSED_UPDATE_OBJECT` create and
movement blocks for `UPDATEFLAG_VEHICLE`, and a peeked
`SMSG_DESTROY_OBJECT` or `outOfRange` entry drops the guid again.

Seat requests are the `VehiclesActs`: `spellClick(guid)`, `exitVehicle()`,
`nextSeat()`, `prevSeat()`, `switchSeat(seat)`, `enterPlayerVehicle(guid)`,
`ejectPassenger(guid)`, and the two controlled forms
`changeSeatOnControlled(accessory, seat)` and `dismissControlled()` (see
"Driving a controlled vehicle"). The server never answers a refused request
with an error packet (`Handlers/VehicleHandler.cpp:76,171,240`), so each
act resolves `ok` on its server effect and `no_answer` after 3 s. Local
refusals send nothing: `not_clickable` (the unit lacks
`NPC_FLAG_SPELLCLICK`, `0x01000000`, which the vehicle kit sets at runtime,
`Entities/Vehicle/Vehicle.cpp:54-56,158,395-397`), `not_seated` (a seat
request or exit without a seat), `not_controlling` (a controlled form
without control of the vehicle) and `not_a_vehicle` (`ejectPassenger`
while the character's own guid has no vehicle id: the handler logs an
error line for a non-vehicle sender, `Handlers/VehicleHandler.cpp:167-173`).
A seat is the store's `seat`.

Resolution signals: `spellClick` and `enterPlayerVehicle` resolve on the
character's own `SMSG_MONSTER_MOVE_TRANSPORT` carrying
`SPLINEFLAG_TRANSPORT_ENTER`; `exitVehicle` on the next `control_changed`
core event with no reason (or, while controlling, with reason `vehicle` and no
mover) (the server sends `SMSG_CLIENT_CONTROL_UPDATE`
and `SMSG_FORCE_MOVE_UNROOT`, `Entities/Unit/Unit.cpp:14094`);
`ejectPassenger` on a plain `SMSG_MONSTER_MOVE` of that passenger with
`SPLINEFLAG_TRANSPORT_EXIT`. The area peeks `SMSG_MONSTER_MOVE` only to
turn such an exit into a `spline` event (seat `-1`) and drop the
passenger; other moves change nothing. The seat changes resolve on the
character's own spline with another seat.

## Seat in control

The character's own `SMSG_MONSTER_MOVE_TRANSPORT` without
`SPLINEFLAG_TRANSPORT_EXIT` fills `seat` (`vehicle`, `seat`, `entry` from
the vehicle's entity when known, `controlling: false`) and emits
`entered { vehicle, seat, entry, offset, facing, splineId, duration }`; the offset
is the last point of the boarding spline and `facing` is the spline's final
angle or zero. A second spline on the same
vehicle with another seat emits `seat_changed { vehicle, seat, offset, facing,
splineId, duration }`; the plain
`SMSG_MONSTER_MOVE` with `SPLINEFLAG_TRANSPORT_EXIT` clears `seat` and emits
`exited`. The runtime forwards `entered` and `seat_changed` to control as `vehicle_seat` (with
the vehicle's entity pose when known) and `exited` as `vehicle_left`.

Control keeps one `RideState` (`control-ride.ts`). While seated every
outgoing movement info and ack carries the on-transport flag, the vehicle
guid, the seat, the seat offset and the boarding facing; free movement stays
refused with the `transport` reason. The server drops every mover packet
during the boarding spline except the root and unroot acks
(`Handlers/MovementHandler.cpp:544-559`), so control sends only acks until
the spline's duration has passed. The facing comes from the seat orientation
(`Entities/Vehicle/Vehicle.cpp:414,454-466`); the pose is the vehicle's
position plus the seat offset turned by its orientation, with the facing
added (`Entities/Unit/Unit.cpp:734-750`).
A transport teleport keeps the ride's timer cleared but carries the
destination transport block, because the server near-teleports transport
passengers without leaving the transport
(`Entities/Transport/Transport.cpp:623-633`,
`Entities/Unit/Unit.cpp:15546-15550`,
`Entities/Player/Player.cpp:1479-1490`); a transport-free teleport drops the
block. The server sets the seat when the
passenger enters (`Entities/Unit/Unit.cpp:15203-15259`). A seat change
removes and re-adds the passenger, so it starts a new boarding spline and
control replaces the ride (`Entities/Unit/Unit.cpp:15265-15281`).

Once, after the duration, control sends `CMSG_MOVE_SPLINE_DONE`: the packed
guid, the movement info and the spline id, the read order of
`Handlers/TaxiHandler.cpp:204-214`.

A self create block whose movement info has `ON_TRANSPORT` on a unit or
vehicle guid (high `0xF130` or `0xF150`) seats the character the same way,
with no boarding spline: `entered` carries `splineId: undefined`, and
control sends no spline-done packet for it. The server writes that
transport block for any living unit in a create block
(`Entities/Unit/Unit.cpp:15462-15486`). Not seen live: AzerothCore removes a
player from a vehicle at logout, so no login reached it; the `areaRig` test
uses the writer's layout.

## Driving a controlled vehicle

The server charms the vehicle for the boarding player and gives the client
control of it (`Entities/Unit/Unit.cpp:14322-14340`).

The control update is `SMSG_CLIENT_CONTROL_UPDATE { guid, allow }`
(`Entities/Player/Player.cpp:13151-13175`). Control adopts a non-self guid as
mover only when it equals the ride's vehicle; the update can arrive before
the seat, so control remembers it and adopts it when the seat lands. Any
other guid keeps the old refusal, because possess, mind control and pets
send the same packet.

Adopting the vehicle sends `CMSG_MOVE_NOT_ACTIVE_MOVER` for the character
with its movement info, then `CMSG_SET_ACTIVE_MOVER` for the vehicle;
losing it sends the same pair the other way. The server reads
`CMSG_SET_ACTIVE_MOVER` as a full `u64` and only logs a mismatch
(`Handlers/MovementHandler.cpp:780-793`).

The server drops `CMSG_MOVE_NOT_ACTIVE_MOVER` unless its guid is the current
mover (`Handlers/MovementHandler.cpp:795-814`), so the first packet of the
gaining pair is dropped and the second matches.

While the vehicle is the mover, every movement packet and ack carries the
vehicle's packed guid, its pose, its run speed from the create block, and
no transport block. The movement flags drop `ON_TRANSPORT` but keep the
driven root: the server roots the passenger on boarding
(`Entities/Vehicle/Vehicle.cpp:449`), which does not root the vehicle, so
the character's own root never blocks driving and stays set for the
character until its unroot arrives, while a root naming the vehicle refuses
its movement (`Entities/Player/Player.cpp:13179-13182`,
`Entities/Unit/Unit.cpp:14094-14097`). Forced gravity, hover, water walking
and feather fall packets naming the driven vehicle are acknowledged under
the vehicle guid and adopted into its driven flags, because the server sends
them to the controlling player with the creature guid
(`Entities/Unit/Unit.cpp:16105-16114`); a gravity disable then refuses
ground movement until the enable returns, and packets for unrelated guids
stay dropped. The runtime reads the
vehicle's pose from its entity and its speeds and movement flags from the
peeked create block, because the entity store keeps no speeds, and hands
them to control as `mover_state` when `ControlState.mover` becomes the seat
vehicle. Unsupported-motion checks then read the driven flags, so a vehicle
already carrying `CAN_FLY` or `FLYING` stays refused for ground movement.
`ControlState.mover` is the guid being driven, or `undefined`, and
`control_changed` with reason `vehicle` fires when it changes. The
character's own run speed and run-back speed return when the vehicle is
lost, and self observations (position, speeds) do not move the driven pose.
`seat.controlling` follows the `control` core event for the seat vehicle and
the area emits `control { mover, allow }` on each change.

The dismiss form, `CMSG_DISMISS_CONTROLLED_VEHICLE`, is the packed vehicle
guid plus the movement info, the same bytes as a plain move; the server
checks that the guid is its mover, applies the movement info and exits the
vehicle (`Handlers/VehicleHandler.cpp:26-59`). wow_messages describes an
empty body (`vehicle/cmsg_dismiss_controlled_vehicle.wowm:1-3`); AzerothCore
wins.

`exitVehicle` while controlling sends the dismiss form through the
`mover_packet` self event and resolves when control returns. The server then
returns control to the character and exits the vehicle
(`Entities/Unit/Unit.cpp:14454-14456`): control updates for the vehicle with
allow 0 and for the character with allow 1, the unroot, and the exit spline.

`CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE` is the dismiss form followed by a
packed accessory guid and an `int8` seat. An accessory of 0 asks for the
previous seat (seat at most 0) or the next (seat above 0); a real accessory
clicks that unit's empty seat (`Handlers/VehicleHandler.cpp:89-121`).
wow_messages has a `u8` seat; AzerothCore wins. The request resolves on the
character's own spline for another seat of the same vehicle when the
accessory is 0, and on the boarding spline for the accessory vehicle and
seat otherwise.

`CMSG_MOVE_NOT_ACTIVE_MOVER` is the packed guid and the movement info
(`Handlers/MovementHandler.cpp:795-814`), where wow_messages has a full guid
(`movement/cmsg/cmsg_move_not_active_mover.wowm:3-6`).

Flying vehicles stay refused (`unsupportedReason`); the Horde Siege Tank
(25334) is ground only.


In the harness, `entered` and `control` each write a `wake` row, `exited`, `seat_changed`
and `player_vehicle` and `ride_aura_cancel` each write a `log` row, and
`attach` writes one `log` row for a character already seated; `spline`
writes none (the spline flood guard).

## Wire notes

- `SMSG_MONSTER_MOVE_TRANSPORT` is the packed guid, the packed transport
  guid, an `int8` seat, then the common move body, which starts with its
  own `uint8(0)`, the start point and the spline id
  (`Movement/Spline/MoveSplineInit.cpp:114-124`). The seat is signed: a
  byte of `0xff` reads `-1`. wow_messages describes the same packet with
  one byte fewer
  (`wow_message_parser/wowm/world/movement/smsg/smsg_monster_move_transport.wowm:21-49`);
  AzerothCore wins.
- `SMSG_PLAYER_VEHICLE_DATA` is the packed guid and a `u32` vehicle id;
  `0` means the unit is no longer a vehicle
  (`Entities/Unit/Unit.cpp:10242-10245,10309-10312`). The cancel-aura
  packet carries no body and is sent to the entering player only
  (`Entities/Unit/Unit.cpp:10247-10248`).

- Request bodies, from the AzerothCore readers: `CMSG_SPELLCLICK`,
  `CMSG_PLAYER_VEHICLE_ENTER` and `CMSG_CONTROLLER_EJECT_PASSENGER` carry a
  full `u64` guid (`Handlers/SpellHandler.cpp:723-739`,
  `Handlers/VehicleHandler.cpp:143-163,165-227`);
  `CMSG_REQUEST_VEHICLE_SWITCH_SEAT` carries a packed guid and an `int8`
  seat (`Handlers/VehicleHandler.cpp:122-137`), where wow_messages has a
  full guid and a `u8` (`vehicle/cmsg_request_vehicle_switch_seat.wowm:1-6`);
  AzerothCore wins. `CMSG_REQUEST_VEHICLE_EXIT`, `_PREV_SEAT` and
  `_NEXT_SEAT` have empty bodies (`Handlers/VehicleHandler.cpp:61-88,229-244`).
- `CMSG_PLAYER_VEHICLE_ENTER` is refused silently unless both players are
  in the same group (`IsInRaidWith`), within `INTERACTION_DISTANCE`, and
  outside an arena (`Handlers/VehicleHandler.cpp:143-163`).
- Click targets. The plan's Wintergarde Gryphon 27661 (spell 48365) is
  refused with `SMSG_CAST_FAILED` result 12 (`SPELL_FAILED_BAD_TARGETS`)
  for a Horde `max80` standing next to it: the keep is Alliance. The
  7th Legion Chain Gun 27714 (spell 49584, `NullCreatureAI`,
  `SQL/npc_spellclick_spells.sql`) at (3664.0, -1208.5, 102.42) on map 571
  accepts the click. The Refurbished Shredder 27496 (spell 48881) answers
  `SMSG_CAST_FAILED` result 100 (`SPELL_FAILED_REAGENTS`): it needs the
  key item 37500.
- Stage a ride-with proof away from hostile guards. At the Wintergarde
  spawn a Horde character is attacked and dies; the proof used Warsong
  Hold (2792.0, 6738.5, 8.0). A character killed by a run stays a ghost
  at the next login until `soap setup <ACCOUNT> life` sets `alive`.

## Left out

- The `SMSG_COMPRESSED_MOVES` allow-list entry: AzerothCore registers the
  opcode as `STATUS_NEVER` and never writes it
  (`Server/Protocol/Opcodes.cpp:894`).

## Capabilities row

`vehicle` (vehicles-5): "Get on a vehicle by clicking it and get off", proven by the eval `t8-vehicles-board` (round 368, run `tmp/evals/368/t8-vehicles-board-1`, verdict `pass`, 4 of 4 checks). The agent called `vehicle` `board` on the 7th Legion Chain Gun (27714, spell-click) and then `vehicle` `leave`; the game log holds `vehicles/entered` (seat 0, guid `0xf150006c42003dd1`) and, on a later line, `vehicles/exited` for the same guid. The scenario uses the chain gun and not the Wintergarde Gryphon 27661, because the Gryphon refuses a Horde character (see "Click targets"). The tool's `seat`, `ride_with` and `eject` verbs have unit tests with fake acts and no scenario. Regressions after the tool landed, round 368: `t1-walk-to-npc` pass (2 of 2) and `t7-halt-resume` pass (3 of 3).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_PLAYER_VEHICLE_DATA` | `live` | `mise protocol:probe --flow vehicles-mount --arg spell=61470 --expect SMSG_PLAYER_VEHICLE_DATA --bodies` on a `max80` standing outdoors in Northrend (in Dalaran the cast failed `SPELL_FAILED_ONLY_OUTDOORS`), exit 0; the two bodies are `0331113b010000` (id 315) on the mount and `03311100000000` (id 0) on the aura cancel, and the store emitted `player_vehicle` | `Entities/Unit/Unit.cpp:10242-10245` |
| `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA` | `live` | same run, `--expect SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`, exit 0; the empty body arrived in the same batch as the first vehicle data (on entering the mount), and the store emitted `ride_aura_cancel` | `Entities/Unit/Unit.cpp:10247-10248` |
| `SMSG_MONSTER_MOVE_TRANSPORT` | `live` | flow `vehicles-click` (`--arg entry=27714`, a `max80` Horde next to a 7th Legion Chain Gun), run `tmp/probe/click11`: after `out CMSG_SPELLCLICK` the trace holds `in SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`, `in SMSG_CLIENT_CONTROL_UPDATE` and the self boarding spline, body `035111dbd13d426c50f100003333b3bf000000000000000081fff92804000000000000800001000000010000003333b3bf0000000000000000` (seat 0, flags `TRANSPORT_ENTER`, parsed in `area.test.ts`); the ride-with run `tmp/probe/ride9` holds the partner's boarding spline for `0x1153` on transport `0x1155` | `Movement/Spline/MoveSplineInit.cpp:114-124` |
| `CMSG_SPELLCLICK` | `live` | `tmp/probe/click11`: `out CMSG_SPELLCLICK` body `d13d00426c0050f1` (the chain gun's guid), then the cancel aura, the control update and the boarding spline above; the flow returned `board: ok`. Two earlier tries at 27661 and 27496 got `SMSG_CAST_FAILED` (`tmp/probe/click4`, `click6`) | `Handlers/SpellHandler.cpp:723-739` |
| `CMSG_REQUEST_VEHICLE_EXIT` | `live` | `tmp/probe/click12`: `out CMSG_REQUEST_VEHICLE_EXIT` (empty body) 21 ms after `out CMSG_SPELLCLICK`, then `in SMSG_CLIENT_CONTROL_UPDATE`, `in SMSG_FORCE_MOVE_UNROOT` and `in SMSG_FORCE_MOVE_UNROOT` (body `03511103000000`); the flow returned `exit: ok` | `Handlers/VehicleHandler.cpp:229-244` |
| `CMSG_PLAYER_VEHICLE_ENTER` | `live` | `tmp/probe/ride9` (A and B `max80`, A mounted spell 61470 at Warsong Hold, A invited B, B ran `call acceptInvite` then `call enterPlayerVehicle ["4437"]`): A's trace holds `in SMSG_MONSTER_MOVE_TRANSPORT` for B (`0x1153`, transport `0x1155`, seat 0, `TRANSPORT_ENTER`), the flow returned `boarded: 0x1153`; B's own trace (`tmp/probe/ride12/partner-packets.jsonl`) holds `out CMSG_PLAYER_VEHICLE_ENTER` then the cancel aura and the boarding spline | `Handlers/VehicleHandler.cpp:143-163` |
| `CMSG_CONTROLLER_EJECT_PASSENGER` | `live` | `tmp/probe/ride9`: `out CMSG_CONTROLLER_EJECT_PASSENGER` body `5311000000000000` (B's guid), then a plain `in SMSG_MONSTER_MOVE` for B with flags `0x01000000` (`TRANSPORT_EXIT`) and `SMSG_AURA_UPDATE` slot removals; the flow returned `eject: ok`. B boarded again right after because its enter loop kept running | `Handlers/VehicleHandler.cpp:165-227` |
| `CMSG_REQUEST_VEHICLE_NEXT_SEAT`, `CMSG_REQUEST_VEHICLE_PREV_SEAT`, `CMSG_REQUEST_VEHICLE_SWITCH_SEAT` | `builder` | sent live, effect not seen. B, seated on the Grand Ice Mammoth, ran `call nextSeat`, `call prevSeat` and `call switchSeat [2]` in two runs (`tmp/probe/ride11`, `tmp/probe/ride12`); B's trace `tmp/probe/ride12/partner-packets.jsonl` holds `out CMSG_REQUEST_VEHICLE_NEXT_SEAT` (size 0), `out CMSG_REQUEST_VEHICLE_PREV_SEAT` (size 0) and `out CMSG_REQUEST_VEHICLE_SWITCH_SEAT` (size 4: packed guid `03 55 11` and the seat byte) with no disconnect and no seat spline in return. Builder bytes: `protocol.test.ts` | `Handlers/VehicleHandler.cpp:61-88,122-137` |

| `CMSG_MOVE_SPLINE_DONE` (boarding) | `live` | flow `vehicles-click --arg entry=27714` on a `max80` at (3664.0, -1208.5, 102.5) on map 571, run `tmp/probe/seat-v3a`: after `out CMSG_SPELLCLICK` the trace holds `in SMSG_CLIENT_CONTROL_UPDATE`, `out CMSG_FORCE_MOVE_ROOT_ACK` twice, `in SMSG_MONSTER_MOVE_TRANSPORT`, `out CMSG_MOVE_SPLINE_DONE`, then `in SMSG_FORCE_MOVE_UNROOT` with `out CMSG_FORCE_MOVE_UNROOT_ACK`; exit 0, flow `board: ok`, `exit: ok`, events `ride_aura_cancel, spline, entered, spline, exited` | `Handlers/TaxiHandler.cpp:204-214` |

| `CMSG_DISMISS_CONTROLLED_VEHICLE` | `live` | flow `vehicles-drive` on a `max80` Horde at Warsong Hold, runs `tmp/probe/v4-drive2` and `tmp/probe/v4-drive4`: after `out CMSG_SPELLCLICK` the trace holds `in SMSG_CLIENT_CONTROL_UPDATE` (vehicle, allow 1), the boarding spline, `out MSG_MOVE_START_FORWARD` and `out MSG_MOVE_STOP` with the vehicle's packed guid, then `out CMSG_DISMISS_CONTROLLED_VEHICLE`, `in SMSG_CLIENT_CONTROL_UPDATE` (vehicle, allow 0), `in SMSG_CLIENT_CONTROL_UPDATE` (character, allow 1) and `in SMSG_FORCE_MOVE_UNROOT`; the flow returned `exit: ok`, `traveled: 10` | `Handlers/VehicleHandler.cpp:26-59` |
| vehicle moves (`MSG_MOVE_*` with the vehicle as mover) | `live` | second account in range (`tmp/probe/v4-observer`, run with `tmp/probe/v4-drive4`): `in MSG_MOVE_SET_FACING`, `MSG_MOVE_START_FORWARD`, `MSG_MOVE_HEARTBEAT`, `MSG_MOVE_STOP` carrying the vehicle's guid, from (2792.0, 6738.6) to (2788.5, 6729.2), 10.0 yd, so the server accepted and re-broadcast the driver's moves | `Handlers/MovementHandler.cpp:362-408` |
| `CMSG_MOVE_NOT_ACTIVE_MOVER` | `builder` | sent live twice per run (character on gaining, vehicle on losing; `tmp/probe/v4-drive2`: `out CMSG_MOVE_NOT_ACTIVE_MOVER` 61 bytes with the transport block, then 37 bytes for the vehicle), no disconnect; the server's only effect is stored movement info, so it shows none. Builder bytes: `control-ride-mover.test.ts` | `Handlers/MovementHandler.cpp:795-814` |
| `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE` | `builder` | sent live twice with accessory 0 (`tmp/probe/v4-seat1`, `tmp/probe/v4-seat2`: `out CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE`, no seat spline, flow `changeSeat: no_answer`, exit still `ok`); the Siege Tank's driver seat does not switch. Builder bytes: `protocol.test.ts` | `Handlers/VehicleHandler.cpp:89-121` |

## Not seen live

`CMSG_REQUEST_VEHICLE_NEXT_SEAT`, `CMSG_REQUEST_VEHICLE_PREV_SEAT` and
`CMSG_REQUEST_VEHICLE_SWITCH_SEAT` reached the server and moved no
passenger in two live tries. The handler drops a switch silently when the
seat's flags forbid it (`Handlers/VehicleHandler.cpp:61-88`,
`Handlers/VehicleHandler.cpp:122-137`); that the Grand Ice Mammoth's
passenger seat carries such a flag is an inference, since no server log
was read. A vehicle with a switchable seat would show the effect.
`SMSG_CLIENT_CONTROL_UPDATE` on boarding is the control-side signal for
vehicles-3 and vehicles-4.

`CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE` reached the server in two tries on
the Horde Siege Tank and moved no seat; the handler drops the packet when
`CanSwitchFromSeat` is false, which
is an inference for the tank's driver seat, since no server log was read.
`CMSG_MOVE_NOT_ACTIVE_MOVER` was sent live in every drive and has no
visible effect: the server stores the movement info and answers nothing
(`Handlers/MovementHandler.cpp:795-814`).

Quest 11652 for the Siege Tank's spell click (`CONDITION_QUESTTAKEN` needs
status incomplete, `Conditions/ConditionMgr.cpp:177-186`): the offline
`soap setup <ACCOUNT> quest/add` leaves it complete (status 1 in `soap
truth`), so the click would fail its condition. With the puppet running,
`soap gm <ACCOUNT> quest remove 11652` then `quest add 11652`, then
`puppet stop`, leaves status 3 (incomplete) and the click works. The
drive eval therefore stages the quest with the online route and cannot use
`soap setup` for it.

The control regression gates passed on this change: `t1-walk-to-npc` and
`t7-halt-resume`, round 359 (`tmp/evals/359/t1-walk-to-npc-1`,
`tmp/evals/359/t7-halt-resume-1`), graded `pass` 2/2 and 3/3.

Accounts: FAC6ABE1FDF5C (driver) and FAC6ABE207DFA (observer), both
deleted. Earlier: FAC6ABD9C85B3 and FAC6ABD9EA262 (click tries), FAC6ABD9FE660
and FAC6ABDA1BB23 (click, ride), FAC6ABDA09BFE (partner); all deleted.
FAC6ABE1031F0 (seat in control, `tmp/probe/seat-v3a`); deleted.
