# Protocol coverage: vehicles (key: vehicles)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.16 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

The `vehicles` unit gives the character vehicle seats, spell-click, player
vehicles (multi-seat mounts) and transports (boats, zeppelins, lifts). It
owns the 14 relevant opcodes of the plan area, all `missing` today, and no
dead one. It adds the `vehicle` tool (kind `action`), the `travel ride`
verb and three scenarios: `t8-vehicles-board`, `t8-vehicles-drive` and
`t8-vehicles-zeppelin` (ids and tier from design 5.2; the plan index does
not exist at the time of writing, so the tier is the design's).

- **Phase:** 3 for every task. Design 5.1 puts `vehicles` and
  `transports` in wave 3, "last in the band, because they change
  control". N22 pulls no task of this unit into wave 1.
- **Worktree:** `proto-vehicles`, created by the coordinator with the
  command of contract 0.1; branch `proto/area-vehicles`. One task at a
  time, in the order of this file.
- **Code areas:** `vehicles` (tasks vehicles-1 to -5 and -9) and
  `transports` (tasks vehicles-6 to -8). Each has its own
  `packages/core/src/wow/areas/<area>/`, `packages/core/test-support/areas/<area>.ts`,
  `packages/harness/src/areas/<area>/area.ts`, `docs/areas/<area>.md` and
  `docs/protocol-coverage/<area>.md`.
- **Ownership split for the seed (a request to the coordinator).**
  `TRANSPORTS_OPCODES.owns` holds `CMSG_MOVE_CHNG_TRANSPORT`;
  `VEHICLES_OPCODES.owns` holds the other 13. `SEED-3` writes both.

Code lines below are at `71fba0ab` [M: read for this plan]. AzerothCore
paths are relative to `src/server/game/` unless they start with `src/`;
wowm paths are relative to `wow_message_parser/wowm/world/`. Marks follow
the contract: [M] read or run, [I] inferred.

## Leases and coordinator requests this unit needs

The coordinator assigns leases at the seed of wave 3 (contract 2.7). A task
that reaches one of these files without its lease stops as `blocked`.

| File | Task | Edit | Holder before this unit |
|---|---|---|---|
| `protocol/monster-move.ts` | vehicles-1 | export the body reader that `parseMonsterMove` uses after the guid (`protocol/monster-move.ts:169-178`), unchanged behaviour | none; **not in the contract 2.7 candidate list**, so the coordinator adds the row or makes the one export in a `COORD` commit |
| `protocol/movement-block.ts` | vehicles-1 (the `UPDATEFLAG_VEHICLE` fields), vehicles-6 (the `UPDATEFLAG_TRANSPORT` path progress and the `UPDATEFLAG_POSITION` transport guid and offset) | return the skipped fields in `MovementData` (`protocol/movement-block.ts:44-51,65-66`) | remote-motion (unitmotion-1, wave 1) |
| `protocol/update-object.ts` | vehicles-1 | a `COORD` commit, before vehicles-1, that exports the inflate step of `SMSG_COMPRESSED_UPDATE_OBJECT` (today inside `world-handlers-entity.ts:187-196`) as a function over a `PacketReader`, so an area can `peek` the compressed opcode (see "Create-block reads") | coordinator |
| control files: `control-sync.ts`, `control.ts`, `control-motion.ts`, `self-store.ts`, `movement-handlers.ts`, plus `control-feed.ts` and `control-mover.ts` | vehicles-3, -4, -7 | the passenger state, the mover, the transport ride | self-state (1-4, 6), travel-4, objects; `control-feed.ts` and `control-mover.ts` are **not named in contract 2.7**; the coordinator adds them to the control lease or the task stops `blocked` |
| harness `tools/travel*.ts` | vehicles-8 | the `ride` value of `travel` | travel-6 |
| harness `areas/pets/tool.ts` | vehicles-9, only if the `pet` tool refuses to cast from a vehicle bar | the vehicle-bar case | pets-10 |

### Create-block reads (a plan decision, accepted by the maintainer (P2-5))

The vehicle id (`UPDATEFLAG_VEHICLE`) and a transport's path progress
(`UPDATEFLAG_TRANSPORT`) arrive only in create blocks. The legacy owner of
`SMSG_UPDATE_OBJECT` and `SMSG_COMPRESSED_UPDATE_OBJECT` is
`client-handlers.ts:125-128`, and `world-handlers-entity.ts` is leased to
remote-motion. The areas therefore `peek` both opcodes (N3) and re-parse
the block with `parseUpdateObject` (`protocol/update-object.ts:105`), after
the movement-block lease makes it return the fields. The compressed
opcode needs an inflate, and `node:zlib` is not on the area import
allow-list (contract 1.12); hence the `COORD` request above. If the
coordinator refuses it, vehicles-1 and vehicles-6 stop `blocked` on the
compressed path. The cost is a second parse of every update packet [I];
the builder measures it with `mise test:slowest` and reports it.

### Control access (a plan decision, accepted by the maintainer (P2-5))

An area may not import control (contract 1.12), and `runtime.ts` is frozen.
Control already takes every self event through
`stores.self.onEvent((event) => feedControl(control, event))`
(`runtime.ts:83`, `control-feed.ts:4-47`). So the vehicles and transports
runtimes reach control by calling `core.self.receive(...)` with new
`SelfEvent` variants (`self-store.ts:15-27`), added under the control lease:

| Variant | Sent by | Control does |
|---|---|---|
| `{ type: "vehicle_seat"; vehicle: bigint; seat: number; offset: Vec3; splineId: number; duration: number }` | vehicles runtime, on the self `spline` event with `TRANSPORT_ENTER` | passenger state, `CMSG_MOVE_SPLINE_DONE` after `duration` (the travel-4 method) |
| `{ type: "vehicle_left" }` | vehicles runtime, on `exited` | clears the passenger state |
| `{ type: "mover_packet"; opcode: number; build: (mover: bigint, info: MovementInfo) => Uint8Array }` | vehicles runtime, for `exit` while driving and `changeSeatOnControlled` | sends `build(moverGuid, currentInfo)` |
| `{ type: "transport_board"; guid: bigint; offset: Vec3; poseAt: (now: number) => Position \| undefined }` | transports runtime | `CMSG_MOVE_CHNG_TRANSPORT` with `ON_TRANSPORT`, then passenger moves |
| `{ type: "transport_leave" }` | transports runtime | one `CMSG_MOVE_CHNG_TRANSPORT` without `ON_TRANSPORT` |

Every `CMSG_MOVE_*` send stays in the control files (contract 1.12). The
area builders name no opcode, so they may live in the area's
`protocol.ts`.

## Task vehicles-1: vehicle packets and passive store

- **codeArea:** `vehicles`. **Size:** M.
- **Files:**
  - Edit: `packages/core/src/wow/areas/vehicles/opcodes.ts` (remove the
    three stub lines, fill `uses`, `unseen`), `.../areas/vehicles/area.ts`
  - Create: `.../areas/vehicles/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `store.test.ts`, `area.test.ts`
  - Create: `packages/core/test-support/areas/vehicles.ts`
  - Edit (lease): `packages/core/src/wow/protocol/monster-move.ts`,
    `protocol/monster-move.test.ts`; `protocol/movement-block.ts` and its
    test
  - Edit: `packages/harness/src/areas/vehicles/area.ts`; create its test
  - Create: `packages/devtools/src/probe-flows/vehicles-mount.ts`
  - Create: `docs/areas/vehicles.md`
  - Regenerate: `docs/protocol-coverage/vehicles.md`
- **Depends on:** `SEED-3`, T-3 (probe), T-2 (tap), unitmotion-1 (lease
  handover on `movement-block.ts`), the `COORD` inflate export.
- **Opcodes:** `SMSG_MONSTER_MOVE_TRANSPORT`, `SMSG_PLAYER_VEHICLE_DATA`,
  `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`.

**Steps:**

- [ ] **Step 1: Test builders.** In `packages/core/test-support/areas/vehicles.ts`
  write `vehiclesMonsterMoveTransportBody({ guid, transportGuid, seat, move })`,
  `vehiclesPlayerVehicleDataBody({ guid, vehicleId })` and
  `vehiclesCreateVehicleBlock({ guid, vehicleId, orientation })`. Byte
  order from the AzerothCore writers:
  - `SMSG_MONSTER_MOVE_TRANSPORT`: packed guid, packed transport guid,
    `int8` seat (`Movement/Spline/MoveSplineInit.cpp:114-124`), then the
    common body, which starts with its own `uint8(0)`, the start point and
    the spline id (`Movement/Spline/MovementPacketBuilder.cpp:43-50`).
    The wowm file (`movement/smsg/smsg_monster_move_transport.wowm:21-49`)
    has one byte fewer; AzerothCore wins.
  - `SMSG_PLAYER_VEHICLE_DATA`: packed guid, `u32` vehicle id; `0` means
    "no longer a vehicle" (`Entities/Unit/Unit.cpp:10242-10245,10309-10312`).
  - `UPDATEFLAG_VEHICLE`: `u32` vehicle id, `f32` orientation
    (`Entities/Object/Object.cpp:478-486`).
- [ ] **Step 2: Failing parser tests** in `areas/vehicles/protocol.test.ts`:
  `parseMonsterMoveTransport` returns the guid, transport guid, a signed
  seat (a seat byte `0xff` reads `-1`) and the same move fields that
  `parseMonsterMove` returns for the body; a `stop` body works too;
  `parsePlayerVehicleData` returns `{ guid, vehicleId }`. In
  `protocol/movement-block.test.ts`, a create block with
  `UPDATEFLAG_VEHICLE` returns `vehicle: { id, orientation }`. Run
  `mise test packages/core/src/wow/areas/vehicles/protocol.test.ts` and
  see it fail on the missing module.
- [ ] **Step 3: Implement the parsers.** Export the body reader from
  `protocol/monster-move.ts` (lease) so `parseMonsterMove` and
  `parseMonsterMoveTransport` share it; `parseMonsterMove` keeps its
  behaviour, which its existing tests pin. `movement-block.ts` stops
  skipping the vehicle bytes (`:66`).
- [ ] **Step 4: Failing store tests** through
  `areaRig("vehicles")` (contract 1.8), in `area.test.ts`:
  - an injected `SMSG_PLAYER_VEHICLE_DATA` sets `vehicleIds` for the guid
    and emits `player_vehicle { guid, vehicleId }`; id `0` deletes it;
  - an injected empty `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA` emits
    `ride_aura_cancel` (what the real client does with it could not be
    determined; the event only records it);
  - an injected `SMSG_MONSTER_MOVE_TRANSPORT` records the unit's
    transport and seat in `passengers` and emits
    `spline { guid, transportGuid, seat, splineId, duration, flags }`
    (a plan name; the design lists no event for other units);
  - a peeked `SMSG_UPDATE_OBJECT` whose block has `UPDATEFLAG_VEHICLE`
    sets `vehicleIds`; the same block through
    `SMSG_COMPRESSED_UPDATE_OBJECT` does too.
- [ ] **Step 5: Implement.** `VehiclesState = { seat: VehicleSeat | undefined; vehicleIds: ReadonlyMap<bigint, number>; passengers: ReadonlyMap<bigint, { transportGuid: bigint; seat: number }> }`
  (`seat` stays `undefined` until vehicles-3), `VehiclesEvent`,
  `VehiclesStore` in `store.ts`; `register` owns the three opcodes and
  peeks the two update opcodes. `VEHICLES_OPCODES.uses` gains
  `SMSG_UPDATE_OBJECT`, `SMSG_COMPRESSED_UPDATE_OBJECT`. Constants
  `NPC_FLAG_SPELLCLICK = 0x0100_0000` and
  `NPC_FLAG_PLAYER_VEHICLE = 0x0200_0000` live in `protocol.ts`
  (`Entities/Vehicle/Vehicle.cpp:395-397`); `npc-roles.ts` does not change.
- [ ] **Step 6: Harness rules.** `vehiclesHarness` gets an `event` rule:
  `player_vehicle` and `ride_aura_cancel` write one `log` row each;
  `spline` returns `[]` (the flood guard, G17). Test it with the rule
  input fixture of S0-3.
- [ ] **Step 7: Live proof.** Create a `max80` account with
  `mise factory soap create`. While it is offline, find a multi-seat mount
  in the spell catalog by name (no id is given here) and check that its
  creature has a `VehicleId` in `creature_template`; learn it with
  `soap setup <ACCOUNT> spells/learn` (and its riding skill the same way if
  the cast fails for skill). The flow `vehicles-mount` casts it with
  `handle.cast(spellId, 0n)` (`client.ts:253`), waits, then cancels the
  mount aura. Run
  `mise protocol:probe <ACCOUNT> --flow vehicles-mount --arg spell=<id> --expect SMSG_PLAYER_VEHICLE_DATA --expect SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA --bodies`
  and check that the two `SMSG_PLAYER_VEHICLE_DATA` bodies carry the id,
  then `0`. `SMSG_MONSTER_MOVE_TRANSPORT` is proven live in vehicles-2's
  capture (the self boarding spline), recorded in this area's proof table
  by vehicles-2; until then its row is `mock` from
  `Movement/Spline/MoveSplineInit.cpp:114-124`. Delete the account.
- [ ] **Step 8: Docs.** Create `docs/areas/vehicles.md` with the fixed
  headings of contract 3.8: the wowm disagreement above under "Wire
  notes"; "Left out": the `SMSG_COMPRESSED_MOVES` allow-list entry, because
  AzerothCore never writes that opcode (design 5.15); proof rows for the
  three opcodes. Run `mise protocol:coverage`.
- [ ] **Step 9: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_PLAYER_VEHICLE_DATA` | live | flow `vehicles-mount`; writer `Entities/Unit/Unit.cpp:10242-10245` |
| `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA` | live | flow `vehicles-mount`; writer `Entities/Unit/Unit.cpp:10247-10248` |
| `SMSG_MONSTER_MOVE_TRANSPORT` | mock here, live in vehicles-2 | `areaRig` test from `Movement/Spline/MoveSplineInit.cpp:114-124` |

**Commit:**

```
feat: Parse vehicle packets into a vehicles store

The character now records which units are vehicles, which units ride
on another, and the ride aura cancel, so seat and drive tasks build on
a tested store.
```

## Task vehicles-2: seat requests

- **codeArea:** `vehicles`. **Size:** M.
- **Files:**
  - Edit: `.../areas/vehicles/opcodes.ts`, `protocol.ts`, `protocol.test.ts`,
    `area.ts`, `area.test.ts`
  - Create: `.../areas/vehicles/runtime.ts`, `runtime.test.ts`
  - Edit: `packages/core/test-support/areas/vehicles.ts`
  - Edit (sorted key): `packages/harness/src/puppet/calls.ts` (the partner
    calls below)
  - Create: `packages/devtools/src/probe-flows/vehicles-click.ts`,
    `vehicles-ride-with.ts`
  - Edit: `docs/areas/vehicles.md`; regenerate
    `docs/protocol-coverage/vehicles.md`
- **Depends on:** vehicles-1, T-7 (partner calls).
- **Opcodes:** `CMSG_SPELLCLICK`, `CMSG_REQUEST_VEHICLE_EXIT`,
  `CMSG_REQUEST_VEHICLE_PREV_SEAT`, `CMSG_REQUEST_VEHICLE_NEXT_SEAT`,
  `CMSG_REQUEST_VEHICLE_SWITCH_SEAT`, `CMSG_PLAYER_VEHICLE_ENTER`,
  `CMSG_CONTROLLER_EJECT_PASSENGER`.

**Steps:**

- [ ] **Step 1: Failing builder tests** in `protocol.test.ts`, each body
  from the AzerothCore reader:
  - `buildSpellClick(guid)`: `u64` guid (`Handlers/SpellHandler.cpp:723-739`;
    wowm `spell/cmsg_spellclick.wowm:7-11` agrees);
  - `buildRequestVehicleSwitchSeat(guid, seat)`: **packed** guid, `int8`
    seat (`Handlers/VehicleHandler.cpp:122-137`); wowm
    (`vehicle/cmsg_request_vehicle_switch_seat.wowm:1-6`) has a full guid
    and `u8`; AzerothCore wins;
  - `buildPlayerVehicleEnter(guid)`: `u64` (`Handlers/VehicleHandler.cpp:143-163`);
  - `buildEjectPassenger(guid)`: `u64` (`Handlers/VehicleHandler.cpp:165-227`);
  - `CMSG_REQUEST_VEHICLE_EXIT`, `_PREV_SEAT`, `_NEXT_SEAT` have empty
    bodies (`Handlers/VehicleHandler.cpp:61-88,229-244`) and no builder.
- [ ] **Step 2: Failing act tests** in `runtime.test.ts` with `areaRig`:
  each act records its packet in `sent` and resolves on its event, or
  rejects with `no_answer` after 3 s under fake timers (AzerothCore sends
  no error packet for any refusal, `Handlers/VehicleHandler.cpp:76,171,240`).
  Local refusals send nothing: `spellClick` on a unit without
  `NPC_FLAG_SPELLCLICK` (`not_clickable`); seat requests without a seat
  (`not_seated`); `ejectPassenger` while the character is not a vehicle
  (`not_a_vehicle`, because a send then leaves a server log line,
  `Handlers/VehicleHandler.cpp:167-173`). Until vehicles-3 fills `seat`,
  the tests set it through the store's test entry point.
- [ ] **Step 3: Implement** `VehiclesActs = { spellClick, exit, nextSeat, prevSeat, switchSeat, enterPlayerVehicle, ejectPassenger }`
  in `runtime.ts` (`vehiclesRuntime`); `exit` sends
  `CMSG_REQUEST_VEHICLE_EXIT` here (the dismiss form comes in vehicles-4).
  Resolution events: `entered` and `exited` are emitted by vehicles-3; in
  this task `spellClick` resolves on the self `spline` event with
  `TRANSPORT_ENTER`, `exit` on the self `SMSG_FORCE_MOVE_UNROOT` seen
  through `listen("control", ...)` [I: the builder picks the signal from
  the live capture of step 5 and records it].
- [ ] **Step 4: Partner calls.** Add `vehicles.enterPlayerVehicle`,
  `vehicles.nextSeat`, `vehicles.prevSeat`, `vehicles.switchSeat` and
  `vehicles.exit` to `puppet/calls.ts` in the shape T-7 defines. If T-7's
  allow-list cannot name an area act, stop `blocked` and name the member.
- [ ] **Step 5: Live proof, click and exit.** Create a `max80` account.
  The candidate vehicle is the Wintergarde Gryphon (27258, spell-click
  spell 48365 in `npc_spellclick_spells`) [I: its seat flags, what 48365
  does and its spawn are not verified]. The builder reads the
  `vehicleseat_dbc`, `vehicle_dbc` and `creature` base data first and picks
  another creature whose seat allows exit if this one does not. Offline,
  `soap setup <ACCOUNT> position` next to it. The flow `vehicles-click`
  finds the nearest creature of the entry, calls `spellClick`, waits, then
  calls `exit`. Run
  `mise protocol:probe <ACCOUNT> --flow vehicles-click --arg entry=<entry> --expect SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA --expect SMSG_MONSTER_MOVE_TRANSPORT --expect SMSG_FORCE_MOVE_UNROOT --bodies`.
  The self `SMSG_MONSTER_MOVE_TRANSPORT` body is saved as the fixture for
  vehicles-3 and moves vehicles-1's row to `live`. Control still refuses to
  move while seated (`control-motion.ts:38`); the flow does not move.
- [ ] **Step 6: Live proof, player vehicle.** A second account with a
  partner puppet. The probe character mounts the multi-seat mount of
  vehicles-1 and invites the partner (`handle.invite`); the partner
  answers `call acceptInvite` and `call vehicles.enterPlayerVehicle
  <guid>`. The probe then sees the partner's movement block with
  `ON_TRANSPORT`, and the partner tries `vehicles.nextSeat`. The flow
  `vehicles-ride-with` ends with `ejectPassenger(<partner guid>)`.
  AzerothCore needs the same group, `INTERACTION_DISTANCE` and no arena
  (`Handlers/VehicleHandler.cpp:151-159`).
- [ ] **Step 7: Fallbacks.** An opcode whose effect no step shows (a seat
  change the seat flags forbid, no reachable vehicle with an accessory
  seat) gets the effect-not-seen row of contract 0.6: the builder test, a
  live send with no disconnect, `unseen`, and proof row `builder` with the
  evidence "sent live, effect not seen".
- [ ] **Step 8: Docs and checks.** Proof rows, the switch-seat wire note,
  `mise protocol:coverage`, `mise ci:checks`. Delete both accounts.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_SPELLCLICK` | live | flow `vehicles-click`: the server answers with the cancel aura and the boarding spline; reader `Handlers/SpellHandler.cpp:723-739` |
| `CMSG_REQUEST_VEHICLE_EXIT` | live | flow `vehicles-click`: `SMSG_FORCE_MOVE_UNROOT` (`Entities/Unit/Unit.cpp:15343-15346`) |
| `CMSG_PLAYER_VEHICLE_ENTER` | live | flow `vehicles-ride-with`: the partner's block gains `ON_TRANSPORT` |
| `CMSG_CONTROLLER_EJECT_PASSENGER` | live | flow `vehicles-ride-with`: the partner's block loses it |
| `CMSG_REQUEST_VEHICLE_NEXT_SEAT`, `_PREV_SEAT`, `_SWITCH_SEAT` | live if a seat change shows, else `builder` (sent live, effect not seen) | reader `Handlers/VehicleHandler.cpp:61-88,122-137` |

If T-7 cannot reach the area acts, `ENTER` and `EJECT` fall back to
the step 7 row.

**Commit:**

```
feat: Add vehicle seat requests

The character can click a vehicle, leave it, change seats, ride on
another player's mount and eject a passenger, with each request
resolved on its server answer or a no-answer timeout.
```

## Task vehicles-3: passenger seat in control

- **codeArea:** `vehicles`. **Size:** L.
- **Files:**
  - Edit: `.../areas/vehicles/store.ts`, `store.test.ts`, `runtime.ts`,
    `runtime.test.ts`, `area.test.ts`
  - Edit: `packages/core/test-support/areas/vehicles.ts` (the boarding
    sequence captured in vehicles-2)
  - Edit (control lease): `self-store.ts`, `control-feed.ts`,
    `control-sync.ts`, `control.ts`, `control-motion.ts` and their tests
  - Edit: `packages/harness/src/areas/vehicles/area.ts` and test
  - Edit: `docs/areas/vehicles.md`
- **Depends on:** vehicles-2, item6, travel-4 (the `CMSG_MOVE_SPLINE_DONE`
  send in control), self-state-4 and self-state-6 (last control-lease
  holders before this unit).
- **Opcodes:** none new. The self `SMSG_MONSTER_MOVE_TRANSPORT` of
  vehicles-1 reaches control here.

**Steps:**

- [ ] **Step 1: Failing store tests.** Replay the boarding sequence of
  vehicles-2 (the cancel aura, the self spline with `TRANSPORT_ENTER`,
  root, unroot) through `areaRig`: `seat` becomes
  `{ vehicleGuid, seatId, controlling: false, since }` and `entered
  { vehicle, seat, entry }` fires; the exit signal settled in vehicles-2
  clears it and fires `exited { vehicle }`. The seat also comes from a self
  movement block with `ON_TRANSPORT` whose transport guid is a unit (a
  login inside a vehicle).
- [ ] **Step 2: Failing control tests** (control lease): a
  `vehicle_seat` self event sets `ON_TRANSPORT` and the transport block in
  the next outgoing movement info, keeps `unsupportedReason` at
  `transport`, and after `duration` sends `CMSG_MOVE_SPLINE_DONE` with the
  spline id through travel-4's path; `vehicle_left` clears it; the pose is
  the vehicle's entity position plus the seat offset rotated by its
  orientation (`Entities/Vehicle/VehicleDefines.h:144`).
- [ ] **Step 3: Implement.** The runtime subscribes to its store and calls
  `core.self.receive({ type: "vehicle_seat", ... })` and
  `{ type: "vehicle_left" }` (see "Control access"). `feedControl` routes
  both; its `never` check forces the two cases.
- [ ] **Step 4: Harness.** `entered` writes a `wake` row (a script can seat
  the character, `Entities/Unit/Unit.cpp:15203-15259`); `exited` and
  `seat_changed` write `log` rows; `attach` writes one row for a character
  already seated.
- [ ] **Step 5: Live proof.** Rerun flow `vehicles-click` with the new
  control: the character boards, the trace shows `CMSG_FORCE_MOVE_ROOT_ACK`
  and `CMSG_MOVE_SPLINE_DONE`, then it exits. Rerun `t1-walk-to-npc` and
  `t7-halt-resume`, which cover control (contract 3.6 gates).
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:** no new opcode. Live: flow `vehicles-click` exit code 0 with
the ack and spline-done rows in the trace; gates of contract 3.6.

**Commit:**

```
feat: Ride a vehicle seat in control

Control now knows when the character sits in a vehicle, finishes the
boarding spline for the server, and keeps refusing free movement until
the character leaves the seat.
```

## Task vehicles-4: drive a controlled vehicle

- **codeArea:** `vehicles`. **Size:** L.
- **Files:**
  - Edit: `.../areas/vehicles/protocol.ts`, `protocol.test.ts`, `store.ts`,
    `store.test.ts`, `runtime.ts`, `runtime.test.ts`, `opcodes.ts`
  - Edit: `packages/core/test-support/areas/vehicles.ts`
  - Edit (control lease): `control-sync.ts`, `control.ts`,
    `control-mover.ts`, `control-feed.ts`, `self-store.ts` and tests
  - Edit: `packages/harness/src/areas/vehicles/area.ts` and test
  - Create: `packages/devtools/src/probe-flows/vehicles-drive.ts`
  - Edit: `docs/areas/vehicles.md`; regenerate
    `docs/protocol-coverage/vehicles.md`
- **Depends on:** vehicles-3, item6, unitmotion-1 (the vehicle's speeds
  from its create block).
- **Opcodes:** `CMSG_DISMISS_CONTROLLED_VEHICLE`,
  `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE`, `CMSG_MOVE_NOT_ACTIVE_MOVER`.

**Steps:**

- [ ] **Step 1: Failing builder tests:**
  - `buildDismissControlledVehicle(vehicle, info)`: packed guid and
    `MovementInfo` (`Handlers/VehicleHandler.cpp:26-59`, reads at `:39`
    and `:51`); wowm (`vehicle/cmsg_dismiss_controlled_vehicle.wowm:1-3`)
    has an empty body; AzerothCore wins. The bytes equal
    `buildMoveMessage` (`protocol/movement.ts:219-224`), which the test
    pins;
  - `buildChangeSeatsOnControlledVehicle(vehicle, info, accessory, seat)`:
    packed vehicle guid, `MovementInfo`, packed accessory guid, `int8` seat
    (`Handlers/VehicleHandler.cpp:89-121`); wowm has `u8`;
  - `CMSG_MOVE_NOT_ACTIVE_MOVER`: packed guid and `MovementInfo`
    (`Handlers/MovementHandler.cpp:795-814`); wowm
    (`movement/cmsg/cmsg_move_not_active_mover.wowm:3-6`) has a full guid.
    Control sends it with `buildMoveMessage`; no area builder.
- [ ] **Step 2: Failing control tests:** `SMSG_CLIENT_CONTROL_UPDATE { guid: vehicle, allow: 1 }`
  makes the vehicle the mover instead of the refusal at
  `control-sync.ts:238-249`; moves then carry the vehicle's packed guid,
  its position and its run speed; losing control sends
  `CMSG_MOVE_NOT_ACTIVE_MOVER` for the old mover (best effort, AzerothCore
  drops it unless the guid is still its mover, `Handlers/MovementHandler.cpp:803-807`)
  and `CMSG_SET_ACTIVE_MOVER` for the character; a `mover_packet` self
  event sends `build(moverGuid, currentInfo)`.
- [ ] **Step 3: Failing area tests:** `seat.controlling` follows the
  `control` core event for the vehicle guid and emits `control { mover,
  allow }`; `exit()` while controlling sends the dismiss form through
  `mover_packet`; `changeSeatOnControlled(accessory, seat)` refuses
  without `controlling`.
- [ ] **Step 4: Implement** to make them pass.
- [ ] **Step 5: Harness.** `control` writes a `wake` row.
- [ ] **Step 6: Live proof.** A Horde `max80` account; offline,
  `soap setup <ACCOUNT> quest/add` 11652 ("The Plains of Nasam"; the
  spell-click needs it, base `conditions` rows `(18,25334,46598,...)`)
  [I: the quest's race and class columns are not checked] and `position`
  next to a Horde Siege Tank (25334). The flow `vehicles-drive` clicks the
  tank, waits for `control`, drives 10 yd with item 6's primitives, and
  exits. Run it with `--expect SMSG_CLIENT_CONTROL_UPDATE --bodies`; the
  trace shows the dismiss send and the character's own control update
  afterwards (`Entities/Unit/Unit.cpp:14454-14456`). Then rerun
  `t1-walk-to-npc` and `t7-halt-resume`.
- [ ] **Step 7: Docs and checks.** `mise protocol:coverage`,
  `mise ci:checks`. Delete the account.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_DISMISS_CONTROLLED_VEHICLE` | live | flow `vehicles-drive` |
| `CMSG_MOVE_NOT_ACTIVE_MOVER` | `builder` (sent live, effect not seen), `unseen` | sent live in flow `vehicles-drive`; its only effect is stored movement info (`Handlers/MovementHandler.cpp:795-814`). The effect-not-seen row, as vehicles-2 step 7 |
| `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE` | live if the tank or another driven vehicle has an accessory seat, else `builder` (sent live, effect not seen) and `unseen` | reader `Handlers/VehicleHandler.cpp:89-121` |

**Commit:**

```
feat: Drive a controlled vehicle

When the server hands the character a vehicle, control moves the
vehicle instead of refusing, and the character can dismiss it or
change seats on it.
```

## Task vehicles-5: `vehicle` tool and board eval

- **codeArea:** `vehicles`. **Size:** M.
- **Files:**
  - Create: `packages/harness/src/areas/vehicles/tool.ts`, `tool.test.ts`
  - Edit: `packages/harness/src/areas/vehicles/area.ts` (`worldActs`)
  - Edit (append): `packages/harness/src/contract/result.ts` (`ToolName`),
    `packages/harness/src/tools/registry.ts` (`GAME_TOOLS`),
    `docs/harness.md` (tool table row)
  - Edit (sorted key): `packages/harness/src/tools/covered.ts` (`COVERS`),
    because `vehicles/entered` and `vehicles/control` are wake rows
  - Create: `packages/harness/src/grader/scenarios/t8-vehicles-board.json`
  - Edit (append): `packages/harness/src/grader/scenarios.ts`
    (`ROUND_1`), `docs/capabilities.md`, `docs/evals.md`
- **Depends on:** vehicles-3.
- **Opcodes:** none.

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Failing tool tests.** `vehicleTool` (kind `action`) with
  `do` values `board { unit }`, `leave`, `seat { next | prev | n }`,
  `ride_with { player }`, `eject { unit }`: each calls its act through
  `claim.areas.vehicles` inside `ctx.rt.mutex.run`; `board` walks to the
  unit first with the harness's existing approach helper [I: the builder
  finds the exported helper that `interact` uses; if none is exported, it
  stops `blocked`, because this unit holds no `interact` lease]; a
  `no_answer` result reads "no answer", never "refused". The test calls
  `expectSendKind` once.
