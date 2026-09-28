# Protocol coverage: remote-motion (key: remote-motion)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.15" point into it).

The `remote-motion` unit builds the code area `unitmotion` (design 5.1,
5.15). It reads the speeds and movement flags of the units the character
sees: the `SMSG_SPLINE_SET_*` speed family and the `SMSG_SPLINE_MOVE_*`
toggle family. All 25 opcodes are server to client and relevant; 24 are
`missing` and `SMSG_SPLINE_SET_PITCH_RATE` (0x45E) is absent until S0-2
adds it to `CORE_OPCODES` (contract 1.11). None is dead. The area adds no
verb (N23): the agent sees the state as short words in `look` and as
`unitmotion/*` log rows, and a witness sees it in the puppet's
`nearby --json`.

- Worktree `proto-remote-motion`, created with the command of contract
  0.1; branch renamed to `proto/area-remote-motion`. One task at a time.
- Phases: tasks 1 and 2 in wave 1 (N22, the per-kill toggles); tasks 3,
  4, 7a and 7b in wave 2 (parties and raids); tasks 5 and 6 in wave 4
  (long tail) (design 5.1).
- Task ids are `remote-motion-<n>` for the design's `unitmotion-<n>`
  (contract 0.10). Task 7 is split into 7a and 7b, each with its own test
  cycle.
- Owned paths (contract 2.5): `packages/core/src/wow/areas/unitmotion/*`,
  `packages/core/test-support/areas/unitmotion.ts`,
  `packages/harness/src/areas/unitmotion/area.ts` and test,
  `packages/devtools/src/probe-flows/unitmotion-*.ts`,
  `docs/areas/unitmotion.md`, `docs/protocol-coverage/unitmotion.md`
  (regenerated only).
- Core paths without a package prefix are under `packages/core/src/wow/`.
  AzerothCore paths are relative to `src/server/game/` at `9d4e36d81`
  (contract 0.5). Peon lines are at `71fba0ab`; after item 6 the builder
  re-reads them.

## Contract issues

These are gaps found while planning. The contract is not changed; the
coordinator decides each one.

1. **The area source may not name the `MSG_MOVE_SET_*_SPEED` opcodes.**
   Contract 1.12 forbids `GameOpcode.MSG_MOVE_` in area sources, so the
   area cannot `peek` them. Remote player speeds therefore reach the store
   from the legacy owner, `remote-motion-handlers.ts` (lease), as the
   area design's body gap 2 says. `UNITMOTION_OPCODES.uses` stays empty.
2. **`movement-handlers.ts:21` narrows the stores.** `MovementStores` is
   `Pick<SessionStores, "motion" | "quests" | "self">` and is what
   `registerRemoteMotionHandlers` receives (`movement-handlers.ts:109`).
   Task 1 needs `"areas"` added to that `Pick`. The file is a control
   file under the `self-state` lease (contract 2.7). The coordinator makes
   this one-token edit as a `COORD-<n>` commit before task 1 starts, or
   hands task 1 a lease on that one line.
3. **The puppet `nearby` line lives in `puppet/server.ts`.**
   `server.ts:121` calls `nearbyRowObj(row)` with no handle, and the lease
   list names only `puppet/format.ts`. Task 7b needs `server.ts:121` to
   pass `this.handle.unitmotion.state()`. The coordinator makes that edit
   as a `COORD-<n>` commit or adds the line to 7b's lease; otherwise 7b
   stops as `blocked`.
4. **Legacy code feeds the area store directly.** Tasks 1 and 4 call
   `stores.areas.unitmotion` from leased legacy files and subscribe to
   `conn.events.area` in `registerRemoteMotionHandlers`. The design
   plans this feed (design 5.15 "Body gaps"; area design section 5), and
   no contract rule forbids legacy code from reading `stores.areas` [I].
5. **The speed writer does not name its opcode.** `Unit.cpp:11037` takes
   the opcode from `SetSpeed2Opc_table` (`Entities/Unit/Unit.h:651-662`).
   If `mise protocol:cite-check` (T-4) rejects `Unit.cpp:11037` because
   the enclosing function does not name the opcode, the builder cites the
   table row (`Unit.h:653-661`) and reports it.
6. **Log row names.** Design 5.15 wins over the area design: the rows are
   domain `unitmotion`, events `unitmotion/slowed`, `unitmotion/sped`,
   `unitmotion/rooted` and `unitmotion/freed`, class `log`, not
   `combat/unit_*`.
7. **Coverage reads `GameOpcode.<NAME>` literally**
   (`test-support/protocol-coverage.ts:28`). Every registration in
   `areas/unitmotion/area.ts` writes `GameOpcode.SMSG_...` in full; a loop
   over `GameOpcode[name]` would leave the opcode `missing` in coverage.

Leases this unit needs in the plan index (contract 2.7), in build order:

| Task | Legacy file | Edit |
|---|---|---|
| remote-motion-1 | `protocol/movement-block.ts` | read the nine create-block speeds |
| remote-motion-1 | `world-handlers-entity.ts` | feed create and movement blocks to the store |
| remote-motion-1 | `remote-motion-handlers.ts` | feed `MSG_MOVE_SET_*_SPEED` speeds to the store |
| remote-motion-4 | `remote-motion.ts`, `remote-motion-handlers.ts` | re-classify player poses on a toggle |
| remote-motion-7a | harness `tools/look.ts`, `UnitView` in `contract/views.ts` (D13) | the movement words |
| remote-motion-7b | harness `puppet/format.ts` | the `movement` object |
| remote-motion-6 | `remote-motion-handlers.ts` | the compressed-moves filter |

---

## Task remote-motion-1: Spline parser, unit movement store, nine speeds

Rulings: SR1-remote-motion-1, SR1-remote-motion-2, SR1-remote-motion-3, SR1-remote-motion-4, SR1-remote-motion-6, SR1-remote-motion-7, SR1-remote-motion-9 (section "Seed rulings (SEED-1)").

