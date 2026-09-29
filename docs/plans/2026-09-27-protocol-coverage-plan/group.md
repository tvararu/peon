# Protocol coverage: unit `group` (key: group)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.13 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).
The design wins over this file, and the contract wins over this file
(contract "Precedence").

## What the unit delivers

A party works today. Raids do not: Peon cannot convert, move members
between subgroups, set assistants, mark targets, give master loot or
answer a ready check, and it drops `SMSG_LOOT_LIST`, which arrives on every
kill. After this unit the character reads the full roster and full member
stats, runs raids, runs and answers ready checks, marks targets, pings the
minimap, sets loot rules, gives master loot, opts out of loot rolls, answers
summons and rolls on group loot. The agent gets one new tool, `group`.

- Unit `group`, two code areas (design 5.1): `raid` (roster reads,
  structure, ready check, marks, pings, member-stat requests, kick by guid,
  summons) and `looting` (loot owner, loot rules, master loot, opt-out). The
  party code stays legacy (`protocol/group.ts`, `party-store.ts`,
  `world-handlers.ts`); its body fixes go through leases (contract 2.7).
- Worktree `proto-group`, branch `proto/area-group` (contract 0.1, D19):

  ```
  orca-ide worktree create --name proto-group \
    --base-branch origin/factory/426-protocol-coverage \
    --parent-worktree active --setup run \
    --comment 'owner: coordinator, item 4 group'
  git branch -m proto/area-group
  ```

- Phases (design 5.1 and N22): wave 1 holds group-4 (split into group-4a
  and group-4b); wave 2 holds group-1, group-2, group-3, group-5, group-6,
  group-7, group-9 (split into 9a, 9b) and group-10 (split into 10a, 10b,
  10c); wave 3 holds group-8 and group-11. One task at a time. Each task
  starts from the current `origin/factory/426-protocol-coverage` after the
  previous one landed. Builds start only after item 6 has merged and R0 ran
  (design 6.2, 6.3).
- Owned opcodes: 22 rows, 19 relevant and 3 dead (design 5.13). The verify
  corrections move no opcode into or out of this unit. `raid` owns 14
  relevant and 2 dead rows; `looting` owns 5 relevant and 1 dead row. Three
  handled opcodes have body gaps that this unit fixes under leases:
  `SMSG_GROUP_LIST`, `SMSG_PARTY_MEMBER_STATS` with `_FULL`, and
  `SMSG_GROUP_INVITE`.
- Shared piece it owns (N28): the `SMSG_GROUP_LIST` rewrite. `lfg` refuses
  `queue auto` until group-1 lands.
- Names (contract D7): `RAID_OPCODES`, `raidArea`, `RaidStore`,
  `RaidState`, `RaidEvent`, `RaidActs`, `raidRuntime`, `raidHarness`;
  `LOOTING_OPCODES`, `lootingArea`, `LootingStore`, `LootingState`,
  `LootingEvent`, `LootingActs`, `lootingRuntime`, `lootingHarness`; the
  tool `groupTool` in `packages/harness/src/areas/raid/tool.ts` (contract
  1.9 tool table, kind `action`, D25).
- Log rows use the area domains (contract 1.9): `raid/<name>` and
  `looting/<name>`. The legacy `group/*` rows of
  `packages/harness/src/events/rules-chat.ts` stay as they are.
- Test packet builders live in `packages/core/test-support/areas/raid.ts`
  and `packages/core/test-support/areas/looting.ts`, named
  `raid<Opcode>Body(...)` and `looting<Opcode>Body(...)`, each built as the
  AzerothCore writer builds the packet (contract 0.5, 1.8).

## Rules for every task of this unit

Core paths without a package prefix are under `packages/core/src/wow/`.
AzerothCore paths are relative to `src/server/game/` unless they start with
`src/`. wowm paths are under `wow_message_parser/wowm/world/`.

**Unit files.**

| Path | Created by |
|---|---|
| `areas/raid/opcodes.ts`, `areas/raid/area.ts` | `SEED-2` (the unit fills `uses`, `dead`, `unseen` and removes the three ready-check stub lines) |
| `areas/looting/opcodes.ts`, `areas/looting/area.ts` | `SEED-1` (wave 1, N22) |
| `areas/looting/protocol.ts`, `store.ts`, `runtime.ts` and tests | group-4a (grow in 4b, 5) |
| `areas/raid/protocol.ts`, `store.ts`, `store-roster.ts`, `runtime.ts` and tests | group-1 (grow in 2, 3, 6, 7, 8) |
| `areas/raid/store-stats.ts`, `areas/raid/store-ready.ts`, `areas/raid/store-marks.ts`, `areas/raid/store-summon.ts` | group-2, group-6, group-7, group-8 |
| `areas/raid/names.ts` and test | group-3 (party results and operations from AzerothCore) |
| `protocol/group-list.ts`, `protocol/group-stats.ts` and tests | group-1, group-2, under the lease on `protocol/group.ts` (split by responsibility, contract 0.2) |
| `packages/core/test-support/areas/raid.ts`, `.../areas/looting.ts` | group-1, group-4a |
| `packages/harness/src/areas/raid/area.ts` and test, `rules-*.ts` siblings | `SEED-2`; rules from group-1 on |
| `packages/harness/src/areas/looting/area.ts` and test | `SEED-1`; rules from group-4a |
| `packages/harness/src/areas/raid/tool.ts`, `tool-<part>.ts` and tests | group-9a (grow in 9b, 10a-c, 11) |
| `packages/devtools/src/probe-flows/looting-kill.ts`, `looting-master.ts` | group-4a, group-5 |
| `packages/harness/src/grader/scenarios/t9-raid-*.json` | group-9a to group-11 |
| `docs/areas/raid.md`, `docs/areas/looting.md` | group-1, group-4a |
| `docs/protocol-coverage/raid.md`, `docs/protocol-coverage/looting.md` | regenerated only |

**One store per code area** (contract 1.2). `RaidStore` keeps one slice
per task in a sibling file, so no file passes 500 lines. The final shapes:

```ts
type RaidMember = {
  guid: bigint;
  name: string;
  status: number;
  subgroup: number;
  flags: number;
  roles: number;
};
type RaidGroup = {
  kind: "party" | "raid";
  battleground: boolean;
  dungeonFinder: { status: number; dungeonId: number } | undefined;
  self: { subgroup: number; flags: number; roles: number };
  members: readonly RaidMember[];
  leader: bigint;
  loot: { method: number; master: bigint; threshold: number } | undefined;
  difficulty: { dungeon: number; raid: number; heroic: boolean } | undefined;
  counter: number;
};
type RaidState = {
  group: RaidGroup | undefined;
  stats: ReadonlyMap<bigint, MemberStats>;
  readyCheck: ReadyCheck | undefined;
  marks: readonly bigint[];
  summon: { summoner: bigint; zoneId: number; expiresAt: number } | undefined;
};
type LootingState = {
  owners: ReadonlyMap<bigint, { master: bigint; looter: bigint; mine: "yes" | "no" | "unknown" }>;
  masterCandidates: readonly bigint[];
  passOnLoot: boolean;
};
```

`marks` has eight slots; `0n` is an empty slot. `MemberStats` and
`ReadyCheck` are defined by group-2 and group-6. A builder may name
private helpers freely; it never adds a second public name for one of the
above.

**Events** (`type` values, in the order the tasks add them).
`raid`: `group_list` (with a `changes` list), `invite_blocked`,
`member_stats` (with a `transitions` list), `command_result`,
`ready_check_started`, `ready_check_answer`, `ready_check_finished`,
`raid_mark`, `raid_marks`, `minimap_ping`, `summon_requested`,
`summon_expired`. `looting`: `loot_owner`, `master_loot_candidates`.
Events carry strings, plain numbers and bigint guids (contract 1.2).

Why `group_list` and `member_stats` are area events: design 5.13 names
them as the events the area adds, and the legacy `GroupEvent` union lives
in `client.ts`, which is frozen after step 0 (contract 2.3). So the legacy
`group` events keep their shape, and the `raid` store emits the extended
forms under the same names on the area stream. The `raid` store reads
`SMSG_GROUP_LIST`, `SMSG_PARTY_MEMBER_STATS`, `_FULL`, `SMSG_GROUP_INVITE`
and `SMSG_PARTY_COMMAND_RESULT` through `peek` (contract 1.3), because
their owner stays legacy. It parses the peeked packet with the rewritten
legacy parser, because `conn.party` is not in `CoreStores` and a store
gets no runtime context (contract 1.2, 1.5).

**Runtimes.** `areas/raid/runtime.ts` and `areas/looting/runtime.ts` hold
every send, timer and policy. They resolve a member name to a guid through
`ctx.legacy.party()` and throw `new Error("not in your party")` for a
missing name, as `setLeader` does today (`client-social.ts:104-115`). Core
checks no permission; the harness does (design 5.13 "Verbs"). Neither
area imports the other; `looting` never reads `raid` state.

**Tests.** Every core test uses `areaRig("raid")` or `areaRig("looting")`
(contract 1.8). A `peek` test needs no legacy register call, because the
rig gives each `uses` opcode a no-op owner. A test that checks the legacy
owner and the peek together passes `registerGameHandlers`' group lines
through `init.register` (D24).

**Docs.** group-1 creates `docs/areas/raid.md` and group-4a creates
`docs/areas/looting.md`, with the four fixed headings of contract 3.8.
Each task adds its proof rows and wire notes and regenerates
`docs/protocol-coverage/<area>.md` with `mise protocol:coverage`. Every
citation passes `mise protocol:cite-check` before review.

**Live staging** (design 5.13 "Staging"). Every group opcode needs a
second character. The server has no SOAP group commands: `.group join` and
the rest are `Console::No` (`src/server/scripts/Commands/cs_group.cpp:37-42`).
So each proof creates two or three accounts with `mise factory soap create
eversong10` (same faction, same spawn, level 10, which passes the raid
level limit, `Groups/Group.cpp:317-325`), starts each puppet with
`tmp/puppet-<ACCOUNT> start --json --packet-trace headers` (T-7c), drives
it with `tmp/puppet-<ACCOUNT> call <method> [json-array]` (T-7a), reads
its events with `tmp/puppet-<ACCOUNT> events --json` (T-7b), and reads its
packets in `tmp/factory-account-<ACCOUNT>/state/packets.jsonl`. Account A
plays Peon; account B is the partner. A task that needs a new puppet
method adds one sorted key to `packages/harness/src/puppet/calls.ts`
(contract 2.6). Kills use a probe flow (`mise protocol:probe <ACCOUNT>
--flow <flow> --expect <OPCODE>`, T-3). `soap gm` (T-5) runs only on the
task's own characters. Every account is deleted with `mise factory soap
delete <ACCOUNT>` before the task reports (contract 0.7). Partners are
puppets only, never playerbots (design 5.13 "Decisions").

**Checks before review:** `mise test <each test file>`, `mise typecheck
core`, `mise typecheck harness` for harness tasks, `mise lint:docs`,
`mise test packages/harness/src/grader/scenarios.test.ts` for a scenario
task, and `mise ci:checks`.

## Leases this unit needs

The coordinator assigns each lease in the plan index (contract 2.7, D12).
A task whose lease is not assigned stops as `blocked`.

| Task | Legacy file | Edit |
|---|---|---|
| group-1 | core `protocol/group.ts` and test, `party-store.ts` and test, `world-handlers.ts` and `world-handlers-group.test.ts` | move `parseGroupList` to the new sibling `protocol/group-list.ts` and rewrite it; roster fields in `PartyStore`; the online bit; the `SMSG_GROUP_INVITE` status 0 fix |
| group-2 | the same three files | move `parsePartyMemberStats` to `protocol/group-stats.ts` and read every field; the stats fields in `PartyStore`; the full guid in the legacy event payload is out of scope (frozen type) |
| group-2 | core `client-social.ts` (`getPartyState` only) | copy power, max power and power type from a unit in view (design 5.13 body gap 4) |
| group-4a | harness `tools/loot.ts` and test | skip a corpse whose owner is someone else |

Contract gaps, reported to the coordinator:

1. **`client-social.ts` is not in the lease list** of contract 2.7. Design
   5.13 needs the in-view merge of `getPartyState` to copy power
   (`client-social.ts:73-80`). If the lease is not granted, group-2 leaves
   the in-view power out, keeps power from the stats packet only, and
   reports it.
2. **`protocol/enums.ts` is not leased.** Its `PartyOperation.SWAP` is 3
   where AzerothCore has 4 (`Server/WorldSession.h:254-260`), and
   `PartyResult` stops at 13 (`src/server/shared/SharedDefines.h:3958-3988`).
   No code sends or reads `SWAP` today, so the wrong value does no harm.
   group-3 builds complete tables in `areas/raid/names.ts` for the `raid`
   area and asks for a `COORD-<n>` commit that fixes `enums.ts`. The
   harness gets the result names through the `command_result` area event,
   because an area adds no barrel line (contract 1.6 `index.ts`).
3. **`conn.partyMembers` folds into `PartyStore`** by a `COORD-<n>`
   commit (D20). No task of this unit depends on it.
4. **Console check in an eval.** Contract 0.7 allows no GM command inside
   an eval except N30's mail step, while design 5.13 checks raid and size
   with `soap gm read group` (T-10). The tooling plan reports the same gap
   (issue 4 of `tooling.md`). group-9a and group-9b use the console check
   only after the coordinator records the carve-out; until then the check
   is left out and the game-log rows grade the scenario.
5. **Ready-check finish timer placement.** Design 5.13 says the harness
   sends the finish after all answers or 30 s. A harness tool call ends
   before the check does, and contract 1.2 puts timers and policy in the
   runtime. This plan puts the timer in `raidRuntime` (group-6) and makes
   the 30 s a Peon choice. Not yet ruled by the maintainer.

## DAG

```
item6, R0, S0-5, T-2, T-3, T-4
  └─ SEED-1 ─► group-4a ─► group-4b (needs T-7a..c)
                   │
  SEED-2 (needs T-7a..c) ─► group-1 ─┬─► group-2
                                     ├─► group-3
                                     ├─► group-6
                                     ├─► group-7
                                     └─► group-5 (and group-4b)
  group-1, 2, 3 + T-10 ─► group-9a ─► group-9b (and group-4b)
  group-9a + group-6 ─► group-10a
  group-9a + group-7 ─► group-10b
  group-9b + group-5 ─► group-10c
  SEED-3 + group-1 ─► group-8 ─► group-11 (and group-9a, objects-2)
