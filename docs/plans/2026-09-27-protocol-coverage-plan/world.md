# Protocol coverage: world (key: world)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.17 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.17" point into it).

## What the unit delivers

The character knows its reputation with every faction, and hostility
follows reputation and forced reactions as AzerothCore decides it. The
login noise of the area (factions, forced reactions, world states,
weather) stops showing as `not_implemented`. A new character completes
its intro cinematic by itself. The agent gets `journal about:
"reputation"` and a daily-reset line in `journal about: "quests"`, and
the game log shows reputation changes, rank changes, phase changes,
cinematics and movies. World states, weather, sound, light and the UI
timer reach extensions through the world service (N5) and are not
logged.

- Unit `world`, code areas `reputation` and `ambience`, plus the step-0
  area `time` under a lease (design 5.1, 5.17; contract 2.5). There is no
  code area named `world` (contract D26). Worktree `proto-world`, branch
  `proto/area-world` (contract 0.1):

  ```
  orca-ide worktree create --name proto-world \
    --base-branch origin/factory/426-protocol-coverage \
    --parent-worktree active --setup run \
    --comment 'owner: coordinator, item 4 world'
  git branch -m proto/area-world
  ```

- Phases (design 5.1, exactly): world-1, world-2, world-3, world-5,
  world-7 and world-8 are wave 1 (phase 1); world-6 is wave 3 (phase 3);
  world-4, world-9 and world-10 are wave 4 (phase 4). The design's
  `world-8` is split into `world-8a` and `world-8b` (contract 0.10), so
  the log rules do not wait for the contended `journal` lease.
- Unit order: world-3, world-5, world-1, world-2, world-7, world-8a,
  world-8b, world-6, world-4. world-3 and world-5 go first, so the unit
  can start before the `time` lease is handed over. Each task also
  depends on the task before it in this order (the plan JSON lists it).
  One task at a time;
  each starts from the current `origin/factory/426-protocol-coverage`
  after the previous one landed (contract 0.1).
- Opcodes: 24 relevant and 3 dead (design 5.17; `areas.tsv` rows with
  area `world`; the verify reports move no row into or out of `world`).
  Three relevant opcodes, `SMSG_LOGIN_SETTIMESPEED`, `CMSG_QUERY_TIME`
  and `SMSG_QUERY_TIME_RESPONSE`, are built by S0-5 (step0 plan). The
  unit's tasks handle the other **21**.
- Names (contract D7): `REPUTATION_OPCODES`, `reputationArea`,
  `ReputationStore`, `ReputationState`, `ReputationEvent`,
  `ReputationActs`, `reputationRuntime`, `reputationHarness`;
  `AMBIENCE_OPCODES`, `ambienceArea`, `AmbienceStore`, `AmbienceState`,
  `AmbienceEvent`, `AmbienceActs`, `ambienceRuntime`, `ambienceHarness`.
  The time names of contract 1.10 stay; world-1 extends them.
- Log rows use the area domain (contract 1.9): `reputation/changed`,
  `reputation/rank`, `reputation/discovered`, `reputation/forced`,
  `reputation/at_war`, `ambience/phase`, `ambience/cinematic`,
  `ambience/movie`. The area design's `world/*` row names do not apply.
- Store event types (`/^[a-z_]+$/`): reputation `initialized`,
  `standing_changed`, `visible`, `forced_changed`, `watched_changed`,
  `flags_pending`; ambience `world_state`, `weather`, `phase_changed`,
  `light`, `sound`, `cinematic`, `movie`; time gains `ui_time`.
- No new tool (contract 1.9 table has none for this unit). Faction
  settings are world-service acts only (design 5.17 "Acts").
- One eval: `t4-reputation-gain` (design 5.2 row 9), in world-8b.
- Test packet builders: `packages/core/test-support/areas/reputation.ts`
  (`reputation<Opcode>Body`) and
  `packages/core/test-support/areas/ambience.ts` (`ambience<Opcode>Body`);
  world-1 adds `timeUiTimerUpdateBody` to
  `packages/core/test-support/areas/time.ts` under the lease.
- Update fields are read from `entity.rawFields.get(offset)` with offsets
  from `#wow/protocol/update-fields` (an allowed value import, contract
  1.12): `PLAYER_FIELDS.WATCHED_FACTION_INDEX` (offset 1230,
  `protocol/update-fields.ts:314`) and `UNIT_FIELDS.BYTES_0` (offset 23,
  `protocol/update-fields.ts:69`; byte 0 race, byte 1 class). So the unit
  needs no lease on `player-state.ts`.
- AzerothCore citations are relative to `src/server/game/` at `deployed`
  `9d4e36d81`; wowm citations are under
  `wow_message_parser/wowm/world/`.

### Code-area ownership (for `SEED-1`)

`SEED-1` seeds `reputation` and `ambience` (wave 1). The owns lists this
plan expects (the coordinator writes `owns`; the unit never edits it,
contract 2.5):

| Code area | `owns` | `stubs` moved from `STUBS` | `dead` |
|---|---|---|---|
| `reputation` | `SMSG_INITIALIZE_FACTIONS`, `SMSG_SET_FACTION_STANDING`, `SMSG_SET_FACTION_VISIBLE`, `SMSG_SET_FORCED_REACTIONS`, `CMSG_SET_FACTION_ATWAR`, `CMSG_SET_FACTION_INACTIVE`, `CMSG_SET_WATCHED_FACTION` | `SMSG_INITIALIZE_FACTIONS` ("Factions", `protocol/stubs.ts:50`) | none |
| `ambience` | `SMSG_UPDATE_WORLD_STATE`, `SMSG_WEATHER`, `CMSG_ZONEUPDATE`, `SMSG_TRIGGER_CINEMATIC`, `CMSG_NEXT_CINEMATIC_CAMERA`, `CMSG_COMPLETE_CINEMATIC`, `SMSG_TRIGGER_MOVIE`, `SMSG_PLAY_SOUND`, `SMSG_PLAY_MUSIC`, `SMSG_PLAY_OBJECT_SOUND`, `SMSG_OVERRIDE_LIGHT`, `SMSG_SET_PHASE_SHIFT`, plus the three dead rows | `SMSG_WEATHER` (`:44`), `SMSG_SET_PHASE_SHIFT` (`:56`), `SMSG_PLAY_SOUND` (`:57`), `SMSG_PLAY_MUSIC` (`:58`) | `CMSG_COMPLETE_MOVIE`, `SMSG_TOGGLE_XP_GAIN`, `SMSG_CAMERA_SHAKE` |
| `time` (S0-5, leased) | S0-5's three, plus `CMSG_WORLD_STATE_UI_TIMER_UPDATE` and `SMSG_WORLD_STATE_UI_TIMER_UPDATE` (issue 1) | none | none |

### Unit files

Paths without a prefix are under `packages/core/src/wow/`.

| Path | Created by |
|---|---|
| `areas/reputation/opcodes.ts`, `areas/reputation/area.ts` | `SEED-1` (the unit fills `uses` and `unseen` and removes its stub line in world-3) |
| `areas/reputation/protocol.ts` and test | world-3 (grows in world-5, world-4) |
| `areas/reputation/catalog.ts` and test | world-3 |
| `areas/reputation/store.ts` and test | world-3 (grows in world-5, world-4) |
| `areas/reputation/runtime.ts` and test | world-3 (grows in world-5, world-4) |
| `areas/reputation/relation.ts` and test | world-5 |
| `areas/reputation/area.test.ts` | world-3 |
| `areas/ambience/opcodes.ts`, `areas/ambience/area.ts` | `SEED-1` (the unit fills `uses` and `unseen` and removes its stub lines in world-2 and world-6) |
| `areas/ambience/protocol.ts`, `store.ts`, `runtime.ts` and tests, `area.test.ts` | world-2 (grow in world-7, world-6) |
| `packages/core/test-support/areas/reputation.ts` | world-3 |
| `packages/core/test-support/areas/ambience.ts` | world-2 |
| `packages/harness/src/areas/reputation/area.ts` and test | `SEED-1`; rules from world-8a, `worldActs` from world-4 |
| `packages/harness/src/areas/reputation/journal.ts` and test | world-8b (a sibling of `area.ts`, issue 6) |
| `packages/harness/src/areas/ambience/area.ts` and test | `SEED-1`; rules from world-8a and world-6 |
| `packages/devtools/src/probe-flows/reputation-settings.ts` | world-4 |
| `packages/harness/src/grader/scenarios/t4-reputation-gain.json` | world-8b |
| `docs/areas/reputation.md` | world-3 (each later reputation task adds its rows) |
| `docs/areas/ambience.md` | world-2 (each later ambience task adds its rows) |
| `docs/protocol-coverage/reputation.md`, `docs/protocol-coverage/ambience.md`, `docs/protocol-coverage/time.md` | regenerated only |

### Leases this unit needs (contract 2.7)

| Legacy file | Task | Edit |
|---|---|---|
| core `areas/time/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts` and their tests; `packages/core/test-support/areas/time.ts`; harness `packages/harness/src/areas/time/area.ts` and test; `docs/areas/time.md` | world-1 | the UI timer pair: a parser, a `uiTime` state field, the `ui_time` event, the `requestUiTime` act and its `worldActs` entry, two proof rows (design 5.17 "Decisions"; issue 1) |
| `unit-relation.ts` and test | world-5 | `RelationDeps.reputation?`, and the AzerothCore order for the character against a creature |
| `client-control.ts` (`unitRelationOf`, `client-control.ts:36-41`) | world-5, as a `COORD` edit | pass the reputation view into `RelationDeps` (issue 2) |
| harness `tools/journal.ts` and test, the `journalParams` block of `tools/params.ts` (`tools/params.ts:187-205`), the `journal` `After` block of `contract/details.ts`, and the `journal` row of the `docs/harness.md` tool table (`docs/harness.md:132`) | world-8b | `about: "reputation"` and the daily-reset line (issue 5) |

### Contract issues found while planning

These are gaps, not changes. The coordinator rules on each (contract
precedence 3). Each workaround below is a decision **not yet ruled by the
maintainer**.

1. **The UI timer pair has no owner yet.** Design 5.17 puts
   `CMSG_WORLD_STATE_UI_TIMER_UPDATE` and
   `SMSG_WORLD_STATE_UI_TIMER_UPDATE` in the `time` area, and contract
   1.10 gives `TIME_OPCODES` only S0-5's three names. A worker never
   edits `owns` (contract 2.5). So `SEED-1` (or a `COORD` commit before
   world-1) adds both names to `TIME_OPCODES.owns` and hands world-1 the
   lease on the files listed above. The lease also names the harness
   `areas/time/area.ts`, because `requestUiTime` joins `worldActs`
   there; contract 2.7 lists only `areas/time/*`. If the lease leaves out
   the harness file, world-1 skips the `worldActs` entry and reports it.
