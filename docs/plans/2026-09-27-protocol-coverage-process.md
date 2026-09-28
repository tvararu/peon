# How the protocol coverage run was built

This is the process record of item 4, protocol coverage (issue #426,
draft PR #430): how many dynamic workflows ran, what each one did, how
the work iterated, and what went wrong. The design
([design](2026-09-27-protocol-coverage-design.md)) holds the decisions
and, in its section 8, the build record. The plan
([plan](2026-09-27-protocol-coverage-plan.md)) holds the tasks. This
file holds the method. It follows the record of the Pi harness epic
([Pi epic process](../archive/2026-09-26-pi-harness-epic/process.md)), and
section 7 compares the two.

## 1. Summary

- **Dates.** The session started on 2026-09-27 at 20:25 UTC. The
  maintainer set the goal at 21:18 UTC and went to bed at 21:30 UTC. He
  came back at 07:24 UTC and cleared the goal at 07:26 UTC. The wrap-up
  run ended at 07:40 UTC, about 11.25 hours after the start. The
  coordinator worked on its own for the 9.9 hours in between.
- **Result.** About 60 of the plan's 263 tasks landed on draft PR #430
  (head `3cbbb317`, `mise ci` 4390 pass): phase R 1 of 1, phase 0 20 of
  20, wave 1 39 of 73. Waves 2 to 4 did not start. Coverage went from
  266 handled opcodes on `main` to 373 at the tip (section 6).
- **Harness.** Claude Code ran the whole item in one session. The dev
  factory was off.
  - Coordinator: Opus 5.5 at `ultracode` effort (the `/model` output at
    20:25 UTC says so). At 09:25 UTC, after the run, the maintainer set
    it to medium effort for the follow-up work.
  - Subagents: every workflow agent and every Agent-tool agent ran on
    Opus 5.5 at medium effort (R4). Each `agent()` call passed
    `{ model: 'opus', effort: 'medium' }`.
  - Eval grading: Muse Spark 1.3 contributor through
    `omp -p --model opencode-go/muse-spark-1.3-contributor --thinking
    xhigh --no-session` (R10). It graded eval round 0 and the round 11
    session runs. Its token use could not be determined: omp reports no
    usage into the Claude Code transcript.
  - Approver: the Claude Code `advisor` tool (6 calls, 5 results in the
    transcript). It approved the
    design in the maintainer's place with four conditions, and the plan
    with three (R14). The advisor setting is `fable`; the transcript
    holds only redacted advisor results, so which model answered could
    not be determined.
- **Totals.** The totals exclude the agent that wrote this file
  (`af96c2530d2ab9c62`).

| Measure | Value |
|---|---:|
| Workflow launches | 17 |
| Distinct workflow runs (run ids) | 16 |
| Distinct workflow script names | 13 |
| Agents started (journal `started` lines) | 356 |
| Launches with a usage record | 14 |
| Agents counted in usage records | 199 |
| Subagent tokens, usage records | 34,035,736 |
| Subagent tool uses, usage records | 7,931 |
| Sum of run durations, usage records | 36,894 s (10.2 h) |
| Launches with no usage record (stopped) | 3 |
| Agents in those launches (transcripts) | 159 |
| Subagent tokens in those launches (estimate) | about 24.3 M |
| Subagent tool uses in those launches (transcripts) | 6,582 |
| Workflow tokens, recorded plus estimate | about 58.4 M |
| Agent-tool agents, finished (2) | 284,669 tokens, 47 tool uses |
| Agent-tool agent still running (test speed) | could not determine |
| SendMessage fork of a workflow agent (1) | about 0.26 M tokens, 7 tool uses |

Three launches have no usage record because they were stopped:
`wf_66a1ef0d-a6a` (the first design run), the first launch of
`wf_1f5fe44d-3fa` (wave 1, before its resume) and `wf_b3719fee-765`
(the wave 1 relaunch, stopped when the maintainer cleared the goal).
The last is the largest run of the item, so the usage records alone
cover only about 58% of the tokens. For these runs the tool uses are
measured and the tokens are an estimate (see below). The sum of run
durations is larger than the session span because runs overlapped. It
is not wall time. Coordinator tokens are not in these numbers; the
coordinator's context stood at 620.7k of 1M tokens at 09:25 UTC.

**Where the numbers come from.** The usage blocks are in the
`<task-notification>` messages in the coordinator's transcript
(`~/.claude/projects/<project>/<session>.jsonl`), as in the Pi epic.
[`workflows/tally.ts`](2026-09-27-protocol-coverage/workflows/tally.ts)
reads the transcript for each `Workflow` and `Agent` launch and each
`SendMessage`, their task ids, run ids and completion notices. It
counts the `started` lines in each run's journal
(`<session>/subagents/workflows/<run>/journal.jsonl`). For a launch with
no usage record it reads the agent transcripts in the run directory
(`agent-<id>.jsonl`) whose first turn falls inside that launch. It sums
each agent's last-turn context (input, output and both cache fields) as
the token estimate, and counts distinct `tool_use` ids. The method is
checked against runs that do have a record: the tool-use count matches
exactly on `wf_ad3b03c0-1d2` (1442), `wf_076184aa-88d` (1660) and the
wave 1 resume (170), and the token estimate is 0.2% to 13% above the
recorded value on six runs. Run it on the machine that holds the
session:

```sh
cd docs/plans/2026-09-27-protocol-coverage/workflows
bun tally.ts af96c2530d2ab9c62
```

The arguments name runs or agents to exclude. The last line of the
output is the totals object; the other lines are one row per launch,
marked `record` or `estimate`.

## 2. Timeline

All times are UTC, from the transcript's tool-call times and the git
committer times. The coordinator's notes use BST (UTC+1).

1. **Brief and research launch** (09-27 20:25 to 20:30). The
   coordinator read the item brief and launched `protocol-coverage-recon`
   (5 researchers, a synthesiser, 3 verifiers). At 20:29 it cloned a
   restricted-license reference client beside the other reference
   repos and launched a second research run: 3 researchers and a
   verifier on that client's structure and on the harness verb and
   eval recipe.
2. **Grilling and rulings** (20:35 to 21:15). The coordinator reported
   the research as it came in and asked the maintainer one question per
   message. His answers became rulings R1 to R22 in the coordinator's
   notes: one large draft PR (R1), the restricted-reference rule (R5),
   scope of all 610 server-relevant opcodes (R7), the proof bar (R9),
   Opus for code and Muse for watching (R10), no code until item 6
   merges (R3, R11), GM staging on own accounts (R12), advisor approval
   overnight (R14), build order (R15), no fixed usage ceiling (R16), one
   batch of questions then a goal (R18, R19), more tools allowed (R20),
   mock-server proof when the server cannot be made to send an opcode
   (R22).
3. **Goal and issue** (21:14 to 21:30). The coordinator proposed the
   goal text at 21:14. The maintainer set it at 21:18. Issue #426 opened
   at 21:19, in Backlog. The maintainer went to bed at 21:30.
4. **Design panel** (21:22 to 23:06). `protocol-design` started at
   21:22 and was stopped at 21:38 (section 5). `protocol-design-v2`
   ran from 21:39 to 23:02: 3 structure designs, a judge, 2 verifiers,
   20 area designs, a tooling design and an integrator. The design
   (3960 lines, 45 code areas, 212 build tasks, 14 new tools, 82 eval
   scenarios) landed as `25886a44` at 23:03. Draft PR #430 opened at
   23:04. Gate: the advisor approved it at 23:05 with four conditions
   (`9f5a1f22`).
5. **The item 6 gate** (21:02 to 22:22). A shell watcher
   ([`watch-item6.sh`](2026-09-27-protocol-coverage/workflows/watch-item6.sh))
   woke the coordinator on each item 6 event. Item 6 merged #421
   (21:02), #422 (21:09), #425 (21:27), #428 (21:40) and #429 (about
   22:00), and removed its worktree about 22:10. The coordinator
   fast-forwarded to `71fba0ab` by 22:22. Gate: R3 and R11 open.