```

| Id | Title | Phase | Code area | Deps | Opcodes | Proof | Evals | Size |
|---|---|---|---|---|---|---|---|---|
| group-4a | Loot owner and loot opt-out | 1 | looting | SEED-1, T-2, T-3, T-4 | 2 | live, builder | none | S |
| group-4b | Set the loot method | 1 | looting | group-4a, T-7c | 1 | live | none | S |
| group-1 | Full roster | 2 | raid | SEED-2, T-7c | body gaps | unit, live | none | M |
| group-2 | Full member stats | 2 | raid | group-1 | 1 + body gaps | live | none | M |
| group-3 | Raid structure | 2 | raid | group-1 | 6 | live | none | M |
| group-5 | Master loot | 2 | looting | group-4b, group-1 | 2 | live | none | S |
| group-6 | Ready check | 2 | raid | group-1 | 3 | live | none | S |
| group-7 | Raid marks and pings | 2 | raid | group-1 | 2 | live | none | S |
| group-9a | `group` tool: status, kick, lead | 2 | raid | group-1, group-2, group-3, T-10 | 0 | eval | `t9-raid-kick` | M |
| group-9b | `group` tool: raid admin and loot rules | 2 | raid | group-9a, group-4b | 0 | eval | `t9-raid-convert` | M |
| group-10a | `group` tool: ready checks | 2 | raid | group-9a, group-6 | 0 | eval | `t9-raid-ready`, `t9-raid-answer` | M |
| group-10b | `group` tool: marks and pings | 2 | raid | group-9a, group-7 | 0 | eval | `t9-raid-mark` | S |
| group-10c | `group` tool: give, pass, roll | 2 | raid | group-9b, group-5 | 0 | eval | `t9-raid-master-loot` | M |
| group-8 | Summons | 3 | raid | SEED-3, group-1 | 2 | mock, accepted | none | S |
| group-11 | `group` tool: summon | 3 | raid | group-8, group-9a, objects-2 | 0 | eval | `t9-raid-summon` | S |

The tasks run one at a time in the order of the sections below. The
coordinator may start group-4a and group-4b in wave 1 while the rest waits
for `SEED-2`. `SEED-2` needs the partner tooling T-7a to T-7c, which
contract 2.2 lands before it.

---

## Task group-4a: Loot owner and loot opt-out

Rulings: SR1-group-1, SR1-group-2, SR1-group-3, SR1-group-4, SR1-group-5, SR1-group-6, SR1-group-7, SR1-group-8, SR1-group-9, SR1-group-12.

**Files:**
- Create: `areas/looting/protocol.ts`, `areas/looting/protocol.test.ts`,
  `areas/looting/store.ts`, `areas/looting/store.test.ts`,
  `areas/looting/runtime.ts`, `areas/looting/runtime.test.ts`,
  `packages/core/test-support/areas/looting.ts`,
  `packages/devtools/src/probe-flows/looting-kill.ts`,
  `docs/areas/looting.md`
- Modify: `areas/looting/area.ts`, `areas/looting/opcodes.ts` (`dead`,
  `uses`), `packages/harness/src/areas/looting/area.ts` and test,
  `packages/harness/src/tools/loot.ts` and `loot.test.ts` (lease),
  `packages/harness/src/puppet/calls.ts` (sorted key `setPassOnLoot`),
  `docs/protocol-coverage/looting.md` (regenerated)

**Depends on:** item6, R0, S0-5, SEED-1 (seeds `looting` in wave 1, N22),
T-2 (tap), T-3 (probe), T-4 (cite-check), T-7a for the calls key (if
T-7a has not landed, the opt-out live send uses the probe flow instead),
the group-4a lease on `tools/loot.ts`.

**Opcodes:** `SMSG_LOOT_LIST`, `CMSG_OPT_OUT_OF_LOOT`. Dead:
`SMSG_LOOT_ITEM_NOTIFY`.

**Steps:**

1. **Failing parser test** (`protocol.test.ts`). Build
   `lootingLootListBody({ creature, master, looter })` in two forms. The
   group form writes `u64 creature`, then the master as a packed guid or
   `u8 0`, then the looter as a packed guid or `u8 0`
   (`Groups/Group.cpp:1085-1102`). The solo form writes `u64 creature`,
   `u8 0`, `u8 0` (`Entities/Unit/Unit.cpp:13612-13619`). Assert that
   `parseLootList` returns the full creature guid and `0n` for each empty
   packed guid. Assert that `buildOptOutOfLoot(true)` writes the `u32` 1
   and `false` writes 0 (reader `Handlers/GroupHandler.cpp:1143-1152`).
   Run `mise test packages/core/src/wow/areas/looting/protocol.test.ts`
   and see it fail on the missing module.
2. **Implement** `parseLootList` and `buildOptOutOfLoot` in
   `areas/looting/protocol.ts`.
3. **Failing store test** (`store.test.ts`, through `areaRig("looting")`
   with `selfGuid` set). Inject the solo form: the store holds the owner
   with `mine: "unknown"` and emits one `loot_owner` event. Inject the
   group form with the looter equal to self: `mine: "yes"`; with another
   looter: `mine: "no"`. A master equal to self also gives `"yes"`. Inject
   65 packets for different creatures: the store keeps 64 and drops the
   oldest. `forget(guid)` drops one entry.
4. **Implement** `LootingStore` with `owners`, `masterCandidates: []`,
   `passOnLoot: false`, `receiveLootList` and `forget`. `register` owns
   `SMSG_LOOT_LIST` with `wire.on`.
5. **Failing runtime test.** An `entity` event that removes the creature
   (`ctx.listen("entity", ...)`) calls `forget`. `act.setPassOnLoot(true)`
   records one `CMSG_OPT_OUT_OF_LOOT` in `rig.sent` and sets `passOnLoot`
   to `true` ("requested", because the server sends no reply). A new
   session starts with `false`, because AzerothCore starts every session
   with the flag off (`Entities/Player/Player.cpp:215`).
6. **Implement** `lootingRuntime` with the act `setPassOnLoot`, and wire
   `store`, `register` and `runtime` in `area.ts`. The store never sends
   (contract 1.2), so the act updates the flag through a store method.
7. **Harness rules** (`packages/harness/src/areas/looting/area.ts`): the
   `event` rule for `loot_owner` returns `[]`, because the packet arrives
   on every kill and would flood the log (G17, design 5.13 "Verbs"). A
   test pins that no row is written.
8. **Loot tool** (lease). Failing test in `loot.test.ts`: with
   `handle.looting.state()` holding `mine: "no"` for the nearest lootable
   corpse, `loot` picks the next corpse, and with no other corpse it
   returns `REFUSED` with `reason: "not_yours"`. Then implement. The
   builder first checks whether the corpse choice already filters on the
   per-viewer lootable flag (`tools/loot.ts:40,58`). If the server never
   marks another player's corpse lootable for Peon, the owner check adds
   nothing: the builder then drops this step, keeps the lease unused and
   reports it.
9. **Probe flow** `looting-kill`: log in, find the nearest attackable
   creature with the `nearest` helper (T-3), walk to it, attack it until
   it dies, and print the `looting` state.
10. **Opcodes and docs.** `dead: ["SMSG_LOOT_ITEM_NOTIFY"]` if the seed
    left it out. Create `docs/areas/looting.md` with its wire note (the
    solo form writes `u8 0` twice, which reads as two empty packed guids)
    and the rows of this task.

**Proof:**
- `SMSG_LOOT_LIST` live, solo. Create an `eversong10` account and run
  `mise protocol:probe <ACCOUNT> --flow looting-kill --expect
  SMSG_LOOT_LIST`. The server sends it on every kill
  (`Entities/Unit/Unit.cpp:13612-13619`). Row `live` with the flow and
  its exit code.
- `CMSG_OPT_OUT_OF_LOOT`: `builder`, effect not seen (contract 0.6). On the same account, start its puppet
  and run `tmp/puppet-<ACCOUNT> call setPassOnLoot '[true]'`. The trace
  holds the `out` row, and the puppet `status` still shows the character
  in the world (no disconnect; the opcode is `STATUS_AUTHED`,
  `Server/Protocol/Opcodes.cpp:1164`). The handler sets a real flag
  (`Handlers/GroupHandler.cpp:1150`) whose effect is an automatic pass on
  a group roll over the threshold (`Groups/Group.cpp:1160`). A roll needs
  an uncommon drop in a group, which is chance, so the effect is not seen
  live. Row `builder` with the evidence "sent live, effect not seen", and
  the opcode goes into `unseen` (contract 0.6, the effect-not-seen row).
- `SMSG_LOOT_ITEM_NOTIFY` row `dead`.
- The loot tool changed, so run `mise eval run t3-ghostlands-kill --round <n>` and record
  the verdict against the R0 baseline (contract 3.6, D17).

**Commit:**

```
feat: Track who owns each corpse's loot

The server says on every kill who may loot the corpse, and Peon dropped
the packet. The looting area keeps the owner, and the character can opt
out of group loot rolls.
```

---

## Task group-4b: Set the loot method

Rulings: SR1-group-5, SR1-group-9, SR1-group-10, SR1-group-11, SR1-group-12.

**Files:**
- Modify: `areas/looting/protocol.ts` and test, `areas/looting/runtime.ts`
  and test, `packages/core/test-support/areas/looting.ts`,
  `packages/harness/src/puppet/calls.ts` (sorted key `setLootMethod`),
  `docs/areas/looting.md`, `docs/protocol-coverage/looting.md`
  (regenerated)

**Depends on:** group-4a, T-7a, T-7b, T-7c (two puppets with traces).

**Opcodes:** `CMSG_LOOT_METHOD`.

**Steps:**

1. **Failing builder test.** `buildLootMethod(method, master, threshold)`
   writes `u32 method`, a full `u64` master guid and `u32 threshold`
   (reader `Handlers/GroupHandler.cpp:516-546`; `ObjectGuid >>` reads 8
   bytes). Assert the 16-byte body for master loot with a master guid and
   for group loot with `0n`.
2. **Implement** `buildLootMethod`.
3. **Failing runtime test.** `act.setLootMethod({ method, threshold,
   master })` takes names: `method` is one of `free_for_all`,
   `round_robin`, `master_loot`, `group_loot`, `need_before_greed` (0-4),
   `threshold` one of `uncommon`, `rare`, `epic`, `legendary`, `artifact`
   (2-6, `GroupHandler.cpp:528-538`), and `master` a member name that
   resolves through `ctx.legacy.party()`. An unknown name throws
   `not in your party`; a threshold below 2 throws before any send. The
   act sends one packet and returns; the settle is the harness's job
   (group-9b) on the next roster.
4. **Implement** the act.

**Proof (live):** two `eversong10` accounts A and B, puppets with
`--packet-trace headers`. `tmp/puppet-<A> call invite '["<B>"]'`,
`tmp/puppet-<B> call acceptInvite`, then `tmp/puppet-<A> call
setLootMethod '["master_loot", "uncommon", "<A>"]'`. The server answers
with `SMSG_GROUP_LIST` (`GroupHandler.cpp:545`); A's `events --json`
shows the legacy `group_list` event with `loot.method` `master_loot`
(the legacy parser already reads the method, looter and threshold). A
negative send with threshold 1 changes nothing and gets no reply. Row
`live`.

**Commit:**

```
feat: Set the group loot method

The leader chooses how the group loots, and Peon could not send the
choice. The looting area sends the method, the threshold and the master
looter.
```

---

## Task group-1: Full roster

**Files:**
- Create: `protocol/group-list.ts`, `protocol/group-list.test.ts`,
  `areas/raid/protocol.ts`, `areas/raid/store.ts`,
  `areas/raid/store-roster.ts`, `areas/raid/store.test.ts`,
  `areas/raid/runtime.ts`, `areas/raid/runtime.test.ts`,
  `packages/core/test-support/areas/raid.ts`, `docs/areas/raid.md`
- Modify (lease): `protocol/group.ts`, `protocol/group.test.ts`,
  `party-store.ts`, `party-store.test.ts`, `world-handlers.ts`,
  `world-handlers-group.test.ts`
- Modify: `areas/raid/area.ts`, `areas/raid/opcodes.ts` (`uses`, `dead`),
  `packages/harness/src/areas/raid/area.ts` and test,
  `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** SEED-2 (seeds `raid`), T-7a, T-7b, T-7c, the group-1
lease.

**Opcodes:** none of the 19; body gaps of the handled `SMSG_GROUP_LIST`
and `SMSG_GROUP_INVITE`. Dead: `CMSG_GROUP_CANCEL`,
`SMSG_REAL_GROUP_UPDATE`.

**Steps:**

1. **Failing parser tests** (`protocol/group-list.test.ts`). Build
   `raidGroupListBody(...)` as `Group::SendUpdateToPlayer` writes it
   (`Groups/Group.cpp:1900-1950`): `u8` type, `u8` own subgroup, `u8` own
   flags, `u8` own roles; when the type has bit 0x08, `u8` status and
   `u32` dungeon id (`:1904-1908`); `u64` group guid, `u32` counter, `u32`
   member count, per member `CString` name, `u64` guid, `u8` status, `u8`
   subgroup, `u8` flags, `u8` roles; `u64` leader; when the count is not 0,
   `u8` method, `u64` master looter, `u8` threshold, `u8` dungeon
   difficulty, `u8` raid difficulty, `u8` heroic flag (`:1934-1947`).
   Five fixtures:
   - a party of two;
   - a raid with members in subgroups 0 and 1 and flags 0x01 and 0x06;
   - a dungeon-finder group (type 0x08) with the 5-byte insert, which the
     legacy parser misreads (wowm has the same gap,
     `social/smsg_group_list.wowm`, so the fixture comes from AzerothCore);
   - a battleground group (type 0x01) with an offline member whose status
     is 0x02, which must read as offline (status bit 0x01 is online,
     `Groups/Group.h:59-70`; `Group.cpp:1922-1923`);
   - the "you left" form: type 0x10, count 0, leader 0 and no loot block.
   Assert every field. Run the test and see it fail on the missing module.
