# transports

The `transports` area records boats, zeppelins and lifts from their create
blocks and predicts where each one is from the game's path data. The store
keeps `transports` per guid (`guid`, `entry`, `kind` (`motion` or `lift`),
`mapId`, the creation `pose`, the path `rotation`, the create
`pathProgress` and `receivedAt`) and `templates` per game-object entry
(taxi path id, move speed, acceleration, map id, pause time). It emits
`transport_seen` on every create and `transport_gone` on `SMSG_DESTROY_OBJECT`
or an `outOfRange` entry. The acts are `poseAt(guid)` (the pose at the
runtime's clock) and `dataStatus()` (`missing` or `ready`). Without the DBC
files the data is unavailable and `poseAt` returns `undefined`; a missing
path or animation is never presented as real.

## Wire notes

- A transport create carries `UPDATEFLAG_TRANSPORT | UPDATEFLAG_LOWGUID |
  UPDATEFLAG_STATIONARY_POSITION | UPDATEFLAG_ROTATION`, the `u32` path
  progress after the optional attacking-target guid, and a progress that
  advances per tick; the stationary pose of that create is the creation
  point, so `poseAt` adds the elapsed milliseconds to the create progress
  and wraps by the period.
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
  the create pose is the path start, a stop waits its node delay, and the
  last frame teleports back to the first. A stop frame is `actionFlag == 2`.
- A lift interpolates the animation-table offsets between time segments
  with a reverse lookup, rotates the offset by the game object's parent
  rotation, and advances the orientation by the rotation-table angle.
- The path data comes from three client files, loaded lazily through
  `ctx.dbc`: `TaxiPathNode.dbc` (11 fields, 44-byte records
  `diiifffiiii`), `TransportAnimation.dbc` (7 fields, 28-byte records
  `diifffx`) and `TransportRotation.dbc` (7 fields, 28-byte records
  `diiffff`). Live file sizes (build 12340): 22,586 taxi nodes over 911
  paths, 5,262 animation nodes, 227 rotations. The Zephyr (Orgrimmar-Thunder
  Bluff, entry 190549) rides path 1221: 39 nodes, two stops, speed 30,
  acceleration 1, period 566,366 ms.

## Capabilities row

None: the model has no agent verb. Boarding, riding and the zeppelin eval
arrive in vehicles-7 and vehicles-8.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_UPDATE_OBJECT` | `builder` | create blocks built from the AzerothCore writer: a motion-transport create records `{ pathProgress, pose, receivedAt }`, a second create replaces the progress and resets the clock, a lift create records the kind and parent rotation | `Server/Protocol/Opcodes.cpp:300` |
| `SMSG_GAMEOBJECT_QUERY_RESPONSE` | `builder` | query responses built from the AzerothCore writer: type 15 stores `{ taxiPathId, moveSpeed, accelRate, mapId }`, type 11 stores `{ pauseAtTime }`, other types and missing rows store nothing | `Handlers/QueryHandler.cpp:193-211` |
| `SMSG_DESTROY_OBJECT` | `builder` | destroy and out-of-range bodies remove the transport and emit `transport_gone` | `Entities/Object/Object.cpp:289-294` |
