# self-state: own movement flags, mount, stand, breath and self-res (key: self-state)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.7 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

The unit `self-state` builds the code area `selfstate`. It gives the
character a correct server copy of its own movement flags (water walk,
feather fall, hover, gravity, collision height, pitch rate), the login and
teleport root inside `SMSG_MULTIPLE_MOVES`, the map-transfer refusal, stand
state, breath and fatigue timers, the ghost and self-resurrection packets,
mount and dismount, and drunk and rested state. The harness gains
`recover how:"self"`, `spell do:"mount"` and `do:"dismount"`, passive rows
for breath, transfer aborts and self-res, and the dismount-first policy.

- Rows: 39. Relevant 34 (33 missing, 1 absent:
  `CMSG_FORCE_PITCH_RATE_CHANGE_ACK` 0x45D, added to `CORE_OPCODES` by
  S0-2). Dead 5 (end of this file).
- Phases: wave 1 (phase 1) self-state-1, -5, -2, -4, -3, -11a, -11b; wave 2
  (phase 2) -7, -9; wave 3 (phase 3) -6, -10a, -10b, -12; wave 4 (phase 4)
  -8 (design 5.1; -12 is added by the plan, design 7.2 question 2).
- Handled rows sent here: the ten swim and fly moves of self-state-12.
- Worktree `proto-self-state`, branch `proto/area-self-state` (contract
  0.1). One task at a time, in the order of this file.
- Evals: `t6-selfstate-res` (self-state-9), `t9-selfstate-mount`
  (self-state-10a).

Paths without a prefix are under `packages/core/src/wow/`; harness paths
start with `packages/harness/`. Peon line numbers are at `71fba0ab`; R0
records any move. AzerothCore (AC) paths are relative to
`src/server/game/` unless they start with `src/`; wowm paths are under
`wow_message_parser/wowm/world/`. When the two disagree, AC wins.

## Plan decisions

Each is **not yet ruled by the maintainer**.

1. **The area registers every flag opcode itself (ownership model B).**
   Design 3.15 test 3 checks that each `on` opcode an area registers is in
   its `owns`; it does not require legacy code to give up opcodes an area
   owns. So both models pass the tests, and this plan picks the one that
   keeps handlers in the area: `selfstate`'s `register` reads
   `SMSG_MOVE_WATER_WALK` and the other flag packets with
   `parseMoveCounter` (`protocol/movement.ts:190`, a legal value import)
   and forwards a new `SelfEvent` through the existing entry point
   `core.self.receive(...)` (`self-store.ts:57`). The store keeps the
   `core` it gets in `store(deps, core)`. Control sends every ack from
   `control-sync.ts` under the lease, so no area source names
   `GameOpcode.CMSG_MOVE_` (design 3.15 test 5). `movement-handlers.ts`
   is not edited. Exception: `SMSG_FORCE_PITCH_RATE_CHANGE` joins
   `SPEED_ACKS`, whose loop in `movement-handlers.ts:101-108` already
   registers every row, so its legacy owner is that loop. Fallback if a
   reviewer or the coordinator rejects model B: the legacy handlers in
   `movement-handlers.ts` register the flag opcodes under the lease, and
   the area store listens to `core.self.onEvent`.
2. **Self fields are read by the area.** The area reads the self entity's
   `rawFields` (`entity-store.ts:77-84`) for `UNIT_FIELD_MOUNTDISPLAYID`
   (69), `UNIT_FIELD_BYTES_1` (74), `PLAYER_SELF_RES_SPELL` (1199),
   `PLAYER_BYTES_3` (155), `PLAYER_FLAGS` (150), `PLAYER_BYTES_2` (154)
   and `PLAYER_REST_STATE_EXPERIENCE` (1169), offsets from
   `protocol/update-fields.ts:100,105,152,156,157,293` and
   `PLAYER_FIELDS.SELF_RES_SPELL`. It checks the self guid and
   `ObjectType.PLAYER` itself, as `readSelfField` does
   (`player-state.ts:21-44`). So no task edits `player-state.ts`.
3. **Mount flag.** `UNIT_FLAG_MOUNT` 0x08000000 (AC
   `Entities/Unit/UnitDefines.h:284`) is an area constant in
   `areas/selfstate/fields.ts` until the coordinator adds
   `UnitFlag.MOUNT` to `protocol/entity-fields.ts` (contract issue 3).
4. **Mount verbs on the `spell` tool** (design 5.7 decision, N30), after
   `spells-12` lands it. **Dismount first** in `engage`, `rest`, `loot`
   and `interact do:"train"` (self-state-10b).
5. **No automatic caller** for `CMSG_MOVE_TIME_SKIPPED` and
   `CMSG_MOVE_FALL_RESET` (design 5.7); control gains the sends only.
6. **No hover height in predicted z** (design 5.7).
7. **`selfstate` owns rested XP and the resting flag** (design 5.7).
8. **Swimming and flying sends are in this unit.** Design 7.2 question 2
   sets the swimming owner to `selfstate`, item 4 (default), and the
   design wins over the plan. Task self-state-12 (phase C) builds the
   swim, pitch and fly sends; the breath warning stays in self-state-11b.
   Not yet ruled by the maintainer.

## Contract issues

Reported to the coordinator; the plan names the file in each task and
does not invent a second name.

1. `control-feed.ts` is missing from the control-files lease (contract
   2.7). `feedControl` switches over every `SelfEvent` with an exhaustive
   `never` default (`control-feed.ts:4-45`), so each new self event
   (`move_flag`, `collision_height`, `transfer_aborted`) must add a case
   there in the same commit. Tasks self-state-1 to -4 need it in the
   control lease.
2. `protocol/movement.ts` is in no lease. Self-state-1 renames
   `buildCanFlyAck` to `buildFlagAck` (`protocol/movement.ts:257`) and
   self-state-3 adds row 9 to `SPEED_ACKS` (`:45-82`) plus
   `buildTimeSkipped`. Proposal: add it to the control-files lease.
3. `protocol/entity-fields.ts` (`UnitFlag`, `:81-95`) is in no lease.
   Self-state-6 uses an area constant (plan decision 3) until a
   `COORD-<n>` commit adds `UnitFlag.MOUNT`.
4. `ops/danger.ts` is leased to `threat` only. Self-state-11b needs it for
   the `breath_low` interrupt (design 5.7 "Passive"), after the threat
   holder task lands (D12 handover).
5. The `[now]` line needs `events/now.ts`, `ops/views.ts` (`nowSnapshot`,
   `:384`) and `contract/views.ts` (`NowSnapshot`, `:135`). D13 covers
   `contract/views.ts` only through a tool-module lease. Self-state-11b
   and -10a need a lease on `events/now.ts` and `ops/views.ts`.
6. `tools/params.ts` (`recoverParams.how`, `:149-152`) is outside the
   `tools/recover.ts` lease; D13 names only `details.ts` and `views.ts`.
   Self-state-9 needs it. The dismount-first policy of self-state-10b
   needs leases on `tools/engage*.ts`, `tools/rest.ts`, `tools/loot.ts`
   and `tools/interact*.ts`; the contract lists self-state for none of
   them, and `tools/rest.ts` for no unit.
7. Swimming owner: design 7.2 question 2 and design 5.7 disagree. The
   plan follows design 7.2 (plan decision 8, self-state-12).
8. The `recover` and `spell` row text in `docs/harness.md` needs a lease
   or a `COORD` line. Contract 2.6 allows only a new tool's appended row,
   while design 3.11 asks for the matching docs prose on a user-visible
   change. `prompt/harness-doc.test.ts` needs only the tool names, which
   the existing rows already hold.

## Setup for the builder

- The unit starts after item 6 merged (R3, R11), R0, the tooling of
  design 4.8, S0-1 to S0-5, and `SEED-1`, which seeds `selfstate` with
  `owns` = the 39 rows, `dead` = the 5 rows at the end of this file, and
  the harness module `selfstateHarness` with `worldActs: []`.
- Check before the first task: `packages/core/src/wow/areas/selfstate/opcodes.ts`
  exports `SELFSTATE_OPCODES`, `areas/registry.ts` has the `selfstate`
  key, and `mise protocol:probe --help` runs (T-3).
- The coordinator gives each control task the control lease
  (`control-sync.ts`, `control.ts`, `control-motion.ts`, `self-store.ts`,
  `movement-handlers.ts`, plus `control-feed.ts` and
  `protocol/movement.ts` after issues 1 and 2). A task without its lease
  stops as `blocked`.
