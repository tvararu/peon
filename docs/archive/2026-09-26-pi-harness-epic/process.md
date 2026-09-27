# How the Pi harness epic was built

This is the process record of the Pi harness epic: how many dynamic
workflows ran, what each one did, how the work iterated, and what went
wrong. The spec ([design](../2026-09-26-pi-harness-epic-design.md)) holds
the decisions and the results. The plan
([plan](../2026-09-26-pi-harness-epic-plan.md)) holds the tasks. This file
holds the method.

## 1. Summary

- **Dates.** The session started on 2026-09-26 at 18:05 UTC. The wrap-up
  workflow ended on 2026-09-27 at 10:23 UTC, about 16.3 hours later. The
  maintainer was asleep from about 21:21 to 08:20 UTC. The coordinator
  worked on its own through that time, under the goal the maintainer set
  at 20:56 UTC.
- **Harness.** Claude Code ran the whole epic in one session. The dev
  factory was off (R17).
  - Coordinator: Fable 5.1 at `ultracode` effort from 18:05 UTC (the
    `/model` output says so). At 18:37 UTC the maintainer switched it to
    Opus 5.5. The `/model` output says only "Opus 5.5 (default)"; the
    coordinator's running log says "ultra effort". The inventory
    workflow (18:19 UTC) ran under the Fable coordinator.
  - Subagents: every workflow agent ran on Opus 5.5 at medium effort
    (R6). Each `agent()` call passed `{ model: 'opus', effort: 'medium' }`.
  - Second opinion: the Fable 5.1 `advisor` tool was the only other
    model. Under the goal, the advisor approved the spec review and the
    plan in the maintainer's place.
- **Totals.** The totals exclude the run that wrote this file
  (`wf_99c4802a-2f2`).

| Measure | Value |
|---|---:|
| Workflow launches | 38 |
| Distinct workflow runs (run ids) | 37 |
| Distinct workflow scripts | 29 |
| Agents started (journal `started` lines) | 724 |
| Agents counted in usage records | 720 |
| Subagent tokens | 91,337,819 |
| Subagent tool uses | 17,579 |
| Sum of run durations | 73,266 s (20.4 h) |

The two agent counts differ by 4. The stopped round-6 launch started 4
fix agents. They have journal lines, but no usage record exists for that
launch. The sum of run durations is larger than the session span because
runs overlapped. It is not wall time. Coordinator tokens are not in these
numbers. Two of the 29 scripts were side runs for the maintainer
(`soap-wishlist` and `wow-agent-prior-art`); they are in the totals.

**Where the numbers come from.** The task-output files
(`tasks/*.output` in the Claude Code temp directory) do not hold the
usage blocks. The usage blocks are in the `<task-notification>` messages in the
coordinator's transcript (`~/.claude/projects/<project>/<session>.jsonl`).
[`workflows/tally.ts`](workflows/tally.ts)
reads the transcript for each `Workflow` launch, its task id, its run id
and its completion notice. It also counts the `started` lines in each
run's journal (`<session>/subagents/workflows/<run>/journal.jsonl`). Run
it on the machine that holds the session:

```sh
cd docs/plans/2026-09-26-pi-harness-epic/workflows
bun tally.ts wf_99c4802a-2f2
```

The argument names runs to exclude. The last line of the output is the
totals object; the other lines are one row per launch.

## 2. Timeline

All times are UTC.

1. **Grilling and rulings** (2026-09-26 18:05 to about 19:00). The
   coordinator asked one question per message, in the order the running
   log lists (Q1 to Q14). The maintainer's answers became rulings R1 to
   R22: scope, the Bun workspace layout (R13), Luna at high effort as
   the inner model (R16), evals in Orca panes (R18), the factory off
   for the epic (R17). Later rulings (R23 to R40) came as the work went
   on. A fresh window to get agent teams failed (no `TeamCreate` tool),
   so Workflow plus Orca worktrees became the topology.
