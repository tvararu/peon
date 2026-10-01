# tooling: proof tooling (key: tooling)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md),
section 4 (proof tooling), section 6.2 (order).

## What this unit delivers

The unit `tooling` builds the proof tooling of design section 4: the
tools that let an area worker show the server sending or accepting an
opcode (R9), stage a character (R12), drive a second character, and grade
an eval on new server state. It owns no opcode. Every task has
`Opcodes: none`, and the unit has no dead opcodes.

- **Phase.** Every task is phase `0`. Phase 0 is a gate for wave 1 only
  for the five tasks of design 4.8 (T-1 to T-5). T-6 to T-10 are built in
  phase 0 lanes while the waves run, and each has a `Lands` line from
  contract 2.2 that names the latest point it must land.
- **Worktrees and branches.** Contract 0.1 splits the tooling into seven
  lane units, one Orca worktree each: `tooling-names`, `tooling-tap`,
  `tooling-probe`, `tooling-cite-check`, `tooling-gm`, `tooling-partner`,
  `tooling-truth`. The task brief names one unit `tooling` with branch
  `proto/area-tooling`. The branches that exist at plan time are
  `proto/area-tooling-trace`, `proto/area-tooling-cite` and
  `proto/area-tooling-factory`. This plan follows the contract's lanes
  and leaves the branch names to the coordinator (issue 2 below). One task
  at a time per lane. The plan JSON gives every task `unit: tooling`;
  each task's lane in the table below is the worktree it runs in.
- **Task ids.** The ids are the contract's `T-1` to `T-10` (contract
  0.10), with the lane name in each title. Area plans depend on `T-<n>`.
- Every command runs from the worktree root. Scratch files go in
  `./tmp/`.

## State at plan time

