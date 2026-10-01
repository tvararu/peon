# transports

The `transports` area records boats, zeppelins and lifts from their create
blocks and predicts where each one is from the game's path data. The store
keeps `transports` per guid (`guid`, `entry`, `kind` (`motion` or `lift`),
`mapId` (the character's map when the create arrived), the creation `pose`,
the path `rotation`, the create `pathProgress`, the game-object state
`goState`, pending state changes and `receivedAt`) and `templates` per
game-object entry (taxi path id, move speed, acceleration, map id, pause
time, start-open flag). It emits `transport_seen` on every create and
`transport_gone` on `SMSG_DESTROY_OBJECT` or an `outOfRange` entry. The acts
are `poseAt(guid)` (the pose at the runtime's clock) and `dataStatus()`
(`missing` or `ready`). Without the DBC files, or for a lift without its
template, the data is unavailable and `poseAt` returns `undefined`; a
missing path or animation is never presented as real.

## Wire notes

- A transport create carries `UPDATEFLAG_TRANSPORT | UPDATEFLAG_LOWGUID |
  UPDATEFLAG_STATIONARY_POSITION | UPDATEFLAG_ROTATION` (0x0252;
  `Entities/Transport/Transport.cpp:57,791`, written by
  `Entities/Object/Object.cpp:376-489`), the `u32` path progress after the
  optional attacking-target guid, and a progress that advances per tick as a
  `uint32` (`Entities/Transport/Transport.h:43-44`,
  `Entities/Transport/Transport.cpp:236` adds the tick diff, so it overflows
  past 2^32 - 1 before the period modulo at `:238`). The
  stationary pose of a `MotionTransport` create is its current world
  position (`Entities/GameObject/GameObject.h:332-335` returns the live
  position for type 15), so each create is a pose sample; a static lift's
  stationary pose is its fixed base. `poseAt` adds the elapsed milliseconds
  to the create progress, wraps at the `uint32` boundary, then wraps by the
  period.
- A game object standing on a transport carries `UPDATEFLAG_POSITION` with
  the transport's packed guid, the world position, the transport offset and
  the orientation. The reader returns the guid and offset instead of
  dropping them. Movement blocks ride inside create and movement entries.
- A type 15 (`MO_TRANSPORT`) template row holds the taxi path id
  (`data[0]`), move speed (`data[1]`), acceleration (`data[2]`) and map id
  (`data[6]`); type 11 (`TRANSPORT`, a lift) holds the pause time
  (`data[0]`) and the start-open flag (`data[1]`).
  `SMSG_GAMEOBJECT_QUERY_RESPONSE` answers with entry, type, display id,
  four names, icon, caption, a string, 24 data words, size and 6 quest items
  (`Handlers/QueryHandler.cpp:193-211`).
- The motion path model ports the server's path generation with
  per-segment Catmull-Rom evaluation and the per-tick progress stepping:
  a stop waits its node delay, and the last frame teleports back to the
  first. A stop frame is `actionFlag == 2`.
- A lift interpolates the animation-table offsets between time segments
  with a reverse lookup (`Maps/TransportMgr.cpp:509-527`), rotates the
  offset by the game object's parent rotation, and advances the orientation
  by the rotation-table angle; the last rotation node interpolates back to
  the first over the remaining animation period
  (`Maps/TransportMgr.cpp:545-552`).
- A lift with a pause time follows `StaticTransport::Update`
  (`Entities/Transport/Transport.cpp:983-1008`): in state `READY` it waits
  at progress 0 (a progress below the pause time drops to 0 at once), in
  any other state it rises to the pause time and holds there, and a
  `GAMEOBJECT_BYTES_1` state change re-bases the progress. A lift without a
  pause time cycles by the animation period. The state starts from the
  create block, which already holds the template's start-open choice
  (`Entities/Transport/Transport.cpp:899-925`).
- The path data comes from three client files, loaded lazily through
  `ctx.dbc`: `TaxiPathNode.dbc` (11 fields, 44-byte records
  `diiifffiiii`), `TransportAnimation.dbc` (7 fields, 28-byte records
  `diifffx`) and `TransportRotation.dbc` (7 fields, 28-byte records
  `diiffff`). Live file sizes (build 12340): 22,586 taxi nodes over 911
  paths, 5,262 animation nodes, 227 rotations. The Zephyr (Orgrimmar-Thunder
  Bluff, entry 190549) rides path 1221: 39 nodes, two stops, speed 30,
  acceleration 1, period 566,366 ms.

## Live validation

The check replays real traffic through the shipped area, runtime and
staged `TaxiPathNode.dbc`, `TransportAnimation.dbc` and
`TransportRotation.dbc`. A `ghostlands20` character stood in Orgrimmar and
logged in 33 times, 19 to 50 s apart, over 648.6 s, which is longer than
the 566,366 ms Zephyr period. Every login sends create blocks for the
transports in range. The stationary pose of a `MotionTransport` create is
its current world position (`Entities/GameObject/GameObject.h:332-335`), so
each create is an independent server pose and progress sample.

| Check | Result |
|---|---|
| Zephyr (entry 190549, path 1221) | 33 creates over 648.6 s covering the whole period, both stops included (Thunder Bluff dock near -1026.9, 375.8, 150.4 and the Orgrimmar-side stop near 1125.4, -4134.9, 70.3, at least three samples at each) |
| Pose at the create progress, 211 samples of 10 boats and zeppelins | at most 0.083 yd in x/y, 0.0003 yd in z and 0.0012 rad in orientation; the Zephyr stays within 0.0011 yd |
| Pose predicted from the previous create over the 19 to 50 s gap, 201 samples | at most 0.82 yd in x/y, 0.042 yd in z and 0.0027 rad; the error is the packet timing jitter of about 27 ms at 30 yd/s |
| Lift progress predicted from the previous create, 9 lifts with periods 6,667, 30,000 and 30,033 ms, 288 pairs | at most 26 ms |

Not seen live: a lift with a pause time. Every pause-time lift in the world
data sits in an instance (Gundrak, Ulduar, Icecrown Citadel, the arenas),
`soap setup position` takes only maps 0, 1, 530 and 571, and the instance
teleports land hundreds of yards from the elevator, whose create is sent
only near it. The pause and state rules rest on
`Entities/Transport/Transport.cpp:983-1008` and the unit tests.

## Riding in control

`CMSG_MOVE_CHNG_TRANSPORT` reaches the shared movement-opcode handler (`Server/Protocol/Opcodes.cpp:1040`, `Handlers/MovementHandler.cpp:362-414`), which attaches the mover to the named transport in `HandleMoverRelocation` and, for this opcode, returns before any broadcast. `board(guid)` refuses `transport_data_missing` without a pose, `not_docked` unless the pose is in a stop window, and `too_far` when the character is more than 30 yd from the pose. Otherwise it sends one `CMSG_MOVE_CHNG_TRANSPORT` (packed guid, then `MovementInfo` with `ON_TRANSPORT`, the transport guid and the offset) and resolves `ok` right away, because the server answers nothing. A teleported packet whose position is more than one grid (`SIZE_OF_GRIDS`) from the server position is skipped (the `ONTRANSPORT` check with `SIZE_OF_GRIDS` inside `VerifyMovementInfo`, reached from that handler). The effect shows in the character's position (`soap truth`).
- The offset is the character's current place relative to the docked pose,
  rotated by the inverse of the transport orientation; the ride is rigid, so
  the world pose follows `poseAt` and control sends nothing while standing
  (the server moves passengers, `Entities/Transport/Transport.cpp`).
  `unsupportedReason` keeps refusing free movement while `ON_TRANSPORT`.
`leave()` refuses `not_boarded`, `not_docked` and `ground_height_unavailable`. It sends one `CMSG_MOVE_CHNG_TRANSPORT` without `ON_TRANSPORT` at the ground point under the docked pose; the server leaves the transport when the flag is absent (the `else` branch of `HandleMoverRelocation`, reached from that handler) and applies fall damage only on `MSG_MOVE_FALL_LAND`.
- `SMSG_TRANSFER_PENDING` carries the destination map and, on a transport,
  the transport entry and the old map (`Entities/Player/Player.cpp:1607-1612`).
  The `transfer_pending` self event holds them and the area emits
  `map_change { entry, fromMap, toMap }`. That path is built and unit-tested,
  not seen live: the live ride (Orgrimmar to Thunder Bluff) stays on map 1.
  A same-map `SMSG_NEW_WORLD` keeps the ride, and a cross-map one keeps it
  after a transport `SMSG_TRANSFER_PENDING` (entry and old map set) by
  rebasing the offset; a cross-map `SMSG_NEW_WORLD` without one
  (an unrelated teleport) ends it.

## Capabilities row

None yet: `board(guid)` and `leave()` are acts of the area (and
`worldActs`), not an agent verb. The `travel ride` verb and the zeppelin eval
arrive in vehicles-8.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_UPDATE_OBJECT` | `live` | create blocks of 10 boats and zeppelins and 9 lifts on Kalimdor, captured at 33 logins over 648.6 s and replayed through the area with the staged DBC files (see "Live validation"); builder tests build the same blocks from the movement-block writer | `Entities/Object/Updates/UpdateData.cpp:66` |
| `SMSG_GAMEOBJECT_QUERY_RESPONSE` | `live` | the replay reads the real template of every transport (the Zephyr is type 15, path 1221, speed 30, acceleration 1; the 9 lifts are type 11 with pause time 0); builder tests cover the other rows | `Handlers/QueryHandler.cpp:193-211` |
| `SMSG_DESTROY_OBJECT` | `builder` | destroy and out-of-range bodies remove the transport and emit `transport_gone` | `Entities/Object/Object.cpp:289-294` |
| `CMSG_MOVE_CHNG_TRANSPORT` | `live` | board half seen live: a Horde `max80` character on the Orgrimmar zeppelin tower ran flow `transports-ride` (scratch run `v7-ride-f`, not committed; packet trace with bodies): `board` sent the packed guid and `MovementInfo` with `ON_TRANSPORT` at 461.3 s, the server sent a same-map teleport and the `MSG_MOVE_TELEPORT_ACK` round trip followed at 695.9 s, the pose at the Thunder Bluff dock was 0.06 yd from the deck stand point, and `soap truth` put the character at Thunder Bluff (map 1, zone 1638). Not seen live: `leave` on the ground, because the probe has no ground oracle and refuses `ground_height_unavailable`; that half is unit-tested with a fixture oracle (control tests read the sent body back with `parseMovementInfo`) | `Server/Protocol/Opcodes.cpp:1040`, `Handlers/MovementHandler.cpp:362-414` |