2. **Inventory and research** (18:19 to 19:53).
   `pi-epic-inventory` ran 8 readers and a completeness critic.
   `pi-epic-pain-points` mined 4,399 CLI episodes from agent
   transcripts in 33 shards. `soap-wishlist` wrote the wishlist for the
   t1 server session. Gate: the critic's follow-up list and the
   maintainer's answers.
3. **Derisk spikes** (19:01 to 21:14). `pi-epic-luna-runtime-spike`,
   `pi-epic-eval-suite-design`, `pi-epic-derisk` (live Luna play,
   legacy baseline, event volume, architecture draft, 7 rendered UI
   concepts), `pi-epic-nerd-glyphs`, `pi-epic-jev-glyph-probe` and
   `pi-epic-nav-diagnosis` ran in parallel.
   `pi-epic-migration-design` made three measured migrations in scratch
   clones. The maintainer approved the migration section ("Yep", R26),
   and `pi-epic-migration-exec` landed it as `0282fe4` with draft PR
   #367. `pi-epic-migration-docfix`, `pi-epic-t1-integration` and
   `pi-epic-nav-track` (R27) followed. Gates: the live suite at 21 of
   21 after the migration, and the M3a route re-proof after the
   navigation track.
4. **Design panel and approval** (19:54 to 20:53).
   `pi-epic-harness-design` closed the pain-point report gaps and ran
   three independent designs, a judge and two verifiers. The
   coordinator presented sections A to K in chat, one per message. The
   maintainer approved each one (R28 to R38, 20:42 to 20:53). He set
   the goal at 20:56.
5. **Spec** (20:53 to 21:20). `pi-epic-spec` wrote and self-reviewed
   the spec. `pi-epic-spec-pending-decisions` recorded the 16
   settlements of the self-review as pending rulings. Gate: the advisor
   approved the spec in the maintainer's place, with two conditions.
6. **Plan** (20:58 to 23:21). `pi-epic-plan` wrote the interface
   contract, 9 area task files, the integrated plan (127 tasks) and ran
   two verifiers. `pi-epic-plan-fixups` checked the plan against the
   spec-review settlements. Gate: the advisor approved the plan with
   three conditions, which the phase 1 setup commit applied.
7. **Build** (23:25 to 03:03). Four runs of the build scheduler
   (phases 1, 2a, 2b, 3) and two special runs
   (`pi-epic-unblock-a1d-then-boot` for phase 2c, `pi-epic-phase3b`).
   Gates: SURFACE and V3 after phase 1, V2 after phase 2a, BOOT after
   phase 2c, all 127 tasks landed after phase 3b. Two record runs and
   one merge run kept section 11 of the spec current.
8. **Final gate** (03:03 to 03:40). `pi-epic-final-gate` ran the
   legacy gate (ci, live suite 21 of 21, C14) and the Luna gate (tool
   smoke, canary `t0-self-state`). The legacy gate passed. The Luna
   gate was not met (4 of 5 on the canary, from a scenario data
   defect). Its frictions became the round-1 fix briefs.
9. **Eval rounds 1 to 6** (03:42 to 10:06). Six runs of the eval-round
   script, plus one stopped launch. The pass rate went from 0.46 to
   1.00. After round 5 the maintainer ruled: finish round 6, then stop
   (R40).
10. **Wrap-up** (10:07 to 10:23). `pi-epic-wrap-up` closed the spec
    record, consolidated the decisions, made PR #367 merge-ready, ran
    the final legacy gate at `7be728d` (ci 4006 pass, live 21 of 21,
    C14 ok) and removed 10 worktrees and 369 soap accounts. The
    `wow-agent-prior-art` side run (09:27) answered a maintainer
    question about prior art.

## 3. Every workflow run

Tokens are subagent tokens. Duration is the run's own duration from its
usage record. "Agents" is journal starts / usage count. **B** marks a run
of the build scheduler (`pi-epic-build`, args `phase`, `targets`,
`landed`). **E** marks a run of the eval-round script
(`pi-epic-eval-round`, args `round`, `briefs`, `pool`, `replicas`).