- [ ] **Step 2: Implement.** `worldActs` lists the seven acts.
- [ ] **Step 3: Scenario.** `t8-vehicles-board`: the vehicle of
  vehicles-2 step 5, a `max80` preset placed next to it with the offline
  `position` setup; steps "Get on the <name>, then get off."; checks:
  `game_log` `vehicles/entered` then `vehicles/exited` for the same
  vehicle, `truth` `point` near the exit point. Truth has no seat field
  (`packages/harness/src/grader/truth.ts:128-137`), so the log is the
  seat evidence. Run
  `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 4: Eval.** `mise eval run t8-vehicles-board --round <n>`, babysat by
  Muse (R10). Pass: append the capability row "Get on a vehicle by
  clicking it and get off" with the limit "the client does not read seat
  flags, so a request the seat forbids shows as no answer". Fail: the
  bullet of contract 3.4 (D16). Add the `docs/evals.md` row
  `| Vehicles (\`vehicle\`, \`travel ride\`) | \`t8-vehicles-board\` |`.
  Add the bullet "changing seats, riding with another player and ejecting
  a passenger (`vehicle` `seat`, `ride_with`, `eject`)" under "Not shown
  by any scenario".
- [ ] **Step 5: Checks.** `mise ci:checks`; rerun `t1-walk-to-npc`.

**Proof:** eval `t8-vehicles-board` verdict in `docs/areas/vehicles.md`
"Capabilities row".

**Commit:**

```
feat: Add the vehicle tool and board eval

The agent can now board, leave and change seats on vehicles with one
tool, and an eval shows it getting on and off a spell-click vehicle.
```

## Task vehicles-9: vehicle drive eval

- **codeArea:** `vehicles`. **Size:** S.
- **Files:**
  - Create: `packages/harness/src/grader/scenarios/t8-vehicles-drive.json`
  - Edit (append): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the vehicles row)
  - Edit: `docs/areas/vehicles.md`
  - Edit (lease, only if needed): `packages/harness/src/areas/pets/tool.ts`
