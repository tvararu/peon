# Remove the CLI, daemon and TUI: plan

Spec: [2026-09-27-remove-cli-design.md](2026-09-27-remove-cli-design.md).
Issue #371. Integration branch `factory/371-remove-cli` in the Orca worktree
`remove-cli`.

## 1. Shape

Four slices. Wave 1 runs A, B and C in parallel; they own disjoint files.
Wave 2 runs D on top of the merged wave 1.

| Slice | Branch | Worktree | Wave |
|---|---|---|---|
| A. Puppet | `slice/371-a-puppet` | `rcli-a` | 1 |
| B. Docs and website | `slice/371-b-docs` | `rcli-b` | 1 |
| C. Factory | `slice/371-c-factory` | `rcli-c` | 1 |
| D. Deletion | `slice/371-d-delete` | `rcli-d` | 2 |

Each slice worktree is an Orca worktree created from the integration
branch with `--parent-worktree active` and an owner comment naming the
coordinator. Slice branches stay local and are never pushed.

## 2. Rules for every slice

- Work only inside the slice worktree; run every command with it as the
  working directory and edit files by absolute path under it. Run
  `mise bundle` first if `node_modules` is missing.
- Touch only the slice's owner files. A needed change outside them is
  reported, not made.
- Follow AGENTS.md: no comments, 500 non-blank lines per file, `#` imports
  inside a package, core only through its exports, tests colocated,
  `bun:test`, no `mock.module`.
- Tests first where there is behaviour. Delete tests that only pinned
  deleted behaviour; never re-pin wording.
- Commit on the slice branch with Conventional Commits (subject 50
  characters or fewer, capitalised, a 1-3 sentence why). Never push, never
  bypass hooks.
- Before reporting: `mise ci:checks` passes in the worktree, except the
  cross-slice lint findings named in the slice. Report the commits, the
  checks run and their result, and anything left undone.
- Never touch the maintainer's accounts or characters (ADMIN, DEITY, X, Y,
  AUCTIONHOUSE, TCFACTORY, TCPRESETS, RNDBOT*, Xiara). No slice creates game
  accounts; the live smoke is the coordinator's.

## 3. Slice A: puppet

**Owner files.** `packages/harness/src/puppet/**` (new);
`packages/harness/package.json` if an import alias is needed;
`packages/factory/src/soap-wrapper.ts` and its test; the parts of
`packages/factory/src/soap.ts` and its tests that name or write the
wrapper; the wrapper names in harness test fixtures
(`packages/harness/test-support/run-world.ts`,
`packages/harness/src/grader/run.test.ts`,
`packages/harness/src/grader/run-finish.test.ts`,
`packages/harness/src/config/profile.test.ts`).

**Tasks.**