2. **`targetRelation` cannot reach the reputation store.**
   `unitRelationOf` (`client-control.ts:36-41`) builds `RelationDeps` from
   `conn` and `rt` only, and `controlMethods(conn, rt)` is called from
   the frozen `client.ts:336`. `stores.areas` is not reachable there, and
   `client-control.ts` is on no lease. The plan: the reputation runtime
   exposes a read act `relationView()` (not in `worldActs`), and a
   `COORD` commit changes `unitRelationOf` to pass
   `reputation: rt.areas.runtimes.reputation.act.relationView()` into
   `RelationDeps` (`rt.areas` is contract 1.6). The type
   `ReputationRelationView` lives in `unit-relation.ts` (leased), so the
   area imports it as a type (allowed, contract 1.12) and core imports no
   area. `RelationDeps.reputation` is optional, and without it
   `targetRelation` behaves as today. world-5 stops `blocked` after its
   core commit if the `COORD` edit has not landed.
3. **No config switch for the cinematic auto-complete.** Design 5.17 asks
   for a client config switch that turns the auto-complete off for the
   probe. `ClientConfig` lives in the frozen `client.ts`, and
   `SMSG_TRIGGER_CINEMATIC` arrives during the login
   (`Handlers/CharacterHandler.cpp:889-899`), before any act could turn a
   runtime switch off. The plan drops the switch. Because
   `HandleNextCinematicCamera` returns at once when no camera is active
   (`Entities/Player/CinematicMgr.cpp:38-42`), the proof of
   `CMSG_NEXT_CINEMATIC_CAMERA` is the `accepted` case of contract 0.6: a
   builder test and a probe `--send` after the login. The "objects leave
   view" observation of design 5.17 is not attempted. This is a
   deviation from design 5.17.
4. **The world-service `READ_KEYS` and `EVENT_KEYS` edits of the area
   design are superseded** by N5 and contract 1.9: `session.areas` and
   `claim.areas` expose every area, so no task touches
   `world/service.ts`. The `look` game-time line of the area design (V2)
   is dropped, because it would need the `look.ts` lease that ten units
   want; the daily-reset line in `journal about: "quests"` stays.
5. **The `journal` lease does not name `tools/params.ts` or the
   `docs/harness.md` row.** `journalParams.about`
   (`tools/params.ts:187-190`) and the tool-table row "Quest log, bags and
   gear, spells, or the game log." (`docs/harness.md:132`) change with
   the new `about` value. The spells plan reads the lease the same way.
   world-8b takes both under the journal lease; without them it stops
   `blocked`.
