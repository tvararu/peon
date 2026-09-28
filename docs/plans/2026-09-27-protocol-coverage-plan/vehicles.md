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

1. The two leases and the `COORD` export named above that contract 2.7
   does not list (`protocol/monster-move.ts`, `control-feed.ts`,
   `control-mover.ts`, the update-object inflate).
2. The "Control access" and "Create-block reads" decisions.
3. Contract 0.6 had no proof row for a client opcode whose effect no
   worker can reach. The plan fix-up added the effect-not-seen row
   (`builder`, `unseen`, "sent live, effect not seen"), and this unit uses it.
4. The DBC data source for vehicles-6 to -8 (design 7.2 question 5).

## COMPLETE
