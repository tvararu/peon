# Protocol coverage: travel (key: travel)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.6 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

The `travel` unit gives the character a home inn, the hearthstone and
flight paths, and it makes control adopt the landing point after a
flight. It owns one code area, `travel`, with 14 relevant opcodes and 1
dead opcode, plus the `SMSG_SHOWTAXINODES` body gap (read through a
`peek`, section "Contract issues" 2).

- **Worktree:** `proto-travel`, created by the coordinator with the
  command of contract 0.1. **Branch:** `proto/area-travel`.
- **Phases:** travel-1 and travel-5 are wave 1 (phase 1, NS1: bind and
  hearth). travel-2, travel-3, travel-4 and travel-6 are wave 3 (phase 3,
  NS2: flights), as design 5.1 assigns them. travel-4 changes control, so
  it lands in the control slot of wave 3, before `vehicles` (design 5.1,
  "last in the band").
- **Order:** travel-1 → travel-5 (wave 1); travel-2 → travel-3 → travel-4
  → travel-6 (wave 3). One task at a time (contract 0.1).
- **Eval ids** (design 5.2): `t8-travel-bind-inn`, `t8-travel-hearth-home`,
  `t8-travel-fly`.

AzerothCore paths below are relative to `src/server/game/` unless they
start with `src/` (contract 0.5). wowm paths are under
`wow_message_parser/wowm/world/`. Marks: **[M]** read for this plan,
**[I]** inferred.

## Contract issues

These are gaps found while planning. The contract is not changed. Each
one names what the coordinator must do, and the task that stops if it is
not done.

