# vehicles

The `vehicles` area passively records vehicle state: which units are
vehicles (`SMSG_PLAYER_VEHICLE_DATA`), which units ride on another unit
(`SMSG_MONSTER_MOVE_TRANSPORT`), and the ride-aura cancel
(`SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`). The store keeps
`vehicleIds` per guid and `passengers` per rider; seat requests, control
and the `vehicle` tool arrive in later tasks. The area also peeks
`SMSG_UPDATE_OBJECT` and `SMSG_COMPRESSED_UPDATE_OBJECT` create and
movement blocks for `UPDATEFLAG_VEHICLE`, and a peeked
`SMSG_DESTROY_OBJECT` or `outOfRange` entry drops the guid again.

In the harness, `player_vehicle` and `ride_aura_cancel` each write one
`log` row; `spline` writes none (the spline flood guard).

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

## Left out

- `CMSG_SPELLCLICK`, `CMSG_REQUEST_VEHICLE_EXIT`,
  `CMSG_REQUEST_VEHICLE_PREV_SEAT`, `CMSG_REQUEST_VEHICLE_NEXT_SEAT`,
  `CMSG_REQUEST_VEHICLE_SWITCH_SEAT`, `CMSG_PLAYER_VEHICLE_ENTER` and
  `CMSG_CONTROLLER_EJECT_PASSENGER`: built by vehicles-2.
- `CMSG_DISMISS_CONTROLLED_VEHICLE`,
  `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE` and
  `CMSG_MOVE_NOT_ACTIVE_MOVER`: built by vehicles-4.
- The `SMSG_COMPRESSED_MOVES` allow-list entry: AzerothCore registers the
  opcode as `STATUS_NEVER` and never writes it
  (`Server/Protocol/Opcodes.cpp:894`).

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_PLAYER_VEHICLE_DATA` | `live` | `mise protocol:probe --flow vehicles-mount --arg spell=61470 --expect SMSG_PLAYER_VEHICLE_DATA --bodies` on a `max80` standing outdoors in Northrend (in Dalaran the cast failed `SPELL_FAILED_ONLY_OUTDOORS`), exit 0; the two bodies are `0331113b010000` (id 315) on the mount and `03311100000000` (id 0) on the aura cancel, and the store emitted `player_vehicle` | `Entities/Unit/Unit.cpp:10242-10245` |
| `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA` | `live` | same run, `--expect SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`, exit 0; the empty body arrived in the same batch as the first vehicle data (on entering the mount), and the store emitted `ride_aura_cancel` | `Entities/Unit/Unit.cpp:10247-10248` |
| `SMSG_MONSTER_MOVE_TRANSPORT` | `mock` | `packages/core/src/wow/areas/vehicles/area.test.ts`, "SMSG_MONSTER_MOVE_TRANSPORT records the seat and emits the spline"; live proof lands in vehicles-2 | `Movement/Spline/MoveSplineInit.cpp:114-124` |