**codeArea:** `unitmotion`. **Phase:** 1. **Size:** M.

**Files:**

- Create: `packages/core/src/wow/areas/unitmotion/protocol.ts` and
  `protocol.test.ts`; `areas/unitmotion/store.ts` and `store.test.ts`;
  `areas/unitmotion/runtime.ts` and `runtime.test.ts`;
  `packages/core/test-support/areas/unitmotion.ts`;
  `docs/areas/unitmotion.md`.
- Modify (owned): `areas/unitmotion/area.ts` (the seed),
  `areas/unitmotion/opcodes.ts` (nothing to fill yet; leave it unless a
  check needs it), `packages/harness/src/areas/unitmotion/area.ts` and
  its test.
- Modify (leases): `protocol/movement-block.ts` and
  `protocol/movement-block.test.ts`; `world-handlers-entity.ts` and its
  test; `remote-motion-handlers.ts` and its test.

**Depends on:** item6, S0-5, SEED-1 (seeds `unitmotion` in wave 1, N22),
the `COORD` edit of contract issue 2.

**Opcodes:** none registered. The parser covers all 25; tasks 2 to 6
register them.

**Steps:**

1. **Failing tests first.**
   - `protocol/movement-block.test.ts`: a living create block whose nine
     speeds are 2.5, 7, 4.5, 4.722222, 2.5, 7, 4.5, 3.141594, 3.14 (the
     write order of `Entities/Object/Object.cpp:358-366`) returns
     `speeds` with all nine and keeps `runSpeed`, `runBackSpeed` and
     `turnRate`. It fails today: `readLiving` skips six of them
     (`protocol/movement-block.ts:24-31`).
   - `areas/unitmotion/protocol.test.ts`: for each of the 25 opcodes, a
     body from `test-support/areas/unitmotion.ts` parses to the table
     entry. Speed body: `PackedGuid` then `f32`
     (`Entities/Unit/Unit.cpp:11037-11040`). Toggle body: `PackedGuid`
     only (`Unit.cpp:14085-14086` root; `:16118` gravity; `:16179`
     flying; `:16220` fall; `:16273` hover; `:16308` water walk;
     `Entities/Creature/Creature.cpp:3396` walk mode; `:3407` swim).
     `SMSG_SPLINE_MOVE_ROOT` reads a packed guid (AzerothCore wins over
     `smsg_spline_move_root.wowm`). A NaN, infinite or negative speed and
     a trailing byte each throw.
   - `areas/unitmotion/store.test.ts`: seed from a create block; a flag
     toggle sets and clears its bit; `ROOT` on also clears the moving bits
     (`Unit.cpp:14069-14070`); a packet for a guid with no entity is
     dropped and counted in `dropped`; `forget` emits `removed`; a
     `run` drop from a spline sets `runBefore`; `ratio` uses the base
     speeds of `Unit.cpp:80-103`; an event for the character's own guid
     carries `self: true`.
   - `areas/unitmotion/runtime.test.ts` (with `areaRig("unitmotion")`):
     an entity `disappear` on `rig.events.entity` removes the unit.
   - `world-handlers-entity.test.ts`: a create block reaches
     `stores.areas.unitmotion` with its flags and nine speeds.
   - `remote-motion-handlers.test.ts`: `MSG_MOVE_SET_RUN_SPEED` from
     another player reaches the store as a `move_msg` speed of kind
     `run`.
2. **Implementation.**
   - `protocol/movement-block.ts`: export `SpeedKind` (`walk`, `run`,
     `run_back`, `swim`, `swim_back`, `flight`, `flight_back`, `turn`,
     `pitch`), `CREATE_SPEED_ORDER` (the write order above) and
     `MovementData.speeds?: Readonly<Record<SpeedKind, number>>`.
     `readLiving` reads all nine; the three old fields stay for the self
     store.
   - `areas/unitmotion/protocol.ts`: `SPLINE_UNIT_TABLE`, a map from the
     opcode number to `{ kind: "speed"; speed: SpeedKind }` or
     `{ kind: "flag"; flag: MotionFlagName; bit: number; on: boolean }`,
     with the bits from `protocol/entity-fields.ts:36-68`
     (`SMSG_SPLINE_MOVE_SET_FLYING` sets `CAN_FLY`, `Unit.cpp:16148-16158`).
     `MotionFlagName` is `root`, `walking`, `swimming`, `water_walking`,
     `feather_fall`, `hover`, `can_fly`, `disable_gravity`.
     `parseSplineUnitState(opcode, reader): SplineUnitState` reads
     `packedGuidBig()` and, for a speed, one `floatLE()`, with the
     `end`/`finite` checks of `protocol/remote-movement.ts:88-123`.
   - `areas/unitmotion/store.ts`: `UnitmotionStore` with `snapshot()`,
     `onEvent`, `dispose`, `seed(guid, { flags, speeds }, at)`,
     `receiveSpline(state)`, `receiveMoveSpeed(guid, kind, value)`,
     `forget(guid)` and `ratio(guid, kind)`. State
     `UnitmotionState = { units: readonly UnitMovement[]; dropped: number }`,
     where `UnitMovement` holds `guid`, `flags`, `speeds` (each
     `{ value, source: "create" | "spline" | "move_msg", at }`),
     `runBefore`, `serverControlled` and `updatedAt`. Events
     (`UnitmotionEvent`): `{ type: "speed", guid, kind, value, previous, self }`,
     `{ type: "flag", guid, flag, on, flags, self }`,
     `{ type: "removed", guid, self }`. It uses `deps.getEntity` and
     `deps.selfGuid`, and arms no timer.
   - `areas/unitmotion/runtime.ts`: `unitmotionRuntime` listens to
     `entity` and forgets a unit on `disappear`. `EntityStore.clear()`
     emits `disappear` for every entity (`entity-store.ts:225-231`), so
     map transfer is covered. No acts.
   - `areas/unitmotion/area.ts`: `unitmotionArea` with the store, the
     runtime, `eventTypes: ["speed", "flag", "removed"]` and a `register`
     that registers nothing yet.
   - `world-handlers-entity.ts`: `EntityStores` gains `"areas"`;
     `applyCreate` and `applyMovement` call
     `stores.areas.unitmotion.seed(...)` with the movement info flags and
     `speeds`.
   - `remote-motion-handlers.ts`: a `MOVE_SPEED_KIND` map from the nine
     `MSG_MOVE_SET_*_SPEED` opcodes to `SpeedKind`; `observeRemoteMovement`
     passes `body.speed` to `receiveMoveSpeed` (today it drops it,
     `remote-motion-handlers.ts:31-41`).
   - Harness `areas/unitmotion/area.ts`: `rules: () => ({ event: () => [] })`,
     so area events write no fallback rows until 7a (contract 1.9, the
     flood guard). Its test checks that a `speed` event writes no row.
   - `docs/areas/unitmotion.md` with the fixed headings of contract 3.8:
     wire notes (root packed guid; the 3.3.5 blocks of the flying files;
     no wowm file for 0x45E; `SET_FLYING` means `CAN_FLY`), "Left out"
     listing each of the 25 opcodes with the task that registers it,
     "Capabilities row": "No verb (N23)", and an empty Proof table.