1. **Taxi DBC files are absent.** The DBC directory the live profile
   names (`spell_data_dir` in the maintainer's Peon config) holds 9 files,
   `FactionTemplate.dbc`, `SkillLineAbility.dbc` and 7 `Spell*.dbc`, and
   neither `TaxiNodes.dbc` nor `TaxiPath.dbc` [M, `ls`]. The client-data
   extract that produced them lives outside the repo. travel-2's unit
   tests build DBC bytes with `packDbc`
   (`packages/core/test-support/dbc.ts:3`) and do not need the files.
   travel-2's live catalog check, travel-3's route and travel-6's eval do.
   The coordinator stages both files into that directory before wave 3.
   Other areas need the same step (design D4 names `AreaTrigger.dbc`,
   `Lock.dbc`, talent and faction files). A task that finds them absent at
   its live step stops as `blocked`, naming the two files.
2. **`SMSG_SHOWTAXINODES` needs no lease.** The contract lease table
   (2.7) lists `gameplay-handlers.ts` for travel "for the
   `SMSG_SHOWTAXINODES` body, or a peek". This plan takes the peek (N3):
   the legacy handler at `gameplay-handlers.ts:206-209` [M] stays the
   owner, and the travel area reads the full body on its own fork. The
   opcode goes in `TRAVEL_OPCODES.uses`, not `owns`. The legacy handler
   stays unchanged.
3. **travel-4 needs two lease entries the table does not list.** A self
   `SMSG_MONSTER_MOVE` reaches only the entity and motion stores today
   (`gameplay-handlers.ts:158-167` [M]). Control learns self facts through
   `SelfEvent` values that `control-feed.ts:4-46` [M] routes. So travel-4
   edits the `SMSG_MONSTER_MOVE` handler block of `gameplay-handlers.ts`
   and adds one `case` to `control-feed.ts`, in addition to the listed
   control files (`control-sync.ts`, `control.ts`, `self-store.ts`,
   `movement-handlers.ts`). The coordinator names both in travel-4's
   lease row. travel-4 also creates one sibling file, `control-flight.ts`,
   because `control-sync.ts` has 313 lines [M, `wc -l`] and the flight
   logic would take it near the 500-line cap; the lease row names it too.
4. **Harness `tools/params.ts` is not in the lease table.** The `look`
   kinds (`LOOK_KINDS`, `tools/params.ts:3-15` [M]), the `interact` `do`
   enum (`tools/params.ts:99-137` [M]) and the `travel` parameter text
   (`tools/params.ts:36-56` [M]) live there, not in `look.ts`,
   `interact*.ts` or `travel*.ts`. travel-5 and travel-6 need the
   `lookParams`, `travelParams` and `interactParams` blocks of that file
   under the same lease as the three tool modules.
5. **`PLAYER_FLAGS` from an area.** The benchmark proof reads self
   `PLAYER_FLAGS` bit `0x20000`. Core reads self fields through
   `fieldOf` and `readSelfField` (`player-state.ts:19-43` [M]), which are
   values from `#wow/entity-store` and `#wow/player-state`, outside the
   area allow-list (contract 1.12). travel-2 reads the field through the
   `entity` event's `Entity` value with a type-only import. If that is not
   possible without `fieldOf`, travel-2 stops as `blocked` and asks for a
   `COORD` allow-list extension for `#wow/entity-store`.
6. **Harness tasks carry no opcode.** travel-5 and travel-6 are verb and
   eval tasks (design 5.6 "Tasks"). They hold no opcode of their own; the
   rule "1-8 opcodes per task" does not fit them, and contract 0.10
   forbids merging them into the core tasks.
7. **travel-3 before travel-4.** Design 5.6 says "travel-4 lands with
   travel-3 so no build can fly without the landing fix". The unit runs
   one task at a time, and travel-4's live proof needs travel-3's
   `activateTaxi`. This plan lands travel-3 first. No build can fly
   through the harness in between: `activateTaxi` has no harness caller
   until travel-6, which depends on travel-4, and the world service
   exposes it only from travel-6 (`worldActs`). travel-3's live proof
   logs the probe character out at the landing point without a move.
   The coordinator confirms this reading; otherwise travel-3's act
   refuses with `refused("landing_unfixed")` until travel-4 removes the
   refusal.

## Shared facts for every task

**Names** (contract D7 and the `time` example, contract 1.10):

| Name | File |
|---|---|
| `TRAVEL_OPCODES` | `packages/core/src/wow/areas/travel/opcodes.ts` (seeded by `SEED-1`) |
| `travelArea` | `packages/core/src/wow/areas/travel/area.ts` (seeded) |
| parsers `parseBindPointUpdate`, `parsePlayerBound`, `parseBinderConfirm`, `parseShowTaxiNodes`, `parseTaxiNodeStatus`, `parseActivateTaxiReply`; builders `buildBinderActivate`, `buildTaxiNodeStatusQuery`, `buildTaxiQueryAvailableNodes`, `buildEnableTaxi`, `buildSetTaxiBenchmarkMode`, `buildActivateTaxi`, `buildActivateTaxiExpress`; `TAXI_REPLY` (the 13 names) | `packages/core/src/wow/areas/travel/protocol.ts` |
| `TravelState`, `TravelEvent`, `TravelStore`, `createTravelStore` | `packages/core/src/wow/areas/travel/store.ts` |
| `TaxiCatalog`, `TaxiNode`, `TaxiEdge`, `loadTaxiCatalog(dbc)` | `packages/core/src/wow/areas/travel/catalog.ts` |
| `taxiRoute(catalog, known, from, to)` | `packages/core/src/wow/areas/travel/route.ts` |
| `TravelActs`, `TravelOutcome`, `travelRuntime` | `packages/core/src/wow/areas/travel/runtime.ts` |
| `travel<Opcode>Body(...)` builders, `travelTaxiDbc(...)` | `packages/core/test-support/areas/travel.ts` |
| `travelHarness` | `packages/harness/src/areas/travel/area.ts` (seeded) |

**Outcome.** Every act settles as
`TravelOutcome = { status: "ok"; ... } | { status: "refused"; reason: string } | { status: "no_answer" }`,
because several server paths refuse silently (design 5.6). Timeouts use
`ctx.until(..., { timeoutMs })`; a timeout maps to `no_answer`.

**Events** (design 5.6; `type` matches `/^[a-z_]+$/`, payloads are
strings, numbers and bigint guids): `bind_point`, `bind_offer`, `bound`,
`taxi_node_status`, `taxi_node_learned`, `taxi_map`, `taxi_reply`,
`flight_started`, `flight_landed`, `benchmark`.

**Harness log rows** (drafts of `travelHarness.rules`, domain `travel`,
event `travel/<name>`): `bind_offer` (log), `home_set` (log, `progress:
true`), `node_learned` (log, `progress: true`), `flight_started` (log,
`progress: true`), `flight_landed` (wake), `flight_refused` (log). The
`bind_point` event at login writes no row (design 5.6 area file, section
4.3).

**Live characters.** `mise factory soap create <preset>` gives the
account; the offline `position` endpoint places it before login with the
body `{ map, o, x, y, z, zone }` (the shape `grader/spawn-slots.ts:138-144`
[M] sends). `soap gm tele` (T-5) is an alternative once it lands. Every
account is deleted with `mise factory soap delete <ACCOUNT>` before the
task reports (contract 0.7). No SOAP command teaches one taxi node
(`.cheat taxi` is `Console::No`, `src/server/scripts/Commands/cs_cheat.cpp:42`);
nodes are learned by talking to flight masters.

**Doc file.** `docs/areas/travel.md` has the fixed headings of contract
3.8. travel-1 creates it. Each later task adds its proof rows, wire notes
and "Left out" lines. Every opcode of `owns` has exactly one proof row
once travel-4 lands.

---

## Task travel-1: Bind point store and bind act

**Phase:** 1 (wave 1). **codeArea:** `travel`. **Size:** S.

Rulings: SR1-travel-6, SR1-travel-7, SR1-travel-8.

**Files:**
- Edit: `packages/core/src/wow/areas/travel/opcodes.ts` (delete the
  `SMSG_BINDPOINTUPDATE` stub line; fill `dead`)
- Create: `packages/core/src/wow/areas/travel/protocol.ts` and
  `protocol.test.ts`
- Create: `packages/core/src/wow/areas/travel/store.ts` and `store.test.ts`
- Create: `packages/core/src/wow/areas/travel/runtime.ts` and
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/travel/area.ts`
- Create: `packages/core/test-support/areas/travel.ts`
- Create: `packages/devtools/src/probe-flows/travel-bind.ts`
- Create: `docs/areas/travel.md`
- Regenerate: `docs/protocol-coverage/travel.md`

**Depends on:** `S0-5`, `SEED-1` (seeds `travel`), `T-2` (tap), `T-3`
(probe), `T-4` (cite-check).

**Opcodes:** `SMSG_BINDPOINTUPDATE` (stub → handled), `SMSG_PLAYERBOUND`,
`SMSG_BINDER_CONFIRM`, `CMSG_BINDER_ACTIVATE`.

**Steps:**

- [ ] **Step 1: Test-support builders.** In
  `packages/core/test-support/areas/travel.ts`, write
  `travelBindPointUpdateBody({ x, y, z, mapId, areaId })` (three `f32`,
  two `u32`: `Entities/Player/Player.cpp:11775-11779` at login and
  `Spells/SpellEffects.cpp:6652-6658` at bind [M]),
  `travelPlayerBoundBody({ binder, areaId })` (full `u64` guid then `u32`:
  `Spells/SpellEffects.cpp:6663-6666` [M]) and
  `travelBinderConfirmBody(npc)` (the `u64` guid only:
  `Entities/Player/Player.cpp:9118-9122` [M]).

- [ ] **Step 2: Failing parser and builder tests.** `protocol.test.ts`:
  - `parseBindPointUpdate` reads x, y, z, map and area from a
    `travelBindPointUpdateBody` and leaves 0 bytes.
  - `parsePlayerBound` reads the binder guid and area.
  - `parseBinderConfirm` reads an 8-byte body (AzerothCore shape). A test
    title records that wowm's `item/smsg_binder_confirm.wowm:7-13` adds an
    `Area`, which AzerothCore does not write.
  - `buildBinderActivate(npc)` writes exactly the 8-byte guid that
    `Handlers/NPCHandler.cpp:293-296` reads [M].

  Run `mise test packages/core/src/wow/areas/travel/protocol.test.ts`.
  Expected: fails to load, `protocol.ts` does not exist.

- [ ] **Step 3: Implement `protocol.ts`.** Parsers over `PacketReader`,
  the builder over the existing packet writer in `#wow/protocol/*`. Run
  the test; it passes.

- [ ] **Step 4: Failing store and rig tests.** `store.test.ts` uses
  `areaRig("travel")` (contract 1.8) and `rig.inject`:
  - A bind point update sets `state().home` to `{ mapId, x, y, z, areaId }`
    and emits `bind_point` with `reason: "login"` when no bind is pending.
  - A binder confirm sets `offer` to `{ npc, at }` (rig clock) and emits
    `bind_offer`. The next bind point update clears it. An offer older
    than 60 s reads as absent.
  - A player-bound packet sets `lastBound` and emits `bound`. A bind point
    update that follows a pending `bindActivate` emits `bind_point` with
    `reason: "bound"`.
  - The `SMSG_BINDPOINTUPDATE` pair is gone from `areaStubs()` and the
    rig dispatch owns the opcode (`dispatch.has`).

- [ ] **Step 5: Implement the store and `register`.** `createTravelStore`
  holds the bind part of `TravelState`:
  `{ home, offer, lastBound, bindPending }` (the taxi part joins in
  travel-2). `register` calls `wire.on` for the three server opcodes and
  the matching store `receive*` method. Delete the stub line from
  `TRAVEL_OPCODES.stubs`. Put `SMSG_FLIGHT_SPLINE_SYNC` in `dead`
  (section "Dead opcodes"). Run the tests; they pass.

- [ ] **Step 6: Failing runtime test.** `runtime.test.ts`, over the rig:
  - `act.bindActivate(npc)` records one `CMSG_BINDER_ACTIVATE` in
    `rig.sent` with the npc guid; an injected bind point update settles it
    as `{ status: "ok", home }`.
  - With no reply in 5 s (fake timers, `try`/`finally` with
    `jest.useRealTimers()`), it settles as `no_answer`. AzerothCore sends
    nothing when the player is dead, the npc is out of range or the map
    is instanceable (`Handlers/NPCHandler.cpp:298-307,317-319` [M]).
  - A second `bindActivate` while one is pending refuses with
    `refused("busy")` and sends nothing.
  - An injected `SMSG_TRAINER_BUY_SUCCEEDED` for spell 3286 does not
    reach the trainer store as a purchase (design 5.6 "Bind reply";
    `trainer-store.ts:106-112` [M]). This test passes before and after;
    it pins the cross-area rule and is kept only if the reviewer agrees
    it tests behaviour.

- [ ] **Step 7: Implement `runtime.ts`** with `TravelActs = { bindActivate }`
  and wire it in `area.ts` (`runtime: travelRuntime`,
  `eventTypes: ["bind_point", "bind_offer", "bound"]`). The act sends no
  gossip first (N30: bind without the gossip confirm). Run the tests,
  then `mise typecheck core`, `mise lint packages/core/src/wow/areas/travel`,
  `mise protocol:coverage`.

- [ ] **Step 8: Probe flow.** `packages/devtools/src/probe-flows/travel-bind.ts`:
  find the nearest innkeeper (`npc-roles.ts:42` maps npc flag `0x10000` to
  `innkeeper` [M]), call `handle.travel.act.bindActivate(guid)`, wait for
  `bound`. With `--arg gossip=1` it instead sends `CMSG_GOSSIP_HELLO`,
  reads the `SMSG_GOSSIP_MESSAGE` options and selects the first option
  whose text contains "home" (case-insensitive), then waits for
  `bind_offer`.

- [ ] **Step 9: Live proof.** `soap create eversong10`, place the
  character next to an Eversong innkeeper with the `position` endpoint
  (the worker reads the innkeeper's spawn from `look find:"any"` output or
  the probe's `nearest innkeeper`), then:
  - `mise protocol:probe <ACCOUNT> --flow login --expect SMSG_BINDPOINTUPDATE`
    (every login, `Player.cpp:11775` [M]);
  - `mise protocol:probe <ACCOUNT> --flow travel-bind --expect SMSG_PLAYERBOUND --expect SMSG_BINDPOINTUPDATE`
    (proves `CMSG_BINDER_ACTIVATE` live: its effect shows in two later
    packets);
  - `mise protocol:probe <ACCOUNT> --flow travel-bind --arg gossip=1 --expect SMSG_BINDER_CONFIRM`.
    If no option text contains "home", or the confirm does not arrive,
    `SMSG_BINDER_CONFIRM` goes to `unseen` and its proof is the rig test
    of step 4, built from `Entities/Player/Player.cpp:9118-9122`
    ("not seen live", R22).

- [ ] **Step 10: Doc.** Create `docs/areas/travel.md` with the fixed
  headings. Wire notes: the `SMSG_BINDER_CONFIRM` disagreement. Proof
  rows for the four opcodes and the dead row. Capabilities row: "Proposed
  in travel-5." Run `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_BINDPOINTUPDATE` | live | `login` flow, every login |
| `SMSG_PLAYERBOUND` | live | `travel-bind` flow |
| `CMSG_BINDER_ACTIVATE` | live | `travel-bind` flow; `SMSG_PLAYERBOUND` and `SMSG_BINDPOINTUPDATE` follow |
| `SMSG_BINDER_CONFIRM` | live, or mock from `Entities/Player/Player.cpp:9118-9122` marked "not seen live" | `travel-bind` flow with `gossip=1` |

**Commit:**

```
feat: Track the bind point and bind at inns

The character now knows its home inn from every login and can make an
innkeeper's inn its home, so the harness can name where a hearthstone
goes.
```

---

## Task travel-5: Bind and hearth verbs

**Phase:** 1 (wave 1). **codeArea:** `travel`. **Size:** M.

Rulings: SR1-travel-1, SR1-travel-2, SR1-travel-3, SR1-travel-4, SR1-travel-5, SR1-travel-9, SR1-travel-10, SR1-travel-11.

**Files:**
- Edit (lease): `packages/harness/src/tools/interact.ts` (a `bind` step
  in `STEPS`, `interact.ts:127-133` [M]) and a new sibling
  `packages/harness/src/tools/interact-bind.ts` with its test
- Edit (lease): `packages/harness/src/tools/travel.ts` (`parseGoal`,
  `travel.ts:68-87` [M]) and a new sibling
  `packages/harness/src/tools/travel-hearth.ts` with its test
- Edit (lease): `packages/harness/src/tools/look.ts` (the `innkeeper`
  kind) and `look.test.ts`
- Edit (lease, contract issue 4): `packages/harness/src/tools/params.ts`
  (`LOOK_KINDS` gains `innkeeper`; `interactParams` `do` gains `bind`;
  `travelParams` `to` text names `hearth`)
- Edit: `packages/harness/src/areas/travel/area.ts` and `area.test.ts`
  (rules, `worldActs: ["bindActivate"]`)
- Create: `packages/harness/src/grader/scenarios/t8-travel-bind-inn.json`,
  `packages/harness/src/grader/scenarios/t8-travel-hearth-home.json`
- Shared: `packages/harness/src/grader/scenarios.ts` `ROUND_1` (append),
  `docs/capabilities.md`, `docs/evals.md` (contract 3.2-3.5)
- Edit: `docs/areas/travel.md` (capabilities row), `docs/harness.md` (the
  `interact` and `travel` rows of the tool table, one clause each)

**Depends on:** `travel-1`. Soft: `T-8` (the truth `hearth` pick). If T-8
has landed, `t8-travel-bind-inn` adds a truth check on it; if not, the
scenario uses log evidence only.

**Opcodes:** none of its own (contract issue 6). It uses
`CMSG_BINDER_ACTIVATE` through `bindActivate` and the handled
`CMSG_USE_ITEM` through `handle.useItem` (`client.ts:292` [M]).

**Steps:**

- [ ] **Step 1: Harness rules test.** `packages/harness/src/areas/travel/area.test.ts`:
  a `bind_point` event with `reason: "bound"` gives one `home_set` draft
  whose text names the area from the area table; with `reason: "login"`
  it gives none. A `bind_offer` gives one `bind_offer` draft. The
  harness registry test still passes (`worldActs` entries are functions
  on the mock's `handle.travel.act`). Run it; it fails (no rules).
- [ ] **Step 2: Implement the rules** in `travelHarness`. Run the test.
- [ ] **Step 3: `interact do:"bind"` test.** `interact-bind.test.ts` on
  the mock game (`triggerAreaEvent`, `jest.spyOn(handle.travel.act,
  "bindActivate")`):
  - at an innkeeper the step approaches with the existing interact leg,
    calls `bindActivate(npc)` once and reports `Home is now <area>.`;
  - at a non-innkeeper it refuses with `not_innkeeper` and calls nothing;
  - `no_answer` reports the silent refusal ("dead, out of range or in an
    instance");
  - `expectSendKind(interactTool)` passes (contract 1.9).
- [ ] **Step 4: Implement** `interact-bind.ts` and the `STEPS` entry.
- [ ] **Step 5: `travel to:"hearth"` test.** `travel-hearth.test.ts`:
  - refuses with `no_hearthstone` when no bag slot holds item 6948
    (the worker confirms the id in the item catalog; the id already
    appears in core fixtures, `vendor.test.ts:74` [M]);
  - refuses while the hearthstone spell is on cooldown (the core cooldown
    store), in combat, or while control reports `in_flight`;
  - otherwise calls `handle.useItem(bag, slot)` once, waits for a near
    teleport or `SMSG_NEW_WORLD` through the existing control events, and
    reports the arrival and the distance to `travel.state().home`;
  - a cast that ends without a teleport reports `refused("interrupted")`.
- [ ] **Step 6: Implement** `travel-hearth.ts` and the `parseGoal` branch
  (`to` equal to `hearth`).
- [ ] **Step 7: `look find:"innkeeper"` test and implementation.** The
  kind filters on the `innkeeper` npc role. Update the params text.
- [ ] **Step 8: Scenarios.** Both files follow the shape of
  `t1-walk-to-npc.json` [M]:
  - `t8-travel-bind-inn`: preset `eversong10`; setup `position` at an
    Eversong innkeeper whose inn is not the preset's home (the worker
    reads the preset home from the login `bind_point` event of a
    throwaway run); task "Make this inn your home."; checks: game log
    `travel/home_set` whose data names this inn's area; with T-8, truth
    `hearth` within 15 yd of the innkeeper.
  - `t8-travel-hearth-home`: preset `elwynn10`; setup `hearth` (to set a
    known home; its body could not be determined: the worker reads the
    realm service's refusal of `{}` on a throwaway account first) and
    `position` at least 200 yd away on map 0; task "Use your hearthstone
    to go home."; checks: truth `point` within 15 yd of the home and the
    Hearthstone still in `inventory`.
  - Budgets start at `paneMinutes` 9 and `budget.minutes` 6 (as
    `t1-walk-to-npc`), tier 8 (design 5.2). Run
    `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 9: Eval runs.** `mise eval run t8-travel-bind-inn --round <n>` and
  `mise eval run t8-travel-hearth-home --round <n>`, babysat by an omp Muse worker
  (R10). Record each verdict.
- [ ] **Step 10: Docs, one commit per scenario** (contract 3.2): the JSON,
  its `ROUND_1` line, its `docs/capabilities.md` row (a passed scenario)
  or bullet (a failed one) and the `docs/evals.md` row
  `| Travel (\`interact\` bind, \`travel\` hearth and fly) | \`t8-travel-bind-inn\`, \`t8-travel-hearth-home\` |`.
  Then run the regression gates of contract 3.6 (`t1-walk-to-npc`,
  `t7-halt-resume`, `t3-ghostlands-kill` against the R0 baseline) and
  `mise ci:checks`.

**Proof:** eval. `t8-travel-bind-inn` and `t8-travel-hearth-home` verdicts.

**Commits** (three):

```
feat: Bind at inns and hearth home

The agent can now make an inn its home with interact bind and use its
hearthstone with travel hearth, so it can return to a quest hub without
walking.
```

```
test: Add the t8-travel-bind-inn eval

The scenario proves the bind verb end to end against the live server,
with the new home read from the server's reply.
```

```
test: Add the t8-travel-hearth-home eval

The scenario proves the hearth verb by the character's final position
next to its home.
```

---

## Task travel-2: Taxi knowledge and catalog

**Phase:** 3 (wave 3). **codeArea:** `travel`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/travel/opcodes.ts` (`uses` gains
  `SMSG_SHOWTAXINODES`)
- Edit: `protocol.ts`, `protocol.test.ts`, `store.ts`, `store.test.ts`,
  `runtime.ts`, `runtime.test.ts`, `area.ts` under
  `packages/core/src/wow/areas/travel/`
- Create: `packages/core/src/wow/areas/travel/catalog.ts` and
  `catalog.test.ts`; `route.ts` and `route.test.ts`
- Edit: `packages/core/test-support/areas/travel.ts`
- Create: `packages/devtools/src/probe-flows/travel-taxi.ts`
- Edit: `docs/areas/travel.md`; regenerate `docs/protocol-coverage/travel.md`

**Depends on:** `travel-1`, `SEED-3`, contract issue 1 (the DBC files) for
the live step.

**Opcodes:** `CMSG_TAXINODE_STATUS_QUERY`, `SMSG_TAXINODE_STATUS`,
`CMSG_TAXIQUERYAVAILABLENODES`, `CMSG_ENABLETAXI`, `SMSG_NEW_TAXI_PATH`,
`CMSG_SET_TAXI_BENCHMARK_MODE`. Also the `SMSG_SHOWTAXINODES` body, read
by `peek`.

**Steps:**

- [ ] **Step 1: Builders.** Add `travelShowTaxiNodesBody({ npc, currentNode, mask })`
  (`u32 1`, `u64` guid, `u32` curloc, 14 `u32` mask words:
  `Handlers/TaxiHandler.cpp:98-102`, `Entities/Player/PlayerTaxi.cpp:116-128`,
  `TaxiMaskSize = 14` at `src/server/shared/DataStores/DBCStructure.h:2284`
  [M]), `travelTaxiNodeStatusBody({ npc, known })` (guid and `u8`:
  `Handlers/TaxiHandler.cpp:53-55`, `Entities/Player/Player.cpp:10715-10717`
  [M]) and `travelTaxiDbc({ nodes, paths })`, which packs `TaxiNodes.dbc`
  (format `nifffssssssssssssssssxii`) and `TaxiPath.dbc` (`niii`,
  `src/server/shared/DataStores/DBCfmt.h:123-124` [M]) with `packDbc` and
  returns a `DbcSource` from `dbcFiles` (`packages/core/test-support/dbc.ts:3,33`
  [M]).
- [ ] **Step 2: Failing protocol tests.**
  - `parseShowTaxiNodes` returns `{ npc, currentNode, known }` with the
    known node ids from the mask; the bit rule is AzerothCore's, node `n`
    is word `(n-1)/32`, bit `(n-1)%32`
    (`Entities/Player/PlayerTaxi.h:35-50` [M]); node 82 and node 1 round
    trip.
  - `parseTaxiNodeStatus` reads the guid and a boolean.
  - `buildTaxiNodeStatusQuery`, `buildTaxiQueryAvailableNodes` and
    `buildEnableTaxi` each write the 8-byte guid that
    `Handlers/TaxiHandler.cpp:27-33,60-63` reads; `CMSG_ENABLETAXI` uses
    the same handler (`Server/Protocol/Opcodes.cpp:1302` [M]).
  - `buildSetTaxiBenchmarkMode(true)` writes one `u8` 1
    (`Handlers/MiscHandler.cpp:1580-1585` [M]).
- [ ] **Step 3: Implement** the parsers and builders.
- [ ] **Step 4: Failing catalog and route tests.**
  - `loadTaxiCatalog(travelTaxiDbc(...))` gives nodes with id, map,
    x, y, z and name, and edges with from, to and price; it rejects with
    `missing_taxi_data` when the source has no `TaxiNodes.dbc`.
  - `taxiRoute(catalog, known, from, to)` returns the cheapest chain of
    direct edges over known nodes with the summed list price; it returns
    `undefined` when a hop crosses an unknown node or no chain exists;
    one hop gives a two-node route. The server looks up only a direct edge
    per hop (`Globals/ObjectMgr.cpp:7183-7203` [M]).
- [ ] **Step 5: Implement** `catalog.ts` (lazy, one promise per session,
  as `runtime-data.ts:28-29` does for spells [M]) and `route.ts` (a pure
  Dijkstra over the edge list).
- [ ] **Step 6: Failing store tests** over `areaRig("travel")` with
  `init.register` passing the legacy quest handlers (the real owner of
  `SMSG_SHOWTAXINODES`, contract D24):
  - an injected `SMSG_SHOWTAXINODES` still opens the quest store's
    `"taxi"` window (legacy behaviour kept) and sets `known`,
    `masters[npc].node` and emits `taxi_map` with `knownCount`;
  - `known` is `undefined` until the first map (AzerothCore sends the
    mask only there, `Handlers/TaxiHandler.cpp:102` [M]);
  - `SMSG_TAXINODE_STATUS` sets `masters[npc].known` and emits
    `taxi_node_status`;
  - `SMSG_NEW_TAXI_PATH` (empty body, `Handlers/TaxiHandler.cpp:138-139`
    [M]) sets `learnedAt` and emits `taxi_node_learned` with the npc of
    the pending map request;
  - a self entity update whose `PLAYER_FLAGS` gains `0x20000` sets
    `benchmark: true` and emits `benchmark` (contract issue 5).
- [ ] **Step 7: Implement** the taxi part of `TravelState`
  (`known`, `masters`, `learnedAt`, `request`, `benchmark`) and
  `register` (`wire.on` for the two server opcodes, `wire.peek` for
  `SMSG_SHOWTAXINODES`). The runtime subscribes to `listen("entity", ...)`
  for self updates and passes them to the store.
- [ ] **Step 8: Failing runtime tests.**
  - `queryTaxiStatus(npc)` sends `CMSG_TAXINODE_STATUS_QUERY` and settles
    `{ status: "ok", known }` on the status for that npc; 3 s of silence
    gives `no_answer` (AzerothCore is silent for a non-flight-master,
    `Handlers/TaxiHandler.cpp:35-51` [M]).
  - `openTaxiMap(npc)` sends `CMSG_TAXIQUERYAVAILABLENODES` and settles
    `{ status: "ok", kind: "map" }` on a map or `kind: "learned"` on
    `SMSG_NEW_TAXI_PATH`; `openTaxiMap(npc, { enable: true })` sends
    `CMSG_ENABLETAXI` instead; 3 s of silence gives `no_answer`
    (`:66-71`).
  - `setTaxiBenchmark(on)` sends the mode and settles on the `benchmark`
    event; 3 s gives `no_answer`.
  - `destinations(from)` and `planFlight(from, destination)` send
    nothing: they read the catalog and `known`, match a destination by
    case-insensitive name part, and refuse with `unknown_node`,
    `ambiguous` (listing the matches), `not_known`, `no_route` or
    `missing_taxi_data`. They let the harness route without importing
    area internals.
  - One pending request per kind: a second one refuses with `busy`.
- [ ] **Step 9: Implement** the acts. `eventTypes` gains the five new
  types. Run the tests, `mise typecheck core`, `mise protocol:coverage`.
- [ ] **Step 10: Probe flow** `travel-taxi.ts`: find the nearest flight
  master (`npc-roles.ts:39`, flag `0x2000` [M]); `queryTaxiStatus`;
  `openTaxiMap` (expects `learned` at an unknown node); `openTaxiMap`
  again (expects `map`); `openTaxiMap` with `enable`; `setTaxiBenchmark`
  on, then off. It prints the catalog name and position of the master's
  node.
- [ ] **Step 11: Live proof.** `soap create ghostlands20` (a Blood Elf,
  node 82 known from creation, `Entities/Player/PlayerTaxi.cpp:39-65`
  [M]). Place it next to the Tranquillien flight master with the
  `position` endpoint (coordinates from the catalog node; the worker
  confirms the node id and a direct edge to node 82 in the catalog, design
  5.6 risk). Run `mise protocol:probe <ACCOUNT> --flow login --expect SMSG_TAXINODE_STATUS`
  (sent at login for each visible friendly flight master,
  `Entities/Player/Player.cpp:11921,10699-10720` [M]), then
  `mise protocol:probe <ACCOUNT> --flow travel-taxi --expect SMSG_NEW_TAXI_PATH --expect SMSG_SHOWTAXINODES --expect SMSG_TAXINODE_STATUS`.
  The benchmark send is live when the flag bit shows in the self update.
  Keep the account for travel-3 only if both tasks run in the same unit
  session; otherwise delete it.
- [ ] **Step 12: Doc.** Proof rows; wire notes (the mask layout; wowm's
  `u32[-]` reads to the end while AzerothCore always writes 14 words,
  which agree); `mise protocol:cite-check`; `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_TAXINODE_STATUS` | live | `login` flow near a flight master, and the status query |
| `CMSG_TAXINODE_STATUS_QUERY` | live | `travel-taxi` flow; the status reply follows |
| `CMSG_TAXIQUERYAVAILABLENODES` | live | `travel-taxi` flow; `SMSG_NEW_TAXI_PATH`, then `SMSG_SHOWTAXINODES` |
| `CMSG_ENABLETAXI` | live | `travel-taxi` flow; `SMSG_SHOWTAXINODES` follows |
| `SMSG_NEW_TAXI_PATH` | live | first query at an unknown node |
| `CMSG_SET_TAXI_BENCHMARK_MODE` | live | `PLAYER_FLAGS` bit `0x20000` in the self update |

**Commit:**

```
feat: Learn flight paths and read the taxi map

The character now learns flight nodes, knows which nodes it has and can
plan a route over them, which taking a flight needs.
```

---

## Task travel-3: Take a flight

**Phase:** 3 (wave 3). **codeArea:** `travel`. **Size:** M.

**Files:**
- Edit: `protocol.ts`, `protocol.test.ts`, `store.ts`, `store.test.ts`,
  `runtime.ts`, `runtime.test.ts`, `area.ts`, `opcodes.ts` under
  `packages/core/src/wow/areas/travel/`
- Edit: `packages/core/test-support/areas/travel.ts`
- Create: `packages/devtools/src/probe-flows/travel-fly.ts`
- Edit: `docs/areas/travel.md`; regenerate `docs/protocol-coverage/travel.md`

**Depends on:** `travel-2`.

**Opcodes:** `CMSG_ACTIVATETAXI`, `CMSG_ACTIVATETAXIEXPRESS`,
`SMSG_ACTIVATETAXIREPLY`.

**Steps:**

- [ ] **Step 1: Builder** `travelActivateTaxiReplyBody(code)` (one `u32`:
  `Handlers/TaxiHandler.cpp:300-305` [M]).
- [ ] **Step 2: Failing protocol tests.**
  - `parseActivateTaxiReply` maps each of the 13 codes to its name
    (`enum ActivateTaxiReply`, `src/server/shared/SharedDefines.h:3849-3864`
    [M]); an unknown code gives `unknown_<n>`.
  - `buildActivateTaxi(npc, from, to)` writes guid, `u32`, `u32`
    (`Handlers/TaxiHandler.cpp:272-278` [M]).
  - `buildActivateTaxiExpress(npc, nodes)` writes guid, `u32` count and
    the nodes (`Handlers/TaxiHandler.cpp:165-194` [M]); the 3.3.5 form has
    no `total_cost` (wowm `movement/cmsg/cmsg_activatetaxiexpress.wowm:11-17`).
- [ ] **Step 3: Implement** them.
- [ ] **Step 4: Failing store tests.** `SMSG_ACTIVATETAXIREPLY` sets
  `lastReply` and emits `taxi_reply`. `flight` moves `idle` →
  `requested` on an activate, → `flying` on `ERR_TAXIOK` or on self
  `UNIT_FLAG_TAXI_FLIGHT` (`protocol/entity-fields.ts:91` [M]) with
  `flight_started`, and → `landed` when the flag clears with
  `flight_landed` (position from the self entity). A login with the flag
  already set enters `flying` (AzerothCore resumes a saved flight,
  `Handlers/CharacterHandler.cpp:1101` [M, area design]).
- [ ] **Step 5: Implement** the flight part of the store. The flag comes
  from the same `listen("entity", ...)` self subscription as travel-2.
- [ ] **Step 6: Failing runtime tests** for `activateTaxi(npc, route)`:
  - a two-node route sends `CMSG_ACTIVATETAXI`; a longer one sends
    `CMSG_ACTIVATETAXIEXPRESS`;
  - `ERR_TAXIOK` settles `ok` with the route and the list price; another
    code settles `refused(<short name>)`: `not_enough_money`,
    `not_visited`, `too_far`, `busy`, `mounted`, `shapeshifted`,
    `no_such_path`, `same_node`, `not_standing`, `moving`;
  - 5 s of silence settles `no_answer` (silent paths:
    `Entities/Player/Player.cpp:10424-10425,10510-10516`,
    `Handlers/TaxiHandler.cpp:196-197` [M, area design]); a self teleport
    with no reply inside those 5 s settles `ok` in case
    `InstantFlightPaths` is on (design 5.6 decision);
  - refused before any send: route shorter than 2, a node not in `known`
    when `known` is defined, a hop that is not a catalog edge, a flight
    already `requested` or `flying`.
- [ ] **Step 7: Implement** the act; `eventTypes` gains `taxi_reply`,
  `flight_started`, `flight_landed`. Checks as before.
- [ ] **Step 8: Probe flow** `travel-fly.ts`: at the flight master, send
  an activate with a node the character does not know (expects
  `not_visited`); plan a route with `planFlight(from, <arg to>)`; send it
  with `--arg express=1` forcing the express form for a one-hop route;
  wait for `flight_landed` (up to `--wait`); log out without moving
  (contract issue 7).
- [ ] **Step 9: Live proof.** The ghostlands20 character of travel-2
  (or a new one taken through travel-2's flow first, so Tranquillien is
  known). `mise protocol:probe <ACCOUNT> --flow travel-fly --arg to=Silvermoon --expect SMSG_ACTIVATETAXIREPLY --wait 300`,
  once plain and once with `express=1`. Record whether a self stop
  `SMSG_MONSTER_MOVE` arrived at landing (the tap shows it; design 5.6
  risk; travel-4 needs the answer) and whether a teleport replaced the
  flight (`InstantFlightPaths`). Check `soap truth <ACCOUNT>` money fell.
  If no route with two known nodes exists, the express form still has a
  live reply: an express list with an unknown node gives
  `ERR_TAXINOTVISITED` (`Handlers/TaxiHandler.cpp:186-191` [M]).
- [ ] **Step 10: Doc.** Proof rows; a wire note that a hop with no direct
  path gets no reply at all; `mise protocol:cite-check`; `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_ACTIVATETAXI` | live | `travel-fly` flow; `ERR_TAXIOK` and a money drop |
| `CMSG_ACTIVATETAXIEXPRESS` | live | `travel-fly` with `express=1`; `ERR_TAXIOK`, or `ERR_TAXINOTVISITED` for an unknown node |
| `SMSG_ACTIVATETAXIREPLY` | live | both flows; `ERR_TAXIOK` and `ERR_TAXINOTVISITED` |

**Commit:**

```
feat: Take flights between known nodes

The character can now pay for and take a flight over one or more direct
taxi edges, with a clear reason when the server refuses.
```

---

## Task travel-4: Self flight spline in control

**Phase:** 3 (wave 3, the control slot). **codeArea:** `travel` (with the
control lease). **Size:** M.

**Files** (all core, under `packages/core/src/wow/`; lease per contract
issue 3):
- Edit (lease): `gameplay-handlers.ts` (the `SMSG_MONSTER_MOVE` block,
  `:158-167` [M]: a self move also goes to `self.receive`)
- Edit (lease): `self-store.ts` (`SelfEvent` gains
  `{ type: "spline"; move: MonsterMove }`, `self-store.ts:15-27` [M])
- Edit (lease): `control-feed.ts` (one `case "spline"`)
- Edit (lease): `control.ts` (`observeSelfSpline` delegation; the
  `in_flight` reason in `ControlEvent`)
- Edit (lease): `control-sync.ts` (`blockReason()` returns `"in_flight"`
  while self has `UNIT_FLAG_TAXI_FLIGHT`, `:96-101,306-313` [M])
- Create (lease): `control-flight.ts` and `control-flight.test.ts` (the
  self spline, the landing rule, the spline-done send)
- Edit (lease): `movement-handlers.ts` only if the create-block spline of
  a login mid-flight enters there (the builder checks
  `world-handlers-entity.ts:102-116` [M] first; that file is the
  `remote-motion` lease, so if the entry point is there the task stops
  `blocked`)
- Edit: `packages/core/src/wow/areas/travel/protocol.ts` and test
  (`buildMoveSplineDone`), `opcodes.ts`
- Edit: `packages/core/test-support/areas/travel.ts`
- Create: `packages/devtools/src/probe-flows/travel-land.ts`
- Edit: `docs/areas/travel.md`; regenerate `docs/protocol-coverage/travel.md`

**Depends on:** `travel-3`; the control lease handed over by the
coordinator (after `selfstate` 1-5 and 11 land, which hold it in wave 1);
`R0` for the post-item-6 control code.

**Opcodes:** `CMSG_MOVE_SPLINE_DONE`.

**Steps:**

- [ ] **Step 1: Builder and test.** `buildMoveSplineDone(guid, info, splineId)`
  in `areas/travel/protocol.ts` is `buildMoveMessage(guid, info)`
  (`protocol/movement.ts:219` [M]) plus one `u32`. AzerothCore reads a
  packed guid, the movement info, then the `u32`
  (`Handlers/TaxiHandler.cpp:208-214` [M]); wowm
  `movement/cmsg/cmsg_move_spline_done.wowm:9-14` omits the guid, and
  AzerothCore wins. The area file never names `GameOpcode.CMSG_MOVE_`
  (contract 1.12); control sends it.
- [ ] **Step 2: Test fixture.** `travelSelfFlightSplineBody({ guid, points, durationMs, splineId })`:
  a `SMSG_MONSTER_MOVE` with the `FLYING` spline flag and a non-cyclic
  catmull-rom path, as `FlightPathMovementGenerator::DoReset` launches it
  (`Movement/MovementGenerators/WaypointMovementGenerator.cpp:689-718`,
  `Movement/Spline/MovementPacketBuilder.cpp:148-156` [M, area design]),
  and a stop variant (`Entities/Unit/Unit.cpp:12597-12614`).
- [ ] **Step 3: Failing control tests** in `control-flight.test.ts`, with
  the control fixtures (`packages/core/test-support/control-fixtures.ts:52`
  `setup` [M]):
  - a self flying spline aborts local motion and, with `TAXI_FLIGHT` set,
    emits `control_changed` with `in_flight`; any move request refuses
    with `in_flight`, not `disable_move`;
  - the flag clearing with no stop spline sets the server pose to the last
    spline point and emits `server_correction` with `flight_landed`;
  - a self stop spline during the flight sets the server pose to the stop
    point;
  - the first move after landing starts from the landing point, not the
    take-off point (the bug of design 5.6 "Why": the server applies the
    next client move as sent, `Handlers/MovementHandler.cpp:620-622`);
  - when the spline duration has elapsed and `TAXI_FLIGHT` is still set,
    control sends exactly one `CMSG_MOVE_SPLINE_DONE` with the final point
    and the spline id; with the flag already cleared it sends none
    (`Handlers/TaxiHandler.cpp:216-270` [M, area design]);
  - a flight keeps the control owner; a claim during the flight refuses
    moves with `in_flight`;
  - a multi-map flight: `SMSG_TRANSFER_PENDING` and `SMSG_NEW_WORLD` after
    the spline-done go through the existing transfer path, and a new self
    spline on the new map resumes `in_flight`.
  Run `mise test packages/core/src/wow/control-flight.test.ts`; it fails.
- [ ] **Step 4: Implement** `control-flight.ts` and the edits above. Run
  every control test file (`mise test packages/core/src/wow/control`) and
  the travel tests; the store's `flying`/`landed` phases now agree with
  the control events.
- [ ] **Step 5: Probe flow** `travel-land.ts`: run the travel-3 flight,
  then after `flight_landed` walk 10 yd north with the control handle, then
  log out.
- [ ] **Step 6: Live proof.** A ghostlands20 character that knows
  Tranquillien and Silvermoon (through the travel-2 flow). Run
  `mise protocol:probe <ACCOUNT> --flow travel-land --arg to=Silvermoon --wait 300`,
  then `soap truth <ACCOUNT>`: the position is about 10 yd north of the
  landing point on map 530, not near Tranquillien. The tap shows the
  `CMSG_MOVE_SPLINE_DONE` send and no disconnect, and records whether a
  stop spline arrived. A multi-map flight is live only if the catalog
  shows one reachable from the preset's zones; otherwise the map-switch
  path is covered by the rig test of step 3, built from
  `Handlers/TaxiHandler.cpp:223-243`, and marked "not seen live".
- [ ] **Step 7: Gates.** Control changes run the regression gates of
  contract 3.6 (`t1-walk-to-npc`, `t7-halt-resume`, `t3-ghostlands-kill`
  against the R0 baseline) and `mise ci:checks`. The reviewer knows the
  item 6 control code (design 3.12).
- [ ] **Step 8: Doc.** Proof row; wire note on the `CMSG_MOVE_SPLINE_DONE`
  guid; "Left out": the in-flight predicted pose stays unknown
  (`motion-store.ts:86-89` [M] cannot evaluate a non-cyclic flying
  catmull-rom path; the end point is enough for correctness [I]).

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_MOVE_SPLINE_DONE` | live when the tap shows the send and the flight ends at the destination; the taxi branch is `Handlers/TaxiHandler.cpp:216-257`: it returns while a destination remains and runs `CleanupAfterTaxiFlight` when one node is left (`:245-251`). At a single-map flight's end the server already finalizes the flight (`Movement/MovementGenerators/WaypointMovementGenerator.cpp:665-687`), so the send has no visible effect; the row is then `builder` with "sent live, effect not seen" (contract 0.6) | `travel-land` flow and `soap truth` |

**Commit:**

```
fix: Keep the landing point after a flight

Control now follows the server's flight spline, so the first move after
landing starts where the character landed instead of pulling it back to
the take-off point.
```

---

## Task travel-6: Fly verb and eval

**Phase:** 3 (wave 3). **codeArea:** `travel`. **Size:** M.

**Files:**
- Edit (lease): `packages/harness/src/tools/travel.ts` (`parseGoal`: `to`
  starting `fly `) and a new sibling
  `packages/harness/src/tools/travel-fly.ts` with its test
- Edit (lease): `packages/harness/src/tools/interact.ts` or its talk step
  (at a flight master the talk result lists known destinations with list
  prices and a `travel` next call)
- Edit (lease): `packages/harness/src/tools/look.ts` (the `flight_master`
  kind) and `look.test.ts`
- Edit (lease, contract issue 4): `packages/harness/src/tools/params.ts`
  (`LOOK_KINDS` gains `flight_master`; `travelParams` `to` text names
  `fly <destination>`)
- Edit: `packages/harness/src/areas/travel/area.ts` and test (flight
  rows; `worldActs` gains `openTaxiMap` and `activateTaxi`)
- Create: `packages/harness/src/grader/scenarios/t8-travel-fly.json`
- Shared: `ROUND_1`, `docs/capabilities.md` (the row, and `flight paths`
  removed from the sentence at `docs/capabilities.md:38` [M], contract
  3.4), `docs/evals.md` (the travel row gains the id)
- Edit: `docs/areas/travel.md` (capabilities row), `docs/harness.md` (the
  `travel` tool row)

**Depends on:** `travel-2`, `travel-3`, `travel-4`.

**Opcodes:** none of its own (contract issue 6).

**Steps:**

- [ ] **Step 1: Harness rules test and implementation.** `taxi_node_learned`
  gives `node_learned` ("New flight path: <node>."); `flight_started`
  gives `flight_started` with the fare and duration; `flight_landed`
  gives a `flight_landed` wake row; a `taxi_reply` error gives
  `flight_refused` with the short name.
- [ ] **Step 2: `travel to:"fly <destination>"` test** (`travel-fly.test.ts`,
  mock game with area events and `jest.spyOn` on the acts):
  - with a flight master in view, the run approaches it, calls
    `openTaxiMap`; on `learned` it calls it again; it calls
    `planFlight(currentNode, destination)` and `activateTaxi` with the
    route; it completes on `flight_landed` and reports the landing node;
  - it yields at 120 s like other runs (`runs/wait.ts:4` [M]) and a later
    call reports the flight's progress;
  - with no flight master in view, it walks to the nearest known node's
    catalog position on this map (`destinations` data) first;
  - each `planFlight` refusal and each `activateTaxi` refusal gives one
    short refusal; `ambiguous` lists the matches;
  - `expectSendKind(travelTool)` passes.
- [ ] **Step 3: Implement** `travel-fly.ts` and the `parseGoal` branch.
  The run holds its claim from the walk until landing (design 5.6); a
  human who takes control during the flight gets `in_flight` refusals.
- [ ] **Step 4: Talk and look.** `interact do:"talk"` at a flight master
  lists destinations from `destinations(node)`; `look find:"flight_master"`
  filters the `flight_master` npc role. Tests first, then code.
- [ ] **Step 5: Scenario** `t8-travel-fly.json`: preset `ghostlands20`;
  setup `position` within 20 yd of the Tranquillien flight master (catalog
  coordinates confirmed in travel-2); task "Fly to Silvermoon City, then
  walk ten yards north."; checks: truth `point` about 10 yd north of the
  Silvermoon landing point on map 530, within 40 yd (catches the
  snap-back); truth money delta below 0 and not below minus the list
  price; game log `travel/flight_started` and `travel/flight_landed`.
  `paneMinutes` 12 and `budget.minutes` 10 to start [I: flight time is
  not measured]; tier 8. Run `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 6: Eval run.** `mise eval run t8-travel-fly --round <n>` (Muse
  babysitter, R10); record the verdict. Adjust the budget once from the
  first run's flight time.
- [ ] **Step 7: Docs and gates.** One scenario commit (contract 3.2). The
  capabilities sentence loses `flight paths` only if the scenario passed.
  Run the regression gates of contract 3.6 and `mise ci:checks`.

**Proof:** eval. `t8-travel-fly` verdict.

**Commits** (two):

```
feat: Fly to a destination with travel

The agent can now say travel to fly Silvermoon City, and the run walks
to the flight master, pays, flies and reports the landing.
```

```
test: Add the t8-travel-fly eval

The scenario proves a paid flight and a correct pose after landing
against the live server.
```

---

## Dead opcodes

| Opcode | Reason |
|---|---|
| `SMSG_FLIGHT_SPLINE_SYNC` 0x388 | AzerothCore registers it as `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:1035` [M]) and no code writes it: a grep over `src/` finds only the registration and the enum line (area design, measured). travel-1 puts it in `TRAVEL_OPCODES.dead` with a `dead` proof row. |

Not in the area rows and not in Peon's `GameOpcode`, so no action:
`CMSG_TAXICLEARALLNODES`, `CMSG_TAXIENABLEALLNODES`, `CMSG_TAXISHOWNODES`,
`CMSG_TAXICLEARNODE` and `CMSG_TAXIENABLENODE` are `STATUS_NEVER` with a
null handler (`Server/Protocol/Opcodes.cpp:553-555,708-709`, area design).

## Opcode index

| Opcode | Task |
|---|---|
| `SMSG_BINDPOINTUPDATE` | travel-1 |
| `SMSG_PLAYERBOUND` | travel-1 |
| `SMSG_BINDER_CONFIRM` | travel-1 |
| `CMSG_BINDER_ACTIVATE` | travel-1 |
| `CMSG_TAXINODE_STATUS_QUERY` | travel-2 |
| `SMSG_TAXINODE_STATUS` | travel-2 |
| `CMSG_TAXIQUERYAVAILABLENODES` | travel-2 |
| `CMSG_ENABLETAXI` | travel-2 |
| `SMSG_NEW_TAXI_PATH` | travel-2 |
| `CMSG_SET_TAXI_BENCHMARK_MODE` | travel-2 |
| `CMSG_ACTIVATETAXI` | travel-3 |
| `CMSG_ACTIVATETAXIEXPRESS` | travel-3 |
| `SMSG_ACTIVATETAXIREPLY` | travel-3 |
| `CMSG_MOVE_SPLINE_DONE` | travel-4 |
| `SMSG_FLIGHT_SPLINE_SYNC` | dead (travel-1 records it) |
| `SMSG_SHOWTAXINODES` (handled, body gap) | travel-2, by `peek`; stays in core coverage |

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules each open issue, lease request and decision that a
wave-1 task of this unit (travel-1, travel-5) meets. Each ruling is **not
yet ruled by the maintainer**. A ruling that says "amends" changes the
named contract text; the coordinator applies that text in one
`COORD-<n>` commit, and until then the builder follows the ruling.

Not ruled here: contract issues 1, 2, 3, 5 and 7 of this file. Only the
wave-3 tasks (travel-2, travel-3, travel-4, travel-6) meet them, so the
`SEED-3` ruling pass rules them.

| Id | Issue (source) | Ruling | Status |
|---|---|---|---|
| SR1-travel-1 | Contract issue 4: "travel-5 and travel-6 need the `lookParams`, `travelParams` and `interactParams` blocks of that file under the same lease as the three tool modules." | Closed by the plan fix-up: contract 2.7 "Leases added by the plan fix-up" names travel for harness `tools/params.ts`, and the plan "Leases" row queues it objects-7 → travel-5 → spells-12a. The lease covers only the `LOOK_KINDS`, `lookParams`, `interactParams` and `travelParams` blocks. If the `SEED-1` commit splits `tools/params.ts` by tool or `tools/look.ts` by view, the lease covers the sibling file of the `look`, `interact` and `travel` tools instead (contract 2.7, last paragraph). No amendment | accepted by the maintainer (P2-5) |
| SR1-travel-2 | travel-5 "Files": "Edit (lease)" on `tools/interact.ts`, `tools/travel.ts`, `tools/look.ts` and `tools/params.ts`; the plan index gives travel-5 `leaseDeps: []` although each of the four "Leases" rows has an earlier holder | travel-5 starts only when the plan section "Lease handovers" records all four handovers to it: `tools/interact.ts` from quests-6 (after objects-7), `tools/look.ts` from quests-2 (after threat-3b and objects-7), `tools/params.ts` and `tools/travel.ts` from objects-7. Its only listed dependency, travel-1, is not enough. When travel-5 lands, the coordinator hands `tools/interact.ts` to economy-2, `tools/look.ts` to self-state-11b, `tools/params.ts` to spells-12a and `tools/travel.ts` to travel-6. The queue order of the plan stands; no reorder | accepted by the maintainer (P2-5) |
| SR1-travel-3 | travel-5 steps 3-6: the `bind` step and the `hearth` goal need new members in the `After` types of `interact` and `travel` (`contract/details.ts:64-72` `TravelGoalView`, `TravelAfter`; `:136-180` `InteractAction`, `InteractAfter` [M]) | Covered by the D13 rider of the `interact` and `travel` leases (contract 2.7): travel-5 edits only those four type blocks in `contract/details.ts` and the views the two tools read in `contract/views.ts`. It does not take the `contract/details.ts` or `contract/views.ts` queue of the plan "Leases" table, and it edits nothing else in either file. No amendment | accepted by the maintainer (P2-5) |
| SR1-travel-4 | travel-5 "Files": "`docs/harness.md` (the `interact` and `travel` rows of the tool table, one clause each)"; contract 2.6 allows only "append one row" in that table, for a new tool | Allowed as a rider of the tool-module lease: the holder of the lease on an existing tool module may add one clause to that tool's one row in the `docs/harness.md` tool table (`docs/harness.md:126,129` [M]). travel-5 adds the `bind` clause to the `interact` row and the `hearth` clause to the `travel` row. Amends contract 2.6 (the `docs/harness.md` row) | accepted by the maintainer (P2-5) |
| SR1-travel-5 | Contract issue 6: "travel-5 and travel-6 are verb and eval tasks ... they hold no opcode of their own; the rule '1-8 opcodes per task' does not fit them" | Stands. Contract 0.6 already makes an eval scenario and a `docs/capabilities.md` row the proof where an area adds a verb, and contract 0.10 keeps the task ids. travel-5's proof is its two eval verdicts. No amendment | accepted by the maintainer (P2-5) |
| SR1-travel-6 | Design 5.6 "Decisions": "bind directly without the gossip confirm"; travel-1 step 7: "The act sends no gossip first (N30)" | Stands. `bindActivate` sends `CMSG_BINDER_ACTIVATE` only. The `--arg gossip=1` branch of the `travel-bind` probe flow exists only to show `SMSG_BINDER_CONFIRM` live, and no act or verb uses it | accepted by the maintainer (P2-5) |
| SR1-travel-7 | travel-1 step 6: the `SMSG_TRAINER_BUY_SUCCEEDED` test "passes before and after; it pins the cross-area rule and is kept only if the reviewer agrees it tests behaviour" | The coordinator decides it now, not the reviewer. The test stays in `runtime.test.ts` only in this form: the rig registers the legacy trainer handlers through `init.register` (D24), a `train` request for another spell or none is pending, and the test asserts that the trainer store records no purchase after the injected packet. A test in which no trainer handler receives the packet proves nothing, so if the rig cannot host the legacy trainer handler without an edit outside travel-1's files, the test is dropped and `docs/areas/travel.md` "Wire notes" states the rule with its citations (`Handlers/NPCHandler.cpp:321-331`, `trainer-store.ts:106-112`) | accepted by the maintainer (P2-5) |
| SR1-travel-8 | travel-1 step 5: "Put `SMSG_FLIGHT_SPLINE_SYNC` in `dead`"; contract 1.5 and the plan "Dead opcodes" say the seed writes the dead rows and the unit's first task writes the `dead` proof row | The contract wins. `SEED-1` writes `SMSG_FLIGHT_SPLINE_SYNC` into `TRAVEL_OPCODES.dead` and moves `[SMSG_BINDPOINTUPDATE, "Bind point"]` from `STUBS` (`protocol/stubs.ts:53` [M]) into `TRAVEL_OPCODES.stubs`. travel-1 checks that both are there, deletes the stub line, and writes the `dead` proof row with the evidence of section "Dead opcodes". If the seed did not write the dead row, travel-1 writes it (its own file) and reports the deviation | accepted by the maintainer (P2-5) |
| SR1-travel-9 | travel-5 "Depends on": "Soft: `T-8` (the truth `hearth` pick). If T-8 has landed, `t8-travel-bind-inn` adds a truth check on it; if not, the scenario uses log evidence only." | Stands as written. At step 8 the builder reads `packages/harness/src/grader/truth.ts`: if `Truth` has a `hearth` field and `hearth` is a truth pick in `docs/evals.md`, the scenario adds the check; otherwise it uses the `travel/home_set` game-log check only. At plan time only the fixture in `truth.test.ts:28` names `hearth` [M], so the pick has not landed. The builder reports which branch it took | accepted by the maintainer (P2-5) |
| SR1-travel-10 | travel-5 step 8: "setup `hearth` (to set a known home; its body could not be determined: the worker reads the realm service's refusal of `{}` on a throwaway account first)"; step 9: "`--round <n>`" | The builder sends `{}` to the `hearth` endpoint (`factory/src/realm-service.ts:13` [M]) once, on its own throwaway account, and builds the body from the refusal. If the refusal does not name the body, the scenario drops the `hearth` setup step and uses the preset's own home, which the builder reads from the login `bind_point` event of a throwaway `elwynn10` run, as step 8 does for `eversong10`; the `position` step then places the character at least 200 yd from that home on map 0. The eval runs of step 9 use `--round 11` (contract 3.6: 11 for a phase-A task's own runs) and `--replica <k>` for a second run | accepted by the maintainer (P2-5) |
| SR1-travel-11 | travel-5 step 5: "refuses ... while control reports `in_flight`"; "waits for a near teleport or `SMSG_NEW_WORLD` through the existing control events" | `in_flight` does not exist until travel-4. travel-5 compares `getControlState().blockedReason` (`control.ts:52` [M], a `string`) with `"in_flight"`, and its test sets that value on the mock game. The arrival is the existing `server_correction` event with reason `teleport` or `near_teleport` (`control-sync.ts:171-184` [M]), or the far-teleport path that starts with `control_changed` reason `teleporting` (`control-sync.ts:186-190` [M]). travel-5 edits no core file; if these events cannot show the arrival, it stops `blocked` and names the file and the member | accepted by the maintainer (P2-5) |

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are travel-2, travel-3, travel-4, travel-6 (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-travel-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-travel-1 | Contract issue 1 (taxi DBCs absent); travel-2 step 11, travel-3 step 9, travel-4 step 6, travel-6 step 5. `ls /home/deity/code/peon/tmp/gameplay-data/raw` shows no `TaxiNodes.dbc` or `TaxiPath.dbc`; `taxinodes_dbc.sql` and `taxipath_dbc.sql` under `data/sql/base/db_world/` have no rows. `rules.md:49-51` bars builders from writing into `spell_data_dir`. | superseded by the coordinator decision (DBCs staged): `TaxiNodes.dbc`, `TaxiPath.dbc` and `TaxiPathNode.dbc` are staged by the coordinator (E4 done, `dbc-staging.md`), so travel-2's live step waits for nothing; a builder that still finds them absent stops `blocked`, `blockedOn: missing-dbc`. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): **Coordinator stages both files before travel-2's live step** (SEED3-3), by the client-data extraction objects-4 and objects-10 used for `Lock.dbc` and `AreaTrigger.dbc` (`part2/followups.md:5,8`; the extraction output for the build worktree is under `tmp/dbc-extract/out`). Unit tests do not need them (`travelTaxiDbc` + `packDbc`, `test-support/dbc.ts:3,33`). A builder that reaches a live step and finds them absent stops `blocked`, `blockedOn: missing-dbc`, naming the two files. P2-8 (degraded ids) does not apply: a route needs the edge list, so without the files every route act and the `fly` verb refuse `missing_taxi_data` and nothing is guessed. | coordinator ruling (P2-17) |
| SR3-travel-2 | Contract issue 2 and travel-2 step 6, first bullet: `SMSG_SHOWTAXINODES` is read by `wire.peek`; the test "registers the legacy quest handlers through `init.register`". The legacy handler is at `core: gameplay-handlers.ts:211-214` (plan: `:206-209`). `registerQuestHandlers` takes `(conn: WorldConn, stores)` (`:176-179`), while `areaRig`'s `register` hands `(dispatch, stores)` (`test-support/area-rig.ts:38`); `wire.peek` entries are attached after every `on` (`areas/compose.ts:108-118`). | `SMSG_SHOWTAXINODES` goes in `TRAVEL_OPCODES.uses` (unit-owned edit), legacy handler untouched. The test cannot call `registerQuestHandlers`; it registers, through `init.register`, a stub that reads `u32` then `u64` like the legacy handler and records both, dispatches one full body and asserts (a) the stub saw the whole body and (b) the store got `known`, `masters[npc].node` and `taxi_map`. The assertion "the quest store's taxi window opens" is dropped: it would test wiring (SR1-travel-7 precedent). | coordinator ruling (P2-17) |
| SR3-travel-3 | Contract issue 3 and travel-4 files: leases on `gameplay-handlers.ts`, `self-store.ts`, `control-feed.ts`, `control.ts`, `control-sync.ts`, new `control-flight.ts`, and "`movement-handlers.ts` only if the create-block spline of a login mid-flight enters there". The create-block spline of any entity enters `world-handlers-entity.ts:108` and `:182` (`motion.observe(guid, position, entry.spline)`), not `movement-handlers.ts`; the self `observed` events there already carry `unitFlags` (`:118-126`, `:148-151`). | travel-4 holds `gameplay-handlers.ts` (free: items-3b landed), `self-store.ts`, `control-feed.ts`, `control.ts`, `control-sync.ts` and creates `control-flight.ts` and `control-flight.test.ts`. It does **not** hold `movement-handlers.ts` or `world-handlers-entity.ts`: a login mid-flight is recognised from the `observed` event's `unitFlags` (`TAXI_FLIGHT`), and AzerothCore resumes a saved flight with a normal `SMSG_MONSTER_MOVE`, which takes the spline path. "Left out" in `docs/areas/travel.md`: the create-block spline of a login mid-flight is not adopted. Owner row: drop `movement-handlers.ts`; the `movement-handlers.ts` queue is vehicles-7 only. No `blocked` for this. | coordinator ruling (P2-17) |
| SR3-travel-4 | Contract issue 4 (`tools/params.ts`) and travel-6 files. After SEED-1 the blocks are in siblings: `tools/params-travel.ts` (22 lines), `tools/params-look.ts` (44), `tools/params-interact.ts` (46); `tools/params.ts` is a 17-line facade. `look.ts` is split into `look-find.ts` (115), `look-rows.ts` (118), `look-self.ts` (112). | Closed by the SEED-1 lease lines. travel-6 edits `params-travel.ts` (the `to` text), `params-look.ts` (`LOOK_KINDS`, `:3-15`), `params-interact.ts` only if the talk output needs a parameter (it does not), and `look-find.ts`; it does not edit `tools/params.ts`. Owner-row corrections in section D. | coordinator ruling (P2-17) |
| SR3-travel-5 | Contract issue 5 (`PLAYER_FLAGS` from an area): travel-2 must read self `PLAYER_FLAGS` bit `0x20000`. | No `COORD` allow-list edit. The runtime already gets the `entity` event; it reads `event.entity.rawFields.get(PLAYER_FIELDS.FLAGS.offset)` with `Entity` as a type-only import and `PLAYER_FIELDS` from `#wow/protocol/update-fields` (value import allowed, `areas/registry.test.ts:47-56`), as `areas/selfstate/fields.ts:13-36` does; `selfFields` itself cannot be imported (area to area). Bit `0x00020000` is `PLAYER_FLAGS_TAXI_BENCHMARK` (`Entities/Player/Player.h:476`). AzerothCore also clears it at the flight end (`WaypointMovementGenerator.cpp:684`), so the store emits `benchmark` with `on: false` at every landing; `setTaxiBenchmark(false)` must accept an already-false state. | coordinator ruling (P2-17) |
| SR3-travel-6 | Contract issue 7 (travel-3 before travel-4; travel-3 leaves the landing bug in the wave branch). | Confirmed as the plan reads it. travel-3's act has no harness caller until travel-6 (`worldActs` gains it there) and `travel-fly` logs out at the landing point without a move. No `landing_unfixed` refusal is built. | coordinator ruling (P2-17) |
| SR3-travel-7 | travel-4 step 4 cites `blockReason()` at `control-sync.ts:96-101,306-313`; it is at `:132-138` and `setUnitFlags` at `:408-414`. AzerothCore sets `DISABLE_MOVE` together with `TAXI_FLIGHT` (`WaypointMovementGenerator.cpp:704`), and `UNIT_BLOCK_FLAGS` contains `DISABLE_MOVE` (`control-sync.ts:33-37`); today a flight emits `control_changed` `disable_move` and stops motion (`:412-413`). | `MovementSync` gains an `inFlight` field beside `unitBlocked`. `setUnitFlags` sets it from `UnitFlag.TAXI_FLIGHT` (`protocol/entity-fields.ts:91`) and emits `control_changed` with `in_flight`, never `disable_move`, while it is set. `blockReason()` returns `"in_flight"` right after `teleporting` and before `rooted`, `no_control` and `disable_move`. `ControlState.blockedReason` is already a `string` (`control.ts:53`), so `travel-5`'s `blockedReason === "in_flight"` check (SR1-travel-11) needs no type change. All of this is ≤ 20 lines in `control-sync.ts`. | coordinator ruling (P2-17) |
| SR3-travel-8 | travel-4 test 1: the self flying spline "with `TAXI_FLIGHT` set". Finding 3: the spline arrives before the flag. | The self `spline` event counts as flight start when the packet is a `kind:"move"` with `SplineFlag.FLYING` and `CATMULLROM` (`protocol/monster-move.ts:5-13`) and is not cyclic; control then reports `in_flight` from the spline and keeps the last point, the duration and the `splineId`. Landing: the flag clears after it was seen set, or, if the flag was never seen, `duration + 10 s` after the spline start (fake time in tests). `in_flight` must survive `newWorld` (`control-sync.ts:253-273`) and `handleTransferPending` (`:225-230`) so a multi-map flight stays `in_flight` across the transfer. | coordinator ruling (P2-17) |
| SR3-travel-9 | travel-4 step 1 edit of `gameplay-handlers.ts:158-167`: "a self move also goes to `self.receive`". The current block is `:163-173`, inside `registerMeleeHandlers({ combat, motion, self })` (`:137-140`), and applies to every guid. | Add one branch: `if (move.guid === conn.selfGuid()) self.receive({ type: "spline", move })` after the existing `setPosition` and `motion.monsterMove` calls (the builder confirms the self-guid accessor on `conn`/`SessionStores`; if it needs a new accessor, stop `blocked`, `blockedOn: shared-fake`). Control ignores a self spline that is not flight evidence (SR3-travel-8): charges, fear and knock-back splines keep their current handling. `SelfEvent` gains `{ type: "spline"; move: MonsterMove }` (type import from `#wow/protocol/monster-move`; `self-store.ts:22-42`), and `control-feed.ts` one `case "spline"` before `default` (`:48-54`). | coordinator ruling (P2-17) |
| SR3-travel-10 | travel-4 landing rule: "a stop spline during the flight sets the server pose to the stop point" and "the flag clearing with no stop spline sets the server pose to the last spline point". | Both stay. A stop spline is usually absent: `FlightPathMovementGenerator::DoFinalize` calls `StopMoving()` (`WaypointMovementGenerator.cpp:676-679`) and `Unit::StopMoving` returns before sending when the spline is already finalized (`Entities/Unit/Unit.cpp:12605-12606`). The last point of a non-cyclic catmull-rom path is `points.at(-1)` (`readCatmullPath`, `monster-move.ts:113-121`: `[start, ...extra]`). `protocol/monster-move.ts` is vehicles-1's lease and is not edited. The position `z` is the flight end node's; after landing the first ground move uses `groundStep` from that pose. | coordinator ruling (P2-17) |
| SR3-travel-11 | travel-4 step 1: `buildMoveSplineDone(guid, info, splineId)` in `areas/travel/protocol.ts`, sent from control. A legacy core file (`control-flight.ts`) importing an area module. | Allowed: other legacy files import areas (`client.ts`, `combat-casts.ts`, `runtime.ts` grep `#wow/areas/`), and the boundary test restricts area sources only. `mise lint` decides [INFERENCE]; if it refuses, move the builder into `protocol/movement.ts` is **not** allowed (self-state-12's file); stop `blocked` naming the rule. Send rule: exactly one `CMSG_MOVE_SPLINE_DONE` when the spline duration has elapsed and `TAXI_FLIGHT` is still set (`Handlers/TaxiHandler.cpp:216`); none when the flag is already clear. At a single-map flight's end the server finalizes by itself (`DoFinalize`), so the proof row is `builder` with "sent live, effect not seen" as the unit file says; the multi-map branch (`TaxiHandler.cpp:223-243`) stays mock unless the catalog shows a reachable multi-map path. | coordinator ruling (P2-17) |
| SR3-travel-12 | `control-sync.ts` 375 non-blank lines, `control.ts` 303; travel-4 adds logic, and three more holders follow. | SEED3-11 moves `FLAG_ACKS` out first. travel-4 puts the flight state machine in `control-flight.ts` and adds at most about 20 lines to `control-sync.ts` and 10 to `control.ts` (delegating methods `observeSelfSpline`, as the plan says). If `control-sync.ts` would pass 480, the holder may split a further block by responsibility in a separate `refactor:` commit first (it holds the lease). | coordinator ruling (P2-17) |
| SR3-travel-13 | travel-4 test "a claim during the flight refuses moves with `in_flight`". | Control has no claim concept (no member in `control.ts:95-352`; claims live in the harness runtime). The core test reads "a move, walk or face request during the flight throws `in_flight`" (`guard` `control-mover.ts:85-92`, `face` `control.ts:295-301`). The claim case is covered by travel-6's tool test. `control-fixtures.ts` `setup`/`oracle` (`test-support/control-fixtures.ts:44-62`) need no new member. | coordinator ruling (P2-17) |
| SR3-travel-14 | travel-2 step 7/8 acts `destinations(from)` and `planFlight(from, destination)` "send nothing: they read the catalog". The catalog loads lazily from `ctx.dbc` (`areas/contract.ts:52-66`). | Both return `Promise<TravelOutcome>`: the first call awaits the one-per-session catalog promise, a missing file settles `refused("missing_taxi_data")`. The harness awaits them (SR3-travel-31). Timeouts in act tests (3 s, 5 s) run on fake time (`rules.md` item 8). | coordinator ruling (P2-17) |
| SR3-travel-15 | travel-2 step 11 and travel-3 step 9 live: "Blood Elf, node 82 known from creation", "Tranquillien" node ids. | `ghostlands20` is template `Tplghost` at map 530 `(7575, -6835, 88.66)` (`factory/src/soap-presets.ts:46-52`); the race is not in the repo [INFERENCE: Blood Elf]. The builder reads node ids and the direct edge from the staged catalog by name and hardcodes none: Silvermoon City and Tranquillien are matched as "Silvermoon" and "Tranquillien" (`destinations`). No SOAP verb learns a taxi node (`soap-gm.ts:39-55` lists none; `.cheat taxi` is `Console::No`), so nodes are learned at the flight master (`travel-taxi` flow). One account serves travel-2 and travel-3 when the same session runs both. | coordinator ruling (P2-17) |
| SR3-travel-16 | travel-3 step 6 refusal names `not_enough_money`, `not_visited`, `too_far`, `busy`, `mounted`, `shapeshifted`, `no_such_path`, `same_node`, `not_standing`, `moving`, and silent paths. | AzerothCore's sends: `BUSY` for logout, combat, stun, root and casting (`Entities/Player/Player.cpp:10418-10421,10446`), `ALREADYMOUNTED` (`:10433`), `SHAPESHIFTED`, `UNSPECIFIEDSERVERERROR` when the mount display or first path is 0 (`:10541`), `NOTENOUGHMONEY` (`:10562`); silent when `DISABLE_MOVE` is set (`:10424-10425`) and when a hop has no direct path after setup (`:10520-10525` area). The 13-name table of `enum ActivateTaxiReply` (`src/server/shared/SharedDefines.h:3849-3864`) is the source; any code without a short name in the plan list maps to `unknown_<n>`; `UNSPECIFIEDSERVERERROR` maps to `server_error`. The eleven-name list of the plan is not exhaustive and is not a test of completeness. | coordinator ruling (P2-17) |
| SR3-travel-17 | travel-3 live: "`InstantFlightPaths` may be on"; "money fell". | The shipped default is `InstantFlightPaths = 0` (`src/server/apps/worldserver/worldserver.conf.dist:1657`); the deployed conf is not readable here [INFERENCE: default]. With it at 1 the server sends no `ERR_TAXIOK` and teleports (`Player.cpp:10574-10582`), which the plan's "a self teleport with no reply settles `ok`" rule covers. Money: only the first hop's cost is taken at the start (`:10586`), later hops at each node; "money fell" is checked after `ERR_TAXIOK`, and travel-6's check uses the list price as the floor of the drop. | coordinator ruling (P2-17) |
| SR3-travel-18 | travel-2 wire facts. | All guid fields in the taxi handlers are full `u64`, not packed (`Handlers/TaxiHandler.cpp:27-28`, express `:161`, activate `:273`), as the plan says. `CMSG_ACTIVATETAXI` reads exactly two nodes (`:272-278`); the express form accepts any count (`:165-194`). `SMSG_NEW_TAXI_PATH` has an empty body (`:150-156`); a first `TAXIQUERYAVAILABLENODES` at an unknown node learns it and sends `NEW_TAXI_PATH` plus a `TAXINODE_STATUS` update, with no map (`:140-147`). `CMSG_SET_TAXI_BENCHMARK_MODE` is one `u8` (`Handlers/MiscHandler.cpp:1580-1585`). | coordinator ruling (P2-17) |
| SR3-travel-19 | travel-6 step 5 (`t8-travel-fly`): preset `ghostlands20`, "setup `position` within 20 yd of the Tranquillien flight master". Finding 4: `setup: [...scenario.setup, slots.agent]` (`grader/run.ts:443-448`), and `startSlots` resolves `ghostlands20` to `GHOSTLANDS` (`spawn-slots.ts:73,161,267`). The Ghostlands group today is `t3-ghostlands-kill`, `t9-lfg-run`, `t9-raid-kick` (3 slots, 6 of 16 points; measured over `scenarios/*.json`). | DESIGN answered: E5 accepted: `t8-travel-fly` starts on the slot; the fallback named spawn stays a coordinator edit. The scenario has **no `position` setup row**; the start is the slot. travel-2's `travel-taxi` flow prints the distance from the login point to the nearest flight master; the builder records it. If the flight master is not in view from the slot points (`look find:"flight_master"` empty at login), the scenario cannot start the run honestly: stop `blocked`, `blockedOn: ruling`, and the coordinator adds a named spawn to `spawn-slots.ts` (a grader edit, not the builder's). Adding `t8-travel-fly` makes the Ghostlands group 4 slots: `--replica 2` still fits (8 slots = 16 points), a fifth Ghostlands scenario would make replica 2 throw `no start slot` (`spawn-slots.ts:267-285`). `partner: null`. | coordinator ruling (P2-17) |
| SR3-travel-20 | travel-6 step 5: money check and staging. `Truth` has `money` (`grader/truth.ts:33,182`); the setup endpoints include `money` (`factory/src/realm-service.ts:9-18`); GM verbs are not allowed in an eval (contract 0.7). | Add one `money` setup row giving at least 10 silver [INFERENCE: fare under 1 gold]; the body shape is read from the realm service's refusal of `{}` once on a throwaway account (as SR1-travel-10 did for `hearth`). The "about 10 yd north of the Silvermoon landing point" check uses node 82's catalog x, y on map 530, read by the builder from the staged catalog and written as numbers in the `expect` text and the `evidence.point`. `navBound: true`, `needsWatcher: false`; `paneMinutes` 12 and `budget.minutes` 10 as the plan says [INFERENCE: flight time unmeasured, about 2-3 min]. | coordinator ruling (P2-17) |
| SR3-travel-21 | travel-6 Files: `tools/look.ts` `flight_master` kind, `look.test.ts`. The kind list is `LOOK_FILTERS`/`REMEMBERED_FILTERS` in `tools/look-find.ts:27-48` and `LOOK_KINDS` in `params-look.ts:3-15`; the filter type `LookFilter` is in `contract/details.ts:19` (look block); `filterMatches` delegates to `unitMatches(unit, kind: NearestKind)` (`ops/views.ts:114`), and `NearestKind` (`contract/views.ts:105`) also drives `ops/views.ts:63-74` and the `nearest` rows (views leases). | `flight_master` is added to `LookFilter` (`contract/details.ts`, look-block rider), `LOOK_KINDS` and `LOOK_FILTERS`, and handled in `look-find.ts` alone: `filterMatches` tests `unit.roles.includes("flight_master")` (`UnitView.roles` already carries it, `contract/views.ts:75`) and `kindOf` returns `undefined` for it. **No `NearestKind` member and no `ops/views.ts` or `contract/views.ts` edit**; no "Nearest flight master" line. `look-find.ts` is 115 lines; tests go in a new `look-flight.test.ts` (travel-6 creates it; `tools/look.test.ts` is 230). | coordinator ruling (P2-17) |
| SR3-travel-22 | New goal kind `fly` (travel-6 step 3). The `Goal` union is in `tools/travel-report.ts:21` (434 non-blank lines), `goalView` `:128`, `goalName` `:141`; `TravelGoalView` in `contract/details.ts:74-80`; dispatch in `tools/travel.ts:82-91` and `:249`; the exhaustive label switch is `ui/renderers/live-run.ts:69-70`. BR-travel-5-1 names `events/now.ts`, `ops/remembered.ts`, `ops/views.ts`, `ui/renderers/live-run.ts`, but grep of `"hearth"` hits only `travel.ts`, `travel-hearth.ts`, `travel-report.ts`, `live-run.ts` and `details.ts`. | BR-travel-5-1 carries over to travel-6 for exactly the files that name the goal kinds today: `tools/travel-report.ts` (+ about 12 lines, stays under 480), `tools/travel.ts` (415 lines; one parse branch and one dispatch line), `ui/renderers/live-run.ts`, and the `TravelGoalView` and `TravelAfter` blocks of `contract/details.ts` (D13 rider). If the builder finds another exhaustive switch (`mise typecheck` names it), it may add the one `fly` case there and reports the file. `tools/travel.test.ts` has 491 non-blank lines: travel-6 adds no test there (all new tests in `travel-fly.test.ts`). | coordinator ruling (P2-17) |
| SR3-travel-23 | travel-6 step 4: `interact do:"talk"` at a flight master lists destinations. `talkStep` is `tools/interact.ts:99-138` (239 lines, `interact.test.ts` 398 lines). | The destination listing is a new `tools/interact-flight.ts` (pure builder of the body lines from `destinations(node)`), called once from `talkStep`; its tests in a new `interact-flight.test.ts`. `interact.ts` stays under 260. If `destinations` refuses `missing_taxi_data` the talk result prints the master and no list, without an error. | coordinator ruling (P2-17) |
| SR3-travel-24 | travel-6 "run approaches the flight master, calls `openTaxiMap`, ... `planFlight(currentNode, destination)`, `activateTaxi`". `currentNode` is not a travel-store field. | The current node is the `currentNode` of the `taxi_map` event (`SMSG_SHOWTAXINODES` `curloc`, plan step 1 of travel-2) that the last `openTaxiMap` produced; `TravelState.masters[npc].node` also holds it. The run never guesses a node from coordinates. | coordinator ruling (P2-17) |
| SR3-travel-25 | travel-6 "with no flight master in view, walks to the nearest known node's catalog position". From a fresh `ghostlands20` start the only known node may be Silvermoon (another zone): walking there defeats the flight. | DESIGN answered: E3 accepted: fly within 300 yd, else `no_flight_master`. Restrict: the fallback walks only to a known node on the current map within 300 yd of the pose; beyond that the run refuses `no_flight_master` with "No flight master in view. Use look find:flight_master or travel explore." No path is planned across zones. | coordinator ruling (P2-17) |
| SR3-travel-26 | Mounted characters: `ERR_TAXIPLAYERALREADYMOUNTED` (`Player.cpp:10433`). self-state-10b does not list `travel`, and self-state-6/10a may land after travel-6. | travel-6 surfaces `refused("mounted")` as "Get off your mount first." with no `next` call: `spell do:"dismount"` may not exist yet. No automatic dismount in `fly`. | coordinator ruling (P2-17) |
| SR3-travel-27 | travel-6 docs: `docs/capabilities.md:38` (plan) is `:88-89`; `docs/evals.md` travel row is `:202` (`t8-travel-bind-inn`, `t8-travel-hearth-home`); `docs/harness.md` one-clause rule. | The sentence loses `flight paths` only if the scenario passed (finding 9). The `evals.md:202` row gains `t8-travel-fly`. travel-6 holds the `travel`, `look` and `interact` tool leases, so it may add one clause to each of those three rows of `docs/harness.md` (SR1-travel-4 rider); `docs/harness.md` has 437 non-blank lines and other wave-3 tasks append rows, so no further prose. | coordinator ruling (P2-17) |
| SR3-travel-28 | travel-6 `worldActs` gains `openTaxiMap` and `activateTaxi`; `travelHarness` today has `worldActs: ["bindActivate"]` (`h: areas/travel/area.ts:47`). | `worldActs` is typed `keyof AreaActsOf<"travel">` (`areas/contract.ts:34-38`), so the acts exist after travel-2/3. `planFlight` and `destinations` are not world acts; the tools read them through `ctx.handle.travel.act`. Puppet calls are not needed. The harness rule rows of step 1 are `travel/node_learned`, `flight_started`, `flight_landed` (wake), `flight_refused`; `areas/travel/area.ts` has 47 lines and `area.test.ts` 54, no split. | coordinator ruling (P2-17) |
| SR3-travel-29 | travel-2 step 10/11 probe and staging limits. | `travel-taxi.ts` and `travel-fly.ts` name the flow after the file stem, import only `#tools/probe-flows` and `@peon/core`, and read the nearest flight master with `others(handle)` (role `flight_master`, `core: npc-roles.ts:39`, flag `0x2000`). Live rule of `rules.md` item 5: at most two live tries per opcode, then mock and `unseen` in `opcodes.ts`. The `CMSG_ENABLETAXI` path is live because it is the same handler as the query (`Server/Protocol/Opcodes.cpp` row cited by the plan, not re-read). Delete the account after travel-3 or travel-4 (travel-4 reuses it). | coordinator ruling (P2-17) |
| SR3-travel-30 | travel-4 gates (step 7) and eval runs. | `t1-walk-to-npc`, `t7-halt-resume`, `t3-ghostlands-kill` run in the round the coordinator hands the builder; `t3-ghostlands-kill` fails on `main` (D17), so only new causes count. travel-6's `mise eval run t8-travel-fly --round <n>` and its gates use the same round; one budget adjustment from the first run. | coordinator ruling (P2-17) |
| SR3-travel-31 | Sizes (500-line cap). Measured non-blank lines at `fd019282`: `areas/travel/store.ts` 62, `runtime.ts` 44, `store.test.ts` 154, `runtime.test.ts` 119, `protocol.test.ts` 61, `test-support/areas/travel.ts` 30; `control-sync.ts` 375, `control.ts` 303, `self-store.ts` 80, `control-feed.ts` 55, `gameplay-handlers.ts` 394 (+ about 6), `tools/travel.ts` 415, `tools/travel-report.ts` 434, `tools/travel.test.ts` 491, `tools/interact.ts` 239, `tools/look-find.ts` 115. | Nothing in `areas/travel/` or its tests comes near 470 after travel-2, -3 and -4 [INFERENCE: about 100 lines each]; a builder splits a file before 470. `gameplay-handlers.ts` stays below 410. The near-cap files are handled by SR3-travel-12 (`control-sync.ts`), SR3-travel-22 (`travel-report.ts`, `travel.test.ts`). | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. 3. **`SMSG_MONSTER_MOVE` for a flight reaches the client before the flags.** `FlightPathMovementGenerator::DoReset` sets `UNIT_FLAG_DISABLE_MOVE | UNIT_FLAG_TAXI_FLIGHT` and then `init.Launch()` (`WaypointMovementGenerator.cpp:704-718`); the flag update travels in the next object update. The current `control-sync.ts` already blocks on `DISABLE_MOVE` (`:33-37`, `:408-414`), so a flight would report `disable_move` today. travel-4 must report `in_flight` first, and must take the spline itself as flight evidence. SR3-travel-7, -8.

2. 4. **The scenario `position` step does not survive for `ghostlands20`.** `preset ghostlands20` is in `SPAWN_OF` (`grader/spawn-slots.ts:161-167`), and `run.ts:443-448` appends `slots.agent` after the scenario's own `setup` (same defect as SR2-instances-1). `t8-travel-fly` therefore starts on a Ghostlands slot point (16 points, x 7567-7583, y -6831 to -6843, `spawn-slots.ts:73-91`). SR3-travel-19.

3. 6. **The index has no lease waits for any of these tasks** (`leaseDeps: []` everywhere; `leaseQueues` still lists `tools/params.ts` and `tools/look.ts` as whole files). Sections C and D give the waits. The plan's `look-self.ts` chain runs `economy-8 → travel-6 → self-state-10a`, which makes self-state-10a, -10b and (by unit order) self-state-12 wait behind the mail tool. DESIGN E2 removes that coupling for the control work.

4. 7. **Control-file order for wave 3** (the acceptance item; full lines in section C):
   - `control.ts`, `control-sync.ts`: travel-4 → self-state-12 → vehicles-3 → vehicles-4 → vehicles-7.
   - `control-feed.ts`, `self-store.ts`: travel-4 → vehicles-3 → vehicles-4 → vehicles-7.
   - `control-motion.ts`: self-state-12 → vehicles-3 → vehicles-7.
   - `control-mover.ts`: self-state-12 (new) → vehicles-4. `control-input.ts`: self-state-12 only. `protocol/movement.ts`: self-state-12 only.
   - `gameplay-handlers.ts`: items-3b (landed) → travel-4. `movement-handlers.ts`: vehicles-7 only (travel-4 leaves, SR3-travel-3).
   - `control-flight.ts` (new, travel-4): travel-4 → vehicles-3 (the seat spline reuses the spline-done send, `vehicles.md:75`).
   - vehicles-3 must wait for self-state-12 (index gap), and self-state-12 for travel-4.

5. 9. **`docs/capabilities.md` sentence moved.** The "no tool for ... flight paths ... mounts" text is now at `docs/capabilities.md:88-89` (the plan cites `:38`). Three wave-3 tasks edit the same sentence (economy-8 mail, travel-6 flight paths, self-state-10a mounts); each removes only its own word and keeps the others' edits on a rebase conflict.


## Staging for wave 3

| Task | Accounts, presets, place | GM staging and notes |
|---|---|---|
| travel-2 live | 1 `ghostlands20` (horde, map 530, `(7575, -6835, 88.66)`). If the flight master is out of view, offline `position` to a point within 5 yd of the node's catalog x, y on map 530. | No GM verb learns a node; none is needed. `--flow login --expect SMSG_TAXINODE_STATUS`, then `--flow travel-taxi`. Delete the account after travel-3/4 if the same session continues, else after travel-2. |
| travel-3 live | The same account (Tranquillien learned). | `soap gm <A> money <copper>` (R12, own character) if the fare is unaffordable; `--flow travel-fly --arg to=Silvermoon --wait 300`, plain and `express=1`; the `soap truth` money check. |
| travel-4 live | The same account, knowing Tranquillien and Silvermoon. | `--flow travel-land --arg to=Silvermoon --wait 300`, then `soap truth`. One attempt for a multi-map flight only if the catalog shows a reachable one; otherwise mock and "not seen live". |
| travel-6 eval | Preset `ghostlands20`, `partner: null`, slot start, `money` setup row; no GM in the eval. | `mise eval run t8-travel-fly --round <n>` with `timeout >= 1800`; replica 1 only. |
## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-travel-5-1 | travel-5 adds one or two lines each to `events/now.ts`, `ops/remembered.ts`, `ops/views.ts` and `ui/renderers/live-run.ts` for the new `hearth` travel goal, which those exhaustive switches must name; and it holds `tools/interact.ts`, `tools/look*.ts`, `tools/travel*.ts` and their params siblings after their earlier holders landed | Accepted: the lines only name the new goal kind, and each lease passed to travel-5 when its previous holder landed | coordinator ruling (P2-17) |
| BR-travel-4-1 | SR3-travel-8 asks for a spline with `SplineFlag.FLYING` and `CATMULLROM`; AzerothCore's `EnableFlying()` clears `Catmullrom` and `Flying` alone selects catmull-rom interpolation, so the two bits never appear together | Coordinator ruling (P2-17): SR3-travel-8 is amended: a taxi flight spline is one with `FLYING` set (catmull-rom interpolation by `Flying`), with writer-derived fixture flags. |
| BR-travel-6-1 | After a flight the landing pose keeps the last taxi node's z (2.3 yd above the navmesh at Silvermoon), so every later `travel` refuses `position_disagrees_with`; the fix is in travel-4's `control-flight.ts` | Coordinator ruling (P2-17): travel-6 may edit `land()` in `packages/core/src/wow/control-flight.ts` and its test (and `control.ts` only to pass the ground oracle in): when a ground oracle exists, the landing pose takes the ground height at the landing x, y, as a client that falls to the ground does, and the existing events stay. vehicles-3, the next holder of `control-flight.ts`, starts after travel-6 lands. |