1. Capture the CLI's output shapes while the CLI still exists: the
   `nearby --json` rows (`formatNearbyObj` over core `queryNearby`, one
   JSON object per line) and the `read --json` output (`asJson` over the
   daemon's event buffer, chat events). Build fixture rows with a throwaway
   script that calls those formatters, and keep the expected JSON as
   literals in the puppet's tests. The throwaway script is not committed.
2. `packages/harness/src/puppet/`: an entry `main.ts` and small modules.
   Commands exactly as spec section 3: `start --json`, `send -w <name>
   <text>`, `read --json`, `nearby --json`, `stop`.
   - The account comes from `$XDG_CONFIG_HOME/tuicraft/config.toml`, read
     with the harness's existing profile loader. Refuse protected accounts
     and Xiara with the harness's existing guard.
   - `start` spawns a detached background process that logs in through
     core (`authWithRetry`, `worldSession`), listens on a Unix socket at
     `$XDG_RUNTIME_DIR/tuicraft/puppet.sock`, writes its pid beside it, and
     returns `start --json` output once the character is in the world. It
     fails with a nonzero exit and a message on stderr when login fails
     or times out.
   - The background process buffers chat events (bounded ring) from the
     handle's chat hooks; `read --json` drains them in the CLI's shape.
   - `nearby --json` prints `queryNearby` rows in the CLI's shape, one
     JSON object per line.
   - `send -w` whispers through the handle and exits 0 on success.
   - `stop` logs out, waits for the server logout with the harness's
     bounded logout wait, then the process exits and removes its socket.
   - A command other than `start` with no puppet running exits nonzero
     with a clear message.
3. `soap create` writes `tmp/puppet-<ACCOUNT>` instead of
   `tmp/tc-<ACCOUNT>`. It keeps the config check (the config logs in this
   account and character), drops the daemon pid check, prints
   `puppet-<ACCOUNT>: character <name>` on stderr, and runs
   `bun <root>/packages/harness/src/puppet/main.ts "$@"`. The soap JSON
   `.wrapper` field points at it. `soap delete` removes it.
4. Rename `tc-` wrapper names in the harness fixtures listed above to
   `puppet-`.

**Tests.** Argument parsing; the socket request and reply protocol; the
`read` and `nearby` JSON shapes against the captured fixtures, driven
through core's mock world server (`@tuicraft/core/test-support/...`);
`stop` with and without a running puppet; the soap wrapper script.

**Acceptance.** `grader/accounts.ts` and every scenario file are
unchanged. `mise ci:checks` passes.

## 4. Slice B: docs and website

**Owner files.** `README.md`, `docs/roadmap.md`, `docs/harness.md`,
`docs/evals.md` (new), `docs/manual.md`, `docs/screenshot.png`,
`docs/evidence/**`, `site/**`, `.github/workflows/pages.yml`,
`.claude/skills/tuicraft/**`, `packages/devtools/src/distil-encounter.ts`
and its test, the `evidence:encounter` task in `mise.toml`,
`packages/devtools/src/stale-docs.ts` and its test.

**Tasks.**

1. `README.md`: the project name, a notice that the project is being
   rewritten and that more information will follow, and minimal pointers
   (`AGENTS.md`, `docs/harness.md`, `docs/evals.md`, `docs/roadmap.md`,
   the licence). No commands, install steps or screenshots.
2. `docs/roadmap.md`: short and harness-first. Where things stand (core as
   the protocol primitives, the harness on top of it, the evals); what is
   next (the round-7 briefs, the unrun scenarios, long-term autonomous
   levelling 1-80), taken from section 12 of
   `docs/plans/2026-09-26-pi-harness-epic-design.md`; finished milestones
   M1-M6 one line each with no evidence links; a heading for high-level
   goals that says the maintainer sets them next, with no invented goals.
3. `docs/evals.md`: condensed from
   `docs/plans/2026-09-26-pi-harness-epic/eval-suite.md`. The four
   verdicts, server-confirmed checks only, efficiency, friction; how to run
   `mise eval run <id> --round <n>` from an eval worktree and read a run
   directory; the second character through the puppet (the command table
   from spec section 3 and the soap `.wrapper` launcher
   `tmp/puppet-<ACCOUNT>`); and the change-area table from spec section 4,
   in which every scenario appears in at least one row.
4. `docs/harness.md`: drop "second shell beside `tuicraft`" and the daemon
   lock; add how to play Xiara with `mise harness --profile
   ~/.config/tuicraft/config.toml`; link `docs/evals.md`.
5. Delete `docs/manual.md`, `docs/screenshot.png`, `docs/evidence/`,
   `site/`, `.github/workflows/pages.yml`, `.claude/skills/tuicraft/`,
   `packages/devtools/src/distil-encounter.ts` and its test, and the
   `evidence:encounter` task.
6. `stale-docs.ts`: drop the evidence sources and the tuicraft skill
   source; add `puppet-<ACCOUNT>` to the tmp allowlist. Keep
   `packages/cli/src/cli/help.ts` and `tc-<ACCOUNT>` (slice D removes
   them). Update its test.

**Acceptance.** `mise ci:checks` passes; `mise lint:docs` reports nothing
for the files B owns.

## 5. Slice C: factory

**Owner files.** `packages/factory/src/prompts/worker.md`,
`reviewer.md`, `qa.md`, `merger.md`, `docs/factory.md`, and any factory
test that pins prompt structure.

**Tasks.**

1. `worker.md`: replace the CLI smoke and `mise test:live` proof with the
   spec's proof contract: `mise ci` always; for gameplay changes in core or
   the harness, one or two scenarios from the change-area table in
   `docs/evals.md`, run with `mise eval run <id> --round 0` and graded
   against `docs/evals.md`, with the scenario id, verdict, passed and
   failed checks and a short game-log excerpt in `## Proof`. Docs-only and
   factory-only changes: `mise ci` only. soap accounts are used through
   `tmp/puppet-<ACCOUNT>`, never the maintainer's.
2. `reviewer.md`: check that the proof fits the change (the right scenario
   for the area, a verdict that supports the claim); never rerun
   scenarios; missing or unconvincing proof is a request for changes.
3. `qa.md`: keep the precheck, tested-SHA record, `qa-changes`, `--label
   qa` and duplicate search. Replace the smoke and live sections with: pick
   up to 3 scenarios from the files changed since the last QA SHA with the
   change-area table, plus 1 rotating canary whose position is kept in
   `~/.local/state/tuicraft-factory/qa-canary` (the next id in `mise eval
   scenario` order, wrapping); canary only when no core or harness file
   changed; run and grade each serially; file one issue per failed check or
   serious friction with the scenario, verdict, failed check and evidence
   pasted into the issue.
4. `merger.md`: remove any CLI or live-suite step, if present.
5. `docs/factory.md`: the soap section describes `tmp/puppet-<ACCOUNT>`;
   the roles describe the new proof and QA; no CLI references.

**Cross-slice lint.** `mise lint:docs` may flag `tmp/puppet-<ACCOUNT>`
until slice B lands its allowlist entry; every other finding is fixed.

**Acceptance.** No reference to the CLI, the daemon, `mise test:live` or
`tc-<ACCOUNT>` in the owner files; `mise ci:checks` passes apart from the
lint finding above.

## 6. Slice D: deletion

Starts from the integration branch after A, B and C have merged.

**Owner files.** Everything not owned by A, B or C, including
`packages/cli/**`, `mise.toml`, `package.json`, `biome.json`, `bun.lock`,
`AGENTS.md`, `.claude/settings.json`, `packages/harness/src/config/lock.ts`
and its test, `packages/core/src/lib/config.ts`, `stale-docs.ts` (the two
entries B left), and new core tests.

**Tasks.**

1. Move the core assertions of `packages/cli/src/ui/party-store.test.ts`
   and `control-replan.test.ts` into colocated core tests; drop their CLI
   formatter assertions. Remove the matching `biome.json` override.
2. Delete `packages/cli/`.
3. `mise.toml`: delete `build`, `build:all`, `deploy`, `test:live` and the
   `cli` arm of `typecheck`. `package.json`: delete `start` and the
   `packages/cli` typecheck step. `biome.json`: delete every
   `packages/cli` entry. Regenerate `bun.lock` with `bun install`.
4. Harness: delete the same-character daemon detection in `lock.ts` and
   its tests; `config.toml` profiles keep loading.
5. `packages/core/src/lib/config.ts`: the "No config found" message stops
   naming `tuicraft setup`; it names the config path instead.
6. `stale-docs.ts`: drop the `packages/cli/src/cli/help.ts` source and
   the `tc-<ACCOUNT>` allowlist entry; its test fixture names a
   nonexistent path under another package.
7. `.claude/settings.json`: remove `./dist/tuicraft`, `mise start` and
   `tuicraft.vararu.org` permissions.
8. `AGENTS.md`: delete the CLI ownership rules, the live-suite command,
   accounts and wrapper instructions, the CLI test-shell exception, the
   CLI-specific WorldHandle mock notes, the four-file docs rule, the
   `@tuicraft/cli` package entry and the lazy-import note about
   `packages/cli/src/main.ts`; replace the live-suite rules with "run the
   closest eval scenario from `docs/evals.md` after gameplay or protocol
   changes"; the soap wrapper is `tmp/puppet-<ACCOUNT>`; the command list
   and docs rule name `docs/harness.md`, `docs/evals.md` and `README.md`.
9. Grep the tree outside `docs/plans/` for `packages/cli`, `test:live`,
   `tc-<`, `tc-$`, `dist/tuicraft`, `tuicraft start|send|read|stop|goto|
   fight|cycle|who|nearby`, `--daemon` and `@tuicraft/cli`; fix every hit
   or report it.

**Acceptance.** The grep is empty; `mise ci:checks` passes; the test count
drops only by CLI tests.

## 7. Workflow

The coordinator runs one omp `workflowz` session in its eval kernel.

- **Wave 1 (6 agents):** three `task` builders (A, B, C) spawned together;
  each finished builder gets a blind `reviewer` (GPT-6 Sol) that sees the
  slice diff and this plan, not the builder's transcript. A review that
  asks for changes goes back to the same builder as one fix round; the
  same reviewer then reviews once more. A slice that fails its second
  review is blocked and recorded.
- **Merge (coordinator):** in the order B, A, C. For each slice: rebase the
  slice branch onto the integration branch, fast-forward the integration
  branch, and push it; the pre-push hook runs `mise ci --publish`. A red
  hook stops the merge until the cause is fixed on the slice branch.
- **Wave 2 (2-3 agents):** one `task` builder for D and its blind
  reviewer, same fix rule, then merge.
- **Final gate:** one whole-diff `reviewer` over `origin/main...HEAD`
  aimed at leftovers and broken contracts; the coordinator runs the
  leftover greps, `mise ci` and the puppet live smoke; `sonic` and `scout`
  take mechanical and search work.

Review verdicts are structured (`approve` or `changes`, with findings that
cite file and line), so the coordinator branches on data.

## 8. Final gate and PR

1. `mise ci` green on the integration head (pre-push hook).
2. Whole-diff review addressed.
3. Puppet live smoke: `soap create fresh` twice (throwaway accounts), then
   with each `.wrapper`: `start --json` on both; A `send -w <B> <text>`;
   B `read --json` shows the whisper from A; B `nearby --json` lists A;
   `stop` on both; `soap truth` shows both offline; `soap delete` both.
4. PR from `factory/371-remove-cli`: a Conventional Commit title of 50
   characters or fewer, a 1-3 sentence why, `Fixes #371`, and `## Proof`
   with the `mise ci` result, the smoke transcript (no passwords), the
   leftover grep, and the review outcomes.
5. Tag `archive/cli` on `f60acc6` (the last `main` commit with the CLI)
   and push it.
6. `bun packages/factory/src/main.ts status 371 in-review`.
7. Remove the slice worktrees and branches. The integration worktree stays
   until the maintainer merges.

Not done here: merging, disabling Pages, deleting branches on GitHub,
changing the factory pace.