2. **Implement** `parseGroupList` in `protocol/group-list.ts` with the
   types `GroupList`, `GroupMember` and `GroupLoot` extended by the new
   fields, and delete the old function from `protocol/group.ts`. Update
   the importers inside the lease: `world-handlers.ts`, `party-store.ts`,
   `party-store.test.ts` and `protocol/group.test.ts`. `client-social.ts`
   imports only builders from `protocol/group.ts` (`client-social.ts:11-18`),
   which stay. Keep `online` on `GroupMember` as `status & 0x01`, so the
   legacy event and the `social` tool see the fixed value.
3. **Failing `PartyStore` test** (`party-store.test.ts`). `applyList` with
   the raid fixture gives `kind: "raid"`, the own subgroup, flags and
   roles, each member's `subgroup`, `flags`, `roles` and `status`, the
   three difficulty bytes and `dungeonFinder` for the LFG fixture. The
   "you left" form clears the state. Implement the fields in
   `party-store.ts` (design 5.13 "Store, events, acts"). The mock handle
   builds its party state with `new PartyStore().snapshot()`
   (`packages/core/test-support/mock-handle.ts:143`), so it follows.
4. **Failing invite test** (`world-handlers-group.test.ts`). An
   `SMSG_GROUP_INVITE` with status 0 (AzerothCore sends it when the invitee
   is already in a group, `Handlers/GroupHandler.cpp:160-176`) sets no
   `pendingRequest` and emits no `invite_received`; status 1 behaves as
   today. Implement in `handleGroupInviteReceived`.
5. **Failing area store test** (`areas/raid/store.test.ts`,
   `areaRig("raid")`). Peek a party list, then a raid list: the second
   `group_list` event carries `changes` with `{ kind: "converted" }`,
   `{ kind: "subgroup", name, from, to }`, `{ kind: "flag", name, flag:
   "assistant" | "main_tank" | "main_assist", on }`, `{ kind: "loot" }`,
   `{ kind: "difficulty" }`, `{ kind: "joined", name }`, `{ kind: "left",
   name }` and `{ kind: "leader", name }`, as each field changes. A list
   whose counter is not newer than the last one changes nothing. The
   "you left" form sets `group` to `undefined` and emits `{ kind:
   "disbanded" }`. A peeked `SMSG_GROUP_INVITE` with status 0 emits
   `invite_blocked` with the inviter's name.
6. **Implement** `RaidStore` with the `group` slice in `store-roster.ts`
   and `register` peeking `SMSG_GROUP_LIST` and `SMSG_GROUP_INVITE`.
7. **Failing runtime test.** `act.awaitGroupChange(match, timeoutMs)`
   resolves with the first `group_list` event whose `changes` match, and
   rejects with `timeout` after `timeoutMs` (fake timers inside
   `try`/`finally`). Implement it on `ctx.until`.
8. **Harness rules** (`packages/harness/src/areas/raid/area.ts`): a
   `group_list` event writes one `passive` row `roster` per change, for
   example "The group is now a raid." or "Tom moved to group 2."; a
   `joined` or `left` change writes no row, because the legacy
   `group/roster` row already says it. `invite_blocked` writes one `log`
   row "Tom tried to invite you, but you are already in a group." Tests
   pin the row names and classes, not the wording.
9. **Opcodes and docs.** `uses: ["SMSG_GROUP_LIST", "SMSG_GROUP_INVITE"]`;
   `dead: ["CMSG_GROUP_CANCEL", "SMSG_REAL_GROUP_UPDATE"]` if the seed
   left them out. Create `docs/areas/raid.md`: the wire notes (the LFG
   insert, the status mask, the 13-byte loot block, the "you left" form),
   the two dead rows, and a line under "Left out" that says the LFG form
   is not seen live until `instances` forms a dungeon-finder group.

**Proof:**
- Unit: the five fixtures above. `SMSG_GROUP_LIST` is owned by legacy
  code, so it gets no row in `docs/areas/raid.md`.
- Live: two `eversong10` accounts. A invites B, B accepts. A's and B's
  `events --json` show a `raid` `group_list` event with `kind: "party"`
  and the member's status 1; both traces hold `in SMSG_GROUP_LIST`. For the
  invite fix, create a third account C: `tmp/puppet-<C> call invite
  '["<A>"]'`. A's trace holds `in SMSG_GROUP_INVITE` and A's events show
  `invite_blocked`, with no legacy `invite_received`.
- Rows: `CMSG_GROUP_CANCEL` and `SMSG_REAL_GROUP_UPDATE` `dead`.

**Commit:**

```
fix: Read the full group roster

The roster parser skipped the group type, subgroups, member flags and
difficulties, and it broke on dungeon-finder groups. It now reads the
packet as AzerothCore writes it, and the raid area reports what changed.
```

---

## Task group-2: Full member stats

**Files:**
- Create: `protocol/group-stats.ts`, `protocol/group-stats.test.ts`,
  `areas/raid/store-stats.ts`
- Modify (lease): `protocol/group.ts`, `protocol/group.test.ts`,
  `party-store.ts`, `party-store.test.ts`, `world-handlers.ts`,
  `world-handlers-group.test.ts`, and `client-social.ts`
  (`getPartyState` only, gap 1)
- Modify: `areas/raid/protocol.ts` and test, `areas/raid/store.ts` and
  test, `areas/raid/runtime.ts` and test, `areas/raid/area.ts`,
  `areas/raid/opcodes.ts` (`uses`), `packages/core/test-support/areas/raid.ts`,
  `packages/harness/src/areas/raid/area.ts` and test,
  `packages/harness/src/puppet/calls.ts` (sorted key `requestMemberStats`),
  `docs/areas/raid.md`, `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** group-1 (the lease passes on when it lands).

**Opcodes:** `CMSG_REQUEST_PARTY_MEMBER_STATS`; body gaps of the handled
`SMSG_PARTY_MEMBER_STATS` and `SMSG_PARTY_MEMBER_STATS_FULL`.

**Steps:**

1. **Failing parser tests** (`protocol/group-stats.test.ts`). Build
   `raidPartyMemberStatsBody(...)` as `BuildPartyMemberStatsChangedPacket`
   writes it (`Handlers/GroupHandler.cpp:817-1001`) and the `_FULL` reply
   as `HandleRequestPartyMemberStatsOpcode` writes it (`:1003-1135`). Four
   fixtures: a warrior (rage) with auras; a hunter with a pet (pet guid,
   name, display id, health, power, pet auras) and a vehicle seat; a mage
   `_FULL` reply, which has no power-type bit (`:1032-1033`), so the power
   type defaults to mana (0); and the offline `_FULL` reply for a guid not
   in the raid (`:1009-1017`). The position is two `uint16` casts of floats
   (`:887-889`); read them as `int16`, so a negative Eversong y stays
   negative (an inference, confirmed by the live capture below). Assert the
   full status mask (online, pvp, dead, ghost, pvp_ffa, afk, dnd,
   `Groups/Group.h:59-70`), power, zone, position, aura spell ids and pet
   fields.
2. **Implement** `parsePartyMemberStats` in `protocol/group-stats.ts`,
   delete it from `protocol/group.ts`, and update the importers in the
   lease. The legacy `member_stats` event keeps its shape (`client.ts` is
   frozen); `PartyStore.applyStats` stores the new fields, and
   `getPartyState` in `client-social.ts` copies power, max power and power
   type from a unit in view (gap 1).
3. **Failing builder test.** `buildRequestPartyMemberStats(guid)` writes a
   `u64` (`GroupHandler.cpp:1006`).
4. **Failing area store test.** Peeked stats set the `stats` slice.
   A status change from alive to dead, dead to ghost, ghost to alive,
   online to offline and back emits one `member_stats` event with
   `transitions` `died`, `ghost`, `revived`, `offline`, `online`. The
   event carries the full guid and the member name from the `group` slice.
5. **Failing runtime test** (fake timers). When the roster adds a member,
   the runtime sends one `CMSG_REQUEST_PARTY_MEMBER_STATS` for it. A
   read of stats older than 30 s sends one request, at most once per member
   per 10 s. `act.requestMemberStats(name)` sends one request. The real
   client's policy could not be determined; these numbers are Peon's
   (design 5.13 area design section 3).
6. **Implement** the slice, the peeks of `SMSG_PARTY_MEMBER_STATS` and
   `_FULL`, the policy and the act.
7. **Harness rules:** a `member_stats` event writes one `passive` row
   `member` per transition, for example "Tom died."; stats with no
   transition write no row.

**Proof (live):**
- Account A on `eversong10`, account B on `ghostlands20`, about 1,170 yd
  apart (`packages/factory/src/soap-presets.ts:11,46-53`), so the server
  sends out-of-range stats (`Groups/Group.cpp:1953-1967`). A invites B, B
  accepts. A's trace holds `in SMSG_PARTY_MEMBER_STATS`; A's events show
  B's zone and a negative y.
- `tmp/puppet-<A> call requestMemberStats '["<B>"]'`: the trace holds
  `out CMSG_REQUEST_PARTY_MEMBER_STATS` and `in
  SMSG_PARTY_MEMBER_STATS_FULL`. Stop B's puppet: A's events show the
  `offline` transition.
- Pet fields: repeat with B on `eversong10-hunter`. If that template has
  no pet, the pet fixture stays the proof and the evidence says "pet
  fields not seen live".
- Row: `CMSG_REQUEST_PARTY_MEMBER_STATS` `live`.

**Commit:**

```
feat: Read full party member stats

The stats packets carry each member's power, zone, position, auras and
pet, and Peon kept only health and level. The raid area now reads them
all and reports deaths and disconnects.
```

---

## Task group-3: Raid structure

**Files:**
- Create: `areas/raid/names.ts`, `areas/raid/names.test.ts`
- Modify: `areas/raid/protocol.ts` and test, `areas/raid/store.ts` and
  test, `areas/raid/runtime.ts` and test, `areas/raid/area.ts`,
  `areas/raid/opcodes.ts` (`uses`), `packages/core/test-support/areas/raid.ts`,
  `packages/harness/src/puppet/calls.ts` (sorted keys `convertToRaid`,
  `moveToSubgroup`, `setAssistant`, `setMainAssist`, `setMainTank`,
  `swapSubgroups`, `uninviteGuid`), `docs/areas/raid.md`,
  `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** group-1.

**Opcodes:** `CMSG_GROUP_RAID_CONVERT`, `CMSG_GROUP_CHANGE_SUB_GROUP`,
`CMSG_GROUP_SWAP_SUB_GROUP`, `CMSG_GROUP_ASSISTANT_LEADER`,
`MSG_PARTY_ASSIGNMENT`, `CMSG_GROUP_UNINVITE_GUID`.

**Steps:**

1. **Failing builder tests**, each from the AzerothCore reader:
   - `buildGroupRaidConvert()`: empty (`Handlers/GroupHandler.cpp:647-670`);
   - `buildGroupChangeSubGroup(name, group)`: `CString`, `u8`
     (`:672-707`);
   - `buildGroupSwapSubGroup(name, withName)`: `CString`, `CString`
     (`:1154-1234`);
   - `buildGroupAssistantLeader(guid, on)`: `u64`, `u8` (`:709-726`);
   - `buildPartyAssignment(role, on, guid)`: `u8` role, `u8` apply, `u64`
     guid, in that order (`:728-758`); role 0 is main tank and role 1 is
     main assist (`Groups/Group.h:79-83`), not "assistant" as wowm names
     it (`social/msg_party_assignment.wowm`);
   - `buildGroupUninviteGuid(guid, reason)`: `u64`, `CString`
     (`:353-424`).
   Each guid is a full 8-byte `u64`, because AzerothCore reads it with
   `ObjectGuid >>`.
2. **Failing names test** (`names.test.ts`): `partyResultName(25)` is
   `raid_disallowed_by_level`, `partyResultName(14)` is
   `group_swap_failed`, `partyOperationName(4)` is `swap`, and an unknown
   code gives `result_<n>`. Tables from
   `src/server/shared/SharedDefines.h:3958-3988` and
   `Server/WorldSession.h:254-260` (gap 2).
3. **Failing store test.** A peeked `SMSG_PARTY_COMMAND_RESULT` emits
   `command_result` with `operation` and `result` as names and the
   member name. The parse reuses `parsePartyCommandResult` from
   `#wow/protocol/group`.
4. **Failing runtime tests.** Each act sends one packet and returns:
   `convertToRaid()`, `moveToSubgroup(name, group)` (group 1-8 in the
   tool, 0-7 on the wire; a value outside 0-7 throws, because the server
   drops it with no reply, `GroupHandler.cpp:672-707`), `swapSubgroups(name, withName)`,
   `setAssistant(name, on)`, `setMainTank(name, on)`,
   `setMainAssist(name, on)`, `uninviteGuid(name, reason)`. A name not in
   `ctx.legacy.party()` throws `not in your party`.
5. **Implement** the builders, the names, the peek and the acts.
6. **Wire notes.** Most of these sends get no error reply when the server
   refuses them (`GroupHandler.cpp:516-546,610-726`); the only
   confirmation is the next roster. A swap of bad names answers
   `SMSG_PARTY_COMMAND_RESULT` with operation 4 and result 14
   (`:1162-1170,1214-1218`).

**Proof (live):** A and B on `eversong10`, grouped. Through A's puppet:
`call convertToRaid` (the next roster has type 0x02, and
`SMSG_PARTY_COMMAND_RESULT` operation 0 result 0 comes first,
`GroupHandler.cpp:668-669`); `call moveToSubgroup '["<B>", 1]'`;
`call swapSubgroups '["<A>", "<B>"]'`; `call setAssistant '["<B>",
true]'`; `call setMainTank '["<B>", true]'`; `call setMainAssist '["<B>",
true]'`. A's events show one `group_list` change for each. Then `call
swapSubgroups '["Nobody", "<B>"]'` gives `command_result` `swap` /
`group_swap_failed`. For the level refusal: disband, run `mise factory
soap gm <B> level 9`, group again and convert: `command_result`
`raid_disallowed_by_level` (`GroupHandler.cpp:655-659`). Last,
`call uninviteGuid '["<B>", "test"]'`: a party of two disbands
(`Groups/Group.cpp:646`), so A gets `SMSG_GROUP_DESTROYED` and B gets
`SMSG_GROUP_UNINVITE`. All six rows `live`, with the puppet calls as
evidence.

**Commit:**

```
feat: Convert to raid and arrange subgroups

