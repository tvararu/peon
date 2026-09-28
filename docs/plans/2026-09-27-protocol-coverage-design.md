Date: 2026-09-27. Status: design, not yet built. Issue #426 (item 4).
Branch `factory/426-protocol-coverage`, one draft PR. No code lands before
item 6 has fully merged (rule 3 below).

This design records the decisions, the step-0 structure, the proof tooling,
the per-area designs and the build process for item 4: every
server-relevant WoW 3.3.5a opcode that Peon does not handle, implemented
end to end. It condenses the research, the three competing structure
designs, their judgement and the adversarial checks. Those records are in
the coordinator's working notes (not kept). Every fact that they found
wrong is corrected here.

Marks: **[M]** measured (a command ran, or the cited line was read);
**[I]** inferred (design reasoning). Pins: Peon `origin/main` `71fba0ab`
(#429 merged). Core line numbers are at `040c6c15`; harness line numbers
are at `9c22a3e4`; #429 changed only `docs/harness.md` and harness
`drive/*`, `extension/input.ts`, `main.ts` and a drive fixture, none of the
other cited files [M, `gh pr view 429 --json files`]. During the design
check a typecheck prototype of the step-0 shapes was built in a scratch
export of `origin/main` and run through `tsc`, biome and `bun test`; marks
"[M, prototype]" come from it. This document itself ran the `git log`,
`gh pr view` and `gh issue view` calls, read `docs/protocol-coverage.md:7`
and `docs/harness.md:5,118`, and searched `client.ts` for area-name
clashes; every other [M] is a citation that a research pass read and an
adversarial check confirmed, not re-read here. AzerothCore:
`~/code/azerothcore-wotlk-playerbots`, branch `deployed`, `9d4e36d81`.
wow_messages: `e1c9e15`. AzerothCore paths without a prefix are under
`src/server/game/`.

## 1. Why and goal

**Why.** Peon plays through the opcodes that core parses and sends, and
today most of the protocol is not there. The character cannot equip a
reward, use a game object, fly a taxi, spend a talent, read threat, convert
a party to a raid or answer a ready check, because the client opcodes for
these do not exist in `packages/` [M, `docs/protocol-coverage.md`]. Each
missing server opcode also arrives as a `not_implemented` notice, so the
agent's log is noisy and the real gaps are hard to see. Item 6 gave the
harness control ownership, direct drive, a world service and
self-describing tools. Item 4 fills the protocol under them, so levelling
1-80, parties and raids, and direct drive can use real game systems
instead of workarounds.

**Goal.** Implement every server-relevant stub and missing opcode end to
end: parser or builder, store and events, harness verbs where an area adds
player capability, and an eval where an area adds a verb. All of it lands
in one draft PR, built by parallel workers, one area each.

**Numbers** [M unless marked]:

| Measure | Value | Source |
|---|---|---|
| `GameOpcode` names | 923 | `docs/protocol-coverage.md:7` |
| Handled / stub / missing at `040c6c15` (and at `71fba0ab`) | 266 / 57 / 600 | same line; #422 moved `SMSG_ACTION_BUTTONS` from stub to handled |
| Stub and missing rows | 657 at `71fba0ab` (658 in the research, which predates #422) | |
| Server-relevant (the scope of rule 7) | 610 | the server constructs the opcode, or its client handler is real and has an accepting status |
| Dead (skipped) | 48 | no construction line in AzerothCore core or modules; client side `STATUS_NEVER` or `Handle_NULL` |
| Dead, verified floor | at least 54 dead, at most 604 relevant | six more rows have a code line that can never run: `SMSG_PROCRESIST` (`Unit.cpp:6618`), `SMSG_CHAT_PLAYER_AMBIGUOUS` (stub, `Handlers/ChatHandler.cpp:826`), `SMSG_LFG_DISABLED` (`Handlers/LFGHandler.cpp:624`), `SMSG_RESYNC_RUNES` (`Player.cpp:13748`, its only call is commented out at `Spells/SpellEffects.cpp:6155`), `SMSG_ADD_RUNE_POWER` (`Player.cpp:13760`), and `SMSG_PAUSE_MIRROR_TIMER` (the `PauseMirrorTimer` packet class is never constructed, `Server/Packets/MiscPackets.h:163-164`). Each sender has no caller. |
| Absent: AzerothCore opcodes with no `GameOpcode` name | 389, of which 10 are relevant | `Server/Protocol/Opcodes.cpp` has 1312 definitions |
| The 10 relevant absent opcodes | server sends `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` 0x032, `SMSG_EQUIPMENT_SET_SAVED` 0x137, `SMSG_PLAY_TIME_WARNING` 0x2F5, `SMSG_LEARNED_DANCE_MOVES` 0x455 (every login, `Handlers/CharacterHandler.cpp:882,1182`), `SMSG_SPLINE_SET_PITCH_RATE` 0x45E, `TC9_SMSG_READY_FOR_REDIRECT` 0x520; client handlers `CMSG_SET_FACTION_CHEAT` 0x126, `CMSG_STABLE_REVIVE_PET` 0x274, `CMSG_FORCE_PITCH_RATE_CHANGE_ACK` 0x45D, `TC9_CMSG_PREPARE_FOR_REDIRECT` 0x51F | `Opcodes.cpp:425,759,1248,1442` and the send sites |
| Rows in scope, by area | 668 rows in the research (658 stub and missing at `e414f012`, plus 10 absent); 657 stub and missing at `71fba0ab`; 20 plan areas | the research's area table |
| Seen live in game logs | 58 distinct opcodes (13 stub, 44 missing, 1 absent) | 57 in the research plus `SMSG_MOVE_LAND_WALK`; 16 of the 58 rest only on logs that were deleted |
| Server rows with a send site | 318 of 354 (at most 312 can be sent) | |

The rule-7 scope (610) is the build target. The six rows of the floor go
into their area's `dead` list with the cited evidence, so they are
skipped, not built [I]. Rule 7 said "skip only the dead ones", and these
are dead by the same definition once the caller check is applied.

Sample limits [M]: every session in the logs is a Blood Elf priest or
hunter, levels 1-20, in Eversong Woods or Ghostlands. Three pre-#399
sessions had a party of two. No session had a raid, dungeon, taxi, mail,
trade, mount, pet or swimming.

## 2. Decisions

### Maintainer rulings

The maintainer gave these rulings on 2026-09-27, recorded in the
coordinator's working notes (not kept). Each is restated as the rule it
sets. The R-numbers are stable ids.

1. **R1 One draft PR.** Item 4 lands as one large draft PR. The
   coordinator may use many Orca worktrees and small subagents to build
   it.
2. **R2 Scope is end to end.** Protocol parsing, harness verbs, wiring and
   evals where relevant. The coordinator decides the phasing.
3. **R3 and R11 No code before item 6 merges.** Every in-flight child
   worktree of the main agent merges before implementation starts. Until
   all of item 6 merges, the run does research, docs, the plan and live
   opcode captures only.
4. **R4 and R10 Models.** Every Claude subagent runs Opus 5.5 at medium
   effort. Watching work (eval babysitting and similar) and menial or bulk
   work run as omp with Muse Spark 1.3 contributor at xhigh thinking
   (`omp --model opencode-go/muse-spark-1.3-contributor --thinking xhigh`).
5. **R5 Restricted reference.** A restricted-licence C++ 3.3.5a client may
   be read for understanding only. It gets one entry in the
   `docs/protocol.md` reference list, worded as the maintainer specified.
   No other durable file names it or credits it as a source. Every wire
   fact in item 4 cites AzerothCore or wow_messages.
6. **R6 Process.** The run follows the Pi harness epic's process
   (`docs/archive/2026-09-26-pi-harness-epic/process.md`) and avoids the
   faults in its section 5 (section 6 of this design).
7. **R7 Scope.** All server-relevant opcodes: every opcode the deployed
   server can send or accept (610). Only dead opcodes are skipped (48).
8. **R8 Run sizes.** Build workflow runs may be large, with many agents.
   Research and eval runs stay small.
9. **R9 Done for an area.** Parser tests from reference packets, plus a
   live run that shows the server sending or accepting the opcodes. An
   eval scenario and a `docs/capabilities.md` row only where the area
   adds a harness verb.
10. **R12 GM staging.** Workers may use GM commands over SOAP (level,
    items, teleport, spells and similar) only on characters of soap
    accounts they created, to reach the state a live proof needs. Never
    on shared data, other accounts or server config.
11. **R13 Issue and draft PR first.** One GitHub issue with
    `## Acceptance criteria`, kept out of Ready, and one draft PR that
    holds only the design and plan until item 6 merges.
12. **R14 and R17 The advisor approves.** The advisor approves this design
    and the plan in the maintainer's place. Its conditions become edits,
    and each ruling it makes is marked "not yet ruled by the maintainer".
    If the advisor is refused, the coordinator approves and records that.
13. **R15 Build order.** Levels 1-10 areas first (NS1), then parties and
    raids, then the level 1-80 systems (NS2), then the long tail (GM,
    arena, calendar, voice and similar). If time runs out, what is left is
    the least useful.
14. **R16 Usage.** No fixed Opus ceiling. When usage warnings appear,
    eval and watching work moves to Muse, Opus stays on code and review,
    and the record is written before usage runs out.
15. **R18 and R19 Autonomy.** The maintainer does not approve the design
    or plan. The coordinator writes both after the goal is set, gets them
    advisor-approved, and works overnight.
16. **R20 Tools.** The ten-tool limit may be raised. An area may add its
    own tool where that is clearer than a new `do` value on an existing
    tool.
17. **R21 No progression gating.** `mod-individual-progression` is off or
    not installed on the live server. Levelling 1-80 is not gated by
    raids.
18. **R22 Mock proof.** When a worker cannot make the live server send an
    opcode, a mock-world-server test with a packet built from the
    AzerothCore code that writes it counts as proof, citing that code. The
    record marks the opcode "not seen live".

Also given by the goal: when wow_messages and the AzerothCore code that
writes or reads a packet disagree, AzerothCore wins.

### Decisions not yet ruled by the maintainer

This design takes these decisions on its own. Each is "not yet ruled by
the maintainer" until the advisor approves it (R14), and the maintainer
may reverse any of them. Ids are stable.

Structure:

- **N1 Structure winner.** Design B (full area modules) plus grafts
  from designs A (registry-minimal) and C (worker-proof-first). B was the
  only design built against the merged #425 and #428, and it scored
  highest on item-6 fit, AGENTS.md rules and the harness side (45 of 60,
  against A 39 and C 40). The grafts, each a decision:

  | Id | From | Graft |
  |---|---|---|
  | G1 | A, C | One `conn.events.area` emitter; a runtime-layer forwarder re-emits each store event there |
  | G2 | judge | `CoreEvents` is today's map and `WorldEvents = CoreEvents & { area }`; areas see `CoreEvents` only |
  | G3 | C | A per-area ownership declaration `opcodes.ts` with `owns`, `uses`, `stubs`, `dead`, `unseen`, checked by tests |
  | G4 | C, changed | Seeding per wave (N2) |
  | G5 | A | `OpcodeDispatch.peek` (N3) |
  | G6 | A | `listen(name, cb)` over `CoreEvents`, and `core` store access, in the runtime context |
  | G7 | A | `until(match, { timeoutMs, signal })` in the runtime context |
  | G8 | C | Stubs move into the owning area's `opcodes.ts` at seeding |
  | G9 | C | Coverage split per area with a `live` column (N4) |
  | G10 | A | One-word area names shared by directory, keys, handle and log domain (N9) |
  | G11 | A | Harness log types derive from core (`Domain = CoreDomain \| AreaName`); fallback rows use the area's own domain |
  | G12 | A | A `./test-support/areas/*` export and the matching harness import pattern |
  | G13 | A, C | An import-scan test over area sources |
  | G14 | A | The mock handle records sends and gains `triggerAreaEvent` |
  | G15 | C | `areaRig(area)` for every area test and every R22 mock proof |
  | G16 | C | Legacy leases (N14) |
  | G17 | C | A flood guard: a harness rule may drop a high-rate event |
  | G18 | A | Hand-written wire notes in `docs/areas/<area>.md` |
  | G19 | B | Step 0 drops the count "ten" from `docs/harness.md:5` and `:118` |
  | G20 | C, changed | Area evals append to `ROUND_1` (N7) |

  Not grafted: A's `Disjoint` guard (B's `Extract` guard does the same
  job), A's and C's tool spread into `GAME_TOOLS` (`ToolName` is closed),
  and C's pre-creation of all 20 areas, lazy handle getters and puppet
  `reads`/`act` verbs.
- **N2 Seeding per wave.** The coordinator seeds each wave's code areas
  (directory, `opcodes.ts`, empty `area.ts`, both registry lines, the
  stub move, the coverage file) in one commit. Workers never edit a
  registry.
- **N3 `peek`.** An area may read an opcode that another module owns
  through `OpcodeDispatch.peek`, instead of editing the owner. This
  changes `docs/protocol.md` "Add an opcode" step 2.
- **N4 Coverage split.** `docs/protocol-coverage.md` becomes a fixed index
  with no count line, plus one generated file per area and `core.md`.
  Counts print on stdout.
- **N5 World service.** The world service gains `session.areas.<area>`
  reads and events and `claim.areas.<area>` acts limited to each harness
  module's `worldActs`. Every area act then needs a claim, which preempts
  runs (section 3.9).
- **N6 `time` login query.** The worked example sends `CMSG_QUERY_TIME`
  once after login, so every session sends one more packet.
- **N7 Eval round.** Area scenarios go into `ROUND_1`, appended at the end
  so earlier slots keep their index. A separate `AREA_ROUND` needs
  `startSlots` to take the round as an argument; it is not built unless
  `ROUND_1` spawn groups run out of points.
- **N8 Sorted registry.** One `biome.json` override turns `useSortedKeys`
  on for `packages/core/src/wow/areas/registry.ts`, placed after the core
  `useSortedKeys: off` override.
- **N9 Code-area names.** One lowercase word each; plan areas whose name
  is a harness core domain are renamed (section 5.1).
- **N10 Tool kind on call records.** Step 0c adds `kind` to the records
  the progress and repeat guards receive, so the per-tool name sets
  `READS`, `CLEARING` and `VERIFYING` go away.
- **N11 Area progress hook.** An area draft may carry `progress: true`,
  which the progress tracker counts as progress.
- **N12 Quiet fallback rows.** A fallback area row is hidden from
  `journal(about: "log")` unless a harness rule opts the area in.
- **N13 Six unreachable senders are dead.** The six rows of the verified
  floor (section 1) go into `dead` with their evidence.
- **N14 Legacy leases.** One legacy file or existing tool module is leased
  to one area task at a time; the coordinator hands the lease on when that
  task lands (contract D12).

Proof tooling:

- **N15** A packet trace in core with a harness sink, per-opcode counters
  written at close, and a buffered notice replay for the login race.
- **N16** A committed probe, `mise protocol:probe`, in devtools.
- **N17** `mise factory soap gm` with a fixed allow-list of console
  templates and a log; no in-game GM chat path.
- **N18** The eval grader passes `--packet-trace headers` on every run.
- **N19** A soap name-collision retry in `createAccount`.
- **N20** A citation checker, `mise protocol:cite-check`, outside
  `mise ci`.
- **N21** No layout comparator between AzerothCore and parsers.

Area decisions (each area subsection in section 5 lists its own under
"Decisions"):

- **N22 Waves.** Cheap passive tasks move into wave 1 although their area
  sits later: `threat` as the pilot, login noise (session 1, 2, 5),
  `SMSG_LOOT_LIST` (group-4), `SMSG_TALENTS_INFO` (talents-1), login
  difficulty (instances-1), achievements and emotes (social 1, 2), the pet
  bar (pets 1, 2), the death toggles (unitmotion 1, 2), ammo (items-8) and
  buyback (economy 1, 2). Section 5.1 lists every wave.
- **N23 Read-surface areas get no eval.** `threat`, `combatlog`,
  `unitmotion` and `session` add no verb, so rule 9 asks for no eval; each
  proves its opcodes live and reruns the closest existing scenario.
- **N24 Accepted, no effect.** A client opcode whose server handler is
  real but does nothing (`CMSG_CANCEL_GROWTH_AURA`,
  `CMSG_STABLE_REVIVE_PET`, the voice opcodes,
  `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH`, `CMSG_PLAYER_LOGOUT`) is built, and
  its proof is a builder test against the AC reader plus a live send that
  the server accepts. Rule 7 counts it as relevant.
- **N25 Traces stay mock.** A client opcode whose live send writes a server
  log line or a table row that outlives the accounts is proven by a
  builder test only: `CMSG_GUILD_CREATE`, `CMSG_CALENDAR_COMPLAIN`,
  `CMSG_SET_FACTION_CHEAT`, `CMSG_COMPLAIN`, `CMSG_BUG`,
  `CMSG_GM_REPORT_LAG`, `CMSG_GMSURVEY_SUBMIT`, and ticket writes until the
  maintainer rules.
- **N26 Scenario ids** are `t<tier>-<area>-<slug>.json` with `id` equal to
  the stem; the area word is the plan or code area.
- **N27 Tools.** Fourteen new tools: `gear`, `use`, `spell`, `talents`,
  `pet`, `group`, `dungeon`, `vehicle`, `trade`, `mail`, `guild`,
  `guild_bank`, `calendar`, `pvp`, which takes the harness from 10 to 24
  (R20 allows it). If the prompt suffers, `calendar` and `guild_bank` fold
  into `guild` first.
- **N28 Owners of shared pieces.** `objects` owns the spell-target writer
  (`spells`, `talents`, `pets` use it); `items` owns the correlation rule
  for `SMSG_INVENTORY_CHANGE_FAILURE`, exports it as a helper from
  `#wow/protocol/inventory` for `bank`, `buyback` and `guildbank`, and
  fixes the other four stores;
  `pets` owns the `SMSG_PET_SPELLS` parser that `vehicles` reuses;
  `talents` owns the talent-spec parser that `inspect` reuses; the
  packed-time reader lives in `protocol/packed-time.ts` from step 0e, and
  `guild` adds the writer there under a lease (contract D10); `group`
  owns the `SMSG_GROUP_LIST` rewrite, and `lfg` refuses `queue auto` until
  it lands; `instances` owns the difficulty enum.
- **N29 Guards in core.** Core refuses what would destroy or leak data the
  character did not mean to lose: the hunter-pet command-3 dismiss, a
  calendar edit of an event it did not create, bank text without the right,
  a mail delete that still holds items, a trade accept after the other
  offer changed, an auction or mail action out of range.
- **N30 Area verbs and policies** as each area subsection states them,
  among them: `travel to:"fly"` as the default flight verb until the
  maintainer rules; mount verbs on the `spell` tool and dismount first;
  bind without the gossip confirm; share accept with the divider guid;
  quest marks by one debounced multiple query; the intro cinematic
  completed automatically; `CMSG_CHAT_IGNORED` sent once per ignored
  whisperer; `join_channel` refuses zone channel names without the id;
  `dungeon queue auto` on by default and off in evals; `trade` answers a
  request busy after 60 s and never accepts by itself; mail evals may run
  one `soap gm` staging command before the baseline; guilds and arena
  teams staged by `soap gm` with a `Fac` name and removed in the same run.
- **N31 Staging extensions.** `soap gm` gains the verbs the areas need
  beyond section 4.3's list: `character rename|customize|changefaction|
  changerace` on a second character of the worker's own ledger account,
  `deserter bg add`, `reset achievements`, and read-only `guild info`,
  `arena info|lookup`, `bf queue`. A grader setup step that polls a
  read-only console command until it matches (for the Wintergrasp window)
  is part of the `pvp` harness task.

Process (added at approval):

- **N32 One worktree per plan area.** Workers get one Orca worktree per
  plan area (the 20 areas of section 5, plus `step0`, the tooling lanes
  and `rebaseline`), not per code area. Each task names its `codeArea`,
  the one-word name that seeding and the coverage files use.
- **N33 Tooling and re-baseline start before the plan.** R0 and the
  tooling that lands before the first area (section 4.8) are built
  straight from sections 4 and 6.3 while the plan is written. Step 0 and
  every wave wait for the plan approval.

Contract amendments (added at plan approval). Each is "not yet ruled by
the maintainer"; the design text it names is edited to match:

- **D1** `AreaRuntimeCtx` carries `signal: AbortSignal` (section 3.3).
  See contract D1.
- **D4** `AreaRuntimeCtx` and `AreaPort` carry `dbc: DbcSource |
  undefined`, from `ClientConfig.dbc` (sections 3.3, 3.6, 3.7). See
  contract D4.
- **D5** `AreaRuntimeCtx` and `AreaPort` carry `legacy: LegacyViews` from
  step 0a, not from a coordinator commit before wave 2 (sections 3.3, 3.6,
  3.12). See contract D5.
- **D8** `areaRig`'s port routes `expect` through the rig's real dispatch
  (section 3.9). See contract D8.
- **D10** The packed-time reader lives in `protocol/packed-time.ts`
  (step 0e); `guild` adds the writer there under a lease (section 3.13,
  N28, section 5.21). See contract D10.
- **D12** A lease is held by one task, not by one unit for the whole
  fan-out (N14, section 3.12). See contract D12.
- **D14** Scenario tiers are fixed when the plan index lists the scenario;
  nobody renumbers after landing (section 5.2). See contract D14.
- **D17** The live gates: `t1-walk-to-npc` passes, `t7-halt-resume`
  passes or fails only from the known stale wake, and the regression
  scenarios show no new failure cause against the R0 baseline (sections
  3.15 test 29, 6.6). See contract D17.
- **D20** A `world-conn.ts` change is a coordinator `COORD-<n>` commit
  (sections 5.13, 5.21). See contract D20.
- **D21** The `session` lease on `protocol/world.ts` covers the
  `SMSG_CHAR_ENUM` parser only, never `OpcodeDispatch` (section 3.11). See
  contract D21.
- **D24** `areaRig` takes `init.register` for legacy owners, run before
  the no-op fill, and the fill skips opcodes that already have an owner
  (section 3.9). See contract D24.
- **D25** One kind per tool: a tool with any sending `do` value is kind
  `action` (`trade` is `run`) (sections 3.10, 5.11 to 5.14). See contract
  D25.

Approval: the advisor approved this design in the maintainer's place
(R14) with four conditions: R0 runs first and edits this design where the
code moved; plan phases follow the waves of section 5.1; N32; and step 0
branches from the PR branch (section 6.2).

## 3. Step 0: the structure

Step 0 makes the fan-out possible. Today every new opcode edits the same
hub files: `client.ts`, `client-handlers.ts`, `session-stores.ts`,
`world-events.ts`, `runtime.ts`, `index.ts`, `mock-handle.ts`,
`protocol/stubs.ts`, the coverage count line, the `docs/protocol.md`
"Session stores" sentence and, in the harness, `contract/log.ts`,
`events/router.ts` and `router.test.ts:44` [M]. #422 touched 7 of these
for one opcode [M, `gh pr diff 422`]. With 8 or more parallel workers,
every PR would conflict on them. After step 0 a worker adds an area by
filling one directory that the coordinator has seeded.

Step 0 branches from `main` after item 6 fully merges.

### 3.1 Summary

1. Each code area is a directory `packages/core/src/wow/areas/<area>/`
   with `opcodes.ts`, `protocol.ts`, `store.ts`, optional `runtime.ts` and
   `area.ts`, plus colocated tests. `area.ts` calls `defineArea`.
2. `opcodes.ts` declares what the area owns, uses, stubs, marks dead and
   has not seen live. Tests check that ownership is a partition and that
   the code matches the declaration.
3. One registry per package lists the areas. Only the coordinator edits
   them (N2).
4. A handler owns an opcode with `on`. A second reader of an opcode that
   another module owns uses `peek` (N3).
5. Stores hold state and emit events. Runtimes send, wait, time out, and
   `listen` to core events. A forwarder puts every area event on one
   `conn.events.area` emitter.
6. `handle.<area>` is `{ state, onEvent, act }`, plus one
   `handle.onAreaEvent`. A compile guard stops a name clash.
7. Stubs move into the owning area's `opcodes.ts` when the area is seeded.
   Coverage is one generated file per area, with a `live` column (N4).
8. Harness: one area event hook, a fallback `log` row in the area's own
   domain (quiet by default, N12), and an optional harness module with
   rules, an `attach` hook for login-time state, a glyph and a
   `worldActs` allow-list.
9. The world service gains `session.areas.<area>` and
   `claim.areas.<area>` (N5).
10. A new tool is a `defineGameTool` module in the area's harness
    directory, plus one `ToolName` member, one `GAME_TOOLS` entry and one
    `docs/harness.md` mention, because `ToolName` is closed [M,
    `contract/result.ts:1-11`, `tools/registry.ts:26-30`].
11. The worked example is `time`: `SMSG_LOGIN_SETTIMESPEED`,
    `CMSG_QUERY_TIME`, `SMSG_QUERY_TIME_RESPONSE`.

### 3.2 Layout

```
packages/core/src/wow/areas/
  contract.ts          types; the values defineArea and emptyStore
  compose.ts           AREA_NAMES, list-taking cores (registerModules,
                       buildModuleStores, createModuleRuntimes), the AREAS
                       wrappers, areaHandles, areaStubs, derived types
  port.ts              areaPort(conn) and testPort()
  registry.ts          AREAS, one import and one key per area (coordinator)
  registry.test.ts     directories, names, ownership, import scan
  compose.test.ts      registration, peek, lazy port, lifecycle, fan-in
  typecheck-fixture.ts a second fixture registry, typechecked only
  time/                opcodes.ts, protocol.ts, store.ts, runtime.ts,
                       area.ts and their tests
packages/core/test-support/
  area-rig.ts          areaRig(name)
  areas/<area>.ts      packets built from the AzerothCore writer
packages/harness/src/areas/
  contract.ts          HarnessArea, AreaRules, AreaDraft, defineHarnessArea
  registry.ts          HARNESS_AREAS (coordinator); total over AreaName
  rules.ts             areaDrafts, attachDrafts, fallbackDraft
  world.ts             areaViews, areaActs for the world service
  time/area.ts         the worked example
  <area>/tool.ts       only when the area adds a tool
docs/areas/<area>.md               hand-written wire notes
docs/protocol-coverage.md          fixed index, no counts
docs/protocol-coverage/<area>.md   generated per area
docs/protocol-coverage/core.md     generated, opcodes no area owns
```

- The entry file is `area.ts`, never `index.ts`: `noBarrelFile` and
  `noReExportAll` are errors [M, `biome.json:46-50`].
- **Names.** A code-area name matches `/^[a-z]+$/`. The directory, both
  registry keys, the handle key and the harness log domain are the same
  string. A name must not be a `CoreHandle` key (for example `halt` or
  `who` [M, `client.ts:184`]), `onAreaEvent`, or a harness core domain:
  `session`, `control`, `nav`, `chat`, `combat`, `xp`, `quest`, `loot`,
  `money`, `vendor`, `trainer`, `fight`, `life`, `group`, `social`,
  `aura`, `run`, `tool`, `human`, `agent`, `packet`, `notice`,
  `snapshot`, `entity` [M, `contract/log.ts:3-27`].
- A code area is smaller than a plan area. The plan's `economy` gives
  `trade`, `mail`, `auction` and `bank`. The coordinator picks the names
  when it seeds a wave (section 5.1 proposes them).
- Nothing else lives in `areas/`. Shared parsing helpers stay in
  `#wow/protocol/*`.

### 3.3 Contract

`areas/contract.ts` imports only types, except the two values it defines.

```ts
export type OpcodeName = keyof typeof GameOpcode;
export type AreaEventBase = { readonly type: string };
export type AreaOpcodes = {
  readonly owns: readonly OpcodeName[];
  readonly uses: readonly OpcodeName[];
  readonly stubs: readonly (readonly [name: OpcodeName, label: string])[];
  readonly dead: readonly OpcodeName[];
  readonly unseen: readonly OpcodeName[];
};
export type AreaStore<S, E extends AreaEventBase> = {
  snapshot: () => S;
  onEvent: (cb: (event: E) => void) => Unsubscribe;
  dispose: () => void;
};
export type AreaRegister = {
  on: (opcode: number, read: Read) => void;
  peek: (opcode: number, read: Read) => void;
};
export type LegacyViews = {
  party: () => PartyState;
  friends: () => readonly FriendEntry[];
  ignored: () => readonly IgnoreEntry[];
  guild: () => GuildRoster | undefined;
  channels: () => readonly string[];
};
export type AreaRuntimeCtx<E extends AreaEventBase> = {
  send: (opcode: number, body?: Uint8Array) => void;
  expect: (opcode: number, options?: ExpectOptions) => Promise<PacketReader>;
  listen: <K extends keyof CoreEvents>(name: K, cb: Listener<K>) => Unsubscribe;
  until: (match: (event: E) => boolean,
          options: { timeoutMs: number; signal?: AbortSignal }) => Promise<E>;
  now: () => number;
  selfGuid: () => bigint;
  signal: AbortSignal;
  dbc: DbcSource | undefined;
  legacy: LegacyViews;
};
export type AreaRuntime<A extends AreaActs> = { readonly act: A; dispose: () => void };
export type AreaModule<N extends string, St extends AnyStore, A extends AreaActs> = {
  readonly name: N;
  readonly opcodes: AreaOpcodes;
  store: (deps: SessionDeps, core: CoreStores) => St;
  register: (wire: AreaRegister, store: St) => void;
  runtime?: (ctx: AreaRuntimeCtx<StoreEvent<St>>, store: St, core: CoreStores) => AreaRuntime<A>;
};
export function defineArea<N extends string, St extends AnyStore, A extends AreaActs>(
  module: AreaModule<N, St, A>): AreaModule<N, St, A>;
export function emptyStore(): AreaStore<Readonly<Record<never, never>>, never>;
```

Derived types in `compose.ts`, over `type Areas = typeof AREAS`:

```ts
export type AreaName = keyof Areas & string;
export type AreaState<K extends AreaName> = ReturnType<ReturnType<Areas[K]["store"]>["snapshot"]>;
export type AreaActsOf<K extends AreaName> =
  NonNullable<Areas[K]["runtime"]> extends (...args: never[]) => AreaRuntime<infer A> ? A : never;
```

`AreaActsOf` derives from the runtime's return. The obvious form over
`AreaModule<string, never, infer A>` gives `never` for every area, because
`St` is invariant [M, prototype `tsc`]. This form gives the act object for
an area with a runtime and `{}` for a seeded area [M].

Rules the contract carries:

- **The store owns the area's state and event stream.** It sends no
  packet and arms no timer except a wait deadline, as `docs/protocol.md`
  "Session stores" requires of every store [M, `docs/protocol.md:95-127`].
  Its emitter is a plain `new Emitter()`, which rethrows [M,
  `self-store.ts:30`, `lib/emitter.ts:7-13`].
- **`register` gets only `on` and `peek`.** It must not subscribe or send,
  because the exactly-once test and the coverage generator pass fake
  connections that hold only a dispatch and `events` [M,
  `client-handlers.test.ts:31-41`, `test-support/protocol-coverage.ts:45-50`].
- **`runtime` holds the policy.** It sends, awaits replies with `expect`,
  waits on its own events with `until`, times out requests, and
  subscribes to core emitters with `listen` or to core store events
  through `core` (for example `core.self.onEvent` [M, `self-store.ts:35`]).
  An area with no runtime gets `{ act: {}, dispose() {} }`.
- **Session end.** Pending `until` waits reject through a lifetime
  `AbortController` whose `signal` the context carries, the pattern core
  runtimes use today [M, `item-use.ts:89-92`]. No new `session_closed`
  error exists.
- **`core` is the full `CoreStores`.** An area may call its query methods
  and today's sharing entry points, such as `quests.receiveWindow` [M,
  `gameplay-handlers.ts:327,346`]. It never replaces legacy state. A
  change to legacy behaviour goes through the legacy owner file under a
  lease (section 3.12).
