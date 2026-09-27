# Agent pain with the tuicraft CLI, and what the Pi harness must do about it

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


For the maintainer and the harness design panel. Written 2026-09-26 against `main` at `5dca819`. Revised the same day after the completeness critic (`pain-points/critic.md`); §8 lists every change.

Evidence marks: **measured** = I ran a command or script and saw the number. **read** = I read it in a shard report, a side report, a transcript extract or a repo file. **inferred** = my conclusion. Episode ids have the form `<kind>/<sessionId>[:<subagent>]/<seq>`. **Report citations:** `in-NN` is the shard report whose Source line names `transcripts/shards/shard-NN.jsonl`; `in-NN #row` is a row number inside that report (row numbers are local to a report, episode ids are stable). The report file names do not match the input numbers; the map is in §1.2. A claim copied from a shard report keeps the mark that report gave it.

Scratch scripts for the numbers here are in `pain-points/synth/` (not kept) (`measure.ts`, `measure2.ts`, `gapshards.ts`, `peek.ts`, `redcheck.ts`, `digest.ts`).

---

## 1. Corpus

### 1.1 What was collected (read, from `transcripts/INDEX.md`)

| kind | episodes | sessions with episodes | transcript files scanned |
| --- | ---: | ---: | ---: |
| omp-main | 1778 | 8 | 116 |
| omp-other | 696 | 12 | 106 |
| omp-qa | 645 | 39 | 39 |
| omp-ovn | 504 | 33 | 60 |
| omp-work | 345 | 33 | 84 |
| claude-subagent | 188 | 10 | 23 |
| claude-main | 150 | 2 | 19 |
| omp-review | 75 | 18 | 161 |
| omp-ux | 18 | 6 | 22 |
| omp-merge | 0 | 0 | 58 |
| claude-worktree | 0 | 0 | 1 |
| **total** | **4399** | **161** | **689** |

- Tags: cli 3221, followup 701, soap 243, live-test 234 (read).
- 72 distinct verbs. Top: `nearby` 376 (98 % `--json`), `face` 320, `control` 277, `walk-toward` 266, `stop` 204, `recovery` 157, `combat` 139, `goto` 117, `status` 112, `move` 104, `start` 103, `query-corpse` 103, `read` 97 (read).
- Flags: python 1780, sleep 1539, loop 1215, jq 1029, fileDump 920, grep 741, readTail 2183 (read).
- 867 distinct jq filters in 1446 uses. 929 distinct python snippets in 2868 uses (read).
- Nothing sampled out. Planning session `7fa1d885` and its subagents excluded (read).
- **Session denominator.** INDEX counts 161 sessions because each subagent is its own session. With subagents joined to their parent there are **131** (measured, `synth/sessions.ts`). The parent of the `claude-subagent` episodes (`278d94e4`) has no episodes of its own (measured, no `claude-main/278d94e4` id), so the join does not count it twice. Joined sessions per kind: omp-qa 39, omp-work 31, omp-ovn 24, omp-review 18, omp-other 7, omp-ux 6, omp-main 3, claude-main 2, claude-subagent 1 (measured).
- **Game-facing set.** §2 ranks on the 3922 episodes left after removing the 243 `soap` and 234 `live-test` episodes: **114** joined sessions (measured). §1.5 uses all 4399 episodes and 131 sessions.

### 1.2 What I read

- All 33 shard reports, one per input shard, all sections except the per-episode tables (read). Three were added in the revision (in-03, in-14, in-18) and two were recovered from displaced files (in-04, in-19).
- The three side reports `taught-surface.md`, `pi-ui.md`, `prior-ux.md` in full (read), and `critic.md` (read).
- `docs/plans/2026-09-25-pi-harness-design.md` (Problem, Idea, Findings, Decision, Architecture, milestones, open questions) (read).
- Pattern counts and distinct-session counts over all 4399 episodes with my own scripts (measured, §1.5 and §2).

Report file → input shard (measured: the Source/Input line of each file, `rg -o 'shard-[0-9]+\.jsonl'`):

| file in `pain-points/shards/` | cite as | note |
| --- | --- | --- |
| `shard-00.md` | in-01 | |
| `shard-02.md` | in-02 | |
| `shard-03.md` | in-03 | new in the revision |
| `input-shard-04.md` | in-04 | copy of `work-shard03/prior-shard-03-content-was-shard-04.md`; this text was `shard-03.md` when v1 was written |
| `shard-04.md` | in-05 | |
| `shard-06.md` | in-06 | |
| `input-shard-07.md` | in-07 | |
| `shard-07.md`, `shard-08.md`, `shard-09.md`, `shard-10.md` | in-08, in-09, in-10, in-11 | |
| `shard-12.md`, `shard-13.md` | in-12, in-13 | |
| `shard-14.md` | in-14 | new in the revision |
| `shard-15.md` | in-15 | this text was `shard-14.md` when v1 was written |
| `input-shard-16.md` | in-16 | |
| `shard-16.md` | in-17 | |
| `shard-18.md` | in-18 | new in the revision |
| `input-shard-19.md` | in-19 | restored from `synth/digest.md:2163-2219`; this text was `shard-18.md` when v1 was written and was overwritten |
| `shard-19.md`, `shard-20.md` | in-20, in-21 | |
| `shard-22.md` … `shard-26.md` | in-22 … in-26 | |
| `input-shard-27.md`, `input-shard-28.md` | in-27, in-28 | |
| `shard-28.md`, `shard-29.md` | in-29, in-30 | |
| `shard-31.md`, `shard-32.md`, `shard-33.md` | in-31, in-32, in-33 | |

All v1 citations were rewritten to this form, so v1's `shard-03.md`, `shard-14.md` and `shard-18.md` cites now read in-04, in-15 and in-19.

### 1.3 Coverage, bias and hygiene