- **Depends on:** vehicles-4, vehicles-5, pets-3 (the vehicle bar from
  `SMSG_PET_SPELLS`, `Entities/Player/Player.cpp:9864-9894`), pets-10
  (casts through `CMSG_PET_CAST_SPELL`).
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Check the bar.** A `pet` tool test with a vehicle bar
  (the mock game's `pets` state holding the vehicle's spells) casts slot
  1. If the `pet` tool refuses because the bar owner is not a pet, take
  the lease and add the vehicle case, test first.
- [ ] **Step 2: Scenario** `t8-vehicles-drive`: a Horde `max80` preset,
  quest 11652 added offline and the position of vehicles-4 step 6; steps
  "Use a Horde Siege Tank for The Plains of Nasam."; checks:
  `game_log` `vehicles/control` with `allow` 1, `truth` quest 11652
  `mobCounts` rise from the baseline.
- [ ] **Step 3: Eval and docs** as vehicles-5 step 4, capability "Drive a
  vehicle and use its abilities", limit "only ground vehicles while
  control refuses flying (`control-motion.ts:39-40`)".
- [ ] **Step 4: Checks.** `mise ci:checks`.

**Proof:** eval `t8-vehicles-drive`.

**Commit:**

```
test: Add the vehicle drive eval

A scenario now shows the agent driving a quest vehicle and using its
abilities, so the drive path has a live gate.
```

## Task vehicles-6: transport model

- **codeArea:** `transports`. **Size:** L.
- **Files:**
  - Edit: `packages/core/src/wow/areas/transports/opcodes.ts` (`uses`),
    `area.ts`
  - Create: `.../areas/transports/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `store.test.ts`, `path.ts`, `path.test.ts`,
    `lift.ts`, `lift.test.ts`, `area.test.ts` (split before 500 lines)
  - Create: `packages/core/test-support/areas/transports.ts`
  - Edit (lease): `protocol/movement-block.ts` and its test
  - Edit: `packages/harness/src/areas/transports/area.ts` and test
  - Create: `docs/areas/transports.md`
- **Depends on:** vehicles-1 (same peek path), `SEED-3`, unitmotion-1
  (the `movement-block.ts` lease).
- **Opcodes:** none. The task holds the body gaps and the path model that
  vehicles-7 needs; it is separate because it has its own test cycle and
  touches no control file (design 5.16 task list).

**Precondition (could not determine).** The model needs
`TaxiPathNode.dbc` and `TransportAnimation.dbc`
(`src/server/shared/DataStores/DBCfmt.h:125,128`). The configured
`spell_data_dir` holds only the `Spell*.dbc` files, `FactionTemplate.dbc`
and `SkillLineAbility.dbc` [M: directory listing]. The client archives
exist on the host, but nothing in the repository extracts DBC files from
them. Where the two files come from is design 7.2 question 5, for the
maintainer. Without them `poseAt` returns `undefined` and the tests run on
fixtures only.

**Steps:**

- [ ] **Step 1: Failing reader tests.** Create blocks built from
  `Entities/Object/Object.cpp:376-407` (`UPDATEFLAG_POSITION`: packed
  transport guid, world x/y/z, offset x/y/z, orientation, a float) and
  `:466-475` (`UPDATEFLAG_TRANSPORT`: `u32` path progress). Today both are
  dropped (`protocol/movement-block.ts:44-51,65`).
- [ ] **Step 2: Failing template test.** A peeked
  `SMSG_GAMEOBJECT_QUERY_RESPONSE` built from
  `Handlers/QueryHandler.cpp:193-211` (entry, type, display, four names,
  icon, caption, a string, 24 `u32` data words, size, 6 quest items) stores
  data words 0-2 for a type 15 (`MO_TRANSPORT`) and word 0 for a type 11
  (`TRANSPORT`). The legacy owner stays `protocol/entity-queries.ts:57`;
  the name query already fires for each new object
  (`world-handlers-entity.ts:113`), so the area sends nothing.
- [ ] **Step 3: Failing path tests.** `TransportPath` ports
  `TransportMgr::GeneratePath` (`Maps/TransportMgr.cpp:118-352`) over
  `TaxiPathNode.dbc` rows and `MotionTransport::Update`
  (`Entities/Transport/Transport.cpp:216-310`); a lift uses
  `TransportAnimation::GetAnimNode` (`Maps/TransportMgr.cpp:509-527`).
  Fixtures are small synthetic DBC tables written by
  `packages/core/test-support/areas/transports.ts`. Tests: the period;
  the pose at progress 0 and at a stop; the stop window; a missing path
  gives `undefined`.
- [ ] **Step 4: Failing store tests** through `areaRig("transports")`:
  a create block for a transport records `{ guid, entry, kind, mapId,
  pose, rotation, pathProgress, receivedAt }`; `SMSG_DESTROY_OBJECT`
  drops it (peeked); `poseAt(guid, now)` advances the progress by
  `now - receivedAt`. The rotation bytes (`UPDATEFLAG_ROTATION`,
  `protocol/movement-block.ts:67`) are read for transports.
- [ ] **Step 5: Implement**, the DBC tables loaded lazily through
  `ctx.dbc` (D4). `TRANSPORTS_OPCODES.uses` gains the peeked opcodes.
- [ ] **Step 6: Live check.** A transport seen twice (two create blocks,
  for example after a map change, `Entities/Transport/Transport.cpp:165-183`)
  checks `poseAt` against the second block's pose, when the DBC files are
  present. The probe stands on the Orgrimmar zeppelin tower (transport 20,
  object 190549, base `transports` data) for one period. If the files are
  absent, the report says so and the check waits for the data.
- [ ] **Step 7: Docs and checks.** `docs/areas/transports.md` (the
  `CMSG_MOVE_CHNG_TRANSPORT` row is written by vehicles-7);
  `mise ci:checks`.

**Proof:** no opcode. Unit tests over AzerothCore-built blocks and
synthetic DBC tables; the live pose check of step 6 when data exists.

**Commit:**

```
feat: Model transport paths

