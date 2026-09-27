# Evals

An eval runs one scripted scenario against the live server: a throwaway
character, the [Pi harness](harness.md) in an Orca pane, a task typed to
the agent, and a grade from server-confirmed state. Evals are the live
proof for gameplay changes in core and the harness. The full design and
the whole catalogue are in
[the eval suite design](plans/2026-09-26-pi-harness-epic/eval-suite.md).

## Grading rules

**Server-confirmed checks only.** A check passes on server truth
(`soap truth`, the saved character row), a witness character's
observation, a server packet in the harness game log (a kill credit, an
item push, a quest-log counter), or a verifier login. Never on the agent's
claim, a tool `DONE` or an intent result. When the task is a question, the
answer is graded against truth at the time of the answer, not at the end.

**Four verdicts.**

| Verdict | When |
|---|---|
| `pass` | Every check is met. |
| `fail` | A check is unmet, or the run shows a new failure. Only `fail` makes builder work. |
| `blocked` | A check is unmet because of a gap the scenario already names, a playerbot interference the grader quotes, or a game-log event that does not exist yet. |
| `aborted` | Infrastructure: SOAP or the t1 service down, `soap create` or setup failed, a stale final truth, the game server down, an expired Codex login, model rate limits that stall the agent for more than 2 minutes, Jev down for the whole run, a pane or harness launch failure, or grader contamination. Never a product finding. |

**Efficiency.** Tool calls, agent turns, wall time from the task to the
accepted answer, time to the first action, and tokens, each also as a
ratio to the scenario budget. The budget's minutes are a hard stop; its
turns and tools are soft caps, so going over them is an efficiency
finding, not a fail.

**Friction.** What the agent struggled with, even on a pass. Each item
has a category (for example `wrong-tool`, `poll-loop`,
`false-success-claim`, `ignored-steer`), a severity (`blocker`, `major`,
`minor`), a verbatim quote with a reference, and an area (`tool`,
`event`, `prompt`, `panel`, `core`, `eval`). The categories are the
`friction` enum in `packages/harness/src/grader/eval-result.schema.json`.

**The grader is a human stand-in, not a coach.** It types only the task
and the scenario's scripted steers. One generic rescue nudge is allowed
when the run is stuck, and counts as an intervention. Any other help makes
the run `aborted` with the cause `grader_contamination`.

**Safety.** Eval characters are throwaway `soap create` characters that
never get a GM level. After the baseline, no service write, console
command or harness restart touches the character unless the scenario is
about it. Passwords never reach a transcript or a result file.

## Run a scenario

Run evals from an eval worktree: an Orca worktree of the commit under
test, with Orca, the t1 service, a Codex login and `TYPESAFE_API_KEY`
available. From its root:

```
mise eval run <id> --round <n>
```

`mise eval scenario` lists the round-1 scenario ids;
`mise eval scenario <id>` prints one scenario. The scenario files are in
`packages/harness/src/grader/scenarios/`. The run creates the accounts, sets them up, takes
the baseline truth, opens the harness in a pane, types the task and the
steers, ends on done, budget, stuck or abort, takes the final truth,
deletes the accounts and scans the run directory for a leaked password.
It waits up to 20 minutes while another run holds the same field;
`--no-wait` exits 1 at once instead. Add `--replica <n>` to run the same
scenario more than once in a round.

Each run writes `tmp/evals/<round>/<scenario>-<replica>/`:

| File | Content |
|---|---|
| `run.json` | The scenario, round, replica, head sha, start time and bot count. |
| `baseline.json`, `final.json` | Server truth before the login and after the logout. |
| `gamelog.jsonl` | The harness game log: every game event, one typed row. |
| `session.jsonl`, `tools.json`, `runs.jsonl` | The Pi session, tool calls and harness runs, as in [harness.md](harness.md#run-directory). |
| `steers.jsonl`, `triggers.jsonl`, `progress.json` | The steers sent, the triggers that fired and the watcher's view of the run. |
| `witness.jsonl`, `partner-read.jsonl` | What the second character saw and read, when the scenario has one. |
| `frames/` | Screen frames of the pane. |
| `grader/draft.json` | The measured draft: checks with what the run observed, efficiency and attempts, with no verdict. |
| `result.json` | The graded result. |

When the run ends `aborted` or `blocked` it writes `result.json` itself.
Otherwise the grader reads the draft and the evidence, decides each
check, the friction and the verdict against this document, and writes the
result with `mise eval result <run-dir> <file>`, which validates it
against the schema.

## The second character

Scenarios with a `partner` or a witness (`t2-whisper-reply`,
`t0-who-is-near`) use a second throwaway character driven by the puppet,
a headless login with no model. `soap create` writes a launcher for each
account, `tmp/puppet-<ACCOUNT>`, and names it in the `.wrapper` field of
its JSON. The launcher sets the account's own config and runtime
directories and runs the puppet with its arguments. The grader drives it
by itself; a person can run the same commands through the launcher.

| Command | Used by | Behaviour |
|---|---|---|
| `start --json` | partner, witness | Starts the puppet process and returns once the character is in the world. |
| `send -w <name> <text>` | the `t2-whisper-reply` partner action | Whispers, and exits 0 on success. |
| `read --json` | partner, after the run (`partner-read.jsonl`) | Prints one JSON envelope whose `events` array holds the chat events since start, then drains them. |
| `nearby --json` | witness, sampled into `witness.jsonl` | Prints one JSON envelope whose `data` array holds the nearby unit rows. |
| `stop` | the run's finish | Logs out, waits for the server logout, and the process exits. |

## Which scenarios to run

For a change to gameplay behaviour in core or the harness, run the one or
two scenarios closest to it. Every scenario appears in at least one row.

| Change area | Scenarios |
|---|---|
| Navigation and movement (`travel`, routes, namigator) | `t1-walk-to-npc` |
| Combat and Jev (`engage`, spells, pets) | `t3-kill-one-hunter`, `t3-ghostlands-kill` |
| Quests (`interact` quest dialogs, quest log, rewards) | `t4-quest-first`, `t4-alliance-first` |
| Vendors and money | `t5-vendor-buy-goldshire` |
| Chat and whispers (`social`, pushed chat events) | `t2-whisper-reply` |
| Nearby units and relations (`look`, entity state) | `t0-who-is-near`, `t0-hostiles` |
| Self state (level, money, bags, `journal`) | `t0-self-state` |
| Death and recovery (`recover`) | `t6-die-and-recover` |
| Stopping and steering (`stop`, the stop reflex, human messages while a tool runs) | `t7-halt-resume`, `t7-question-while-acting` |
| Alliance characters and map 0 | `t4-alliance-first`, `t5-vendor-buy-goldshire` |
| Login, the world session and the harness shell | `t0-self-state` |