6. **Early build and plan** (23:06 to 00:59). `protocol-plan` wrote the
   contract, 23 unit files, the plan and the task index, ran two
   verifiers and a fix-up agent (23:06 to 00:56). In parallel,
   `protocol-tooling-build` (23:07 to 00:02) wrote the R0 re-baseline
   report and landed the five proof tools T-1 to T-5 (`4811fd0f` to
   `02b83919`). An Agent-tool agent applied R0's 8 design edits
   (`91780c8e`). The plan landed as `c60663ef` at 00:57 (263 tasks:
   phase R 1, phase 0 20, waves 1 to 4 73, 39, 47 and 83). Gate: the
   advisor approved it at 00:58 with three conditions.
7. **Phase 0** (00:59 to 03:22). `protocol-pre-step0` applied the
   conditions: 12 contract amendments in the design (`5ddd356c`) and 42
   Gate R rulings GR-1 to GR-42 (`f3cb40a9`). The phase 0 build ran from
   01:13 to 03:19 and landed 12 tasks (17 of 20 with T-1 to T-5). In
   parallel, `protocol-rule-wave1` wrote 191 seed rulings and 46 lease
   lines (`26d91c7a`), an Agent-tool agent synced `index.json` (25 new
   dependencies), and eval round 0 ran (01:39 to 01:53, Muse graded).
   `protocol-phase0-finish` ruled S0-5 and T-10 and landed S0-4, S0-5
   and T-10 (`564566a3`, 03:21). Gate: phase 0 20 of 20, ci 3630 pass.
