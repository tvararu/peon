# Protocol coverage: instances (key: instances)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.14 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

The `instances` unit gives the character its dungeon and raid
difficulty, its saved instances, resets, the bind prompt and the
server's instance warnings, and it gives the agent the dungeon finder:
lock info, the queue, the role check, the proposal, the LFG teleport, the
kick vote and the reward. It owns two code areas (design 5.1):
`instances` (19 opcodes) and `lfg` (28 opcodes, one of them dead). It
adds one tool, `dungeon`, and the shared difficulty enum
`packages/core/src/wow/protocol/difficulty.ts` (contract 2.5, N28).

- **Worktree:** `proto-instances`, created by the coordinator with the
  command of contract 0.1. **Branch:** `proto/area-instances`.
- **Phases** (design 5.1): instances-1 is wave 1 (phase 1, N22: the login
  difficulty packets). instances-2 to instances-8, instances-10 and
  instances-11 are wave 2 (phase 2, parties and raids). instances-9 (the
  raid browser) is wave 4 (phase 4, long tail).
- **Order:** instances-1 (wave 1); then instances-2 → instances-3 →
  instances-4 → instances-6 → instances-7 → instances-8 → instances-5 →
  instances-10 → instances-11 (wave 2); then instances-9 (wave 4). One
  task at a time (contract 0.1). instances-5 follows instances-8 only
  because the unit is serial; it depends on instances-2 and instances-3
  alone, and the coordinator may run it right after instances-4.
- **Eval ids** (design 5.2, 5.14): `t9-instances-reset`,
  `t9-instances-difficulty`, `t9-lfg-queue`, `t9-lfg-run`.

AzerothCore paths below are relative to `src/server/game/` unless they
start with `src/`, `data/` or `modules/` (contract 0.5). wowm paths are
under `wow_message_parser/wowm/world/`. Marks: **[M]** read for this plan
or measured in the area research, **[I]** inferred.

## Contract issues

These are gaps found while planning. The contract is not changed. Each
one names what the coordinator must do and the task that stops if it is
not done.

1. **Design 5.14's evals use `soap gm` inside an eval.** Design 5.14
   stages `t9-instances-reset` with `soap gm tele` in and out of the
   Deadmines and checks `t9-instances-difficulty` with a post-run GM
   teleport. Contract 0.7 and 3.6 forbid a GM command inside an eval
   except the mail staging step of N30, and design 4.3 says `soap gm` is
   never used inside an eval. This plan keeps both evals free of `soap
   gm`:
   - `t9-instances-reset` places the character inside the Deadmines with
     the offline `position` setup endpoint (map 36, the coordinates of
     `game_tele` row 260, `data/sql/base/db_world/game_tele.sql:301`
     [M]). At login, a character on a dungeon map with no instance id is
     moved to the map's entrance trigger on the same map and a new
     instance is created (`Entities/Player/PlayerStorage.cpp:5401-5409`
     [M]), which makes the temporary bind. The task asks the agent to
     hearth out (`travel to:"hearth"`, travel-5, wave 1) and then reset.
   - `t9-instances-difficulty` checks the tool result and the log row.
     The server's acceptance of a solo change is proven by the worker's
     live step (instances-3), not inside the eval.
   If the coordinator prefers the design's GM staging, it rules a `COORD`
   exemption for `soap gm tele` in eval setup, and instances-5 switches
   back. Stops: instances-5, if the login lands outside map 36.
2. **Scenario ids.** The area research used `t9-instance-reset` and
   `t9-dungeon-difficulty`; design 5.2 and 5.14 use
   `t9-instances-reset` and `t9-instances-difficulty`. The design wins.