6. **Harness sibling files.** Contract 2.5 lists only `area.ts` and
   `tool*.ts` under `packages/harness/src/areas/<area>/`. The plan reads
   contract 0.2 ("split by responsibility into sibling files in the same
   directory, owned by the same unit") as allowing
   `areas/reputation/journal.ts`, the renderer that `tools/journal.ts`
   calls. This keeps the leased `journal.ts` (323 lines) small.
7. **The `t0-hostiles` capability limit.** Design 5.17 adds a known limit
   to the existing `t0-hostiles` row of `docs/capabilities.md`. Contract
   3.4 lets a task append rows and ids, not edit another scenario's
   limits. The plan leaves that sentence to the coordinator's wave
   integration tidy (contract 2.4) and puts the text in
   `docs/areas/reputation.md` "Capabilities row".

---

## Task world-3: Reputation state

**codeArea:** `reputation`. **Phase:** 1. **Size:** M. **Proof:** live
(0x122, 0x124) and live or mock (0x123).

Rulings: SR1-world-8.

**Files:**

- Create: `packages/core/src/wow/areas/reputation/protocol.ts` and
  `protocol.test.ts`
- Create: `packages/core/src/wow/areas/reputation/catalog.ts` and
  `catalog.test.ts`
- Create: `packages/core/src/wow/areas/reputation/store.ts` and
  `store.test.ts`
- Create: `packages/core/src/wow/areas/reputation/runtime.ts` and
  `runtime.test.ts`
- Create: `packages/core/src/wow/areas/reputation/area.test.ts`
- Create: `packages/core/test-support/areas/reputation.ts`
- Create: `docs/areas/reputation.md`
- Modify: `packages/core/src/wow/areas/reputation/area.ts` (seeded),
  `packages/core/src/wow/areas/reputation/opcodes.ts` (delete the
  `SMSG_INITIALIZE_FACTIONS` stub line; `unseen` if 0x123 stays mock)
- Regenerate: `docs/protocol-coverage/reputation.md` and
  `docs/protocol-coverage/core.md` with `mise protocol:coverage`

**Depends on:** item6, `S0-5`, `SEED-1`, `T-2` (the tap), `T-3` (the
probe), `T-5` (`soap gm quest` and `read reputation` for the proof).

**Opcodes:** `SMSG_INITIALIZE_FACTIONS` (0x122),
`SMSG_SET_FACTION_STANDING` (0x124), `SMSG_SET_FACTION_VISIBLE` (0x123).

**Wire** (AzerothCore wins over wowm, design 5.17 "Wire
disagreements"):

- 0x122: `u32` count (always 0x80), then per reputation list id 0-127 a
  `u8` flags and a `u32` standing; absent ids are zeros
  (`Reputation/ReputationMgr.cpp:211-245`). The standing is the delta
  from the base value (`ReputationMgr.cpp:426`), so read it as `i32`.
  wowm agrees (`faction/smsg_initialize_factions.wowm:18-33`).
- 0x124: `f32` 0, `u8` "rank increased", `u32` count, then per entry
  `u32` reputation list id and `u32` standing delta
  (`ReputationMgr.cpp:178-209`). wowm keys each entry with a `u16`
  faction (`faction/smsg_set_faction_standing.wowm:25-34`); that is wrong
  for this server, and a wowm-built reader misreads every entry after the
  first.
- 0x123: `u32` reputation list id (`ReputationMgr.cpp:252-261`; wowm
  says `u16` faction, `faction/smsg_set_faction_visible.wowm:1-5`). Not
  sent while the player loads (`:254-255`).
- The server raises a faction to visible and sets or clears `AT_WAR`
  inside `SetOneFactionReputation` (`ReputationMgr.cpp:430-436`), and
  sends only the id and standing (`:188-200`), so the flags reach the
  client only at the next login.

**Steps:**

- [ ] **Step 1: Packet builders.** In
  `packages/core/test-support/areas/reputation.ts` write
  `reputationInitializeFactionsBody(entries)` (128 slots, `entries` a
  sparse map of list id to `{ flags, standing }`, zeros elsewhere, as
  `ReputationMgr.cpp:214-243`), `reputationSetFactionStandingBody({
  increased, entries })` (as `:183-200`) and
  `reputationSetFactionVisibleBody(repListId)` (as `:259`).
- [ ] **Step 2: Failing parser tests.** In `protocol.test.ts`:
  - `parseInitializeFactions` returns 128 entries indexed by list id, and
    reads a negative standing (`-500` written as `u32`) as `-500`;
  - it reads `count` entries whatever the count is (a count of 2 with 10
    bytes of body);
  - `parseSetFactionStanding` reads two 8-byte entries keyed by list id
    and the `increased` byte; a body built with 6-byte wowm entries fails
    the length check of the reader (the regression the wire note
    describes);
  - `parseSetFactionVisible` returns `{ repListId }`.
  Test titles may name the AzerothCore writer line. Run `mise test
  packages/core/src/wow/areas/reputation/protocol.test.ts` and see it
  fail on the missing module.
- [ ] **Step 3: Parsers.** `protocol.ts` exports `parseInitializeFactions`
  (`{ entries: { flags: number; standing: number }[] }`),
  `parseSetFactionStanding` (`{ increased: boolean; entries: { repListId:
  number; standing: number }[] }`, the leading `f32` read and dropped)
  and `parseSetFactionVisible` (`{ repListId: number }`). Do not sort
  keys in object literals that read packets.
- [ ] **Step 4: Failing catalog tests.** In `catalog.test.ts`, over a
  fixture `DbcFile` built in the test (two rows):
  - `byRepListId` and `byFactionId` find a row; a faction with
    `reputationListID` -1 has no list id;
  - `baseReputation(faction, raceMask, classMask)` follows
    `ReputationMgr.cpp:91-111`: the first of four slots whose race mask
    matches (or is 0 with a non-zero class mask) and whose class mask
    matches or is 0; else 0;
  - `rankOf(standing)` follows `ReputationToRank` (`ReputationMgr.cpp:28-42`):
    `PointsInRank` 36000, 3000, 3000, 3000, 6000, 12000, 21000, 1000 and
    cap 42999, so -42000 is Hated (0), 0 is Neutral (3), 3000 is Friendly
    (4), 42999 is Exalted (7); `rankBounds(rank)` gives the floor and
    ceiling.
- [ ] **Step 5: Catalog.** `catalog.ts` exports `FactionEntry`,
  `FactionCatalog`, `loadFactionCatalog(source: DbcSource)`, `rankOf`,
  `rankBounds` and `RANK_NAMES` (Hated to Exalted,
  `src/server/shared/SharedDefines.h:155-165`). The layout comes from
  `src/server/shared/DataStores/DBCStructure.h:942-958` and
  `DBCfmt.h:53`: id (0), `reputationListID` (1, `i32`),
  `BaseRepRaceMask[4]` (2-5), `BaseRepClassMask[4]` (6-9),
  `BaseRepValue[4]` (10-13, `i32`), `ReputationFlags[4]` (14-17), team
  (18), name (23, enUS through `localeString`, `dbc.ts:103`). `openDbc`
  throws on a wrong field count or record size (`dbc.ts:33-46`); the
  builder confirms 57 fields against the file and reads the record size
  from it (the size could not be determined while planning). Import only
  `#wow/dbc` (contract 1.12, D11).
- [ ] **Step 6: Failing store tests.** In `store.test.ts`, over
  `new ReputationStore(deps)` with a test catalog set through
  `setCatalog`:
  - 0x122 replaces `factions` and clears pending flags; it emits
    `initialized` with `count` (factions with a non-zero flag or
    standing) and `visible`;
  - 0x124 sets each entry's delta and keeps its flags; it emits one
    `standing_changed` per entry with `repListId`, `factionId`, `name`,
    `before`, `after` (base plus delta when the catalog and the
    character's race and class are known, else the delta), `rank`,
    `rankChanged` and `increased`;
  - a 0x124 that drops a standing to Hostile or below sets `AT_WAR`
    (0x02) in `inferredFlags` and marks the event `atWar: true`; a rise
    from Hostile to Unfriendly or above clears it when the faction can
    be set at war (`ReputationMgr.cpp:432-436`); the flags read by
    `list()` combine stored, inferred and pending flags;
  - 0x123 sets `VISIBLE` (0x01) and emits `visible` with `repListId` and
    `name`;
  - a change of the watched field (`receiveWatched(value)`) emits
    `watched_changed`; `0xFFFFFFFF` is none (`Entities/Player/Player.cpp:549`);
  - `list({ visibleOnly: true })` gives rows `{ repListId, factionId,
    name, standing, rank, rankFloor, rankCeiling, atWar, inactive,
    visible, watched, changedAt }`, most recently changed first;
  - with no catalog the store keeps deltas, `rank` is `undefined`, and
    nothing throws (design 5.17 risk 11);
  - `clear()` empties everything and emits nothing; `dispose()` clears
    listeners.
- [ ] **Step 7: Store.** `store.ts` exports `ReputationState` (`factions`
  as a list of rows, `watched`, `catalog: boolean`), `ReputationEvent`,
  `FACTION_FLAGS` (`src/server/shared/DataStores/DBCEnums.h:307-314`)
  and `ReputationStore` with `snapshot`, `onEvent`, `dispose`,
  `setCatalog`, `setCharacter(raceMask, classMask)`, `initialize`,
  `setStanding`, `setVisible`, `receiveWatched`, `list`, `standing`,
  `rank` and `clear`. The emitter is a plain `new Emitter()`; the store
  sends nothing and arms no timer (contract 1.2). Events carry numbers
  and strings only.
- [ ] **Step 8: Failing runtime tests.** In `runtime.test.ts`, over
  `areaRig("reputation", { dbc })` with a fake `DbcSource` that serves
  the test catalog bytes:
  - the runtime loads the catalog once and hands it to the store; a
    missing `dbc` leaves `catalog: false`;
  - an `entity` event for the character whose `rawFields` hold
    `UNIT_FIELDS.BYTES_0` (race 10, class 8) sets the masks
    `1 << (race - 1)` and `1 << (class - 1)` on the store;
  - an `entity` update of `PLAYER_FIELDS.WATCHED_FACTION_INDEX` calls
    `receiveWatched`;
  - an `entity` event for another guid changes nothing.
- [ ] **Step 9: Runtime and registration.** `runtime.ts` exports
  `reputationRuntime(ctx, store)`: it loads the catalog from `ctx.dbc`
  with `.catch(ignoreFailure)`, and listens to `entity` for the
  character's fields (`ctx.selfGuid()`). `area.ts` registers `on` for
  0x122, 0x123 and 0x124, lists the event types in `eventTypes` and
  builds the store. `opcodes.ts`: delete the `SMSG_INITIALIZE_FACTIONS`
  stub line.
- [ ] **Step 10: Area test.** `area.test.ts`, over `areaRig("reputation")`:
  inject a 0x122 then a 0x124 built by the step 1 builders and check
  `rig.handle.state()` and the events on `rig.handle.onEvent`. Run the
  reviewer's revert check on your own tree once.
- [ ] **Step 11: Live proof** (below).
- [ ] **Step 12: Docs.** Write `docs/areas/reputation.md` with the fixed
  headings of contract 3.8: wire notes (the `u32` list id against wowm's
  `u16` faction for 0x123 and 0x124 with both citations; the standing is
  a delta from the `Faction.dbc` base; the server sets `AT_WAR` without
  telling the client until the next login); "Left out": the four opcodes
  of later tasks, named as "built by world-4" or "built by world-5";
  "Capabilities row": the row of world-8b; the three proof rows. Run
  `mise protocol:cite-check` and `mise lint:docs`.
- [ ] **Step 13: Checks.** `mise protocol:coverage`, `mise typecheck
  core`, `mise lint packages/core/src/wow/areas/reputation`,
  `mise ci:checks`.

**Proof:** live, on the task's own accounts (contract 0.7):

1. `mise factory soap create fresh` (a blood elf at Sunstrider Isle;
   note the account, never print the password).
2. Start `mise protocol:probe <ACCOUNT> --flow login --expect
   SMSG_INITIALIZE_FACTIONS --expect SMSG_SET_FACTION_STANDING --wait
   120` in the background. While it waits, run `mise factory soap gm
   <ACCOUNT> quest add 8325`, `quest complete 8325` and `quest reward
   8325`. Quest 8325 rewards faction 911 (Silvermoon City) in the base
   data (`RewardFactionID1` 911, `RewardFactionValue1` 5,
   `data/sql/base/db_world/quest_template.sql:3805`); the live database
   could differ. The reward calls `SetReputation`, which sends 0x124
   (`ReputationMgr.cpp:373`). Exit 0 proves 0x122 and 0x124 live.
3. `mise factory soap gm <ACCOUNT> read reputation` after the probe logs
   out. Compare the Silvermoon City value with the base plus delta the
   store computed; record both in the report. A mismatch fails the task.
4. 0x123: record whether the probe received it. If not, keep the mock
   proof (the `area.test.ts` case built from `ReputationMgr.cpp:252-261`),
   add `SMSG_SET_FACTION_VISIBLE` to `unseen`, and write the row as
   `mock`, "not seen live". The realm-service `rep` setup endpoint
   (`docs/factory.md:76`) may stage a first gain for a hidden faction;
   its body could not be determined, so the plan does not rely on it.
5. `mise factory soap delete <ACCOUNT>`.

If the server or SOAP is down, report it and stop (contract 0.6).

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_INITIALIZE_FACTIONS` | `live` | probe flow `login`, exit 0 | `Reputation/ReputationMgr.cpp:211` |
| `SMSG_SET_FACTION_STANDING` | `live` | probe flow `login` with `soap gm quest reward 8325`, exit 0 | `Reputation/ReputationMgr.cpp:178` |
| `SMSG_SET_FACTION_VISIBLE` | `live` or `mock` | the probe count, or `area.test.ts` | `Reputation/ReputationMgr.cpp:252` |

**Commit:**

```
feat: Track reputation with each faction

The server sends the faction list at login and every standing change,
and Peon dropped them. Keeping them, with the base values from
Faction.dbc, gives each faction's standing and rank.
```

---

## Task world-5: Forced reactions and reputation hostility

**codeArea:** `reputation`. **Phase:** 1. **Size:** M. **Proof:** live
(the empty list) and mock (a non-empty list).

Rulings: SR1-world-2, SR1-world-7, SR1-world-8, SR1-world-9.

**Files:**

- Create: `packages/core/src/wow/areas/reputation/relation.ts` and
  `relation.test.ts`
- Modify: `packages/core/src/wow/areas/reputation/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.ts`, `area.test.ts`,
  `opcodes.ts` (`unseen`)
- Modify: `packages/core/test-support/areas/reputation.ts`
- Modify (lease): `packages/core/src/wow/unit-relation.ts` and
  `unit-relation.test.ts`
- Modify: `docs/areas/reputation.md`
- `COORD` (not this task): `packages/core/src/wow/client-control.ts`
  `unitRelationOf` (issue 2)
- Regenerate: `docs/protocol-coverage/reputation.md`

**Depends on:** world-3, the `unit-relation.ts` lease, the `COORD` edit
of issue 2 (before step 8).

**Opcodes:** `SMSG_SET_FORCED_REACTIONS` (0x2A5).

**Wire:** `u32` count, then per entry a `u32` faction id (`Faction.dbc`,
not a template and not a list id) and a `u32` rank
(`Reputation/ReputationMgr.cpp:165-176`). The packet is the whole list,
so it replaces the stored one. wowm types the faction as `u16`
(`faction/smsg_set_forced_reactions.wowm:1-13`); AzerothCore wins. The
server sends it at every login (`Entities/Player/Player.cpp:11809`) and
on every apply and removal of a force-reaction aura
(`Spells/Auras/SpellAuraEffects.cpp:5692-5707`).

**Steps:**

- [ ] **Step 1: Builder and failing parser test.** Add
  `reputationSetForcedReactionsBody(reactions)` (as
  `ReputationMgr.cpp:167-173`). `parseSetForcedReactions` returns `{
  reactions: { factionId, rank }[] }` for an empty list and for two
  8-byte entries. Run the test and see it fail.
- [ ] **Step 2: Parser.** Add `parseSetForcedReactions` to `protocol.ts`.
- [ ] **Step 3: Failing store tests.** 0x2A5 replaces `forced`;
  `forced_changed` fires only when the list differs, with `added` and
  `removed` as lists of `{ factionId, rank }`; `forcedRank(factionId)`
  reads it; the snapshot lists the forced reactions.
- [ ] **Step 4: Store.** Add `setForced`, `forcedRank` and the snapshot
  field.
- [ ] **Step 5: Failing relation tests.** `relation.test.ts` tests the
  pure function `reputationReaction(view, catalog, targetFaction)` and
  `unit-relation.test.ts` tests `targetRelation`, each case from
  `Entities/Unit/Unit.cpp:6830-7016`:
  - a forced rank for the target template's faction wins over the
    template masks (`:6843-6855`, `:6960-6963`): Friendly on a hostile
    template gives `friendly`;
  - for a creature whose faction has a reputation list id
    (`CanHaveReputation`, `reputationListID >= 0`), the creature's
    reaction to the character is the character's rank, capped at
    Neutral when at war (`:6973-6984`): Hated gives `hostile`, Honored
    gives `friendly`, Honored and at war gives `neutral`;
  - that reputation result decides the relation alone: a template that
    is friendly toward the character's template still gives `hostile`
    when the character is Hated (the "friendly wins" rule of
    `unit-relation.ts:35-37` does not apply to reputation factions);
  - ranks map as `Unit::IsHostileTo` and `IsFriendlyTo`
    (`:7008-7016`): rank 0-1 hostile, 4-7 friendly, else neutral;
  - a player target keeps the template rule (AzerothCore's
    player-versus-player branch, `:6857-6906`, is not modelled);
  - with no `reputation` in `RelationDeps`, every case of today's
    `unit-relation.test.ts` passes unchanged;
  - with the view but no catalog, the template rule holds.
- [ ] **Step 6: Relation.** In the leased `unit-relation.ts`, export the
  type `ReputationRelationView = { forcedRank: (factionId: number) =>
  number | undefined; reputationRank: (factionId: number) => number |
  undefined; atWar: (factionId: number) => boolean }` and add
  `reputation?: ReputationRelationView` to `RelationDeps`. `unitRelation`
  maps the target template to its faction with
  `FactionTemplateCatalog.get(id).faction` (`faction-template.ts:7`) and
  applies the order of design 5.17 section "Stores": forced rank first,
  then the reputation rank for a faction with reputation, then the
  template masks. `relation.ts` in the area builds the view over the
  store and the catalog; it imports `ReputationRelationView` as a type
  only.
- [ ] **Step 7: Runtime act.** `ReputationActs` gains `relationView: () =>
  ReputationRelationView`. It is not in `worldActs`. Test over
  `areaRig("reputation")`: after an injected 0x122 and 0x2A5,
  `rig.handle.act.relationView()` answers `forcedRank`, `reputationRank`
  and `atWar` from the store.
- [ ] **Step 8: Wiring check.** After the `COORD` edit of issue 2 has
  landed, add one test to `unit-relation.test.ts` or run the existing
  `client-control.test.ts` to show `queryNearby` rows use the new rule
  (`client-control.test.ts:38`). If the `COORD` edit has not landed,
  commit steps 1-7 and stop `blocked`, naming `client-control.ts`
  `unitRelationOf`.
- [ ] **Step 9: Registration.** `area.ts` registers `on` for 0x2A5 and adds
  `forced_changed` to `eventTypes`.
- [ ] **Step 10: Docs and checks.** Add the proof row and the hostility
  wire note (the AzerothCore order, and that player targets keep the
  template rule) to `docs/areas/reputation.md`; "Capabilities row" gains
  the `t0-hostiles` limit text of issue 7. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise typecheck core`, `mise ci:checks`.

**Proof:**

1. `mise factory soap create eversong10`, then `mise protocol:probe
   <ACCOUNT> --flow login --expect SMSG_SET_FORCED_REACTIONS`. Exit 0
   proves 0x2A5 live with the empty list. `mise factory soap delete
   <ACCOUNT>`.
2. A non-empty list needs a force-reaction aura (disguise quests), and no
   `Console::Yes` command applies an aura (`scripts/Commands/cs_misc.cpp:97-101`
   is `Console::No`). Keep the `area.test.ts` case built from
   `ReputationMgr.cpp:165-176` for the non-empty list; the proof row
   stays `live` for the opcode and names the mock case for the non-empty
   list in "Evidence".
3. Hostility regression (contract 3.6, D17), from an eval worktree of the
   task head: `mise eval run t0-hostiles --round <n>` and `mise eval run
   t3-ghostlands-kill --round <n>`. Neither may show a failure cause that
   the R0 baseline did not show. `t3-ghostlands-kill` fails on `main`
   already (no kill credit, only gray mobs); only a new cause counts.
   Record both verdicts.
4. Optional, not required: a Hated standing with a reputation faction
   staged offline through the realm-service `rep` endpoint
   (`docs/factory.md:76`; body could not be determined) would show a
   guard of that faction as `hostile` in the probe's nearby rows. Record
   it if the builder finds the body shape.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_SET_FORCED_REACTIONS` | `live` | probe flow `login`, exit 0 (empty list); `area.test.ts` non-empty list | `Reputation/ReputationMgr.cpp:165` |

**Commit:**

```
feat: Apply reputation and forced reactions

AzerothCore decides a creature's reaction from a forced reaction or the
character's reputation before the faction templates. Peon used only the
templates, so reputation guards and disguises had the wrong hostility.
```

---

## Task world-1: The UI timer on `time`

**codeArea:** `time` (lease). **Phase:** 1. **Size:** S. **Proof:** live.

Rulings: SR1-world-1.

**Files** (all under the lease of issue 1):

- Modify: `packages/core/src/wow/areas/time/protocol.ts` and
  `protocol.test.ts`, `store.ts` and `store.test.ts`, `runtime.ts` and
  `runtime.test.ts`, `area.ts`
- Modify: `packages/core/test-support/areas/time.ts`
- Modify: `packages/harness/src/areas/time/area.ts` and `area.test.ts`
  (`worldActs`)
- Modify: `docs/areas/time.md`
- Regenerate: `docs/protocol-coverage/time.md`

**Depends on:** item6, `S0-5`, `SEED-1` (with the two `owns` names of
issue 1), `T-3`, the `time` lease.

**Opcodes:** `CMSG_WORLD_STATE_UI_TIMER_UPDATE` (0x4F6),
`SMSG_WORLD_STATE_UI_TIMER_UPDATE` (0x4F7).

**Wire:** 0x4F6 has an empty body (`Handlers/MiscHandler.cpp:1614-1622`,
`STATUS_LOGGEDIN`, `Server/Protocol/Opcodes.cpp:1401`). The reply 0x4F7
is one `u32`, the game time in Unix seconds
(`Server/Packets/MiscPackets.cpp:137-142`). wowm agrees
(`queries/cmsg_world_state_ui_timer_update.wowm:1-3`,
`queries/smsg_world_state_ui_timer_update.wowm:3-6`).

**Steps:**

- [ ] **Step 1: Builder and failing parser test.** Add
  `timeUiTimerUpdateBody({ gameTime })` to
  `packages/core/test-support/areas/time.ts` (as `MiscPackets.cpp:139`).
  `parseUiTimerUpdate` returns `{ gameTime }`. Run the test and see it
  fail.
- [ ] **Step 2: Parser.** Add `parseUiTimerUpdate` to
  `areas/time/protocol.ts`.
- [ ] **Step 3: Failing store test.** `receiveUiTime(gameTime)` sets
  `TimeState.uiTime` and `uiTimeAt` from `now()` and emits `ui_time`
  with a detached state. The fields of contract 1.10 keep their names;
  the two new fields are added, none renamed.
- [ ] **Step 4: Store.** Add `uiTime: number | undefined` and `uiTimeAt:
  number | undefined` to `TimeState`, `"ui_time"` to the `TimeEvent`
  type union, and `receiveUiTime` to `TimeStore`.
- [ ] **Step 5: Failing runtime tests** over `areaRig("time")`:
  `act.requestUiTime()` sends one 0x4F6 with an empty body and resolves
  with the state after an injected 0x4F7; two calls at once send one
  packet and share the answer (the reply carries no request id); with no
  reply it rejects `timeout` after 5 s (fake timers in `try`/`finally`).
- [ ] **Step 6: Runtime and area.** `TimeActs` gains `requestUiTime: () =>
  Promise<TimeState>`. `area.ts` registers `on` for 0x4F7 and adds
  `ui_time` to `eventTypes`. Nothing sends 0x4F6 by itself.
- [ ] **Step 7: Harness.** `timeHarness.worldActs` becomes `["query",
  "requestUiTime"]`. The `event` rule returns `[]` for `ui_time` (not
  logged, design 5.17 "Verbs"). Test both, and that
  `claim.areas.time.requestUiTime` exists.
- [ ] **Step 8: Docs and checks.** Add two proof rows to
  `docs/areas/time.md`. `mise protocol:coverage`, `mise
  protocol:cite-check`, `mise typecheck core`, `mise typecheck harness`,
  `mise ci:checks`.

**Proof:** live. `mise factory soap create eversong10`; `mise
protocol:probe <ACCOUNT> --send CMSG_WORLD_STATE_UI_TIMER_UPDATE --expect
SMSG_WORLD_STATE_UI_TIMER_UPDATE`: exit 0 proves both; `mise factory
soap delete <ACCOUNT>`.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_WORLD_STATE_UI_TIMER_UPDATE` | `live` | probe `--send`, exit 0; the reply follows | `Handlers/MiscHandler.cpp:1614` |
| `SMSG_WORLD_STATE_UI_TIMER_UPDATE` | `live` | the same probe run | `Server/Packets/MiscPackets.cpp:137` |

**Commit:**

```
feat: Read the server's UI timer game time

The world state timer reply is the server's game clock. Extensions can
now ask for it through the world service instead of guessing the time.
```

---

## Task world-2: World states, weather and the zone notice

**codeArea:** `ambience`. **Phase:** 1. **Size:** S. **Proof:** live
(0x2C3, 0x2F4) and accepted (`CMSG_ZONEUPDATE`).

Rulings: SR1-world-8.

**Files:**

- Create: `packages/core/src/wow/areas/ambience/protocol.ts` and
  `protocol.test.ts`, `store.ts` and `store.test.ts`, `runtime.ts` and
  `runtime.test.ts`, `area.test.ts`
- Create: `packages/core/test-support/areas/ambience.ts`
- Create: `docs/areas/ambience.md`
- Modify: `packages/core/src/wow/areas/ambience/area.ts` (seeded),
  `opcodes.ts` (`uses`; delete the `SMSG_WEATHER` stub line)
- Regenerate: `docs/protocol-coverage/ambience.md`,
  `docs/protocol-coverage/core.md`

**Depends on:** item6, `S0-5`, `SEED-1`, `T-2`, `T-3`, `T-5` (`tele`
for a second zone).

**Opcodes:** `SMSG_UPDATE_WORLD_STATE` (0x2C3), `SMSG_WEATHER` (0x2F4),
`CMSG_ZONEUPDATE` (0x1F4).

**Wire:**

- 0x2C3: `i32` state id, `i32` value
  (`Server/Packets/WorldStatePackets.cpp:40-46`, types at
  `Server/Packets/WorldStatePackets.h:56-57`). wowm says `u32`
  (`world/smsg_update_world_state.wowm:1-5`); read both signed.
- 0x2F4: `u32` state, `f32` intensity, `u8` abrupt
  (`Server/Packets/MiscPackets.cpp:25-32`). AzerothCore has state 106
  (`WEATHER_STATE_BLACKSNOW`, `Weather/Weather.h:60`), which wowm's enum
  lacks (`world/smsg_weather.wowm:52-76`). Unknown states stay numbers.
- 0x1F4: `u32` zone id (`Handlers/MiscHandler.cpp:521-532`). The server
  ignores the value and only sets `m_needZoneUpdate` (`:526-529`); it
  re-checks the zone every second by itself
  (`Entities/Player/PlayerUpdates.cpp:280-311`). Core never sends it by
  itself (design 5.17 "Acts").
- `SMSG_INIT_WORLD_STATES` (handled in `client-handlers.ts:150`) carries
  the zone's full state list; `PlaceStore` drops it
  (`client-place.ts:38-43`). The area reads it with `peek` (N3), parsed
  by the existing `parseInitWorldStates` (`protocol/world-states.ts:11-20`,
  an allowed value import).

**Steps:**

- [ ] **Step 1: Builders.** `ambienceUpdateWorldStateBody({ id, value })`
  and `ambienceWeatherBody({ state, intensity, abrupt })`, in the order
  of the writers above. For the peek test, build an
  `SMSG_INIT_WORLD_STATES` body in the same file as
  `ambienceInitWorldStatesBody({ mapId, zoneId, areaId, states })`
  (`Server/Packets/WorldStatePackets.cpp:22-38`).
- [ ] **Step 2: Failing parser tests.** `parseUpdateWorldState` reads a
  negative value; `parseWeather` keeps state 106 and a fractional
  intensity; `buildZoneUpdate(3430)` writes the four bytes `66 0d 00 00`
  that `MiscHandler.cpp:523-524` reads.
- [ ] **Step 3: Parsers and builder** in `areas/ambience/protocol.ts`.
- [ ] **Step 4: Failing store tests** (`new AmbienceStore(deps)`):
  `resetStates(list)` replaces `states`; 0x2C3 sets one key and emits
  `world_state` with `id`, `value` and `previous`; 0x2F4 sets `weather`
  and emits `weather` only when state or intensity differ; `clear()`
  empties everything; `snapshot()` gives `states` as `{ id, value }[]`.
- [ ] **Step 5: Store.** `AmbienceState` (`states`, `weather`) and
  `AmbienceStore`. Later tasks add fields.
- [ ] **Step 6: Failing area and runtime tests** over
  `areaRig("ambience")`: an injected `SMSG_INIT_WORLD_STATES` (a `uses`
  opcode, given a no-op owner by the rig, contract 1.8) seeds `states`
  through the peek; an injected 0x2C3 then updates one key;
  `act.sendZoneUpdate(3430)` records one 0x1F4 in `rig.sent`; an
  injected `SMSG_NEW_WORLD` clears `states` and `weather`.
- [ ] **Step 7: Runtime and registration.** `ambienceRuntime` returns `{
  act: { sendZoneUpdate } }`. `area.ts` registers `on` for 0x2C3 and
  0x2F4 and `peek` for `SMSG_INIT_WORLD_STATES` and `SMSG_NEW_WORLD`.
  `opcodes.ts`: `uses: ["SMSG_INIT_WORLD_STATES", "SMSG_NEW_WORLD"]`;
  delete the `SMSG_WEATHER` stub line. `eventTypes`: `world_state`,
  `weather`.
- [ ] **Step 8: Docs and checks.** `docs/areas/ambience.md` with the
  fixed headings: wire notes (signed world states against wowm's `u32`;
  weather state 106; the zone value is ignored); "Left out": the three
  dead opcodes with their evidence and the opcodes of world-6 and
  world-7 as "built by world-6" and "built by world-7"; "Capabilities
  row": "No verb (N23); the world service reads world states and
  weather." Run `mise protocol:coverage`, `mise protocol:cite-check`,
  `mise lint:docs`, `mise typecheck core`, `mise ci:checks`.

**Proof:**

1. `mise factory soap create eversong10`.
2. `mise protocol:probe <ACCOUNT> --flow login --expect
   SMSG_UPDATE_WORLD_STATE --expect SMSG_WEATHER --send CMSG_ZONEUPDATE
   --body 660d0000 --wait 10`. Exit 0 proves 0x2C3 and 0x2F4 live; the
   `CMSG_ZONEUPDATE` send with no disconnect and no packet error is the
   `accepted` proof (contract 0.6).
3. If 0x2F4 did not arrive at login (seen at 4 of 5 logins), run the
   probe again with `--wait 60` and, while it waits, `mise factory soap
   gm <ACCOUNT> tele <tele>` to another zone; the zone entry sends the
   zone's weather (`Maps/Map.cpp:3254-3265`). Which `tele` name reaches
   Silvermoon City or the Ghostlands could not be determined; the
   builder reads `soap gm` usage. If it still does not arrive, keep the
   mock case built from `MiscPackets.cpp:25-32` and add `SMSG_WEATHER`
   to `unseen`.
4. `mise factory soap delete <ACCOUNT>`.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_UPDATE_WORLD_STATE` | `live` | probe flow `login`, exit 0 | `Server/Packets/WorldStatePackets.cpp:40` |
| `SMSG_WEATHER` | `live` | probe flow `login`, exit 0 | `Server/Packets/MiscPackets.cpp:25` |
| `CMSG_ZONEUPDATE` | `accepted` | probe `--send`, no disconnect, no error | `Handlers/MiscHandler.cpp:521` |

**Commit:**

```
feat: Track world states and weather

Every login and zone change sends the zone's world states and weather,
and Peon dropped them. Keeping them lets the instances and PvP areas
read counters and timers from one place.
```

---

## Task world-7: Cinematics and movies

**codeArea:** `ambience`. **Phase:** 1. **Size:** S. **Proof:** live
(0x0FA), accepted (0x0FB, 0x0FC) and mock (0x464).

Rulings: SR1-world-3, SR1-world-8.

**Files:**

- Modify: `packages/core/src/wow/areas/ambience/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.ts`, `area.test.ts`,
  `opcodes.ts` (`unseen`)
- Modify: `packages/core/test-support/areas/ambience.ts`
- Modify: `docs/areas/ambience.md`
- Regenerate: `docs/protocol-coverage/ambience.md`

**Depends on:** world-2 (the ambience files), `T-3`.

**Opcodes:** `SMSG_TRIGGER_CINEMATIC` (0x0FA),
`CMSG_NEXT_CINEMATIC_CAMERA` (0x0FB), `CMSG_COMPLETE_CINEMATIC` (0x0FC),
`SMSG_TRIGGER_MOVIE` (0x464).

**Wire:**

- 0x0FA: `u32` cinematic sequence id
  (`Entities/Player/Player.cpp:5878-5883`), sent at the first login of a
  new character (`Handlers/CharacterHandler.cpp:889-899`, guarded by the
  saved cinematic flag). AzerothCore also sends any
  `CinematicSequences.dbc` id from a game object or a smart script
  (`Entities/GameObject/GameObject.cpp:1714`,
  `AI/SmartScripts/SmartScript.cpp:3020`); wowm's enum lists only the
  race sequences (`cinematic/smsg_trigger_cinematic.wowm:46-70`). Keep
  unknown ids.
- 0x0FB and 0x0FC: empty bodies (`Handlers/MiscHandler.cpp:940-950`,
  `STATUS_LOGGEDIN`, `Server/Protocol/Opcodes.cpp:382-383`). 0x0FC ends
  the camera, a no-op when none is active
  (`Entities/Player/CinematicMgr.cpp:65-75`). 0x0FB starts the camera and
  moves the server's sight position (`CinematicMgr.cpp:38-63`), so core
  never sends it in play; it returns at once when no camera is active
  (`:40-42`).
- 0x464: `u32` movie id (`Entities/Player/Player.cpp:5885-5890`), from
  the map script `PLAY_MOVIE` command (`Scripting/MapScripts.cpp:873`).
  `.debug play movie` is `Console::No`
  (`src/server/scripts/Commands/cs_debug.cpp:62`).

**Steps:**

- [ ] **Step 1: Builders and failing tests.**
  `ambienceTriggerCinematicBody(sequenceId)` and
  `ambienceTriggerMovieBody(movieId)`. Parser tests for both; builder
  tests that `buildCompleteCinematic()` and `buildNextCinematicCamera()`
  give empty bodies.
- [ ] **Step 2: Parsers and builders** in `protocol.ts`.
- [ ] **Step 3: Failing store and runtime tests** over
  `areaRig("ambience")`:
  - an injected 0x0FA sets `cinematic: { sequenceId, at, completed:
    false }` and emits `cinematic`; the runtime then sends exactly one
    0x0FC at once (check `rig.sent`) and the store marks `completed:
    true` and emits `cinematic` again with `completed: true` (N30: the
    intro cinematic completed automatically);
  - no 0x0FB is ever sent by the runtime;
  - `act.completeCinematic()` sends one 0x0FC;
  - `act.nextCinematicCamera()` sends one 0x0FB;
  - an injected 0x464 sets `movie: { movieId, at }` and emits `movie`;
    no reply is sent (`CMSG_COMPLETE_MOVIE` is dead).
- [ ] **Step 4: Store, runtime, registration.** Add `cinematic` and
  `movie` to `AmbienceState`; `completeCinematic` and
  `nextCinematicCamera` to `AmbienceActs`; the auto-complete inside the
  runtime's `onEvent` subscription (the runtime subscribes before the
  forwarder, contract 1.3). `area.ts` registers `on` for 0x0FA and 0x464
  and adds `cinematic` and `movie` to `eventTypes`. The design's config
  switch is not built (issue 3).
- [ ] **Step 5: Docs and checks.** Add the four proof rows and the wire
  notes (unknown sequence ids; 0x0FB moves the server's view and is
  never sent in play) to `docs/areas/ambience.md`; `SMSG_TRIGGER_MOVIE`
  goes into `unseen`. `mise protocol:coverage`, `mise
  protocol:cite-check`, `mise typecheck core`, `mise ci:checks`.

**Proof:**

1. `mise factory soap create fresh` (a new character that has never
   logged in).
2. `mise protocol:probe <ACCOUNT> --flow login --expect
   SMSG_TRIGGER_CINEMATIC --send CMSG_NEXT_CINEMATIC_CAMERA --wait 5`.
   Exit 0 proves 0x0FA live. The output's sent packets list the core's
   own 0x0FC right after 0x0FA, and the probe's 0x0FB after it; with no
   disconnect and no packet error both are `accepted` (the server has no
   reply for either; `CinematicMgr.cpp:40-42`, `:67-68`).
3. `mise factory soap delete <ACCOUNT>`.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_TRIGGER_CINEMATIC` | `live` | probe flow `login` on a `fresh` account, exit 0 | `Entities/Player/Player.cpp:5878` |
| `CMSG_COMPLETE_CINEMATIC` | `accepted` | the same run: core's send, no disconnect | `Handlers/MiscHandler.cpp:940` |
| `CMSG_NEXT_CINEMATIC_CAMERA` | `accepted` | probe `--send` after the complete, no disconnect | `Handlers/MiscHandler.cpp:946` |
| `SMSG_TRIGGER_MOVIE` | `mock` | `area.test.ts`, not seen live | `Entities/Player/Player.cpp:5885` |

**Commit:**

```
feat: Skip the intro cinematic

Every new character starts a race or class cinematic at its first
login. Core now ends it at once, as a player who skips it would, and
records movies the server starts.
```

---

## Task world-8a: Reputation and cinematic rows in the game log

**codeArea:** `reputation` (the task also edits the `ambience` harness
module). **Phase:** 1. **Size:** S.
**Proof:** live.

Rulings: SR1-world-8.

**Files:**

- Modify: `packages/harness/src/areas/reputation/area.ts` and
  `area.test.ts`
- Modify: `packages/harness/src/areas/ambience/area.ts` and
  `area.test.ts`
- Modify: `docs/areas/reputation.md`, `docs/areas/ambience.md`

**Depends on:** world-3, world-5, world-7 (their event types), `S0-3`.

**Opcodes:** none.

**Rows** (design 5.17 "Verbs"; the router sets `domain` and
`event: <area>/<name>`, contract 1.9):

| Area event | Row | Class | Text |
|---|---|---|---|
| `standing_changed`, no rank change | `reputation/changed` | `log` | "Silvermoon City reputation +250: Friendly 1250/6000." |
| `standing_changed` with `rankChanged` | `reputation/rank` | `log` | "You are now Honored with Silvermoon City." |
| `standing_changed` with `atWar` | `reputation/at_war` | `log` | "You are now at war with Booty Bay; its guards will attack you." |
| `visible` | `reputation/discovered` | `log` | "You discovered the faction Tranquillien." |
| `forced_changed` | `reputation/forced` | `wake` outside a run, `log` inside | "Units of Dragonmaw now treat you as Friendly while an effect lasts." |
| `cinematic` with `completed: true` | `ambience/cinematic` | `passive` | "The intro cinematic started; Peon skipped it." |
| `movie` | `ambience/movie` | `passive` | "The server started movie 14; Peon cannot show it." |
| `initialized`, `watched_changed`, `flags_pending`, `world_state`, `weather`, `cinematic` with `completed: false` | none | | the rule returns `[]` (flood guard G17, N12) |

A standing change with no catalog writes the delta only ("Silvermoon City
reputation +250."). `data` carries `repListId`, `factionId`, `before`,
`after`, `rank`, and for `ambience/cinematic` the `sequenceId`.

**Steps:**

- [ ] **Step 1: Failing tests.** In each harness `area.test.ts`, feed the
  area events above through `rules().event` with a `RuleInput` whose
  `runActive` is false and then true, and check each row's name, class
  and text; check that each "none" event returns `[]` and so writes no
  fallback row; run `mise test packages/harness/src/areas/reputation
  packages/harness/src/areas/ambience` and see them fail.
- [ ] **Step 2: Rules.** Add `rules: () => ({ event })` to
  `reputationHarness` and `ambienceHarness`, sorted keys. No `attach`
  rule: the reputation list is read with `journal` (world-8b).
- [ ] **Step 3: Checks.** `mise typecheck harness`, `mise lint
  packages/harness/src/areas`, `mise ci:checks`.

**Proof:** live, a harness run on the task's own account.
`mise factory soap create fresh`; run the harness on it with
`--packet-trace headers`; at the first turn, while the agent idles, run
`mise factory soap gm <ACCOUNT> quest add 8325`, `quest complete 8325`,
`quest reward 8325`. The game log shows one `ambience/cinematic` row and
one `reputation/changed` or `reputation/rank` row for Silvermoon City.
Record the rows' text in the report; `mise factory soap delete
<ACCOUNT>`. No eval: the rows are read surfaces; world-8b's eval checks
them through the agent.

**Commit:**

```
feat: Log reputation changes and cinematics

The agent now sees each reputation gain, rank change and discovered
faction in the game log, and why its first login showed a skipped
cinematic, without rows for world states or weather.
```

---

## Task world-8b: Reputation in `journal` and the reputation eval

**codeArea:** `reputation`. **Phase:** 1. **Size:** M. **Proof:** eval.

Rulings: SR1-world-4, SR1-world-5, SR1-world-6, SR1-world-7.

**Files:**

- Create: `packages/harness/src/areas/reputation/journal.ts` and
  `journal.test.ts` (issue 6)
- Create: `packages/harness/src/grader/scenarios/t4-reputation-gain.json`
- Modify (lease, issue 5): `packages/harness/src/tools/journal.ts` and
  `journal.test.ts`; the `journalParams` block of
  `packages/harness/src/tools/params.ts`; the `journal` `After` block of
  `packages/harness/src/contract/details.ts`; the `journal` row of
  `docs/harness.md`
- Modify (shared, contract 2.6 and 3): `packages/harness/src/grader/scenarios.ts`
  (`ROUND_1`, append), `docs/capabilities.md`, `docs/evals.md`
- Modify: `docs/areas/reputation.md` ("Capabilities row" and the eval
  verdict)

**Depends on:** world-8a, world-1 (unit order), `S0-5` (the daily reset),
the journal lease (held first by spells-12a and spells-14; D12).

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing renderer tests.** In
  `areas/reputation/journal.test.ts`, `reputationLines(state, find?)`
  over an `AreaState<"reputation">` gives one line per visible faction,
  most recently changed first, within 24 lines:
  "Silvermoon City: Friendly 1250/6000.", "Booty Bay: Neutral 0/3000, at
  war.", and "Watched: Silvermoon City." last; `find` filters by faction
  name; with no catalog a line reads "Silvermoon City: +250 from the
  base (ranks unknown)."; with no factions it says so.
- [ ] **Step 2: Renderer.** `reputationLines` and `dailyResetLine(time,
  now)` ("Daily quests reset in 5 h 12 m.", from
  `time.state().dailyResetInSec` and `receivedAt`, or nothing when
  unknown).
- [ ] **Step 3: Failing journal tests.** In `tools/journal.test.ts`, on a
  mock game whose `reputation.state()` holds two factions:
  `journal about: "reputation"` returns the lines and an `After` of
  `about: "reputation"`; `journal about: "quests"` gains the daily-reset
  header when `time.state()` holds a reply; the tool's
  `text.description` names "your reputation with each faction". Call
  `expectSendKind(journalTool)` once (contract 1.9): the tool stays kind
  `read` and sends nothing.
- [ ] **Step 4: Journal.** `journalParams.about` gains `"reputation"`
  with its description; `journal.ts` dispatches it to
  `reputationLines`; the `After` block gains the `reputation` shape. The
  `docs/harness.md` journal row becomes "Quest log, bags and gear,
  spells, reputation, or the game log." Run the tests.
- [ ] **Step 5: Scenario (test first).** Write
  `t4-reputation-gain.json`, then run `mise test
  packages/harness/src/grader/scenarios.test.ts` and see it fail until
  the `ROUND_1` line is appended:
  - `"id": "t4-reputation-gain"`, `"tier": 4`, `"preset": "fresh"`,
    `"field": "sunstrider-wyrms"` (as `t4-quest-first`), `"partner":
    null`;
  - `"setup"`: the realm-service endpoints `quest/add` and
    `quest/complete` for quest 8325 (`docs/factory.md:76`), so the
    character starts with the quest ready to turn in. The body shape
    could not be determined while planning; the builder reads it from
    the realm service or `packages/factory/src/realm-service.ts:14-21`
    and asks the coordinator if neither shows it;
  - task: "Turn in your finished quest to Magistrix Erona, then tell me
    which reputations changed and by how much.";
  - checks: `rewarded` (source `truth`, 8325 in final
    `rewardedQuests`); `reputation-rows` (source `game_log`, evidence
    `events: ["reputation/changed", "reputation/rank"]`): every faction
    and amount the answer names matches a row logged after the turn-in,
    and Silvermoon City is among them. The amount is whatever the server
    sent: `RewardFactionValue1` 5 is an index into a reward table, so
    the check matches the game-log delta, never a fixed number;
  - no GM command anywhere in the scenario (contract 0.7).
- [ ] **Step 6: Docs in the same commit as the scenario** (D15): the
  `ROUND_1` line at the end (N7); a "Which scenarios to run" row
  `| Reputation and hostility (journal reputation, reputation rows,
  unit relations) | \`t4-reputation-gain\`, \`t0-hostiles\` |`; the
  capability row "Report its reputation with each faction and what
  changed it | \`t4-reputation-gain\` | Only factions the server lists.
  Standing is the Faction.dbc base plus the server's change; at war and
  inactive set by the agent show only after the next login." if the
  eval passed, or a bullet under "Not shown by any scenario" if not
  (D16).
- [ ] **Step 7: Checks.** `mise lint:docs`, `mise typecheck harness`,
  `mise ci:checks`.

**Proof:** eval. From an eval worktree of the task head, `mise eval run
t4-reputation-gain --round <n>`; record the verdict in the report and in
`docs/areas/reputation.md`. Rerun `t4-quest-first` (the same quest and
the `journal` change) and `t1-walk-to-npc` (gate, contract 3.6). No
truth pick is used, so the task does not wait for T-8b.

**Commits** (the journal change may land first; the second commit holds
the scenario with its `ROUND_1` line and doc rows, D15):

```
feat: Show reputation in the journal

The agent can now list its standing and rank with each faction, and the
quest log says when the daily quests reset.
```

```
feat: Prove the reputation report in an eval

A quest turn-in that rewards Silvermoon City reputation checks that the
agent reports what changed from the server's own standing packets.
```

---

## Task world-6: Sound, music, light and phase

**codeArea:** `ambience`. **Phase:** 3. **Size:** S. **Proof:** live or
mock (0x278, 0x2D2) and mock (0x277, 0x412, 0x47C).

**Files:**

- Modify: `packages/core/src/wow/areas/ambience/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.ts`, `area.test.ts`,
  `opcodes.ts` (delete three stub lines; `unseen`)
- Modify: `packages/core/test-support/areas/ambience.ts`
- Modify: `packages/harness/src/areas/ambience/area.ts` and test
- Modify: `docs/areas/ambience.md`
- Regenerate: `docs/protocol-coverage/ambience.md`,
  `docs/protocol-coverage/core.md`

**Depends on:** world-8a (the ambience rules exist), `T-3`. It starts
with wave 3 (phase 3).

**Opcodes:** `SMSG_PLAY_SOUND` (0x2D2), `SMSG_PLAY_MUSIC` (0x277),
`SMSG_PLAY_OBJECT_SOUND` (0x278), `SMSG_OVERRIDE_LIGHT` (0x412),
`SMSG_SET_PHASE_SHIFT` (0x47C).

**Wire** (all agree with wowm except the light fade unit):

- 0x2D2: `u32` sound kit id (`Server/Packets/MiscPackets.cpp:63-68`),
  from `PlayDirectSound` (`Entities/Object/Object.cpp:3016-3022`).
- 0x277: `u32` sound kit id (`MiscPackets.cpp:48-53`; zone music
  `Maps/Map.cpp:3296-3302`; `Object.cpp:2148-2156`).
- 0x278: `u32` sound kit id, then the full 8-byte source guid
  (`MiscPackets.cpp:55-61`), from `PlayDistanceSound`
  (`Object.cpp:3008-3014`).
- 0x412: three `u32`: default light id, override light id, fade time in
  milliseconds (`Maps/Map.cpp:3331-3345`, `LightFadeInTime` is
  `Milliseconds`). wowm types the fade as seconds
  (`cinematic/smsg_override_light.wowm:9-15`); AzerothCore wins.
- 0x47C: `u32` phase mask (`Handlers/MiscHandler.cpp:1632-1637`), sent on
  apply and removal of a phase aura
  (`Spells/Auras/SpellAuraEffects.cpp:1932-1952`); 1 when no phase aura
  is left.

**Steps:**

- [ ] **Step 1: Builders and failing parser tests.**
  `ambiencePlaySoundBody`, `ambiencePlayMusicBody`,
  `ambiencePlayObjectSoundBody({ soundKitId, source })`,
  `ambienceOverrideLightBody({ defaultId, overrideId, fadeMs })`,
  `ambienceSetPhaseShiftBody(mask)`. `parsePlayObjectSound` reads a full
  guid, not a packed one; `parseOverrideLight` returns `fadeMs`.
- [ ] **Step 2: Parsers.**
- [ ] **Step 3: Failing store and area tests** over
  `areaRig("ambience")`: 0x2D2, 0x277, 0x278 emit `sound` with `kind`
  (`sound`, `music`, `object`), `soundKitId` and `source` (a decimal
  string or empty); only music keeps state (`music`, last only); 0x412
  sets `light` and emits `light`; 0x47C sets `phaseMask` (default 1) and
  emits `phase_changed` with `from` and `to` only when it differs; an
  injected `SMSG_NEW_WORLD` resets `phaseMask` to 1.
- [ ] **Step 4: Store and registration.** Register `on` for the five
  opcodes; add `sound`, `light`, `phase_changed` to `eventTypes`; delete
  the stub lines for `SMSG_SET_PHASE_SHIFT`, `SMSG_PLAY_SOUND` and
  `SMSG_PLAY_MUSIC`.
- [ ] **Step 5: Harness rule (test first).** `ambienceHarness` gains the
  `phase_changed` row `ambience/phase`, class `log`, "Your phase
  changed. Some units and objects may appear or vanish."; `sound` and
  `light` return `[]`.
- [ ] **Step 6: Docs and checks.** Five proof rows; the light fade wire
  note with both citations. `mise protocol:coverage`, `mise
  protocol:cite-check`, `mise typecheck core`, `mise typecheck harness`,
  `mise ci:checks`.

**Proof:**

1. 0x278: `mise factory soap create elwynn1`, then `mise protocol:probe
   <ACCOUNT> --flow login --expect SMSG_PLAY_OBJECT_SOUND --wait 180`.
   The Northshire peasants script plays distance sounds
   (`src/server/scripts/EasternKingdoms/zone_elwynn_forest.cpp:432-489`);
   whether the preset spawns in range could not be determined. Exit 0
   gives `live`; exit 3 keeps the mock case built from
   `MiscPackets.cpp:55-61` and adds the opcode to `unseen`. Record any
   0x2D2 the same run receives. `mise factory soap delete <ACCOUNT>`.
2. 0x2D2, 0x277, 0x412, 0x47C: mock (R22), because every GM trigger is
   `Console::No` (`src/server/scripts/Commands/cs_debug.cpp:61-78`) and
   the natural sites are scripted, seasonal, raid-only or quest phasing
   that no level 1-10 preset reaches. Each goes into `unseen`.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_PLAY_OBJECT_SOUND` | `live` or `mock` | probe flow `login` on `elwynn1`, or `area.test.ts` | `Server/Packets/MiscPackets.cpp:55` |
| `SMSG_PLAY_SOUND` | `mock` (or `live` if seen) | `area.test.ts`, not seen live | `Server/Packets/MiscPackets.cpp:63` |
| `SMSG_PLAY_MUSIC` | `mock` | `area.test.ts`, not seen live | `Server/Packets/MiscPackets.cpp:48` |
| `SMSG_OVERRIDE_LIGHT` | `mock` | `area.test.ts`, not seen live | `Maps/Map.cpp:3331` |
| `SMSG_SET_PHASE_SHIFT` | `mock` | `area.test.ts`, not seen live | `Handlers/MiscHandler.cpp:1632` |

**Commit:**

```
feat: Track phase, light, sound and music

A phase change explains units that vanish or appear, so the agent now
sees it in the game log. Sound, music and light reach extensions
through the world service and are not logged.
```

---

## Task world-4: Faction settings

**codeArea:** `reputation`. **Phase:** 4. **Size:** S. **Proof:** live
(watched) and live through a console read (at war, inactive).

**Files:**

- Create: `packages/devtools/src/probe-flows/reputation-settings.ts`
  (and its test, if T-3 gives flows tests)
- Modify: `packages/core/src/wow/areas/reputation/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.ts`
- Modify: `packages/harness/src/areas/reputation/area.ts` and test
  (`worldActs`)
- Modify: `docs/areas/reputation.md`

**Depends on:** world-3, world-8a (the harness module has rules),
`T-3`, `T-5` (`read reputation`). It starts with wave 4 (phase 4).

**Opcodes:** `CMSG_SET_FACTION_ATWAR` (0x125),
`CMSG_SET_FACTION_INACTIVE` (0x317), `CMSG_SET_WATCHED_FACTION` (0x318).

**Wire** (AzerothCore wins; wowm keys all three with a `u16` faction):

- 0x125: `u32` list id, `u8` flag read as a boolean
  (`Handlers/CharacterHandler.cpp:1287-1296`; wowm
  `faction/cmsg_set_faction_atwar.wowm:50-55`).
- 0x317: `u32` list id, `u8` (`CharacterHandler.cpp:1340-1347`; wowm
  `faction/cmsg_set_faction_inactive.wowm:1-6`).
- 0x318: `u32` list id, stored unchecked in
  `PLAYER_FIELD_WATCHED_FACTION_INDEX` (`CharacterHandler.cpp:1333-1338`);
  `0xFFFFFFFF` is none (`Entities/Player/Player.cpp:549`). The field is
  private, so the character's own values update echoes it (wowm
  `faction/cmsg_set_watched_faction.wowm:7-11`).
- The server answers neither 0x125 nor 0x317; it refuses in silence an
  unknown list id (`Reputation/ReputationMgr.cpp:506-508`, `:539-541`),
  war or peace on an invisible-forced or hidden faction (`:510-512`),
  war on a peace-forced faction (`:520-521`), inactive on a faction that
  is not visible or is forced invisible or hidden (`:548-549`), and a
  change to the state it already has (`:524-525`, `:552-553`). The new
  flag reaches the client only in the next 0x122.

**Steps:**

- [ ] **Step 1: Failing builder tests.** `buildSetFactionAtWar(7, true)`
  gives 5 bytes `07 00 00 00 01`; `buildSetFactionInactive` the same
  shape; `buildSetWatchedFaction(undefined)` gives `ff ff ff ff`. Each
  test title names the AzerothCore reader line.
- [ ] **Step 2: Builders** in `protocol.ts`.
- [ ] **Step 3: Failing act tests** over `areaRig("reputation")` after an
  injected 0x122: `act.setAtWar(id, true)` sends one 0x125 and returns
  `{ sent: true }`, and the store's `flags_pending` event and `list()`
  show at war; each refusal of the wire note returns `{ sent: false,
  reason }` with `unknown_faction`, `cannot_change`, `own_faction`,
  `not_visible` or `unchanged` and sends nothing; a faction name resolves
  through the catalog; `act.setWatched(id)` sends one 0x318 and resolves
  when the watched field update arrives (`watched_changed`), with a 5 s
  timeout; the next 0x122 clears the pending flags.
- [ ] **Step 4: Acts.** `setAtWar`, `setInactive`, `setWatched` in
  `reputationRuntime`; `flags_pending` added to `eventTypes`.
- [ ] **Step 5: Harness.** `reputationHarness.worldActs` becomes
  `["setAtWar", "setInactive", "setWatched"]` (not `relationView`). No
  agent verb (design 5.17 "Verbs"). Test that `claim.areas.reputation`
  holds the three.
- [ ] **Step 6: Probe flow.** `reputation-settings.ts`, in the shape T-3
  gives `nearest.ts`. It waits for the reputation state, picks the
  character's own capital faction by list id (Silvermoon City for a
  blood elf, looked up by name in the catalog), calls
  `handle.reputation.act.setWatched(id)` and waits for `watched_changed`,
  then `setInactive(id, true)` and, on a faction that can be set at war
  (the builder picks one from `Faction.dbc` flags; which one could not
  be determined while planning), `setAtWar(id, true)`. It prints each
  act's result.
- [ ] **Step 7: Docs and checks.** Three proof rows and the wire notes.
  `mise protocol:cite-check`, `mise typecheck core`, `mise typecheck
  devtools`, `mise ci:checks`.

**Proof:**

1. `mise factory soap create eversong10`.
2. `mise protocol:probe <ACCOUNT> --flow reputation-settings --wait 10`.
   The watched faction's values update arrives during the run: 0x318 is
   `live`.
3. `mise factory soap gm <ACCOUNT> read reputation` after the probe logs
   out: the flag words "inactive" and "at war" appear for the two
   factions (`HandleCharacterReputationCommand`,
   `src/server/scripts/Commands/cs_character.cpp:76`). That makes 0x125
   and 0x317 `live`. If a flag word is missing, the send is still
   `accepted` (no disconnect), and the row says so.
4. `mise factory soap delete <ACCOUNT>`.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_SET_WATCHED_FACTION` | `live` | probe flow `reputation-settings`, the field update | `Handlers/CharacterHandler.cpp:1333` |
| `CMSG_SET_FACTION_INACTIVE` | `live` | the same run, then `soap gm read reputation` | `Handlers/CharacterHandler.cpp:1340` |
| `CMSG_SET_FACTION_ATWAR` | `live` | the same run, then `soap gm read reputation` | `Handlers/CharacterHandler.cpp:1287` |

**Commit:**

```
feat: Set faction war, inactive and watched

Extensions can now change the three reputation pane settings through
the world service. Core refuses what the server would drop in silence,
so the caller gets a reason instead of nothing.
```

---

## Optional tasks not scheduled

These two design tasks own no opcode. The plan does not schedule them
and leaves them out of the plan JSON; the coordinator may add them later.
Each decision is **accepted by the maintainer (P2-5)**.

- **world-9, a `faction` tool** (design 5.17 V3 option b). The design
  builds it only by choice ("not built by default"), and contract 1.9's
  tool table has no `faction` tool. Faction settings stay world-service
  acts (world-4).
- **world-10, current area and explored zones.** It needs a harness
  binding of namigator's `pathfind_get_zone_and_area` in
  `packages/harness/src/navigation/namigator.ts`, which is on no lease,
  and an `AreaTable.dbc` explore-bit map whose column could not be
  determined. It may belong to `travel` or direct drive (design 5.17
  risk 13).

## Dead opcodes

In `AMBIENCE_OPCODES.dead` from `SEED-1` (N13). Each has a `dead` row in
`docs/areas/ambience.md` (world-2 writes them):

| Opcode | Evidence |
|---|---|
| `CMSG_COMPLETE_MOVIE` (0x465) | `STATUS_NEVER` with `Handle_NULL` (`Server/Protocol/Opcodes.cpp:1256`): the server drops it, so a send proves nothing. Core never sends it after `SMSG_TRIGGER_MOVIE`. |
| `SMSG_TOGGLE_XP_GAIN` (0x4ED) | Registered `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:1392`) with no send site in `src/`. wowm: "Only exists as comment in azerothcore/trinitycore" (`exp/smsg_toggle_xp_gain.wowm:1`). |
| `SMSG_CAMERA_SHAKE` (0x50A) | Registered `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:1421`) with no send site in `src/`. wowm: "Only exists as a comment" (`cinematic/smsg_camera_shake.wowm:1`). |

## Seed rulings (SEED-1)

The coordinator rules each open issue, lease request and decision of this
file that a wave-1 task (world-3, world-5, world-1, world-2, world-7,
world-8a, world-8b) meets, before `SEED-1` (plan index "Contract issues
awaiting a ruling"). Each ruling stands in for the contract or design
text it names until the coordinator applies that text; the builder
follows the ruling. Each ruling is **accepted by the maintainer (P2-5)**.

Left alone: world-6 (wave 3), world-4 (wave 4), and the unscheduled
world-9 and world-10 ("Optional tasks not scheduled"). No issue of this
file is met only by them. The split of the design's `world-8` into
world-8a and world-8b is the plan writer's right under contract 0.10 and
needs no ruling.

### SR1-world-1: the UI timer pair and the `time` lease (world-1)

Issue 1: "The UI timer pair has no owner yet. Design 5.17 puts
`CMSG_WORLD_STATE_UI_TIMER_UPDATE` and `SMSG_WORLD_STATE_UI_TIMER_UPDATE`
in the `time` area, and contract 1.10 gives `TIME_OPCODES` only S0-5's
three names." Leases table, row 1.

Ruling: accepted as the issue proposes.

- `SEED-1` appends `CMSG_WORLD_STATE_UI_TIMER_UPDATE` and
  `SMSG_WORLD_STATE_UI_TIMER_UPDATE` to `TIME_OPCODES.owns` in
  `packages/core/src/wow/areas/time/opcodes.ts` and regenerates the
  coverage files. world-1 does not edit `opcodes.ts`.
- world-1 holds one lease on the `time` files: core
  `areas/time/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts` and the
  three tests that exist (`protocol.test.ts`, `store.test.ts`,
  `runtime.test.ts`; S0-5 writes no core `area.test.ts`);
  `packages/core/test-support/areas/time.ts`; harness
  `packages/harness/src/areas/time/area.ts` and `area.test.ts`;
  `docs/areas/time.md`. The harness module is in the lease, so world-1
  adds the `worldActs` entry and does not skip it. No task after world-1
  holds the lease; a later edit needs a new lease.
- Contract 1.10 reads with these additions, and no name is renamed:
  `TimeState` gains `uiTime: number | undefined` and `uiTimeAt: number |
  undefined`; the `TimeEvent` type union gains `"ui_time"`; `TimeActs`
  gains `requestUiTime: () => Promise<TimeState>`; the test support gains
  `timeUiTimerUpdateBody`; `timeHarness.worldActs` is `["query",
  "requestUiTime"]`, and its `event` rule returns `[]` for `ui_time`.

Not yet ruled by the maintainer.

### SR1-world-2: `unitRelationOf` goes to world-5 under a lease (world-5)

Issue 2: "`targetRelation` cannot reach the reputation store. ... a
`COORD` commit changes `unitRelationOf` to pass `reputation:
rt.areas.runtimes.reputation.act.relationView()` into `RelationDeps` ...
world-5 stops `blocked` after its core commit if the `COORD` edit has not
landed." Leases table, row 3.

Ruling: the `COORD` route is refused, and world-5 gets a lease instead.
The `COORD` edit cannot typecheck before world-5 has added
`RelationDeps.reputation` (step 6) and the `relationView` act (step 7),
so that route always stops world-5 `blocked` once and then needs a
resume. `client-control.ts` is not a step-0 hub file (contract 1.6) and
no other task in the plan edits it.

- world-5 holds the lease on `packages/core/src/wow/client-control.ts`,
  function `unitRelationOf` only (`client-control.ts:36-41` [M]), and on
  `packages/core/src/wow/client-control.test.ts` for the wiring test.
  No next holder.
- In step 8, world-5 makes the edit itself: `unitRelationOf` passes
  `reputation: rt.areas.runtimes.reputation.act.relationView()` into the
  deps of `targetRelation`. `rt.areas` is `AreaLifetime` (contract 1.3,
  1.6, D27). Core imports no area module; the access goes through the
  typed `AreaRuntimes` map. The step-8 fallback ("commit steps 1-7 and
  stop `blocked`") no longer applies.
- The rest of issue 2 stands: `ReputationRelationView` lives in the
  leased `unit-relation.ts`, the area imports it as a type (contract
  1.12), `RelationDeps.reputation` is optional, and `relationView` is not
  in `worldActs`.
- This stands in for a new row in contract 2.7 "Leases added by the plan
  fix-up" (`client-control.ts` `unitRelationOf`: world) and in the plan
  index "Leases" table (`core: client-control.ts | world-5 (A)`).

Not yet ruled by the maintainer.

### SR1-world-3: no cinematic config switch (world-7)

Issue 3: "No config switch for the cinematic auto-complete. ... The plan
drops the switch. ... the proof of `CMSG_NEXT_CINEMATIC_CAMERA` is the
`accepted` case of contract 0.6 ... This is a deviation from design
5.17."

Ruling: the plan stands, and it is not a deviation. Design 5.17 asks
for no switch at any commit of the design file [M, `git show` of each
commit from `25886a44` to `5ddd356c`]; its "Acts" paragraph reads
"`completeCinematic` (sent automatically on every
`SMSG_TRIGGER_CINEMATIC`); `nextCinematicCamera` (probe only, never in
play ...)". world-7 builds no switch and does not edit `client.ts`. The
proof of 0x0FB is `accepted` (contract 0.6), and no "objects leave view"
observation is attempted. The design's "the camera step on a second
`fresh` character" is met by the probe `--send` on the task's own
`fresh` account after the core's 0x0FC, because the server returns at
once when no camera is active (`Entities/Player/CinematicMgr.cpp:40-42`)
and the row is `accepted` either way. No design text changes.

Not yet ruled by the maintainer.

### SR1-world-4: no world-service or `look` edit (world-8b)

Issue 4: "The world-service `READ_KEYS` and `EVENT_KEYS` edits of the
area design are superseded by N5 and contract 1.9 ... The `look`
game-time line of the area design (V2) is dropped ... the daily-reset
line in `journal about: "quests"` stays."

Ruling: confirmed. Design 5.17 names neither edit [M, at `f3cb40a9`]: its
"Verbs" paragraph has only `journal about:"reputation"` and the
daily-reset line in `journal about:"quests"`. No world task edits
`world/service.ts` or `tools/look.ts`, and none holds a `look.ts` lease.
No text changes.

Not yet ruled by the maintainer.

### SR1-world-5: what the `journal` lease covers (world-8b)

Issue 5: "The `journal` lease does not name `tools/params.ts` or the
`docs/harness.md` row. ... world-8b takes both under the journal lease;
without them it stops `blocked`." Leases table, row 4.

Ruling: accepted. world-8b edits these, each in the plan's lease queue:

- `packages/harness/src/tools/journal.ts` and `journal.test.ts`: after
  spells-12a lands; next holder economy-2.
- the `journalParams` block of `packages/harness/src/tools/params.ts`
  (contract 2.7 fix-up row, a rider like D13): after spells-12a lands;
  next holder economy-2. If `SEED-1` splits `params.ts` by tool, the
  lease covers the sibling file that holds `journalParams` (contract 2.7,
  last paragraph).
- the `journal` `After` block of `packages/harness/src/contract/details.ts`
  (D13): in the file queue of the plan index, after combat-log-7b lands;
  next holder economy-2.
- the `journal` row of the `docs/harness.md` tool table
  (`docs/harness.md:132` [M]): a one-time rewrite of that row's text to
  "Quest log, bags and gear, spells, reputation, or the game log.", as a
  rider of the journal lease. Contract 2.6 allows only appending rows to
  that table, so this stands in for an amendment of the
  `docs/harness.md` row of contract 2.6 ("the holder of an existing
  tool's lease may rewrite that tool's row"). Other tasks keep appending
  rows; a rebase keeps both.

world-8b starts only when it holds all three file leases. Not yet ruled
by the maintainer.

### SR1-world-6: the harness sibling `areas/reputation/journal.ts` (world-8b)

Issue 6: "Contract 2.5 lists only `area.ts` and `tool*.ts` under
`packages/harness/src/areas/<area>/`. The plan reads contract 0.2 ...
as allowing `areas/reputation/journal.ts`".

Ruling: allowed. `packages/harness/src/areas/reputation/journal.ts` and
`journal.test.ts` are a sibling split by responsibility in the same
directory, owned by the `world` unit (contract 0.2). This stands in for a
row in contract 2.5: "`packages/harness/src/areas/<area>/<part>.ts` and
tests: siblings of `area.ts` split by responsibility". The file stem is
inside the area directory, so D26 does not apply. `dailyResetLine` takes
the `time` state as an argument that `tools/journal.ts` passes in, typed
through `@peon/core` (`AreaState<"time">`); the reputation module imports
no module of the `time` harness area.

Not yet ruled by the maintainer.

### SR1-world-7: the `t0-hostiles` limit sentence (world-5, world-8b)

Issue 7: "Contract 3.4 lets a task append rows and ids, not edit another
scenario's limits. The plan leaves that sentence to the coordinator's
wave integration tidy (contract 2.4) and puts the text in
`docs/areas/reputation.md` "Capabilities row"."

Ruling: accepted. world-5 writes the limit text in
`docs/areas/reputation.md` "Capabilities row" and does not edit the
`t0-hostiles` row of `docs/capabilities.md`. world-8b appends only its
own row or bullet (contract 3.4). The coordinator moves the sentence into
the `t0-hostiles` row in the Phase A wave integration tidy, after world-5
lands. Nothing is needed before a task starts.

Not yet ruled by the maintainer.

### SR1-world-8: the seed of `reputation` and `ambience` (all wave-1 tasks)

Source: "Code-area ownership (for `SEED-1`)": "The owns lists this plan
expects (the coordinator writes `owns`; the unit never edits it,
contract 2.5)".

Ruling: `SEED-1` seeds both code areas exactly as that table lists, in
the seed shapes of contract 1.5:

- `REPUTATION_OPCODES.owns` holds the seven reputation opcodes; `stubs`
  holds `["SMSG_INITIALIZE_FACTIONS", "Factions"]` (moved from
  `protocol/stubs.ts:50` [M]); `uses`, `dead` and `unseen` are empty.
- `AMBIENCE_OPCODES.owns` holds the twelve ambience opcodes and the three
  dead ones; `stubs` holds the four lines moved from `protocol/stubs.ts`
  (`SMSG_WEATHER` at `:44`, `SMSG_SET_PHASE_SHIFT` at `:56`,
  `SMSG_PLAY_SOUND` at `:57`, `SMSG_PLAY_MUSIC` at `:58` [M]), each with
  the label it has there; `dead` holds `CMSG_COMPLETE_MOVIE`,
  `SMSG_TOGGLE_XP_GAIN` and `SMSG_CAMERA_SHAKE` (N13); `uses` and
  `unseen` are empty.
- The harness modules `reputationHarness` and `ambienceHarness` have
  `worldActs: []`, and the two `AREAS` and `HARNESS_AREAS` lines are
  added. No code area is named `world` (D26).
- world-3 deletes the reputation stub line; world-2 deletes the
  `SMSG_WEATHER` stub line; world-6 (wave 3) deletes the other three.

Not yet ruled by the maintainer.

### SR1-world-9: the `unit-relation.ts` lease (world-5)

Source: Leases table, row 2: "`unit-relation.ts` and test | world-5 |
`RelationDeps.reputation?`, and the AzerothCore order for the character
against a creature".

Ruling: world-5 holds the lease on
`packages/core/src/wow/unit-relation.ts` and `unit-relation.test.ts`
(plan index "Leases", `core: unit-relation.ts | world-5 (A)`). No next
holder. world-5 starts after world-3 lands; the lease needs no handover
from another task.

Not yet ruled by the maintainer.

## COMPLETE

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-world-2-1 | `client-handlers.test.ts` and `protocol-coverage.test.ts:160` use `SMSG_WEATHER` as their example stub, and world-2 handles it | The coordinator moves those tests to `SMSG_WARDEN_DATA` in its own commit ("test: Use the Warden stub as the example notice") | ruled by the maintainer (P2-4) |
| BR-world-8a-1 | Review of world-8a: an `at_war` row needs the war flag before the change, which the core `standing_changed` event does not carry | world-8a may edit `packages/core/src/wow/areas/reputation/store.ts` and its tests to add `wasAtWar` to `standing_changed` | coordinator ruling (P2-17) |