8. **Wave 1** (03:22 to 07:27). The wave 1 build seeded 19 code areas
   (SEED-1, `ae999799` to `61904581`, 03:40 to 03:44), then ran the
   `threat-1` pilot. The pilot stalled on rare opcodes, and the run was
   stopped and resumed at 04:38 with a rare-event cap. The resume ended
   at 05:30 with 0 of 73 landed on a probe bug. `protocol-threat-finish`
   fixed the probe (`baeb751f`) and landed `threat-1` (`23f8d0e5`,
   05:36). The relaunch `wf_b3719fee-765` ran all wave 1 units from
   05:38 and landed 37 tasks in 25 batches (`e7a68132` to `ef661dbf`).
   `protocol-record` wrote design section 8, a PR comment and the
   morning summary (06:48 to 07:03, `f537a9f7`).
9. **Stop** (07:24 to 07:40). The maintainer came back at 07:24 and
   cleared the goal at 07:26: finish what is in flight, then review.
   The coordinator stopped `wf_b3719fee-765` at 07:27 and launched a
   wrap-up run for the four tasks in flight. `combat-log-6b` landed
   (`3cbbb317`, 07:31). `quests-1`, `self-state-2` and `combat-log-7a`
   are built and reviewed but wait on one coordinator step each.
10. **After the run** (09:25 onwards). The maintainer asked how fast
    the tests are. `mise test` takes 5.7 s on the PR branch against
    0.9 s on `main` (section 5). An Agent-tool agent started on the fix
    at 09:29 and was still running when this record was written.

## 3. Every workflow run

Tokens are subagent tokens. Duration is the run's own duration from its
usage record. "Agents" is journal starts / usage count. Rows marked
**est** have no usage record: tokens are an estimate, tool uses and
agents are counted from the agent transcripts, and duration runs from
the first to the last agent turn. **B** marks a run of the build
scheduler (`protocol-build`, args `phases`, `tag`, `landed`, `only`,
`seed`).

| Start | Run id | Script | Purpose | Agents | Tokens | Duration | Tool uses | Outcome |
|---|---|---|---|---:|---:|---:|---:|---|
| 09-27 20:27 | `wf_3790fcc0-534` | protocol-coverage-recon | Inventory, runtime evidence, hub files, recipe cost, gameplay priority; synthesis; 3 verifiers | 9/9 | 2.45 M | 58 min | 790 | 610 server-relevant opcodes, 48 dead; 20 areas; corrections to ammo, taxi, boats, Warden |
| 09-27 20:30 | `wf_b050b8f8-759` | reference-and-harness-recon | Structure of the restricted reference client; harness verb and eval recipe; verifier | 4/4 | 1.38 M | 41 min | 513 | Notes for the design panel only; nothing durable names the client |
| 09-27 21:22 | `wf_66a1ef0d-a6a` | protocol-design | First design run | 24/- | ~4.14 M est | 16 min est | 942 est | Stopped: 10 of 24 agents refused the task; 10 finished designs kept |
| 09-27 21:39 | `wf_076184aa-88d` | protocol-design-v2 | 3 structures, judge, 2 verifiers, 20 areas, tooling, integrator | 28/28 | 6.92 M | 84 min | 1660 | Design `25886a44`; full-area-modules won with 20 grafts |
| 09-27 23:06 | `wf_ff6acc11-18c` | protocol-plan | Contract, 23 unit files, plan and index, 2 verifiers, fix-ups | 28/28 | 7.47 M | 110 min | 1431 | Plan `c60663ef`, 263 tasks |
| 09-27 23:07 | `wf_c41106f3-236` | protocol-tooling-build | R0 re-baseline, then T-1 to T-5 in three lanes | 22/22 | 2.62 M | 55 min | 689 | 5 tools landed, head `02b83919`; R0 report with 8 edits |
| 09-28 00:59 | `wf_b66dd71d-d38` | protocol-pre-step0 | Advisor conditions: amendments, phase 0 rulings, tooling check | 2/2 | 0.39 M | 14 min | 102 | `5ddd356c`, `f3cb40a9` (GR-1 to GR-42) |
| 09-28 01:13 | `wf_ad3b03c0-1d2` | protocol-build **B** | Phase 0: step 0 and T-6 to T-10 | 49/49 | 5.97 M | 125 min | 1442 | 12 landed (17 of 20); S0-5, T-10 blocked; S0-4 held |
| 09-28 01:14 | `wf_f361ab47-b5f` | protocol-rule-wave1 | 17 unit rulers and a commit agent | 18/18 | 3.09 M | 23 min | 642 | `26d91c7a`: 191 seed rulings, 46 lease lines |
| 09-28 01:39 | `wf_78ddfebf-a55` | protocol-eval | Eval round 0: 4 scenarios, Muse graders, cluster | 6/6 | 0.50 M | 14 min | 65 | 3 of 4 pass; t3 fail is the gray-mob baseline |
| 09-28 03:20 | `wf_5bfc77ef-c76` | protocol-phase0-finish | Rule S0-5 and T-10, re-review, land | 5/5 | 0.39 M | 2 min | 28 | S0-4, S0-5, T-10 landed; phase 0 20 of 20 |
| 09-28 03:22 | `wf_1f5fe44d-3fa` | protocol-build **B** | Wave 1, first launch (task `wcv2pfndg`): setup, SEED-1, threat-1 pilot | 3/- | ~1.02 M est | 74 min est | 273 est | SEED-1 landed; stopped at 04:38 |
| 09-28 04:38 | `wf_1f5fe44d-3fa` | protocol-build **B** | Wave 1, resume (task `w62sgbfq9`) with the rare-event cap | 4/6 | 0.54 M | 52 min | 170 | 0 of 73: threat-1 fix blocked by the probe bug |
| 09-28 05:31 | `wf_3d1bc31d-a66` | protocol-threat-finish | Probe fix, threat-1 rerun live, review, land | 3/3 | 0.29 M | 7 min | 42 | `baeb751f`, `23f8d0e5` |
| 09-28 05:38 | `wf_b3719fee-765` | protocol-build **B** | Wave 1 relaunch, all units (tag `wave1b`) | 132/- | ~19.19 M est | 109 min est | 5367 est | 37 landed in 25 batches; stopped at 07:27 |
| 09-28 06:48 | `wf_9d542c5c-42a` | protocol-record | Collect facts, write design section 8, PR comment, morning summary | 2/2 | 0.35 M | 15 min | 72 | `f537a9f7` |
| 09-28 07:27 | `wf_68beba31-9a7` | protocol-build **B** | Wrap-up, `only` the 4 tasks in flight | 17/17 | 1.67 M | 13 min | 285 | combat-log-6b landed (`3cbbb317`); 3 wait on the coordinator |

