# AGENTS.md

Peon is an agent harness that plays World of Warcraft 3.3.5a. The goal is
working, protocol-correct gameplay on a real server.

## Priorities

- Agents own implementation, engineering decisions, review and integration.
  Keep useful conventions; skip cosmetic refactors and coverage chasing.
- Agent control and real-server outcomes come first. Human-facing
  usability follows the maintainer's feedback.
- Play as soon as a useful loop works and let failures guide development.
  Build client capabilities; never edit server data to fake them.
- Delegate multi-step live gameplay and gameplay debugging to one omp
  worker. Match the subagent to the work: `sonic` for mechanical edits and
  data collection, `scout` for read-only searches, `task` for judgement,
  `reviewer` for independent review.

## Ways of working

Two modes, both described in [README.md](README.md). Both land through a
PR with green `signoff/ci`, `factory/ci` and `factory/review` statuses.

- **Paired** (the current mode): the maintainer works one item with one
  interactive agent session.
  1. Open an issue with a `## Acceptance criteria` section, and scope it
     with the maintainer. Keep its board card out of Ready.
  2. Work in your own worktree on `factory/<N>-<slug>`. Open a PR whose
     body opens with a why paragraph, then `Fixes #N` and `## Proof`.
  3. Stop until the maintainer has reviewed the PR.
  4. After approval: run `mise ci` on the PR head, post `factory/ci` and
     `factory/review` on it (`gh api repos/tvararu/peon/statuses/<sha> -f
     state=success -f context=factory/<ci|review> -f description=...`),
     then squash-merge with the message from `mise factory squash-message
     <PR>` (`gh pr merge --squash --match-head-commit`).
  Never post the statuses or merge before the maintainer's review.
- **Factory**: Orca automations work cards the maintainer moves to Ready on
  the project board (tvararu/1). Workers open PRs, reviewers post the
  `factory/*` statuses and the merger lands them; no agent does another
  role's step by hand, and no agent posts `factory/*` on its own factory
  PR. Roles, statuses, attempts, stacked PRs and pace are in
  [docs/factory.md](docs/factory.md).

## Commands

Run everything through the `mise.toml` tasks as `mise <task>`, never
`bun <script>` or `mise run`.

- `mise bundle`: install dependencies and git hooks.
- `mise test [file]`, `mise test:coverage`, `mise test:slowest`.
- `mise typecheck [package]`, `mise format[:fix] [path]`,
  `mise lint[:fix] [path]`, `mise lint:docs`.
- `mise ci`: all the checks (`mise ci:checks`), then a `signoff/ci` status
  for a clean, pushed HEAD. The `pre-push` hook runs `mise ci --publish`.
- `mise harness --profile <path>`: the Pi harness
  ([docs/harness.md](docs/harness.md)).
- `mise eval <command>`: the eval grader ([docs/evals.md](docs/evals.md)).
- `mise namigator:build`: build the patched `libnamigator.so` that
  `soap create` needs.
- `mise factory <command>`: the factory CLI (`soap`, `status`,
  `squash-message`, `pace [pause|default|max]`, ...); run it bare for its
  commands. Factory prompts call the runner clone's copy directly.
- In `mise.toml`, write tasks that hold regexes or backslashes as `'''`
  literal strings; `"""` processes escapes.

## Code

- Strict TypeScript (`tsconfig.base.json`). biome, `config/biome.grit` and
  the hk hooks enforce formatting, lint, import boundaries, the 500-line
  file cap and commit-message shape; fix the code, never the rule. Rule
  exceptions are path overrides in `biome.json`.
- Never write comments, so never `biome-ignore`.
- Split a file by responsibility into sibling modules before it reaches
  500 non-blank lines.
- Fire-and-forget promises end in `.catch(ignoreFailure)` from
  `#lib/ignore-failure` (core) or `@peon/core/lib/ignore-failure`.
- Prefer Bun APIs over Node's; `node:os` and `node:fs/promises` are fine
  where Bun has no equivalent. Bun loads `.env` itself.
- Keep dependencies minimal: Pi is the one expected runtime dependency.
  A new package, mise tool or external program needs a reason in the PR
  and an entry in [docs/dependencies.md](docs/dependencies.md).
