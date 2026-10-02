# Protocol coverage: pvp (key: pvp)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.22 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.22" point into it).

The `pvp` unit gives the character battlegrounds, world PvP, arena teams
and Wintergrasp. The character can queue for a battleground, answer the
invitation, see the roster and the score board, rez at a spirit guide,
leave, turn its PvP flag on and off, see honor and kills, run an arena
team, queue for an arena skirmish, and answer the Wintergrasp queue and
war offers. It owns 51 relevant opcodes (5 stubs, 45 missing, 1 absent:
`SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` 0x032) and 10 dead ones. It adds the
`pvp` tool (kind `action`), `recover how:"spirit_guide"`, a PvP line in
`look`, enemy players as `engage` targets inside a battleground, and five
scenarios: `t9-pvp-flag`, `t9-pvp-queue`, `t9-pvp-warsong`,
`t9-pvp-arena-team` and `t9-pvp-wintergrasp` (ids and tier from design
5.2 and 5.22; the plan index does not exist at the time of writing, so
the tier is the design's).

- **Phase:** 4 for every task. Design 5.1 puts `pvp` whole in wave 4
  ("the long tail"); N22 pulls no task of this unit into wave 1.
- **Worktree:** `proto-pvp`, created by the coordinator with the command
  of contract 0.1; branch renamed to `proto/area-pvp`. One task at a
  time, in the order of this file.
- **Code areas** (design 5.1, contract 2.5): `battlegrounds` (pvp-1 to
  pvp-4, pvp-11a to pvp-11d), `arena` (pvp-5 to pvp-8, pvp-12) and
  `wintergrasp` (pvp-9, pvp-10, pvp-13a to pvp-13c). Each has its own
  `packages/core/src/wow/areas/<area>/`,
  `packages/core/test-support/areas/<area>.ts`,
  `packages/harness/src/areas/<area>/area.ts`, `docs/areas/<area>.md` and
  `docs/protocol-coverage/<area>.md`. The `pvp` tool module is
  `packages/harness/src/areas/battlegrounds/tool.ts` (contract 1.9); this
  unit owns it, so pvp-12 and pvp-13b edit it too.
- **Order inside the unit:** battlegrounds, then arenas, then Wintergrasp
  (design 5.22). The Wintergrasp core tasks (pvp-9, pvp-10) come before
  the harness battleground tasks so their live window can run in the
  background while the unit builds.

Code lines below are at `71fba0ab` [M: read for this plan]. AzerothCore
paths are relative to `src/server/game/` unless they start with `src/`,
`data/` or `modules/`; the checkout is `azerothcore-wotlk-playerbots` at
`9d4e36d81`. wowm paths are relative to `wow_message_parser/wowm/world/`.
Marks follow the contract: [M] read or run, [I] inferred.

## Seed request (SEED-4)

The coordinator seeds the three code areas in `SEED-4` (contract 2.4).
Ownership, stub lines and dead rows this plan assumes:

| Const | `owns` | `stubs` at seed | `dead` |
|---|---|---|---|
| `BATTLEGROUNDS_OPCODES` | `CMSG_TOGGLE_PVP`, `SMSG_PVP_CREDIT`, `MSG_INSPECT_HONOR_STATS`, `SMSG_ZONE_UNDER_ATTACK`, `SMSG_QUESTUPDATE_ADD_PVP_KILL`, `CMSG_BATTLEFIELD_LIST`, `SMSG_BATTLEFIELD_LIST`, `CMSG_BATTLEMASTER_HELLO`, `CMSG_BATTLEMASTER_JOIN`, `CMSG_BATTLEFIELD_STATUS`, `SMSG_BATTLEFIELD_STATUS`, `SMSG_GROUP_JOINED_BATTLEGROUND`, `CMSG_BATTLEFIELD_PORT`, `SMSG_BATTLEGROUND_PLAYER_JOINED`, `SMSG_BATTLEGROUND_PLAYER_LEFT`, `MSG_PVP_LOG_DATA`, `MSG_BATTLEGROUND_PLAYER_POSITIONS`, `CMSG_LEAVE_BATTLEFIELD`, `CMSG_REPORT_PVP_AFK`, `CMSG_AREA_SPIRIT_HEALER_QUERY`, `CMSG_AREA_SPIRIT_HEALER_QUEUE`, `SMSG_AREA_SPIRIT_HEALER_TIME`, plus the 6 dead rows | `SMSG_BATTLEFIELD_STATUS` "Battleground status", `SMSG_BATTLEFIELD_LIST` "Battleground list", `SMSG_ZONE_UNDER_ATTACK` "Zone under attack" (`protocol/stubs.ts:34-36`) | `CMSG_BATTLEFIELD_JOIN`, `SMSG_PLAYER_SKINNED`, `SMSG_DEFENSE_MESSAGE`, `SMSG_JOINED_BATTLEGROUND_QUEUE`, `CMSG_COMMENTATOR_ENABLE`, `SMSG_BATTLEGROUND_INFO_THROTTLED` |
| `ARENA_OPCODES` | `CMSG_ARENA_TEAM_QUERY`, `SMSG_ARENA_TEAM_QUERY_RESPONSE`, `SMSG_ARENA_TEAM_STATS`, `CMSG_ARENA_TEAM_ROSTER`, `SMSG_ARENA_TEAM_ROSTER`, `MSG_INSPECT_ARENA_TEAMS`, `SMSG_ARENA_TEAM_COMMAND_RESULT`, `CMSG_ARENA_TEAM_INVITE`, `SMSG_ARENA_TEAM_INVITE`, `CMSG_ARENA_TEAM_ACCEPT`, `CMSG_ARENA_TEAM_DECLINE`, `SMSG_ARENA_TEAM_EVENT`, `CMSG_ARENA_TEAM_LEAVE`, `CMSG_ARENA_TEAM_REMOVE`, `CMSG_ARENA_TEAM_DISBAND`, `CMSG_ARENA_TEAM_LEADER`, `CMSG_BATTLEMASTER_JOIN_ARENA`, `SMSG_ARENA_ERROR`, `SMSG_ARENA_UNIT_DESTROYED`, plus the 2 dead rows | `SMSG_ARENA_TEAM_EVENT` "Arena team event", `SMSG_ARENA_TEAM_COMMAND_RESULT` "Arena command result" (`protocol/stubs.ts:42-43`) | `CMSG_ARENA_TEAM_CREATE`, `SMSG_ARENA_TEAM_CHANGE_FAILED_QUEUED` |
| `WINTERGRASP_OPCODES` | the 8 `*_BATTLEFIELD_MGR_*` rows of pvp-9, `CMSG_HEARTH_AND_RESURRECT`, `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE`, plus the 2 dead rows | none | `SMSG_BATTLEFIELD_MGR_EJECT_PENDING`, `SMSG_BATTLEFIELD_MGR_STATE_CHANGE` |

Counts: 22 + 19 + 10 relevant, 6 + 2 + 2 dead. If the seed leaves a
dead row out of `dead`, the first task of that code area adds it there
(pvp-1, pvp-5, pvp-9). `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` has no
`GameOpcode` name today [M: no match in
`packages/core/src/wow/protocol/opcodes.ts`]; S0-2 adds it (contract
1.11). No task of this unit edits `protocol-tables.ts` or `opcodes.ts`.

## Plan decisions (accepted by the maintainer (P2-5))

1. **One store per code area.** Design 5.22 names four stores
   (`BattlegroundStore`, `PvpSelfStore`, `ArenaStore`,
   `BattlefieldStore`). One `AreaModule` has one store (contract 1.2), so
   the self PvP fields join the battleground state:
   `BattlegroundsStore` (queue slots, list, join result, current match,
   self PvP state), `ArenaStore` and `WintergraspStore`, each in
   `areas/<area>/store.ts`, in the shape of the `time` example (contract
   1.10).
2. **No `pvp` domain and no `handle.pvp`.** The log domain is the code
   area (contract 1.9), so rows are `battlegrounds/<name>`,
   `arena/<name>` and `wintergrasp/<name>`. Design 5.22's `pvp/*` rows
   map to those. Acts are `handle.<area>.act.<name>` in core and
   `claim.areas.<area>.<name>` in the harness.
3. **Self update fields are read by the area.** `PLAYER_FLAGS` (offset
   150), `UNIT_FIELD_BYTES_2` (122), `PLAYER_FIELD_KILLS` (1225),
   `TODAY_CONTRIBUTION` (1226), `YESTERDAY_CONTRIBUTION` (1227),
   `LIFETIME_HONORBALE_KILLS` (1228), `ARENA_TEAM_INFO_1_1` (1256, 21
   words), `HONOR_CURRENCY` (1277) and `ARENA_CURRENCY` (1278)
   (`protocol/update-fields.ts:135,152,309-318`). The runtime subscribes
   `ctx.listen("entity", ...)`, keeps the events whose entity guid is
   `ctx.selfGuid()` and whose `objectType` is `ObjectType.PLAYER`, and
   hands `entity.rawFields` to a store input. `Entity` is a type-only
   import (`entity-store.ts:64`); the offsets come from
   `#wow/protocol/update-fields`, a value import the allow-list permits
   (contract 1.12). This is the pattern of self-state (its item 2) and
   travel (its item 5). No task edits `player-state.ts`, so this unit
   takes no `player-state.ts` lease although contract 2.7 lists `pvp`.
4. **`MSG_PVP_LOG_DATA` parses both forms in pvp-3.** One AzerothCore
   writer builds both (`Battlegrounds/Battleground.cpp:1373-1401`, arena
   rows `Battlegrounds/Arena.cpp:32-63`), so the parser lives in
   `battlegrounds` and reads the arena form too. pvp-8 only proves the
   arena form live.
5. **`joinArena` lives in `arena` and waits with `ctx.expect`.** Its
   success reply is `SMSG_BATTLEFIELD_STATUS` (owned by `battlegrounds`),
   and an area may not import another area. `joinArena` races
   `ctx.expect(SMSG_BATTLEFIELD_STATUS)`,
   `ctx.expect(SMSG_GROUP_JOINED_BATTLEGROUND)` and its own
   `arena_error` event, 5 s. The queue slot itself appears in the
   `battlegrounds` state, which records the arena type.
6. **Battlemaster checks stay in the harness.** Core areas cannot read
   `npc-roles.ts` (not on the allow-list). The `pvp` tool resolves a
   unit with the `battlemaster` role (`npc-roles.ts:46`) before `queue
   arena` and `list` with a battlemaster, as `interact` resolves NPCs.
7. **Enemy players as targets.** `engage` never picks a player today:
   `UnitFlag.PLAYER_CONTROLLED` is in `ATTACK_BLOCK` (`nearby.ts:99-106`),
   so `attackable` is false for every player (`nearby.ts:118-120`) and
   `hostiles` in `tools/engage-choose.ts:104-113` filters on it. pvp-11d
   adds a harness rule under the engage lease: while a battleground slot
   is `active`, a living, in-view unit of kind `player` with relation
   `hostile` counts as attackable. If any other engage path needs core
   `attackable` to be true, pvp-11d stops `blocked` and names
   `nearby.ts` (contract issue 1).
8. **The bot probe is one bounded run.** pvp-3 queues one throwaway
   character for Warsong Gulch with one `--wait 1200` probe and builds
   every match opcode with R22 mocks meanwhile. A long live wait never
   holds a builder (contract 0.6); the coordinator's watcher may rerun
   the flow later and a proof-only commit then moves rows to `live`.
9. **Scenario commits use `test:`.** A scenario commit adds a JSON file
   and its doc rows (D15) and no behaviour; the verb it proves lands in
   the `feat:` commit before it.
10. **Wintergrasp rows start as mocks.** pvp-9 and pvp-10 prove the
   manager packets with R22 mocks and a probe flow. The live capture
   comes from the coordinator's watcher or from pvp-13c's eval run in the
   grouping window, whose packet trace (N18) the builder reads. That task
   moves the rows.

## Contract issues

These are gaps found while planning. The contract is not changed. Each
workaround is a decision **accepted by the maintainer (P2-5)**.

1. **`nearby.ts` has no lease.** See plan decision 7. pvp-11d first tries
   the harness-side rule; it needs `nearby.ts` only if that fails.
2. **`tools/params.ts` has no lease row.** `recoverParams`
   (`packages/harness/src/tools/params.ts:149`) holds the `how` values of
   `recover`. pvp-11b asks for the `recoverParams` block under the same
   lease as `tools/recover.ts` and `ops/recover.ts`, as travel asks for
   its param blocks.
3. **GM staging inside an eval.** Contract 0.7 allows only the mail
   staging step, while design N30 says "guilds and arena teams staged by
   `soap gm` with a `Fac` name and removed in the same run". The design
   wins (contract precedence 1). `t9-pvp-arena-team` uses one
   `arena-create` staging step before the baseline, through the same
   staging mechanism the first mail eval adds. If that mechanism has not
   landed, pvp-12 stops `blocked`. The end check uses T-10's `read arena
   <teamId>`; T-10 has no `arena-lookup` read (tooling plan, T-10).
4. **The Wintergrasp wait step needs grader files.** N31 puts "a grader
   setup step that polls a read-only console command until it matches"
   in the `pvp` harness task. That touches `grader/scenarios.ts`
   (`Scenario.setup`, `:62`), `grader/scenario.schema.json` and the
   setup loop in `grader/accounts.ts:109-120` (called from
   `grader/run.ts:472`), which no area unit owns; `grader/run.ts` has 499 non-blank lines
   (tooling plan note 3). pvp-13a asks for a `COORD` lease on those files
   and creates a sibling `grader/console-wait.ts`. Without the lease it
   stops `blocked`.
5. **No preset in Wintergrasp.** Evals never run `soap gm tele` (contract
   0.7), and `max80` starts in Dalaran (map 571, `5807.98, 588.49,
   660.94`, `packages/factory/src/soap-presets.ts:54-61`), not in zone
   4197. Could not determine a non-GM way to place the character in
   Wintergrasp. pvp-13c asks the coordinator for a `wintergrasp80` preset
   in `soap-presets.ts` (or a spawn group, contract 3.3). Without it the
   scenario lands under "Not shown by any scenario" (D16) with the gap
   "no start in Wintergrasp".
6. **Partner reactions in evals.** `t9-pvp-arena-team` needs the partner
   to accept an arena invite when it arrives. Could not determine whether
   the grader can run a puppet `call` on an event (T-7, T-9). If it
   cannot, pvp-12 stops `blocked` and names the member.

## Leases this unit needs

The coordinator assigns them at the seed of wave 4 (contract 2.7). A task
that reaches one of these files without its lease stops `blocked`.

| File | Task | Edit |
|---|---|---|
| harness `tools/recover.ts`, `ops/recover.ts`, the `RecoverAfter` block of `contract/details.ts` (D13), and the `recoverParams` block of `tools/params.ts` (contract issue 2) | pvp-11b | the `spirit_guide` way |
| harness `tools/look.ts` and the views it reads in `contract/views.ts` (D13) | pvp-11c | the PvP line |
| harness `tools/engage*.ts` (the engage loop) | pvp-11d | enemy players inside a battleground |
| `grader/scenarios.ts` (`Scenario.setup` type), `grader/scenario.schema.json`, the setup loop of `grader/accounts.ts:109-120` (contract issue 4) | pvp-13a | the console wait step |

## Shared live rules for every task

- Accounts only from `mise factory soap create <preset>`, deleted with
  `mise factory soap delete <ACCOUNT>` before the task reports done
  (contract 0.7). Arena teams a task creates carry a `Fac` name and are
  disbanded in the same run with `mise factory soap gm <ACCOUNT>
  arena-disband <teamId>` (T-6) or `CMSG_ARENA_TEAM_DISBAND`.
- GM verbs used: `level`, `tele`, `arena-create` (T-5); `deserter-bg`,
  `arena-disband`, `read arena`, `read arena-lookup`, `read bf-queue`
  (T-6, which lands before wave 4). Never `.debug bg`, `.debug arena`,
  `.bf start|stop|switch|timer|enable` or `.arena season` (design 5.22:
  they change state every player shares).
- Probe flows are `packages/devtools/src/probe-flows/<area>-<name>.ts`,
  in the shape T-3 gives `nearest.ts`, run with
  `mise protocol:probe <ACCOUNT> --flow <name> [--arg k=v] --expect <OPCODE> ... --bodies`
  (design 4.2). Exit 3 means an expected opcode did not arrive.
- If the game server or SOAP is down, the task reports it and stops.
- Every parser and builder test body comes from the AzerothCore writer
  or reader cited in the task (contract 0.5). Where wowm disagrees,
  AzerothCore wins and the disagreement goes under "Wire notes" in
  `docs/areas/<area>.md`.

## Task pvp-1: PvP flag and honor

- **codeArea:** `battlegrounds`. **Size:** M.
- **Files:**
  - Edit: `packages/core/src/wow/areas/battlegrounds/opcodes.ts` (remove
    the `SMSG_ZONE_UNDER_ATTACK` stub line; fill `unseen`, `dead`),
    `.../areas/battlegrounds/area.ts`
  - Create: `.../areas/battlegrounds/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `store.test.ts`, `runtime.ts`, `runtime.test.ts`,
    `area.test.ts`
  - Create: `packages/core/test-support/areas/battlegrounds.ts`
  - Edit: `packages/harness/src/areas/battlegrounds/area.ts`; create its
    test
  - Create: `packages/devtools/src/probe-flows/battlegrounds-flag.ts`
  - Create: `docs/areas/battlegrounds.md`; regenerate
    `docs/protocol-coverage/battlegrounds.md`
- **Depends on:** `SEED-4`, T-2, T-3, T-4, item6.
- **Opcodes:** `CMSG_TOGGLE_PVP`, `SMSG_PVP_CREDIT`,
  `MSG_INSPECT_HONOR_STATS`, `SMSG_ZONE_UNDER_ATTACK`,
  `SMSG_QUESTUPDATE_ADD_PVP_KILL`.

**Steps:**

- [ ] **Step 1: Test builders.** In
  `packages/core/test-support/areas/battlegrounds.ts` write
  `battlegroundsPvpCreditBody({ honor, victim, rank })`,
  `battlegroundsInspectHonorStatsBody({ guid, honor, kills, today, yesterday, lifetime })`,
  `battlegroundsZoneUnderAttackBody({ areaId })` and
  `battlegroundsQuestUpdateAddPvpKillBody({ quest, count, required })`.
  Byte order from the writers:
  - `SMSG_PVP_CREDIT`: `i32` honor, `u64` victim, `i32` rank
    (`Entities/Player/Player.cpp:6385-6392`); wowm
    (`pvp/smsg_pvp_credit.wowm:3-7`) says `u32`; AzerothCore writes
    signed values.
  - `MSG_INSPECT_HONOR_STATS` server form: `u64` guid, `u8` honor
    points (wraps above 255), `u32` kills, `u32` today, `u32` yesterday,
    `u32` lifetime kills (`Handlers/MiscHandler.cpp:1019-1049`).
  - `SMSG_ZONE_UNDER_ATTACK`: `u32` area id, the sub-area
    (`Entities/Creature/Creature.cpp:2870-2875`); wowm names it
    `zone_id` (`combat/smsg_zone_under_attack.wowm:13-17`).
  - `SMSG_QUESTUPDATE_ADD_PVP_KILL`: three `u32`
    (`Server/Packets/QuestPackets.cpp:89-96`).
- [ ] **Step 2: Failing parser and builder tests** in `protocol.test.ts`:
  `parsePvpCredit` keeps a negative rank; `parseInspectHonorStats`;
  `parseZoneUnderAttack`; `parseQuestUpdateAddPvpKill`;
  `buildTogglePvp(true)` is one byte `01`, `buildTogglePvp(false)` one
  byte `00`, `buildTogglePvp()` is empty (the reader:
  `Handlers/MiscHandler.cpp:500-519`, one byte sets, no byte toggles);
  `buildInspectHonorStats(guid)` is one `u64`. Run
  `mise test packages/core/src/wow/areas/battlegrounds/protocol.test.ts`
  and see it fail on the missing module.
- [ ] **Step 3: Implement** the parsers and builders in `protocol.ts`.
- [ ] **Step 4: Failing store and act tests** with
  `areaRig("battlegrounds")` (contract 1.8) in `area.test.ts` and
  `runtime.test.ts`:
  - an `entity` update for the self guid with `PLAYER_FLAGS` `0x200`
    and `UNIT_FIELD_BYTES_2` byte 1 bit `0x01` sets `self.flagged` and
    `self.wantsFlag` and emits `pvp_flag { on: true, timer: false }`;
    `0x40000` sets `timer` (`Entities/Player/Player.h:467-477`,
    `Entities/Unit/UnitDefines.h:139-142`); the same fields also give
    `contested` (0x100), `ffa` (0x04) and `sanctuary` (0x08); an update
    for another guid changes nothing;
  - `KILLS` (two `u16`), the contributions, `LIFETIME_HONORBALE_KILLS`,
    `HONOR_CURRENCY` and `ARENA_CURRENCY` fill `self.honor`,
    `self.arenaPoints`, `self.killsToday`, `self.killsYesterday`,
    `self.lifetimeKills`;
  - injected `SMSG_PVP_CREDIT` appends to `credits` (last 20) and emits
    `honor_credit`; `SMSG_ZONE_UNDER_ATTACK` appends to `zoneAlerts`
    (last 10, with `ctx.now()`) and emits `zone_under_attack`;
    `MSG_INSPECT_HONOR_STATS` sets `inspect` per guid and emits
    `honor_inspect`; `SMSG_QUESTUPDATE_ADD_PVP_KILL` emits
    `pvp_kill_quest`;
  - `act.setPvp(true)` sends one `CMSG_TOGGLE_PVP` with body `01` and
    resolves on the matching `pvp_flag` event; 3 s with no update
    rejects `timeout` (fake timers in `try`/`finally`);
  - `act.inspectHonor(guid)` sends one `MSG_INSPECT_HONOR_STATS` and
    resolves on `honor_inspect` for that guid; silence rejects
    `no_answer` after 3 s (the server is silent out of range or when the
    target is attackable, `Handlers/MiscHandler.cpp:1030-1043`).
- [ ] **Step 5: Implement** `BattlegroundsState` (this task fills its
  `self` part; `slots`, `list`, `lastJoin` and `current` come in pvp-2
  and pvp-3), `BattlegroundsEvent`, `BattlegroundsStore` in `store.ts`
  (plan decision 1), the self-field input of plan decision 3,
  `BattlegroundsActs = { setPvp, inspectHonor }` and
  `battlegroundsRuntime` in `runtime.ts`. `register` owns the four
  server opcodes. Put the six dead rows in `dead` if the seed left them
  out. Put `SMSG_ZONE_UNDER_ATTACK` and `SMSG_QUESTUPDATE_ADD_PVP_KILL`
  in `unseen`, and `SMSG_PVP_CREDIT` too unless step 7 saw it.
- [ ] **Step 6: Harness rules.** In `battlegroundsHarness`: `pvp_flag`
  and `honor_credit` write one `log` row each (`battlegrounds/flag`,
  `battlegrounds/honor`); `zone_under_attack` writes `battlegrounds/zone_attack`
  as a `wake` only when the area id is the character's current area in
  the rule input, else `passive` [I: the builder finds the current area
  field in `RuleInput`, `events/rules.ts:75`; if none holds it, the row is
  always `passive` and the report says so]; `honor_inspect` and
  `pvp_kill_quest` write `log` rows. Test with the rule input fixture of
  S0-3.
- [ ] **Step 7: Live proof.** Create a `fresh` account (level 1). Write
  `probe-flows/battlegrounds-flag.ts`: send `CMSG_TOGGLE_PVP` with `01`,
  wait for the self `PLAYER_FLAGS` update, send
  `MSG_INSPECT_HONOR_STATS` with the character's own guid [I: the handler
  finds the character itself, `Handlers/MiscHandler.cpp:1019-1049`; if
  the reply does not come, the flow reports it], then send
  `CMSG_TOGGLE_PVP` with `00`. Run
  `mise protocol:probe <ACCOUNT> --flow battlegrounds-flag --expect MSG_INSPECT_HONOR_STATS --bodies --wait 30`
  and check in the trace that `PLAYER_FLAGS` gains and loses `0x200`.
  Delete the account. `SMSG_PVP_CREDIT` becomes live only in pvp-3's
  match (bonus honor with an empty victim,
  `Battlegrounds/Battleground.cpp:1410`); until then it is `mock`.