Agents started outside workflows, with the Agent tool:

| Start | Agent | Purpose | Tokens | Duration | Tool uses | Outcome |
|---|---|---|---:|---:|---:|---|
| 09-28 00:03 | `ac3a4d5c0f292b9d7` | Apply R0's 8 design edits | 0.09 M | 1 min | 20 | `91780c8e` |
| 09-28 01:38 | `a2b48bba4c671a838` | Sync `index.json` with the wave 1 rulings | 0.19 M | 9 min | 27 | 25 dependencies added |
| 09-28 04:36 | `a08ea55017ed7683b` (fork) | Unintended copy made by `SendMessage` to the threat-1 builder | ~0.26 M est | 1 min | 7 | Stopped; also interrupted the original |
| 09-28 09:29 | `a1da24bc5f3f820f7` | Make `mise test` fast again | could not determine | - | - | Running when this record was written |

The wave 1 run id `wf_1f5fe44d-3fa` has 7 journal starts. The first
launch started setup, the seed agent and the first `threat-1` builder.
The resume replayed setup and the seed from cache, so they did not run
again. It started 4 new agents (a new builder, a reviewer, a fixer and
the gate); its usage record counts 6 agents, which includes the 2
replays, and its 170 tool uses are exactly those of the 4 new agents.

## 4. Orchestration patterns that worked

**Research with verifiers before any question.** Two research runs
worked in parallel while the coordinator talked to the maintainer:
`protocol-coverage-recon` (5 researchers, a synthesiser, 3 verifiers)
and the reference-and-harness run (3 researchers, a verifier). The
verifiers corrected several claims (ammo uses `CMSG_SET_AMMO`, taxi
nodes come through gossip, boats need no new opcode) before the design
read them. The coordinator took the questions from the synthesis and
asked only the three the rulings did not already answer.

**One question per message, then a goal.** The maintainer asked for
questions one at a time. The coordinator recorded each answer as a
numbered ruling in a notes file outside the repo, with a companion
checklist of standing coordinator duties. At the end it proposed the
goal as one paragraph that points at both files. The maintainer set it
and slept. This gave 22 rulings in about 40 minutes of his time, and a
durable memory the coordinator reread through the night.

**Three structures, a judge, verifiers, and per-area designs in one
run.** `protocol-design-v2` ran three step-0 structure designs from
different stances (registry-minimal, full-area-modules,
worker-proof-first), a judge that picked full-area-modules with 20
grafts, two adversarial verifiers (code, harness), 20 per-area designs
and a tooling design, all in parallel, then one integrator. Each agent
first checked for its own `## COMPLETE` file and skipped if it was
there, so the relaunch after the first run reused the 10 finished
designs.

**A contract with file ownership, leases and rulings.** The plan run
wrote an interface contract (rules, names, types, and which task owns
which file) and one unit file per area, each with a JSON task list.
Tasks that must touch another unit's file hold a lease line. The
coordinator added rulings in layers: Gate R rulings for phase 0,
seed rulings per wave 1 unit, and build rulings written during the run.
Reviewers judge the diff against the contract as the rulings amend it.

**Proof tooling first.** The early build landed five proof tools before
any area: name retry for `soap create`, a packet trace (`--packet-trace`),
a send-and-observe probe (`mise protocol:probe`), an AzerothCore
citation checker, and GM staging over SOAP (`soap gm`). Phase 0 added
partner puppets, truth picks and console reads. Every later live proof
used them.