| Start | Run id | Script | Purpose | Agents | Tokens | Duration | Tool uses | Outcome |
|---|---|---|---|---:|---:|---:|---:|---|
| 09-26 18:19 | `wf_73d49a4d-117` | pi-epic-inventory | Read-only inventory: 8 readers and a critic | 9/9 | 1.29 M | 13 min | 250 | 8 reports and `critic.md` with follow-ups F1 to F13 |
| 09-26 18:42 | `wf_b5721a98-704` | pi-epic-pain-points | Mine transcripts for CLI pain points | 39/39 | 7.52 M | 71 min | 878 | 4,399 episodes, 33 shards; the coordinator wrote the report |
| 09-26 18:46 | `wf_c061ab10-268` | soap-wishlist | Side run: server-side wishlist for t1 | 2/2 | 0.29 M | 8 min | 38 | Wishlist sent to the t1 session |
| 09-26 19:01 | `wf_bb4ae9fa-1d9` | pi-epic-migration-design | Three measured migrations, judge, verifier | 5/5 | 1.21 M | 49 min | 330 | Codemod: 476 renames, 1824 import rewrites, 0 hand edits |
| 09-26 19:03 | `wf_b25c0340-274` | pi-epic-luna-runtime-spike | Pi and Luna headless and in an Orca pane | 2/2 | 0.30 M | 15 min | 90 | Read-only credential store design; compile works |
| 09-26 19:03 | `wf_fbdb4d2e-201` | pi-epic-eval-suite-design | Scenario suite, grader protocol, pane driver | 2/2 | 0.41 M | 21 min | 63 | 30 scenarios (later 37), grader protocol, round rules |
| 09-26 19:06 | `wf_44edfedf-427` | pi-epic-derisk | Live spike, baseline, event volume, UI gallery | 12/12 | 2.37 M | 27 min | 620 | 3 of 3 kills; 27 of 39 gotos refused; gallery |
| 09-26 19:40 | `wf_80634350-e96` | pi-epic-nerd-glyphs | Glyph table and nerd gallery | 8/8 | 1.14 M | 19 min | 148 | 83 glyphs in three sets |
| 09-26 19:43 | `wf_122d983a-c9a` | pi-epic-jev-glyph-probe | Jev as an NPC glyph classifier | 2/2 | 0.25 M | 11 min | 55 | Rules first, Jev for the generic cases |
| 09-26 19:52 | `wf_ddc2c795-25b` | pi-epic-migration-exec | Run the codemod on the epic branch, gate, PR | 3/3 | 0.36 M | 8 min | 66 | `0282fe4`, live 21 of 21, draft PR #367 |
| 09-26 19:53 | `wf_20fb56b4-f95` | pi-epic-nav-diagnosis | Live repro of goto refusals, fixes | 2/2 | 0.39 M | 27 min | 110 | Four causes, fixes F1 to F4 |
| 09-26 19:54 | `wf_fc43176d-cc7` | pi-epic-harness-design | Report gaps, 3 designs, judge, 2 verifiers | 11/11 | 2.65 M | 46 min | 447 | `harness-design.md` sections A to K |
| 09-26 20:01 | `wf_762ba8c5-036` | pi-epic-migration-docfix | Reviewer's AGENTS.md findings | 1/1 | 0.09 M | 1 min | 11 | `810650e` |
| 09-26 20:10 | `wf_53ba8862-798` | pi-epic-t1-integration | SRP test, soap presets, t1 service client | 5/5 | 0.66 M | 27 min | 172 | 3 commits, 2531 tests |
| 09-26 20:22 | `wf_76eada92-d4d` | pi-epic-nav-track | Navigation fixes F1 to F4 and re-proof | 4/4 | 0.66 M | 52 min | 190 | Head `c91f70f`; 13 of 13 M3a routes |
| 09-26 20:53 | `wf_67873861-b09` | pi-epic-spec | Write and self-review the spec | 3/3 | 0.63 M | 24 min | 134 | Spec `071f3cf`, citation fix `e86494a`, roadmap `4827620` |
| 09-26 20:58 | `wf_341c37a1-7b9` | pi-epic-plan | Contract, 9 area files, plan, 2 verifiers | 14/14 | 5.43 M | 120 min | 1460 | `9dc0483`, 127 tasks |
| 09-26 21:19 | `wf_03d12b19-3b4` | pi-epic-spec-pending-decisions | Record the 16 self-review settlements | 1/1 | 0.10 M | 1 min | 8 | `3af5aa3` |
| 09-26 22:58 | `wf_ce0d7454-72c` | pi-epic-plan-fixups | Check the plan against the settlements | 2/2 | 0.47 M | 23 min | 159 | Fixes committed; advisor approval next |
| 09-26 23:25 | `wf_5d29ac06-e48` | pi-epic-build **B** | Phase 1: core surface and foundation | 67/67 | 6.63 M | 63 min | 975 | 26 landed, 0 blocked; V3 pass |
| 09-27 00:28 | `wf_772d7dbf-26a` | pi-epic-build **B** | Phase 2a: F8d | 5/5 | 0.43 M | 4 min | 43 | F8d landed; V2 pass |
| 09-27 00:28 | `wf_6e561046-fd3` | pi-epic-record-phase1 | Record phase 1 in the spec and PR | 1/1 | 0.11 M | 2 min | 16 | `35adf3a` |
| 09-27 00:33 | `wf_fb9a5605-c55` | pi-epic-build **B** | Phase 2b: towards BOOT (F6b) | 93/93 | 8.89 M | 35 min | 1246 | 32 landed; A1c, A1d, F6b blocked |
| 09-27 01:09 | `wf_96e08c41-3b4` | pi-epic-unblock-a1d-then-boot | Phase 2c: unblock A1d, land, build F6b | 8/8 | 0.75 M | 8 min | 93 | A1c, A1d, F6b landed; BOOT pass |
| 09-27 01:17 | `wf_82dd77d1-c8d` | pi-epic-build **B** | Phase 3: all remaining tasks | 164/164 | 16.32 M | 80 min | 2484 | About 57 landed; U11a, B5, E7f blocked |
| 09-27 01:18 | `wf_01cd6701-d17` | pi-epic-record-phase2 | Record phases 2a to 2c | 1/1 | 0.08 M | 1 min | 10 | `fb389df` |
| 09-27 01:19 | `wf_3b4a4b24-497` | pi-epic-merge-decision-sections | Merge duplicate decision lists | 1/1 | 0.08 M | 1 min | 6 | `f30a1ad` |
| 09-27 02:39 | `wf_e3bd451d-990` | pi-epic-phase3b | Phase 3b: close blockers, then the scheduler | 27/27 | 2.66 M | 24 min | 408 | All 127 tasks landed at `11e717c` |
| 09-27 03:03 | `wf_4d9dc1ea-dd8` | pi-epic-final-gate | Legacy gate and Luna gate, record | 3/3 | 0.40 M | 36 min | 103 | Legacy pass; Luna gate not met; `ee1f7e4` |
| 09-27 03:42 | `wf_f3bb768f-f2d` | pi-epic-eval-round **E** | Round 1 | 30/30 | 3.73 M | 54 min | 901 | 6 of 13; `60360ac` |
| 09-27 04:37 | `wf_c02930d0-d6a` | pi-epic-eval-round **E** | Round 2 | 39/39 | 4.99 M | 64 min | 1287 | 7 of 13 |
| 09-27 05:41 | `wf_dc3e3d2d-e37` | pi-epic-eval-round **E** | Round 3 | 36/36 | 4.53 M | 64 min | 989 | 8 of 13 |
| 09-27 06:45 | `wf_622397f1-bf2` | pi-epic-eval-round **E** | Round 4 | 33/33 | 4.32 M | 67 min | 1009 | 9 of 13 |
| 09-27 07:53 | `wf_6d17db2b-392` | pi-epic-eval-round **E** | Round 5 | 46/46 | 6.53 M | 84 min | 1791 | 10 of 13; `ded00fd` |
| 09-27 09:17 | `wf_7fd83862-124` | pi-epic-eval-round **E** | Round 6, first launch (task `wxabwczte`) | 4/- | - | - | - | Stopped; no usage record |
| 09-27 09:19 | `wf_7fd83862-124` | pi-epic-eval-round **E** | Round 6, restart (task `wuxuvpb79`, resume) | 28/28 | 3.39 M | 47 min | 700 | 13 of 13 |
| 09-27 09:27 | `wf_ff491e53-9a2` | wow-agent-prior-art | Side run: prior art for an X post | 7/7 | 0.79 M | 9 min | 199 | Fact-checked report |
| 09-27 10:07 | `wf_ca189fd4-d46` | pi-epic-wrap-up | Close the record, PR, gate, cleanup | 4/4 | 0.45 M | 16 min | 90 | `7be728d`; ci 4006 pass, live 21 of 21 |