[M, `git log --oneline 9f5a1f22..c60663ef` and the diffs, read at
`5ddd356c`.] T-1 to T-5 have landed on
`factory/426-protocol-coverage`. The plan index compares each with its
plan body and with what step 0 and T-6 to T-10 consume from it ("Gate R
rulings", GR-18 to GR-25). "Beyond the plan body" lists the files a
task edited that its section below and contract 2.2 do not name (GR-25).

| Task | Lane | State | Commits | Beyond the plan body |
|---|---|---|---|---|
| T-1 | `tooling-names` | landed | `4811fd0f` (`fix: Retry soap create on a name collision`), `17016b6c` (`docs: Describe the soap create name retry`) | none |
| T-2 | `tooling-tap` | landed | `f2480411` (`feat: Add a packet trace and counts to core`), `0d4ef73b` (`fix: Replay notices made before a subscriber`), `2ffed845` (`feat: Add --packet-trace to the harness`), `d13a8dff` (`chore: Trace packet headers in every eval run`) | `contract/config.ts`, `eval/run-dir.ts`, harness `main.ts`, harness `test-support/router-fixture.ts` and `runtime-fixture.ts`, `docs/testing.md`, `docs/evals.md`; `world-conn.ts` has `trace` and `pendingNotices`, no `outbound` or `skipped` (GR-18) |
| T-3 | `tooling-probe` | landed | `95905bf2` (`chore: Read opcode names and hex in core`), `d29f6d39` (`chore: Add mise protocol:probe`), `89f48904`, `1115bd60`, `213ab572`, `cf48ee12`, `1d2ac2d6`, `02b83919` | `probe-args.ts`, `probe-account.ts`, `probe-run.ts`, `probe-sink.ts`, `probe-flows.ts` and their tests; core `packet-trace.ts` and `session.ts` (`opcodeNumber`); `packages/devtools/package.json`, `bun.lock`, `AGENTS.md`, `docs/protocol.md` ("Probe the server"), `stale-docs.ts` (`probe/` as a tool output) |
| T-4 | `tooling-cite-check` | landed | `a3dacf5c` (`chore: Add the AzerothCore citation checker`), `54d5c0b6`, `08159776`, `e26ec62a`, `60ff1ced`, `f7279d06`, `aaa18efb` | `AGENTS.md`, `docs/dependencies.md`, `docs/protocol.md` ("Check citations") |
| T-5 | `tooling-gm` | landed | `7b8342d5` (`chore: Add soap gm staging over SOAP`), `10a071ed` (`docs: Describe soap gm`), `e24c88da` (`chore: Log soap gm commands whose request throws`) | factory `main.ts`, `soap-console.test.ts`, `docs/testing.md`; `gm.log` is written by `consoleCommand` in `soap.ts` (GR-23) |
| T-6 to T-10 | `tooling-gm`, `tooling-partner`, `tooling-truth` | not started | none | none |

Branches as they are: no `proto/*` or tooling branch exists locally or
on `origin`, and no tooling worktree exists [M, `git branch -a`,
`git ls-remote --heads origin`, `git worktree list`]. The worktrees
`proto-tooling-cite`, `proto-tooling-trace` and
`proto-tooling-factory` of the landed lanes are gone, so each later lane
starts a new worktree `proto-<lane>` on branch `proto/area-<lane>`
(GR-9).

Branch contents are not fixed names. A later task reads the landed file,
not the branch.

## Contract issues

These are gaps found while planning. The contract is not changed here;
each needs a coordinator ruling or a `COORD-<n>` edit before the task that
meets it starts. Until issues 1, 3 and 4 are ruled, T-7a, T-9a and T-10
stop `blocked` on their first edit (contract 0.9). Each is **accepted by the maintainer (P2-5)**.
Ruled at Gate R: issues 1 to 7 are GR-8 to GR-14 in the plan index ("Gate R rulings").

1. **T-7 needs four more puppet files.** `start --packet-trace` cannot
   reach the login through `puppet/args.ts`, `protocol.ts` and
   `server.ts` alone. `launchPuppet` spawns `[process.execPath, entry]`
   with no arguments (`packages/harness/src/puppet/launch.ts:19`),
   `serve.ts` calls `bootPuppet` with `sessionLogin` and no sink
   (`packages/harness/src/puppet/serve.ts:8-11`), and `bootPuppet` takes
   only `paths` and `login` (`packages/harness/src/puppet/boot.ts:6-9`).
   `main.ts` builds each request from the command
   (`packages/harness/src/puppet/main.ts:57-60`), so every new verb
   touches it. Proposal: T-7 owns one-time edits to `puppet/main.ts`,
   `launch.ts`, `serve.ts` and `boot.ts` and their tests. `puppet/format.ts`
   is leased to `remote-motion` (contract 2.7); T-7 reuses
   `eventsJson` and `resultJson` unchanged and never edits it.
2. **Branch names.** Contract 0.1 and D19 give `proto/area-<unit>` per
   lane (`proto/area-tooling-tap`); the live branches use other stems
   (`-trace`, `-cite`, `-factory`); the brief names `proto/area-tooling`.
   The coordinator picks one name per lane.
3. **T-9 needs a new file.** `packages/harness/src/grader/run.ts` has 499
   non-blank lines (`grep -vc '^\s*$'`), so any addition breaks the
   500-line cap (contract 0.2). T-9 first moves partner create, start,
   step and delete into a new sibling `grader/run-partners.ts`, which
   contract 2.2 does not list.
4. **T-10 needs two more files and an exemption.** A console reader needs
   a home, and checks are filled from files in the run directory
   (`packages/harness/src/grader/draft-fill.ts:191-195`), so the read must
   run at finish in `grader/run-finish.ts`. Proposal: T-10 owns a new
   `grader/console-read.ts` and one call in `run-finish.ts`. Contract 0.7
   says "never a GM command inside an eval, except N30", while design 4.5
   and 5.13 use `soap gm read group` as a check source. The design wins
   (contract precedence 1), so contract 0.7 needs a `COORD` edit that
   exempts the read-only `soap gm read` verbs.
5. **T-8 fixture.** Contract 2.2 gives T-8 no new file, and design 4.5
   says the first step is one live `soap truth` saved as a fixture. The
   fixture goes inline in the colocated `grader/truth.test.ts`, which T-8
   owns with `truth.ts`.
6. **N30 removal verbs.** Contract 0.7 and N30 require a task to remove
   the guild or arena team it created in the same run, but the verb list
   of design 4.3 has no delete verb. T-6 adds `guild-delete` and
   `arena-disband`.
7. **Partner truth.** Design 5.5 (`t8-quests-share`), 5.19 (trade) and
   5.21 (`t2-inspect-partner`) need a "partner-truth check", which no
   contract task names. T-9b builds it, because it needs the partner
   accounts that T-9a manages.

## DAG

```
T-1 ─► T-5 ─► T-6
T-2 ─► T-3
T-2 ─► T-7a ─► T-7b ─► T-7c
       S0-1 ─► T-7b
T-4
T-8a ─► T-8b ─► T-9a ─► T-9b ─► T-10
T-7c ─► T-9a
T-5 ─► T-10
```

| Id | Title | Lane | Deps | Lands | Proof | Size |
|---|---|---|---|---|---|---|
| T-1 | soap create name retry | `tooling-names` | item6 | first (landed) | unit | S |
| T-2 | packet trace, counters, notice replay | `tooling-tap` | item6, R0 | before S0-1 | unit | L |
| T-3 | `mise protocol:probe` | `tooling-probe` | T-2 | before the first area | live | M |
| T-4 | `mise protocol:cite-check` | `tooling-cite-check` | item6 | before the first area | unit | S |
| T-5 | `mise factory soap gm` | `tooling-gm` | T-1 | may land after the first wave-1 areas start | live | M |
| T-6 | `soap gm` extensions (N31, N30) | `tooling-gm` | T-5 | before wave 4 | live | M |
| T-7a | puppet `call` and `calls.ts` | `tooling-partner` | T-2 | before SEED-2 | unit | M |
| T-7b | puppet `events --json` | `tooling-partner` | T-7a, S0-1 | before SEED-2 | unit | S |
| T-7c | puppet `raw` and `start --packet-trace` | `tooling-partner` | T-7b | before SEED-2 | live | M |
| T-8a | truth picks over existing fields | `tooling-truth` | item6 | with the first eval that needs a pick | unit | S |
| T-8b | truth fields from a live fixture | `tooling-truth` | T-8a | with the first eval that needs one of its fields | live | S |
| T-9a | multi-partner evals | `tooling-partner` | T-7c, T-8b | with the first `group` or `instances` eval | unit | M |
| T-9b | partner truth checks | `tooling-partner` | T-9a, T-8a | with the first eval that needs partner truth | unit | S |
| T-10 | console-read check source | `tooling-truth` | T-5, T-9a, T-9b | with the first eval that needs group, guild or pet state | unit | M |

The lane order: `tooling-gm` runs T-5 then T-6; `tooling-partner` runs
T-7a, T-7b, T-7c, T-9a, T-9b; `tooling-truth` runs T-8a, T-8b, T-10.

---

## T-1 tooling-names: soap create name retry

**Built from the design (N33).** Design 4.6 and N19. This plan does not
re-plan its steps.

- **Files:** `packages/factory/src/soap.ts` (`createAccount` retry,
  one-time), `packages/factory/src/soap.test.ts`, `docs/factory.md`.
- **Depends on:** item6.
- **Opcodes:** none.
- **Lands:** first. Landed as `4811fd0f` and `17016b6c`.

## T-2 tooling-tap: packet trace, counters and notice replay

**Built from the design (N33).** Design 4.1, N15 and N18; the files and
edits are contract 2.2 row T-2. This plan does not re-plan its steps.

- **Files:** core `packages/core/src/wow/packet-trace.ts` and test; harness
  `packages/harness/src/log/packet-trace.ts` and test; one-time edits to
  `client.ts`, `world-conn.ts`, `client-connection.ts`,
  `world-handlers.ts`, `remote-motion-handlers.ts`, `protocol/world.ts`,
  `session.ts`, `client-handlers.ts`, `client-extras.ts`,
  `packages/harness/src/config/flags.ts`,
  `packages/harness/src/runtime/connection.ts`,
  `packages/harness/src/grader/pane.ts`, `docs/harness.md`,
  `docs/protocol.md`.
- **Depends on:** item6, R0.
- **Opcodes:** none.
- **Lands:** before S0-1, which rebases once on it.

## T-3 tooling-probe: `mise protocol:probe`

**Built from the design (N33).** Design 4.2 and N16. This plan does not
re-plan its steps.

- **Files:** `packages/devtools/src/probe.ts` and test;
  `packages/devtools/src/probe-flows/login.ts`, `nearest.ts`, `talk.ts`
  and their test; `mise.toml` (append `[tasks."protocol:probe"]`);
  `docs/testing.md` ("Live characters", one paragraph).
- **Depends on:** T-2 (the `attach` sender and the sink).
- **Opcodes:** none.
- **Lands:** before the first area.

## T-4 tooling-cite-check: `mise protocol:cite-check`

**Built from the design (N33).** Design 4.7 and N20. This plan does not
re-plan its steps.

- **Files:** `packages/devtools/src/cite-check.ts` and test (the branch
  also splits out `cite-markdown.ts` and `cite-source.ts` siblings);
  `mise.toml` (append `[tasks."protocol:cite-check"]`); `docs/testing.md`
  (one sentence).
- **Depends on:** item6.
- **Opcodes:** none.
- **Lands:** before the first area.

## T-5 tooling-gm: `mise factory soap gm`

**Built from the design (N33).** Design 4.3, N17 and R12. This plan does
not re-plan its steps.

- **Files:** `packages/factory/src/soap-gm.ts` and test;
  `packages/factory/src/soap.ts` (export `consoleCommand`, after T-1);
  `packages/factory/src/soap-cli.ts` (the `gm` verb); `docs/factory.md`
  ("Game accounts" verb list).
- **Depends on:** T-1.
- **Opcodes:** none.
- **Lands:** after T-1; may land after the first wave-1 areas start.

---

## T-6 tooling-gm: `soap gm` extensions (N31, N30)

Gate R rulings: GR-9, GR-13, GR-15, GR-16, GR-23 (plan index).

Adds the staging verbs that later areas need beyond design 4.3: the
character-screen verbs for `session` (design 5.18), the deserter and
achievement resets for `instances`, `pvp` and `social`, the read-only
guild, arena and battlefield reads for `guild` and `pvp`, and the removal
verbs N30 requires.

**Files:**
- Modify: `packages/factory/src/soap-gm.ts` (the verb allow-list only)
- Modify: `packages/factory/src/soap-gm.test.ts`
- Modify: `docs/factory.md` ("Game accounts" verb list, the `soap gm`
  rows T-5 added)

If `soap-gm.ts` would pass 500 non-blank lines, the builder moves the
verb table to a sibling `packages/factory/src/soap-gm-verbs.ts` in the
same commit and reports it.

**Depends on:** T-5.
**Lands:** before wave 4 (contract 2.2).
**Opcodes:** none.

**Verbs.** All console commands below are `Console::Yes` [M]. `cs_*.cpp`
paths are under `src/server/scripts/Commands/`.

| Verb | Console command | Source |
|---|---|---|
| `rename <NAME2>` | `character rename <NAME2>` | `cs_character.cpp:75,332` |
| `customize <NAME2>` | `character customize <NAME2>` | `cs_character.cpp:67,464` |
| `changefaction <NAME2>` | `character changefaction <NAME2>` | `cs_character.cpp:68,488` |
| `changerace <NAME2>` | `character changerace <NAME2>` | `cs_character.cpp:69,512` |
| `deserter-bg <duration>` | `deserter bg add <C> <duration>` | `cs_deserter.cpp:60,416` |
| `reset-achievements` | `reset achievements <C>` | `cs_reset.cpp:51,67` |
| `guild-delete <name>` | `guild delete "<name>"` | `cs_guild.cpp:36,101` |
| `arena-disband <teamId>` | `arena disband <teamId>` | `cs_arena.cpp:51,102` |
| `read guild <name>` | `guild info "<name>"` | `cs_guild.cpp:41,218` |
| `read arena <teamId>` | `arena info <teamId>` | `cs_arena.cpp:54,201` |
| `read arena-lookup <name>` | `arena lookup <name>` | `cs_arena.cpp:55,218` |
| `read bf-queue` | `bf queue 1` (Wintergrasp) | `cs_bf.cpp:43,182` |
| `read characters` | `lookup player account <ACCOUNT>` | `src/server/scripts/Commands/cs_lookup.cpp:43,1605` |

**Guards** (on top of T-5's account, ledger and worktree-root guards):

- `<NAME2>` is a second character on the worker's own ledger account and
  never the ledger's own character. The tool runs `lookup player account
  <ACCOUNT>` first and refuses unless `<NAME2>` is in the reply and differs
  from the ledger character. The reply lines come from
  `LookupPlayerSearchCommand` (`cs_lookup.cpp:1628-1690`); the parser reads
  the character names from them.
- `<duration>` matches `^[0-9]{1,4}[smh]$` and is at most 1 hour, so a
  deserter debuff never outlives a proof run.
- `guild-delete` and `read guild` take only a name that starts with
  `Fac` (the rule of design 4.3). `arena-disband` first runs `arena info
  <teamId>` and refuses unless the team name in the header line
  (`cs_arena.cpp:210`) starts with `Fac`.
- `read bf-queue` takes no argument; the battle id is fixed at 1.
- Every `read` verb is read-only; no other verb in this task reads.

**Steps:**

- [ ] **Step 1: Write the failing tests.** In `soap-gm.test.ts`, with the
  fake runner T-5 injects, add one test per verb that the rendered console
  line equals the table row with the ledger's character filled in; and
  these refusals: `rename` of the ledger's own character; `rename` of a
  name absent from the fake `lookup player account` reply; a deserter
  duration of `2h` and of `10d`; `guild-delete Stormwind`;
  `arena-disband 7` when the fake `arena info 7` header names `Kings`;
  `read bf-queue 2`. The fake replies are built from the format strings
  of the `LANG_LOOKUP_PLAYER_*` and `LANG_ARENA_INFO_HEADER` rows in
  `data/sql/base/db_world/acore_string.sql` (the builder cites the row
  numbers in its report). Each refused verb sends no console command and
  writes an `ok: false` line to the log.
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/factory/src/soap-gm.test.ts`. Expected: the new
  verbs fail as unknown verbs.
- [ ] **Step 3: Implement.** Add the verbs to the allow-list with their
  guards. The two-step verbs (`rename` family, `arena-disband`) run the
  read through the same injected runner, then the write, and log both
  lines.
- [ ] **Step 4: Run the tests and see them pass.** Then
  `mise typecheck factory`, `mise lint packages/factory`,
  `mise ci:checks`.
- [ ] **Step 5: Docs.** Add the new verbs to the `soap gm` list in
  `docs/factory.md` "Game accounts", in the present tense.

**Proof:** live, on the worker's own account. Create one account with
`mise factory soap create`, then run
`mise factory soap gm <ACCOUNT> read characters`,
`reset-achievements`, `deserter-bg 1m`, `read bf-queue`, and
`guild-create FacProbe` followed by `read guild FacProbe` and
`guild-delete FacProbe`, and `arena-create 2 FacProbe` followed by
`read arena-lookup FacProbe` and `arena-disband <id>`. Each exits 0 and
leaves a `gm.log` line. The four character-screen verbs are unit proof
only unless a second character exists on the account: a second character
comes from the `session` area's character create flow, or from a
`pdump copy` onto the same account (`packages/factory/src/soap-copy.ts:65`
already runs `pdump copy <template> <account> <character>`), which is
a proposal, **accepted by the maintainer (P2-5)**. Delete the account with
`mise factory soap delete <ACCOUNT>`.

**Commit:**

```
chore: Add the staging verbs later areas need

Session, pvp, guild and social proof needs character-screen flags,
deserter and achievement resets, and read-only guild, arena and
battlefield reads. Guilds and arena teams a worker creates are now
removed with the same tool.
```

---

## T-7a tooling-partner: puppet `call` and `calls.ts`

Gate R rulings: GR-8, GR-9 (plan index).

Lets a worker or an eval drive a partner character's `WorldHandle`
methods, so group, guild, trade and duel opcodes have a live counterpart
(design 4.4).

**Files:**
- Create: `packages/harness/src/puppet/calls.ts`,
  `packages/harness/src/puppet/calls.test.ts`
- Modify (one-time): `packages/harness/src/puppet/args.ts`,
  `args.test.ts`, `protocol.ts`, `protocol.test.ts`, `server.ts`,
  `server.test.ts`, `main.ts`, `main.test.ts` (issue 1)
- Modify: `docs/evals.md` ("The second character" command table, one row)

**Depends on:** T-2 (the lane order; `call` itself needs no sink).
**Lands:** before SEED-2 (the first parties-and-raids wave).
**Opcodes:** none.

**Shape.**

```ts
export type PuppetCall = {
  readonly args: readonly ("string" | "guid" | "number")[];
  readonly run: (handle: WorldHandle, args: readonly unknown[]) => void;
};
export const PUPPET_CALLS: Readonly<Record<string, PuppetCall>>;
export function decodeCall(
  method: string,
  json: string | undefined,
): { method: string; args: unknown[] } | { error: string };
```

- Keys are sorted (harness literals; contract 2.6 makes later area
  additions a sorted key). First methods, each checked present on
  `WorldHandle` at the pin [M, `packages/core/src/wow/client.ts`]:
  `acceptGuildInvite` (`:224`), `acceptInvite` (`:197`),
  `declineGuildInvite` (`:225`), `declineInvite` (`:198`), `guildInvite`
  (`:217`), `invite` (`:191`), `leaveGroup` (`:193`), `rollLoot` (`:293`),
  `selectTarget` (`:237`), `sendParty` (`:175`), `sendRaid` (`:176`),
  `sendSay` (`:171`), `setLeader` (`:196`), `uninvite` (`:192`).
- A `guid` argument is a decimal string that `decodeCall` turns into a
  `bigint`; a `number` is an integer; a vote for `rollLoot` is one of the
  `RollVote` values.
- CLI: `call <method> [json-array]`. Protocol: `{ cmd: "call"; method:
  string; args: unknown[] }`. The server answers `resultJson("call",
  { method })` after the call returns; a thrown error becomes `ok: false`.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `calls.test.ts`: `decodeCall("invite", '["Fabc"]')` returns the
    method and args; `decodeCall("selectTarget", '["42"]')` gives `42n`;
    an unknown method, a non-array JSON, a wrong argument count and a
    non-integer number each return `error`; every key of `PUPPET_CALLS`
    names a function on the mock game's handle
    (`packages/harness/test-support/mock-game.ts`).
  - `args.test.ts`: `call invite '["Fabc"]'` parses; `call` with no
    method is a `UsageError`.
  - `protocol.test.ts`: `decodeRequest` keeps a `call` request and drops
    one with a non-string method.
  - `server.test.ts`: a `call invite` request over the socket calls the
    mock handle's `invite` with `"Fabc"` and replies `ok: true`; a call
    during logout replies "The puppet is stopping.".
  - `main.test.ts`: `call` sends the `call` request.
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/harness/src/puppet`. Expected: `calls.ts` is
  missing and `call` is an unknown command.
- [ ] **Step 3: Implement** `calls.ts`, then the `call` branches in
  `args.ts` (parser and `USAGE`), `protocol.ts` (`PuppetRequest`, `CMDS`,
  `decodeRequest`), `server.ts` (`answer`) and `main.ts` (`run`).
- [ ] **Step 4: Run the tests and see them pass.** Then
  `mise typecheck harness`, `mise lint packages/harness/src/puppet`,
  `mise ci:checks`.
- [ ] **Step 5: Docs.** Add the `call <method> [json-array]` row to "The
  second character" table in `docs/evals.md`.

**Proof:** unit. A live smoke run confirms the verb; the packet evidence
for the same flow is T-7c's live proof. Create two accounts with
`mise factory soap create eversong10`. Start both puppets (`tmp/puppet-<A> start --json`,
`tmp/puppet-<B> start --json`). Run `tmp/puppet-<A> call invite
'["<character B>"]'`, then `tmp/puppet-<B> call acceptInvite`, then
`tmp/puppet-<A> call leaveGroup`. Evidence: each call exits 0 and
replies `ok: true`. The packet evidence for the same flow comes with the
T-7c run, whose traces show both sides. Stop both puppets and delete both
accounts.

**Commit:**

```
chore: Let the puppet call handle methods

Group, guild and trade proof needs a second character that invites,
accepts and chats on demand. An allow-list keeps the puppet to named
methods with checked arguments.
```

## T-7b tooling-partner: puppet `events --json`

Gate R rulings: GR-8, GR-17 (plan index).

**Files:**
- Modify (one-time): `packages/harness/src/puppet/args.ts`,
  `args.test.ts`, `protocol.ts`, `protocol.test.ts`, `server.ts`,
  `server.test.ts`, `main.ts`, `main.test.ts`
- Modify: `docs/evals.md` (one row)

**Depends on:** T-7a, S0-1 (`onAreaEvent` on `WorldHandle`, contract 1.6).
**Lands:** before SEED-2.
**Opcodes:** none.

**Shape.** The puppet subscribes, next to `onMessage`
(`packages/harness/src/puppet/server.ts:17-20`), to `onGroupEvent`,
`onGuildEvent`, `onDuelEvent`, `onNotice`, `onPacketError`
(`packages/core/src/wow/client.ts:199,215,216,311,202`) and
`onAreaEvent`. Each event is pushed to one bounded buffer of
`CHAT_CAPACITY` rows as `{ at, hook, event }`, with bigints as decimal
strings. `events --json` prints `eventsJson("events", rows)` and drains
the buffer, as `read` does for chat. `read` is unchanged.

**Steps:**

- [ ] **Step 1: Write the failing tests.** `server.test.ts`: a group
  event, a notice and a packet error emitted on the mock handle appear in
  one `events` reply in arrival order with their hook names; a second
  `events` reply is empty; the buffer drops the oldest row past its
  capacity; an area event emitted with the mock handle's
  `triggerAreaEvent` appears with `hook: "area"`; a bigint guid comes out
  as a string. `args.test.ts`, `protocol.test.ts` and `main.test.ts`:
  `events --json` parses and sends `{ cmd: "events" }`.
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/harness/src/puppet`.
- [ ] **Step 3: Implement** the subscriptions (unsubscribed in `finish`),
  the buffer and the four verb branches.
- [ ] **Step 4: Run the tests and see them pass**, then
  `mise typecheck harness` and `mise ci:checks`.
- [ ] **Step 5: Docs.** Add the `events --json` row to "The second
  character" table.

**Proof:** unit. The live evidence comes with the T-7c run below, which
reads `events --json` on the invited partner.

**Commit:**

```
chore: Let the puppet report its game events

A partner that accepts an invite or a duel must show what the server
told it. The events verb drains group, guild, duel, notice, packet
error and area events the way read drains chat.
```

## T-7c tooling-partner: puppet `raw` and `start --packet-trace`

Gate R rulings: GR-8, GR-22 (plan index).

**Files:**
- Modify (one-time): `packages/harness/src/puppet/args.ts`,
  `args.test.ts`, `protocol.ts`, `protocol.test.ts`, `server.ts`,
  `server.test.ts`, `main.ts`, `main.test.ts`, `launch.ts`,
  `launch.test.ts`, `boot.ts`, `boot.test.ts`, `serve.ts` (issue 1)
- Modify: `docs/evals.md` (two rows)

**Depends on:** T-7b (T-2's `TraceSink.attach` and the harness sink have
landed with T-2).
**Lands:** before SEED-2.
**Opcodes:** none.

**Shape.**

- `start --json --packet-trace off|headers|bodies`, default `off`.
  `main.ts` passes the mode to `launchPuppet`, which appends it to the
  spawn arguments; `serve.ts` reads it and passes a sink factory to
  `bootPuppet`; `bootPuppet` builds the login config as
  `{ ...profile.client, trace }` when the mode is not `off`. The sink is
  T-2's harness sink from `#harness/log/packet-trace` (the builder reads
  its landed export names; they could not be determined at plan time),
  writing `packets.jsonl` and `packets.json` under the account's state
  directory (`stateDir`, `packages/core/src/lib/paths.ts:21`, which the
  wrapper sets to `tmp/factory-account-<ACCOUNT>/state`,
  `packages/factory/src/soap-wrapper.ts:19-23`).
- `raw <OPCODE> [hex]`: `OPCODE` is a `GameOpcode` name (a `CMSG_` or
  `MSG_` name only) or `0x` hex; `hex` is an even-length body. The
  server sends it through the sender that T-2's sink receives in
  `attach`. With no sink (`--packet-trace off`) `raw` replies
  "Start the puppet with --packet-trace to send raw packets." The reply
  is `resultJson("raw", { opcode, size })`.
- The wrapper forwards every argument (`exec bun .../main.ts "$@"`,
  `soap-wrapper.ts:59`), so no factory change is needed.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `args.test.ts`: `start --json --packet-trace headers` parses;
    `--packet-trace loud` is a `UsageError`; `raw CMSG_PING 0100000000000000`
    parses; `raw SMSG_PONG` and `raw CMSG_PING 0` are refused.
  - `launch.test.ts`: the spawn arguments carry `--packet-trace headers`.
  - `boot.test.ts`: with `headers`, the `login` fake receives a config
    whose `trace` is set; with `off`, `trace` is undefined.
  - `server.test.ts`: `raw` with a fake sink calls the attached sender
    with the opcode and the body bytes; `raw` with no sink replies the
    refusal.
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/harness/src/puppet`.
- [ ] **Step 3: Implement** the flag through `main.ts`, `launch.ts`,
  `serve.ts` and `boot.ts`, and the `raw` verb through `args.ts`,
  `protocol.ts`, `server.ts` and `main.ts`.
- [ ] **Step 4: Run the tests and see them pass**, then
  `mise typecheck harness` and `mise ci:checks`.
- [ ] **Step 5: Docs.** Add the `raw` row and the `--packet-trace` note
  on the `start --json` row of "The second character" table. The
  partner's `packets.jsonl` lives in the account's state directory, not
  in the run directory, so the run-directory table does not change.

**Proof:** live. Two `eversong10` accounts, both puppets started with
`--packet-trace headers`. `tmp/puppet-<A> call invite '["<B>"]'`, then
`tmp/puppet-<B> events --json` shows the group invite event,
`tmp/puppet-<B> call acceptInvite`, then `tmp/puppet-<A> call
leaveGroup`. Evidence: A's `packets.jsonl` has an `out` row for
`CMSG_GROUP_INVITE` and an `in` row for `SMSG_GROUP_LIST`; B's has an
`in` row for `SMSG_GROUP_INVITE` and an `out` row for
`CMSG_GROUP_ACCEPT`. Then `tmp/puppet-<A> raw CMSG_PING <8-byte hex>`
leaves an `out` row for `CMSG_PING` and an `in` row for `SMSG_PONG`.
Stop both puppets and delete both accounts.

**Commit:**

```
chore: Let the puppet trace and send raw packets

A partner's own trace proves what the server sent to the second
character, and raw sends cover client opcodes that have no handle
method yet.
```

---

## T-8a tooling-truth: truth picks over existing fields

**Files:**
- Modify: `packages/harness/src/grader/scenarios.ts` (`TruthPick`)
- Modify: `packages/harness/src/grader/scenario.schema.json` (the
  `truth` pick enum at `:84-91`)
- Modify: `packages/harness/src/grader/draft-fill.ts` (`PICKS`,
  `:49-66`) and `draft-fill.test.ts`
- Modify: `docs/evals.md` (the `evidence` table, the `truth` row at
  `:114`)

**Depends on:** item6.
**Lands:** with the first eval that needs a pick (the `items` eval for
`equipment`, or a `talents` or `spells` eval for `spells`).
**Opcodes:** none.

**Picks.** Each uses a field `parseTruth` keeps today
(`packages/harness/src/grader/truth.ts:148-176`):

| Pick | Draft shows |
|---|---|
| `spells` | `spells`, sorted |
| `equipment` | inventory rows with `bag` 255 and `slot` 0-18 |
| `bank` | inventory rows with `bag` -1 and the bank rows of bag 255 (the slot range is read from the fixture of T-8b; until then, `bag` -1 only) |

The bag and slot rules come from the archived service README record of
the `GET /truth` rows ("`bag` 255 and `slot` 0-18", "`bag` -1 is a bank
bag"). The builder checks them against one live `soap truth` reply in
step 1 and reports any difference.

**Steps:**

- [ ] **Step 1: Write the failing tests.** `draft-fill.test.ts`: a truth
  check with `evidence.truth: ["spells"]` shows the baseline and final
  spell lists; `["equipment"]` shows only the rows with `bag` 255 and
  `slot` 0-18; `["bank"]` shows the bank rows. The fixtures are small
  `Truth` objects in the test; one live `mise factory soap truth
  <ACCOUNT>` on a fresh `soap create` account confirms the row shapes.
  Also `packages/harness/src/grader/scenarios.test.ts`: a scenario with
  `"truth": ["equipment"]` loads.
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/harness/src/grader/draft-fill.test.ts packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 3: Implement** the three names in `TruthPick`, the schema
  enum and `PICKS`.
- [ ] **Step 4: Run the tests and see them pass**, then
  `mise ci:checks`.
- [ ] **Step 5: Docs.** Name the new picks in the `truth` row of the
  `evidence` table in `docs/evals.md`.

**Proof:** unit. The live `soap truth` read of step 1 checks the row
shapes; it is not a gameplay claim.

**Commit:**

```
chore: Add spells, equipment and bank truth picks

Item, talent and bank evals grade on fields the truth reply already
carries, but the grader could not pick them out.
```

## T-8b tooling-truth: truth fields from a live fixture

Gate R ruling: GR-12 (plan index).

**Files:**
- Modify: `packages/harness/src/grader/truth.ts` (`Truth`, `TruthItem`,
  `parseTruth`) and `truth.test.ts` (the fixture, inline)
- Modify: `packages/harness/src/grader/scenarios.ts`,
  `scenario.schema.json`, `draft-fill.ts` and `draft-fill.test.ts`
- Modify: `docs/evals.md` (the `evidence` table)

**Depends on:** T-8a.
**Lands:** with the first eval that needs `reputation`, `mail`, `hearth`
or `durability` (world, quests, economy, travel or items evals).
**Opcodes:** none.

**Fields.** `hearth`, `reputation`, `mail`, and per item `durability`
and `maxDurability`. Whether today's service returns them could not be
determined without a live call (design 4.5). Each is optional in
`Truth`: an absent key stays `undefined`, so an older reply still parses.

**Steps:**

- [ ] **Step 1: Capture the fixture.** `mise factory soap create
  eversong10`, then `mise factory soap truth <ACCOUNT>`. Paste the reply
  into `truth.test.ts` as a constant, with the account and character
  names replaced by the fixed test names the file already uses. Delete
  the account. If a field is absent from the reply, drop its pick from
  this task and report it as a service field for the maintainer's batch
  request (design 4.5).
- [ ] **Step 2: Write the failing tests.** `truth.test.ts`: the fixture
  parses and keeps each present field; a reply without them still parses
  with the fields `undefined`; a wrong type in a present field throws
  with its path. `draft-fill.test.ts`: the picks `hearth`, `reputation`
  and `mail` show baseline and final; `durability` shows per-item
  durability on the `inventory` and `equipment` picks.
- [ ] **Step 3: Run them and see them fail.**
  `mise test packages/harness/src/grader/truth.test.ts packages/harness/src/grader/draft-fill.test.ts`.
- [ ] **Step 4: Implement** the optional fields in `parseTruth` and the
  picks in `TruthPick`, the schema and `PICKS`.
- [ ] **Step 5: Run the tests and see them pass**, then
  `mise ci:checks`.
- [ ] **Step 6: Docs.** Name the picks in the `evidence` table.

**Proof:** live: the fixture is one real `soap truth` reply.

**Commit:**

```
chore: Parse hearth, rep, mail and durability

World, economy and travel evals grade on these fields. They stay
optional, so a service that does not return them still parses.
```

---

## T-9a tooling-partner: multi-partner evals

Gate R ruling: GR-10 (plan index).

**Files:**
- Create: `packages/harness/src/grader/run-partners.ts` and
  `run-partners.test.ts` (issue 3)
- Modify: `packages/harness/src/grader/run.ts` (move the partner code
  out, then call `run-partners.ts`), `run.test.ts`
- Modify: `packages/harness/src/grader/scenarios.ts` (`Scenario.partners`),
  `scenario.schema.json`
- Modify: `packages/harness/src/grader/accounts.ts` (`FILES`, `Role`) and
  `accounts.test.ts`
- Modify: `packages/harness/src/grader/partner.ts` (`expandArgv`, the
  action target)
- Modify: `docs/evals.md` ("The second character" and "Add a scenario")

**Depends on:** T-7c, T-8b (both edit `grader/scenario.schema.json` and
`grader/scenarios.ts` from different lanes; plan fix-up).
**Lands:** with the first `group` or `instances` eval (wave 2).
**Opcodes:** none.

**Shape.**

- `Scenario.partners?: { role: "partner" | "witness"; preset: string }[]`,
  at most 4 entries. `partner` stays required in the schema
  (`scenario.schema.json:318`), so the 12 existing scenarios load
  unchanged. A scenario sets `partner` or `partners`, never both (a
  loader check).
- Accounts: roles `partner1` to `partner4`, files
  `partner<N>-names.json` and `partner<N>.json`. The single `partner`
  keeps its files.
- Partner actions gain an optional `actor: number` (1-based; default the
  single partner or partner 1). `expandArgv` replaces `<PARTNER1>` to
  `<PARTNER4>` as well as `<AGENT>` and `<PARTNER>`
  (`packages/harness/src/grader/partner.ts:42-49`). Reads go to
  `partner<N>-read.jsonl`.
- `run-partners.ts` creates, starts (`start --json --packet-trace
  headers`), steps and deletes every partner. `run.ts` drops below 480
  non-blank lines.

**Steps:**

- [ ] **Step 1: Refactor first, test-neutral.** Move the partner create,
  start (`run.ts:229-241`), step (`:358-390`) and delete code into
  `run-partners.ts` behind functions that take the list of partners.
  `mise test packages/harness/src/grader` stays green. Commit it alone
  (`refactor:`).
- [ ] **Step 2: Write the failing tests.** `scenarios.test.ts`: a
  scenario with two `partners` loads; one with both `partner` and
  `partners` is refused; five partners are refused. `accounts.test.ts`:
  roles `partner1` and `partner2` get their own files.
  `run-partners.test.ts` (with `test-support/fake-exec.ts`): two
  partners are created, started with `--packet-trace headers` and deleted
  on finish, and a failed second create deletes the first; an action with
  `actor: 2` runs on the second wrapper; `<PARTNER2>` expands to the
  second character.
- [ ] **Step 3: Run them and see them fail.**
  `mise test packages/harness/src/grader`.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run the tests and see them pass**, then
  `mise ci:checks`.
- [ ] **Step 6: Docs.** Describe `partners`, `actor` and the
  `<PARTNER<N>>` placeholders in `docs/evals.md`, and add the
  `partner<N>-read.jsonl` files to the run-directory table
  (`docs/evals.md:74-84`).

**Proof:** unit. The first `group` eval (`t9-raid-convert`, group area)
is the live proof and records its verdict in its own task.

**Commits:**

```
refactor: Move eval partner handling to a module

run.ts is at the 500-line cap, and multi-partner evals need room for
more partner code.
```

```
chore: Let evals run up to four partners

Raid and dungeon-finder evals need more than one second character. The
single partner slot keeps working for the existing scenarios.
```

## T-9b tooling-partner: partner truth checks

Gate R ruling: GR-14 (plan index).

**Files:**
- Modify: `packages/harness/src/grader/run-partners.ts` and test
  (partner baseline truth)
- Modify: `packages/harness/src/grader/run-finish.ts` (partner final
  truth, after the partner logs out) and `run-finish.test.ts`
- Modify: `packages/harness/src/grader/scenarios.ts` (`CheckEvidence.who`),
  `scenario.schema.json`, `draft-fill.ts` and `draft-fill.test.ts`
- Modify: `docs/evals.md` (the `evidence` table, one row)

**Depends on:** T-9a, T-8a.
**Lands:** with the first eval that needs partner truth
(`t8-quests-share`, `t9-trade-swap` or `t2-inspect-partner`, design 5.5,
5.19, 5.21).
**Opcodes:** none.

**Shape.** `evidence.who?: "agent" | "partner" | "partner<N>"`, default
`agent`. The grader reads each partner's truth at baseline and final
into `partner-baseline.json` and `partner-final.json` (per partner
`partner<N>-...` with T-9a's names). A truth check with `who` set shows
that character's picks, deltas and items. The final partner read waits
for the partner's logout like the agent's (`finalTruth`,
`packages/harness/src/grader/truth.ts`).

**Steps:**

- [ ] **Step 1: Write the failing tests.** `draft-fill.test.ts`: a
  truth check with `who: "partner"` and `truth: ["inventory"]` shows the
  partner's baseline and final, not the agent's; a missing partner file
  fills the check as unmet with the reason. `run-partners.test.ts` and
  `run-finish.test.ts` (fake exec): the partner's truth is read once
  before start and once after its stop. `scenarios.test.ts`: `who`
  loads; `who: "partner3"` on a scenario with two partners is refused.
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/harness/src/grader`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass**, then
  `mise ci:checks`.
- [ ] **Step 5: Docs.** Add the `who` row to the `evidence` table and
  the partner truth files to the run-directory table
  (`docs/evals.md:74-84`).

**Proof:** unit. The first eval that uses `who` is the live proof.

**Commit:**

```
chore: Grade evals on a partner's truth

Quest sharing, trade and inspect evals change the second character,
so the grader now reads its truth before and after the run.
```

---

## T-10 tooling-truth: console-read check source

Gate R rulings: GR-11, GR-24 (plan index).

**Files:**
- Create: `packages/harness/src/grader/console-read.ts` and test
  (issue 4)
- Modify: `packages/harness/src/grader/run-finish.ts` (one call) and
  `run-finish.test.ts`
- Modify: `packages/harness/src/grader/scenarios.ts` (`source:
  "console"`, `CheckEvidence.console`), `scenario.schema.json`,
  `draft-fill.ts` and `draft-fill.test.ts`
- Modify: `docs/evals.md` (the `evidence` table and the check sources)

**Depends on:** T-5 (`soap gm read`), T-9b (T-9b and T-10 both edit
`grader/run-finish.ts`, `grader/draft-fill.ts` and the schema; plan
fix-up), T-9a (the per-partner file names;
a check may read a partner).
**Lands:** with the first eval that needs group, guild or pet state
before the service fields exist (the `raid` evals of wave 2 read `soap gm
read group`, design 5.13).
**Opcodes:** none.

**Shape.**

- A check `{ source: "console", evidence: { console: { read: "group" |
  "mail" | "pet" | "titles" | "reputation" | "pinfo" | "guild" | "arena",
  arg?: string, who?: ..., match: string } } }`. `match` is a regex over
  the reply text. `guild` and `arena` exist only after T-6.
- `console-read.ts` runs `mise factory soap gm <ACCOUNT> read <verb>
  [arg]` through the grader's `Exec` once per console check, after the
  final truth, and writes `console.jsonl` (one row per check: the verb,
  the exit code, the text). It never runs a verb that is not `read`.
- `draft-fill.ts` fills a console check from `console.jsonl`: the text,
  whether `match` matched, and the exit code.
- Console text depends on server strings, so this source is a fallback
  (design 4.5). A scenario uses it only where no truth field and no
  game-log row can grade the check.

**Steps:**

- [ ] **Step 1: Write the failing tests.** `console-read.test.ts` (fake
  exec): one check gives one `soap gm read group` call with the agent's
  account and one `console.jsonl` row; a partner check uses the partner
  account; a non-zero exit is recorded, not thrown. `draft-fill.test.ts`:
  a matching row fills the check met; a non-matching row fills it unmet
  with the text; a missing row is unmet with the reason.
  `scenarios.test.ts`: a console check loads; a console check without
  `match` is refused. The fake reply text for `group` is built from the
  `group list` handler output (`src/server/scripts/Commands/cs_group.cpp:191`).
- [ ] **Step 2: Run them and see them fail.**
  `mise test packages/harness/src/grader`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass**, then
  `mise ci:checks`.
- [ ] **Step 5: Docs.** Add the `console` source and its `evidence`
  field to `docs/evals.md`, including that it runs only read verbs, and
  add `console.jsonl` to the run-directory table (`docs/evals.md:74-84`).

**Proof:** unit. The first raid eval that uses it is the live proof.

**Commit:**

```
chore: Add a console read as an eval check source

Group, guild and pet state has no truth field yet. A read-only soap gm
command at the end of the run can grade it until the service grows
those fields.
```

---

## Task T-11: Class, death knight and fishing presets

Gate R rulings: none. Coordinator decisions: D-1 to D-4, BR-wave3-5 (plan index). Every preset consumer declares the dependency: `spells-9` and `spells-14` in wave 3, `objects-9` and `session-6` in wave 4.

**Index row:** id `T-11`, unit `tooling`, worktreeUnit `tooling`, phase `3` (label C), codeArea `tooling`, proof `live`, size `M`, deps `T-1`, `T-3`, `T-5`, `T-7c`. It starts at the beginning of wave 3 and needs no `SEED-3` edit (the tasks below depend on it).

**Worktree:** `proto-tooling`, branch `proto/area-tooling`, from `origin/factory/431-wave3`.

**Files:**
- Create: `packages/core/src/wow/char-create.ts` and `char-create.test.ts`
- Modify: `packages/core/src/wow/session.ts` (one export line; rider lease, no other holder in wave 3)
- Modify: `packages/factory/src/soap-presets.ts`, `soap-presets.test.ts`
- Create: `packages/factory/src/soap-create.ts` and `soap-create.test.ts`
- Modify: `packages/factory/src/soap.ts` (448 non-blank; at most 12 new lines, one import and the branch in `createAccount`)
- Modify: `docs/factory.md` (presets list, "Each copies a template..." sentence, new paragraph)
- Not touched: `TCPRESETS`, any template, `soap-gm.ts`, `soap-copy.ts`, `realm-service.ts`, server config, harness grader files. New scenarios and `spawn-slots.ts` entries for the new presets are added by the first scenario that uses one (BR-wave3-3).

**Depends on:** T-1 (names), T-3 (probe), T-5 (`soap gm`), T-7c (`start --packet-trace`); all landed.

**Safety (D-1):** the temporary security level 1 happens only inside `soap create`'s own account-creation step, after the new account is in the ledger, on that account only; no general gmlevel verb and no account-name argument. Raise, open the create connection, send `CMSG_CHAR_CREATE` without `CMSG_PLAYER_LOGIN`, close and await the connection, then demote to 0 and confirm the demotion (read back, e.g. `pinfo` Security 0) on both the success and failure paths. The profile and wrapper are published only after the demotion is confirmed; if it fails or cannot be confirmed, creation fails and the existing delete cleanup runs; if the delete also fails, the task reports that account and stops. Gameplay always uses a fresh connection. If the DK create itself fails on the deployed server (code `0x3b`/`0x3c`), T-11 lands the non-DK presets and records the DK part as not built; spells-9 then takes its drafted mock fallback.

**Preset table (what the builder adds to `presetSpecs` and `presets`):**

| Preset | Kind | Character | Start | Stage through the realm service (in order) |
|---|---|---|---|---|
| `eversong10-priest` | template `Tpleversong` (same character as `eversong10`) | Blood elf priest | Eversong point | none |
| `eversong10-shaman` | create | Orc male shaman (race 2, class 7, gender 0) | Eversong point | `position`, `level` 10, `money` 50000, `items/add` 5175, 5176 (Earth, Fire Totem), `spells/learn` 8042, 8071, 2484, 2075, 8050 |
| `eversong10-warlock` | create | Blood elf female warlock (10, 9, 1) | Eversong point | `position`, `level` 10, `money` 50000, `spells/learn` 688, 172, 348, 980 |
| `eversong10-rogue` | create | Blood elf female rogue (10, 4, 1) | Eversong point | `position`, `level` 10, `money` 50000, `spells/learn` 921, 2983, 6770 |
| `eversong10-druid` | create | Tauren male druid (6, 11, 0) | Eversong point | `position`, `level` 10, `money` 50000, `spells/learn` 8921, 5487 |
| `eversong55-deathknight` | create, temporary level 1 only inside its own create step (D-1) | Blood elf male death knight (10, 6, 0) | Eversong point | `position`, `money` 50000 (no `level`: the character starts at 55) |
| `eversong10-fishing` | template `Tpleversong` plus stage | Blood elf priest | Eversong point | `items/add` 6256, then one online step: log in, `player learn` 7733, wait for the skill, log out (D-4) |

Eversong point is `{ map: 530, x: 8735, y: -6685, z: 70.5, o: 1.686, zone: 3430 }` (`soap-presets.ts:12`, readme). All spell ids above are `[M]` ranks from local `Spell.dbc` (Searing Totem 2075, Stoneskin Totem 8071, Earth Shock 8042, Flame Shock 8050, Earthbind Totem 2484, Summon Imp 688, Corruption 172, Immolate 348, Curse of Agony 980, Pick Pocket 921, Sprint 2983, Sap 6770, Moonfire 8921). Bear Form 5487 is `[M]` in local `Spell.dbc` (effect 6 shapeshift); the builder still checks every id with a throwaway script and drops any that does not exist (the service removes unknown spells at login anyway). Item ids 5175-5178 (Earth, Fire, Water, Air Totem) and 6256 are `[M]` from `item_template.sql`. Appearance bytes are all zero (skin, face, hair style, hair colour, facial hair); `Player::Create` validates them, so the builder checks the zero set live and picks the first valid set per race and gender otherwise.

**Steps (test first; run tests with `mise test <path>`, never `bun`):**

1. **Failing core tests** (`char-create.test.ts`):
   - `buildCharCreate({name, race, class, gender, skin, face, hairStyle, hairColor, facialHair})` writes the cstring name then nine `u8` (the last is outfit 0), as `CharacterHandler.cpp:269-278`.
   - `charCreateResult(0x2f)` is `success`; `0x32` `name_in_use`; `0x33` `disabled`; `0x35` `server_limit`; `0x36` `account_limit`; `0x39` `expansion`; `0x3a` `expansion_class`; `0x3b` `level_requirement`; `0x3c` `unique_class_limit`; `0x3e` `restricted_raceclass`; `0x30` `error`; `0x31` `failed`; other codes `code_0x..` (`SharedDefines.h:3623-3643`).
   - `createCharacter(config, auth, spec)` over `startMockWorldServer` (`test-support/mock-world-server.ts:359`): it sends `CMSG_CHAR_CREATE` after admission, the test reads it with `waitForCapture` and answers with `inject(SMSG_CHAR_CREATE, [0x2f])`; the function resolves `{ result: "success" }`, rejects with the reason name for any other code, and closes the socket. It never sends `CMSG_PLAYER_LOGIN`. See them fail.
2. **Implement** `char-create.ts`: `createCharacter` uses `createWorldConn`, `connectWorld`, `authenticateWorld` (`client-connection.ts:83,249,311`), `sendPacket` and `conn.dispatch.expect(SMSG_CHAR_CREATE, {timeoutMs})`; unhandled login notices are only counted (`protocol/world.ts:172-219`), not thrown. Export `createCharacter`, `buildCharCreate`, `charCreateResult`, `CharCreateSpec` from `session.ts` (shells may import only `@peon/core/session`, SEED3-7 of the pets draft). Add a one-line wire note in the file's test, not a comment in code.
3. **Failing factory tests** (`soap-presets.test.ts`, `soap-create.test.ts`; behavioural only, BR-wave3-5):
   - The usable preset for each new name is selected (seven new names join `presets` and `presetSpecs`); language Horde for all new (`presetLanguage` = 1); the DK spec has no `level` stage and its start is the Eversong point; `templateFor` still resolves `eversong10-priest` and `eversong10-fishing` to `Tpleversong`.
   - With injected fakes (`run` for SOAP, `createCharacter`, a service double with `char(name, endpoint, body)`, `sleep`): for a created preset the character is created with the right race, class and name; the staged state is observable through the service double in table order; no command or service call in any created-kind preset contains `TCPRESETS`, `pdump` or `Tpl`; for the DK the privilege is restored (demotion confirmed, success and failure paths) and a failed demotion fails creation; a non-success result fails with the reason name; a failure of the fishing online step fails creation.
4. **Implement** `soap-presets.ts`: `PresetSpec` becomes a union `Base & { template: string; stage?: readonly Stage[] }` or `Base & { create: CharCreateSpec; stage: readonly Stage[]; gmLevelForCreate?: 1 }`; `Stage = { endpoint: CharEndpoint; body: Json } | { online: { learn: readonly number[] } }`. Keep `templateFor` for template kinds only. Implement `soap-create.ts`: `createByProtocol`, `stagePreset`, `learnOnline` (uses `authWithRetry`, `worldSession` from `@peon/core/session`, `consoleCommand` from `soap.ts` for `player learn <C> <spell>`, waits until `handle.getEntity(self)` shows skill 356 in `PLAYER_SKILL_INFO` (offset 636, `update-fields.ts:276`), then `handle.logout()` and awaits `closed`). `createAccount` branches on the spec kind and keeps the existing cleanup on failure. A missing `PEON_REALM_SERVICE` fails with the message `serviceUrl` already writes, only for created kinds. `soap.ts` stays under 470 non-blank.
5. **Docs**: `docs/factory.md` lists the seven names, says template presets copy from `TCPRESETS` (read only) and created presets are built over the protocol, names the service `reset` limit (see Proof), and records that `Tplhunter` has a level 10 Ravager (entry 17525) (SEED3-8 of the pets draft: no hunter build).
6. `mise test packages/core/src/wow/char-create.test.ts packages/factory`, `mise typecheck core`, `mise typecheck factory`, `mise ci:checks`.

**Proof (live, each account deleted with `mise factory soap delete <ACCOUNT>`, also on failure):**
1. For each created preset: `mise factory soap create <preset>`; `mise factory soap truth <ACCOUNT>` shows the expected race, class, level (10, or 55 for the DK), the Eversong position within 16 yd, money 50000, the staged items and spells; `mise factory soap gm <ACCOUNT> read pinfo` shows Security 0 for the DK. Then `tmp/puppet-<ACCOUNT> start --json` and `read --json` (or `mise protocol:probe <ACCOUNT> --flow login`) logs in without a disconnect and shows the class and spells. Report the ids that `Spell.dbc` or the live login dropped.
2. DK: record the `SMSG_CHAR_CREATE` code; if the deployed config or RBAC differs from the repo defaults (code `0x3b` or `0x3c`), land the non-DK presets and record the DK part as not built (spells-9 takes its mock fallback).
3. Fishing: after create, log in and read the skill triple for 356 from `handle.getEntity(self).rawFields` (throwaway script, deleted afterwards), equip the pole, cast Fishing (7620) at water near Eversong; report whether a bobber appears. `soap truth` shows item 6256 and spell 7620.
4. Hunter pet: `soap create eversong10-hunter`, `soap gm <ACCOUNT> read pet` shows the Ravager (entry 17525) in slot 0; record it in the report (no code change).
5. Service `reset` (`POST /account/<A>/reset {"preset":...}`) copies a `TCPRESETS` template and so does not know the created presets: record that the eval runner does not call it (`grep` in `packages/harness/src/grader` finds no caller `[M]`).

**Commit:**

```
feat: Build class and fishing presets
```

Body: "Workers could only test the classes that had a template character. `soap create` now creates the shaman, warlock, rogue, druid, death knight and fishing characters over the protocol on the new account and stages them through the realm service, so no template is added or changed. `spells-9`, `spells-14`, `objects-9` and `session-6` consume the presets."

## Deferred (not built by this unit)

- **Layout comparator** (N21, design 4.7): not built. A regex extractor
  cannot type 29 % of the AzerothCore write lines, so it would give false
  confidence.
- **Realm-service fields** (design 4.5): taxi nodes, talents and glyphs,
  group layout, guild, pets, instance binds, achievements, rest and
  explored zones. One batch request to the maintainer, who owns the
  service; not a worker task. Areas prove these through packet evidence
  until then.
- **GM chat path** (design 4.3): not built; it needs a maintainer ruling,
  and no area depends on it.

## Dead opcodes

None. This unit owns no opcode.

## Build rulings

- **BR-T-10-1.** Coordinator ruling for T-10 (not yet ruled by the
  maintainer): T-10 may edit `packages/harness/src/grader/result.ts`
  (`EvalCheck.source` becomes `ScenarioCheck["source"]`),
  `packages/harness/src/grader/eval-result.schema.json` (adds `"console"`
  to the check source enum) and
  `packages/harness/src/grader/result.test.ts` (the expected enum
  message), because its console checks need them and typecheck fails
  without them. The contract 2.2 row T-10 gains these three files.
- **BR-T-11-1.** Coordinator ruling for T-11 (P2-17): creating
  presets through `soap.ts` made an import cycle between `soap.ts` and
  `realm-service.ts`. T-11 may move `factoryAccount` into a new owned
  module `packages/factory/src/factory-account.ts` and change the import
  lines of `soap.ts`, `soap-copy.ts`, `realm-service.ts` and
  `soap-service-cli.ts` to it, with no other edit to those three files.
  Everything else of the created-preset path lives in the owned
  `soap-create.ts`; `soap.ts` keeps only the import and the branch in
  `createAccount` and stays under 480 non-blank lines.
- **BR-T-11-2.** Coordinator ruling for T-11 (P2-17): the death knight
  create returns `0x31` on the deployed server, not the `0x3b`/`0x3c`
  the safety terms name. The not-built fallback applies to any server
  refusal that is substantiated, not only those two codes: a retained
  trace of the final preset's own `CMSG_CHAR_CREATE` body (valid factory
  name) and its `SMSG_CHAR_CREATE` reply, plus the AzerothCore source path
  that returns that code and the deployed setting or data that takes it
  (read only, never changed). An unexplained failure or a client-side
  defect is not a fallback. The fishing proof needs one fresh preset with
  the skill-356 triple read, the pole equipped and one cast of 7620 at
  water, reporting whether a bobber appears.