**Readiness scheduler with keepers and seeds.** The build scheduler
([`build-scheduler.js`](2026-09-27-protocol-coverage/workflows/build-scheduler.js))
reads the plan's `index.json`, computes the dependency closure of the
target phases (or of an `only` list), and gives each unit one Orca
worktree (`proto-<unit>`, branch `proto/area-<unit>`) with at most one
task at a time. A dependency is met when it has landed, when it is a
`lease:` entry, or when it has passed review in the same unit. Each
task is: builder (test first, live proof on its own throwaway
accounts), independent reviewer (reverts the non-test files to prove
the tests fail without the change, checks every fixture against the
AzerothCore writer), at most one fix round and a second review (two in
phase 0). When a builder stops as blocked on a shared test fake or on a
ruling, a keeper agent adds the member or writes a build ruling, and
the builder continues from its commits. Reviewed tasks land in batches
through one promise chain (`landChain`), so only one agent rebases and
pushes at a time. A batch lands when another unit waits on it, when 2
are queued, or when the unit has no more ready work. An optional seed
step makes the coordinator's wave commit first (SEED-1 created the 19
wave 1 code areas and split `look.ts` and `params.ts` by tool). A gate
agent runs `mise ci:checks` and updates the PR body's status.

**Muse for grading, Opus for code.** The eval-round script
([`eval-round.js`](2026-09-27-protocol-coverage/workflows/eval-round.js))
refreshes the eval worktree, starts `mise eval run` per scenario in a
small pool, and has each Opus runner write a brief and hand the grading
to a non-interactive Muse process with a named result file. A cluster
agent writes at most four briefs. Builders used the same pattern for
their own eval gates in rounds 10 and 11.

**Resume from the run id.** To change a running workflow, the
coordinator stopped it, edited the prompt in the script, and relaunched
with `resumeFromRunId`. Unchanged agent calls replayed from cache: the
wave 1 resume did not redo the 22-minute SEED-1 agent.

**A record run before the maintainer returns.** `protocol-record` ran
at 06:48 while wave 1 kept building. One agent collected facts from
git, the task reports and the notes; a second wrote design section 8, a
PR comment, the PR body status and the morning summary. The
coordinator also kept the morning summary current after every
milestone, so an abrupt stop would still have left a true summary.

## 5. What went wrong and how it was fixed

- **Design agents refused the scripted task.** In `wf_66a1ef0d-a6a`,
  10 of 24 design agents read the maintainer's last chat message as
  their real request and refused the task in their prompt. The
  coordinator stopped the run at 21:38 and relaunched it as
  `wf_076184aa-88d` with an AUTHORITY preamble: the goal quoted as the
  authority, the maintainer asleep, recent chat messages not the task.
  The 10 finished designs were kept through the skip check. Every later
  prompt (workflow and Agent tool) starts with that preamble, and the
  checklist says so.
- **The threat-1 pilot chased rare opcodes for an hour.** The first
  builder ran seven live probes over more than an hour for threat
  opcodes that the server sends rarely. The fix was a rare-event cap in
  the builder prompt: at most two live attempts per opcode (about 10
  minutes), then R22 proof (a mock-server test from the AzerothCore
  writer, marked "not seen live").
- **A message to a workflow subagent forked it.** At 04:36 the
  coordinator used `SendMessage` to tell the threat-1 builder to stop
  chasing. That started a second copy of the agent from its transcript
  instead of reaching the running one. Two builders in one worktree
  would conflict, so the coordinator stopped the copy with `TaskStop`,
  and that also interrupted the workflow's own instance. The
  coordinator stopped the run and resumed it from its run id with the
  cap in the prompt (04:38). Lesson in the checklist: never message a
  workflow subagent; stop, edit the script, resume.
- **The probe logged in without game data.** The resumed run ended at
  05:30 with 0 of 73 landed. The threat-1 fix round found that
  `mise protocol:probe` dropped `spell_data_dir` in `probe-account.ts`,
  so every unit read as not attackable and no probe fight could start.
  The bug would have blocked live proof for every later area. Ruling
  BR-threat-1-1 made the fix a coordinator commit: `protocol-threat-finish`
  landed `baeb751f`, reran threat-1's flow live and landed it.
- **Reviewed tasks were stranded behind a blocked task.** At the end of
  phase 0, S0-5 blocked on the t3 gate and T-10 on three files outside
  its contract row. S0-4 had passed review but sat in the same unit, and
  the scheduler's stopped-unit rule (the Pi epic's fix for leaked
  commits) kept it off the branch. At 03:20 the coordinator added
  `landPrefix`: a stopped unit lands its reviewed tasks up to the last
  reviewed commit. `protocol-phase0-finish` ruled BR-S0-5-2 (a gray-mob
  t3 failure is the round 0 baseline cause) and BR-T-10-1 (grant the
  files) and landed all three.