The round-6 run id has 32 journal starts. The first launch started 4 fix
agents (durable-run-dirs, northshire-route-floors, search-and-recover,
event-delivery) and none of them returned. The restart used
`resumeFromRunId` with changed args (stale-checks in place of
durable-run-dirs). The changed args changed the prompts, so the cache
gave no reuse: the restart started 4 new fix agents.

## 4. Orchestration patterns that worked

**Readers plus a completeness critic.** N readers each own one question
and write one report with evidence marks (measured, read, inferred). One
critic reads all reports, checks contradictions against the code, and
lists gaps as follow-up reads. Used in `pi-epic-inventory` (8 readers,
1 critic), `pi-epic-pain-points` (33 shard readers, 3 side readers, an
extractor, a synthesiser, a critic) and `wow-agent-prior-art` (5
searches, synthesis, verifier).

**Three independent approaches, a judge, adversarial verifiers.** Three
agents solve the same problem from different stances without seeing each
other. A judge scores them and names grafts from the losers. Verifiers
try to break the winner. Used in `pi-epic-harness-design`
(observation-first, situation-stream, small-model-first; the winner
small-model-first scored 33 of 40) and in the plan (two verifiers over
the contract and the area files).

**Measured attempts in scratch clones.** For the migration, three agents
each did the real move in a scratch clone and measured it (tests,
typecheck, compile, boundaries). The judge picked strict-boundaries with
grafts G1 to G7, and a verifier added fixes V1 to V5. The output was a
deterministic codemod, so the landing run only executed it
(`pi-epic-migration-design`, then `pi-epic-migration-exec`).

