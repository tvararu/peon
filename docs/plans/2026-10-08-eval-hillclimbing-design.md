# Evals for the 1–10 speedrun and the 1–80 run

Date: 2026-10-08. Status: design; the NS1 scenario and its measure are
the prototype, nothing else is built.
Issue: #607.

Question: how do we measure Peon against its two goals, NS1 (an
autonomous level 1–10 speedrun in under about an hour) and NS2 (an
autonomous 1–80 run), and how do we improve the score without fooling
ourselves? The principles come from Anthropic's
["Automating eval design and hillclimbing"][article] (2026-09-28); this
note maps each one onto `mise eval` ([evals.md](../evals.md)).

[article]: https://claude.dev/blog/automating-eval-design-and-hillclimbing/

## Decision

- **NS1 is one scenario that is the goal itself**:
  `t4-speedrun-level-ten`, a never-played level 1 Blood Elf paladin on
  Sunstrider Isle told to reach level 10 as fast as it can, with a
  75-minute budget. It passes when level 10 lands within 60 minutes of
  the task. Its score is continuous: the XP earned in the first hour,
  which reaches 27,600 when the character makes level 10 within it.
- **One new measure, `level_pace`**, reads the game log for the minutes
  to each level from the task, the XP in the first hour, deaths and
  stalls. Every other number comes from checks that exist today.
- **The held-out split is a second start**: the same task for a level 1
  human paladin in Northshire. A hillclimber reads only the Sunstrider
  runs; Northshire scores decide whether a change stays.
- **Hillclimbing touches text and settings only**: the system prompt,
  tool and parameter descriptions, Jev's instructions and framing, the
  model and the thinking level. Harness code changes are capability
  work through issues, never a hillclimbing round.
- **NS2 is a chain of level-band segments** that start from template
  characters, measured by the same `level_pace`. Its segment shape needs
  the maintainer's calls listed under [NS2](#ns2-level-band-segments).

## The article's four elements, mapped

The article says a good eval has tasks that mirror production, scores
that rise with stronger models and more thinking, headroom at the
frontier, and low run-to-run variance ([article], "Eval design").

**Tasks mirror production.** For NS1 the production task is the eval:
a human starts a new character and asks Peon to level it. The start
points are where every character of that race starts, not places
picked because Peon fails or passes there, which avoids the article's
"adversarial sampling" trap of measuring one model's failure
fingerprint ([article], "Adversarial sampling"). The task text says what
a human player would say and names no quest, NPC or route.