- Live accounts: `mise factory soap create <preset>` gives
  `FAC<hex>` accounts and `tmp/puppet-<ACCOUNT>`. Offline staging uses
  `mise factory soap setup <ACCOUNT> <endpoint> '<json>'` (endpoints
  `position`, `level`, `spells/learn`, `items/add`, `docs/factory.md`);
  the JSON shape of each endpoint is the realm service's (read one `soap
  setup` reply first; could not determine the shapes from the repo).
  Every account is deleted with `mise factory soap delete <ACCOUNT>`
  before the report.
- **The witness.** Relays that the server sends only to others
  (`MSG_MOVE_WATER_WALK`, `MSG_MOVE_HOVER`, `MSG_MOVE_FEATHER_FALL`,
  `MSG_MOVE_SET_COLLISION_HGT`, `MSG_MOVE_TIME_SKIPPED`,
  `SMSG_MOUNTSPECIAL_ANIM`) need a second character in view. In wave 1
  the witness is a second `soap create` account placed at the same point
  with `soap setup position` and logged in with
  `mise protocol:probe <WITNESS> --wait <s> --expect <OPCODE>`, which
  records every received opcode with counts (design 4.2). From wave 3
  the partner puppet (`start --packet-trace`, `raw`, `events`, T-7) may
  replace it.
- Every parser and builder test body is built byte for byte from the AC
  writer or reader the Proof row cites (contract 0.5). Shared builders go
  in `packages/core/test-support/areas/selfstate.ts` as
  `selfstate<Opcode>Body(...)`. Area tests use `areaRig("selfstate")`;
  control tests use `setup()` from `packages/core/test-support/control-fixtures.ts`.
- Names (contract 1.5, 1.10 pattern): `SELFSTATE_OPCODES`,
  `selfstateArea`, `SelfstateState`, `SelfstateEvent`, `SelfstateStore`,
  `SelfstateActs`, `selfstateRuntime`, `selfstateHarness`. Event types:
  `stand_changed`, `mirror_timer`, `breath_low`, `ghost_pending`,
  `transfer_aborted`, `self_res_available`, `mounted`, `dismounted`,
  `mount_anim`, `drunk_changed` (design 5.7). New `SelfEvent` members:
  `move_flag`, `collision_height`, `transfer_aborted`.
- Each task: `mise protocol:coverage` after the change, `mise ci:checks`
  green before review, `mise protocol:cite-check` green on
  `docs/areas/selfstate.md`, one Proof row for each opcode the task builds
  (contract 3.8).
- Commits: `git add <paths>` then `mise exec -- git commit` as a separate
  step; subject at most 50 characters; no trailer of any kind.

---

## Task self-state-1: Death-set flag acks, water walk and hover

**Phase:** 1. **codeArea:** `selfstate`. **Size:** M. **Control lease.**

Rulings: SR1-self-state-1, SR1-self-state-4, SR1-self-state-5, SR1-self-state-6, SR1-self-state-7, SR1-self-state-8, SR1-self-state-10.

**Depends on:** item 6, R0, S0-5, SEED-1, T-2, T-3, the control lease.

**Opcodes (6):** `SMSG_MOVE_WATER_WALK`, `SMSG_MOVE_LAND_WALK`,
`CMSG_MOVE_WATER_WALK_ACK`, `SMSG_MOVE_SET_HOVER`,
`SMSG_MOVE_UNSET_HOVER`, `CMSG_MOVE_HOVER_ACK`.

**Files:**
- Modify (lease): `self-store.ts` (`SelfEvent` gains
  `{ type: "move_flag"; flag: MoveFlag; enable: boolean; counter: number }`,
  `MoveFlag = "water_walk" | "feather_fall" | "hover" | "gravity_off"`),
  `control-feed.ts` (the `move_flag` case), `control.ts`
  (`moveFlag(flag, enable, counter)` forwards to the sync),
  `control-sync.ts` (`MovementSync.moveFlag`), `protocol/movement.ts`
  (`buildCanFlyAck` renamed `buildFlagAck`, callers updated).
- Create (lease, colocated test): `control-flags.test.ts`.
- Create: `areas/selfstate/protocol.ts` (the flag table: opcode → flag,
  enable), `areas/selfstate/store.ts`, `areas/selfstate/store.test.ts`,
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md` (all headings of contract 3.8; the Proof
  table gets the five `dead` rows and the rows of this task; each later
  task appends its own rows, so every owned opcode has exactly one row
  once self-state-8 lands).
- Modify: `areas/selfstate/area.ts` (store, `register`),
  `areas/selfstate/opcodes.ts` (`unseen` gains `SMSG_MOVE_SET_HOVER`
  unless a hover spell is found), `docs/protocol-coverage/selfstate.md`
  (regenerated).
- Create: `packages/devtools/src/probe-flows/selfstate-death.ts`.

**Steps:**

- [ ] **Step 1: Failing control test.** In `control-flags.test.ts`, with
  `setup()` from `test-support/control-fixtures.ts`:
  1. `runtime.moveFlag("water_walk", true, 7)` sends
     `CMSG_MOVE_WATER_WALK_ACK` whose body is packed self guid, `u32` 7,
     MovementInfo with `WATERWALKING` 0x10000000 set
     (`protocol/entity-fields.ts:65`), then `u32` 1: AC reader
     `Handlers/MiscHandler.cpp:1505-1520`.
  2. After the ack, the next `MSG_MOVE_HEARTBEAT` (drive a move with
     fake timers, as `control-acks.test.ts:10-24` does) still carries the
     bit (design 5.7 "Risks": the server copies flags from every move,
     `Handlers/MovementHandler.cpp:435`).
  3. `enable: false` clears the bit and writes `u32` 0.
  4. Hover: same with `HOVER` 0x40000000 and `CMSG_MOVE_HOVER_ACK`.
  5. Death order: `forceRoot(3)` then `moveFlag("hover", false, 4)` then
     `moveFlag("water_walk", true, 5)`: both acks carry `ROOT`, and each
     echoes its own counter (AC `Entities/Player/Player.cpp:4643`,
     `Entities/Unit/Unit.cpp:11112-11113`, `Player.cpp:4539-4542`;
     the rooted drop at `MovementHandler.cpp:606-609`).
  6. `newWorld` clears the flag bits (`control-sync.ts:193-212`).
  Run `mise test packages/core/src/wow/control-flags.test.ts`: it fails
  to compile (`moveFlag` does not exist).
- [ ] **Step 2: Failing area test.** In `store.test.ts`, with
  `areaRig("selfstate")`: inject `SMSG_MOVE_WATER_WALK` built by
  `selfstateMoveWaterWalkBody({ guid, counter })` (packed guid, `u32`:
  AC `Unit.cpp:16293-16305`; wowm
  `movement/smsg/smsg_move_water_walk.wowm:3-6`), and the same for
  `LAND_WALK`, `SET_HOVER`, `UNSET_HOVER` (`Unit.cpp:16255-16269`).
  Subscribe `rig.stores.self.onEvent` and expect one `move_flag` event
  per packet with the right flag, enable and counter. A packet for
  another guid gives no event. Run it: it fails (no handler).
- [ ] **Step 3: Implement.** `MovementSync.moveFlag` sets or clears the
  bit in `moveFlags` and `observedFlags`, like `setCanFly`
  (`control-sync.ts:260-274`), then sends the ack from
  `buildFlagAck(this.moveAck(counter), enable)`; `water_walk`,
  `feather_fall`, `hover` pick their ack opcode from one table in
  `control-sync.ts`. No motion abort for these three flags (they do not
  block motion, `control-motion.ts` `unsupportedReason`). The area
  `register` reads each opcode with `parseMoveCounter`, drops another
  guid, and calls `store.receiveMoveFlag(...)`, which forwards to
  `core.self.receive`. The store keeps no flag state (control owns it,
  design area 3.3).
- [ ] **Step 4: Tests pass.** `mise test` on both files and on
  `packages/core/src/wow/movement-handlers.test.ts`, `mise typecheck
  core`, `mise protocol:coverage`, `mise ci:checks`.
- [ ] **Step 5: Probe flow.** `selfstate-death.ts`: log in, wait until a
  creature kills the character (life `dead`), release the spirit with the
  existing release act, wait 10 s, reclaim the corpse. It records the
  received `SMSG_MOVE_UNSET_HOVER`, `SMSG_MOVE_WATER_WALK`,
  `SMSG_MOVE_LAND_WALK` and the sent acks. The flow API is T-3's; the
  release and reclaim acts are the ones `recover` uses today
  (`packages/harness/src/ops/recover.ts`).