**Readiness scheduler over a task DAG.** The build scheduler
([`workflows/build-scheduler.js`](workflows/build-scheduler.js))
reads the plan's task index as JSON and computes the dependency closure
of the phase targets. Each of the 9 areas has one Orca worktree and one
branch (`epic/area-<area>`); at most one task per area runs at a time.
A task is ready when every dependency has landed, or has passed review
in the same area. Each task is: builder (test first), independent
reviewer (does not read the builder's transcript; reverts the non-test
files to prove the tests fail without the change), at most one fix
round and a second review. Reviewed tasks queue per area and land in
batches (a batch lands when another area waits on it, when 3 are queued,
or when the area has no more ready work). Landings are serialised
through one promise chain (`landChain`), so only one agent rebases and
pushes at a time. The hk pre-push hook runs the full `mise ci
--publish` on each push. Used in phases 1, 2a, 2b and 3; phase 3b reused
the same functions in its own script.

**The eval loop.** The eval-round script
([`workflows/eval-round.js`](workflows/eval-round.js))
does one round:

1. Fix: each brief from the last round gets a fixer in its area
   worktree, a reviewer, at most one more fix and review, then a
   serialised landing.
2. Prep: refresh the eval worktree to the new head (create it if it is
   missing).
3. Run: 13 scenarios in a pool of 6 Orca panes. One Opus grader per
   scenario drives the real harness with `orca-ide terminal send` and
   reads `--screen` frames, then writes a feedback JSON.