3. **Checks.** `mise test` on each test file, `mise typecheck core`,
   `mise typecheck harness`, `mise ci:checks`.

**Proof:** no new opcode. The create path changed, so rerun
`t0-who-is-near` (the "Nearby units" row of `docs/evals.md`) and record
the verdict; it must show no failure cause the R0 baseline did not show
(contract 3.6).

**Commit:**

```
feat: Track unit speeds and movement flags

Snares, roots and flight toggles of other units need a store before any
spline opcode can land. The create block now keeps all nine speeds and
remote player speed messages stop dropping their value.
```

---

## Task remote-motion-2: Creature death toggles

Rulings: SR1-remote-motion-5, SR1-remote-motion-7, SR1-remote-motion-8, SR1-remote-motion-9 (section "Seed rulings (SEED-1)").

**codeArea:** `unitmotion`. **Phase:** 1. **Size:** S.

**Files:**

- Modify: `areas/unitmotion/area.ts`, `areas/unitmotion/area.test.ts`
  (create), `packages/core/test-support/areas/unitmotion.ts` (if a
  builder is missing), `docs/areas/unitmotion.md`,
  `docs/protocol-coverage/unitmotion.md` (regenerated).
- Create: `packages/devtools/src/probe-flows/unitmotion-kill.ts`.

**Depends on:** remote-motion-1, T-2 (tap), T-3 (probe).

**Opcodes:** `SMSG_SPLINE_MOVE_UNSET_HOVER`,
`SMSG_SPLINE_MOVE_GRAVITY_ENABLE`.

**Steps:**

1. **Failing test.** `areas/unitmotion/area.test.ts` with
   `areaRig("unitmotion")`: a known creature guid gets both toggles; the
   store clears `HOVER` and `DISABLE_GRAVITY` and emits two `flag`
   events. Bodies from the writers `Entities/Unit/Unit.cpp:16273` and
   `:16118`, sent on every death by `Entities/Creature/Creature.cpp:2002-2003`.
   It fails because no handler is registered (the rig's `inject` throws
   or the store stays unchanged).
2. **Implementation.** In `register`: `wire.on(GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, ...)`
   and `wire.on(GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE, ...)`, each
   calling `store.receiveSpline(parseSplineUnitState(opcode, r))`. The
   harness rule already writes no row for them (design 5.15: no rows for
   the per-kill toggles).
3. Probe flow `unitmotion-kill`: in the shape of
   `probe-flows/nearest.ts` (T-3; exact signature could not be determined
   before T-3 lands), find the nearest hostile creature, walk to it with
   `walkTowardPoint`, `attack` it, and wait until its health is 0 or 90 s
   pass.
4. `mise protocol:coverage`; add two Proof rows; remove the two opcodes
   from "Left out".

**Proof (live):** `mise factory soap create` a preset `eversong10-warrior`
account, then `mise protocol:probe <ACCOUNT> --flow unitmotion-kill
--expect SMSG_SPLINE_MOVE_UNSET_HOVER --expect SMSG_SPLINE_MOVE_GRAVITY_ENABLE`.
Exit 0 and trace outcome `handled` for 0x308 and 0x4D4 are the evidence.
Delete the account. Rerun `t3-ghostlands-kill` (N23, contract 3.6): it
must show no new failure cause against the R0 baseline, and its
`packets.jsonl` must show both opcodes `handled`.

**Commit:**

```
feat: Read creature death movement toggles

Every creature death sends an unset-hover and a gravity toggle that
showed as not implemented. The store now clears both flags on the dead
unit.
```

---

## Task remote-motion-3: Snare speeds

**codeArea:** `unitmotion`. **Phase:** 2. **Size:** M (live staging
dominates).

**Files:** `areas/unitmotion/area.ts`, `area.test.ts`,
`areas/unitmotion/store.test.ts` (if a burst case is missing),
`docs/areas/unitmotion.md`, `docs/protocol-coverage/unitmotion.md`;
create `packages/devtools/src/probe-flows/unitmotion-cast.ts`.

**Depends on:** remote-motion-2, T-5 (`soap gm learn`).