The character can now predict where a boat, zeppelin or lift is from
its create block and the game's path data, which a ride needs because
the server stops sending transport positions.
```

## Task vehicles-7: ride a transport in control

- **codeArea:** `transports`. **Size:** L.
- **Files:**
  - Edit: `.../areas/transports/opcodes.ts`, `store.ts`, `store.test.ts`,
    `area.test.ts`
  - Create: `.../areas/transports/runtime.ts`, `runtime.test.ts`
  - Edit (control lease): `control-sync.ts`, `control.ts`,
    `control-motion.ts`, `control-feed.ts`, `self-store.ts`,
    `movement-handlers.ts` and their tests
  - Edit: `packages/harness/src/areas/transports/area.ts` and test
  - Create: `packages/devtools/src/probe-flows/transports-ride.ts`
  - Edit: `docs/areas/transports.md`; regenerate
    `docs/protocol-coverage/transports.md`
- **Depends on:** vehicles-6, vehicles-3, item6.
- **Opcodes:** `CMSG_MOVE_CHNG_TRANSPORT`.

**Steps:**

- [ ] **Step 1: Failing control tests.** A `transport_board` self event
  sends one `CMSG_MOVE_CHNG_TRANSPORT` whose body is a packed guid then
  `MovementInfo` with `ON_TRANSPORT`, the transport guid and the offset
  (`Handlers/MovementHandler.cpp:362-414`, registered at
  `Server/Protocol/Opcodes.cpp:1040`; wowm
  `movement/cmsg/cmsg_move_chng_transport.wowm:7-11` omits the guid;
  AzerothCore wins). The world pose becomes `poseAt(now)` plus the rotated
  offset; `unsupportedReason` (`control-motion.ts:38`) allows walking on
  the deck only while `poseAt` is defined; `transport_leave` sends one
  without `ON_TRANSPORT`; `newWorld` keeps the transport after a
  cross-map ride instead of clearing it (`control-sync.ts:202`).
- [ ] **Step 2: Failing transfer test.** `SMSG_TRANSFER_PENDING` with a
  transport carries its entry and the old map after the new map
  (`Entities/Player/Player.cpp:1609-1612`); `movement-handlers.ts:69-72`
  ignores the body today. The self event gains the fields, and the
  transports area emits `map_change { entry, fromMap, toMap }` from the
  core `self` event through `listen`. If self-state already parsed the
  body, reuse it and record that.
- [ ] **Step 3: Failing act tests.** `TransportsActs = { board, leave }`:
  `board(guid)` refuses `transport_data_missing` without `poseAt` and
  `not_docked` unless the pose is inside a stop window (a wrong pose is a
  silent teleport, because the server takes the client position,
  `Handlers/MovementHandler.cpp:430-435`); it resolves on `boarded
  { transport, entry }`; `leave` resolves on `left { transport }`.
- [ ] **Step 4: Implement.** Harness rules: `boarded`, `left`,
  `map_change` write `log` rows.
- [ ] **Step 5: Live proof.** A Horde `max80` account placed offline on
  the Orgrimmar tower of transport 20 (both ends on map 1). The flow
  `transports-ride` waits for a docked pose, boards, rides and leaves at
  Thunder Bluff; `soap truth <ACCOUNT>` shows the far tower. Without the
  DBC files, the flow sends one `transport_leave` form of the opcode on
  the ground (no `ON_TRANSPORT`, a plain move, harmless) and the row is
  `builder` (sent live, effect not seen), `unseen`. Rerun `t1-walk-to-npc` and `t7-halt-resume`.
- [ ] **Step 6: Checks.** `mise ci:checks`. Delete the account.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_MOVE_CHNG_TRANSPORT` | live (with the DBC files), else `builder` (sent live, effect not seen) and `unseen` | flow `transports-ride`, `soap truth` at the far tower; reader `Handlers/MovementHandler.cpp:362-414,437-486` |

**Commit:**

```
feat: Ride a transport in control

Control can now board a docked boat or zeppelin, keep the character's
pose on the deck and leave at the far dock, so the character can cross
water without portals.
```

## Task vehicles-8: `travel ride` and zeppelin eval

- **codeArea:** `transports`. **Size:** M.
- **Files:**
  - Edit (lease): `packages/harness/src/tools/travel.ts` and its tests
    (split into a sibling `travel-ride.ts` if needed, under the same lease)
  - Edit: `packages/harness/src/areas/transports/area.ts` (`worldActs`)
  - Create: `packages/harness/src/grader/scenarios/t8-vehicles-zeppelin.json`
  - Edit (append): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the vehicles row)
  - Edit: `docs/areas/transports.md`
- **Depends on:** vehicles-7, travel-6 (the `travel` lease handover).
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tool tests.** `travel { to: "ride <stop>" }` walks
  to the dock, waits until `poseAt` shows the transport docked, walks onto
  the deck, calls `claim.areas.transports.board`, waits, and walks off at
  the named stop; it refuses `transport_data_missing` when `poseAt` is
  undefined; the whole ride holds one claim. The verb shape follows
  travel-6's `to: "fly <destination>"` [I: the builder matches whatever
  travel-6 landed].
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Scenario** `t8-vehicles-zeppelin`: a Horde preset on the
  Orgrimmar tower of transport 20; steps "Take the zeppelin to Thunder
  Bluff."; checks: `truth` `point` within 30 yd of the Thunder Bluff
  landing and `map` 1, `game_log` `transports/boarded` then
  `transports/left`. The landing point is the stop node of the path; the
  budget covers one full period plus the wait (the period could not be
  determined here; the builder computes it from the DBC data).
- [ ] **Step 4: Eval and docs.** Run it. Pass: capability "Ride a boat or
  zeppelin to another dock", limit "needs the transport path from the
  game's data files". The sentence at `docs/capabilities.md:38` names no
  item of this unit, so this task leaves it alone (contract 3.4). If the
  DBC files are absent, the scenario lands under "Not
  shown by any scenario" (D16) with the gap "no transport path data".
- [ ] **Step 5: Checks.** `mise ci:checks`; rerun `t1-walk-to-npc`.

**Proof:** eval `t8-vehicles-zeppelin`.

**Commit:**

```
feat: Add travel ride and the zeppelin eval

The agent can ask travel to take a boat or zeppelin to a named dock,
and an eval shows the Orgrimmar to Thunder Bluff ride.
```

## Dead opcodes

None. All 14 rows of the plan area are `relevant=yes` in the research
table, and the verification reports move no opcode into or out of this
area and mark none dead; they changed only its scope (transports in, and
`CMSG_SPELLCLICK` not vehicle-only).

Related opcodes that other units own: `CMSG_MOVE_SPLINE_DONE` (`travel`),
`SMSG_PET_SPELLS` and `CMSG_PET_CAST_SPELL` (`pets`),
`SMSG_CLIENT_CONTROL_UPDATE`, `CMSG_SET_ACTIVE_MOVER`,
`SMSG_FORCE_MOVE_ROOT` and `SMSG_FORCE_MOVE_UNROOT` (handled today).

## Questions for the coordinator

1. ~~The two leases and the `COORD` export named above that contract 2.7
   does not list (`protocol/monster-move.ts`, `control-feed.ts`,
   `control-mover.ts`, the update-object inflate).~~ Granted (SEED3-21).
2. The "Control access" and "Create-block reads" decisions.
3. Contract 0.6 had no proof row for a client opcode whose effect no
   worker can reach. The plan fix-up added the effect-not-seen row
   (`builder`, `unseen`, "sent live, effect not seen"), and this unit uses it.
4. The DBC data source for vehicles-6 to -8 (design 7.2 question 5).

## Build rulings

| Id | Issue | Ruling |
|---|---|---|
| BR-vehicles-4-1 | Telling a driven vehicle's root from the passenger's boarding root needs the root packet's GUID, which `packages/core/src/wow/movement-handlers.ts` (leased to vehicles-7 only) discards | Coordinator ruling (P2-17): vehicles-4 may keep `parseMoveCounter(r).guid` in the `force_root` and `force_unroot` self events of `movement-handlers.ts`, nothing else; the lease then passes to vehicles-7 as planned. |
| BR-vehicles-4-2 | Carrying the root packet's GUID (BR-vehicles-4-1) also changes the compound root event the self-state store emits (`packages/core/src/wow/areas/selfstate/store.ts:124`) and its test (`store.test.ts:135`) | Coordinator ruling (P2-17): vehicles-4 may make those two companion edits (pass the GUID through, assert it), nothing else in the self-state files. |
| BR-vehicles-4-3 | Routing forced movement flags (gravity, hover, water walk, feather fall) for the driven vehicle needs the packet GUID carried through the self-state store and its tests, beyond BR-vehicles-4-2's single emitter | Coordinator ruling (P2-17): vehicles-4 may pass the GUID through the self-state store's move-flag emitters (`packages/core/src/wow/areas/selfstate/store.ts`) and update their expectations in `store.test.ts`, nothing else in self-state files. `self-store.ts`, `control-feed.ts`, `control.ts`, `control-sync.ts` and the new sibling `control-sync-acks.ts` ride its control lease; `control-sync.ts` ends under 480 non-blank lines. |
| BR-vehicles-5-1 | The coordinator built vehicles-5 beside vehicles-4 (SR3-vehicles-52 orders them), so vehicles-5 landed first with seven `worldActs`; `changeSeatOnControlled` and `dismissControlled` exist only once vehicles-4 lands (SR3-vehicles-33 lists nine) | Coordinator ruling (P2-17): the order exception stands; a coordinator commit appends the two acts to the vehicles harness `worldActs` after vehicles-4 lands. |
| BR-vehicles-4-4 | vehicles-4's fifth review, after three fix rounds and a rescue round, still finds that after a vehicle force-root and force-unroot the unroot ACK keeps ROOT when the passenger is rooted | Coordinator ruling (P2-17): vehicles-4 is parked (branch `factory/431-wave3-parked-vehicles-4`) with the finding listed in the wave PR. vehicles-9 drives the vehicle with its code and stays parked; vehicles-7 waited on vehicles-4 only for the control-file lease, which passes on under BR-wave3-9. BR-vehicles-5-1's two acts wait for vehicles-4. |
| BR-vehicles-7-1 | `packages/core/src/wow/control-sync.ts` reaches 499 non-blank lines in vehicles-7; the acks split BR-vehicles-4-3 named sits on the parked vehicles-4 branch | Coordinator ruling (P2-17): vehicles-4's control-file leases passed to vehicles-7 under BR-wave3-9, so vehicles-7 may split `control-sync.ts` by responsibility into a sibling under that lease (for example the forced-ack handling into `control-sync-acks.ts`), with no behaviour change, ending under 480 non-blank lines. |
| BR-vehicles-7-2 | vehicles-7 puts its transport board and leave planning in a new `packages/core/src/wow/control-transport.ts`, which SR3-vehicles-16/-49 do not name (they name `control-ride.ts`) | Coordinator ruling (P2-17): the `vehicles` unit owns `control-transport.ts` and its test; it rides the control lease like `control-ride.ts`. |
| BR-vehicles-7-3 | vehicles-7's live leave needs a ground oracle; the probe session has none (its client lacks the navigation data the harness loads), so a live leave from the probe always refuses `ground_height_unavailable` | Coordinator ruling (P2-17): vehicles-7 proves board and ride live and leave with the fixture oracle; the live leave proof moves to vehicles-8, whose `travel ride` verb and `t8-vehicles-zeppelin` eval run in the harness with navigation data. If vehicles-8 does not show a live leave, the gap is listed in the wave PR. |

