Date: 2026-09-26. Status: implementation complete on draft PR #367 (branch
`epic/pi-harness`), awaiting the maintainer's merge. He accepted every
decision taken in his place (R41). Eval round 6 is the last round (R40).

This spec records the decisions, the design and the evaluation plan for the
Pi harness epic. It summarises and links; the full records are in
[`2026-09-26-pi-harness-epic/`](2026-09-26-pi-harness-epic/) (see the
[Evidence index](#10-evidence-index)). It builds on the spike design
[2026-09-25-pi-harness-design.md](2026-09-25-pi-harness-design.md) and is
the recorded decision that the roadmap's "Candidate epic: the Pi harness"
asks for. Marks: **measured** (a command ran and its output was seen),
**read** (read in the cited file), **inferred** (design reasoning).

## 1. Goal and success criteria

**Goal.** Luna (`openai-codex/gpt-6-luna` at `high` thinking) plays World of
Warcraft 3.3.5a through an in-process harness on stock Pi 0.87.1 and the
shared tuicraft core. The harness gives a small model intent tools that
answer the agents' measured CLI pain, a typed game log, rare wakes, a
round-1 UI with Nerd Font glyphs, and Jev split-second fight runs under the
steering agent.

Success criteria, each with its status at the close of the epic (head
`7df79a7`):

1. **Migration**: Bun workspaces `core`, `cli`, `factory`, `devtools`,
   `harness`; `mise ci` green; legacy live suite 21/21. **Met**
   (measured): `0282fe4`, live gate 21/21 in 105.7 s.
2. **Harness plays**: `bun packages/harness/src/entry.ts --profile <soap
   JSON>` logs in a throwaway character, and Luna plays through the ten
   tools of section 6.B in an Orca pane. **Met** (measured): the BOOT gate
   (phase 2c), the tool smoke (final gate) and 78 eval runs over rounds
   1-6.
3. **Tools answer the pain**: each top-8 pain point (section 3.1) has a
   named tool, guard or log answer; each eval friction item points at one
   tool, event, panel or core change. **Met** (read): section 6.B maps the
   pain points; every friction item carries one area, and the open ones
   are in [Future work](#12-future-work).
4. **Rare wakes**: pushed events average 25 tokens a minute or less
   with the rules of section 6.C. The simulated range over all proposed
   rule sets is 15-53 tokens a minute (section 3.2). **Not measured**:
   no round counted pushed tokens a minute. Round 6 found stale wakes
   (cluster 4), and the quiet-wakes brief is future work.
5. **Grader record**: every checked event is a typed `gamelog.jsonl` row,
   keyed by character. **Met** (read): graders check typed rows of each
   run's own `gamelog.jsonl` (decisions 112 and 135).
6. **UI round 1**: tool renderers, a 4-row unit-frame footer, event cards
   and a ticker, with `nerd`, `unicode` and `ascii` glyphs. **Met**
   (measured): the U11b pane smoke passes 13 of 13 checks (phase 3b).
   Stale panel cards and `not_implemented` ticker rows are future work.
7. **Jev runs**: `engage` runs the core Jev loop (1-5 Hz) as the
   split-second layer; Jev decisions go to the log, not to the model.
   **Met** (read): `engage` runs the Jev loop in every kill scenario
   graded by the rounds, and all of them pass in round 6 (section 11).
   Jev does not heal at low HP (round 6 cluster 3); that is future work.
8. **Evals stop**: rounds in Orca panes iterate until a stop rule of
   section 8 fires. **Met by R40**: the maintainer stopped the loop after
   eval round 6 at 13 of 13 (1.00), which replaces the 90 %-twice and
   plateau rules. 24 of the 37 catalogue scenarios did not run.
9. **Legacy green**: `mise ci` all epic; `mise test:live` at the migration
   and final gates; no new CLI verbs. **Met** (measured): `mise ci` green
   at every gate; the live suite 21/21 at the migration gate, at every
   phase 1 task that ran it, at the final gate (`11e717c`) and again at
   the close (`7df79a7`, 276 `expect()` calls, 104.68 s).

## 2. Decisions

The maintainer ruled entries 1-41. The decisions that agents took in his
place are listed one list per kind, and R41 accepts all of them
([below](#decisions-taken-in-the-maintainers-place-accepted-by-r41)):

| Kind | Lines | Ids |
|---|---:|---|
| Spec review settlements | 16 | 1-16 |
| Contract decisions D1-D16 (by reference to the contract) | 3 | 17-19 |
| Coordinator and advisor rulings | 11 | 20, 21, 36-44 |
| Build and eval-fix deviations | 111 | 22-29, 31-34, 45-144 (not 110) |

Ten of them change what a player sees in play. They are worth reading
first because they alter the design text a player would go by, or they
change core, which the legacy CLI's `goto` and `cycle` share:

- **20, 122** `engage` refuses a unit tapped by another player and names a free one: that kill would give no loot, XP or quest credit.
- **62** `engage` walks toward a unit it remembers but cannot see, and refuses `not_in_view` when it is still not there.
- **64** A coordinate goal on a multi-floor column takes the character's own height, which B.3 forbade.
- **90** `travel` refuses while something attacks the character and offers `engage` instead.
- **96** Core: a character with no usable spell now walks in and auto-attacks instead of refusing the fight.
- **105** Core: a route that loses its height trace retries a corridor and a straight line, so more legacy `goto` routes walk.
- **127, 137** Core: route floors follow the previous sample within a climb, and single-floor stairs pass; legacy `goto` changes too.
- **129** `explore` calls `unstick` by itself once, so a stuck character moves without being asked.
- **130** Core: the cycle checks the 30 % mana and 50 % HP limits before each new pull, in the legacy `cycle` too.
- **141** `explore` walks past critters and gray units, and `travel` takes a `for` to name what to look for.

### Maintainer rulings

Rulings 1-38 are from 2026-09-26, recorded in the coordinator's working
notes (not kept); R40 and R41 are from 2026-09-27, and R39 came before
them. Quotes are the maintainer's words as the notes give them (he used
voice mode).
"Framing" marks a coordinator proposal he accepted without objection. The
R-numbers are stable ids that the records cite.

1. **R1 Core is one domain package for everything WoW.** "There should be
   a domain in tuicraft that handles all the wow bits." Framing: today's
   `src/wow` plus the runtime part of `src/lib`, moved whole. It overrides
   the 09-25 design's "monorepo is not a prerequisite".
2. **R2 The legacy shell is the CLI, daemon and TUI as one unit** ("the
   tui"); it "will probably be deprecated". Framing: keep it green, add no
   new verbs. Confirmed by R21.
3. **R3 The harness is greenfield**: "rely on the same core, but with
   completely new UI and state management".
4. **R4 Live tooling** (`mise test:live`, `soap create`) is "very useful to
   reuse or get inspiration from".
5. **R5 Jev placement.** First open: "Jev is more of a Pi harness
   concern... worth debating". Superseded (coordinator's record, not his
   words): the Jev tactical loop is out; he may rebuild it "in a
   different way, using another model"; the
   harness targets "similar tuicraft functionality, but in a pi-centric and
   pi-brained way, leveraging the strengths of using a real harness as the
   paradigm and having access to the capability of building UI". Refined
   (framing, ratified by R29 and R37): the core Jev loop sits behind
   `engage` as the split-second layer; no Jev rebuild in this epic.
6. **R6 Subagents are Opus 5.5 at medium effort only**, review included;
   the `advisor` tool is the only stronger sounding board.
7. **R7 Pause the factory before the move**: "By the time we start on
   this, the factory should be done and we can pause it." Replaced by R17.
8. **R8 Artefacts go where AGENTS.md puts them** (framing): this file and a
   later `2026-09-26-pi-harness-epic-plan.md`, with a Decisions section.
9. **Q1 Scope**: "That's a reasonable slice." In: the move, harness
   skeleton, credentials, tool surface, game logs with rule-based
   promotion, a first panel. Out: typed action results (#233), a Jev
   rebuild.
10. **R9 UI focus**: "creatively augmenting the default Pi UI with visual
    information that we never got around to building in tuicraft".
11. **R10 Agent pain drives the tools**: "Our Pi harness should be designed
    from the beginning to address these pain points."
12. **R11 Eval-driven iteration**: "very thorough, in this session, using
    dozens of subagents playing the game and accomplishing various tasks",
    no CLI baseline; "use the power of RL to design a high performing Pi
    harness for playing world of warcraft with an agent steering and Jev
    issuing split-second decisions".
13. **R12 Conserve the coordinator's context**: agents do the work.
14. **R13 Layout B**: true Bun workspace packages with `@tuicraft/*`
    specifiers, "one big bang migration".
15. **R14 Placement**: factory to `packages/factory`; session-record to
    cli; stale-docs and distil-encounter to `packages/devtools`; test
    support split by importer; two core tests that import `ui/*` move to
    cli. "Reasonable."
16. **R15 Presentation stays in cli**; the harness renders from typed core
    data; `lib/{abort,config,emitter,errors,ignore-failure,paths}` go to
    core, `session-log`, `ring-buffer`, `strip-colors` stay in cli. "Yes."
17. **R16 The inner agent is `openai-codex/gpt-6-luna` at high** (he
    corrected `gpt-5.6-luna`). "Making it work on a dumb model is a far
    greater achievement." Reuse the local Codex/omp login; never refresh a
    shared token.
18. **R17 The factory is off for the whole epic**; one long-lived PR; the
    factory resumes after the merge. Framing: pause work, review and merge,
    disable QA, stop the reaper timer (its 3 h sweep deletes eval accounts).
19. **R18 Evals run in Orca panes**: one eval worktree, one pane per run
    (`eval-<round>-<scenario>-<n>`), a grader subagent drives it with
    `orca-ide terminal send` and `read --screen`, 6-8 panes; the maintainer
    can watch or type into any pane.
20. **R19 Explicit `--profile` and a per-character lock**; no silent
    default; a soap account JSON is a valid profile.
21. **R20 The harness writes its own typed JSONL game log**; no daemon
    `{type,data}` compatibility; `record`/`distil` stay CLI tools.
    "Decent."
22. **R21 The legacy shell stays green all epic** (`mise ci`; `mise
    test:live` at the migration and final gates), no new verbs; core
    changes carry a minimal legacy adaptation in the same commit; no
    harness-only fork of core. "Yep."
23. **R22 Deadline 2026-09-27 00:00 UTC** ("exactly 5h left"; "Until
    [midnight], you have no limit: Go crazy."). Revised: "You can still go
    all out even after midnight if you think it's worth it."
24. **R23 UI gallery accepted** ("insanely well done"); side panel in
    round 2. **R24 Nerd Font glyphs**, `unicode` and `ascii` fallbacks.
    **R25 Jev picks NPC glyphs** (his idea); round 2 by R32.
25. **R26 Migration approved** ("Yep"); landed as `0282fe4`.
26. **R27 Navigation track approved** ("Yep"): F4, F3 (roadmap 3a policy
    change), F1+F2 (reverses the #151 acceptance rule), M3a live re-proof.
27. **R28 Section A approved** (principles and contract): "Sounds good".
28. **R29 Section B approved** (tool surface): "Yes".
29. **R30 Section C approved** (events and wakes): "Yes".
30. **R31 Section D approved** (game log): "Yes".
31. **R32 Section E approved** (UI round 1 and glyphs): "Yes". Jev NPC
    glyphs stay in round 2.
32. **R33 Section F approved** (Luna prompt): "Yes".
33. **R34 Section G approved** (core changes): "Yes". The navigation
    track covers G8 and N1 (section 7).
34. **R35 Section H approved** (runtime): "Yes".
35. **R36 Section I approved** (eval integration): "Yes".
36. **R37 Section J approved** (out of scope): "Yes".
37. **R38 Section K approved with its defaults** ("Yes"): stop reflex and
    Esc halt on; `unstick` built; a second long action refused; `engage`
    guards +3 levels, 50 % HP, 30 % mana; no `--allow-protected`. With
    R28-R38, every harness design section A-K is approved.
38. **Goal** (about 21:00 UTC): deliver the epic on PR #367 autonomously;
    the advisor approves the spec review and the plan; Opus 5.5 medium
    only; record decisions and round results here and in the PR; no time
    limit; do not merge.
39. **R39 Scope**: "keep the scope to this goal to just what was
    discussed so that we can wrap it up and eventually merge the PR".
    Autonomous leveling from 1 to 80 is a long-term project goal outside
    this epic.
40. **R40 Stop at round 6** (2026-09-27): "I think just do this one round
    and then stop at the current pass rate, as it's probably good
    enough." It replaces the plateau stop rule of section 8: eval round 6
    (13 of 13) is the last round of this epic.
41. **R41 Accept the decisions** (2026-09-27): "These are all fine I
    think". He reviewed the decisions taken in his place and accepts every
    one listed under "Decisions taken in the maintainer's place": the spec
    review settlements, contract D1-D16, the coordinator and advisor
    rulings, and the build and eval-fix deviations, including 64 and 129,
    which depart from B.3 and K2.

| Superseded | Replaced by |
|---|---|
| R5 "open", then "Jev loop out" | R5 refined (R29, R37) |
| R7 pause before the move | R17 |
| R22 midnight deadline; eval suite "tone down after midnight" | R22 revised |
| 09-25 design "monorepo is not a prerequisite" | R1, R13 |
| K4 default "N1 waits for a ruling" | R27 |
| Eval suite P1 `soap exec` | t1 service verbs (`5d75de0`) |
| Section 8 stop rules (90 % twice, or a 3-round plateau); criterion 8 | R40: stop after eval round 6 |
| B.3 `travel` never guesses a z for a coordinate goal | Decision 64 (R41) |
| K2 `unstick` only when the model invokes it | Decision 129 (R41) |

### Decisions taken in the maintainer's place (accepted by R41)

The lists below hold every decision that agents took in the maintainer's
place: agent spec review, the plan's contract, coordinator and advisor
rulings, and the builders' deviations from the plan or the design. Each
line gives the settlement and its commit. The bold numbers are stable ids:
section 11 and the PR comments cite them (for example "decisions 115 to
134"). Three ids are folded into another line and have no line of their
own: 30 into 36, 35 into 51 and 110 into 118. The maintainer
reviewed them and accepted every one (R41, 2026-09-27).

#### Spec review settlements

An agent self-review of this spec settled these on 2026-09-26, after the
maintainer approved sections A-K (R28-R38). The advisor accepted them in
his place under the goal (entry 38).

- **1** `engage` takes a new attacker as its next target while `count` allows, else names it in `Danger:`; `travel`, `rest` and `recover` stop `FAILED interrupted`. `4d3bda3`, `c243144`.
- **2** A wake line is `[game <age>] <event>`; a chat wake names the sender, quotes the text and gives the `social` reply call. `4d3bda3`.
- **3** Passive lines never go before a chat wake; they flush at `agent_end`, before the next non-chat wake, and after `[now]`. `4d3bda3`.
- **4** The wake budget is at most 25 pushed tokens a minute (criterion 4); the simulated range is 15-53. `4d3bda3`.
- **5** `<HARNESS_LAUNCH>` is `entry.ts --profile $RUN/account.json --run-dir $RUN`, with the account in a mode-600 file. `4d3bda3`.
- **6** `<HARNESS_QUIT>` is Ctrl-D on an empty editor, then two Ctrl-C within 500 ms if Pi still shows. `4d3bda3`.
- **7** The grader's password scan skips `account.json` and `partner.json`, and the grader deletes both after `soap delete`. `4d3bda3`.
- **8** A grader never retries a login refusal (`aborted`, `launch_failed`); `status 0x4` failures come from checkouts older than `486da85`. `4d3bda3`.
- **9** No Pi tool timer applies to Luna's path, so the 120 s yield stays. `4d3bda3`, `c243144`.
- **10** `engage` skips `tappedByOther` rows, and a wrong flag is a `core` friction item. `4d3bda3`.
- **11** K4 and N1 read as decided by R27, not by K4's default. `4d3bda3`, `30a9cdf`.
- **12** The navigation track counts as landed; graders mark `core` only a movement failure at one of its open places. `30a9cdf`.
- **13** The scenario catalogue holds 37 scenarios, 7 of them from the t1 revision. `c243144`.
- **14** R28-R37 are one entry per section, and R5's superseded reading is marked as the coordinator's record. `4d3bda3`.
- **15** The parse tax is 2,410 of 3,221 CLI episodes (75 %) piped into jq or python. `e86494a`.
- **16** `9a5010c` (SRP reference-server tests) is on `epic/pi-harness` only. `4d3bda3`.

#### Contract decisions D1-D16

The plan's contract
([contract.md](2026-09-26-pi-harness-epic-plan/contract.md) section 5)
states D1-D16 in full; the advisor approved the plan in the maintainer's
place.

- **17** D1: the grader tooling lives in `packages/harness/src/grader/`, because devtools cannot import `ui/glyphs.ts`. `9dc0483`.
- **18** D2: the P6 watcher is tracked (`grader/watch.ts`, task E6b) and writes only into the run dir. `9dc0483`.
- **19** D3-D16: as contract section 5 states them (core surface defaults, reused types, creature queries, `place_changed`, `ToolResult.body` and the rest). `9dc0483`, `4014bc3`.

#### Coordinator and advisor rulings

- **20** Advisor: a named `engage` on a `tappedByOther` unit is `REFUSED tapped_by_other` with a `Next:` to another unit (widened by 122). `4c41f3b`.
- **21** Advisor: the harness login's `authWithRetry(config, { maxAttempts: 2 })` is a transient retry; graders still never retry (8). `1e7fb1f`.
- **36** Coordinator: one ownership exception lets other tasks extend `test-support/fake-pi.ts` (replaces the A1d-only exception 30). `8b41bbf`, `edf18b0`, `c30fb47`.
- **37** Coordinator, E7f: quit waits up to 30 s for the server to end the session and logs `session/logout` `complete` or `timeout`. `3eb79bc`.
- **38** Coordinator, E7f: the grader polls truth every 10 s for up to 90 s until the character is offline, then applies the savedAt rule. `d58fda1`.
- **39** Coordinator, E7f: `pane.ts` quit waits 35 s (was 3 s) before its double Ctrl-C fallback, which killed the harness mid-logout. `d58fda1`.
- **40** Coordinator, E7f: a Ctrl-D that Orca refuses because the terminal is gone counts as sent. `546eca7`.
- **41** Coordinator, E7f: the grader's `scenario` command is the synchronous `showScenario` (lint). `ca293fa`.
- **42** Coordinator, B5: death on the way ends `FAILED died` with `Next: recover()`, not `FAILED interrupted` as B.3 step 7 says. `3a9e226`.
- **43** Coordinator, B5: the generic travel refusal gives its code, core's next step and a Tried/Not tried clause. `fc909bd`.
- **44** Coordinator, B5: a unit goal refused `ambiguous_floor` lists the floors with a `travel` Next; `UNKNOWN_PATH` reads `no_path`. `5a1968f`.

#### Build and eval-fix deviations

Builders changed the plan's code where it did not pass the checks or did
not match the real code, and eval-fix briefs changed the design. Pure
formatting and lint reflows are left out. Rn names the eval round whose
friction the fix answers (R0 is the calibration round).

- **22** C2a: a `catalogAccess` helper starts the warm catalog loads (50-line cap); the load order is the plan's. `e3881ff`.
- **23** C2b: a module-level `nearbySources` builds the nearby rows; `queryNearby` requires `query`; the shared mock reads `attackers?.includes`. `c05f0d1`.
- **24** C6b: the plan's `client-place.test.ts` replaces C0's `not_implemented` stub test. `adfc353`.
- **25** C7a: the `recoverCorpse` stub returns a rejected promise; `client-runs.test.ts` replaces C0's stub test. `781118a`.
- **26** C9: the "response cut after the names" test passes before the change and stays to pin the behaviour. `aa543f1`.
- **27** C14: the corner probe uses (8733.333, -6666.666), the point that tells the July build from the patched one. `c747d95`.
- **28** F5ab: the lost-connection test checks `backoff` and ends with `rt.disconnect()`. `f72a9ad`.
- **29** F5b: `connection.ts` adds a login epoch, one shared closing promise and a single `offline` emit, so a late login cannot undo `/disconnect`. `24a8e2b`.
- **31** A1d: `scrub` and `SECRET` move to `tools/scrub.ts` (500-line cap). `1f6fe4f`.
- **32** L1a: the buffered writer's drain ends in `.catch(ignoreFailure)`. `fb5e038`.
- **33** L12b: the session link target resolves against the run dir. `fdd6393`.
- **34** L3a: `start` moves into a top-level `startRun` (function-length lint). `a16cea0`.
- **45** L4a: an aborted goto returns `stopped`, not `refused` with reason `halt`. `21e1198`.
- **46** L4b: `jevCode` maps reasons that start with `jev_unavailable`; an aborted cycle stops at `started`. `d68bc9d`.
- **47** U2: the footer reclaim clause follows `[now]`; row 2 no longer repeats GHOST or DEAD. `f2e4218`.
- **48** U7: the expanded engage view draws up to 200 decisions, not the last 6. `50219d0`.
- **49** B11: the "Other ways:" line keeps its first item lower case. `e2c6e09`.
- **50** B3: the loot fallback keeps the guid as a decimal string, as core does. `d705dc7`.
- **51** P2, P3: tool notes follow an explicit `TOOL_ORDER`, because the linter sorts `TOOL_TEXT` keys (folds 35). `c362fae`, `d62a010`.
- **52** B7: `completionFlags[0] % 4 === 3` counts as ready; a reward number past the choices is refused `reward_needed`. `212805c`.
- **53** B8: an unanswered buy or sale is `UNCONFIRMED no_answer`; sell_junk has FAILED and PARTLY rules; buy takes a line number. `ab1adcf`.
- **54** B9: repair with nothing damaged is DONE with cost 0, not FAILED. `e459c45`.
- **55** B10: the rest projection judges only the stats under `until`. `9494582`.
- **56** B6: the fallback `emptyLoot` has `windowClosed: true`. `b129dc2`.
- **57** L9b: the reply hint treats `WHISPER_FOREIGN` as a whisper. `95abfc6`.
- **58** U11a: `extension.test.ts` also asserts the two renderer registrations. `e6fca38`.
- **59** P5, P6: the harness doc lists the `no-spells` footer chip and the grader's eleven commands. `8ac5eed`, `c77995d`.
- **60** F8e: the smoke's second pane starts only after the first harness exits (character lock). `8cb5068`.
- **61** U11b: the UI smoke sets `umask 077` and an EXIT trap that cleans up on an early stop. `11e717c`.
- **62** R0 engage-travel: a named `engage` resolves units in view first, walks one leg to a remembered unit, else `REFUSED not_in_view`. `0d946c5`.
- **63** R0 engage-travel: engage fights only a unit in view and alive, else `FAILED target_not_observed`; no Next repeats the failed approach. `7c54404`.
- **64** R0 engage-travel: a point goal without z refused `ambiguous_floor` retries once at the character's height, against B.3 step 3. `7156bd4`.
- **65** R0 engage-travel: `ops/next-guard.ts` turns a Next that repeats the failed call into an ask-human question, except continuations. `2962605`, `39496aa`.
- **66** R0 scenario-data: scenario checks follow measured preset truth (t3-ghostlands-kill accepts levels 14-23); task texts stay verbatim. `f99b2d7`.
- **67** R1 events-lifecycle: meta gets `endedAt` and `exitReason` before and after logout; new exit reasons `sigterm`, `sighup`, `sigint`, `fatal_error`. `a1411d2`, `93383a9`.
- **68** R1 events-lifecycle: the exit recorder's SIGINT listener stands down while Pi's later listeners are attached. `3d2cf16`.
- **69** R1 events-lifecycle: `exit.begin()` waits one microtask so every listener of the signal runs first. `cf0ca65`.
- **70** R1 events-lifecycle: `travelLeg` writes the `nav/route_*` rows, so every approach leg logs them. `b6c688d`.
- **71** R1 item-names: vendor lists, loot and item pushes wait up to 2 s for item names; `vendor/list` gains `names`. `8235ab6`, `16adbe9`, `e02e2df`.
- **72** R1 item-names: buy takes a list number, an exact name or `item <id>`; a partial name must be unique. `d723f24`, `c85e1b0`.
- **73** R1 item-names: core `CombatAura` gains an optional spell name, and aura rows gain `name`. `1a3ab5a`.
- **74** R1 next-hints: structural refusals ask the human, start-side faults get `unstick`, and travel is offered only for transient stops. `b82acbd`.
- **75** R1 next-hints: a quest with nothing to kill points at its turn-in NPC; `engage(quest)` on a complete quest is DONE. `0ff7425`, `8a580fb`.
- **76** R1 next-hints: rest eats again, runs to `until` within 110 s and stops `PARTLY no_regen` after 10 s without gain (B.7: 30 s). `7748dc4`, `665625b`.
- **77** R1 next-hints: the next guard also exempts `max_starts_reached`. `152d6ff`.
- **78** R1 runner-steers: the t7-halt-resume resume steer fires 20 s after the first answer after the stop steer. `de5b654`.
- **79** R1 runner-steers: `blockedBy` keys grade a run blocked before any account is made; an unfired trigger drafts blocked. `2fdbfbc`, `6b00104`.
- **80** R1 runner-steers: t3-ghostlands-kill z 88.66, the t1-walk-to-npc stop order check and the t7-halt-resume death rule (t6 preset: see 94). `71d92ca`.
- **81** R1 runner-steers: runs on a shared spawn start 4 yd or more apart, and each run writes `grader/concurrent.json`. `dad4762`, `5e40c87`.
- **82** R1 pushed-batch: a new `combat/target_died` event wakes like `attacked` when no run is active. `5601aa2`.
- **83** R1 pushed-batch: an engage consumes its own fight, kill, XP and loot rows and reports them in its result. `2c3edf8`, `1483df8`, `67f63d9`.
- **84** R1 pushed-batch: emote notices stay in the game log and leave the ticker. `b23160d`.
- **85** R2 nav-coverage: navigation opens maps 0, 1, 530 and 571 lazily by name; other maps refuse as unsupported. `ff0203b`, `cafecd8`, `61a7933`.
- **86** R2 nav-coverage: a route start up to 1 yd above a column's single floor plans from that floor. `09e5158`, `a1291a8`.
- **87** R2 next-progress: a same-call Next stands until the repeat guard sees no progress; three `loot_denied` codes become continuations. `2093167`.
- **88** R2 next-progress: engage detail text gives stop reasons in plain words; a fight with every target blocked is REFUSED. `ed4a2de`, `a1911b4`.
- **89** R2 explore-bearings: explore skips refused bearings per cell, tries both 45 degree neighbours and caps at 6 leg rounds. `a1e9f5e`, `e28b04a`, `f708de7`.
- **90** R2 explore-bearings: travel refuses `attacked` with an engage Next while an attacker is on the character. `d92b70f`.
- **91** R2 explore-bearings: the empty look hint is a bare explore; `target_not_observed` gives a look step; a second obstruction asks the human. `7b95c67`, `857a700`, `4f9548c`.
- **92** R2 round-hygiene: an answer that ends in a question waits under the stuck rule instead of ending done. `63581c8`.
- **93** R2 round-hygiene: kill scenarios name a target field, and `mise eval run` does not start on a busy field. `34c51fc`, `32df3f8`.
- **94** R2 round-hygiene: t6-die-and-recover uses the fresh level 1 priest; the first human input logs `task_landed`. `bb24d6d`, `dc0016d`.
- **95** R2 engage-continuity: loot walks within 4 yd of a lootable corpse, and a release-only open moves on (`abandonOpen`). `7cdddee`, `b4df16f`.
- **96** R2 engage-continuity: a character that can melee but has no usable spell auto-attacks; `target_unreachable` after 5 s without approach. `0375545`.
- **97** R2 engage-continuity: each queued unit is checked again before its fight and skipped if dead, tapped or engaged by another. `10cace1`, `9a30b2f`, `b4df16f`.
- **98** R2 engage-continuity: the fight count carries across the cycles of one run. `ae05d0d`.
- **99** R3 act-before-ask: the danger line ages a hit from the last HP drop and says "is coming at you" before any hit. `a721223`.
- **100** R3 act-before-ask: repeat calls carry distance and attackers, and engage on an attacker is never blocked. `74bbe0d`.
- **101** R3 act-before-ask: under attack a blocked Next becomes engage on the attacker; a positional failure explores before it asks. `bd9b44e`.
- **102** R3 quest-handoff: core `WorldHandle` gains `itemLabel`, so the harness can name reward items. `9bae34d`.
- **103** R3 quest-handoff: the harness quest record keeps the details text and the ender; turn-in reports XP, money and items. `b895c86`, `71a4488`.
- **104** R3 quest-handoff: engage and loot add `Quest N complete` and point at the ender or giver. `8d9d498`.
- **105** R3 unit-reach: a lost height trace retries the mesh corridor, then the straight line, on one walkable floor, for every route. `466760e`.
- **106** R3 unit-reach: the cycle walks a route to each target beyond 30 yd and skips a target with no route. `d1d4b02`.
- **107** R3 unit-reach: a gray kill completes as gray and a non-gray kill with no XP as `no_xp_kill`. `a416721`.
- **108** R3 t6-and-grader: t6-die-and-recover heads northeast, where 58 measured Springpaw Stalker fights put the field. `99f83b6`.
- **109** R3 t6-and-grader: the rescue nudge asks for another way to finish, not for a report of the blocker. `eb914da`.
- **111** R3 t6-and-grader: `wallSec` ends at the accepted answer, and `exitSec` keeps the time to harness exit (widened by 136). `f67f0c1`, `eae7f06`.
- **112** R3 t6-and-grader: draft checks carry the first and last matching rows, and the draft verdict is null. `7795bd8`, `39a707d`.
- **113** R3 t6-and-grader: t3-kill-one-hunter splits its check into ranged-cast and pet-attack. `01bd061`, `84d654e`.
- **114** R3 t6-and-grader: the runner writes the soap bot count and bot risk to `run.json`. `ddcbc4e`.
- **115** R4 luna-rules: the session loader builds the Luna prompt, so the recorded system message is the full prompt. `f7d1cbca`.
- **116** R4 luna-rules: the prompt is 465 words, with no event list and no half-budget clause; rule 5 walks toward the goal. `c79a3136`.
- **117** R4 check-truth: total-xp counts only kill-credited XP; answer-values truth reads jev.jsonl within 2 s, else the snapshot. `4839ca28`, `8c0cd6fa`.
- **118** R4 check-truth: `mise eval run` waits on a busy field by default, polling every 15 s for up to 20 min; `--no-wait` refuses (folds 110). `b57337f`, `57d1891b`, `091c66bb`.
- **119** R4 check-truth: a look over 60 yd snapshots at its own radius; `tool/result` carries the text the agent saw. `db07aff1`.
- **120** R4 tool-text-polish: recover and death texts give distances and fight time ("alive again 29 yd from your corpse"). `9e0ea8ad`, `0663aec5`, `f5cc3464`.
- **121** R4 tool-text-polish: the `human_waiting` refusal quotes each pending human message. `3c79716f`, `002d3f9c`.
- **122** R4 tool-text-polish: the tapped refusal's Next falls back to the nearest untapped hostile within the level cap. `cac86ee8`.
- **123** R4 tool-text-polish: results print mana as values and percent; the nearest hostile skips tapped units. `423f81d6`, `4711107f`.
- **124** R4 find-and-remember: travel and interact walk to an NPC's last-known point, else `not_at_last_known`; role NPC sightings do not expire. `79756db1`, `8e33d59d`.
- **125** R4 find-and-remember: look ranks by relevance only when the list is cut, and `look(name)` lists remembered units. `09b00cc7`.
- **126** R4 find-and-remember: explore walks up to 100 yd, turns up to 90 degrees and ends DONE when all ground ahead is explored. `ea9f7d4e`, `fa597729`.
- **127** R4 route-columns-and-pulls: a route keeps the one floor within a climb of the previous sample. `e9957e13`, `606e668f`.
- **128** R4 route-columns-and-pulls: a goto from a stale predicted pose settles 0.25 to 1 yd below the predicted z. `e51ba337`.
- **129** R4 route-columns-and-pulls: unstick routes to open ground 8 yd away, and explore calls unstick once by itself. `6a63bbf6`, `fb99b053`.
- **130** R4 route-columns-and-pulls: core `cycle-gate.ts` checks 30 % mana and 50 % HP before each new pull; quest runs pick targets at any distance. `8f6d3816`, `3839ddcb`, `ff7240d8`, `df23b70b`, `c14e7f86`.
- **131** R4 hunter-ranged: ranged-slot slows count, a pet command or Auto Shot counts as engagement, and `combat/pet_attack` is new. `31c8a8dd`, `0fedbc7e`, `09ff6b09`.
- **132** R4 events-polish: runs, quest engages and interacts consume their own passive rows. `16ee17e1`.
- **133** R4 events-polish: non-kill XP names its source (new `area_explored` event), and a route's legs log as one move. `010712f9`, `c4957085`, `a2cb3604`, `114fb0ef`.
- **134** R4 ui-polish: silent fd and rg stubs stop Pi's offline warning and never shadow host tools. `0457d8a5`.
- **135** R5 stale-checks: a check that a measure decides carries `met: true`; pet-attack loses its `blockedBy`. `dc08b90d`, `2097d1e7`.
- **136** R5 stale-checks: steered scenarios end `wallSec` at the last reply; run dirs stay in the eval worktree (maintainer ruling). `47d83e6d`.
- **137** R5 northshire-route-floors: a sample on a single-floor column may rise or drop 1.25 yd (a stair riser). `f095c9d9`.
- **138** R5 event-delivery: passive rows that land during a call are appended to its result (up to 5 lines). `7cbccd8a`.
- **139** R5 event-delivery: exploration XP never wakes the agent, and a stale `attacked` wake is dropped at send time. `7cbccd8a`.
- **140** R5 event-delivery: the ticker shows each `not_implemented` opcode once; vendor rows log only on change. `59201f1d`, `8a4e5909`.
- **141** R5 search-and-recover: travel takes an optional `for`; explore stops only on an attackable non-gray unit and lists the rest on `Passed:`. `b7df9d18`.
- **142** R5 search-and-recover: a route refusal steps through unstick, a 25 yd waypoint, then the human. `04ba1e17`.
- **143** R5 search-and-recover: explore never resends a refused goal and stops `obstructed` when no bearing is left. `506b516c`.
- **144** R5 search-and-recover: look tells the agent that a name goes in `name`. `7bfd4baf`.

## 3. Context

### 3.1 The problem

Agents drive tuicraft through a CLI over a daemon, one verb at a time. The
pain-point study read 4,399 episodes from 131 sessions on this machine
([pain-points-report.md](2026-09-26-pi-harness-epic/pain-points-report.md));
2,410 of 3,221 CLI episodes (75 %) piped into jq or python (measured there). The revised ranking is
distinct sessions × severity over the 3,922 game-facing episodes (114
sessions); a second critic reproduced every count (measured there).

| Rank | Id | Pain | Sessions / 114 | Severity |
|---:|---|---|---:|---:|
| 1 | 2.3 | Actions return an intent, not an outcome | 70 | 3 |
| 2 | 2.6 | Long actions block or must be polled | 49 | 3 |
| 3 | 2.9 | History only through a draining `read` or `session.log` | 48 | 3 |
| 4 | 2.10 | Parse tax and schema guessing | 58 | 2 |
| 5 | 2.4 | Movement refusals give no usable next move | 38 | 3 |
| 6 | 2.2 | Hostility, creature type, NPC role are not fields | 20 | 4 |
| 7 | 2.7b | World readiness guessed with sleeps | 36 | 2 |
| 8 | 2.11 | No-change loops | 21 | 3 |

The top three rank verb use (exposure) as much as harm (critic caveat). The
harm rows 2.1 (danger invisible), 2.7a (wrong character) and 2.17 (silent
parse errors) stay in scope as guard rails.

### 3.2 Spike facts

- The 09-25 spike chose stock Pi through its SDK under Bun over omp.
- [luna-runtime.md](2026-09-26-pi-harness-epic/luna-runtime.md) (measured):
  `openai-codex/gpt-6-luna` is in Pi 0.87.1's registry (272k window);
  first event 2.2-2.7 s, a turn 4-8 s; parallel tool calls work; omp's
  `agent.db` holds the only live Codex credential; `bun build --compile`
  works; Orca `read --screen` shows the Pi TUI cleanly in 91-131 ms.
- [live-spike.md](2026-09-26-pi-harness-epic/live-spike.md) (measured):
  3/3 kills with server kill credit; loot worked once a real loot tool
  existed; at most $0.006 a round. Failures: no exploration when the
  10-row snapshot showed no target; 27 of 39 gotos refused near the
  spawn; a near-miss tool gave a false "no offers" claim.
- [event-volume.md](2026-09-26-pi-harness-epic/event-volume.md): naive
  push is about 9,800 tokens a minute and 500k+ in a Jev fight; rule-based
  promotion gives 15-53 tokens a minute and about 8 wakes an hour
  (simulated over the corpus).
- [live-baseline.md](2026-09-26-pi-harness-epic/live-baseline.md): 21/21
  live tests on `5dca819` in 104.7 s.

### 3.3 What landed before this epic

**#112** (commit `3944263`) made every `on*` hook multi-subscriber with an
unsubscribe function (spike milestone 1). **#156-#159** added the explicit
core barrel, the internal `WorldConn`, nearby rows in core and navigation
observation in core. The 09-25 design text still lists milestone 1 as open;
this spec is the current record.

## 4. Architecture

### 4.1 Packages (landed in `0282fe4`)

| Package | Holds | Files |
|---|---|---:|
| `@tuicraft/core` | `src/wow/**`, `lib/{abort,config,emitter,errors,ignore-failure,paths}`, core test support | 307 |
| `@tuicraft/cli` | CLI, daemon, TUI, `main.ts`, `session-log`, `ring-buffer`, `strip-colors`, session-record tools, live suite | 113 |
| `@tuicraft/factory` | dev factory, prompts, systemd units, `omp-factory`, soap | 62 |
| `@tuicraft/devtools` | `stale-docs`, `distil-encounter` | 6 |
| `@tuicraft/harness` | empty `src/index.ts`; the Pi pins | 3 |

Counts from [migration-plan.md](2026-09-26-pi-harness-epic/migration-plan.md)
§4 (measured there). The root `package.json` has `workspaces:
["packages/*"]` and a `typecheck` script that runs root `tsc`, then
`tsc -p` per package (read).

- **Specifiers.** Inside a package: private `#` imports from its own
  `package.json` (core `#wow/*`, `#lib/*`, `#test-support/*`; cli `#cli/*`,
  `#daemon/*`, `#lib/*`, `#test-support/*`, `#tools/*`, `#ui/*`; factory
  `#factory/*`, `#factory/prompts/*`, `#test-support/*`; devtools
  `#tools/*`; harness none yet). Across packages: only the core exports.
- **Core exports** (`packages/core/package.json`, read; 12 entries, no
  wildcard): `.` → `src/wow/index.ts`; `./session` → `src/wow/session.ts`;
  `./lib/{abort,config,errors,ignore-failure,paths}`;
  `./test-support/{control-fixtures,internals,mock-handle,must,temp-paths}`.
  `internals.ts` is generated and re-exports 12 internals for shell tests.
- **Other packages** have `"exports": {}` and depend on
  `"@tuicraft/core": "workspace:*"`. Only `harness` pins
  `@earendil-works/{pi-agent-core,pi-ai,pi-coding-agent,pi-tui}` at exactly
  `0.87.1`; Dependabot ignores `@earendil-works/*`.
- **Boundaries.** `biome.json` has 12 overrides (read); 6 carry
  `noRestrictedImports`: core, non-test core src (also bans test support),
  all shells, non-test shell src, and two harness overrides that must stay
  last (biome uses the last matching override). Core imports no
  `@tuicraft/**`; shells import only `@tuicraft/core`, `/session`,
  `/lib/*` and, in tests, `/test-support/*`; only `packages/harness` may
  import `@earendil-works/**`; relative paths that climb into another
  package are banned (Bun and tsc resolve them, so biome is the only
  guard). A deep `@tuicraft/core/wow/...` import fails in Bun, tsc and
  biome (measured). Other overrides keep `useSortedKeys` off for
  `packages/core/src/wow/**` and the two relocated core tests (parsers read
  in key order).
- **Docs guard.** `mise lint:docs` fails an instruction doc that names a
  bare `src/<area>` path or a missing `packages/<pkg>/{src,test-support}`
  path (read, `packages/devtools/src/stale-docs.ts`).

### 4.2 Harness package layout (design, H.1; not yet built)

```
packages/harness/src/
  entry.ts, main.ts   flags + PI_* env, then dynamic import of the composition root
  config/             flags, profile, lock          credentials/  omp-store, status
  contract/           ToolResult, details types, GameLogEntry, run kinds (first, then frozen)
  runtime/            harness-runtime, connection, pi-runtime, ready (world_ready)
  extension/          extension, commands, guards, input (stop reflex, yield)
  ops/                refs, settle, range, repeat-guard, travel-leg, loot, recover, danger, sightings, progress
  tools/              define + one file per tool (interact split in three)
  events/             router, rules per domain, guard, delivery, now
  log/ runs/ eval/    schema, store, query; registry, adapters; run-dir, stats, status
  ui/ prompt/         glyphs, footer, ticker, cards, renderers; system-prompt, guidelines
```

The integrator alone owns `contract/`, `tools/define.ts`, `ops/refs.ts`,
`runs/registry.ts`, `log/schema.ts` and `extension/extension.ts`. The
harness brings its own emitter and log store (`lib/emitter` and
`lib/ring-buffer` are not exported). Estimate: core about 1,300 lines plus
an 80 KB JSON table; harness about 8,000 lines in about 75 files (inferred).

### 4.3 Runtime and lifecycle (H)

- **Entry.** Set `PI_CODING_AGENT_DIR=~/.local/state/tuicraft-harness/agent`,
  `PI_OFFLINE=1`, `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`, then import
  `main`, because Pi reads them at module load (measured). `main`: profile,
  lock, run dir, credential check, a process-lifetime `HarnessRuntime`, a
  Pi runtime with no extensions, skills, templates, context files or
  built-in tools and compaction off, a session under `runDir/pi-sessions`,
  connect, `InteractiveMode.run()`.
- **Two lifetimes.** The process owns profile, lock, credentials, the
  handle slot, log, runs, router and sightings; the Pi session owns tools,
  commands, UI and delivery. `/new`, `/reload`, `/resume`, `/fork` rerun
  the extension factory, so the `WorldHandle` never lives in its closure.
  On `quit`: cancel runs, `halt()`, `logout()`, flush, release the lock.
- **Connection**: `offline → connecting → online → closing`, backoff 5, 15,
  45 s, then one wake that asks the human to `/connect`. **`world_ready`**:
  `worldSession` resolved, self pose known, entity count stable for 1 s;
  tools wait up to 10 s, then refuse `not_ready`.
- **Profile and lock (R19).** `--profile` is required (soap session or
  ledger JSON, or a `config.toml`). Refused before any network call:
  accounts `ADMIN`, `DEITY`, `X`, `Y`, `AUCTIONHOUSE`, `TCFACTORY`,
  `TCPRESETS`, `RNDBOT*` and the character `Xiara`. The lock file
  `locks/<ACCOUNT>-<character>.lock` is opened `wx`, mode 0600, and a
  character that a daemon holds is refused too. No `WOW_*` env is read.
- **Flags**: `--profile`, `--run-dir`, `--model` (`openai-codex/gpt-6-luna`),
  `--thinking` (`high`), `--no-connect`, `--wake`, `--glyphs`,
  `--stop-reflex`, `--now-per-call` (off), `--log-entities` (off),
  `--check` (pre-flight only).

### 4.4 Credentials (H.5)

- A custom store for `ModelRuntime.create({ credentials, modelsPath: null,
  refreshOnCreate: false })` reads omp's `agent.db` read-only: the newest
  enabled `openai-codex` OAuth row, `access` and `expires` only. It caches
  on the mtime of the db and its `-wal` file (205 reads in one session,
  measured).
- `modify` never calls the refresh callback (0 fetches, 0 refreshes,
  measured). It returns a row omp refreshed meanwhile, or throws "The Codex
  login expired at <ISO>. Run omp once so that it refreshes the login. Then
  send your message again."
- Start is refused with under 10 minutes left. No token is ever printed.
  Pi's built-in `/login` and `/logout` cannot be caught by an extension
  command; round 1 tries an `onTerminalInput` listener (V7), else a banner
  says they do nothing here.
- The Jev key comes from `TYPESAFE_API_KEY` in the process env only; the
  footer shows a red `no-jev` chip without it.

## 5. Harness design overview

The approved design is
[harness-design.md](2026-09-26-pi-harness-epic/harness-design.md) (A-K plus
two verification passes). A judge scored three panel designs
(observation-first 33/40, situation-stream 30/40, small-model-first 33/40)
and took **small-model-first** as the base, because it wins on cheap-model
usability and token budget (R16). Grafts: the danger line, sightings
memory, generated area names and `status.json` from observation-first; the
`[now]` rules, `/now` and the stop-word rule from situation-stream. The
navigation diagnosis ruled out a straight-walk fallback.

## 6. Harness design by section

### A. Principles and the model-facing contract (R28)

Luna is a cheap model, so ten intent tools do whole jobs in code. Every
result is short text that starts with a status word and ends with one
concrete `Next:` step. Typed data goes to the human, the log and graders.

| Status | Meaning |
|---|---|
| `DONE` | The job finished and a server event confirmed it |
| `PARTLY` | Part of the job finished |
| `RUNNING` | The call yielded early; run `r<n>` goes on and wakes the agent at its end |
| `UNCONFIRMED` | The packet went out; no server answer came in the settle window |
| `REFUSED` | The harness did not act (a precondition failed, or the call repeats a failure) |
| `FAILED` | The harness acted and the server or core refused, or the run ended badly |

- Content: at most 12 lines and about 700 bytes, no glyphs, no JSON.
  `details` holds the typed `ToolResult` (status, reason, next, options,
  `after` observation, run id, game-log evidence).
- A `Danger:` line ends every result while a unit attacks the character.
  Units get refs `u<n>`, never reused; a parameter takes a ref, an exact
  name or a unique part of a name.
- Code guards: exact repeat (same call, refusal, pose within 2 yd and an
  unchanged progress digest); range and preconditions; danger before a
  pull; one run at a time (`busy`); `human_waiting` (Pi reads a steer only
  after the whole tool batch); `world_ready`; 40 tool calls per agent run;
  secrets in `social`; a schema hint after 2 validation errors.
- `look` and `journal` run in parallel, the rest sequentially. `travel`,
  `engage`, `rest` and `recover` start a tracked run and **block until it
  ends**, with `onUpdate` partials every 500 ms; they yield only when the
  human types or after 120 s, and the yield line carries HP, mana and pose.

### B. Tool surface (R29)

Ten tools named for the player's intent; the other `WorldHandle` members
(129 in all, measured) stay behind them. Builders build the ops layer
first; each tool is then a thin composition.

| # | Tool | Kind | Does | Top-8 pain |
|---:|---|---|---|---|
| 1 | `look` | read | self, place, target, run, danger, 6 filtered rows (20 with `within`), nearest of each kind at any distance seen | 2.2, 2.10, 2.11, 2.7b |
| 2 | `travel` | run | go to a unit, corpse or point; `explore <direction>`; `unstick` | 2.4, 2.6, 2.11 |
| 3 | `engage` | run | choose a target (or explore for one), approach, Jev fight or cycle, loot, report | 2.3, 2.6, 2.2 |
| 4 | `loot` | action | whole corpse, one slot after the previous push, names, money, release | 2.3 |
| 5 | `interact` | action | walk into range; talk, accept, turn in, gossip, buy, sell junk, train, repair | 2.3, 2.2 |
| 6 | `rest` | run | eat and drink to a threshold, confirmed by the aura | 2.3, 2.6 |
| 7 | `recover` | run | release, corpse run and reclaim; spirit healer; accept a resurrection | 2.6, 2.11 |
| 8 | `social` | action | say, whisper, party, guild, invite, accept or decline, leave | 2.3 |
| 9 | `journal` | read | quest log, bags with equipped gear, spells, game-log history | 2.9, 2.10 |
| 10 | `stop` | control | cancel one run or halt everything | 2.6 |

- `look` never lists game objects. Its "Nearest" line uses a 30-minute
  sightings memory, so an empty filter still points somewhere.
- `travel` never guesses a z. On a unit goal with a floor refusal it
  retries once with the one floor within 0.25 yd of the unit's z. `start
  snapped off` gives `FAILED start_off_mesh` and `Next: travel(to:
  "unstick")`, a model-invoked step of at most 5 yd. Explore legs are
  planned points, never straight walks.
- Decision 64, accepted by R41, supersedes the B.3 z rule above: a
  coordinate goal on a multi-floor column takes the character's own
  height.
- `engage` picks the nearest hostile at most 3 levels above the character,
  refuses under 50 % HP or 30 % mana (mana classes only), runs
  `startTactics`, `startCycle` or `startQuestCycle`, loots each kill, and
  stops on death, `stop` or 3 Jev timeouts.
- **New attacker rule** (one rule for all runs, inferred; it settles
  V.4 #6). `travel`, `rest` and `recover` stop on a new attacker with
  `FAILED interrupted` (design principle 9). `engage` does not stop: a
  new attacker becomes the next target while `count` allows another
  kill. When `count` allows no more kills, `engage` finishes the
  current kill and returns its normal status, and the `Danger:` line
  names the new attacker.
- `interact` `talk` lists offers with quest ids, vendor stock and trainer
  spells; `buy` matches part of an item name. The quest log is `journal`
  only (the spike's false claim came from one tool for both).
- Not tools, on purpose: raw `face`, `move`, `goto`, `cast`, `attack`,
  `target`; a separate `wait`; relog or `.gps` as a pose sensor.

### C. Events, context and wake rules (R30)

Every core event goes to the game log. The model sees an event only in a
tool result, in a passive digest flushed at `agent_end`, or as a rare wake.
Each agent run starts with a hidden `[now]` line of about 70 tokens.

| Class | Model sees | Wakes | Examples |
|---|---|---|---|
| `wake` | yes | yes (`followUp` while streaming, never `steer`) | whisper, party or guild chat from another character; say or yell naming the character; invites; own death, ghost, resurrection; attacked while no run is active (once per attacker per 30 s); HP under 50 % and 25 % while idle; connection lost; a run end no tool awaited; stuck notice |
| `passive` | batched: flushed at `agent_end`, before the next non-chat wake, and after `[now]` when a human message starts a run | no | nearby say and emotes; XP, items, money, quest progress no tool showed; server pose correction over 5 yd; roster change |
| `log` | only through `journal(about: "log")` | no | Jev records, combat ticks, movement, entity churn, NYI notices (51 % of chat-type lines), own echoes, packet errors (also shown to the human) |

- **Dedupe**: a row a tool result reported is `consumedBy` that call and
  never wakes. Each wake line carries its age.
- **Wake line format** (settles LU.3 #1 and #11). A wake line is
  `[game <age>] <event>`. A chat wake names the sender exactly and quotes
  the text, then gives the reply call, for example `[game 0s] Whisper
  from Kaelyn: "hey, what level are you?" Next: social(to: "Kaelyn",
  text: "…")`. Passive lines are never prepended to a chat wake; they
  stay queued for the next flush.
- **`[now]`**, for example `[now 19:13:31] Fgklibhlflc L10 Priest HP
  190/217 (-23 in 5s) mana 88% alive in combat · Eversong Woods, Fairbreeze
  Village (8813,-6691) server fix 3s · target Springpaw Stalker u9 hostile
  23y 35/137 · attackers u9 · running r4 engage 9s · nearest hostile u12
  41y`, plus a `No progress:` line after 3 unchanged actions; logged as
  `agent/now`. Per-call injection waits behind `--now-per-call` (V1, V2).
- **Human steer mid-run**: a message of at most 5 words whose first word
  (punctuation stripped) is `stop`, `halt`, `freeze` or `hold` halts every
  run in code at once; other text makes the blocking tool yield after Pi
  queued the steer; `/stop` and F9 call the reflex; Esc aborts the turn and
  halts every run.
- **Guards**: 1 wake per 5 s, a bucket of 6 a minute (burst 3), 1 per
  sender per 20 s; self-authored chat stays `log`; `/wake off`; passive
  flush capped at 20 lines. **Budget**: 25 pushed tokens a minute or less
  against 9,764 for a naive push (measured). Compaction is off in round 1.

### D. Game log and log tools (R31)

`<run-dir>/gamelog.jsonl` is append-only, flushed every 250 ms, one row per
event, deltas only, `char` on every row, never a state snapshot (snapshots
were about 97 % of logged bytes, measured). Jev records go to `jev.jsonl`.

```ts
type GameLogEntry = {
  v: 1; seq: number; ts: number; char: string;
  domain: Domain; event: string; class: "wake" | "passive" | "log";
  delivered?: boolean; consumedBy?: string; runId?: string; tool?: string;
  ref?: string; guid?: string; text: string; data: Record<string, unknown>;
};
```

Every event an eval check reads (eval suite P5) is a row:

| P5 event | `domain/event` |
|---|---|
| in-world with character name | `session/in_world` |
| server pose correction | `control/server_correction` |
| movement start and stop | `control/move_start`, `control/move_stop` |
| route start, replace, finish, refusal | `nav/route_start`, `nav/route_replaced`, `nav/route_end`, `nav/refused` |
| chat in and out | `chat/in`, `chat/out` |
| kill credit | `combat/kill_credit` |
| XP and level up | `xp/gain`, `xp/level_up` |
| quest accepted, progress, rewarded | `quest/accepted`, `quest/progress`, `quest/rewarded` |
| item push and coinage | `loot/item`, `money/change` |
| loot open and release | `loot/open`, `loot/release` |
| vendor list and buy (sell, repair) | `vendor/list`, `vendor/buy`, `vendor/sell`, `vendor/repair` |
| trainer list and learn | `trainer/list`, `trainer/learn` |
| cast and attack start | `combat/cast`, `combat/attack_start` |
| fight start and end (also inside a cycle) | `fight/start`, `fight/end` |
| death, release, reclaim | `life/dead`, `life/released`, `life/alive` |

Also logged: `run/*`, `tool/call`, `tool/result`, `tool/validation_error`,
`human/input` (with `stopReflex`), `agent/message`, `agent/now`,
`agent/stuck`, `session/*`, `packet/error`, `aura/gain|fade`, and
`snapshot/world` (at every `look` and every 5 s on change). A check whose
event is missing makes a run `blocked`, not `fail`. The store keeps 5,000
indexed rows in memory and each reader has its own cursor, so reads never
drain. `journal(about: "log")` returns at most 15 rows (tail; search with
`from:Name` or `domain:quest`; since `5m`, a run id or `last_turn`).

### E. UI round 1 and glyphs (R32)

Round 1: tool renderers, a 4-row unit-frame footer, event cards and a
ticker, in regular mode. Renderers draw from `details` only, so they replay
on resume. Model text never contains glyphs.

| Family | Tools | Collapsed | Expanded (`ctrl+o`) |
|---|---|---|---|
| Picture | `look` | vitals, place, nearest hostile or danger | rows plus a mini-map at 112+ columns |
| Live run | `travel`, `engage`, `rest`, `recover` | progress bar, path track or Jev action strip; outcome | legs, last 200 decisions, tried floors |
| Card | `interact`, `loot`, `journal` | status plus 1-3 rows | offers, rewards in quality colours, money line, timeline |
| Line | `social`, `stop` | one status line | evidence rows |

The footer (`setFooter`, exactly 4 rows, no overflow from 30 to 220
columns, measured in the gallery) shows the same facts as `[now]`:

```
<self> Fgklibhlflc 10 Priest  <health>▕█████████████▋····▏175/217  <mana>▕██████████▋·····▏212/300  <xp>▕███▌·······▏41%  <combat> COMBAT
<target> <hostile> Springpaw Stalker 7  ▕████▋·············▏35/137  <damageIn> on you  <debuff> SW: Pain 14s     <cast> Smite ▕█████▋···▏1.1s
<mapPin> Eversong Woods · Fairbreeze Village  8765,-6683 <facingNE> server 3s  <gold>4 <silver>99 <copper>75  <hostile> 1 attacking  <runRunning> r4 engage 9s
gpt-6-luna · high · ctx 14% · wake:on · glyphs:nerd · log 212 rows · <whisper> 1 unread · no-jev/no-nav/no-factions chips in red when missing
```

- Event cards draw each wake or digest as one line per event. The ticker
  is a fixed 6-row widget above the editor (live run, newest events,
  log-only ones included). Human-only lines (NYI stubs, packet errors)
  never reach the model. Commands: `/now`, `/log`, `/stop`, `/connect`,
  `/disconnect`, `/say`, `/w`, `/p`, `/g`, `/wake`, `/snapshot`.
- Glyphs: 83 semantic names in three sets, each one cell wide in pi-tui,
  `Bun.stringWidth` and `wcwidth` (measured,
  [glyphs.md](2026-09-26-pi-harness-epic/glyphs.md)); `--glyphs`, else
  `TUICRAFT_GLYPHS`, else `nerd`. Graders run `nerd` and map frames with
  `tagNerdGlyphs`. `glyphs.ts` lands as code with the UI track.
- Round 2, listed only: fullscreen side panel behind a flag, `/map`
  overlay, quest tracker, terrain layer, Jev-picked NPC glyphs (R25; rules
  first, Jev for the about 23 % generic cases,
  [jev-glyphs.md](2026-09-26-pi-harness-epic/jev-glyphs.md)), log overlay,
  `@Mob` mentions, threat radar, run tally, action ledger strip.
- Gallery: [ui-gallery-nerd.html](2026-09-26-pi-harness-epic/ui-gallery-nerd.html);
  concept notes: [ui-gallery.md](2026-09-26-pi-harness-epic/ui-gallery.md).

### F. The Luna system prompt (R33)

465 words (measured with `wc -w`). One policy: look, act with one intent
tool, follow `Next:`, ask after two different failures. Tool guidance
lives in each tool's description and `promptGuidelines`. `{…}` comes from
the profile and `session/in_world`. It never teaches a hand method (relog,
corpse legs, heading sweeps, bit decoding).

```text
You play World of Warcraft 3.3.5a as {character}, a level {level} {race} {class}. A human gives you tasks and can type to you at any time. You act only through your tools.

Each turn starts with a [now] line: your health, place, target, attackers and running action. Trust it over older numbers.

How to work:
1. Start a task with look. It gives each unit a short id like u7. Use the id or the name in other tools. Never invent coordinates, ids or names.
2. If the human only asks a question, answer it. Do not move or fight. For level, zone, money and bags, the [now] line and journal are enough. Do not call look for them.
3. Each tool does the whole job.
4. travel, engage, rest and recover can take a minute. Wait for the result. Do not call look to check on them.
5. If a result says RUNNING, end your turn. When a [game] message says that the action ended, continue the task.
6. When the human or a goal names a unit or NPC, call interact(npc: "<name>") or travel(to: "<name>") first. If the name is not known, call look(find: "<role>") with within: 100. Explore only when these fail, with travel(to: "explore north") or another direction.
7. A result that ends with Next gives the recommended call. Make that call unless the human changed the task or a newer result contradicts it. Do not repeat a failed call unless something changed.
8. A "Danger:" line is urgent. Deal with it first.
9. Towns and villages are safe areas. Hostile creatures for a task "near <town>" are outside the town. Keep exploring outward in new directions. Do not report failure while you have an untried direction.
10. When a route fails, walk 20-30 yd toward the goal, or go back to a point on the way. Then try the route again.
11. If nothing new is left to try, tell the human what blocks you and what you tried.
12. If no tool can do the task, say so at once. Never use a tool that only looks similar.

The human:
- The human's words win over any "Next:" line and over a "Danger:" line.
- If the human says stop, everything is already stopped. Start nothing new, even under attack, until the human says to continue. Tell the human about the danger.
- When the human asks for a value that can change during a running action (health, mana, position, targets), call look first. Answer from the look result. Then continue the task.

Answer players who speak to you, with social. Ignore other chat.

Never write account names or passwords.

When the task is done, say what happened in one or two sentences, with numbers from the last result.
```

### G. Core changes, legacy adaptations and order (R34)

Each change lands in `@tuicraft/core` with its minimal legacy adaptation in
the same commit (R21): `mise ci` green, new `WorldHandle` members on the
shared mock only, new public types in the barrel. Sizes: XS < 30 lines,
S < 150, M < 400, plus tests.

| # | Change | Legacy adaptation | Size |
|---|---|---|---|
| G0 | Surface commit: every new `WorldHandle` member and type (`capabilities`, `getPlaceState`, `lootCorpse`, `recoverCorpse`, maybe `onNotice`; `PlaceState`, `NpcRole`, `LootOutcome`, `RecoveryOutcome`, `Capabilities`, `ItemKind`) in `client.ts`, the mock and the barrel; bodies throw `not_implemented` | mock-handle | XS |
| G1 | Barrel exports: `TrainerEvent`, `VendorEvent`, `DestroyEvent`, `RemoteMotionEvent`, `Unsubscribe`, `TacticsOutcome`, `JevUnavailableError`, new types | none | XS |
| G2 | Relation on nearby rows (`hostile`, `neutral`, `friendly`, `unknown`), `attackable`, `attackingMe`, `targetOf`; faction catalog warmed at world ready; `capabilities()` | mock; no CLI output change | S |
| G3 | NPC roles: full `NpcFlag` table, pure `npcRoles(flags)`, `NearbyRow.roles` | none | S |
| G4 | `lootable`, `tapped`, `tappedByOther` from `UNIT_DYNAMIC_FLAGS` | none | XS |
| G5 | `CombatState.attackers` and the attacker guid on `attacked` | `combat --json` gains `attackers` | XS |
| G6 | Place: parse `SMSG_INIT_WORLD_STATES` into `getPlaceState()` and `place_changed`; names from a 2,308-entry table generated from `wow_messages` `area.wowm` in devtools | stub row removed; daemon formatter handles or ignores `place_changed` | M |
| G7 | Handle runs `lootCorpse` and `recoverCorpse` over the cycle's tested `loot-run.ts` and `corpse-run.ts` | mock; no CLI verb | M |
| G8 | Navigation F3 + F4 (section 7) | manual and SKILL.md floors text; roadmap 3a note | S |
| G9 | Keep `subName`, `creatureType`, `family`, `rank` from the creature query | none | S |
| G10 | NYI notices as a typed `notice` event, not a fake SYSTEM line | daemon prints them as today | S |
| G11 | `itemClass`, `subclass`, use-spell ids on `ItemLabel`; pure `itemKind()` | none | XS |

**Order.** G0 first (one builder): G2, G6, G7, G10 and G11 all edit
`client.ts`, `index.ts` and `mock-handle.ts`. Then G1, G5, G4, G3, G2 as one
chain (all touch `nearby.ts`). In parallel on disjoint files: G6, G7, G8.
G9, G10, G11 at any time, with G6 and G10 in series (both touch the daemon
formatter). The navigation track delivers G8. Harness-only, not core: HP
deltas, pose labels, fight summaries, settlement, sightings, the stop
reflex, `[now]`.

### H. Runtime and lifecycle (R35)

Sections 4.3 and 4.4 give the runtime. Seven smoke tests run before anyone
builds on a fact that was only read:

| Id | Question | If it fails |
|---|---|---|
| V3 | A steer typed while a run tool blocks: the tool yields after Pi queued it, and the model sees it next | `/stop` still works; raise the yield delay; last resort 20 s returns plus a wait |
| V4 | `tool_result` sees schema-validation failures | graders count `Validation failed` in the session JSONL |
| V5 | `setFooter` from `session_start` works in an Orca pane | a 4-line widget below the editor |
| V6 | A hidden `before_agent_start` message reaches Luna | a visible one-line `[now]` |
| V1, V2 | (flag only) a `context`-hook user message after a tool result is accepted and not stored | `--now-per-call` stays off |
| V7 | `onTerminalInput` can swallow Enter on `/login` and `/logout` | leave them; say so in the banner |

V3 runs first: the blocking-run model rests on it. Round 1 runs from
source; a compiled binary is optional.

### I. Eval integration (R36)

```
<run-dir>/
  meta.json      version, sha, account and character (no password), guid, model, glyph set, flags, times
  gamelog.jsonl  section D                jev.jsonl   Jev requests, results, applied records
  session.jsonl  link to the current Pi session; pi-sessions/ holds every session file
  tools.json     per tool: calls, status words, validation errors, repeat-guard hits, p50/p95 ms
  runs.jsonl     one line per run at its end
  status.json    every 1 s: agent state, active run, last tool call, last progress event
  snapshots/     /snapshot output             workspace/  empty Pi cwd
```

Watcher triggers are stable rows (`fight/start`, `combat/kill_credit`,
`life/dead`, `nav/route_start`, `agent/message`, `human/input`). Graders key
checks on `char` and the guid in `meta.json`, because soap characters share
the `eversong10` spawn. `agent/now` rows and the session JSONL separate "the
harness told it wrong" from "it misread". Movement near Fairbreeze depends
on the navigation track (1 of 9 guid gotos arrive on the old library, 7 of
9 with the fixes, measured live). The track has landed (section 7);
graders mark a movement failure at one of its still-open places as area
`core`.

### J and K. Scope and build questions (R37, R38)

Section 9.1 lists the scope (J). K1-K3, K5 and K6 took their defaults
(R38): stop reflex and Esc halt on (`--stop-reflex off` for evals of the
agent's own stop); `unstick` as a model-invoked 5 yd step; a second long
action refused with `Next: stop(run: "r4")`; `engage` guards as stated,
tuned by round 1; no `--allow-protected` flag. K4 (the navigation
library) is decided by R27, not by its default: the navigation track
delivers G8 and N1 (section 7).

Decision 129, accepted by R41, supersedes the K2 default above: `explore`
calls `unstick` by itself once.

## 7. Navigation track (R27)

Full record: [nav-diagnosis.md](2026-09-26-pi-harness-epic/nav-diagnosis.md)
(live repro on a throwaway `eversong10` account, a grid of 1,681 routes, an
adversarial challenge). **Causes** (measured there):

1. Soap accounts copy `navigation_library` from the maintainer's config,
   which points at an unpatched July build; most `UNKNOWN_HEIGHT` refusals
   come from it.
2. `findHeights` returns nothing at the tile and ADT corner (8733.33,
   -6666.67) next to the spawn, which most routes north cross; the opt-in
   `adt-edges.patch` fixes it.
3. `goto <guid>` drops the unit's observed z (#361), so NPCs in columns
   with 2-5 floors refuse with `ambiguous ground column at destination`.
4. The spike's straight-walk fallback left the character off the eroded
   mesh (`start snapped off`, no `nextStep`); a 5 yd move clears it.

| Fix | Change | Evidence |
|---|---|---|
| F4 | `nextStepFor` text for `start snapped off` and `ground corridor changes surface` ("an object or a building", not "an NPC") | text only |
| F3 | guid `goto` keeps the observed z; on a floor refusal it replans with the one floor within 0.25 yd, else keeps the refusal | prototype 25/25 tests; 5 NPCs go from refused to arrived |
| F2 | `adt-edges.patch` becomes a default patch | grid 910 → 1,132 routes plan, 0 regressions, 1 of 910 routes changes its points |
| F1 | soap accounts use a patched library at a stable path keyed by the patch hash, refused when older than the patches | grid 352 → 910 on the default build |

With F1-F3 prototyped, 7 of 9 live guid gotos from the spawn arrive,
against 1 of 9 on the installed library. The design calls F3 + F4 **G8**
(core code) and F1 + F2 **N1** (library and soap setup). R27 decides
both: the navigation track delivers G8 and N1, and K4's old default ("N1
waits for a ruling") no longer applies.

**Rule changes.** F3 changes the reviewed roadmap 3a rule "deriving
destination Z from a unique native column" for the guid form; the track
records it in the roadmap. F2 reverses the #151 acceptance rule that kept
`adt-edges` opt-in. An offline replay of every recorded M3a route showed no
changed points and every recorded refusal kept; the M3a transcripts
describe the old library, so the track re-proves the M3a routes live.

**Status.** Landed on `epic/pi-harness` from `epic/nav-track`: `fb30883`
(F4), `f80b559` (F3), `ac080e5` (F2), `65b26f7` (F1), `98101a9` (M3a
re-proof) and `c91f70f`, which scopes the re-proof to the slice 1, 4 and
5 routes and lists the routes that still need one (read, commit
messages). The maintainer's own `config.toml` still points at the July
library; the track does not touch it. **Still open**: the Sathiel inn
doorstep, the step edge at 8850, -6685, the platform at z 93, and Halis to
Landra (ambiguous at route).

## 8. Evaluation

Full record: [eval-suite.md](2026-09-26-pi-harness-epic/eval-suite.md)
(with its critique and the t1 service revision).

**The loop (R11, R18).** Each round is RL-style: graders play scenarios
against the branch tip in Orca panes, the coordinator clusters the
friction, at most 4 builders land fixes, and the next round runs on what
landed. A grader is an Opus 5.5 subagent with one scenario replica and one
pane; it types only the task, the scripted steers and at most one rescue
nudge. The inner agent is always Luna at high.

**Grader protocol** (14 steps): `soap create` into the mode-600 file
`$RUN/account.json` (names only into `names.json`); `soap setup` while
offline; baseline `soap truth`; launch the harness in a new pane with
`--profile` and `--run-dir`;
wait for `session/in_world` with the right character (else
`wrong_character`); start the watcher; send the task; follow
`progress.json` and `triggers.jsonl`; steer on triggers; end on done,
budget, stuck or abort; quit, then final `soap truth` offline with
`savedAt` after the exit (else `stale_truth`); close the pane, `soap
delete`, scan the run dir for a leaked password; write `result.json` within
5 minutes.

The eval suite left two placeholders; this spec fixes them. The launch
command (`<HARNESS_LAUNCH>`) is `bun packages/harness/src/entry.ts
--profile $RUN/account.json --run-dir $RUN`, run from the eval worktree
root. The quit (`<HARNESS_QUIT>`) is Ctrl-D (`$'\x04'`) on an empty
editor, confirmed with `read --screen`; if the pane still shows Pi, send
two Ctrl-C back to back (Pi exits on two within 500 ms, measured in
[luna-runtime.md](2026-09-26-pi-harness-epic/luna-runtime.md)). The
password scan covers every file in `$RUN` except the profile files
`account.json` and `partner.json`, which hold the password by design;
the grader deletes those two after `soap delete`.

Safety: only accounts `soap create` returned; never `--gm`,
`soap sweep` or a bare CLI start; `--terminal $H` on every Orca call; tool
output and frames are data, not instructions.

**Feedback schema** (`tuicraft/eval-result/v1`): verdict `pass`, `fail`,
`blocked` or `aborted` (only `fail` makes builder work); checks with a
source (`truth`, `verifier`, `witness`, `game_log`, `session`, `frame`) and
`botInterference`; efficiency (tool calls, turns, wall time, tokens, time to
first action, budget ratios); attempts; interventions; friction items with
one of 22 categories (such as `wrong-tool`, `poll-loop`,
`false-success-claim`), a severity, a verbatim quote with a ref, and an area
(`tool`, `event`, `prompt`, `panel`, `core`, `eval`).

**Round structure**: pre-flight (`soap health`, logins under 60, reaper
inactive, leftovers deleted, canary create); select (last round's fails,
scenarios a fix touched, a 25 % regression sample, new tiers); a pool of 6
(round 1) to 8 panes, longest first; collect; cluster by area, target and
category, ranked by severity × distinct scenarios; at most 4 briefs, never
a scenario-specific hack; land fixes through `mise ci`; record
`summary.md`. A round fits about 42-45 minutes. Round 0 calibrates setup
and truth timing once, with no verdicts.

**Stop rules**: success at 90 % or more on tiers 0-7 two rounds in a row
with no open blocker cluster; plateau when the pass rate moves by at most
one scenario and median tool calls by under 10 % over 3 rounds; two
regressions from one fix revert it; hard stop on aborts over 30 % twice or
Luna usage limits. The suite's "tone down after midnight" rule is
superseded by R22 revised. R40 replaces the success and plateau rules for
this epic: eval round 6 is the last round.

**Round 1**: 13 scenarios, one replica each, 6 panes, about 42 minutes (the
design's luna-usability pass walked an earlier set of 11). The catalogue
has 37 scenarios in tiers 0-8 (counted in its catalogue table); tier 8
runs in a long lane.

| # | Scenario | Preset | Why first |
|---:|---|---|---|
| 1 | `t4-quest-first` | fresh | quest loop on a small model; graded on `rewardedQuests` |
| 2 | `t6-die-and-recover` | eversong10, level 1 | death recovery |
| 3 | `t4-alliance-first` | elwynn1 | first Alliance run, map 0 |
| 4 | `t7-question-while-acting` | eversong10 | a steer while a tool runs |
| 5 | `t7-halt-resume` | eversong10 | stop semantics across Pi, harness and Jev (needs the watcher) |
| 6 | `t3-ghostlands-kill` | ghostlands20 | level 20, the busiest bot zone |
| 7 | `t3-kill-one-hunter` | eversong10-hunter | Jev with a pet and ranged attacks |
| 8 | `t1-walk-to-npc` | eversong10 | movement, the largest pain cluster |
| 9 | `t5-vendor-buy-goldshire` | elwynn10 | exact money check on the other faction's map |
| 10 | `t2-whisper-reply` | eversong10 + partner | pushed events against 500 bots |
| 11 | `t0-hostiles` | eversong10 | relation, the most-reported observation gap |
| 12 | `t0-who-is-near` | eversong10 + witness | nearby shape and bot crowding (needs the watcher) |
| 13 | `t0-self-state` | eversong10 | the canary, started 2-3 minutes early |

**t1 service** ([t1-service-readme.md](2026-09-26-pi-harness-epic/t1-service-readme.md)):
an HTTP service on t1's Tailscale IP gives graders truth and setup without
SOAP or database access. It serves only factory accounts
(`^FAC[0-9A-F]{10}$` plus a join-date check) and refuses protected ones,
reads included; writes need an offline character and never kick. The
branch wraps it as `soap health|presets|accounts|truth|setup|reset`
(`5d75de0`), and `soap create` knows 9 presets: `fresh`, `eversong10`,
`eversong10-{warrior,mage,hunter}`, `elwynn1`, `elwynn10`, `ghostlands20`,
`max80` (`7f0faf3`). **Truth** is the primary grading source: the saved
character row (level, XP, money, position, life, inventory, quests,
rewarded quests, spells, reputation), independent of tuicraft core.
**Setup** writes position, level, money, items, spells and quest state
before the first login; death, auras, cooldowns, windows and groups cannot
be set offline. The server takes 60 logins; SOAP is serial at 30-60 ms a
call; 500 playerbots share the eval maps, never attack an unflagged
character, never invite, and answer whispers. Eval characters never get a
GM level, because a GM-level character commands any bot it whispers.
The README's login-test auth failures (`status 0x4`) came from a
checkout older than `486da85`, which fixed the SRP leading-zero bug on
`main` before this epic; `9a5010c` adds reference-server tests on the
epic branch. A grader therefore does not retry a login refusal: it
records `aborted` (`launch_failed`).

## 9. Out of scope and risks

### 9.1 Out of scope (J)

| Left out | Why |
|---|---|
| Typed action results in core (#233) | Q1; tools settle against core events, and a later ledger replaces the waiters without a tool change |
| A Jev rebuild or Jev event triage | R5 refined; a rebuild can sit behind `engage` later |
| Automatic detour or heading sweeps | rejected by the spatial design; a blind straight walk made things worse (measured) |
| Server-confirmed pose (relog or `.gps`) | eval accounts have no GM level; relog loses corpse state |
| Planner fixes beyond F1-F4 | core navigation track |
| World knowledge (spawn or loot tables) | open; the t1 service makes no world-DB changes |
| Guild management, friends, channels, roll, duel, trade, mail | no round-1 scenario needs them; their events are still logged |
| Party follow | milestone 3b not started; `t2-follow` stays `blocked` |
| A daemon-shaped log for `record`/`distil` | R20 |
| Compaction, RPC or print modes | off in round 1; evals use the interactive harness (R18) |
| New CLI verbs | R2, R21 |
| Round-2 UI and per-call `[now]` | section E; smoke tests V1, V2 |

### 9.2 Risks

Merged from the design's verification passes (V.4, LU.3), the migration
plan (§10) and its verification, and the eval critique.

| Risk | Source | Handling |
|---|---|---|
| The blocking-run model rests on V3 (steer ordering), read but not run | V.4 #1 | run V3 before any run tool |
| `startTactics` fails both synchronously and by promise rejection | V.4 #2 | the adapter catches both |
| Sources not checked: `life/dead.killer`, `session/in_world` race and class, unit level; `area-names.json` import support | V.4 #3, #4, #9 | infer the killer from the last attacker; check the rest while building |
| Pi may have a tool timeout under 120 s | V.4 #5 | read: `pi-agent-core` 0.87.1 tool execution sets no timer; the only tool timeout found is `TOOL_TIMEOUT_MS = 120000` in the bundled Anthropic session tool runner, a path Luna (`openai-codex`) does not use (inferred). That timer equals the yield, so it would race it on that path. The 120 s yield stays; the first live run tool must block for 120 s and return |
| `engage` new-attacker rule conflicts with "runs stop on a new attacker" | V.4 #6 | settled: the new attacker rule of section 6.B |
| Item quests refuse `item_sources_unknown` unless the model names the creature | V.4 #7 | the brief names it |
| `/login` interception (V7) is untried | V.4 #8 | banner fallback |
| Whisper wake line format is not specified (sender needed for `social.to`) | LU.3 #1 | settled: the wake line format of section 6.C |
| After `too_strong`, Luna may report instead of naming the target; the 120 s yield may make it write "done" mid-run | LU.3 #2, #4, #9 | a live run decides |
| `rest` without food at level 1 can loop under the engage guard | LU.3 #3 | `rest` reports how far it got |
| The tapped filter (G4) is not live-verified; `engage` may stall on bot-tapped targets | LU.3 #5 | `engage` skips rows with `tappedByOther`; round 1 checks the flag live; a wrong flag is a friction item with area `core` |
| `look` row cap; `how` reaches Jev only as free text | LU.3 #7, #8 | tune in round 1; a Jev miss is area `core` |
| Standing still under attack after a human stop can kill the character | LU.3 #10 | accepted with K1 (R38) |
| Passive bot chat prepended to a whisper wake | LU.3 #11 | settled: passive lines are never prepended to a chat wake (section 6.C) |
| Everything needs `bun install` (runner, `auto-*` worktrees, old wrappers); Orca setup for `auto-*` unverified | migration §10 #1, verify | post-merge machine-local steps |
| Relative escapes and the test-support boundary are biome-only; biome uses the last matching override | migration §10 #3, #4, #6 | `mise lint` in `ci:checks`; no `biome-ignore`; harness overrides last |
| `internals.ts` opens the wall for 12 internals | migration §10 #5 | move a symbol to the barrel when it becomes public |
| 508 renamed files; open branches conflict | migration §10 #7 | factory paused (R17) |
| The test hook no longer runs `party-store` and `control-replan` on core edits | migration §10 #8 | accepted |
| `mise test packages/harness` exits 1 until the first harness test; `bun test` inside a package writes `packages/<p>/tmp` | migration §10 #9, verify | first module adds a smoke test; use `mise test` from the root |
| Formatters stay in cli; the harness may not import cli | migration §10 #10 | render from typed core data (R15) |
| `t6-death-in-cycle` may never produce a death; budgets are guesses; bots make kill counts noisy | eval critique | `blocked` exits; round 1 recalibrates |
| Terminals that draw East Asian Ambiguous characters wide break the layout | glyphs | `--glyphs unicode` or `ascii` |
| The harness depends on omp staying logged in | Luna runtime | refuse start under 10 min; ask the human to run omp |

## 10. Evidence index

All files are in [`2026-09-26-pi-harness-epic/`](2026-09-26-pi-harness-epic/).
Each is a record copy taken 2026-09-26; its header says which scratch paths
were not kept.

| File | What it holds |
|---|---|
| [harness-design.md](2026-09-26-pi-harness-epic/harness-design.md) | The approved harness design: judgement, sections A-K, implementability and luna-usability verification |
| [eval-suite.md](2026-09-26-pi-harness-epic/eval-suite.md) | 37 scenarios, grader protocol, feedback schema, rounds, stop rules, round 1, critique, t1 revision |
| [nav-diagnosis.md](2026-09-26-pi-harness-epic/nav-diagnosis.md) | Navigation diagnosis in Fairbreeze Village: causes, fixes F1-F5, challenge, M3a side effects |
| [migration-plan.md](2026-09-26-pi-harness-epic/migration-plan.md) | Layout B migration: scores, grafts, specifiers, configs, moves, checks, rollback, post-merge steps, risks |
| [luna-runtime.md](2026-09-26-pi-harness-epic/luna-runtime.md) | Pi 0.87.1 with Luna under Bun: credentials, model, headless calls, renderers, compile, Orca pane |
| [event-volume.md](2026-09-26-pi-harness-epic/event-volume.md) | Event volume measurements and the wake, passive and log rules |
| [live-spike.md](2026-09-26-pi-harness-epic/live-spike.md) | Luna in a spike harness on a live character: results, friction, recommendations |
| [live-baseline.md](2026-09-26-pi-harness-epic/live-baseline.md) | Legacy live suite baseline before the migration (21/21) |
| [jev-glyphs.md](2026-09-26-pi-harness-epic/jev-glyphs.md) | Spike on Jev-picked NPC glyphs: accuracy, latency, cache design |
| [pain-points-report.md](2026-09-26-pi-harness-epic/pain-points-report.md) | Agent CLI pain study: corpus, ranked pain points, taught versus actual, UI map, principles, questions |
| [ui-gallery.md](2026-09-26-pi-harness-epic/ui-gallery.md) | Seven UI concepts with verdicts and the Pi primitive check |
| [ui-gallery-nerd.html](2026-09-26-pi-harness-epic/ui-gallery-nerd.html) | The UI gallery drawn with Nerd Font glyphs, in colour |
| [glyphs.md](2026-09-26-pi-harness-epic/glyphs.md) | The three glyph sets: sources, table, widths, selection, grader use |
| [t1-service-readme.md](2026-09-26-pi-harness-epic/t1-service-readme.md) | The t1 factory service: rules, reason codes, endpoints, presets, vendors, limits |

## 11. Build and evaluation record

Each build phase and each eval round adds a subsection here: what landed,
the gate result, and the smoke and live results. Eval rounds use the
heading `### Eval round <n>`.

Decisions taken during the build are listed in section 2, under
"Build and eval-fix deviations" and "Coordinator and advisor rulings".

### Phase 1

Phase 1 is the core surface and the harness foundation.

- Tasks landed: 26 (C0, C1, C2a, C2b, C3-C5, C6a, C6b, C7a, C7b,
  C9-C14, F1, F2, F5aa, F5ab, F5b, F6a, F7a, F7b, F8a), commits
  `5c488e4` to `c747d95`. None is blocked.
- Gate: `mise ci:checks` passes at `c747d95` with 2679 tests, 0 failing
  (2026-09-27).
- V3 (section 6.H) passes: 3 of 3 tests, stable over 5 runs
  (`5c5c07b`). A steer typed while a run tool blocks yields after Pi
  queued it, and the next model request carries only the steer; a
  "Stop!" steer cancels the run through the reflex before the model
  runs; `session.abort()` ends the run with reason `esc`. A 50 ms yield
  delay is enough on Pi 0.87.1, so the H.7 fallback is not needed.
- Live gate L (`mise test:live`, two throwaway soap accounts): 21 of 21
  for every task that ran it (C2a, C5, C6b, C9, C10, C11). C2a's first
  run gave 18 of 21 because Magistrix Erona (entry 15278) was absent at
  the Sunstrider spawn; a baseline run without the change failed the
  same way, and the rerun after her respawn gave 21 of 21.
- Live probes: C6b read zone 3430 Eversong Woods and area 3431
  Sunstrider Isle at login, then Ghostlands and Tranquillien after
  `.go`; C7b's `recoverCorpse` reclaimed a corpse after 3 legs at range
  30.

### Phase 2a

- Tasks landed: F8d (`e4980f5`).
- V2 passes, 2 of 2: a hidden `wow-now` custom message on a wake run
  reaches the model and is not stored in the session.
- Gate: `mise ci` is green at `e4980f5` with 2681 tests.

### Phase 2b

- Tasks landed: 32, up to `82aa369`. A1c, A1d and F6b are blocked.
- Gate: `mise ci` is green at `82aa369` with 2947 tests.

### Phase 2c

- A coordinator ruling unblocks A1d. A1c, A1d and F6b land, up to
  `8afc48f`.
- BOOT gate passes in an Orca pane: `--check` exits 0 and prints the
  credential line; the TUI footer shows `gpt-6-luna • high`; Ctrl-D
  writes `meta.json` with `exitReason` `quit` and removes the lock; no
  password leaks; `~/.pi` is not created; the compiled binary's
  `--check` exits 0.
- Gate: `mise ci` is green at `8afc48f` with 2976 tests.

### Phase 3

- Tasks landed: about 57, up to `546eca7`.
- Gate: `mise ci` is green at `546eca7` with 3456 tests.
- Blocked at the end of the phase: U11a (the fake Pi had no renderer
  registration), B5 (review found the generic refusal without a
  Tried/Not tried clause) and E7f (the canary aborted twice with
  `stale_truth`, because quit closed the socket 5 s after the logout
  request and AzerothCore logs out after 20 s outside a rested area).
  U10, U11b, P5, P6 and F8e waited behind U11a.
- Scheduler flaw: a blocked task's commits landed with later batches
  from the same area, so B5's code reached the epic branch before its
  review passed. The scheduler now stops a blocked task's area and does
  not flush stopped areas.

### Phase 3b

- B5, E7f and U11a are unblocked by the coordinator rulings (decisions
  36 to 44) and land. U10, U11b, P5, P6 and F8e land after them, up to
  `11e717c`.
- Gate: `mise ci` is green at `11e717c` with 3491 tests.
- Smokes V1, V5, V6 and V7 pass (`smoke-live.md`). The UI pane smoke
  passes 13 of 13 checks (`smoke-ui.md`).

### Final gate

Head `11e717c`.

- `mise ci:checks` exits 0: typecheck passes for the root and the five
  packages (core, cli, factory, devtools, harness); test:coverage runs
  3491 tests across 353 files with 0 failing and 13571 `expect()`
  calls; format and lint check 756 files with no fixes; lint:docs has
  no errors.
- Legacy live suite (`mise test:live`, two throwaway soap accounts,
  both deleted afterwards): 21 of 21, 267 `expect()` calls, 104.77 s.
  The pre-epic baseline was 21 of 21, 264 calls, 104.71 s. No rerun
  was needed. C14 is green.
- Luna gate 2: not met. The canary `t0-self-state` graded fail, 4 of 5;
  the one miss comes from a defect in the scenario's truth data, not
  from Luna. The G2.5 check that a 120 s run returns `RUNNING` was not
  exercised, because no run lasted 120 s.
- Tool smoke (one pane, `eversong10`, Jev key and Codex login valid):
  - "Walk to Marniel Amberlight." passes: `travel DONE`, 1.4 yd away
    after 57 yd in 9.0 s. No `nav/route_end` row is written:
    `contract/log.ts` declares the event and nothing emits it.
  - "Buy some water from her." passes after two refusals: 5 Refreshing
    Spring Water for 23 copper.
  - "Head north and kill one Springpaw Stalker." fails without steers:
    both `travel explore` calls moved 0 yd with every leg refused
    `ambiguous_floor`, and named `engage` and `travel` to the stalker
    failed with `surface_change`. It passed only after a steer to the
    spawn point.
  - "Loot anything left near you." passes with `REFUSED not_lootable`
    and a `look(find: "lootable")` next step.
  - "Rest until you are full." passes trivially at full HP and mana;
    food use showed in a later session (`rest PARTLY time_limit`, 30 s
    with Dry Pork Ribs).
  - The gate report received for this record ends after the rest row,
    so the later smoke prompts are not recorded here.

### Eval round 1

Head `39496aa`. Thirteen scenarios, one run each, in the eval worktree.

- Fix briefs landed before the round: engage-travel (`39496aa`) and
  scenario-data (`4a91967`). item-names and events-lifecycle had not
  landed.
- Pass rate 6 of 13 (0.46). Abort rate 1 of 13 (0.08). Median tool
  calls 4. Median wall time 65.1 s. No earlier round has metrics on
  disk, so there is no comparison.

| Scenario | Verdict | Checks | Tool calls | Turns | Wall s | First action s |
|---|---|---|---|---|---|---|
| t0-hostiles | pass | 3/3 | 1 | 2 | 53.5 | 2.35 |
| t0-self-state | pass | 5/5 | 2 | 3 | 55.8 | 2.42 |
| t0-who-is-near | pass | 3/3 | 1 | 2 | 55.7 | 2.46 |
| t1-walk-to-npc | pass | 2/2 | 2 | 3 | 65.1 | 2.39 |
| t2-whisper-reply | aborted | 1/3 | 1 | 2 | 57.7 | 1.99 |
| t3-ghostlands-kill | fail | 2/4 | 3 | 4 | 63.8 | 2.10 |
| t3-kill-one-hunter | fail | 4/6 | 11 | 12 | 113.5 | 2.38 |
| t4-alliance-first | fail | 0/4 | 10 | 11 | 81.9 | 2.60 |
| t4-quest-first | pass | 5/5 | 5 | 6 | 154.0 | 2.17 |
| t5-vendor-buy-goldshire | fail | 0/2 | 4 | 5 | 63.1 | 2.79 |
| t6-die-and-recover | blocked | 2/4 | 4 | 5 | 103.4 | 2.25 |
| t7-halt-resume | fail | 2/3 | 8 | 11 | 224.7 | 2.33 |
| t7-question-while-acting | pass | 4/4 | 11 | 14 | 325.4 | 3.20 |

No run had a tool error. The only agent misread that decided a verdict
is t3-ghostlands-kill, where Luna stopped after 2 of 8 directions, and
that followed the core fault.

Top friction clusters:

1. Core navigation refuses before the character walks. Map 0 has no
   navmesh (t4-alliance-first, t5-vendor-buy-goldshire: `FAILED
   unsupported_map_0`), and the ghostlands20 start z is 0.44 yd above
   the only floor, so every leg is refused (t3-ghostlands-kill). The
   capability flag still says navigation is available.
2. Eval runner and scenario defects. The runner never sent the
   t2-whisper-reply partner whisper and ended the run as done 30 s
   after the acknowledgement; the t6-die-and-recover priest heals
   itself and does not die; the t7-question-while-acting steer fired on
   the first kill.
3. Pushed event batches: the MOTD with colour codes in the first wake,
   unsorted game times, 16 quest progress rows for 8 kills, quest ids
   without titles, and no event when the halted target in
   t7-halt-resume died to another player.
4. Wrong Next hints and stale engage progress: `Next: travel(...)`
   after `unsupported_map_0`, `engage(quest: ...)` after accepting a
   quest that completes on accept, and `0 of 5 kills` after a kill
   credit.
5. Core fight support: hunter shots are rejected as
   `unsupported_item_requirement` and the pet is not controlled
   (t3-kill-one-hunter); engage reports `target_unreachable` after
   about 5 s on a reachable target (t7-halt-resume).

Briefs for round 2:

- nav-coverage (core): the map 0 navmesh and per-map open, a start snap
  to the single floor, and a per-map capability flag.
- runner-steers (eval): partner actions, no done while a steer is
  pending, nth-occurrence triggers, and deterministic scenarios.
- pushed-batch (events): order, noise, quest titles and a target-died
  event, built on top of events-lifecycle.
- next-hints (tools): no travel hint after a structural failure, the
  complete-on-accept hint, and engage progress from the quest count and
  kill credit.

Deferred:

- Item names in loot, vendor and engage summaries: in flight as
  item-names; re-grade next round.
- Aura names in `aura/gain` and `aura/fade` rows: fold into the
  item-names follow-up.
- Panel: the dead target row (`0/0`), the lone skull glyph on a FAILED
  interact card, the money delta on the turn-in card, and a system
  glyph for system messages.
- Core engage fight choice: early `target_unreachable`, the 3-start
  cap, tapped units, line-of-sight picks, and halt on submit.
- Core hunter support: ranged shots, Auto Shot, the pet in the Jev
  observation, and pet attack.
- Prompt: after a 0 yd move, try unstick once and then ask the human;
  the nearness scale; engage approaches the target itself; the wake
  header is the current self state.
- Tools: `rest` stops at 30 s instead of the `until` threshold; `look`
  prints mana as current/max, NPC service flags as words and the owned
  pet as "your pet".
- Events: damage rows for self and pet.
- Eval: a 60 yd snapshot that logs every unit `look` returned, and
  staggered runs for scenarios that share a spawn preset.
- The ghostlands20 preset start z of 88.66 lives on t1 and needs the
  maintainer; the core start snap covers it meanwhile.
- Harness launch: silence Pi's `fd not found` warning.

### Eval round 2

Head `67f63d9`. Thirteen scenarios, one run each, in the eval worktree.

- Fix briefs landed before the round: events-lifecycle (`cf0ca65`),
  pushed-batch (`67f63d9`), item-names (`d0d8a14`), runner-steers
  (`5e40c87`) and next-hints (`665625b`). nav-coverage had not landed;
  its review verdict is fix.
- Pass rate 7 of 13 (0.54; round 1 0.46). Abort rate 0 of 13 (round 1
  0.08). Median tool calls 3 (round 1 4). Median wall time 69.8 s
  (round 1 65.1 s). Without the two preflight-blocked runs
  (t4-alliance-first, t5-vendor-buy-goldshire), the medians are 4 tool
  calls and 115.2 s.
- t2-whisper-reply, t3-ghostlands-kill and t7-halt-resume went to
  pass. t4-quest-first and t7-question-while-acting went to fail.

| Scenario | Verdict | Checks | Tool calls | Turns | Wall s | First action s |
|---|---|---|---|---|---|---|
| t0-hostiles | pass | 3/3 | 1 | 2 | 57.3 | 2.22 |
| t0-self-state | pass | 5/5 | 2 | 2 | 56.0 | 3.04 |
| t0-who-is-near | pass | 3/3 | 1 | 2 | 55.5 | 2.61 |
| t1-walk-to-npc | pass | 2/2 | 3 | 4 | 67.9 | 2.56 |
| t2-whisper-reply | pass | 3/3 | 3 | 5 | 171.7 | 2.00 |
| t3-ghostlands-kill | pass | 4/4 | 26 | 28 | 254.1 | 1.99 |
| t3-kill-one-hunter | fail | 2/6 | 5 | 6 | 69.8 | 2.20 |
| t4-alliance-first | blocked | 0/4 | 0 | 0 | 0 | - |
| t4-quest-first | fail | 1/5 | 4 | 5 | 115.2 | 2.59 |
| t5-vendor-buy-goldshire | blocked | 0/2 | 0 | 0 | 0 | - |
| t6-die-and-recover | blocked | 2/4 | 6 | 10 | 373.3 | 2.55 |
| t7-halt-resume | pass | 3/3 | 19 | 24 | 361.0 | 2.00 |
| t7-question-while-acting | fail | 3/4 | 24 | 26 | 344.9 | 2.13 |

No run had a tool error. t4-alliance-first and t5-vendor-buy-goldshire
were blocked by the map 0 preflight and should not have been selected.
t3-ghostlands-kill passes only under the scenario's kill band of 14 to
23; the suite says 17 to 23.

Top friction clusters:

1. Eval scheduling and end rules (score about 30, all 13 runs).
   Concurrent kill scenarios share the Fairbreeze stalker field: the
   t7-question-while-acting agent killed four t7-halt-resume targets
   and the t6-die-and-recover target. An answer that asks the human a
   question ends the run as done after 30 s with no rescue nudge
   (t4-quest-first, t3-kill-one-hunter). The t6 level-1 write strips
   the equipped gear. The suite and the scenario files disagree for
   t3-ghostlands-kill, t1-walk-to-npc and t7-question-while-acting.
2. Explore walks (score 14): explore picks a bearing that was just
   refused again, halves its leg on the same bearing, tries no side
   bearings and keeps walking under attack; the empty `look` hint
   always says north (t3-kill-one-hunter, t3-ghostlands-kill,
   t7-question-while-acting).
3. The core fight loop ends or stalls kill runs (score 12). A loot open
   on a corpse more than 5 yd away gets `release_only` (AzerothCore
   `Player.cpp:8045`, verified), which ends the whole kill queue
   (t4-quest-first, 5 of 8 kills, corpse at 8.8 yd). A level 1 warrior
   at 0 rage is blocked `no_supported_combat_actions` 2 ms after the
   fight starts and never swings (t6-die-and-recover). Queued targets
   are not re-checked for death or tap.
4. The next guard sends ask-the-human after runs that progressed, and
   results show raw reason codes such as `loot_denied:release_only`
   and `queue_exhausted` (score 13; t4-quest-first, t3-kill-one-hunter,
   t7-question-while-acting, t6-die-and-recover, t7-halt-resume).

Briefs for round 3:

- round-hygiene (eval): the grader end rule for a question to the
  human, a field key so concurrent kill scenarios do not share a target
  field, a t6 setup that keeps gear, and suite and scenario agreement.
- engage-continuity (core-b, because core-a still holds nav-coverage):
  approach a corpse before the loot open and continue past a failed
  loot, melee auto-attack at 0 rage, and a re-check of each queued
  target.
- explore-bearings (ops-tools-a: `explore.ts`, `travel-report.ts`,
  `look.ts`): record refused bearings, try side bearings at full leg
  length, stop for an attacker, and plain hints for an empty look and
  `target_not_observed`.
- next-progress (ops-tools-b: `next-guard.ts`, `engage-fight.ts`,
  `engage-tally.ts`): ask the human only after a repeat with no
  progress, and plain reason text.

Deferred:

- Prompt: persistence after a lost or tapped target, act on a rescue
  nudge, no confirming look while idle, pull discipline (a hostile
  within 20 yd), "about your level" means within 3 levels, and answer
  own-state questions from the latest result. Do this after the tool
  fixes land.
- Events: `xp/gain` 25 s late with no source; the attacked wake
  delivered after the answer and after the kill; the now-line target
  not cleared on death; the now line should name the nearest units and
  the unit the human named. The stale t7-halt-resume fight rows follow
  from `1483df8` by design.
- Tools: the `look` name filter is not applied to the Nearest hostile
  line; `look`, engage and travel use stale last-seen positions
  differently; mana shows only as a percent; the Bags continuation line
  has no label.
- Panel: the dead target `0/0` footer row, rage shown with the mana
  label, outgoing whisper and system lines shown as `<say>`, the
  `other` kind tag on items, and a cancelled run card that is not
  frozen.
- Core map 0 navigation (nav-coverage in core-a, review verdict fix)
  still blocks t4-alliance-first and t5-vendor-buy-goldshire.
- Core hunter support: shots and Auto Shot are rejected and the pet is
  not controlled (round 1 cluster 5).
- Core: `SMSG_TEXT_EMOTE` is not decoded, so the t2 bot event sender is
  unknown.
- Orchestrator: round selection must skip scenarios whose `blockedBy`
  is still held.
- Eval: Pi prints `fd not found` at startup in every pane.

### Eval round 3

Head `32df3f8`. Thirteen scenarios, one run each, in the eval worktree.

- Fix briefs landed before the round: nav-coverage (`214f317`),
  round-hygiene (`32df3f8`), explore-bearings (`e28b04a`) and
  next-progress (`a1911b4`). engage-continuity (core-b) had not
  landed; its review verdict is fix, because the live suite was not
  run on its head.
- Pass rate 8 of 13 (0.62; round 2 0.54, round 1 0.46). Abort rate 0
  of 13 (round 2 0). Median tool calls 7 (round 2 3). Median wall time
  145.7 s (round 2 69.8 s). The medians rose because no run was
  preflight-blocked this round and t4-alliance-first and
  t5-vendor-buy-goldshire now play; round 2 without its two blocked
  runs had medians of 4 tool calls and 115.2 s.
- t4-quest-first and t5-vendor-buy-goldshire went to pass (t5 for the
  first time, after map 0 navigation). t3-ghostlands-kill went to
  fail. t4-alliance-first went from blocked to fail.
  t6-die-and-recover ended stuck and stays blocked; it has had 0
  deaths in 3 rounds.

| Scenario | Verdict | Checks | Tool calls | Turns | Wall s | First action s |
|---|---|---|---|---|---|---|
| t0-hostiles | pass | 3/3 | 1 | 2 | 59.2 | 2.21 |
| t0-self-state | pass | 5/5 | 2 | 3 | 55.3 | 1.98 |
| t0-who-is-near | pass | 3/3 | 1 | 2 | 55.9 | 2.07 |
| t1-walk-to-npc | pass | 2/2 | 3 | 4 | 67.7 | 2.29 |
| t2-whisper-reply | pass | 3/3 | 2 | 4 | 172.5 | 1.99 |
| t3-ghostlands-kill | fail | 3/4 | 31 | 32 | 263.6 | 2.03 |
| t3-kill-one-hunter | fail | 4/6 | 7 | 10 | 157.9 | 2.04 |
| t4-alliance-first | fail | 0/4 | 7 | 8 | 73.1 | 2.60 |
| t4-quest-first | pass | 5/5 | 8 | 9 | 145.7 | 2.09 |
| t5-vendor-buy-goldshire | pass | 2/2 | 4 | 5 | 71.8 | 3.98 |
| t6-die-and-recover | blocked | 2/4 | 33 | 36 | 479.1 | 1.99 |
| t7-halt-resume | pass | 3/3 | 13 | 16 | 331.5 | 3.05 |
| t7-question-while-acting | fail | 3/4 | 14 | 16 | 354.7 | 2.25 |

No run had a tool error. The failures:

- t3-ghostlands-kill: the agent pulled a pack, and engage reported
  three gray kills as `killed by another player` on a server with 0
  bots.
- t3-kill-one-hunter: Jev has no hunter shots and no pet, and the
  guards sent the agent to the human while a stalker attacked it.
- t4-alliance-first: the accept result lost the objective "Speak with
  Marshal McBride", no event names the ender, and the `no_offer` Next
  pointed back at the same NPC.
- t7-question-while-acting: the agent answered mana 61% from a RUNNING
  snapshot; the truth was 50.7%.
- t6-die-and-recover: engage on a unit refused `no_ground` in 1 ms,
  because the unit route has no ground fallback, and the next guard
  then told the agent to ask the human.

Top friction clusters (all confirmed against the run dirs):

1. Engage cannot reach or credit a target (core, score 16; t6,
   t7-halt-resume, t3-kill-one-hunter, t3-ghostlands-kill). The unit
   route refuses `no_ground` with no ground fallback, follow-on queued
   targets start the 5 s approach watchdog with no route, a melee-only
   fight stops at 25 yd, and gray kills give no kill XP row, so they
   are refused as another player's kill.
2. The harness sends the agent to the human while it can still act
   (ops-tools, score 14; t6, t3-kill-one-hunter, t7-halt-resume). The
   next guard rewrites Next to ask the human after a positional failure
   or under attack, the repeat guard ignores target movement, and the
   danger line gives a hit age from the attack start.
3. The quest flow loses objectives, the ender and rewards (ops-tools,
   score 13; t4-alliance-first, t4-quest-first). The accept result
   reads the dialog after the core cleared it, the turn-in result
   reads money 12 ms before the update, and reward choices show item
   ids.
4. Eval infrastructure defects (score about 12). t6 "head north" leads
   onto ambiguous floors away from the stalker field, the field lock
   exits instead of queueing (three runs started 5 to 15 min late),
   the rescue nudge asks for a report, draft game_log checks come out
   null, and wall time includes the done wait and logout.

Briefs for round 4:

- unit-reach (core-a): route to a unit with the explore ground
  fallback, route each follow-on target before its watchdog starts,
  and credit tapped-by-me and gray kills with 0 XP. It must rebase
  around engage-continuity and not touch the loot files.
- act-before-ask (ops-tools-b): never send the agent to the human while
  a unit attacks it or while a move can still help; the repeat guard
  counts target movement; the danger line ages hits from HP loss.
- quest-handoff (ops-tools-a): keep the objectives text on accept, name
  the ender in results and the journal, point `no_offer` elsewhere, and
  report turn-in rewards and reward choices by name.
- t6-and-grader (eval-infra): a t6 task bearing that leads to the
  field, `--wait` on the field lock, a rescue nudge that asks for
  action, draft fixes, a split hunter pet check, wall time to the
  accepted answer, and the bot count in `run.json`.

Deferred:

- Core hunter support: Auto Shot, shot spells (the item-requirement
  check for an equipped ranged weapon and ammo) and pet attack in Jev.
  t3-kill-one-hunter fails pet-and-ranged and arrows-used for the third
  round; this needs its own feature brief.
- Core: after engage-continuity `dce9a61` lands, check again that a
  melee-only engage still stops at 25 yd (t3-kill-one-hunter). The
  harness `APPROACH_WITHIN_YD` of 25 in `engage-fight.ts` may need a
  melee-only path.
- Tools: explore legs of about 20 yd cost 13 to 19 calls (t6,
  t3-ghostlands-kill); continue until a hostile in the level band comes
  into view, or accept a distance.
- Tools: the `look` 6-row cap hides role NPCs. Add vendor, innkeeper
  and questgiver to the Nearest line and list the omitted names.
- Tools: before a pull, engage names other hostiles within 15 yd of the
  target.
- Tools: an engage RUNNING interrupt offers `look` for current vitals.
- Prompt: act on the first matching unit a result reports; change
  position once before asking the human; call `look` before answering
  a right-now state question; pull discipline; the gray formula and
  the meaning of "about your level"; travel by name before `look`; the
  `[now]` line is current truth.
- Events: `xp/gain` gives the total after the gain and names the
  source; the `run/progress` kill count updates on kill credit;
  throttled vitals while halted; drop stale queued events after a
  final answer; money change reason vendor; no repeated vendor list
  rows; the `[system]` Accepting Whisper line is log-only.
- Panel: card and footer mismatches (XP, mana, `money 0 (+0)`), the
  dead target left in the footer, whisper and system glyphs, the spell
  id instead of its name in the cast widget, the dead glyph on Next
  lines, and `not_implemented` warnings at login.
- Core: decode `SMSG_TEXT_EMOTE`, take the sub-area name from the pose
  instead of printing the zone twice, and add damage-dealt events.
- Eval: `session.jsonl` records Pi's default system prompt, not the
  Luna prompt that `install.ts` sends.

### Eval round 4

Head `84d654e`. Thirteen scenarios, one run each, in the eval worktree.

- Fix briefs landed before the round: engage-continuity (`b4df16f`),
  unit-reach (`a416721`), act-before-ask (`bd9b44e`), quest-handoff
  (`71a4488`) and t6-and-grader (`84d654e`).
- Pass rate 9 of 13 (0.69; round 3 0.62, round 2 0.54, round 1 0.46).
  Abort rate 0 of 13 (round 3 0). Median tool calls 4 (round 3 7).
  Median wall time 65.3 s (round 3 145.7 s). From this round `wallSec`
  ends at the accepted answer (`f67f0c1`); rounds 1 to 3 ran to harness
  exit, which added the 30 s done wait and about 20 s of logout. Most
  of the wall time drop comes from the new measurement, not from
  faster runs.
- t6-die-and-recover passes after 3 blocked rounds, and
  t4-alliance-first goes from fail to pass, after unit-reach, the t6
  bearing change and quest-handoff. t4-quest-first goes from pass to
  fail. Every run ended `done`.

| Scenario | Verdict | Checks | Tool calls | Turns | Wall s | First action s |
|---|---|---|---|---|---|---|
| t0-hostiles | pass | 3/3 | 1 | 2 | 3.6 | 2.56 |
| t0-self-state | pass | 5/5 | 2 | 3 | 8.7 | 5.09 |
| t0-who-is-near | pass | 3/3 | 1 | 2 | 4.1 | 2.32 |
| t1-walk-to-npc | pass | 2/2 | 10 | 11 | 52.0 | 2.30 |
| t2-whisper-reply | pass | 3/3 | 2 | 4 | 65.3 | 2.09 |
| t3-ghostlands-kill | fail | 3/4 | 23 | 24 | 112.8 | 2.50 |
| t3-kill-one-hunter | fail | 4/7 | 8 | 9 | 67.3 | 2.60 |
| t4-alliance-first | pass | 3/4 | 14 | 15 | 58.1 | 2.98 |
| t4-quest-first | fail | 1/5 | 28 | 29 | 335.3 | 3.00 |
| t5-vendor-buy-goldshire | pass | 2/2 | 2 | 3 | 13.5 | 2.99 |
| t6-die-and-recover | pass | 4/4 | 4 | 6 | 81.4 | 3.38 |
| t7-halt-resume | pass | 3/3 | 4 | 6 | 143.0 | 2.56 |
| t7-question-while-acting | fail | 3/4 | 16 | 18 | 339.8 | 2.42 |

No run had a tool error. The failures:

- t4-quest-first: the route back to the hub refused
  `ambiguous_ground_column` on a route segment, and Magistrix Erona
  dropped out of memory once she left view, so the quest could not be
  turned in.
- t7-question-while-acting: the agent answered mana 49% from a RUNNING
  result while Jev read 38.1%. The prompt rule `Answer questions from
  the newest result or [now]` causes it. This is the 3rd round.
- t3-ghostlands-kill: 0 kills. The agent made 12 explore legs of 20 to
  40 yd inside the town and stopped at 113 s of 600 s.
- t3-kill-one-hunter: Jev has no ranged shots for the 4th round; the
  core-b hunter brief is deferred again.

Top friction clusters (score is the sum of severities over runs:
blocker 4, major 3, minor 1):

1. Finding and remembering units (ops-tools-a, score 20; t4-quest,
   t4-alliance, t1, t3-ghost). The `look` 6-row cap hides the quest
   ender or the named NPC, static NPCs are forgotten when they leave
   update range, and explore legs stop at 40 yd and circle the town.
2. Luna prompt gaps (prompt-docs, score 12; t7-q, t4-alliance,
   t3-ghost, t4-quest, t1, t0-self). The agent answers live values
   from a stale result, ignores Next hints, explores instead of
   travel or interact by name, gives up early, and calls a redundant
   look for state answers.
3. Engage cycle (core-a, score 9; t4-quest, t7-q, t3-hunter).
   Objective targets beyond 50 yd are refused instead of walked to, a
   cycle starts new pulls at low mana, and an unobserved queued target
   starts a fight row.
4. Navigation refusals on the route (core-a, score 8; t4-quest,
   t4-alliance, t1). `ambiguous_ground_column` on route segments (the
   landed floor retry covers only the destination), explore legs
   blocked at the start, and an unstick that moves 0 yd.
5. Eval checks that measure the wrong thing (eval-infra, score 5).
   total-xp passes on non-kill XP, one-at-a-time passes with no fight,
   `--wait` is not the default, the snapshot stops at 60 yd when look
   used 100, and t7-q answer-values flips with the truth stream.

Briefs for round 5:

- luna-rules (prompt-docs): act on Next hints, search by name, read
  live values with look, keep going, and replace Pi's coding preamble.
- find-and-remember (ops-tools-a): rank look rows by relevance, remember
  static NPCs, and explore farther.
- route-columns-and-pulls (core-a): pass multi-floor route columns,
  walk to far objective targets, and gate each pull on mana and health.
- check-truth (eval-infra): make eval checks measure what they name.

Deferred:

- core-b: hunter Auto Shot and shot spells in Jev (the equipped ranged
  weapon and ammo requirement, the auto-repeat attribute), pet
  observation and `pet_attack`. Deferred for the 4th round; it blocks
  the t3-kill-one-hunter ranged-cast and arrows-used checks.
- log-events: drop wakes that a tool result already covered, and do
  not start a turn after the final answer (t4-quest, t6, t7-q, t2).
- log-events: `xp/gain` source exploration with the area name, and the
  total after the gain (t6, t3-ghost, t5).
- log-events: `life/alive` with pose, via and corpse distance (t6);
  `loot/open` for every loot and release (t7-halt); `money/change`
  reason `vendor_buy` (t5); no pushed `[system]` Accepting Whisper
  line (t2).
- ops-tools-b: recover text `alive again 29 yd from your corpse`; the
  engage death text gives fight time and walk separately; the
  `human_waiting` refusal quotes the pending message (t6).
- ops-tools-b: tapped-by-other in look and an engage refusal before
  the approach; stop the approach when the target is destroyed
  (t3-hunter).
- ops-tools-b: vendor buy wording `x1 (5 items)`; mana as current and
  max; the journal bag line wrap (t5, t0-self).
- core: parse `SMSG_SPELLNONMELEEDAMAGELOG` and `SMSG_POWER_UPDATE`
  (t7-halt, t0-hostiles).
- core: the sub-area from the pose when areaId equals zoneId (t0-who,
  t2; 2nd round).
- core: aura names from the spell catalog (t3-hunter).
- ui: clear the target and hostile row on death (t7-q, t7-halt,
  t3-hunter); whisper and system glyphs (t2, 2nd round); a neutral
  alive glyph (t6); the `fd not found` warning at start (t0-who).
- log-events: `control/move_stop` cause `arrived`, and no stop and
  start between route legs (t1).

### Eval round 5

Head `0549f3d`. Thirteen scenarios, one run each, in the eval worktree.

- Fix briefs landed before the round: luna-rules (`c79a313`),
  find-and-remember (`8e33d59`), route-columns-and-pulls (`0549f3d`),
  check-truth (`091c66b`), hunter-ranged (`09ff6b0`), events-polish
  (`16ee17e`), tool-text-polish (`002d3f9`) and ui-polish (`0457d8a`).
  Decisions 115 to 134 record what they changed.
- Pass rate 10 of 13 (0.77; round 4 0.69, round 3 0.62), or 10 of 12
  (0.83) without the aborted run. Abort rate 1 of 13 (0.08; round 4
  0). Median tool calls 3 (round 4 4). Median wall time 28.1 s (round
  4 65.3 s), on the same task-to-answer measure.
- t3-kill-one-hunter, t4-quest-first and t7-question-while-acting go
  from fail to pass. t4-alliance-first goes from pass to fail.
- The eval worktree was removed at about 09:04 UTC while graders were
  still grading; the actor is not known. t7-halt-resume aborted after
  its draft (`run_dir_lost`), t0-self-state, t0-who-is-near,
  t2-whisper-reply and t6-die-and-recover have no result.json in
  place, and the run dirs of rounds 1 to 5 are gone. The verdicts
  below are the graders' reports, and the cluster evidence is the
  graders' quotes.

| Scenario | Verdict | Checks | Tool calls | Turns | Wall s | First action s |
|---|---|---|---|---|---|---|
| t0-hostiles | pass | 3/3 | 1 | 2 | 4.2 | 2.72 |
| t0-self-state | pass | 5/5 | 1 | 2 | 4.6 | 2.44 |
| t0-who-is-near | pass | 3/3 | 1 | 2 | 5.3 | 3.73 |
| t1-walk-to-npc | pass | 2/2 | 2 | 3 | 13.7 | 2.29 |
| t2-whisper-reply | pass | 3/3 | 1 | 3 | 62.8 | 63.38 |
| t3-ghostlands-kill | fail | 2/4 | 24 | 26 | 205.0 | 2.35 |
| t3-kill-one-hunter | pass | 7/7 | 2 | 3 | 28.1 | 2.92 |
| t4-alliance-first | fail | 0/4 | 8 | 9 | 27.8 | 3.24 |
| t4-quest-first | pass | 5/5 | 8 | 9 | 114.3 | 6.38 |
| t5-vendor-buy-goldshire | pass | 2/2 | 3 | 4 | 14.4 | 2.20 |
| t6-die-and-recover | pass | 4/4 | 6 | 7 | 80.2 | 2.35 |
| t7-halt-resume | aborted | 0/3 | 6 | 7 | 142.0 | - |
| t7-question-while-acting | pass | 4/4 | 9 | 11 | 315.6 | 3.20 |

One tool error, in t4-quest-first. The failures:

- t4-alliance-first: four routes to Marshal McBride refused
  `ambiguous_ground_column` at route after 0 yd, and the travel Next
  said to ask the human. This is probably a regression from
  `e9957e13` and `e51ba337` (inferred, not reproduced).
- t3-ghostlands-kill: 0 kills. 16 of 17 explore walks stopped before
  100 yd, most at 19 to 40 yd on level 1 critters, gray units or
  NPCs, and the agent gave up at 205 s of 600 s.
- t7-halt-resume: aborted, because its run dir went with the eval
  worktree. The grader's scrollback says all 3 checks would pass.

Top friction clusters (score is the sum of severities over runs:
blocker 4, major 3, minor 1):

1. Run dirs inside a removable worktree (eval-infra, score 17; t7-halt,
   t0-self, t6, t2, t0-who). `mise eval run` writes run dirs under the
   eval worktree's `tmp/evals`, so its removal lost 5 results.
2. Route floor refusal and a dead-end Next (core-a and ops-tools-a,
   score 11; t4-alliance, t6). `ambiguous_ground_column` on a
   Northshire route, a route refusal whose Next is to ask the human, a
   static `Not tried:` list, and explore that re-issues a refused goal
   three times in 5 ms.
3. Event delivery and noise (log-events, score 11; t6, t3-ghost, t1,
   t3-hunter, t2, t5, t7-halt). Passive events such as exploration XP
   and stale attacks arrive after the answer and can wake an idle
   agent, which cost t3-hunter 55 XP in its report; not_implemented
   notices show after each cast.
4. Search for level-appropriate targets (ops-tools-a, prompt-docs and
   eval-infra, score 9; t3-ghost). Explore passes no wanted predicate,
   so any unit stops a walk.
5. Eval check defects (eval-infra, score 6; t3-hunter, t2, t7-q,
   t0-hostiles). pet-attack still carries `blockedBy P5:pet_attack`,
   the draft `wallSec` ends at the first answer, and the t7-q draft
   anchors before the answer.

Briefs for round 6:

- durable-run-dirs (eval-infra): keep eval run dirs outside any
  worktree, with a grader lock, and fix the stale pet-attack, wallEnd
  and t7-q checks; verify hostiles near the t3-ghostlands-kill setup
  point.
- northshire-route-floors (core-a): stop refusing Northshire routes on
  a two-floor column.
- search-and-recover (ops-tools-a): explore for what the task needs,
  and give a concrete Next after a route refusal.
- event-delivery (log-events): attach passive events to the run, do
  not wake late, and keep not_implemented quiet.

Deferred:

- ops-tools-b: in the reward_needed Next, drop `what` when only one
  quest is ready, pick the first reward the class can use and mark the
  others `(cannot use)`; which_quest names the unmatched `what`;
  withWhere inserts after the whole word (t4-quest).
- core-b and ops-tools-b: count engage progress on kill_credit, report
  defensive kills of other species apart from target kills, and
  refresh run/ended progress before success (t7-q, t3-hunter).
- core-b: parse `SMSG_SPELLNONMELEEDAMAGELOG` into combat/damage, and
  check that target `UNIT_FIELD_HEALTH` updates in combat (t6,
  t7-halt; 2nd round).
- core-b: Jev heals below 25% HP when a heal is castable (t6).
- ui: clear the quest card on quest/rewarded; a REFUSED recover card
  draws only the refusal; bags item kind and glyph; the kill counter
  shows gray kills (t4-quest, t6, t0-self, t3-ghost).
- core place: print the zone once when areaId equals zoneId, and
  resolve the sub-area from the pose (t0-who; 3rd round).
- prompt-docs: report only what a result states, not place words from
  the task; `within:N` is not a waypoint; search several hundred yards
  before reporting failure, and state the distance searched
  (t3-hunter, t4-alliance, t3-ghost).
- ops-tools-b: a `human_waiting` refusal that quotes the steer counts
  it as read (t6).
- engage: an optional toward or area argument, and the kill position
  in the DONE line (t3-hunter).
- eval-infra: closest-distance check text for a named hostile beyond
  60 yd (t0-hostiles).
- log-events: a confirmed combat/pet_attack flag from the pet target
  field (t3-hunter).
- coordinator and workflow: find out who removed the eval worktree at
  about 09:04 UTC (the reaper journal shows nothing), and never remove
  it before every grader has returned.

### Eval round 6

Head `7bfd4ba`. Thirteen scenarios, one run each, in the eval worktree.

- Fix briefs landed before the round: stale-checks (`2097d1e`),
  northshire-route-floors (`f095c9d`), search-and-recover (`7bfd4ba`)
  and event-delivery (`8a4e590`). Decisions 135 to 144 record what they
  changed. The round-5 eval worktree removal was the maintainer's, and
  run dirs stay under the eval worktree's `tmp/evals` (maintainer
  ruling), so the durable-run-dirs brief landed as stale-checks only.
  All 13 run dirs were present and re-read.
- Pass rate 13 of 13 (1.00; round 5 0.77, round 4 0.69). Abort rate 0
  (round 5 0.08). Median tool calls 3 (round 5 3). Median wall time
  22.7 s (round 5 28.1 s); scenarios with steers or partner actions
  now end wall time at the last reply (`47d83e6`). Checks met 48 of
  49; the one miss is the t4-alliance-first stretch check (the quest 7
  chain), which is not a pass condition. Every run ended `done` with
  no rescue nudge.
- t3-ghostlands-kill (search-and-recover), t4-alliance-first (route
  floors) and t7-halt-resume go to pass.

| Scenario | Verdict | Checks | Tool calls | Turns | Wall s | First action s |
|---|---|---|---|---|---|---|
| t0-hostiles | pass | 3/3 | 1 | 2 | 4.0 | 2.20 |
| t0-self-state | pass | 5/5 | 1 | 2 | 4.7 | 2.62 |
| t0-who-is-near | pass | 3/3 | 1 | 2 | 4.3 | 2.36 |
| t1-walk-to-npc | pass | 2/2 | 2 | 3 | 15.7 | 2.70 |
| t2-whisper-reply | pass | 3/3 | 1 | 3 | 63.4 | 63.40 |
| t3-ghostlands-kill | pass | 4/4 | 15 | 16 | 215.0 | 2.80 |
| t3-kill-one-hunter | pass | 7/7 | 2 | 3 | 22.7 | 2.46 |
| t4-alliance-first | pass | 3/4 | 4 | 5 | 18.7 | 2.30 |
| t4-quest-first | pass | 5/5 | 6 | 7 | 106.9 | 3.90 |
| t5-vendor-buy-goldshire | pass | 2/2 | 3 | 4 | 12.9 | 2.40 |
| t6-die-and-recover | pass | 4/4 | 14 | 18 | 198.7 | 2.10 |
| t7-halt-resume | pass | 3/3 | 6 | 9 | 148.6 | 2.60 |
| t7-question-while-acting | pass | 4/4 | 18 | 20 | 302.7 | 2.30 |

One tool error, in t6-die-and-recover. With every scenario passing, the
friction left is about efficiency and quality.

Top friction clusters (score is runs times severity: major 3, minor 1):

1. notice/not_implemented rows still fill the panel feed (log-events
   and ui, score 7; all 13 runs log them, 7 graders filed it). The
   per-opcode dedupe leaves 11 distinct opcodes, such as Spell damage,
   Damage dealt, Power update and Achievement criteria.
2. engage result texts are stale or incomplete (ops-tools-a, score 6;
   t6, t7-halt, t7-q). FAILED died gives no enemy HP or level gap,
   PARTLY omits XP (the agent reported 160 XP, true 268), the Danger
   line says "coming at you" for a unit that attacks, and RUNNING lags
   kill credit by 2.5 s.
3. Jev never heals at low HP, and the damage packets are not parsed
   (core-b, score 4; t6, 2nd round). Jev chose Smite at 6/51 and 2/51
   HP with Lesser Heal offered, and t6 died twice.
4. Stale or redundant wakes (log-events, score 3; t6, t7-halt): a
   low_health wake 83 s late at full HP, a run/ended wake for a
   superseded recover run, and life/released caused by the agent's own
   recover run.
5. Quest reward hints (ops-tools-a and b, score 4; t4-quest,
   t4-alliance): the engage completion Next omits the reward, so
   turn_in refuses `reward_needed` once (2nd round), that Next picks
   mail for a Priest, and turn_in hides a chained quest offer.

Smaller clusters: prompt habits (re-engaging the unit that killed the
character, an empty final answer after a wake action), unit identity in
the now line and zero-hit look, eval defects (t7-halt draft ignores the
steer windows, eversong10 conjured water and food vanish at login),
stale panel cards, and spell ids in aura rows.

Briefs for round 7:

- quiet-wakes (log-events): keep not_implemented in the GL only, and
  drop queued wakes whose condition no longer holds at delivery.
- engage-reports (ops-tools-a): engage says what happened in the fight
  (enemy HP and level on death, XP on every summary, attacker-aware
  Danger, RUNNING after kill credit) and which reward to take
  (`pickReward` by class proficiency).
- healer-guard-and-damage-log (core-b): cast a castable self-heal
  below 35% HP before asking Jev, and parse
  SMSG_ATTACKERSTATEUPDATE, SMSG_SPELLNONMELEEDAMAGELOG and
  SMSG_POWER_UPDATE into combat/damage and unit power.
- halt-windows-and-preset (eval-infra): grade t7-halt-resume by its
  steer windows, give t2-whisper-reply an explicit end rule, and
  replace conjured items in eversong10 with Refreshing Spring Water
  and non-conjured food.

Deferred:

- ops-tools-b: turn_in captures the chained quest offer
  (RewardNextQuest) and adds `Next: accept` (t4-alliance stretch
  check).
- ops-tools-b and log-events: the now line and a zero-hit look name
  the nearest attackable with its relation and skip critters; travel
  Passed flags aggressive grays within aggro range; clear lootable
  after an empty loot (t0-hostiles, t4-quest, t3-ghost, t7-q).
- prompt-docs: after engage FAILED died, do not engage the same target
  again unless something changed; end a wake-action turn with one
  sentence to the human; the completion report lists every fight;
  explore away from towns (t6, t2, t3-ghost).
- ui: clear or mark the quest card on quest/rewarded and
  quest/accepted; take the aura fade glyph from the gain's helpful
  flag; choose the journal glyph by `about`; show one Bags line
  (t4-quest, t4-alliance, t3-hunter, t0-self).
- log-events: aura rows resolve the spell name, not the id
  (t3-hunter).
- core place: resolve the subzone and print the zone once (t0-who;
  4th round).
- ops-tools-b: rest drinks or waits on regen at full HP and never eats
  (t7-q).
- ops-tools-a: look find accepts a value that is not a kind as a name
  match (t6).
- eval-infra: eval-suite.md names a Ravager pet, but the preset pet is
  a Bloodmyst Hatchling (t3-hunter); some runs report reasoning tokens
  as 0 at thinking high, so check the provider usage (t4-quest, t1,
  t3-hunter).
- eval-infra: concurrent graders shared `tmp/eval-r6-t0.log`; use a
  log path local to the run dir (t0-who, t0-self).

### Outcome

The maintainer stopped the eval loop after round 6 (R40), so round 6 is
the last round of this epic. The pass rate rose in every round:

| Round | Pass rate | Passed |
|---:|---:|---:|
| 1 | 0.46 | 6 of 13 |
| 2 | 0.54 | 7 of 13 |
| 3 | 0.62 | 8 of 13 |
| 4 | 0.69 | 9 of 13 |
| 5 | 0.77 | 10 of 13 |
| 6 | 1.00 | 13 of 13 |

In round 6 the median run takes 3 tool calls and 22.7 s to the answer,
and 48 of 49 checks are met; the one miss is a stretch check that is not
a pass condition. At the close (`7df79a7`) the legacy live suite passes
21 of 21 on two throwaway accounts (276 `expect()` calls, 104.68 s).
The implementation is complete on draft PR #367 and waits for the
maintainer's review and merge. The factory stays off until the merge
(R17).

## 12. Future work

Autonomous leveling from 1 to 80 is a long-term project goal outside
this epic (R39). The work below is what the epic leaves open.

**Round 7 briefs, written and not run** (section 11, eval round 6):

- quiet-wakes (log-events): keep `not_implemented` in the game log only, and drop queued wakes whose condition no longer holds.
- engage-reports (ops-tools-a): engage reports enemy HP and level on death, XP on every summary, attacker-aware Danger, and which reward to take.
- healer-guard-and-damage-log (core-b): cast a castable self-heal below 35 % HP before asking Jev, and parse the damage and power packets.
- halt-windows-and-preset (eval-infra): grade t7-halt-resume by its steer windows, give t2-whisper-reply an end rule, and drop conjured items from eversong10.

**Deferred in round 6** (the round-6 cluster record, not committed; the
same list as section 11, eval round 6):

- ops-tools-b: turn_in captures the chained quest offer (RewardNextQuest) and adds `Next: accept`.
- ops-tools-b, log-events: the now line and a zero-hit look name the nearest attackable and skip critters; travel flags aggressive grays; clear lootable after an empty loot.
- prompt-docs: do not engage a target that killed you unless something changed; end a wake turn with one sentence; list every fight; explore away from towns.
- ui: clear or mark the quest card on reward and accept; aura fade glyph from the gain; journal glyph by `about`; one Bags line.
- log-events: aura rows resolve the spell name, not the id.
- core place: resolve the subzone and print the zone once.
- ops-tools-b: rest drinks or waits on regen at full HP and never eats.
- ops-tools-a: look find accepts a value that is not a kind as a name match.
- eval-infra: fix the hunter pet name in eval-suite.md, and check the provider usage where reasoning tokens read 0.
- eval-infra: give each grader log a path inside its run dir.

**Catalogue scenarios not yet run** (24 of 37, from
[eval-suite.md](2026-09-26-pi-harness-epic/eval-suite.md)):
`t0-quest-log`, `t0-where-am-i`, `t1-tour`, `t1-unreachable`,
`t1-walk-to-coords`, `t2-ask-a-bot`, `t2-follow`, `t2-party-invite`,
`t3-grind-5`, `t3-kill-one`, `t3-kill-one-mage`, `t3-mana-downtime`,
`t3-neutral-pull`, `t4-quest-collect`, `t4-quest-pickup`,
`t5-loot-kill`, `t5-trainer-learn`, `t5-vendor-buy`,
`t5-vendor-buy-tranquillien`, `t6-death-in-cycle`,
`t7-change-objective`, `t7-redirect`, `t8-grind-30` and
`t8-quest-to-level-3`.

**Tier-8 long-horizon runs**: `t8-grind-30` and `t8-quest-to-level-3`
need the long lane of section 8, which no round ran.