**Stronger models score higher.** Unchecked today: `mise eval run`
starts the harness with its default model and thinking level
([evals.md](../evals.md#run-a-scenario); the defaults are in
`packages/harness/src/config/flags.ts`),
and the four archived `t4-quests-level-five` runs all ran
`openai-codex/gpt-6-luna` with thinking `off` (their `result.json`
`conditions`). The check needs the runner to pass `--model` and
`--thinking` through (the harness flags are in
`packages/harness/src/config/flags.ts:15`); until then, the scaling
check is a manual harness launch outside `mise eval`.

**Headroom.** Large. The archived level-five runs reached level 3 at
7.8–15.6 minutes and level 4 at 22–24 minutes, and earned 66–107 XP a
minute (table below); NS1 needs 27,600 XP in 60 minutes, 460 a minute
(`packages/harness/src/grader/xp-table.ts:1-10`, the sum of the first
nine crossings). A pass rate of 0 tells nothing, and the article reads
a task that fails every replica as a sign of an impossible or ambiguous
task ([article], "Eval design", element 3). So the verdict stays the
goal's pass rule, and hillclimbing climbs the continuous score.

**Low variance.** Not yet measured for a long run; see
[Noise](#noise-estimate).

## What NS1 measures

| Number | Source | Exists today |
|---|---|---|
| Final level | truth `level` (`packages/harness/src/grader/draft-fill.ts:106`) | yes |
| XP earned over the run | truth `delta: ["totalXp"]` (`draft-fill.ts:138`) | yes |
| Minutes to each level from the task | `xp/level_up` rows (`packages/harness/src/events/rules-xp.ts:130`) against the task's `human/input` row | `level_pace` |
| XP in the first hour (the score) | `xp/gain` `amount` (`rules-xp.ts:42-64`) up to 60 minutes after the task | `level_pace` |
| Deaths | `life/dead` rows (`packages/harness/src/events/rules-life.ts:43`) | countable today; reported by `level_pace` |
| Stalls | gaps of 5 minutes or more between progress rows (`xp/gain`) | `level_pace` |
| No help | session: empty setup, at most one rescue nudge ([evals.md](../evals.md#grading-rules)) | yes |
| Cost | `efficiency`: tool calls, turns, tokens, wall time (`packages/harness/src/grader/efficiency.ts`) | yes |

`level_pace` follows the existing measure pattern: one entry in
`MEASURES` (`packages/harness/src/grader/draft-measure.ts:134-150`), the
`CheckMeasure` union in `packages/harness/src/grader/scenarios.ts` and
the `measure` enum in `scenario.schema.json`. It anchors on the
`human/input` row whose text is the task, the way `steerRow` finds a
steer (`packages/harness/src/grader/draft-anchors.ts:27-32`), so its one
plumbing change is the task text in `MeasureContext`
(`packages/harness/src/grader/draft-anchors.ts:6-10`), which holds the
steer texts today. Row times lag the server by at most a second
(`XP_SOURCE_WAIT_MS`, `packages/harness/src/events/rules-xp.ts:11`).
Its `observed` holds the start time, the minutes to each level, the
final level, the XP over the run and in the first hour, the death count,
the stalls and the longest gap. It sets no `met`: the check's `expect`
states the threshold and the grader decides, as with `kill_xp`.

The scenario's checks are the pass rule only: final level at least 10,
level 10 within 60 minutes of the task (`level_pace`), XP earned at
least 27,600 (proving the levels were earned) and no GM help. The
verdict is `pass` only when all four are met
([evals.md](../evals.md#grading-rules)), so level 10 at 70 minutes is a
`fail` with a score. Deaths and stalls explain a score; they are not a
fail, because a speedrun may die and still win. Quest turn-ins are not a
check, unlike `t4-quests-level-five`: a speedrun picks quests or
grinding by speed, and the `xp/gain` rows show the mix.

The task is "Get this new character to level 10 as fast as you can.
Don't stop before level 10." It starts from the preset
`sunstrider1-paladin`, a Blood Elf paladin created over the protocol and
never logged in, which the server places at the Sunstrider Isle start,
the same point as the `fresh` priest
(`playercreateinfo` rows for race 10 with classes 2 and 5 in AzerothCore's
`data/sql/base/db_world/playercreateinfo.sql`). It has an empty
setup, a budget of 75 minutes (pane 78), and the `sunstrider-wyrms`
field it shares with the other Sunstrider scenarios, because it hunts
the same creatures. Runs of one round on one field queue behind each
other; runs in different rounds do not see each other
(`packages/harness/src/grader/fields.ts`, `liveClash` reads one round's
run directories), so replicas run in one round.

## Evidence: the level 1–5 runs

The closest scenario, `t4-quests-level-five`, is the same start and the
same kind of task, to level 5 with a 90-minute budget
(`packages/harness/src/grader/scenarios/t4-quests-level-five.json`).
Five runs are on record: the round 7531 pass (level 5 with five quests
in 53 minutes, [capabilities.md](../capabilities.md)) and four archived
run directories under `~/.local/state/peon-overnight/artifacts/`, read
with the same arithmetic `level_pace` uses:

| Round | Verdict | Level times (min) | XP | XP/min | Deaths | Longest gap (min) | End |
|---|---|---|---|---|---|---|---|
| 722 | none | 2: 1.5, 3: 12.6, 4: 22.3, 5: 56.2 | 6787 | 66 | 8 | 6.9 | no final truth or draft |
| 901 | fail | 2: 1.5, 3: 15.6 | 1400 | 74 | 2 | 5.2 | `done` at 18.8 |
| 1001 | fail | 2: 1.5, 3: 11.7, 4: 23.8 | 3434 | 106 | 5 | 2.6 | `done` at 32.4 |
| 1101 | fail | 2: 1.4, 3: 7.8 | 1710 | 110 | 0 | 2.8 | `done` at 15.5 |

All three graded runs failed by the agent answering `done` long before
the budget, at level 3 or 4. So the commonest failure is quitting, not
slow play, and the NS1 task says not to stop before level 10. Level 2
lands at 1.5 minutes in every run; the spread opens from level 3.

The level 1–5 evidence above is a priest; the speedrun is a paladin, so
the first paladin runs are their own baseline, not a comparison with
the priest runs.

## Noise estimate

The article checks, before the first round, that the score's noise is
smaller than the smallest improvement worth acting on, and asks for more
replicas when it is not ([article], "/claude-api hillclimb").

- Binary verdicts are too noisy here: of the five recorded level-five
  runs one passed, three failed and one never finished grading, and
  `t3-ghostlands-kill` passed about 3 of 11 for reasons outside the
  harness (#603). A continuous score is the only workable signal.
- The noise of the NS1 score is the spread of XP in the first hour
  across replicas at the same run conditions (model, thinking, harness
  sha, Jev models, scenario hash: `packages/harness/src/grader/conditions.ts`;
  [evals.md](../evals.md#run-a-scenario)).
- Method: three replicas give a first standard deviation `s`. A change
  of `d` XP is worth acting on only when `d > 2s / sqrt(n)` for `n`
  replicas per arm; with `s` unknown, three replicas per arm is the
  floor. The level-five spread (66–110 XP a minute) suggests `s` is a
  large share of the mean, so expect to need more than three
  [INFERENCE].
- Cost: one replica is a 78-minute pane (`paneMinutes` is the budget
  plus 3, `packages/harness/src/grader/scenarios.test.ts:274`). Runs on
  the same field in one round queue behind each other
  (`packages/harness/src/grader/fields.ts:71`), so three Sunstrider
  replicas take about four hours, with the Northshire replicas in
  parallel on their own field.

## Grader repeatability

The article grades the same output twice and reports whether the
verdict changed ([article], "Diagnostic checks").

- The draft is code: the same run directory gives the same
  `grader/draft.json` (`packages/harness/src/grader/draft-fill.ts`). The
  judgement is in the grader's step from draft to `result.json`: each
  `met`, the friction and the verdict ([evals.md](../evals.md#run-a-scenario)).
- Check: two independent grader agents read the same draft and evidence
  and each writes a result; the per-check `met` values and the verdict
  must match. A mismatch means the check's `expect` is ambiguous, and
  the fix is its wording or a measure, never a ruling for one run.
- History shows the risk is real: windowed checks drafted unmet on clean
  runs until #493 and PR #510 anchored them on steers, and the pilot
  measures were rewritten twice after graders disagreed with the draft
  ([evals.md](../evals.md), the `pilot_only_moves` rule;
  `docs/plans/2026-10-05-jev-pilot-units-design.md`).
- The NS1 pass rule rests on truth and `level_pace`, so only `no-gm-help`
  and the friction are judgement calls.

## Plumbing checks

The article separates infrastructure noise from model variance
([article], "Diagnostic checks"). Peon already has the verdict for it:
`aborted` covers SOAP, `soap create`, stale truth, model rate limits,
Jev outages and pane failures ([evals.md](../evals.md#grading-rules)). An
aborted run counts toward no score. Each run starts from a fresh
`soap create` account whose character has never logged in, so no state
from an earlier trial reaches it (`packages/factory/src/soap-presets.ts`).

## The held-out split

The article splits the cases into a train set the hillclimber may read
and a test set it never sees ([article], "Overfitting"), and keeps a
change only when both improve ([article], "/claude-api hillclimb").

- **Train**: `t4-speedrun-level-ten`, preset `sunstrider1-paladin`: a
  Horde Blood Elf paladin at the Sunstrider Isle start, map 530.
- **Test**: the same task and checks for a created Alliance human
  paladin at the Northshire start, map 0 (`playercreateinfo` race 1,
  class 2, the point the `elwynn1` warrior template uses in
  `packages/factory/src/soap-presets.ts`). The class is the same, so the
  split differs only in faction, race, map, zone and quests: a change
  that only helps on Sunstrider shows up as train up, test flat. Each
  split is compared with its own baseline, never with the other. Map 0
  has navigation data and quest runs (`t4-alliance-first`,
  [capabilities.md](../capabilities.md)). The Northshire paladin preset
  and scenario are built when hillclimbing starts, on the
  `northshire-kobolds` field that `t4-alliance-first` uses.
- The pilot scenarios already name a held-out split by convention
  (`-holdout`, [evals.md](../evals.md#which-scenarios-to-run)); nothing
  in code keeps a hillclimber from reading them. The split stays a rule
  of the loop below.

## The hillclimbing loop

Surfaces the loop may change, all cheap to change and revert and each
recorded in the run conditions through the harness sha
(`packages/harness/src/grader/conditions.ts`):

| Surface | Where |
|---|---|
| System prompt | `packages/harness/src/prompt/system-prompt.ts` (`BODY`) |
| Tool descriptions and guidelines | each tool's `text` in `packages/harness/src/tools/*.ts`, installed by `packages/harness/src/tools/define.ts:501-517` |
| Parameter descriptions | `packages/harness/src/tools/params-*.ts` |
| Jev instructions and framing | `packages/harness/src/jev/select.ts:13-14`, `packages/harness/src/jev/framing.ts` |
| Model and thinking level | `packages/harness/src/config/flags.ts`; needs runner support first |

Each round, following the article ([article], "/claude-api hillclimb"):

1. Read the previous round's train failures, Sunstrider only.
2. Make one change that fixes a failure at its root.
3. Run train and test at the same conditions, at least the replica count
   the noise estimate set.
4. Keep the change only when train and test both rise beyond noise.
   Revert when only train rises or either falls.
5. After two or three rounds with no kept change, or as soon as no
   single fix could gain more than the noise, run a round that makes no
   edit: sort every remaining train failure by cause, add replicas or
   cases when the noise is the problem, and aim the next rounds at the
   largest legitimate cause.

The causes and a Peon example of each:

| Cause | Example |
|---|---|
| Model | the agent quits early (the level-five rounds 901, 1001, 1101 above) |
| Harness | navmesh refusals near the Sunspire stopped a level-five run (round 723) |
| Task | the shrine task's "first sentence" was ambiguous (#448) |
| Grader | windowed checks drafted unmet on clean runs (#493) |
| Environment | only gray creatures in view near Tranquillien (#519, #603) |

Rules that keep the eval out of the harness:

- **No game names in a change.** A change never names a zone, NPC,
  quest, item or coordinate. "Head south across the bridge to Falconwing
  Square" helps Sunstrider and nothing else: the article's "distinctive
  phrasings get a tuned prompt" and "failures you've read get one patch
  each" ([article], "Overfitting", figure 5).
- **No transcript text in a change.** Failures inform the change; their
  text never enters the prompt.
- **Harness code is out of the loop.** A harness cause becomes an issue
  and is fixed through the normal PR process. The fix changes the run
  conditions, so the next round starts from a new baseline.
- **Answers stay out of reach.** The agent sees the task and steers
  typed as human input (`packages/harness/src/grader/run.ts:322`,
  `sendTask`) and none of its tools reads files
  (`GAME_TOOLS`, `packages/harness/src/tools/registry.ts:32-64`), so the
  run directory's truth and checks are out of its reach. The run
  directory path names the scenario
  (`packages/harness/src/grader/run.ts:114-120`, `runPaths`), but no tool
  shows it [INFERENCE: read from the tool list, not proven by a sandbox].

The overnight protocol pass (eval round, friction clusters, fix briefs,
next round: `docs/plans/2026-09-27-protocol-coverage-process.md`) builds
capability with open-ended harness changes, no split and pass/fail
gates. It stays the way to build capability; it is not hillclimbing.

## NS2: level-band segments

A 1–80 run is too long for one eval, so NS2 is a chain of segments. Each
segment starts from a character at the band's first level, placed where
a real character of that level would be, with the gear, spells and
quest history a real character would have. Each runs the same task
shape ("reach level N as fast as you can") and the same `level_pace`
measure. The NS2 estimate is the sum of the segment medians; one chained
run across two segments checks how far the sum flatters the chain
[INFERENCE: proposal, not measured].

What a segment start can and cannot set today:

- **Can**: level, XP, money, position, hearth, reputation, bag items,
  spells, quest history and objectives, through the realm service
  endpoints (`packages/factory/src/realm-service.ts:8-28`), or all of a
  hand-played character's state through a template copy
  (`packages/factory/src/soap-copy.ts`).
- **Cannot without a template**: spent talents and glyphs, equipped
  gear (`items/add` fills bags), flight paths and profession skill. No
  endpoint sets them.
- **Never during a run**: after the baseline, nothing touches the
  character ([evals.md](../evals.md#grading-rules), "Safety").

The navigation code names maps 0, 1, 530 and 571
(`packages/harness/src/navigation/maps.ts:17-22`), and the data for maps
1 and 571 has been in place since 2026-10-02
(`docs/plans/2026-09-27-protocol-coverage-plan.md`, ruling BR-wave5-9),
so a Horde chain through Eversong, the Ghostlands, the Eastern Kingdoms,
Outland and Northrend has data on every map.

Calls for the maintainer before any NS2 segment is built:

1. **Bands and route**: which zones each band covers, and one route
   or one per faction.
2. **Starts**: templates levelled by hand (full state) or staged
   creates (no talents or equipped gear), and who levels the templates.
3. **Pass rule**: a par time per band, or score only.
4. **Endpoints**: build setup endpoints for talents and equipped gear,
   or rely on templates.

## Next steps

1. Build `level_pace` and `t4-speedrun-level-ten` (issue #607), run one
   graded baseline, grade it twice, and record the numbers here.
2. Run three replicas to estimate the noise.
3. Let `mise eval run` pass a model and thinking level through, then run
   the scaling check on the baseline.
4. Build the Northshire test scenario, then start the loop.
5. Settle the NS2 calls above.