- Packages: `@peon/core`, `@peon/factory`, `@peon/devtools`,
  `@peon/harness`. Inside a package import through its `#` aliases. Other
  packages reach core only through its `exports` (`@peon/core`,
  `@peon/core/session`, `@peon/core/lib/<module>`, and in tests
  `@peon/core/test-support/<module>`); export a symbol from the barrel
  before another package uses it. Core imports no other workspace package
  and no test support at runtime; only the harness imports
  `@earendil-works/*`.
- Protocol work: read [docs/protocol.md](docs/protocol.md) for the
  reference codebases, packet-parsing gotchas and event rules. Never sort
  keys in object literals that read packets.

## Testing

- Test behaviour, protocol boundaries and failure recovery. Delete tests
  that pin wording or implementation. Conventions and Bun gotchas are in
  [docs/testing.md](docs/testing.md).
- After a gameplay or protocol change, run the closest eval scenario from
  [docs/evals.md](docs/evals.md) yourself, on throwaway accounts from
  `soap create` driven through their `tmp/puppet-<ACCOUNT>` wrapper
  ([docs/testing.md](docs/testing.md#live-characters)). Unit, type and lint
  checks are not live evidence: never claim gameplay works without a
  passing eval run. If the server or SOAP is down, report it and stop.
- Use only accounts you created. Never touch ADMIN, DEITY, X, Y,
  AUCTIONHOUSE, TCFACTORY, TCPRESETS, RNDBOT* or the maintainer's
  characters, never change server data, and never restart the worldserver.
- Scratch files go in `./tmp/`, which is ephemeral: keep nothing there
  that matters.

## Git

- Conventional Commits: subject of 50 characters or fewer, capitalised
  after the prefix (`feat: Add thing`), then a 1-3 sentence why, no
  bullets. `feat:` is only for user-visible features; tooling is `chore:`,
  docs `docs:`. Split PRs that span types. Read `git log -n 5` for style.
- Each PR lands as one squash commit built from the PR title (the subject)
  and the PR body's opening paragraph; commits inside a PR may be as
  granular as helps.
- `main` accepts only squash merges and linear history; a merge commit
  fails the push with `GH013`. Never force-push, delete branches or bypass
  hooks, except `--force-with-lease` on your own PR branch after a rebase.
- `git add` the intended files, then commit as a separate step.
- The `archive/vibe` tag holds unreviewed code. Read it for patterns
  (`git show archive/vibe:<path>`); never merge, rebase or cherry-pick it.
- There are no releases.

## Worktrees

- Create one with `orca-ide worktree create --name <name>
  --parent-worktree active --comment "owner: <agent>, <purpose>" --agent
  omp`. `orca.yaml` runs the setup. Remove it with `orca-ide worktree rm
  --worktree name:<name>`, then `git branch -D`, once the work has landed.
- Every worktree has one owner, and the maintainer must never find stale
  worktrees or idle agents. Commit and push before you stop. Factory runs
  never create worktrees.
- omp in any worktree but the main checkout gets its own `XDG_*`
  directories and finds no Peon config. The reaper cleans up after runs and
  holds dirty trees; see [docs/factory.md](docs/factory.md).

## Docs and memory

- [docs/](docs/) holds current documentation; [docs/archive/](docs/archive/)
  holds historical designs and plans, which are not instructions. Put a new
  design note in `docs/plans/YYYY-MM-DD-<topic>-{design,plan}.md` when one
  is useful.
- When behaviour visible to users changes, update `README.md` and the
  matching doc under `docs/`.
- Docs state what holds now, in the present tense. History belongs in
  commit messages and design notes; never point at something that no
  longer exists or lives only in `tmp/`. `mise lint:docs` checks this.
- Skills and frameworks such as Superpowers are optional aids; choose the
  process that delivers the goal. Use `/typescript-style` for code
  conventions, and read `.claude/skills/typesafe-ai` before working on Jev.
  Keep the TypeSafe API key private.
- omp memory (Mnemopi, bank `peon`, set in `.omp/config.yml`) is on here
  and off in factory runs. Call `recall` on your topic when you start;
  AGENTS.md and the maintainer win over recalled memory. `learn` only
  verified, reusable lessons not already in the docs, and never record the
  maintainer's rulings. Only the coordinator and the maintainer edit or
  forget memories.