- **`dbc` and `legacy`.** `dbc` is the DBC source from `ClientConfig.dbc`,
  or `undefined` when the client has none; the area catalogs of section 5
  read it (contract D4). `legacy` holds read views of the `WorldConn`
  state that `CoreStores` lacks: party, friends, ignored, guild roster and
  channels. Step 0a adds both to the context and the port (contract D5).
- **Type-cycle rule.** `AreaStores`, `AreaHandles`, `AreaEvent`, and so
  `SessionStores`, `WorldEvents` and `WorldHandle`, derive from
  `typeof AREAS`. An area module uses only `CoreStores`, `CoreEvents`,
  `SessionDeps` and its own types. A breach through an inferred store type
  fails with TS2456 ("Type alias ... circularly references itself"). A
  breach through a class or declared type may compile, which couples the
  area to every other area [M, prototype]. So the import scan (section
  3.15, test 5) also fails an area source that imports, even as a type,
  `WorldHandle`, `SessionStores`, `WorldEvents` or anything from
  `#wow/areas/compose`.
- **Inference.** `St` comes from `store`'s return type, and `runtime`'s
  `ctx` is typed from it. The prototype confirmed that left-to-right
  inference works and that `ctx.until((ev) => ev.type === ...)` narrows
  [M].
- Event `type` values match `/^[a-z_]+$/`, so the fallback row
  `<area>/<type>` can be selected by the grader schema (section 3.10).
  Events carry strings and plain numbers, not wire codes.

### 3.4 Ownership (`opcodes.ts`)

```ts
export const TIME_OPCODES = {
  owns: ["SMSG_LOGIN_SETTIMESPEED", "CMSG_QUERY_TIME", "SMSG_QUERY_TIME_RESPONSE"],
  uses: [],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;
```

- Names are strings, never `GameOpcode.X`. The coverage scan matches
  `GameOpcode\.([A-Z0-9_]+)` [M, `test-support/protocol-coverage.ts:28`],
  so a declaration never makes an opcode look handled.
- `owns`: every opcode the area is responsible for. The coordinator
  writes it from the area table when it seeds the area.
- `uses`: opcodes another module owns that the area names, `expect`s or
  peeks.
- `stubs`: the area's share of today's `STUBS`, moved at seeding. A worker
  deletes a line when it registers the handler.
- `dead`: owned opcodes the server never sends or accepts (rule 7, N13).
- `unseen`: owned opcodes proven only by a mock-world-server test built
  from the AzerothCore writer (R22). Coverage prints them `not seen live`.
- `stubs`, `dead` and `unseen` are subsets of `owns`. An opcode is in at
  most one area's `owns`. Moving an opcode between areas is a coordinator
  commit that edits two `opcodes.ts` files.
- **Late legacy opcodes.** `requestLogout` registers `SMSG_LOGOUT_RESPONSE`
  and `SMSG_LOGOUT_COMPLETE` at logout time, not at session start [M,
  `logout.ts:26-29`], so the exactly-once test never sees them. The
  ownership test names these two as legacy and late: no area may own or
  peek them.

### 3.5 Registration

- **An explicit registry.** `AREAS` in `areas/registry.ts` holds one
  import and one key per area. A run-time glob cannot give a static
  handle type.
- **Only the coordinator edits it (N2).** At the start of each wave (R15
  order) the coordinator lands one seed commit that adds, for each code
  area of the wave: the directory with `opcodes.ts` and an `area.ts` that
  uses `emptyStore()` and a no-op `register`; both registry lines (the
  harness module with `worldActs: []` and no rules); the area's stub lines
  moved out of `STUBS`; and the regenerated coverage files. The wave's
  workers branch from the seed commit. A code area a worker finds it needs
  mid-wave is seeded by the coordinator in one more commit.
- **Sorted keys.** A `biome.json` override turns the `useSortedKeys`
  assist on for `packages/core/src/wow/areas/registry.ts` only, placed
  after the `packages/core/src/wow/**` `useSortedKeys: off` override;
  placed before, the `off` override wins (N8) [M, prototype]. The core
  `off` override exists because packet readers depend on key order [M,
  `biome.json:207-219`]; `registry.ts` reads no packet. The harness
  registry is already under `useSortedKeys: on` [M, `biome.json:10`].
- `registry.test.ts` globs `areas/*/area.ts` and fails when the
  directories and `AREAS` keys differ, when a key differs from its
  module's `name`, or when a name breaks the rule of section 3.2.
- **List-taking cores.** `compose.ts` exports `registerModules(dispatch,
  modules, stores)`, `buildModuleStores(deps, modules, core)` and
  `createModuleRuntimes(port, modules, stores, core)`. The `AREAS`
  wrappers (`registerAreas`, `buildAreaStores`, `createAreaRuntimes`) call
  them. Tests pass fixture module lists, because a fixture cannot join
  `AREAS` (the directory test forbids it and `mock.module()` is banned
  [M, `config/biome.grit`]).
- **Where `registerAreas` runs.** It is the last line of
  `registerGameHandlers` [M, `client-handlers.ts:159-173`]. The stub-shadow
  test calls `registerGameHandlers`; the exactly-once test and the
  coverage generator call `registerWorldHandlers`, which calls
  `registerGameHandlers` first [M, `client-handlers.ts:175-179`]. So every
  test and the generator see area handlers [M, prototype].
- **Two passes.** `registerModules` calls each area's `register` with an
  `on` that is `conn.dispatch.on` and a `peek` that queues. After every
  area registers, it applies the queued peeks. Legacy owners register
  before `registerAreas`, so a peek on a legacy opcode finds its owner. A
  peek on an opcode that only a stub covers throws: the area must own it.
- **The duplicate guard holds.** `on` is `conn.dispatch.on`, which throws
  "already has a handler; compose in its owner" [M,
  `protocol/world.ts:205-211`].

### 3.6 The wire: `peek` and the port

**`OpcodeDispatch.peek(opcode, read)`** is a new method in
`protocol/world.ts`, about 30 lines.

- `handle()` forks the reader before the owner runs. After the owner has
  run and after the matching `expect` waiter is resolved, it runs each
  peek on its own fork of the saved body, each inside its own `try`. A
  peek failure goes to `conn.events.packetError`. So a peek never leaves a
  waiter unresolved, and one failing peek never skips another [M:
  `handle()` resolves the waiter after the owner, and on an owner throw it
  rejects the waiter before it rethrows, `protocol/world.ts:239-262`].
- A peek never runs when the owner throws. `has()` stays owner-only, so a
  peek never makes an opcode `handled` and never shadows a stub. A peek on
  an opcode with no owner throws at registration: "peek needs an owner;
  own the opcode instead".
- Composite opcodes stay composed in their legacy owner:
  `SMSG_UPDATE_OBJECT` (areas read entity events with `listen("entity")`),
  `SMSG_INVENTORY_CHANGE_FAILURE`, `SMSG_ITEM_PUSH_RESULT`,
  `SMSG_GOSSIP_MESSAGE` and `SMSG_SHOWTAXINODES` (areas peek them).
- `PacketReader.fork()` exists [M, `protocol/packet.ts:33`].

**The lazy port** (`areas/port.ts`):

```ts
export type AreaPort = {
  send: (opcode: number, body?: Uint8Array) => void;
  expect: (opcode: number, options?: ExpectOptions) => Promise<PacketReader>;
  events: () => WorldEvents;
  now: () => number;
  selfGuid: () => bigint;
  dbc: DbcSource | undefined;
  legacy: LegacyViews;
};
export function areaPort(conn: WorldConn, dbc: DbcSource | undefined): AreaPort;
export function testPort(init?: Partial<AreaPort>): AreaPort;
```

- `areaPort` reads every `conn` field at call time and never uses
  `.bind`. `send` goes through `sessionDeps(conn).send`, which reads
  `conn.socket` when called [M, `session-stores.ts:39-46`]. The `legacy`
  views copy the bodies of `getPartyState`, `getFriends`, `getIgnored` and
  the guild roster read, and `channels` returns a copy of `conn.channels`
  (contract D5).
- `testPort()` records sends, rejects every `expect`, owns its own
  `createWorldEvents()`, and uses a fixed clock, `dbc: undefined` and
  empty legacy views.
- The runtime context is built from a port, and carries the port's `dbc`
  and `legacy` (contract D4, D5). `listen(name, cb)` is
  `port.events()[name].subscribe(cb)` (one narrow cast). `until`
  subscribes to the area's store and arms one `setTimeout`, cleared on a
  match, on `signal` abort and on dispose.

### 3.7 Stores, events and runtimes

One-time edits in step 0. After that no worker edits these files.

- **Stores** (`session-stores.ts`): `CoreStores` is today's type, and
  `SessionStores = CoreStores & { readonly areas: AreaStores }`.
  `buildSessionStores` builds the core stores, then `areas:
  buildAreaStores(deps, core)`. `disposeSessionStores` disposes the area
  stores last. Area stores nest under `areas`, so an area name never
  collides with a core store key [M, `session-stores.ts:24-37`].
  `testStores()` calls `buildSessionStores` [M,
  `test-support/session-fixtures.ts:29-37`], so every test gets every area
  store.
- **Events** (`world-events.ts`): `CoreEvents` is today's map, and
  `WorldEvents = CoreEvents & { area: Emitter<[AreaEvent]> }`, built as
  `new Emitter(report)`. `AreaEvent = { [K in AreaName]: { area: K; event:
  AreaEventOf<K> } }[AreaName]`. Areas reference `CoreEvents` only, which
  keeps registry-derived types out of every area's type. A listener error
  reaches `packetError` through the existing `report`, and
  `clearWorldEvents` clears the emitter with no edit [M,
  `client-connection.ts:216`, `world-events.ts:65-67`].
- **Runtimes** (`runtime.ts`): `Runtimes` gains `areas`, built last in
  `createRuntimes` by `createAreaRuntimes(areaPort(conn, config.dbc),
  stores.areas, stores)` and
  disposed last. For each area it calls `module.runtime?.(ctx, store,
  core)`, then subscribes the forwarder `store.onEvent((event) =>
  port.events().area.emit({ area: name, event }))`. The runtime
  subscribes first, so it retimes its request timers before the event is
  published, as `docs/protocol.md` "Session stores" requires [M,
  `docs/protocol.md:95-127`]. `halt()` stays control and combat only [M,
  `runtime.ts:249-253`].
- **Order** inside `worldSession` stays: stores, entity routing, runtimes,
  handlers, login [M, `client.ts:356-365`]. So a login-time packet lands in
  an area store and reaches `conn.events.area`.
- **Casts.** A function generic in `K extends AreaName` fails at three
  correlated sites: `store.snapshot()`, `module.runtime?.(...)` and, once
  a second area exists, `module.register(...)` [M, prototype `tsc`: TS2322
  and TS2345]. `compose.ts` therefore uses narrow casts at each site
  (`store.snapshot() as AreaState<K>`, `module.register as (wire:
  AreaRegister, store: unknown) => void`, the runtime factory cast to a
  function of `unknown` store, one cast on each built object, and
  `Object.keys(AREAS) as AreaName[]`). `compose.test.ts` pins the built
  shapes. #425's `picked()` uses the same kind of cast [M,
  `world/hub.ts:123-128`].
- **Two areas at step 0.** The `register` failure appears only with two
  or more areas, so step 0 typechecks `compose.ts` against
  `typecheck-fixture.ts`, a second registry of two fixture modules that
  runs the same derived types [I]. The first seed commit then adds real
  areas with no surprise.

### 3.8 The sub-handle

```ts
export type AreaHandle<K extends AreaName> = {
  readonly state: () => AreaState<K>;
  readonly onEvent: (cb: (event: AreaEventOf<K>) => void) => Unsubscribe;
  readonly act: AreaActsOf<K>;
};
export type CoreHandle = { /* today's WorldHandle, renamed */ };
export type WorldHandle = CoreHandle & AreaHandles &
  { onAreaEvent: (cb: (event: AreaEvent) => void) => Unsubscribe };
```

- Call sites read `handle.time.state()`, `handle.time.act.query()` and
  `handle.time.onEvent(cb)`. Acts nest under `act`, so no act name can
  clash with `state` or `onEvent`.
- `state()` returns a detached snapshot. `onEvent` filters
  `conn.events.area` by area.
- One signature: `areaHandles(stores.areas, runtimes.areas, area: () =>
  Emitter<[AreaEvent]>)`. `createHandle` passes `() => conn.events.area`,
  the mock passes `() => port.events().area` [M, prototype].
- Compile guard: `AREA_NAMES_FREE: [Extract<AreaName, keyof CoreHandle |
  "onAreaEvent">] extends [never] ? true : never = true`. It fails with
  TS2322 for an area named `halt` [M, prototype].
- These still compile [M, prototype]: the 14 `satisfies
  Partial<WorldHandle>` sites, the `Pick<WorldHandle, ...>` uses in
  `action-bar.ts` and `client-place.ts`, #425's `satisfies readonly (keyof
  WorldHandle)[]` lists, the harness `Game` (`Omit` plus spread [M,
  `loops/game.ts:75,270`]) and `MockGame`.

### 3.9 Stubs, coverage, exports, mock and rig

**Stubs.** `STUBS` keeps the entries of areas that are not seeded yet.
Seeding moves an area's entries into its `opcodes.ts`.
`registerStubs(dispatch, notify, stubs = STUBS)` takes the list, with a
default so `protocol/stubs.test.ts` keeps its two-argument calls [M, 5
calls]. `registerWorldHandlers` passes `[...STUBS, ...areaStubs()]`. The
stub-shadow test checks the same merged list, and names the opcode and
the declaring area on failure. A step-0 test asserts that each of the 57
frozen pairs of `040c6c15` is in the union or its opcode is registered by
an area handler, which stays green when `time` handles
`SMSG_LOGIN_SETTIMESPEED` in commit 0e [M: the plain equality form fails
at 0e].

**Coverage** (N4).

- `renderCoverage` returns a map from path to content:
  `docs/protocol-coverage/<area>.md` per area from its `owns`,
  `docs/protocol-coverage/core.md` for the rest, and a fixed index
  `docs/protocol-coverage.md` with no counts.
- Columns: opcode, name, direction, status, live. Status order is `dead`,
  then `stub`, then `handled`, then `missing`. Stub must come before
  handled: the generator registers stubs on the dispatch, so `has()` is
  true for every stub [M, `protocol/stubs.ts:79-91`; flipping the order
  failed 61 rows in the prototype].
- The generator reads `[...STUBS, ...areaStubs()]`, not `STUBS` alone [M,
  `test-support/protocol-coverage.ts:51`].
- `mise protocol:coverage` prints counts per area and in total on stdout.
- The staleness test compares every rendered file and fails on an extra
  file in `docs/protocol-coverage/`.
- The `direction` helper learns the `TC9_` prefix.
- Known imprecision, kept: an opcode named in non-test core source counts
  as `handled` [M, `test-support/protocol-coverage.ts:52-57`]. The
  "named opcodes are owned or used" test stops an area from naming another
  area's opcode.
- `mise lint:docs` reads only `AGENTS.md`, `README.md`, `docs/*.md` and
  factory prompts [M, `packages/devtools/src/stale-docs.ts:76-81`]. Step 0
  adds `docs/areas/*.md` to its sources in the same commit as
  `docs/areas/time.md` (a pattern with no file throws [M, `:167`]). The
  generated per-area coverage files hold only tables and are not added.

**Exports.** One block in `wow/index.ts` exports `AREA_NAMES` and the
types `AreaActsOf`, `AreaEvent`, `AreaEventOf`, `AreaHandle`,
`AreaHandles`, `AreaName`, `AreaState` from `#wow/areas/compose`. No
per-area barrel line. `packages/core/package.json` gains
`"./test-support/areas/*"`, and the `packages/harness/**`
`noRestrictedImports` block gains `!@peon/core/test-support/areas/*`: the
existing `!@peon/core/test-support/*` does not match a nested path [M,
prototype].

**Mock handle** (`test-support/mock-handle.ts`, changed once). It builds a
`testPort()`, `testStores({ send: port.send })` and the area runtimes, so
every area act exists and is inert. It spreads the area handles, adds
`onAreaEvent`, `triggerAreaEvent(area, event)` and `sent` (the recorded
packets). A test stubs an act with `jest.spyOn(handle.time.act, "query")`.
No area ever edits the mock.

**`areaRig(name, init?)`** (`test-support/area-rig.ts`) registers one
area on a real `OpcodeDispatch` over `testStores()` and a `testPort()`
whose `expect` is the rig's `dispatch.expect`, so an injected reply
resolves an act's wait (contract D8). It returns `{ dispatch, stores,
handle, sent, events, inject }`. `init` takes `now`, `selfGuid`, `dbc`
and `register`. The order is: first `init.register(dispatch, stores)` (a
test that needs the real legacy owner passes that group's register
function here), then a no-op owner, `dispatch.on(op, () => {})`, for each
`uses` opcode where `dispatch.has(op)` is still false, so the area's
peeks attach, then the area's own `register` (contract D24). A legacy
register call after the rig is built would throw "already has a handler".
Every area test and every R22 mock proof uses
the rig. `test-support/mock-world-server.ts` covers socket-level tests.

### 3.10 Harness side

**Log types.** `contract/log.ts` changes once:

```ts
export type CoreDomain = "session" | "control" | /* today's 24 members */ "entity";
export type Domain = CoreDomain | AreaName;
export type LogEvent = CoreLogEvent | `${AreaName}/${string}`;
```

The derivation starts from a core type, so no
harness module can form a cycle with `Domain`. `DOMAIN_GLYPH` becomes
`Record<CoreDomain, GlyphName>`, and `entryGlyph` falls back to the area's
glyph, then to `system` [M, `ui/draw.ts:104,215-218`; the prototype
forces this change with TS7053].

**Router.**

- `subscribeAll` gains `handle.onAreaEvent((e) => route((rc) =>
  areaDrafts(rules, e, rc)))` [M, `events/router.ts:185-220`].
- `attach` gains `route((rc) => attachDrafts(rules, handle, rc))` next to
  the memo reset [M, `:407-409`]. `attach` logs state that arrived before
  the router attached, which fixes the login race for area state.
- `router.test.ts:44` stops pinning 20 and derives the hook list from the
  mock game's `on*` keys [M].
- With a harness rule, `areaDrafts` returns the rule's drafts. With none,
  it returns one fallback draft: class `log`, domain `e.area`, event
  `<area>/<type>`, the event's scalar fields as data, bigints as decimal
  strings.
- **Fallback rows are quiet (N12).** A `log` row never wakes the agent [M,
  `events/router.ts:222-226`], but `journal(about: "log")` returns the
  last 15 rows of the turn and hides only `agent`, `entity`, `snapshot`
  and `tool` [M, `log/query.ts:6,35`]. So fallback rows would crowd the
  agent's history. The fallback draft carries `data.fallback: true`, and
  the journal filter hides such rows. A harness rule opts an area into the
  journal. `domain:<area>` queries still find them [M, `log/query.ts:80-82`].
- **PLAY hand-back note.** The note keeps a game-log row only when its
  event starts with a prefix in `KEPT` [M, `drive/note.ts:7-18,56-60`],
  which lists core prefixes only, so no area row reaches it by default,
  and fallback rows never should. An area whose rule-made rows a driving
  human needs (trade, mail, raid) adds one `<area>/` prefix to `KEPT`, as
  a shared edit.
- **Flood guard.** A rule may return `[]` for a high-rate event. The first
  area with a high-rate opcode (`threat`, `combatlog`) counts rows per
  fight and journal rows per turn in its live proof.
- **Progress (N11).** Progress is a closed set of events plus a 5-yard
  pose change [M, `ops/progress.ts:22-31`], so an area verb at a mailbox or
  auctioneer never counts, and after six calls the tracker logs
  `agent/stuck` [M]. `AreaDraft` gains `progress?: true`; the tracker,
  which already reads every row, counts such rows as progress.

**Harness area contract** (`packages/harness/src/areas/contract.ts`):

```ts
export type AreaDraft = { class: LogClass; name: string; text: string;
  data: Record<string, unknown>; guid?: string; ref?: string; progress?: true };
