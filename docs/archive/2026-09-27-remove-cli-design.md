# Remove the CLI, daemon and TUI

Issue #371. Branch `factory/371-remove-cli`.

## 1. Context

tuicraft is being rewritten around the Pi harness. After this change the
repository holds:

- **core** (`packages/core`): a working implementation of the World of
  Warcraft 3.3.5a protocol primitives. The harness builds its plugins on it.
- **the Pi harness** (`packages/harness`): the only way to play, for agents
  and for the maintainer.
- **the dev tooling** that still serves core, the harness or the factory
  (`packages/factory`, `packages/devtools`).

`packages/cli` (CLI, daemon, TUI) and everything that exists only for it is
deleted. The factory stays paused; directed omp workflows are the main
pipeline.

A read-only map of every CLI dependency was taken before this design (five
scouts, 2026-09-27). Its findings are folded into section 5.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Core stays whole. Nothing is trimmed from core or from `WorldHandle`. Moving higher-level behaviour (cycles, tactics, the Jev loop) out of core is later rewrite work. |
| D2 | `mise test:live` and its four suites are deleted, including the core-only ones. The rule to run it after protocol changes becomes "run the closest eval scenario". |
| D3 | The second character in evals is a headless **puppet mode** in the harness (section 3). |
| D4 | The factory is redesigned for a harness-only project in this change, including a new QA role (section 4). |
| D5 | The harness fully replaces the CLI for the maintainer. The binary, `mise build`, `mise build:all`, `mise deploy`, the root `start` script and the `tuicraft` skill are deleted. |
| D6 | The marketing website goes: `site/`, `.github/workflows/pages.yml`. GitHub Pages is disabled and the stale `release-please` branch deleted after merge. The maintainer removes the `tuicraft.vararu.org` DNS record. |
| D7 | `docs/roadmap.md` is rewritten short and harness-first. Its high-level goals section is left for the maintainer's follow-up. |
| D8 | `docs/evidence/`, `packages/devtools/src/distil-encounter.ts` and `mise evidence:encounter` are deleted. |
| D9 | README becomes sparse: a notice that the project is being rewritten and that more information will follow, plus minimal pointers. |
| D10 | Merge gate: `mise ci`. The PR's Proof adds a live puppet smoke on two throwaway soap accounts, with no model. No eval round is required. |
| D11 | The goal ends at a ready PR. The maintainer merges it by admin bypass. `archive/cli` tags the last commit with the CLI and is pushed before handover. |
| D12 | The harness's same-character daemon lock check goes. `config.toml` profiles keep working. |
| D13 | Core assertions in `packages/cli/src/ui/party-store.test.ts` and `control-replan.test.ts` move into core tests; their CLI formatter assertions are dropped. |
| D14 | `packages/cli/src/tools/session-record.ts` and `session-latency.ts` are deleted with the CLI. |
| D15 | `docs/plans/` is historical and is not edited. The `tuicraft` name (repository, packages, paths) is unchanged. |

## 3. Puppet mode

**Goal.** The grader's second character works without the CLI, with no
change to scenario files or grader code.

**Command surface.** The grader treats the second character as an
executable (`grader/run.ts:232`, `partner.ts:57,75`, `watch.ts:219`,
`run-finish.ts:156`). The puppet accepts exactly these commands:

| Command | Used by | Behaviour |
|---|---|---|
| `start --json` | partner, witness | starts the puppet process, returns once the character is in the world |
| `send -w <name> <text>` | `t2-whisper-reply` partner action (scenario `argv`) | whispers, exit 0 on success |
| `read --json` | partner, after the run (`partner-read.jsonl`) | chat events since start, then drains them |
| `nearby --json` | witness, sampled into `witness.jsonl` | unit rows |
| `stop` | run finish | logs out, waits for the server logout, process exits |

`read --json` and `nearby --json` keep the CLI's JSON shapes: the grader's
witness checks match unit names and distances in those rows. The shapes come
from the CLI's formatters (`packages/cli/src/daemon/nearby.ts`
`formatNearbyObj` over core `queryNearby`, and the event JSON that `read
--json` prints), ported into the puppet before the CLI is deleted.

**Shape.**