- [ ] **Step 8: Docs.** Create `docs/areas/battlegrounds.md` with the
  fixed headings of contract 3.8. Wire notes: the signed credit fields,
  the `u8` honor wrap, the sub-area id. Left out: none. Capabilities
  row: "Turn its PvP flag on and off" (pvp-11a proves it). Proof rows
  for the five opcodes and the six dead rows. Run
  `mise protocol:coverage`, `mise protocol:cite-check`,
  `mise lint:docs`.
- [ ] **Step 9: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_TOGGLE_PVP` | live | flow `battlegrounds-flag`, the `PLAYER_FLAGS` update; reader `Handlers/MiscHandler.cpp:500-519` |
| `MSG_INSPECT_HONOR_STATS` | live | flow `battlegrounds-flag`; writer `Handlers/MiscHandler.cpp:1019-1049` |
| `SMSG_PVP_CREDIT` | mock, `unseen` (live in pvp-3 if a match pops) | `areaRig` test; writer `Entities/Player/Player.cpp:6385-6392` |
| `SMSG_ZONE_UNDER_ATTACK` | mock, `unseen` | `areaRig` test; writer `Entities/Creature/Creature.cpp:2870-2875`; sent to every player of the guard's faction (`AI/CoreAI/GuardAI.cpp:62-69`), so a trace may catch it by chance |
| `SMSG_QUESTUPDATE_ADD_PVP_KILL` | mock, `unseen` | `areaRig` test; writer `Server/Packets/QuestPackets.cpp:89-96`; which quests have a players-slain objective could not be determined |

**Commit:**

```
feat: Read the PvP flag and honor