## COMPLETE

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are vehicles-1, vehicles-2, vehicles-3, vehicles-4, vehicles-5, vehicles-9, vehicles-6, vehicles-7, vehicles-8 (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-vehicles-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-vehicles-1 | All tasks: stale citations (finding 1). | Builders re-read each cited symbol before editing; a line number in `vehicles.md` is never a reason to stop. The current positions in finding 1 are the ones to use in `docs/areas/vehicles.md` and `transports.md` citations of legacy code. AzerothCore citations in `vehicles.md` were spot-checked and hold: `Movement/Spline/MoveSplineInit.cpp:114-124` (packed guid, packed transport guid, `int8` seat, then `WriteMonsterMove`), `Movement/Spline/MovementPacketBuilder.cpp:43-50` (common part starts `uint8(0)`, start point, spline id), `Entities/Unit/Unit.cpp:10242-10248,10309-10312` (`SMSG_PLAYER_VEHICLE_DATA`, the cancel-aura packet), `Handlers/VehicleHandler.cpp:26-59,61-88,89-121,122-137,143-163,165-227,229-244`, `Handlers/SpellHandler.cpp:723-739`, `Handlers/MovementHandler.cpp:795-814` [M]. | coordinator ruling (P2-17) |
| SR3-vehicles-2 | vehicles-1, -2, -4, -6, -7: `owns` for the seed. | DESIGN answered: E4 accepted: `transports` owns `CMSG_MOVE_CHNG_TRANSPORT`. `VEHICLES_OPCODES.owns` holds the 13 names in task order: vehicles-1 `SMSG_MONSTER_MOVE_TRANSPORT`, `SMSG_PLAYER_VEHICLE_DATA`, `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`; vehicles-2 `CMSG_SPELLCLICK`, `CMSG_REQUEST_VEHICLE_EXIT`, `CMSG_REQUEST_VEHICLE_PREV_SEAT`, `CMSG_REQUEST_VEHICLE_NEXT_SEAT`, `CMSG_REQUEST_VEHICLE_SWITCH_SEAT`, `CMSG_PLAYER_VEHICLE_ENTER`, `CMSG_CONTROLLER_EJECT_PASSENGER`; vehicles-4 `CMSG_DISMISS_CONTROLLED_VEHICLE`, `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE`, `CMSG_MOVE_NOT_ACTIVE_MOVER`. `TRANSPORTS_OPCODES.owns` holds `CMSG_MOVE_CHNG_TRANSPORT` (the split of `vehicles.md:26-28` is accepted). `uses`, `stubs`, `dead`, `unseen` start empty; tasks fill `unseen` only (contract 2.5). `uses` by task: vehicles-1 `SMSG_UPDATE_OBJECT`, `SMSG_COMPRESSED_UPDATE_OBJECT`, `SMSG_DESTROY_OBJECT` (SR3-vehicles-7); vehicles-6 the same three plus `SMSG_GAMEOBJECT_QUERY_RESPONSE`. Two areas may list one legacy opcode in `uses` (the ownership test only partitions `owns`, `registry.test.ts:186-196`; `objects` already lists `SMSG_GAMEOBJECT_QUERY_RESPONSE`, `areas/objects/opcodes.ts:17-18`). `CMSG_MOVE_NOT_ACTIVE_MOVER` and `CMSG_MOVE_CHNG_TRANSPORT` have no legacy reader (client-to-server), so owning them while control sends them creates no double owner. | coordinator ruling (P2-17) |
| SR3-vehicles-3 | vehicles-1 step 5: "remove the three stub lines". | Void (finding 3). vehicles-1 edits `opcodes.ts` only to fill `uses`. Do not add an area `stubs` entry. | coordinator ruling (P2-17) |
| SR3-vehicles-4 | vehicles-1 step 3: `protocol/monster-move.ts` lease and the shared body reader. | No holder yet and no row in the index `leaseQueues`; the plan row is `plan.md:651`. Assign the lease to vehicles-1 with no next holder (SEED3-21 adds the queue row). Current code: `parseMonsterMove` (`:169-187`) reads `guid = packedGuidBig()`, then `extra` (`uint8`), `start` (`vec3`), `splineId`, `type`, stop or tail. Split it into `export function parseMonsterMoveBody(r: PacketReader, guid: bigint): MonsterMove` (everything after the guid) and keep `parseMonsterMove = guid + body`; `parseMonsterMoveTransport` in the area reads the packed guid, the packed transport guid, `int8` seat (`r.int8()`; `0xff` reads `-1`), then calls `parseMonsterMoveBody`. The existing 276-line `monster-move.test.ts` pins the behaviour; add the body-reader cases to it. `SplineFlag.TRANSPORT_ENTER 0x00800000` and `TRANSPORT_EXIT 0x01000000` already exist (`:5-17`). Wire note to record: wowm has one byte fewer than AzerothCore (`vehicles.md:117-118`). | coordinator ruling (P2-17) |
| SR3-vehicles-5 | vehicles-1 and -6: peek of `SMSG_COMPRESSED_UPDATE_OBJECT` needs an inflate outside the area allow-list (`vehicles.md:44,58-60`). | The `COORD` request is granted and moved to SEED-3 (SEED3-19): new `core/protocol/compressed-update.ts` exports `inflateCompressedUpdate(r: PacketReader): PacketReader` (reads `uint32LE` size, `r.bytes(r.remaining)`, `inflateSync`, size check with the message now at `world-handlers-entity.ts:203-208`); `handleCompressedUpdateObject` (`:196-214`) calls it. The area imports `#wow/protocol/compressed-update` (matches `#wow\/protocol\/[\w-]+`, `registry.test.ts:49`). `node:zlib` stays out of the areas (`protocol/remote-movement.ts:1` already imports it in legacy core). The lease on `world-handlers-entity.ts` (remote-motion-1) has landed, so no task owns it now. | coordinator ruling (P2-17) |
| SR3-vehicles-6 | vehicles-1 step 3 and vehicles-6 step 1: what `movement-block.ts` returns; the plan reads the wrong flag for a transport. | AzerothCore sets `UPDATEFLAG_TRANSPORT \| LOWGUID \| STATIONARY_POSITION \| ROTATION` for `MotionTransport` and `StaticTransport` (`AC/Entities/Transport/Transport.cpp:57,791`), not `UPDATEFLAG_POSITION` (that flag is for game objects standing on a transport, `GameObject.cpp:63`, written at `Object.cpp:376-407`). A transport's create pose is its creation point (`m_stationaryPosition` is set once, `Transport.cpp:839`, `GameObject.cpp:276`), already returned today through `UpdateFlag.HAS_POSITION` (`movement-block.ts:82-83`); its live position is `PathProgress` (`Object.cpp:466-475`, the `u32` after the optional target guid) advanced per tick (`Transport.cpp:236`). So: vehicles-1 replaces `skip(8)` (`movement-block.ts:105`) with `vehicle?: { id: number; orientation: number }` (`Object.cpp:478-486`: `u32` id, `f32` orientation) and adds it to `MovementData` (`:25-35`); vehicles-6 replaces `skip(4)` (`:104`) with `pathProgress?: number` and makes `readStationaryTransport` (`:70-77`) return `transportGuid?: bigint` and `transportOffset?: Vec3` instead of dropping them. Both fields flow through the `Movement` type of `protocol/update-object.ts:13-23` (a rider of this lease, plan `:652`, BR-remote-motion-1-1): add `update-object.ts` and `update-object.test.ts` (292 non-blank) to the owner lists of vehicles-1 and vehicles-6 (D). Fixtures come from the writer `Object.cpp:376-486`. | coordinator ruling (P2-17) |
| SR3-vehicles-7 | vehicles-1 step 4: peeking create blocks. | `OpcodeDispatch.peek` needs a legacy owner and runs `read(body.fork())` (`protocol/world.ts:234-238,290-296`); `SMSG_UPDATE_OBJECT` and `SMSG_COMPRESSED_UPDATE_OBJECT` have one (`client-handlers.ts:127-128`). A peek error does not throw; it goes to `packetError` (`world.ts:292-295`), so the area test asserts the event for a malformed block. Use `parseUpdateObject(r, 0)` (`update-object.ts:105`; positions are not used here). Entries of type `create` or `movement` with `updateFlags & UpdateFlag.VEHICLE` set `vehicleIds`; `outOfRange` entries (`update-object.ts:50-51`) and a peeked `SMSG_DESTROY_OBJECT` (8-byte guid, `world-handlers-entity.ts:216-226`) delete the guid, so the map does not grow for the whole session. `SMSG_DESTROY_OBJECT` therefore joins vehicles-1's `uses`. A login inside a vehicle reaches the self block as `movementInfo.transport.guid` with `ON_TRANSPORT` (`movement.ts` `TransportInfo`), not as a new field. Report the measured double-parse cost (`vehicles.md:61-62`). | coordinator ruling (P2-17) |
| SR3-vehicles-8 | vehicles-1 step 7: the multi-seat mount. | Name no spell id from memory. Candidate creatures with a `VehicleId` and a mount role [M: `SQL/creature_template.sql`]: Grand Ice Mammoth 31857 and 31858 (`VehicleId` 315), Grand Black War Mammoth 31861 and 31862. The builder finds the spell in `Spell.dbc` (present in `spell_data_dir`) whose effect is `SPELL_AURA_MOUNTED` (78) with misc value equal to one of those entries, checks the Horde variant for the `max80` preset (Horde, `soap-presets.ts:55-62`), and learns it offline with `soap setup <ACCOUNT> spells/learn` or online with `soap gm <ACCOUNT> learn <id>`. The preset's riding skill is not read [INFERENCE]; if the cast fails with `SMSG_CAST_FAILED` for skill or zone, learn the riding spell the same way or `soap setup position` to an outdoor Northrend point (the preset spawns at Dalaran, 5807.98, 588.49, 660.94, map 571). Cast with `handle.cast(spellId, 0n)` (`client.ts:261`); cancel with `handle.spells.act.cancelAura(spellId)` (`areas/spells/runtime.ts:23,98`), not the selfstate dismount (self-state-6 is not a dependency of vehicles-1). | coordinator ruling (P2-17) |
| SR3-vehicles-9 | vehicles-1 step 6: harness rules. | `vehiclesHarness` (seeded with `worldActs: []`, SEED3-18) gets `rules: () => ({ event })` where `event` returns one `log` draft for `player_vehicle` and `ride_aura_cancel` and `[]` for `spline` (flood guard). Event type names must match `/^[a-z_]+$/` (`registry.test.ts:265-269`). | coordinator ruling (P2-17) |
| SR3-vehicles-10 | vehicles-2 step 5: candidate vehicle "Wintergarde Gryphon 27258". | Entry 27258 has no `creature` row [M: `grep -c ',27258,' SQL/creature.sql` = 0]; it cannot be reached by position. The same click spell 48365 is bound to entry 27661 "Wintergarde Gryphon" (`SQL/npc_spellclick_spells.sql`), which has 4 static spawns on map 571 at (3723.71, -699.29, 216.054), (3722.9, -702.661, 215.817), (3723.43, -695.682, 215.987), (3721.93, -692.035, 215.904) [M: `SQL/creature.sql`], no condition row, no script (`ScriptName` empty), and gets `NPC_FLAG_SPELLCLICK` at runtime from the vehicle kit (`AC/Entities/Vehicle/Vehicle.cpp:54-56,158,395-397`), so its template `npcflag` of 0 is correct. Order of candidates for the click/exit flow: 27661, then 27496 "Refurbished Shredder" (spell 48881, no condition, e.g. (2786.73, -2126.01, 23.5204), (2847.92, -2163.62, 31.9252) map 571), then 27714 "7th Legion Chain Gun" (spell 49584, `NullCreatureAI`). The flow parameter stays `entry=<entry>` (`vehicles.md:267`). | coordinator ruling (P2-17) |
| SR3-vehicles-11 | vehicles-2 step 5: "reads the `vehicleseat_dbc`, `vehicle_dbc` and `creature` base data first". | superseded by the coordinator decision (DBCs staged): `Vehicle.dbc` and `VehicleSeat.dbc` are staged: seat flags and seat counts are read through `ctx.dbc` or a probe script to pick the candidate whose seat allows exit; the SQL reads and the two-tries fallback for `CMSG_REQUEST_VEHICLE_EXIT` stay. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): Seat flags and seat counts are unreadable (finding 4): the SQL files are structure only and no `Vehicle*.dbc` exists on the host. Replace with: read `creature_template`, `npc_spellclick_spells`, `conditions` and `creature` from `SQL/`, pick the first candidate of SR3-vehicles-10, and find out whether the seat allows exit by trying it: AzerothCore answers a refused exit with nothing (`VehicleHandler.cpp:229-244`), so the flow's `exit` ends in `no_answer`. At most two live tries per opcode (rules.md item 5) across at most the three candidates; then the step 7 row (`builder`, `unseen`, "sent live, effect not seen") applies to `CMSG_REQUEST_VEHICLE_EXIT`. The `CMSG_SPELLCLICK` row does not depend on exit (the cancel aura and the self boarding spline prove it). | coordinator ruling (P2-17) |
| SR3-vehicles-12 | vehicles-2 step 4: partner calls. | Puppet call keys are flat, sorted, and each must be an act name or an `ALIASES` entry of `calls.test.ts:26-34` (`callable`, `:36-60`; sorted, `:97-99`). vehicles-2 adds `enterPlayerVehicle` (`args: ["guid"]`), `nextSeat`, `prevSeat`, `switchSeat` (`args: ["number"]`) and `exitVehicle` to `h/puppet/calls.ts` (318 non-blank, +~20). Name the exit act `exitVehicle` (not `exit`) in `VehiclesActs` so no `ALIASES` edit and no `calls.test.ts` edit is needed (`calls.test.ts` is not a vehicles queue). The partner is driven as `call enterPlayerVehicle ["<guid>"]` (`decodeCall` turns a `guid` argument into a bigint, `calls.test.ts:51-60`). If T-7's shape cannot name an area act, stop `blocked` on `shared-fake` as the plan says. | coordinator ruling (P2-17) |
| SR3-vehicles-13 | vehicles-2 step 1 and T-7: builder byte order. | AzerothCore reads `CMSG_SPELLCLICK` as a full `u64` (`SpellHandler.cpp:723-739`), `CMSG_PLAYER_VEHICLE_ENTER` and `CMSG_CONTROLLER_EJECT_PASSENGER` as full `u64` (`VehicleHandler.cpp:143-163,165-227`), and `CMSG_REQUEST_VEHICLE_SWITCH_SEAT` as packed guid + `int8` seat (`:122-137`, wowm agrees on `u8` width for the seat but not the guid, AzerothCore wins). vehicles-2 pins these four builders in `areas/vehicles/protocol.test.ts` before writing them. The T-7c dependency (partner calls) is the index dep of vehicles-2; `handle.invite`, `call acceptInvite` and the `enterPlayerVehicle` call of SR3-vehicles-12 already exist, so no new T-7 work stays open. | coordinator ruling (P2-17) |
| SR3-vehicles-14 | vehicles-2 step 2: local refusals. | `ejectPassenger` sends `u64` guid (`VehicleHandler.cpp:165-177`) and AzerothCore logs an ERROR line when the sender is not a vehicle, so the local `not_a_vehicle` check is required: the character is a vehicle when `vehicleIds.has(selfGuid)` (set by `SMSG_PLAYER_VEHICLE_DATA` for the character's own guid). `spellClick` refuses `not_clickable` when the unit's npc flags lack `NPC_FLAG_SPELLCLICK = 0x01000000`; read the flags from `getEntity` fields (the store is the only reader). A non-ejectable seat is answered with a log line only (`:198-227`); treat it as `no_answer`. | coordinator ruling (P2-17) |
| SR3-vehicles-15 | vehicles-2 step 6: partner ride. | Both accounts are `max80` (the mount of SR3-vehicles-8 needs the level), placed at the same point with offline `soap setup <ACCOUNT> position` before either logs in. `CMSG_PLAYER_VEHICLE_ENTER` is refused silently unless the two are in the same group (`IsInRaidWith`), within `INTERACTION_DISTANCE` and outside an arena (`VehicleHandler.cpp:143-163`): the probe character calls `handle.invite(name)`; the partner runs `call acceptInvite` then `call enterPlayerVehicle ["<guid>"]` (existing keys `invite`, `acceptInvite`, `h/puppet/calls.ts:25,46`). Partner characters are player characters created for the task; never RNDBOT* (P2-9). | coordinator ruling (P2-17) |
| SR3-vehicles-16 | vehicles-3 and -4 and -7: control files and the new shared control files. | New file `core/control-ride.ts` (vehicles-3 creates, vehicles-4 and -7 extend) holds one `RideState` class: `vehicle`/`transport` guid, seat, offset, boarding spline id and deadline, the pending mover, `poseAt` callback, and `apply(info: MovementInfo): MovementInfo` that adds the `transport` block. `control-sync.ts` gains only: a `ride` field, one call in `blockReason()` and one in `movementInfo()` (`:143-156`, replacing the private `transport` field, which `applyForcedPose` still sets at `:395`), a `moverGuid()` accessor, and delegating one-liners; `control.ts` gains delegating methods. This matches the fresh-index pattern of shared control files with per-task queue rows (`control-flight.ts` queue 59 for travel-4's spline, `control-swim.ts` queue 61 for self-state-12's water, `control-flag-acks.ts` queue 62 for flag acks): `control-ride.ts` is created unit-owned by vehicles-3 and needs a queue row only if another unit later extends it. travel-4 creates `control-flight.ts` first (vehicles-3 is a rider: `RideState` uses the flight `in_flight` refusal verdict when one exists and does not re-implement the flight accept logic). Tests for the ride state go to a new `control-ride.test.ts`; add `control-ride.ts` and `control-ride.test.ts` to the owner lists of vehicles-3, -4 and -7 (D). A lease on a named legacy file covers its colocated test (contract 2.7); a new sibling needs no lease. If a touched control file would pass 480 non-blank lines, the holder splits by responsibility into a sibling of the same task. | coordinator ruling (P2-17) |
| SR3-vehicles-17 | vehicles-3 step 3, vehicles-4, vehicles-7: `SelfEvent` variants. | Add the variants of `vehicles.md:75-79` to `self-store.ts:15-27`, each by the task that uses it: vehicles-3 `vehicle_seat`, `vehicle_left`; vehicles-4 `mover_packet`, `mover_state` (SR3-vehicles-27); vehicles-7 `transport_board`, `transport_leave`. `feedControl` has `default: never` (`control-feed.ts:45-48`), so each variant forces its case in the same task. travel-4 adds `{ type: "spline"; move: MonsterMove }` first (`travel.md:667-668`); `control-flight.ts` (queue 59, `travel-4 → vehicles-3`) handles it, and the same row lets vehicles-3 reuse the `in_flight` verdict instead of copying it. The `self-store.ts` chain is travel-4 → vehicles-3 → vehicles-4 → vehicles-7. `SelfEvent` payloads use core types only (`Vec3`, `bigint`), so the areas send them with `core.self.receive(...)` without a new import. | coordinator ruling (P2-17) |
| SR3-vehicles-18 | vehicles-3 step 2: "`CMSG_MOVE_SPLINE_DONE` through travel-4's path". | travel-4's builder lives in the `travel` area (`areas/travel/protocol.ts`, `travel.md:689-694`) and its send in `control-flight.ts`, a file travel-4 creates under its lease; vehicles-3 holds no lease on either. Rule: `control-ride.ts` builds the message itself as `buildMoveMessage(guid, info)` plus one `uint32LE(splineId)` (`protocol/movement.ts:219-224`), the exact read order of `Handlers/TaxiHandler.cpp:204-214` (packed guid, movement info, `u32`), and names `GameOpcode.CMSG_MOVE_SPLINE_DONE` there (control files may; areas may not). `CMSG_MOVE_SPLINE_DONE` stays owned by `travel`; the test pins the bytes. AzerothCore acts on it only when the player expects a transport change and the mover's spline id equals the counter, then broadcasts `MSG_MOVE_ROOT` or `MSG_MOVE_UNROOT` (`TaxiHandler.cpp:262-270`), so the send happens once, after the spline `duration`, with `ride.splineId`. | coordinator ruling (P2-17) |
| SR3-vehicles-19 | vehicles-3 step 2: movement while boarding. | Finding 8: until the boarding spline ends the server drops every mover packet except the root and unroot acks. Control therefore sends nothing but acks between `vehicle_seat` and the spline-done send, and the acks must carry the transport block: `moveAck()` (`control-sync.ts:383`) uses `movementInfo()`, so `RideState.apply` must already add `ON_TRANSPORT`, the vehicle guid, the seat offset and seat before the first ack. `unsupportedReason` (`control-motion.ts:38`) keeps refusing movement while `ON_TRANSPORT` is set; no change there for vehicles-3. | coordinator ruling (P2-17) |
| SR3-vehicles-20 | vehicles-3 step 2: the seat offset. | superseded by the coordinator decision (DBCs staged): `Vehicle.dbc` and `VehicleSeat.dbc` are staged: the seat offset still comes from the last point of the self `SMSG_MONSTER_MOVE_TRANSPORT` (server truth), and the vehicles-3 fixture test cross-checks it against the `VehicleSeat.dbc` attachment offset. Draft text, kept as the no-file branch (P2-8 degraded ids): The seat offset comes from the self `SMSG_MONSTER_MOVE_TRANSPORT`: its final point is in the vehicle's local frame (`MoveSplineInit.cpp:114-124`, the boarding spline targets the seat attach point, `Vehicle.cpp:410-468`), so `offset` = the last spline point; `Vehicle*.dbc` is unavailable (finding 4). The transport block orientation is the last point's facing or 0 (builder confirms against the vehicles-2 capture, which vehicles-3 uses as its fixture). The world pose for a passenger is the vehicle entity's position (`getEntity`) plus the offset rotated by the vehicle's orientation (`Entities/Vehicle/VehicleDefines.h:144` per plan, not re-read). | coordinator ruling (P2-17) |
| SR3-vehicles-21 | vehicles-3 and -4 and -7: shared test fakes. | Use `cts/control-fixtures.ts` `setup` (113 lines) as it is; event builders come from the unit's own `cts/areas/vehicles.ts` and `cts/areas/transports.ts`. If `setup` lacks a member, stop `blocked` with `shared-fake` and name it (`rules.md` item 7). BR-wave2-2 lets a task add a new required field's empty value to shared fixtures (field only). | coordinator ruling (P2-17) |
| SR3-vehicles-22 | vehicles-3: missing dependency. | vehicles-3 edits `control-motion.ts` (`control-motion.ts` chain `self-state-12 → vehicles-3 → vehicles-7`), `control-sync.ts` and `control.ts` (chains with `self-state-12` before `vehicles-3`) but its index deps omit `self-state-12`. Add it (D). vehicles-7's lease on `movement-handlers.ts` (`travel-4 → vehicles-7`) and `self-store.ts` is satisfied through vehicles-3's `travel-4`. | coordinator ruling (P2-17) |
| SR3-vehicles-23 | vehicles-3 step 1 and step 4: `entered`/`exited` and the harness rows. | `entered { vehicle, seat, entry }` needs the vehicle's entry: read it from `getEntity(vehicle)` entry fields; if the entity is unknown the event carries `entry: undefined` (the field is optional in the event type). Harness: `entered` is a `wake` row (`vehicles/entered`), `exited` and `seat_changed` are `log` rows; log events are typed as `<area>/<event type>` automatically (`contract/log.ts` `Domain = CoreDomain \| AreaName`), so `vehicles/control` does not clash with the core domain `control`. | coordinator ruling (P2-17) |
| SR3-vehicles-24 | vehicles-4 step 2 and step 3: `control` event has no mover. | `ControlEvent` and `ControlState` (`control.ts:43-81`) carry no mover guid, so the vehicles runtime cannot learn it with `listen("control")`. vehicles-4 adds `mover: bigint \| undefined` to `ControlState` (set in `control.ts:127-142` from the ride state), emits `control_changed` with reason `vehicle` when the mover changes, and adds the empty value `mover: undefined` to shared typed literals (BR-wave2-2). The vehicles runtime maps `state.mover` equal to the seat's vehicle guid to `seat.controlling` and emits `control { mover, allow }`. | coordinator ruling (P2-17) |
| SR3-vehicles-25 | vehicles-4 step 2: the refusal at `control-sync.ts:238-249`. | The code is `clientControl` at `control-sync.ts:299-309`: any guid other than 0 and self sets `controlAllowed = false` and aborts motion. The same packet is sent for possess, mind control and pets, so control adopts a non-self guid as mover only when it equals the ride state's vehicle; otherwise the refusal stays. The two packets can arrive in either order [INFERENCE: `SetCharmedBy` sends the control update, the boarding spline follows in `Vehicle::AddPassenger`], so `clientControl` stores `pendingMover = guid` when `allow` is 1 and the ride vehicle is not set yet, and `vehicle_seat` adopts it. `allow` 0 for the vehicle guid clears the mover and restores self control. | coordinator ruling (P2-17) |
| SR3-vehicles-26 | vehicles-4 step 2: sends with the vehicle as mover. | Replace `selfGuid()` by `moverGuid()` only at the three movement sends: `control-mover.ts:375` (`buildMoveMessage`), `control-sync.ts:374` and `:383` (`moveAck`); `:213` (teleport ack), `:363` (time skipped) and the `CMSG_SET_ACTIVE_MOVER` sends stay on the character. `ControlDeps` (`control.ts:85-91`) has no entity lookup and `runtime.ts` is frozen (plan "Control access"), so the vehicle's pose and speeds reach control through the vehicles runtime: on `control_changed` with reason `vehicle` it reads `getEntity(mover)` (`runSpeed`, `runBackSpeed`, `turnRate`, position, as `world-handlers-entity.ts:185-193` does for self) and sends `core.self.receive({ type: "mover_state", guid, run, runBack, turn, pose })`; control adopts them for the mover. | coordinator ruling (P2-17) |
| SR3-vehicles-27 | vehicles-4 step 2: active-mover packets. | AzerothCore reads `CMSG_SET_ACTIVE_MOVER` as a full `u64` and only logs an ERROR line when it differs from the server's mover (`MovementHandler.cpp:779-791`); it drops `CMSG_MOVE_NOT_ACTIVE_MOVER` unless its guid is still the server's mover (`:795-814`). The server switches its mover before it sends the control update, so: on gaining the vehicle send `CMSG_MOVE_NOT_ACTIVE_MOVER(self, info)` (dropped, harmless) then `CMSG_SET_ACTIVE_MOVER(vehicle)` (matches); on losing it send `CMSG_MOVE_NOT_ACTIVE_MOVER(vehicle, info)` then `CMSG_SET_ACTIVE_MOVER(self)`. Reuse `buildSetActiveMover` (`control-sync.ts:162`). `CMSG_MOVE_NOT_ACTIVE_MOVER` therefore never shows an effect: proof row `builder` (sent live, effect not seen) and `unseen`, as the plan says. | coordinator ruling (P2-17) |
| SR3-vehicles-28 | vehicles-4: `mover_packet` and the area source ban. | `mover_packet` carries `opcode: number` and `build`. The area names only `GameOpcode.CMSG_DISMISS_CONTROLLED_VEHICLE` and `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE`; neither matches the ban regex (finding 7). `CMSG_MOVE_NOT_ACTIVE_MOVER` is named in `control-sync.ts` only. The dismiss and change-seat bodies are packed guid + `MovementInfo` (`VehicleHandler.cpp:26-59,89-121`); the dismiss bytes equal `buildMoveMessage` (`protocol/movement.ts:219-224`); change-seat is `buildMoveMessage` + packed accessory guid + `int8` seat. | coordinator ruling (P2-17) |
| SR3-vehicles-29 | vehicles-4 step 4 and vehicles-3 step 3: `changeSeatOnControlled` is a fourth act set. | `VehiclesActs` ends with nine members after vehicles-4: the seven of vehicles-2 (with `exitVehicle`, SR3-vehicles-12) plus `changeSeatOnControlled(accessory, seat)` and `dismissControlled` (the dismiss form when `seat.controlling`). `exitVehicle` while `controlling` routes through `mover_packet` with the dismiss opcode (plan step 3); otherwise it sends `CMSG_REQUEST_VEHICLE_EXIT`. vehicles-4 also fills `unseen` with `CMSG_MOVE_NOT_ACTIVE_MOVER` (and `CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE` if the tank has no accessory seat). | coordinator ruling (P2-17) |
| SR3-vehicles-30 | vehicles-4 step 6: the Horde Siege Tank and quest 11652. | Facts [M]: entry 25334 has 6 spawns on map 571, e.g. (2792.04, 6738.57, 7.79775), (2798.96, 6735.21, 7.62585), (2784.33, 6742.21, 7.92973); spell-click rows 46598 and 47917 each have `conditions` type 18 with `CONDITION_QUESTTAKEN 11652` (`SQL/conditions.sql`); quest 11652 "The Plains of Nasam" (`QuestSortID` 3537, race mask 690 = Horde) [M: `SQL/quest_template.sql`]; the `max80` preset is Horde. Because `QUESTTAKEN` needs `INCOMPLETE` (finding 12), the builder checks `soap truth <ACCOUNT>` right after the offline add: if the quest shows complete, stage the proof online with `soap gm <ACCOUNT> quest add 11652` (R12; allowed for worker proofs, `docs/factory.md:96-112`). The builder reports which path worked; the eval rule is SR3-vehicles-38. `control-motion.ts:39-40` keeps refusing flying vehicles; the tank is ground only. | coordinator ruling (P2-17) |
| SR3-vehicles-31 | vehicles-4: live drive needs ground data. | The ground oracle is optional (`ControlDeps.ground`, `control.ts:85-91`); driving 10 yd on map 571 uses it when `navigation_data_dir` is set, otherwise `groundStep` returns the unchanged z (`control-motion.ts:50-52`). The flow must not drive into water or off a ledge; choose the heading from the nearest spawn row in SR3-vehicles-30 and drive 10 yd along the facing the server sets. | coordinator ruling (P2-17) |
| SR3-vehicles-32 | vehicles-5 step 1: the approach helper. | No stop is needed. `interact` walks with `travelLeg` (`ops/travel-leg.ts`), `resolveUnit`/`unitRefusal` (`ops/resolve.ts`), `INTERACT_APPROACH_YD` (`ops/range.ts`), `Refusal` and `reachNext` (`h/tools/interact.ts:9-15,179-219`); the vehicle tool imports these read-only (`board` uses `INTERACT_APPROACH_YD` the same way). No `interact` lease is involved. | coordinator ruling (P2-17) |
| SR3-vehicles-33 | vehicles-5 step 2: `worldActs`. | `worldActs` lists every act the vehicles runtime defines, because the registry test checks each name is a real act of the game (`h/areas/registry.test.ts:44-47`): at vehicles-5 time (serial order 1, 2, 3, 4, 5 in the unit file) that is the nine of SR3-vehicles-29. The plan's "seven" is stale. Tool `do` values map: `board` → `spellClick`, `leave` → `exitVehicle`, `seat` → `nextSeat`/`prevSeat`/`switchSeat`, `ride_with` → `enterPlayerVehicle`, `eject` → `ejectPassenger`. | coordinator ruling (P2-17) |
| SR3-vehicles-34 | vehicles-5 step 5 and the gates: which live regressions. | Contract 3.6 as cited in `vehicles.md:501,543`: rerun `t1-walk-to-npc` and `t7-halt-resume` after the vehicles-5 land (`t7` fails only from the known stale wake). No other regression scenario is in scope. | coordinator ruling (P2-17) |
| SR3-vehicles-35 | vehicles-5 step 3: scenario `t8-vehicles-board`. | Preset `max80`; `setup` holds one `position` step next to the vehicle that vehicles-2 proved (default 27661: `{ "map": 571, "x": 3720.5, "y": -695.5, "z": 216 }`, about 3 yd from the nearest spawn, inside `INTERACT_APPROACH_YD`); no `quest/add`; `partner: null`; `botRisk: "low"`; `navBound` true only if the agent walks. The vehicle may be taken by a bot or a script between runs [INFERENCE]; the task text names the creature ("Get on the Wintergarde Gryphon, then get off."). Checks: `game_log` `vehicles/entered` then `vehicles/exited` for one vehicle guid; `truth` `point` near the setup point (30 yd). Truth has no seat field (P2-7: packet evidence only). | coordinator ruling (P2-17) |
| SR3-vehicles-36 | vehicles-9 step 1: `pet` tool and the vehicle bar. | `areas/pets/tool.ts` (110 non-blank) has no cast verb today (`do` values `call`, `dismiss`, `revive`, `attack`, `follow`, `stay`, `stop`, `stance`, `tool.ts:26-38`); pets-10 adds it (queue `pets-9 → pets-10 → pets-12 → vehicles-9`, index). vehicles-9 starts from pets-10's landed shape, writes the `pet` tool test with a vehicle bar in the mock `pets` state, and edits only `areas/pets/tool.ts` (its lease). If pets-10 put the cast verb and its refusal in a sibling file (for example `tool-cast.ts`), the vehicle case belongs there: stop `blocked` on `ruling` naming that file. Whether pets-3 stores a vehicle's bar as `pets` state is unread [INFERENCE]; if it does not, vehicles-9 stops `blocked` naming pets-3. | coordinator ruling (P2-17) |
| SR3-vehicles-37 | vehicles-9 step 2 and step 3: drive scenario and limit sentence. | The limit "only ground vehicles while control refuses flying" stays (`control-motion.ts:39-40`). Checks must not depend on a quest truth field (P2-7). See SR3-vehicles-38 and E2. | coordinator ruling (P2-17) |
| SR3-vehicles-38 | vehicles-9 step 2: scenario setup `quest/add` 11652 before the agent plays. | DESIGN answered: E2 accepted: the drive eval choice follows vehicles-4's live result. Evals stage only with `soap setup` (`docs/factory.md:96-98`: "Never use [gm] inside an eval"). If offline `quest/add` leaves quest 11652 complete, the spell-click condition fails and the scenario can never pass (finding 12). vehicles-4's live proof decides which path works. Rule: (a) if the offline add leaves the quest INCOMPLETE, keep the plan scenario and replace the `mobCounts` check by `game_log` `vehicles/control` with `allow` 1 plus a `truth` `point` at least 8 yd from the start (packet evidence, P2-7); (b) otherwise the scenario drops the quest and uses the quest-free drivable vehicle that vehicles-4 proved (for example 27496), or, if none drives, lands under "Not shown by any scenario" (D16) with the gap "no drivable vehicle reachable by `soap setup`". **DESIGN** E2. | coordinator ruling (P2-17) |
| SR3-vehicles-39 | vehicles-1 to -9: pre-split and growth watch. | Non-blank counts of existing files these tasks edit [M]: `protocol/monster-move.ts` 195, `monster-move.test.ts` 276, `protocol/movement-block.ts` 103, `movement-block.test.ts` 500 (pre-split, SEED3-20), `update-object.ts` 118, `update-object.test.ts` 292, `world-handlers-entity.ts` 315, `puppet/calls.ts` 318, `grader/scenarios.ts` 285, `tools/travel.ts` 415. New files start empty. Expected: `areas/vehicles/store.ts` and `runtime.ts` 250-400 after vehicles-4; `cts/areas/vehicles.ts` about 250; `transports/path.ts` about 300 (port of `TransportMgr::GeneratePath`). Split by responsibility at 450 (`store-seat.ts`, `runtime-drive.ts`, `path-keyframes.ts`, as `vehicles.md:564` already says for transports). | coordinator ruling (P2-17) |
| SR3-vehicles-40 | vehicles-6: the transport data source (P2-11, P2-8). | superseded by the coordinator decision (DBCs staged): `TaxiPathNode.dbc`, `TransportAnimation.dbc`, `TransportRotation.dbc`, `Vehicle.dbc`, `VehicleSeat.dbc`, `Map.dbc` and `GameObjectDisplayInfo.dbc` are staged, so vehicles-6 builds the client path model from real data (P2-11) and proves it live; synthetic tables are test fixtures only, and with a file missing the runtime reports the documented unavailable result and never presents a made-up path as real. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): The client path model reads exactly two client files through `ctx.dbc` with `openDbc` (`core/dbc.ts:20-…`), layouts from `src/server/shared/DataStores/DBCfmt.h:125,128`: `TaxiPathNode.dbc` = 11 fields, 44-byte records (`diiifffiiii`: id, path, node index, map, x, y, z, action flags, delay, arrival event, departure event); `TransportAnimation.dbc` = 7 fields, 28-byte records (`diifffx`: id, transport entry, time segment, x, y, z, one skipped column). Spec objects `{ file, fields, recordSize }` live in the area (`path.ts`, `lift.ts`), as `FACTION_LAYOUT` does (`areas/reputation/catalog.ts`). `Map.dbc` is not needed (server only uses it for `inInstance`, `TransportMgr.cpp:183-189`). Do not add the files to `REQUIRED_DBC_FILES` (`core/dbc-files.ts:8-19`; `main.test.ts:302-319` pins it against the `--check` warning list): absent files degrade to ids per P2-8, `poseAt` returns `undefined`, and the acts refuse `transport_data_missing`. Document the two files and where they come from under "Wire notes"/"Data" in `docs/areas/transports.md` (the `docs/harness.md:79-91` table is not owned by this unit). | coordinator ruling (P2-17) |
| SR3-vehicles-41 | vehicles-6 step 6, vehicles-7 step 5, vehicles-8 step 3: data and workers. | superseded by the coordinator decision (DBCs staged): the files are staged: tests still use synthetic tables (`packDbc`/`dbcFiles`) as fixtures, and the live steps take the live branches (vehicles-6 loads the files, vehicles-7 makes its live `CMSG_MOVE_CHNG_TRANSPORT` try on a real transport, vehicles-8 adds `t8-vehicles-zeppelin`). The degraded branches apply only when a file is missing; missing-file behaviour is tested with a run-owned directory, never by removing files from `spell_data_dir` (BR-wave3-7). Draft text, kept as the no-file branch (P2-8 degraded ids): Workers cannot supply the files (finding 5; `rules.md` item 6). Until the maintainer places them (E1), tests run on synthetic tables built with `packDbc`/`dbcFiles` (`cts/dbc.ts:3-50`), and each live step takes its documented fallback: vehicles-6 reports the check waiting for data; vehicles-7 sends one non-`ON_TRANSPORT` form on the ground and records `CMSG_MOVE_CHNG_TRANSPORT` as `builder` (sent live, effect not seen) plus `unseen`; vehicles-8 lands `t8-vehicles-zeppelin` under "Not shown by any scenario" with the gap "no transport path data". A builder checks for the files first (`ls "$(…spell_data_dir)"`, read-only) and records in its report which branch it took. | coordinator ruling (P2-17) |
| SR3-vehicles-42 | vehicles-6 step 2: the gameobject template. | Reuse `parseGameObjectQueryResponse` from `#wow/protocol/entity-queries` (allowed by `registry.test.ts:49`); its `data: number[]` (24 words, `entity-queries.ts:59-100`) already holds the words. Type 15 (`MO_TRANSPORT`): `data[0]` taxi path id, `data[1]` move speed, `data[2]` acceleration, `data[6]` map id (`AC/Entities/GameObject/GameObjectData.h:215-226`; `TransportMgr.cpp:120,194-195`); type 11 (`TRANSPORT`): `data[0]` only as the plan says. Peek the response (`transports.uses` gains `SMSG_GAMEOBJECT_QUERY_RESPONSE`); `objects` already peeks the same opcode (`areas/objects/area.ts:35-37`) and no area imports another, so each keeps its own copy. The name query already fires per new object (plan `:598-599`); the area sends nothing. | coordinator ruling (P2-17) |
| SR3-vehicles-43 | vehicles-6 steps 3 and 4: the port. | Port `TransportMgr::GeneratePath` (`Maps/TransportMgr.cpp:118-352`) and the `MotionTransport::Update` timing (`Entities/Transport/Transport.cpp:216-310`) inside `path.ts` with its own Catmull-Rom evaluation (`evaluate_percent` per segment, not the arc-length sampler of `core/spline.ts`, which is not importable from an area and serves a different timing). `poseAt(guid, now)` = create `pathProgress` + `now - receivedAt`, modulo the period, at the keyframe/spline position; the create block pose is the path start, not the current pose (SR3-vehicles-6). Lifts use `TransportAnimation::GetAnimNode` (`TransportMgr.cpp:509-527`, the lookup is a reverse scan; note the ASSERT on the last node). The re-sent create block after a map change (`Transport.cpp:160-186`) replaces `pathProgress` and `receivedAt`. | coordinator ruling (P2-17) |
| SR3-vehicles-44 | vehicles-6: file list and index owner. | Step 3 fixtures "by `cts/areas/transports.ts`" imply DBC synthetic tables of 11 and 7 columns. Index owner for vehicles-6 lacks `protocol/update-object.ts` and its test and the new `movement-block-trailer.test.ts` (SR3-vehicles-6, SEED3-20); add them (D). The `area.test.ts` named in vehicles-6 and -7 is one shared file: vehicles-6 creates it, vehicles-7 appends; keep each file under 450 (split `area-path.test.ts` if needed). The proof file `docs/protocol-coverage/transports.md` is generated; vehicles-6 lists `docs/areas/transports.md` only, vehicles-7 regenerates coverage. | coordinator ruling (P2-17) |
| SR3-vehicles-45 | vehicles-7 step 3: the plan's "silent teleport" claim and what boarding does on the server. | Wrong as written. `CMSG_MOVE_CHNG_TRANSPORT` is handled by `HandleMovementOpcodes` (`Opcodes.cpp:1040`; `MovementHandler.cpp:362-408`): it returns before any broadcast, answers nothing, and the boarding happens in `HandleMoverRelocation` (`:430-485`), which attaches the mover if a transport with that guid exists on the map (`:437-447`) and strips `ON_TRANSPORT` if the guid is not a transport (`:473-478`). The position check that matters is `VerifyMovementInfo` `:588-600`: a packet more than `SIZE_OF_GRIDS` (66.6 yd) from the server's position is dropped with no correction. So `board(guid)` refuses `transport_data_missing` without `poseAt`, `not_docked` unless the pose is inside a stop window, and `too_far` when the character is more than 30 yd from `poseAt`; it resolves `boarded { transport, entry }` right after the send because the server gives no answer (no `no_answer` path exists); the effect is proved later by position (`soap truth`). | coordinator ruling (P2-17) |
| SR3-vehicles-46 | vehicles-7 step 1: walking on the deck. | DESIGN answered: E3 accepted: rigid ride, no deck movement (`GameObjectDisplayInfo.dbc` is staged, but no deck collision geometry exists). Out of scope: control has only a static navmesh oracle and no deck geometry (`GameObjectDisplayInfo.dbc` is absent, finding 5), and `Mover` moves in world coordinates. `unsupportedReason` keeps refusing free movement while `ON_TRANSPORT` (`control-motion.ts:38`); the plan sentence "allows walking on the deck only while `poseAt` is defined" is dropped. `board` attaches at the character's current place: `offset = rotate(worldPos - poseAt.pos, -poseAt.orientation)`, z relative; the character is carried rigidly and sends nothing while standing (the server moves passengers, `Transport.cpp` `UpdatePassengerPositions`). **DESIGN** E3. | coordinator ruling (P2-17) |
| SR3-vehicles-47 | vehicles-7 step 1 and step 5: leaving. | `transport_leave` sends one `CMSG_MOVE_CHNG_TRANSPORT` without `ON_TRANSPORT` whose world position is the ground point under the docked pose: x/y from `poseAt`, z from `ControlDeps.ground` (`groundStep`, `control-motion.ts:48-66`); with no oracle, `leave` refuses `ground_height_unavailable`. The packet is accepted inside 66 yd of the server position (`MovementHandler.cpp:588-600`); the server applies fall damage only on `MSG_MOVE_FALL_LAND` (`:637-641` `HandleFall`), so a few yards of drop cost nothing. `leave` refuses `not_docked` unless the pose is in a stop window, and resolves `left { transport }` after the send. | coordinator ruling (P2-17) |
| SR3-vehicles-48 | vehicles-7 step 2: `SMSG_TRANSFER_PENDING` body. | `movement-handlers.ts:72-75` ignores the body and `protocol/movement.ts` is the self-state-12 lease, not vehicles-7's. vehicles-7 decodes the body inside `movement-handlers.ts` (its lease): `uint32LE` map id, then, if bytes remain, `uint32LE` transport entry and `uint32LE` old map (`AC/Entities/Player/Player.cpp:1607-1612`). The `transfer_pending` self event (`self-store.ts:21`) gains `mapId: number` and `transport?: { entry: number; fromMap: number }`; travel-4 also touches the event for multi-map flights (`travel.md:732`), so vehicles-7 reads the landed shape. `map_change { entry, fromMap, toMap }` is emitted by the transports runtime from `core.self.onEvent`. `newWorld` keeps the ride when the ride state holds a transport (replaces the clear at `control-sync.ts:263`); whether `SMSG_NEW_WORLD` carries world or transport-local coordinates on a transport is unread [INFERENCE]; this path is rig-tested only, never live (the live ride is Orgrimmar-Thunder Bluff, both map 1). | coordinator ruling (P2-17) |
| SR3-vehicles-49 | vehicles-7: act set and runtime. | `TransportsActs = { board, leave }` (`vehicles.md:677`); the control events are the `transport_board`/`transport_leave` self variants of SR3-vehicles-17, named in `control-ride.ts` (`GameOpcode.CMSG_MOVE_CHNG_TRANSPORT` appears only there). `poseAt` is passed as a callback in `transport_board`; control re-evaluates it per tick only to keep the ride state, never to send. Owner list of vehicles-7 gains `control-ride.ts`, `control-ride.test.ts` (D). | coordinator ruling (P2-17) |
| SR3-vehicles-50 | vehicles-8: the `travel` verb, `Goal` shape and renderer contract. | The `to` description of the tool lives in `h/tools/params-travel.ts` (22 non-blank); travel-6 adds `fly` there through the `tools/params.ts` lease, and queue 66 reads `objects-7 → travel-5 → travel-6 → vehicles-8`, so vehicles-8 is the last holder and needs no new queue row (section C states the chain). The `Goal` union of `h/tools/travel-report.ts:21-30` gains `{ kind: "ride"; stop: string }` plus a `parseRide` branch in `parseGoal` (`h/tools/travel.ts:82-118`, after `hearth`); `TravelGoalView` (`h/contract/details.ts:74-80`) gains `{ kind: "ride"; name: string }`; `goalView`/`goalName`/`goalLabel` (`travel-report.ts:128-141,282`) gain the case; `live-run.ts` (queue 69, `travel-6 → vehicles-8`) gains no vehicle sentence, only a `goalText` branch for `{ kind: "ride" }`. The verb is `to: "ride <stop>"`; the stop names come from the transports store (`entry` names and the path's stop nodes), not from the tool's own list. Keep the claim (`ctx.rt.mutex.run`) and the `transport_data_missing` refusal in `travel-ride.ts` (new) with `work.after`-shaped `TravelAfter` patches only. | coordinator ruling (P2-17) |
| SR3-vehicles-51 | vehicles-8 step 3: scenario `t8-vehicles-zeppelin`. | superseded by the coordinator decision (DBCs staged): `TaxiPathNode.dbc` is staged: the builder reads the first and last stop node of path 1221 (map 1) for the `position` step and the `truth` `point` (30 yd) and sizes `budget.minutes` to at least twice the computed period; the "not shown" result applies only with the file missing. Draft text, kept as the no-file branch (P2-8 degraded ids): The Orgrimmar tower point and the Thunder Bluff landing are path nodes of path 1221 in `TaxiPathNode.dbc` (finding 4), unavailable now; the plan's "Thunder Bluff landing" numbers cannot be written without the data. When the files exist (E1) the builder reads the first and last stop node of path 1221 (map 1) for the `position` step and the `truth` `point` (30 yd), and sizes `budget.minutes` to at least twice the period it computes. When they do not, SR3-vehicles-41 applies (no scenario row; capabilities unchanged). `botRisk` is `medium`: the tower is busy and RNDBOT* characters ride the same zeppelin; the agent never targets, trades with or whispers them (P2-9). Horde preset `max80` (`soap-presets.ts:55-62`). | coordinator ruling (P2-17) |
| SR3-vehicles-52 | vehicles-1 to -9: serial order and "transports last" (P2-11). | The unit builds serially in the order `1, 2, 3, 4, 5, 9, 6, 7, 8` (unit file order; index `parallel` is empty for `vehicles`). Make it explicit: vehicles-6 gains `vehicles-9` as a dependency (D). The other units finish their wave-3 control-file holders first through the dependencies of SR3-vehicles-22. | coordinator ruling (P2-17) |
| SR3-vehicles-53 | vehicles-1 to -9: Questions for the coordinator (`vehicles.md:772-781`). | superseded by the coordinator decision (DBCs staged): E1 (the DBC data source) is answered by the staging: the files exist and the live branches apply. Draft text, kept as the no-file branch (P2-8 degraded ids): 1: granted: `control-feed.ts` (fresh queue 10) and `control-mover.ts` (fresh queue 12) are in `leaseQueues`; `monster-move.ts` is SR3-vehicles-4 (SEED3-21 adds the queue row); the inflate export is SR3-vehicles-5 (SEED3-19). 2: both decisions stand (accepted, P2-5), with the changes in SR3-vehicles-16 to -28. 3: stands. 4: the DBC data source is E1; the default here is degraded mode (P2-8). | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. 1. **Stale citations (affects every row below).** `vehicles.md` cites code at `71fba0ab`. Current positions: `protocol/monster-move.ts` `parseMonsterMove` is at `:169-187` (plan `:169-178`); `protocol/movement-block.ts` has `readStationaryTransport` at `:70-77`, the trailer skips at `:101-107` (`TRANSPORT` `skip(4)` `:104`, `VEHICLE` `skip(8)` `:105`, `ROTATION` `:106-107`), not `:44-51,65-67`; `control-sync.ts` `clientControl` is at `:299-309` (plan `:238-249`), `newWorld` clears `transport` at `:263` (plan `:202`), `blockReason` `:132-138`, `movementInfo` `:143-156`; `control-motion.ts` `unsupportedReason` `:37-46` (`:38` transport, `:39-40` flying still right); `movement-handlers.ts` `SMSG_TRANSFER_PENDING` is `:72-75` (plan `:69-72`); `world-handlers-entity.ts` compressed inflate `:196-214` (plan `:187-196`); `client.ts` `cast` type is `:261` (plan `:253`); the game-object template parser is `protocol/entity-queries.ts:69-100` (plan `:57`). Symbols, not line numbers, are the contract; builders re-cite with `grep -n`.

2. 2. **Neither area exists yet.** `core/areas/registry.ts:1-48` and `h/areas/registry.ts:1-49` hold 23 areas; `vehicles` and `transports` are in neither [M]. `SEED-3` (section B) creates both. Every vehicles task transitively depends on it (vehicles-1 directly; vehicles-6 directly; the rest through vehicles-1).

3. 3. **No stubs exist for this unit.** `core/protocol/stubs.ts:6-25` holds 19 `STUBS` rows, none of the 14 opcodes; the 14 names occur only in `core/protocol/opcodes.ts` (`grep -rln` over core, harness, devtools [M]). Coverage status of all 14 is `missing` today. `vehicles.md:89-90` "remove the three stub lines" is void (SR3-vehicles-3).

4. Superseded by the coordinator decision (DBCs staged): the transport and vehicle DBCs are staged (TaxiPathNode, TransportAnimation, TransportRotation, Vehicle, VehicleSeat, Map, GameObjectDisplayInfo). Draft text, kept as the no-file branch (P2-8 degraded ids): 4. **Live reach (answers the assignment's question).**
   - `soap gm` verbs (`soap-gm.ts:45-58,230-262`) reach only `tele <name>` (`tele name <C> <name>`, a `game_tele` row), `learn`, `items`, `quest add`, `level`, `revive` and reads. `game_tele` has `Orgrimmar` (1629.85, -4373.64, 31.56, map 1, the Valley of Strength, not the zeppelin tower), `ThunderBluff` (-1277.37, 124.80, 131.29, map 1), `MenethilHarbor`, `StormwindHarbor`, `Auberdine`, `Theramore` [M: `SQL/game_tele.sql`]. No tele name reaches a zeppelin tower or a vehicle.
   - The placement tool is offline `soap setup <ACCOUNT> position` (`realm-service.ts:8-25`; `docs/factory.md:80-88`), which accepts any `map, x, y, z` and refuses an online character. A scenario writes it as `{ "endpoint": "position", "body": { "map", "x", "y", "z" } }` (`grader/scenarios/t1-quests-guard-directions.json` [M]). `Scenario` (`h/grader/scenarios.ts:108-130`) needs no new field. There are no spawn grids: one agent, one replica (SEED2-2 carries over; `spawn`/`field` unused).
   - Vehicles are reachable: world tables are readable as SQL in the AzerothCore tree (`SQL/creature.sql`, `creature_template.sql`, `npc_spellclick_spells.sql`, `conditions.sql`, `gameobject_template.sql`, `transports.sql` [M]). DBC-backed server tables are structure only (`SQL/vehicleseat_dbc.sql` 4468 bytes, `vehicle_dbc.sql` 3784, `taxipathnode_dbc.sql` 2165, `transportanimation_dbc.sql` 2047 [M: `ls -la`]), so seat flags, seat counts and taxi path nodes are readable nowhere on the host (`find /` finds no `TaxiPathNode*`, `TransportAnimation*`, `Vehicle*.dbc` [M]).
   - A transport is reachable by position only: Horde transports in the table are 6 (Undercity-Orgrimmar, entry 164871), 11 (Undercity-Vengeance Landing), 12 (Orgrimmar-Warsong Hold), 20 (Orgrimmar-Thunder Bluff "The Zephyr", entry 190549, both ends map 1) [M: `SQL/transports.sql`]. The dock coordinates are the path nodes of `TaxiPathNode.dbc` (path id is `data0` = 1221 of template 190549, speed `data1` 30, acceleration `data2` 1; `SQL/gameobject_template.sql`) and are not on the host (finding 5).

5. Superseded by the coordinator decision (DBCs staged): the files named here are staged; vehicles-6 reads them through `ctx.dbc`. Draft text, kept as the no-file branch (P2-8 degraded ids): 5. **Transport data is absent (P2-11 / P2-8).** `spell_data_dir` (`/home/deity/code/peon/tmp/gameplay-data/raw`) holds `AreaTrigger`, `FactionTemplate`, `Lock`, `SkillLineAbility`, `Spell`, `SpellCastTimes`, `SpellCategory`, `SpellDifficulty`, `SpellDuration`, `SpellRadius`, `SpellRange` only [M: `ls`]. No `TaxiPathNode.dbc`, `TransportAnimation.dbc`, `Vehicle.dbc`, `VehicleSeat.dbc`, `GameObjectDisplayInfo.dbc`, `Faction.dbc`. The client archives exist (`/home/deity/wow-client/Data/*.MPQ`); the only extractor is a compiled binary whose file list is fixed (`/home/deity/code/peon/tmp/gameplay-data/src/extract_mpq.cpp:24-…`, `kFiles`) and does not name these files. Workers must not copy files into `spell_data_dir` (`rules.md` item 6). The decision is ruled in SR3-vehicles-40 to -43 and E1.

6. 6. **Control-file chain and sizes (vehicles-3, -4, -7).** Non-blank lines now [M]: `control-sync.ts` 375, `control.ts` 303, `control-mover.ts` 344, `control-motion.ts` 84, `control-feed.ts` 55, `self-store.ts` 80, `movement-handlers.ts` 109; tests `control-core.test.ts` 294, `control-flags.test.ts` 330, `control-acks.test.ts` 247, `movement-handlers.test.ts` 119, `self-store.test.ts` 42; `cts/control-fixtures.ts` 113. Before vehicles-3 starts, travel-4 and self-state-12 add to `control-sync.ts`, `control.ts`, `control-feed.ts`, `self-store.ts` (`travel.md:662-700`, `self-state.md:952-1000`). To keep all of them below 480, vehicles-3 puts the ride state in a new `control-ride.ts` (SR3-vehicles-16).

7. 7. **Area-source bans that shape the design.** `registry.test.ts:260-261` fails any area source that names `GameOpcode.CMSG_MOVE_*` or `MSG_MOVE_*`; `:47-56` allows value imports only from `#lib/*`, `#wow/protocol/*`, `#wow/areas/contract`, `#wow/geometry`, `#wow/dbc`, `#wow/data/*`, `#wow/inventory`, `#wow/player-state`, the area's own files; `:255-258` bans `node:zlib`. So `CMSG_MOVE_NOT_ACTIVE_MOVER` and `CMSG_MOVE_CHNG_TRANSPORT` are named only in control files, and no area imports `#wow/spline`.

8. 8. **AzerothCore silently drops movement packets.** `VerifyMovementInfo` (`AC/Handlers/MovementHandler.cpp:544-625`) returns false, with no error packet, for any mover packet while the mover's spline runs unless it is a root/unroot ack during boarding (`:555-559`), and for an `ON_TRANSPORT` packet whose world position is further than `SIZE_OF_GRIDS` from the server's (`:588-600`). `CMSG_MOVE_CHNG_TRANSPORT` is broadcast to nobody (`:407-408`). Consequence for vehicles-3 and -7 acts: no server answer exists for a board; see SR3-vehicles-19 and -45.

9. 10. **Puppet call names are flat, sorted, and must equal an act name** (`h/puppet/calls.ts:20-…`, `calls.test.ts:26-60,97-99`); `leave` is taken by `lfg` (`calls.ts:52`). The `vehicles.enterPlayerVehicle` syntax in `vehicles.md:254-256,274-275` does not exist (SR3-vehicles-12).

10. 11. **`movement-block.test.ts` is at the cap.** 500 non-blank lines (522 total) [M]; vehicles-1 and vehicles-6 both add tests. Pre-split in SEED-3 (B-11).

11. 12. **`quest/add` state risk.** `CONDITION_QUESTTAKEN` passes only for `QUEST_STATUS_INCOMPLETE` (`AC/Conditions/ConditionMgr.cpp:177-186`); the wave-2 checklist says offline `quest/add` "marks the quest COMPLETE" (`wave2/checklist.md:30`). The Horde Siege Tank's spell-click rows need quest 11652 taken (`SQL/conditions.sql`: `(18,25334,46598,…,11652…)`). Affects vehicles-4 and vehicles-9 (SR3-vehicles-30, -38).