**Opcodes:** `SMSG_SPLINE_SET_WALK_SPEED`, `SMSG_SPLINE_SET_RUN_SPEED`,
`SMSG_SPLINE_SET_RUN_BACK_SPEED`, `SMSG_SPLINE_SET_SWIM_SPEED`,
`SMSG_SPLINE_SET_SWIM_BACK_SPEED`, `SMSG_SPLINE_SET_FLIGHT_SPEED`,
`SMSG_SPLINE_SET_FLIGHT_BACK_SPEED` (7).

**Steps:**

1. **Failing test.** In `area.test.ts`, inject the seven speed packets of
   one snare for one creature (bodies from `Entities/Unit/Unit.cpp:11037-11040`;
   the seven types of `Spells/Auras/SpellAuraEffects.cpp:3902-3908`), each
   at half its create value: the store holds seven `spline` speeds, emits
   seven `speed` events with `previous`, and `ratio(guid, "run")` is 0.5.
   Then the seven at the create value: `run` rises again.
2. **Implementation.** Seven `wire.on(GameOpcode.SMSG_SPLINE_SET_<KIND>, ...)`
   lines in `register`.
3. Probe flow `unitmotion-cast`, args `spell=<id>`: walk to the nearest
   hostile creature until it is within 5 yd, `selectTarget`, `cast(spell,
   guid)`, then wait 20 s so the aura ends.
4. `mise protocol:coverage`; seven Proof rows.

**Proof (live):** `soap create` an `eversong10-mage` account. Frostbolt
rank 1 is spell 116 [I, not confirmed in AzerothCore source]; the builder
confirms the id and checks the character's spellbook in the probe's
`login` output first. If the template lacks it, stage it with
`mise factory soap gm <ACCOUNT> learn 116` while the character is online
(R12, T-5), or with the offline `soap setup` spell endpoint. Then
`mise protocol:probe <ACCOUNT> --flow unitmotion-cast --arg spell=116
--expect SMSG_SPLINE_SET_RUN_SPEED --bodies`. The bodies must show seven
speed packets for one creature guid below the create value, then seven
back at it. Hamstring (warrior) or Concussive Shot (hunter) are the
fallbacks, ids to be confirmed the same way. Any of the seven that does
not arrive goes into `unseen` with an R22 rig test, marked "not seen
live". Delete the account.

**Commit:**

```
feat: Read unit speed changes from splines

A snare or speed buff on a creature sends seven absolute speeds to every
observer. The store now records them, so core knows a mob is slowed and
by how much.
```

---

## Task remote-motion-4: Root, walk mode and swim toggles

**codeArea:** `unitmotion`. **Phase:** 2. **Size:** M.

**Files:** `areas/unitmotion/area.ts`, `area.test.ts`,
`areas/unitmotion/opcodes.ts` (`unseen`), `docs/areas/unitmotion.md`,
`docs/protocol-coverage/unitmotion.md`; leases `remote-motion.ts` and
`remote-motion.test.ts`, `remote-motion-handlers.ts` and its test.

**Depends on:** remote-motion-3 (the `unitmotion-cast` flow).

**Opcodes:** `SMSG_SPLINE_MOVE_ROOT`, `SMSG_SPLINE_MOVE_UNROOT`,
`SMSG_SPLINE_MOVE_SET_WALK_MODE`, `SMSG_SPLINE_MOVE_SET_RUN_MODE`,
`SMSG_SPLINE_MOVE_START_SWIM`, `SMSG_SPLINE_MOVE_STOP_SWIM` (6).

**Steps:**

1. **Failing tests.**
   - `area.test.ts`: `ROOT` for a moving creature sets `ROOT` and clears
     the moving bits; `UNROOT` clears `ROOT`; walk and run mode flip
     `WALKING`; start and stop swim flip `SWIMMING`. Bodies from
     `Entities/Unit/Unit.cpp:14085-14086` (packed guid),
     `Entities/Creature/Creature.cpp:3396` and `:3407`.
   - `remote-motion.test.ts`: `RemoteMotion.applyFlags(guid, flags)` on a
     player pose re-runs `classifyGroundFlags` (`remote-motion.ts:97-113`):
     `ROOT` makes it `stationary`, `HOVER` makes it invalid.
   - `remote-motion-handlers.test.ts`: an area `flag` event for an
     eligible player guid reaches `applyFlags`.
2. **Implementation.** Six `wire.on(GameOpcode.SMSG_SPLINE_MOVE_<NAME>, ...)`
   lines. `RemoteMotion.applyFlags(guid, flags)`. In
   `registerRemoteMotionHandlers`, subscribe to `conn.events.area` and
   forward `unitmotion` `flag` events (`event.flags`) to
   `conn.remoteMotion.applyFlags`; `clearWorldEvents` drops the
   subscription at session end. A reviewer who knows the item 6 control
   code reviews this task (design 3.12).
3. `mise protocol:coverage`; six Proof rows; `unseen` for each opcode not
   seen live.

**Proof:** root and unroot live: `eversong10-mage`, Frost Nova is spell
122 (`scripts/Spells/spell_mage.cpp:72`), cast within 5 yd of a mob:
`mise protocol:probe <ACCOUNT> --flow unitmotion-cast --arg spell=122
--expect SMSG_SPLINE_MOVE_ROOT --expect SMSG_SPLINE_MOVE_UNROOT` (stage
122 with `soap gm learn` if missing). Walk and run mode: only SmartAI
`SET_RUN` and charm send them (`AI/SmartScripts/SmartScript.cpp:1741`,
`Entities/Unit/Unit.cpp:7762`); mock from `Creature.cpp:3396`, `unseen`,
"not seen live", unless the builder meets one on the way. Swim: live only
if the builder finds a water fight near an `eversong10` start (could not
determine one); otherwise mock from `Creature.cpp:3407`, `unseen`. Delete
the account.

**Commit:**

```
feat: Read unit root, walk and swim toggles

A kiter or healer needs to know that a mob is rooted. Root toggles now
reach the store, and a player pose re-classifies when its flags change.
```

---