The character now knows whether it is flagged for PvP, its honor and
kills, and it can set the flag and inspect a friendly player's honor.
```

## Task pvp-2: battleground queue

- **codeArea:** `battlegrounds`. **Size:** L.
- **Files:**
  - Edit: `.../areas/battlegrounds/opcodes.ts` (remove the
    `SMSG_BATTLEFIELD_STATUS` and `SMSG_BATTLEFIELD_LIST` stub lines),
    `protocol.ts`, `protocol.test.ts`, `store.ts`, `store.test.ts`,
    `runtime.ts`, `runtime.test.ts`, `area.test.ts` (split
    `protocol-queue.ts` out of `protocol.ts` before 500 lines)
  - Edit: `packages/core/test-support/areas/battlegrounds.ts`
  - Edit: `packages/harness/src/areas/battlegrounds/area.ts` and test
  - Create: `packages/devtools/src/probe-flows/battlegrounds-queue.ts`
  - Edit: `docs/areas/battlegrounds.md`; regenerate
    `docs/protocol-coverage/battlegrounds.md`
- **Depends on:** pvp-1, T-5, T-6.
- **Opcodes:** `CMSG_BATTLEFIELD_LIST`, `SMSG_BATTLEFIELD_LIST`,
  `CMSG_BATTLEMASTER_HELLO`, `CMSG_BATTLEMASTER_JOIN`,
  `CMSG_BATTLEFIELD_STATUS`, `SMSG_BATTLEFIELD_STATUS`,
  `SMSG_GROUP_JOINED_BATTLEGROUND`, `CMSG_BATTLEFIELD_PORT`.

**Steps:**

- [ ] **Step 1: Test builders**, from the writers:
  - `battlegroundsBattlefieldListBody(...)`: `u64` guid, `u8`
    fromWhere, `u32` bgTypeId, `u8 0`, `u8 0`, `u8` hasWin, `u32`
    winHonor, `u32` winArena, `u32` lossHonor, `u8` isRandom, the
    random block when set, `u32` count, count x `u32` instance id; for
    bg type 6 (all arenas) a lone `u32 0` after the rewards
    (`Battlegrounds/BattlegroundMgr.cpp:584-638`). wowm
    (`battleground/smsg_battlefield_list.wowm:77-97`) lacks the
    fromWhere byte; AzerothCore wins.
  - `battlegroundsBattlefieldStatusBody(...)`: `u32` slot; the none form
    is only `u64 0` (12 bytes in all); otherwise `u8` arenaType, `u8`
    isArena (0x0E or 0), `u32` bgTypeId, `u16 0x1F90`, `u8` minLevel,
    `u8` maxLevel, `u32` clientInstanceId, `u8` rated, `u32` status,
    then `WAIT_QUEUE` `u32` avgWait, `u32` inQueue; `WAIT_JOIN` `u32`
    map, `u64 0`, `u32` timeToRemove; `IN_PROGRESS` `u32` map, `u64 0`,
    `u32` autoLeave, `u32` elapsed, `u8` faction
    (`Battlegrounds/BattlegroundMgr.cpp:196-246`). wowm
    (`battleground/smsg_battlefield_status.wowm:88-122`) reads the status
    as `u8` and has no none form; AzerothCore wins.
  - `battlegroundsGroupJoinedBody(result, guid?)`: `i32` result, plus
    `u64` when the result is -11 or -12
    (`Battlegrounds/BattlegroundMgr.cpp:248-254`); names from
    `src/server/shared/SharedDefines.h:3890-3909`. wowm
    (`social/smsg_group_joined_battleground.wowm:48-76`) has no negative
    codes; AzerothCore wins.
- [ ] **Step 2: Failing parser and builder tests.**
  `parseBattlefieldList` (with and without the random block, and the
  arena form); `parseBattlefieldStatus` for none, `WAIT_QUEUE`,
  `WAIT_JOIN` and `IN_PROGRESS`, keeping `isArena` and the `0x1F90` word
  raw; `parseGroupJoinedBattleground` for 2 (joined Warsong Gulch), -1,
  -2, -4 and -11 with its guid. Builders, from the readers:
  `buildBattlemasterHello(guid)` (`u64`,
  `Handlers/BattleGroundHandler.cpp:37-63`);
  `buildBattlefieldList(bgType, fromWhere, canGainXp)` (`u32`, `u8`,
  `u8`, `:368-391`); `buildBattlemasterJoin(guid, bgType, instanceId,
  asGroup)` (`u64`, `u32` BattlemasterList id, `u32`, `u8`, `:72-86`;
  wowm names the second field `Map`); `CMSG_BATTLEFIELD_STATUS` is empty
  (`:637-696`) and has no builder; `buildBattlefieldPort(arenaType,
  bgType, action)` writes `u8` arenaType, `u8 0`, `u32` bgType, `u16
  0x1F90`, `u8` action (`:393-617`). Run the test file and see it fail.
- [ ] **Step 3: Implement** the parsers and builders.
- [ ] **Step 4: Failing store and act tests** with
  `areaRig("battlegrounds")`:
  - status per slot (`PLAYER_MAX_BATTLEGROUND_QUEUES = 2`,
    `src/server/shared/SharedDefines.h:153`): `none`, `queued`
    (bg type, arena type, rated, levels, instance id, average wait, time
    in queue, `receivedAt`), `invited` (map, `expiresAt` = `ctx.now()` +
    time to remove; no timer), `active` (map, auto-leave, elapsed,
    faction); a none status clears its slot; events `bg_status`,
    `bg_invited` (slot, map, expiry) and `bg_left`;
  - `SMSG_BATTLEFIELD_LIST` sets `list` and emits `bg_list`;
    `SMSG_GROUP_JOINED_BATTLEGROUND` sets `lastJoin` and emits
    `bg_join_result` with the error name;
  - the runtime sends one empty `CMSG_BATTLEFIELD_STATUS` on the
    `core.self` events `login_verified` and `new_world`
    (`self-store.ts:16,20`; the handler comment says the client sends it
    at login and on map change, `Handlers/BattleGroundHandler.cpp:639-640`);
  - `act.list(bgType)` sends `CMSG_BATTLEFIELD_LIST` and resolves on
    `bg_list` (3 s); `act.hello(guid)` sends `CMSG_BATTLEMASTER_HELLO`
    and resolves on `bg_list` (3 s);
  - `act.join(bgType, { asGroup, instanceId, via })` resolves on a
    `queued` status or rejects with the `bg_join_result` error name
    (5 s);
  - `act.answer(slot, accept)` sends `CMSG_BATTLEFIELD_PORT` that echoes
    the slot's arena type and bg type (AzerothCore looks the queue up by
    both, `Handlers/BattleGroundHandler.cpp:427-428`) and resolves on
    `active` or `none` (10 s, the enter is a map transfer); an empty slot
    rejects `no_slot` and sends nothing; `act.leaveQueue(slot)` is
    `answer(slot, false)` on a queued slot;
  - a port while the self is in combat rejects `in_combat` and sends
    nothing (`:419-423`) [I: the combat state comes from `core.combat`;
    the builder names the member it reads].
- [ ] **Step 5: Implement.** Core never answers an invitation by itself
  (design 5.22). The world-entry status request adds one packet to every
  session, like N6; say so in the report.
- [ ] **Step 6: Harness rules.** `bg_status` `queued` writes
  `battlegrounds/queued`, a `none` after `queued` writes
  `battlegrounds/queue_left`, `bg_join_result` with an error writes
  `battlegrounds/join_failed` (all `log`); `bg_invited` writes
  `battlegrounds/invited` as a `wake` with the deadline in `data`;
  `bg_list` returns `[]` (the reply goes to the tool).
- [ ] **Step 7: Live proof** (P-queue, design 5.22). Write
  `probe-flows/battlegrounds-queue.ts` with `--arg` steps: `list` (bg
  2), `hello` (the nearest unit with npc flag `0x100000`, if one is in
  view), `join` (bg 2), `status` (an empty `CMSG_BATTLEFIELD_STATUS`
  while queued; the server answers with the `WAIT_QUEUE` status,
  `Handlers/BattleGroundHandler.cpp:645-695`), `join-again` (bg 2 a
  second time), `leave` (port action 0).
  1. `mise factory soap create eversong10`. If the probe shows a level
     under 10, run `mise factory soap gm <ACCOUNT> level 10`.
  2. `mise protocol:probe <ACCOUNT> --flow battlegrounds-queue --expect SMSG_BATTLEFIELD_LIST --expect SMSG_BATTLEFIELD_STATUS --expect SMSG_GROUP_JOINED_BATTLEGROUND --bodies --wait 60`.
     The second join of the same battleground answers `-1`
     (`ERR_BATTLEGROUND_NONE`, `Handlers/BattleGroundHandler.cpp:172-175`);
     the leave answers the 12-byte none form (`:590`).
  3. `mise factory soap gm <ACCOUNT> deserter-bg 1m`, then the flow with
     `--arg step=join` answers `-2` (`:164-166`).
  4. For `CMSG_BATTLEMASTER_HELLO`: `mise factory soap gm <ACCOUNT> tele <tele>`
     to a capital point near a battlemaster, then the flow with
     `--arg step=hello`. Which `game_tele` name lands in view of a
     battlemaster could not be determined here; the builder finds one by
     a `creature` query for npc flag `0x100000` near the capital tele
     points and records it.
  5. Optional, for `-4` (`ERR_BATTLEGROUND_TOO_MANY_QUEUES`,
     `:130-136`): a `max80` account joins Warsong Gulch, Arathi Basin
     and a third battleground. At level 10 only Warsong Gulch has a
     bracket [I], so a third queue returns silently there.
  Delete the accounts.
- [ ] **Step 8: Docs.** Wire notes for the three disagreements. Proof
  rows for the eight opcodes. Run `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise lint:docs`.
- [ ] **Step 9: Checks.** `mise ci:checks`; rerun `t0-self-state`
  (every login now sends the status request).

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_BATTLEFIELD_LIST` | live | flow `battlegrounds-queue` step `list`; reader `Handlers/BattleGroundHandler.cpp:368-391` |
| `SMSG_BATTLEFIELD_LIST` | live | same; writer `Battlegrounds/BattlegroundMgr.cpp:584-638` |
| `CMSG_BATTLEMASTER_HELLO` | live | step `hello` after `soap gm tele`; reader `Handlers/BattleGroundHandler.cpp:37-63` |
| `CMSG_BATTLEMASTER_JOIN` | live | step `join`, the `WAIT_QUEUE` reply; reader `Handlers/BattleGroundHandler.cpp:72-294` |
| `CMSG_BATTLEFIELD_STATUS` | live | step `status` while queued, the `WAIT_QUEUE` reply; reader `Handlers/BattleGroundHandler.cpp:637-696` |
| `SMSG_BATTLEFIELD_STATUS` | live | `WAIT_QUEUE` and none forms; writer `Battlegrounds/BattlegroundMgr.cpp:196-246` (`WAIT_JOIN` and `IN_PROGRESS` in pvp-3) |
| `SMSG_GROUP_JOINED_BATTLEGROUND` | live | `-1` and `-2`; writer `Battlegrounds/BattlegroundMgr.cpp:248-254` |
| `CMSG_BATTLEFIELD_PORT` | live | step `leave` (action 0), the none reply; reader `Handlers/BattleGroundHandler.cpp:393-617` |

**Built (pvp-2, wave 5):** the eight opcodes are `live`, from account `FAC6ABF824E60` (deleted); the runs and their packets are listed in `docs/areas/battlegrounds.md`. Deviations from the steps above:

- The new helpers are `protocol-queue.ts`, `store-queue.ts` and `runtime-queue.ts` (SR5-pvp-3); the combat test reads `unitFlags & IN_COMBAT` through `BattlegroundsStore.selfInCombat()` (SR5-pvp-4).
- `join` resolves only on a queued status whose slot was not queued before, because a late status reply for a held queue otherwise resolved a second join before its `-1` arrived (found in the first live run). `leaveQueue` rejects `not_queued` on an invited slot (a leave there is recorded as a desertion, `Handlers/BattleGroundHandler.cpp:600-610`).
- The status parser also reads `WAIT_LEAVE` (a `leaving` slot kind) and throws on an unknown status.
- The flow runs one `step` per `--flow`; several `--flow` arguments in one probe keep the queue, and `status` reports the state after a `--send CMSG_BATTLEFIELD_STATUS`.
- `-4` ran live at level 61 with Warsong Gulch, Arathi Basin and Eye of the Storm (the third queue answered `too_many_queues`); `hello` ran live after `tele MorshanBaseCamp`. The `t0-self-state` rerun belongs to the slice gate (SR5-pvp-7); the login packet is proved by a `--flow login` probe.

**Commit:**

```
feat: Join and leave battleground queues

The character can list a battleground, join its queue, see the queue
and invitation per slot, and leave, so the pvp tool has a tested core.
```

## Task pvp-3: inside a battleground

- **codeArea:** `battlegrounds`. **Size:** M.
- **Files:**
  - Edit: `.../areas/battlegrounds/opcodes.ts` (`unseen`), `protocol*.ts`
    and tests (split `protocol-match.ts` out if needed), `store.ts`,
    `store.test.ts`, `runtime.ts`, `runtime.test.ts`, `area.test.ts`
  - Edit: `packages/core/test-support/areas/battlegrounds.ts`
  - Edit: `packages/harness/src/areas/battlegrounds/area.ts` and test
  - Create: `packages/devtools/src/probe-flows/battlegrounds-warsong.ts`
  - Edit: `docs/areas/battlegrounds.md`; regenerate
    `docs/protocol-coverage/battlegrounds.md`
- **Depends on:** pvp-2.
- **Opcodes:** `SMSG_BATTLEGROUND_PLAYER_JOINED`,
  `SMSG_BATTLEGROUND_PLAYER_LEFT`, `MSG_PVP_LOG_DATA`,
  `MSG_BATTLEGROUND_PLAYER_POSITIONS`, `CMSG_LEAVE_BATTLEFIELD`,
  `CMSG_REPORT_PVP_AFK`.

**Steps:**

- [ ] **Step 1: Start the bot probe first** (design 5.22 decision; plan
  decision 8). Write `probe-flows/battlegrounds-warsong.ts`: join
  Warsong Gulch (bg 2), wait for `WAIT_JOIN`, answer with port action 1,
  wait for `IN_PROGRESS`, request the score (`MSG_PVP_LOG_DATA`) and the
  carriers (`MSG_BATTLEGROUND_PLAYER_POSITIONS`) once a minute, report
  one teammate as away once (`CMSG_REPORT_PVP_AFK`), wait for the
  end-of-match `MSG_PVP_LOG_DATA` (sent to everyone,
  `Battlegrounds/Battleground.cpp:872-873`), then send
  `CMSG_LEAVE_BATTLEFIELD`. Create an `eversong10` account and run in
  the background:
  `mise protocol:probe <ACCOUNT> --flow battlegrounds-warsong --expect SMSG_BATTLEFIELD_STATUS --expect SMSG_BATTLEGROUND_PLAYER_JOINED --expect MSG_PVP_LOG_DATA --bodies --wait 1200`.
  The live value of `AiPlayerbot.RandomBotJoinBG` could not be determined
  (default 1, `modules/mod-playerbots/conf/playerbots.conf.dist:1619`;
  bots join when real players queue,
  `modules/mod-playerbots/src/Bot/RandomPlayerbotMgr.cpp:907-980`).
  While it runs, do steps 2 to 6.
- [ ] **Step 2: Test builders**, from the writers:
  `battlegroundsPlayerJoinedBody(guid)` and `battlegroundsPlayerLeftBody(guid)`
  (`u64`, `Battlegrounds/BattlegroundMgr.cpp:256-266`);
  `battlegroundsPvpLogDataBody(...)`: `u8` isArena; for an arena `2 x
  (u32 ratingLost, u32 ratingWon, u32 mmr)` then `2 x cstring` team
  names; `u8` ended, `u8` winner when ended, `u32` count, per player
  `u64` guid, `u32` killing blows, then `u32` honorable kills, `u32`
  deaths, `u32` bonus honor for a battleground or `u8` team for an arena,
  then `u32` damage, `u32` healing, `u32 n`, `n x u32` objectives
  (`Battlegrounds/Battleground.cpp:1373-1401`, `:127-139`;
  `Battlegrounds/Arena.cpp:32-63`; Warsong Gulch has 2 objectives,
  `Battlegrounds/Zones/BattlegroundWS.cpp:29-34`). wowm has only a 1.12
  server form (`pvp/msg_pvp_log_data_server.wowm:1`).
  `battlegroundsPlayerPositionsBody(carriers)`: `u32 0`, `u32` carrier
  count, then `u64` guid, `f32` x, `f32` y each
  (`Handlers/BattleGroundHandler.cpp:298-347`); wowm
  (`battleground/msg_battleground_player_positions.wowm:13-21`) reads the
  count as `u8`; AzerothCore wins.
- [ ] **Step 3: Failing parser and builder tests.** The two guid
  parsers; `parsePvpLogData` for a Warsong Gulch board, an ended board
  with a winner, and the arena form (plan decision 4), with `count`
  capped at 80 [I]; `parsePlayerPositions` with 0 and 2 carriers.
  Builders: `MSG_PVP_LOG_DATA` and `MSG_BATTLEGROUND_PLAYER_POSITIONS`
  client forms are empty; `buildLeaveBattlefield()` writes `u8 0`, `u8
  0`, `u32 0`, `u16 0` (AzerothCore skips all four,
  `Handlers/BattleGroundHandler.cpp:619-635`);
  `buildReportPvpAfk(guid)` is one `u64` (`:928-943`). Run and see it
  fail.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Failing store and act tests** with
  `areaRig("battlegrounds")`: an `active` status whose map equals the
  current map (`core.self.mapId`) opens `current` and emits `bg_entered`;
  joined and left guids fill `current.roster` and emit
  `bg_player_joined`, `bg_player_left`; a log fills `current.score` and
  emits `bg_score` with `ended` and `winner`; positions fill
  `current.carriers`; a `new_world` to another map clears `current`;
  `act.requestScore()` resolves on `bg_score` (3 s);
  `act.requestCarriers()` resolves on positions (3 s);
  `act.leaveBattleground()` sends `CMSG_LEAVE_BATTLEFIELD` and resolves
  on the none status (10 s), and rejects `in_combat` in combat
  (`:629-632`) and `not_in_battleground` without `current`;
  `act.reportAfk(guid)` sends and resolves on send (no reply, `:942`).