4. Cluster: one agent groups the friction into at most 4 briefs for the
   next round (the rule of the eval-suite design) and a deferred list.
5. Record: one agent writes `### Eval round <n>` into section 11 of the
   spec and comments on PR #367.

The coordinator read only the cluster file between rounds, chose the
briefs, and started the next round with them as args.

**The advisor in the maintainer's place.** The goal named the advisor as
the approver of the spec review and the plan. The advisor approved the
spec with two conditions and the plan with three. Each condition became
a concrete edit in the next run (the pending-decisions section, the plan
fix-ups, the phase 1 setup commit). The coordinator also used it for
blocked-task rulings. Every such decision is listed in section 2 of the
spec as "not yet ruled by the maintainer".

**Section-by-section maintainer approval.** The design panel wrote
`harness-design.md` in approvable sections A to K. The coordinator put
each section to the maintainer in its own message, and he answered each
one ("Sounds good", then "Yes" ten times, 20:42 to 20:53 UTC). The
migration and navigation sections were approved the same way (R26,
R27). This took 11 minutes of his time and gave a recorded ruling per
section.

## 5. What went wrong and how it was fixed

- **The synthesis agent could not write its report file.** In
  `pi-epic-pain-points` the synthesiser returned: "REPORT.md was not
  written (harness refuses report files from subagents). Full content
  follows; the caller writes it". The critic in the same run polled for
  the file from 19:32 to 19:51 UTC, found nothing, and critiqued the
  inputs instead. The coordinator wrote `REPORT.md` from the returned
  text. The critic also found shards 03, 14 and 18 unread and one
  session holding 39% of the episodes. `pi-epic-harness-design` read the
  3 shards and re-ranked by distinct sessions before the designs.
- **The t1 README could not be copied.** In `pi-epic-t1-integration`
  the fetch agent found that `ssh t1` has a forced command, so `cat`
  returned nothing. The coordinator asked t1 for `GET /readme`, and the
  README was saved from that.
- **A blocked task's commits landed with a later batch.** In phase 3, B5
  failed its second review, but its commits stayed on the area branch.
  The next batch from the same area rebased and pushed them, so B5's
  code reached the epic branch before its review passed. The scheduler
  was patched: a blocked task sets `areaStopped` for its area, the loop
  starts no more work there, and the final flush skips stopped areas.
  The saved script is the patched form (it contains `areaStopped`; its
  file time is 02:38:43 UTC, after phase 3 ended at 02:37).
- **Test-fake ownership gaps.** The plan gave
  `packages/harness/test-support/fake-pi.ts` to F7a. A1d in phase 2b and
  U11a in phase 3 needed new methods on it (`registerTool`,
  `registerMessageRenderer`, `registerEntryRenderer`), so they blocked.
  The coordinator ruled an ownership exception for A1d
  (`pi-epic-unblock-a1d-then-boot`), then a blanket one (any task may
  add minimal methods to the fake). The ruling is in the scheduler's
  standing rules.
- **Duplicate decision lists.** The phase 1 and phase 2 record agents
  each added a "Decisions taken during the build" subsection. The
  coordinator saw the risk in the phase 2 result, and
  `pi-epic-merge-decision-sections` merged them (`f30a1ad`). The
  wrap-up consolidated all pending decisions again at the end.
- **The stale-truth logout race.** In phase 3 the canary aborted twice
  with `stale_truth`. Quit closed the socket 5 s after the logout
  request, and AzerothCore logs a character out only after 20 s outside
  a rested area, so the t1 truth read still saw the character online.
  Rulings: harness quit waits up to 30 s for the server logout
  (`3eb79bc`), and the grader polls truth up to 90 s until the
  character is offline (`d58fda1`).
- **Carried fix briefs.** Some briefs did not land in their round:
  item-names and events-lifecycle in round 1 (review said fix), nav-
  coverage in round 2 (docs findings only), engage-continuity in round 3
  (the live suite was not run on the head). The next round took each
  one again as a carried brief, and each one then landed.