A raid needs a convert, subgroups, assistants, a main tank and a main
assist, and Peon could send none of them. The raid area sends each one
and names the refusals the server returns.
```

---

## Task group-5: Master loot

**Files:**
- Create: `packages/devtools/src/probe-flows/looting-master.ts`
- Modify: `areas/looting/protocol.ts` and test, `areas/looting/store.ts`
  and test, `areas/looting/runtime.ts` and test, `areas/looting/area.ts`,
  `areas/looting/opcodes.ts` (`uses`), `packages/core/test-support/areas/looting.ts`,
  `packages/harness/src/areas/looting/area.ts` and test,
  `docs/areas/looting.md`, `docs/protocol-coverage/looting.md`
  (regenerated)

**Depends on:** group-4b, group-1.

**Opcodes:** `SMSG_LOOT_MASTER_LIST`, `CMSG_LOOT_MASTER_GIVE`.

**Steps:**

1. **Failing parser and builder tests.** `lootingLootMasterListBody(guids)`
   writes `u8 count`, then `count` full `u64` guids
   (`Groups/Group.cpp:1482-1492`); `parseLootMasterList` returns them.
   `buildLootMasterGive(lootGuid, slot, target)` writes `u64`, `u8`, `u64`
   (`Handlers/LootHandler.cpp:478-483`).
2. **Failing store test.** The list sets `masterCandidates` and emits
   `master_loot_candidates`. A peeked `SMSG_LOOT_RELEASE_RESPONSE` clears
   it.
3. **Failing runtime test.** `act.giveMasterLoot(lootGuid, slot, name)`
   resolves the name through `ctx.legacy.party()` or, for self, uses
   `ctx.selfGuid()` (the target may be the master himself,
   `Entities/Unit/Unit.cpp:14640-14641`); it throws `not a candidate` when
   the guid is not in `masterCandidates`, and sends one packet. It returns
   when `SMSG_LOOT_REMOVED` for that slot arrives
   (`LootHandler.cpp:571`), or rejects with the loot error of a
   `SMSG_LOOT_RESPONSE` with loot type 0 (`Entities/Player/Player.cpp:8398-8405`,
   codes `Loot/LootMgr.h:96-108`), or with `timeout` after 5 s.
4. **Implement** the parser, builder, slice, peeks
   (`SMSG_LOOT_RELEASE_RESPONSE`, `SMSG_LOOT_REMOVED`,
   `SMSG_LOOT_RESPONSE`; their legacy owner stays in `gameplay-handlers.ts`)
   and the act.
5. **Harness rules:** `master_loot_candidates` writes one `passive` row
   `master_loot` with the candidate names.
6. **Probe flow** `looting-master`: the flow waits until the character
   leads a group with master loot and itself as master, kills the nearest
   creature (the `looting-kill` steps), opens the corpse, prints the
   candidates, gives slot 0 to itself, and releases the loot.

**Proof (live):** A and B on `eversong10`. A's puppet invites B, B
accepts, A's puppet sets master loot with A as master (group-4b). Stop A's
puppet, then run `mise protocol:probe <A> --flow looting-master --expect
SMSG_LOOT_MASTER_LIST`; B's puppet stays in the group. The server sends
the list when the first player opens a master-looted corpse
(`Entities/Player/Player.cpp:8272-8290`), whatever the item quality
(`Groups/Group.cpp:1482-1491`), and the give checks no threshold
(`LootHandler.cpp:484-559`). A corpse with no item needs another kill; the
flow tries up to three. Evidence: the flow's exit code and `mise factory
soap truth <A>` showing the item in the inventory. Both rows `live`.

**Commit:**

```
feat: Give master loot to a member

Under master loot the looter hands out each item, and Peon could not see
the candidates or give an item. The looting area now does both.
```

---

## Task group-6: Ready check

**Files:**
- Create: `areas/raid/store-ready.ts`
- Modify: `areas/raid/protocol.ts` and test, `areas/raid/store.ts` and
  test, `areas/raid/runtime.ts` and test, `areas/raid/area.ts`,
  `areas/raid/opcodes.ts` (delete the three `stubs` lines),
  `packages/core/test-support/areas/raid.ts`,
  `packages/harness/src/areas/raid/area.ts` and test,
  `packages/harness/src/puppet/calls.ts` (sorted keys `answerReadyCheck`,
  `finishReadyCheck`, `startReadyCheck`), `docs/areas/raid.md`,
  `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** group-1.

**Opcodes:** `MSG_RAID_READY_CHECK`, `MSG_RAID_READY_CHECK_CONFIRM`,
`MSG_RAID_READY_CHECK_FINISHED`.

**Steps:**

1. **Failing parser tests.** The server forms, as AzerothCore writes them:
   `MSG_RAID_READY_CHECK` is the initiator's `u64` guid only
   (`Handlers/GroupHandler.cpp:783-787`; wowm has an optional guid and
   state, 9 bytes, `raid/msg_raid_ready_check.wowm`);
   `MSG_RAID_READY_CHECK_CONFIRM` is `u64` guid and `u8` state (`:795-800`,
   and state 0 for each offline member, `Groups/Group.cpp:1993-2006`);
   `MSG_RAID_READY_CHECK_FINISHED` is empty (`GroupHandler.cpp:804-815`;
   wowm has no server form).
2. **Failing builder tests.** The client forms: `buildReadyCheckStart()`
   is empty; `buildReadyCheckAnswer(ready)` is one `u8` on
   `MSG_RAID_READY_CHECK` (`:790-794`), because the client
   `MSG_RAID_READY_CHECK_CONFIRM` is `Handle_NULL` with `STATUS_NEVER`
   (`Server/Protocol/Opcodes.cpp:1073`); `buildReadyCheckFinished()` is
   empty. The unit never builds a client CONFIRM.
3. **Failing store test.** A start sets `readyCheck = { initiator,
   startedAt, answers, ownAnswer, finishedAt }` and emits
   `ready_check_started`; a new start clears the answers. A confirm sets
   `ready`, `not_ready` or `offline` (state 0 for an offline member,
   which the store tells apart through the member's status in the `group`
   slice) and emits `ready_check_answer`. The finish sets `finishedAt` and
   emits `ready_check_finished` with the summary.
4. **Failing runtime test** (fake timers). `act.startReadyCheck()`,
   `act.answerReadyCheck(ready)` and `act.finishReadyCheck()` each send
   one packet. When the started check's initiator is self, the runtime
   sends the finish once every online member answered, or after 30 s,
   whichever comes first (AzerothCore has no timer; 30 s is Peon's choice,
   gap 5). A finish from the server first cancels the timer.
5. **Implement** the slice, `register` with `wire.on` for the three
   opcodes, and the acts. Delete the three `stubs` lines from
   `areas/raid/opcodes.ts`.
6. **Harness rules:** `ready_check_started` writes one `wake` row
   `ready_check` ("Tom starts a ready check."); `ready_check_answer`
   writes one `passive` row `ready_answer`; `ready_check_finished` writes
   one `passive` row `ready_done` with the counts and the names not ready.

**Proof (live):** A and B on `eversong10`, grouped, A the leader.
- Peon as initiator: `tmp/puppet-<A> call startReadyCheck`. Both traces
  hold `in MSG_RAID_READY_CHECK` (the server sends it to every member, the
  initiator too, `GroupHandler.cpp:787`). `tmp/puppet-<B> call
  answerReadyCheck '[true]'`: A's trace holds `in
  MSG_RAID_READY_CHECK_CONFIRM` (sent only to the leader and assistants,
  `Groups/Group.cpp:1982-1991`), and A's runtime sends the finish: both
  traces hold `MSG_RAID_READY_CHECK_FINISHED`.
- Peon as member: `tmp/puppet-<A> call setLeader '["<B>"]'`, then
  `tmp/puppet-<B> call startReadyCheck`, then `tmp/puppet-<A> call
  answerReadyCheck '[false]'`; B's trace holds the confirm with state 0.
- Offline answer: with B as leader, stop A's puppet, then run
  `tmp/puppet-<B> call startReadyCheck`. B's trace holds a confirm with
  state 0 for A, which the server sends for each offline member
  (`Groups/Group.cpp:1993-2006`).
- All three rows `live`.

**Commit:**

```
feat: Run and answer ready checks

A ready check was a stub, so Peon could neither start one nor answer.
The raid area now starts, answers and ends checks, and it ends its own
check when every member answered or after 30 s.
```

---

## Task group-7: Raid marks and pings

**Files:**
- Create: `areas/raid/store-marks.ts`
- Modify: `areas/raid/protocol.ts` and test, `areas/raid/store.ts` and
  test, `areas/raid/runtime.ts` and test, `areas/raid/area.ts`,
  `packages/core/test-support/areas/raid.ts`,
  `packages/harness/src/areas/raid/area.ts` and test,
  `packages/harness/src/puppet/calls.ts` (sorted keys `pingMinimap`,
  `requestRaidMarks`, `setRaidMark`), `docs/areas/raid.md`,
  `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** group-1.

**Opcodes:** `MSG_RAID_TARGET_UPDATE`, `MSG_MINIMAP_PING`.

**Steps:**

1. **Failing parser tests.** `MSG_RAID_TARGET_UPDATE` kind 0 is `u8 0`,
   `u64` who, `u8` icon, `u64` target (`Groups/Group.cpp:1830-1849`);
   kind 1 is `u8 1` then (`u8` icon, `u64` target) pairs for the set icons
   only, 0 to 8 pairs, read to the end of the packet (`:1851-1869`; wowm
   has a fixed 8, `raid/raid_target.wowm`). Fixtures with 0, 1 and 8
   pairs. `MSG_MINIMAP_PING` from the server is `u64` guid, `f32` x,
   `f32` y (`Server/Packets/MiscPackets.cpp:76-83`).
2. **Failing builder tests.** `buildRaidTargetUpdate(icon, guid)` is `u8`
   icon and `u64` guid; `buildRaidTargetRequest()` is `u8 0xFF` with no
   guid (`Handlers/GroupHandler.cpp:610-645`); `buildMinimapPing(x, y)` is
   `f32`, `f32` (`MiscPackets.cpp:70-74`).
3. **Failing store test.** The set form updates one slot and clears the
   same target from the other slots, as the server does
   (`Group.cpp:1835-1839`), and emits `raid_mark`; target `0n` clears the
   slot. The list form replaces all eight and emits `raid_marks`. A
   `group_list` change `disbanded` clears the marks. A ping emits
   `minimap_ping` with who, x and y.
4. **Failing runtime test.** `act.setRaidMark(icon, guid)`,
   `act.clearRaidMark(icon)`, `act.requestRaidMarks()` and
   `act.pingMinimap(x, y)` each send one packet. The icon index is 0-7.
5. **Implement** the slice, `register` with `wire.on` for both opcodes,
   and the acts.
6. **Harness rules:** `raid_mark` writes one `passive` row `mark`;
   `raid_marks` writes no row; `minimap_ping` writes one `passive` row
   `ping` with the distance and direction from the character. Icon names
   (star, circle, diamond, triangle, moon, square, cross, skull for 0-7)
   are client art, not in AzerothCore or wowm; the rule prints them and
   `docs/areas/raid.md` marks the order unconfirmed (design 5.13 "Risks").

**Proof (live):** A and B on `eversong10`, grouped. Pick a creature guid
from `tmp/puppet-<A> nearby --json`. `tmp/puppet-<A> call setRaidMark
'[7, "<guid>"]'`: both traces hold `in MSG_RAID_TARGET_UPDATE` kind 0,
the setter included (`Group.cpp:1848`). `tmp/puppet-<A> call
requestRaidMarks`: A's trace holds the kind-1 form (`GroupHandler.cpp:623-626`).
`tmp/puppet-<B> call pingMinimap '[<x>, <y>]'` with B's own position: A's
trace holds `in MSG_MINIMAP_PING`; the sender gets none
(`Groups/Group.cpp:2272-2280`). Both rows `live`.

**Commit:**

```
feat: Read raid marks and minimap pings

Group members mark targets and ping the map to show where to go, and
Peon dropped both. The raid area now reads, sets and clears marks and
sends pings.
```

---

## Task group-9a: `group` tool: status, kick and lead

**Files:**
- Create: `packages/harness/src/areas/raid/tool.ts`,
  `packages/harness/src/areas/raid/tool.test.ts`,
  `packages/harness/src/grader/scenarios/t9-raid-kick.json`
- Modify (shared, contract 2.6): `packages/harness/src/contract/result.ts`
  (append `"group"` to `ToolName`), `packages/harness/src/tools/registry.ts`
  (append `groupTool` to `GAME_TOOLS` and its import), `docs/harness.md`
  (append one tool-table row), `packages/harness/src/grader/scenarios.ts`
  (append to `ROUND_1`), `docs/capabilities.md`, `docs/evals.md` (the
  "Which scenarios to run" row for this unit)
- Modify: `packages/harness/src/areas/raid/area.ts` and test

**Depends on:** group-1, group-2, group-3, item6, T-10 (console check,
gap 4). The scenarios need one partner, so T-9a is not a dependency.

**Opcodes:** none new.

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. The parameter descriptions of step 1 are STE. A test checks that `minimalArgs` passes the tool's `parameters` schema.

1. **Failing tool tests** (`tool.test.ts`, the mock game, contract 1.9).
   The tool is `groupTool`, name `group`, kind `action` (D25). Parameters
   (TypeBox, STE descriptions): `do` (`status` default, `kick`, `lead`),
   `to` (a member name), `text` (the kick reason). Tests:
   - `status` reads `getPartyState()` and `handle.raid.state()`, sends
     nothing, and returns `DONE` with each member's name, subgroup,
     flags, health, power, dead or ghost, and "last seen Ns ago" for stale
     stats; out of a group it says "You are not in a group.";
   - `kick` refuses when Peon is not the leader or assistant, or when the
     name is not in the roster; else it calls `act.uninviteGuid` and
     returns `DONE` on a `group_list` change `left` for that name or
     `disbanded`, `FAILED` on a `command_result` refusal, and
     `UNCONFIRMED` after 3 s (the settle of `social.ts:52`);
   - `lead` wraps `setLeader` and settles on the legacy `leader_changed`;
   - `expectSendKind(groupTool)` passes (contract 1.9).