- [ ] **Step 6: Harness rules.** `bg_entered` and `bg_left` write
  `battlegrounds/entered` and `battlegrounds/left` (`log`); `bg_score`
  with `ended` writes `battlegrounds/ended` as a `wake`, else `[]`;
  `bg_player_joined` and `bg_player_left` write `passive` rows.
- [ ] **Step 7: Read the probe.** If it saw a pop, record the counts and
  bodies of every expected opcode and of `SMSG_PVP_CREDIT` (bonus honor at
  the end, `Battlegrounds/Battleground.cpp:1410`), and move each seen
  opcode to `live` (pvp-1's `SMSG_PVP_CREDIT` row included). If it saw no
  pop in 20 min, record "no pop in 20 min", keep every server opcode of
  this task in `unseen` with a `mock` row from its writer, and tell the
  coordinator in the report (design 7.2; the maintainer question on bot
  pops). `CMSG_LEAVE_BATTLEFIELD` and `CMSG_REPORT_PVP_AFK` are then
  `builder` rows with their readers until a pop. Delete the account.
- [ ] **Step 8: Docs.** Wire notes: the 3.3.5 log form from AzerothCore
  alone; the `u32` carrier count. Proof rows. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise lint:docs`.
- [ ] **Step 9: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_BATTLEGROUND_PLAYER_JOINED` | live if a pop, else mock `unseen` | flow `battlegrounds-warsong`; writer `Battlegrounds/BattlegroundMgr.cpp:262-266` |
| `SMSG_BATTLEGROUND_PLAYER_LEFT` | live if a pop, else mock `unseen` | same; writer `Battlegrounds/BattlegroundMgr.cpp:256-260` |
| `MSG_PVP_LOG_DATA` | live if a pop, else mock `unseen` | same; writer `Battlegrounds/Battleground.cpp:1373-1401` |
| `MSG_BATTLEGROUND_PLAYER_POSITIONS` | live if a pop, else mock `unseen` | same; writer `Handlers/BattleGroundHandler.cpp:298-347` |
| `CMSG_LEAVE_BATTLEFIELD` | live if a pop, else builder | reader `Handlers/BattleGroundHandler.cpp:619-635` |
| `CMSG_REPORT_PVP_AFK` | accepted if a pop, else builder | reader `Handlers/BattleGroundHandler.cpp:928-943`; no reply |

**Commit:**

```
feat: Follow a battleground match

The character now tracks who joins and leaves its battleground, the
score board, the flag carriers and the end of the match, and it can
leave or report an away teammate.
```

## Task pvp-4: battleground spirit guide

- **codeArea:** `battlegrounds`. **Size:** S.
- **Files:**
  - Edit: `.../areas/battlegrounds/opcodes.ts`, `protocol*.ts`,
    `store.ts`, `runtime.ts` and their tests, `area.test.ts`
  - Edit: `packages/core/test-support/areas/battlegrounds.ts`
  - Edit: `packages/harness/src/areas/battlegrounds/area.ts` and test
  - Edit: `packages/devtools/src/probe-flows/battlegrounds-warsong.ts`
    (a `rez` step)
  - Edit: `docs/areas/battlegrounds.md`; regenerate
    `docs/protocol-coverage/battlegrounds.md`
- **Depends on:** pvp-3.
- **Opcodes:** `CMSG_AREA_SPIRIT_HEALER_QUERY`,
  `CMSG_AREA_SPIRIT_HEALER_QUEUE`, `SMSG_AREA_SPIRIT_HEALER_TIME`.

**Steps:**

- [ ] **Step 1: Failing tests.** `battlegroundsAreaSpiritHealerTimeBody({ guid, ms })`
  (`u64`, `u32` milliseconds to the next mass rez,
  `Battlegrounds/BattlegroundMgr.cpp:665-673`; the Wintergrasp writer is
  `Battlefield/Battlefield.cpp:730-740`); `parseAreaSpiritHealerTime`;
  `buildAreaSpiritHealerQuery(guid)` and `buildAreaSpiritHealerQueue(guid)`,
  one `u64` each (`Handlers/MiscHandler.cpp:1640-1684`). With
  `areaRig`: an injected time sets `current.rez = { guide, nextAt }`
  (`ctx.now()` plus the milliseconds; outside a battleground the store
  keeps it at top level so Wintergrasp can use it) and emits
  `bg_rez_time`; `act.queueSpiritGuide(guid)` sends the query and the
  queue and resolves on `bg_rez_time` (3 s).
- [ ] **Step 2: Implement.** Harness rule: `bg_rez_time` writes a
  `passive` row `battlegrounds/rez_time`.
- [ ] **Step 3: Live proof.** Add a `rez` step to the pvp-3 flow: after
  a death in the match, release, then query and queue at the nearest unit
  with npc flag `0x8000` (spirit guide, `npc-roles.ts:41`). Run it only
  when pvp-3's probe got a pop; else the rows stay `mock`/`builder`. The
  Wintergrasp spirit guide is a second live chance in pvp-13c's window.
- [ ] **Step 4: Docs and checks.** Proof rows; `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_AREA_SPIRIT_HEALER_QUERY` | live if a pop, else builder | flow `battlegrounds-warsong` step `rez`; reader `Handlers/MiscHandler.cpp:1640-1661` |
| `CMSG_AREA_SPIRIT_HEALER_QUEUE` | live if a pop, else builder | same; reader `Handlers/MiscHandler.cpp:1663-1684` |
| `SMSG_AREA_SPIRIT_HEALER_TIME` | live if a pop, else mock `unseen` | same; writer `Battlegrounds/BattlegroundMgr.cpp:665-673` |

**Commit:**

```
feat: Queue at a battleground spirit guide

The character can queue for the next mass resurrection at a spirit
guide and knows how long it has to wait.
```

## Task pvp-5: arena team reads

- **codeArea:** `arena`. **Size:** M.
- **Files:**
  - Edit: `packages/core/src/wow/areas/arena/opcodes.ts` (remove the
    `SMSG_ARENA_TEAM_COMMAND_RESULT` stub line; fill `dead`),
    `.../areas/arena/area.ts`
  - Create: `.../areas/arena/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `store.test.ts`, `runtime.ts`, `runtime.test.ts`,
    `area.test.ts`
  - Create: `packages/core/test-support/areas/arena.ts`
  - Edit: `packages/harness/src/areas/arena/area.ts`; create its test
  - Create: `packages/devtools/src/probe-flows/arena-team.ts`
  - Create: `docs/areas/arena.md`; regenerate
    `docs/protocol-coverage/arena.md`
- **Depends on:** pvp-4 (unit order), `SEED-4`, T-5, T-6.
- **Opcodes:** `CMSG_ARENA_TEAM_QUERY`, `SMSG_ARENA_TEAM_QUERY_RESPONSE`,
  `SMSG_ARENA_TEAM_STATS`, `CMSG_ARENA_TEAM_ROSTER`,
  `SMSG_ARENA_TEAM_ROSTER`, `MSG_INSPECT_ARENA_TEAMS`,
  `SMSG_ARENA_TEAM_COMMAND_RESULT`.

**Steps:**

- [ ] **Step 1: Test builders**, from the writers:
  - `arenaTeamQueryResponseBody(...)`: `u32` id, cstring name, `u32`
    type, `u32` background colour, emblem style, emblem colour, border
    style, border colour (`Battlegrounds/ArenaTeam.cpp:488-501`); wowm
    (`queries/smsg_arena_team_query_response.wowm:1-12`) reads the type
    as `u8`; AzerothCore wins.
  - `arenaTeamStatsBody(...)`: seven `u32`
    (`Battlegrounds/ArenaTeam.cpp:503-514`).
  - `arenaTeamRosterBody(...)`: `u32` id, `u8` flag (0), `u32` member
    count, `u32` type, per member `u64` guid, `u8` online, cstring name,
    `u32` role (0 captain), `u8` level, `u8` class, five `u32`, and two
    `f32` when the flag is set (`Battlegrounds/ArenaTeam.cpp:447-486`);
    wowm (`arena/smsg_arena_team_roster.wowm:17-42`) has a `u8` type and
    no role; AzerothCore wins.
  - `arenaInspectArenaTeamsBody(...)`: `u64` guid, `u8` slot, six `u32`
    (`Battlegrounds/ArenaTeam.cpp:525-539`).
  - `arenaTeamCommandResultBody(...)`: `u32` action, cstring team,
    cstring player, `u32` error (`Handlers/ArenaTeamHandler.cpp:406-414`);
    error names from `Battlegrounds/ArenaTeam.h:38-59`; wowm
    (`arena/smsg_arena_team_command_result.wowm:1-20`) lacks
    `TARGET_TOO_HIGH_S` 0x16, `NOT_FOUND` 0x1B and `TEAMS_LOCKED` 0x1E and
    puts `TOO_MANY_MEMBERS_S` at 0x16; AzerothCore wins.
- [ ] **Step 2: Failing parser and builder tests** for the five parsers;
  `buildArenaTeamQuery(id)` (`u32`, `Handlers/ArenaTeamHandler.cpp:63-73`;
  no wowm file), `buildArenaTeamRoster(id)` (`u32`, `:75-82`),
  `buildInspectArenaTeams(guid)` (`u64`, `:29-61`). Run and see it fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Failing store and act tests** with `areaRig("arena")`:
  an `entity` update for the self guid fills `own[0..2]` from
  `ARENA_TEAM_INFO_1_1` (3 x 7 `u32`: id, type, member, week games,
  season games, season wins, personal rating;
  `Battlegrounds/ArenaTeam.h:74-81`) and emits `arena_team` on a change
  (plan decision 3); query, stats and roster fill `teams` by id and emit
  `arena_team`; a command result sets `lastResult` and emits
  `arena_result` with the action and error names; inspect replies fill
  `inspected` per guid (one reply per team) and emit `arena_inspect`;
  `act.queryTeam(id)` resolves when both the query response and the
  stats have arrived (3 s; the handler sends both,
  `Handlers/ArenaTeamHandler.cpp:69-70`); `act.roster(id)` resolves on the
  roster (3 s); `act.inspectArena(guid)` resolves after the first reply
  plus 200 ms, or rejects `no_answer` after 3 s [I: the reply count is one
  per team, so the act waits a short settle].
- [ ] **Step 5: Implement** `ArenaState`, `ArenaEvent`, `ArenaStore`,
  `ArenaActs`, `arenaRuntime`. Put the two dead rows in `dead` if the
  seed left them out.
- [ ] **Step 6: Harness rules.** `arena_result` writes `arena/team`
  (`log`) with the action and error names; `arena_team` and
  `arena_inspect` return `[]` (the tool reads them).
- [ ] **Step 7: Live proof** (P-arena). Create a `max80` account. Run
  `mise factory soap gm <ACCOUNT> arena-create 2 Fac<4 random letters>`,
  then `mise factory soap gm <ACCOUNT> read arena-lookup Fac<...>` for the
  team id. The flow `arena-team` sends the query, the roster request and
  an inspect of the character's own guid [I: the handler accepts the
  character itself], then an invite to a name that is offline, which
  answers `COMMAND_RESULT` with `PLAYER_NOT_FOUND_S` 0x0B
  (`Handlers/ArenaTeamHandler.cpp:103-106`). The invite builder is
  pvp-6's; this flow sends its bytes with the probe's `--send
  CMSG_ARENA_TEAM_INVITE --body <hex>` instead. Run
  `mise protocol:probe <ACCOUNT> --flow arena-team --arg team=<id> --expect SMSG_ARENA_TEAM_QUERY_RESPONSE --expect SMSG_ARENA_TEAM_STATS --expect SMSG_ARENA_TEAM_ROSTER --expect MSG_INSPECT_ARENA_TEAMS --expect SMSG_ARENA_TEAM_COMMAND_RESULT --bodies --wait 30`.
  Then `mise factory soap gm <ACCOUNT> arena-disband <id>` and delete the
  account.
- [ ] **Step 8: Docs.** Create `docs/areas/arena.md` with the fixed
  headings; wire notes for the three disagreements; proof rows for the
  seven opcodes and the two dead rows. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise lint:docs`.
- [ ] **Step 9: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_ARENA_TEAM_QUERY` | live | flow `arena-team`; reader `Handlers/ArenaTeamHandler.cpp:63-73` |
| `SMSG_ARENA_TEAM_QUERY_RESPONSE` | live | same; writer `Battlegrounds/ArenaTeam.cpp:488-501` |
| `SMSG_ARENA_TEAM_STATS` | live | same; writer `Battlegrounds/ArenaTeam.cpp:503-514` |
| `CMSG_ARENA_TEAM_ROSTER` | live | same; reader `Handlers/ArenaTeamHandler.cpp:75-82` |
| `SMSG_ARENA_TEAM_ROSTER` | live | same; writer `Battlegrounds/ArenaTeam.cpp:447-486` |
| `MSG_INSPECT_ARENA_TEAMS` | live | same; writer `Battlegrounds/ArenaTeam.cpp:525-539` |
| `SMSG_ARENA_TEAM_COMMAND_RESULT` | live | invite to an offline name; writer `Handlers/ArenaTeamHandler.cpp:406-414` |

**Commit:**

```
feat: Read arena teams

The character now knows its arena teams, their ratings and rosters,
the result of each team command, and a friendly player's teams.
```

## Task pvp-6: arena team invitations

- **codeArea:** `arena`. **Size:** M.
- **Files:**
  - Edit: `.../areas/arena/opcodes.ts` (remove the `SMSG_ARENA_TEAM_EVENT`
    stub line), `protocol.ts`, `store.ts`, `runtime.ts` and their tests,
    `area.test.ts`
  - Edit: `packages/core/test-support/areas/arena.ts`
  - Edit: `packages/harness/src/areas/arena/area.ts` and test
  - Edit (sorted key): `packages/harness/src/puppet/calls.ts`
    (`arena.answerInvite`, `arena.invite`, `arena.leave`)
  - Create: `packages/devtools/src/probe-flows/arena-invite.ts`
  - Edit: `docs/areas/arena.md`; regenerate `docs/protocol-coverage/arena.md`
- **Depends on:** pvp-5, T-7a (partner calls).
- **Opcodes:** `CMSG_ARENA_TEAM_INVITE`, `SMSG_ARENA_TEAM_INVITE`,
  `CMSG_ARENA_TEAM_ACCEPT`, `CMSG_ARENA_TEAM_DECLINE`,
  `SMSG_ARENA_TEAM_EVENT`.

**Steps:**

- [ ] **Step 1: Failing tests.** Builders `arenaTeamInviteBody({ inviter, team })`
  (two cstrings, `Handlers/ArenaTeamHandler.cpp:159-164`) and
  `arenaTeamEventBody({ event, strings, guid? })`: `u8` event, `u8`
  count, the strings, then a `u64` guid for `JOIN` and `LEAVE` only
  (`Battlegrounds/ArenaTeam.cpp:582-611`; callers
  `Handlers/ArenaTeamHandler.cpp:198,260` pass a guid, `:360,403` and
  `Battlegrounds/ArenaTeam.cpp:404` pass none); events from
  `Battlegrounds/ArenaTeam.h:61-69`. wowm
  (`arena/smsg_arena_team_event.wowm:18-46`) puts the count last;
  AzerothCore wins. Parsers `parseArenaTeamInvite`, `parseArenaTeamEvent`
  (reads the guid only when 8 bytes remain; maps the strings by event).
  Builders `buildArenaTeamInvite(id, name)` (`u32`, cstring, `:84-166`);
  `CMSG_ARENA_TEAM_ACCEPT` and `CMSG_ARENA_TEAM_DECLINE` are empty
  (`:168-207`). With `areaRig`: an invite sets `invite` and emits
  `arena_invite`; a `JOIN` event naming the character, or an accept or
  decline, clears it; events append to `events` (last 20) and emit
  `arena_event`; `act.invite(id, name)` resolves on the `arena_result`
  for that name or rejects with its error name (3 s);
  `act.answerInvite(true)` resolves on the `JOIN` event;
  `act.answerInvite(false)` resolves on send (no reply, `:206`); both
  reject `no_invite` with no pending invite and send nothing.
- [ ] **Step 2: Implement.** Harness rules: `arena_invite` writes
  `arena/invited` as a `wake`; `arena_event` writes `arena/event`
  (`log`) with the event name.
- [ ] **Step 3: Partner calls.** Add `arena.answerInvite`, `arena.invite`
  and `arena.leave` to `puppet/calls.ts` in the shape T-7 defines. If
  T-7's allow-list cannot name an area act, stop `blocked` and name the
  member.
- [ ] **Step 4: Live proof.** Two `max80` accounts, A and B. A gets a
  `Fac` team by `soap gm <A> arena-create 2 FacArena<n>`, then `read
  arena-lookup FacArena<n>` for the team id, and `arena-disband <id>`
  before the accounts are deleted (T-6, N30). Start B's puppet with
  `--packet-trace` (T-7c). The flow `arena-invite` on A invites B's
  character, waits, invites again, waits for `JOIN`. Between the two
  invites run `tmp/puppet-<B> call arena.answerInvite '[false]'`, then
  `'[true]'` after the second. Evidence: A's probe expects
  `SMSG_ARENA_TEAM_EVENT`; B's trace shows two `SMSG_ARENA_TEAM_INVITE`;
  the second invite succeeds instead of
  `ERR_ALREADY_INVITED_TO_ARENA_TEAM_S` (`:144-147`), which proves the
  decline. Keep the pair and the team for pvp-7 only if pvp-7 runs in
  the same session; otherwise disband and delete both accounts.
- [ ] **Step 5: Docs and checks.** Proof rows; `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_ARENA_TEAM_INVITE` | live | flow `arena-invite`; reader `Handlers/ArenaTeamHandler.cpp:84-166` |
| `SMSG_ARENA_TEAM_INVITE` | live | B's puppet trace; writer `Handlers/ArenaTeamHandler.cpp:159-164` |
| `CMSG_ARENA_TEAM_ACCEPT` | live | the `JOIN` event; reader `Handlers/ArenaTeamHandler.cpp:168-199` |
| `CMSG_ARENA_TEAM_DECLINE` | accepted | the next invite succeeds; reader `Handlers/ArenaTeamHandler.cpp:201-207` |
| `SMSG_ARENA_TEAM_EVENT` | live | `JOIN` to both; writer `Battlegrounds/ArenaTeam.cpp:582-611` |

**Commit:**

```
feat: Invite players to an arena team

The character can invite a player to its arena team and accept or
decline an invitation, and it sees the team events that follow.
```

## Task pvp-7: arena team changes

- **codeArea:** `arena`. **Size:** S.
- **Files:**
  - Edit: `.../areas/arena/protocol.ts`, `runtime.ts` and their tests
  - Create: `packages/devtools/src/probe-flows/arena-changes.ts`
  - Edit: `docs/areas/arena.md`; regenerate `docs/protocol-coverage/arena.md`
- **Depends on:** pvp-6.
- **Opcodes:** `CMSG_ARENA_TEAM_LEAVE`, `CMSG_ARENA_TEAM_REMOVE`,
  `CMSG_ARENA_TEAM_DISBAND`, `CMSG_ARENA_TEAM_LEADER`.

**Steps:**

- [ ] **Step 1: Failing tests.** Builders `buildArenaTeamLeave(id)`
  (`u32`, `Handlers/ArenaTeamHandler.cpp:209-264`),
  `buildArenaTeamRemove(id, name)` (`u32`, cstring, `:298-361`),
  `buildArenaTeamDisband(id)` (`u32`, `:266-296`),
  `buildArenaTeamLeader(id, name)` (`u32`, cstring, `:363-404`). Acts
  with `areaRig`: `leave(id)` resolves on the `LEAVE` event or a quit
  `arena_result` (`:260-263`), or on `DISBANDED` when a lone captain
  leaves (`:250-255`); `remove(id, name)` on `REMOVE` (`:360`);
  `setCaptain(id, name)` on `LEADER_CHANGED` (`:403`); `disband(id)` on
  `DISBANDED`; each rejects with the `arena_result` error name, 3 s; a
  team id not in `own` rejects `not_member` and sends nothing.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Live proof.** Two `max80` accounts, A and B, as in
  pvp-6: A is captain of team 1 (`soap gm arena-create 2 Fac...`), B's
  puppet runs with `--packet-trace`. The flow `arena-changes` on A sends
  all four opcodes, and B needs only the pvp-6 calls:
  1. A invites B; `tmp/puppet-<B> call arena.answerInvite '[true]'`.
  2. A removes B (`CMSG_ARENA_TEAM_REMOVE`, `REMOVE` event).
  3. A invites B again; B accepts as in 1.
  4. A passes the captaincy to B (`CMSG_ARENA_TEAM_LEADER`,
     `LEADER_CHANGED`).
  5. A leaves as a member (`CMSG_ARENA_TEAM_LEAVE`, `LEAVE` to B).
  6. `tmp/puppet-<B> call arena.leave '[<team 1>]'`: B is now the lone
     captain, so the leave disbands team 1 (`:250-255`).
  7. `soap gm arena-create 2 Fac...` gives A team 2; A disbands it
     (`CMSG_ARENA_TEAM_DISBAND`, `DISBANDED`).
  Each step shows its `SMSG_ARENA_TEAM_EVENT` or `COMMAND_RESULT` in A's
  probe or B's trace. If a step fails, disband what is left with `soap gm
  arena-disband`. Delete both accounts.
- [ ] **Step 4: Docs and checks.** Proof rows; `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_ARENA_TEAM_LEAVE` | live | flow `arena-changes`, the `LEAVE` event; reader `Handlers/ArenaTeamHandler.cpp:209-264` |
| `CMSG_ARENA_TEAM_REMOVE` | live | the `REMOVE` event; reader `Handlers/ArenaTeamHandler.cpp:298-361` |
| `CMSG_ARENA_TEAM_DISBAND` | live | the `DISBANDED` event; reader `Handlers/ArenaTeamHandler.cpp:266-296` |
| `CMSG_ARENA_TEAM_LEADER` | live | the `LEADER_CHANGED` event; reader `Handlers/ArenaTeamHandler.cpp:363-404` |

**Commit:**

```
feat: Change arena team members and captain

The character can leave, remove a member, pass the captaincy and
disband its arena team, and each change waits for the server's answer.
```

## Task pvp-8: arena queue and match

- **codeArea:** `arena`. **Size:** S.
- **Files:**
  - Edit: `.../areas/arena/opcodes.ts` (`unseen`), `protocol.ts`,
    `store.ts`, `runtime.ts` and their tests, `area.test.ts`
  - Edit: `packages/core/test-support/areas/arena.ts`
  - Edit: `packages/harness/src/areas/arena/area.ts` and test
  - Create: `packages/devtools/src/probe-flows/arena-skirmish.ts`
  - Edit: `docs/areas/arena.md`; regenerate `docs/protocol-coverage/arena.md`
- **Depends on:** pvp-7, pvp-2 (the status parser and slots), pvp-3 (the
  arena log form).
- **Opcodes:** `CMSG_BATTLEMASTER_JOIN_ARENA`, `SMSG_ARENA_ERROR`,
  `SMSG_ARENA_UNIT_DESTROYED`.

**Steps:**

- [ ] **Step 1: Failing tests.** `arenaErrorBody(type)` (`u32 0`, `u8`
  type, `Handlers/ArenaTeamHandler.cpp:416-424`);
  `arenaUnitDestroyedBody(guid)` (`u64`,
  `Entities/Object/Object.cpp:272-285`); their parsers;
  `buildBattlemasterJoinArena(guid, slot, asGroup, rated)` (`u64`, `u8`
  slot 0/1/2, `u8`, `u8`, `Handlers/BattleGroundHandler.cpp:698-926`).
  With `areaRig`: `SMSG_ARENA_ERROR` emits `arena_error`;
  `SMSG_ARENA_UNIT_DESTROYED` emits `arena_unit_destroyed` only (the area
  cannot touch the entity store; `SMSG_DESTROY_OBJECT` follows,
  `Entities/Object/Object.cpp:282-289`); `act.joinArena(guid, size, {
  asGroup, rated })` follows plan decision 5 and resolves on a status
  whose arena type matches, rejects with the join result name or
  `not_in_team` on `arena_error`, and rejects `no_answer` after 5 s
  (the server is silent when the guid is not a battlemaster in view,
  `:718-720`); `rated` without `asGroup` rejects `rated_needs_group` and
  sends nothing (`:710-711`).
- [ ] **Step 2: Implement.** Harness rules: `arena_error` writes
  `arena/team` (`log`); `arena_unit_destroyed` returns `[]`.
- [ ] **Step 3: Live proof.** A `max80` account; `soap gm tele` to a
  point in view of an arena battlemaster (the builder finds one as in
  pvp-2 step 7). The flow `arena-skirmish` joins a 2v2 skirmish alone
  (`asGroup` 0, `rated` 0) and waits for `SMSG_BATTLEFIELD_STATUS`
  `WAIT_QUEUE` with the arena type set (`:822-825`), then leaves the
  queue with port action 0. It waits up to 10 minutes for a pop [I: bots
  may fill skirmish queues]; with a pop it records
  `SMSG_ARENA_UNIT_DESTROYED` and the arena form of `MSG_PVP_LOG_DATA`.
  `SMSG_ARENA_ERROR` needs a rated group join with no team and an active
  season (`:843-857`); the season state could not be determined, so it
  stays mock. Delete the account.
- [ ] **Step 4: Docs and checks.** Proof rows; `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_BATTLEMASTER_JOIN_ARENA` | live | flow `arena-skirmish`, the `WAIT_QUEUE` status; reader `Handlers/BattleGroundHandler.cpp:698-926` |
| `SMSG_ARENA_ERROR` | mock, `unseen` | `areaRig` test; writer `Handlers/ArenaTeamHandler.cpp:416-424` |
| `SMSG_ARENA_UNIT_DESTROYED` | live if a pop, else mock `unseen` | writer `Entities/Object/Object.cpp:276-284` |

**Commit:**

```
feat: Queue for an arena skirmish

The character can join an arena queue at a battlemaster and sees the
arena errors and unit removals of an arena match.
```

## Task pvp-9: Wintergrasp queue and war

- **codeArea:** `wintergrasp`. **Size:** M.
- **Files:**
  - Edit: `packages/core/src/wow/areas/wintergrasp/opcodes.ts` (`unseen`,
    `dead`), `.../areas/wintergrasp/area.ts`
  - Create: `.../areas/wintergrasp/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `store.test.ts`, `runtime.ts`, `runtime.test.ts`,
    `area.test.ts`
  - Create: `packages/core/test-support/areas/wintergrasp.ts`
  - Edit: `packages/harness/src/areas/wintergrasp/area.ts`; create its
    test
  - Create: `packages/devtools/src/probe-flows/wintergrasp-window.ts`
  - Create: `docs/areas/wintergrasp.md`; regenerate
    `docs/protocol-coverage/wintergrasp.md`
- **Depends on:** pvp-8 (unit order), `SEED-4`, T-6.
- **Opcodes:** `SMSG_BATTLEFIELD_MGR_QUEUE_INVITE`,
  `CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE`,
  `SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE`,
  `SMSG_BATTLEFIELD_MGR_ENTRY_INVITE`,
  `CMSG_BATTLEFIELD_MGR_ENTRY_INVITE_RESPONSE`,
  `SMSG_BATTLEFIELD_MGR_ENTERED`, `SMSG_BATTLEFIELD_MGR_EJECTED`,
  `CMSG_BATTLEFIELD_MGR_EXIT_REQUEST`.

**Steps:**

- [ ] **Step 1: Test builders**, from the writers
  (`Battlefield/BattlefieldHandler.cpp`):
  `wintergraspEntryInviteBody({ battleId, zone, expiry })` (three `u32`;
  the third is the absolute game time plus 20 s, `:31-38`; wowm calls it
  `accept_time`); `wintergraspQueueInviteBody({ battleId, warmup })`
  (`u32`, `u8`, `:42-48`); `wintergraspQueueRequestResponseBody(...)`
  (`u32` battle id, `u32` zone, `u8` queued, `u8` notFull, `u8` warmup;
  AzerothCore writes `full ? 0 : 1`, `:55-64`, so 1 means "not full";
  wowm names it `full`); `wintergraspEnteredBody(...)` (`u32`, `u8 1`,
  `u8 1`, `u8` clearAfk, `:68-76`); `wintergraspEjectedBody(...)` (`u32`,
  `u8` reason, `u8` status, `u8` relocated, `:78-86`; reasons
  `Server/WorldSession.h:262-269`).
- [ ] **Step 2: Failing parser and builder tests** for the five parsers;
  `buildBfQueueInviteResponse(battleId, accept)` (`u32`, `u8`,
  `:89-102`), `buildBfEntryInviteResponse(battleId, accept)` (`u32`, `u8`,
  `:105-123`), `buildBfExitRequest(battleId)` (`u32`, `:125-136`). Run
  and see it fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Failing store and act tests** with
  `areaRig("wintergrasp")`: `WintergraspState = { battleId, zone, phase,
  full }` with `phase` one of `none`, `queue_offered`, `queued`,
  `entry_offered` (`expiresAt` from the packet's Unix seconds, no timer),
  `at_war`, `ejected` (reason name); events `wg_queue_offered`,
  `wg_queued`, `wg_entry_offered`, `wg_entered`, `wg_ejected`;
  `act.answerQueue(accept)` resolves on `wg_queued` for accept and on
  send for decline (the server answers nothing,
  `Battlefield/BattlefieldHandler.cpp:100-101`);
  `act.answerEntry(accept)` resolves on `wg_entered` or `wg_ejected`
  (10 s); `act.exitQueue()` resolves on `wg_ejected` (3 s); each rejects
  `no_offer` without the matching offer and sends nothing. Core never
  answers an offer by itself (20 s,
  `Battlefield/Zones/BattlefieldWG.cpp:67`).
- [ ] **Step 5: Implement.** Put the two dead rows in `dead` if the seed
  left them out; all six server opcodes in `unseen` for now (plan
  decision 10).
- [ ] **Step 6: Harness rules.** `wg_queue_offered` and
  `wg_entry_offered` write `wintergrasp/invited` as a `wake` with the
  deadline; `wg_queued`, `wg_entered` and `wg_ejected` write `log` rows
  `wintergrasp/queued`, `wintergrasp/entered`, `wintergrasp/left`.
- [ ] **Step 7: Probe flow, no wait.** Write
  `probe-flows/wintergrasp-window.ts`: in zone 4197, accept a queue
  offer, exit, accept the next, accept the war offer, then walk out of
  the zone for `EJECTED` [I: leaving the zone ejects,
  `Battlefield/Battlefield.cpp:143`]. Check the flow once, briefly: a
  `max80` account, `soap gm tele Wintergrasp` (row "Wintergrasp" in
  `data/sql/base/db_world/game_tele.sql`), `soap gm read bf-queue`
  records the timer, and `mise protocol:probe <ACCOUNT> --flow wintergrasp-window --wait 60`
  exits cleanly outside the window. Report the timer to the coordinator,
  whose watcher reruns the flow in the grouping window (last 15 min
  before a battle, `Battlefield/Zones/BattlefieldWG.cpp:68`; battles every
  150 min by default, `World/WorldConfig.cpp:615-620`). Delete the
  account.
- [ ] **Step 8: Docs.** Create `docs/areas/wintergrasp.md` with the fixed
  headings; wire notes for the inverted byte and the absolute expiry;
  proof rows `mock` for all eight, with the client rows as `builder`
  until the window. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise lint:docs`.
- [ ] **Step 9: Checks.** `mise ci:checks`.

**Proof** (until the window; pvp-13c or a watcher capture moves them):

| Opcode | Proof | How |
|---|---|---|
| `SMSG_BATTLEFIELD_MGR_QUEUE_INVITE` | mock, `unseen` | writer `Battlefield/BattlefieldHandler.cpp:42-48` |
| `CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE` | builder | reader `Battlefield/BattlefieldHandler.cpp:89-102` |
| `SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE` | mock, `unseen` | writer `Battlefield/BattlefieldHandler.cpp:55-64` |
| `SMSG_BATTLEFIELD_MGR_ENTRY_INVITE` | mock, `unseen` | writer `Battlefield/BattlefieldHandler.cpp:31-38` |
| `CMSG_BATTLEFIELD_MGR_ENTRY_INVITE_RESPONSE` | builder | reader `Battlefield/BattlefieldHandler.cpp:105-123` |
| `SMSG_BATTLEFIELD_MGR_ENTERED` | mock, `unseen` | writer `Battlefield/BattlefieldHandler.cpp:68-76` |
| `SMSG_BATTLEFIELD_MGR_EJECTED` | mock, `unseen` | writer `Battlefield/BattlefieldHandler.cpp:78-86` |
| `CMSG_BATTLEFIELD_MGR_EXIT_REQUEST` | builder | reader `Battlefield/BattlefieldHandler.cpp:125-136` |

**Commit:**

```
feat: Answer Wintergrasp queue and war offers

The character now tracks the Wintergrasp queue and war offers with
their deadlines and can accept, decline or leave them.
```

## Task pvp-10: Wintergrasp extras

- **codeArea:** `wintergrasp`. **Size:** S.
- **Files:**
  - Edit: `.../areas/wintergrasp/opcodes.ts`, `protocol.ts`, `store.ts`,
    `runtime.ts` and their tests, `area.test.ts`
  - Edit: `packages/core/test-support/areas/wintergrasp.ts`
  - Edit: `packages/harness/src/areas/wintergrasp/area.ts` and test
  - Create: `packages/devtools/src/probe-flows/wintergrasp-hearth.ts`
  - Edit: `docs/areas/wintergrasp.md`; regenerate
    `docs/protocol-coverage/wintergrasp.md`
- **Depends on:** pvp-9, S0-2 (the `GameOpcode` name for 0x032).
- **Opcodes:** `CMSG_HEARTH_AND_RESURRECT`,
  `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE`.

**Steps:**

- [ ] **Step 0: Check the name.** If
  `GameOpcode.SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` does not exist, stop
  `blocked` and name S0-2 (contract 1.11). Never add it here.
- [ ] **Step 1: Failing tests.** `wintergraspBuildingDamageBody(...)`:
  packed guid building, packed guid attacker, packed guid player, `u32`
  change, `u32` spell (`Entities/GameObject/GameObject.cpp:2339-2348`;
  a heal arrives as `u32(-change)`, `:2345`; no wowm file);
  `parseDestructibleBuildingDamage` reads the change as signed.
  `CMSG_HEARTH_AND_RESURRECT` is empty
  (`Handlers/MiscHandler.cpp:1686-1705`). With `areaRig`: the damage
  packet emits `building_damage`; `act.hearthAndResurrect()` rejects
  `not_in_wintergrasp` unless the character's map is 571 [I: the zone
  check is the server's, `:1691-1695`; the area sees only the map] and
  otherwise sends and resolves on the next `core.self` `new_world` or
  `near_teleport` event (10 s).
- [ ] **Step 2: Implement.** Harness rule: `building_damage` returns
  `[]` (a siege fight floods it; the G17 guard).
- [ ] **Step 3: Live proof.** A `max80` account, `soap gm tele
  Wintergrasp`. The flow `wintergrasp-hearth` sends the opcode; the
  server teleports the character to its bind point outside war too [I:
  `GetBattlefieldToZoneId` does not check war time,
  `Handlers/MiscHandler.cpp:1691-1695`,
  `Battlefield/Battlefield.cpp:482-486`]. Evidence: the probe shows the
  teleport, and `mise factory soap truth <ACCOUNT>` shows the bind point.
  Delete the account.
- [ ] **Step 4: Docs and checks.** Proof rows; `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_HEARTH_AND_RESURRECT` | live | flow `wintergrasp-hearth`, `soap truth` at the bind point; reader `Handlers/MiscHandler.cpp:1686-1705` |
| `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` | mock, `unseen` | `areaRig` test; writer `Entities/GameObject/GameObject.cpp:2339-2348`; live needs a siege vehicle in a war |

**Commit:**

```
feat: Hearth out of Wintergrasp

The character can leave Wintergrasp by hearth and resurrect, and it
records building damage reports from a siege fight.
```

## Task pvp-11a: `pvp` tool for battlegrounds and the flag

- **codeArea:** `battlegrounds`. **Size:** L.
- **Files:**
  - Create: `packages/harness/src/areas/battlegrounds/tool.ts`,
    `tool.test.ts` (split into `tool-<part>.ts` siblings before 500
    lines)
  - Edit: `packages/harness/src/areas/battlegrounds/area.ts`
    (`worldActs`)
  - Edit (append): `packages/harness/src/contract/result.ts` (`ToolName`
    gains `"pvp"`), `packages/harness/src/tools/registry.ts`
    (`GAME_TOOLS` gains `pvpTool`), `docs/harness.md` (one tool row)
  - Create: `packages/harness/src/grader/scenarios/t9-pvp-flag.json`,
    `t9-pvp-queue.json`
  - Edit (append): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the new `pvp` row)
- **Depends on:** pvp-10 (unit order), pvp-1, pvp-2, pvp-3, S0-3, S0-4.
- **Opcodes:** none (a verb and eval task).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Failing tool tests.** `pvpTool` (`defineGameTool`,
  `tools/define.ts:488`; kind `action`, D25) with `do`: `list` (`bg`:
  `warsong`, `arathi`, `alterac`, `eye`, `strand`, `isle`, `random`),
  `queue` (`bg`, optional `group`), `accept` (optional `slot`),
  `decline` (optional `slot`), `leave` (a battleground, else a queued
  slot), `score`, `flag` (`on`), `report` (`unit`). Each sending call
  runs inside `ctx.rt.mutex.run` through `claim.areas.battlegrounds.<act>`
  and returns the result text of design 5.22 (for example "Queued for
  Warsong Gulch, slot 0, average wait 3 min", or the join error by
  name). `accept` with no invitation refuses `no_invitation`; `report`
  on a unit outside the battleground refuses. The tool never accepts an
  invitation unless the agent calls `accept`. Call `expectSendKind` once
  (contract 1.9).
- [ ] **Step 2: Implement** the tool and `worldActs`, append the three
  shared lines, and write the `docs/harness.md` row: `| \`pvp\` |
  Battlegrounds, arena teams, Wintergrasp and the PvP flag. |`.
- [ ] **Step 3: Scenario `t9-pvp-flag`**, one commit with its `ROUND_1`
  entry, capabilities line and evals row (D15). Preset `fresh`; task
  "Turn your PvP flag on. Then turn it off."; checks: `game_log`
  `battlegrounds/flag` on then off with the timer. A truth pick for
  `playerFlags` only if T-8b exposed the field; otherwise the game log is
  the whole check (the realm service field is outside the repo). Run it
  with `mise eval`; pass adds "Turn its PvP flag on and off" with limit
  "The flag stays on for a few minutes after it is turned off."; else a
  "Not shown" bullet (D16).
- [ ] **Step 4: Scenario `t9-pvp-queue`**, one commit, the same way.
  Preset `eversong10` (no GM step; if its level is under 10, stop
  `blocked` and ask for a preset); task "Look at the Warsong Gulch
  rewards, join its queue, then leave the queue."; checks: `game_log`
  `battlegrounds/queued` with bg type 2 then `battlegrounds/queue_left`,
  both built from `SMSG_BATTLEFIELD_STATUS`. No SOAP command reads a
  queue, so the game log is the check. Capability "Join and leave a
  battleground queue", limit "Needs level 10." The evals row is
  `| PvP (\`pvp\`, \`recover how:spirit_guide\`) | \`t9-pvp-flag\`, \`t9-pvp-queue\` |`.
- [ ] **Step 5: Checks.** `mise test packages/harness/src/grader/scenarios.test.ts`,
  `mise ci:checks`; rerun `t1-walk-to-npc`.

**Proof:** evals `t9-pvp-flag`, `t9-pvp-queue`.

**Commits** (tool, then one per scenario):

```
feat: Add the pvp tool for battlegrounds

The agent can list battlegrounds, join and leave their queues, answer
invitations, read the score and set its PvP flag through one tool.
```

```
test: Add the PvP flag eval

t9-pvp-flag shows the agent turning its PvP flag on and off from the
server's own update fields.
```

```
test: Add the battleground queue eval

t9-pvp-queue shows the agent reading Warsong Gulch rewards, joining the
queue and leaving it, from the server's status packets.
```

## Task pvp-11b: `recover` at a spirit guide

- **codeArea:** `battlegrounds`. **Size:** M.
- **Files:**
  - Edit (lease): `packages/harness/src/tools/recover.ts`,
    `packages/harness/src/ops/recover.ts` and their tests; the
    `recoverParams` block of `tools/params.ts` (contract issue 2); the
    `RecoverAfter` block of `contract/details.ts` (D13)
  - Edit: `packages/harness/src/areas/battlegrounds/area.ts`
    (`worldActs` gains `queueSpiritGuide`)
- **Depends on:** pvp-11a, pvp-4, the lease.
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tests.** `recover { how: "spirit_guide" }`: a
  ghost walks to the nearest unit with the `spirit_guide` role
  (`npc-roles.ts:41`), calls `claim.areas.battlegrounds.queueSpiritGuide`,
  and waits for the mass rez by the `SMSG_AREA_SPIRIT_HEALER_TIME` time
  plus a margin; with an `active` battleground slot the default `how` is
  `spirit_guide`; outside a battleground or Wintergrasp it refuses. Today
  `HOWS` knows only `corpse`, `spirit_healer` and `accept`
  (`tools/recover.ts:24-28`) and `nearestHealer` finds only
  `spirit_healer` (`ops/recover.ts:43-45`); `CMSG_SPIRIT_HEALER_ACTIVATE`
  does nothing on a guide (AzerothCore `Handlers/NPCHandler.cpp:246`).
  A gossip hello on a guide inside a battleground also queues the rez
  (`Handlers/NPCHandler.cpp:176-185`), so either path is valid; the tool
  uses the area act.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Checks.** `mise ci:checks`; rerun `t6-die-and-recover`
  (the closest scenario; it must not change).

**Proof:** unit tests and the `t6-die-and-recover` rerun; live in
`t9-pvp-warsong` (pvp-11d) when a match pops.

**Commit:**

```
feat: Recover at a battleground spirit guide

Inside a battleground the agent now queues at the spirit guide for the
next mass resurrection instead of looking for a spirit healer.
```

## Task pvp-11c: PvP line in `look`

- **codeArea:** `battlegrounds`. **Size:** S.
- **Files:**
  - Edit (lease): `packages/harness/src/tools/look.ts` and its test; the
    views it reads in `contract/views.ts` (D13)
- **Depends on:** pvp-11b, the lease.
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tests.** `look` shows a `pvp` line with the flag
  (and the timer), honor, arena points, each queue slot, and, inside a
  battleground, the map, elapsed time and the last known score; the line
  is absent when every part is empty (level 1, unflagged, no queue).
  Values come from `session.areas.battlegrounds.state()` and
  `session.areas.arena.state()` (N5).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Checks.** `mise ci:checks`; rerun `t0-self-state` and
  `t0-who-is-near`.

**Proof:** unit tests and the two reruns.

**Commit:**

```
feat: Show PvP state in look

The agent now sees its PvP flag, honor, queue slots and battleground
score in look without a separate call.
```

## Task pvp-11d: fight in a battleground

- **codeArea:** `battlegrounds`. **Size:** M.
- **Files:**
  - Edit (lease): `packages/harness/src/tools/engage-choose.ts` and the
    other `tools/engage*.ts` files the rule needs, with their tests
  - Create: `packages/harness/src/grader/scenarios/t9-pvp-warsong.json`
  - Edit (append): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the `pvp` row)
- **Depends on:** pvp-11c, the engage lease.
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tests.** With an `active` battleground slot, a
  living, in-view hostile unit of kind `player` counts as a target for
  `engage` with no name and with `target: <ref>` (plan decision 7);
  outside a battleground players stay excluded, as today
  (`nearby.ts:99-120`). If a test shows another engage path rejects the
  unit through core `attackable`, stop `blocked` and name `nearby.ts`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Scenario `t9-pvp-warsong`**, one commit (D15). Preset
  `eversong10`; budget 45 minutes [I: a match lasts up to 25 minutes plus
  the queue]; task "Join Warsong Gulch, enter when invited, fight for
  your team until the match ends, then leave. If you die, rez at the
  spirit guide."; checks: `game_log` `battlegrounds/entered`,
  `battlegrounds/ended` with a winner, `battlegrounds/left`; `life/alive`
  after a death with no corpse run; truth `point` off map 489 at the end.
  Honor truth only if T-8b exposed `totalHonorPoints`. Run it only when
  pvp-3's probe got a pop **and** the maintainer has allowed an eval in a
  battleground that bots fill (design 5.22 "Needs the maintainer").
  Otherwise land the file with a "Not shown" bullet (D16): "Play a
  battleground to the end (`t9-pvp-warsong`, no bot pop or not yet
  allowed)." and report `blocked` for the run only.
- [ ] **Step 4: Checks.** `mise ci:checks`; rerun `t3-ghostlands-kill`
  and `t7-halt-resume` against the gates of contract 3.6.

**Proof:** eval `t9-pvp-warsong` when allowed and popped; else unit
tests and the two reruns.

**Commits:**

```
feat: Fight enemy players in a battleground

Inside a battleground the engage loop now accepts hostile players as
targets, so the agent can fight for its team.
```

```
test: Add the Warsong Gulch eval

t9-pvp-warsong asks the agent to play one Warsong Gulch match to the
end and rez at the spirit guide.
```

## Task pvp-12: arena verbs and the arena team eval

- **codeArea:** `arena`. **Size:** M.
- **Files:**
  - Edit: `packages/harness/src/areas/battlegrounds/tool.ts` (or a new
    sibling `tool-arena.ts`) and tests
  - Edit: `packages/harness/src/areas/arena/area.ts` (`worldActs`)
  - Create: `packages/harness/src/grader/scenarios/t9-pvp-arena-team.json`
  - Edit (append): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the `pvp` row)
  - Edit (sorted key, if needed): `packages/harness/src/puppet/calls.ts`
