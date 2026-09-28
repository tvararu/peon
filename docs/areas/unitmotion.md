# unitmotion

The `unitmotion` area keeps the movement flags and the nine speeds of
every unit the character sees. World-service code reads it through
`session.areas.unitmotion.state()`: one row per unit with its raw
movement flags, each speed with the packet kind that set it (`create`,
`spline` or `move_msg`) and when, the run speed before a drop
(`runBefore`), and whether the server moves the unit. Units that no
entity backs are dropped and counted in `dropped`. The area emits
`speed`, `flag` and `removed` events, each with `self` set when the
unit is the character. A row goes away when its entity disappears,
which also covers a far teleport.

The create block and every movement block seed a row. Other players'
speed messages reach the store from the remote-motion handlers, because
area sources never name those opcodes. The harness writes no log rows
for these events.

## Wire notes

- Every living unit's create block carries nine speeds after the
  movement info, in the order walk, run, run back, swim, swim back,
  flight, flight back, turn rate, pitch rate
  (`Entities/Object/Object.cpp:358-366`). `ratio` divides by the base
  speeds of `Entities/Unit/Unit.cpp:80-103`.
- A forced speed change on a unit that no client controls goes to every
  observer as a packed guid and the new absolute speed as a `float`
  (`Entities/Unit/Unit.cpp:11037-11040`). The opcode comes from the
  table in `Entities/Unit/Unit.h:651-662`. The parser refuses a speed
  that is not finite or is below 0, and a trailing byte.
- `SMSG_SPLINE_MOVE_ROOT` and its unroot twin carry a packed guid
  (`Entities/Unit/Unit.cpp:14085-14086`); the wowm file reads a plain
  guid (`wow_message_parser/wowm/world/movement/smsg/smsg_spline_move_root.wowm`),
  and AzerothCore wins. Root also clears the moving bits and keeps the
  turn bits (`Entities/Unit/Unit.cpp:14069-14070`).
- `SMSG_SPLINE_MOVE_SET_FLYING` sets `CAN_FLY`, not `FLYING`
  (`Entities/Unit/Unit.cpp:16148-16158`). Its wowm file has one block
  per client version; the 3.3.5 block is the one that matches
  (`wow_message_parser/wowm/world/movement/smsg/smsg_spline_move_set_flying.wowm`).
- `SMSG_SPLINE_SET_PITCH_RATE` has no wowm file.
- The other toggles are a packed guid only: gravity
  (`Entities/Unit/Unit.cpp:16118`), feather fall
  (`Entities/Unit/Unit.cpp:16220`), hover
  (`Entities/Unit/Unit.cpp:16273`), water walk
  (`Entities/Unit/Unit.cpp:16308`), walk mode
  (`Entities/Creature/Creature.cpp:3396`) and swim
  (`Entities/Creature/Creature.cpp:3407`).

## Left out

The parser reads all 25 owned opcodes; no handler is registered yet.

- `SMSG_SPLINE_MOVE_UNSET_HOVER` and `SMSG_SPLINE_MOVE_GRAVITY_ENABLE`:
  built by `remote-motion-2`.
- `SMSG_SPLINE_SET_WALK_SPEED`, `SMSG_SPLINE_SET_RUN_SPEED`,
  `SMSG_SPLINE_SET_RUN_BACK_SPEED`, `SMSG_SPLINE_SET_SWIM_SPEED`,
  `SMSG_SPLINE_SET_SWIM_BACK_SPEED`, `SMSG_SPLINE_SET_FLIGHT_SPEED` and
  `SMSG_SPLINE_SET_FLIGHT_BACK_SPEED`: built by `remote-motion-3`.
- `SMSG_SPLINE_MOVE_ROOT`, `SMSG_SPLINE_MOVE_UNROOT`,
  `SMSG_SPLINE_MOVE_SET_WALK_MODE`, `SMSG_SPLINE_MOVE_SET_RUN_MODE`,
  `SMSG_SPLINE_MOVE_START_SWIM` and `SMSG_SPLINE_MOVE_STOP_SWIM`: built
  by `remote-motion-4`.
- `SMSG_SPLINE_SET_TURN_RATE` and `SMSG_SPLINE_SET_PITCH_RATE`: built
  by `remote-motion-5`.
- `SMSG_SPLINE_MOVE_FEATHER_FALL`, `SMSG_SPLINE_MOVE_NORMAL_FALL`,
  `SMSG_SPLINE_MOVE_WATER_WALK`, `SMSG_SPLINE_MOVE_LAND_WALK`,
  `SMSG_SPLINE_MOVE_SET_HOVER`, `SMSG_SPLINE_MOVE_SET_FLYING`,
  `SMSG_SPLINE_MOVE_UNSET_FLYING` and
  `SMSG_SPLINE_MOVE_GRAVITY_DISABLE`: built by `remote-motion-6`.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