2. **Implement** the tool in `areas/raid/tool.ts`, then add `group` to
   `ToolName`, `GAME_TOOLS` and the `docs/harness.md` table. The tool text
   stays within the limits of `tools/registry.test.ts` (label, one or two
   guidelines, STE). Run `mise test packages/harness/src/tools/registry.test.ts`
   and `mise test packages/harness/src/prompt`.
3. **Scenario commit** `t9-raid-kick`: preset `eversong10`, `"partner":
   "partner"`, spawn `fairbreeze-east` (the builder picks a free slot),
   tier 9. The partner invites the agent and makes it leader, so the task
   text needs no partner name: `partnerActions` `call invite
   '["<AGENT>"]'` at `task_landed`, then `call setLeader '["<AGENT>"]'`
   after the agent joins (the builder sets the delays and windows). Task:
   "Join the group you are invited to. When you lead it, remove the other
   member with the reason 'test'." Checks: game log `raid/roster` or the
   legacy `group/disbanded` row; the console check `read group` matches
   "not in a group" (only after gap 4 is ruled); the session shows `group
   do=kick`. The same commit appends the id to `ROUND_1`, adds the
   `docs/capabilities.md` row "Remove a member with a reason" (known
   limit: a party of two disbands), and adds the row `| Groups and raids
   (\`group\` tool) | \`t9-raid-kick\` |` to "Which scenarios to run".

**Proof (eval):** `mise eval run t9-raid-kick --round <n>`; record the verdict in the
report and in `docs/areas/raid.md` under "Capabilities row". A fail goes
under "Not shown by any scenario" (D16).

**Commits:**

```
feat: Add the group tool with kick and lead

Group management is its own set of intents, and social is about talk.
The new group tool shows the roster and removes or promotes members.
```

```
test: Add the raid kick scenario

The group tool needs a live proof that the agent can remove a member.
The partner invites the agent and hands it the lead.
```

---

## Task group-9b: `group` tool: raid admin and loot rules

**Files:**
- Create: `packages/harness/src/areas/raid/tool-raid.ts` and test (the
  tool splits before 500 lines),
  `packages/harness/src/grader/scenarios/t9-raid-convert.json`
- Modify: `packages/harness/src/areas/raid/tool.ts` and test,
  `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (this unit's row)

**Depends on:** group-9a, group-4b.

**Opcodes:** none new.

**Steps:**

1. **Failing tool tests.** New `do` values `raid`, `move`, `swap`,
   `promote`, `loot_rules`, with parameters `group` (1-8), `with` (a
   second name), `what` (`assistant`, `main_tank`, `main_assist`, `on`,
   `off`; or a loot method name) and `quality` (`uncommon`, `rare`,
   `epic`). Local checks refuse before any send (design 5.13 "Verbs"):
   `raid` needs the leader and at least two members; `move` and `swap`
   need a raid and the leader or an assistant; `promote assistant` and
   `loot_rules` need the leader. Each verb settles on the matching
   `changes` entry through `act.awaitGroupChange` (3 s), else
   `UNCONFIRMED`. `raid` returns `FAILED` with `level_too_low` on the
   `command_result` `raid_disallowed_by_level`. `loot_rules` calls
   `handle.looting.act.setLootMethod` and settles on a `loot` change.
2. **Implement** in `tool-raid.ts` and wire the `do` values in
   `tool.ts`; update the tool text.
3. **Scenario commit** `t9-raid-convert`: as `t9-raid-kick` up to the
   lead. Task: "Join the group you are invited to. When you lead it, make
   it a raid, move the other member to group 2, and make them an
   assistant and main tank." Checks: game log `raid/roster` rows for the
   convert, the subgroup, the assistant flag and the main-tank flag; the
   console check `read group` matches "Raid" and 2 members (gap 4).
   Flags and subgroups have no truth field (design 5.13 "Needs the
   maintainer"). Same commit: `ROUND_1`, the `docs/capabilities.md` row
   "Run a raid: convert, subgroups, assistants, main tank and main
   assist" (known limit: every member must be level 10 or more), and the
   id added to this unit's "Which scenarios to run" row.

**Proof (eval):** `mise eval run t9-raid-convert --round <n>`; verdict recorded as in
group-9a. This is also the first live run of T-10's console source.

**Commits:**

```
feat: Run raids from the group tool

The raid area can convert, move and promote, and the agent had no verb
for it. The group tool now runs a raid and refuses what the server would
drop.
```

```
test: Add the raid convert scenario