- **Depends on:** pvp-11d, pvp-5, pvp-6, pvp-7, pvp-8, T-7c, T-10,
  the N30 eval staging step (contract issue 3).
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tool tests.** `pvp` gains `team` (`action`:
  `info`, `invite`, `accept`, `decline`, `leave`, `kick`, `captain`,
  `disband`; `size`: `2v2`, `3v3`, `5v5`; `name`), `inspect` (`unit`:
  honor and arena teams of a friendly player in range, silence named as
  "out of range or hostile"), and `queue` with `arena` (`2v2`, `3v3`,
  `5v5`, optional `rated`): it resolves the nearest `battlemaster` unit
  first and refuses `no_battlemaster` when none is in view (plan decision
  6), then calls `claim.areas.arena.joinArena`. `decline` also answers a
  pending arena invite. `expectSendKind` once.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Scenario `t9-pvp-arena-team`**, one commit. Preset
  `max80` for the agent and the partner. Staging (N30): one `soap gm
  arena-create 2 Fac<random>` for the agent before the baseline. Task
  "Show your 2v2 team, invite <PARTNER>, make them captain, then leave
  the team."; the partner accepts the invite through a puppet `call
  arena.answerInvite` when it arrives (contract issue 6), and leaves at
  the end so the lone captain's leave disbands the team
  (`Handlers/ArenaTeamHandler.cpp:250-255`), which removes it in the
  same run (N30). Checks: `game_log` `arena/event` rows for `JOIN`,
  `LEADER_CHANGED` and `LEAVE`; a console check (T-10) `read arena
  <teamId>` after the run finds no team (the id comes from the staging
  step). Capability "Manage
  an arena team", limit "Teams come from a GM command; charters are not
  covered."
- [ ] **Step 4: Checks.** `mise test packages/harness/src/grader/scenarios.test.ts`,
  `mise ci:checks`.

**Proof:** eval `t9-pvp-arena-team`. `inspect` and arena `queue` have
no scenario; they are proven by pvp-5 and pvp-8's live captures and are
listed under "Not shown by any scenario" only if the coordinator asks.

**Commits:**

```
feat: Add arena team verbs to the pvp tool

