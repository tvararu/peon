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

Every creature death clears hover twice and disabled gravity once on
the dead unit: `Unit::setDeathState` clears hover
(`Entities/Unit/Unit.cpp:11113`, called at
`Entities/Creature/Creature.cpp:1975`), then the creature clears hover
and gravity again (`Entities/Creature/Creature.cpp:2002-2003`). Each
kill so emits three `flag` events with `on` false: hover, hover and
disable_gravity. The probe flow `unitmotion-kill` attacks
the nearest hostile creature until it dies and lists the flags its death
cleared.

A root on a creature (Frost Nova) sends `SMSG_SPLINE_MOVE_ROOT` and,
when the aura ends, `SMSG_SPLINE_MOVE_UNROOT`
(`Entities/Unit/Unit.cpp:14085`); the flag change also clears the
moving bits, so a `flag` event for a rooted creature carries flags with
no `FORWARD`.

A `flag` event for another player's guid also re-classifies that player's remote pose: the
pose keeps the movement bits its own broadcasts set, applies the toggle,
and is `stationary` when rooted or `invalid` (`swimming`, `hover`) when
the toggled flags are not ground motion. A pose invalid for another reason
(teleport, knockback, death, unobserved flags) keeps that reason.

A snare or speed buff on a creature reaches every observer as up to
seven absolute speeds: walk, run, run back, swim, swim back, flight and
flight back (the aura handler updates all seven types,
`Spells/Auras/SpellAuraEffects.cpp:3902-3908`). `SetSpeed` sends a type
only when its rate changed (`Entities/Unit/Unit.cpp:11020-11024`), so a
creature whose flight rate was already at the target sends fewer. Each
packet becomes a `speed` event with `previous`, and `ratio(guid, "run")`
gives the run speed as a share of the base speed. The release of the aura
sends the same seven at the earlier values, so `run` rises again. Only
creature snares arrive as splines: a snared player's own speed goes to
its controller as a force packet
(`Entities/Unit/Unit.cpp:11030-11031`), and other players' speeds reach
the store from `MSG_MOVE_SET_*_SPEED`. The probe flow `unitmotion-cast`
walks to the nearest hostile creature, casts a spell at it and lists the
speed and flag changes the creature showed.

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

The parser reads all 25 owned opcodes; the two death toggles, the seven
speed opcodes and the root, walk mode and swim toggles have a handler.

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
| `SMSG_SPLINE_MOVE_UNSET_HOVER` | `live` | probe flow `unitmotion-kill` (`--expect` 0x308, 0x4D4) on an `eversong10-warrior` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0; the Angershade kill traced 0x308 twice as `handled`, and the flow saw `hover` cleared | `Entities/Unit/Unit.cpp:16273` |
| `SMSG_SPLINE_MOVE_GRAVITY_ENABLE` | `live` | the same `unitmotion-kill` run, exit 0; 0x4D4 traced once as `handled`, and the flow saw `disable_gravity` cleared | `Entities/Unit/Unit.cpp:16118` |
| `SMSG_SPLINE_SET_WALK_SPEED` | `live` | probe flow `unitmotion-cast` (`--arg spell=116`, `--expect` 0x2fe) on an `eversong10-mage` at Springpaw Stalker: Frostbolt traced 0x301 handled twice, 2.5 to 1.5 at the snare and 1.5 to 2.5 at its end; all seven speed opcodes arrived at both moments | `Entities/Unit/Unit.h:653` |
| `SMSG_SPLINE_SET_RUN_SPEED` | `live` | the same run: 0x2fe traced twice as `handled`, 6.0 to 3.6 and back | `Entities/Unit/Unit.h:654` |
| `SMSG_SPLINE_SET_RUN_BACK_SPEED` | `live` | the same run: 0x2ff traced twice as `handled`, 4.5 to 2.7 and back | `Entities/Unit/Unit.h:655` |
| `SMSG_SPLINE_SET_SWIM_SPEED` | `live` | the same run: 0x300 traced twice as `handled`, 4.72 to 2.43 and back to 4.05 | `Entities/Unit/Unit.h:656` |
| `SMSG_SPLINE_SET_SWIM_BACK_SPEED` | `live` | the same run: 0x302 traced twice as `handled`, 2.5 to 1.5 and back | `Entities/Unit/Unit.h:657` |
| `SMSG_SPLINE_SET_FLIGHT_SPEED` | `live` | the same run: 0x385 traced twice as `handled`, 7 to 3.6 and back to 6.0 | `Entities/Unit/Unit.h:659` |
| `SMSG_SPLINE_SET_FLIGHT_BACK_SPEED` | `live` | the same run: 0x386 traced twice as `handled`, 4.5 to 2.7 and back | `Entities/Unit/Unit.h:660` |
| `SMSG_SPLINE_MOVE_ROOT` | `live` | probe flow `unitmotion-cast` (`--arg spell=122`, `--expect` 0x31a and 0x304) on an `eversong10-mage` at East Sanctum: Frost Nova on Rotlimb Marauder traced 0x31a as `handled` five ms after `CMSG_CAST_SPELL`, and the flow saw `root` set | `Entities/Unit/Unit.cpp:14085` |
| `SMSG_SPLINE_MOVE_UNROOT` | `live` | the same run: traced 0x304 as `handled` eight seconds later, and the flow saw `root` cleared | `Entities/Unit/Unit.cpp:14085` |
| `SMSG_SPLINE_MOVE_SET_WALK_MODE` | `mock` | `area.test.ts` "unitmotion root, walk mode and swim toggles"; not seen live: only SmartAI `SET_RUN` and charm toggle it and no fight on the preset starts reaches one | `Entities/Creature/Creature.cpp:3396` |
| `SMSG_SPLINE_MOVE_SET_RUN_MODE` | `mock` | the same test; not seen live, for the same reason | `Entities/Creature/Creature.cpp:3396` |
| `SMSG_SPLINE_MOVE_START_SWIM` | `mock` | the same test; not seen live: the two tries found no hostile creature in the water near Lake Elrendar and no other water fight near an `eversong10` start is known | `Entities/Creature/Creature.cpp:3407` |
| `SMSG_SPLINE_MOVE_STOP_SWIM` | `mock` | the same test; not seen live, for the same reason | `Entities/Creature/Creature.cpp:3407` |