- `packages/harness/src/puppet/`. `start` spawns a background process that
  holds one core `worldSession` (no Pi, no model) and listens on a Unix
  socket in the account's runtime directory. The other commands are short
  clients: connect, send one request, print the reply.
- Chat events go into a bounded ring buffer that `read` drains.
- `stop` reuses the harness's bounded logout wait, so the stale-truth
  logout race stays fixed.
- It refuses protected accounts and Xiara, like the harness.
- `soap create` writes `tmp/puppet-<ACCOUNT>`, which runs
  `bun <root>/packages/harness/src/puppet/main.ts "$@"` with the account's
  own config and runtime directories. The soap JSON `.wrapper` field points
  at it, so `grader/accounts.ts` is unchanged. `tmp/tc-<ACCOUNT>` is no
  longer written.

**Out of scope.** No other commands, no TUI, no reconnect, not a general
manual tool. New commands are added when a scenario needs them.

**Tests.** Unit tests for argument parsing and the socket protocol against
core's mock world server. The live smoke (D10) is in the PR's Proof:
two throwaway soap accounts, `start` both, one `send -w` to the other,
`read` shows the whisper, `nearby` lists the other character, `stop` logs
both out.

## 4. Factory and QA

Unchanged: the board, claims, prechecks, the reaper, pace, squash messages,
the reviewer model.

**`docs/evals.md` (new).** The grading rules move out of the historical
`docs/plans/2026-09-26-pi-harness-epic/eval-suite.md` into this current doc:
the four verdicts, server-confirmed checks only, efficiency, friction; how to
run `mise eval run <id> --round <n>` and read a run directory; and a
change-area table that maps areas to scenarios (navigation →
`t1-walk-to-npc`, combat → `t3-kill-one-hunter`, quests → `t4-quest-first`,
vendor → `t5-vendor-buy-goldshire`, chat → `t2-whisper-reply`, nearby →
`t0-who-is-near`, death → `t6-die-and-recover`, stopping →
`t7-halt-resume`). Every scenario appears in at least one row.
`stale-docs.ts` checks the doc.

**Worker proof (`worker.md`).** Always `mise ci`. When the change touches
gameplay behaviour in core or the harness: run the one or two closest
scenarios with `mise eval run <id> --round 0`, grade them against
`docs/evals.md`, and put the scenario id, verdict, passed and failed checks
and a short game-log excerpt in `## Proof`. Docs-only and factory-only
changes: `mise ci` only.

**Reviewer (`reviewer.md`).** Checks that the proof fits the change (the
right scenario for the area, a verdict that supports the claim). It does not
rerun scenarios. Missing or unconvincing proof is a request for changes.

**QA (`qa.md`).** Keeps: the `precheck qa` trigger, recording the tested
SHA, `qa-changes`, `--label qa`, duplicate search. Replaces the CLI smoke
and live-command sections with:

1. Pick up to 3 scenarios from the files changed since the last QA SHA,
   using the change-area table, plus 1 rotating canary: the next scenario in
   a fixed cycle over all scenarios, its position kept in
   `~/.local/state/tuicraft-factory/qa-canary`. No core or harness change:
   the canary only.
2. Run and grade each one serially with `mise eval run`, graded against
   `docs/evals.md`.
3. File one issue per failed check or serious friction, with the scenario,
   verdict, failed check and evidence pasted into the issue (the run
   directory dies with the worktree).

**soap.** `soap create` writes the puppet launcher (section 3).
`docs/factory.md` is updated for all of the above.

## 5. Deletions and rewrites

**Delete.**

- `packages/cli/**` (115 files), including `test-support/live*.ts`.
- `mise.toml` tasks: `build`, `build:all`, `deploy`, `test:live`,
  `evidence:encounter`; the `cli` arm of `typecheck`.
- Root `package.json` `start` script and the `packages/cli` typecheck step.
- `biome.json` entries naming `packages/cli` (UI-test overrides, import
  restrictions, override scopes). `bun.lock` workspace entries, regenerated.
- `packages/devtools/src/distil-encounter.ts` and its test;
  `packages/devtools/src/stale-docs.ts` input `packages/cli/src/cli/help.ts`
  and the fixture that names it.