The agent can show, grow and hand over its arena team, inspect a
player's honor and teams, and queue for an arena at a battlemaster.
```

```
test: Add the arena team eval

t9-pvp-arena-team shows the agent inviting a partner to its team,
passing the captaincy and leaving.
```

## Task pvp-13a: wait for a console read in eval setup

- **codeArea:** `wintergrasp`. **Size:** M.
- **Files:**
  - Create: `packages/harness/src/grader/console-wait.ts` and test
  - Edit (COORD lease, contract issue 4): `grader/scenarios.ts`
    (`Scenario.setup` gains a `wait` step type),
    `grader/scenario.schema.json`, `grader/accounts.ts` (the setup
    loop, `:109-120`)
  - Edit: `docs/evals.md` (the setup step, one sentence)
- **Depends on:** pvp-12, T-6 (`read bf-queue`), T-8b, T-9b, T-10 (T-8b
  and T-9b also edit `grader/scenario.schema.json`; plan fix-up), the
  lease.
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tests.** A setup step `{ wait: { read:
  "bf-queue", match: "<regex>", timeoutMinutes: <n> } }` runs
  `mise factory soap gm <ACCOUNT> read bf-queue` through the grader's
  `Exec` every 60 s until the text matches, then lets the run start; a
  timeout aborts the run as `aborted` (infrastructure, `docs/evals.md:26`);
  only `read` verbs are allowed; the schema rejects other shapes. The
  reply lines come from `src/server/scripts/Commands/cs_bf.cpp:182-215`
  (war or wait, the timer in seconds).
- [ ] **Step 2: Implement** in `console-wait.ts` with one call from the
  setup loop in `grader/accounts.ts:118-120`. If a file would pass 500 non-blank lines, stop `blocked`.
- [ ] **Step 3: Checks.** `mise ci:checks`.

**Proof:** unit tests; live in pvp-13c.

**Commit:**

```
chore: Wait for a console read before an eval