- **The keeper path did not run after fix rounds.** The scheduler sent a
  blocked builder to the fake or ruling keeper only after its first
  build. The threat-1 fixer blocked on a ruling in its fix round, and
  the task stopped. At 05:31 the coordinator patched `runTask` so the
  keeper also runs after each fix round. The saved scheduler is this
  patched form.
- **The push waited on the clean-worktree hook.** At 00:04 the design
  commit could not be pushed: the pre-push hook refuses a dirty tree,
  and the plan run was still writing its files into the same worktree.
  The design commit went up with the plan commit at 00:57.
- **A missing `mise bundle`.** The probe tool added a devtools
  dependency on `@peon/core`. The coordinator's worktree had not
  bundled since, so its push failed until `mise bundle` ran (00:57).
- **The index lacked the lease waits.** The wave 1 rulings added lease
  handovers and order dependencies to the unit files, but not to
  `index.json`. An Agent-tool agent added 25 dependencies and copied the
  `lease:` entries into `deps`, and the scheduler learned to treat
  `lease:` entries as met, since their holders are now real
  dependencies (01:38 to 01:47).
- **The stall watcher gave false alarms.** The shell watcher
  ([`watch-wf.sh`](2026-09-27-protocol-coverage/workflows/watch-wf.sh))
  reports a stall when a run's journal does not change for a set time.
  At 04:11 it fired after 25 minutes: one long builder was working and
  writes nothing to the journal until it returns. At 05:59 a watcher
  armed on an already finished run fired. The coordinator checked the
  builder report files, lengthened the window, and re-armed per run.
- **Concurrency was capped at 10 agents.** The 12-CPU machine caps a
  workflow at 10 concurrent agents, so the 28-agent design run queued
  its area designs (21:37).
- **Legacy fixtures blocked two tasks.** `objects-1` and `world-2`
  stopped on legacy tests outside their files that pin opcodes they own
  (for example, a `SMSG_GAMEOBJECT_QUERY_RESPONSE` body AzerothCore
  never writes). They need a coordinator fixture fix or a ruling.
- **Three tasks stopped on coordinator steps at the end.** In the
  wrap-up, `quests-1` needs its `hub.test.ts` edit landed as a
  coordinator commit, `self-state-2` needs a lease or ruling for
  `MoveFlag` in `self-store.ts`, and `combat-log-7a` needs two
  kill-log statements fixed in `docs/areas/combatlog.md`. Each of the
  three failed its second review, and one fix round is the limit
  outside phase 0, so the scheduler left them for the coordinator.
- **Tests became six times slower, found only after the run.** On
  `main`, `mise test` runs 3,209 tests in 0.9 s. On the PR branch it
  runs 4,396 tests in 5.7 s, and `mise ci:checks` takes 8.0 s against
  about 2.7 s. The cause is the new probe-flow tests in
  `packages/devtools/src/probe-flows/`, `probe-run.test.ts` and
  `probe-flows.test.ts`: they wait on real timers for walk and fight
  loops instead of fake time. No reviewer or gate checked test time, so
  it grew unnoticed. The maintainer found it by asking at 09:25; a fix
  agent is working on it.