- **A round aborted when the eval worktree was removed.** During round
  5 grading, the `pi-epic-eval` worktree was removed at about 09:04 UTC.
  `t7-halt-resume` aborted, and the run dirs of rounds 1 to 5 went with
  it; the round-5 verdicts came from the grader reports. The
  coordinator changed the prep step to create the worktree if it is
  missing and wrote a durable-run-dirs brief. The maintainer then said
  the removal was his, and ruled that run dirs stay in the eval
  worktree. The coordinator stopped the round-6 launch and restarted it
  with stale-checks in place of durable-run-dirs.
- **Plan count errata.** The plan's expected test counts were wrong for
  some tasks (A1a has 18 tests, A1c has 34), and the plan had 130 task
  headings for 127 index rows. Builders followed the spec when the plan
  was wrong and recorded the deviation (the scheduler's precedence
  rule); `pi-epic-plan-fixups` fixed the headings.
- **The Luna gate was not met at the final gate.** The canary missed
  one check because the scenario's truth data expected conjured items
  that the server removes at login. The eval loop took this as its
  first brief (scenario-data) instead of a separate fix run.
- **The eval workflows grew past the size guideline.** Round 2 ran 6
  fix briefs and round 5 ran 8, over the at-most-4 rule. On 2026-09-27
  the maintainer set the workflow size guideline back to medium (fewer
  than 10 agents per workflow) for the new usage week. Round 6 had
  already started, so it kept its size.

## 6. Iteration numbers

### Eval rounds

| Round | Pass rate | Briefs taken | Briefs landed | Median tool calls | Median wall time | Run duration |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.46 (6 of 13) | 4 | 2 | 4 | 65.1 s | 54 min |
| 2 | 0.54 (7 of 13) | 6 | 5 | 3 | 69.8 s | 64 min |
| 3 | 0.62 (8 of 13) | 5 | 4 | 7 | 145.7 s | 64 min |
| 4 | 0.69 (9 of 13) | 5 | 5 | 4 | 65.3 s | 67 min |
| 5 | 0.77 (10 of 13) | 8 | 8 | 3 | 28.1 s | 84 min |
| 6 | 1.00 (13 of 13) | 4 | 4 | 3 | 22.7 s | 47 min |

- "Briefs taken" counts distinct `fix:` labels in the run's journal,
  and "Briefs landed" counts `land:` agents. Round 6 counts the 4
  briefs of the restart; the stopped launch had one more
  (durable-run-dirs), which did not land.
- **The wall-time ruler changed in round 4.** In rounds 1 to 3 `wallSec`
  ran to harness exit, which added the 30 s done wait and about 20 s of
  logout. From round 4 (`f67f0c1`) it ends at the accepted answer. From
  round 6 (`47d83e6`) scenarios with steers or partner actions end at
  the last reply. Compare wall times only within the same ruler.
- Round 3's medians rose because two map-0 scenarios played for the
  first time instead of being blocked by the preflight.
- Aborts: 1 in round 1 (an eval defect), 1 in round 5 (the worktree
  removal), 0 in the other rounds. Round 6 met 48 of 49 checks; the miss
  is a stretch check, not a pass condition.
- Round 7 has 4 briefs written and not run (section 12 of the spec).

### Build

| Phase | Run | Tasks landed | Blocked at the end | How they were unblocked |
|---|---|---:|---|---|
| 1 | `wf_5d29ac06-e48` | 26 | none | - |
| 2a | `wf_772d7dbf-26a` | 1 (F8d) | none | - |
| 2b | `wf_fb9a5605-c55` | 32 | A1c, A1d, F6b | Fake-pi ownership exception for A1d; A1c failed only because its batch held A1d's failing commit; F6b waited on both |
| 2c | `wf_96e08c41-3b4` | 3 | none | - |
| 3 | `wf_82dd77d1-c8d` | about 57 | U11a, B5, E7f (U10, U11b, P5, P6, F8e waited) | Rulings 36 to 44: blanket fake-pi exception, refusal text for B5, bounded logout waits for E7f |
| 3b | `wf_e3bd451d-990` | 8 | none | - |
| Total | | 127 | | |