1. **Every input shard now has a report** (measured, §1.2 map). v1 read 30 and measured the other three (03, 14, 18; 393 episodes) with `synth/gapshards.ts`. The revision reads them:
   - in-03: 150 episodes, all `omp-main/01a0c5e0…` (seq 1736-1984, 2026-09-23 01:40-02:12Z); 143 classified. It adds severity examples, not sessions: the (0,0,0) server origin (§2.5), `status` versus `start` disagreement (§2.7b), a false `obstructed` refusal (§2.4), a loot window still `phase open` after invalidation (§2.12) (read).
   - in-14: 115 episodes, five omp-qa sessions (`01a0dcd6`, `01a0dd0d`, `01a0dd1b`, `01a0dd28`, `01a0dd36`, 2026-09-26 08:31-10:23Z); 105 classified. QA evidence for §2.1, §2.2, §2.4, §2.13 (read).
   - in-18: 128 episodes, 13 sessions (omp-qa 26, omp-ux 18, omp-ovn 84); 81 classified. It holds every omp-ux episode: envelope smoke checks and help-text work, with little observation pain (read; v1's reading of the same 18 episodes agrees). The observation pain in it comes from `omp-qa/01a0df09-1f6d-732a-932e-5db4aa234356` (§2.4, §2.6, §2.9, §2.16) and one identity incident (§2.7a).
2. **The task's summed classification counts** add up to 3587 per field (measured by summing the given values). I infer they cover the 30 v1 reports, not the three added in the revision.
3. **One session dominates.** `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea` is 1728 of 4399 episodes, 39 % (measured). It owns 1212 of 1780 python-flagged episodes (68 %), 707 of 1539 sleep-flagged (46 %), 491 of 1215 loop-flagged (40 %) and 119 of 1029 jq-flagged (12 %) (critic.md §2, measured there). It is one coordinator driving Xiara through M3/M4 live evidence on 2026-09-21..23 builds, read in reports in-01 to in-12. Next largest: 234, 219, 188, 168, 149 episodes (measured). Raw episode counts therefore over-weight corpse runs, relogs, ghost navigation and python parsing. **Section 2 ranks by distinct sessions**, shows episodes second, and gives that session's share of each pain's episodes.
4. **Many episodes ran on older builds.** Fixed in the CLI since (read, prior-ux.md §2 and shard `git log -S` checks): stale `nearby` distance (48ddf71, 2026-09-22T23:44Z), bearing fields, `face-guid`, `walk-toward` (48ddf71, 43ac81b), the uniform envelope (9affc74…c62bdf8), `spirit-healer` (a3f6e9b, 2026-09-23T09:18Z), `walk-toward` keeping `data` on a stop (979cadf, 2026-09-26), positionless carried items (88a7100), the `tmp/tc-<ACCOUNT>` wrapper (f25cfdd, 2026-09-26T15:50Z). Section 2 marks each pain open or fixed. The 2026-09-26 QA, work and ovn sessions are the best evidence of what is still open (inferred).
5. **Results are truncated** to the first 500 and last 300 characters (read, INDEX). Every count over result text is a lower bound.
6. **One label per field, by different workers** with different tie-break rules. Summed counts show shape, not exact rates (inferred).
7. **Redaction.** The task says scans found no leaked password. Three workers report possible misses in the source corpus (not in their reports). No value appears in this report, and I read none.
   - `in-21` Notes: episode `omp-ovn/01a0dbe7-0e7e-77dd-9558-d84e20ed67e7/102`, result line 2. Shape only (measured, `synth/redcheck.ts`, letters and digits masked): three space-separated tokens, no `[REDACTED]` marker. Whether it is a password: could not determine without reading it.
   - `in-32` Gaps: episode 92 of input shard 32, a password inside a `sed` expression. Not checked here.
   - `in-18` finding 14: `omp-ovn/01a0db03-3f1a-7304-b136-fb38e4842557` (file lines L97 and L100 of `shard-18.jsonl`) prints the `soap create` password through `python3 -c "…print(d['account'],d['password'],…)"`; the extractor redacts only a JSON `"password"` key, so the bare value stayed (read). Not checked here.
   - Exposure (measured, `synth/sessions.ts`): 75 episodes in 38 sessions extract the password field of `soap create` output in the command text (`['password']`, `.password`, `{account,character,password}`). Whether each one printed the value: not determined.

### 1.4 Corpus-wide classification (read; denominator = classified rows, not episodes)

The first table sums the per-report counts the task gave for the 30 v1 reports: 3587 classified rows per field (measured by summing). **Denominator: classified rows.** Reports classified between 44 of 134 episodes (in-19) and 143 of 150 (in-03, in-04), so omp-main shards (near 100 % classified) outweigh ovn and other shards (about 30-60 %) (read, critic.md §3). Use these sums for shape only. Never add them to the episode counts in §1.5 or the session counts in §2.

| field | counts |
| --- | --- |
| wanted | position 541, navigation-refusal 515, death-recovery 415, action-outcome 328, combat-progress 300, hostiles 294, daemon-lifecycle 253, nearby 168, self-vitals 149, other 147, loot 101, npc-dialog-vendor-trainer 79, target 68, chat 57, inventory 55, quest-state 55, party-social 31, cooldowns-spells 31 |
| hack | python 897, sleep-retry 686, jq-path 480, poll-loop 448, none 284, manual-math 283, grep-on-output 220, file-dump-then-parse 149, re-read-tail 140 |
| failure | none 1120, no-confirmation 678, missing-field 520, stale-data 302, ambiguous-output 276, cannot-observe-while-acting 252, output-too-large 184, daemon-or-session-trouble 114, race-read-vs-act 73, wrong-verb-or-flag 68 |
| affordance | typed-tool-result 1409, agent-query-tool 647, waking-event 506, human-panel-widget 351, passive-event 319, tool-result-renderer 189, none 166 |

`failure: none` does not mean the call went well: most such rows are cheap reads repeated because nothing pushed a change (read, in-08 Counts note).

The three reports added in the revision, kept apart because their denominators differ (read, each report's Counts section):

| report | classified / episodes | top wanted | top hack | top failure (after none) | top affordance |
| --- | --- | --- | --- | --- | --- |
| in-03 | 143 / 150 | death-recovery 30, navigation-refusal 29, position 23 | sleep-retry 65, python 44 | stale-data 31, missing-field 19 | typed-tool-result 47 |
| in-14 | 105 / 115 | navigation-refusal 20, combat-progress 19, action-outcome 11 | jq-path 40, sleep-retry 19 | missing-field 23, no-confirmation 13 | typed-tool-result 59 |
| in-18 | 81 / 128 | daemon-lifecycle 23, other 20, navigation-refusal 11 | none 22, jq-path 10 | stale-data 13, ambiguous-output 10 | typed-tool-result 38 |

Other count sources and their denominators, never mixed with the above: pi-ui.md §0 counts are regex hits per raw JSONL line, with duplicates (pi-ui.md:25-27, read), and are not used in this report. prior-ux.md §1b figures (M5 107 legs, M6 walk-toward 0/8, 62/119 zero-yard moves) come from `docs/evidence`, not from this corpus.

### 1.5 Pattern counts over all 4399 episodes (measured)

From `synth/measure.ts` and `synth/measure2.ts`, approximate regex over command or (truncated) result. "sessions" joins subagents to their parent.

| pattern (command text) | episodes | sessions |
| --- | ---: | ---: |
| `nearby --all` | 491 | 29 |
| `move forward/backward` | 458 | 28 |
| `walk-toward` | 423 | 28 |
| `face <radians>` | 345 | 20 |
| `goto` | 158 | 29 |
| relog (`stop` … `start` in one call) | 156 | 18 |
| `atan2` | 141 | 10 |
| session log or `logs |` mining | 122 | 25 |
| navmesh probes (`nav.height`, `createNavigation`, `openNativeMap`, `findHeight`) | 89 | 4 |
| `read … --wait` | 80 | 27 |
| `face-guid` | 42 | 16 |
| hostility by `factionTemplate` literal | 42 | 9 |
| `.gps` GM whisper | 36 | 9 |
| name-regex hostility | 32 | 9 |
| `npcFlags` bit arithmetic | 18 | 9 |
| `cycle … --quest` | 12 | 3 |
| `spirit-healer` | 9 | 6 |
| `record` | 8 | 5 |
| `tail` | 6 | 6 |
| `defend on` | 5 | 2 |

| other measure | value |
| --- | --- |
| CLI episodes piping into jq or python | 2410 of 3221 (75 %) |
| episodes with a literal `sleep N` | 1519 |
| sum of literal sleep seconds (loop body once) | 22 304 s (about 6.2 h) |
| results with a bare `OK` line (lower bound) | 785 |
| results with `"kind":"intent"` (lower bound) | 297 |
| results with `Daemon accepted request` (lower bound) | 182 |
| results with `obstructed` / `height_unresolved` / `UNKNOWN_HEIGHT` / `ambiguous ground column` | 188 / 151 / 97 / 64 |
| results with `cannot use null as iterable` | 58 |
| results with `not yet implemented` stub lines | 43 |

Denominators for §1.5: "episodes" is out of 4399 transcript episodes; "sessions" is out of the 131 joined sessions. §2 uses its own signatures (listed there), so a number in §2 can differ from the row here with a similar name (for example `goto`: 29 sessions here for the verb after a CLI prefix, 38 in §2.4's side count for any `goto` word).

### 1.6 What the python and jq one-liners were for (read + measured)

The top 20 python one-liners in INDEX are 1208 of 2868 python uses. Grouped by the fact printed (measured, arithmetic over the INDEX table):

| fact printed | uses | example (verbatim, INDEX) |
| --- | ---: | --- |
| own pose, source, blockedReason | 584 | `…d=json.load(sys.stdin)['data']; print('pose', round(d['pose']['x'],1), round(d['pose']['y'],1), d['pose']['source'], 'blocked', d.get('blockedReason'))` (123) |
| life, hp, mana, epoch | 406 | `…print('life', d['life'], 'hp', d.get('health'), 'epoch', d.get('epoch'))` (131) |
| filtered list of nearby units | 177 | `…units=[e for e in d if e.get('type')=='unit' and not e.get('self')] …` (108) |
| corpse position and reclaim gate | 41 | `…print('corpse', d['corpse'].get('position')); print('reclaim', d['reclaim'].get('reason'), …` (41) |

Top jq filters show the same needs: `.data.pose` (17 + 16), `.data|{active,remaining,blockedReason,refusal}` (17, the goto poll), `.data|{status,traveled,reason,pose:…}` (13), `.data|{attacking,hp:.self.health,mob:.target.health}` (12), `.data.lastOutcome` (9 + 6), and the GM position hack `[.events[]|select(.type=="SYSTEM" and (.message|startswith("X:") or startswith("GroundZ:")))|.message]` (9) (read).

About 1200 python uses print four facts: where am I, am I alive and hurt, what is near me, where is my corpse (inferred). A harness that shows those four facts all the time, in results and in a panel, retires most of the parse tax.

---

## 2. Ranked pain points

**Rank = distinct sessions × severity** (the critic's rule, replacing v1's hand-judged frequency × severity). **Episode set:** the 3922 game-facing episodes, which are all 4399 minus the 243 `soap`-tagged and 234 `live-test`-tagged ones, so account setup and live-suite runs do not count as CLI pain. That set has **114** joined sessions. The one exception is 2.15, which is about the live suite and is counted over all 4399 episodes (out of 131 sessions). Sessions match a signature over the command and the (truncated) result (measured, `synth/sessions.ts`, `sessions2.ts`, `sessions3.ts` with `EXCL=1`; without it they give the all-episode numbers). 2.7a comes from incidents named in shard reports (read). Episodes come second. "01a0c5e0 share" is the part of the matching episodes that comes from the dominant session. Ties are broken by the number of kinds. On all 4399 episodes the top six keep the same order (measured).

Severity uses the worst documented outcome: **4** = death, or the wrong character acted; **3** = stall of minutes, or a wrong action; **2** = many extra tool calls; **1** = tokens only.

"Counts" says what a matching session shows. **exposure**: the session met the shape (it got an intent reply, it piped `--json` into a parser). **harm**: the session met the bad outcome (a death, an error, a refusal, an identical-refusal loop). Exposure rows rank high by construction, because every session that uses a verb is exposed (inferred). The harm rows 2.1, 2.7a, 2.11 and 2.17 are guard rails; keep them in scope whatever their rank (inferred).

| rank | id | pain | sessions / 114 | kinds | episodes | 01a0c5e0 share | sev | score | counts | scope | v1 rank |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| 1 | 2.3 | Actions return an intent, not an outcome | 70 | 8 | 1209 | 51 % | 3 | 210 | exposure | harness, on core `ActionResult` | 3 |
| 2 | 2.6 | Long actions block or must be polled | 49 | 8 | 934 | 49 % | 3 | 147 | exposure | harness | 6 |
| 3 | 2.9 | History only via draining `read` or `session.log` | 48 | 7 | 394 | 28 % | 3 | 144 | exposure | harness (own logs, not the daemon ring) | 9 |
| 4 | 2.10 | Parse tax and schema guessing | 58 | 8 | 2456 | 52 % | 2 | 116 | exposure; harm in 20 sessions (schema-guess error, 64 episodes) | harness | 10 |
| 5 | 2.4 | Movement refusals give no usable next move | 38 | 7 | 468 | 51 % | 3 | 114 | harm (a refusal came back) | split: observe = harness, succeed = core | 4 |
| 6 | 2.2 | Hostility, creature type, NPC role are not fields | 20 | 7 | 110 | 15 % | 4 | 80 | exposure (guessing code written) | harness + CLI parity | 2 |
| 7 | 2.7b | World readiness is guessed with sleeps | 36 | 7 | 206 | 55 % | 2 | 72 | exposure | harness | 7 (part) |
| 8 | 2.11 | No-change loops | 21 | 7 | ≥ 99 | 48 % | 3 | 63 | harm | harness | 11 |
| 9 | 2.5 | Pose truth, relog or `.gps` as sensor | 21 | 6 | 183 | 68 % | 3 | 63 | exposure | label = harness; server truth = core track | 5 |
| 10 | 2.13 | Combat state is easy to misread | 29 | 9 | 204 | 29 % | 2 | 58 | exposure | harness | 13 |
| 11 | 2.15 | Live verification needs hand-set credentials | 28 / 131 (all episodes) | 5 | 29 | 0 % | 2 | 56 | harm | factory track (Q12) | new |
| 12 | 2.1 | Danger is invisible: damage, aggro, attacker, death | 12 | 6 | 297 | 89 % | 4 | 48 | harm (session had a death) | harness; reflexes need Q4 | 1 |
| 13 | 2.14 | Bash-layer failures | 22 | 6 | 66 | 15 % | 2 | 44 | harm | removed by in-process tools | new |
| 14 | 2.8 | Death recovery is a hand-driven protocol | 14 | 7 | 375 | 79 % | 3 | 42 | exposure | harness; stuck spirit healer = core | 8 |
| 15 | 2.7a | Wrong character acted, or could have | 10 (read) | 3 | — | 0 % | 4 | 40 | harm | harness removes the class | 7 (part) |
| 16 | 2.12 | Gains are proved by hand | 18 | 6 | 176 | 39 % | 2 | 36 | exposure | harness | 12 |
| 17 | 2.16 | World knowledge: named places, spawns, NPCs out of view | 5 | 4 | 6 | 0 % | 3 | 15 | exposure | open question (Q7) | new |
| 18 | 2.17 | Silent protocol parse errors | **1** | 1 | 1 | 0 % | 3 | 3 | harm; **sessions = 1** | harness requirement | part of 13 |

All-episode numbers for comparison (sessions / 131): 2.3 76, 2.6 49, 2.9 48, 2.10 60, 2.4 38, 2.2 20, 2.7b 37, 2.11 23, 2.5 24, 2.13 30, 2.1 12, 2.14 23, 2.8 14, 2.12 19, 2.16 5, 2.17 1 (measured).

Signatures (measured over command `C` and result `R`; regexes in the scripts):

| id | signature |
| --- | --- |
| 2.1 | `R` shows own `life` dead or ghost. Side counts: attacker hunts (`select(.target==…)`) 5 sessions; low own HP printed 8 sessions |
| 2.2 | `C` tests `factionTemplate`, decodes `npcFlags`, reads a guessed `relation`/`reaction`/`hostile`, or name-regexes a mob family |
| 2.3 | `R` has `"kind":"intent"`, `Daemon accepted request`, `No server result confirmed`, or a bare `OK` line |
| 2.4 | `R` has `obstructed`, `height_unresolved`, `UNKNOWN_HEIGHT`, `ambiguous ground column`, `destination_not_grounded`, `self_not_grounded`, `end snapped off` or `pick_destination`. Side counts: `walk-toward` that returned 0 yd traveled 107 episodes / 16 sessions; any `goto` 217 episodes / 38 sessions |
| 2.5 | `C` relogs (`stop` … `start`) or whispers `.gps`. Side count: a (0,0,0) pose in `R` 53 episodes / 6 sessions |
| 2.6 | `C` sleeps 5 s or more, or loops with a sleep. `read --wait` (the taught alternative): 80 episodes / 27 sessions |
| 2.7b | `C` runs `start` then `sleep N` |
| 2.7a | incidents in reports: omp-qa `01a0dc31` (in-13), `01a0dd44`, `01a0ddcd` (in-15), `01a0ddf6`, `01a0de12` (in-16); omp-ovn `01a0db50`, `01a0db64` (in-20), `01a0dafe-7108` (in-18); omp-work `01a0de29` (in-24, a risk, not an incident), `01a0deb6` (in-25) |
| 2.8 | `C` uses `reclaim`, `query-corpse`, `resurrect` or `spirit-healer`. Side count: corpse or reclaim plus hand legs (`face`, `move forward`, `walk-toward`, `atan2`) 150 episodes / 6 sessions |
| 2.9 | `C` reads `session.log`, pipes `logs`, pipes `read` into grep/jq/python, or runs `record` (the taught verb, 8 episodes; harmless in the count) |
| 2.10 | `C` pipes `--json` into jq, python, `bun -e` or node. Harm: `R` has `cannot use null as iterable`, `KeyError`, `TypeError`, `jq: error` (64 episodes / 20 sessions) |
| 2.11 | a session has ≥ 3 consecutive episodes with the same command shape (digits masked), or one command loops `face`/`move`/`walk-toward`/`goto` and prints ≥ 3 identical refusal lines. Lower bound |
| 2.12 | `C` reads `item_push`, `coinage`, `REWARDS`, `lastLoot`, a baseline, or builds a `Counter` |
| 2.13 | `C` probes `lastOutcome`, `attacking`, `inCombat`, `pendingCast`, `casting` or `unknownLearned` |
| 2.14 | `R` has `cannot use null as iterable`, `command not found`, `environ: Permission denied`, the shell's `read` rejecting `--json`, or a `bc` error. omp's `Backgrounded as job` (291 episodes / 71 sessions) is excluded: it is often the intended behaviour |
| 2.15 | `R` has `ready and env require a service name`, `WOW_ACCOUNT_1` or `No config found` |
| 2.16 | `C` greps AzerothCore SQL or `db_world` tables. The in-18 trainer search (`01a0df09`) is read, not matched |
| 2.17 | `R` or `C` names `SMSG_INITIAL_SPELLS` |

What moved (inferred): deaths (2.1) fall from 1 to 12 because only 12 of 114 game-facing sessions died, and 88 % of death episodes are 01a0c5e0. Relog (2.5) and corpse runs (2.8) fall for the same reason. Intent replies, polling, log mining and parsing rise because nearly every kind meets them. Hostility (2.2) stays high on severity; only 15 % of its episodes are 01a0c5e0, so v1 did not over-weight it.

Single-session claims checked (measured, critic.md §2 list): `take-loot` refused while the item was pushed (`loot_source_unavailable`) 5 episodes, **1 session** (01a0c5e0), kept as an example in 2.12 only. `SMSG_INITIAL_SPELLS` parse error, **1 session** (claude-subagent `278d94e4`), 2.17. Wrapper `/proc/…/environ: Permission denied`, **1 session** (`omp-work/01a0debf-ee8a`), 2.14. `cannot use null as iterable`, 58 episodes in **17 sessions**, 2.14.

### 2.1 Danger is invisible: damage, aggro, attacker and death arrive only by polling

**Need.** Know at once that the character is hit, by whom, and that it is dying or dead.

**Workarounds.**
- `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/617-618`, 2026-09-22T16:41:13Z (read, in-01 #131–#132): `face -2.462; move forward 3000` → `ERR rooted` while `nearby` said the Stalker was 115.8 yd away; next `combat --json | python3 …` printed `hp 0 max 187`.
- `omp-qa/01a0dedf-e6a2-7788-83c0-a2d68c4cde12/26..32`, 2026-09-26T18:03:05Z (read, in-17 #104–#110): `($A fight $G --json > tmp/fight1.json 2>&1 &)`, then `combat --json | jq -c '.data|{attacking,attackTarget,hp:.self.health,attackers}'` between `sleep 12/3/4`. HP 217 → 120 → 42 → 1 → 0; `attackers` null. Character abandoned.
- `omp-other/01a0cdfa-e036-7101-a548-e0f58877b366/218-222`, 2026-09-23 ~11:41Z (read, in-28): hp 86 → 72 → 49 → 28 → 12 → 0 while fleeing; agent guessed "Manawraith ranged? or DoT".
- `omp-other/01a0ce2c-6239-727b-9a2d-64d45a1ebc64/144`, 12:23:33Z (read, in-29): aggro seen only because a grep matched `"target":"0x3eb"` in a `nearby` row.
Five deaths in one session appear three times: in-02 (omp-main 01a0c5e0), in-11 (`:M3LiveVerify`), in-22 (claude-main e541e5d4) (read). A watcher that "prints only on success" was silent 40 minutes after a death (in-22 #119, read).

**Today** (read, taught-surface.md §1). `combat --json data.self.health` is a snapshot with no age. COMBAT `attacked` carries only full `CombatState`, no attacker GUID (`combat.ts:464-466`). No health-change event type (`combat.ts:117-131`). "Who attacks me" means filtering `nearby` rows whose `target` is self. The core already has `attackers()` (`src/wow/combat.ts:193`), used by self-defence (`src/wow/runtime.ts:384`) and on the shared WorldHandle mock (`src/test/mock-handle.ts:111`); no CLI verb prints it (measured, rg).

**Harness answer.** waking-event + human-panel-widget.
- Event `threat` (waking): first damage from a new source, HP crossing 50 % and 25 %, `rooted`, death. Content one line, e.g. `Under attack: Springpaw Stalker L7 (0xf130…ace), 12 yd NE, you 141/187 HP (-23 in 3 s)`. Wake only on a new attacker or threshold; at most once per 5 s per attacker (inferred rate).
- Reflex in code: a movement or recovery procedure aborts on `rooted` or death and says why, so no loop "moves a corpse" (`hop1 hp=0 … hop4 hp=0`, in-22 #145, read).
- Panel `vitals`: HP/power bars, life badge, "attacked by" row (name, level, HP bar, distance).
- Every action result carries `self: {hp, maxHp, deltaHp, life}`.

**Revision evidence** (read, in-14 and in-03).
- `omp-qa/01a0dcd6-57c6-761f-8b76-82803bd023d3/46`, 08:38:41Z (in-14 finding 4): a 12-step poll loop printed own HP 9, 7, 2, 1, 1, 0 and nothing acted on it.
- `omp-qa/01a0dd1b-0999-73f8-a67c-d766ac3d711c/45`, 09:50:30Z (in-14 finding 8): `select(.target=="0xaf5")` found no attacker while HP fell 129 → 115; dead two calls later. The Crazed Dragonhawk showed 148/148 at a constant 12.47 yd in `nearby` while `tactics` said 75 HP (`…/52`, in-14 finding 7).
- `omp-main/01a0c5e0…/1838-1843` (in-03 finding 6): three reclaims beside a Springpaw Stalker at 2.8 yd, three deaths; `recovery` said alive HP 20 and `combat` said HP 0 within 4 s (`/1841`, `/1842`).

**Scope.** Harness: `threat` events, vitals panel, `self` block on every result. Core already has `attackers()`; exposing it in the CLI is Q8. Reflexes that halt, defend or flee without the model need Q4.

### 2.2 Hostility, creature type and NPC role are not fields

**Need.** What can I fight, what attacks me, who sells or trains.

**Workarounds.**
- `omp-qa/01a0dec4-7514-733e-bdfe-fa413c0a0aec/27`, 2026-09-26T17:33:21Z (read, in-17): `nearby --all --json | jq -c '.data[] | select(.factionTemplate==38 or .factionTemplate==7 or .factionTemplate==14) | select(.health>0)'`.
- `omp-other/01a0dd1e-e075-7068-b081-ccae3151a931:LiveProof/117`, 2026-09-26T10:24:55Z (read, in-31): `select(.type=="unit" and .factionTemplate!=1604 and .factionTemplate!=1603 and .factionTemplate!=188 and .factionTemplate!=35 and .health>0 and .level>=5 and .level<=12)`.
- `claude-subagent/278d94e4-abe9-4a73-b524-c824c97395c7:agent-a12e73e0ae57a56f3/25`, 2026-09-25T08:34:38Z (read, in-24): `jq -r '.data[] | … | [.guid,.name,.type,(.distance|floor),.health,.level,.hostile // .relation // ""] | @tsv'` — both fields guessed, neither exists.
- Roles: `select(((.npcFlags//0)/16|floor)%2==1)` (in-15 #39); `vendor=\(((.npcFlags//0)/128|floor)%2)` (in-16 #89) (read).
**Severity.** `fight` refused a Crazed Dragonhawk with `unverified_hostile_relation`, and that mob killed the character four times (in-22 #124–#126, read). Agents used `attack` as a hostility probe (in-27 #86, in-28 seq 115/126, read).

**Today** (read). `nearby --json` gives raw `factionTemplate`, `unitFlags`, `npcFlags`. Relation only in `tactics --json lastOutcome.observation.targetRelation` after a fight (SKILL.md:262). SKILL.md:458 teaches the bitmask. `src/wow/nearby.ts` and `src/daemon/nearby.ts` contain no `relation`/`hostil` (measured, rg). Core has `targetRelation(…)` (`src/wow/combat-actions-target.ts:58`) over `FactionTemplateCatalog` (`src/wow/faction-template.ts:24`) (measured, rg); the catalog is optional (`combat-actions.ts:41`), so `unknown` must stay a real value (inferred).

**Harness answer.** agent-query-tool + tool-result-renderer + panel.
- `wow_nearby({relation?: "hostile"|"neutral"|"friendly"|"attackable", kind?, role?: "vendor"|"repair"|"trainer"|"class_trainer"|"quest_giver"|"spirit_healer"|…, name?, alive?, within?, sort?: "distance"|"threat", limit?: 8})`.
- Row: `guid, name, level, levelDelta, relation (hostile|neutral|friendly|unknown), attackable, attackingMe, targetOf, alive, lootable, tapped, creatureType, roles[], hp, maxHp, distance, bearing, turn, ageMs`.
- Content: one line per row up to `limit`, then `+23 more (12 objects, 9 friendly, 2 far)`.
- Renderer: coloured table (relation colour, HP bar, bearing arrow), five rows collapsed (pi-ui.md §8 idea 1).

**Revision evidence** (read). in-14 finding 9: `select(.type=="unit" and .npcFlags==0 and (.level//0)<12 …)` as a hostility proxy returned critters, in seven episodes of two sessions (`omp-qa/01a0dcd6…/18` and others); `.relation // .reaction` printed `-` on every row (`…/10`). in-14 finding 18: the spirit healer found by `((.npcFlags/16384)|floor)%2==1` because jq has no bitwise and (`omp-qa/01a0dd1b…/62`). in-18 finding 7: a trainer search by `npcFlags % 32 >= 16` returned nothing (`omp-qa/01a0df09-1f6d-732a-932e-5db4aa234356/27`, file line L21).

**Scope.** Harness + CLI parity (Q8). Keep `unknown` as a real relation when the faction catalog is absent.

### 2.3 Actions return an intent, not an outcome

**Need.** Did it work, and what changed.

**Workarounds.**
- `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/548`, 2026-09-22T16:16:38Z (read, in-01 #72): `for i in 1 2 3 4 5 6; do ./dist/tuicraft move forward 4000 | head -1; sleep 5; ./dist/tuicraft control --json | python3 -c "…print(round(p['x'],1),…)"; done` → `OK` six times, pose fixed at 8685.0 -6707.4.
- `omp-other/01a0cdfa-e036-7101-a548-e0f58877b366/57`, 11:22:35Z (read, in-27): `for s in 0 1 2; do $B take-loot $s --json; sleep 2; done; $B release-loot --json; sleep 2`.
- `omp-other/01a0dd1e-e075-7068-b081-ccae3151a931:LiveProof/76`, 2026-09-26T10:10:28Z (read, in-31): `fight $M --json | jq -c '.data // .error'` → `null`; outcome only in `tactics --json | jq -c '.data.lastOutcome'`.
- `claude-subagent/278d94e4-abe9-4a73-b524-c824c97395c7:agent-ac2a8bbe749ebeffb/50`, 2026-09-25T08:15:31Z (read, in-24): `cast 594 <guid> --json` → `{"kind":"intent","data":null}` twice; targets still full HP, no reason.
≥785 results carry a bare `OK`, ≥297 `"kind":"intent"` (measured).

**Today** (read, taught-surface.md §1). Mutations return `kind:"intent"`, `data:null`; the agent must know which of ~10 inspections answers (`INSPECTIONS`, `src/cli/send-output.ts:167-180`). `fight --json` drops the outcome line (C6). Human `Last:` lines of `vendor`/`trainer`/`inventory` already give outcome, reason and coinage delta.

**Existing design.** `docs/plans/2026-09-26-action-results-design.md` is "design only, not implemented" (measured, line 3); no `src/wow/action-result.ts` (measured). Its "Harness consumption" section (read via prior-ux.md §4) proposes settled `ActionResult` (`confirmed|refused|unanswered|superseded|unconfirmable` with evidence) and `wow_wait(id)`/`wow_cancel(id)`. Build on it (inferred).

**Harness answer.** typed-tool-result. Every mutating tool awaits settlement (bounded) and returns `{status, reason?, evidence:{opcode, at}, after:<observation>, changed:{deltas}}`. `after` is what the agent would fetch next (pose for movement, target HP for combat, window contents for loot/vendor, life for recovery). Content one sentence, e.g. `buy: confirmed, 5x Refreshing Spring Water, -25c (50102 → 50077)`.

**Revision evidence** (read). in-14 finding 12: `face-guid`, `move forward 4000` both replied "No server result confirmed"; the leg had been refused at once with `height_unresolved`, visible only in `control` 4.5 s later (`omp-qa/01a0dcd6…/15`). in-14 finding 20: `fight … --json` blocked about 17 s, then returned `kind:"intent"`, `data:null` (`omp-qa/01a0dd1b…/69`). in-18 finding 12: `accept-quest` then `sleep 2; quests --json` to prove the accept (`omp-qa/01a0df09…/14`, `/15`, file lines L9-L10).

**Why the envelope did not fix it** (read, prior-ux.md §4, lines 229-235): the output envelope solved *parsing shape* and deliberately left *meaning* to the agent (intent versus outcome, predicted versus server). The harness owns the meaning.

**Scope.** Harness, built on the core `ActionResult`/`ActionLedger` of the action-results design, which is design only today. That core work is a prerequisite; the harness must consume it, not reinvent it (prior-ux.md §4).

### 2.4 Movement refusals give no usable next move

**Workarounds.**
- Heading sweep, `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/551`, 2026-09-22T16:17:31Z (read, in-01 #75): `for h in 1.57 3.14 -1.57 2.5 -2.5 0.8 -0.8; do face $h; move forward 3000; sleep 4; control --json | python3 … d.get('blockedReason'); done`.
- Navmesh from outside the CLI (in-06 template E, read): `bun -e 'import { createNavigation } from "wow/navigation"; … const b=Math.atan2(cy-pose.y, cx-pose.x); for (const deg of [0,-10,-20,10,20]) { … nav.height(530, nx, ny, pose) … }'`. 89 episodes in 4 sessions (measured).
- Poll on a non-existent field after a synchronous refusal: `omp-qa/01a0dec4-7514-733e-bdfe-fa413c0a0aec/21`, 2026-09-26T17:31:34Z (read, in-17): `goto` returned `kind:error UNKNOWN_HEIGHT` at once, then `for i in $(seq 1 20); do sleep 2; navigation --json | jq -c '.data | {status,blockedReason}'; … && break; done` ran 41.45 s.
- `omp-work/01a0de21-d066-718e-bf0a-e45f79ce0ed5/60`, 2026-09-26T14:41:29Z (read, in-24): six goto candidates in a loop, all refused.
**Severity.** Stalls: 21 identical 7-step cycles in 46 min (in-06); a ghost for 128 min walking from 140.7 to 232.4 yd from its corpse (in-08) (read).

**Today** (read). `goto` prints `ERR stop: pathfind_find_height failed (UNKNOWN_HEIGHT)`; the advice is only in `navigation --json` ("Only `navigation` gives that advice", SKILL.md:289, measured). `control blockedReason/nextStep`. `walk-toward` returns `{status, traveled, pose, reason}` and keeps `data` on a stop since 979cadf. The goto done predicate `active:false && replan.pending:false` is re-derived by agents (in-17 #17).

**Harness answer.** typed-tool-result + agent-query-tool + renderer.
- `wow_travel({to: guid|"corpse"|{x,y,z?}, within?})`: plans, walks, replans, resolves only at a terminal state `{status:"arrived"|"refused"|"stopped", reason:<enum>, detail, nextStep, options:{floors?, openHeadings?, nearestGrounded?}, retryable, traveled, pose}`; streams progress via `onUpdate`.
- `wow_probe_ground({around?, headings?, points?})` → per heading/point `walkable, z, floors, reason`, using the same code path as the walk (in-29 finding 8 shows probe and `control` disagreeing, read).
- Refuse an exact repeat of a terminal refusal from the same pose (2.11).
- Renderer: compass rose of open/refused headings; mini-map with route, stops, refused cells.
Open decision: the spatial design rejected auto-detour (prior-ux.md §2, read), but agents detour by brute force (question 2).

**Revision evidence** (read).
- in-14 finding 2: a Z brute force, 36 `goto` calls over nine heights, all refused (`omp-qa/01a0dcd6…/13`). 11 `goto` attempts around Fairbreeze refused `pick_destination: ambiguous ground column` with no `floors` list, although SKILL.md:289 promises one (in-14 summary 1; in-03 finding 14, `omp-main/01a0c5e0…/1931`).
- in-18 finding 3: `UNKNOWN_HEIGHT` with `refusal: stop` does not say which endpoint failed (`omp-qa/01a0df09…/17`, `/19`, file lines L12-L14). in-14 finding 22: refused even a few yards from the own pose, so the agent suspected a regression (`omp-qa/01a0dd1b…/24`).
- in-18 finding 5: four `goto` calls in 240 ms redirected each other; `navigation_replaced` was invisible to the loop (`omp-qa/01a0df09…/40`).
- in-03 finding 11: `obstructed` was a false refusal. All three rays had `los=true` (`omp-main/01a0c5e0…/1907`), and a raw `move forward 2000` on the same bearing crossed (`…/1936`), confirmed by relog.

**Scope — split.**
- **Harness (observation):** the refusal carries endpoint, `nextStep`, `floors` and open headings inline; `wow_probe_ground`; refuse an exact repeat; render refusals on the map.
- **Core track (making movement succeed):** planner refusals (every M5 `goto` refused `ambiguous ground column`; native findHeight is origin-dependent, prior-ux.md §1b), false `obstructed` refusals, and `walk-toward` failing live (M6 8/8 failed, 62 of 119 `move` legs moved 0 yd, prior-ux.md §1b; here 107 episodes in 16 sessions returned 0 yd, measured). A progress row only shows these failures; it does not fix them.
- **Auto-detour was rejected by design** (prior-ux.md §2, `ux-spatial-observation/01a0cb6b-cfcd/seq=116`). The harness must not add it unless the maintainer reverses that decision (Q2).

### 2.5 Pose truth: predicted versus server, relog as sensor

**Workarounds.**
- `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/2102`, 2026-09-23T02:27:54Z (read, in-04): `./dist/tuicraft stop 2>&1 | head -n 1; sleep 1; ./dist/tuicraft start 2>&1 | head -n 1; sleep 10; ./dist/tuicraft control --json | python3 -c "…print('server pose', …, d['pose']['source'])"` — about 11.4 s each. 156 relog episodes in 18 sessions (measured). Relog forgets the corpse (`corpse_unknown`, in-04 #51, in-08 finding 1) and floods the buffer (read).
- `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/4266` (read, in-10): `send -w Xiara '.gps' --wait 2 --json | jq '[.events[]|select(.type=="SYSTEM" and (.message|startswith("X:") or startswith("GroundZ:")))|.message]'`. 36 episodes in 9 sessions (measured). Not taught (in-09, 0 hits).
- in-02 #105–#149 (omp-main/01a0c5e0…, 2026-09-23 01:25Z–01:40Z, read): pose `(0,0,0) source=server`, `reclaim distance 10882.18`; five relogs, 15 minutes.

**Today** (read). `control --json pose{…,source,updatedAt}`, `serverPose`. SKILL.md:186 teaches the relog (measured). Self movement is not echoed, so the client cannot invent confirmation (inferred).

**Harness answer.** passive-event + panel + agent-query-tool. One pose object everywhere: `{x,y,z,mapId,zone?,facing,source:"predicted"|"server",ageMs,lastServerFix:{ageMs,driftYd}}`. Passive event on `server_correction`, teleport, reset; waking only on large drift or collapse to (0,0,0) (inferred rule). `wow_confirm_pose()` uses GM `.gps` when available, else states that only a relog confirms and performs it while keeping corpse/recovery state (question 1). Footer: coords, facing arrow, source badge, age, drift.

**Revision evidence** (read, in-03 findings 1-3). The server really held the ghost at (0,0,0): `.gps` returned `X: 0 Y: 0 Z: 0` in Hellfire Peninsula (`omp-main/01a0c5e0…/1833`), while `recovery` gave a confident `corpse_out_of_range 10882.18` with no validity flag (`…/1736`, `…/1744`). A five-probe loop with relogs ran six times over about 10 minutes (`…/1795` to `…/1823`). Measured: a (0,0,0) pose appears in 53 episodes of 6 sessions (89 % 01a0c5e0).

**Scope.** Harness: label every pose and distance with source, age, drift and **origin validity** (flag a (0,0,0) or otherwise impossible origin). **Core track or GM-only:** getting server truth without a relog. Nothing in the harness plan can confirm a pose without a relog or a server correction; either core adds a cheap server-pose probe, or the harness only labels confidence (Q1).

### 2.6 Long actions block or must be polled

**Workarounds.**
- `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/1985`, 2026-09-23T02:13:01Z (read, in-04): `sleep 75; ./dist/tuicraft cycling --json | python3 -c "…print('active', d['active'], 'phase', d['phase'], …)"`. Nine such waits ≈ 22 % of that session; the character died during one and the agent learned it 60 s later.
- `claude-subagent/278d94e4-abe9-4a73-b524-c824c97395c7:agent-ac2a8bbe749ebeffb/54`, 2026-09-25T08:16:10Z (read, in-24): `for i in $(seq 1 50); do s=$(bun src/main.ts cycling --json | python3 -c "…"); r=$(bun src/main.ts recovery --json | python3 …); …; sleep 6; done`.
- `omp-qa/01a0dedf-e6a2-7788-83c0-a2d68c4cde12/42`, 2026-09-26T18:06:15Z (read, in-17): `$B route --json | jq -c '.data|{active,remaining}'` ×20 — no `route` verb; 41.41 s of `cannot use null as iterable`.
- Agents built the harness themselves: a Python thread running `cycle` while `quiet()` polls (`omp-work/01a0ddfd-2e2a-73f8-a951-6f9c2dceddd1:LiveQuestLoop222/22`, in-24); a Bun `cli()` helper running `cycle` as a promise and polling three verbs (in-12 finding 14) (read).
1519 episodes contain a literal `sleep` (22 304 s); `read --wait` in only 80 episodes / 27 sessions (measured). `read --wait` wakes on any event, including churn (taught-surface.md §2.2, read).

**Today** (read). `fight`/`cycle` block and return `kind:intent`, `data:null`; outcome in `tactics .lastOutcome` / `cycling stopCause`. `tail` is a 1 s poll (taught-surface.md §2.3).

**Harness answer.** typed-tool-result with streamed updates + waking-event + panel. Long tools block with `onUpdate` partials or return `{id, status:"running"}`; either way they end with one waking `run_ended {id, kind, outcome, reason, xp, loot, hpAfter}`; all honour `AbortSignal`. Phase events (`fight_started`, `cast_started`, `target_done`) so "drink a potion mid-fight" needs no 0.25 s spin (in-17 #118). Panel: current run (target frame, HP bars, queue with status and cause).

**Revision evidence** (read). in-18 finding 4: `goto …; sleep 12` although the ERR came back in about 110 ms, so the chain slept 12 s on a refusal (`omp-qa/01a0df09…/17`, `/19`; wallMs 12400/12190 measured there). in-14 finding 6: the fight was pushed to the background so the agent could use a potion mid-fight (`omp-qa/01a0dd1b…/42`). in-03 finding 20: `sleep 20`, `sleep 45` before `cycling --json` (`omp-main/01a0c5e0…/1956`, `/1981`).

**Scope.** Harness.

### 2.7 Session identity (2.7a) and world readiness (2.7b)

**Incidents** (read): in-13 seq 1 (omp-qa `01a0dc31…`, chat sent as Xiara after XDG exports did not persist); in-15 run 27 (`omp-qa/01a0dd44…/9-15`, 2026-09-26T10:30:59Z) and run 37 (`01a0ddcd`, 13:01:46Z); in-16 (`01a0ddf6` #13–#17, `01a0de12` #30–#35); in-20 (`omp-ovn/01a0db50…:LiveLootVerify/1`, 01:28:11Z; `01a0db64…/195`, 02:55:52Z); in-24 (`omp-work/01a0de29-1efe-72e6-889a-93135e7d8ffb/30`, 2026-09-26T14:42:50Z: "if the maintainer was already logged in as Xiara elsewhere, my login attempt could have kicked their session out"); in-25 #74–#79 (drove the live suite's account). At least nine incidents in six reports.
Readiness: `start` prints `CONNECTED` when the socket answers; agents `sleep 2` to `sleep 25` (in-19, in-29), or act early and get `target_not_observed` (in-17 #71) or skip a live mob as `target_not_pve_creature` (in-31 #96). Environment invisible: agents read `config.toml` and `/proc/<pid>/maps` for the loaded nav library; one `pgrep` dumped ~23 900 chars of other agents' prompts into context (in-17 #121) (read).

**Today** (read). `status` reports only `socket: responsive|not_running` (`commands.ts:414`); no verb names character, realm or world state. The wrapper (f25cfdd) refuses a config naming another character; wrapper sessions had no identity trouble (in-16).

**Harness answer.** affordance `none` fits best: a construction rule (in-20 finding 1). Bind account and character when the session is built; never auto-start on a query; gate world tools on `world_ready` (self pose known, first object burst). Header/footer always show character, level, class, realm, zone, world state and loaded capabilities (navigation data, spell data, Jev key).

The two halves rank apart in the revision: **2.7a** wrong character (10 sessions, read, sev 4) and **2.7b** readiness (37 sessions measured by `start … sleep N`, sev 2).

**Revision evidence** (read).
- 2.7a, in-18 finding 13: a smoke test, `bun src/main.ts send -s hi --json 2>&1 | head -0`, auto-started a daemon from `~/.config/tuicraft` in a worktree and made Xiara say "hi"; `head -0` hid it (`omp-ovn/01a0dafe-7108-7496-b7b0-a4bfeebd443f/102-107`, file lines L60-L65). A different mechanism from the XDG incidents.
- 2.7a, in-14 finding 19: `export TC=…` did not persist to the next tool call, so `$TC read --json` ran the shell's own `read` (`omp-qa/01a0dd0d…/10`).
- 2.7b, in-03 findings 4-5: `CONNECTED`, then pose `0 0 0 server` after 20 s (`omp-main/01a0c5e0…/1757`); `status --json` said `not_running` while `control --json` answered in the same command, and `start` then said "already running" (`…/1917`, `…/1918`).

**Scope.** Harness: identity bound at construction removes 2.7a; `world_ready` gating removes the readiness sleeps.

### 2.8 Death recovery is a hand-driven protocol

**Workarounds** (read):
- Overshoot, `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/621`, 2026-09-22T16:41:52Z (in-01 #135): reclaim distance 67.9 → 12.1 → 42.0 → 94.6; again #136, #139.
- Bearing by hand, `…/581`, 2026-09-22T16:29:39Z (in-01 #99): `python3 -c "import math; cx,cy=8716.89,-6558.52; gx,gy=8709.46,-6671.76; print('bearing', round(math.atan2(cy-gy,cx-gx),3))"`.
- A Spirit Healer 33.9 yd away never used across 21 cycles although `spirit-healer <guid>` existed (in-05 finding 2, in-06). Before the verb existed, `talk` + `select-option 0` ran ten times with nothing saying it could not work (in-07, pending age 296 s).

**Today** (read). `recovery --json` is one of the best verbs (§3). The corpse run is prose: SKILL.md:311 "short `face` and `move forward` legs … Recompute the heading … after each leg", no `goto` from a ghost (measured). `cycle` recovers in-run (1fbe0f2); manual deaths still follow the prose.

**Harness answer.** typed-tool-result + waking-event + panel. `wow_recover({prefer?:"corpse"|"spirit_healer"|"offer"})` lists legal options ranked with reasons (e.g. `corpse 114 yd (ground refused at 2 yd fan), spirit healer 33.9 yd, no resurrection offer`) and performs the chosen one with progress. Waking `reclaim_ready`, `revived`. Results always carry corpse bearing, distance, reclaim delay. Panel: corpse compass with 39 yd ring and countdown.

**Revision evidence** (read). in-14 finding 1: the ghost corpse run computed in jq and awk (`atan2(.corpse.position.y-…)`), 14 legs, stuck at 45.08 yd for 10 of them (`omp-qa/01a0dcd6…/55`). in-03 findings 15 and 7: a relog forgets the corpse (`corpse_unknown`, `epoch 0`, `…/1872`, `…/1920`); a "flee" to the own position reported `completed`, traveled 0.00015 (`…/1840`).

**Prior decisions** (read, prior-ux.md §2, lines 136 and 143): a recovery CLI wizard was **not built**; Theo chose an agent-facing playbook (`ux-recovery-flow/01a0cb6b-6550/seq=86`), and `cycle` then took over in-run recovery (1fbe0f2). So `wow_recover` should wrap cycle's recovery code path, not a new wizard (Q6).

**Scope.** Harness for the corpse run and options. **Core track:** `spirit-healer` stuck "remains unanswered" across retries and `halt`, cleared only by a daemon restart (#178, prior-ux.md §1b). With core in-process there is no daemon to restart, so either core fixes the stuck request or the harness gets an explicit session-reset command (Q14). **Out of scope:** Jev choosing `wait` 1241 of 1253 times (#179) is tactics; the harness only makes idleness visible (run tally, augmentation 24).

### 2.9 History only through a draining `read` or `session.log`

**Workarounds** (read):
- `omp-other/01a0cdfa-e036-7101-a548-e0f58877b366/257-258`, 2026-09-23T11:48Z (in-28): first `read --json` returned 339 events after a death, the second 0; evidence lost to its own grep.
- `claude-subagent/278d94e4-abe9-4a73-b524-c824c97395c7:agent-ac2a8bbe749ebeffb/55`, 2026-09-25T08:16:47Z (in-24): `tail -n +58778 ~/.local/state/tuicraft/session.log | python3 -c "… if t in ('RECOVERY','CYCLE') or (t=='CONTROL' and …)" | tail -60`.
- `omp-other/01a0dd1e-e075-7068-b081-ccae3151a931:LiveProof/173`, 2026-09-26T10:47:47Z (in-31): `grep -o '"type":"outcome"[^}]*"reason":"[a-z_:0-9]*"' session.log | sort | uniq -c`.
- Home-made journals and extractors: `ev.sh`, `fightev.py`, `tc.sh` (in-20, in-31, in-32).
122 episodes / 25 sessions mine the log; `record` 8 episodes / 5 sessions (measured).

**Today** (read, taught-surface.md §2, §4). One consuming cursor, no type filter, 1000-entry ring; ENTITY_APPEAR+DISAPPEAR 51.3 % of logged lines; chat events have no timestamp; TACTICS request ~9.7 KB, REWARDS ~23 KB (full state per event); `record` covers CYCLE/TACTICS/RECOVERY only.

**Harness answer.** agent-query-tool + passive-event + renderer. Per-domain game logs never drained by reading (design doc "Game logs"). `wow_events({types?, since?: mark|ms|runId, guid?, text?, limit?: 20})` returns compact rows with wall-clock time. Events carry deltas (`item_push {itemId, name, count, bag, slot}`). Entity churn becomes counts. Renderer: run timeline, one line per cast/reject/face/XP/loot/outcome.

**Revision evidence** (read). in-18 finding 11: every QUEST event carries the whole 25-slot quest log, truncated at 768 bytes (`omp-qa/01a0df09…/26`). in-03 finding 18: a second `read` printed `0 events` (`omp-main/01a0c5e0…/1958`), so the agent mined `logs | python3` five times. in-14 finding 15: death cause looked up by `logs > file; jq … | sort | uniq -c` (`omp-qa/01a0dd1b…/48-50`). in-18 finding 19: Jev action counts recomputed from `session.log` in Python (`omp-ovn/01a0db03-3f1a-7304-b136-fb38e4842557/331`, file line L110).

**Scope.** Harness. In-process event subscription removes silent 1000-entry ring eviction and cursor contention **only if** the harness keeps its own per-domain logs and does not read through the daemon ring buffer. State this in the architecture as a requirement (inferred).

### 2.10 Parse tax and schema guessing

**Workarounds** (read unless marked):
- 2410 of 3221 CLI episodes pipe into jq or python (measured); the top 20 python one-liners print four facts (§1.6).
- `.data.items` for inventory gave a false "empty bags" (`omp-other/01a0cdfa-e036-7101-a548-e0f58877b366/15`, 11:18:23Z, in-27). `who --json | jq '{n:(.data|length)}'` returned 3 (keys), leading to a theory of 500 hidden bots (`omp-qa/01a0de8d-859c-730d-aa9b-9ccf056e0ead/20`, 2026-09-26T16:30:59Z, in-17). `.type=="Unit" or .type=="NPC"` returned nothing (`…:LiveProof/53`, in-31).
- Envelope parsed as JSONL at hp 42, a lost turn (`omp-other/01a0ce2c-6239-727b-9a2d-64d45a1ebc64/150`, 12:24:11Z, in-29). A heredoc replaced stdin → "0 events" (`omp-main/01a0c088-31a1-77f0-983c-c19565427d52:GameplayOwner/52`, in-01 #22).
- Size: `nearby --all` lists transports 10 000 yd away first; `loot --json` embeds the whole inventory; `spells` without `--json` prints raw JSON; `tactics --json` needs `cut -c1-1500` (in-01 #49, in-15 finding 7, in-31 #55).

**Harness answer.** typed-tool-result everywhere; the tool schema is the manual; filter, sort and limit are parameters; content is short prose, full typed object in `details` (never reaches the model, pi-ui.md §1); absent data is explicit `null` with a reason.

**Revision evidence** (read). in-18 finding 8: `who --json | jq '.data|length'` returned 3 (object keys), not results (`omp-qa/01a0df09…/8`). in-14 summary 4: six `cannot use null as iterable` errors, each from a guessed shape (`quests.log` is `{complete,slots}`, `lastOutcome` null after an override, `loot.offer.items` absent). in-18 finding 18: a subagent built its own typed layer, `tc(*args, js=True, trim=4000)` plus `qsum/isum/csum/esum` projections (`omp-ovn/01a0db03-3f1a-7304-b136-fb38e4842557:QuestProbe/4` onward, file lines L126-L128) — a sketch of the harness tools.

Bash-layer failures that v1 listed here (`cannot use null as iterable` from the stderr banner merged into jq, non-stock jq) moved to 2.14.

**Scope.** Harness.

### 2.11 No-change loops

**Evidence** (read): in-06: 21 cycles of the same 7 steps in 46 min, results identical except `updatedAt` (worker-measured), journal +240 near-identical lines. in-05: seq 2414–2553, 7 steps ×11 in 16 min. `omp-main/01a0c5e0-4e6e-77f4-a053-b526e40e31ea/2100`, 2026-09-23T02:27:39Z (in-04 #47): `for i in 1 2 3 4 5 6; do ./dist/tuicraft walk-toward 20 8761.21 -6572.97 61.36 | python3 …; done` → `stopped 0 height_unresolved` ×6. in-07: the same refused `walk-toward 4 8720.3 -6638.9 70.99` three times in 18 min. SKILL.md:311 ("Stop if movement makes no progress") and :145 ("turn and try another heading") did not stop the loops (inferred).

**Harness answer.** typed-tool-result + waking-event. Observation results carry `unchangedFor: {calls, seconds}` over a digest (life, pose bucket, corpse distance, target). Movement tools refuse exact repeats of terminal refusals with the untried options. After N unchanged probes, wake once: "No change for 12 min. Untried: spirit-healer 0xf130…9f1 (33.9 yd)."

**Revision evidence** (read). in-18 finding 1: a four-pass loop repeated the same refused `goto` for 41 s (`omp-qa/01a0df09…/24`). in-14 finding 1: 10 of 14 corpse legs stuck at 45.08 yd (`omp-qa/01a0dcd6…/55`). in-03 finding 3: the same five probes six times (`omp-main/01a0c5e0…/1795` to `/1823`); finding 10: five to eight identical refused legs per loop (`…/1902`, `/1905`, `/1924`, `/1927`). Measured: 21 game-facing sessions, 7 kinds (23 over all episodes; signature in the §2 table).

**Scope.** Harness.

### 2.12 Gains are proved by hand

**Evidence** (read): baseline file + python `Counter` diff with string-vs-int keys → 50+ false deltas (`omp-other/01a0cded…/38-39`, in-27). `jq -c 'select(.type=="REWARDS" and .data.type=="item_push") | .data | {itemId:(.itemId // .entry // .item), count}'` → three all-null rows because `item_push` carries full state (`claude-subagent/278d94e4-…:agent-a12e73e0ae57a56f3/47`, 2026-09-25T08:38:54Z, in-24). `lastLoot.coinageAfter` read before the money credit (in-23 finding 6). `take-loot` said `ERR … loot_source_unavailable` while the log showed the item push (in-04 finding 5).

**Harness answer.** typed-tool-result + renderer. `wow_fight`, `wow_loot_all(corpse)`, `wow_turn_in` return `gained: {xp, money, items:[{itemId, name, quality, count}]}` from server events inside the call. Reward card renderer with quality colours.

**Revision evidence** (read). in-18 finding 9: `cycle` said `done (server_kill_credit), 80 XP, no loot` with no cause (`omp-qa/01a0df09…/22`, file line L16). in-03 finding 17: a loot window still printed `phase open` with items after it was invalidated; `invalidatedReason` only in `logs` (`omp-main/01a0c5e0…/1964`, `/1967`). The "take-loot refused but item pushed" case is **1 session** (measured), an example only.

**Scope.** Harness.

### 2.13 Combat state is easy to misread

**Evidence** (read): `combat --json | jq -c '[.data.attacking, .data.lastOutcome.status]'` printed `[true,"failed"]` for 11 ticks while melee killed the mob; `lastOutcome` is the last cast, not the swing (in-17 #64). Numeric codes needed a source grep (`server_action_rejected:134` → AzerothCore `Spell.cpp`, in-22 #60–#61; `result: 12`, in-20). All 70 spells in `unknownLearned` until `spells` ran once (in-22 finding 10). `.casting`/`.pendingCast` guessed, absent (in-26 #36, #45). A swallowed `SMSG_INITIAL_SPELLS` parse error made spells silently empty (in-23, fixed by d2d5d27, dcc336f).

**Harness answer.** typed-tool-result + passive-event. Swing errors (`not_facing`, `out_of_range`) apart from cast outcome; every code has its enum name; spells and auras carry names; packet errors surface as passive events the human also sees.

**Revision evidence** (read, in-14).
- Finding 14: re-issuing `face-guid` each tick, as SKILL.md:147 teaches, stopped auto-attack; mob HP stayed at 37 for 30 s (`omp-qa/01a0dcd6…/42`). Finding 13: `attacking=true` beside `lastOutcome … not_in_range`, then `face-guid` turned it into `interrupted` (`…/65`). This contradicts SKILL.md:147 ("keep auto-attack").
- Finding 17: a potion returned `{"status":"failed","spellId":440,"result":67}` with no reason; the agent guessed twice and grepped AzerothCore (`omp-qa/01a0dd1b…/16`, `/43`).
- Finding 24: no `inCombat` field; combat inferred from food failing with `inventoryResult 60` (`omp-qa/01a0dd1b…/37`).

The silent `SMSG_INITIAL_SPELLS` parse error above is also ranked on its own as 2.17 (1 session).

**Scope.** Harness.

### 2.14 Bash-layer failures (removed by in-process tools, not a UI feature)

**Evidence** (measured unless marked). 66 game-facing episodes in 22 sessions, 6 kinds (67 in 23 over all episodes). `cannot use null as iterable` 58 episodes in 17 sessions: a filter over `data` on an error envelope, or the wrapper's stderr banner merged by `2>&1` (in-26, read); two workers inferred that omp's jq is not stock jq. `command not found` 8 sessions, including `export` not persisting between tool calls so `$TC read --json` ran the shell `read` (`omp-qa/01a0dd0d…/10`, in-14). `bc` absent, so `sleep $(… | bc -l)` got no argument and four face/move pairs fired at once (in-14 finding 3, `omp-qa/01a0dcd6…/21`; 1 session by regex). Wrapper `/proc/…/environ: Permission denied` **1 session** (`omp-work/01a0debf-ee8a…/83`, in-26). `pgrep` dumping about 23 900 characters of other agents' prompts (in-17 #121, read). omp auto-backgrounding (`Backgrounded as job`, 291 episodes / 71 sessions) is excluded from the count because it is often the intended behaviour.

**Scope.** In-process tools remove the whole class: no shell quoting, no env persistence, no stdin or stderr mixing, no host tools. Count it as **removed**, not as a harness feature (principle 16).

### 2.15 Live verification needs hand-set credentials

**Evidence.** 29 episodes in 28 sessions, 5 kinds, 15 of them omp-review (measured): `mise test:live` without `WOW_*` fails with "ready and env require a service name", then the worker repeats it with env vars (in-18 finding 16, read). 8 of 8 reviewers ran it first with no credentials and 0 of 8 set `XDG_CONFIG_HOME` (in-33, read). The "forced teleport" live test fails through carried state and three workers re-diagnosed it independently (in-18 finding 15, read).

**Scope.** Factory track, not the game harness (Q12). Noted because it is the most spread harm with 0 % from 01a0c5e0.

### 2.16 World knowledge: named places, spawns, NPCs out of view

**Evidence.** 5 sessions grep AzerothCore SQL or `db_world` for spawns and drops (measured; in-28 seq 235, in-29 seq 133, read). in-18 finding 6: no named-place planner, so the agent guessed Falconwing Square coordinates, got three refusals, relogged into a river at z=8.1 and abandoned the scenario (`omp-qa/01a0df09…/32` to `/48`, file lines L22-L27, read).

**Scope.** Open (Q7). A `find_npc(role, skill)` or spawn query needs a data source the client does not have today.

### 2.17 Silent protocol parse errors

**Evidence.** A swallowed `SMSG_INITIAL_SPELLS` parse error left the spellbook empty with no message (in-23 finding 2, read; fixed by d2d5d27, dcc336f). **Sessions = 1** (measured).

**Scope.** Harness requirement despite one session: surface PACKET/parse errors as passive events the human also sees, because the failure is silent by nature and one session is a lower bound (inferred).

### 2.18 Pain with no harness answer (summary)

| pain | where | owner |
| --- | --- | --- |
| Server-truth pose without a relog | 2.5 | core track (server-pose probe) or GM-only; harness labels confidence (Q1) |
| Planner refusals (`ambiguous ground column`, origin-dependent findHeight, false `obstructed`) | 2.4 | core roadmap; harness observes and reports |
| `walk-toward` failing live (M6 8/8; 107 zero-yard episodes, 16 sessions) | 2.4 | core movement bug; harness shows progress only |
| Stuck `spirit-healer` needs a daemon restart (#178) | 2.8 | core bug; harness session-reset is a stopgap to decide (Q14) |
| Jev idles on `wait` (#179) | 2.8 | out of scope (tactics); harness only makes it visible |
| Auto-detour | 2.4 | rejected by design; out of scope unless reversed (Q2) |
| Live-suite credentials | 2.15 | factory track (Q12) |
| World knowledge | 2.16 | open (Q7) |

---

## 3. What works well today and must survive

(read, from the shard reports' "used well" sections)
- **`walk-toward --json`**: `{status, traveled, pose, reason}` in one terminal result. The shape for every movement tool.
- **`recovery --json`**: `life`, `epoch`, `corpse`, `reclaim.{canRequest, readiness, reason, distance, remainingMs}` in one read; `reclaim.distance` stayed right while `nearby` was stale (in-01 note 11).
- **`navigation --json nextStep` prose**: followed and worked (in-17 #21; in-25 #34→#36).
- **`control --json`** labels: `pose.source` beside `serverPose`; `target` beside `requestedTarget` (in-22).
- **Honest refusal codes**: `target_friendly`, `target_not_pve_creature`, `target_unobserved`, `unverified_hostile_relation`; `open-loot` "Creature has no observed lootable flag"; `face` rejecting bad args without a packet.
- **Human `Last:` lines**: `Last: buy 3 purchases … confirmed, -71 copper (coinage 50000 -> 49929)` — outcome, reason, delta in one line. The model for action-result content.
- **`cycling --json stopCause/stopDetail`**, e.g. `objective_targets_out_of_reach {nearest, distance:53, reach:50}`.
- **`tactics .lastOutcome.reason`** `server_kill_credit`.
- **Next-action hints** (`Next: tuicraft accept-quest`), followed directly.
- **`nearby` human rows** with distance, 2D distance, face, turn, origin.
- **Wrapper identity check** refusing another character's config.
- **omp wake-on-finish** ("Do NOT poll") worked 8/8 for reviewers (in-33). Waking events should feel the same.

---

## 4. Taught versus actual

### 4.1 The skill teaches the hacks (SKILL.md at HEAD, measured with rg unless marked)

| SKILL.md | teaches | caused |
| --- | --- | --- |
| :186 | "Relog (`stop`, then connect again) and read `control` to see the server-accepted position." | 156 relog episodes / 18 sessions (measured); ~11 s each; resets corpse state |
| :311 | corpse run by "short `face` and `move forward` legs … Recompute the heading"; no `goto` from a ghost | ~60 hand legs and 27 `atan2` in one shard (in-12); overshoot |
| :289 | after `height_unresolved`, "try a different short heading" | sweeps with no stop rule (in-20, in-01) |
| :289 | "Only `navigation` gives that advice." | every goto refusal needs a second call |
| :458 (and :441, read) | `npcFlags` bit meanings | bit arithmetic in 18 episodes / 9 sessions (measured) |
| :262 | "Do not infer hostility from a creature name." (no field offered) | name regexes and faction literals in 9 sessions each (measured) |
| :735 | `tuicraft tail --json | jq -r --unbuffered '…'` | jq is taught (in-15); whisper filter `.type == "WHISPER"` matches nothing, the type is `WHISPER_FROM` (C2, #304) |
| :613-668 (read) | `echo "FRIENDS_JSON" | nc -U "$SOCK"` | copied in 3 episodes / 2 sessions (measured) |
| :60-62 (read) | parse stdout once with `json.loads` | contract works, still the main tax: 99 `bun -e` parsers in one Claude session (in-22) |

### 4.2 Taught but not used
- `read --wait` (SKILL.md:63, :497): 80 episodes in 27 of 161 sessions (measured). Long sessions slept instead: in-07 100 sleeps / 2082 s; in-08 5070 s ≈ 66 % of the session (read).
- `record --since`: 8 episodes (measured); covers only CYCLE/TACTICS/RECOVERY.
- `spirit-healer`, `defend on`, `cycle --quest`, `face-guid`, `cancel-interaction`: skipped where they were the answer (shard-04, -06, -28, -26, -03, input-07; read). Some sessions predate some verbs.
- `goto`: used in 29 sessions (measured) but whole sessions used 0 `goto` and 37–85 hand legs (in-09, in-28). One coordinator brief asked for hand legs (in-29), so not every case is a skill gap.
- Factory prompts give no observation guidance and tell agents to "Filter playerbot chat" with no tool (taught-surface.md §3).

### 4.3 Doc and code disagree (read, taught-surface.md §6)
C1 manual `party` verb does not exist. C2 wrong whisper filter. C3 ENTITY_APPEAR JSON drops `name` (73.5 % of logged appears unnamed). C4 SKILL lists six event tags, daemon emits ten plus PACKET. C5 `PARTY_MEMBER_STATS` JSON-only. C6 `fight --json` drops the outcome though SKILL.md:118 says JSON replies are unchanged. C7 socket verb list incomplete. C8 `spells`/`navigation` print pretty JSON in human mode. C9 60 s wait cap only in the manual. C10 `halt` scope differs. C11 `stop` beside movement verbs. C12 friends/ignore JSON only as raw IPC.
Also (read): SKILL.md:36-44 teaches per-character `XDG_*` exports while AGENTS.md says use only `tmp/tc-<ACCOUNT>`; every shard-32 episode exported XDG. SKILL.md:500 says the cursor never repeats; agents saw repeats (#140) and lost events to their own reads.

### 4.4 Consequences for the harness prompt (inferred)
- Rules that tell an agent to run a procedure by hand (relog, corpse legs, sweeps, bit decoding) become tools; the prompt does not mention the hand method.
- Rules that forbid a guess with no alternative fail; point at the field that replaces the guess.
- Put guidance in each tool's `promptSnippet`/`promptGuidelines` (pi-ui.md §1), not a 756-line skill one agent admitted it never read before driving (in-22 #17).

---

## 5. Pi UI capability map and creative augmentations

### 5.1 Capability map (read, pi-ui.md, condensed)

| Primitive | Gives | Limits |
| --- | --- | --- |
| `renderCall`/`renderResult` | per-tool rendering, partial updates via `onUpdate`, expand with `ctrl+o` | render from `details` (replayed on resume), never live state |
| `AgentToolResult {content, details}` | `content` to the model, `details` UI only | — |
| `pi.sendMessage({triggerTurn, deliverAs})` | passive or waking messages, steer/follow-up | reaches the model as a user message |
| `appendEntry` + `registerEntryRenderer` | human-only transcript lines | — |
| `setWidget` | live panels above/below editor | string-array form capped at 10 lines (pi-ui.md:182); component form uncapped and takes transcript height; cache lines |
| `setFooter`/`setHeader`/`setStatus`/`setTitle`/`setWorkingMessage` | game chrome, pills, tab title, spinner text | no-ops in RPC mode |
| `tui.showOverlay({nonCapturing:true})` | floating panel, editor keeps focus | occludes; `hideOverlay` pops the last entry (measured trap) |
| `ctx.ui.custom({overlay:true})` | modal interactive overlay | modal |
| commands + completions, autocomplete providers, shortcuts, `input` event | `/target Mana<tab>`, `@Mob`, chat mode, hotkeys | built-in slash commands cannot be removed; extension shortcuts fire only while the default editor has focus (pi-ui.md:393, inferred) |
| `before_agent_start`, `context`, `tool_call`, `tool_result` | situation report, block/rewrite calls and results | token cost |
| pi-tui components | stacks, Markdown tables, `SelectList`, eighth-block bars, `▀` truecolor, `Image` (Kitty/iTerm2) | no sixel; terminal image support could not be determined |
A reflowing side pane needs private fields or a fork; removing coding slash commands is not possible.

### 5.2 Creative augmentations (pain ids refer to §2 subsections; verdicts from pi-ui.md §8 or marked inferred; **U1-U5** = untested primitive, see the note under the table)

| # | Augmentation | Pain | Primitive | Verdict |
| ---: | --- | --- | --- | --- |
| 1 | Unit frames: self HP/power (eighth blocks), life badge, target frame, cast bar, "attacked by" row that turns the border red | 2.1, 2.13 | component `setWidget`, `theme.bg` | feasible (U1) |
| 2 | Threat radar: 13-row map, self arrow, units by relation, attackers blinking, corpse and healer markers, 39 yd reclaim ring | 2.1, 2.2, 2.8 | widget, stacks, `▀` truecolor | feasible (spike `map.ts`) (U1) |
| 3 | Pose ghost: predicted solid, last server fix hollow, drift and age | 2.5 | same widget | feasible (inferred) |
| 4 | Game footer: character, level, realm, zone, coords, facing arrow, pose source/age, gold, XP bar, world state, capabilities, context meter | 2.5, 2.7 | `setFooter`, `footerData`, `getContextUsage` | feasible |
| 5 | Nearby table renderer | 2.2, 2.10 | `renderResult` + `details` | feasible |
| 6 | Travel progress row: bar, remaining yd, replans, last stop; final one-line outcome and route sketch | 2.4, 2.6 | `onUpdate`, `isPartial` | feasible |
| 7 | Compass rose for refusals and `wow_probe_ground` | 2.4, 2.11 | `renderResult` | feasible (inferred) |
| 8 | Refused-cell memory on the map | 2.4, 2.11 | map widget | feasible-with-work (inferred) |
| 9 | Corpse compass: bearing, distance, reclaim countdown, healer distance, "stuck N min" | 2.8, 2.11 | widget or `setStatus` | feasible (inferred) |
| 10 | Action ledger strip: pending actions turn green/red/grey on settlement | 2.3 | below-editor widget | feasible-with-work (needs core `ActionLedger`) (U1) |
| 11 | Fight timeline renderer: HP sparklines, casts, rejections, XP, outcome | 2.6, 2.13 | `renderResult` | feasible |
| 12 | Reward card: XP, money delta, items with quality colours | 2.12 | renderer | feasible |
| 13 | Event log overlay `/log`: filter by type/time/GUID, churn folded to counts | 2.9 | `ctx.ui.custom`, entry renderer | feasible |
| 14 | Coloured one-line chat/event messages; playerbot chatter human-only | 2.9 | `registerMessageRenderer`, `appendEntry` | feasible |
| 15 | `/quests`, `/bags`, `/spells` tables | 2.10, 2.12 | Markdown tables, overlay | feasible |
| 16 | "unchanged ×7 (4 min)" badge on results, same line in content | 2.11 | `renderResult` | feasible (inferred) |
| 17 | Situation report per run (diff since last turn), size-budgeted | 2.1, 2.5, 2.10 | `before_agent_start` / `context` | feasible-with-work |
| 18 | Working indicator as game state (`walking 23 yd → corpse`) | 2.6 | `setWorkingMessage` | feasible |
| 19 | Target picker and `@Mob` mentions resolved to GUIDs | 2.2, 2.10 | completions, autocomplete wrapper, `input` transform | feasible / feasible-with-work (U2) |
| 20 | Interactive map overlay (F2): pan, inspect, Enter sets target | 2.2, 2.4 | `ctx.ui.custom` + `handleInput` | feasible (U3) |
| 21 | Floating radar top-right on wide terminals | 2.1 | nonCapturing overlay | feasible-with-work (U4) |
| 22 | Danger in the tab title (`Xiara L11 ♥ 23% ATTACKED`) | 2.1 | `setTitle` | feasible |
| 23 | Identity/danger guard: timed confirm before acting as another character or pulling a much higher mob | 2.7, 2.2 | `tool_call` block + `confirm({timeout})` | feasible |
| 24 | Run tally widget: kills, loot, skips by cause, deaths, elapsed | 2.6, 2.12 | widget | feasible (U1) |
| 25 | Real images (portraits, terrain) | — | `Image` | feasible-with-work; terminal support unknown (U5) |
| 26 | Scenario journal: baseline and final snapshots, auto-journal of every tool call with epoch, death and intervention counters (prior-ux.md §5) | 2.9, 2.12 | `tool_result` hook, `appendEntry`, widget | feasible (inferred) |
| 27 | "Why stuck" badge that separates `rooted`/dead from terrain (prior-ux.md §3; M6 misread `rooted` as obstructed for up to 20 s) | 2.1, 2.4 | `setStatus` or radar widget | feasible (inferred) |

**U** marks an idea that rests on a primitive pi-ui.md did not test (critic.md §5): U1 = frame cost of a large component widget redrawn at stream rate, not measured (pi-ui.md §9); U2 = `@` mentions claiming completion from file completion, multi-word names, inferred only; U3 = extension shortcuts fire only while the default editor has focus, so an F-key panel may not respond inside a focused overlay or custom editor (pi-ui.md:393-395, inferred); U4 = nonCapturing overlay while the transcript scrolls in normal scrollback, not tried (pi-ui.md §9); U5 = Kitty/iTerm2 images through tmux, Orca or Blink, `images: null` measured under screen-256color, path could not be determined. A reflowing side pane needs the private `fullscreenLayoutRoot` or a fork (pi-ui.md, read, not tried) and is not in the table.

### 5.3 Spike before building on U-marked ideas

One live pi-tui spike in an Orca pane (Orca `read --screen` works, per HANDOVER, read) that tests: a nonCapturing overlay while the transcript scrolls (U4); a 14-row component widget during a streaming reply, with frame time (U1); F-key shortcuts with the default editor, a custom editor and an overlay focused (U3). List Kitty/iTerm2 support as unknown until tested in the maintainer's own terminal (U5).

### 5.4 Side-report findings carried (critic.md §4 checklist)

| finding | source | where in this report |
| --- | --- | --- |
| `details` never reaches the model; renderers run on replay, so render from `details` | pi-ui.md §1 | 2.10, 5.1 |
| `hideOverlay()` pops the last overlay, not a given one | pi-ui.md §4 | 5.1 |
| String-array widgets cap at 10 lines; component widgets are uncapped and take transcript height | pi-ui.md:182-184 | 5.1 (revised row), U1 |
| Extension shortcuts fire only with the default editor focused | pi-ui.md §6 | 5.1 (revised row), U3, 5.3 |
| Built-in slash commands cannot be removed | pi-ui.md §8 | 5.1 |
| `before_agent_start`/`context` situation report costs tokens every run | pi-ui.md §8 | 5.1, augmentation 17 |
| Envelope solved parsing shape, not meaning | prior-ux.md §4 | 2.3 |
| Auto-detour explicitly rejected | prior-ux.md §2 | 2.4, 2.18, Q2 |
| Recovery wizard not built; Theo chose a playbook | prior-ux.md §2 | 2.8, Q6 |
| ActionResult/ActionLedger, `wow_wait`/`wow_cancel` are design only; consume, do not reinvent | prior-ux.md §4 | 2.3 |
| Scenario catalogue: auto-journal, baseline/final snapshots, death/intervention counters | prior-ux.md §5 | augmentation 26 |
| Never built: route legs and refusal markers, predicted-vs-server ghost, corpse ring, aggro indicators, "why stuck" badge | prior-ux.md §3 | augmentations 6, 8, 3, 2/9, 1/2, 27 |
| SKILL teaches jq, raw `nc -U`, hex `npcFlags` | taught-surface.md | 4.1 |
| `fight --json` drops the outcome (C6); whisper filter wrong (#304, C2) | taught-surface.md §6 | 2.3, 4.1, 4.3 |
| 1000-entry ring evicts silently; ENTITY_* 51 % of lines; `read --wait` wakes on any event; `tail` is a 1 s poll | taught-surface.md §2 | 2.6, 2.9 (scope) |
| REWARDS ~23 KB and TACTICS request ~9.7 KB per event | taught-surface.md §4 | 2.9, principle 7 |
| `nearby` has no relation field although `FactionTemplateCatalog` exists | taught-surface.md | 2.2 |

---

## 6. Principles for the harness tool surface

1. **No bare acknowledgment.** Action tools resolve at settlement (`confirmed|refused|unanswered|superseded|timeout`) and return the post-action observation. (2.3: no-confirmation 678, ≥785 bare `OK`.)
2. **Refusals are terminal, typed, actionable**: reason enum, detail, `nextStep`, concrete `options` (floors, open headings, nearest grounded point, untried NPC), `retryable`. Never a second call for the advice. (2.4, 2.11)
3. **Refuse the exact repeat** of a refused action from the same pose, with untried options. (2.11: 21 identical cycles)
4. **Short content, full details.** Content ≤ about 12 lines / 1 KB (figure inferred; tune by trial); full typed object in `details`; query tools take filter/sort/limit/fields with a small default limit and a count of what was left out. (2.10: 75 % of CLI calls piped into a parser)
5. **Every spatial fact names origin, source and age.** One labelled pose; all distances from one current origin. (2.5; stale-distance bug 48ddf71)
6. **Decode everything**: relation, attackable, attacking-me, roles, creature type, item/spell names, enum names for codes. A raw id or bitmask only beside its decoded form. (2.2, 2.13)
7. **Events carry deltas, not state.** (TACTICS ~9.7 KB, REWARDS ~23 KB per event, taught-surface.md §4.) Entity churn summarised as counts.
8. **Wake rarely, on purpose, with a loop guard**: new attacker, HP threshold, death, revive, run ended, route ended, reclaim ready, whisper from another player, pose reset, stuck. Rate-limit per source; never wake on the character's own echo (design doc feedback loop).
9. **History is a query, never a cursor**: per-domain logs, `since` marks, wall-clock times. (2.9: 339 events lost)
10. **Long actions stream and end loudly**: block with `onUpdate` or return a handle; always one waking `run_ended`; honour abort. (2.6)
11. **Reflexes in code, goals in the model**: procedures stop on `rooted`, death or a new attacker and report why; the model never runs fixed-count loops. (2.1, 2.8; matches the design doc's cadence layering)
12. **Identity bound at construction; tools wait for `world_ready`**; no ambient default config, no auto-start from a query. (2.7)
13. **The schema is the manual**: tool names and params replace verb and field guessing; guidance lives in tool prompt guidelines. (2.10, 4.1)
14. **Human and model see the same facts**, so the human spots a misread early. (HP 1/187 unremarked for two calls, in-01 #47–#48)
15. **Keep the shapes that work** (§3).
16. **Remove the Bash layer, and count it as removed.** In-process tools end auto-backgrounding, stdin hangs, stderr banners merged into jq, non-stock jq, missing host tools (`bc`) and env that does not persist between calls. These are not harness features and need no UI. (2.14)
17. **Surface every protocol parse error** as a passive event the human also sees; silent failure is the worst case even at one session. (2.17)
18. **Own the event history.** The harness keeps its own per-domain logs from the in-process subscription and never reads through the daemon's 1000-entry ring. (2.9)

---

## 7. Open questions for the maintainer

1. **Server-confirmed pose.** May the harness use GM `.gps` as a sensor on GM characters? If not, should `wow_confirm_pose` relog on request (keeping corpse/recovery state), or only label the pose?
2. **Auto-detour.** The spatial design rejected it; agents then brute-forced headings and imported the navmesh 89 times. Should `wow_travel` detour and replan itself (bounded, with a typed report), or only offer `options`?
3. **Blocking versus handles** for `wow_fight`/`wow_cycle`/`wow_travel`? The mid-fight potion case needs the agent to act during a fight (in-17 #116–#118).
4. **Reflex scope.** May code halt on `rooted`, arm `defend` when attacked, or flee below an HP threshold without the model?
5. **Tactics without Jev.** You said the tactical loop may be rebuilt with another model. For now, what should `wow_fight` do when Jev is absent or returns HTTP 402 (in-13 sequence 4)? Keep tactics behind an interface so the model can change without a tool change?
6. **Ghost corpse runs.** Should `wow_recover` reuse cycle's corpse-leg logic for manual deaths, given SKILL.md forbids `goto` from a ghost?
7. **World knowledge.** Agents parsed AzerothCore `db_world` SQL for spawns and money drops (in-28 seq 235; in-29 seq 133). Is a spawn/loot query tool in scope?
8. **CLI parity.** Relation on `nearby` rows, `attackers` in `combat --json`, `nextStep` in the `goto` error, `fight --json` keeping its outcome all live in core and help both shells. Land them in the CLI now?
9. **Wake budget.** How many waking events per minute, and which chat wakes (other players' whispers only)?
10. **Side panel.** Widgets and overlays, or fork `InteractiveMode` for a reflowing pane?
11. **Terminal graphics.** Does the tmux/Orca/Blink path pass Kitty or iTerm2 images?
12. **Live verification.** 8/8 reviewers first ran `mise test:live` with no credentials and 0/8 set `XDG_CONFIG_HOME` (in-33). Is a `live_verify` command in scope, or factory work?
13. **Corpus hygiene.** All 33 inputs now have a report, but three report files were overwritten or renamed during the run (§1.2). Three workers report possible unredacted passwords in the source corpus, one of them a `python3` print of the `soap create` password field (§1.3 item 7). Fix the extractor's redactor for bare values, and have `soap create` write an env file so no agent prints the password?
14. **Session reset.** With core in-process there is no daemon to restart when a request sticks (#178, 2.8). Fix the stuck request in core, or give the harness an explicit `wow_reset_session` command?
15. **Core track ownership.** Server-pose probe (2.5), planner refusals and false `obstructed` (2.4), and `walk-toward` failing live (2.4) have no harness answer (2.18). Are they on the core roadmap before the harness milestone that depends on them, or does the harness ship with observation only?

---

## 8. Revision

Changes after `critic.md`, 2026-09-26. v1 is kept as `synth/REPORT.v1.md`; the counting scripts are `synth/sessions.ts`, `sessions2.ts`, `sessions3.ts`.

1. **Unread shards read.** Reports for inputs 03, 14 and 18 read and folded into §1.3 item 1, §1.4 and the "Revision evidence" paragraphs of 2.1-2.13; new pains 2.14-2.17 draw on them.
2. **Citations fixed.** Three report files changed identity during the run: `shard-03.md` (was input 04, now input 03), `shard-14.md` (was 15, now 14), `shard-18.md` (was 19, now 18). The input-04 text is copied to `shards/input-shard-04.md`; the input-19 text, which was overwritten, is restored from `synth/digest.md` to `shards/input-shard-19.md`. Every citation now uses `in-NN` by input shard; the map is in §1.2.
3. **Session denominators.** 131 joined sessions for all episodes (161 in INDEX with subagents separate), 114 for the game-facing set, with per-kind counts (§1.1).
4. **Re-ranked §2 by distinct sessions × severity** on the game-facing set (3922 episodes, 114 sessions; soap and live-test episodes removed), with sessions, kinds, episodes, the 01a0c5e0 share, and an exposure/harm column; all-episode session counts shown for comparison. Signatures are listed under the table. New top 8: 2.3 intent-not-outcome (70 sessions × 3 = 210), 2.6 polling (49 × 3 = 147), 2.9 history (48 × 3 = 144), 2.10 parse tax (58 × 2 = 116), 2.4 movement refusals (38 × 3 = 114), 2.2 hostility (20 × 4 = 80), 2.7b readiness (36 × 2 = 72), 2.11 no-change loops (21 × 3 = 63, ahead of 2.5 on kinds). v1 order was 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8. Section numbers 2.1-2.13 are unchanged as stable ids; only the table order changed.
5. **2.7 split** into 2.7a wrong character (10 sessions, read, sev 4) and 2.7b readiness (37 sessions, measured, sev 2).
6. **Denominators stated** for every count source: §1.4 sums are classified rows (per-report rate about 30-100 %), the three new reports are shown apart and not added, pi-ui.md §0 line hits are not used, prior-ux.md §1b figures come from `docs/evidence`; §1.5 notes its units.
7. **Dominant session quantified** (§1.3 item 3) from critic.md §2.
8. **Single-session claims checked** (§2, after the table): take-loot/item push 1 session, `SMSG_INITIAL_SPELLS` 1, wrapper `environ` 1, `cannot use null as iterable` 17.
9. **Scope lines added** to 2.1-2.13, separating harness work from core track and out-of-scope items; §2.18 lists every pain with no harness answer (server-truth pose, planner refusals, `walk-toward` failures, spirit-healer restart, Jev idling, auto-detour, live credentials, world knowledge).
10. **New pain points** 2.14 Bash-layer failures (counted as removed), 2.15 live verification credentials, 2.16 world knowledge, 2.17 silent parse errors (sessions = 1, kept as a requirement).
11. **Side-report findings carried**: prior-ux envelope "shape not meaning" (2.3), recovery wizard rejected (2.8), string-array widget cap and shortcut focus (§5.1), scenario-catalogue journal and "why stuck" badge (augmentations 26, 27); full checklist in §5.4.
12. **Untested primitives marked** U1-U5 in §5.2 (augmentations 1, 2, 10, 24 U1; 19 U2; 20 U3; 21 U4; 25 U5), with a spike list in §5.3.
13. **Principles 16-18** added (Bash layer removed, parse errors surfaced, own event history).
14. **Redaction** item extended with in-18 finding 14 and a measured exposure count (§1.3 item 7). No value copied.
15. **Questions** 13 rewritten, 14 (session reset) and 15 (core track ownership) added.