export type AreaRules<K extends AreaName> = {
  event?: (event: AreaEventOf<K>, rc: RuleInput) => readonly AreaDraft[];
  attach?: (state: AreaState<K>, rc: RuleInput) => readonly AreaDraft[];
};
export type HarnessArea<K extends AreaName, W extends keyof AreaActsOf<K> & string> = {
  readonly area: K; readonly glyph?: GlyphName;
  readonly worldActs: readonly W[]; rules?: () => AreaRules<K>;
};
```

- `defineHarnessArea<K, const W>` infers `W` from the array literal, so
  the allow-list is a type as well as a run-time list [M, prototype].
- The router sets `domain` and `event` from the area and draft name, so a
  harness module mentions no `Domain` or `LogEvent`.
- **`HARNESS_AREAS` is total over `AreaName`.** `areaDrafts` indexes it
  with `e.area: AreaName`, which fails with TS7053 when a key is missing
  [M, prototype]. A compile guard checks it: `[Exclude<AreaName, keyof
  typeof HARNESS_AREAS>] extends [never] ? true : never`. The seed commit
  adds every area's module.
- The harness `registry.test.ts` checks: every key is in `AREA_NAMES`; no
  area name is a key of `DOMAIN_GLYPH`; every `worldActs` entry is a
  function on the mock's `handle.<area>.act`; draft names are snake_case.
- Harness object literals need sorted keys (`useSortedKeys: on`), and
  `mise lint:fix` sorts them [M, prototype].

**World service (N5).** Step 0d edits `world/service.ts` and
`world/hub.ts` and adds `areas/world.ts`.

- `WorldSession.areas` exposes every area's `state` (frozen through the
  existing snapshot wrapper) and `onEvent`, with each subscription
  released when the world handle closes [M, `world/hub.ts:130-158`].
  `EVENT_KEYS` gains `"onAreaEvent"`.
- `Claim.areas` exposes only the acts in each harness module's
  `worldActs`. Each is wrapped by the same guard as the flat actuators:
  the mutex, `not_owner` and `offline` [M, `world/hub.ts:194-205`]. Area
  acts live under `claim.areas`, not `claim.act`, so the flat
  `WorldActuators` that #429's `PlayWorld` uses do not change [M, #429
  `drive/actions.ts`].
- `Sender` is private in `world/service.ts:28` [M]. Step 0d exports it.
- `areaViews` and `areaActs` take the harness registry and the area
  handles as arguments, so `world.test.ts` passes a fixture registry with
  an act that is not listed.
- The change is additive: `version: 1` and `isWorld` stay [M].
- `docs/harness.md` "Extensions" lists the `claim.act` keys and the
  session reads by name [M, `docs/harness.md:281-297` at `71fba0ab`]; 0d
  adds `session.areas` and `claim.areas` there.
- **Cost.** A claim goes through `rt.control.claim`, which preempts runs
  when anyone holds control, and is refused below a higher owner [M,
  `runtime/control-owner.ts`]. So an extension that wants only
  `time.query` or an auction search stops the agent's runs, or is refused
  while the agent holds the character. That matches #423's rule that
  writes go only through a claim [M, issue #423]. Whether a non-moving act
  may skip the claim is a question for the item 6 owner.

**Tools.**

- An area tool is `packages/harness/src/areas/<area>/tool.ts`, built with
  `defineGameTool` [M, `tools/define.ts:488-524`; the spec and module
  types are `tools/game-tool.ts:22-44`]. It keeps its own
  `After` type and renderers in its module: `callRenderer`,
  `resultRenderer` and `callLine` are generic exports of
  `ui/renderers/line.ts`, and `ToolDetailsFor<N, A>` is generic [M,
  `contract/details.ts:300-303`]. Workers do not add types to
  `contract/details.ts` or renderers to shared renderer files.
- **A tool that sends is kind `action` (or `run`), and each send goes
  through `ctx.rt.mutex.run`.** Every existing sending tool does this [M,
  `tools/social.ts:198,372`, `tools/interact.ts:188`, `tools/rest.ts:150`],
  and control admission runs only for `ACTING = {action, run}` [M,
  `tools/define.ts:251,313`], so a sending tool of kind `read` would not
  refuse `human_driving` in PLAY mode, which #427 requires [M, issue #427].
  A `read` tool also runs in parallel [M, `tools/define.ts`
  `executionMode`]. A tool test helper fails when a tool whose `run`
  records a send on the mock handle is kind `read` or `control`.
- **One kind per tool (contract D25).** `GameToolSpec.kind` holds one
  value per tool [M, `tools/game-tool.ts:23-34`]. A tool with any sending
  `do` value is kind `action` (`trade` is `run`). Its read-only `do`
  values (`talents show`, `pet status`, `group status`, `dungeon status`)
  run sequentially and are refused while the human drives in PLAY mode. A
  read that must run in parallel goes on `look` or `journal` under a
  lease.
- **Kind on call records (N10).** Step 0c adds `kind` to the argument of
  `ProgressTracker.afterAction` and to `RepeatCall` [M,
  `contract/services.ts:90-96,108-114`], filled by `tools/define.ts` from
  `spec.kind`. The guards test the kind, and `READS`, `CLEARING` and
  `VERIFYING` go away [M, `ops/progress.ts:20`,
  `ops/repeat-guard.ts:40-49`]. The sets must not be derived from
  `GAME_TOOLS`: that makes a value cycle through `tools/define.ts` and
  `ops/repeat-guard.ts` [M for the imports]. `tools/define.ts` is at 494
  non-blank lines [M, R0], so step 0c keeps its net addition there under
  six lines or first splits the admission code (`admit`, `repeatCall`)
  into a sibling module.
- A tool that starts a background run needs a `RunKind` member and a
  `VERB` entry [M, `contract/runs.ts:1`, `ui/status-line.ts:5`]. A tool
  whose facts also reach the router as `wake` or `passive` rows needs a
  `COVERS` entry [M, `tools/covered.ts:5`].
- Choice rule: a new tool when the area has three or more verbs or its
  own window (mail, trade, auction, raid, dungeon finder); a `do` value
  when one verb fits an existing tool's intent. A `do` value edits that
  tool's module under a lease.
- `GAME_TOOLS` order is the prompt order. A worker appends at the end; the
  coordinator reorders at integration.
- Step 0 rewords `docs/harness.md:5` ("ten game tools") and `:118` ("these
  ten tools") to drop the count. No test pins ten on `main` [M:
  `prompt/guidelines.test.ts` was deleted by #428];
  `prompt/harness-doc.test.ts` requires each tool name in that doc [M].
- **Condition.** This tool model rests on a closed `ToolName` [M, R0:
  `contract/result.ts:1-11` at `71fba0ab`]. #424's body names a later
  slice for extension-provided or MCP-exposed tools ("item 6, slice 4")
  [M, `gh issue view 424`], but no issue exists for it, and the item 6
  handover lists the MCP adapter as a follow-up that needs the
  maintainer's decision [M, R0]. The only `pi.registerTool` call is
  `tools/define.ts:520`, reached through `GAME_TOOLS`; a tool that an
  extension registers with Pi directly is not a game tool. If the
  maintainer later opens that slice, area tools move to its path and this
  subsection is rewritten.

**Evals.**

- A scenario is `packages/harness/src/grader/scenarios/t<tier>-<area>-<slug>.json`
  (plan or code area name) with `id` equal to the file stem. The schema requires `id` to match
  `^t[0-9]-[a-z0-9]+(-[a-z0-9]+)*$` [M, `grader/scenario.schema.json:136`],
  `parseScenario` requires `id` to equal the stem, and `mise lint:docs`
  recognises only ids that match `t\d+-` [M, `stale-docs.ts:88,124-151`].
  One bad file breaks the scenario loader, which runs at import time [M,
  `grader/scenarios.ts:115-121`].
- Evidence selectors must match `^[a-z]+/[a-z_]+\*?$` [M,
  `scenario.schema.json:52`], so select area rows with `<area>/<name>` or
  `<area>/<prefix>*`. A bare `<area>/*` is rejected.
- A scenario with a `spawn` must be in `ROUND_1`: `startSlots` computes a
  slot only from `ROUND_1` and throws `no start slot` otherwise [M,
  `grader/spawn-slots.ts:146-162`]. Spawn points are fixed arrays [M,
  `:19-108`], so each spawn group has a fixed capacity. Area scenarios are
  appended at the end of `ROUND_1` (N7). A scenario with no `spawn` needs
  no slot.
- Shared appends per eval: a `ROUND_1` entry, a `docs/evals.md` row and a
  `docs/capabilities.md` row. They resolve as "keep both".

### 3.11 What a worker edits

The seed commit has already created the directory, `opcodes.ts`, an empty
`area.ts`, both registry lines, the harness module and the coverage file.

**Files the worker owns:**

| Path | When | Holds |
|---|---|---|
| `packages/core/src/wow/areas/<area>/opcodes.ts` | always | deletes own `stubs` lines; fills `unseen`, `dead`, `uses` |
| `.../areas/<area>/protocol.ts` + test | always | parsers, `PacketWriter` builders, wire enums; tests from packets built from the AzerothCore writer |
| `.../areas/<area>/store.ts` + test | always | state, `Emitter`, `snapshot`, `onEvent`, `dispose`, the `receive*` methods handlers call |
| `.../areas/<area>/runtime.ts` + test | when the area sends or waits | acts, `expect` and `until` waits, request timeouts, `listen` subscriptions |
| `.../areas/<area>/area.ts` | always | `defineArea({ name, opcodes, store, register, runtime })` |
| `.../areas/<area>/<part>.ts` | before a file reaches 500 non-blank lines | a split by responsibility |
| `packages/core/test-support/areas/<area>.ts` | when tests share packets | builders |
| `packages/harness/src/areas/<area>/area.ts` + test | when the area needs `wake` or `passive` rows, journal rows, login-time state or world acts | `defineHarnessArea(...)` |
| `packages/harness/src/areas/<area>/tool.ts` + test | when the area adds a tool | a `defineGameTool` module |
| `packages/harness/src/grader/scenarios/t<tier>-<area>-<slug>.json` | when the area adds a verb (R9) | the scenario |
| `docs/areas/<area>.md` | always | wire facts where AzerothCore and wow_messages differ, what is left out and why, the proposed capabilities row |
| `docs/protocol-coverage/<area>.md` | always | regenerated by `mise protocol:coverage` |

**Shared edits, per case:**

| Case | Shared edits |
|---|---|
| Parse-only area | none |
| Plus harness rules or world acts | none |
| Plus rule-made rows the PLAY hand-back note shows | `KEPT` in `drive/note.ts` (1 line) |
| Plus a new tool | `ToolName` (1 line), `GAME_TOOLS` (1 line), `docs/harness.md` (the tool name and one line) |
| Plus a tool whose facts also reach the router | `COVERS` |
| Plus a tool that starts a background run | `RunKind`, `VERB` |
| Plus an eval | a `ROUND_1` entry, `docs/evals.md`, `docs/capabilities.md` |
| Plus a `do` value on an existing tool | that tool's module, under a lease |
| Plus a change to a legacy parser | that legacy file, under a lease |
| Plus a truth pick | `grader/truth.ts`, `scenarios.ts` `TruthPick`, the schema, `draft-fill.ts` (under the `tooling-truth` owner) |
| Plus a puppet method | `puppet/calls.ts` only |
| Plus a probe flow | a new file in `packages/devtools/src/probe-flows/` |
| User-visible behaviour change | `README.md` and the matching `docs/*.md` prose |

A worker never edits: both registries, `contract.ts`, `compose.ts`,
`port.ts`, `client.ts`, `client-handlers.ts`, `session-stores.ts`,
`world-events.ts`, `runtime.ts`, `client-connection.ts`, `world-conn.ts`,
`index.ts`, `protocol/stubs.ts`, `protocol/world.ts` (except the
`SMSG_CHAR_ENUM` parser under the `session` lease, never the
`OpcodeDispatch` class; contract D21), `mock-handle.ts`,
`mock-game.ts`, `events/router.ts`, `router.test.ts`, `contract/log.ts`,
`ui/draw.ts`, `world/service.ts`, `world/hub.ts`,
`packages/core/package.json`, `biome.json`, `docs/protocol.md`,
`docs/protocol-coverage.md`. When a worker needs a new member on a shared
test fake or a shared read view, it stops with a `blocked` report and the
coordinator adds the member in one commit (section 6.4).

**The worker loop.**

1. Read `opcodes.ts`, the area's subsection in section 5, and the area
   brief.
2. Write parsers from the AzerothCore writer; AzerothCore wins over
   wow_messages. Build test bodies in `test-support/areas/<area>.ts` and
   test with `areaRig`.
3. Add store, events, runtime and acts. Delete own stubs.
4. `mise protocol:coverage`, then `mise ci`.
5. Live proof on throwaway accounts from `soap create`, through their
   `tmp/puppet-<ACCOUNT>` wrapper, with the tools of section 4. An opcode
   the worker cannot make the server send goes into `unseen`, with an
   `areaRig` or mock-world-server test built from the AzerothCore writer
   and the writer's `path:line` in the proof record (R22).
6. If the area adds a verb: the tool, a scenario, the doc rows and an eval
   run (R9).

### 3.12 Absent opcodes and legacy files

**Absent opcodes.** Step 0 adds the 10 relevant absent opcodes to
`CORE_OPCODES` in `packages/devtools/src/protocol-tables.ts` and
regenerates `protocol/opcodes.ts`, in one commit, so no worker edits the
two shared files. The implementer rechecks each number against
`Server/Protocol/Opcodes.h` first.

**Legacy leases (N14).** Some areas change bodies that legacy code
already parses: the `SMSG_GROUP_LIST` fields in `protocol/group.ts`, the
`SMSG_SHOWTAXINODES` node mask in `gameplay-handlers.ts`, the
`CMSG_CAST_SPELL` targets in `protocol/spell.ts`, the `CMSG_USE_ITEM`
targets in `protocol/item.ts`, and others listed per area in section 5.
The coordinator keeps a lease table: one legacy file, one area task at a
time; the coordinator hands the lease on when that task lands (contract
D12). The holder edits the file in place and keeps the legacy handler as
the owner. A second task that needs the file waits.

- `WorldConn` state (party, friends, ignore, guild, chat) is not in
  `CoreStores` [M, `world-conn.ts:15-48`]. Step 0a adds read views of it
  as `legacy: LegacyViews` on the runtime context and the port (sections
  3.3, 3.6; contract D5), so no coordinator commit adds them later.
- Control, self movement, `control*.ts`, `movement-handlers.ts` and
  `remote-motion*.ts` came from item 6. Areas that write control state go
  last in their band, with a reviewer who knows the item 6 control code.
  The import scan fails on `GameOpcode.(CMSG|MSG)_MOVE_` in area sources;
  such sends go through a lease on the control files.

### 3.13 Worked example: `time`

`time` exercises every attachment point: a handler, a store with state
and events, a client send with an awaited reply, a core store
subscription and the `attach` path. `threat` becomes the first area of
wave 1, where it proves the flood guard.

**Wire** [M, AzerothCore `deployed`]:

- `SMSG_LOGIN_SETTIMESPEED` (0x042): packed game time `uint32`, speed
  `float` (0.01666667), then `uint32` 0. Writer: `Entities/Player/Player.cpp:11803-11807`.
  Packed layout `(year-100)<<24 | month<<20 | (day-1)<<14 | weekday<<11 |
  hour<<6 | minute` (`src/server/shared/Packets/ByteBuffer.cpp:137-141`).
- `CMSG_QUERY_TIME` (0x1CE): empty body, handled in place when logged in
  (`Server/Protocol/Opcodes.cpp:593`).
- `SMSG_QUERY_TIME_RESPONSE` (0x1CF): `uint32` server Unix time, then
  `uint32` seconds until the daily quest reset
  (`Server/Packets/QueryPackets.cpp:47-53`, `QueryPackets.h:71-72`,
  `Handlers/QueryHandler.cpp:72-85`).

**Files.** Core `protocol/packed-time.ts` with `PackedTime`,
`parsePackedTime` and `readPackedTime`, and tests including a packed-time
round trip; `guild` adds the writer there later under a lease (contract
D10). Core `areas/time/`: `opcodes.ts`; `protocol.ts` with
`parseLoginSetTimeSpeed`, `parseTimeQueryResponse` and tests; `store.ts`
with `TimeState = {
gameTime, speed, serverTime, dailyResetInSec, receivedAt }` and events
`set_speed` and `query_reply`; `runtime.ts` with `act.query()` (send,
`expect`, timeout) and one query on `core.self.onEvent` `login_verified`
[M, `self-store.ts:16`] (N6); `area.ts`; `test-support/areas/time.ts`.
Harness `areas/time/area.ts`: `worldActs: ["query"]`, an `attach` rule
and an `event` rule that each write one `log` row `time/synced`.
`docs/areas/time.md`.

**Live proof.** One login of a throwaway character. The game log shows a
`time/synced` row from `attach` and one whose data carries
`dailyResetInSec` (only the reply has it). A throwaway extension loaded
with `--extension` takes a `loop` claim, while no agent turn holds
control, and calls `claim.areas.time.query()`. No eval: `time` adds no
agent verb (R9). Without N6 the proof uses the extension call alone.

### 3.14 Migration

Nothing moves while workers fan out.

| Domain | Decision | Reason |
|---|---|---|
| action bar | stays flat | `getActionBar` is in #425's `READ_KEYS` [M, `world/service.ts:32-55`], and #429 reads it |
| party, friend, ignore, guild, chat, entity, remote motion | stay | their state is on `WorldConn` [M]; new raid, dungeon finder, guild bank or calendar opcodes become new areas |
| control, self movement, combat, quests, rewards, loot, items, recovery, place, update object | stay core | item 6 owns control; the rest are read by many harness rules |
| destroy, trainer, vendor | candidates after item 4 | about 1,320 moved lines and 25 harness call sites |

`docs/protocol.md` says that new work uses areas only. Its "Add an
opcode" section becomes "Add an area", with the worker loop and the file
table, and its "Session stores" paragraph names the core stores and says
that area stores live under `stores.areas`, listed in
`areas/registry.ts`. That removes the per-store sentence every area would
otherwise edit.

### 3.15 Test plan for step 0

All in `mise ci` unless marked live.

Core, `areas/registry.test.ts`:

1. Directories match the registry; each key equals its module's `name`;
   each name matches the naming rule.
2. Ownership is a partition; every name is a `GameOpcode` key; `stubs`,
   `dead` and `unseen` are subsets of `owns`; no area owns or peeks the
   two late logout opcodes.
3. Registered opcodes are owned: each area registers alone on a recording
   dispatch; each `on` opcode is in `owns`, each `peek` opcode in `uses`.
4. Named opcodes are owned or used: each `GameOpcode.<NAME>` in an area's
   non-test source.
5. Import scan: value imports only from the allow-list (`#lib/*`,
   `#wow/protocol/*`, `#wow/areas/contract`, own directory, leaf helpers
   such as `#wow/geometry`); no cross-area import; no type import of
   `WorldHandle`, `SessionStores`, `WorldEvents` or `#wow/areas/compose`;
   no `GameOpcode.(CMSG|MSG)_MOVE_`.
6. Stub move: each of the 57 frozen pairs is in the union or registered
   by an area handler.
7. Event types: each area's event `type` values match `/^[a-z_]+$/`; the
   area exports its type names as a value for this check.

Core, `compose.test.ts` and existing tests:

8. Stub shadow: no handler registers an opcode in the merged stub list.
9. Exactly once: unchanged except that its fake dispatch gains `peek`; a
   new case registers two fixture modules that own one opcode through
   `registerModules` and expects the "already has a handler" throw.
10. Peek: runs after the owner and after the waiter step, on a fresh
    fork; not when the owner throws; a throwing peek reports
    `packetError`, leaves the waiter resolved and does not stop the next
    peek; a peek with no owner throws; `has()` ignores peeks.
11. Inert build: every registered area built over `testPort()` with a
    throwing `send` and fake timers sends nothing and arms no timer.
12. Lazy port: `registerGameHandlers` with a fake `{ dispatch }` and the
    coverage generator's `{ dispatch, events }` fake do not throw.
13. Fan-in and order: the runtime listener runs before the forwarder;
    `onAreaEvent` gets `{ area, event }`; `handle.<area>.onEvent` gets
    only its area; a listener throw becomes `packetError`.
14. `until`: resolves on a match, rejects on timeout, on abort, and when
    the lifetime signal aborts at dispose.
15. Lifecycle: `cleanupSession` clears `conn.events.area`, disposes area
    runtimes, then area stores.
16. Mock handle: `handle.time` has `state`, `onEvent`, `act.query`;
    `triggerAreaEvent` reaches both hooks; an act records a packet in
    `sent`.
17. Types: `mise typecheck` passes with `typecheck-fixture.ts` (two
    areas); `AREA_NAMES_FREE` compiles; a scratch area named `halt` fails
    to compile. Measure `mise typecheck` time before and after.

Coverage:

18. Per-file staleness and no extra file.
19. Statuses: an owned, unimplemented opcode renders `missing`; `dead`
    renders `dead`; `unseen` renders `not seen live`; a remaining area stub
    renders `stub`; the three `time` opcodes render `handled`.

Harness:

20. Log types and glyphs: an area row gets its area's glyph, then
    `system`.
21. Fallback row: `log` class, `<area>/<type>`, scalar data, bigints as
    strings, `data.fallback: true`; hidden from `journal(about: "log")`;
    found by `domain:<area>`. A rule replaces it; a rule returning `[]`
    gives no row.
22. Attach: `time`'s stored state writes one `time/synced` row.
23. Router hooks: the list is derived; `onAreaEvent` is subscribed on
    attach and removed on detach.
24. Harness registry: sorted keys; total over `AREA_NAMES` (compile
    guard); no area name is a core domain; every `worldActs` entry exists.
25. Progress: a draft with `progress: true` counts; guards use the call
    record's `kind`.
26. World service: `session.areas.time.state()` returns a frozen copy;
    `claim.areas.time.query` refuses with `not_owner` and `offline`; a
    fixture act that is not in `worldActs` is absent at run time and, by a
    `@ts-expect-error` line, from the type; subscriptions are released on
    close.
27. Docs: `prompt/harness-doc.test.ts` passes after the "ten" rewording;
    `mise lint:docs` passes over `docs/areas/time.md`.

Live:

28. The `time` proof of section 3.13.
29. `t1-walk-to-npc` passes; `t7-halt-resume` passes or fails only from
    the known stale wake; `t3-ghostlands-kill` and the other regression
    scenarios show no new failure cause against the R0 baseline (see
    6.6; contract D17). Every item 6
    issue gated on both [M, issues #423, #424, #427], and step 0 edits the
    router, the log contract and the world service they pass through.
30. `mise ci` green on the step-0 head.

### 3.16 Size and commit order [I]

| Commit | Content | Files | Hand-written lines |
|---|---|---|---|
| 0a core mechanism | `areas/contract.ts`, `compose.ts`, `port.ts`, `registry.ts`, `typecheck-fixture.ts`, tests, `test-support/area-rig.ts`; `OpcodeDispatch.peek`; one-time edits to `session-stores.ts`, `world-events.ts`, `client-handlers.ts`, `client.ts`, `runtime.ts`, `index.ts`, `mock-handle.ts`, `protocol/stubs.ts`, `packages/core/package.json`, `biome.json` (two overrides) | ~24 | ~800 new, ~130 changed |
| 0b coverage and names | `protocol-coverage.ts` and test, the index and per-area files, `CORE_OPCODES` and regenerated `protocol/opcodes.ts`, `stale-docs.ts`, `docs/protocol.md` "Add an area", "Session stores" and the one reference-list entry that R5 specifies | ~10 | ~220 plus moved rows |
| 0c harness mechanism | `harness/src/areas/contract.ts`, `registry.ts`, `rules.ts` and tests; edits to `contract/log.ts`, `ui/draw.ts`, `events/router.ts` and test, `log/query.ts`, `ops/progress.ts`, `ops/repeat-guard.ts`, `contract/services.ts`, `tools/define.ts`, `docs/harness.md` | ~16 | ~450 |
| 0d world service | `harness/src/areas/world.ts` and test, `world/service.ts`, `world/hub.ts` and test, `docs/harness.md` "Extensions" (`session.areas`, `claim.areas`) | ~6 | ~160 |
| 0e worked example | `time` core (8 files), harness (2), `docs/areas/time.md` | ~11 | ~500 |
| **Total** | | **~67** | **~2,260** |

All of it lands as commits in the draft PR, after item 6 fully merged,
in the order 0a to 0e, then the wave 1 seed commit. The proof tooling of
section 4 lands beside it as separate commits.

## 4. Proof tooling

Rule 9 asks for a live run that shows the server sending or accepting
each opcode. Today nothing can show that. No packet trace or capture
exists in `packages/` [M]. A stub notice that arrives before the harness
subscribes is lost [M, `client-handlers.ts:179-187`,
`protocol/stubs.ts:86-89`]. The puppet cannot send a client opcode [M,
`puppet/args.ts:3-16`]. No committed tool runs one flow on a live
character. Seven tools close these gaps. All of them are code, so none
lands before item 6 merges.

### 4.1 `tooling-tap`: packet trace and counters (N15)

- A new core file `packet-trace.ts` defines `TraceRow` (`at`, `dir`,
  `opcode`, `size`, optional `body`, `via: "compressed"`, `outcome`
  `handled`, `unhandled`, `error` or `skipped`), `TraceSink` (`bodies`,
  `row`, optional `attach(send)` and `close(counts)`) and `PacketCounts`.
- Hook points, about 40 lines: `ClientConfig.trace`; one `in` row per
  packet in `drainWorldPackets` [M, `client-connection.ts:45`]; one `out`
  row in `sendPacket` [M, `world-handlers.ts:24-31`]; a size-only row for
  `CMSG_AUTH_SESSION`, never its body [M, `client-connection.ts:92`]; one
  row per inner `SMSG_COMPRESSED_MOVES` packet, with `skipped` for dropped
  ones [M, `remote-motion-handlers.ts:47-52`]; a `seen` map and `counts()`
  on `OpcodeDispatch` [M, `protocol/world.ts:181,197-199,264-271`];
  `close(counts)` in the `close` hook, which runs for logout, close and a
  dropped socket [M, `client.ts:394-400`]. `session.ts` exports the types
  and `opcodeName`.
- **Notice replay.** `notify` pushes a notice to `conn.pendingNotices`
  (cap 64) when no one subscribes, and `onNotice` replays them to the
  first subscriber with their first `at`. This fixes the lost login
  stubs; the trace, not the notice, is the proof.
- **Harness sink** (`harness/src/log/packet-trace.ts`): flag
  `--packet-trace off|headers|bodies`, default `off`. `headers` and
  `bodies` write `packets.jsonl` in the run directory; counters are always
  on and write `packets.json` at close. Rows are buffered and appended at
  most once a second. `docs/harness.md` gains the flag and two run-dir
  rows.
- **Grader (N18).** `harnessCommand` passes `--packet-trace headers` [M,
  `grader/pane.ts:45`], so every eval run carries packet evidence.
- Safety: `CMSG_AUTH_SESSION` has no body row; whisper text is in bodies;
  `leakCheck` already scans the run directory for the password [M,
  `grader/truth.ts:260-281`]. The first live run with `headers` measures
  the row rate and records it.
- Size: core about 120 lines and 150 of tests; harness about 110 and 100.

### 4.2 `tooling-probe`: send and observe (N16)

`packages/devtools/src/probe.ts`, run as `mise protocol:probe`:

```
mise protocol:probe <ACCOUNT> [--send <OPCODE> [--body <hex>]]...
    [--flow <name> [--arg <key>=<value>]...] [--wait <s>] [--until <OPCODE>]...
    [--expect <OPCODE>]... [--bodies] [--out <dir>]
```

- It logs in with `authWithRetry` and `worldSession` from
  `@peon/core/session`, the pair the harness uses [M,
  `harness/src/runtime/connection.ts:43-46`], with the account's own
  config from `soap create` [M, `packages/factory/src/soap-wrapper.ts:10-23`].
  The account must match `^FAC[0-9A-F]{10}$` [M, `soap.ts:49`]. It refuses
  while that account's puppet runs.
- `--send` takes a `GameOpcode` name or hex, sent through the trace sink's
  `attach` sender after login. `--expect` makes the exit code 3 when an
  opcode never arrived. It always logs out and waits for `closed`.
- Output is one JSON object: sent packets, received opcodes with counts
  and first arrival, notices, packet errors, missing expectations, and the
  trace paths. Exit codes: 0 done, 1 login or I/O failure, 2 usage, 3 an
  expected opcode did not arrive.
- Flows are one file each in `packages/devtools/src/probe-flows/`, found
  by glob, so an area worker adds a flow without a shared edit. First
  flows: `login`, `nearest <kind>`, `talk <entry>`.
- Size: about 240 lines and 200 of tests, one `mise.toml` task, a
  paragraph in `docs/testing.md` "Live characters".

### 4.3 `tooling-gm`: GM staging over SOAP (N17, R12)

- SOAP commands run as console commands with no session, so RBAC does not
  gate them [M, `src/server/apps/worldserver/ACSoap/ACSoap.cpp:121`,
  `Chat/Chat.cpp:58-61`]. Commands marked `Console::No` are refused on
  the console [M, `Chat/ChatCommands/ChatCommand.cpp:513`]: `.learn`,
  every `.modify` (money, reputation, talent points, fly speed), every
  `.cheat` (including `taxi`), `.die`, `.appear`, `.summon`, `.go xyz` and
  `.titles` [M, `src/server/scripts/Commands/cs_*.cpp`].
- New verb `mise factory soap gm <ACCOUNT> <verb> [args...]`, in
  `packages/factory/src/soap-gm.ts`, with an allow-list of templates. The
  tool fills the character name from the account; the worker never types
  a target:

  | Verb | Console command |
  |---|---|
  | `level <n>` | `character level <C> <n>` |
  | `tele <tele>` | `tele name <C> <tele>` |
  | `learn` / `unlearn <spell>` | `player learn <C> <spell>` / `player unlearn <C> <spell>` (online only) |
  | `items <id>:<n>...` | `send items <C> "Peon" "staging" <id>:<n>...` |
  | `money <copper>` | `send money <C> "Peon" "staging" <copper>` |
  | `mail <subject>` | `send mail <C> "<subject>" "staging"` |
  | `quest <add\|complete\|reward\|remove> <id>` | `quest <op> <id> <C>` |
  | `revive`, `kick`, `combatstop`, `reset-talents` | `revive <C>`, `kick <C>`, `combatstop <C>`, `reset talents <C>` |
  | `achievement <id>` | `achievement add <id> <C>` |
  | `guild-create <name>` / `guild-invite <ACCOUNT2> <name>` | `guild create <C> "<name>"` / `guild invite <C2> "<name>"` |
  | `arena-create <2\|3\|5> <name>` | `arena create <C> "<name>" <type>` |
  | `read <group\|mail\|pet\|titles\|reputation\|pinfo>` | the read commands |

- Guards: every account matches the factory pattern, has a ledger entry,
  and the entry's `root` equals the current worktree [M, `soap.ts:35,
  215-218,243-246,330-337`]; that is the rule-10 test "accounts the worker
  created". Numbers are integers in range. Free text matches
  `^[A-Za-z0-9 ]{1,24}$`. Guild and arena names start with `Fac`.
- `soap.ts` exports one guarded runner, `consoleCommand`, imported only by
  `soap-gm.ts`. Every command appends a line to
  `~/.local/state/peon-factory/gm.log`, the R12 record.
- Not stageable over SOAP: taxi nodes (fly the route, or a new realm
  service endpoint), reputation while online (use the offline `rep`
  endpoint), talent choices (only a reset), a dead or ghost character (let
  a creature kill it), and anything that acts on the shared world.
- `soap gm` is for worker proof only, never inside an eval; eval staging
  stays with the offline `setup` endpoints [M, `docs/evals.md:46-49`].
- **No GM chat path.** A dotted chat message from a GM-level character
  would run `Console::No` commands on itself [M,
  `Handlers/ChatHandler.cpp:302-307`], but R12 says "via SOAP", and GM
  mode changes what the server sends: a player cannot invite a GM-mode
  character [M, `Handlers/GroupHandler.cpp:105`]. No area depends on it.
- Size: about 120 lines and 150 of tests.

### 4.4 `tooling-partner`: partner characters

- The grader supports one partner today [M, `grader/scenarios.ts:63`,
  `grader/partner.ts:42-92`]. The puppet holds a full `WorldHandle` but
  answers only `status`, `read`, `nearby`, `whisper`, `stop` [M,
  `puppet/protocol.ts:12-17`].
- Puppet additions: `call <method> [json-array]` over an allow-list in
  `puppet/calls.ts` (first `invite`, `uninvite`, `leaveGroup`,
  `setLeader`, `acceptInvite`, `declineInvite`, `guildInvite`,
  `acceptGuildInvite`, `declineGuildInvite`, `sendSay`, `sendParty`,
  `sendRaid`, `selectTarget`, `rollLoot`); `events --json`; `raw <OPCODE>
  [hex]` through the trace sender; `start --packet-trace`. Area workers
  add methods only in `calls.ts`.
- Server rules [M]: raid convert needs a leader and two members, not an
  LFG group (`Handlers/GroupHandler.cpp:663`); trade needs
  `TRADE_DISTANCE` (`Handlers/TradeHandler.cpp:256-258`), so both
  characters are staged at one point before login; partners are never GM
  accounts.
- Multi-partner evals (`partners: [...]`) touch `scenarios.ts`, the
  schema, `accounts.ts`, `run.ts` and `partner.ts`, about 120 lines and
  150 of tests. They land with the first `group` or `instances` eval.

### 4.5 `tooling-truth`: truth fields

- `parseTruth` keeps 18 fields [M, `grader/truth.ts:22-49,148-176`], and
  `TruthPick` lacks `spells` [M, `grader/scenarios.ts:29-35`]. The first
  step is one `soap truth` on a fresh account, saved as a fixture, because
  whether today's service returns `hearth`, `reputation`, `mail` and item
  `durability` could not be determined without a live call.
- Peon-side picks: `spells`, `equipment`, `bank`, `reputation`, `mail`,
  `hearth`, `durability`. About 80 lines and 120 of tests.
- Service fields the maintainer must add (one batch request): taxi nodes,
  talents and glyphs, group layout, guild, pets, instance binds,
  achievements, rest and explored zones. Until then areas prove these
  through packet evidence, which `docs/evals.md:12-16` already accepts.
- A console-read check source (`source: "console"`) over `soap gm read`
  is a fallback, because console text depends on server strings.

### 4.6 `tooling-names`: the soap name collision (N19)

`newNames` uses 8 hex digits of the current second and one random byte
[M, `soap.ts:179-205`], so two creates in one second collide with
probability 1/256, and the loser aborts with `soap_create` [M,
`grader/accounts.ts:91-95`]. `createAccount` retries with fresh names up to
8 times when the reply matches `/already exist/i`. About 25 lines and 60
of tests.

### 4.7 `tooling-cite-check` (N20), and no layout comparator (N21)

`mise protocol:cite-check` reads the AzerothCore `path:line` citations a
PR adds to its proof record and `docs/areas/*.md`, and checks that each
file exists, the line is inside it, and the enclosing function names the
cited opcode or its handler. It takes the checkout from
`PEON_AZEROTHCORE_DIR` or `~/code/azerothcore-wotlk-playerbots`. It is a
worker and reviewer tool, not part of `mise ci`, because CI hosts may lack
the checkout. About 80 lines and 60 of tests.

A layout comparator between AzerothCore writers and Peon parsers is not
built: 29 % of the 2,468 write lines have no explicit cast, and helpers
and conditions defeat a regex [M, `rg` counts], so it would give false
confidence on exactly the packets that need care.

### 4.8 What lands before the first area

| Order | Tooling | Why first | Size (code + tests) [I] |
|---|---|---|---|
| 1 | `tooling-names` | parallel workers create accounts in the same second | 25 + 60 |
| 2 | `tooling-tap` with the notice replay and `counts()` | every live proof reads it | 230 + 250 |
| 3 | `tooling-probe` with `login`, `nearest`, `talk` | the cheapest live proof for client and passive server opcodes | 240 + 200 |
| 4 | `tooling-cite-check` | R22 proof needs it from the first mock proof | 80 + 60 |
| 5 | `tooling-gm` | NS2 staging; may land just after the first NS1 areas start | 120 + 150 |

Alongside the areas:

| Tooling | Lands with |
|---|---|
| Puppet `call`, `events`, `raw`, `--packet-trace` | before the first parties-and-raids area |
| `tooling-truth` Peon-side picks | the first eval that needs a pick |
| Multi-partner evals | the first `group` or `instances` eval |
| Console-read check source | the first eval that needs group, guild or pet state before the service fields exist |

Deferred: the layout comparator, the new realm-service fields (one
request to the maintainer), and the GM chat path (needs a maintainer
ruling).

The tap edits `client.ts`, `client-handlers.ts`, `client-connection.ts`,
`world-conn.ts` and `world-handlers.ts`, which item 6 also touched. It
branches from `main` after item 6 merges and lands before any area
branches. Total before the first area: about 700 lines of code and 720 of
tests [I].

## 5. Areas

Twenty plan areas give 45 code areas. The subsections 5.3 to 5.22 follow
the research order; the table below gives the build order under R15.
Each subsection states the rows, why the area matters, its store, events
and acts, its verbs, evals, body gaps, wire disagreements with
wowm (AzerothCore wins in each), tasks with their wave, live proof, dead
opcodes, decisions and risks. Line citations to AzerothCore are relative
to `src/server/game/` unless they start with `src/`, `data/` or
`modules/`; wowm files are under `wow_message_parser/wowm/world/`.

### 5.1 Code-area names and waves

**Naming (N9).** A code-area name is one lowercase word that is not a
harness core domain, not a `CoreHandle` key (`who` and `halt` are) and not
`onAreaEvent`. Plan areas whose name breaks the rule are split or renamed:

| Plan area | Code areas |
|---|---|
| `items`, `objects`, `quests`, `travel`, `threat`, `spells`, `talents`, `pets`, `vehicles` | same name; `vehicles` adds `transports` |
| `self-state` | `selfstate` (plus leases on the control files) |
| `combat-log` | `combatlog` |
| `remote-motion` | `unitmotion` |
| `group` | `raid`, `looting` (the party code stays legacy) |
| `instances` | `instances`, `lfg` |
| `world` | `time` (step 0), `reputation`, `ambience` |
| `session` | `login`, `account`, `charscreen`, `appearance`, `tickets`, `guard` |
| `economy` | `trade`, `mail`, `bank`, `auction`, `buyback` |
| `guild` | `guildadmin`, `guildbank`, `charters`, `calendar` |
| `social` | `achievements`, `emotes`, `contacts`, `inspect`, `channels`, `complaints`, `referral` |
| `pvp` | `battlegrounds`, `arena`, `wintergrasp` |

The coordinator seeds a wave's code areas in one commit (N2) and may
split or merge them then; the table is the starting point.

**Waves (R15).**

1. **Wave 1, levels 1-10 (NS1).** `threat` first as the pilot. Then
   `items` (1-5, 8), `objects` (1-5, 7, 8, 10, 11), `quests` (1-6, 9),
   `travel` (1, 5), `selfstate` (1-5, 11), `combatlog` (1, 6, 7), `spells`
   (1, 3-6, 12), `world` (1-3, 5, 7, 8), and the cheap passive cleanup
   pulled forward: `session` 1, 2, 5, `looting` (group-4), `talents` 1,
   `instances` 1, `pets` 1-2, `unitmotion` 1-2, `social` 1-2, `buyback`
   (economy-1, 2).
2. **Wave 2, parties and raids.** `raid` and `looting` (group 1-3, 5-7, 9,
   10), `instances` and `lfg` (2-8, 10, 11), `trade` (economy 3-5),
   `quests` 7-8, `combatlog` 2-3, `spells` 2, 8, 13, `pets` 3, 9,
   `selfstate` 7, 9, `unitmotion` 3, 4, 7.
3. **Wave 3, levels 1-80 (NS2).** `talents` 2-5, `pets` 4-7, 10-12,
   `travel` 2-4, 6, `items` 6, 7, 9, `spells` 7, 9, 14, `selfstate` 6, 10,
   `raid` summons (group 8, 11), `mail` and `bank` (economy 6-10),
   `social` 3, 14, `world` 6 (phase), then `vehicles` and `transports`
   last in the band, because they change control.
4. **Wave 4, long tail.** The rest: `guild`, `pvp`, `session` 3, 4,
   6-14, `social` 4-13, 15, 16, `auction` (economy 11-13), `items` 10, 11,
   `objects` 6, 9, `quests` 10, `combatlog` 4, 5, 8, `spells` 10, 11,
   `pets` 8, `lfg` raid browser (instances 9), `unitmotion` 5, 6, `world`
   4, 9, 10, `selfstate` 8.

If time runs out, what is left is the least useful (R15).

### 5.2 Area table

In build order. "Rel / dead" counts the relevant and dead rows after the
verified floor (N13); "S/M/A" is stub, missing and absent among the
relevant rows. Goals: L levelling, P parties and raids, D direct drive,
- none. Eval ids follow `t<tier>-<area>-<slug>` with the id equal to the
file stem; tiers are proposals (t8 character building, t9 groups,
economy and PvP) until the plan index lists the scenario, which fixes its
tier; nobody renumbers after landing (contract D14).

| # | Plan area | Code areas | Goal | Rel / dead | S/M/A | Tasks | Verbs and tools | Evals | Live proof |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `threat` | `threat` | P, L | 7 / 0 | 0/7/0 | 3 | none (`look`, danger, log) | none | any fight with a hunter pet; R22 for alert and target breaks |
| 2 | `items` | `items` | L | 35 / 0 | 2/32/1 | 11 | new `gear`; `journal` bags | `t8-items-*` (8) | probe and `items/add`; truth rows |
| 3 | `objects` | `objects` | L, P | 11 / 0 | 1/10/0 | 11 | new `use`; `look`, `travel`, `interact` objects | `t4-objects-quest-elwynn`, `t0-objects-read-shrine`, `t4-objects-explore-fargodeep` | quest objects, shrine, triggers 78 and 88 |
| 4 | `quests` | `quests` | L, P | 17 / 1 | 0/17/0 | 10 | `look`, `journal`, `interact`, group tool | `t4-quests-*` (2), `t1-quests-*` (2), `t8-quests-*` (2) | natural play near quest givers; two characters for sharing |
| 5 | `travel` | `travel` | L, D | 14 / 1 | 1/13/0 | 6 | `interact bind`, `travel hearth`, `travel fly` | `t8-travel-bind-inn`, `t8-travel-hearth-home`, `t8-travel-fly` | Blood Elf flights, innkeeper, tap |
| 6 | `self-state` | `selfstate` + control lease | D, L, P | 34 / 5 | 0/33/1 | 11 | `recover how:self`; `spell mount/dismount` | `t6-selfstate-res`, `t9-selfstate-mount` | death set with a partner witness; R22 for gravity, hover, pitch |
| 7 | `combat-log` | `combatlog` | P, L | 17 / 3 | 5/12/0 | 8 | none (tally, totals, Jev, vitals) | none | fights, potions; R22 for combo points, dispels, instakill |
| 8 | `spells` | `spells` | L, D, P | 25 / 3 | 1/23/0, +1 handled by #422 | 14 | new `spell`; `stop` ends channels | `t4-spells-*` (5) | mage channels and buffs; R22 for totems, runes |
| 9 | `world` | `time`, `reputation`, `ambience` | L | 24 / 3 | 6/18/0 | 10 | `journal about:reputation` | `t4-reputation-gain` | logins, zone change, quest reputation; R22 for sound, light, phase |
| 10 | `session` (cleanup first) | `login`, `account`, `charscreen`, `appearance`, `tickets`, `guard` | - | 68 / 11 | 4/59/5 | 14 | none | none | probe flows; R22 for failures and admin-only replies |
| 11 | `remote-motion` | `unitmotion` | P, D | 25 / 0 | 0/24/1 | 7 | none (`look` words) | none | kills, snares, roots; R22 for most toggles |
| 12 | `group` | `raid`, `looting` | P | 19 / 3 | 3/16/0 | 11 | new `group` (with `roll`) | `t9-raid-*` (7) | two `eversong10` characters |
| 13 | `instances` | `instances`, `lfg` | P, L | 46 / 1 | 5/41/0 | 11 | new `dungeon` | `t9-instances-reset`, `t9-instances-difficulty`, `t9-lfg-queue`, `t9-lfg-run` | Deadmines teleports, probes, five characters |
| 14 | `economy` | `trade`, `mail`, `bank`, `auction`, `buyback` | P, L | 46 / 1 | 9/37/0 | 13 | new `trade`, `mail`; `interact` bank, buyback, auction | `t5-buyback-vendor`, `t9-trade-*` (4), `t9-mail-*` (3), `t9-bank-*` (3), `t9-auction-*` (5, optional) | two characters, `soap gm` letters, banker, auctioneer |
| 15 | `talents` | `talents` | L, P | 5 / 2 | 1/4/0 | 5 | new `talents`; `interact reset_talents` | `t8-talents-spend`, `t8-talents-reset`, `t8-talents-glyph` | level 12 and 15 characters |
| 16 | `pets` | `pets` | L, P | 30 / 5 | 0/29/1 | 12 | new `pet`; `interact` stable | `t8-pets-*` (6) | hunter preset; R22 for warlock sounds |
| 17 | `vehicles` | `vehicles`, `transports` | L, P, D | 14 / 0 | 0/14/0 | 9 | new `vehicle`; `travel ride` | `t8-vehicles-board`, `t8-vehicles-zeppelin`, `t8-vehicles-drive` | spell-click vehicle, Siege Tank, zeppelin |
| 18 | `social` | `achievements`, `emotes`, `contacts`, `inspect`, `channels`, `complaints`, `referral` | - | 52 / 2 | 7/45/0 | 16 | `social` emote, channels, inspect | `t2-emotes-partner`, `t2-channels-talk`, `t2-inspect-partner` | partner witness, `peon<random>` channel |
| 19 | `guild` | `guildadmin`, `guildbank`, `charters`, `calendar` | - | 74 / 3 | 4/70/0 | 17 | new `guild`, `guild_bank`, `calendar` | `t9-guild-*` (6), `t9-calendar-plan` | own guild by `soap gm`, Dalaran vaults |
| 20 | `pvp` | `battlegrounds`, `arena`, `wintergrasp` | - | 51 / 10 | 5/45/1 | 13 | new `pvp`; `recover how:spirit_guide` | `t9-pvp-*` (5) | queue alone; bot probe; arena by `soap gm`; Wintergrasp window |
| | **Total** | **45** | | **614 (604 + 10 absent) / 54** | | **212** | **14 new tools** | **82** | |

The relevant total is the research's 620 (610 plus the 10 absent) less
the six unreachable senders (N13); the dead total is 48 plus those six.


### 5.3 `items`

**Rows.** 35 relevant (2 stub, 32 missing, 1 absent: `SMSG_EQUIPMENT_SET_SAVED`
0x137), 0 dead. Code area `items`. Goal: L first (rank 1 for levelling);
P at level 80 (sets, gems).

**Why.** No `CMSG_AUTOEQUIP*`, `CMSG_SWAP_*`, `CMSG_SPLIT_ITEM` or
`CMSG_AUTOSTORE_BAG_ITEM` exists in `packages/` [M]. The character keeps
its level-1 gear and its 16-slot backpack for 80 levels; closed #220 and
#222 ("full bags") probably come from this [I]. A hunter that runs out of
ammo cannot shoot again: `PLAYER_AMMO_ID` drops to 0
(`Spells/Spell.cpp:7987-7990`), a ranged cast then fails
`SPELL_FAILED_NO_AMMO` (`:7954-7961`), and only `CMSG_SET_AMMO` sets it
again (`Handlers/ItemHandler.cpp:1020-1038`) [M].

**Store, events, acts.** `ItemMoveStore` (one pending move and its
outcome: `confirmed` from the inventory read, `refused`, `no_change` for
result 59, `unanswered` after 5 s), `ItemTimerStore` (timed items,
timed enchants, item cooldowns), `ProficiencyStore`, `ItemReadStore`
(reads, item text and item-set name caches), `EquipmentSetStore`,
`RefundStore`. The existing `ItemTemplates` and inventory read are
extended (body gaps). Acts: `equip`, `equipTo`, `unequip`, `move`
(`CMSG_SWAP_INV_ITEM` inside bag 255, `CMSG_SWAP_ITEM` otherwise),
`split`, `open`, `read`, `queryText`, `setAmmo`, `socket`,
`cancelTempEnchant`, `wrap`, `querySetName`, `refundInfo`, `refund`,
`saveSet`, `useSet`, `deleteSet`. Runtime modelled on `ItemDestroyRuntime`
[M, `destroy.ts:47-119`]: preconditions throw a plain reason; several AC
paths return with no packet (`ItemHandler.cpp:41-45,103-110,1217-1231`),
so the 5 s timeout is their only answer [M]. An opened container uses an
item-source loot open, because `RewardsRuntime.open` accepts only a dead
creature [M, `rewards.ts:149-160`].

**Shared failure packet.** `SMSG_INVENTORY_CHANGE_FAILURE` carries no
request id, and five stores settle on any error today [M,
`gameplay-handlers.ts:306-313`]. The area peeks it and settles its request
only when `item1` equals the request's item guid, or when `item1` is 0 and
it is the only pending inventory request. Result 59 `EQUIP_ERR_NONE` is a
"no change" notice, not a refusal (`ItemHandler.cpp:1001-1006`) [M].

**Verbs.** A new tool `gear` (kind `action`): `do: equip|unequip|move|
split|open|read|ammo|socket`, with `item`, `slot`, `to`, `count`,
`gems`. `journal about: bags` gains positions, item ids, `can wear`,
`upgrade` (item level above the worn item), low durability, timers and
loaded ammo (a `journal` lease). A harness rule wakes the agent with
`items/upgrade` when a better item enters the bags; the harness never
equips on its own, because equipping binds a bind-on-equip item. Sets,
refunds, wrapping, cancel temporary enchant and item-set names are core
only.

**Evals** (`t8-items-*`): `equip-upgrade`, `unequip`, `move`, `split`,
`open`, `read` (blocked until `objects` has the page-text query), `ammo`,
`socket` (`max80`). Truth has bag and slot per item; ammo and sockets are
checked through the game log until truth gains those fields.

**Body gaps.** `parseItemQueryResponse` stops after the spell block [M,
`protocol/item.ts:48-81`]; it must read the whole template AC writes
(`Handlers/ItemHandler.cpp:413-538`): inventory type, levels, class
masks, stats (`StatsCount` pairs), float damage, armour, resistances, and
the tail through sockets, durability, bag family and duration. The
inventory read must add `ITEM_FIELD_DURATION`, spell charges, the 12
enchantment triples, creator and flag bit names, and the player's
`PLAYER_AMMO_ID` [M, `inventory.ts:137-178`, `update-fields.ts:304`].

**Wire disagreements (AzerothCore wins)** [M, both read]:
`CMSG_SWAP_INV_ITEM` destination first (`Server/Packets/ItemPackets.cpp`
`SwapInventoryItem::Read`; `cmsg_swap_inv_item.wowm` lists source first);
`SMSG_ENCHANTMENTLOG` has no trailing bool (`ItemPackets.h:189-200`);
`SMSG_SOCKET_GEMS_RESULT` has four enchant ids (`Entities/Item/Item.cpp:1069-1076`;
wowm has three); `SMSG_ITEM_NAME_QUERY_RESPONSE` inventory type is `u32`
(`ItemHandler.cpp:1077-1081`); `SMSG_ITEM_REFUND_RESULT` result is `u32`
(`Player.cpp:16046-16049`); `SMSG_EQUIPMENT_SET_LIST`,
`CMSG_EQUIPMENT_SET_SAVE` and `CMSG_EQUIPMENT_SET_USE` use packed guids
and a set index (`Player.cpp:14894-14922`,
`Handlers/CharacterHandler.cpp:1778-1950`; wowm has plain guids and no
index); 0x137 has no wowm definition.

**Tasks** (11): items-1 full template (NS1); items-2 enchant, timer,
charge and ammo fields (NS1); items-3 equip, unequip, move, split in core
(NS1); items-4 open and read (NS1); items-5 `gear` tool, journal and six
scenarios (NS1); items-6 timers, cooldowns, death durability,
proficiency (NS1 and NS2); items-7 sockets, enchant log, cancel temp
enchant (NS2); items-8 ammo (moved to NS1 by this design, because the
evals use hunters); items-9 equipment sets (NS2); items-10 refunds (long
tail); items-11 wrap and item-set names (long tail).

**Live proof.** Probe on a `fresh` or `eversong10` character with
`soap setup items/add`, `soap truth` rows before and after; one refusal
(equip above level) proves settling. Login packets
(`SMSG_EQUIPMENT_SET_LIST`, `SMSG_ITEM_TIME_UPDATE`) through the tap.
`SMSG_READ_ITEM_FAILED`, `SMSG_ITEM_ENCHANT_TIME_UPDATE` (needs
item-target use from `objects`) and refunds fall back to R22 if no live
trigger is found.

**Dependencies.** `objects` (page text, item-target `CMSG_USE_ITEM`);
`spells` (skills for `can wear`, because `SMSG_SET_PROFICIENCY` may not
arrive at login [I]); `economy` (bank positions, mail letters); the probe,
the tap, `tooling-gm` for level 80.

**Decisions** (not yet ruled): who fixes the failure correlation in the
other four stores (proposal: the `items` worker, under a lease on
`gameplay-handlers.ts`); "better" is item level only; never auto-equip;
the worker picks and records item ids; ammo moves to NS1.

**Risks.** Cross-talk on the shared failure packet; item level is a weak
upgrade rule for casters; bag numbering in truth is unknown until one
dump; sockets are proven only at level 80.

### 5.4 `objects`

**Rows.** 11 relevant (1 stub, 10 missing), 0 dead. Code area `objects`.
Goals: L (rank 2), P (dungeon entrances; a ghost returns to an instance
only through its area trigger: `Handlers/MiscHandler.cpp:786-794`
resurrects a ghost whose corpse is on the target map, and LFG teleport
refuses a dead player, `DungeonFinding/LFGMgr.cpp:2244-2246` [M]). So
`objects` ranks at or above `instances` for parties and raids.

**Why.** The character cannot touch a game object and never sends an area
trigger [M]. A chest opens only through an open-lock spell cast at the
object: `GameObject::Use` has no chest branch
(`Entities/GameObject/GameObject.cpp:1496-1534`), and
`Spell::EffectOpenLock` ends in `SendLoot` (`Spells/SpellEffects.cpp:2202-2317`)
[M]. `quest-objective.ts` stops with `objective_gameobject_unsupported`
today [M, `harness/src/loops/quest-objective.ts:60-63`]. The area trigger
gives quest "explore" objectives, inn rest, teleports and ghost revive
(`MiscHandler.cpp:691-818`); zone discovery XP already works through
movement (`Entities/Player/PlayerUpdates.cpp:1185,1203`) [M].

**Store, events, acts.** An object template store (extends the name
cache: type, display, names, 24 data words, size, 6 quest items, typed
`lockId` and page ids); `ObjectsStore` (pending use, last custom
animation, despawning set, page cache, last trigger message, triggers
inside and sent, fishing phase). Lazy catalogs: `AreaTriggerCatalog`
from `AreaTrigger.dbc`, `LockCatalog` from `Lock.dbc`, and `miscValue`
in `SpellCatalog` [M, `spell-catalog.ts:40-49`]. Events: `used`,
`custom_anim`, `despawn_anim`, `page_shown`, `page_read`,
`page_unanswered`, `trigger_sent`, `trigger_message`, `fish_hooked`,
`fish_not_hooked`, `fish_escaped`. Acts: `use(guid)` (sends
`CMSG_GAMEOBJ_USE` then `CMSG_GAMEOBJ_REPORT_USE`), `open(guid,
spellId)`, `useItemOn(item, target)`, `readPage`, `enterTrigger`, and the
query `openLockSpell(entry)` (the check of `Spells/Spell.cpp:8707-8760`).

**Area-trigger watcher.** Core tests the current map's triggers on each
own position change (sphere or oriented box, as
`Player::IsInAreaTriggerRadius`, `Player.cpp:2218-2238`), sends once per
entry, skips while on a taxi (`MiscHandler.cpp:699-704`), and marks
triggers that hold an arrival point as `inside` without sending, so a
teleport never bounces through a portal. It needs a position feed from
the item 6 control code, under a lease.

**Spell-target writer.** `writeSpellTargets(w, target)` with kinds
`none`, `unit`, `object`, `item`, `dest`, in the order of
`SpellCastTargets::Read` (`Spell.cpp:163-200`) [M]. `buildCastSpell` and
`buildUseItem` both call it (leases on `protocol/spell.ts` and
`protocol/item.ts`). `objects` owns it; `spells` and `talents` use it.

**Verbs.** `look` lists objects with refs `o<n>`, kind and flags
(`quest` from `GO_DYNFLAG_LO_ACTIVATE`, `locked`, `busy`); `travel to:
o<n>` stops inside interaction distance; `interact npc: o<n>` opens a
quest-giver object's windows (leases on `look`, `travel`, `interact`
and `ops/refs.ts`). A new tool `use` (kind `action`): `do: open` (walk,
lock check, open-lock spell or plain use, settle on loot, gossip, page,
state change, cast failure, or 5 s), `do: read`, `do: fish` (the harness
uses the bobber as soon as `fish_hooked` arrives, because it is ready
only in its last 5 s, `GameObject.cpp:501`). The quest loop gains object
objectives. Area triggers have no verb.

**Evals.** `t4-objects-quest-elwynn` (quest 3904, crates 161557 [M,
`gameobject_template.sql:6262`]); `t0-objects-read-shrine` (page 2936,
graded against a fixed phrase, because truth holds no reads);
`t4-objects-explore-fargodeep` (quest 62, trigger 88). No fishing eval:
no preset has Fishing or a pole.

**Body gaps.** `SMSG_GAMEOBJECT_QUERY_RESPONSE` stops after the first
name [M, `protocol/entity-queries.ts:57-68`]; AC writes 24 data words,
not the 6 of wowm (`Handlers/QueryHandler.cpp:193-213`,
`src/server/shared/SharedDefines.h:1603`). `GAMEOBJECT_CREATED_BY` is not
extracted and `GAMEOBJECT_DYNAMIC` is one raw number, not `u16` flags and
signed `i16` path progress (`GameObject.cpp:2843-2844`) [M,
`protocol/extract-fields.ts:222-230`]. `CMSG_CAST_SPELL` and
`CMSG_USE_ITEM` target bodies (above).

**Wire disagreements.** `SMSG_AREA_TRIGGER_MESSAGE`: AC writes `length =
line.size() + 1`, then the whole remaining C string
(`Server/WorldSession.cpp:287-298`), so a multi-line message holds more
bytes than its length; parse to the NUL and ignore the length [M code, I
never observed]. `SMSG_PAGE_TEXT_QUERY_RESPONSE`: one query returns the
whole chain, one packet per page (`QueryHandler.cpp:367,391`). The
despawn animation guid may be a dynamic object
(`Entities/DynamicObject/DynamicObject.cpp:184`).

**Tasks** (11, all NS1 except fishing): objects-1 templates and object
fields; objects-2 use and report use; objects-3 page text; objects-4
object targets and open-lock choice; objects-5 triggers and trigger
messages; objects-6 animations and fishing state (long tail);
objects-7 objects in `look`, `travel`, `interact`; objects-8 the `use`
tool, open and read, two evals; objects-9 `use do: fish` (long tail);
objects-10 trigger rows and the explore eval; objects-11 object
objectives in the quest loop.

**Live proof.** The shrine on a `fresh` character (`SMSG_GAMEOBJECT_PAGETEXT`);
crate 161557 after `soap gm quest add 3904`; trigger 88 after `soap gm
quest add 62`; trigger 78 at level 1 (the level message) and after
`soap gm level 10` (truth map 36); fishing after `soap gm learn 7620` and
`soap gm items 6256:1` [M, module:
`modules/mod-playerbots/src/Ai/Base/Actions/FishingAction.cpp:22-23`]. `CMSG_GAMEOBJ_REPORT_USE`
has no reply; accepted plus an R22 builder test.

**Decisions** (not yet ruled): `objects` owns the target writer; the
watcher lives in core (an exception to "behaviour in the harness",
because the server expects it from every client and it chooses nothing);
report use follows every use; arrival triggers are not sent; reads are
graded by a fixed phrase; the worker checks which open-lock spell a new
character knows before relying on one.

**Needs the maintainer:** a fishing preset, and truth fields for rest and
explored zones.

**Risks.** A script that runs on both use and report use may run twice
[I, `AI/SmartScripts/SmartScriptMgr.h:163`]; the DBC trigger table may
drift from the server's `areatrigger` table (the worker compares 78, 87,
88 and 562).

### 5.5 `quests`

**Rows.** 17 relevant (18 rows, all missing), 1 dead. Code area `quests`
(the harness core domain is `quest`, so `quests` is free). Goals: L
(rank 3), P (sharing).

**Why.** `SMSG_QUESTGIVER_STATUS_MULTIPLE` arrives in every post-#399 log
and is dropped [M]. With it the agent sees the `!` and `?` marks and finds
a quest or a turn-in without walking to each NPC. POIs give objective
regions; NPC text gives the greeting that often names the next place.

**Store, events, acts.** New stores, because `quest-store.ts` has 422
lines [M]: `QuestMarkStore` (the multiple packet replaces the whole map,
because it lists every giver in view, `Entities/Player/Player.cpp:7915-7946`),
`QuestPoiStore`, `NpcTextStore` (session cache), `GossipPoiStore`,
`QuestShareStore` (offer, own pushes, relayed answers),
`CompletedQuestStore`. Events: `marks` (only on a change), `poi`,
`npc_text`, `gossip_poi`, `share`, `completed`. Acts:
`queryGiverStatus`, `queryGiverStatuses`, `queryPoi` (25 ids per packet),
`queryNpcText`, `shareQuest`, `answerShare`, `questgiverHello`,
`autoLaunch`, `swapLogSlots`, `queryCompleted`.

**Runtime.** The server pushes the multiple packet only at login, level
change, reward and item destroy (`Player.cpp:11920,2583`,
`Entities/Player/PlayerQuest.cpp:894`, `Handlers/ItemHandler.cpp:321`) and
on the multiple query [M]. So the runtime sends one
`CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY`, debounced 500 ms and at most once
every 2 s, after a new quest-giver unit or object comes into view and
after every quest-log change. POIs are queried when a quest enters the
log and matched by id, never by order. NPC text is queried when a gossip
dialog opens. An unanswered share offer blocks every later share (AC
answers `BUSY` while a divider is set, `Handlers/QuestHandler.cpp:582-586`),
so the runtime declines it automatically after 60 s [I for the time].

**Verbs** (no new tool). `look` shows marks and ranks givers with
`available` or `reward` first; `journal about:quests` shows the nearest
objective region and a `travel` next call; `interact do:talk` shows the
greeting with `$N`, `$C`, `$R` replaced; `interact do:gossip` shows a
guard's map point with a `travel` next call; the group tool (the `group` tool, code area `raid`) gains
`share_quest`, `accept_quest`, `decline_quest`. Leases on
`look`, `journal`, `interact` and the group tool module.

**Evals.** `t4-quests-find-giver`, `t4-quests-poi-walk`,
`t1-quests-read-greeting` (graded by a phrase captured live, because truth
holds no NPC text), `t1-quests-guard-directions`, `t8-quests-share` and
`t8-quests-accept-shared` (with an escort replica on quest 8488). The two
sharing evals need puppet `call` methods (invite, accept, share, accept a
quest) and a partner-truth check.

**Body gaps.** `SMSG_QUESTGIVER_STATUS` keeps only the last packet [M,
`gameplay-handlers.ts:222-224`]; it feeds `QuestMarkStore` instead. It is
also sent unasked after a reward when `GetQuestMethod()` is 0
(`QuestHandler.cpp:286-290`) [M]. A shared quest is dropped today and
accepting it would fail [M from source]: AC sends the receiver the details
with the receiver's own guid first and the sharer as divider
(`QuestHandler.cpp:596-598`, `Entities/Creature/GossipDef.cpp:405-406`);
`QuestStore.openDialog` drops a dialog with no pending giver as
`stale_dialog`, and accepting with the own guid is rejected
(`QuestHandler.cpp:125-131`). The fix opens a `share` offer and accepts
with the divider guid [I until the live test]. The gossip `titleTextId`
is parsed and unused [M, `protocol/gossip.ts:21,71`].
`PLAYER_FIELD_DAILY_QUESTS_1` is not read [M]. Lease on the quest dialog
path.

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_QUEST_POI_QUERY_RESPONSE`
objective index and points are `int32` (`Handlers/QueryHandler.cpp:452,462-463`;
wowm `u32`), the response is in `unordered_set` order with duplicates
removed (`:423-425,432`), and a quest not in the log gets 0 POIs;
`MSG_QUEST_PUSH_RESULT` from the client carries a `u32` quest id between
the guid and the result (`Server/Packets/QuestPackets.cpp:98-105`; wowm
has none), and the result enum is AC's 0-10 (`Quests/QuestDef.h:64-77`).
`SMSG_QUEST_CONFIRM_ACCEPT` is sent for `QUEST_FLAGS_PARTY_ACCEPT` even
though a comment calls it unused (`QuestHandler.cpp:172-186`).

**Tasks** (10): quests-1 marks in core (NS1); quests-2 marks in `look`
(NS1); quests-3 POI in core (NS1); quests-4 objective locations in
`journal` (NS1); quests-5 NPC text and gossip POI (NS1); quests-6
greeting and directions in `interact` (NS1); quests-7 sharing in core
(parties); quests-8 share verbs (parties); quests-9 log extras and the
completed-quest list (NS1); quests-10 daily quests done today (long
tail).

**Live proof.** Natural play on `fresh` near Magistrix Erona (marks, POI
for quest 8325, NPC text, hello); an `elwynn` Stormwind Guard's "Inn"
option for `SMSG_GOSSIP_POI`; two of the worker's own characters in one
group for sharing (quest 8326) and the escort prompt (quest 8488 at
Apprentice Mirveda, both at level 9); the completed list compared with
`soap truth` `rewardedQuests`. Quest, NPC and POI ids come from
AzerothCore base data and are confirmed live first. If 8488 is not on the
live server: R22 from `PlayerQuest.cpp:2483-2503`.

**Dead.** `SMSG_QUEST_FORCE_REMOVE`: no file in `src/` or `modules/` names
it [M]. `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH` is relevant; its handler is
empty (`QuestHandler.cpp:525-527`), so the proof is that the server
accepts it.

**Decisions** (not yet ruled): one debounced multiple query, not one query
per giver; share tests use quest 8326, because 8325 carries the
auto-accept flag in base data and the live config is unknown
(`Quests/QuestDef.cpp:55,134-137,193-196`); marks log only when the set
of givers with `available` or `reward` changes; the share verbs follow
the group tool.

**Risks.** Accepting a share with the divider guid is inferred; if the
server closes the dialog, the worker records the packets and stops. Base
data may differ from the live database.

### 5.6 `travel`

**Rows.** 14 relevant (1 stub, 13 missing), plus the `SMSG_SHOWTAXINODES`
body gap; 1 dead. Code area `travel`. Goals: L (bind and hearth in NS1,
flights in NS2), D (the pose after a flight).

**Why.** 9 of 10 taxi opcodes are missing, so the character cannot fly.
A node is already learned through the handled `CMSG_GOSSIP_HELLO`
(`Entities/Player/PlayerGossip.cpp:104-106` calls `SendLearnNewTaxiNode`)
[M]; what is missing is activating a flight, its reply and the node mask.
No tool uses the hearthstone. After a flight, control keeps the take-off
pose: no movement block is sent at landing, self `SMSG_MONSTER_MOVE`
reaches only the entity and motion stores [M, `gameplay-handlers.ts:158-167`],
and the server applies the next client move as sent once `DISABLE_MOVE`
clears (`Handlers/MovementHandler.cpp:620-622`), so the first move after
landing would put the character back at the take-off point [I, strong].

**Store, events, acts.** A `bindPoint` part (home from
`SMSG_BINDPOINTUPDATE` at every login and bind, the confirm offer,
`SMSG_PLAYERBOUND`) and a `taxi` part (known mask, undefined until the
first `SMSG_SHOWTAXINODES`, because only that packet carries the mask
[M, `Handlers/TaxiHandler.cpp:102`]; per-master status; learning; one
pending request; last reply; flight phase). A lazy taxi catalog from
`TaxiNodes.dbc` and `TaxiPath.dbc` (`src/server/shared/DataStores/DBCfmt.h:123-124`)
and a pure `taxiRoute` over direct edges, because the server looks up
only a direct edge per hop (`Globals/ObjectMgr.cpp:7183-7203`) [M].
Events: `bind_point`, `bind_offer`, `bound`, `taxi_node_status`,
`taxi_node_learned`, `taxi_map`, `taxi_reply`, `flight_started`,
`flight_landed`. Acts: `queryTaxiStatus`, `openTaxiMap` (also for
`CMSG_ENABLETAXI`, which AC routes to the same handler, `Opcodes.cpp:1302`),
`activateTaxi` (one hop `CMSG_ACTIVATETAXI`, more hops
`CMSG_ACTIVATETAXIEXPRESS`), `setTaxiBenchmark`, `bindActivate`. Each act
settles as `ok`, `refused(name)` or `no_answer`, because several server
paths refuse silently (`Player.cpp:10424-10425,10510-10516`,
`TaxiHandler.cpp:196-197`).

**Control change** (travel-4, a lease on the control files).
`observeSelfSpline` for a self `SMSG_MONSTER_MOVE` or a create block with
a self spline (login mid-flight); a distinct `in_flight` block reason
while self has `UNIT_FLAG_TAXI_FLIGHT`; at landing the server pose
becomes the stop point, or the last spline point when no stop arrives
(`StopMoving` sends one only if the spline has not finished,
`Entities/Unit/Unit.cpp:12597-12614`); `CMSG_MOVE_SPLINE_DONE` once the
spline duration has elapsed, which AC needs for the map switch of a
multi-map flight (`TaxiHandler.cpp:223-243`). A flight keeps the control
owner; the flight run holds its `loop` claim until landing.

**Bind reply.** `CMSG_BINDER_ACTIVATE` casts spell 3286 and replies with
`SMSG_TRAINER_BUY_SUCCEEDED` (`Handlers/NPCHandler.cpp:321-331`) [M]. The
trainer store ignores it unless a matching `train` request is pending [M,
`trainer-store.ts:106-112`], so a bind never reads as a purchase.

**Verbs** (no new tool). `interact do:"bind"` at an innkeeper (sends
`CMSG_BINDER_ACTIVATE` directly; AC checks only the innkeeper and range,
`NPCHandler.cpp:293-312`); `travel to:"hearth"` (uses the Hearthstone
through the handled `CMSG_USE_ITEM`, waits for the teleport);
`travel to:"fly <destination>"` (walk to a flight master, open the map,
route, activate, complete on `flight_landed`, yield at 120 s); `look`
kinds `flight_master` and `innkeeper`. Leases on `interact`, `travel`,
`look`.

**Evals.** `t8-travel-bind-inn` (log evidence, paired with a hearth
until truth has a home field), `t8-travel-hearth-home` (truth point
within 15 yd of the home), `t8-travel-fly` (`ghostlands20`, fly to
Silvermoon City, then walk 10 yd north: truth catches a snap-back; money
delta).

**Body gaps.** `SMSG_SHOWTAXINODES` reads only the guid [M,
`gameplay-handlers.ts:206-209`]; AC writes `u32 1`, the guid, `u32
curloc` and 14 mask words (`TaxiHandler.cpp:98-102`,
`Entities/Player/PlayerTaxi.cpp:116-128`). The motion store cannot
evaluate a non-cyclic flying catmull-rom spline [M, `motion-store.ts:86-89`];
the end point is enough for correctness [I]. `PLAYER_FLAGS` bit 0x20000
(benchmark) is not read.

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_BINDER_CONFIRM` is
the guid only (`Player.cpp:9118-9122`; wowm adds an area);
`CMSG_MOVE_SPLINE_DONE` starts with a packed guid
(`TaxiHandler.cpp:212-214`; wowm omits it).

**Tasks** (6): travel-1 bind point (NS1); travel-5 bind and hearth verbs
and two evals (NS1); travel-2 taxi knowledge and catalog (NS2); travel-3
taking a flight (NS2); travel-4 self flight spline in control (NS2, lands
with travel-3 so no build can fly without the landing fix); travel-6 fly
verb and eval (NS2).

**Live proof.** Natural play on a throwaway Blood Elf (node 82 is known
from creation, `PlayerTaxi.cpp:39-65`), placed with `soap setup
position` or `soap gm tele`; the tap captures `SMSG_TAXINODE_STATUS` at
login; the probe sends the status query, `CMSG_ENABLETAXI` and benchmark
mode. Express flights and the map switch fall back to R22 if no route is
reachable. No SOAP command teaches one node (`.cheat taxi` is
`Console::No`, `src/server/scripts/Commands/cs_cheat.cpp:42`).

**Dead.** `SMSG_FLIGHT_SPLINE_SYNC` 0x388: no writer [M].

**Decisions** (not yet ruled): bind directly without the gossip confirm;
re-query after `SMSG_NEW_TAXI_PATH` to learn the node id; travel-3 and
travel-4 land together; a teleport with no `ERR_TAXIOK` after an
activate counts as `ok` in case `InstantFlightPaths` is on (default 0,
`World/WorldConfig.cpp:267`).

**Needs the maintainer:** the flight verb shape (default `travel to:"fly
<destination>"`; alternatives `interact do:"fly"` or a `fly` tool), and
truth fields for home and taxi nodes.

**Risks.** A multi-map flight hangs at the map edge if
`CMSG_MOVE_SPLINE_DONE` is wrong [I]; the Tranquillien to Silvermoon edge
is unconfirmed until the worker reads the catalog.

### 5.7 `self-state`

**Rows.** 39 rows: 34 relevant (33 missing, 1 absent:
`CMSG_FORCE_PITCH_RATE_CHANGE_ACK` 0x45D), 5 dead (the four of the
research plus `SMSG_PAUSE_MIRROR_TIMER`, N13). Code area `selfstate`
(`self-state` breaks the naming rule); the flag acks change control files
under a lease. Goals: D (rank 1), L (death set in NS1, mounts in NS2), P
(transfer aborts, Soulstones). Seen live: 6 (`SMSG_MOVE_WATER_WALK`,
`SMSG_MOVE_LAND_WALK`, `SMSG_MOVE_UNSET_HOVER`, `SMSG_STOP_MIRROR_TIMER`,
`SMSG_STANDSTATE_UPDATE`, `SMSG_PRE_RESURRECT`).

**Why.** For a player the server never sets water walk, feather fall,
hover or gravity itself: it copies them from the client's ack
(`Handlers/MiscHandler.cpp:1527`; the setters change server flags only for
units that are not client-controlled, `Entities/Unit/Unit.cpp:16090-16097,16190-16310`)
[M]. Without acks the server's copy is wrong and others see no relay. No
missing ack disconnects: the movement handlers kick only on invalid map
coordinates, the unused anticheat hooks and an acked speed above the
server's (`Handlers/MovementHandler.cpp:65,153,210,565-578,775`) [M]. The
login and far-teleport root arrives only inside `SMSG_MULTIPLE_MOVES`
(`Player.cpp:11866-11877`), and the server drops a rooted mover's packet
without `ROOT` (`MovementHandler.cpp:606-609`) [M]. A mounted player
cannot cast (`Spells/Spell.cpp:6209-6216`), and there is no dismount send.

**Control part** (self-state-1 to -4, lease on `control-sync.ts`,
`control.ts`, `self-store.ts`, `movement-handlers.ts`). A `move_flag` self
event and `MovementSync.moveFlag(flag, enable, counter)` set the bit in
`moveFlags` and ack with the current movement info, like the existing
`setCanFly`; the bits stay in every later move. `SMSG_MULTIPLE_MOVES`
fans out one event per entry, each acked with its own counter. At death
the acks go out while rooted, and `moveFlags` already holds `ROOT` [I, a
test pins the order]. Collision height is acked with the speed-ack
layout; pitch rate joins `SPEED_ACKS` and echoes the value, because its
ack passes the speed check that can kick (`MovementHandler.cpp:765-777`).
`CMSG_MOVE_TIME_SKIPPED` and `CMSG_MOVE_FALL_RESET` get builders and no
automatic caller. `SMSG_TRANSFER_ABORTED` emits an event and a 10 s
watchdog clears `teleporting` [I].

**Store, events, acts** (`selfstate`). Mounted and display id, collision
height, stand state, breath, fatigue and fire timers (scale is signed),
self-res spell, drunk state and value, last transfer abort, ghost
pending, rested XP and resting flag. Events: `mounted`, `dismounted`,
`stand_changed`, `mirror_timer`, `breath_low`, `transfer_aborted`,
`self_res_available`, `ghost_pending`, `drunk_changed`, `mount_anim`.
Acts: `dismount` (`CMSG_CANCEL_MOUNT_AURA`; refuses `not_mounted` and
`in_flight`), `selfResurrect` (`CMSG_SELF_RES`; the server refuses
silently, `Handlers/SpellHandler.cpp:713-716`), `setStandState` (stand,
sit, sleep, kneel only, `MiscHandler.cpp:565-574`), `mountSpecialAnim`,
`queryCorpseMapPosition` (AC always answers four zeros,
`Handlers/QueryHandler.cpp:399-410`). Dismount needs no control change
(`MiscHandler.cpp:1475-1494`).

**Verbs.** `recover how:"self"` (Reincarnation or Soulstone; the death
message names the option). `spell do:"mount"` and `do:"dismount"` on the
`spells` area's tool. Policy: `engage`, `rest`, `loot` and `interact
do:"train"` dismount first and say so. Passive: a `breath_low`
interrupt stops a run with "Surface now"; `look` and `[now]` show
mounted, sitting and breath; a transfer abort becomes a `[game]` line
and the refusal reason of the tool that caused the transfer. The world
service gains `dismount` and `selfResurrect` acts and a `selfstate` read
(through N5).

**Evals.** `t6-selfstate-res` (learn 20608 and add Ankh 17030 offline,
die, come back within 5 yd; truth `alive`), `t9-selfstate-mount`
(`max80` with riding and a mount learned offline; ride 200 yd; log
evidence until truth has a `mounted` field).

**Body gaps and fields.** `UnitFlag.MOUNT` 0x08000000 is missing
(`Entities/Unit/UnitDefines.h:284`); `UNIT_FIELD_MOUNTDISPLAYID`, stand
state in `UNIT_FIELD_BYTES_1`, `PLAYER_SELF_RES_SPELL` (private, hidden by
`readSelfField`), drunk in `PLAYER_BYTES_3`, and rested XP and the
resting bit are not read [M, `protocol/update-fields.ts`]. Swimming and
flying sends are handled only as remote parses, and control refuses
`SWIMMING`, `FLYING` and `ON_TRANSPORT` [M, `control-motion.ts:51-58`]; this
area adds only the breath warning.

**Wire disagreements (AzerothCore wins)** [M]: the water walk, feather
fall and hover acks carry a packed guid and a trailing `u32 isApplied`,
the gravity acks no `isApplied` (`MiscHandler.cpp:1505-1520`; wowm has a
plain `Guid`); `CMSG_MOVE_FALL_RESET` starts with a packed guid
(`MovementHandler.cpp:381,399`; wowm omits it);
`SMSG_START_MIRROR_TIMER` scale is `int32` (-1 draining, 10 regenerating)
and the timer names are AC's fatigue 0, breath 1, fire 2
(`Server/Packets/MiscPackets.cpp:101-111`, `Player.h:557-562`); 0x45D has
no wowm definition.

**Tasks** (11): self-state-1 death-set water walk and hover acks (NS1,
control); -2 feather fall, gravity and `SMSG_MULTIPLE_MOVES` (NS1,
control); -3 collision height, pitch rate, time skip, fall reset (NS1,
control); -4 transfer abort (NS1, control); -5 store: stand, timers,
pre-resurrect (NS1); -11 harness passive state (NS1); -7 self-res and
corpse query (parties); -9 `recover how:"self"` (parties); -6 mount and
dismount in core (NS2); -10 mount verbs and eval (NS2); -8 drunkenness
and rested state (long tail).

**Live proof.** Death, release and reclaim with a partner in view (the
partner receives the `MSG_MOVE_*` relays); a ghost restart for
`SMSG_MULTIPLE_MOVES`; Slow Fall learned offline; a deep-water login
for the breath timer; `max80` mount and dismount; six dungeon teleports
within an hour for `TRANSFER_ABORT_TOO_MANY_INSTANCES` if the tele rows
allow it. Gravity, set hover and pitch rate have no normal-play trigger:
R22 from `Unit.cpp:16086-16119,16255-16269,11066-11082`.

**Dead.** `SMSG_MOUNTRESULT`, `SMSG_RESURRECT_FAILED`,
`SMSG_FORCED_DEATH_UPDATE` (no sender);
`CMSG_MOVE_SET_CAN_TRANSITION_BETWEEN_SWIM_AND_FLY_ACK` (`Handle_NULL`,
`Server/Protocol/Opcodes.cpp:963`); `SMSG_PAUSE_MIRROR_TIMER` (class never
constructed).

**Decisions** (not yet ruled): mount verbs on the `spells` tool (fallback:
a `travel` option); dismount first; no hover height in predicted z; no
automatic caller for time skip and fall reset; `selfstate` owns rested
XP; try a cross-class `spells/learn` for Reincarnation, else mock only.

**Needs the maintainer:** who owns swimming (proposal: item 6, not item 4);
truth fields for mounted and self-res.

**Risks.** A wrong ack is worse than none: a later move that drops the bit
flips the server copy back, so one test asserts the next move carries
each acked flag. Always echo the packet's counter, never a local one
(`MiscHandler.cpp:1530-1531`).

### 5.8 `threat`

**Rows.** 7 relevant, all missing server notices, 0 dead. Code area
`threat`. Goals: P (rank 2), L (rank 6). It is the pilot area of wave 1:
it is small, touches no control file, and proves the flood guard.

**Why.** Threat arrives in every fight, even solo: `SMSG_THREAT_UPDATE`
is in 7 of 7 finished post-#399 logs with a fight [M]. Today "who is
fighting me" is a guess: `CombatStore.attackers()` holds only units that
sent `SMSG_ATTACKSTART` [M, `combat-store.ts:136-145,342`], so a caster that
never melees is missing [I].

**Store and events.** `ThreatStore`: per creature, the victim (from
`SMSG_HIGHEST_THREAT_UPDATE`), the entries (raw hundredths: AC writes
`uint32(threat * 100)`, `Combat/ThreatManager.cpp:894`), and the update
time; the last `SMSG_AI_REACTION` per unit and the own pet's reaction.
Updates replace the whole list (they are full lists, `:889-897`); remove
deletes one entry; clear deletes the table; a table is also dropped when
the unit disappears or dies (through `listen("entity")`) so a crowded
zone cannot grow it without limit. Derived reads: `threatOn` (sorted,
with percent of the top), `engagedWith(guid)`, `aggroOn(guid)`,
`pullMargin` (the server's 110% melee and 130% ranged rule,
`ThreatManager.cpp:655-678`). Events: `table` (about once a second per
engaged creature in view), `victim_changed`, `removed`, `cleared`,
`reaction`, `target_broken`. No acts: the area has no client send.

**Verbs.** None: the area changes the read surface only, which is not a
verb under R9. `look` unit rows gain `fightingMe`, `aggro` and
`myThreatPct`; the danger view unions `attackers` with
`engagedWith(self)`; `watchInterrupts` fires `newAttacker` on a victim
switch to the character; the engage loop treats `target_broken` for its
target as a lost target; the world service gets the reads through N5.
Log rows (harness rule, domain `threat`): `threat/engaged` (wake outside
a run), `threat/aggro_switch`, `threat/pull_warning` (in a group, at 90%
of the threshold, worded "near"), `threat/alerted` (wake),
`threat/target_lost`. No rule logs `table`, so the fallback row is
replaced by `[]` for it: this is the flood-guard proof. Leases on `look`,
`ops/danger.ts` and the engage loop.

**Wire.** All seven layouts agree between wowm and AC [M]. Notes: the
update list is not sorted (`ThreatManager.cpp:889`), skips offline refs,
and may hold 0 entries; `SMSG_AI_REACTION` `HOSTILE` is sent once per new
victim (`Entities/Unit/Unit.cpp:7097-7117,7174`), not per swing as the wowm
comment says; only `ALERT` and `HOSTILE` have send sites.

**Tasks** (3, all NS1): threat-1 tables (4 opcodes); threat-2 reactions
and target breaks (3 opcodes); threat-3 threat in `look`, danger and the
log.

**Live proof.** A throwaway `eversong10-hunter` attacks a creature with
its pet out: `SMSG_HIGHEST_THREAT_UPDATE` on the pull, updates each
second, a switch between the character and the pet, clear on the kill;
remove when the pet or the character dies. `ALERT` (needs stealth; no
preset has it, and `.learn` is `Console::No`), `SMSG_BREAK_TARGET` and
`SMSG_CLEAR_TARGET` (Shadowmeld, Mirror Image, a unit boarding a vehicle)
fall back to R22 from `Entities/Creature/Creature.cpp:2477-2487`,
`Unit.cpp:15842-15847` and `Spells/SpellEffects.cpp:5019-5024`. SOAP cannot
read a threat table (`.debug threat` is `Console::No`,
`src/server/scripts/Commands/cs_debug.cpp:84-85`), so the creature's
`UNIT_FIELD_TARGET` is the only independent evidence. The live run counts
rows per fight and journal rows per turn (flood guard).

**Decisions** (not yet ruled): threat is the wave 1 pilot; no eval (the
optional `t3-threat-who-has-aggro` is not built); target breaks do not
clear core's selection, because what the client does with them is not
confirmed in AC or wowm; unknown reaction values are kept, not thrown;
the pull warning fires at 90%.

**Risks.** Many broadcast tables near playerbot fights; the mitigation is
to keep only tables that hold the character, its pet or a party member.

### 5.9 `combat-log`

**Rows.** 20 rows: 17 relevant (6 stubs minus the dead one, so 5 stubs,
and 12 missing), 3 dead. Code area `combatlog`. Goals: L (NS1 noise and
combo points), P (rank 4: heals by source, misses, immunities, dispels).

**Why.** Core knows a fight only through update fields, attack start and
stop, its own casts and XP [M, `gameplay-handlers.ts:132-169`]. It does
not know damage, heals, misses, immunities, killing blows or combo points.
Combo points have no update field, so a rogue cannot use a finisher with
sense. Melee, spell damage, party kill and power updates arrive in every
fight as `not_implemented` noise.

**Store and events.** `CombatLogStore`: a normalised `CombatLogEntry`
(kinds `melee`, `spell_damage`, `periodic_damage`, `damage_shield`,
`environmental`, `instakill`, `heal`, `periodic_heal`, `energize`,
`periodic_power`, `miss`, `immune`, `dispel`, `dispel_failed`, `steal`,
`execute`, `kill`); only entries whose source or target is "ours" (the
character, its pet and guardians, party members, units in the current
fight); a ring of 500; per-fight totals; an immunity map by creature
entry and spell for the session, also fed by the handled
`SMSG_SPELL_GO` miss list; combo points; the last 20 kills. Events:
`entry`, `combo_points`, `kill`. `SMSG_POWER_UPDATE` writes the unit's
power field through the entity store's existing `update` [M,
`entity-store.ts:189-217`] instead of the log. No acts.

**Shared handler.** The area peeks `SMSG_SPELL_GO` for misses of other
casters, which `CombatStore.applySpellGo` drops today [M,
`combat-store.ts:242-243`]; `spells` peeks it too. With `peek` neither
edits the owner.

**Verbs.** None. `fight/end` gains totals (dealt, taken, healed, misses
by reason); the `engage` tally gains `dealt`, `taken`, `healed`,
`avoided`, `immune`; Jev's observation gains a `combatLog` block and drops
a spell the target is known to be immune to; `VitalsView` gains
`comboPoints`; the world service gets a read view. Log rows (domain
`combatlog`): `immune` (once per entry and spell), `killing_blow` (by
another player on the character's target), `environmental` (wake outside
a run), `dispelled`, `heal_in` (passive, grouped per healer per 10 s). No
per-hit rows. Leases on `events/rules-combat.ts` (for `fight/end`),
`tools/engage-tally.ts` and the Jev observation.

**Wire disagreements (AzerothCore wins)** [M]:
`SMSG_ATTACKERSTATEUPDATE` writes one absorb and one resist per sub-damage
and gates the extra `u32` on `RAGE_GAIN` 0x800000, not `UNK19`
(`Entities/Unit/Unit.cpp:6677-6701`); `SMSG_PERIODICAURALOG` periodic
damage school is a `u32` mask, not a `u8` (`:6585`), and only aura types
3, 89, 8, 20, 21, 24, 64 are written; `SMSG_ENVIRONMENTAL_DAMAGE_LOG`
writes resisted before absorbed (`Server/Packets/CombatLogPackets.cpp:24-27`);
`SMSG_SPELLLOGEXECUTE` has a real per-effect target count, logs
`POWER_BURN`, and `FEED_PET` is an item entry (`Spells/Spell.cpp:8838-8845`,
`Spells/SpellEffects.cpp:1553,4758`); `SMSG_DISPEL_FAILED` writes the
dispel spell first (`SpellEffects.cpp:2779-2787`);
`SMSG_SPELLNONMELEEDAMAGELOG` and `SMSG_SPELLDAMAGESHIELD` carry a school
mask, and the non-melee flags are `SPELL_HIT_TYPE_*`
(`src/server/shared/SharedDefines.h:1539-1544`). `SMSG_SPELLLOGMISS` is
not "every miss": an ordinary miss rides the `SMSG_SPELL_GO` miss list
(`Spell.cpp:5202-5221`).

**Tasks** (8): combat-log-1 store, melee and spell damage (NS1);
combat-log-6 kills, combo points, power updates (NS1); combat-log-7
harness rows, totals, Jev, vitals (NS1 for totals, the rest parties);
combat-log-2 heals, energize, ticks (parties); combat-log-3 misses,
immunity, shields, environment, instakill (parties); combat-log-4
dispels and steals (long tail); combat-log-5 execute log (long tail);
combat-log-8 optional human-only ticker line (long tail).

**Live proof.** `eversong10-mage` Fireball and melee; potions from
`soap setup items/add`; any kill. Combo points (no rogue or druid
preset), dispels, instakill, immunity, the hit-phase miss and fall damage
(needs direct drive and a non-GM character) fall back to R22 from the
cited writers. No proof may use `.cheat god`, which moves damage into
absorb on the wire (`Unit.cpp:6437-6441`).

**Dead.** `SMSG_PROCRESIST` (its only writer `Unit::SendSpellDamageResist`
has no caller), `SMSG_FEIGN_DEATH_RESISTED` (sites inside comments),
`SMSG_HEALTH_UPDATE` (stub, no sender).

**Decisions** (not yet ruled): no per-hit log rows; damage from a unit
that never swung marks it as an attacker through
`CombatStore.noteHostileDamage` (a lease on `combat-store.ts`; revisit
after `threat`); entries scoped to "ours"; immunities kept for the
session only; an unknown execute-log effect sets `truncated` instead of
throwing.

**Needs the maintainer:** rogue, druid or priest presets for combo point,
dispel and heal proofs; otherwise these stay "not seen live".

**Risks.** Six layouts differ from wowm, three silently on the common path;
every fixture is built from the AC writer.

### 5.10 `spells`

**Rows.** 28 rows: 25 relevant (24 need work; `SMSG_ACTION_BUTTONS` is
handled by #422), 3 dead plus the client direction of the two channel
opcodes (`Handle_NULL`). Code area `spells`. Goals: L (NS1 subset), D
(`CMSG_SET_ACTION_BUTTON`, `CMSG_CANCEL_AURA`, `CMSG_CANCEL_CHANNELLING`),
P (other units' casts, totems).

**Why.** Core clears its cast state on `SMSG_SPELL_GO`, so a channel looks
finished while it runs and `halt()` cannot stop it [M,
`combat-casts.ts:172`, `combat.ts:156-160`]. Core drops every cast packet
of another caster [M, `combat-store.ts:234,243,268`]. The character cannot
cancel a buff, write its action bar, or drop a profession. Login noise
(`SMSG_SEND_UNLEARN_SPELLS` in 5 of 5 logs, the spell modifiers in 4 of 5)
shows as `not_implemented`.

**Store, events, acts.** Channel state inside the cast tracker (a lease
on `combat-casts.ts`): set on `MSG_CHANNEL_START` for self (it arrives
after `SMSG_SPELL_GO`, `Spells/Spell.cpp:4072,4155,4243`), ended by
`MSG_CHANNEL_UPDATE` time 0 as `finished`, `interrupted` or `cancelled`;
`halt()` cancels it; a new cast while channelling is refused with
`channelling`. A unit-cast store for other casters (peeks
`SMSG_SPELL_START`, `SMSG_SPELL_GO`, `SMSG_SPELL_FAILURE`; ignores
`SMSG_SPELL_FAILED_OTHER` for self, because the server sends both for the
character's own interrupted cast, `Spell.cpp:5332,5339`). Action bar
writes extend #422's store (a lease on `action-bar.ts`; the server never
echoes the button) plus the toggle byte. Spellbook extras: inactive
ranks, flat and percent modifiers (replace, never add),
`CooldownStore.shift`. A skill store from `PLAYER_SKILL_INFO` (128
triples at offset 636). Totem, rune, mirror-image and projectile state.
Acts: `cancelAura`, `cancelChannel`, `setActionButton`,
`setActionBarToggles`, `unlearnSkill`, `destroyTotem`, `setFarSight`,
`requestMirrorImage`, `reportProjectile`, `reportMissileTrajectory`,
`cancelGrowthAura`. Each validates what the server drops silently.

**Verbs.** A new tool `spell` (kind `action`): `do: cast` (a named spell
on a unit or self; `objects` extends it with object, item and ground
targets through the shared target writer), `cancel_aura` (refuses mount
auras and names the dismount), `bar`, `unlearn_profession` (needs
`confirm: true`), `destroy_totem`, and `mount`/`dismount` for
`selfstate`. `stop` also ends a channel. `engage` waits for a channel to
end instead of cutting it; Jev sees the channel and the target's current
cast. `journal about:"spells"` adds cancellable auras, the bar,
professions and totems or runes. Log rows (domain `spells`):
`channel_start`, `channel_end`, `target_start`, `target_interrupted`,
`totem_created`, `totem_gone`, `skill_changed` (at most once per skill
per minute).

**Evals.** `t4-spells-cancel-aura`, `t4-spells-stop-channel` (needs a
`channel_start` steer trigger in the grader), `t4-spells-action-bar`
(partial until truth has the bar), `t4-spells-unlearn-profession`,
`t4-spells-destroy-totem` (blocked until a shaman preset exists).

**Body gaps.** Channel and other units' casts (above); the unread fields
`UNIT_FIELD_CHANNEL_OBJECT`, `UNIT_CHANNEL_SPELL`, `PLAYER_SKILL_INFO`,
`PLAYER_FARSIGHT`, `PLAYER_RUNE_REGEN_1..4`, `UNIT_CREATED_BY_SPELL` and
the `PLAYER_FIELD_BYTES` toggle byte [M, `protocol/update-fields.ts`].

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_SPELL_FAILED_OTHER`
has the `SMSG_SPELL_FAILURE` body (packed guid, cast count, spell,
result; `Spell.cpp:5327-5339`; wowm has a plain guid and the spell);
the flat and percent modifier value is `int32`
(`Entities/Player/Player.cpp:10127`); `SMSG_MODIFY_COOLDOWN` is signed
milliseconds (`Player.cpp:11284-11287`); `CMSG_UPDATE_MISSILE_TRAJECTORY`
ends with `u8 moveStop` and an optional movement packet
(`Handlers/MiscHandler.cpp:1735,1758-1765`). An endless channel writes
`0xFFFFFFFF` as its duration (`Spell.cpp:4247-4250`).

**Tasks** (14): spells-1 channels (NS1); -3 aura cancel (NS1); -4 action
bar writes (NS1, direct drive); -5 spellbook housekeeping (NS1); -6
visuals (NS1); -12 the `spell` tool with cast, cancel aura and bar, and
`stop` ending channels (NS1); -2 other units' casts (parties); -8 totems
(parties); -13 target casts in the harness (parties); -7 professions and
skills (NS2); -9 death knight runes (NS2); -14 `spell` professions and
totems (NS2); -10 far sight and mirror images (long tail); -11
projectiles and missiles (long tail, with `vehicles`).

**Live proof.** `eversong10-mage` with Arcane Missiles (finish, cancel,
pushback) and Frost Armor; `ghostlands20` login for the modifiers and
inactive ranks; `interact train` for the visual kits 179 and 362;
Mining learned then unlearned. Totems and runes need shaman and death
knight presets, else R22 from `Server/Packets/TotemPackets.cpp:25-33` and
`Player.cpp:13740-13742`. `SMSG_MODIFY_COOLDOWN` (level-80 glyph scripts)
and `SMSG_SET_PROJECTILE_POSITION` (vehicle combat) fall back to R22.

**Dead.** `SMSG_SPELL_UPDATE_CHAIN_TARGETS` (no sender),
`SMSG_RESYNC_RUNES` (its only call is commented out), `SMSG_ADD_RUNE_POWER`
(no caller).

**Decisions** (not yet ruled): `spell do:"cast"` for unit and self targets
lands here; `CMSG_CANCEL_GROWTH_AURA` is built, because the server accepts
it with a real handler (`Handlers/SpellHandler.cpp:642-644`) and rule 7
counts every opcode the server accepts, even one whose handler does
nothing; the proof is that the server accepts it; automatic mirror-image
requests stay off; the missile builder never writes the movement tail.

**Needs the maintainer:** shaman and death knight presets; truth picks
for auras, the action bar and skills (the realm service).

**Risks.** Waiting for channels can slow fights for weak channels; the
harness may cancel on target death or danger. A wrong client-side
validation would hide a real refusal.

### 5.11 `talents`

**Rows.** 7 rows: 5 relevant (1 stub, 4 missing), 2 dead. Code area
`talents`. Goals: L (rank 5), P (talent and glyph correctness at raid
level).

**Why.** One talent point per level from level 10 (`level - 9`,
`Entities/Player/Player.cpp:13938-13960`), so 71 unspent points by level
80, because `CMSG_LEARN_TALENT` is missing and `SMSG_TALENTS_INFO` is a
stub [M]. `SMSG_TALENTS_INFO` is sent at every login and every level-up,
at any level (`Player.cpp:11786,2593-2611`, no level check in
`:14840-14849`) [M]. Glyphs add six slots from level 15; Peon fills only
slot 0, because `buildUseItem` writes glyph index 0 [M,
`protocol/item.ts:90`].

**Store, events, acts.** `parseTalentsInfo` returns a player form (free
points, spec count, active spec, per spec the talents with 0-based ranks
and 6 glyph ids) or a pet form (6 bytes when there is no pet,
`Player.cpp:14770-14778`). `TalentStore` keeps both forms, a pending wipe
offer, and reads `CHARACTER_POINTS1`, `GLYPH_SLOTS_1`, `GLYPHS_1` and
`GLYPHS_ENABLED` (private fields; `readSelfField` gains them). A lazy
talent catalog from `Talent.dbc`, `TalentTab.dbc`, `GlyphProperties.dbc`
and `GlyphSlot.dbc` (`src/server/shared/DataStores/DBCfmt.h:58,59,121,122`).
Events: `info` (with the diff), `points`, `pet_info` (for `pets`),
`wipe_offer`, `wipe_refused`. Acts, one in flight: `learnTalents(plan)`
(validates class, rank, points, tier gating and prerequisites as
`Player.cpp:14268-14400` does, orders the plan, sends one
`CMSG_LEARN_TALENT` or one `CMSG_LEARN_PREVIEW_TALENTS` of at most 150
entries, and waits for the next player-form `SMSG_TALENTS_INFO`, never
the pet form); `resetTalents({ npcGuid, maxCost })` (select the gossip
option, await the offer, never confirm above `maxCost`);
`removeGlyph(slot)`; `applyGlyph({ item, slot })` through `CMSG_USE_ITEM`
with a glyph index (a lease shared with `objects` on `protocol/item.ts`).

**Verbs.** A new tool `talents` of kind `action` (`show`, `learn`,
`glyph`, `unglyph`; `show` runs sequentially and is refused while the
human drives in PLAY mode, contract D25);
`interact do:"reset_talents"` with
`max_cost` (default 0: show the cost, do not pay), matching the option
text prefix "I wish to unlearn my talents" (438 rows in
`data/sql/base/db_world/gossip_menu_option.sql`). `look` shows "N talent
points free". Log rows (domain `talents`): points free, learned, refused
(with the local reason), wipe offer, reset, glyph change.

**Evals.** `t8-talents-spend` (level 12 by `soap setup level`; game-log
rows of the server's `SMSG_TALENTS_INFO` until truth has talents),
`t8-talents-reset` (truth money delta equals the offered cost),
`t8-talents-glyph` (truth item count drops by one).

**Wire.** Layouts agree [M]. `CMSG_REMOVE_GLYPH` carries a slot index,
not a glyph id: AC drops values of 6 or more
(`Handlers/CharacterHandler.cpp:1606-1612`; wowm names the field
`glyph`). Every rank on the wire is 0-based. `CMSG_LEARN_TALENT` has no
failure packet: `Player::LearnTalent` returns silently on every refusal,
then the handler always sends `SMSG_TALENTS_INFO`
(`Handlers/SkillHandler.cpp:31`).

**Tasks** (5): talents-1 parse talent info and read talent fields (NS1:
it removes a login stub); talents-2 talent catalog (NS2); talents-3 learn
and the `talents` tool (NS2); talents-4 reset at a trainer (NS2);
talents-5 glyphs (NS2).

**Live proof.** Any login (talents-1); a level-12 throwaway for the
learn eval; `soap setup money` for the reset; `soap setup level 15` and
`items/add` of a class glyph for glyphs. `.reset talents <name>` is
`Console::Yes` (`src/server/scripts/Commands/cs_reset.cpp:56`) and is
available through `soap gm reset-talents`.

**Dead.** `CMSG_UNLEARN_TALENTS` (`Handle_NULL`, `Opcodes.cpp:662`),
`SMSG_TALENTS_INVOLUNTARILY_RESET` (no writer).

**Decisions** (not yet ruled): if the talent DBCs are not available in
time, talents-3 ships in a degraded mode (raw ids, no local validation,
every refusal `refused_by_server`); on AC's reset bug (the counter is
zeroed before the money check, `Player.cpp:3890-3901`, so a poor
character gets `SMSG_BUY_FAILED` and a guid-0 reply) core reports
`not_enough_money`; the agent chooses talents from `show`, with no default
plan.

**Needs the maintainer:** where the four talent DBCs come from (the
configured data directory holds only `Spell*.dbc`, `FactionTemplate.dbc`
and `SkillLineAbility.dbc`); truth fields for talents and glyphs.

**Risks.** Local refusal reasons can drift from AC's rules; tests pin each
rule to its `Player.cpp` line. A playerbots hook can veto a learn
(`Player.cpp:14290`).

### 5.12 `pets`

**Rows.** 35 rows: 30 relevant (29 missing, 1 absent:
`CMSG_STABLE_REVIVE_PET` 0x274), 5 dead. Code area `pets`. `CMSG_PET_ACTION` is handled but has a
body gap. Goals: L (hunter, warlock, death knight; rank 8), P (stance,
taunt control).

**Why.** Core sends one pet packet, the attack command [M,
`protocol/pet.ts:3-13`]. There is no pet bar, stance, follow, stay, pet
spell, pet cooldown, pet name, stable or pet talent. Only the pet bar can
stop a hunter pet that pulls a second mob [I]. `SMSG_PET_SPELLS` is also
the control bar for vehicles, charmed and possessed units
(`Entities/Player/Player.cpp:9828-9990`), so `vehicles` reuses this parser.

**Store, events, acts.** `PetStore`: the bar (guid, family, duration,
react, command, `u16` flags so the vehicle value 0x800 survives, 10
slots, spells with autocast state, cooldowns with 0x80000000 as
infinite), cooldowns (also from pet-guid `SMSG_SPELL_COOLDOWN` and
`SMSG_CLEAR_COOLDOWN`, which `combat-store.ts:282-296` drops today; a
lease), names by pet number, last refusal. `StableStore`: the last stable
list and result. A core `petView(selfGuid)` joins the owner's
`UNIT_FIELD_SUMMON`, the pet entity, its fields (`PETNUMBER`,
`PET_NAME_TIMESTAMP`, the rename and abandon bits of
`UNIT_FIELD_BYTES_2`, happiness in `POWER5`) and the store. Events: `bar`,
`spell_learned`, `spell_unlearned`, `cast_failed`, `tame_failed`,
`feedback`, `name`, `name_invalid`, `stable_list`, `stable_result`,
`unanswered`, `combo_points`. Acts: `petCommand`, `petStance`,
`petStopAttack`, `petCast` (shares the spell-target writer),
`petAutocast`, `petSetAction`, `petSwapActions`, `petCancelAura`,
`requestPetInfo`, `queryPetName`, `renamePet`, `abandonPet`,
`dismissCritter`, `learnPetTalent(s)` (at most 30), the five stable acts,
`stableRevivePet`. Core refuses `dismiss` by command 3 for a hunter pet
(`hunter_pet_dismiss`), because that deletes it
(`Handlers/PetHandler.cpp:287-288`). The runtime sends
`CMSG_REQUEST_PET_INFO` after every stance, follow, stay or autocast
change, because the server sends no reply and the next bar confirms it
(`Handlers/MiscHandler.cpp:1567-1568`); a new pet number or name
timestamp triggers a name query.

**Verbs.** A new tool `pet` (kind `action`; `status` reads, runs
sequentially and is refused while the human drives in PLAY mode, contract
D25): `do:
status|call|dismiss|revive|attack|follow|stay|stop|stance|cast|autocast|
rename|abandon|tame|talent`, with `what` and `target`. `abandon` runs only
when `what` equals the pet's current name. `interact` at a stable master
lists the stable and gains `stable`, `unstable`, `buy_slot` (a lease on
`interact`). Log rows (domain `pets`): `out`, `gone`, `learned`,
`refused`, `stable`.

**Evals** (`eversong10-hunter`): `t8-pets-command`, `t8-pets-spells`,
`t8-pets-rename`, `t8-pets-abandon`, `t8-pets-stable`, `t8-pets-talent`.
Truth has no pet field; the interim check is `soap gm read pet` (`.pet
list <Name>` is `Console::Yes`, `src/server/scripts/Commands/cs_pet.cpp:47`),
a console-read check source (section 4.5).

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_PET_CAST_FAILED` has
no `multiple_casts` byte (`Spells/Spell.cpp:4842-4861`); Peon's
`parseCastFailed` already matches AC. `MSG_LIST_STABLED_PETS` has no
loyalty field (`Handlers/NPCHandler.cpp:377-411`; wowm has one).
`CMSG_PET_RENAME` reads five declined names when its flag is set
(`PetHandler.cpp:885-891`); Peon always sends 0. `SMSG_PET_SPELLS` has one
`u16` flags word where wowm has two bytes (same bytes).

**Tasks** (12): pets-1 bar and pet info (NS1); pets-2 commands and stances
(NS1); pets-3 pet spells and bar layout (parties); pets-9 `pet` tool status
and commands (parties); pets-4 names and rename (NS2); pets-5 stable
(NS2); pets-6 abandon, tame failures, companions (NS2); pets-7 pet talents
core (NS2, after `talents`); pets-10 `pet` spells, rename, abandon, tame
(NS2); pets-11 stable on `interact` (NS2); pets-12 pet talent verb (NS2);
pets-8 pet combo points (long tail, R22 only).

**Live proof.** The hunter preset casts Call Pet; each stance and command
then shows in the requested bar; Growl twice for `not_ready`; rename to
"A" for `too_short`; money staged for a stable slot; abandon, then Call
Pet gives tame failure reason 7 (`Spell.cpp:6709`). No warlock or death
knight preset exists, so `SMSG_PET_ACTION_SOUND`, `SMSG_PET_DISMISS_SOUND`,
`SMSG_PET_ACTION_FEEDBACK` and pet combo points fall back to R22 from
`Server/Packets/PetPackets.cpp:54-68` and `Entities/Unit/Unit.cpp:12556-12564,12867-12879`.

**Dead.** `SMSG_PET_MODE`, `SMSG_PET_BROKEN`, `SMSG_PET_UNLEARN_CONFIRM`
(no sender), `CMSG_PET_UNLEARN` (`Handle_NULL`, `Opcodes.cpp:883`),
`SMSG_PET_GUIDS` (only a comment names it, `Player.cpp:11812`).

**Decisions** (not yet ruled): pets-1 and pets-2 join NS1; if the hunter
template has no pet, evals start with `pet do:"tame"`;
`CMSG_STABLE_REVIVE_PET` gets a builder and an "accepted" proof, as rule 7
counts every opcode the server accepts, even with an empty handler
(`NPCHandler.cpp:641-644`); the hunter-dismiss guard lives in core, an
exception to "behaviour in the harness", because the mistake deletes the
pet; pet talents live in the `pet` tool.

**Needs the maintainer:** warlock and death knight presets; a pet in the
hunter template if it has none; truth fields for pets.

**Risks.** Abandon and command-3 dismiss are destructive (throwaway
accounts only). `.pet list` output is a localised message, so the check
depends on the server locale.

### 5.13 `group`

**Rows.** 22 rows: 19 relevant (3 stubs, 16 missing), 3 dead, plus the
`SMSG_GROUP_LIST`, `SMSG_PARTY_MEMBER_STATS` and `SMSG_GROUP_INVITE` body
gaps. `group` is a harness core domain, so the new code goes into code
areas `raid` (structure, ready check, marks, pings, summons, member-stat
requests, kick by guid) and `looting` (loot owner, loot rules, master
loot); the existing party code stays legacy, and its body fixes go through
leases on `protocol/group.ts`, `party-store.ts` and `world-handlers.ts`.
Goals: P (rank 1).

**Why.** A party works today, but raids do not: no convert, subgroups,
assistants, marks or master loot, and the ready check is a stub that
cannot answer [M]. `SMSG_LOOT_LIST` arrives on every kill, also solo, and
is dropped.

**Staging.** Every group opcode needs a partner: a second throwaway
account driven through its puppet with the `call` methods of section 4.4
(`invite`, `acceptInvite`, and new ones for ready check, mark, ping). The
server offers no SOAP group commands (`.group join` and the rest are
`Console::No`, `src/server/scripts/Commands/cs_group.cpp:37-42`); `.group
list <Name>` is `Console::Yes` and prints only "Raid" or "Party" and the
size (`:224`). Two `eversong10` accounts are the default pair. Raid
convert refuses below `Group.Raid.LevelRestriction`, default 10
(`Groups/Group.cpp:317-325`).

**Store, events, acts.** `PartyStore` (legacy, lease) gains the group kind
(party, raid, battleground, dungeon finder), own subgroup, flags and
roles, per member subgroup, flags, roles and status bits, per member
power, zone, position, auras, pet and vehicle seat, the three difficulty
bytes, and the dungeon-finder status; `conn.partyMembers` folds into it
(a `world-conn.ts` change, so a coordinator `COORD-<n>` commit; contract
D20).
New stores: `ReadyCheckStore`, `RaidMarkStore` (8 slots; a set clears the
same target from other slots, `Group.cpp:1835-1839`), `LootOwnerStore`
(bounded to 64, plus master-loot candidates), `SummonStore` (expires after
120 s, `Entities/Player/Player.h:923`), and the requested pass-on-loot
flag. Events: `group_list` with a `changes` list, `member_stats` with
transitions (died, ghost, revived, offline, online), `ready_check_started`,
`ready_check_answer`, `ready_check_finished`, `raid_mark`, `raid_marks`,
`minimap_ping`, `loot_owner`, `master_loot_candidates`,
`summon_requested`, `summon_expired`. Acts: `uninviteGuid`,
`setLootMethod`, `convertToRaid`, `moveToSubgroup`, `swapSubgroups`,
`setAssistant`, `setMainTank`, `setMainAssist`, `startReadyCheck`,
`answerReadyCheck`, `finishReadyCheck`, `setRaidMark`, `clearRaidMark`,
`requestRaidMarks`, `pingMinimap`, `requestMemberStats`, `giveMasterLoot`,
`answerSummon`, `setPassOnLoot`, and `awaitGroupChange(predicate,
timeoutMs)`, because most sends get no reply except the next roster. AC
has no ready-check timer (`Handlers/GroupHandler.cpp:804-815`), so as
initiator the harness sends the finish after all answers or 30 s.

**Verbs.** A new tool `group` (kind `action`; `status` reads, runs
sequentially and is refused while the human drives in PLAY mode, contract
D25): `do:
status|kick|lead|raid|move|swap|promote|ready_check|ready|mark|loot_rules|
give|summon|ping|pass_loot|roll`. Permission checks live in the harness,
so a silent server drop becomes a clear refusal; each verb settles on the
roster or returns `UNCONFIRMED`. `roll` answers group loot rolls through
the handled `rollLoot`, which no tool calls today [M, `client.ts:293`].
The `loot` tool skips a corpse that `loot_owner` gives to someone else (a
lease on `loot`). Invite, accept, decline and leave stay on `social`. Log
rows (domain `raid`): roster changes, member transitions, ready check
(wake), answers, summary, marks, pings, summons (wake), master-loot
candidates. `SMSG_LOOT_LIST` gets no row.

**Evals** (two `eversong10` accounts, `"partner": "partner"`):
`t9-raid-convert`, `t9-raid-kick`, `t9-raid-ready`, `t9-raid-answer`,
`t9-raid-mark`, `t9-raid-master-loot` (truth inventory +1; the target may
be the master himself, `Entities/Unit/Unit.cpp:14640-14641`),
`t9-raid-summon` (after `objects` has meeting stones). Raid and size are
checked through `soap gm read group`; flags and subgroups need a truth
field.

**Body gaps** [M, `protocol/group.ts:100-131,160-212` against
`Group.cpp:1901-1950` and `GroupHandler.cpp:817-1135`]: `SMSG_GROUP_LIST`
skips the type, own subgroup, flags and roles, each member's subgroup,
flags and roles, and the difficulty bytes; it reads the status mask as
online, but a battleground member carries the PvP bit even when offline;
the loot block is always 13 bytes when the count is not 0. **A
dungeon-finder group breaks the parse**: with type bit 0x08 AC writes `u8`
status and `u32` dungeon id before the group guid (`Group.cpp:1906-1910`);
wowm has the same gap, so the fixture must come from AC.
`SMSG_PARTY_MEMBER_STATS` and `_FULL` keep only the online bit and skip
power, zone, position (`uint16` casts of floats,
`GroupHandler.cpp:887-889`; read as `int16` [I]), auras, pet fields and
the vehicle seat; `_FULL` for a mana user has no power-type bit.
`SMSG_GROUP_INVITE` status 0 (already in a group) must not open an
invite (`GroupHandler.cpp:166-175`). `PartyOperation.SWAP` is 4, not 3,
and `PartyResult` lacks codes such as `ERR_RAID_DISALLOWED_BY_LEVEL` 25
(`Server/WorldSession.h:254-260`, `src/server/shared/SharedDefines.h:3961-3986`).

**Wire disagreements (AzerothCore wins)** [M]: `MSG_RAID_TARGET_UPDATE`
full list holds only the set icons, 0 to 8 pairs (`Group.cpp:1861-1862`;
wowm has a fixed 8); `MSG_RAID_READY_CHECK` from the server is the
initiator guid only (`GroupHandler.cpp:785-786`); the client
`MSG_RAID_READY_CHECK_CONFIRM` is `Handle_NULL`, so the answer is a
one-byte `MSG_RAID_READY_CHECK`; `MSG_RAID_READY_CHECK_FINISHED` has no
wowm server form; `MSG_PARTY_ASSIGNMENT` role 1 is main assist (flag 0x04,
`Groups/Group.h:79-83`), not assistant.

**Tasks** (11): group-4 loot ownership and loot rules (NS1 for
`SMSG_LOOT_LIST`, which arrives on every solo kill); group-1 full roster;
group-2 full member stats; group-3 raid structure; group-5 master loot;
group-6 ready check; group-7 marks and pings; group-9 `group` tool status
and raid admin; group-10 `group` tool ready, marks, loot, ping, pass,
roll (all parties); group-8 summons (NS2, R22 until `objects`); group-11
summon verb (NS2).

**Live proof.** Invite the partner and capture both rosters; a far
partner (`ghostlands20`) for out-of-range stats; convert, move, swap,
promote, each seen in the next roster; a level-9 partner
(`soap gm level 9`) for the convert refusal; both ready-check roles; mark
and list; the partner pings. LFG roster, summons and the effect of
opting out of loot fall back to R22 until `instances` and `objects` land.

**Dead.** `CMSG_GROUP_CANCEL` (`Handle_NULL`), `SMSG_LOOT_ITEM_NOTIFY` and
`SMSG_REAL_GROUP_UPDATE` (no sender).

**Decisions** (not yet ruled): new code beside the legacy party code, no
migration; invite verbs stay on `social`; `group do:"roll"` is in scope;
the initiator finishes its ready check after 30 s; `instances` defines the
difficulty enum; partners are puppets only, never playerbots.

**Needs the maintainer:** a group truth field (flags, subgroups, marks,
loot rules) in the realm service.

**Risks.** Every live proof depends on the partner `call` methods; if
they slip, only R22 remains, which rule 9 does not accept for opcodes the
server sends. Icon names and ready states are unconfirmed until a
capture.

### 5.14 `instances`

**Rows.** 47 rows: 46 relevant (5 stubs, 41 missing), 1 dead. Two code
areas: `instances` (19 rows: difficulty, binds, lockouts, resets,
warnings, the homebind timer, encounter frames) and `lfg` (28 rows:
dungeon finder and raid browser). Goals: P (rank 3), L (rank 11: random
dungeon rewards).

**Why.** `MSG_SET_DUNGEON_DIFFICULTY` arrives at every login and is
dropped; `SMSG_INSTANCE_DIFFICULTY` is a stub. Heroics and raids need
difficulty, binds and resets. The dungeon finder is the normal way to form
a five-player group [I]. LFG cannot bring a ghost back; only the dungeon
entrance can (`objects`).

**Stores and events.** `InstanceStore`: dungeon and raid difficulty, the
current map's difficulty, saved maps after a far teleport, lockouts with
arrival time, a pending bind (60 s, `Maps/Map.cpp:2134,2138`), the
homebind timer, encounter units, the last warning; per-map state clears
on `SMSG_NEW_WORLD` (through `listen`, never a second handler). Events:
`difficulty`, `map_difficulty`, `lockouts`, `bind_offer`, `bound`,
`reset`, `reset_failed`, `reset_blocked`, `warning`, `homebind_timer`,
`corpse_elsewhere`, `encounter`, `saved_maps`. `LfgStore`: status (none,
role check, queued, proposal, boot, dungeon, finished, raid browser),
selected dungeons, roles, available random dungeons with rewards and
locks, party locks, queue status, role check, proposal (40 s,
`DungeonFinding/LFGMgr.h:51`), boot vote (120 s), reward, teleport error,
raid browser lists. Events: `status`, `join_result`, `queue`,
`role_check`, `role_chosen`, `proposal`, `boot_vote`, `teleport_denied`,
`offer_continue`, `reward`, `dungeons`, `raid_list`.

**Acts.** `instances`: `requestLockouts`, `setDifficulty` (refuses out of
range, unchanged, or not leader; a solo change outside a dungeon is
silent on the server, `Handlers/MiscHandler.cpp:1313-1314,1470-1471`, so
the result is `unconfirmed_solo`), `resetInstances` (normal difficulty
only; no bind means no packet, so the result is `nothing_to_reset`),
`answerBind`, `setLockoutExtended`. `lfg`: `requestDungeons`,
`requestPartyLocks`, `requestStatus`, `join` (at most 50 entries; no reply
at all means every LFG option is off, `Handlers/LFGHandler.cpp:52-55`),
`leave`, `setRoles`, `answerProposal`, `teleport`, `voteKick`,
`setComment`, `searchRaids`, `stopSearch`. Core never answers a prompt by
itself. AC's role check never times out in practice (milliseconds added
to seconds, `LFGMgr.h:49`, `LFGMgr.cpp:834`), so the harness leaves the
queue after 60 s without an answer.

**Verbs.** A new tool `dungeon` of kind `action` (`status` reads, runs
sequentially and is refused while the human drives in PLAY mode, contract
D25):
`status`, `difficulty`, `reset`, `bind`, `extend`, `queue` (with `auto`,
default true: accept the next proposal and role check, because the
windows are shorter than a model turn), `leave_queue`, `answer`, `roles`,
`teleport` (refuses while dead and says why), `kick_vote`. The harness
never votes or answers the bind prompt by itself; if the agent does not
answer, the server binds after 60 s. `queue` refuses `auto: true` until
the `group` roster fix for LFG groups has landed. `look` shows saves and
the queue. Log rows (domains `instances` and `lfg`), with `queue` rows at
debug level only.

**Evals.** `t9-instances-reset` (`soap gm tele` in and out of the
Deadmines on `ghostlands20`, then reset: the server's
`SMSG_INSTANCE_RESET`), `t9-instances-difficulty` (`max80`; a post-run
teleport into a Wrath dungeon shows the difficulty, because the solo
change is silent), `t9-lfg-queue` (`auto: false`), `t9-lfg-run` (five
characters: the agent and four puppets with one tank, one healer and two
damage; the server does not check roles against classes,
`LFGMgr.cpp:1603-1650`).

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_RAID_INSTANCE_MESSAGE`
type 4 ends with `u8` locked and `u8` extended (`Entities/Player/Player.cpp:12002-12006`);
`SMSG_RAID_GROUP_ONLY` sends (0, 0) to hide the timer, a value wowm's
enum lacks (`Entities/Player/PlayerUpdates.cpp:1429-1455`);
`CMSG_SET_SAVED_INSTANCE_EXTEND` difficulty is `u32`
(`Handlers/CalendarHandler.cpp:793-817`; wowm `u8`); `SMSG_LFG_PLAYER_INFO`
lock count is `u32` (`LFGHandler.cpp:32`); `SMSG_LFG_UPDATE_PARTY` has 7
flag bytes, not 4 (`:339-381`); `SMSG_LFG_JOIN_RESULT` has a `u8` player
count (`:42`); `SMSG_LFG_PLAYER_REWARD` writes display id before count
(`:475-511`); `SMSG_UPDATE_LFG_LIST` inverts the full and difference
flag, writes the bind fields only with flag 0x80, and has an `f32` item
level (`LFGMgr.cpp:1321-1429`); `CMSG_LFG_JOIN` always reads 3 need bytes
and at most 50 slots (`Server/Packets/LFGPackets.cpp:20-34`);
`SMSG_RAID_INSTANCE_INFO` writes 1 where wowm says `expired`
(`Entities/Player/PlayerStorage.cpp:6749`).

**Tasks** (11): instances-1 difficulty and instance notices (NS1: login
stubs); instances-2 lockouts and bind prompt; instances-3 difficulty
requests and resets; instances-4 encounter frames; instances-5 `dungeon`
instance verbs; instances-6 LFG status and lock info; instances-7 queue
and role check; instances-8 proposal, teleport, kick vote, reward;
instances-10 `dungeon` LFG verbs; instances-11 five-character run (all
parties); instances-9 raid browser (long tail).

**Live proof.** Login and a far teleport through the tap; the Deadmines
through `soap gm tele` (game_tele rows 260 inside and 1041 outside,
`data/sql/base/db_world/game_tele.sql:301,1082`); probes for lock info,
status, raid info, the teleport refusal (error 6) and the raid browser;
a logout for `SMSG_LFG_UPDATE_SEARCH`. Heroic and raid binds, encounter
frames, the lock warning and the reward fall back to R22 until level-80
raid staging exists. `.debug lfg` changes shared server state and
announces itself to every player (`LFGMgr.cpp:888-899`), so rule 10
forbids it.

**Dead.** `SMSG_LFG_DISABLED` (its only writer has no caller).

**Decisions** (not yet ruled): `queue auto` defaults on, off in evals;
solo difficulty changes stay unconfirmed; each reset eval uses a fresh
character (five instances per hour, `Maps/MapMgr.cpp:232-244`); the first
instances-6 worker records the live LFG options before instances-7 relies
on them.

**Needs the maintainer:** whether evals may join groups that random bots
complete (`AiPlayerbot.RandomBotJoinLfg` defaults to 1); truth fields for
difficulty and binds.

**Risks.** Until the `group` fix lands, a successful LFG proposal
corrupts the roster; nine layouts differ from wowm.

### 5.15 `remote-motion`

**Rows.** 25 relevant (24 missing, 1 absent: `SMSG_SPLINE_SET_PITCH_RATE`
0x45E), 0 dead. Code area `unitmotion` (`remote-motion` breaks the naming
rule, and `remote-motion*.ts` are existing item 6 files). Goals: P
(roots and snares for kiters and healers; boss hover and flight), D (the
self-guid case), L (low).

**Why.** Every unit has nine speeds (`Entities/Object/Object.cpp:357-365`).
When a forced speed change hits a unit no client controls, the server
sends the new absolute speed to every observer
(`Entities/Unit/Unit.cpp:11031-11041`); a snare changes seven speeds at
once (`Spells/Auras/SpellAuraEffects.cpp:3895-3908`) [M]. Flag toggles
(root, walk, swim, water walk, feather fall, hover, can fly, gravity) are a
packed guid only. The same packets reach the character itself while it is
feared, confused, charmed or on a taxi, because `IsClientControlled()` is
false then (`Unit.cpp:16974-16999`) [M]. Two toggles arrive on every
creature death: `SMSG_SPLINE_MOVE_UNSET_HOVER` and
`SMSG_SPLINE_MOVE_GRAVITY_ENABLE` (`Entities/Creature/Creature.cpp:2002-2003`;
the setters send without a change check). Today `RemoteMotion` accepts
only other players [M, `client-connection.ts:195-199`], and no store holds
another unit's speed.

**Parser and store.** One table maps the 25 opcodes to a speed kind or a
flag bit (`Unit.cpp:14069-14075,16080-16287`; bit values match
`protocol/entity-fields.ts:36-68`). `UnitMovementStore` per unit: flags
(seeded from the create block, changed bit by bit; root clears the moving
bits as AC does, `Unit.cpp:14069-14070`), nine speeds with their source,
and whether the server controls it. Unknown guids are dropped and counted.
A unit leaves with the entity. `ratio(guid, kind)` uses AC's base speeds
(`Unit.cpp:80-103`); `slowed` compares with the unit's own previous run
speed, because templates scale speed (`Unit.cpp:10947-10949`). Events:
`speed`, `flag`, `removed`, each with `self`. No acts. The area does not
change control: it emits self events, and control (item 6) decides what
to do with them. For other players a toggle re-runs
`classifyGroundFlags` (a lease on `remote-motion.ts`).

**Verbs.** None. `look` unit rows gain a short word when movement is not
default (`rooted`, `slowed 50%`, `swimming`, `flying`, `hover`); the
puppet's `nearby --json` gains the raw movement object, so a witness can
confirm it. Log rows (domain `unitmotion`, class `log`): `slowed`, `sped`,
`rooted`, `freed`, only for units in the current fight, with speed events
of one guid merged within 100 ms. No rows for the per-kill toggles.

**Body gaps.** The create block reads 3 of the 9 speeds
(`protocol/movement-block.ts:24-31`) [M]; `MSG_MOVE_SET_*_SPEED` from
other players is parsed and its speed dropped
(`remote-motion-handlers.ts:31-41`); the compressed-moves filter drops the
spline opcodes (correctness only: AC never writes
`SMSG_COMPRESSED_MOVES`). Leases on `movement-block.ts`,
`world-handlers-entity.ts` and `remote-motion-handlers.ts`.

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_SPLINE_MOVE_ROOT` has
a packed guid (`Unit.cpp:14085-14086`; wowm a plain `Guid`); the flying
toggles use the 3.3.5 blocks of their wowm files (0x422, 0x423); 0x45E has
no wowm file. `SMSG_SPLINE_MOVE_SET_FLYING` sets `CAN_FLY`, not `FLYING`
(`Unit.cpp:16148-16158`).

**Tasks** (7): unitmotion-1 parser, store and the nine create-block speeds
(NS1); -2 creature death toggles (NS1); -3 snare speeds (parties); -4
root, walk mode, swim (parties); -7 harness words, nearby fields, log rows
(parties); -5 turn and pitch rate (long tail); -6 fall, water walk, hover
and flight toggles (long tail). Task 1 parses all 25 and registers none,
so tasks 2-6 edit no shared table.

**Live proof.** Any kill (task 2); a Frostbolt, Hamstring or Concussive
Shot snare and a Frost Nova root on `eversong10` presets, with `soap gm
learn` if the template lacks the spell. Turn and pitch rate have no
caller: `UpdateSpeed` handles only seven types (`Unit.cpp:10842-10925`),
so R22 from `Unit.cpp:11037-11040`. Walk and run mode (SmartAI only),
swim, water walk, feather fall, hover, flying and gravity toggles fall back
to R22 unless a cheap trigger is found. Of the 11 opcodes the research
counted as seen, only the two death toggles have surviving evidence; the
other 9 rest on deleted logs.

**Decisions** (not yet ruled): one parser table in the first task; player
poses re-classify on a toggle; 100 ms merge window; `slowed` compares with
the unit's previous speed; the self events are emitted and the item 6
owner decides their consumer.

**Risks.** Most rows will end "not seen live". A fight with an area snare
sends seven packets per mob per tick; if the rows still flood, only the
`look` words stay.

### 5.16 `vehicles`

**Rows.** 14 relevant, all missing, 0 dead. Code areas `vehicles`
(seats, spell-click, player vehicles) and `transports` (boats, zeppelins,
lifts); both change control under a lease. Goals: L (Northrend vehicle
quests; boats and zeppelins before the level-58 portals), P (Ulduar, the
gunship, the Oculus; vehicle fights in 5-player and raid instances), D
(driving a vehicle). The death knight start chain probably uses possess
or vehicle steps (`src/server/scripts/EasternKingdoms/zone_the_scarlet_enclave.cpp:37-45,1208-1211`) [M file, I steps].

**Why.** Control refuses a mover that is not the character and refuses
to move with `ON_TRANSPORT` [M, `control-sync.ts:238-249`,
`control-motion.ts:38`]: safe, but nobody can ride or drive. Transports
need no missing opcode to attach a passenger: any movement packet with
`ON_TRANSPORT` and a transport guid attaches it, and one without detaches
it (`Handlers/MovementHandler.cpp:437-486`) [M]. The gap is control and a
client-side path model, because after the create block the server sends
a transport's position only when it changes map
(`Entities/Transport/Transport.cpp:165-183`). `CMSG_SPELLCLICK` is not
vehicle-only: it casts the click spell, and only a spell with
`SPELL_AURA_CONTROL_VEHICLE` seats the character
(`Entities/Unit/Unit.cpp:15136-15146,15174`); it changes no control.

**Flows** [M]. Entering a seat: `SMSG_ON_CANCEL_EXPECTED_RIDE_VEHICLE_AURA`,
`ON_TRANSPORT` with the seat, on a driver seat `SMSG_CLIENT_CONTROL_UPDATE`
for the vehicle and `SMSG_PET_SPELLS` (the vehicle bar, a `pets` row),
`SMSG_FORCE_MOVE_ROOT`, the boarding spline as a self
`SMSG_MONSTER_MOVE_TRANSPORT`, then the client acks the root and sends
`CMSG_MOVE_SPLINE_DONE` (`Entities/Vehicle/Vehicle.cpp:410-468`,
`Handlers/TaxiHandler.cpp:260-269`). Leaving: unroot, exit point, and
control back to the character.

**Stores, events, acts.** `VehicleStore`: the character's seat (vehicle,
seat id, controlling), vehicle ids per unit. `TransportStore`: per
transport the create pose, rotation and path progress, the template data
fields, and `poseAt(guid, now)` from a port of AC's keyframe builder over
`TaxiPathNode.dbc` (motion transports) and `TransportAnimation.dbc`
(lifts), `undefined` when data is missing. Control gains a mover concept
(the vehicle becomes the mover on `SMSG_CLIENT_CONTROL_UPDATE`; moves then
use its guid, position and speeds) and a passenger state (world pose =
transport pose + rotated offset). Events: `entered`, `exited`,
`seat_changed`, `control`, `player_vehicle`, `ride_aura_cancel`,
`boarded`, `left`, `map_change`. Acts: `spellClick`, `exit` (dismiss form
when driving), `nextSeat`, `prevSeat`, `switchSeat`,
`changeSeatOnControlled`, `enterPlayerVehicle`, `ejectPassenger`; on
control `boardTransport`, `leaveTransport`. AC answers none of these with
an error packet, so each resolves on its event or a 3 s `no_answer`.

**Verbs.** A new tool `vehicle` (kind `action`): `board { unit }`,
`leave`, `seat { next | prev | n }`, `ride_with { player }`, `eject {
unit }`. Driving uses `travel` and item 6's primitives on the current
mover. Vehicle abilities use the `pet` tool's bar. `travel ride { to }`
walks to the dock, waits until `poseAt` shows the transport docked, boards
and leaves at the named stop; it refuses with `transport_data_missing`
without data. `vehicle/entered` and `vehicle/control` wake the agent,
because a script can seat the character. Log domains `vehicles` and
`transports`.

**Evals.** `t8-vehicles-board` (a level-80 preset next to a spell-click
vehicle; the Wintergarde Gryphon 27258 is a candidate to verify first),
`t8-vehicles-zeppelin` (Orgrimmar to Thunder Bluff, transport 20, both
ends on map 1; truth point at the far tower), `t8-vehicles-drive` (quest
11652 with a Horde Siege Tank 25334; truth quest counts rise).

**Body gaps** [M, `protocol/movement-block.ts`]: `UPDATEFLAG_TRANSPORT`
path progress skipped (`:65`); `UPDATEFLAG_VEHICLE` id and orientation
skipped (`:66`); `UPDATEFLAG_POSITION` drops the transport guid and
offset (`:44-51`); the game object query body (shared with `objects`,
which owns it); the `SMSG_TRANSFER_PENDING` body (shared with
`selfstate`); the compressed-moves filter; NPC flag `PLAYER_VEHICLE`
0x02000000 has no role.

**Wire disagreements (AzerothCore wins)** [M]:
`SMSG_MONSTER_MOVE_TRANSPORT` has an `int8` seat after the transport guid
and the body starts with its own `u8` (`Movement/Spline/MoveSplineInit.cpp:119-120`,
`MovementPacketBuilder.cpp:47`); `CMSG_DISMISS_CONTROLLED_VEHICLE` carries
a packed guid and movement info (`Handlers/VehicleHandler.cpp:39,51`;
wowm empty); `CMSG_REQUEST_VEHICLE_SWITCH_SEAT` has a packed guid and an
`int8` seat (`:125-128`); `CMSG_MOVE_NOT_ACTIVE_MOVER` and
`CMSG_MOVE_CHNG_TRANSPORT` start with a packed guid
(`MovementHandler.cpp:380-381,800`).

**Tasks** (9, all NS2): vehicles-1 vehicle packets and passive store;
-2 seat requests; -3 passenger seat in control; -4 drive a controlled
vehicle; -5 `vehicle` tool and board eval; -9 drive eval; then the
transport chain, last in the band: -6 transport model; -7 ride a
transport in control; -8 `travel ride` and zeppelin eval.

**Live proof.** A multi-seat mount learned offline (`PLAYER_VEHICLE_DATA`
id then 0, the cancel aura); board and exit a spell-click vehicle; the
Siege Tank for dismiss; the zeppelin ride. Seat changes, riding with
another player, ejecting, `CHANGE_SEATS_ON_CONTROLLED_VEHICLE` and
`NOT_ACTIVE_MOVER` (AC nearly always drops it, `MovementHandler.cpp:803-807`)
fall back to R22 until the partner can mount and cast.

**Decisions** (not yet ruled): `CMSG_SPELLCLICK` stays in `vehicles`
(it needs no control and lands with vehicles-2); boarding a transport is
refused unless it is docked, because a wrong pose is a silent teleport
(the server accepts the client position, `MovementHandler.cpp:430-435`);
`VehicleSeat.dbc` is optional; vehicle abilities use the `pet` tool.

**Needs the maintainer:** whether boats and zeppelins (the path model,
the largest task here) are in item 4, or only their opcode by mock; if
the Undercity and Thunder Bluff lifts are needed before level 10, the
transport chain moves to NS1; a truth field that shows a seat.

**Risks.** The keyframe port must match the server's model; a pose error
puts the character off the deck.

### 5.17 `world`

**Rows.** 27 rows: 24 relevant (6 stubs, 18 missing), 3 dead. Code areas
`time` (the step-0 worked example, which takes `SMSG_LOGIN_SETTIMESPEED`,
`CMSG_QUERY_TIME` and `SMSG_QUERY_TIME_RESPONSE`; world-1 adds the UI
timer pair to it), `reputation` (factions and forced reactions) and
`ambience` (world states, weather, sound, music, light, phase,
cinematics, movies, zone update). Goals: L (NS1 login noise, hostility,
reputation), P (encounter world states), long tail.

**Why.** Five of these server opcodes arrive at every login
(`Entities/Player/Player.cpp:11798-11809`). Hostility is wrong for
reputation factions: `targetRelation` uses only template masks [M,
`unit-relation.ts:23-38`], but AC first applies a forced reaction
(`Entities/Unit/Unit.cpp:6843-6855,6960-6963`), then, for a faction with a
reputation list id, the player's rank capped at Neutral when at war
(`Unit.cpp:6973-6984`) [M]. Every new character starts an intro
cinematic (`Handlers/CharacterHandler.cpp:889-899`).

**Stores.** `ReputationStore`: factions by list id (flags and the delta
from base: the server sends the delta, `Reputation/ReputationMgr.cpp:426`),
forced reactions (the packet is the whole list), the watched faction
(field 1230), pending flags the agent set (AC echoes them only at the next
login), and an inferred `AT_WAR` when a standing falls to Hostile, as AC
does silently (`ReputationMgr.cpp:432-436`). A lazy `FactionCatalog` from
`Faction.dbc` (`src/server/shared/DataStores/DBCStructure.h:942-958`)
gives base reputation, ranks and names. `targetRelation` gains the AC
order for the character against a creature; player targets keep the
template rule. The ambience store: world states (seeded by peeking the
handled `SMSG_INIT_WORLD_STATES`, which `PlaceStore` drops today [M,
`client-place.ts:38-43`]), weather, phase mask, light override, last
music, cinematic, movie. Events: `initialized`, `standing_changed`,
`visible`, `forced_changed`, `watched_changed`, `world_state`, `weather`,
`phase_changed`, `light`, `sound`, `cinematic`, `movie`, `time`.

**Acts.** `setAtWar`, `setInactive`, `setWatched` (each validates AC's
silent refusals: unknown list id, invisible or hidden, peace forced, not
visible, unchanged); `requestUiTime`; `sendZoneUpdate` (no automatic
caller: the server re-checks the zone every second,
`Entities/Player/PlayerUpdates.cpp:280-311`); `completeCinematic` (sent
automatically on every `SMSG_TRIGGER_CINEMATIC`); `nextCinematicCamera`
(probe only, never in play: it moves the server's sight position,
`Entities/Player/CinematicMgr.cpp:38-63`).

**Verbs.** `journal about:"reputation"` (visible factions, most recently
changed first, rank and points). `journal about:"quests"` gains a
daily-reset line from the `time` area. Faction settings are world-service
acts only, with no agent verb. Log rows: `reputation/changed`,
`reputation/rank`, `reputation/discovered`, `reputation/forced` (wake
outside a run), `reputation/at_war`, `ambience/phase`,
`ambience/cinematic`, `ambience/movie`; world states, weather, sound,
light and time are not logged.

**Evals.** `t4-reputation-gain`: turn in a quest and report which
reputations changed; checked against the server's
`SMSG_SET_FACTION_STANDING` rows in the game log and the rewarded quest in
truth. Hostility regression: rerun `t0-hostiles` and `t3-ghostlands-kill`.

**Body gaps.** `SMSG_INIT_WORLD_STATES` states are dropped (above);
`PLAYER_FIELD_WATCHED_FACTION_INDEX` and `PLAYER_EXPLORED_ZONES_1` are
not read [M, `protocol/update-fields.ts:292,314`]; the area name goes
stale inside a zone, because AC sends `SMSG_INIT_WORLD_STATES` only on a
zone change (an optional harness fix through namigator's zone lookup).

**Wire disagreements (AzerothCore wins)** [M]: wowm keys five reputation
opcodes with a `u16` faction; AC uses a `u32` reputation list id
(`SMSG_SET_FACTION_STANDING`, `ReputationMgr.cpp:188-200`;
`SMSG_SET_FACTION_VISIBLE`, `:259`; `CMSG_SET_FACTION_ATWAR`,
`CMSG_SET_FACTION_INACTIVE`, `CMSG_SET_WATCHED_FACTION`,
`CharacterHandler.cpp:1287-1347`) or a `u32` faction id for
`SMSG_SET_FORCED_REACTIONS` (`ReputationMgr.cpp:171-172`); a wowm-built
reader misreads every entry after the first. `SMSG_UPDATE_WORLD_STATE`
values are `int32` (`Server/Packets/WorldStatePackets.h:56-57`);
`SMSG_WEATHER` has state 106 that wowm lacks (`Weather/Weather.h:60`);
`SMSG_OVERRIDE_LIGHT` fade time is milliseconds (`Maps/Map.cpp:3330`).

**Tasks** (10): world-1 UI timer on `time` (NS1); world-2 world states,
weather, zone update (NS1); world-3 reputation state (NS1); world-5
forced reactions and reputation hostility (NS1); world-7 cinematics and
movies (NS1); world-8 reputation and world in the harness (NS1);
world-6 sound, music, light, phase (phase NS2, the rest long tail);
world-4 faction settings (long tail); world-9 optional faction tool (not
built by default); world-10 optional current area and explored zones
(long tail).

**Live proof.** Logins through the tap; a zone border crossing; a quest
turn-in with reputation; a first login of a `fresh` character (cinematic
and core's complete); probes for the faction settings (the watched field
comes back at once; at-war and inactive through `soap gm read
reputation`), the UI timer and the camera step on a second `fresh`
character. No SOAP command can stage sound, music, light, phase, movies
or a non-empty forced reaction list (all `Console::No`,
`src/server/scripts/Commands/cs_debug.cpp:61-78`): R22 from the cited
writers.

**Dead.** `CMSG_COMPLETE_MOVIE` (`Handle_NULL`), `SMSG_TOGGLE_XP_GAIN` and
`SMSG_CAMERA_SHAKE` (no sender).

**Decisions** (not yet ruled): the time part lives in the step-0 `time`
area, and world-1 holds a lease on `areas/time/` from the coordinator,
because a worker never edits another area's seeded directory; the intro cinematic is completed automatically; faction settings
get no agent verb; the store infers `AT_WAR` as AC does; the ambience
area peeks `SMSG_INIT_WORLD_STATES`.

**Needs the maintainer:** reputation fields in truth.

**Risks.** A wrong hostility port can mark a friendly unit hostile; tests
follow the AC branches and the two regression evals run before landing.

### 5.18 `session`

**Rows.** 79 rows: 68 relevant (4 stubs, 59 missing, 5 absent:
`CMSG_SET_FACTION_CHEAT`, `SMSG_PLAY_TIME_WARNING`,
`SMSG_LEARNED_DANCE_MOVES`, `TC9_CMSG_PREPARE_FOR_REDIRECT`,
`TC9_SMSG_READY_FOR_REDIRECT`), 11 dead. `session` is a harness core
domain, so the code areas are `login` (login noise, ping, keep-alive,
login failure, logout cancel), `account` (account data, tutorials),
`charscreen` (the character screen), `appearance` (helm, cloak, sheath,
played time, barber, realm split), `tickets` (GM tickets, survey, bug and
lag reports) and `guard` (GM-only opcodes, Warden, play-time warning,
redirect). Goals: none of the three; it gives a clean `not_implemented`
report, named login failures and worker tooling.

**Why.** Four opcodes arrive in every log and are reported unhandled
(`SMSG_ADDON_INFO`, `SMSG_CLIENTCACHE_VERSION`, `SMSG_PONG`, 0x455), and
three login stubs are hidden by the race (`SMSG_TUTORIAL_FLAGS`,
`SMSG_ACCOUNT_DATA_TIMES`, `SMSG_FEATURE_SYSTEM_STATUS`). The auth-time
trio is sent once per world session at auth, before the character list
(`Server/WorldSession.cpp:1624-1629`), so its notice cannot fire on the
first login; the handlers register before `CMSG_AUTH_SESSION` goes out
[M, `client.ts:365,398`], so state is kept. A refused character login
shows only as a 10 s timeout today [M, `self-store.ts:13,47-58`], and a
rename-flagged character is kicked during load with no message
(`Entities/Player/PlayerStorage.cpp:5492-5496`). Core sends ping sequence
0 and latency 0 every time [M, `client-connection.ts:142-147`].

**Stores, events, acts.** Session info (addons, cache version,
tutorials, account data times, features, dance moves, play time, Warden
requests, realm split); link health (ping sequence, pending pings, round
trip); account data per type; the character screen (`characters` with
every enum field, last results); tickets; appearance. Events:
`login_noise` (once), `pong`, `account_data_times`, `account_data`,
`account_data_saved`, `login_failed`, `logout_cancelled`,
`character_result`, `played_time`, `barber`, `ticket`, `gm_response`,
`gm_survey`, `play_time_warning`, `warden_request`, `whois`,
`realm_split`, `redirect_ready`. Acts: `keepAlive`,
`readyForAccountDataTimes`, `accountData`, `saveAccountData`,
`eraseAccountData`, the three tutorial sends, `cancelLogout`,
`playerLogout`, `showHelm`, `showCloak`, `sheathe`, `playedTime`,
`realmSplit`, `alterAppearance`, the ticket reads and writes,
`resolveGmResponse`, `submitSurvey`, `reportBug`, `reportLag`,
`worldTeleport`, `whois`, `requestFactionStates`, `prepareForRedirect`.
`CMSG_WARDEN_DATA` gets a builder and no act.

**Character-screen stage.** `selectCharacter` splits into
`characterScreen(config, auth)`, which resolves after `SMSG_CHAR_ENUM`
with `create`, `remove`, `rename`, `customize`, `changeFaction`,
`changeRace`, `setDeclinedNames`, `realmSplit`, `accountData` and
`enter(name)`; `enter` refuses a rename-flagged character by name and
fails at once on `SMSG_CHARACTER_LOGIN_FAILED`. `worldSession` keeps its
signature. Customize, faction and race change kick the session for a
guid of another account (`Handlers/CharacterHandler.cpp:1650-1657,1958-1965`),
so these acts take guids only from the enum. This is a lease on
`client-connection.ts` and `client.ts`.

**Runtime policy.** The ping interval stays at 27 s or more: AC kicks
after `MaxOverspeedPings` pings less than 27 s apart
(`Server/WorldSocket.cpp:762-777`). No keep-alive loop is needed, because
the time-sync answers reset the idle timer. Never answer
`SMSG_WARDEN_DATA` in play: an answer starts the check cycle and its
600 s timer (`Warden/Warden.cpp:98-112`). Strip `|` from every free-text
field in tickets, surveys and reports, because a malformed link kicks
(`Server/WorldSession.cpp:917-929`).

**Verbs.** None. The login failure uses the harness connection's
existing `session` rows (a lease on `runtime/connection.ts`); a GM reply,
the play-time warning and the Warden request get rows in their area
domains.

**Body gaps** [M]: `SMSG_CHAR_ENUM` skips appearance, position, character
flags, customize flags, first login, pet and equipment
(`protocol/world.ts:137-150`; AC `Entities/Player/Player.cpp:1186-1254`);
`SMSG_AUTH_RESPONSE` fails on the queue status 0x1B instead of waiting
(`Server/WorldSession.cpp:979-995`); `CMSG_PING` (above);
`SMSG_LOGOUT_RESPONSE` drops the refusal reason
(`Handlers/MiscHandler.cpp:435-441`); `PLAYER_FLAGS` bits 0x400, 0x800,
0x1000, 0x2000, sheath state in `UNIT_FIELD_BYTES_2` and `PLAYER_BYTES`
are not read.

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_ADDON_INFO` entries
are variable (a 256-byte key for each addon whose CRC is not
`0x4c1c776d`), the list length is the count Peon sent, and banned addons
are 44 bytes each (`Server/WorldSession.cpp:1352-1414`); Peon sends CRC 0
for 19 of 23 addons, so every login receives about 4.9 KB of keys;
`SMSG_UPDATE_ACCOUNT_DATA` starts with a `u64` guid and carries time and
decompressed size (`MiscHandler.cpp:885-892`); `SMSG_CHARACTER_LOGIN_FAILED`
is `LoginFailureReason` 0-8 (`src/server/shared/SharedDefines.h:4001-4012`);
`CMSG_TOGGLE_HELM` and `CMSG_TOGGLE_CLOAK` carry one `bool`
(`Server/Packets/CharacterPackets.cpp:20-28`; wowm empty; AC names them
`CMSG_SHOWING_HELM` and `CMSG_SHOWING_CLOAK`); `CMSG_ALTER_APPEARANCE`
has four `u32` (`CharacterHandler.cpp:1537`); `CMSG_GMTICKET_CREATE` has a
`u32` need-response (`Handlers/TicketHandler.cpp:57,75`);
`CMSG_GMSURVEY_SUBMIT` ends at the first zero question id
(`:207-212`); `CMSG_WORLD_TELEPORT` has no `u64`
(`MiscHandler.cpp:1051-1079`).

**Tasks** (14): session-1 login noise (NS1, first-wave cleanup, one
`CORE_OPCODES` entry); session-2 ping sequence and keep-alive (NS1);
session-5 login failure, logout cancel, auth queue (NS1); the rest long
tail: session-3 account data; -4 tutorials; -6 character screen, create
and delete (with the probe's pre-login flow kind); -7 rename, customize,
faction and race change; -8 appearance, played time, realm split; -9
barber (a chair needs `objects`); -10 ticket reads; -11 ticket writes;
-12 GM response and survey; -13 reports and GM-only opcodes; -14 Warden,
play-time warning, redirect.

**Live proof.** Probe flows: `login` (the six noise opcodes handled; two
pongs with rising sequence), `account-data`, `tutorials` (two relogins),
`logout-cancel` (an account made without `--gm`: a GM-level account logs
out instantly, `data/sql/base/db_auth/rbac_linked_permissions.sql:53`),
`appearance`, `char-screen` (create and delete a second character on the
worker's own account), `char-flags` (after `soap gm` sets a rename,
customize, faction or race flag on that second character),
`tickets-read`, `gm-denied` (world teleport and whois answer with a
permission notification). Mock (R22): login failure, the auth queue,
declined names, `SMSG_WHOIS` (administrators only; it prints another
account's e-mail and address), the play-time warning (`CAIS.Enable` 0),
the redirect reply (cluster mode off: `SMSG_ADDON_INFO` is sent only then,
and it is seen in every log).

**Dead.** `CMSG_BOOTME`, `CMSG_DBLOOKUP`, `CMSG_TELEPORT_TO_UNIT`,
`MSG_MOVE_TELEPORT_CHEAT`, `CMSG_MOVE_SET_RAW_POSITION` (`Handle_NULL`),
`CMSG_GMTICKETSYSTEM_TOGGLE` (no client handler),
`SMSG_INVALIDATE_PLAYER`, `SMSG_GM_TICKET_STATUS_UPDATE`,
`SMSG_KICK_REASON`, `SMSG_GMRESPONSE_DB_ERROR`, `SMSG_REDIRECT_CLIENT`
(no sender).

**Decisions** (not yet ruled): session-1 is the first NS1 cleanup task,
not the step-0 example (`time` is); `tooling-gm` gains four verbs
(`character rename|customize|changefaction|changerace`, all `Console::Yes`,
`src/server/scripts/Commands/cs_character.cpp:67-69,75`) that may target a
second character on the worker's own ledger account, checked against its
enum, never the ledger's own character; `CMSG_SET_FACTION_CHEAT` is proven
by mock, because a live send writes an error line to the server log
(`CharacterHandler.cpp:1301`); rows that cannot occur with default config
stay in scope with mock proof.

**Needs the maintainer:** whether tickets, surveys, bug and lag reports
may write their tables (proposal: a ticket loop ended by `ticket delete`
over SOAP; bug, lag and survey stay mock); whether one Warden
`MODULE_FAILED` reply (logged and ignored, `Warden/Warden.cpp:349-351`) is
allowed.

**Risks.** The character-screen stage changes the login path every
session uses; `t1-walk-to-npc` and `t7-halt-resume` run on it before it
lands.

### 5.19 `economy`

**Rows.** 47 rows: 46 relevant (9 stubs, 37 missing), 1 dead. Code areas
`trade` (12), `mail` (12), `auction` (15), `bank` (5) and `buyback` (the
two vendor extras; `vendor` is a harness core domain). Goals: P (trade,
rank 5), L (bank and mail keep bags free over 80 levels; buyback undoes a
wrong `sell_junk`), long tail (auction).

**Why.** No trade, mail, bank, auction or buyback builder exists [M,
`protocol/stubs.ts:10-12,28-33`]. The bank's contents arrive at every login
(`Entities/Player/Player.cpp:4001-4007`) and are not read.

**Stores and runtime.** `TradeStore`: phase (idle, requested out,
requested in, open, closed); the own offer built from Peon's own sends,
because the server echoes the own side only when a spell is set
(`Entities/Player/TradeData.cpp:71-86`); their offer with a `version` that
rises on every change; both accept flags, cleared by `BACK_TO_TRADE` (every
change resets both, `TradeData.cpp:54-66,123-135`); the last outcome.
`acceptTrade(expectVersion)` refuses to send when their offer changed
since the caller saw it. An incoming request holds a `TradeData` on both
sides (`Handlers/TradeHandler.cpp:726-727`), so the runtime answers busy
to a second request and never accepts on its own. `MailStore`: mailbox,
inbox (id, type, sender, subject, body, COD, money, flags, days left,
items), unread senders, `newMail` from the handled `SMSG_RECEIVED_MAIL`
(a lease on `world-handlers-chat.ts:222-230`), one pending action.
`AuctionStore`: house, last search, own and bid lists, one pending
command, notices. `BankStore`: the banker of the last `SMSG_SHOW_BANK`
(the server uses it for every move, `Handlers/BankHandler.cpp:186-192`),
bank bag slots from `PLAYER_BYTES_2` byte 2. The vendor store gains
`buyback` and `buyInSlot` request kinds (a lease on `vendor-store.ts`).
Many AC paths return with no packet (an out-of-range mailbox, auctioneer
or banker, a low bid, a bad auction duration, a missing bank item), so
each runtime checks what it can first and settles `unanswered` after 5 s
(auction lists 10 s: they come through a worker thread,
`AuctionHouse/AuctionHouseSearcher.cpp:142-270`). Bank moves and buyback
keep their own pending state and peek `SMSG_INVENTORY_CHANGE_FAILURE`
with the correlation helper that `items` exports from
`#wow/protocol/inventory` (an area never reads another area's store).

**Acts.** Trade: `requestTrade`, `answerTrade(yes|busy|ignore)`,
`offerItem`, `withdrawItem`, `offerGold`, `acceptTrade`, `unacceptTrade`,
`cancelTrade`. Mail: `listMail`, `takeMailMoney`, `takeMailItem` (refuses
COD unless `payCod`), `markMailRead`, `returnMail`, `deleteMail` (refuses
a mail that still holds gold or items), `copyMailText`, `sendMail` (at most
12 attachments; no gold with COD; postage 30 copper per item, at least 30,
`Handlers/MailHandler.cpp:92,156-162`), `queryNextMail`. Auction:
`openAuctionHouse`, `searchAuctions`, `listOwnAuctions`, `listBids`,
`postAuction` (12, 24 or 48 hours only), `cancelAuction`, `bid`,
`listPendingSales`. Bank: `openBank`, `deposit`, `withdraw`,
`buyBankSlot`. Buyback: `buyback(slot)`, `buyInSlot`.

**Verbs.** A new tool `trade` (kind `run`, because a give can wait a
minute): `give`, `answer`, `offer`, `accept`, `cancel`, `show`. A new tool
`mail` (kind `action`): `check`, `take`, `send`; it uses the nearest
mailbox within 10 yd. `interact` sub-verbs: `bank`, `deposit`,
`withdraw`, `buy_bank_slot`, `buyback`, and (optional) `auction_search`,
`auction_buy`, `auction_sell`, `auction_mine`, `auction_cancel`.
`journal about: bank` and `about: mail`; `about: bags` gains the buyback
list; `look` kinds `banker`, `auctioneer`, `mailbox`. Harness rules: a
trade request wakes the agent and is answered busy after 60 s; `trade`
refuses equipped or unnamed items; new mail is a passive row. Leases on
`interact`, `journal`, `look`.

**Evals.** `t5-buyback-vendor`; `t9-trade-give`, `t9-trade-receive`,
`t9-trade-swap`, `t9-trade-cancel` (a partner with `call` methods for
trade, and a partner-truth check); `t9-mail-read`, `t9-mail-collect`,
`t9-mail-send` (money only between accounts, because item mail to another
account waits `MailDeliveryDelay`, 3600 s by default,
`World/WorldConfig.cpp:303`); `t9-bank-deposit`, `t9-bank-withdraw`,
`t9-bank-slot`; `t9-auction-sell`, `-search`, `-buy`, `-mine`, `-cancel`
only if the auction verbs are built. The mail evals stage letters with one
`soap gm mail|items|money` setup step before the baseline.

**Body gaps** [M]: `SMSG_SHOW_BANK` ends as `unsupported_window` in the
quest store (`gameplay-handlers.ts:203-205`, `quest-store.ts:246-267`);
the auctioneer gossip option's `MSG_AUCTION_HELLO`
(`Entities/Player/PlayerGossip.cpp:376-377`) leaves a pending gossip to
time out; both need window kinds in the quest store (a lease shared with
`quests`); the inventory read skips bank slots 39-66, bank bags 67-73 and
buyback 74-85 [M, `inventory.ts:78-109`, `Player.h:698-712`];
`BUYBACK_PRICE_1` and `BUYBACK_TIMESTAMP_1` are not read; the vendor store
settles any `SMSG_BUY_FAILED` or `SMSG_SELL_ITEM` as a buy or a sell, and
needs the request kind.

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_TRADE_STATUS`
`OPEN_WINDOW` carries a `u32` (`TradeHandler.cpp:45-47`; wowm none);
`SMSG_MAIL_LIST_RESULT` has a `u32` stack count and enchant order id,
duration, charges (`MailHandler.cpp:792-803`); `CMSG_MAIL_RETURN_TO_SENDER`
ends with the sender guid (`:442`); `CMSG_SEND_MAIL` writes each item's
slot byte before its guid and ends `u64 0, u8 0` (`:65-109`), so a
wowm-built packet is one byte short; `CMSG_AUCTION_SELL_ITEM` carries a
counted item list (`Handlers/AuctionHouseHandler.cpp:117-156`);
`SMSG_AUCTION_COMMAND_RESULT` appends a `u32` on a successful cancel or
bid and never sends `ERR_INVENTORY` (`:77-87`);
`SMSG_AUCTION_BIDDER_NOTIFICATION` has four `u32` after the guid, not five
(`:89-101`); `CMSG_BUYBACK_ITEM` slots are 74-85 (`Entities/Player/Player.h:711-712`;
wowm 69-81); `CMSG_BUY_ITEM_IN_SLOT` count is `u32`
(`Server/Packets/ItemPackets.cpp:84-92`); `CMSG_ACCEPT_TRADE`'s body is
ignored.

**Tasks** (13): economy-1 buyback and buy into a slot (NS1); economy-2
`interact do:"buyback"` and eval (NS1); economy-3 trade requests and
window (parties); economy-4 trade offers and accept (parties); economy-5
`trade` tool and four evals (parties); economy-6 mail inbox (NS2);
economy-7 mail actions and sending (NS2); economy-8 `mail` tool and three
evals (NS2); economy-9 bank (NS2); economy-10 bank verbs and evals (NS2);
economy-11 auction browsing (long tail); economy-12 auction commands and
notices (long tail); economy-13 auction verbs (long tail, optional).

**Live proof.** The Goldshire innkeeper for buyback; two same-faction
worker characters for trade (request, begin, busy, ignore, cancel, offers,
accept, unaccept, full bags) and mail sends and returns; `soap gm` letters
for the inbox; a capital bank and auctioneer with `soap setup position`.
`WRONG_FACTION`, `NOT_ON_TAPLIST` and `SMSG_SHOW_MAILBOX` (reachable only
through `.mailbox`, `Console::No`, or a level-80 achievement pet) fall back
to R22.

**Dead.** `SMSG_AUCTION_REMOVED_NOTIFICATION` (no writer).

**Decisions** (not yet ruled): auction verbs (economy-13) are optional and
built last; the core never accepts a trade by itself; the 60 s busy rule;
mail evals may run one `soap gm` staging command before the baseline, which
relaxes the tooling rule "never inside an eval", because the console
command gives the character no GM rights and the scenario is about mail;
no eval trades with playerbots; `trade` and `mail` are separate tools, not
one `market` tool.

**Needs the maintainer:** whether a worker may bid on auctions that the
reserved `AUCTIONHOUSE` account posted (the cheaper one-character proof);
truth fields for mail, bank slot count and auctions.

**Risks.** Trade and mail hand items over for good; the guards refuse
equipped and unnamed items and deleting a full letter. Whether soap
accounts are trial accounts (trade, mail and auction refuse trials) shows
on the first economy-3 run.

### 5.20 `guild`

**Rows.** 77 rows: 74 relevant (4 stubs, 70 missing), 3 dead. Sub-areas:
guild admin 15, guild bank 12, charters 14, calendar 36. `guild` is a
harness core domain, so the code areas are `guildadmin` (additions to
the legacy guild code, which stays the owner of the handled opcodes
under a lease on `protocol/guild.ts`, `guild-store.ts`,
`world-handlers-guild.ts`), `guildbank`, `charters` and `calendar`.
Goals: none of the three (long tail); a guild roster and raid sign-ups are
minor P aids.

**Why.** Core can join a guild and run the roster commands [M,
`client-social.ts:186-243`], but the harness only sends guild chat and
drops every guild event [M, `events/router.ts:214`]. Most opcodes are
request and reply on one character; the hard part is the preconditions:
a guild, a bought bank tab (100 gold by default), and charter signatures
from `MinPetitionSigns` other accounts (default 9,
`src/server/apps/worldserver/worldserver.conf.dist:3595-3600`).

**Staging.** `max80` spawns in Dalaran next to a guild master (petitioner
and tabard designer) and four Guild Vaults (base data,
`data/sql/base/db_world/creature.sql`, `gameobject.sql`) [M base, I
live]. A guild comes from `soap gm guild-create <name>` (`.guild create`
is `Console::Yes` and needs the target online,
`src/server/scripts/Commands/cs_guild.cpp:35,57-60`), with a `Fac` name
prefix, disbanded in the same run. `.guild info "<Name>"` is the only
console truth (name, leader, members, bank gold, MOTD, info text, ranks).
A calendar invitee only has to exist, online or not
(`Handlers/CalendarHandler.cpp:529-556`).

**Stores and events.** Packed time: a reader and writer that never
convert to epoch, because the server packs its local time
(`src/server/shared/Packets/ByteBuffer.cpp:95-107,137-141`) and the
calendar reply carries both epoch and packed time, which gives the offset.
`GuildStore` (legacy, extended): info, emblem, ranks with rights, gold per
day and tab rights, permissions, event log; it returns a guild with no
members when the guild id is set. `GuildBankStore`: open vault,
subscription (a permissions query ends the push,
`Guilds/Guild.cpp:1898-1901`, so the store marks itself stale), balance,
tabs with slots, money left, logs. `PetitionStore`: showlist offers,
petitions by item guid, a pending offer. `CalendarStore`: invites, events,
details, server time and offset, binds, reset periods, holidays, pending
count, events created by the character. Events per domain (`guildadmin`,
`guildbank`, `charters`, `calendar`).

**Acts and runtime.** Guild: info, permissions, event log, rank set, add
and remove (lowest only), notes, info text, disband (needs `confirm`),
tabard vendor, emblem. Bank: open, view tab, deposit and withdraw money,
buy tab, update tab, deposit, withdraw and move items (three swap forms),
log, text, money left. Charters: list, buy, show signatures, query,
offer, sign, decline, turn in, rename. Calendar: get, get event, pending,
create, update, remove, copy (5 s after a create), invite, answer, sign
up, remove invite, invite status, moderator, guild filter, arena team,
complain. About half the client opcodes fail silently (no right, out of
range, wrong tab), so each act mirrors AC's limits locally and resolves
`no_reply` after 5 s. Owner guards: AC does not check the owner on
calendar update and remove (`CalendarHandler.cpp:403-417`,
`Calendar/CalendarMgr.cpp:157-222`) or the right on bank text
(`Handlers/GuildHandler.cpp:405-411`); core refuses them for data the
character did not create.

**Verbs.** New tools `guild` (`status`, `invite`, `accept`, `decline`,
`leave`, `remove`, `promote`, `demote`, `leader`, `motd`, `info`, `note`,
`officer_note`, `rank`, `log`, `disband`, `charter`, `sign`, `tabard`; it
checks rights before it sends and names the missing right),
`guild_bank` (`open`, `tab`, `deposit`, `withdraw`, `buy_tab`,
`name_tab`, `text`, `log`) and `calendar` (`list`, `show`, `create`,
`invite`, `answer`, `cancel`). `interact do:"repair"` gains `from:
guild` (a lease on `protocol/vendor.ts`). Log rows: an invite, a
disband, a charter offer and a calendar invite wake the agent; joins,
leaves, ranks, MOTD and bank money are passive or log rows; sign-on and
sign-off are not logged.

**Evals.** `t9-guild-admin`, `t9-guild-join`, `t9-guild-bank-money`,
`t9-guild-bank-items`, `t9-guild-charter`, `t9-guild-tabard`,
`t9-calendar-plan`. Money and item deltas are truth today; guild state
uses `soap gm read` on `.guild info` until truth has guild fields.

**Body gaps** [M]: `requestGuildRoster` hangs without a guild, because AC
answers with a command result (`GuildHandler.cpp:101-104`; issue #394);
the guild id is read only at login (`client-connection.ts:129`);
`handleGuildCommandResult` drops result 0 (`world-handlers-guild.ts:105`);
`GuildCommand` follows wowm, not AC (`Guilds/Guild.h:97-115`);
`GuildCommandResult` and `GuildEventCode` lack codes AC sends (bank tab,
bank money, rank updates, `Guild.cpp:1380-3013`); `GE_BANK_MONEY_SET`
carries the balance as 16 hex digits (`Guild.cpp:1731`);
`parseGuildQueryResponse` stops after the rank names and
`parseGuildRoster` skips rank rights (`GuildPackets.cpp:35-40,194-206`);
`buildRepairAll` never pays from the guild bank
(`Handlers/NPCHandler.cpp:764-766`); `PLAYER_GUILDRANK` is not read.

**Wire disagreements (AzerothCore wins)** [M]: `MSG_GUILD_EVENT_LOG_QUERY`
uses AC's log types with conditional fields
(`Server/Packets/GuildPackets.cpp:144-162`); `SMSG_GUILD_BANK_LIST` has no
content-result byte, writes the tab list only for a full tab-0 update,
and writes an empty slot as slot and item id only (`:285-329`);
`MSG_GUILD_BANK_LOG_QUERY` has no leading time and variable entries
(`:385-417`); `SMSG_TURN_IN_PETITION_RESULTS` codes are 0, 2, 4
(`Guild.h:169-174`); `CMSG_TURN_IN_PETITION` for an arena charter
appends five `u32` (`Handlers/PetitionsHandler.cpp:790-791`); calendar
add, update, send-event and updated-alert carry a description string,
and remove-invite, event status and moderator status start with a packed
invitee guid (`CalendarHandler.cpp:249-252,381-384,681-743`,
`CalendarMgr.cpp:548-549,638-639`); `CMSG_CALENDAR_COMPLAIN` is two `u64`
(`Server/Packets/CalendarPackets.cpp:44-47`).

**Tasks** (17, all long tail, in this order): guild-1 packed time, guild
info, disband; guild-2 fix the handled guild opcodes; guild-3 ranks,
notes, info text, permissions, event log; guild-4 emblem and tabard;
guild-5 bank open and money; guild-6 bank tabs, items, text, logs;
guild-7 charter list, buy, query, show, rename; guild-8 signing and
turn-in; guild-9 calendar read; guild-10 calendar events; guild-11
calendar invites and answers; guild-12 invite removal, moderators,
complaints; guild-13 guild filter, arena team, raid lockouts; guild-14
`guild` tool (status, membership, text, ranks); guild-15 `guild` charter,
sign, tabard; guild-16 `guild_bank` tool and guild repair; guild-17
`calendar` tool.

**Live proof.** One `max80` character in its own guild for most rows; a
probe with two connections for charter offers, signing and calendar
alerts. Turn-in result 0 needs `MinPetitionSigns` signers; the first
showlist capture reads the live value. Arena-team calendar rows and raid
lockout rows fall back to R22 unless `pvp` and `instances` stage them.

**Dead.** `SMSG_GUILD_DECLINE`, `SMSG_CALENDAR_EVENT_INVITE_NOTES`,
`SMSG_CALENDAR_EVENT_INVITE_NOTES_ALERT` (no sender).
`CMSG_GUILD_CREATE` only logs a "hacking attempt" line
(`GuildHandler.cpp:37-40`) and the server form of `MSG_PETITION_DECLINE`
never finds its target (`PetitionsHandler.cpp:551-560`); both keep a
builder or parser.

**Decisions** (not yet ruled): guilds are staged by `soap gm guild-create`
with a `Fac` prefix and disbanded in the same run; `CMSG_GUILD_CREATE`
and `CMSG_CALENDAR_COMPLAIN` are proven by builder tests only, because a
live send leaves a log line or a spam-report row that outlives the
accounts (`CalendarHandler.cpp:764-777`); three tools, with the calendar
tool the first cut if time runs out; charter decline is `do:"decline"
step:"charter"`.

**Needs the maintainer:** confirm that a GM-created guild on a worker's
own character is allowed under rule 10 (a new server row, removed in the
same run); truth fields for guild members, bank and calendar.

**Risks.** The agent must not read silence as success; each verb names a
missing right before it sends.

### 5.21 `social`

**Rows.** 54 rows: 52 relevant (7 stubs, 45 missing), 2 dead. `social` is
a harness core domain and a tool name, so the code areas are
`achievements` (with titles), `emotes`, `contacts`, `inspect`,
`channels` (with voice), `complaints` and `referral`. Goals: none of the
three as a blocker; NS1 cleanup (`SMSG_CRITERIA_UPDATE` in 4 of 4 fights,
`SMSG_EMOTE` and `SMSG_ALL_ACHIEVEMENT_DATA` in 3 of 5 logs), emote
quests in NS2 (167 `smart_scripts` rows react to a text emote, some with
quest credit, `data/sql/base/db_world/smart_scripts.sql`), inspect as a
minor P aid.

**Stores and events.** `AchievementStore` (completed with dates, criteria
counters as `bigint`; replaced at login, updated per packet, others'
earned events do not change it). Titles come from
`PLAYER__FIELD_KNOWN_TITLES` and `PLAYER_CHOSEN_TITLE`, which core
defines and never reads [M, `protocol/update-fields.ts:262,270-272`]; the
entity gains `emoteState` from `UNIT_NPC_EMOTESTATE`. The friend store
gains notes (a lease on the legacy social files). `ChannelStore` replaces
`conn.channels: string[]` (per channel: id, flags, owner, own flags,
members, count, watched); the `world-conn.ts` change is a coordinator
`COORD-<n>` commit (contract D20); `getChannel(index)` keeps its
meaning. Pending
channel invite and level-grant offer (60 s). Events:
`achievement_earned`, `achievement_removed`, `criteria_removed`,
`server_first`, `title_changed`, `emote`, `text_emote`, `channel_notice`,
`channel_members`, `complaint_received`, `level_grant`;
`SMSG_CRITERIA_UPDATE` emits none (it arrives on every kill). The
packed-time reader comes from `protocol/packed-time.ts` (contract D10);
the talent
spec parser is shared with `talents`.

**Acts and runtime.** `inspect` and `inspectAchievements` (3 s; the
server is silent beyond 28 yd or for an attackable target,
`Handlers/MiscHandler.cpp:982-997`), `setTitle`, `emote` (only 0 and 3,
`Handlers/ChatHandler.cpp:675-676`), `textEmote` (at most one per second:
it counts against the chat flood timer), `requestContacts`,
`setFriendNote`, `reportIgnored` (sent once per ignored whisperer per
session), `listChannel`, `channelMemberCount`, `channelAdmin` (13 admin
opcodes; each settles on the first `SMSG_CHANNEL_NOTIFY` for its
channel), `watchChannel`, `unwatchChannel`, `declineChannelInvite`, the
voice sends, `complain`, `grantLevel`, `acceptLevelGrant`. Local checks
mirror AC: channel name rules (`Handlers/ChannelHandler.cpp:62-69`),
password length 31.

**Verbs.** `social` (a lease) gains `emote what to` (names from
`EmotesText.dbc`; refuses `ready`, which goes to a redirect path,
`ChatHandler.cpp:722-729`), `join_channel`, `leave_channel`, `channel`
(settles on its own echo), `inspect` (gear, spent talent points,
glyphs, achievement count). Achievements, titles, channel admin,
contacts, voice, complaints and refer-a-friend have no verb. Log rows
(area domains): own achievements and titles passive; others' achievements
and realm firsts log; an emote aimed at the character and a channel invite
wake.

**Evals.** `t2-emotes-partner`, `t2-channels-talk`, `t2-inspect-partner`
(a partner; emotes and channel chat leave no server state, so the partner
is the witness; inspect needs partner truth for the weapon).

**Body gaps** [M]: `SMSG_CHANNEL_NOTIFY` reads 2 of 36 notice types fully
and drops the flags and id of "you joined" (`protocol/chat.ts:147-189`;
AC trailers per type, `Chat/Channels/Channel.h:30-70`,
`Channel.cpp:952-1275`); `CMSG_JOIN_CHANNEL` always sends id 0
(`chat.ts:191-199`), which can create a custom channel with a zone
channel's name that later captures real players
(`Chat/Channels/ChannelMgr.cpp:121-136`), so `join_channel` refuses zone
channel names unless core has the id; `SMSG_CONTACT_LIST` replaces both
stores whatever its list mask (`world-handlers-social.ts:24-28`); `ChatType`
lacks `IGNORED` 0x19, `ACHIEVEMENT` 0x30 and `GUILD_ACHIEVEMENT` 0x31, and
the trailing achievement id is dropped (`Chat/Chat.cpp:347-348`).

**Wire disagreements (AzerothCore wins)** [M]:
`SMSG_SERVER_FIRST_ACHIEVEMENT` link type is `u32`
(`Achievements/AchievementMgr.cpp:736,749`); `SMSG_TEXT_EMOTE` writes the
name length without the null and one `0x00` byte for a name of 0 or 1
characters (`ChatHandler.cpp:702-706`), so read the `u32` and ignore it,
then a C string; `SMSG_INSPECT_TALENT` has a glyph list inside each spec,
and a short form when `TalentsInspecting` is 0 (`Entities/Player/Player.cpp:14761-14764`,
`MiscHandler.cpp:1008-1013`); `SMSG_CHANNEL_LIST` starts with a `u8`
(`Channel.cpp:703`); `SMSG_COMPLAIN_RESULT` is one byte
(`Server/Packets/MiscPackets.cpp:165-170`); `CMSG_DECLINE_CHANNEL_INVITE`
has no wowm file and AC reads nothing.

**Tasks** (16): social-1 achievement stream (NS1); social-2 receive
emotes (NS1); social-3 send emotes (NS2); social-14 `emote` verb (NS2);
long tail: social-4 titles; -5 contacts, ignore reply, chat types; -6
inspect; -7 channel notices and admin part 1; -8 admin part 2 and join
by id; -9 channel list and count; -10 watch and user list; -11 voice and
complaints; -12 refer-a-friend; -13 log rows; -15 channel verbs; -16
`inspect` verb.

**Live proof.** A kill and a login for the achievement stream; `soap gm`
level 10 for an earned achievement (`.character level` calls `GiveLevel`,
`src/server/scripts/Commands/cs_character.cpp:256`); `.reset
achievements` for the deleted opcodes; `soap gm achievement 2188` for a
title (base data rewards title 143,
`data/sql/base/db_world/achievement_reward.sql:106`); a partner in a
fresh `peon<random>` channel for every admin notice. Mock (R22): the
realm-first broadcast (it reaches every player and sets a realm record),
the level-grant proposal (needs a recruiter link in the auth database).
Voice, channel-invite decline and level-grant accept are "accepted, no
effect to observe".

**Dead.** `SMSG_CHAT_NOT_IN_PARTY` (no sender), `SMSG_CHAT_PLAYER_AMBIGUOUS`
(its only sender has no caller). Both are declared `dead` and keep their
stub lines, which cost nothing.

**Decisions** (not yet ruled): no `channel` tool and no title verb;
`CMSG_CHAT_IGNORED` is sent automatically; no automatic zone-channel
join; "accepted, no effect" is the proof for the five no-effect client
opcodes.

**Needs the maintainer:** whether one complaint about the worker's own
partner may write a `spam_reports` row (default `LogSpamReports = 1`);
otherwise mock.

**Risks.** A join with id 0 can hijack a zone channel for real players;
the refusal rule prevents it.

### 5.22 `pvp`

**Rows.** 61 rows: 51 relevant (5 stubs, 45 missing, 1 absent:
`SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` 0x032), 10 dead. Code areas
`battlegrounds` (queue, enter, leave, score, spirit guides, PvP flag,
honor, zone alerts; 22 relevant), `arena` (teams, queue, arena notices;
19) and `wintergrasp` (the battlefield manager, hearth and resurrect,
building damage; 10). Goals: none of the three; battleground XP and honor
are optional for levelling [I]. Long tail, in the order battlegrounds,
arenas, Wintergrasp.

**Proof paths.** P-queue: a battleground queue join and leave need no
other player, and `CMSG_BATTLEMASTER_JOIN` works from anywhere (it passes
the guid only to a script hook, `Handlers/BattleGroundHandler.cpp:72-294`).
P-bots: `mod-playerbots` defaults `RandomBotJoinBG = 1` and opens queues
for bots when real players queue
(`modules/mod-playerbots/src/Bot/RandomPlayerbotMgr.cpp:907-980`), so one
level-10 character may get a full Warsong Gulch pop [M code, I live]; the
first task probes it. P-arena: `soap gm arena-create` (`.arena create` is
`Console::Yes`, `src/server/scripts/Commands/cs_arena.cpp:50`) makes a team
with the character as captain; `.arena info` and `.arena lookup` read it.
P-wg: Wintergrasp defaults to battles of 30 min every 150 min at level 75
or more (`World/WorldConfig.cpp:615-620`); a level-80 character teleported
into the zone waits for the window; `.bf queue` is read-only and gives the
timer. Forbidden: `.debug bg`, `.bf start|stop|switch|timer|enable` and
`.arena season` change state every player shares (rule 10).

**Stores and events.** `BattlegroundStore`: two queue slots (none, queued,
invited with a local expiry, active), the last join result, the last list,
and the current battleground (roster, score, flag carriers, spirit guide
and next mass rez); logout clears it (the server drops queues at logout,
`Server/WorldSession.cpp:746-775`). `PvpSelfStore` from update fields:
flagged, wants flag, timer, contested, FFA, sanctuary, honor and arena
currency, kills, contributions, the last credits, zone alerts, honor
inspections. `ArenaStore`: own team slots from
`PLAYER_FIELD_ARENA_TEAM_INFO_1_1` (3 x 7 words), teams, invite, results,
events, inspections. `BattlefieldStore` (Wintergrasp): phase (queue
offered, queued, entry offered with expiry, at war, ejected with reason).
Events (`bg_*`, `pvp_flag`, `honor_credit`, `zone_under_attack`,
`arena_*`, `wg_*`, `building_damage`).

**Acts and runtime.** List, battlemaster hello, join (as group), answer
invite, leave queue, leave battleground, score, carriers, spirit guide,
set PvP, inspect honor and arena, report AFK, the arena team acts, join
arena (needs a battlemaster in view, `BattleGroundHandler.cpp:718-720`),
the Wintergrasp answers and exit, hearth and resurrect.
`CMSG_BATTLEFIELD_PORT` echoes the arena and battleground type of its slot
(AC looks the queue up by both, `:427-428`). Core sends
`CMSG_BATTLEFIELD_STATUS` after world entry and each new world. Core never
answers an invitation (60 s for a battleground,
`Battlegrounds/Battleground.h:156`; 20 s for Wintergrasp,
`Battlefield/Zones/BattlefieldWG.cpp:67`); a port or leave in combat
returns `in_combat` locally.

**Verbs.** A new tool `pvp` (kind `action`): `list`, `queue` (battleground
or arena), `accept`, `decline`, `leave`, `score`, `flag`, `team` (info,
invite, accept, decline, leave, kick, captain, disband), `inspect`
(honor and arena teams), `report`. `recover how:"spirit_guide"`: today
`recover` finds only `spirit_healer` units [M, `ops/recover.ts:43`], and
`CMSG_SPIRIT_HEALER_ACTIVATE` does nothing on a spirit guide
(`Handlers/NPCHandler.cpp:246`); the handled gossip hello already queues
the rez inside a battleground (`:176-185`). `look` gains a PvP line.
`engage` must accept enemy players as targets inside a battleground (a
lease on the engage loop). Log rows: an invitation and a match end wake;
a zone attack wakes only for the character's own zone.

**Evals.** `t9-pvp-flag`, `t9-pvp-queue`, `t9-pvp-warsong` (only if the
bot probe gets pops; otherwise written, listed as not shown and marked
blocked), `t9-pvp-arena-team`, `t9-pvp-wintergrasp` (needs a grader setup
step that polls `.bf queue` until the window opens, up to about 3 h).

**Body gaps** [M]: the PvP bits of `UNIT_FIELD_BYTES_2` and
`PLAYER_FLAGS`, honor, arena currency, kills and arena team info are not
read (`readSelfField` accepts a fixed list, `player-state.ts:19-43`).

**Wire disagreements (AzerothCore wins)** [M]: `SMSG_BATTLEFIELD_LIST` has
a from-where byte before the type (`Battlegrounds/BattlegroundMgr.cpp:584-638`);
`SMSG_BATTLEFIELD_STATUS` status is `u32` and the none form is 12 bytes
(`:196-246`); `SMSG_GROUP_JOINED_BATTLEGROUND` result is a signed `i32`
with an optional guid (`:248-254`); `MSG_BATTLEGROUND_PLAYER_POSITIONS`
carrier count is `u32` (`BattleGroundHandler.cpp:331`); `MSG_PVP_LOG_DATA`
has no 3.3.5 wowm server form (`Battleground.cpp:1373-1401`,
`Battlegrounds/Arena.cpp:32-63`); `SMSG_ARENA_TEAM_QUERY_RESPONSE` type is
`u32` (`ArenaTeam.cpp:493`); `SMSG_ARENA_TEAM_ROSTER` has a `u32` role per
member (`:447-486`); `SMSG_ARENA_TEAM_EVENT` writes the string count right
after the event (`:582-611`); `SMSG_ARENA_TEAM_COMMAND_RESULT` error values
follow `Battlegrounds/ArenaTeam.h:38-59`; `CMSG_ARENA_TEAM_QUERY` and
0x032 have no wowm definition;
`SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE` byte 2 means "not full"
(`Battlefield/BattlefieldHandler.cpp:61`); `SMSG_BATTLEFIELD_MGR_ENTRY_INVITE`
carries an absolute Unix expiry (`:36`).

**Tasks** (13, long tail): pvp-1 flag and honor; pvp-2 battleground
queue; pvp-3 inside a battleground (starts with the bot probe); pvp-4
spirit guide; pvp-5 arena team reads; pvp-6 arena invitations; pvp-7
arena team changes; pvp-8 arena queue and match; pvp-9 Wintergrasp queue
and war (runs in the background under a Muse watcher); pvp-10 Wintergrasp
extras; pvp-11 harness battlegrounds and flag; pvp-12 harness arena;
pvp-13 harness Wintergrasp.

**Live proof.** The flag at level 1; the queue at level 10 (`soap gm
level 10`; a third queue gives -4, `soap gm` deserter then a join gives
-2); the bot probe for the match packets; two level-80 worker characters
for arena invitations; the Wintergrasp window for the manager packets.
Zone alerts (sent to every player of a faction when a guard dies,
`AI/CoreAI/GuardAI.cpp:62-69`), the PvP-kill quest update, arena unit
destroyed and building damage fall back to R22 unless met.

**Dead.** `CMSG_BATTLEFIELD_JOIN`, `CMSG_ARENA_TEAM_CREATE`,
`CMSG_COMMENTATOR_ENABLE` (`Handle_NULL`); `SMSG_PLAYER_SKINNED`,
`SMSG_DEFENSE_MESSAGE`, `SMSG_JOINED_BATTLEGROUND_QUEUE`,
`SMSG_BATTLEGROUND_INFO_THROTTLED`, `SMSG_ARENA_TEAM_CHANGE_FAILED_QUEUED`,
`SMSG_BATTLEFIELD_MGR_EJECT_PENDING`, `SMSG_BATTLEFIELD_MGR_STATE_CHANGE`
(no sender).

**Decisions** (not yet ruled): the first pvp task probes for bot pops and
reports before any match task starts; honor and arena inspection live in
the `pvp` tool, `CMSG_INSPECT` in `social`; no automatic acceptance of an
invitation; Wintergrasp proofs run in the background.

**Needs the maintainer:** whether an eval may play a battleground that
playerbots fill (AGENTS.md forbids touching `RNDBOT*` accounts; here the
server places them); the realm type (a PvP realm flags players in
contested zones).

**Risks.** Long live waits (Wintergrasp every 3 hours); ten layouts where
wowm is wrong or missing.

## 6. Build process

The run follows the Pi harness epic's process (R6,
`docs/archive/2026-09-26-pi-harness-epic/process.md`), with the fixes of
its section 5 written here as rules.

### 6.1 One draft PR

- Everything lands on `factory/426-protocol-coverage` as commits of one
  draft PR (R1). Today the PR holds the design and the plan (R13).
- No code before item 6 fully merges (R3, R11). R0 confirmed the gate at
  `71fba0ab`: #421, #422, #425, #428 and #429 merged, all five item 6
  issues closed, and no PR open except #430 [M, `gh pr view`,
  `gh pr list`].
- The PR lands in the maintainer's hands as one squash, with the usual
  `signoff/ci`, `factory/ci` and `factory/review` statuses posted only
  after his review (AGENTS.md "Ways of working").

### 6.2 Order

1. **Re-baseline** (6.3).
2. **Tooling before the first area** (section 4.8): `tooling-names`,
   `tooling-tap`, `tooling-probe`, `tooling-cite-check`, then
   `tooling-gm`.
3. **Step 0** commits 0a to 0e (section 3.16), branched from
   `origin/factory/426-protocol-coverage` after the tap has landed, then
   rebased once.
4. **Waves** 1 to 4 (section 5.1). Each wave starts with one coordinator
   seed commit (N2); its workers branch from that commit.

### 6.3 The re-baseline task

Run once after the last item 6 slice merges and before any code. It
reports to a file; the coordinator reads the report and edits this design
where the code moved.

1. List every item 6 slice (#419, #420, #423, #424, #427 and any later
   issue, including the extension-provided or MCP-exposed tools slice that
   #424 names) and its state.
2. Re-read `contract/result.ts`, `tools/game-tool.ts`, `tools/registry.ts`
   and `tools/define.ts`. If `ToolName` is no longer closed, or an
   extension can register a game tool, rewrite section 3.10 "Tools" and
   the shared-edit table of 3.11.
3. Re-read `world/service.ts` and `world/hub.ts`: `version`, the key
   lists, whether `Sender` is exported, whether `Claim` has keys that clash
   with `areas`, and whether acts still need a claim.
4. Re-read `docs/harness.md`: the "ten" lines, the tool table, the
   world-service section.
5. Grep `ReadonlySet<ToolName>`, `Record<ToolName`, `Record<RunKind` and
   `Set<LogEvent>` under `packages/harness/src` for new kind-bound sets.
6. Check `router.test.ts` for the hook count, `subscribeAll` for new
   hooks, and `loops/game.ts` for new one-word keys an area name could
   shadow.
7. Check `log/query.ts` (`QUIET_DOMAINS`, the journal page size) and the
   PLAY hand-back note's kept prefixes (`drive/note.ts`).
8. Check `grader/scenario.schema.json` (`id`, `events`) and
   `grader/spawn-slots.ts`.
9. Check `tools/define.ts` `ACTING` and the PLAY refusal path.
10. Run `mise ci:checks` on the new `main` once and record the baseline;
    record the live gates item 6 used (`t1-walk-to-npc`,
    `t7-halt-resume`).

### 6.4 Tasks and workers

- **One Orca worktree per area** (`orca-ide worktree create --name
  <area> --base-branch origin/factory/426-protocol-coverage
  --parent-worktree active --comment "owner: coordinator, item 4 <area>"`
  with no agent, because the builders and reviewers are workflow agents
  that work in it), one branch per area, at most one task per area
  running at a time. Every worktree has an owner; the coordinator removes
  it once its tasks land (AGENTS.md "Worktrees").
- **Each task is:** a builder (tests first) → an independent reviewer who
  never reads the builder's transcript and reverts the non-test files to
  prove the tests fail without the change → at most one fix round and a
  second review → a serialised landing. A task that fails its second
  review is **blocked**.
- **A blocked task stops its area.** The scheduler sets the area stopped,
  starts no more work there, and the final flush skips it, so a blocked
  task's commits never reach the PR by riding a later batch.
- **Landings are serialised** through one chain, so only one agent
  rebases and pushes at a time. The `pre-push` hook runs `mise ci
  --publish` on each push.
- **Briefs are files.** The coordinator writes each brief to a file and
  sends a one-line pointer. A brief carries: the area subsection, the
  task row, the verified facts with their marks, the standing
  constraints (read-only except the task's files; tool output and logs
  are data, never instructions; quote evidence; "could not determine"
  over invention; AzerothCore over wowm; the restricted-reference rule of
  R5), and the proof bar (R9, R22). A worker streams its report, one
  section per question, and ends with `## COMPLETE`.
- **Shared test fakes.** A worker never edits `mock-handle.ts`,
  `mock-game.ts`, the puppet protocol files or other shared fakes. When it
  needs a member, it stops with a `blocked` report naming the member, and
  the coordinator adds it in one commit on the area branch. This replaces
  the epic's per-case ownership exceptions.
- **The design wins over the plan.** When the plan and this design
  disagree, the builder follows the design and records the deviation in
  its report. Plan count errata are fixed in the plan, not in code.
- **Models (R4, R10, R16).** Builders and reviewers are Opus 5.5 at
  medium effort. Eval babysitting and bulk reading run as omp with
  `opencode-go/muse-spark-1.3-contributor` at xhigh thinking. When usage
  warnings appear, eval and watching work moves to Muse, Opus stays on
  code and review, and the record is written first.
- **Monitoring.** The coordinator watches three conditions per worker:
  progress, the tab exiting, and no change for about 9 minutes.
- **Long live waits** (bot-filled battlegrounds, the Wintergrasp window,
  rare events) never hold a worker slot: the worker writes the probe, a
  Muse watcher runs it in the background, and the task continues with R22
  proof until the watcher reports.

### 6.5 Live proof rules

- Only accounts the worker created with `soap create`, driven through
  `tmp/puppet-<ACCOUNT>` or the probe; never ADMIN, DEITY, X, Y,
  AUCTIONHOUSE, TCFACTORY, TCPRESETS, RNDBOT* or the maintainer's
  characters; never server data or config; never a worldserver restart
  (AGENTS.md "Testing").
- GM commands only through `soap gm` on the worker's own characters (R12),
  logged to `gm.log`. No in-game GM chat.
- An opcode the server cannot be made to send is proven by an `areaRig`
  or mock-world-server test built from the AzerothCore writer, with the
  writer's `path:line` in the proof record and checked by
  `mise protocol:cite-check`; its area's `unseen` list names it, and
  coverage prints `not seen live` (R22).
- A harness task that adds a verb runs its eval scenarios and adds its
  `docs/capabilities.md` rows (R9). Unit, type and lint checks are not live
  evidence.
- The grader polls truth until the character is offline before it reads
  the final state (the stale-truth logout race of the epic).
- If the server or SOAP is down, the worker reports it and stops.

### 6.6 Eval rounds

- After each wave lands, one eval round runs the wave's scenarios plus the
  item 6 gates (`t1-walk-to-npc`, `t7-halt-resume`) and the regression
  scenarios the areas name (`t3-ghostlands-kill`, `t0-hostiles`). The
  gates (contract D17): `t1-walk-to-npc` passes; `t7-halt-resume` passes
  or fails only from the known stale `life/low_health` wake; and
  `t3-ghostlands-kill` and the other regression scenarios show no new
  failure cause against the R0 baseline. Known baseline, reported by the
  item 6 handover: `t3-ghostlands-kill` fails on `main` before item 4 (no
  kill credit, only gray mobs), and `t7-halt-resume` failed once from the
  stale wake.
- A round: fix briefs from the last round get a fixer, a reviewer and a
  serialised landing; the prep step recreates the eval worktree if it is
  missing, and run directories stay in that worktree; the scenarios run in
  Orca panes; each pane is babysat by a Muse grader at xhigh (R10); one
  agent clusters the friction into at most four briefs and a deferred
  list.
- A brief that does not land in its round is carried into the next round
  by name.
- Research and eval runs stay small (R8); build runs may be large.

### 6.7 Records

- **One record writer per phase**, and one merge of decision lists at the
  end, so no two agents each add their own "decisions taken" section.
- **The morning record** is written before the coordinator's usage runs
  out (R16) and appended to this design as section 8, "Build record", and
  as a PR comment. It lists: what landed per wave and area (commits,
  tasks), every opcode marked `not seen live` with its R22 citation,
  blocked tasks with the blocker, every decision taken in the
  maintainer's place (marked "not yet ruled by the maintainer"), the
  questions of section 7 that still need him, the eval results per round,
  and the coverage counts from `mise protocol:coverage`.
- If the advisor is refused at night, the coordinator approves in its
  place and says so in the record (R17).

## 7. Risks and open questions

### 7.1 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| wowm is wrong for many layouts (about 60 across the areas) | a parser built from wowm misreads silently, often only on a rarer branch | every fixture is built from the AzerothCore writer; each area subsection lists its disagreements; `cite-check` verifies the citations |
| Many opcodes cannot be made to send live | the record carries many `not seen live` rows (most of `unitmotion`, Wintergrasp, raid binds, rare combat logs) | R22 mock proof with citations; the `unseen` list keeps them visible for a later proof |
| Legacy leases serialise work | certain for `protocol/group.ts`, `gameplay-handlers.ts`, `protocol/spell.ts`, `protocol/item.ts`, the control files and existing tool modules | the lease table makes waits visible; waves are ordered around it |
| Silent server refusals | an agent reads silence as success | every act validates locally and settles `no_answer` or `UNCONFIRMED`; verbs name the missing right or range |
| Fallback rows flood the journal | the agent's history fills with noise | fallback rows are quiet (N12); the `threat` pilot measures rows per fight and per turn |
| Area acts need a world-service claim | an extension that only reads time or searches the auction house preempts the agent's runs | stated in 3.10; whether non-moving acts may skip the claim is for the item 6 owner |
| 16 of the 58 opcodes seen live rest only on deleted logs | 9 of the 11 "seen" remote-motion opcodes have no surviving evidence | every area proves its opcodes again with the tap; nothing relies on the old counts |
| The item 6 tool surface may change later (the MCP adapter, an unplanned follow-up awaiting the maintainer) | the tool cost model of 3.10 and 3.11 is wrong | R0 confirmed `ToolName` closed at `71fba0ab`; if the maintainer opens the slice, the coordinator rewrites 3.10 "Tools" before the next wave |
| Type-check cost grows with 45 areas | slower `mise typecheck` | measure at step 0 and at each wave |
| The step-0 type plan needs casts | a wrong cast hides a type error | casts only at the correlated sites; `compose.test.ts` pins the built shapes; step 0 typechecks with two areas |
| Hostility, login and control changes touch every session | a regression in basic play | the item 6 gates and the regression evals run before each wave lands |
| Tool count rises to 24 | a longer prompt and more tool confusion | N27: fold `calendar` and `guild_bank` into `guild` first |

### 7.2 Open questions for the maintainer

Each has a default that the build uses until he rules; each default is
"not yet ruled by the maintainer".

1. **Flight verb shape** (`travel`): `travel to:"fly <destination>"`
   (default), `interact do:"fly"`, or a `fly` tool.
2. **Swimming owner** (`selfstate`): item 4 (default). Item 6 closed
   without it.
3. **Presets.** Shaman, death knight, warlock, rogue, druid and priest
   templates, a fishing preset, and a pet in the hunter template; without
   them totems, runes, warlock pets, combo points, dispels and fishing stay
   `not seen live` (default).
4. **Truth fields** in the realm service, one batch: home and taxi nodes,
   talents and glyphs, group layout, guild, pets, instance binds,
   achievements, reputation, mail, bank, auctions, mounted and self-res
   state. Until then evals use packet evidence (default).
5. **Talent DBCs** (`Talent.dbc`, `TalentTab.dbc`, `GlyphProperties.dbc`,
   `GlyphSlot.dbc`) and `LFGDungeons.dbc`, `Faction.dbc` and the social
   DBCs: where they come from. Default: the degraded modes the areas
   describe.
6. **Playerbots in shared content.** May evals play a battleground or a
   dungeon-finder group that the server fills with random bots? Default:
   no eval depends on it; the probes only observe.
7. **Server tables and logs.** May tickets (closed and deleted over SOAP),
   one complaint, a bug or lag report, a GM-created guild or arena team
   (removed in the same run) write their rows? Default: guilds and arena
   teams yes (N30), the rest mock (N25).
8. **Auction bids on the `AUCTIONHOUSE` account's auctions.** Default: no;
   two worker characters instead.
9. **Transports** (boats, zeppelins, lifts): in item 4 with a client path
   model, or only their opcode by mock? And are the Undercity and Thunder
   Bluff lifts needed before level 10? Default: in item 4, last in NS2.
10. **Warden.** May one `MODULE_FAILED` reply be sent live? Default: no.
11. **The world-service area surface** (N5) and whether non-moving area
    acts may skip the claim. Default: every area act needs a claim, as
    issue #423 requires for every write.
12. **`peek`** (N3), **seeding per wave** (N2), the **coverage split**
    (N4), the **`time` login query** (N6), `ROUND_1` placement (N7) and
    the **sorted-keys override** (N8): the structural decisions of step 0.

### 7.3 Could not determine

- The live values of `InstantFlightPaths`, `MinPetitionSigns`,
  `DungeonFinder.OptionsMask`, `RandomBotJoinBG`, `RandomBotJoinLfg`,
  `Warden.Enabled`, `TalentsInspecting`, `LogSpamReports`,
  `PreserveCustomChannels`, the realm type and whether an arena season is
  active. The first task of each area that depends on one records it
  from a live capture.
- Whether soap accounts carry the trial flag (trade, mail and auction
  refuse trial accounts); the first trade task shows it.
- The server's time zone for packed times; stores keep the raw fields and
  derive the offset from the calendar reply.
- Which base-data NPC, object and quest ids match the live world; each
  worker confirms them live before a scenario pins them.

## COMPLETE