## Task remote-motion-7a: Movement words in look and log rows

**codeArea:** `unitmotion`. **Phase:** 2. **Size:** M.

**Files:** `packages/harness/src/areas/unitmotion/area.ts` and
`area.test.ts`; leases `packages/harness/src/tools/look.ts` and
`look.test.ts`, and the `UnitView` block of
`packages/harness/src/contract/views.ts` (D13).

**Depends on:** remote-motion-3, remote-motion-4. Its `flying` and
`hover` words stay empty until remote-motion-6 lands.

**Opcodes:** none.

**Steps:**

1. **Failing tests.**
   - `area.test.ts`: the seven `speed` events of one snare for a unit in
     the current fight (a guid in `rc.memo.fights`, or
     `rc.lookup.lastAttacker()`) within 100 ms write one row
     `unitmotion/slowed`, class `log`, text `<Name> slowed to 50% run
     speed`; the speed-up writes `unitmotion/sped`; `root` on and off
     write `unitmotion/rooted` and `unitmotion/freed`; a unit outside the
     fight, a `self` event, and the hover and gravity toggles write no
     row.
   - `look.test.ts`: a rooted, slowed unit renders `rooted, slowed 50%`
     on its line; a unit with default movement renders as today.
2. **Implementation.** The rule factory keeps a per-guid last-row time
   and writes a row only for `run` speed events and root flags, at most
   one per guid per 100 ms (design 5.15). `UnitView` gains optional
   `movement: { rooted, slowedPct, swimming, flying, hover }`, filled in
   `look.ts` from `handle.unitmotion.state()` only when not default
   (`slowedPct` from `run` against `runBefore`; `flying` is `CAN_FLY` or
   `DISABLE_GRAVITY`). `rowLine` (`tools/look.ts:201`) adds one word per
   set value.
3. `mise typecheck harness`, `mise ci:checks`.

**Proof:** replay the snare capture of remote-motion-3 through the
harness (a `mise harness` run on a fresh `eversong10-mage` account, one
fight with Frostbolt, `--packet-trace headers`) and show one
`unitmotion/slowed` row in `gamelog.jsonl`. Rerun `t0-who-is-near` and
`t0-hostiles` (the `look` row of `docs/evals.md`) and
`t3-ghostlands-kill`; each must show no new failure cause against R0.
No scenario and no `docs/capabilities.md` row (N23).

**Commit:**

```
feat: Show unit root and slow state in look

The agent needs to see that a mob is rooted or slowed without asking.
Look rows gain short movement words and fights log slowed and rooted
rows.
```

---

## Task remote-motion-7b: Movement object in puppet nearby rows

**codeArea:** `unitmotion`. **Phase:** 2. **Size:** S.

**Files:** lease `packages/harness/src/puppet/format.ts` and its test;
the `server.ts:121` line through contract issue 3.

**Depends on:** remote-motion-1, the `COORD` edit of contract issue 3.

**Opcodes:** none.

**Steps:**

1. **Failing test.** `puppet/format.test.ts`: `nearbyRowObj(row,
   movement)` for a unit with a stored movement adds `movement` with raw
   `flags`, the nine speeds with their `source`, `rooted` and
   `serverControlled`; with no movement the row is unchanged.
2. **Implementation.** `nearbyRowObj` takes the unit's `UnitMovement`
   looked up by guid in `handle.unitmotion.state().units`.

**Proof:** a puppet on a fresh account runs `nearby --json` next to a
creature and prints its `movement` object with nine `create` speeds.
Delete the account. No eval (N23).

**Commit:**

```
feat: Add unit movement to puppet nearby rows

A witness puppet can now confirm a unit's speeds and root state from a
second client, which is the only server truth for creature movement.
```

---

## Task remote-motion-5: Turn and pitch rate

**codeArea:** `unitmotion`. **Phase:** 4. **Size:** S.

**Files:** `areas/unitmotion/area.ts`, `area.test.ts`,
`areas/unitmotion/opcodes.ts` (`unseen`), `docs/areas/unitmotion.md`,
`docs/protocol-coverage/unitmotion.md`.

**Depends on:** remote-motion-1; S0-2 (the `CORE_OPCODES` entry for
0x45E).

**Opcodes:** `SMSG_SPLINE_SET_TURN_RATE`, `SMSG_SPLINE_SET_PITCH_RATE`.

**Steps:**

1. **Failing test.** `area.test.ts`: both opcodes update the `turn` and
   `pitch` speeds (bodies from `Entities/Unit/Unit.cpp:11037-11040`, via
   `Entities/Unit/Unit.h:658` and `:661`).
2. **Implementation.** Two `wire.on` lines. Both opcodes go into
   `unseen`.
3. `mise protocol:coverage`; two Proof rows `mock`.

**Proof (mock, not seen live):** `UpdateSpeed` handles only seven types
(`Entities/Unit/Unit.cpp:10842-10925`), and SmartAI's speed action calls
`SetSpeed` with `forced` false (`AI/SmartScripts/SmartScript.cpp:3009`),
so no caller sends these. The R22 rig test built from `Unit.cpp:11037`
is the proof.

**Commit:**

```
feat: Read unit turn and pitch rate changes

The server can send a unit's turn and pitch rate through the shared
speed writer. No caller reaches it today, so a rig test from that writer
proves the parser.
```

---

## Task remote-motion-6: Fall, water walk, hover and flight toggles

**codeArea:** `unitmotion`. **Phase:** 4. **Size:** M.

**Files:** `areas/unitmotion/area.ts`, `area.test.ts`,
`areas/unitmotion/opcodes.ts` (`unseen`), `docs/areas/unitmotion.md`,
`docs/protocol-coverage/unitmotion.md`; lease
`remote-motion-handlers.ts` and its test.

**Depends on:** remote-motion-4 (the `remote-motion-handlers.ts` lease
returns to this unit).