An eval can now hold its start until a read-only console command
matches, so the Wintergrasp eval starts inside the grouping window.
```

## Task pvp-13b: Wintergrasp verbs

- **codeArea:** `wintergrasp`. **Size:** S.
- **Files:**
  - Edit: `packages/harness/src/areas/battlegrounds/tool.ts` (or a new
    sibling `tool-wintergrasp.ts`) and tests
  - Edit: `packages/harness/src/areas/wintergrasp/area.ts` (`worldActs`)
- **Depends on:** pvp-13a, pvp-9, pvp-10.
- **Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tests.** `accept` and `decline` answer a pending
  Wintergrasp queue or war offer when no battleground invitation is
  pending (`answerQueue`, `answerEntry`); `leave` inside Wintergrasp
  exits the queue, or hearths out with `hearthAndResurrect` at war; the
  `wintergrasp/invited` wake carries the 20 s deadline in its text; no
  auto-accept (design 5.22).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Checks.** `mise ci:checks`.

**Proof:** unit tests; live in pvp-13c.

**Commit:**

```
feat: Answer Wintergrasp offers with the pvp tool

The agent can accept or decline Wintergrasp queue and war offers and
hearth out of the zone through the pvp tool.
```

## Task pvp-13c: Wintergrasp eval

- **codeArea:** `wintergrasp`. **Size:** S.
- **Files:**
  - Create: `packages/harness/src/grader/scenarios/t9-pvp-wintergrasp.json`
  - Edit (append): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the `pvp` row)
  - Edit: `docs/areas/wintergrasp.md`, `docs/areas/battlegrounds.md`
    (proof rows the run moves); `.../areas/wintergrasp/opcodes.ts` and
    `.../areas/battlegrounds/opcodes.ts` (`unseen`); regenerate the two
    coverage files
- **Depends on:** pvp-13b, the `wintergrasp80` preset or spawn group
  (contract issue 5).
- **Opcodes:** none (it moves pvp-9, pvp-10 and pvp-4 rows to `live`
  when the run shows them).

**Steps:**

- [ ] **Step 1: Scenario**, one commit. Preset `wintergrasp80` (level
  80 in zone 4197); setup `{ wait: { read: "bf-queue", match: <the
  grouping window>, timeoutMinutes: 180 } }` (pvp-13a); budget 50 minutes
  after the wait; task "Join the Wintergrasp battle when it offers, fight
  for 5 minutes, then hearth out."; checks: `game_log`
  `wintergrasp/invited`, `wintergrasp/entered`; truth `point` at the bind
  point at the end. Run it with `mise eval` under a Muse watcher (R10).
  Pass: capability "Join Wintergrasp", limit "Offers come only every 3
  hours; the eval waits for the window." Without the preset: a "Not
  shown" bullet (D16) "Join Wintergrasp (`t9-pvp-wintergrasp`, no start
  in Wintergrasp)".
- [ ] **Step 2: Move proof rows.** From the run's packet trace (N18),
  move each seen manager opcode (and `SMSG_AREA_SPIRIT_HEALER_TIME` if
  the character died) to `live`, drop it from `unseen`, and regenerate
  coverage.
- [ ] **Step 3: Checks.** `mise test packages/harness/src/grader/scenarios.test.ts`,
  `mise protocol:cite-check`, `mise ci:checks`.

**Proof:** eval `t9-pvp-wintergrasp`.

**Commit:**

```
test: Add the Wintergrasp eval

