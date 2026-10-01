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

## Capabilities row

None: the model has no agent verb. Boarding, riding and the zeppelin eval
arrive in vehicles-7 and vehicles-8.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_UPDATE_OBJECT` | `live` | create blocks of 10 boats and zeppelins and 9 lifts on Kalimdor, captured at 33 logins over 648.6 s and replayed through the area with the staged DBC files (see "Live validation"); builder tests build the same blocks from the movement-block writer | `Entities/Object/Updates/UpdateData.cpp:66` |
| `SMSG_GAMEOBJECT_QUERY_RESPONSE` | `live` | the replay reads the real template of every transport (the Zephyr is type 15, path 1221, speed 30, acceleration 1; the 9 lifts are type 11 with pause time 0); builder tests cover the other rows | `Handlers/QueryHandler.cpp:193-211` |
| `SMSG_DESTROY_OBJECT` | `builder` | destroy and out-of-range bodies remove the transport and emit `transport_gone` | `Entities/Object/Object.cpp:289-294` |