**Opcodes:** `SMSG_SPLINE_MOVE_FEATHER_FALL`,
`SMSG_SPLINE_MOVE_NORMAL_FALL`, `SMSG_SPLINE_MOVE_WATER_WALK`,
`SMSG_SPLINE_MOVE_LAND_WALK`, `SMSG_SPLINE_MOVE_SET_HOVER`,
`SMSG_SPLINE_MOVE_SET_FLYING`, `SMSG_SPLINE_MOVE_UNSET_FLYING`,
`SMSG_SPLINE_MOVE_GRAVITY_DISABLE` (8).

**Steps:**

1. **Failing tests.**
   - `area.test.ts`: each toggle sets or clears its bit (bodies from
     `Entities/Unit/Unit.cpp:16220` fall, `:16308` water walk, `:16273`
     hover, `:16179` flying, `:16118` gravity).
   - `remote-motion-handlers.test.ts`: an `SMSG_COMPRESSED_MOVES` that
     holds an `SMSG_SPLINE_MOVE_SET_HOVER` dispatches it (today it is
     skipped, `remote-motion-handlers.ts:43-50`). AzerothCore never writes
     `SMSG_COMPRESSED_MOVES` (`Server/Protocol/Opcodes.cpp:894` registers
     it, no writer), so this is correctness only.
2. **Implementation.** Eight `wire.on` lines. The compressed-moves filter
   also passes an inner opcode that `SPLINE_UNIT_TABLE` holds, imported
   from `#wow/areas/unitmotion/protocol` [I: no contract rule forbids a
   legacy file from importing an area module; if the reviewer rules
   otherwise, the task stops as `blocked`].
3. `mise protocol:coverage`; eight Proof rows; `unseen` for each opcode
   not seen live.

**Proof:** mostly mock, not seen live. `SendMovementWaterWalking`,
`SendMovementFeatherFall` and `SendMovementHover`
(`Entities/Unit/Unit.cpp:16313-16340`) have no callers. A hovering or
flying creature near an `eversong10` start could not be determined, and a
partner pet with a feather-fall or water-walk aura has no confirmed
spell. The builder spends at most one probe attempt (a partner hunter's
pet and a mage's Slow Fall, if the aura type is confirmed in
`Spells/Auras/SpellAuraEffects.cpp:3477-3496`); otherwise each opcode
gets an R22 rig test from its writer line and goes into `unseen`.

**Commit:**

```
feat: Read unit fall, hover and flight toggles

Boss scripts and flying creatures toggle hover, flight and gravity, and
water walk and slow fall reach pets. The store now tracks them, proven
from the AzerothCore writers where no live trigger exists.
```

---

## Dead opcodes

None. All 25 rows are relevant (R7). `SMSG_SPLINE_SET_TURN_RATE` and
`SMSG_SPLINE_SET_PITCH_RATE` have no caller today, but AzerothCore has a
writer for both (`Entities/Unit/Unit.cpp:11037` via
`Entities/Unit/Unit.h:658`, `:661`), so they are `unseen`, not dead.

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules here every open issue, lease request and decision
of this file that a wave-1 task (remote-motion-1, remote-motion-2) meets.
Precedence: the design, then the plan index with the contract and the
Gate R rulings, then this file. Each ruling stands in for the contract or
design text it names; the builder follows the ruling. Each ruling is
**not yet ruled by the maintainer**.

Left alone, because only later waves meet them: contract issue 3
(`puppet/server.ts:121`, remote-motion-7b, wave 2); contract issue 5 (the
speed writer citation, remote-motion-3 in wave 2 and remote-motion-5 in
wave 4); contract issue 6 (log row names, remote-motion-7a, wave 2); the
`conn.events.area` subscription half of contract issue 4
(remote-motion-4, wave 2); lease rows 4 to 7 of "Leases this unit needs"
(remote-motion-4, 7a, 7b and 6); and the design 5.15 decisions "player
poses re-classify on a toggle", "100 ms merge window" and "`slowed`
compares with the unit's previous speed" (remote-motion-4 and 7a). The
`SEED-2` and `SEED-4` passes rule them.

### SR1-remote-motion-1: the wave-1 leases

**Issue.** "Leases this unit needs", rows 1 to 3: remote-motion-1 holds
`protocol/movement-block.ts`, `world-handlers-entity.ts` and
`remote-motion-handlers.ts`. The task body also edits "`world-handlers-entity.ts`
and its test; `remote-motion-handlers.ts` and its test", and neither
`world-handlers-entity.test.ts` nor `remote-motion-handlers.test.ts`
exists [M, `ls packages/core/src/wow`].

**Ruling.** Granted as the plan index "Leases" table queues them. The
coordinator assigns the three leases at `SEED-1`. When remote-motion-1
lands, the coordinator hands each on with one `COORD-<n>` line in the plan
index "Lease handovers":

| File | Holder | Next holder |
|---|---|---|
| core `protocol/movement-block.ts` and `protocol/movement-block.test.ts` | remote-motion-1 | vehicles-1 (C), then vehicles-6 (C) |
| core `world-handlers-entity.ts` and a new `world-handlers-entity.test.ts` | remote-motion-1 | none |
| core `remote-motion-handlers.ts` and a new `remote-motion-handlers.test.ts` | remote-motion-1 | remote-motion-4 (B), then remote-motion-6 (D) |

A lease on a legacy file also covers its colocated test file of the same
stem, and the holder may create that test file. The existing tests
`world-handlers-entity-lifecycle.test.ts` and
`world-handlers-entity-queries.test.ts` are in the lease only for a fix
that the leased change forces; the builder adds new cases to the new
test file. remote-motion-1 does not edit `remote-motion.ts`,
`remote-motion.test.ts` or `remote-motion-lifetime.test.ts`; those go
with the `remote-motion.ts` lease of remote-motion-4. Not yet ruled by
the maintainer.