3. **No truth field for difficulty, binds or the queue.** The realm
   service returns none of them (design 4.5, "Service fields the
   maintainer must add"), and `.instance listbinds` is `Console::No`
   (`src/server/scripts/Commands/cs_instance.cpp:41-42` [M]), so T-10's
   console reader cannot read binds either. The four evals use
   `game_log` rows built from server packets (`docs/evals.md:12-16`
   accepts packet evidence, design 4.5) and `session` checks. No task
   here depends on T-8 or T-10.
4. **The `dungeon` tool spans two code areas.** Contract 1.9 places the
   tool at `packages/harness/src/areas/instances/tool.ts`. Its LFG verbs
   (instances-10) live in the sibling `areas/instances/tool-lfg.ts` in the
   same directory, which instances-10 creates. instances-10's `codeArea`
   is `lfg`; the files it touches sit in the `instances` harness
   directory, both owned by this unit.
5. **`queue auto` and the roster fix.** N28 says `lfg` refuses `queue
   auto` until `group` lands the `SMSG_GROUP_LIST` rewrite (group-1). A
   successful proposal makes an LFG group, whose `SMSG_GROUP_LIST`
   carries a `u8` and a `u32` that today's parser does not read
   (`Groups/Group.cpp:1906-1910` [M];
   `packages/core/src/wow/protocol/group.ts:100-108` [M]). instances-10
   checks at start whether group-1 has landed on
   `origin/factory/426-protocol-coverage`. If it has, `auto` is built in
   full. If not, `queue` refuses `auto: true` with
   `refused("lfg_roster_unfixed")`, and instances-11 (which depends on
   group-1) removes the refusal.
6. **`look` needs no `params.ts` edit.** The saves and queue line of
   design 5.14 is part of the default `look` output, not a new kind, so
   instances-5 leases only `packages/harness/src/tools/look.ts` (contract
   2.7 lists `instances` for it). If the builder finds the line needs a
   new `look` kind, it stops as `blocked` and asks for a lease on
   `packages/harness/src/tools/params.ts`, as the travel plan does.
7. **`LFGDungeons.dbc` is absent.** Dungeon names, levels and types come
   from that file, which the DBC directory does not hold (design 5.14,
   area research). Events and log rows carry the numeric entry and the
   map id. A later catalog adds names; no task here waits for it.
8. **Random bots in the dungeon finder** need the maintainer (design
   5.14, "Needs the maintainer"). `t9-lfg-queue` runs with `auto: false`
   and leaves within its budget. `t9-lfg-run` fills the party with five
   of its own characters, which the queue matches by itself
   (`DungeonFinding/LFGQueue.cpp:224` [M]), so no bot joins it.
9. **Live LFG options.** `DungeonFinder.OptionsMask` on the live server
   could not be determined (default 5,
   `src/server/apps/worldserver/worldserver.conf.dist:3463-3471` [M]).
   instances-6 records it from live evidence (a logout that brings
   `SMSG_LFG_UPDATE_SEARCH` means at least one option is on,
   `DungeonFinding/LFGScripts.cpp:52-60` [M]) before instances-7 relies
   on it. If every option is off, instances-7 onward prove by mock (R22)
   and the coordinator decides whether `t9-lfg-queue` and `t9-lfg-run`
   are dropped.
10. **Harness tasks carry no opcode.** instances-5, instances-10 and
    instances-11 are verb and eval tasks (design 5.14 "Tasks"). They own
    no opcode; the "1-8 opcodes per task" rule does not fit them, and
    contract 0.10 forbids merging them into the core tasks.
11. **The two `MSG_SET_*_DIFFICULTY` opcodes have two directions.**
    instances-1 owns them and handles the server form. instances-3 adds
    the client form (builders and the `setDifficulty` act) and rewrites
    their proof rows to `live`. The opcode index lists them once, under
    instances-1.

## Shared facts for every task

**Names** (contract D7 and the `time` example, contract 1.10):

| Name | File |
|---|---|
| `INSTANCES_OPCODES` | `packages/core/src/wow/areas/instances/opcodes.ts` (seeded by `SEED-1`) |
| `instancesArea` | `packages/core/src/wow/areas/instances/area.ts` (seeded by `SEED-1`) |
| `LFG_OPCODES`, `lfgArea` | `packages/core/src/wow/areas/lfg/opcodes.ts`, `area.ts` (seeded by `SEED-2`) |
| `DUNGEON_DIFFICULTY`, `RAID_DIFFICULTY`, `DungeonDifficulty`, `RaidDifficulty`, `difficultyName(kind, value)` | `packages/core/src/wow/protocol/difficulty.ts` (instances-1; `as const` objects, no `enum`) |
| instance parsers and builders (section "Parsers" of each task) | `packages/core/src/wow/areas/instances/protocol.ts` |
| `InstancesState`, `InstancesEvent`, `InstancesStore`, `createInstancesStore` | `packages/core/src/wow/areas/instances/store.ts` |
| `InstancesActs`, `InstancesOutcome`, `instancesRuntime` | `packages/core/src/wow/areas/instances/runtime.ts` |
| LFG parsers and builders, `dungeonEntry(entry)` | `packages/core/src/wow/areas/lfg/protocol.ts` (split into `protocol-list.ts` for the raid browser in instances-9) |
| `LfgState`, `LfgEvent`, `LfgStore`, `createLfgStore` | `packages/core/src/wow/areas/lfg/store.ts` |
| `LfgActs`, `LfgOutcome`, `lfgRuntime` | `packages/core/src/wow/areas/lfg/runtime.ts` |
| `instances<Opcode>Body(...)`, `lfg<Opcode>Body(...)` | `packages/core/test-support/areas/instances.ts`, `packages/core/test-support/areas/lfg.ts` |
| `instancesHarness`, `lfgHarness` | `packages/harness/src/areas/instances/area.ts`, `packages/harness/src/areas/lfg/area.ts` (seeded) |
| `dungeonTool` | `packages/harness/src/areas/instances/tool.ts` (instances-5), `tool-lfg.ts` (instances-10) |

**Outcomes.** Every act settles as
`{ status: "ok"; ... } | { status: "refused"; reason: string } | { status: "no_answer" }`,
plus two statuses the design names: `unconfirmed_solo` for a solo
difficulty change outside a dungeon (the server is silent,
`Handlers/MiscHandler.cpp:1313-1314,1470-1471` [M]) and
`nothing_to_reset` for a reset with no resettable bind (no packet at
all, `Entities/Player/PlayerMisc.cpp:197-231` [M]). An LFG join with no
reply settles as `refused("lfg_disabled_or_ignored")`
(`Handlers/LFGHandler.cpp:52-55` [M]). Waits use
`ctx.until(..., { timeoutMs })`; a timeout maps to `no_answer` unless the
act says otherwise. Timeouts are proposals [I]: 5 s for request replies,
2 s for difficulty echoes and reset collection, 10 s for the LFG
teleport.

**Events** (`type` matches `/^[a-z_]+$/`; design 5.14):
- `instances`: `difficulty`, `map_difficulty`, `lockouts`, `bind_offer`,
  `bound`, `reset`, `reset_failed`, `reset_blocked`, `warning`,
  `homebind_timer`, `corpse_elsewhere`, `encounter`, `saved_maps`.
- `lfg`: `status`, `join_result`, `queue`, `role_check`, `role_chosen`,
  `proposal`, `boot_vote`, `teleport_denied`, `offer_continue`,
  `reward`, `dungeons`, `raid_list`. Party lock info is a `dungeons`
  event with `scope: "party"`; `SMSG_LFG_UPDATE_SEARCH` is a `status`
  event with `source: "search"`. No other event type is added.

**Map change.** Per-map state (`mapDifficulty`, `pendingBind`,
`homebindTimer`, `encounterUnits`) clears on a map change. The runtime
subscribes to `core.self.onEvent` and calls the store's `mapChanged()`
on `login_verified` and `new_world` (`packages/core/src/wow/self-store.ts:15-20`
[M]). No task registers a second `SMSG_NEW_WORLD` handler
(`packages/core/src/wow/movement-handlers.ts:73` [M] owns it).

**Group checks.** Leader and group checks read `ctx.legacy.party()`
(contract 1.2, D5). Core never answers a prompt by itself (design 5.14).

**Log rows** (drafts of `instancesHarness.rules` and `lfgHarness.rules`,
domains `instances` and `lfg`): see each task. The LFG `queue` event
arrives every 8 s while queued (`DungeonFinding/LFGQueue.cpp:478-575`,
`DungeonFinding/LFGMgr.h:52` [M]); its rule writes one `passive`
`lfg/queue` row at most once per 60 s and otherwise returns `[]` (G17).
This stands in for the design's "debug level", since `LogClass` has only
`wake`, `passive` and `log` (`packages/harness/src/contract/log.ts:1`
[M]). Not yet ruled by the maintainer.

**Live characters.** `mise factory soap create <preset>`; staging with
`mise factory soap gm <ACCOUNT> tele <tele>` (T-5) on the worker's own
characters only (R12); partners through `tmp/puppet-<ACCOUNT>` with
`call`, `events --json` and `start --packet-trace` (T-7). A character may
enter at most five non-raid instances per hour
(`Maps/MapMgr.cpp:232-244` [M]), so each proof run that re-enters uses a
fresh account. Every account is deleted with
`mise factory soap delete <ACCOUNT>` before the task reports (contract
0.7). `.debug lfg` is forbidden: it changes shared server state and
announces itself to every player (`DungeonFinding/LFGMgr.cpp:888-899`
[M]). `game_tele` rows: 260 `Deadmines` is inside (map 36), 1041
`TheDeadmines` is outside (map 0)
(`data/sql/base/db_world/game_tele.sql:301,1082` [M]). `soap gm tele`
does not pass GM mode, so the server still applies its entry checks
(`Entities/Player/Player.cpp:1563`, `Maps/MapMgr.cpp:136-250` [M]).

**Doc files.** `docs/areas/instances.md` (instances-1 creates it) and
`docs/areas/lfg.md` (instances-6 creates it) have the fixed headings of
contract 3.8. Each later task adds its proof rows, wire notes and "Left
out" lines. Every opcode in an `owns` list has exactly one proof row
once the area's last core task lands.

---

## Task instances-1: Difficulty and instance notices

Rulings: SR1-instances-1, SR1-instances-2, SR1-instances-3, SR1-instances-4, SR1-instances-5, SR1-instances-6, SR1-instances-7, SR1-instances-8 (section "Seed rulings (SEED-1)").

**Phase:** 1 (wave 1, N22). **codeArea:** `instances`. **Size:** M.

**Files:**
- Create: `packages/core/src/wow/protocol/difficulty.ts` and
  `difficulty.test.ts`
- Edit: `packages/core/src/wow/areas/instances/opcodes.ts` (delete the
  `SMSG_INSTANCE_DIFFICULTY` and `SMSG_RAID_INSTANCE_MESSAGE` stub lines;
  fill `unseen`)
- Create: `packages/core/src/wow/areas/instances/protocol.ts` and
  `protocol.test.ts`
- Create: `packages/core/src/wow/areas/instances/store.ts` and
  `store.test.ts`
- Create: `packages/core/src/wow/areas/instances/runtime.ts` and
  `runtime.test.ts` (map change only; no acts yet)
- Edit: `packages/core/src/wow/areas/instances/area.ts`
- Create: `packages/core/test-support/areas/instances.ts`
- Edit: `packages/harness/src/areas/instances/area.ts` and create
  `area.test.ts` (event rules)
- Create: `docs/areas/instances.md`
- Regenerate: `docs/protocol-coverage/instances.md`,
  `docs/protocol-coverage/core.md`

**Depends on:** `S0-5`, `SEED-1` (seeds `instances`), `T-2` (tap), `T-3`
(probe), `T-4` (cite-check), `T-5` (`soap gm tele`). Soft: `T-7` (puppet
`call`, which lands before `SEED-2`). Without it, the
`SMSG_RAID_GROUP_ONLY` live step is skipped and the opcode stays in
`unseen` with its mock proof.

**Opcodes:** `MSG_SET_DUNGEON_DIFFICULTY` (server form),
`MSG_SET_RAID_DIFFICULTY` (server form), `SMSG_INSTANCE_DIFFICULTY`
(stub → handled), `SMSG_UPDATE_INSTANCE_OWNERSHIP`,
`SMSG_UPDATE_LAST_INSTANCE`, `SMSG_RAID_INSTANCE_MESSAGE` (stub →
handled), `SMSG_RAID_GROUP_ONLY`, `SMSG_CORPSE_NOT_IN_INSTANCE`.

**Steps:**

- [ ] **Step 1: Difficulty enum test, then code.** `difficulty.test.ts`:
  `difficultyName("dungeon", 1)` is `heroic`; `difficultyName("raid", 3)`
  is `25-heroic`; out-of-range values give `undefined`. Ranges: dungeon
  0-2, raid 0-3 (`src/server/shared/DataStores/DBCEnums.h:281-282` [M]).
  Run `mise test packages/core/src/wow/protocol/difficulty.test.ts`; it
  fails to load. Write `difficulty.ts`; it passes.
- [ ] **Step 2: Test-support builders.** In
  `packages/core/test-support/areas/instances.ts`:
  - `instancesDifficultyBody({ difficulty, inGroup })`: `u32`, `u32` 1,
    `u32` (`Server/Packets/InstancePackets.cpp:35-42,56-63` [M]);
  - `instancesInstanceDifficultyBody({ difficulty, dynamicHeroic })`:
    `u32`, `u32` (`Entities/Player/Player.cpp:11788-11792` [M]);
  - `instancesOwnershipBody(hasBinds)`: `u32`
    (`Entities/Player/PlayerStorage.cpp:6782-6784` [M]);
  - `instancesLastInstanceBody(mapId)`: `u32`
    (`Entities/Player/PlayerStorage.cpp:6796-6798` [M]);
  - `instancesRaidInstanceMessageBody({ kind, mapId, difficulty, secondsLeft, locked?, extended? })`:
    four `u32`, then `u8` locked and `u8` extended only for kind 4
    (`Entities/Player/Player.cpp:11975-12008` [M]);
  - `instancesRaidGroupOnlyBody({ timerMs, code })`: two `u32`
    (`Entities/Player/PlayerUpdates.cpp:1421-1460` [M]).
- [ ] **Step 3: Failing parser tests.** `protocol.test.ts`:
  - `parseDifficulty` reads `{ difficulty, inGroup }` from both MSG server
    bodies and skips the constant `u32`; 0 bytes remain.
  - `parseInstanceDifficulty`, `parseInstanceOwnership`,
    `parseLastInstance` read their fields.
  - `parseRaidInstanceMessage` reads the two tail bytes for kind 4 and
    none for kinds 1-3 and 5. A test title records that wowm's
    `raid/smsg_raid_instance_message.wowm` has no tail and that
    AzerothCore wins.
  - `parseRaidGroupOnly` returns raw numbers and accepts code 0, which
    wowm's `social/smsg_raid_group_only.wowm` enum lacks
    (`Entities/Player/PlayerUpdates.cpp:1429-1432,1452-1455` [M]).
  Run `mise test packages/core/src/wow/areas/instances/protocol.test.ts`.
  Expected: fails to load, `protocol.ts` does not exist.
- [ ] **Step 4: Implement `protocol.ts`.** Run the test; it passes.
- [ ] **Step 5: Failing store tests.** `store.test.ts` over
  `areaRig("instances")` and `rig.inject`:
  - a dungeon difficulty body sets `dungeonDifficulty` and emits
    `difficulty` once; a repeat with the same value emits nothing;
  - an instance difficulty body sets `mapDifficulty` and emits
    `map_difficulty`;
  - ownership 1 then two last-instance bodies set `hasPermanentBinds` and
    `lastInstanceMaps` and emit `saved_maps`;
  - a raid instance message sets `lastWarning` and emits `warning` with
    `kind`, `mapId` and `secondsLeft`;
  - `SMSG_RAID_GROUP_ONLY` (60000, 1) sets `homebindTimer` with the rig
    clock and emits `homebind_timer` `started`; (0, 0) clears it and
    emits `cancelled`;
  - `SMSG_CORPSE_NOT_IN_INSTANCE` with an empty body emits
    `corpse_elsewhere`;
  - `mapChanged()` clears `mapDifficulty` and `homebindTimer`;
  - both stub pairs are gone from `areaStubs()` and the rig dispatch owns
    all eight opcodes (`dispatch.has`).
- [ ] **Step 6: Implement the store and `register`.** `register` calls
  `wire.on` for the eight opcodes. Delete the two stub lines from
  `INSTANCES_OPCODES.stubs`. Put `SMSG_UPDATE_LAST_INSTANCE` and
  `SMSG_CORPSE_NOT_IN_INSTANCE` in `unseen` now; later steps move an
  opcode out when live evidence exists. Run the tests; they pass.
- [ ] **Step 7: Runtime map-change test, then code.** `runtime.test.ts`:
  a `new_world` self event (through the rig's core self store) calls
  `mapChanged`, so `homebindTimer` is cleared. `instancesRuntime`
  subscribes to `core.self.onEvent` and disposes the subscription. Wire
  `area.ts` (`runtime: instancesRuntime`, `eventTypes` with the eight
  event types this task emits). Run the tests, `mise typecheck core`,
  `mise lint packages/core/src/wow/areas/instances`,
  `mise protocol:coverage`.
- [ ] **Step 8: Harness rules test, then code.** `area.test.ts` for
  `instancesHarness.rules`:
  - `map_difficulty` with difficulty 1 gives one `log` row
    `map_difficulty` ("Entered map 574 (heroic)."); difficulty 0 gives
    none;
  - `difficulty` at login gives none; a later change gives one `log` row;
  - `warning`, `homebind_timer` and `corpse_elsewhere` give one `wake`
    row each, with the texts of design 5.14's area research (for example
    "Not in this dungeon's group: moving to the graveyard in 60 s.");
  - `saved_maps` gives none.
  Implement the rules. Run
  `mise test packages/harness/src/areas/instances/area.test.ts`.
- [ ] **Step 9: Live proof.** `soap create eversong10`, then:
  - `mise protocol:probe <ACCOUNT> --flow login --expect MSG_SET_DUNGEON_DIFFICULTY --expect SMSG_INSTANCE_DIFFICULTY`
    (every login, `Handlers/CharacterHandler.cpp:822,887` [M]);
  - `mise factory soap gm <ACCOUNT> tele Orgrimmar` while offline, then
    the login flow again, then `soap gm <ACCOUNT> tele SilvermoonCity` while the probe
    waits (`--wait 20 --expect SMSG_UPDATE_INSTANCE_OWNERSHIP --expect SMSG_INSTANCE_DIFFICULTY`):
    the far teleport sends both
    (`Entities/Player/Player.cpp:1629-1637`,
    `Handlers/MovementHandler.cpp:108` [M]). If the probe cannot wait
    while a SOAP command runs, the worker uses a puppet with
    `start --packet-trace` and reads its trace.
  - `SMSG_RAID_GROUP_ONLY` with a partner (T-7): two `ghostlands20`
    accounts A and B; `tmp/puppet-<A> call invite '["<B>"]'`,
    `tmp/puppet-<B> call acceptInvite`; `soap gm tele Deadmines` for both
    while offline; start both puppets with `--packet-trace`; then
    `tmp/puppet-<B> call leaveGroup`. B's trace shows
    `SMSG_RAID_GROUP_ONLY` (60000, 1) (`Groups/Group.cpp:2402-2406`,
    `Entities/Player/PlayerUpdates.cpp:1437-1446` [M]). If staging fails,
    the opcode goes to `unseen` with its mock proof.
  - `MSG_SET_RAID_DIFFICULTY` and `SMSG_RAID_INSTANCE_MESSAGE` are proven
    in instances-3 and instances-5's worker steps; this task writes mock
    rows for them now.
- [ ] **Step 10: Doc.** Create `docs/areas/instances.md` with the fixed
  headings. Wire notes: the `SMSG_RAID_INSTANCE_MESSAGE` tail and its
  dungeon difficulty for a dungeon map (`Handlers/MovementHandler.cpp:257`
  [M]); the `SMSG_RAID_GROUP_ONLY` code 0. Proof rows for the eight
  opcodes. Capabilities row: "Proposed in instances-5." Run
  `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `MSG_SET_DUNGEON_DIFFICULTY` (server) | live | `login` flow, every login |
| `SMSG_INSTANCE_DIFFICULTY` | live | `login` flow; far teleport |
| `SMSG_UPDATE_INSTANCE_OWNERSHIP` | live | far teleport by `soap gm tele` |
| `SMSG_RAID_GROUP_ONLY` | live, or mock from `Entities/Player/PlayerUpdates.cpp:1421-1460` marked "not seen live" | partner group in the Deadmines, B leaves |
| `MSG_SET_RAID_DIFFICULTY` (server) | mock from `Server/Packets/InstancePackets.cpp:56-63` until instances-3 | rig test |
| `SMSG_RAID_INSTANCE_MESSAGE` | mock from `Entities/Player/Player.cpp:11975-12008` until instances-3 | rig test |
| `SMSG_UPDATE_LAST_INSTANCE` | mock from `Entities/Player/PlayerStorage.cpp:6796-6798`, "not seen live" (needs a permanent bind) | rig test |
| `SMSG_CORPSE_NOT_IN_INSTANCE` | mock from `Maps/MapMgr.cpp:206-211`, "not seen live" (a ghost cannot be staged by SOAP, design 4.3) | rig test |

**Commit:**

```
feat: Track instance difficulty and notices

The character now knows its dungeon and raid difficulty, the difficulty
of the map it stands in and the server's instance warnings, and the two
login stubs are gone.
```

---

## Task instances-2: Lockouts and the bind prompt

**Phase:** 2. **codeArea:** `instances`. **Size:** S.

**Files:**
- Edit: `packages/core/src/wow/areas/instances/opcodes.ts` (`unseen`)
- Edit: `packages/core/src/wow/areas/instances/protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`, `area.ts`
- Edit: `packages/core/test-support/areas/instances.ts`
- Create: `packages/devtools/src/probe-flows/instances-raid-info.ts`
- Edit: `docs/areas/instances.md`
- Regenerate: `docs/protocol-coverage/instances.md`

**Depends on:** `instances-1`, `SEED-2` (the wave-2 seed; this unit's
next tasks start after it).

**Opcodes:** `CMSG_REQUEST_RAID_INFO`, `SMSG_RAID_INSTANCE_INFO`,
`SMSG_INSTANCE_SAVE_CREATED`, `SMSG_INSTANCE_LOCK_WARNING_QUERY`,
`CMSG_INSTANCE_LOCK_RESPONSE`, `CMSG_SET_SAVED_INSTANCE_EXTEND`.

**Steps:**

- [ ] **Step 1: Builders in test support.**
  `instancesRaidInstanceInfoBody(locks)`: `u32` count, then per lock `u32`
  map, `u32` difficulty, `u64` instance guid, `u8` 1, `u8` extended, `u32`
  seconds to reset (`Entities/Player/PlayerStorage.cpp:6726-6758` [M]);
  `instancesLockWarningBody({ timeoutMs, encounterMask })`: `u32`, `u32`,
  `u8` (`Maps/Map.cpp:2131-2139` [M]); `instancesSaveCreatedBody()`:
  `u32` 0 (`Entities/Player/PlayerStorage.cpp:6720-6722` [M]).
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseRaidInstanceInfo` reads an empty list and a two-lock list; the
    fifth field is `locked` (always 1 in AzerothCore,
    `Entities/Player/PlayerStorage.cpp:6749` [M]), where wowm
    `raid/smsg_raid_instance_info.wowm` calls it `expired`.
  - `parseLockWarning` reads the three fields.
  - `buildRequestRaidInfo()` is empty (`Handlers/GroupHandler.cpp:1137-1141`
    [M]); `buildLockResponse(true)` is one `u8` 1
    (`Server/Packets/InstancePackets.cpp:70-73` [M]);
    `buildSetLockoutExtended({ mapId: 631, difficulty: 1, extended: true })`
    is `u32`, `u32`, `u8`, 9 bytes (`Handlers/CalendarHandler.cpp:793-817`
    [M]). A test title records that wowm's
    `raid/cmsg_set_saved_instance_extend.wowm` makes the difficulty a
    `u8`.
  Run the protocol test; it fails. Implement; it passes.
- [ ] **Step 3: Failing store tests.** A raid info reply sets `locks` with
  the arrival time and emits `lockouts` with the maps added and removed;
  a lock warning sets `pendingBind` with its deadline and emits
  `bind_offer`; `SMSG_INSTANCE_SAVE_CREATED` clears it and emits `bound`;
  a pending bind older than its timeout reads as absent; `mapChanged()`
  clears it. Implement; the tests pass.
- [ ] **Step 4: Failing runtime tests** over the rig:
  - `act.requestLockouts()` sends one `CMSG_REQUEST_RAID_INFO`; an
    injected reply settles `{ status: "ok", locks }`; no reply in 5 s
    (fake timers in `try`/`finally` with `jest.useRealTimers()`) settles
    `no_answer`.
  - `act.answerBind(true)` without a `pendingBind` refuses with
    `no_bind_offer` and sends nothing (the server ignores it,
    `Handlers/MiscHandler.cpp:1709-1714` [M]); with one it sends the
    response and settles `ok` on `bound`. `answerBind(false)` settles
    `ok` on the next map change (the server repops the character,
    `Handlers/MiscHandler.cpp:1719` [M]).
  - `act.setLockoutExtended({ mapId, difficulty, extended })` refuses
    with `no_matching_lock` unless `locks` holds that map and difficulty
    with the other flag (`Handlers/CalendarHandler.cpp:799-805` [M]);
    otherwise it sends, then requests lockouts again and settles `ok`
    when the flag changed, `refused("unchanged")` when not.
  - A second instance act while one is in flight refuses with `busy`.
  Implement `InstancesActs` for the three acts. Run the tests,
  `mise typecheck core`, `mise lint packages/core/src/wow/areas/instances`.
- [ ] **Step 5: Probe flow.** `instances-raid-info.ts` calls
  `handle.instances.act.requestLockouts()` and prints the result. With
  `--arg lock=1` or `--arg extend=1` it sends the lock response or an
  extend request for map 631 and waits 3 s.
- [ ] **Step 6: Live proof.** `soap create eversong10`, then:
  - `mise protocol:probe <ACCOUNT> --flow instances-raid-info --expect SMSG_RAID_INSTANCE_INFO`
    (an empty list at count 0 is a real reply);
  - `mise protocol:probe <ACCOUNT> --flow instances-raid-info --arg lock=1`
    and `--arg extend=1`: exit 0, no packet error, no disconnect (both
    handlers return silently without a pending bind or a raid lock).
- [ ] **Step 7: Doc and coverage.** Proof rows; wire notes for the extend
  size and the `locked` byte; `unseen` gains `SMSG_INSTANCE_SAVE_CREATED`
  and `SMSG_INSTANCE_LOCK_WARNING_QUERY`. Run `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_REQUEST_RAID_INFO` | live | `instances-raid-info` flow; the reply follows |
| `SMSG_RAID_INSTANCE_INFO` | live | same flow |
| `SMSG_INSTANCE_SAVE_CREATED` | mock from `Entities/Player/PlayerStorage.cpp:6720-6722`, "not seen live" (needs a heroic or raid boss kill) | rig test |
| `SMSG_INSTANCE_LOCK_WARNING_QUERY` | mock from `Maps/Map.cpp:2131-2139`, "not seen live" | rig test |
| `CMSG_INSTANCE_LOCK_RESPONSE` | accepted | builder test against `Server/Packets/InstancePackets.cpp:70-73`; live send accepted with no effect |
| `CMSG_SET_SAVED_INSTANCE_EXTEND` | accepted | builder test against `Handlers/CalendarHandler.cpp:793-817`; live send accepted with no effect |

**Commit:**

```
feat: Read lockouts and answer the bind prompt

The character can now list its saved instances, answer the save prompt
and extend a raid lockout, so the agent can see where it is locked.
```

---

## Task instances-3: Difficulty requests and resets

**Phase:** 2. **codeArea:** `instances`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/instances/opcodes.ts`,
  `protocol.ts`, `protocol.test.ts`, `store.ts`, `store.test.ts`,
  `runtime.ts`, `runtime.test.ts`, `area.ts`
- Edit: `packages/core/test-support/areas/instances.ts`
- Create: `packages/devtools/src/probe-flows/instances-reset.ts`
- Edit: `docs/areas/instances.md`
- Regenerate: `docs/protocol-coverage/instances.md`

**Depends on:** `instances-1`, `T-5`. Runs after instances-2 in the unit order.

**Opcodes:** `CMSG_RESET_INSTANCES`, `SMSG_INSTANCE_RESET`,
`SMSG_INSTANCE_RESET_FAILED`, `SMSG_RESET_FAILED_NOTIFY`. It also adds
the client form of `MSG_SET_DUNGEON_DIFFICULTY` and
`MSG_SET_RAID_DIFFICULTY` (contract issue 11).

**Steps:**

- [ ] **Step 1: Builders and failing tests.** Test support:
  `instancesResetBody(mapId)` (`Server/Packets/InstancePackets.cpp:20-25`
  [M]), `instancesResetFailedBody({ reason, mapId })` (`:27-33`),
  `instancesResetFailedNotifyBody(mapId)` (`:49-54`). `protocol.test.ts`:
  the three parsers; `buildSetDungeonDifficulty(1)` and
  `buildSetRaidDifficulty(2)` are one `u32` each (`:44-47,65-68`);
  `buildResetInstances()` is empty (`Handlers/MiscHandler.cpp:1255-1266`
  [M]). Run; it fails. Implement; it passes.
- [ ] **Step 2: Failing store tests.** A reset body emits `reset` with the
  map; a reset-failed body emits `reset_failed` with reason 0; a notify
  body emits `reset_blocked`. Implement; they pass.
- [ ] **Step 3: Failing `setDifficulty` tests** over the rig, with
  `ctx.legacy.party()` set through the rig's test port:
  - out of range (dungeon 3, raid 4) refuses `out_of_range`; the current
    value refuses `unchanged` (the server is silent,
    `Handlers/MiscHandler.cpp:1275,1325` [M]); in a group and not the
    leader refuses `not_leader` (`:1281,1331`); none of them sends;
  - a send followed by an echo with the new value settles
    `ok`/`changed`; an echo with the old value settles
    `refused("server_refused")`
    (`Handlers/MiscHandler.cpp:1291,1297,1310` [M]);
  - solo with no echo in 2 s settles `unconfirmed_solo` and the store
    holds `pendingDifficulty` until the next difficulty body.
- [ ] **Step 4: Failing `resetInstances` tests:**
  - in a group and not the leader refuses `not_leader`
    (`Handlers/MiscHandler.cpp:1261` [M]); solo at heroic dungeon
    difficulty refuses `heroic_no_reset`
    (`Entities/Player/PlayerMisc.cpp:200-201` [M]);
  - a send followed by one `SMSG_INSTANCE_RESET` settles
    `{ status: "ok", reset: [36], failed: [] }` after the 2 s collection
    window; a reset-failed body lands in `failed`;
  - no packet in 2 s settles `nothing_to_reset`.
  Implement both acts. Run the tests, `mise typecheck core`,
  `mise lint packages/core/src/wow/areas/instances`.
- [ ] **Step 5: Probe flow.** `instances-reset.ts`: `--arg do=reset`
  calls `resetInstances()`; `--arg do=difficulty --arg kind=dungeon --arg value=1`
  calls `setDifficulty`. Each prints the outcome.
- [ ] **Step 6: Live proof** on a fresh `ghostlands20` account, offline
  staging with `soap gm tele`:
  - `soap gm tele Deadmines`; probe `--flow instances-reset --arg do=difficulty --arg kind=dungeon --arg value=1 --expect MSG_SET_DUNGEON_DIFFICULTY`:
    inside a dungeon the server refuses and echoes the old value
    (`Handlers/MiscHandler.cpp:1291-1310` [M]);
  - probe `--arg do=difficulty --arg kind=raid --arg value=1 --expect MSG_SET_RAID_DIFFICULTY`:
    the refusal echo (`Handlers/MiscHandler.cpp:1465-1468` [M]);
  - probe `--arg do=reset --expect SMSG_INSTANCE_RESET_FAILED --expect SMSG_RESET_FAILED_NOTIFY`
    while inside (`Entities/Player/PlayerMisc.cpp:185-190,221` [M]);
  - `soap gm tele TheDeadmines`; probe `--arg do=reset --expect SMSG_INSTANCE_RESET`;
  - a second, fresh `max80` account outside any dungeon: probe
    `--arg do=difficulty --arg kind=dungeon --arg value=1` settles
    `unconfirmed_solo`; then `soap gm tele` into a Wrath dungeon (the
    worker picks a `game_tele` row inside a five-player Northrend dungeon
    and names it in the report) and probe `--flow login --expect SMSG_INSTANCE_DIFFICULTY --expect SMSG_RAID_INSTANCE_MESSAGE`:
    difficulty 1 proves the solo change took effect, and a heroic map
    with a reset time sends the welcome message
    (`Handlers/CharacterHandler.cpp:945-952` [M]). If entry is refused
    (access requirements, `Maps/MapMgr.cpp:136-250` [M]),
    `SMSG_RAID_INSTANCE_MESSAGE` stays mock and the report quotes the
    refusal.
- [ ] **Step 7: Doc and coverage.** Rewrite the two MSG proof rows to
  `live`; add the four reset rows and the `SMSG_RAID_INSTANCE_MESSAGE`
  result. Run `mise protocol:coverage`, `mise protocol:cite-check`,
  `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_RESET_INSTANCES` | live | `instances-reset` flow; a reset or a failure follows |
| `SMSG_INSTANCE_RESET` | live | reset outside the Deadmines |
| `SMSG_INSTANCE_RESET_FAILED` | live | reset inside |
| `SMSG_RESET_FAILED_NOTIFY` | live | reset inside |
| `MSG_SET_DUNGEON_DIFFICULTY`, `MSG_SET_RAID_DIFFICULTY` (row update) | live | refusal echoes inside the Deadmines |
| `SMSG_RAID_INSTANCE_MESSAGE` (row update) | live, or mock as in instances-1 | heroic Wrath dungeon entry on `max80` |

**Commit:**

```
feat: Change difficulty and reset instances

The character can now ask for a dungeon or raid difficulty and reset
its normal dungeons, and it reports a silent solo change as
unconfirmed instead of failed.
```

---

## Task instances-4: Encounter frames

**Phase:** 2. **codeArea:** `instances`. **Size:** S.

**Files:**
- Edit: `packages/core/src/wow/areas/instances/opcodes.ts` (`unseen`),
  `protocol.ts`, `protocol.test.ts`, `store.ts`, `store.test.ts`,
  `area.ts`
- Edit: `packages/core/test-support/areas/instances.ts`
- Edit: `packages/harness/src/areas/instances/area.ts` and `area.test.ts`
- Edit: `docs/areas/instances.md`
- Regenerate: `docs/protocol-coverage/instances.md`

**Depends on:** `instances-1`. Runs after instances-3 in the unit order.

**Opcodes:** `SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT`.

**Steps:**

- [ ] **Step 1: Builder.** `instancesEncounterUnitBody(frame)`: `u32`
  frame; frames 0-2 a packed guid and a `u8` priority; 3, 4 and 6 a `u8`;
  5 two `u8`; 7 nothing (`Instances/InstanceScript.cpp:775-803` [M]); and
  the 4-byte Halion form
  (`src/server/scripts/Northrend/ChamberOfAspects/RubySanctum/boss_halion.cpp:199-201`
  [M]).
- [ ] **Step 2: Failing tests.** `parseEncounterUnit` returns a tagged
  union for all eight frames and the 4-byte form; frame values match
  `Instances/InstanceScript.h:46-53` [M]. Store: frame 0 adds the guid to
  `encounterUnits`, frame 1 removes it, `mapChanged()` clears the map,
  and each change emits `encounter`. Harness rule: `encounter` writes no
  row (the flood guard, G17), since frames change during every boss
  fight.
- [ ] **Step 3: Implement.** Put the opcode in `unseen`. Run the tests,
  `mise typecheck core`, `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT` | mock from `Instances/InstanceScript.cpp:775-803`, "not seen live" (31 senders, all in Wrath raid scripts) | rig test |

**Commit:**

```
feat: Track boss encounter frames

The character now keeps the units a raid boss script marks for the
encounter frame, so a later raid verb can name them.
```

---

## Task instances-6: LFG status and lock info

**Phase:** 2. **codeArea:** `lfg`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/lfg/opcodes.ts` (delete the
  `SMSG_LFG_UPDATE_PLAYER` stub line; fill `dead`)
- Create: `packages/core/src/wow/areas/lfg/protocol.ts` and
  `protocol.test.ts`
- Create: `packages/core/src/wow/areas/lfg/store.ts` and `store.test.ts`
- Create: `packages/core/src/wow/areas/lfg/runtime.ts` and
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/lfg/area.ts`
- Create: `packages/core/test-support/areas/lfg.ts`
- Create: `packages/devtools/src/probe-flows/lfg-status.ts`
- Edit: `packages/harness/src/puppet/calls.ts` (sorted keys
  `lfgRequestPartyLocks`, `lfgRequestStatus`; contract 2.6)
- Create: `docs/areas/lfg.md`
- Regenerate: `docs/protocol-coverage/lfg.md`,
  `docs/protocol-coverage/core.md`

**Depends on:** `instances-1`, `SEED-2` (seeds `lfg`), `T-7` (puppet
`call`, `events --json`, `--packet-trace`). Runs after instances-4 in
the unit order.

**Opcodes:** `CMSG_LFG_GET_STATUS`, `SMSG_LFG_UPDATE_PLAYER` (stub →
handled), `SMSG_LFG_UPDATE_PARTY`, `CMSG_LFD_PLAYER_LOCK_INFO_REQUEST`,
`SMSG_LFG_PLAYER_INFO`, `CMSG_LFD_PARTY_LOCK_INFO_REQUEST`,
`SMSG_LFG_PARTY_INFO`, `SMSG_LFG_UPDATE_SEARCH`.

**Steps:**

- [ ] **Step 1: Builders.** In `packages/core/test-support/areas/lfg.ts`:
  - `lfgUpdatePlayerBody({ updateType, data? })`: `u8`, `u8` has-data;
    with data `u8` queued, two `u8` 0, `u8` count, `u32` entries,
    CString comment (`Handlers/LFGHandler.cpp:302-337` [M]);
  - `lfgUpdatePartyBody(...)`: the same with `u8` join, `u8` queued, two
    `u8` 0 and **three more** `u8` 0 before the count
    (`Handlers/LFGHandler.cpp:339-381` [M]);
  - `lfgPlayerInfoBody({ random, locks })`: `u8` count of random
    dungeons with rewards, then a **`u32`** lock count
    (`Handlers/LFGHandler.cpp:30-38,169-227` [M]);
  - `lfgPartyInfoBody(players)`: `u8` count; per player `u64` guid and a
    `u32`-counted lock block (`Handlers/LFGHandler.cpp:40-48,255-262`
    [M]);
  - `lfgUpdateSearchBody(on)`: one `u8` (`Handlers/LFGHandler.cpp:613-619`
    [M]).
- [ ] **Step 2: Failing parser tests.**
  - `parseLfgUpdate(r, "player")` and `parseLfgUpdate(r, "party")` read
    `{ updateType, dungeons, comment, queued, joined? }`; the party form
    skips 7 flag bytes, and a test title records that wowm's
    `lfg/smsg_lfg_update_party.wowm` has 4, which misreads the count.
  - `parseLfgPlayerInfo` reads two random dungeons with rewards and a
    `u32` lock count; a title records wowm's `u8`.
  - `parseLockBlock` and `parsePartyLockBlock` are shared by player info,
    party info and (later) the join result.
  - `dungeonEntry(0x01000012)` is `{ id: 18, type: 1 }`
    (`Handlers/LFGHandler.cpp:66,174` [M]).
  - Builders: `buildLfgGetStatus()`, `buildPlayerLockInfoRequest()`,
    `buildPartyLockInfoRequest()` are empty
    (`Handlers/LFGHandler.cpp:281-300,152-228,230-263` [M]).
  Run `mise test packages/core/src/wow/areas/lfg/protocol.test.ts`;
  it fails to load. Implement; it passes.
- [ ] **Step 3: Failing store tests** over `areaRig("lfg")`:
  - a player update with type 5 sets `status` `queued`, `selected` and
    the comment, and emits `status` with the before and after status;
    type 7 sets `none` (`DungeonFinding/LFG.h:46-64` [M]); unknown types
    keep the status and still emit;
  - player info sets `available` and `locks` with the arrival time and
    emits `dungeons` with `scope: "player"`; party info sets `partyLocks`
    and emits `dungeons` with `scope: "party"`;
  - an update-search body sets `searching` and emits `status` with
    `source: "search"`;
  - the `SMSG_LFG_UPDATE_PLAYER` stub pair is gone from `areaStubs()`.
  Implement `createLfgStore` and `register`. Put `SMSG_LFG_DISABLED` in
  `LFG_OPCODES.dead` (section "Dead opcodes").
- [ ] **Step 4: Failing runtime tests:**
  - `act.requestStatus()` sends `CMSG_LFG_GET_STATUS` and settles `ok`
    after the player update, and after both updates in a group
    (`Handlers/LFGHandler.cpp:288-299` [M]);
  - `act.requestDungeons()` settles `ok` with `available` and `locks`;
    5 s with no reply settles `no_answer`;
  - `act.requestPartyLocks()` without a group refuses `not_in_group` and
    sends nothing (the server is silent, `Handlers/LFGHandler.cpp:235-237`
    [M]);
  - one LFG act at a time (`busy`).
  Implement `LfgActs` for the three acts and wire `area.ts`.
- [ ] **Step 5: Puppet calls.** Add the sorted keys `lfgRequestPartyLocks`
  and `lfgRequestStatus` to `PUPPET_CALLS`, each calling
  `handle.lfg.act.<act>()` with no arguments; the existing
  `calls.test.ts` rule (every key names a function on the mock handle)
  covers them. Run `mise test packages/harness/src/puppet`.
- [ ] **Step 6: Probe flow.** `lfg-status.ts` calls `requestStatus`, then
  `requestDungeons`, and prints `available`, `locks` and the status.
- [ ] **Step 7: Live proof** on a fresh `ghostlands20` account:
  - `mise protocol:probe <ACCOUNT> --flow lfg-status --expect SMSG_LFG_UPDATE_PLAYER --expect SMSG_LFG_UPDATE_PARTY --expect SMSG_LFG_PLAYER_INFO`
    (solo, the party update has type 0 and no data);
  - the same probe records `SMSG_LFG_UPDATE_SEARCH` at its logout if any
    LFG option is on (`DungeonFinding/LFGScripts.cpp:52-60` [M]). The
    report states the live option finding (contract issue 9) and the
    random dungeons offered at level 20 (design risk: the lowest random
    level could not be determined);
  - party locks with a partner: accounts A and B (`ghostlands20`), both
    puppets with `--packet-trace`; `tmp/puppet-<A> call invite '["<B>"]'`,
    `tmp/puppet-<B> call acceptInvite`, then
    `tmp/puppet-<A> call lfgRequestPartyLocks`; A's trace shows
    `SMSG_LFG_PARTY_INFO`.
- [ ] **Step 8: Doc.** Create `docs/areas/lfg.md`: wire notes for the
  party update's 7 bytes and the `u32` lock count; proof rows; the dead
  row; "Left out": none. Run `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_LFG_GET_STATUS` | live | `lfg-status` flow; two updates follow |
| `SMSG_LFG_UPDATE_PLAYER` | live | `lfg-status` flow |
| `SMSG_LFG_UPDATE_PARTY` | live | `lfg-status` flow |
| `CMSG_LFD_PLAYER_LOCK_INFO_REQUEST` | live | `lfg-status` flow; player info follows |
| `SMSG_LFG_PLAYER_INFO` | live | `lfg-status` flow |
| `CMSG_LFD_PARTY_LOCK_INFO_REQUEST` | live | partner group, `call lfgRequestPartyLocks` |
| `SMSG_LFG_PARTY_INFO` | live, or mock from `Handlers/LFGHandler.cpp:255-262` marked "not seen live" | partner group |
| `SMSG_LFG_UPDATE_SEARCH` | live, or mock from `Handlers/LFGHandler.cpp:613-619` if every LFG option is off | probe logout |

**Commit:**

```
feat: Read dungeon finder status and locks

The character now knows its dungeon finder status, which random
dungeons it may queue for and why others are locked, for itself and
its party.
```

---

## Task instances-7: LFG queue and role check

**Phase:** 2. **codeArea:** `lfg`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/lfg/opcodes.ts` (delete the
  `SMSG_LFG_QUEUE_STATUS` stub line), `protocol.ts`, `protocol.test.ts`,
  `store.ts`, `store.test.ts`, `runtime.ts`, `runtime.test.ts`,
  `area.ts`
- Edit: `packages/core/test-support/areas/lfg.ts`
- Create: `packages/devtools/src/probe-flows/lfg-queue.ts`
- Edit: `packages/harness/src/puppet/calls.ts` (sorted keys `lfgJoin`,
  `lfgLeave`, `lfgSetRoles`)
- Edit: `docs/areas/lfg.md`
- Regenerate: `docs/protocol-coverage/lfg.md`,
  `docs/protocol-coverage/core.md`

**Depends on:** `instances-6`.

**Opcodes:** `CMSG_LFG_JOIN`, `CMSG_LFG_LEAVE`, `SMSG_LFG_JOIN_RESULT`,
`SMSG_LFG_QUEUE_STATUS` (stub → handled), `CMSG_SET_LFG_COMMENT`,
`CMSG_LFG_SET_ROLES`, `SMSG_LFG_ROLE_CHECK_UPDATE`,
`SMSG_LFG_ROLE_CHOSEN`.

**Steps:**

- [ ] **Step 1: Builders.** `lfgJoinResultBody({ result, state, partyLocks? })`:
  `u32`, `u32`, then only with locks a `u8` player count and the party
  lock blocks (`Handlers/LFGHandler.cpp:42,441-454` [M]);
  `lfgQueueStatusBody(...)` (`Handlers/LFGHandler.cpp:456-473` [M]);
  `lfgRoleCheckUpdateBody(...)`: `u32` state, `u8` initializing, `u8`
  count and `u32` entries, `u8` count and per member `u64`, `u8`, `u32`,
  `u8`, leader first (`Handlers/LFGHandler.cpp:394-439` [M]);
  `lfgRoleChosenBody({ guid, ready, roles })`
  (`Handlers/LFGHandler.cpp:383-392` [M]).
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseLfgJoinResult` reads a bare result and a result with two
    players' locks; a title records that wowm's
    `lfg/smsg_lfg_join_result.wowm` has no player count.
  - `parseLfgQueueStatus`, `parseRoleCheckUpdate`, `parseRoleChosen`.
  - `buildLfgJoin({ roles: 8, entries: [0x06000106], comment: "" })`
    writes `u32` roles, `u8` 0, `u8` 0, `u8` 1, one `u32`, `u8` 3, three
    `u8` 0 and an empty CString, which is what
    `Server/Packets/LFGPackets.cpp:20-34` [M] reads; a title records that
    wowm reads a variable needs count. 51 entries throws before any
    byte is written (`Server/Packets/LFGPackets.h:34` [M]).
  - `buildLfgLeave()` is empty (`Handlers/LFGHandler.cpp:78-93` [M]);
    `buildLfgSetRoles(8)` is one `u8` (`:106-120`);
    `buildLfgComment("hi")` is a CString (`:122-131`).
  Run; fails. Implement; passes.
- [ ] **Step 3: Failing store tests.** A join result emits `join_result`
  with the result named from `DungeonFinding/LFGMgr.h:100-121` [M] and
  sets `partyLocks` when present; a queue status sets `queue` and emits
  `queue`; a role check update sets `roleCheck` and emits `role_check`
  (state names from `DungeonFinding/LFGMgr.h:123-132` [M]); a role
  chosen emits `role_chosen`. The `SMSG_LFG_QUEUE_STATUS` stub pair is
  gone.
- [ ] **Step 4: Failing runtime tests:**
  - `act.join({ roles, entries, comment })` refuses with no role bit
    (`no_role`), more than 50 entries (`too_many`), an entry not in
    `available` or `locks` (`unknown_dungeon`,
    `Handlers/LFGHandler.cpp:64-69` [M]), in a group and not the leader
    (`not_leader`), during a proposal (`busy_proposal`,
    `DungeonFinding/LFGMgr.cpp:645-647` [M]) and a random entry mixed
    with specific ones (`mixed_random`, `:666-697`); none sends;
  - solo: a join result 0 then a type-5 update settles
    `{ status: "ok", queued: [...] }`; a non-zero result settles
    `refused` with the named reason and the locks; no reply in 5 s
    settles `refused("lfg_disabled_or_ignored")`;
  - group: a type-5 party update (role check started) settles `ok` with
    `roleCheck: true`;
  - `act.leave()` settles `ok` on the type-7 update;
  - `act.setRoles(roles)` refuses `no_role_check` unless `roleCheck` is
    active; otherwise it settles on this player's `role_chosen`;
  - `act.setComment(text)` refuses over 64 bytes (`too_long`,
    `DungeonFinding/LFGMgr.cpp:991-993` [M]) and settles `ok` after the
    send (no reply exists).
  Implement the five acts.
- [ ] **Step 5: Puppet calls.** Sorted keys `lfgJoin` (arguments: roles
  number, entry number), `lfgLeave`, `lfgSetRoles` (roles number). Run
  `mise test packages/harness/src/puppet`.
- [ ] **Step 6: Probe flow.** `lfg-queue.ts`: `requestDungeons`, pick the
  first unlocked random entry, `setComment("peon")`, `join({ roles: 8 })`,
  wait 12 s, `requestStatus`, `leave()`. If a proposal arrives it does
  not answer it (the queue leave declines it) and prints it.
- [ ] **Step 7: Live proof.**
  - Solo, fresh `ghostlands20`: `mise protocol:probe <ACCOUNT> --flow lfg-queue --expect SMSG_LFG_JOIN_RESULT --expect SMSG_LFG_QUEUE_STATUS --expect SMSG_LFG_UPDATE_PLAYER`.
    The status update carries the comment `peon`, which proves
    `CMSG_SET_LFG_COMMENT`; the type-7 update proves `CMSG_LFG_LEAVE`
    (`DungeonFinding/LFGMgr.cpp:881-882,936-941` [M]).
  - Role check, partner group: A (leader) and B, both puppets with
    `--packet-trace`; invite and accept as in instances-6; then
    `tmp/puppet-<A> call lfgJoin '[8, <entry>]'`,
    `tmp/puppet-<B> call lfgSetRoles '[2]'`,
    `tmp/puppet-<A> call lfgSetRoles '[8]'`; both traces show
    `SMSG_LFG_ROLE_CHECK_UPDATE` and `SMSG_LFG_ROLE_CHOSEN`
    (`DungeonFinding/LFGMgr.cpp:1529-1532` [M]); then
    `tmp/puppet-<A> call lfgLeave`.
  - If every LFG option is off (instances-6 finding), the join rows are
    mock from the cited writers and the report says so.
- [ ] **Step 8: Doc and coverage.** Wire notes for the join layout and
  the join result count. Run `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_LFG_JOIN` | live | `lfg-queue` flow; join result follows |
| `SMSG_LFG_JOIN_RESULT` | live | `lfg-queue` flow |
| `SMSG_LFG_QUEUE_STATUS` | live | `lfg-queue` flow, 12 s queued |
| `CMSG_LFG_LEAVE` | live | `lfg-queue` flow; type-7 update follows |
| `CMSG_SET_LFG_COMMENT` | live | the comment shows in the next status update |
| `CMSG_LFG_SET_ROLES` | live | partner role check |
| `SMSG_LFG_ROLE_CHECK_UPDATE` | live, or mock from `Handlers/LFGHandler.cpp:394-439` | partner role check |
| `SMSG_LFG_ROLE_CHOSEN` | live, or mock from `Handlers/LFGHandler.cpp:383-392` | partner role check |

**Commit:**

```
feat: Join the dungeon finder and answer roles

The character can now queue for a dungeon alone or as a party leader,
leave the queue and answer a role check, with every silent server
refusal named before the send.
```

---

## Task instances-8: LFG proposal, teleport, kick vote, reward

**Phase:** 2. **codeArea:** `lfg`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/lfg/opcodes.ts` (delete the
  `SMSG_LFG_PROPOSAL_UPDATE` stub line; `unseen`), `protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`, `area.ts`
- Edit: `packages/core/test-support/areas/lfg.ts`
- Create: `packages/devtools/src/probe-flows/lfg-teleport.ts`
- Edit: `packages/harness/src/puppet/calls.ts` (sorted keys
  `lfgAnswerProposal`, `lfgTeleport`, `lfgVoteKick`)
- Edit: `docs/areas/lfg.md`
- Regenerate: `docs/protocol-coverage/lfg.md`,
  `docs/protocol-coverage/core.md`

**Depends on:** `instances-7`.

**Opcodes:** `SMSG_LFG_PROPOSAL_UPDATE` (stub → handled),
`CMSG_LFG_PROPOSAL_RESULT`, `CMSG_LFG_TELEPORT`,
`SMSG_LFG_TELEPORT_DENIED`, `SMSG_LFG_OFFER_CONTINUE`,
`CMSG_LFG_SET_BOOT_VOTE`, `SMSG_LFG_BOOT_PROPOSAL_UPDATE`,
`SMSG_LFG_PLAYER_REWARD`.

**Steps:**

- [ ] **Step 1: Builders.** `lfgProposalBody(...)`: `u32` entry, `u8`
  state, `u32` id, `u32` encounters mask, `u8` silent, `u8` count, per
  member `u32` role and five `u8` (`Handlers/LFGHandler.cpp:545-611`
  [M]); `lfgBootBody(...)` (`:513-543`); `lfgRewardBody(...)`: two `u32`,
  `u8`, `u32` 1, `u32` money, `u32` xp, two `u32` 0, `u8` count, per item
  `u32` item, `u32` display id, `u32` count (`:475-511`);
  `lfgTeleportDeniedBody(code)` (`:636-642`);
  `lfgOfferContinueBody(entry)` (`:628-634`).
- [ ] **Step 2: Failing parser and builder tests.**
  `parseLfgProposal` (states from `DungeonFinding/LFGMgr.h:79-84` [M]),
  `parseBootProposal`, `parseLfgReward` (a title records that wowm's
  `QuestGiverReward` puts count before display id), `parseTeleportDenied`
  (codes from `DungeonFinding/LFGMgr.h:87-97` [M]),
  `parseOfferContinue`. Builders: `buildLfgProposalResult(id, true)` is
  `u32` and `u8` (`Handlers/LFGHandler.cpp:95-104` [M]);
  `buildLfgTeleport(true)` is one `u8` 1 (`:143-150`);
  `buildLfgBootVote(false)` is one `u8` (`:133-141`).
- [ ] **Step 3: Failing store tests.** A proposal sets `proposal` with
  the deadline `at + 40 s` (`DungeonFinding/LFGMgr.h:51` [M]) and emits
  `proposal`; state 1 or 2 ends it; a boot update sets `boot` with its
  deadline (120 s, `DungeonFinding/LFGMgr.h:50` [M]); teleport denied,
  offer continue and reward set their fields and emit their events. The
  `SMSG_LFG_PROPOSAL_UPDATE` stub pair is gone.
- [ ] **Step 4: Failing runtime tests:**
  - `act.answerProposal(accept)` refuses `no_proposal` without one and
    `expired` after its deadline; otherwise it sends the stored id and
    settles on the next proposal update for that id;
  - `act.teleport(out)` refuses `dead` while the self store says dead
    (the server answers 1), `in_combat` (8) and `not_in_lfg_group`
    (6) (`DungeonFinding/LFGMgr.cpp:2236-2264` [M]) without a send;
    with `{ force: true }` (probe only, never the harness) it sends
    anyway; it settles `ok` on a map change or `refused` with the
    denial code, 10 s;
  - `act.voteKick(agree)` refuses `no_vote` without an active boot and
    settles on the next boot update.
  Implement the three acts. The `dead` check reads `core.self`.
- [ ] **Step 5: Puppet calls.** Sorted keys `lfgAnswerProposal`
  (boolean), `lfgTeleport` (boolean), `lfgVoteKick` (boolean). Run
  `mise test packages/harness/src/puppet`.
- [ ] **Step 6: Probe flow.** `lfg-teleport.ts` calls
  `teleport(false, { force: true })` solo and prints the outcome.
- [ ] **Step 7: Live proof.** Fresh `ghostlands20`:
  `mise protocol:probe <ACCOUNT> --flow lfg-teleport --expect SMSG_LFG_TELEPORT_DENIED`
  (error 6, not in an LFG group, `DungeonFinding/LFGMgr.cpp:2236-2239`
  [M]). The proposal, the proposal answer, the kick vote, offer
  continue and the reward stay mock until instances-11.
- [ ] **Step 8: Doc and coverage.** Wire note for the reward order.
  `unseen` gains the five server opcodes not seen. Run
  `mise protocol:coverage`, `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_LFG_TELEPORT` | live | `lfg-teleport` flow; the denial follows |
| `SMSG_LFG_TELEPORT_DENIED` | live | `lfg-teleport` flow |
| `SMSG_LFG_PROPOSAL_UPDATE` | mock from `Handlers/LFGHandler.cpp:545-611`, "not seen live" until instances-11 | rig test |
| `CMSG_LFG_PROPOSAL_RESULT` | builder until instances-11 (a live send needs a proposal) | builder test against `Handlers/LFGHandler.cpp:95-104` |
| `SMSG_LFG_OFFER_CONTINUE` | mock from `Handlers/LFGHandler.cpp:628-634`, "not seen live" | rig test |
| `CMSG_LFG_SET_BOOT_VOTE` | builder until instances-11 | builder test against `Handlers/LFGHandler.cpp:133-141` |
| `SMSG_LFG_BOOT_PROPOSAL_UPDATE` | mock from `Handlers/LFGHandler.cpp:513-543`, "not seen live" | rig test |
| `SMSG_LFG_PLAYER_REWARD` | mock from `Handlers/LFGHandler.cpp:475-511`, "not seen live" (needs a finished random dungeon) | rig test |

**Commit:**

```
feat: Answer dungeon finder proposals and votes

The character can now accept or decline a dungeon finder group,
teleport in and out, vote on a kick and read its reward, and it refuses
a teleport it knows the server will deny.
```

---

## Task instances-5: `dungeon` tool, instance verbs

**Phase:** 2. **codeArea:** `instances`. **Size:** L.

**Files:**
- Create: `packages/harness/src/areas/instances/tool.ts` and
  `tool.test.ts` (split into `tool-status.ts` if it nears 500 lines)
- Edit: `packages/harness/src/areas/instances/area.ts` and `area.test.ts`
  (`worldActs: ["answerBind", "requestLockouts", "resetInstances", "setDifficulty", "setLockoutExtended"]`,
  rows for `bind_offer`, `bound`, `reset`, `reset_failed`,
  `reset_blocked`, `lockouts`)
- Edit: `packages/harness/src/areas/lfg/area.ts` (`worldActs` for the
  three request acts of instances-6, read by `dungeon status`)
- Shared (contract 2.6): `packages/harness/src/contract/result.ts`
  (append `dungeon` to `ToolName`), `packages/harness/src/tools/registry.ts`
  (append `dungeonTool`), `packages/harness/src/tools/covered.ts` (sorted
  key `dungeon`), `docs/harness.md` (append one tool table row)
- Edit (lease, contract 2.7): `packages/harness/src/tools/look.ts` and
  `look.test.ts` (the saves and queue line)
- Create: `packages/harness/src/grader/scenarios/t9-instances-reset.json`,
  `packages/harness/src/grader/scenarios/t9-instances-difficulty.json`
- Shared: `packages/harness/src/grader/scenarios.ts` `ROUND_1` (append),
  `docs/capabilities.md`, `docs/evals.md` (contract 3.2-3.5)
- Edit: `docs/areas/instances.md` (capabilities row)

**Depends on:** `instances-2`, `instances-3`, `travel-5` (the eval's
`travel to:"hearth"`), the lease on `tools/look.ts` from the
coordinator. Runs after instances-8 in the unit order.

**Opcodes:** none of its own (contract issue 10).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Harness rules test, then code.** `area.test.ts`:
  `bind_offer` gives one `wake` row "You will be saved to map <id> in
  60 s. Answer with dungeon(do: \"bind\")."; `bound`, `reset` and
  `reset_failed` give one `passive` row each; `reset` carries
  `progress: true`; `lockouts` gives none. Implement.
- [ ] **Step 2: Tool tests** (`tool.test.ts`, mock game with
  `triggerAreaEvent` and `jest.spyOn(handle.instances.act, ...)`):
  - `{ do: "status" }` calls `requestLockouts` when the list is older
    than 5 min, then renders difficulty (dungeon, raid, current map),
    saves with time left and the extended flag, and the LFG status from
    `handle.lfg.state()`; it records no packet in the mock's `sent` when
    the list is fresh;
  - `difficulty` maps `for` and `value` (`normal`, `heroic`, `10`, `25`,
    `10-heroic`, `25-heroic`) to the wire numbers with a small table in
    the tool module (the harness cannot import `#wow/protocol/*`,
    contract 0.3; the numbers are fixed by
    `src/server/shared/DataStores/DBCEnums.h:281-282`), calls
    `setDifficulty` once and renders
    `changed`, `refused` with the reason, or
    `UNCONFIRMED unconfirmed_solo` with "the server does not confirm a
    solo change; it shows on your next dungeon entry.";
  - `reset` renders one line per map and `nothing_to_reset`;
  - `bind` with `accept` calls `answerBind`; `extend` calls
    `setLockoutExtended`;
  - the tool is kind `action` (D25) and `status` runs sequentially;
  - `expectSendKind(dungeonTool)` passes (contract 1.9).
  Run `mise test packages/harness/src/areas/instances`; it fails.
- [ ] **Step 3: Implement** `dungeonTool` with `defineGameTool`, sending
  inside `ctx.rt.mutex.run`, with its own `After` type and renderers in
  the module (contract 1.9). Append `dungeon` to `ToolName` and
  `dungeonTool` to `GAME_TOOLS`; add the `COVERS` key with
  `instances/reset`, `instances/reset_failed`, `instances/bound`; append
  the `docs/harness.md` row `| \`dungeon\` | Difficulty, saved instances, resets, the bind prompt and the dungeon finder |`.
  `prompt/harness-doc.test.ts` then requires the name in the doc.
- [ ] **Step 4: `look` line test, then code.** With a save or a queue in
  the area states, `look` output gains one line, for example
  `Saved: map 36 (normal), 2 d left.` and `In queue: random dungeon,
  4 min.`; without either it gains nothing.
- [ ] **Step 5: Scenarios.** Both follow the shape of
  `t6-die-and-recover.json` [M]; tier 9; `partner: null`; budgets start
  at `paneMinutes` 12 and `budget.minutes` 8.
  - `t9-instances-reset`: preset `ghostlands20`; `setup`: the `position`
    endpoint with map 36 and the `game_tele` row 260 coordinates
    (x -16.4, y -383.07, z 61.78, o 2.52637, zone 1581; the worker
    confirms the zone id from the login `map_difficulty` row of a
    throwaway run); task "You are inside a dungeon. Hearth out, then
    reset your dungeons."; checks: `game_log` evidence
    `instances/reset` with map 36 (the server's `SMSG_INSTANCE_RESET`);
    `session` the reply says the Deadmines was reset.
  - `t9-instances-difficulty`: preset `max80`; no setup; task "Switch
    your dungeon difficulty to heroic and tell me what the game says.";
    checks: `session` shows one `dungeon` call with `do: "difficulty"`,
    `for: "dungeon"`, `value: "heroic"` and a reply that names heroic and
    does not claim the server confirmed it; `game_log` shows no
    `instances/difficulty` row with difficulty 0 after the call.
  Run `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 6: Eval runs.** `mise eval run t9-instances-reset --round <n>` and
  `mise eval run t9-instances-difficulty --round <n>`, babysat by an omp Muse worker
  (R10). Record each verdict. If the login of `t9-instances-reset` lands
  outside map 36, the task stops as `blocked` (contract issue 1).
- [ ] **Step 7: Docs, one commit per scenario** (contract 3.2): the JSON,
  its `ROUND_1` line, its `docs/capabilities.md` row (passed) or bullet
  (failed), and the `docs/evals.md` row
  `| Instances and dungeon finder (\`dungeon\`) | \`t9-instances-reset\`, \`t9-instances-difficulty\` |`.
  Proposed capabilities rows: `| Reset its own dungeons | \`t9-instances-reset\` | Normal difficulty only; a group member cannot reset. |`
  and `| Set dungeon and raid difficulty | \`t9-instances-difficulty\` | A solo change is not confirmed until the next dungeon entry; in a group only the leader can change it. |`.
  Run the regression gates of contract 3.6 (`t1-walk-to-npc`,
  `t7-halt-resume`, `t3-ghostlands-kill` against the R0 baseline) and
  `mise ci:checks`.

**Proof:** eval. `t9-instances-reset` and `t9-instances-difficulty`
verdicts.

**Commits** (three):

```
feat: Add the dungeon tool for instances

The agent can now read its difficulty and saves, change difficulty,
reset its dungeons and answer the save prompt with one dungeon tool.
```

```
test: Add the t9-instances-reset eval

The scenario proves the reset verb against the live server by the
server's own reset reply after the character hearths out.
```

```
test: Add the t9-instances-difficulty eval

The scenario proves that the agent sets heroic difficulty and reports a
solo change as unconfirmed rather than done.
```

---

## Task instances-10: `dungeon` tool, LFG verbs

**Phase:** 2. **codeArea:** `lfg`. **Size:** M.

**Files:**
- Create: `packages/harness/src/areas/instances/tool-lfg.ts` and
  `tool-lfg.test.ts` (contract issue 4)
- Edit: `packages/harness/src/areas/instances/tool.ts` (the `do` enum and
  dispatch to `tool-lfg.ts`) and `tool.test.ts`
- Edit: `packages/harness/src/areas/lfg/area.ts` and `area.test.ts`
  (rules; `worldActs` gains `answerProposal`, `join`, `leave`,
  `setComment`, `setRoles`, `teleport`, `voteKick`)
- Shared: `packages/harness/src/tools/covered.ts` (the `dungeon` key's
  set gains `lfg/queued`, `lfg/left`, `lfg/refused`,
  `lfg/teleport_refused`)
- Create: `packages/harness/src/grader/scenarios/t9-lfg-queue.json`
- Shared: `packages/harness/src/grader/scenarios.ts` `ROUND_1` (append),
  `docs/capabilities.md`, `docs/evals.md`
- Edit: `docs/areas/lfg.md` (capabilities row)

**Depends on:** `instances-5`, `instances-7`, `instances-8`. Soft:
`group-1` (contract issue 5).

**Opcodes:** none of its own (contract issue 10).

**Steps:**

- [ ] **Step 1: Harness rules test, then code.** `lfgHarness.rules`:
  `status` to queued gives one `passive` row `queued` ("Queued for
  random dungeon as damage."); to none gives `left`; `join_result`
  non-zero gives `refused` with the reason and locks; `queue` gives the
  throttled `passive` `queue` row (section "Shared facts"); `proposal`,
  `role_check` and `boot_vote` give `wake` rows with their deadlines;
  `teleport_denied` gives `teleport_refused`; `reward` gives a `log` row
  with `progress: true`; `dungeons` and `raid_list` give none.
- [ ] **Step 2: Tool tests** (`tool-lfg.test.ts`):
  - `queue` with no `dungeon` picks the first unlocked random entry in
    `available` (calling `requestDungeons` first when the list is
    empty), maps `roles` to bits (tank 2, healer 4, damage 8,
    `DungeonFinding/LFG.h:37-44` [M]) and calls `join` once; it renders
    `queued` or `refused` with the reason;
  - `queue` with `auto: true` answers the next `role_check` with the
    queued roles and the next `proposal` with accept, and writes one log
    row per automatic answer; with `auto: false` it answers nothing. If
    group-1 has not landed, `auto: true` refuses with
    `lfg_roster_unfixed` and the default is `false` until instances-11
    (contract issue 5);
  - with `auto: false`, a role check with no answer in 60 s calls
    `leave` and reports it (the server's role check does not time out in
    practice, `DungeonFinding/LFGMgr.h:49`, `DungeonFinding/LFGMgr.cpp:834`
    [M]);
  - `leave_queue`, `answer`, `roles`, `teleport` (`to: "in" | "out"`;
    refuses while dead with "the dungeon finder cannot bring a ghost
    back; walk to the dungeon entrance"), `kick_vote` each call their
    act once;
  - the harness never answers the bind prompt or a kick vote by itself;
  - `expectSendKind(dungeonTool)` still passes.
  Run `mise test packages/harness/src/areas`; it fails.
- [ ] **Step 3: Implement** `tool-lfg.ts`, the `do` values in `tool.ts`,
  the auto policy as a runtime subscription to `handle.lfg.onEvent`
  held for the life of one queue, and the `COVERS` set. Update the
  `docs/harness.md` `dungeon` row text if the verbs list needs it.
- [ ] **Step 4: Scenario.** `t9-lfg-queue`: preset `ghostlands20`; tier
  9; task "Join the dungeon finder as damage for a random dungeon without
  accepting any group. Once you are queued, tell me how long the wait
  is, then leave the queue."; checks: `game_log` `lfg/queued` then
  `lfg/left` (server updates, `DungeonFinding/LFGMgr.cpp:881-882,940`
  [M]); `game_log` at least one `lfg/queue` row; `session` the reported
  wait matches the last `lfg/queue` row. The task text keeps `auto`
  off. Run `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 5: Eval run.** `mise eval run t9-lfg-queue --round <n>` (Muse
  babysitter, R10); record the verdict.
- [ ] **Step 6: Docs, one scenario commit** (contract 3.2). The
  `docs/evals.md` row of instances-5 gains `\`t9-lfg-queue\``. Proposed
  capabilities row: `| Queue for the dungeon finder and leave | \`t9-lfg-queue\` | Joining needs an LFG option on the server; a queue with no reply is reported as disabled. |`.
  Run the regression gates of contract 3.6 and `mise ci:checks`.

**Proof:** eval. `t9-lfg-queue` verdict.

**Commits** (two):

```
feat: Queue for dungeons with the dungeon tool

The agent can now join and leave the dungeon finder, answer role checks
and proposals, teleport in and out and vote on kicks.
```

```
test: Add the t9-lfg-queue eval

The scenario proves a solo queue and leave by the server's own queue
updates.
```

---

## Task instances-11: Five-character dungeon finder run

**Phase:** 2. **codeArea:** `lfg`. **Size:** M.

**Files:**
- Create: `packages/harness/src/grader/scenarios/t9-lfg-run.json`
- Edit: `packages/harness/src/areas/instances/tool-lfg.ts` and test (only
  to remove the `lfg_roster_unfixed` refusal, if instances-10 built it)
- Edit: `packages/core/src/wow/areas/lfg/opcodes.ts` (move opcodes out of
  `unseen` that the run shows live)
- Shared: `packages/harness/src/grader/scenarios.ts` `ROUND_1` (append),
  `docs/capabilities.md`, `docs/evals.md`
- Edit: `docs/areas/lfg.md` (proof rows moved to `live` or `eval`)
- Regenerate: `docs/protocol-coverage/lfg.md`

**Depends on:** `instances-10`, `group-1` (the `SMSG_GROUP_LIST` fix),
`T-9` (multi-partner evals, up to four partners).

**Opcodes:** none of its own (contract issue 10). It moves
`SMSG_LFG_PROPOSAL_UPDATE`, `CMSG_LFG_PROPOSAL_RESULT` and, when seen,
`SMSG_LFG_BOOT_PROPOSAL_UPDATE`, `CMSG_LFG_SET_BOOT_VOTE` and
`SMSG_LFG_OFFER_CONTINUE` from mock or builder to live.

**Steps:**

- [ ] **Step 1: Worker live run first** (no eval yet), five fresh
  `ghostlands20` accounts: the probe character is the leader and four
  puppets with `--packet-trace`. Invite and accept all four; the leader
  queues for a random dungeon as damage
  (`tmp/puppet-<A> call lfgJoin '[8, <entry>]'` or the probe); the
  puppets answer the role check with one tank (2), one healer (4) and two
  damage (8); all accept the proposal (`call lfgAnswerProposal '[true]'`).
  The server does not check roles against classes
  (`DungeonFinding/LFGMgr.cpp:1603-1650` [M]), and a full party matches
  by itself (`DungeonFinding/LFGQueue.cpp:224` [M]). Expect
  `SMSG_LFG_PROPOSAL_UPDATE` states 0 then 2 and a teleport into the
  dungeon. Then `call lfgTeleport '[true]'` on one puppet moves it out.
  Optional, same run: `call uninvite` on one puppet from the leader
  starts a kick vote (`Groups/Group.cpp:636` [M]); three puppets vote;
  the traces show `SMSG_LFG_BOOT_PROPOSAL_UPDATE`. A member leaving
  sends `SMSG_LFG_OFFER_CONTINUE` to the leader
  (`DungeonFinding/LFGScripts.cpp:238-244` [M]). Delete all five
  accounts.
- [ ] **Step 2: Remove the `auto` refusal** if instances-10 built it:
  the `tool-lfg.test.ts` case for `lfg_roster_unfixed` becomes a case
  that `auto: true` is allowed and default; run it, see it fail, change
  the code.
- [ ] **Step 3: Scenario.** `t9-lfg-run`: preset `ghostlands20`; tier 9;
  `partners` (T-9) with four `ghostlands20` partners; `partnerActions`
  that accept the invite, answer roles (tank, healer, damage, damage)
  and accept the proposal through `call`, each with `actor`; task "Invite
  your four friends, queue your party for a random dungeon as damage, go
  in, then teleport back out."; checks: `game_log` `lfg/role_check`
  finished and `lfg/proposal` state 2; `game_log` no packet error for
  `SMSG_GROUP_LIST` while in the LFG group; `truth` `position.map` at the
  end equals the start map. Run
  `mise test packages/harness/src/grader/scenarios.test.ts`. If the
  spawn group has no slot for five characters, the task stops as
  `blocked` (contract 3.3).
- [ ] **Step 4: Eval run** (Muse babysitter, R10); record the verdict.
- [ ] **Step 5: Docs.** Move proof rows the worker run or the eval showed
  to `live` or `eval`, and the matching opcodes out of `unseen`; run
  `mise protocol:coverage`, `mise protocol:cite-check`. One scenario
  commit (contract 3.2); the `docs/evals.md` row gains
  `\`t9-lfg-run\``; proposed capabilities row
  `| Enter and leave a dungeon-finder dungeon with a party | \`t9-lfg-run\` | Needs a full party of five; the dungeon finder cannot bring a ghost back. |`.
  If "Group play" under "Not shown by any scenario" is proven by this
  scenario, the commit removes that bullet (contract 3.4). Run the
  regression gates and `mise ci:checks`.

**Proof:** eval and live. `t9-lfg-run` verdict; the worker run's traces
for the proposal, the proposal answer and (when seen) the kick vote and
offer continue.

**Commits** (up to three):

```
feat: Accept dungeon finder groups by default

The group roster now parses dungeon finder groups, so the dungeon tool
accepts the next role check and proposal by itself unless told not to.
```

```
docs: Record live dungeon finder proof

A five-character run showed the proposal, the answer and the kick vote
on the live server, so their proof rows are no longer mock.
```

```
test: Add the t9-lfg-run eval

The scenario proves a full dungeon finder party entering and leaving a
dungeon on the live server.
```

The first commit exists only if instances-10 built the refusal.

---

## Task instances-9: Raid browser

**Phase:** 4 (wave 4, long tail). **codeArea:** `lfg`. **Size:** M.

**Files:**
- Create: `packages/core/src/wow/areas/lfg/protocol-list.ts` and
  `protocol-list.test.ts`
- Edit: `packages/core/src/wow/areas/lfg/opcodes.ts`, `store.ts`,
  `store.test.ts`, `runtime.ts`, `runtime.test.ts`, `area.ts`
- Edit: `packages/core/test-support/areas/lfg.ts`
- Create: `packages/devtools/src/probe-flows/lfg-raid-browser.ts`
- Edit: `docs/areas/lfg.md`
- Regenerate: `docs/protocol-coverage/lfg.md`

**Depends on:** `instances-6`. Runs last in the unit order, in wave 4.

**Opcodes:** `CMSG_SEARCH_LFG_JOIN`, `CMSG_SEARCH_LFG_LEAVE`,
`SMSG_UPDATE_LFG_LIST`.

**Steps:**

- [ ] **Step 1: Builders.** `lfgUpdateListBody(...)` with full and
  difference forms following `DungeonFinding/LFGMgr.cpp:1321-1429` [M]:
  the `u8` after the dungeon id is 1 for a difference packet (with the
  deleted-guid list) and 0 for a full one (`:1395,1410`); per player the
  instance guid and encounter mask only with flag 0x80 (`:1385-1388`);
  item level as `f32` (`:1364`). The empty form of `:1057-1065`.
- [ ] **Step 2: Failing tests.** `parseLfgList` reads the empty full
  list, a full list with one group and two players (one with flag 0x80),
  and a difference list with one deleted guid. Titles record the three
  disagreements with wowm's `lfg/smsg_update_lfg_list.wowm`.
  `buildSearchJoin(entry)` and `buildSearchLeave(entry)` are one `u32`
  (`Handlers/LFGHandler.cpp:265-279` [M]). Store: a full packet replaces
  the entry's lists, a difference packet merges and deletes, and each
  emits `raid_list`. Runtime: `act.searchRaids(entry)` settles on the
  first list for that entry, 5 s; `act.stopSearch(entry)` settles `ok`
  after the send (no reply exists).
- [ ] **Step 3: Implement.** Run the tests, `mise typecheck core`,
  `mise lint packages/core/src/wow/areas/lfg`.
- [ ] **Step 4: Probe flow and live proof.** `lfg-raid-browser.ts`:
  `searchRaids(<a raid entry from available or 1>)`, wait 3 s,
  `stopSearch`, wait 6 s. `mise protocol:probe <ACCOUNT> --flow lfg-raid-browser --expect SMSG_UPDATE_LFG_LIST`
  on a fresh `max80` account gives an empty full list
  (`DungeonFinding/LFGMgr.cpp:1048-1066` [M]). The leave is proven
  `accepted`: exit 0, no packet error and no disconnect.
- [ ] **Step 5: Doc and coverage.** Wire notes for the three list
  disagreements; proof rows. Run `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_SEARCH_LFG_JOIN` | live | `lfg-raid-browser` flow; the list follows |
| `SMSG_UPDATE_LFG_LIST` | live (empty full list); non-empty forms by rig test from `DungeonFinding/LFGMgr.cpp:1321-1429` | `lfg-raid-browser` flow |
| `CMSG_SEARCH_LFG_LEAVE` | accepted | builder test against `Handlers/LFGHandler.cpp:274-279`; live send accepted |

**Commit:**

```
feat: Read the raid browser

The character can now search the raid browser and keep its group and
player lists, so a later verb can show open raids.
```

---

## Dead opcodes

| Opcode | Reason |
|---|---|
| `SMSG_LFG_DISABLED` 0x398 | Its only writer, `WorldSession::SendLfgDisabled` (`Handlers/LFGHandler.cpp:621-626` [M]), has no caller: a search for `SendLfgDisabled` over `src/` and `modules/` finds the declaration (`Server/WorldSession.h:1112`) and the definition only (design 1, verified floor; N13). The client learns that LFG is off from a join with no reply (`Handlers/LFGHandler.cpp:52-55` [M]). instances-6 puts it in `LFG_OPCODES.dead` with a `dead` proof row. |

Not in the area rows and not in Peon's `GameOpcode`, so no action:
`CMSG_CHANGEPLAYER_DIFFICULTY`, `CMSG_LFG_SET_NEEDS` and
`CMSG_EXPIRE_RAID_INSTANCE`, which AzerothCore registers with a null
handler (`Server/Protocol/Opcodes.cpp:640,1006,1176`, area research).

## Opcode index

| Opcode | Task |
|---|---|
| `MSG_SET_DUNGEON_DIFFICULTY` | instances-1 (client form in instances-3) |
| `MSG_SET_RAID_DIFFICULTY` | instances-1 (client form in instances-3) |
| `SMSG_INSTANCE_DIFFICULTY` | instances-1 |
| `SMSG_UPDATE_INSTANCE_OWNERSHIP` | instances-1 |
| `SMSG_UPDATE_LAST_INSTANCE` | instances-1 |
| `SMSG_RAID_INSTANCE_MESSAGE` | instances-1 |
| `SMSG_RAID_GROUP_ONLY` | instances-1 |
| `SMSG_CORPSE_NOT_IN_INSTANCE` | instances-1 |
| `CMSG_REQUEST_RAID_INFO` | instances-2 |
| `SMSG_RAID_INSTANCE_INFO` | instances-2 |
| `SMSG_INSTANCE_SAVE_CREATED` | instances-2 |
| `SMSG_INSTANCE_LOCK_WARNING_QUERY` | instances-2 |
| `CMSG_INSTANCE_LOCK_RESPONSE` | instances-2 |
| `CMSG_SET_SAVED_INSTANCE_EXTEND` | instances-2 |
| `CMSG_RESET_INSTANCES` | instances-3 |
| `SMSG_INSTANCE_RESET` | instances-3 |
| `SMSG_INSTANCE_RESET_FAILED` | instances-3 |
| `SMSG_RESET_FAILED_NOTIFY` | instances-3 |
| `SMSG_UPDATE_INSTANCE_ENCOUNTER_UNIT` | instances-4 |
| `CMSG_LFG_GET_STATUS` | instances-6 |
| `SMSG_LFG_UPDATE_PLAYER` | instances-6 |
| `SMSG_LFG_UPDATE_PARTY` | instances-6 |
| `CMSG_LFD_PLAYER_LOCK_INFO_REQUEST` | instances-6 |
| `SMSG_LFG_PLAYER_INFO` | instances-6 |
| `CMSG_LFD_PARTY_LOCK_INFO_REQUEST` | instances-6 |
| `SMSG_LFG_PARTY_INFO` | instances-6 |
| `SMSG_LFG_UPDATE_SEARCH` | instances-6 |
| `CMSG_LFG_JOIN` | instances-7 |
| `CMSG_LFG_LEAVE` | instances-7 |
| `SMSG_LFG_JOIN_RESULT` | instances-7 |
| `SMSG_LFG_QUEUE_STATUS` | instances-7 |
| `CMSG_SET_LFG_COMMENT` | instances-7 |
| `CMSG_LFG_SET_ROLES` | instances-7 |
| `SMSG_LFG_ROLE_CHECK_UPDATE` | instances-7 |
| `SMSG_LFG_ROLE_CHOSEN` | instances-7 |
| `SMSG_LFG_PROPOSAL_UPDATE` | instances-8 |
| `CMSG_LFG_PROPOSAL_RESULT` | instances-8 |
| `CMSG_LFG_TELEPORT` | instances-8 |
| `SMSG_LFG_TELEPORT_DENIED` | instances-8 |
| `SMSG_LFG_OFFER_CONTINUE` | instances-8 |
| `CMSG_LFG_SET_BOOT_VOTE` | instances-8 |
| `SMSG_LFG_BOOT_PROPOSAL_UPDATE` | instances-8 |
| `SMSG_LFG_PLAYER_REWARD` | instances-8 |
| `CMSG_SEARCH_LFG_JOIN` | instances-9 |
| `CMSG_SEARCH_LFG_LEAVE` | instances-9 |
| `SMSG_UPDATE_LFG_LIST` | instances-9 |
| `SMSG_LFG_DISABLED` | dead (instances-6 records it) |

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision
of this unit that a wave-1 task meets before `SEED-1`. The only wave-1
task is instances-1. Contract issues 1 to 10 are met only by wave-2 and
wave-4 tasks (instances-2 to instances-11), so the `SEED-2` and `SEED-4`
passes rule them; they are left alone here. No ruling amends the
contract or the design, so no `COORD-<n>` commit comes before
instances-1. Each ruling is **accepted by the maintainer (P2-5)**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-instances-1 | Contract issue 11: "The two `MSG_SET_*_DIFFICULTY` opcodes have two directions. instances-1 owns them and handles the server form. instances-3 adds the client form ... and rewrites their proof rows to `live`" (instances-1) | Stands. Both opcodes go in the `owns` list of `INSTANCES_OPCODES` in instances-1, which registers `wire.on` for the server form only. instances-3 adds the builders and the act without moving ownership. The coverage tables list each opcode once, under `instances`. instances-1 writes a live proof row for `MSG_SET_DUNGEON_DIFFICULTY` (the login flow) and a mock row for `MSG_SET_RAID_DIFFICULTY`, as its "Proof" table states | accepted by the maintainer (P2-5) |
| SR1-instances-2 | Shared facts, "Map change": "The runtime subscribes to `core.self.onEvent` and calls the store's `mapChanged()`"; design 5.14 says per-map state clears on `SMSG_NEW_WORLD` "through `listen`, never a second handler" (instances-1 step 7) | The unit file stands. Design 3.3 "`runtime` holds the policy" allows a subscription to core store events "through `core` (for example `core.self.onEvent`)", so the two texts agree. `AreaRuntimeCtx` has no `core` member: the runtime takes `core` from its third argument (contract 1.2) and removes the subscription in `dispose()`. It reacts to `login_verified` and `new_world` only. No `wire.on` or `wire.peek` on `SMSG_NEW_WORLD`. `mapChanged()` is a store method that changes state only; the store arms no timer, so `homebindTimer` holds the start time from the session clock and the length in ms | accepted by the maintainer (P2-5) |
| SR1-instances-3 | Step 7: "`eventTypes` with the eight event types this task emits" (instances-1) | Six, not eight. instances-1 emits `difficulty`, `map_difficulty`, `saved_maps`, `warning`, `homebind_timer` and `corpse_elsewhere`, and `eventTypes` lists those six. Each later task adds the types it emits. If S0-1 moved the list to an exported const (contract 1.2), the name is `INSTANCES_EVENT_TYPES` in `packages/core/src/wow/areas/instances/area.ts` | accepted by the maintainer (P2-5) |
| SR1-instances-4 | Step 8: "`difficulty` at login gives none; a later change gives one `log` row"; no event field tells a rule which is which (instances-1) | The `difficulty` event is `{ type: "difficulty"; kind: "dungeon" \| "raid"; difficulty: number; inGroup: boolean; previous: number \| undefined }`. `previous` is `undefined` for the first value of that kind in the session. The rule writes no row when `previous` is `undefined` and one `log` row otherwise. The store still emits nothing when the value does not change (step 5) | accepted by the maintainer (P2-5) |
| SR1-instances-5 | Step 8: "`warning`, `homebind_timer` and `corpse_elsewhere` give one `wake` row each, with the texts of design 5.14's area research"; the area research is not in the repository and design 5.14 gives no texts (instances-1) | The builder writes the texts, in the form of the one example ("Not in this dungeon's group: moving to the graveyard in 60 s.", which matches `RepopAtGraveyard` in `Entities/Player/PlayerUpdates.cpp:1439-1443` [M]). Each text names the map id and the time left where the event has them. `area.test.ts` checks the row count, class, domain, name and the numbers in the row, not the wording (AGENTS.md, "Testing") | accepted by the maintainer (P2-5) |
| SR1-instances-6 | Step 9: "If the probe cannot wait while a SOAP command runs, the worker uses a puppet"; the `SMSG_RAID_GROUP_ONLY` step forms a group, then teleports "while offline" (instances-1) | The probe runs in the background with `--flow login --wait 20` and the `--expect` flags, and the worker runs `mise factory soap gm <ACCOUNT> tele SilvermoonCity` in another shell during the wait. The landed `tele` verb sends `tele name <character> <tele>` (`packages/factory/src/soap-gm.ts:70-73` [M, at `origin/factory/426-protocol-coverage`]), which moves an online character. The puppet fallback stays. For `SMSG_RAID_GROUP_ONLY` the worker forms the group with both puppets online, stops both, runs both teleports while offline, then starts both with `--packet-trace`. If T-7a to T-7c have not landed when instances-1 reaches step 9, the step is skipped and the opcode stays in `unseen` with its mock row, as "Depends on" states | accepted by the maintainer (P2-5) |
| SR1-instances-7 | Leases: instances-1 edits `packages/core/src/wow/protocol/difficulty.ts` and regenerates `docs/protocol-coverage/core.md`, both outside `areas/instances/` (instances-1) | No lease and no handover. `protocol/difficulty.ts` is this unit's shared parser (contract 2.5), created by instances-1. `docs/protocol-coverage/core.md` and `docs/protocol-coverage/instances.md` are shared generated files (contract 2.6): instances-1 regenerates them with `mise protocol:coverage` and, on a rebase conflict, regenerates again. instances-1 edits no legacy file. This unit's one lease, `packages/harness/src/tools/look.ts` for instances-5, is in wave 2 and waits for the `SEED-2` pass | accepted by the maintainer (P2-5) |
| SR1-instances-8 | Step 8: the `map_difficulty` rule writes "Entered map 574 (heroic).", which needs `difficultyName`; `protocol/difficulty.ts` is not in the core barrel, the harness reaches core types only through `packages/core/src/wow/index.ts` (contract 0.3), and the barrel is not a shared file (contract 2.6) (instances-1) | The harness imports nothing from `protocol/difficulty.ts`. The store computes the name with `difficultyName(kind, value)` and puts it on the event: `difficulty` gains `name: string \| undefined` beside the fields of SR1-instances-4, and `map_difficulty` is `{ type: "map_difficulty"; mapId: number; difficulty: number; dynamicHeroic: boolean; name: string \| undefined }`. The map id comes from `core.self.mapId` when the body arrives. The rule prints `name`, or the raw number when `name` is `undefined`. instances-1 edits no barrel line; a later task that needs the enum in the harness asks the coordinator for a `COORD-<n>` barrel line | accepted by the maintainer (P2-5) |

## Seed rulings (SEED-2)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-2 task meets, before `SEED-2`. The wave-2 tasks of this unit are instances-2, instances-3, instances-4, instances-5, instances-6, instances-7, instances-8, instances-10 and instances-11 (phase B). Each ruling is a coordinator ruling (P2-17). Rows marked "for the maintainer's review" answer a design question with the recommended answer of the draft.

A task's own eval runs use the round number the coordinator gives in its build prompt (SEED2-1). Wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). `origin/factory/426-protocol-coverage` in this file means `origin/factory/431-wave2` for part 2 (SEED2-6). Paths without a prefix are under `packages/core/src/wow/` (core), `packages/harness/src/` (h:) or `packages/devtools/src/` (dev:); AzerothCore paths are relative to `src/server/game/` in `/home/deity/code/azerothcore-wotlk-playerbots` unless they start with `src/`, `data/` or `modules/`. Facts marked [M] were measured in this worktree or in AzerothCore; [INFERENCE] marks what was not observed.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR2-instances-1 | Contract issue 1 (`instances.md:42-62`): `t9-instances-reset` uses the offline `position` setup to place the character in map 36 and asks it to hearth out (instances-5). Preset `ghostlands20` is in `SPAWN_OF` (`grader/spawn-slots.ts:158`), so `startSlots()` returns an agent point and `play()` applies `[...scenario.setup, slots.agent]` (`grader/run.ts:443-451`): the automatic Ghostlands point overwrites the Deadmines position and the login never lands in map 36. | The no-`soap gm`-in-eval rule stands. To keep the position, the scenario uses a preset that has no `SPAWN_OF` entry and no `spawn`, so `spawnOf()` is `undefined` and no slot is added (`spawn-slots.ts:169-186`): **`elwynn10`** (Tplgoldshire, level 10; normal Deadmines needs level 10 and has no maximum, `data/sql/base/db_world/dungeon_access_template.sql:45` row `(3,36,0,10,0,0,'Deadmines (DM)')`). No `field`, no `spawn`, `partner: null`. `setup`: one `position` step `{ "map": 36, "x": -16.4, "y": -383.07, "z": 61.78, "o": 2.52637, "zone": 1581 }` (`game_tele` 260, `game_tele.sql:301`; zone 1581 [INFERENCE: The Deadmines area id; the builder confirms it from the `map_difficulty` row of a throwaway login, as the unit file already asks]). The builder checks with `soap truth` that the preset holds a hearthstone and that `hearth` names a place outside the dungeon; if the item is missing, a second `setup` row `items/add` `{ "item": 6948, "count": 1 }` (same shape as `t8-items-open.json:42-50`). `t9-instances-difficulty` keeps preset `max80`: it has no `SPAWN_OF` entry either, so it starts at its template point. If the login lands outside map 36 the task stops `blocked` (issue 1, unchanged). | coordinator ruling (P2-17) |
| SR2-instances-2 | Contract issue 2 (scenario ids). | Moot: the design ids `t9-instances-reset`, `t9-instances-difficulty`, `t9-lfg-queue`, `t9-lfg-run` are the ones in `plan.md` "Scenarios". No action. | coordinator ruling (P2-17) |
| SR2-instances-3 | Contract issue 3 (no truth field for difficulty, binds, queue). | Stands, and P2-7 settles it (no new realm truth fields; evals check packet evidence). The four evals use `game_log` and `session` checks only; no task uses T-8 or T-10. | coordinator ruling (P2-17) |
| SR2-instances-4 | Contract issue 4 (`dungeon` tool spans two code areas; `tool-lfg.ts` in `areas/instances/`, instances-10 `codeArea` `lfg`). | Stands. Both harness areas belong to this unit (contract 2.5 table, row `instances`), so no lease is needed for `areas/lfg/area.ts` (harness): the seed creates it, instances-5 and instances-10 edit it in that order. `tool-lfg.ts` is a new file created by instances-10; instances-11 edits it only if instances-10 built a refusal (see SR2-instances-5: it will not). | coordinator ruling (P2-17) |
| SR2-instances-5 | Contract issue 5 (`queue auto` refuses until group-1 lands; instances-10 "checks at start" `origin/factory/426...`; instances-11 removes the refusal). group-1 (`group.md:472-499`) rewrites `SMSG_GROUP_LIST` to read the LFG `u8` + `u32` (`Groups/Group.cpp:1906-1910`) and is a wave-2 task with only SEED-2 and T-7 as dependencies. | group-1 becomes a **hard dependency of instances-10** (scheduler edit, the scheduler data of "Coordinator edits for SEED-2"). With it landed, instances-10 builds `auto` in full and never writes a `lfg_roster_unfixed` refusal, so instances-11 has no refusal to remove and its first commit ("Accept dungeon finder groups by default") does not exist; instances-11 is the worker run, the scenario and the docs. `queue` `auto` defaults to `true` (design 5.14: the windows are shorter than a model turn); the tool description says so and that `auto: false` leaves every answer to the agent. | coordinator ruling (P2-17) |
| SR2-instances-6 | Contract issue 6 and instances-5 files: the saves and queue line of `look`; `tools/look.ts` is now split (SEED-1: `look-find.ts`, `look-rows.ts`, `look-self.ts`, `look-rank.ts`), and `tools/look.test.ts` has 494 non-blank lines against the 500 cap (AGENTS.md). | instances-5 holds `tools/look.ts` only and creates `tools/look-saves.ts` (the pure builder `savesLine(instances, lfg, now)`; `look.ts` calls it once when it assembles `lookBody`) and `tools/look-saves.test.ts` (its own small world helper, the way `look-objects.test.ts` and `look-quests.test.ts` do). It edits none of `look-find.ts`, `look-rows.ts`, `look-self.ts` (the plan "Leases" rows list instances-5 in those three queues: the coordinator drops it from them, "Lease handovers") and adds no case to `look.test.ts`. No `params.ts` edit: the line is part of the default output, as issue 6 says. | coordinator ruling (P2-17) |
| SR2-instances-7 | Contract issue 7 (`LFGDungeons.dbc` absent). | Stands; P2-8 (degraded ids). Events and rows carry the numeric entry (`dungeonEntry(entry)` gives `{ id, type }`) and the tool renders `random dungeon` for type 1 and `dungeon <id>` otherwise. No task waits for a catalog. | coordinator ruling (P2-17) |
| SR2-instances-8 | Contract issue 8 and design 5.14 "Needs the maintainer": may evals join groups that random bots complete (`AiPlayerbot.RandomBotJoinLfg = 1`, `modules/mod-playerbots/conf/playerbots.conf.dist:751-753`)? | P2-9 answers it: evals may join content the server fills with bots but never act on an `RNDBOT*` character (no trade, whisper or targeting). Facts: a bot queues itself for dungeons inside its level band and accepts any proposal at once (`modules/mod-playerbots/src/Ai/Base/Actions/LfgActions.cpp:57-140` join, `:196-260` accept), so a solo queue can produce a proposal within the 12 s of `lfg-queue`. **Recommended answer:** (a) `t9-lfg-queue` keeps `auto: false` in its task text, never accepts, and may see `lfg/proposal` rows; its checks are `lfg/queued` then `lfg/left` and at least one `lfg/queue` row, and they tolerate a proposal (SR2-instances-9 lists the update types that end a queue). (b) `t9-lfg-run` fills the party with its own five characters (`DungeonFinding/LFGQueue.cpp:224` per the unit file), so no bot is matched. (c) No tool verb names a player, so the agent cannot target a bot; the harness prints bot-named group members like any member. (d) No scenario check depends on bots joining. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-instances-9 | Contract issue 9 (`DungeonFinder.OptionsMask` unknown; what if every option is off). | Stands. The default mask is 5 (dungeon finder 0x01 + seasonal bosses 0x04, `DungeonFinding/LFGMgr.h:42-44`; `worldserver.conf.dist:3471`) and every handler tests `isOptionEnabled(1\|2\|4)`, so any bit is enough (`Handlers/LFGHandler.cpp:49-53`). instances-6 records the live finding twice: in its report and in `docs/areas/lfg.md` "Wire notes". **Fallback rule:** if the logout in `lfg-status` shows no `SMSG_LFG_UPDATE_SEARCH` and instances-7's join gets no reply, the coordinator drops `t9-lfg-queue` and `t9-lfg-run` (one `COORD-<n>` line), instances-10 still builds the verbs with mock tests, instances-11 is closed as dropped, and "Group play" stays under "Not shown by any scenario". | coordinator ruling (P2-17) |
| SR2-instances-10 | Leader checks: instances-3 (`not_leader` for `setDifficulty` and `resetInstances`) and instances-7 (`join` in a group) read `ctx.legacy.party()` (`instances.md:176-177`). `PartyState.leader` is a display name; `members` lists the other members only (`party-store.ts:49-54`; `world-handlers.ts:110-133`; `Groups/Group.cpp:1889`). The area runtime has no self name. | The runtime derives it: `party.inGroup && party.leader !== null && !party.members.some((m) => m.name === party.leader)` means the character leads. `not_in_group` is `!party.inGroup`. Each area runtime carries its own four-line `selfLeads(party)` (an area source may not import another area). If group-1 lands `leaderGuid` or an `isLeader` view first, the builder uses that instead and says so. No edit to `party-store.ts` (group-1 lease). | coordinator ruling (P2-17) |
| SR2-instances-11 | instances-3 step 3: `setDifficulty` range and refusals. AC: dungeon `Mode >= 3` and raid `Mode >= 4` return silently; equal value returns silently; a group member who is not the leader is ignored (`Handlers/MiscHandler.cpp:1268-1290`, `:1320-1338`). | Stands with two clarifications. The core refusal is `value >= 3` / `value >= 4` only, so `epic` (2, `shared/DataStores/DBCEnums.h:268-271`) is sent and the server's echo decides. In a group the leader's change succeeds only if no member is in a dungeon or raid map and everyone is in world, otherwise the server echoes the old value (`:1276-1301`); the act reads that echo as `refused("server_refused")`. Raid changes in a group also fail during the difficulty-change cooldown with a system chat line ("Raid difficulty has changed recently, and may not change again for N sec.", `:1330-1345`) plus the old-value echo; the act does not read the chat line, and the wire note and `docs/areas/instances.md` "Left out" say so. | coordinator ruling (P2-17) |
| SR2-instances-12 | raid difficulty in instances-3 and the instances-5 tool (`for: "raid"`, values `10`, `25`, `10-heroic`, `25-heroic`). AC's raid handler differs from dungeon: it also refuses for a raid group when a member is in a shared-difficulty map in combat, in an encounter, dead or moving (`MiscHandler.cpp:1346-1400`), and a solo change outside a dungeon is silent (`:1466-1471`). | **Recommended answer:** (1) wire numbers 0 = `10-normal`, 1 = `25-normal`, 2 = `10-heroic`, 3 = `25-heroic` (`DBCEnums.h:272-275`; `protocol/difficulty.ts` names them `"10-normal"` etc.). The tool accepts `10`, `25`, `10-heroic`, `25-heroic` and also the core names `10-normal`, `25-normal`; it refuses bare `normal` and `heroic` for `for: "raid"` with "raid difficulty needs a size: 10, 25, 10-heroic or 25-heroic", and for `for: "dungeon"` it accepts `normal` and `heroic` only (0, 1; `epic` is not offered). The table is a local `const` in `tool.ts` (the harness cannot import `#wow/protocol/*`, contract 0.3). (2) `unconfirmed_solo` applies to raid exactly as to dungeon. (3) The tool never changes raid difficulty unless asked; no loop or scenario does. (4) A raid change in a group is the leader's only (`not_leader`); the tool text says so. No raid staging exists before wave 3, so the raid group case is mock (R22) and `unseen`; the wire note records the cooldown text. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-instances-13 | instances-6/7/8 puppet keys: `lfgRequestPartyLocks`, `lfgRequestStatus`, `lfgJoin`, `lfgLeave`, `lfgSetRoles`, `lfgAnswerProposal`, `lfgTeleport`, `lfgVoteKick` "each calling `handle.lfg.act.<act>()`". `puppet/calls.test.ts:78-82` requires each key to name a function on the mock handle or an act of some area handle (`areaActs`), and `PuppetCall.args` kinds are `"string" \| "guid" \| "number" \| readonly string[]` (`puppet/calls.ts:3`). `setPassOnLoot` already follows this (key = act name, enum arg). | Keys are the act names, sorted: `answerProposal`, `join`, `leave`, `requestPartyLocks`, `requestStatus`, `setRoles`, `teleport`, `voteKick`. Args: `requestStatus` and `requestPartyLocks` and `leave` none; `join` `["number","number"]` (roles bits, one dungeon entry) running `join({ roles, entries: [entry], comment: "" })`; `setRoles` `["number"]`; `answerProposal` `[["decline","accept"]]`; `teleport` `[["in","out"]]`; `voteKick` `[["no","yes"]]`. Every `call lfgX ...` line in the unit file becomes the act name (`call join '[8, <entry>]'`, `call setRoles '[2]'`, `call answerProposal '["accept"]'`, `call teleport '["out"]'`). `calls.test.ts` is not edited. `puppet/calls.ts` is a shared sorted-keys file (contract 2.6): no lease; group-2, -3, -6, -7 and quests-7a add keys too, and a rebase conflict keeps every key, sorted. A puppet `call` does not await the act (`run` returns `void`), so the worker sleeps or reads `events --json` between steps. | coordinator ruling (P2-17) |
| SR2-instances-14 | instances-6 step 3: "unknown types keep the status" and "type 5 sets `queued`, 7 sets `none`" (`instances.md:716-728`). AC sends other update types that change the queue: `ADDED_TO_QUEUE` 12 re-queues after a failed proposal, `PROPOSAL_DECLINED` 9 and `PROPOSAL_FAILED` 8 remove the decliner, `REMOVED_FROM_QUEUE` 7 removes the rest of a declining group, `ROLECHECK_ABORTED` 4 and `ROLECHECK_FAILED` 6 end a role check (`DungeonFinding/LFG.h:46-64`; `DungeonFinding/LFGMgr.cpp:2018-2098`, `:1545`). Only 5 and 12 carry `queued = true` (`Handlers/LFGHandler.cpp:307-319`). | Status table for the store: 5 and 12 → `queued`; 4, 6, 7, 8, 9 → `none`; 13 (`PROPOSAL_BEGIN`) → `proposal`; 14 (`UPDATE_STATUS`) → `queued` when the `queued` byte is 1, else keep; 2, 3 (raid browser) → `raid_browser` / `none` only when the raid browser is used (instances-9; before that: keep); 0, 1, 10, 15, 16 and unknown → keep and still emit. The `status` event carries `updateType`, and the harness rule (instances-10) writes `left` for a queued → none change and names the type in `data` (`removed`, `declined`, `failed`, `role_check_failed`). Rig tests cover 5, 12, 7, 9. | coordinator ruling (P2-17) |
| SR2-instances-15 | instances-7 step 4: `join` refuses `not_leader` for a member of a group. AC ignores a non-leader only when the group is full or not an LFG group; a non-leader in a partly filled LFG group may join (`Handlers/LFGHandler.cpp:49-53`). | Conservative: `not_leader` for every group member who is not the leader. The LFG-group non-leader case is not offered; `docs/areas/lfg.md` "Left out" records it with the citation. | coordinator ruling (P2-17) |
| SR2-instances-16 | instances-8 step 4: `teleport` checks "dead" via "the self store", "in_combat", "not_in_lfg_group". `core.self` has no life or combat state (`self-store.ts`); life is in `core.recovery` (`recovery-store.ts:59-60`), and AC's combat check is `IsInCombat()` (`DungeonFinding/LFGMgr.cpp:2246-2262`). | The runtime reads life from `core.recovery.life().life !== "alive"` (dead or ghost; a `PlayerLife` type import only, no value import from `#wow/recovery-store`) and combat from the self entity's `UNIT_FIELD_FLAGS` bit `0x00080000` (`UnitFlag.IN_COMBAT`, `protocol/entity-fields.ts:90`; AC `UnitDefines.h:276`), read through `deps.getEntity(selfGuid)` as `areas/selfstate/fields.ts` does. Falling, fatigue, vehicle and charm (`LFGMgr.cpp:2242-2262`) are left to the server's `teleport_denied`; `teleport out` from another map is silent in AC (`:2264-2268`), so it settles `no_answer` after 10 s. | coordinator ruling (P2-17) |
| SR2-instances-17 | instances-2 step 4 and instances-3: the harness area rules and `bind_offer` texts, the `SMSG_RAID_INSTANCE_MESSAGE` welcome and the eval count. | No new decision: follow SR1-instances-5 (builder writes the texts; tests check class, domain, name and numbers, not wording). `instances/reset` rows carry `progress: true` as the unit file says. | coordinator ruling (P2-17) |
| SR2-instances-18 | instances-5 Depends on: `instances-2`, `instances-3`, `travel-5`. It edits `areas/lfg/area.ts` (harness) `worldActs` for "the three request acts of instances-6" and its `status` verb reads `handle.lfg.state()` (`instances.md:1032-1034,1064-1066`). `defineHarnessArea` types `worldActs` as `keyof AreaActsOf<"lfg">` (`areas/contract.ts:34-38`), so the acts must exist. | instances-5 needs **instances-6** landed (index correction, the scheduler data of "Coordinator edits for SEED-2"). The unit file's order (instances-5 after instances-8) is the safe reading; the scheduler dependency lists 6 at least. | coordinator ruling (P2-17) |
| SR2-instances-19 | instances-6/7/8 "Regenerate `docs/protocol-coverage/core.md`". After the `lfg` seed the 28 LFG rows are already in `lfg.md`, so a stub → handled change moves no row out of `core.md`. | Regenerate `docs/protocol-coverage/lfg.md` only; `mise protocol:coverage` leaves `core.md` unchanged, and the files stay in the plan's owner rows. On a rebase conflict in either file, regenerate. | coordinator ruling (P2-17) |
| SR2-instances-20 | `t9-lfg-run` party formation and partner timing (`instances.md:1298-1309`). Partner actions run in one sequential list, each `elapsed` relative to the previous fire, and a non-zero exit aborts the run (`grader/partner.ts:97-129`, `grader/steer.ts:65-82`). The only triggers are `fight_start`, `kill`, `death`, `movement_start`, `answer_text`, `steer_landed`, `task_landed`, `channel_start` (`grader/scenarios.ts:4-12`). Nothing fires on an LFG role check or proposal, and an agent-invites-four-partners plan would need the partners' `acceptInvite` to land after each invite at an agent-chosen time. | **Recommended answer (B):** add two triggers `lfg_role_check` (`lfg/role_check`) and `lfg_proposal` (`lfg/proposal`) as a coordinator edit before instances-11, exactly like `channel_start` (SR1-spells-14; "Coordinator edits for SEED-2" row 3). Use the group-9a shape ("the partner invites the agent and makes it leader"): partner 1 invites partners 2-4 and the agent, each accept as `elapsed` steps after its invite, then `setLeader` on the agent; the task text becomes "Your friends invited you to a group and made you its leader. Queue your party for a random dungeon as damage, go in, then teleport back out." Then partner actions on the triggers: after `lfg_role_check` (delay 1 s) partner 1 `setRoles '[2]'`, partner 2 `[4]`, partner 3 `[8]`, partner 4 `[8]` (each `actor`, `elapsed` 500 ms apart); after `lfg_proposal` (delay 500 ms) partners 1-4 `answerProposal '["accept"]'`. Alternative (A), the unit file's text: the agent invites all four and partner accepts are `elapsed` steps; fragile, not recommended. The agent's own role is its `join` roles, which counts as its role check answer (`DungeonFinding/LFGMgr.cpp:848`). | coordinator ruling (P2-17), for the maintainer's review |
| SR2-instances-21 | `t9-lfg-run` and `t9-lfg-queue` placement: both use preset `ghostlands20`, which is in `SPAWN_OF`; `startSlots()` gives each scenario two points of the Ghostlands spawn (8 points) by its index in `ROUND_1` and `--replica` (`spawn-slots.ts:188-205`). Partners of one scenario all stand on the single `slots.partner` point (`grader/run-partners.ts:61-68`). The unit file says "If the spawn group has no slot for five characters, the task stops blocked". | Moot for five characters: the agent takes one point, the four partners share the other. But the Ghostlands group holds `t3-ghostlands-kill` plus these two scenarios, six of the eight points, so **no `--replica 2`** for any of the three (SEED2-2) (it needs slot 3-5, which has no point and throws `no start slot`). A rerun uses replica 1 again after cleanup. No `field` on the two LFG scenarios (they fight nothing; a `field` would only block `t3-ghostlands-kill`, which owns `ghostlands-tranquillien`). | coordinator ruling (P2-17) |
| SR2-instances-22 | instances-10 step 1 rule `queue` "throttled `passive` row at most once per 60 s" needs per-session state; `RuleMemo` is a shared file (`events/rules.ts`). | The `lfgHarness.rules` factory keeps `let lastQueueRow = 0` in its closure (`areaRuleSet()` calls `rules()` once per router, `areas/rules.ts:17-24`), so no shared edit. Time comes from the event's own `at` or `rc.clock`; the builder uses whichever `RuleInput` offers and says so. | coordinator ruling (P2-17) |
| SR2-instances-23 | instances-2 step 6 / instances-3 step 6 live staging touches: five non-raid instance entries per hour per character (`Maps/MapMgr.cpp:232-244`); `soap gm tele` into the Wrath dungeon for the solo-heroic check; entry needs group and access requirements. | Stands. One fresh account per run that enters an instance. The Wrath dungeon row is the worker's pick and is named in the report; if entry is refused, `SMSG_RAID_INSTANCE_MESSAGE` stays mock (instances-1's fallback). `tele` runs only on the worker's own accounts (R12). | coordinator ruling (P2-17) |