- **BR-T-11-3.** Coordinator ruling (P2-17): after three fix rounds and
  a rescue round, the fifth review still finds three gaps: the deployed
  setting behind the death knight's `0x33` (`CHAR_CREATE_DISABLED`)
  refusal is not observed (only shipped defaults are cited), the fishing
  cast and the full skill triple are not in a retained trace, and the
  trace option added to `soap.ts` and `soap-cli.ts` is outside the
  files BR-T-11-1 grants. T-11 is parked (branch
  `factory/431-wave3-parked-T-11`) with these findings listed in the
  wave PR. Its dependents need its presets, not its code: spells-9 takes
  its drafted mock fallback for the rune opcodes (SR3-spells-9) and
  spells-14 its "Not shown" fallback for the totem scenario
  (SR3-spells-15), and neither waits for T-11.

## COMPLETE

## Seed rulings (SEED-4)

Wave 4 slice (BR-wave4-1): T-11. The coordinator's SEED-4 agents drafted these rows against `factory/431-wave4` at `851d14fc` and AzerothCore; each is a coordinator ruling (P2-17) and the maintainer may reverse any at PR review. Marks: `[M]` read or measured, `[INFERENCE]` not observed. Paths without a prefix are under `packages/core/src/wow/`; `h:` is `packages/harness/src/`, `dev:` `packages/devtools/src/`, `cts:` `packages/core/test-support/`. "Finding <n>" names a finding of the same draft below.