### SR1-remote-motion-2: the `MovementStores` edit is a `COORD` commit

**Issue.** Contract issue 2: "`movement-handlers.ts:21` narrows the
stores. ... Task 1 needs `"areas"` added to that `Pick`. ... The
coordinator makes this one-token edit as a `COORD-<n>` commit before task
1 starts, or hands task 1 a lease on that one line."

**Ruling.** The `COORD` route. `handleNearTeleport` passes its
`MovementStores` to `observeRemoteMovement` (`movement-handlers.ts:24-38`
[M]), and `registerMovementHandlers` passes it to
`registerRemoteMotionHandlers` (`movement-handlers.ts:109` [M]), so the
wider `Pick` of remote-motion-1 does not typecheck without this edit.
The plan index queues `movement-handlers.ts` to travel-4 (C) first, and
no wave-1 task holds it, so no holder waits. After `SEED-1` and before
remote-motion-1 starts, the coordinator changes
`packages/core/src/wow/movement-handlers.ts:21` to
`type MovementStores = Pick<SessionStores, "areas" | "motion" | "quests" | "self">;`
in one `COORD-<n>` commit. It needs S0-1b (`SessionStores` has `areas`),
and its callers already pass the full `SessionStores`
(`client-handlers.ts:166`, `testStores()` in `movement-handlers.test.ts`
[M]). The `COORD` commit runs `mise typecheck core` and `mise test
packages/core/src/wow/movement-handlers.test.ts`. remote-motion-1 edits
no line of `movement-handlers.ts`. The lease queue of that file does not
change. Not yet ruled by the maintainer.

### SR1-remote-motion-3: remote player speeds come through the legacy owner

**Issue.** Contract issue 1: "Contract 1.12 forbids `GameOpcode.MSG_MOVE_`
in area sources, so the area cannot `peek` them. Remote player speeds
therefore reach the store from the legacy owner,
`remote-motion-handlers.ts` (lease) ... `UNITMOTION_OPCODES.uses` stays
empty."

**Ruling.** Stands, with no amendment. The nine
`MSG_MOVE_SET_*_SPEED` rows are already parsed with the `speed` layout
(`protocol/remote-movement.ts:67-75,146` [M]). The `MOVE_SPEED_KIND` map
lives in `remote-motion-handlers.ts`, which is legacy code and not an
area source, so the rule of contract 1.12 does not reach it. The map
covers all nine rows, `MSG_MOVE_SET_TURN_RATE` and
`MSG_MOVE_SET_PITCH_RATE` included. The area source names no
`MSG_MOVE_` opcode, and `UNITMOTION_OPCODES.uses` stays empty. Not yet
ruled by the maintainer.

### SR1-remote-motion-4: legacy code feeds the area store

**Issue.** Contract issue 4: "Tasks 1 and 4 call `stores.areas.unitmotion`
from leased legacy files ... The design plans this feed (design 5.15
'Body gaps'; area design section 5), and no contract rule forbids legacy
code from reading `stores.areas` [I]."

**Ruling.** Stands for remote-motion-1, with no amendment. Contract 1.12
limits area sources only, and `SessionStores.areas` is public to core
(contract 1.6). `world-handlers-entity.ts` calls
`stores.areas.unitmotion.seed(...)` only after the entity is in the
entity store, so `deps.getEntity` finds it, and `remote-motion-handlers.ts`
calls `receiveMoveSpeed(...)`. `EntityStores` in
`world-handlers-entity.ts:28` gains `"areas"` under the lease of
SR1-remote-motion-1. The `conn.events.area` subscription of
remote-motion-4 is left for `SEED-2`. Not yet ruled by the maintainer.

### SR1-remote-motion-5: coverage needs literal opcode names

**Issue.** Contract issue 7: "Coverage reads `GameOpcode.<NAME>`
literally (`test-support/protocol-coverage.ts:28`). Every registration
in `areas/unitmotion/area.ts` writes `GameOpcode.SMSG_...` in full."

**Ruling.** Stands. remote-motion-2 writes
`wire.on(GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, ...)` and
`wire.on(GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE, ...)` in full, and
every later task of this unit does the same. `SPLINE_UNIT_TABLE` may key
by opcode number, because coverage reads only the registrations. Not yet
ruled by the maintainer.

### SR1-remote-motion-6: the design 5.15 decisions that wave 1 builds on

**Issue.** Design 5.15 "Decisions (not yet ruled)": "one parser table in
the first task; ... the self events are emitted and the item 6 owner
decides their consumer."

**Ruling.** Both stand. remote-motion-1 builds the one
`SPLINE_UNIT_TABLE` for all 25 opcodes and registers none, so later
tasks add only `wire.on` lines. The store emits events for the
character's own guid with `self: true`; in wave 1 nothing in control
consumes them, and remote-motion-1 edits no control file. The owner of
the item 6 control files decides the consumer in a later task. Not yet
ruled by the maintainer.

### SR1-remote-motion-7: `docs/areas/unitmotion.md` while the unit builds

**Issue.** remote-motion-1 step 2 asks for "'Left out' listing each of
the 25 opcodes with the task that registers it ... and an empty Proof
table". Contract 3.8 says: "Every opcode in the area's `owns` has
exactly one row." Contract 0.6 has no proof value for an opcode that no
task has registered yet. GR-21 binds each citation in the file to the
opcodes that its block names.

**Ruling.** Contract 3.8 reads, for a unit that is not yet complete, as
follows: every owned opcode is in exactly one of "Left out" (with the
task that registers it) or "Proof" (one row). A task that registers an
opcode moves it from "Left out" to "Proof" in the same commit. The rule
"exactly one row" in "Proof" holds when the last task of the unit lands.
No amendment. So remote-motion-1 writes the header row of "Proof" and no
data rows, and remote-motion-2 adds the rows for 0x308 and 0x4D4, with
`Source` `Entities/Unit/Unit.cpp:16273` and `Entities/Unit/Unit.cpp:16118`
[M, both lines name their opcode at `9d4e36d81`].