Agents per build run, from the journal labels:

| Phase | build | review | fix | review2 | land |
|---|---:|---:|---:|---:|---:|
| 1 | 26 | 26 | 1 | 1 | 11 |
| 2a | 1 | 1 | 0 | 0 | 1 |
| 2b | 34 | 33 | 1 | 1 | 22 |
| 3 | 60 | 58 | 9 | 9 | 26 |

Each run also had one setup agent and one gate agent. Phase 3b had 5
build, 9 review, 4 fix and 7 land agents. `mise ci` grew from 2679 tests
after phase 1 to 3491 after phase 3b and 4006 at the wrap-up gate.

## 7. Reproducing this with omp

omp 18.3.4 has no workflow CLI subcommand. The coordinator measured
these parts that can do the same work:

- the `task` tool, which starts subagents;
- the `eval` tool, which runs code;
- the prompt keyword `workflowz`, which appends a hidden workflow
  notice so that the model writes an orchestration script in its `eval`
  tool and fans out `task` subagents from it (it needs both tools);
- the prompt keyword `orchestrate` (a multi-agent notice; needs
  `task`), `jevify` (bulk classification; needs `eval`) and
  `ultrathink`;
- `omp cleanse` (weighted parallel subagents) and `omp worktree`.

**Nobody has run `workflowz` on this project yet.** What follows is a
mapping, not a tested recipe.

- **Build scheduler.** Each `agent(prompt, { schema })` call becomes a
  `task` call. The readiness loop, the dependency closure, the per-area
  busy flags and the `landChain` promise chain become code in the
  `eval` tool. The landing mutex is plain code in the script, not a
  harness feature, so it moves as it is.
- **Eval round.** The fix, prep, run, cluster and record stages become
  sequential stages of one `eval` script. The pane pool of 6 becomes a
  concurrency limit in that script.

Check these in omp before a run depends on them:

1. **Cached resume.** Claude Code replays an agent from cache when its
   prompt and options did not change (`resumeFromRunId`). The round-6
   restart depended on this, even though its args change defeated it.
   Check whether omp can resume a stopped orchestration without
   re-running finished subagents.
2. **Per-agent journals.** Every agent start and result went to
   `journal.jsonl`. The coordinator, the tally and this record depend on
   them.
3. **A concurrency cap.** Round runs had up to 6 graders plus fixers at
   once. Check what limits parallel `task` calls.
4. **Per-agent model and effort.** Every agent here was pinned to
   Opus 5.5 medium. Check that a `task` call can set the model and the
   effort, or that roles (`task`, `reviewer`) map to the right models.
5. **A landing mutex.** Only one agent may rebase and push at a time.
   This works only if `eval` code can await subagents in order.
6. **Structured outputs.** The scripts branch on `status`, `verdict`
   and `briefs` fields from JSON schemas. Check that `task` returns
   validated structured results, or add parsing and a retry.
7. **Usage reports.** Tokens, tool uses and duration per run came from
   the completion notice. Check where omp reports them.

## 8. Appendix: the reusable scripts

- [`workflows/build-scheduler.js`](workflows/build-scheduler.js)
  is `pi-epic-build` in its final form, with the blocked-area patch.
  It ran phases 1, 2a, 2b and 3.
- [`workflows/eval-round.js`](workflows/eval-round.js)
  is `pi-epic-eval-round` in its final form (file time 09:17:48 UTC, the
  round-6 launch; the restart changed only the args). It ran rounds 1 to
  6.
- [`workflows/tally.ts`](workflows/tally.ts)
  computes the totals in section 1.

The machine paths are named constants at the top of each script
(`REPO`, `WORKSPACES`); the rest is as it ran. The scripts are Claude
Code Workflow scripts: they use the harness globals `args`, `agent`,
`phase` and `log`, and a top-level `return`, so they do not run as
plain modules. `tsconfig.json` and `biome.json` do not include `docs/`.