t9-pvp-wintergrasp waits for the grouping window, then shows the agent
joining the battle and hearthing out.
```

## Dead opcodes

Ten rows of the plan area are `relevant=no` in the research table, and
the verification reports move no opcode into or out of this area
(`AREA_SPIRIT_HEALER` stays here: the rez is for battlegrounds,
`Handlers/NPCHandler.cpp:176-185`). Each is `Handle_NULL` in AzerothCore
`Server/Protocol/Opcodes.cpp` or a server opcode with no send site in
`src/` or `modules/`. Each gets a `dead` proof row in its code area's
doc, written by pvp-1, pvp-5 or pvp-9.

| Opcode | Code area | Why |
|---|---|---|
| `CMSG_BATTLEFIELD_JOIN` 0x23e | battlegrounds | `Handle_NULL` (`Server/Protocol/Opcodes.cpp:705`); wowm defines it for 1.12 only (`battleground/cmsg_battlefield_join.wowm:1`) |
| `SMSG_PLAYER_SKINNED` 0x2bc | battlegrounds | no send site (`Server/Protocol/Opcodes.cpp:831` only) |
| `SMSG_DEFENSE_MESSAGE` 0x33a | battlegrounds | no send site (`Server/Protocol/Opcodes.cpp:957` only) |
| `SMSG_JOINED_BATTLEGROUND_QUEUE` 0x38a | battlegrounds | no send site (`Server/Protocol/Opcodes.cpp:1037` only); no wowm file |
| `CMSG_COMMENTATOR_ENABLE` 0x3b5 | battlegrounds | `Handle_NULL` (`Server/Protocol/Opcodes.cpp:1080`) |
| `SMSG_BATTLEGROUND_INFO_THROTTLED` 0x4a6 | battlegrounds | no send site (`Server/Protocol/Opcodes.cpp:1321`); wowm says the same (`battleground/smsg_battleground_info_throttled.wowm:1`) |
| `CMSG_ARENA_TEAM_CREATE` 0x348 | arena | `Handle_NULL` (`Server/Protocol/Opcodes.cpp:971`); teams come from charters (`guild`) or `.arena create` |
| `SMSG_ARENA_TEAM_CHANGE_FAILED_QUEUED` 0x4c8 | arena | no send site (`Server/Protocol/Opcodes.cpp:1355`); wowm says the same (`arena/smsg_arena_team_change_failed_queued.wowm:1`) |
| `SMSG_BATTLEFIELD_MGR_EJECT_PENDING` 0x4e5 | wintergrasp | no send site (`Server/Protocol/Opcodes.cpp:1384`); wowm says the same |
| `SMSG_BATTLEFIELD_MGR_STATE_CHANGE` 0x4e8 | wintergrasp | no send site (`Server/Protocol/Opcodes.cpp:1387`); wowm says the same |

AzerothCore also names six more PvP opcodes with no Peon name and no
use: `SMSG_BATTLEFIELD_PORT_DENIED`, `CMSG_PVP_QUEUE_STATS_REQUEST`,
`SMSG_PVP_QUEUE_STATS`, `CMSG_BATTLEFIELD_MGR_QUEUE_REQUEST`,
`CMSG_BATTLEFIELD_MANAGER_ADVANCE_STATE` and
`CMSG_BATTLEFIELD_MANAGER_SET_NEXT_TRANSITION_TIME`
(`Server/Protocol/Opcodes.cpp:462,1374-1375,1382,1388-1389`). They are
outside the table and need nothing.

Opcode count: 5 + 8 + 6 + 3 (battlegrounds 22) + 7 + 5 + 4 + 3 (arena
19) + 8 + 2 (wintergrasp 10) = 51 relevant, plus 10 dead.

## Questions for the coordinator

1. The seed ownership table above, and the three code-area names.
2. The six contract issues: `nearby.ts`, the `recoverParams` block, GM
   staging in `t9-pvp-arena-team`, the grader lease for the console wait
   step, a `wintergrasp80` preset, and partner reactions in evals.
3. The maintainer questions of design 5.22: whether an eval may play a
   battleground that playerbots fill, and the realm type (a PvP realm
   flags players in contested zones).
4. A watcher for the pvp-3 bot probe and the pvp-9 Wintergrasp window
   (plan decisions 8 and 10).

## Build rulings

| Id | Issue | Ruling |
|---|---|---|
| BR-pvp-1-1 | pvp-1 replaces the `SMSG_ZONE_UNDER_ATTACK` stub with a handler (SR5-pvp-8), and `dev:probe-run.test.ts` (tooling-probe) used that stub for its notice test | Coordinator edit (P2-17), commit `129fcaf9`: the test uses `SMSG_GUILD_BANK_LIST`, a stub no wave-5 task replaces; the coordinator rebased the pvp-1 slot onto it. |

## COMPLETE

## Seed rulings (SEED-5)

Wave 5 slice (BR-wave5-1): pvp-1, pvp-2. The coordinator's SEED-5 agents drafted these rows against `factory/431-wave5` at `ed24b9e5` and AzerothCore; each is a coordinator ruling (P2-17) and the maintainer may reverse any at PR review. Marks: `[M]` read or measured, `[INFERENCE]` not observed. Paths without a prefix are under `packages/core/src/wow/`; `h:` is `packages/harness/src/`, `dev:` `packages/devtools/src/`, `cts:` `packages/core/test-support/`. "Finding <n>" names a finding of the same draft below.

SEED5-1 (the `battlegrounds` seed), SEED5-4 and SEED5-5 (index `deps` and owner rows) are coordinator edits; the plan's "Coordinator edits for SEED-5" lists them.

| Id | Plan text or question | Ruling | Status |
|---|---|---|---|
| SR5-pvp-1 | `self.flagged` from "PLAYER_FLAGS 0x200 and byte2 0x01" (pvp-1 step 4) and `setPvp` resolves "on the matching `pvp_flag`" | Two fields: `wantsFlag` = `PLAYER_FLAGS` 0x200, `flagged` = byte2 0x01, plus `timer` 0x40000, `contested`, `ffa`, `sanctuary`. `pvp_flag` carries `{ wants, flagged, timer }` and fires on any change of those. `setPvp(on)` resolves when `wantsFlag === on` (so an "off" resolves at once with `flagged` still true for about 5 min); if it already equals `on` it resolves without sending [INFERENCE: the server sends no update for a no-op]. The flow asserts 0x200 gain/loss and that byte2 0x01 is still set after "off". | coordinator ruling (P2-17) |
| SR5-pvp-2 | `SMSG_ZONE_UNDER_ATTACK` fires "when attacked"; harness wake rule | Writer fires on a guard's death to the killer's opposing team, any zone (facts above). Wake only when the area id equals the character's area, otherwise `passive`, as the plan has it; fix the wire note in `docs/areas/battlegrounds.md`. Proof (coordinator DESIGN 2: A): mock from the writer and `unseen`, no live try; a live kill broadcasts text to every online Horde player. | coordinator ruling (P2-17) |
| SR5-pvp-3 | pvp-1/-2 would grow `runtime.ts`/`store.ts` toward 500 (queue plus self plus acts) | pvp-1 puts the self PvP fields in `store-self.ts`/`runtime-self.ts` (new, owned by pvp); pvp-2 adds `store-queue.ts`, `runtime-queue.ts` besides the planned `protocol-queue.ts`. Owner lists updated (SEED5-5). The pvp-2 builder splits before ~480 non-blank lines. | coordinator ruling (P2-17) |
| SR5-pvp-4 | pvp-2: world-entry status request on "`core.self` events" and "the member it reads" for combat (findings 5, 6) | Use `core.self.onEvent` (`login_verified`, `new_world`, pattern `areas/instances/runtime.ts:215-216`); combat test reads `deps.getEntity(selfGuid).unitFlags & UnitFlag.IN_COMBAT` (pattern `lfg/store.ts:189-193`) ; charm is not modelled (the server also refuses a charmed self, `:419`), stated under "Left out". `in_combat` applies to `leaveQueue` too (`BattleGroundHandler.cpp:419-423`). | coordinator ruling (P2-17) |
| SR5-pvp-5 | `act.join` takes `via` (battlemaster) | The server ignores the guid (`:72-90,142`): `via` is optional, default guid 0; `join` rejects `timeout` (5 s, no reply) for the silent cases (level under the bracket, already in a battleground). Group join (`asGroup`) stays mock: success needs a party and a positive group-joined packet (`:271`), -11/-12 need group members; the doc marks those forms `mock`, the opcode stays `live` from -1/-2. | coordinator ruling (P2-17) |
| SR5-pvp-6 | pvp-2 step 7.4: "which `game_tele` lands in view of a battlemaster could not be determined" | `MorshanBaseCamp` (WSG master Gargok) and `HallOfTheBrave` (arena master); verified (table above). The builder records the guid from the `nearest` row. The optional -4 try is made once (level 61, three queues, total queue time under 20 s); if it fails the builder maps -4 to mock with the reason. | coordinator ruling (P2-17) |
| SR5-pvp-7 | pvp-2 step 9 reruns `t0-self-state` because every login now sends `CMSG_BATTLEFIELD_STATUS` | Coordinator DESIGN 1: B. pvp-2 does not rerun `t0-self-state`; the slice gate round runs `t0-self-state` at the slice head (BR-wave5-8). pvp-2 keeps the login packet unit test and one `probe --flow login` check that `CMSG_BATTLEFIELD_STATUS` is sent and no `SMSG_BATTLEFIELD_STATUS` follows (no queue, no reply). | coordinator ruling (P2-17) |
| SR5-pvp-8 | `unseen` rows | pvp-1: `SMSG_ZONE_UNDER_ATTACK`, `SMSG_QUESTUPDATE_ADD_PVP_KILL`, `SMSG_PVP_CREDIT`, each "not seen live" with the cause above; the six dead rows get proof rows (`Opcodes.cpp` per `pvp.md` dead table, re-read by the builder) and go into `dead` at the seed. | coordinator ruling (P2-17) |

### Findings behind the SEED-5 rulings

From the `session-pvp` draft:

- **Finding 1.** **Both areas are unseeded.** `ls core:areas` and `h:areas` have no `account`/`battlegrounds`; `AREAS`/`HARNESS_AREAS` lack them; `HARNESS_AREAS_TOTAL` (`h:areas/registry.ts` end) fails to typecheck for any core area without a harness module, so core and harness seeds land together. Template: `bank` (`core:areas/bank/{opcodes,area}.ts`, `h:areas/bank/area.ts` = `defineHarnessArea({ area, worldActs: [] })`). The three battlegrounds stubs still sit in `core:protocol/stubs.ts:14-16` (`SMSG_BATTLEFIELD_STATUS`, `SMSG_BATTLEFIELD_LIST`, `SMSG_ZONE_UNDER_ATTACK`); `registry.test.ts:90-92,332` keeps them frozen through `[...STUBS, ...areaStubs()]`, so moving them changes no test.
- **Finding 5.** **Combat state member (pvp-2 [I])**: there is no `core.combat` flag; precedent `core:areas/lfg/store.ts:189-193` reads `deps.getEntity(deps.selfGuid()).unitFlags & UnitFlag.IN_COMBAT`.
- **Finding 6.** **Self events for pvp-2's status request**: `ctx.listen("self")` does not exist (`CoreEvents` has no `self`, `core:world-events.ts:19-38`); areas use `core.self.onEvent` (`areas/time/runtime.ts:41`, `areas/instances/runtime.ts:215-216`). Update-field names are `PLAYER_FIELDS.FLAGS` (offset 150), `UNIT_FIELDS.BYTES_2` (122, `bytes4`), `PLAYER_FIELDS.KILLS` (1225, `u16x2`), `TODAY_CONTRIBUTION`..`ARENA_CURRENCY` (1226-1278) in `core:protocol/update-fields.ts:135,152,309-318`; the reading pattern is `areas/talents/fields.ts:12-30`.
- **Finding 7.** No task of this group reads a DBC (`ctx.dbc`); no `docs/harness.md` row. No file in the owner lists is near 500 lines (all new).

Wire facts the builders must not get wrong (AzerothCore `deployed`, `src/server/game/`):

PvP flag and honor:
- `CMSG_TOGGLE_PVP`: one body byte sets `PLAYER_FLAGS_IN_PVP` (0x200), no byte toggles (`Handlers/MiscHandler.cpp:500-519`). **Switching off does not drop the visible flag**: `UpdatePvP(true,false)` keeps `UNIT_BYTE2_FLAG_PVP` (0x01 in byte 1 of `UNIT_FIELD_BYTES_2`) and starts a timer; `PLAYER_FLAGS_PVP_TIMER` (0x40000) is set after 4 s and the flag falls after about 300 s (`Entities/Player/PlayerUpdates.cpp`, `PlayerMisc.cpp`; constants `Player.h`, `UnitDefines.h`). So "wants" (`PLAYER_FLAGS` 0x200) and "flagged" (byte2 0x01) are two facts; `contested` is `PLAYER_FLAGS` 0x100, `ffa` and `sanctuary` are byte2 0x04/0x08.
- `MSG_INSPECT_HONOR_STATS` reply: `u64` guid, `u8` honor, four `u32`; silent when the target is missing, beyond `INSPECT_DISTANCE`, or a valid attack target (`MiscHandler.cpp:1019-1049`); self-inspect answers (the guid resolves to the player itself, not attackable) [M source, live proof is the flow].
- `SMSG_PVP_CREDIT`: `i32` honor, `u64` victim, `i32` rank (`Entities/Player/Player.cpp:6278,6305,6385-6392`; sent only if a victim or group exists). `SMSG_ZONE_UNDER_ATTACK`: `u32` area id, to **every session of the team opposing the killer** (`Entities/Creature/Creature.cpp:2870-2875`), fired from `GuardAI::JustDied` (`AI/CoreAI/GuardAI.cpp`) and `SmartScript.cpp`, i.e. when a player kills a guard (the plan's "attacked" is wrong). `SMSG_QUESTUPDATE_ADD_PVP_KILL`: three `u32` (`Server/Packets/QuestPackets.cpp:89-96`); only six quests use the objective, all test quests or the level-77+ dailies 13233/13234 (15 kills) [M `quest_template.sql` `RequiredPlayerKills`].

Battleground queue (all `Handlers/BattleGroundHandler.cpp`, all `STATUS_LOGGEDIN`, `Opcodes.cpp:703,854-858,881`):
- `CMSG_BATTLEMASTER_JOIN` (`:72-294`): `u64` guid, `u32` BattlemasterList id, `u32` instance, `u8` asGroup. **The guid is never checked** (only passed to the script hook `:142`): a solo join works from anywhere with guid 0; only HELLO needs a battlemaster in view. Silent returns (no reply, the act must time out): bad type, in a battleground, no bracket for the level (`:108-112`), invalid guid group. Errors come as `SMSG_GROUP_JOINED_BATTLEGROUND`: -4 too many queues (`:130-136`), -2 deserter (`:164-166`), -1 already queued for this one (`:172-174`); **success sends only `SMSG_BATTLEFIELD_STATUS` `WAIT_QUEUE`** (`:205-213`), no positive group-joined packet in the solo path (only the group path sends it, `:271`). The queue slot is the status `u32` (`:208`). Levels: WSG 10-80, AB 20-80, EotS 61-80, arenas 10-80 [M `battleground_template.sql`]; the hello and join access test is `Player.cpp`.
- `CMSG_BATTLEMASTER_HELLO` (`:37-63`): no range check, same map only; below the level a notification, not a list. List writer `Battlegrounds/BattlegroundMgr.cpp` (`u64` guid, `u8` fromWhere, `u32` type, `u8 0`, `u8 0`, `u8` hasWin, 3x`u32`, `u8` isRandom [+13 bytes], `u32` count + ids; arena type 6 writes a lone `u32 0`). `CMSG_BATTLEFIELD_LIST` answers with guid 0 (`:368-391`).
- `CMSG_BATTLEFIELD_PORT` (`:393-617`): `u8` arenaType, `u8` unk, `u32` type, `u16 0x1F90`, `u8` action. Order of silent drops: unknown type, not in any queue, **charmed or in combat (this also stops a leave)** (`:419-423`), no group info for the (type, arenaType) queue (`:435`), accept without invite. Leave answers the 12-byte none status `u32` slot + `u64 0` (`:584-590`; `BattlegroundMgr.cpp`). Leaving while invited (`STATUS_WAIT_JOIN`) or in progress is recorded as a desertion (`:600-610`, `CHAR_INS_DESERTER_TRACK`, script hook `OnPlayerBattlegroundDesertion`); a flow must never answer an invite, and the leave step runs only while the status is `WAIT_QUEUE`.
- `CMSG_BATTLEFIELD_STATUS` (`:637-696`): empty; answers one status per active queue/battleground and nothing when the character has none (so the new login packet adds no reply). Status writer `BattlegroundMgr.cpp`, group-joined writer `:248-254`; enum `src/server/shared/SharedDefines.h`, `PLAYER_MAX_BATTLEGROUND_QUEUES` `:153`.

Live reachability:

| Opcode(s) | Route (throwaway account, own character only) |
|---|---|
| `CMSG_TOGGLE_PVP`, `MSG_INSPECT_HONOR_STATS` (pvp-1) | `fresh` or `eversong10`; flow `battlegrounds-flag`; `live`. Compare 0x200 (immediate) and byte2 0x01 (stays about 5 min after "off"). |
| `SMSG_PVP_CREDIT` | mock + `unseen` unless a match credits bonus honor; pvp-3 is not in the slice, so `unseen`. No try is planned. |
| `SMSG_ZONE_UNDER_ATTACK` | needs a player killing a guard; the message goes to every online player of the guard's faction (maintainer's characters, bots). Mock + `unseen`, no live try (DESIGN 2). |
| `SMSG_QUESTUPDATE_ADD_PVP_KILL` | needs a player kill and quest 13233/13234 at level 77: mock + `unseen`, no try planned. |
| list/join/status/leave (pvp-2) | `eversong10` is level 10: WSG (type 2) list, join, status, join-again (-1), leave all work from anywhere (guid 0). `deserter-bg 1m` then join gives -2. Optional -4: `soap gm level 61`, queue WSG, AB (3), EotS (7); the third answers -4. |
| `CMSG_BATTLEMASTER_HELLO` | **Verified live** (run 2): `soap gm <ACCOUNT> tele MorshanBaseCamp` (`game_tele` 642, map 1 `1035.62,-2106,122.946`) puts Gargok (entry 19910, spawn guid 20428, `1034.16,-2092.87,124.893`, npcflag `0x100001`, permanent: not in `game_event_creature`) 13.4 yd away; `probe --flow nearest --arg kind=battlemaster` returned him with roles `gossip`,`battlemaster`. Artifact `tmp/probe/FAC6ABF6869E7-20261002T081641Z/`, `tmp/seed5-session-pvp/live2.json`. Arena form: `tele HallOfTheBrave` (467) -> Zeggon Botsnap (19912, guid 4762, 28 yd, permanent, faction 35). The Warsong Emissaries in Silvermoon/Orgrimmar and `SilvermoonCity`-near masters are Call-to-Arms event spawns (event 19; `game_event_creature.sql:7127-7130`) and may be absent: do not use them. |

Bots: `RandomPlayerbotMgr::CheckBgQueue` runs every 35 s and counts real players in queues (`modules/mod-playerbots/src/Bot/RandomPlayerbotMgr.cpp:382-385,907-947`, `randomBotJoinBG` default true, `PlayerbotAIConfig.cpp:383`). A queue held under about 20 s is not filled and no invite arrives; the flow must `leave` by then and the builder must never send action 1. Nothing here targets or messages a RNDBOT character; the bots' own reaction to a queue is server behaviour. Retained: run 1 `tmp/probe/FAC6ABF683126-20261002T081545Z/` (teleport + nearest, flow output not saved), run 2 as above. Both accounts deleted (`{"deleted":[...]}`). Two live tries used; the builders have their own.