In "Wire notes", each citation must pass `mise protocol:cite-check`:
`Entities/Unit/Unit.cpp:14085-14086` in the paragraph that names
`SMSG_SPLINE_MOVE_ROOT`, and `Entities/Unit/Unit.cpp:16148-16158` in the
paragraph that names `SMSG_SPLINE_MOVE_SET_FLYING` (the enclosing
`SetCanFly` names the opcode at `:16179` [M]). A citation of the speed
writer `Entities/Unit/Unit.cpp:11037-11040` goes in a paragraph that
names no opcode (`unbound`, which passes), as in GR-21. remote-motion-1
runs `mise protocol:cite-check docs/areas/unitmotion.md` and
`mise lint:docs` before it reports. Not yet ruled by the maintainer.

### SR1-remote-motion-8: the `unitmotion-kill` probe flow

**Issue.** remote-motion-2 step 3: "in the shape of
`probe-flows/nearest.ts` (T-3; exact signature could not be determined
before T-3 lands) ... wait until its health is 0 or 90 s pass." Its
proof runs `mise protocol:probe <ACCOUNT> --flow unitmotion-kill --expect
... --expect ...`.

**Ruling.** T-3 has landed. The flow is
`packages/devtools/src/probe-flows/unitmotion-kill.ts` and exports
`flow: ProbeFlow = { name: "unitmotion-kill", usage, run }`; `loadFlows`
refuses a flow whose `name` is not its file stem. `run({ handle, args,
settle })` returns `Json`. It may import `#tools/probe-flows`
(`FlowContext`, `Json`, `ProbeFlow`, `others`, `entityType`, `summary`)
as `nearest.ts` does, besides `@peon/core`. `settle` gives up after 5 s
(`SETTLE_MS`, `probe-run.ts:69` [M]), so the wait of up to 90 s is the
flow's own poll loop with `Bun.sleep`. The flow uses
`handle.walkTowardPoint`, `handle.selectTarget` and `handle.attack`
(`client.ts:235-257` [M]). A test for the flow's target choice and stop
conditions over a fake `FlowContext` may go in
`probe-flows/unitmotion-kill.test.ts` (owned through
`probe-flows/unitmotion-*.ts`).

The death toggles can arrive after the flow sees health 0, so the proof
command adds `--wait 10 --until SMSG_SPLINE_MOVE_UNSET_HOVER --until
SMSG_SPLINE_MOVE_GRAVITY_ENABLE`. Exit 0 and the trace outcome `handled`
for 0x308 and 0x4D4 stay the evidence. Neither opcode is in `STUBS`
[M, `protocol/stubs.ts`], so the concern of GR-20 does not apply: before
remote-motion-2 the outcome is `unhandled`. Not yet ruled by the
maintainer.

### SR1-remote-motion-9: the eval reruns of wave 1

**Issue.** remote-motion-1 reruns `t0-who-is-near` and remote-motion-2
reruns `t3-ghostlands-kill`; each "must show no failure cause the R0
baseline did not show (contract 3.6)". Neither body names the round.

**Ruling.** Both are a task's own runs in phase A, so the round is 11
(contract 3.6, plan index "Eval loop"): `mise eval run t0-who-is-near
--round 11` in remote-motion-1 and `mise eval run t3-ghostlands-kill
--round 11` in remote-motion-2. Each scenario runs once in this worktree
in phase A, so neither adds `--replica`; a second run of one scenario in
round 11 adds `--replica 2`. The D17 rule of contract 3.6 applies:
`t3-ghostlands-kill` fails on `main`, and it must show no failure cause
that round 0 did not show. Not yet ruled by the maintainer.

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-remote-motion-1-1 | `remote-motion-1` edits `packages/core/src/wow/protocol/update-object.ts:5,16` (the `Speeds` import and `speeds?: Speeds` on the local `Movement` type) in `feat: Track unit speeds and movement flags`, and no lease, ruling or unit ownership covers that file. `readMovement` spreads `parseMovementBlock(r)` into `Movement` (`protocol/update-object.ts:42-49`), so the new `MovementData.speeds` of the leased `protocol/movement-block.ts:23,31` reaches `world-handlers-entity.ts:159-162` only through that type | The `Movement` type block of `protocol/update-object.ts` (its `movement-block` import line and the `Movement` type) becomes a rider on the `protocol/movement-block.ts` lease, like the D13 riders of contract 2.7: each field that a holder adds to `MovementData` may get its mirror field there, type-only, with no change to parsing. The rider travels with that lease: remote-motion-1, then vehicles-1 (C), then vehicles-6 (C), whose new `MovementData` fields need the same mirror. The two lines stay in the task commit, with no history rewrite. The rest of the file keeps no lease; the inflate export that `vehicles.md` asks for before vehicles-1 stays a coordinator `COORD` commit and touches none of these lines. The plan index "Leases" table and "Lease handovers" record the rider | not yet ruled by the maintainer |
| BR-remote-motion-1-2 | `remote-motion-1` puts its nine-speed test in a new `packages/core/src/wow/protocol/movement-block-speeds.test.ts`, because `movement-block.test.ts` has 499 non-blank lines [M] and the 500-line cap of AGENTS.md forbids growing it. The lease on a legacy file covers only its colocated test of the same stem (contract 2.7) | Acknowledged. A sibling test file split from the colocated test of a leased file by the 500-line cap is part of that lease. `movement-block-speeds.test.ts` goes with the `protocol/movement-block.ts` lease and its chain (vehicles-1, then vehicles-6), and a later holder adds cases to whichever of the two files has room | not yet ruled by the maintainer |