| Id | Plan text or question | Ruling | Status |
|---|---|---|---|
| SR4-tooling-1 | T-11 review4 finding 3: `fac:soap.ts:363-370` (`traceSink`, `appendFileSync`/`mkdirSync` imports) and `fac:soap-cli.ts:32-33` (`--trace-create`) are outside BR-T-11-1 (`soap.ts` may only import and branch in `createAccount`). [M] holds on the picked tree: `soap.ts` 479 non-blank, `CreateOptions.traceCreateDir`, `traceSink` at the old lines, `soap-cli.ts` `"trace-create"` option and `traceCreateDir: traceCreate`. | Coordinator grants the flag (P2-17), amending BR-T-11-1 for this wave: (a) move the sink into `fac:soap-create.ts` as `createTraceSink(dir)` (the `node:fs` imports go with it); (b) `soap.ts` keeps only the `traceCreateDir` field of `CreateOptions`, passing it to `createWired` (three lines), and loses the `node:fs` import and `traceSink` (net about -10 lines, so well under 480); (c) `soap-cli.ts` keeps `--trace-create <dir>` (one option, one passthrough) because BR-T-11-2 requires a retained create trace and no other caller can write one; (d) the new sink test goes into a new `fac:soap-create-trace.test.ts` (`soap-create.test.ts` is at 444). The flag is documented in `docs/factory.md` (one sentence, in the create paragraph). | coordinator ruling (P2-17) |
| SR4-tooling-4 | `docs/factory.md:73-81` says `eversong55-deathknight` is "built over the protocol" and the paragraph on trace flag is missing. [M] | Whichever of SR4-tooling-2's options is chosen, the paragraph must match it; under (A) it says "selectable; the realm refuses its create with `0x33` (module gate, see SR4-tooling-2)" and `soap create eversong55-deathknight` must exit non-zero with the server code in the message and the confirmed demotion + account deletion (already tested in `soap-create.test.ts`). The `docs/protocol-coverage/core.md` rows for `CMSG_CHAR_CREATE`/`SMSG_CHAR_CREATE` keep `live` for the non-DK classes and name the retained trace for `0x33`. | coordinator ruling (P2-17) |
| SR4-tooling-5 | T-11 file list in the plan (`tooling.md:909-935`, index row T-11): `core:char-create.ts`, `session.ts`, `fac:soap-presets.ts`, `soap-create.ts`, `soap.ts`, `docs/factory.md`. | The picked tree also changes `fac:factory-account.ts` (new, BR-T-11-1), `realm-service.ts`, `soap-service-cli.ts`, `soap-cli.ts` (SR4-tooling-1) and `docs/protocol-coverage/core.md`. Owner list for the index row = those plus the tests. No other slice task edits these files [M: slice rows grep]. `core:session.ts` lease: nobody else holds it in this wave. T-11 is a leaf task; no consumer in this slice waits for it (spells-9/-14 use their ruled fallbacks; objects-9 and session-6 are outside the slice). | coordinator ruling (P2-17) |
| SR4-tooling-2 | T-11 review4 finding 1 / BR-T-11-2: the death knight create returns `0x33` `CHAR_CREATE_DISABLED`; the bar asks for "the deployed setting or data that takes it (read only)". Retained: `.../wave3/artifacts/tooling/dk5/packets.jsonl` has out `CMSG_CHAR_CREATE` (opcode 54) body `46676b6c6e6d6d62656a63000a0600000000000000` (name, race 10, class 6, gender 0) and in `SMSG_CHAR_CREATE` (opcode 58) body `33` [M]. | **Source path is now fixed to one candidate (new evidence), the deployed value cannot be read from here (finding 7).** Chain [M]: `CHAR_CREATE_DISABLED` is sent at `Handlers/CharacterHandler.cpp:286` (team mask, `CharacterCreating.Disabled`), `:329` (`CharacterCreating.Disabled.RaceMask`), `:339` (`...ClassMask`), and `:436` (script hook `sScriptMgr->CanAccountCreateCharacter`). The factory raises the DK account to security 1 before the create (D-1); level 1 maps to role 194 (`data/sql/base/db_auth/rbac_default_permissions.sql`: `(1,194,-1)`), and role 194 links permissions 14, 15, 16 and 18 (`rbac_linked_permissions.sql:58-62`: skip team mask, class mask, race mask, DK level check; `rbac_permissions.sql:48-52`). So at security 1 the three config-mask paths (`:282`, `:327`, `:335`) are skipped, and the only remaining `0x33` is `:434-437`. The only `CanAccountCreateCharacter` override in the deployed tree is `modules/mod-individual-progression/src/IndividualProgressionPlayer.cpp:1326-1360`: it refuses a death knight when `IndividualProgression.DeathKnightUnlockProgression` (code default 13, `IndividualProgression.cpp:1057`; `individualProgression.conf.dist:299`) is non-zero and the account's highest rewarded progression quest (`GetAccountProgression`, `IndividualProgression.cpp:128-150`) is below it; accounts matching `BotAccountsRegex` (`^RNDBOT.*`) or `ExcludedAccountsRegex` (default empty) pass. A fresh factory account has no progression quest, so the refusal is the module's DK gate; the deployed value of `DeathKnightUnlockProgression` and `ExcludedAccountsRegex` is `[INFERENCE]` (shipped defaults). Do not claim an observed setting. | DESIGN answered: option A. The death knight preset stays selectable, its create fails with a clear error, and the docs state what was observed (the `0x33` trace, the source chain to the module hook) and that the deployed setting is unobserved. The PR asks the maintainer for option B or a module config change; T-11 does not wait for it. coordinator ruling (P2-17) |
| SR4-tooling-3 | T-11 review4 finding 2: `fac:soap-presets.ts:90-96` `eversong10-fishing`; the six retained `tmp/probe/FAC6ABDC8789C-*` traces hold no outgoing `CMSG_CAST_SPELL` and no `SMSG_CAST_FAILED`; the reported skill read (offset 681, value 65892) is only the packed id/step word. [M] spec at `soap-presets.ts:90-96` is `stage: [{online:{learn:[7733]}}, item(6256)]`. BR-T-11-2 needs: skill-356 triple read, pole equipped, one cast of 7620 at water, bobber yes/no. | Redo the proof once, with bodies retained. Staging reachable [M]: `mise factory soap create eversong10-fishing` (map 530, Eversong, nav data present); a puppet started with `--packet-trace bodies` writing to a directory the run keeps (`tmp/probe/<account>-<stamp>/`, copied to `tmp/fishing7620/` for the doc citation); equip the pole with the `items-move` probe flow (`CMSG_AUTOEQUIP_ITEM_SLOT`, the pole is added after the offline stage as `items/add 6256`); stand at water with `soap gm tele` on the run's own character (a game_tele row, `soap-gm.ts:76-79`, name regex `[A-Za-z0-9_]{1,40}`) or by walking on map 530; send the cast with the spells probe/puppet call. Retain: (1) the full skill triple from the login `SMSG_UPDATE_OBJECT` / later update: `PLAYER_SKILL_INFO_1_1 + 3*slot` words: `skill|step<<16`, `value|max<<16`, `bonus` (`Entities/Player/Player.h:79-81`, `Player.cpp:5570-5590` per the review; re-read before citing) — print all three words, not the first; (2) the `CMSG_EQUIPITEM`/autoequip row and a `soap truth` showing 6256 in slot 15; (3) the outgoing `CMSG_CAST_SPELL` for 7620 and the `SMSG_SPELL_START`/`SMSG_SPELL_GO`/`SMSG_CAST_FAILED`/`SMSG_CHANNEL_START` rows after it, and whether a `GAMEOBJECT` create for the bobber (type 17 fishing node) arrives in the next updates. The 7620 cast with no water in front fails (`SPELL_FAILED_...`); that failure is a legal answer only if a second try at water is retained. Two tries (BR-wave3-6); a missed bobber is reported as observed, not an error. If the `items-move` equip leaves the pole in the bag again (report round 3: slot 34 held entry 4566 after the second equip, a probe-flow bookkeeping defect in another unit), equip with the raw `CMSG_AUTOEQUIPITEM` through `raw`/the objects act and say so. | coordinator ruling (P2-17) |