- `packages/harness/src/config/lock.ts` daemon detection and its tests
  (D12); `config.toml` profile loading stays.
- `packages/factory/src/soap-wrapper.ts` CLI exec path and its tests
  (replaced by the puppet launcher).
- `docs/manual.md`, `docs/screenshot.png`, `docs/evidence/**`,
  `.claude/skills/tuicraft/`, `site/`, `.github/workflows/pages.yml`.
- `.claude/settings.json` permissions for `./dist/tuicraft`, `mise start`
  and `tuicraft.vararu.org`.

**Rewrite.**

- `README.md`: rewrite notice and minimal pointers (D9).
- `docs/roadmap.md`: short, harness-first; finished milestones one line
  each, no evidence links; goals left for the maintainer (D7).
- `docs/harness.md`: drop "second shell beside `tuicraft`" and the daemon
  lock; add playing Xiara from `~/.config/tuicraft/config.toml`.
- `docs/factory.md`, `docs/evals.md`, factory prompts (section 4).
- `AGENTS.md`: delete the CLI ownership rules, the live-suite and wrapper
  instructions, the CLI test-shell exception, the CLI-specific WorldHandle
  mock notes, the four-file docs rule and the `@tuicraft/cli` package
  entry; replace the live-suite rule with the eval-scenario rule; update
  the command list. Protocol gotchas and core WorldHandle event rules stay.
- `packages/devtools/src/stale-docs.ts` file list: add `docs/evals.md`,
  drop deleted files.

**Keep.** Core, `packages/core/test-support/mock-handle.ts`, the harness,
`packages/devtools/src/area-names.ts`, `hk.pkl`, `orca.yaml`,
`.github/dependabot.yml`, `docs/plans/**`.

## 6. Execution

One omp `workflowz` session in the Orca worktree `remove-cli` on
`factory/371-remove-cli`, owned by the coordinator. Under 10 agents per
wave.

- **Wave 1, three file-disjoint slices in parallel**, each built by a
  `task` agent in its own isolated worktree:
  - **A. Puppet:** `packages/harness/src/puppet/`, the soap launcher and
    tests.
  - **B. Docs and website:** README, roadmap, `docs/evals.md`,
    `docs/harness.md`; deletes the manual, evidence and its tool, `site/`,
    `pages.yml`, the skill, the screenshot.
  - **C. Factory:** worker, reviewer and QA prompts, the canary state,
    `docs/factory.md`.
- **Wave 2, one slice:** **D. Deletion:** `packages/cli`, its tasks and
  config entries, the session tools, the harness daemon lock, the two core
  tests moved into core, and all of `AGENTS.md`.
- **Per slice:** the builder writes tests first where there is behaviour;
  a `reviewer` (GPT-6 Sol) reviews blind; at most one fix round and a
  second review; the coordinator merges slices into the integration branch
  one at a time, `mise ci` running on each push through the hook.
- **Final gate:** `mise ci` green on the head; a whole-diff Sol review
  aimed at leftovers, with greps for `packages/cli`, `tuicraft ` commands,
  `test:live`, `tc-` and `daemon`; the puppet live smoke on two throwaway
  soap accounts, deleted afterwards; then the PR with `Fixes #371` and
  `## Proof`, the `archive/cli` tag pushed, and #371 moved to In review.
- **Blocked slice:** it stops, the reason goes into the PR, the rest
  continues. A blocked design decision stops the run and is reported.

**After merge (not part of the goal):** disable GitHub Pages
(`gh api -X DELETE repos/tvararu/tuicraft/pages`), delete the
`release-please--branches--main--components--tuicraft` branch, remove this
worktree and branch. The maintainer removes the DNS record. The factory
stays paused.

## 7. Risks

- **Puppet shape drift.** If the ported JSON shapes differ from the CLI's,
  the witness checks grade wrongly without failing loudly. The puppet's
  unit tests pin the shapes against fixtures taken from the CLI formatters
  before deletion.
- **No deterministic live regression suite.** With `mise test:live` gone,
  protocol regressions are caught only by evals, which are model-driven.
  Accepted (D2).
- **QA cost.** Up to about 40 minutes of Luna time per QA run, only when
  `main` moves; bounded by the 3-plus-1 rule.