The agent converts a group, moves a member and sets flags, and the
roster rows show each change.
```

---

## Task group-10a: `group` tool: ready checks

**Files:**
- Create: `packages/harness/src/areas/raid/tool-ready.ts` and test,
  `packages/harness/src/grader/scenarios/t9-raid-ready.json`,
  `packages/harness/src/grader/scenarios/t9-raid-answer.json`
- Modify: `packages/harness/src/areas/raid/tool.ts` and test,
  `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (this unit's row)

**Depends on:** group-9a, group-6.

**Opcodes:** none new.

**Steps:**

1. **Failing tool tests.** `ready_check` refuses unless Peon is the
   leader or an assistant, calls `act.startReadyCheck`, and returns `DONE`
   on `ready_check_started` from the server; it does not wait for the
   end (the runtime ends Peon's own check, group-6). `ready` with `what`
   `yes` or `no` calls `act.answerReadyCheck` and returns `REFUSED
   no_check` when no check is open.
2. **Implement** and update the tool text. One guideline names the
   answer: "Answer a ready check with `group do=ready`."
3. **Scenario commit** `t9-raid-ready`: the partner invites the agent
   and makes it leader; a partner action `call answerReadyCheck '[true]'`
   runs after the check starts (the builder sets the delay and window).
   Task: "Join the group you are invited to. When you lead it, run a ready
   check and tell me who is ready." Checks: game log `raid/ready_check`,
   `raid/ready_answer`, `raid/ready_done`; the session's final text names
   the partner as ready.
4. **Scenario commit** `t9-raid-answer`: the partner invites the agent
   and stays leader; a partner action `call startReadyCheck` runs after
   the agent joined. Task: "Join the group you are invited to and answer
   any ready check." Checks: the agent's game log `raid/ready_check` wake
   row, the session call `group do=ready`, and the witness: a final partner
   action `events --json` whose output shows the confirm from the agent
   with state 1. Whether the grader records a partner action's output
   could not be determined; if it does not, the builder uses the agent's
   packet trace (`out MSG_RAID_READY_CHECK`, one byte, N18) and reports
   the gap to the coordinator.
5. Both commits append to `ROUND_1` and add the `docs/capabilities.md`
   row "Run and answer ready checks" (known limit: Peon ends its own
   checks after 30 s) and the ids in this unit's evals row.

**Proof (eval):** `mise eval run t9-raid-ready --round <n>` and `mise eval run
t9-raid-answer --round <n>`; verdicts recorded.

**Commits:**

```
feat: Run ready checks from the group tool

The raid area runs and answers ready checks, and the agent had no verb
for them. The group tool starts a check and answers one.
```

```
test: Add the raid ready check scenario

The agent leads a group, runs a ready check and reports who is ready.
```

```
test: Add the ready check answer scenario

The partner leads and starts a check, and the agent must answer it.
```

---

## Task group-10b: `group` tool: marks and pings

**Files:**
- Create: `packages/harness/src/areas/raid/tool-marks.ts` and test,
  `packages/harness/src/grader/scenarios/t9-raid-mark.json`
- Modify: `packages/harness/src/areas/raid/tool.ts` and test,
  `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (this unit's row)

**Depends on:** group-9a, group-7.

**Opcodes:** none new.

**Steps:**

1. **Failing tool tests.** `mark` resolves `target` (a unit id such as
   `u3`) to a guid and `what` (an icon name or `clear`) to an index,
   refuses in a raid unless Peon is the leader or an assistant
   (`Handlers/GroupHandler.cpp:628-629`), refuses a hostile player target
   (`:635-641`), calls `act.setRaidMark` or `act.clearRaidMark`, and
   returns `DONE` on the `raid_mark` echo, else `UNCONFIRMED` after 3 s.
   `ping` sends the position of `target` or of the character and returns
   `DONE` on send, because the sender gets no echo.
2. **Implement** and update the tool text. One guideline: "Mark the kill
   target with skull before a pull."
3. **Scenario commit** `t9-raid-mark`: the partner invites the agent.
   Task: "Join the group you are invited to. Put a skull on the nearest
   Springpaw Lynx and tell the group in party chat." Checks: game log
   `raid/mark`; the partner's `read --json` shows the party chat; the
   witness shows the mark on the partner's side (as in group-10a, step 4).
   Same commit: `ROUND_1`, the `docs/capabilities.md` row "Mark targets"
   (known limit: icon names are unconfirmed), the id in this unit's
   evals row. Ping gets no scenario: it has no echo and no truth (design
   5.13 area design, section 4).

**Proof (eval):** `mise eval run t9-raid-mark --round <n>`; verdict recorded.

**Commits:**

```
feat: Mark targets and ping from the group tool

Marks tell the group what to kill first, and the agent could not set
them. The group tool now marks and pings.
```

```
test: Add the raid mark scenario

The agent marks a creature with skull, and the partner sees the mark.
```

---

## Task group-10c: `group` tool: give, pass and roll

**Files:**
- Create: `packages/harness/src/areas/raid/tool-loot.ts` and test,
  `packages/harness/src/grader/scenarios/t9-raid-master-loot.json`
- Modify: `packages/harness/src/areas/raid/tool.ts` and test,
  `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (this unit's row)

**Depends on:** group-9b, group-5.

**Opcodes:** none new.

**Steps:**

1. **Failing tool tests.**
   - `give` needs master loot with Peon as master: it opens the corpse
     `target`, finds the slot of the item named in `what` through the
     handle's loot reads (`SMSG_LOOT_RESPONSE`, `protocol/loot.ts:10-18,62`),
     checks that `to` is a candidate, calls
     `handle.looting.act.giveMasterLoot`, releases the loot, and returns
     `DONE` when the slot is removed, `FAILED` with the loot error name,
     or `REFUSED` for no master loot or a name that is not a candidate.
   - `pass_loot` with `what` `on` or `off` calls `setPassOnLoot` and says
     the change is requested, because the server sends no reply.
   - `roll` with `what` `need`, `greed` or `pass` answers the open group
     roll through the handled `rollLoot` (`client.ts:293`), which no tool
     calls today (design 5.13 "Verbs"); `REFUSED no_roll` when none is
     open.
2. **Implement** and update the tool text.
3. **Scenario commit** `t9-raid-master-loot`: the partner invites the
   agent and makes it leader. Task: "Join the group you are invited to.
   When you lead it, set master loot with yourself as looter, kill one
   Springpaw Lynx and give its item to yourself." Budget allows three
   kills, because a corpse may drop no item. Checks: game log `raid/roster`
   loot change and `looting/master_loot`; truth inventory item delta +1.
   Same commit: `ROUND_1`, the `docs/capabilities.md` row "Set loot rules
   and give master loot" (known limit: needs a corpse with an item), and
   the id in this unit's evals row.

**Proof (eval):** `mise eval run t9-raid-master-loot --round <n>`; verdict recorded.
`pass_loot` and `roll` get no scenario: `pass_loot` has no reply, and a
group roll needs an uncommon drop, which is chance. Their unit tests and
group-4a's accepted send are the proof.

**Commits:**

```
feat: Give loot and roll from the group tool

A group with master or group loot needs a looter who gives items and
members who roll. The group tool now gives, rolls and opts out.
```

```
test: Add the master loot scenario

The agent sets master loot, kills a creature and gives the item to
itself, which the inventory truth shows.
```

---

## Task group-8: Summons

**Files:**
- Create: `areas/raid/store-summon.ts`
- Modify: `areas/raid/protocol.ts` and test, `areas/raid/store.ts` and
  test, `areas/raid/runtime.ts` and test, `areas/raid/area.ts`,
  `areas/raid/opcodes.ts` (`unseen`), `packages/core/test-support/areas/raid.ts`,
  `packages/harness/src/areas/raid/area.ts` and test,
  `packages/harness/src/puppet/calls.ts` (sorted key `answerSummon`),
  `docs/areas/raid.md`, `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** SEED-3 (wave 3), group-1.

**Opcodes:** `SMSG_SUMMON_REQUEST`, `CMSG_SUMMON_RESPONSE`.

**Steps:**

1. **Failing parser and builder tests.** `raidSummonRequestBody` writes
   `u64` summoner, `u32` zone id, `u32` timeout in ms
   (`Spells/SpellEffects.cpp:4442-4447`). `buildSummonResponse(summoner,
   accept)` writes `u64`, `u8` (`Handlers/MovementHandler.cpp:870-890`).
2. **Failing store test** (fake timers). A request sets `summon` with
   `expiresAt = now + timeout` and emits `summon_requested`; at
   `expiresAt` the runtime clears it and the store emits
   `summon_expired` (120 s, `Entities/Player/Player.h:923`). This is an
   R22 mock proof through `areaRig("raid")`.
3. **Failing runtime test.** `act.answerSummon(accept)` sends one packet
   with the stored summoner and clears the request; it throws `no_summon`
   when none is pending. The expiry timer lives in the runtime, which
   calls a store method (contract 1.2).
4. **Implement** and wire `SMSG_SUMMON_REQUEST` with `wire.on`.
5. **Harness rules:** `summon_requested` writes one `wake` row `summon`
   ("Tom summons you to <zone>. Answer within 120 s.").
6. **Opcodes.** `unseen: ["SMSG_SUMMON_REQUEST"]` until group-11 sees it
   live.

**Proof:**
- `SMSG_SUMMON_REQUEST` `mock`, "not seen live", with the writer
  `Spells/SpellEffects.cpp:4442-4447`. No preset has a warlock
  (`packages/factory/src/soap-presets.ts:13-58`), and a meeting stone
  needs the `objects` use act (`Entities/GameObject/GameObject.cpp:1902-1928`).
- `CMSG_SUMMON_RESPONSE` `accepted`: one `eversong10` account,
  `tmp/puppet-<A> call answerSummon '[true]'` fails locally with
  `no_summon`, so the live send goes through `tmp/puppet-<A> raw
  CMSG_SUMMON_RESPONSE <guid hex>01` (T-7c). The server ignores a response
  with no pending summon (`Entities/Player/Player.cpp:12694-12695`); the
  evidence is the `out` row and no disconnect.

**Commit:**

```
feat: Receive and answer summons

A summon offer expires after two minutes, and Peon dropped it. The raid
area now holds the offer until it expires and answers it.
```

---

## Task group-11: `group` tool: summon

**Files:**
- Create: `packages/harness/src/grader/scenarios/t9-raid-summon.json`
- Modify: `packages/harness/src/areas/raid/tool.ts` and test (or a
  `tool-<part>.ts` sibling), `areas/raid/opcodes.ts` (remove
  `SMSG_SUMMON_REQUEST` from `unseen` when seen live),
  `packages/harness/src/puppet/calls.ts` (a sorted key for the
  meeting-stone use, only if the `objects` act needs one),
  `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (this unit's row),
  `docs/areas/raid.md`, `docs/protocol-coverage/raid.md` (regenerated)

**Depends on:** group-8, group-9a, objects-2 (the object use act).

**Opcodes:** none new; it moves `SMSG_SUMMON_REQUEST` from `mock` to
`live` if the live run shows it.

**Steps:**

1. **Failing tool tests.** `summon` with `what` `accept` or `decline`
   answers the pending request. It returns `REFUSED` when none is
   pending, in combat or dead, because the server drops those silently
   (`Handlers/MovementHandler.cpp:872-873`). Accept returns `DONE` on the
   teleport (a new world port or a position jump) within 5 s; decline
   returns `DONE` at once.
2. **Implement** and update the tool text.
3. **Live staging for the proof.** A meeting stone casts spell 23598 on
   the user's selected target in the same group
   (`Entities/GameObject/GameObject.cpp:1902-1928`). The builder picks a
   meeting stone from AzerothCore base data (`gameobject_template` type
   23) that a staged character can use; its id and level range could not
   be determined while planning. Worker proof: B stands at the stone
   (`mise factory soap gm <B> tele <tele>`), A stays at the Eversong
   spawn, B selects A and uses the stone through the `objects` act; A's
   trace holds `in SMSG_SUMMON_REQUEST`, and `call answerSummon '[true]'`
   moves A. If no usable stone exists, the row stays `mock` and the
   builder reports it.
4. **Scenario commit** `t9-raid-summon`: the partner invites the agent,
   stands at the stone (offline `setup` position endpoint, never `soap gm`
   inside an eval) and uses it on the agent through a partner action.
   Task: "Join the group you are invited to and accept any summon."
   Checks: game log `raid/summon`; truth position near the partner. Same
   commit: `ROUND_1`, the `docs/capabilities.md` row "Answer a summon"
   (known limit: needs a meeting stone or a warlock), the id in this
   unit's evals row.

**Proof (eval):** `mise eval run t9-raid-summon --round <n>`; verdict recorded. If the
stone staging fails, the scenario is not added, the bullet goes under
"Not shown by any scenario" with the gap (D16), and the builder reports.

**Commits:**

```
feat: Answer summons from the group tool

A summon saves a long walk, and the agent could not answer one. The group
tool now accepts or declines a pending summon.
```

```
test: Add the raid summon scenario

The partner uses a meeting stone on the agent, and the agent accepts.
```

---

## Opcode map

Every relevant opcode of the unit is in exactly one task.

| Opcode | Code area | Task | Proof |
|---|---|---|---|
| `SMSG_LOOT_LIST` | looting | group-4a | live |
| `CMSG_OPT_OUT_OF_LOOT` | looting | group-4a | builder (sent live, effect not seen) |
| `CMSG_LOOT_METHOD` | looting | group-4b | live |
| `CMSG_REQUEST_PARTY_MEMBER_STATS` | raid | group-2 | live |
| `CMSG_GROUP_RAID_CONVERT` | raid | group-3 | live |
| `CMSG_GROUP_CHANGE_SUB_GROUP` | raid | group-3 | live |
| `CMSG_GROUP_SWAP_SUB_GROUP` | raid | group-3 | live |
| `CMSG_GROUP_ASSISTANT_LEADER` | raid | group-3 | live |
| `MSG_PARTY_ASSIGNMENT` | raid | group-3 | live |
| `CMSG_GROUP_UNINVITE_GUID` | raid | group-3 | live |
| `SMSG_LOOT_MASTER_LIST` | looting | group-5 | live |
| `CMSG_LOOT_MASTER_GIVE` | looting | group-5 | live |
| `MSG_RAID_READY_CHECK` | raid | group-6 | live |
| `MSG_RAID_READY_CHECK_CONFIRM` | raid | group-6 | live |
| `MSG_RAID_READY_CHECK_FINISHED` | raid | group-6 | live |
| `MSG_RAID_TARGET_UPDATE` | raid | group-7 | live |
| `MSG_MINIMAP_PING` | raid | group-7 | live |
| `SMSG_SUMMON_REQUEST` | raid | group-8 (live in group-11) | mock |
| `CMSG_SUMMON_RESPONSE` | raid | group-8 | accepted |

Body gaps of handled opcodes: `SMSG_GROUP_LIST` and `SMSG_GROUP_INVITE`
(group-1), `SMSG_PARTY_MEMBER_STATS` and `SMSG_PARTY_MEMBER_STATS_FULL`
(group-2).

Two rows are live in one direction only. The client direction of
`MSG_RAID_READY_CHECK_CONFIRM` is `Handle_NULL` with `STATUS_NEVER`
(`Server/Protocol/Opcodes.cpp:1073`), so no task builds a client CONFIRM.
The server never sends `MSG_PARTY_ASSIGNMENT` (no send site in
AzerothCore), so no task builds a parser for it.

## Dead opcodes

| Opcode | Code area | Reason |
|---|---|---|
| `CMSG_GROUP_CANCEL` 0x070 | raid | AzerothCore maps it to `Handle_NULL` (`Server/Protocol/Opcodes.cpp:243`); the server ignores it. group-1 writes its `dead` row. |
| `SMSG_REAL_GROUP_UPDATE` 0x397 | raid | `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:1050`) and no send site in `src/` or `modules/`; wowm has no definition. group-1 writes its `dead` row. |
| `SMSG_LOOT_ITEM_NOTIFY` 0x164 | looting | `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:487`) and no send site; wowm has no definition. group-4a writes its `dead` row. |

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision of
this unit that a wave-1 task meets, before `SEED-1`. The wave-1 tasks of
this unit are `group-4a` and `group-4b` (phase A). The five numbered
contract gaps of "Leases this unit needs" (the `client-social.ts` lease,
`protocol/enums.ts`, the `conn.partyMembers` fold, the console check in an
eval, the ready-check finish timer) and the lease rows of `group-1` and
`group-2` are met only by wave-2 and wave-3 tasks, so they are left for
`SEED-2` and `SEED-3`. Facts marked [M] were read in this worktree or on
`origin/factory/426-protocol-coverage` at `c4acbbe7`. Each ruling is **not
yet ruled by the maintainer**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-group-1 | Lease row: "group-4a \| harness `tools/loot.ts` and test \| skip a corpse whose owner is someone else"; plan "Leases": `tools/loot.ts` `group-4a (A) → self-state-10b (C)` (`group-4a`) | The lease goes as the plan "Leases" table queues it: `group-4a` holds `packages/harness/src/tools/loot.ts` from `SEED-1`. A lease on a legacy file also covers its colocated test file of the same stem (`loot.test.ts`) and nothing else, as SR1-threat-7 states. The D13 rider (`LootAfter` in `contract/details.ts`, the views in `contract/views.ts`) is not used: `group-4a` changes neither type. When `group-4a` lands, the lease goes to `self-state-10b` | accepted by the maintainer (P2-5) |
| SR1-group-2 | Step 8: "The builder first checks whether the corpse choice already filters on the per-viewer lootable flag (`tools/loot.ts:40,58`). If the server never marks another player's corpse lootable for Peon, the owner check adds nothing: the builder then drops this step" (`group-4a`) | The check is done here, and step 8 is dropped. AzerothCore clears `UNIT_DYNFLAG_LOOTABLE` for each viewer that `isAllowedToLoot` refuses (`Entities/Unit/Unit.cpp:16563-16564` [M]). Solo, only the loot recipient may loot (`Entities/Player/PlayerStorage.cpp:5790-5791` [M]), and the solo form of `SMSG_LOOT_LIST` gives `mine: "unknown"`, so the owner check never skips there. In a group under round robin, a player who is not the looter may still loot a quest item for him (`PlayerStorage.cpp:5800-5806` [M]), so a skip on `mine: "no"` refuses loot the server allows. The `loot` tool therefore keeps its choice on the `lootable` flag and does not change; `loot.ts` and `loot.test.ts` stay as they are, and the builder reports that the lease was not used. This ruling stands in for the sentence of design 5.13 "Verbs" ("The `loot` tool skips a corpse that `loot_owner` gives to someone else"); the coordinator rewords that sentence at wave integration. The lease is still held by `group-4a` and handed on as SR1-group-1 says. The rerun of `t3-ghostlands-kill` stays (SR1-group-8), because `group-4a` adds an owner for a packet that arrives on every kill | accepted by the maintainer (P2-5) |
| SR1-group-3 | "T-7a for the calls key (if T-7a has not landed, the opt-out live send uses the probe flow instead)"; proof `tmp/puppet-<ACCOUNT> call setPassOnLoot '[true]'` (`group-4a`) | T-7a has landed (`c4acbbe7` [M]), so the fallback clause does not apply to the calls key. The landed `ArgKind` is `"string" \| "guid" \| "number" \| readonly string[]` and has no boolean [M, `puppet/calls.ts`]; adding a kind is not a sorted-key edit (contract 2.6). So the sorted key is `setPassOnLoot: { args: [["off", "on"]], run: (h, a) => h.looting.act.setPassOnLoot(a[0] === "on") }`, and the call is `tmp/puppet-<ACCOUNT> call setPassOnLoot '["on"]'`. The act is synchronous: it sends one packet and returns, so a thrown error reaches the puppet as `ok: false` | accepted by the maintainer (P2-5) |
| SR1-group-4 | Proof of `CMSG_OPT_OUT_OF_LOOT`: "start its puppet ... The trace holds the `out` row"; `group-4a` depends on T-7a but not on T-7c, which adds `start --packet-trace` (`group-4a`) | The live send runs in the same probe run as the kill: `mise protocol:probe <ACCOUNT> --flow looting-kill --send CMSG_OPT_OUT_OF_LOOT --body 01000000 --expect SMSG_LOOT_LIST`. The probe runs its steps in command-line order [M, `probe-run.ts`]. Evidence: the `out` row in the probe's `packets.jsonl`, the send in the report's `counts.sent` (GR-19), exit 0, and no `error` field in the report (no disconnect). If T-7c has landed when `group-4a` runs, the builder may add the puppet run of SR1-group-3 with `--packet-trace headers`; the probe run alone is enough. The row stays `builder` with "sent live, effect not seen" (SR1-group-12) | accepted by the maintainer (P2-5) |
| SR1-group-5 | Found while ruling SR1-group-3: the landed T-7a test "names only functions on the game handle" checks `typeof game[method] === "function"` for every key [M, `puppet/calls.test.ts`], and an area act lives at `handle.<area>.act.<act>` (contract 1.6 `client.ts` row), so the keys `setPassOnLoot` and `setLootMethod` fail a test that the `group` unit does not own (`group-4a`, `group-4b`) | Before `group-4a` starts, the coordinator changes that one test in a `COORD-<n>` commit: each key names a function on the mock handle, or an act of the area handle of one name in `AREA_NAMES` (`game[area].act[key]`). This covers every unit that adds an area act as a puppet call. In the same commit the coordinator checks that `createMockGame()` (`packages/harness/test-support/mock-game.ts`) exposes the area handles with their inert acts, and adds them if it does not; contract 1.8 describes the spread for core's mock handle only. If neither is in place when `group-4a` starts, the builder stops `blocked` (contract 0.9) and names the file | accepted by the maintainer (P2-5) |
| SR1-group-6 | Step 9, the probe flow `looting-kill` (`group-4a`) | SR1-threat-6 and SR1-threat-10 apply as written. The flow is `packages/devtools/src/probe-flows/looting-kill.ts` and exports `flow: ProbeFlow = { name: "looting-kill", usage, run }`; it may import `#tools/probe-flows` (`others`, `entityType`) as `nearest.ts` does. `settle` gives up after 5 s, so the wait for the kill is the flow's own poll loop with `Bun.sleep`, and the run passes a `--wait` long enough for the fight. A test `probe-flows/looting-kill.test.ts` is allowed and owned (contract 2.5). The `COORD-<n>` change of `probe-flows.test.ts` from SR1-threat-10 must be in place first; under the pilot rule `threat-1` lands before `group-4a`, so it is expected to be there. If it is not, `group-4a` stops `blocked` as SR1-threat-10 says | accepted by the maintainer (P2-5) |
| SR1-group-7 | Step 5: "An `entity` event that removes the creature (`ctx.listen("entity", ...)`) calls `forget`" (`group-4a`) | `entity` is a key of `CoreEvents` (today's `WorldEvents`, `world-events.ts:22` [M]; contract 1.6). The removal event is `{ type: "disappear", guid }` (`entity-store.ts:88-92` [M]). The runtime calls `forget(guid)` on `disappear` for a guid the store holds, and on no other event type | accepted by the maintainer (P2-5) |
| SR1-group-8 | Proof: "run `mise eval run t3-ghostlands-kill --round <n>` and record the verdict against the R0 baseline" (`group-4a`) | The round is 11 (a task's own runs in phase A, contract 3.6). It is the first run of that scenario in round 11 in `proto-group`, so it has no `--replica`; the replicas of SR1-threat-8 are in `proto-threat`. The D17 gates of contract 3.6 apply | accepted by the maintainer (P2-5) |
| SR1-group-9 | Unit files: "`areas/looting/opcodes.ts`, `areas/looting/area.ts` \| `SEED-1` (wave 1, N22)"; step 10: "`dead: ["SMSG_LOOT_ITEM_NOTIFY"]` if the seed left it out" (`group-4a`, `group-4b`) | `SEED-1` seeds `looting` in wave 1: core `areas/looting/opcodes.ts` with `owns` of the six rows of the opcode map and "Dead opcodes" (`SMSG_LOOT_LIST`, `CMSG_OPT_OUT_OF_LOOT`, `CMSG_LOOT_METHOD`, `SMSG_LOOT_MASTER_LIST`, `CMSG_LOOT_MASTER_GIVE`, `SMSG_LOOT_ITEM_NOTIFY`), core `areas/looting/area.ts`, the core and harness registry keys, and harness `areas/looting/area.ts`. The seed leaves `uses`, `dead` and `unseen` empty; `group-4a` writes `dead` and `unseen`, as contract 2.5 gives the unit. No `raid` file is seeded before `SEED-2` | accepted by the maintainer (P2-5) |
| SR1-group-10 | `group-4b` step 3: the act `setLootMethod({ method, threshold, master })` takes names; the proof calls `tmp/puppet-<A> call setLootMethod '["master_loot", "uncommon", "<A>"]'` (`group-4b`) | The sorted key is `setLootMethod` with `args: [<method names>, <threshold names>, "string"]`, the name tables of step 3 in their numeric order; `run` calls `h.looting.act.setLootMethod({ method, threshold, master })`, with an empty third string meaning no master (the act sends `0n`). The act is synchronous, as SR1-group-3 says. The method and threshold name tables live in `areas/looting/protocol.ts`; the area does not import `LOOT_METHODS` from `party-store.ts` (contract 1.12 allows the `PartyState` type only) | accepted by the maintainer (P2-5) |
| SR1-group-11 | `group-4b` depends on T-7a, T-7b and T-7c; its proof needs `events --json`, `start --packet-trace headers` and a negative send with threshold 1, which the act refuses before any send (step 3) (`group-4b`) | T-7b and T-7c are not on `origin` at `c4acbbe7` [M], so `group-4b` does not start until both land; no probe fallback is added. The negative send uses T-7c's raw verb: `tmp/puppet-<A> raw CMSG_LOOT_METHOD 03000000000000000000000001000000` (group loot, master `0`, threshold 1). The server returns without a reply for a threshold below uncommon (`Handlers/GroupHandler.cpp:535-536` [M]); the evidence is the `out` row, no `SMSG_GROUP_LIST` after it, and the puppet still in the world | accepted by the maintainer (P2-5) |
| SR1-group-12 | Decisions in the task bodies: the design's `group-4` is split into `group-4a` and `group-4b`; `setPassOnLoot` sets `passOnLoot` on send ("requested") because the server sends no reply; the `builder` proof row and `unseen` for `CMSG_OPT_OUT_OF_LOOT` (`group-4a`, `group-4b`) | All three stand. Contract 0.10 allows the split. AzerothCore sends no reply to `CMSG_OPT_OUT_OF_LOOT` (`Handlers/GroupHandler.cpp:1143-1152`), so the flag records the request. The proof row follows the contract 0.6 row "A client opcode with a real effect that no worker can make visible" | accepted by the maintainer (P2-5) |

## Seed rulings (SEED-2)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-2 task meets, before `SEED-2`. The wave-2 tasks of this unit are group-1, group-2, group-3, group-5, group-6, group-7, group-9a, group-9b, group-10a, group-10b and group-10c (phase B). Each ruling is a coordinator ruling (P2-17). Rows marked "for the maintainer's review" answer a design question with the recommended answer of the draft.

A task's own eval runs use the round number the coordinator gives in its build prompt (SEED2-1). Wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). `origin/factory/426-protocol-coverage` in this file means `origin/factory/431-wave2` for part 2 (SEED2-6). Paths without a prefix are under `packages/core/src/wow/` (core), `packages/harness/src/` (h:) or `packages/devtools/src/` (dev:); AzerothCore paths are relative to `src/server/game/` in `/home/deity/code/azerothcore-wotlk-playerbots` unless they start with `src/`, `data/` or `modules/`. Facts marked [M] were measured in this worktree or in AzerothCore; [INFERENCE] marks what was not observed.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR2-group-1 | `group.md:73`: "`areas/raid/opcodes.ts`, `areas/raid/area.ts` \| `SEED-2` (the unit fills `uses`, `dead`, `unseen` and removes the three ready-check stub lines)"; `group.md:41-46` (raid owns 14 relevant and 2 dead rows). Task group-1 (first task of `raid`). | `SEED-2` writes `RAID_OPCODES.owns` with all 16 rows of the unit's opcode map over every wave (SEED-1 record: "the seed writes each area's owns from the unit files' per-task opcode lines over all waves"): `CMSG_REQUEST_PARTY_MEMBER_STATS`, `CMSG_GROUP_RAID_CONVERT`, `CMSG_GROUP_CHANGE_SUB_GROUP`, `CMSG_GROUP_SWAP_SUB_GROUP`, `CMSG_GROUP_ASSISTANT_LEADER`, `MSG_PARTY_ASSIGNMENT`, `CMSG_GROUP_UNINVITE_GUID`, `MSG_RAID_READY_CHECK`, `MSG_RAID_READY_CHECK_CONFIRM`, `MSG_RAID_READY_CHECK_FINISHED`, `MSG_RAID_TARGET_UPDATE`, `MSG_MINIMAP_PING`, `SMSG_SUMMON_REQUEST`, `CMSG_SUMMON_RESPONSE` (wave 3, group-8), `CMSG_GROUP_CANCEL`, `SMSG_REAL_GROUP_UPDATE`. All 16 exist in `protocol/opcodes.ts`, none is owned by another area, none is named in non-test core code [M, `grep`]. `uses` and `unseen` stay empty at the seed (the `looting` seed precedent, SR1-group-9). | coordinator ruling (P2-17) |
| SR2-group-2 | `group.md:534`: "`dead: [...]` if the seed left them out" (group-1 step 9); plan index "Dead opcodes" (`plan.md:589-595`): "Each goes into its code area's `dead` list at the seed". | The seed writes `dead: ["CMSG_GROUP_CANCEL", "SMSG_REAL_GROUP_UPDATE"]` (as SR1-quests-12 did for quests). group-1 checks the line and writes only the two `dead` proof rows in `docs/areas/raid.md`. `SMSG_LOOT_ITEM_NOTIFY` is already dead in `looting` (SEED-1). | coordinator ruling (P2-17) |
| SR2-group-3 | `group.md:73` and group-6 step 5 (`group.md:853-855`) both remove the three ready-check stub lines. | Split: `SEED-2` moves `[MSG_RAID_READY_CHECK, "Ready check"]`, `[MSG_RAID_READY_CHECK_CONFIRM, "Ready check confirm"]`, `[MSG_RAID_READY_CHECK_FINISHED, "Ready check finished"]` from `protocol/stubs.ts:13-15` into `RAID_OPCODES.stubs` with the same labels (the frozen-stub test keeps its pairs through `areaStubs()`). group-6 deletes them from `RAID_OPCODES.stubs` when `wire.on` registers the three opcodes (contract 2.5). group-1 touches no stub line. | coordinator ruling (P2-17) |
| SR2-group-4 | `group.md:199-200` (lease row) and plan "Leases" row `core: world-handlers-group.ts \| group-1 (B) → group-2 (B)`; task lists `world-handlers-group.test.ts`. | `world-handlers-group.ts` does not exist [M, `ls`]. `handleGroupInviteReceived`, `handleGroupListMsg` and `handlePartyMemberStatsMsg` live in `world-handlers.ts:93-163` (163 lines) and the test file is `world-handlers-group.test.ts` (364 lines). The lease therefore covers `world-handlers.ts` and, by name, `world-handlers-group.test.ts` (its stem differs, so the colocated-test clause of contract 2.7 does not reach it). Drop the `world-handlers-group.ts` row of the plan table; add the test file to the `world-handlers.ts` row. Chain unchanged: group-1 → group-2. | coordinator ruling (P2-17) |
| SR2-group-5 | `group.md:206-210` (gap 1: `client-social.ts` lease) and `group.md:200-201`. | Granted as written: the plan table already has `core: client-social.ts \| group-2 (B) → guild-2 (D)`. group-2 edits `getPartyState` only (`client-social.ts:73-80` region; the file has 237 non-blank lines). Nothing to reorder. | coordinator ruling (P2-17) |
| SR2-group-6 | `group.md:211-218` (gap 2): "`protocol/enums.ts` is not leased … group-3 asks for a `COORD-<n>` commit that fixes `enums.ts`". | Moot. `PartyOperation.SWAP` is `0x03` (`protocol/enums.ts:110`) where AzerothCore has 4 (`Server/WorldSession.h:254-259`), and `PartyResult` stops at 13 (`enums.ts:91-104`; AzerothCore goes to 30, `src/server/shared/SharedDefines.h:3958-3990`). No code reads either constant outside tests [M, `grep 'PartyOperation\.\|PartyResult\.'`]. No `COORD` commit is made and `enums.ts` keeps its plan queue (`social-5b (D)`). group-3 builds its complete tables in `areas/raid/names.ts` only, as the task says. | coordinator ruling (P2-17) |
| SR2-group-7 | `group.md:219-220` (gap 3): `conn.partyMembers` folds into `PartyStore` by a `COORD-<n>` commit. | Not done in wave 2. `conn.partyMembers` still exists (`world-conn.ts`, `world-handlers.ts:113-125`, `client-social.ts`); no wave-2 task depends on the fold; group-1 keeps filling both. Revisit only if a later unit needs it. | coordinator ruling (P2-17) |
| SR2-group-8 | `group.md:221-226` (gap 4, console check in an eval) and `group.md:1008-1011` (`t9-raid-kick` check), `group.md:1072-1073` (`t9-raid-convert`). Tasks group-9a, group-9b. | Moot: T-10 landed. `ConsoleVerb` holds `"group"` (`grader/scenarios.ts:71`), `readConsole` runs `soap gm <ACCOUNT> read group` on the grader side (`grader/console-read.ts:30-38`), which docs/factory.md allows (only staging is forbidden inside an eval). Scenarios use `{"source":"console","evidence":{"console":{"read":"group","match":"..."}}}`. The console prints `Type: Raid\|Party` and the member count (`src/server/scripts/Commands/cs_group.cpp:224`, `LANG_GROUP_TYPE`) or `LANG_GROUP_NOT_IN_GROUP` (`cs_group.cpp:220`); builders confirm the exact text live before pinning `match`. | coordinator ruling (P2-17) |
| SR2-group-9 | `group.md:227-231` (gap 5, "the 30 s a Peon choice"); group-6 step 4 (`group.md:847-852`). | Accept as written. AzerothCore has no timer: the finish is sent only on a client request from the leader or an assistant (`Handlers/GroupHandler.cpp:804-815`), and the real client's 30 s countdown is what sends it. The timer lives in `raidRuntime`; it starts only when the check's initiator is self; a server `MSG_RAID_READY_CHECK_FINISHED` cancels it. Recommended answer: accept. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-group-10 | group-6 step 4 (`group.md:849-850`): "sends the finish once every online member answered". | Concrete counting rule, from AzerothCore: the initiator never sends an answer (the server broadcasts the start to everyone, the initiator included, `GroupHandler.cpp:786-787`, and builds a CONFIRM only from client answers, `:790-800`); confirms reach only the leader and assistants (`Groups/Group.cpp:1982-1991`); for each offline member the server sends a state-0 CONFIRM at the start (`Group.cpp:1993-2006`). So "every online member answered" = every member whose `status & 0x01` is set in the `group` slice, minus the initiator, has a confirm. Members already `offline` need no answer. A check whose initiator is another player runs no timer. Answers that arrive with no open check (the server keeps no state and still relays them, `GroupHandler.cpp:790-800`) are ignored by the store and emit nothing. | coordinator ruling (P2-17) |
| SR2-group-11 | `group.md:659-662`, `:714-716`, `:864-871`, `:898-899`, `:942`; group-3, 6, 7 and group-10a scenario argv. Puppet keys take booleans (`setAssistant '["<B>", true]'`, `answerReadyCheck '[true]'`) and floats (`pingMinimap '[<x>, <y>]'`). | `puppet/calls.ts` has no boolean and no float kind, and a new kind is not a sorted-key edit (SR1-group-3 ruled the same). Keys, sorted insertions only, each key equal to an act of `handle.raid.act` (so `calls.test.ts:72-88` passes unchanged): `requestMemberStats` `["string"]`; `convertToRaid` `[]`; `moveToSubgroup` `["string","number"]` (0-7 on the wire, `GroupHandler.cpp:672-707`); `swapSubgroups` `["string","string"]`; `setAssistant`, `setMainAssist`, `setMainTank` `["string", ["off","on"]]`; `uninviteGuid` `["string","string"]`; `startReadyCheck` `[]`; `answerReadyCheck` `[["no","yes"]]`; `finishReadyCheck` `[]`; `setRaidMark` `["number","guid"]` (icon 0-7; guid `"0"` clears, because `Group::SetTargetIcon` stores the guid as given, `Group.cpp:1841`, so `clearRaidMark` needs no key); `requestRaidMarks` `[]`; `pingMinimap` `["number","number"]` (integer world yards; the wire float carries any integer exactly; the proof passes B's rounded position). Every proof line and scenario argv that says `true`/`false` uses `"on"`/`"off"` or `"yes"`/`"no"`; `'[<x>, <y>]'` stays integers. | coordinator ruling (P2-17) |
| SR2-group-12 | `group.md:702-703` (runtime: "a name not in `ctx.legacy.party()` throws `not in your party`") and the group-3 proof `call swapSubgroups '["<A>", "<B>"]'` (`group.md:715`), where A is the caller. | The server never lists the receiving player in `SMSG_GROUP_LIST` (`Groups/Group.cpp:1917-1918`, `if (slot->guid == citr->guid) continue;`), so `ctx.legacy.party().members` never holds the caller; areas have no source for the caller's own name (`AreaRuntimeCtx` has `selfGuid()` only; `CoreStores.self` has no name). Ruling: raid acts name other members. A call that names the caller throws `not in your party` and `docs/areas/raid.md` "Left out" says so (as `docs/areas/looting.md:64-67` does for the master looter). The group-3 live proof uses a third account: A leads, B and C join, and `call swapSubgroups '["<B>", "<C>"]'` swaps two members; all other proof steps name B only. Three accounts are within the partner limit. | coordinator ruling (P2-17) |
| SR2-group-13 | `group.md:764-772` (group-5 `giveMasterLoot` "for self, uses `ctx.selfGuid()`"), `group.md:784-786` (proof: A sets master loot with A as master), `group.md:1054-1065` (group-9b `loot_rules`), `group.md:1257-1259` (`t9-raid-master-loot`: "with yourself as looter"), and P2-5 ("group-9b adds the setLootMethod self path"). `areas/looting/runtime.ts:35-39` `masterGuid` searches `ctx.legacy.party().members` only, and `docs/areas/looting.md:64-67` records that the own name is refused. | The server needs the giver to be the master (`Handlers/LootHandler.cpp:484-487`: sender must equal `GetMasterLooterGuid()`), so group-5's live proof and `t9-raid-master-loot` need a self-master path before group-9b starts. The path lands in group-5 (its owner files already include `areas/looting/runtime.ts`, `protocol.ts` and their tests), group-9b depends on group-5 and only uses it, and group-10c already does. This refines P2-5's "group-9b adds the setLootMethod self path": the path exists before the tool needs it, and group-5 does not wait for a later task. Design: `export const SELF_MASTER = "@self"` in `areas/looting/protocol.ts` (`@` cannot occur in a character name); `masterGuid(SELF_MASTER)` returns `ctx.selfGuid()`; `giveMasterLoot` accepts the same token; the puppet key `setLootMethod` needs no edit (its third arg is already `"string"` and `run` forwards it: `puppet/calls.ts:38-51`). The group tool passes `SELF_MASTER` when `to` is empty or is the character's own name. Wire form is unchanged (u64). | coordinator ruling (P2-17), for the maintainer's review |
| SR2-group-14 | Unit file rule (`group.md:83`): tool files "group-9a (grow in 9b, 10a-c, 11)"; tasks 9a, 9b, 10a, 10b, 10c and quests-8 all list `areas/raid/tool.ts` and `tool.test.ts`; index deps let 10a, 10b run beside 9b. | One holder at a time, in this queue: group-9a → group-9b → group-10a → group-10b → group-10c → quests-8 (the last from unit `quests`). Each later task adds its `do` values, parameters, tool text and one dispatch line to `tool.ts`, and puts its logic and its tests in its own sibling (`tool-raid.ts`, `tool-ready.ts`, `tool-marks.ts`, `tool-loot.ts`, and for quests-8 `tool-share.ts` plus `tool-share.test.ts`, created by quests-8 as a new file under the lease). `tool.test.ts` is edited only to add the wiring test of the task's `do` values. This keeps every file far under 500 lines. | coordinator ruling (P2-17) |
| SR2-group-15 | `group.md:987-993` (group-9a `kick`: "refuses when Peon is not the leader or assistant") and `group.md:1058-1065` (9b local checks). | AzerothCore-faithful checks, all local, all before any send: `kick` needs leader or assistant outside a dungeon-finder group (`Entities/Player/Player.cpp:13364-13365`); in a dungeon-finder group a kick is a vote that needs a reason (`ERR_VOTE_KICK_REASON_NEEDED`, `GroupHandler.cpp:410-414`; the vote-kick limits are `Player.cpp:13322-13361`), so the tool refuses `kick` with reason `lfg_vote_kick` when `group.dungeonFinder` is set (instances-8 owns the vote). `raid` (convert) refuses in a dungeon-finder group too, because the server drops it silently (`GroupHandler.cpp:661`, `isLFGGroup()`), and it refuses below two members. `lead` needs the leader. `promote assistant` needs the leader (`GroupHandler.cpp:709-719`); `main_tank` and `main_assist` need leader or assistant (`:728-737`). `move` and `swap` need leader or assistant (`:672-707`). `loot_rules` needs the leader outside a dungeon-finder group (`:516-545`, `isLFGGroup(true)`). A kick of the leader is refused by the server with `NOT_LEADER` (`:410-414`), so the tool refuses `kick` of the leader first. | coordinator ruling (P2-17) |
| SR2-group-16 | `group.md:1130-1142` (`t9-raid-answer` witness: "a final partner action `events --json` whose output shows the confirm from the agent with state 1. Whether the grader records a partner action's output could not be determined"). Also `group.md:1198-1202` (`t9-raid-mark` witness "on the partner's side"). | Determined: the grader discards a partner action's stdout (`grader/partner.ts:fire`) and reads only `read --json` chat into `partner<N>-read.jsonl`; partners run `--packet-trace headers`, which records no body (`run-partners.ts:102`), so a state byte cannot be read. Evidence rules (P2-7: evals check packet evidence): `t9-raid-answer` passes on the agent's game-log wake row `raid/ready_check`, the session call `group do=ready`, and the agent's packet counts (`sent` of `MSG_RAID_READY_CHECK` at least 1: the agent is never the initiator in that scenario, and the client form with a body is the answer). `t9-raid-mark` passes on the agent's own echo row `raid/mark` (the server sends kind 0 to the setter, `Group.cpp:1843-1848`) plus the party-chat line in `partner-read.jsonl`. Neither scenario claims to have seen the confirm's state byte or the partner-side mark; the live proof of group-6 and group-7 (`--packet-trace bodies`) covers those. | coordinator ruling (P2-17) |
| SR2-group-17 | group-10a scenarios (`group.md:1126-1142`): "the builder sets the delay and windows" for `answerReadyCheck` and `startReadyCheck`. | There is no trigger for "the check started" or "the agent joined" (`TriggerName`, `grader/scenarios.ts:3-11`). The builder uses `elapsed` offsets and repeats the partner action once (30 s apart): the server relays an answer or a start with no state, so the repeat is harmless (a new start clears the answers, SR2-group-10; an answer outside a check is ignored). If two dry runs still miss, the builder stops with `blocked` and names the missing trigger, not with a longer window. | coordinator ruling (P2-17) |
| SR2-group-18 | `group.md:919-921` (group-7 store: "clears the same target from the other slots, as the server does"). | AzerothCore clears the moved icon by calling itself, which broadcasts one kind-0 packet per cleared slot with `who = 0` and `target = 0` before the new set (`Group.cpp:1835-1848`). The store treats target `0n` as a clear; a kind-0 packet with `who 0n` emits `raid_mark` with `who: 0n`, and the harness rule writes no row for it (only a set with a non-zero `who` and target, or an explicit clear by a named player, writes `mark`). Fixture: a move of one target from icon 7 to icon 3 gives two packets (clear 7, set 3). | coordinator ruling (P2-17) |
| SR2-group-19 | `group.md:1182-1193` (group-10b `mark`), `group.md:906-935` (group-7). | The wire check is `isRaidGroup() && !leader && !assistant` (`GroupHandler.cpp:631-632`): in a plain party any member may mark; only a raid needs leader or assistant. A player target that is hostile or offline is dropped silently (`:635-641`). The tool refuses both locally. `ping` needs a group (`GroupHandler.cpp:588-596`) and valid world coordinates; the sender gets no echo (`Group.cpp:2272-2280`). | coordinator ruling (P2-17) |
| SR2-group-20 | `group.md:1249-1255` (group-10c `roll`: "answers the open group roll through the handled `rollLoot`"). (group loot policy) | Peon never rolls by itself: no auto-roll, no default vote. `roll` answers only when the agent calls it and one open roll exists (`loot-rolls.ts` `roll()` refuses no roll, an answered roll or a vote outside `allowed`, `:113-128`). `pass_loot` sets the request flag only. Group loot rolls stay unproven live (needs an uncommon drop), as the task says. Recommended answer: keep this policy; it matches AzerothCore, where an unanswered roll counts as a pass when the countdown ends. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-group-21 | `group.md:109` (`difficulty: { dungeon, raid, heroic } \| undefined`) and group-1 step 3 (`the three difficulty bytes`). (raid difficulty) | Store the raw wire bytes. `heroic` is the wire byte `!== 0` (AzerothCore writes `m_raidDifficulty >= RAID_DIFFICULTY_10MAN_HEROIC`, `Group.cpp:1946`). group-1 does not import the difficulty enum: `protocol/difficulty.ts` belongs to `instances` (contract 2.5) and does not exist yet [M]. Names come later from `instances`. Recommended answer: raw numbers now. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-group-22 | `group.md:538`, `group.md:545-548` (LFG form and the dungeon-finder insert not seen live). (bot LFG) | Keep the plan: the LFG form (type 0x08, 5-byte insert, `Group.cpp:1908-1912`) is proven by the AzerothCore-built fixture only. No group task queues for the dungeon finder; instances-11 owns the first live LFG group. Under P2-9 no proof or eval of this unit acts on an `RNDBOT` character. Recommended answer: as written. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-group-23 | `group.md:544-548` (proof "A's events show a `raid` `group_list` event with `kind: \"party\"`") and group-1 store step 5. | The two `SMSG_GROUP_LIST` forms the server sends when a member leaves or the group ends (`Group.cpp:678-683`, `:878-884`: type 0x10, three zero bytes, group guid, counter, zero count, zero leader) always follow `SMSG_GROUP_UNINVITE` / `SMSG_GROUP_DESTROYED`. So the raid store peeks `SMSG_GROUP_LIST` only for `disbanded`; it never peeks `SMSG_GROUP_DESTROYED`/`SMSG_GROUP_UNINVITE`, and `uses` gets no extra row. | coordinator ruling (P2-17) |
| SR2-group-24 | group-2/3/6/7 owner lists (`group.md:572-577`, `:656-662`, `:810-817`, `:894-900`) all edit `areas/raid/runtime.ts`, `protocol.ts`, `store.ts` and their tests; the unit rule says "no file passes 500 lines" (`group.md:89-90`). | Each task keeps its code in its own sibling and touches the shared files only for composition. Names: protocol `areas/raid/protocol-stats.ts` (group-2, only what `protocol/group-stats.ts` does not hold), `protocol-structure.ts` (group-3), `protocol-ready.ts` (group-6), `protocol-marks.ts` (group-7); runtime `runtime-stats.ts`, `runtime-structure.ts`, `runtime-ready.ts`, `runtime-marks.ts`; store slices `store-stats.ts`, `store-ready.ts`, `store-marks.ts` (already named) and `store-structure.ts` (group-3: `command_result` only); tests `<part>.test.ts` next to each (`store-stats.test.ts`, `runtime-ready.test.ts`, …). `protocol.ts`, `store.ts`, `runtime.ts` end as thin compositions (group-1 fills them with the roster slice and `awaitGroupChange`). These siblings are created inside the unit's own area directory (contract 2.5, P2-17). | coordinator ruling (P2-17) |
| SR2-group-25 | group-9a owner list (`group.md:964-970`) names `areas/raid/area.ts` and test; group-10a/10b/10c list neither, but each adds `wake`/`passive` rows (`raid/ready_check`, `raid/mark`, `raid/master_loot`). `tools/covered.ts` `COVERS` (contract 2.6, sorted key) keeps a tool's own echo out of the router. | `worldActs` of `raidHarness` stays `[]` in wave 2 (no task needs the world service for a raid act; economy-5 and quests-8 name theirs, group tasks do not). group-9a's edit of `areas/raid/area.ts` is the `kick` echo row and glyph only. Each of group-9a, 10a and 10b may add its sorted key `group` to `tools/covered.ts` `COVERS` (contract 2.6: "a tool whose facts also reach the router as wake or passive rows"), naming only the rows its own tool call produces (`raid/roster` for 9a/9b, `raid/ready_check` for 10a, `raid/mark` for 10b); the first task that adds the key creates it, later tasks append to its set; the colocated `covered.test.ts` may take one row per addition. | coordinator ruling (P2-17) |
| SR2-group-26 | `group.md:1001-1014`, `:1068-1078`, `:1126-1145`, `:1198-1206`, `:1257-1265`: every scenario names spawn `fairbreeze-east` ("the builder picks a free slot"). | Capacity is the problem, not the pick. `startSlots` gives slot `index + (replica-1) × group.length` where `group` is every `ROUND_1` scenario on the same `Spawn` object, and each slot is 2 points (`grader/spawn-slots.ts:188-205`). `FAIRBREEZE_EAST` has 8 points = 4 slots and already holds `t2-whisper-reply`; `FAIRBREEZE_SOUTH` has 8 points and one scenario; `EVERSONG_WEST` has 24 points = 12 slots and 6 scenarios; `EVERSONG` (the default for `eversong10`, `-mage`, `-hunter`, `-warrior`) has 49 points = 24 slots and 11 scenarios [M, counted from `spawn-slots.ts` and `ROUND_1`]. Ruling: the six group scenarios take the spawn below so that replica 1 always fits: `t9-raid-kick`, `t9-raid-convert` on `fairbreeze-east` (3 of 4 slots used); `t9-raid-ready`, `t9-raid-answer` on `fairbreeze-south` (3 of 4); `t9-raid-mark`, `t9-raid-master-loot` on `eversong-west` (8 of 12). Replicas of 2 or more do not fit any of these spawns (`no start slot for <id> replica 2`), so wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). | coordinator ruling (P2-17) |
| SR2-group-27 | `group.md:987-995` (group-9a `status` "reads `getPartyState()` and `handle.raid.state()`"), `group.md:994` (`lead` "settles on the legacy `leader_changed`"). | Both exist: `handle.raid` is generated by `areaHandles` with `state()`, `onEvent`, `act` (`areas/compose.ts:50-55,240-253`); the legacy `leader_changed` event is emitted by `handleGroupSetLeaderMsg` (`world-handlers.ts:104-109`). `getPartyState` reads `party-store` and knows no `self`; the tool takes the character's own name from the session (`handle.getSelfName` is not needed: leadership is compared by guid, `RaidGroup.leader` against the self guid the harness already holds). | coordinator ruling (P2-17) |