### Findings behind the SEED-4 rulings

From the `resume-misc` draft:

| Task | Picked | Result |
|---|---|---|
| T-11 | 10 of 10 | clean |
| items-9 | 10 of 10 | clean |
| social-14 | 9 of 9 | clean |
| vehicles-4 | 17 of 17 | clean |
| vehicles-7 | 17 of 17 | clean (alone) |
| group-11 | 11 of 11 | 4 textual conflicts, all in `docs/capabilities.md` (commits 42c397f9, 36def1be, 8219670f, f02ad533): the summon capability-gap bullet lands at the same spot as main's new bullet "Changing seats, riding with another player and ejecting a passenger" (line 102 at the tip). Resolution: keep main's bullet and group-11's newest summon bullet only (each later commit rewrites the earlier summon bullet). End state: lines 102-103 of `docs/capabilities.md`. |
| all six in order T-11, items-9, social-14, vehicles-4, vehicles-7, then group-11 | stops at vehicles-7 | vehicles-4 + vehicles-7 conflict for real (finding 1). With vehicles-7 left out, group-11 adds the same 4 `docs/capabilities.md` conflicts and nothing else; social-14 and group-11 each append to `docs/evals.md` / `grader/scenarios.ts` cleanly. |

- **Finding 2.** **Sizes at the tip and after each branch (non-blank, `grep -cv '^\s*$'`) [M]:** `core:control-sync.ts` 461 base / 465 v4 / 442 v7; `control.ts` 361 / 381 / 368; `control-ride.ts` 118 / 234 / 179; `self-store.ts` 94 / 107 / 101; `core:areas/items/store.ts` 452 base / 462 items-9; `core:areas/selfstate/store.test.ts` 378 / **480** after vehicles-4; `fac:soap.ts` 479 after T-11 (cap 480, BR-T-11-1); `fac:soap-create.test.ts` 444; `h:tools/social.ts` 399 base and 403 after social-14; `core:areas/lfg/runtime-group.test.ts` 483 at the base already (vehicles-7 edits only an in-place line). Consequences: vehicles-7 must land its control-sync work as sibling files (it already has `control-sync-transfer.ts`, 90 lines); items-10 and items-11 have 18 lines left in `items/store.ts` between them (they must add siblings, as items-9 did with `store-sets.ts`); self-state-8 must put any test into a new file because `selfstate/store.test.ts` is at 480; T-11's new trace test goes into a new file. Affects: vehicles-7, items-10, items-11, self-state-8, T-11.
- **Finding 3.** **Verification runs (scratch clone, deleted after).** Ruled-area tests on the picked trees: items sets/overlap/store 32 pass; social-emote + emotes area 60 pass; vehicles transport-ride + transports area 71 pass; group summon + meeting-stone 20 pass; factory soap-create + soap-presets pass in the wave worktree (the scratch run of those two files imports `#wow/session` from the wave worktree via an `@peon/core` workspace link, so it picks up the pre-T-11 session without `createCharacter`; their CI artifact ran on the real branch). The vehicles-4 unroot-ACK defect was reproduced with a throwaway test on the picked tree (ACK carried ROOT, `movementAllowed` true), the 4-line `setMover` fix cleared the ACK bit, and `bun test packages/core/src/wow/control` passed 220/220 on the scratch fix; the file was left unmodified.
- **Finding 6.** **No task of this group reads a DBC through `ctx.dbc`** [M, `git diff | grep ctx.dbc` = 0 for all six]; no `docs/harness.md` DBC row and no `REQUIRED_DBC_FILES` entry is needed. (The DBC facts used in SR4-group-1 were read by a throwaway script from `/home/deity/wow-data/dbc/Spell.dbc`.)
- **Finding 7.** **The deployed server's config is not readable from here.** [M] No worldserver process or `worldserver.conf`/`individualProgression.conf` exists on this host (`find /`, `ps`); `~/.config/peon-factory/soap.env` points at host `t1` (`PEON_SOAP_URL=http://t1:7878/`); `ssh t1 <cmd>` connects but returns exit status 1 with no output for every command (restricted account), and AzerothCore has no console command that prints a config value (`Commands/cs_server.cpp` has `server info`/`server set` only; the module's `.ip get|set` read or write progression data, not the setting). Affects: T-11 (SR4-tooling-2).
- **Finding 9.** **Findings that still hold at 851d14fc, one line each:** items-9 (SR4-items-12), social-14 (SR4-social-1/-2), vehicles-4 (SR4-vehicles-2, reproduced), vehicles-7 (SR4-vehicles-4), group-11 (SR4-group-1), T-11 (SR4-tooling-1/-2/-3). Nothing in a review's findings is stale; only BR-social-14-1's answer (the reviewer's "ruling freshness" note) is already on the tip.