- [ ] **Step 6: Live proof.** Create two `fresh` accounts, A and the
  witness W. Place both with `soap setup position` in the
  `fairbreeze-stalkers` field of `t6-die-and-recover` (the stalkers kill a
  level-1 character; the exact point is the worker's choice). Start
  `mise protocol:probe W --wait 600 --expect MSG_MOVE_HOVER --expect MSG_MOVE_WATER_WALK`,
  then `mise protocol:probe A --flow selfstate-death --expect SMSG_MOVE_UNSET_HOVER --expect SMSG_MOVE_WATER_WALK --expect SMSG_MOVE_LAND_WALK`.
  Both exit 0. Fallback when W does not see the relays: rerun once; then
  record the three SMSGs and the acks live from A's trace and write
  "relay not witnessed" in Evidence.
- [ ] **Step 7: Proof rows** in `docs/areas/selfstate.md`: the three seen
  SMSGs `live` (flow `selfstate-death`, exit 0); the two acks `live`
  (W's relay counts); `SMSG_MOVE_SET_HOVER` `mock` with
  `Entities/Unit/Unit.cpp:16255-16269` and the store test title, unless a
  castable aura-106 spell exists in the spell catalog (then `live`).
  Wire notes: the three acks read a packed guid in AC
  (`MiscHandler.cpp:1505`), wowm has an 8-byte `Guid`
  (`movement/cmsg/cmsg_move_water_walk_ack.wowm:3-8`).
- [ ] **Step 8: Commit.**
  Subject: `feat: Ack water walk and hover flag changes`
  Body: `The server copies these flags only from the client's ack, so without one its copy of the character was wrong after every death. The acks now go out with the packet's counter and the flag stays in every later move.`

**Proof:** live, natural play (death, release, reclaim) with a witness;
`SMSG_MOVE_SET_HOVER` mock from `Entities/Unit/Unit.cpp:16255-16269`,
marked not seen live.

---

## Task self-state-5: Self-state store, stand, timers, pre-resurrect

**Phase:** 1. **codeArea:** `selfstate`. **Size:** M.

Rulings: SR1-self-state-2.

**Depends on:** self-state-1.

**Opcodes (5):** `SMSG_STANDSTATE_UPDATE`, `CMSG_STANDSTATECHANGE`,
`SMSG_START_MIRROR_TIMER`, `SMSG_STOP_MIRROR_TIMER`, `SMSG_PRE_RESURRECT`.

**Files:**
- Modify: `areas/selfstate/protocol.ts` (`parseStandState`,
  `buildStandStateChange`, `parseMirrorTimer`, `parseStopMirrorTimer`,
  `parsePreResurrect`, `STAND_STATES`, `MIRROR_TIMERS`),
  `areas/selfstate/store.ts` and test, `areas/selfstate/area.ts`,
  `areas/selfstate/opcodes.ts` (`uses` stays empty),
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`.
- Create: `areas/selfstate/protocol.test.ts`, `areas/selfstate/fields.ts`
  (self field reads, plan decision 2), `areas/selfstate/runtime.ts` and
  `runtime.test.ts`, `packages/devtools/src/probe-flows/selfstate-stand.ts`.

**Steps:**

- [ ] **Step 1: Failing parser tests** (`protocol.test.ts`):
  - `SMSG_START_MIRROR_TIMER`: `u32` timer, `u32` value, `u32` max,
    **`i32`** scale, `u8` paused, `u32` spell (AC
    `src/server/game/Server/Packets/MiscPackets.cpp:101-111`). Cases:
    breath 1 with scale -1 (`Entities/Player/Player.cpp:903-910`) and
    fatigue 0 with scale 10 (`:935`). Names fatigue 0, breath 1, fire 2
    (`Entities/Player/Player.h:557-562`); wowm names 2 `FEIGN_DEATH`
    (`spell/spell_common.wowm:1-9`), AC wins.
  - `SMSG_STOP_MIRROR_TIMER`: `u32` (`MiscPackets.cpp:121-126`).
  - `SMSG_STANDSTATE_UPDATE`: `u8` (`Entities/Unit/Unit.cpp:12690-12701`).
  - `CMSG_STANDSTATECHANGE`: `buildStandStateChange("sit")` is `u32` 1
    (AC reader `Handlers/MiscHandler.cpp:560-563`).
  - `SMSG_PRE_RESURRECT`: packed guid (`Player.cpp:4508-4512`).
- [ ] **Step 2: Failing store and runtime tests** with
  `areaRig("selfstate")`:
  - `standState` starts from `UNIT_FIELD_BYTES_1` byte 0 of the self
    entity (AC `Entities/Unit/UnitDefines.h:26`), then follows each
    `SMSG_STANDSTATE_UPDATE`; `stand_changed` fires on a change only.
  - A start fills `timers.breath` with `{ valueMs, maxMs, scale, paused,
    spellId, at }`; a stop clears it; each emits `mirror_timer` with
    `started` or `stopped`. The death stop set (three stops for 0, 1, 2,
    `Entities/Player/Player.h:2088-2093`) leaves all three empty.
  - `breath_low` fires once when the projected remaining time
    (`valueMs + scale * elapsed`) falls under 10 s: the runtime arms one
    timer from `ctx.now()` (fake timers inside `try`/`finally`), and a
    stop cancels it.
  - `SMSG_PRE_RESURRECT` for the self guid sets `ghostPending` and emits
    `ghost_pending`; another guid does nothing; the ghost bit 0x10 in
    `PLAYER_FLAGS` clears it.
  - `act.setStandState("sit")` sends `CMSG_STANDSTATECHANGE` 1 and
    resolves on the injected `SMSG_STANDSTATE_UPDATE` 1 through
    `ctx.until`; `"dead"` refuses `invalid_state` and sends nothing (AC
    accepts 0, 1, 3, 8 only, `MiscHandler.cpp:565-574`); no reply in 2 s
    gives `no_answer`.
  Run them: they fail.
- [ ] **Step 3: Implement** `SelfstateStore` (state, `Emitter`,
  `snapshot`, `onEvent`, `dispose`, `receive*`), `selfstateRuntime`
  (`setStandState`, the breath deadline, `ctx.listen("entity", ...)`
  for self field changes), and the `register` lines. `eventTypes` lists
  the new types.
- [ ] **Step 4:** tests, `mise typecheck core`, `mise protocol:coverage`,
  `mise ci:checks`.
- [ ] **Step 5: Probe flow** `selfstate-stand.ts`: call
  `handle.selfstate.act.setStandState("sit")`, then `"stand"`.
- [ ] **Step 6: Live proof.** One `eversong10` account:
  `mise protocol:probe A --flow selfstate-stand --expect SMSG_STANDSTATE_UPDATE`.
  Death set: rerun `selfstate-death` from self-state-1 with
  `--expect SMSG_PRE_RESURRECT --expect SMSG_STOP_MIRROR_TIMER`. Breath:
  place the character offline on a lake bed with `soap setup position`
  (a deep-water point near Eversong; the worker picks it, since the
  server tests its z against the liquid level,
  `Handlers/MovementHandler.cpp:654-658`), then
  `mise protocol:probe A --wait 30 --expect SMSG_START_MIRROR_TIMER`;
  the trace body shows scale -1.
- [ ] **Step 7: Proof rows:** all five `live`, with the flow and exit
  code. Wire note: scale is signed and the timer names differ from wowm.
- [ ] **Step 8: Commit.**
  Subject: `feat: Track stand state and breath timers`
  Body: `The character could not see whether it sat, how much breath it had left or that it was about to become a ghost. The selfstate store now keeps these and names the moment breath runs low.`

**Proof:** live for all five (probe flows and a deep-water login).

---

## Task self-state-2: Feather fall, gravity and the login compound

**Phase:** 1. **codeArea:** `selfstate`. **Size:** M. **Control lease.**

Rulings: SR1-self-state-1, SR1-self-state-7, SR1-self-state-8, SR1-self-state-9, SR1-self-state-10.

**Depends on:** self-state-5 (unit order; the code needs self-state-1).

**Opcodes (8):** `SMSG_MOVE_FEATHER_FALL`, `SMSG_MOVE_NORMAL_FALL`,
`CMSG_MOVE_FEATHER_FALL_ACK`, `SMSG_MOVE_GRAVITY_DISABLE`,
`SMSG_MOVE_GRAVITY_ENABLE`, `CMSG_MOVE_GRAVITY_DISABLE_ACK`,
`CMSG_MOVE_GRAVITY_ENABLE_ACK`, `SMSG_MULTIPLE_MOVES`.

**Files:**
- Modify (lease): `control-sync.ts` (the ack table gains feather fall and
  the two gravity acks, which use `buildRootAck`, `protocol/movement.ts:244`),
  `control-flags.test.ts`.
- Modify: `areas/selfstate/protocol.ts` (`parseMultipleMoves`), its test,
  `areas/selfstate/area.ts`, `areas/selfstate/store.test.ts`,
  `areas/selfstate/opcodes.ts` (`unseen` gains the four gravity opcodes),
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`.
- Create: `packages/devtools/src/probe-flows/selfstate-slowfall.ts`.

**Steps:**

- [ ] **Step 1: Failing tests.**
  - Control: `moveFlag("feather_fall", true, n)` sends
    `CMSG_MOVE_FEATHER_FALL_ACK` with `FALLING_SLOW` 0x20000000 and a
    trailing `u32` 1; `moveFlag("gravity_off", true, n)` sends
    `CMSG_MOVE_GRAVITY_DISABLE_ACK` with `DISABLE_GRAVITY` 0x400 and
    **no** trailing `u32` (AC `Handlers/MiscHandler.cpp:1505-1520`);
    `false` sends `CMSG_MOVE_GRAVITY_ENABLE_ACK`. A gravity-off
    character refuses a move with `disable_gravity` (existing rule,
    `control-motion.ts` `unsupportedReason`).
  - Parser: `parseMultipleMoves` over two bodies built as
    `Entities/Player/Player.cpp:11866-11912` writes them: the ghost case
    (one `SMSG_MOVE_WATER_WALK` entry) and the full case (root 0xE8,
    feather fall 0xF2, water walk 0xDE, hover 0xF4). Layout: `u32` byte
    count, then per entry `u8` length (opcode + guid + counter, not
    itself, `:11873`), `u16` opcode, packed guid, `u32` counter (wowm
    `movement/smsg/smsg_multiple_moves.wowm:1-25` agrees). An unknown
    inner opcode is skipped by its length and reported.
  - Area: each entry becomes one `core.self` event in wire order (0xE8 →
    `force_root`, the others → `move_flag` on), each with its own
    counter; an entry for another guid is skipped. Feather fall and
    normal fall (`Unit.cpp:16199-16214`) and the gravity pair
    (`Unit.cpp:16103-16114`) become `move_flag` events.
- [ ] **Step 2: Implement** the table rows, `parseMultipleMoves` and the
  `register` lines.
- [ ] **Step 3:** tests, typecheck, coverage, `mise ci:checks`.
- [ ] **Step 4: Probe flow** `selfstate-slowfall.ts`: cast Slow Fall on
  self, wait for the aura to end.
- [ ] **Step 5: Live proof.**
  - Slow Fall: `eversong10-mage` account A and witness W at one point.
    Offline `soap setup A spells/learn` Slow Fall and `items/add` its
    reagent (spell 130 and Light Feather 17056 from general knowledge;
    confirm both in the spell and item catalogs). Run W with
    `--expect MSG_MOVE_FEATHER_FALL`, then
    `mise protocol:probe A --flow selfstate-slowfall --expect SMSG_MOVE_FEATHER_FALL --expect SMSG_MOVE_NORMAL_FALL`.
  - Compound: kill and release A with `selfstate-death` but stop the flow
    before the reclaim (a flow argument), then log A in again with
    `mise protocol:probe A --wait 20 --expect SMSG_MULTIPLE_MOVES`; the
    trace shows one water-walk entry and the outbound ack. Whether the
    ghost aura 8326 survives logout: could not determine; if no compound
    arrives, record `mock` from `Player.cpp:11866-11912`.
  - Gravity: no normal-play trigger for a player (only scripts call
    `SetDisableGravity`, for example
    `src/server/scripts/Spells/spell_generic.cpp:2866`). `mock` from
    `Unit.cpp:16086-16119`.
- [ ] **Step 6: Proof rows.** Feather fall set `live`; compound `live`,
  or `mock` with `SMSG_MULTIPLE_MOVES` added to `unseen`; the four gravity rows `mock` and in `unseen`. Wire note:
  gravity acks carry no `isApplied`; the feather-fall ack reads a packed
  guid (`movement/cmsg/cmsg_move_feather_fall_ack.wowm:1-8` has `Guid`).
- [ ] **Step 7: Commit.**
  Subject: `feat: Ack feather fall, gravity and login moves`
  Body: `A root or water walk active at login arrives only inside SMSG_MULTIPLE_MOVES, and the server drops every later move from a rooted mover that omits ROOT. Each entry and each feather fall or gravity change is now acked with its own counter.`

**Proof:** live for feather fall and, if the ghost login sends it, the
compound; mock for gravity from `Entities/Unit/Unit.cpp:16086-16119`,
not seen live.

---

## Task self-state-4: Transfer abort

**Phase:** 1. **codeArea:** `selfstate`. **Size:** S. **Control lease.**

Rulings: SR1-self-state-1, SR1-self-state-5, SR1-self-state-7, SR1-self-state-8, SR1-self-state-12.

**Depends on:** self-state-2 (unit order), self-state-5 (the store), T-5.

**Opcodes (1):** `SMSG_TRANSFER_ABORTED`.

**Files:**
- Modify (lease): `self-store.ts` (`{ type: "transfer_aborted" }`),
  `control-feed.ts`, `control.ts`, `control-sync.ts` (the watchdog),
  `control-flags.test.ts`.
- Modify: `areas/selfstate/protocol.ts` (`parseTransferAborted`,
  `TRANSFER_ABORT_REASONS`), its test, `store.ts` and test, `area.ts`,
  `opcodes.ts` (`unseen` gains it if the live try fails),
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`.

**Steps:**

- [ ] **Step 1: Failing tests.**
  - Parser, from `Entities/Player/Player.cpp:11956-11972`: `u32` map,
    `u8` reason, then `u8` arg only for reasons 7, 8 and 9
    (`INSUF_EXPAN_LVL`, `DIFFICULTY`, `UNIQUE_MESSAGE`); reason names from
    `Entities/Player/Player.h:768-786`. Four cases: each arg reason and
    reason 5 without arg.
  - Store: `lastTransferAbort = { mapId, reason, arg, at }` and one
    `transfer_aborted` event; `core.self` gets `transfer_aborted`.
  - Control: after `handleTransferPending`, a `transfer_aborted` event
    arms a 10 s watchdog that clears `teleporting` when no `new_world`
    or near teleport arrives (fake timers); a `new_world` first cancels
    it; an abort with no pending transfer arms nothing. Both server
    orders: before the pending packet (`Player.cpp:1563` then `:1609`)
    and after it (`Handlers/MovementHandler.cpp:91-97`, followed by the
    home-bind teleport).
- [ ] **Step 2: Implement.** The area owns the handler; control gets the
  self event through `core.self.receive`.
- [ ] **Step 3:** tests, typecheck, coverage, `mise ci:checks`.
- [ ] **Step 4: Live try.** One `max80` account. With T-5,
  `mise factory soap gm A tele <tele>` into six different non-raid
  dungeons within one hour, logging in with the probe after each, to hit
  `TRANSFER_ABORT_TOO_MANY_INSTANCES` (`Maps/MapMgr.cpp:230-244`).
  Which `game_tele` rows lie inside instances and the per-hour limit on
  this server: could not determine; the worker checks, and stops after
  one attempt (design 5.7 question 8).
- [ ] **Step 5: Proof row:** `live` if the abort arrived, else `mock`
  from `Entities/Player/Player.cpp:11956-11972` and `unseen`.
- [ ] **Step 6: Commit.**
  Subject: `feat: Report refused map transfers`
  Body: `A refused dungeon entry left the character waiting for a new world that never came. The abort is now an event with its reason, and a watchdog frees control when no teleport follows.`

**Proof:** live if the six-dungeon run triggers it; else mock from
`Entities/Player/Player.cpp:11956-11972`, not seen live.

---

## Task self-state-3: Collision height, pitch rate, skip, fall reset

**Phase:** 1. **codeArea:** `selfstate`. **Size:** S. **Control lease.**

Rulings: SR1-self-state-1, SR1-self-state-3, SR1-self-state-5, SR1-self-state-6, SR1-self-state-7, SR1-self-state-8, SR1-self-state-11.

**Depends on:** self-state-4 (unit order), self-state-1, S0-2 (0x45D in
`CORE_OPCODES`), T-3.

**Opcodes (6):** `SMSG_MOVE_SET_COLLISION_HGT`,
`CMSG_MOVE_SET_COLLISION_HGT_ACK`, `SMSG_FORCE_PITCH_RATE_CHANGE`,
`CMSG_FORCE_PITCH_RATE_CHANGE_ACK`, `CMSG_MOVE_TIME_SKIPPED`,
`CMSG_MOVE_FALL_RESET`.

**Files:**
- Modify (lease): `protocol/movement.ts` (`SPEED_ACKS` row for
  `SMSG_FORCE_PITCH_RATE_CHANGE` → `CMSG_FORCE_PITCH_RATE_CHANGE_ACK`,
  no `extraByte`, no `field`; `buildTimeSkipped(guid, ms)`),
  `self-store.ts` (`collision_height`), `control-feed.ts`, `control.ts`,
  `control-sync.ts` (`collisionHeight`, `timeSkipped`, `resetFall`),
  `control-flags.test.ts`.
- Modify: `areas/selfstate/protocol.ts` (`parseCollisionHeight`), its
  test, `store.ts` (`collisionHeight`) and test, `area.ts`,
  `opcodes.ts` (`unseen` gains both pitch-rate opcodes),
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`.
- Create: `packages/devtools/src/probe-flows/selfstate-mount.ts`.

**Steps:**

- [ ] **Step 1: Failing tests.**
  - Parser: `SMSG_MOVE_SET_COLLISION_HGT` is packed guid, `u32`, `f32`
    (`Entities/Unit/Unit.cpp:10272-10277`).
  - Control: `collisionHeight(5, 3.1)` sends
    `CMSG_MOVE_SET_COLLISION_HGT_ACK` as packed guid, `u32` 5,
    MovementInfo, `f32` 3.1 (AC reader
    `Handlers/MovementHandler.cpp:688-692`), with no motion abort.
  - Pitch rate: injecting `SMSG_FORCE_PITCH_RATE_CHANGE` (packed guid,
    `u32`, `f32`, `Unit.cpp:11066-11082`) gives a `force_speed` self
    event, and control echoes the packet's value in the ack (an ack
    above the server's rate kicks, `MovementHandler.cpp:765-777`).
  - `timeSkipped(250)` sends packed guid, `u32` 250 (AC reader
    `MovementHandler.cpp:894-901`); `resetFall()` sends
    `CMSG_MOVE_FALL_RESET` as packed guid then MovementInfo with
    `fallTime` 0 and `FALLING` cleared (AC reads the guid first,
    `MovementHandler.cpp:381,399`; wowm
    `movement/cmsg/cmsg_move_fall_reset.wowm:13-17` omits it). Neither has
    an automatic caller (plan decision 5).
- [ ] **Step 2: Implement.** The area stores the height and forwards
  `collision_height` to `core.self`.
- [ ] **Step 3:** tests, `mise typecheck core`, coverage, `mise ci:checks`.
- [ ] **Step 4: Probe flow** `selfstate-mount.ts`: cast a known mount
  spell with the existing cast act and wait for the collision height.
- [ ] **Step 5: Live proof.**
  - Collision height: `max80` account A and witness W at one point.
    Offline `soap setup A spells/learn` Apprentice Riding and one mount
    spell of the race (ids from the spell catalog; 33388 and 34795 from
    general knowledge). W with `--expect MSG_MOVE_SET_COLLISION_HGT`; A
    with `--flow selfstate-mount --expect SMSG_MOVE_SET_COLLISION_HGT`.
  - Time skip and fall reset: a control method has no handle, so the
    live send uses the probe: `--send CMSG_MOVE_TIME_SKIPPED --body <hex>`
    with the body from `buildTimeSkipped` over A's guid, while W expects
    `MSG_MOVE_TIME_SKIPPED`; `--send CMSG_MOVE_FALL_RESET --body <hex>`
    with A's current position, then `soap truth A` after logout shows
    that position. Where A's guid comes from (`soap truth` or the trace):
    could not determine; the worker uses whichever carries it.
  - Pitch rate: nothing changes a player's pitch rate on this server
    (`MOVE_PITCH_RATE` has no `SetSpeed` caller). `mock` from
    `Unit.cpp:11066-11082`.
- [ ] **Step 6: Proof rows.** Collision pair and time skip `live`, fall
  reset `live` (truth position), both pitch-rate rows `mock` and
  `unseen`. Wire notes: fall reset guid; 0x45D has no wowm file.
- [ ] **Step 7: Commit.**
  Subject: `feat: Ack collision height and pitch rate`
  Body: `Every mount and dismount changes the collision height, and the server kept its old copy without an ack. Pitch rate joins the speed acks, and control gains the time skip and fall reset sends.`

**Proof:** live for collision height (mount with a witness), time skip
(witness relay) and fall reset (truth position); mock for pitch rate
from `Entities/Unit/Unit.cpp:11066-11082`, not seen live.

---

## Task self-state-11a: Harness rows for the passive self state

**Phase:** 1. **codeArea:** `selfstate`. **Size:** S.

Rulings: SR1-self-state-15, SR1-self-state-16.

**Depends on:** self-state-3 (unit order), self-state-4, self-state-5, S0-3.

**Opcodes:** none (uses the events of self-state-4 and -5).

**Files:**
- Modify: `packages/harness/src/areas/selfstate/area.ts` (glyph, `event`
  rules, `attach`).
- Create: `packages/harness/src/areas/selfstate/area.test.ts`.

**Steps:**

- [ ] **Step 1: Failing test** (`triggerAreaEvent` on the mock handle,
  contract 1.8, and `areaDrafts` from `areas/rules.ts`):
  - `mirror_timer` started for breath writes one `wake` row
    `selfstate/under_water` "You are under water: breath 60 s.";
    stopped writes a `log` row "You can breathe again.".
  - `breath_low` writes one `wake` row `selfstate/breath_low`
    "Breath 10 s left. Surface now.".
  - `transfer_aborted` writes one `wake` row "Could not enter <map>:
    <reason words>." (the map name from the map id where core has one;
    else the id).
  - `stand_changed` and `ghost_pending` write no row (`[]`, the flood
    guard).
  - `attach` with a running breath timer writes one row.
- [ ] **Step 2: Implement** the rules in the owned harness module.
- [ ] **Step 3:** `mise test` on the file, `mise typecheck harness`,
  `mise ci:checks`.
- [ ] **Step 4: Live proof.** The deep-water login of self-state-5 with
  `mise harness --profile <path>` running; the game log shows the
  under-water row. No eval (no verb, R9).
- [ ] **Step 5: Commit.**
  Subject: `feat: Log breath and refused transfers`
  Body: `The agent had no word that it was drowning or that a dungeon refused it. Area rules now write these rows and wake the agent for them.`

**Proof:** live harness run (deep-water login); no eval.

---

## Task self-state-11b: Breath interrupt and state in look and now

**Phase:** 1. **codeArea:** `selfstate`. **Size:** S.

Rulings: SR1-self-state-13, SR1-self-state-14, SR1-self-state-15, SR1-self-state-17.

**Depends on:** self-state-11a; leases on `packages/harness/src/ops/danger.ts`
(after the threat holder task), `packages/harness/src/tools/look.ts`,
`packages/harness/src/events/now.ts` and `packages/harness/src/ops/views.ts`
(contract issues 4 and 5).

**Opcodes:** none.

**Files:**
- Modify (lease): `packages/harness/src/ops/danger.ts` and
  `danger.test.ts` (`watchInterrupts` gains a `breath` cause from
  `handle.selfstate.onEvent` `breath_low`),
  `packages/harness/src/tools/look.ts` and `look.test.ts` (self line
  shows `sitting`, `kneeling`, `sleeping`), `contract/views.ts` (the
  views `look` reads, D13), `packages/harness/src/events/now.ts`,
  `now.test.ts`, `packages/harness/src/ops/views.ts`
  (`nowSnapshot` gains `breathS`).

**Steps:**

- [ ] **Step 1: Failing tests.** A running interruptible call stops with
  cause `breath` and the text "Surface now: you have N s of breath." when
  the mock handle emits `breath_low`; `[now]` shows `breath 45 s` while
  a breath timer runs and nothing after the stop; `look` shows `sitting`
  for stand state 1.
- [ ] **Step 2: Implement.** Read `handle.selfstate.state()`; no core
  change.
- [ ] **Step 3:** tests, `mise typecheck harness`, `mise ci:checks`.
- [ ] **Step 4: Live proof.** The deep-water login with a `travel`
  running under `mise harness`: the run stops with `breath`. Rerun
  `t1-walk-to-npc` (gate, contract 3.6).
- [ ] **Step 5: Commit.**
  Subject: `feat: Stop runs when breath runs low`
  Body: `Control walks the lake bed in deep water, so a long walk could drown the character. Runs now stop with a surface message, and look and the now line show breath and sitting.`

**Proof:** live harness run; `t1-walk-to-npc` passes.

---

## Task self-state-7: Self-resurrection and the corpse query

**Phase:** 2. **codeArea:** `selfstate`. **Size:** S.

**Depends on:** self-state-11b (unit order), self-state-5, T-3, SEED-2.

**Opcodes (3):** `CMSG_SELF_RES`, `CMSG_CORPSE_MAP_POSITION_QUERY`,
`SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE`.

**Files:**
- Modify: `areas/selfstate/protocol.ts` (`buildCorpseMapPositionQuery`,
  `parseCorpseMapPosition`), its test, `fields.ts` (`selfResSpell` from
  offset 1199), `store.ts` and test, `runtime.ts` and test, `area.ts`,
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`,
  `packages/harness/src/areas/selfstate/area.ts` and test
  (`worldActs: ["selfResurrect"]`, a `self_res_available` rule).
- Create: `packages/devtools/src/probe-flows/selfstate-selfres.ts`.

**Steps:**

- [ ] **Step 1: Failing tests.**
  - `buildCorpseMapPositionQuery()` is `u32` 0 (AC reader
    `src/server/game/Server/Packets/QueryPackets.cpp:55-58`); the response
    is four `f32` (writer `Handlers/QueryHandler.cpp:399-410`, always
    zero).
  - `selfResSpell` follows the self field; `self_res_available` fires when
    it turns non-zero.
  - `act.selfResurrect()` refuses `not_dead` and `no_self_res` without a
    send; otherwise sends an empty `CMSG_SELF_RES` (reader
    `Handlers/SpellHandler.cpp:707-721`) and resolves when the self
    health turns positive within 5 s, else `no_answer` (the server
    refuses silently, `:713-716`).
  - `act.queryCorpseMapPosition()` resolves on the injected reply;
    3 s timeout.
  - Harness: the rule writes "You can come back where you died
    (<spell name>)." once.
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** tests, typecheck core and harness, coverage,
  `mise ci:checks`.
- [ ] **Step 4: Live proof.** `eversong10` account A: offline
  `soap setup A spells/learn` 20608 (Reincarnation) and `items/add` 17030
  (Ankh). `HasSpell(20608)` does not check the class
  (`Entities/Player/Player.cpp:12959`); whether the realm service learns
  another class's spell: could not determine. Place A among the
  fairbreeze stalkers;
  `mise protocol:probe A --flow selfstate-selfres` waits for death, reads
  `selfResSpell` (21169, `Player.cpp:12909-12962`), sends the act, and
  exits 0 when alive; `soap truth A` shows `alive`. Corpse query:
  `--send CMSG_CORPSE_MAP_POSITION_QUERY --expect SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE`.
  If the learn is refused, `CMSG_SELF_RES` is `mock` from
  `Handlers/SpellHandler.cpp:707-721` and `unseen`, and self-state-9
  waits for a Shaman preset or a warlock partner (design 5.7 question 9).
- [ ] **Step 5: Commit.**
  Subject: `feat: Add self-resurrection and corpse query`
  Body: `A character with Reincarnation or a Soulstone could not use it and had to walk back as a ghost. The selfstate area now reads the self-res spell and sends the resurrection on request.`

**Proof:** live (die with Reincarnation learned, send, truth `alive`;
corpse query reply); mock fallback from `Handlers/SpellHandler.cpp:707-721`.

---

## Task self-state-9: Harness `recover how:"self"`

**Phase:** 2. **codeArea:** `selfstate`. **Size:** S.

**Depends on:** self-state-7, S0-4; leases on
`packages/harness/src/tools/recover.ts`, `packages/harness/src/ops/recover.ts`
and `packages/harness/src/tools/params.ts` (contract issue 6).

**Opcodes:** none (uses `CMSG_SELF_RES` from self-state-7).

**Files:**
- Modify (lease): `packages/harness/src/tools/recover.ts` and
  `recover.test.ts` (the `self` way, precheck, report),
  `packages/harness/src/ops/recover.ts` and `recover.test.ts`,
  `packages/harness/src/tools/params.ts` (`recoverParams.how` gains
  `self`, its text: "self: come back where you died with a Soulstone or
  Reincarnation.").
- Create: `packages/harness/src/grader/scenarios/t6-selfstate-res.json`.
- Modify (shared, contract 2.6 and 3.2): `packages/harness/src/grader/scenarios.ts`
  (`ROUND_1`, append), `docs/capabilities.md`, `docs/evals.md` (a new
  "Which scenarios to run" row: change area "self-state (recover
  how:self; spell mount/dismount)", scenario `t6-selfstate-res`). The
  `recover` row text in `docs/harness.md` is not edited (contract
  issue 8).

**Steps:**

- [ ] **Step 1: Failing test.** `recover how:"self"` on a mock game:
  alive refuses `not_dead`; dead with `selfResSpell` 0 refuses
  `no_self_res` and names the other ways; dead with 21169 calls
  `handle.selfstate.act.selfResurrect` (spied) and reports "Back to life
  where you died (Reincarnation)."; `expectSendKind` passes.
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** tests, `mise typecheck harness`,
  `mise test packages/harness/src/grader/scenarios.test.ts`,
  `mise ci:checks`.
- [ ] **Step 4: Eval.** `t6-selfstate-res`: preset `eversong10`, field
  `fairbreeze-stalkers`, spawn `eversong`, setup rows `spells/learn` 20608
  and `items/add` 17030 in the schema's setup shape. Task: "Fight until
  you die, then come back to life where you died without walking back to
  your body." Checks: truth `alive`; game log `life/dead` then
  `life/alive` with no `life/released` corpse walk between; the pose at
  `life/alive` within 5 yd of the pose at `life/dead`.
  `mise eval run t6-selfstate-res --round <n>`, babysat by Muse (R10).
- [ ] **Step 5: Docs.** Capabilities row (passed) or bullet (not passed),
  contract 3.4: "Come back to life where it died, with Reincarnation or
  a Soulstone | `t6-selfstate-res` | Needs a self-res spell and its
  reagent; the server refuses silently under a no-resurrection aura."
- [ ] **Step 6: Commit** (scenario, `ROUND_1`, both doc rows in one
  commit, D15).
  Subject: `feat: Recover by self-resurrection`
  Body: `An agent with a Soulstone or Reincarnation still walked its ghost back to the corpse. recover how:"self" now comes back where the character died.`

**Proof:** eval `t6-selfstate-res` and its verdict; gates of contract 3.6.

---

## Task self-state-6: Mount and dismount in core

**Phase:** 3. **codeArea:** `selfstate`. **Size:** S.

**Depends on:** self-state-9 (unit order), self-state-5, T-7, SEED-3.

**Opcodes (4):** `CMSG_CANCEL_MOUNT_AURA`, `SMSG_DISMOUNT`,
`CMSG_MOUNTSPECIAL_ANIM`, `SMSG_MOUNTSPECIAL_ANIM`.

**Files:**
- Modify: `areas/selfstate/fields.ts` (`UNIT_FLAG_MOUNT`, `mountDisplayId`
  from offset 69), `protocol.ts` (`parseDismount`,
  `parseMountSpecialAnim`) and test, `store.ts` and test, `runtime.ts`
  and test, `area.ts`, `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`,
  `packages/harness/src/areas/selfstate/area.ts` (`worldActs` gains
  `dismount`; `mounted` and `dismounted` rows) and test,
  `packages/devtools/src/probe-flows/selfstate-mount.ts`.

**Steps:**

- [ ] **Step 1: Failing tests.**
  - `SMSG_DISMOUNT` is a packed guid (`Entities/Unit/Unit.cpp:10301-10303`);
    `SMSG_MOUNTSPECIAL_ANIM` a full `u64` guid
    (`Handlers/MovementHandler.cpp:818-821`).
  - `mounted` and `mountDisplayId` follow `UNIT_FLAG_MOUNT` and
    `UNIT_FIELD_MOUNTDISPLAYID` (`Unit.cpp:10288-10289`); `mounted` and
    `dismounted` fire on changes; a self `SMSG_DISMOUNT` clears both
    early and the fields confirm (design area risk 7).
  - `act.dismount()` refuses `not_mounted` and `in_flight`
    (`UnitFlag.TAXI_FLIGHT`, `protocol/entity-fields.ts:91`) without a
    send (AC `Handlers/MiscHandler.cpp:1479-1490`); otherwise sends an
    empty `CMSG_CANCEL_MOUNT_AURA` and resolves on `dismounted` within
    2 s, else `no_answer`.
  - `act.mountSpecialAnim()` refuses `not_mounted`, else sends the empty
    opcode (reader `MovementHandler.cpp:816-822`).
  - Another guid's `SMSG_MOUNTSPECIAL_ANIM` emits `mount_anim`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** tests, typecheck, coverage, `mise ci:checks`.
- [ ] **Step 4: Live proof.** Two `max80` accounts A and B at one point,
  both with riding and a mount learned offline. A:
  `--flow selfstate-mount` (mount, then `act.dismount()`) with
  `--expect SMSG_DISMOUNT`. B mounted sends
  `tmp/puppet-B raw CMSG_MOUNTSPECIAL_ANIM` (T-7) while A runs
  `--wait 60 --expect SMSG_MOUNTSPECIAL_ANIM`.
- [ ] **Step 5: Commit.**
  Subject: `feat: Add dismount and mount state`
  Body: `A mounted character cannot cast or use items, and Peon had no way down. The selfstate area now reads the mount fields and sends the dismount request.`

**Proof:** live for all four (mount and dismount; the partner's special
animation).

---

## Task self-state-10a: Mount verbs and the mount eval

**Phase:** 3. **codeArea:** `selfstate`. **Size:** M.

**Depends on:** self-state-6, `spells-12` (the `spell` tool); lease on
`packages/harness/src/areas/spells/tool.ts` (contract 2.7, last row), and
on `tools/look.ts`, `events/now.ts`, `ops/views.ts` for the mounted line
(contract issue 5).

**Opcodes:** none (uses self-state-6 and the handled `CMSG_CAST_SPELL`).

**Files:**
- Modify (lease): `packages/harness/src/areas/spells/tool.ts` and its
  test (`do:"mount"`, `do:"dismount"`), `tools/look.ts`, `look.test.ts`,
  `events/now.ts`, `now.test.ts`, `ops/views.ts`, `contract/views.ts`
  (`mounted`).
- Create: `packages/harness/src/grader/scenarios/t9-selfstate-mount.json`.
- Modify (shared): `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md` (the row, and "mounts" removed from the "no
  tool for" sentence, contract 3.4), `docs/evals.md` (the self-state row
  gains the id). The `spell` row text in `docs/harness.md` is not edited
  (contract issue 8).

**Steps:**

- [ ] **Step 1: Failing tests.** `spell do:"mount"` picks a known
  `SPELL_AURA_MOUNTED` spell (or the named one), casts it through the
  existing cast path, and reports on `mounted`; it refuses
  `already_mounted`, `no_mount`, `in_combat`, and `indoors` from
  `SMSG_CAST_FAILED`. `do:"dismount"` calls the spied act and reports on
  `dismounted`. `look` and `[now]` show `mounted`. Whether the spell
  catalog exposes the aura type: could not determine; if not, the tool
  takes a named spell only and says so.
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** tests, typecheck, scenarios test, `mise ci:checks`.
- [ ] **Step 4: Eval** `t9-selfstate-mount`: preset `max80`, setup rows
  learning Apprentice Riding and one mount of the race, a named NPC about
  200 yd away. Task: "Get on your mount, ride to <NPC>, then get off."
  Checks: game log `selfstate/mounted` before the walk and
  `selfstate/dismounted` after arrival; truth position within 10 yd of
  the NPC. `mise eval run t9-selfstate-mount --round <n>`.
- [ ] **Step 5: Docs** (one commit with the scenario, D15): row "Ride a
  mount and get off it | `t9-selfstate-mount` | Needs a known mount
  spell and riding; mounting fails indoors and in combat."
- [ ] **Step 6: Commit.**
  Subject: `feat: Add mount and dismount to the spell tool`
  Body: `Long walks at level 20 and above took far longer on foot, and the agent could not get off a mount before casting. spell do:"mount" and do:"dismount" now do both.`

**Proof:** eval `t9-selfstate-mount` and its verdict.

---

## Task self-state-10b: Dismount before acting

**Phase:** 3. **codeArea:** `selfstate`. **Size:** S.

**Depends on:** self-state-10a; leases on `packages/harness/src/tools/engage*.ts`,
`packages/harness/src/tools/rest.ts`, `packages/harness/src/tools/loot.ts`
and `packages/harness/src/tools/interact*.ts` (contract issue 6).

**Opcodes:** none.

**Files:**
- Modify (lease): `packages/harness/src/tools/engage.ts`,
  `tools/rest.ts`, `tools/loot.ts`, `tools/interact-trainer.ts` and their
  colocated tests.
- Create: `packages/harness/src/areas/selfstate/dismount-first.ts` and
  `dismount-first.test.ts`.

**Steps:**

- [ ] **Step 1: Failing tests.** A mounted character: `engage`, `rest`,
  `loot` and `interact do:"train"` call the spied `dismount` act first
  and their result says "Dismounted first."; a `dismount` refusal stops
  the call with that reason. The server refuses casts while mounted
  (`Spells/Spell.cpp:6209-6216`).
- [ ] **Step 2: Implement** `dismountFirst` in `dismount-first.ts`,
  called by each tool.
- [ ] **Step 3:** tests, `mise typecheck harness`, `mise ci:checks`.
- [ ] **Step 4: Live proof.** Rerun `t9-selfstate-mount` with a task
  that ends in `rest`, and the gates `t1-walk-to-npc`, `t7-halt-resume`,
  `t3-ghostlands-kill` (contract 3.6).
- [ ] **Step 5: Commit.**
  Subject: `feat: Dismount before fights, rest and loot`
  Body: `A mounted character's casts and item uses fail, so these tools failed without a clear reason. They now dismount first and say so.`

**Proof:** eval rerun and gates.

---

## Task self-state-12: Swim and fly movement sends

**Phase:** 3. **codeArea:** `selfstate`. **Size:** M. **Control lease.**

Added by the plan fix-up (coverage verifier defect 1). Design 7.2
question 2 sets the swimming owner to `selfstate`, item 4 (default), and
the design wins over the plan. This task number is the plan's, not the
design's; it is **not yet ruled by the maintainer**.

**Depends on:** self-state-10b (unit order), the control lease (contract
2.7: `control.ts`, `control-motion.ts`, `control-sync.ts`,
`protocol/movement.ts`). It runs before the `vehicles` holders of phase C.

**Opcodes (10, handled rows, send side):** `MSG_MOVE_START_SWIM`,
`MSG_MOVE_STOP_SWIM`, `MSG_MOVE_SET_PITCH`, `MSG_MOVE_START_PITCH_UP`,
`MSG_MOVE_START_PITCH_DOWN`, `MSG_MOVE_STOP_PITCH`,
`MSG_MOVE_START_ASCEND`, `MSG_MOVE_STOP_ASCEND`,
`MSG_MOVE_START_DESCEND`, `CMSG_MOVE_SET_FLY`. Coverage counts them
`handled` today only because the remote-motion parser reads them; core
never sends them. The research table has no row for them, so the
coverage check cannot show the gap. The reviewer checks these ten names
against the diff. They stay out of `areas/selfstate/opcodes.ts`: the
legacy remote-motion handlers still read them and the sends live in the
leased control files, so listing them in `owns` would give them two
owners and fail the S0-2 coverage test. Their proof rows go in
`docs/areas/selfstate.md` under a "Sent from control" heading.

**Files:**
- Modify (lease): `control-motion.ts` (`unsupportedReason`,
  `control-motion.ts:36-44` at `02b83919`, stops refusing `swimming`, and
  refuses `flying` only while the server has not set `CAN_FLY`),
  `control.ts` (the swim, pitch and ascend steps), `control-sync.ts`
  (sends the ten messages; `setCanFly`, `control-sync.ts:260-275`, stays
  the ack path), `protocol/movement.ts` (pitch is written when
  `SWIMMING` or `FLYING` is set, `PITCH_FLAGS`, `protocol/movement.ts:90`)
  and their colocated tests.
- Create: `areas/selfstate/swim.ts` and `swim.test.ts` (the water
  check, in water when the liquid level is above the collision height).
- Modify: `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`.
- Create: `packages/devtools/src/probe-flows/selfstate-swim.ts`.

**Steps:**

- [ ] **Step 1: Check the water source.** Core has no liquid level
  today (no `liquid` or `water` symbol in `control*.ts` at `02b83919`).
  Whether the ground oracle can give one could not be determined at plan
  time. If it cannot without a new dependency or a new oracle surface,
  stop `blocked` (contract 0.2) and name the missing member.
- [ ] **Step 2: Failing tests.** Build each message as
  `Handlers/MovementHandler.cpp:362` (`HandleMovementOpcodes`) reads it:
  the movement info with `SWIMMING` and a pitch; a start and stop swim on
  a water boundary; `CMSG_MOVE_SET_FLY` and the ascend and descend
  messages only after `SMSG_MOVE_SET_CAN_FLY`. The server resets its
  in-water state from the `SWIMMING` bit
  (`Handlers/MovementHandler.cpp:651-656`), so a test pins that the bit
  follows the water test. Control refuses a fly step without `CAN_FLY`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** tests, `mise typecheck core`, coverage, `mise ci:checks`.
- [ ] **Step 5: Live proof.** One `eversong10` account A at the
  deep-water point of self-state-5 and a witness W beside it:
  `--flow selfstate-swim` walks A into the water and out; W runs
  `mise protocol:probe W --wait 30 --expect MSG_MOVE_START_SWIM --expect
  MSG_MOVE_STOP_SWIM`, and A is not disconnected. Flying: one `max80`
  account in Outland with a flying mount and the riding skill learned
  through `soap gm learn` (R12); A mounts, lifts and lands, and W sees
  `MSG_MOVE_START_ASCEND` and `MSG_MOVE_STOP_ASCEND`. If the flight
  cannot be set up, the fly rows are `builder` with the reader's
  `path:line` and the effect-unseen row of contract 0.6.
- [ ] **Step 6: Proof rows:** each of the ten `live` with the flow, or as
  step 5 says.
- [ ] **Step 7: Commit.**
  Subject: `feat: Swim and fly under control`
  Body: `Control refused every step in water or in the air, so the character could not cross a lake or fly. It now sends the swim, pitch and fly moves the server reads.`

**Proof:** live (witness relays of the swim and fly moves).

---

## Task self-state-8: Drunkenness and rested state

**Phase:** 4. **codeArea:** `selfstate`. **Size:** S.

**Depends on:** self-state-12 (unit order), self-state-5, SEED-4.

**Opcodes (1):** `SMSG_CROSSED_INEBRIATION_THRESHOLD`.

**Files:**
- Modify: `areas/selfstate/protocol.ts` (`parseInebriation`) and test,
  `fields.ts` (drunk value `PLAYER_BYTES_3` byte 1, `restedXp` offset
  1169, `resting` bit 0x20 in `PLAYER_FLAGS`, rest state
  `PLAYER_BYTES_2` byte 3), `store.ts` and test, `area.ts`,
  `packages/core/test-support/areas/selfstate.ts`,
  `docs/areas/selfstate.md`, `docs/protocol-coverage/selfstate.md`,
  `packages/harness/src/areas/selfstate/area.ts` and test (a
  `drunk_changed` log row "You feel tipsy.").
- Create: `packages/devtools/src/probe-flows/selfstate-drink.ts`.

**Steps:**

- [ ] **Step 1: Failing tests.** The parser reads a full `u64` guid,
  `u32` state, `u32` item id (writer
  `src/server/game/Server/Packets/MiscPackets.cpp:128-135`; wowm
  `social/smsg_crossed_inebriation_threshold.wowm:9-15` agrees). A self
  packet sets `drunkState` and emits `drunk_changed`; another guid does
  not. `drunkValue`, `restedXp` and `resting` follow the fields
  (AC `Entities/Player/Player.h:464,508,514`, `Player.cpp:1043,10409`).
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** tests, typecheck, coverage, `mise ci:checks`.
- [ ] **Step 4: Live proof.** One `eversong10` account with an
  alcoholic drink added offline (item from the item catalog; several may
  be needed): `--flow selfstate-drink --expect SMSG_CROSSED_INEBRIATION_THRESHOLD`.
  Rested: log out in an inn and back in; the store shows `resting`.
- [ ] **Step 5: Commit.**
  Subject: `feat: Track drunkenness and rested state`
  Body: `The character could not tell that it was drunk or resting in an inn. The selfstate store now reads both.`

**Proof:** live (drink until the threshold crosses; inn login).

---

## Dead opcodes

In `SELFSTATE_OPCODES.dead` from `SEED-1` (N13); each has a `dead` Proof
row, written by self-state-1.

| Opcode | Why |
|---|---|
| `SMSG_MOUNTRESULT` 0x16E | No AC code names it outside `Opcodes.{h,cpp}`; mount failures arrive as `SMSG_CAST_FAILED`. |
| `SMSG_RESURRECT_FAILED` 0x252 | No sender in AC. |
| `SMSG_FORCED_DEATH_UPDATE` 0x37A | No sender in AC. |
| `CMSG_MOVE_SET_CAN_TRANSITION_BETWEEN_SWIM_AND_FLY_ACK` 0x340 | `STATUS_NEVER` with `Handle_NULL` (`src/server/game/Server/Protocol/Opcodes.cpp:963`). |
| `SMSG_PAUSE_MIRROR_TIMER` 0x1DA | The `PauseMirrorTimer` class (`src/server/game/Server/Packets/MiscPackets.cpp:113-119`) is never constructed (design 5.7, N13). |

Opcode count: 6 + 5 + 8 + 1 + 6 + 3 + 4 + 1 = 34 relevant, plus 5 dead
= 39.

## Seed rulings (SEED-1)

The coordinator rules each open decision, contract issue and lease that a
wave-1 task of this unit (self-state-1, -5, -2, -4, -3, -11a, -11b) meets.
Each ruling is **not yet ruled by the maintainer**. A ruling marked
"amends" changes the named contract or plan text; the coordinator applies
that text in one `COORD-<n>` commit before the first affected task starts,
and until then the builder follows the ruling. Facts marked [M] were read
in this worktree at `f3cb40a9`.

Left for later seeds, not ruled here: plan decisions 3 (mount flag,
self-state-6), 4 (mount verbs and dismount first, self-state-10a and
-10b), 7 (rested XP, self-state-8) and 8 (swimming, self-state-12);
contract issues 3 (`protocol/entity-fields.ts`, self-state-6), 6
(`tools/params.ts` and the dismount-first leases, self-state-9 and -10b),
7 (swimming owner, self-state-12) and 8 (`docs/harness.md` rows,
self-state-9 and -10a). No wave-1 task meets them.

| Id | Issue (source) | Ruling | Status |
|---|---|---|---|
| SR1-self-state-1 | Plan decision 1: "The area registers every flag opcode itself (ownership model B)", with the exception "`SMSG_FORCE_PITCH_RATE_CHANGE` joins `SPEED_ACKS`, whose loop in `movement-handlers.ts:101-108` already registers every row" (self-state-1 to -4) | Stands. No legacy handler registers a flag SMSG of this unit today; only the `MSG_MOVE_*` relays in `protocol/remote-movement.ts` name them [M, `rg`]. `parseMoveCounter` is a `#wow/protocol/*` value import and `core.self.receive` is an existing entry point (design 3.5, `self-store.ts:57`). The pitch-rate exception stands: the legacy loop owns that opcode while it stays in `SELFSTATE_OPCODES.owns`, and the area does not register it. If `areas/registry.test.ts` or the coverage staleness test rejects that shape, self-state-3 stops `blocked` and names the test; the fallback is that the area registers `SMSG_FORCE_PITCH_RATE_CHANGE` with `on`, forwards a `force_speed` self event, and `SPEED_ACKS` gains no row. The design's fallback (legacy handlers in `movement-handlers.ts` register the flag opcodes) is not open in wave 1, because the `movement-handlers.ts` lease queue starts at travel-4; a reviewer who rejects model B sends the task back `blocked`. Area sources name only `GameOpcode.SMSG_*` opcodes; if the import scan of S0-1b flags `GameOpcode.SMSG_MOVE_` (it must match only `GameOpcode.CMSG_MOVE_` and `GameOpcode.MSG_MOVE_`, contract 1.12), the task stops `blocked` for a `COORD` fix of the scan | not yet ruled by the maintainer |
| SR1-self-state-2 | Plan decision 2: "Self fields are read by the area ... So no task edits `player-state.ts`" (self-state-5) | Stands; no `player-state.ts` lease. `#wow/entity-store` and `#wow/player-state` are not on the value allow-list (contract 1.12), so `fieldOf` and `readSelfField` are not imported as values. `areas/selfstate/fields.ts` reads `entity.rawFields.get(offset)` itself, checks the self guid and `ObjectType.PLAYER`, and copies the `createComplete` then 0 fallback of `fieldOf` (`entity-store.ts:77-84` [M]) where it needs it. `UNIT_FIELDS`, `PLAYER_FIELDS` and `ObjectType` come from `#wow/protocol/update-fields` and `#wow/protocol/entity-fields`; `Entity` is a type import | not yet ruled by the maintainer |
| SR1-self-state-3 | Plan decision 5: "No automatic caller for `CMSG_MOVE_TIME_SKIPPED` and `CMSG_MOVE_FALL_RESET`" (self-state-3) | Stands (design 5.7 default) | not yet ruled by the maintainer |
| SR1-self-state-4 | Plan decision 6: "No hover height in predicted z" (self-state-1) | Stands (design 5.7 default) | not yet ruled by the maintainer |
| SR1-self-state-5 | Contract issue 1: "`control-feed.ts` is missing from the control-files lease (contract 2.7) ... Tasks self-state-1 to -4 need it" | Closed by the plan fix-up: contract 2.7 "control files, extended" names `control-feed.ts` for self-state, and the plan "Leases" row queues self-state-1, then -4, then -3, then travel-4. self-state-2 does not edit it. Lease lines are in the structured result of this pass and go into "Lease handovers" | not yet ruled by the maintainer |
| SR1-self-state-6 | Contract issue 2: "`protocol/movement.ts` is in no lease. Self-state-1 renames `buildCanFlyAck` ... self-state-3 adds row 9 to `SPEED_ACKS`" | Closed by the plan fix-up (same contract 2.7 row). Queue: self-state-1, then self-state-3, then self-state-12. `buildCanFlyAck` has one caller, `control-sync.ts:11,271` [M], so the rename touches no file outside the control lease | not yet ruled by the maintainer |
| SR1-self-state-7 | Setup: "The coordinator gives each control task the control lease (`control-sync.ts`, `control.ts`, `control-motion.ts`, `self-store.ts`, `movement-handlers.ts`, ...)"; plan "Phase A": "self-state-1 waits for the `control.ts` lease from objects-5" | A control task holds only the control files its plan body names, per file, per task (D12). Wave 1 holds neither `control-motion.ts` (queue starts at self-state-12) nor `movement-handlers.ts` (queue starts at travel-4); a wave-1 task that needs either stops `blocked`. `control.ts` goes from objects-5 to self-state-1 when objects-5 lands, then -4, then -3. `control-sync.ts`: self-state-1 first, then -2, -4, -3. `self-store.ts`: -1, -4, -3. self-state-1 does not start before objects-5 has landed; the plan index does not list that wait as a dependency, so the coordinator adds it (structured result) | not yet ruled by the maintainer |
| SR1-self-state-8 | self-state-1 "Create (lease, colocated test): `control-flags.test.ts`", edited again by -2, -4 and -3 | `control-flags.test.ts` has no source of its own stem, so contract 2.5's colocated-test rule does not cover it. It rides the `control-sync.ts` lease: the holder of that lease creates or edits it, and it passes on with that lease (self-state-1, -2, -4, -3, then later holders). Amends the contract 2.7 "Leases added by the plan fix-up" table with one row, as for `world-handlers-group.test.ts` | not yet ruled by the maintainer |
| SR1-self-state-9 | self-state-2 Step 1: in `SMSG_MULTIPLE_MOVES`, "0xE8 → `force_root`" | The area names the inner opcodes as `GameOpcode` members. `SMSG_FORCE_MOVE_ROOT` is registered by the legacy `movement-handlers.ts:75` [M] and is not in `SELFSTATE_OPCODES.owns`, so design 3.15 test 4 needs it in `uses`: self-state-2 adds `SMSG_FORCE_MOVE_ROOT` to `uses` in `areas/selfstate/opcodes.ts` (the unit fills `uses`, contract 2.5) and registers no peek on it. The other three inner opcodes are owned. If a step-0 test rejects a `uses` row with no peek, the task stops `blocked` and names the test | not yet ruled by the maintainer |
| SR1-self-state-10 | self-state-1 Step 5: "the release and reclaim acts are the ones `recover` uses today (`packages/harness/src/ops/recover.ts`)"; self-state-2 Step 5: "stop the flow before the reclaim (a flow argument)" | `selfstate-death.ts` calls `handle.releaseSpirit()` and `handle.recoverCorpse(signal)` on the flow's world handle, the calls `ops/recover.ts:135,141` make [M]; it imports nothing from `@peon/harness`. self-state-1 builds the flow with `--arg reclaim=no` (default: reclaim), so self-state-2 runs `--flow selfstate-death --arg reclaim=no` and does not edit the file, which its plan body does not name | not yet ruled by the maintainer |
| SR1-self-state-11 | self-state-3 Step 5: "Where A's guid comes from (`soap truth` or the trace): could not determine" | From the trace. Run the probe with `--bodies`; the `out` row of `CMSG_PLAYER_LOGIN` in `packets.jsonl` has an 8-byte body, the guid low then high `u32` LE (`client-connection.ts:137-140`, `packet-trace.test.ts:133-135` [M]). The builder packs that guid for the `--send` bodies | not yet ruled by the maintainer |
| SR1-self-state-12 | self-state-4 Step 4: `mise factory soap gm A tele <tele>` in the live try, "the worker checks, and stops after one attempt" | Stands. Contract 0.7 forbids a GM command inside an eval, not in a probe proof, and `tele` is on the T-5 verb list (`soap-gm.ts:31,70-73` [M]). One attempt, own `max80` account only; if it gives no abort, the row is `mock` and `unseen` as the task says | not yet ruled by the maintainer |
| SR1-self-state-13 | Contract issue 4: "`ops/danger.ts` is leased to `threat` only. Self-state-11b needs it ... after the threat holder task lands" | Closed by the plan fix-up (contract 2.7 "harness `ops/danger.ts` \| self-state (after threat)"). `ops/danger.ts` goes from threat-3b to self-state-11b when threat-3b lands; `danger.test.ts` goes with it (contract 2.5 colocated rule). self-state-11b does not start before threat-3b has landed (structured result) | not yet ruled by the maintainer |
| SR1-self-state-14 | Contract issue 5: "The `[now]` line needs `events/now.ts`, `ops/views.ts` ... and `contract/views.ts` ... D13 covers `contract/views.ts` only through a tool-module lease" | Closed by the plan fix-up (contract 2.7 "harness observation" row). self-state-11b is the first holder of `events/now.ts` and `ops/views.ts` (next combat-log-7b). `contract/views.ts` is a lease of its own: queue threat-3b, quests-2, self-state-11b, so its lease covers `NowSnapshot.breathS` as well as the views `look` reads. `tools/look.ts`: threat-3b, objects-7, quests-2, travel-5, then self-state-11b; if `SEED-1` splits `tools/look.ts` by view, the lease covers the sibling file that holds the self line (contract 2.7, last paragraph), and the `SEED-1` "Leases" rows name it. self-state-11b starts only when it holds all five leases | not yet ruled by the maintainer |
| SR1-self-state-15 | self-state-11a Step 1: "`attach` with a running breath timer writes one row"; self-state-11b Step 2: "Read `handle.selfstate.state()`" | Harness tests do not edit the mock handle (contract 1.8). `attach` tests pass the state value directly. `[now]`, `look` and danger tests stub `jest.spyOn(handle.selfstate, "state")` with a breath timer or stand state, as acts are stubbed. If the mock's area handle refuses the spy, the task stops `blocked` and the coordinator adds a state setter to the mock in a `COORD` commit | not yet ruled by the maintainer |
| SR1-self-state-16 | self-state-11a Step 1: "Could not enter <map>: <reason words>." with "the map name from the map id where core has one; else the id" | Core has no map display names: `data/area-names.json` holds area names and `navigation/maps.ts` holds navigation file names such as `Expansion01` [M]. The row writes "map <id>". No task adds a map-name table for this row | not yet ruled by the maintainer |
| SR1-self-state-17 | Contract issue 8 in its general form: design 3.11 asks for docs prose on a user-visible change, and contract 2.6 allows no `docs/harness.md` edit except a new tool's row (self-state-11b changes `look` and `[now]`) | Refused for wave 1. self-state-11b does not edit `docs/harness.md`. The wave integration tidy writes the `look` and `[now]` prose; issue 8 for the `recover` and `spell` rows stays open for SEED-2 and SEED-3 | not yet ruled by the maintainer |

## COMPLETE

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-self-state-2-1 | self-state-2 adds `"feather_fall" \| "gravity_off"` to `MoveFlag` in `self-store.ts`, which is not in its plan body; SR1-self-state-7 gives `self-store.ts` to -1, -4, -3 only | self-state-2 holds the `self-store.ts` lease for the `MoveFlag` members only, between self-state-1 and self-state-4 | ruled by the maintainer (P2-4) |