- **An unowned commit.** `ebe956c8` ("test: Cast the rig's area stores
  through unknown", 03:38) sits between phase 0 and SEED-1. Its owner
  could not be determined.

## 6. Iteration numbers

### Tasks per phase

| Phase | Tasks | Landed | Run(s) | Blocked or stopped at the end |
|---|---:|---:|---|---|
| R (re-baseline) | 1 | 1 | `wf_c41106f3-236` | none |
| 0 (tooling and step 0) | 20 | 20 | `wf_c41106f3-236` (T-1 to T-5), `wf_ad3b03c0-1d2` (12), `wf_5bfc77ef-c76` (3) | none; S0-5 and T-10 cleared by rulings |
| Wave 1 (NS1, levels 1 to 10) | 73 | 39 | `wf_3d1bc31d-a66` (threat-1), `wf_b3719fee-765` (37), `wf_68beba31-9a7` (combat-log-6b) | objects-1, world-2 (legacy fixtures); quests-1, self-state-2, combat-log-7a (coordinator steps); items-5a started only |
| Wave 2 (parties and raids) | 39 | 0 | - | not started |
| Wave 3 (NS2, levels 1 to 80) | 47 | 0 | - | not started |
| Wave 4 (long tail) | 83 | 0 | - | not started |
| Total | 263 | 60 | | |

Wave 1 counts are from the `land:` agents' results in the journals and
agree with the commit list. The relaunch's 25 landing agents carried 37
tasks.

### Agents per build run

From the journal labels. The build column includes builder re-attempts
after a keeper (`build2`, `build-re1`), and the fix column includes
`fix1-re1`.

| Run | build | review | fix | review2 | keeper (fake or rule) | land | other |
|---|---:|---:|---:|---:|---:|---:|---|
| Early build `wf_c41106f3-236` | 5 | 5 | 3 | 3 | 0 | 5 | R0 1 |
| Phase 0 `wf_ad3b03c0-1d2` | 17 | 15 | 3 | 1 | 2 | 9 | setup, gate |
| Phase 0 finish `wf_5bfc77ef-c76` | 0 | 1 | 0 | 0 | 2 | 2 | - |
| Wave 1 first launch and resume `wf_1f5fe44d-3fa` | 2 | 1 | 1 | 0 | 0 | 0 | setup, seed, gate |
| Threat finish `wf_3d1bc31d-a66` | 0 | 0 | 1 | 1 | 0 | 1 | - |
| Wave 1 relaunch `wf_b3719fee-765` | 45 | 38 | 11 | 10 | 2 | 25 | setup |
| Wrap-up `wf_68beba31-9a7` | 4 | 4 | 3 | 3 | 0 | 1 | setup, gate |
| Total | 73 | 64 | 22 | 18 | 6 | 43 | |

- **First reviews:** 44 pass and 20 fix of 64. **Second reviews:** 15
  pass and 3 fix of 18 (the 3 are in the wrap-up).
- In the wave 1 relaunch, 4 builders stopped as blocked and 3 builders
  had not returned when the run was stopped.
- `mise ci` grew from 3,209 tests on `main` to 3,630 passing after
  phase 0, 4,222 at the record and 4,390 passing (6 skipped) at
  `3cbbb317`.

### Rulings and decisions

| Kind | Count | Where |
|---|---:|---|
| Maintainer rulings R1 to R22 | 22 | coordinator notes |
| Design decisions N1 to N33 | 33 | design section 2 |
| Contract amendments in the design | 12 | design section 2 |
| Contract decisions D1 to D27 | 27 | plan `contract.md` section 4 |
| Gate R rulings GR-1 to GR-42 | 42 | plan, "Gate R rulings" |
| Seed rulings SR1-&lt;unit&gt;-&lt;n&gt; | 191 | 17 unit files |
| Build rulings BR-* | 6 | unit files |
| Open ruling requests in reviews | 9 | design 8.7 |
| Open questions for the maintainer | 12 | design 7.2 |
| Advisor approvals | 2 | design (4 conditions), plan (3 conditions) |

Every decision below the maintainer's own rulings is marked "not yet
ruled by the maintainer".

### Eval runs

| Round | Runs | Graded by | Result |
|---|---:|---|---|
| 0 (baseline at `26d91c7a`) | 4 | Muse | `t1-walk-to-npc` 2/2, `t0-hostiles` 3/3, `t7-halt-resume` 3/3 pass; `t3-ghostlands-kill` 3/4 fail |
| 10 (builder gates, phase 0 and combat-log-1) | 8 | builders | t1 and t7 pass; t3 fails 3 of 3 on gray mobs |
| 11 (builder gates, wave 1) | 13 | Muse (session runs) and builders | t1, t7 and `t0-who-is-near` pass; t3 passes 2 of 6 |

Every `t1-walk-to-npc` and `t7-halt-resume` run passes.
`t3-ghostlands-kill` passes 2 of 10 runs, and every fail is the round 0
cause: `engage` with no target picks a gray mob and the fight gives no
kill credit. That is a harness targeting bug outside item 4; its brief
is deferred to the maintainer. Round and replica numbers repeat across
tasks because each worktree keeps its own run directory. Only one
eval-round workflow ran; there were no fix-and-rerun rounds as in the
Pi epic.

### Coverage

| | Opcodes | Handled | Stub | Missing | Dead | Not seen live |
|---|---:|---:|---:|---:|---:|---:|
| `main` | 923 | 266 | 57 | 600 | 0 | 0 |
| Tip `3cbbb317` | 933 | 373 | 36 | 500 | 24 | 17 |
| Change | +10 | +107 | -21 | -100 | +24 | +17 |

The tip counts are summed from the rows of `docs/protocol-coverage/*.md`
at `3cbbb317`. The 10 new opcodes are AzerothCore opcodes that
`GameOpcode` lacked, which S0-2 adds. "Not seen live" marks handled
opcodes proven by an R22 mock-server test only.

## 7. Comparison with the Pi epic

| Measure | Pi epic | Item 4 |
|---|---:|---:|
| Span, start to stop | 16.3 h | 11.25 h |
| Workflow launches | 38 | 17 |
| Agents started | 724 | 356 |
| Subagent tokens | 91.3 M | about 58.4 M (34.0 M recorded) |
| Planned tasks | 127 | 263 |
| Tasks landed | 127 | 60 |
| Stopped launches with no usage record | 1 | 3 |

**What was done better.**

- **Durable coordinator memory.** The rulings file and the checklist
  lived outside the repo and outside the context window. Each new lesson
  went into the checklist the moment it happened, and the morning
  summary stayed current after every milestone.
- **A clean gate on another item.** R3 and R11 held all code until item
  6 merged. A watcher woke the coordinator on each item 6 event, and
  the research, design and plan used the wait.
- **Proof tooling before areas.** The Pi epic built its live checks
  inside tasks. Here the probe, packet trace, GM staging, partner
  puppets and truth picks landed first, and the R22 rule gave rare
  opcodes a bounded fallback.
- **Blocks cleared inside the scheduler.** In the Pi epic, a shared-fake
  block needed a separate coordinator run (`pi-epic-unblock-a1d-then-boot`)
  and then a blanket ruling. Here the fake and ruling keepers run inside
  the scheduler, and the phase 0 blocks cleared in a 2-minute finishing
  run.
- **Ownership up front.** The contract, leases and seed rulings (191)
  settled most file conflicts before the builders started. No commit
  leaked from a blocked task, which was the Pi epic's phase 3 fault.
- **Cheaper grading.** Muse graded evals through `omp -p` at no Opus
  cost, which R10 asked for.

**What repeated or got worse.**

- **Stopped runs lose their usage record.** The Pi epic lost one small
  launch. Here three launches lost it, including the largest run, so
  the record needs transcript estimates for 42% of the tokens.
- **The blocked-task rule failed again, in the opposite way.** The Pi
  epic's stopped-area fix stopped leaked commits, but here it stranded
  reviewed work (S0-4) behind a blocked task. The prefix landing fixed
  it. A rule that stops a unit needs to say what happens to its reviewed
  queue.
- **A pilot task ran without a time cap.** The threat-1 pilot had no
  cap on live attempts, and the cap came only after an hour was lost.
- **Tooling bugs surfaced late.** The probe's missing game data passed
  its own tool task (T-3) because that task's live proof covered gossip
  and a raw query, not a fight. It surfaced in the first area that fought.
- **Scale beyond one night.** The Pi epic's 127 tasks all landed. Item
  4 planned 263 and landed 60, with about 42% of the planned wave 1
  still open. The maintainer stopped the run because usage would not
  cover the whole protocol.
- **No check on test time.** Neither record has a gate on test
  duration. Here the suite grew six times slower and nobody saw it
  until the maintainer asked.
- **New failure: prompt authority.** The Pi epic's agents did not
  refuse their tasks. Here 10 design agents did, because the
  maintainer's recent chat reached them. The AUTHORITY preamble is the
  fix, and it belongs in every future workflow prompt.

## 8. Appendix: the reusable scripts

- [`workflows/build-scheduler.js`](2026-09-27-protocol-coverage/workflows/build-scheduler.js)
  is `protocol-build` in its final form (file time 05:31 UTC, with the
  prefix landing and the keeper after fix rounds). It ran phase 0, wave
  1 (both launches), the wave 1 relaunch and the wrap-up.
- [`workflows/eval-round.js`](2026-09-27-protocol-coverage/workflows/eval-round.js)
  is `protocol-eval-round`. It ran round 0.
- [`workflows/design-panel.js`](2026-09-27-protocol-coverage/workflows/design-panel.js)
  is `protocol-design-v2`: three structure designs, a judge, two
  verifiers, per-area designs, a tooling design and an integrator.
- [`workflows/plan.js`](2026-09-27-protocol-coverage/workflows/plan.js)
  is `protocol-plan`: contract, unit files, assembly, two verifiers and
  fix-ups.
- [`workflows/record.js`](2026-09-27-protocol-coverage/workflows/record.js)
  is `protocol-record`: collect facts, then write design section 8, the
  PR comment and the morning summary.
- [`workflows/watch-item6.sh`](2026-09-27-protocol-coverage/workflows/watch-item6.sh)
  waits for `main` to move, the item 6 worktree to go, or item 6 to be
  marked done, and exits with one `EVENT` line.
- [`workflows/watch-wf.sh`](2026-09-27-protocol-coverage/workflows/watch-wf.sh)
  watches one run's journal and reports a stall or a timeout with the
  label counts.
- [`workflows/tally.ts`](2026-09-27-protocol-coverage/workflows/tally.ts)
  computes the totals in section 1.

The machine paths are named constants at the top of each script
(`REPO`, `PRWT`, `WS`, `OUT`, `NOTES_HOME`, `CODE`, `INDEX`, `S`); the
rest is as it ran. The restricted reference client's name and path are
replaced by the constants `RESTRICTED_NAME` and `RESTRICTED_CLIENT`.
The other run scripts (`protocol-coverage-recon`, the reference-and-harness
research, `protocol-tooling-build`, `protocol-pre-step0`,
`protocol-rule-wave1`, `protocol-phase0-finish`,
`protocol-threat-finish`) are one-off and are not copied. The workflow
scripts are Claude Code Workflow scripts: they use the harness globals
`args`, `agent`, `phase`, `log`, `parallel` and `pipeline`, and a
top-level `return`, so they do not run as plain modules.
`tsconfig.json` and `biome.json` do not include `docs/`.
