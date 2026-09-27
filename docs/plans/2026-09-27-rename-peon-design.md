# Rename tuicraft to Peon

The project is renamed Peon once #371 (remove the CLI, daemon and TUI) has
merged. #371 keeps the old name on purpose (its D15), so the rename is a
separate change on top of it.

## 1. Decisions

| # | Decision |
|---|---|
| R1 | Prose says **Peon**. Identifiers say `peon`, and environment variables use the `PEON_` prefix. |
| R2 | The GitHub repository `tvararu/tuicraft` becomes `tvararu/peon` (free on 2026-09-27). GitHub redirects old web, git and API URLs as long as no new `tvararu/tuicraft` is created. |
| R3 | The workspace scope `@tuicraft/*` becomes `@peon/*`. Every package is `private` and linked with `workspace:*`. Someone else owns the npm `@peon` scope, which only matters if packages are ever published, and there are no releases. |
| R4 | Every tracked file outside `docs/plans/` is rewritten mechanically: `tuicraft` → `peon`, `Tuicraft` → `Peon`, `TUICRAFT` → `PEON`, and a bare `tuicraft` in markdown prose (outside code) → `Peon`. This gives `~/.config/peon`, `~/.config/peon-factory`, `~/.local/share/peon`, `~/.local/share/peon-factory/runner`, `~/.local/state/peon-factory`, `~/.local/state/peon-harness`, `$XDG_RUNTIME_DIR/peon-factory-*`, the `peon-factory-reaper` units, the `[peon]` stub prefix in core, the idle harness title `peon`, and the eval schema id `peon/eval-result/v1`. |
| R5 | Unchanged: `docs/plans/**` (historical, including file names and every link into it), the `archive/*` tags, the Mnemopi bank `tuicraft`, and the game accounts `TCFACTORY` and `TCPRESETS`. The bank is the `session_id` of every row in `~/.omp/agent/memories/mnemopi/mnemopi.db`, so renaming it means migrating the database and gains nothing. The accounts are server data. |
| R6 | The main checkout moves from `~/code/tuicraft` to `~/code/peon`, because `packages/factory/src/config.ts` (`mainCheckout`) and `packages/factory/src/omp-factory` hard-code that path. |
| R7 | Clean cutover: no fallback that reads `~/.config/tuicraft` or `TUICRAFT_*`. The host cutover (section 4) moves the data. |
| R8 | One PR and one squash commit, `chore: Rename the project to Peon`. The factory is paused, so the maintainer merges it, as with #371. |

## 2. Codemod

`tmp/rebrand/rename.ts` is ephemeral. The rules in R4 and R5 are enough to
rebuild it. Run it from any directory and pass it the tree to rewrite:

| Command | Effect |
|---|---|
| `bun tmp/rebrand/rename.ts <tree>` | Dry run: occurrences per file and the path moves |
| `bun tmp/rebrand/rename.ts --apply <tree>` | Rewrites the files and runs `git mv` for paths that contain the name |
| `bun tmp/rebrand/rename.ts --check <tree>` | Lists unprotected occurrences and exits 1 if any are left |

It never reads or writes `docs/plans/` or binary files. It protects
`plans/…` path references, `bank: tuicraft`, ``bank `tuicraft` `` (which may
wrap across lines), and the `release-please` branch name.

To build the PR, run these in a fresh worktree based on `origin/main` after
#371:

```sh
bun ~/code/tuicraft/tmp/rebrand/rename.ts --apply .
mise format:fix && mise lint:fix
bun install --frozen-lockfile
bun ~/code/tuicraft/tmp/rebrand/rename.ts --check .
mise ci
```

`mise format:fix` and `mise lint:fix` are required. Shorter import paths
let some wrapped imports fit on one line, and `@peon` sorts differently from
`@tuicraft` in import groups and object keys.

After the codemod, review these files by hand: `README.md` (the rewrite
notice should read naturally with the new name), `AGENTS.md` (the Mnemopi
paragraph still names the bank `tuicraft`, which is correct), and
`docs/harness.md`, `docs/factory.md` and `docs/evals.md`, where "Peon" now
appears in the prose.

## 3. Dry run

Taken on 2026-09-27 against `main` at `f60acc6f`, which still has the CLI,
in a throwaway clone:

- The codemod changed 3,196 occurrences in 302 files and moved 3 paths:
  `.claude/skills/tuicraft/`, and the two
  `packages/factory/src/systemd/tuicraft-factory-reaper.*` units.
- `--check` found 0 unprotected occurrences. The only ones left are
  `.omp/config.yml` and `AGENTS.md`, both naming the Mnemopi bank.
- `bun install --frozen-lockfile` passed with the rewritten `bun.lock`.
- Before the fixes, `mise format` reported 9 errors (lines that now fit on
  one line) and `mise lint` reported 1 (key order around `peon:` in a CLI
  file that #371 deletes). `mise format:fix` and `mise lint:fix` fixed all of
  them.
- `mise typecheck`, `mise format`, `mise lint` and `mise lint:docs` then
  passed, and `mise test` passed 4,005 tests, skipped 6 and failed none.
- `bun packages/factory/src/main.ts` printed its usage. The harness `--help`
  output named `peon config.toml` and `PEON_GLYPHS`.

After #371 there are about 534 occurrences in about 172 files, counted on
the same commit without the paths #371 deletes. Re-run the dry run on the
merged tree before opening the PR.

## 4. Cutover

Do everything in one sitting. The factory must be paused, and the main
checkout must be the only worktree. The #371 follow-ups must already be
done: Pages disabled, the `release-please` branch deleted and the
`remove-cli` worktree removed.

1. **GitHub.** Rename the repository and update its metadata:

   ```sh
   gh repo rename peon -R tvararu/tuicraft
   gh repo edit tvararu/peon --homepage "" --description "<new text>"
   gh project edit 1 --owner tvararu --title Peon
   ```

   The description currently says "Chat in WoW 3.3.5a from your terminal",
   and the homepage is `tuicraft.vararu.org`. Update the topics
   (`world-of-warcraft`, `world-of-warcraft-bot`) if needed.

2. **Remotes.** Point both clones at the new URL:

   ```sh
   git -C ~/code/tuicraft remote set-url origin https://github.com/tvararu/peon.git
   git -C ~/.local/share/tuicraft-factory/runner remote set-url origin https://github.com/tvararu/peon.git
   ```

3. **PR.** Open a PR built with section 2, with an issue, `Fixes #N` and
   `## Proof`. The maintainer merges it.

4. **Stop the old units and sessions.**
   `systemctl --user disable --now tuicraft-factory-reaper.timer`. End every
   omp and Claude Code session whose working directory is `~/code/tuicraft`,
   including the Orca panes, because the next step moves that directory
   under them.

5. **Move the checkout.** `mv ~/code/tuicraft ~/code/peon`, then run these
   in `~/code/peon`:

   ```sh
   git worktree prune
   mise trust -y
   mise bundle
   git pull
   ```

6. **Move the XDG data.**

   ```sh
   mv ~/.config/tuicraft ~/.config/peon
   mv ~/.config/tuicraft-factory ~/.config/peon-factory
   mv ~/.local/share/tuicraft ~/.local/share/peon
   mv ~/.local/share/tuicraft-factory ~/.local/share/peon-factory
   mv ~/.local/state/tuicraft-factory ~/.local/state/peon-factory
   mv ~/.local/state/tuicraft-harness ~/.local/state/peon-harness
   rm -rf "$XDG_RUNTIME_DIR"/tuicraft-factory-*
   ```

   `~/.local/state/tuicraft/session.log` (78 MB) is the CLI daemon's log.
   Keeping it or deleting it is the maintainer's choice.

7. **Rewrite the paths and keys inside those files.**

   ```sh
   sed -i 's/^TUICRAFT_/PEON_/' ~/.config/peon-factory/soap.env
   sed -i 's#/code/tuicraft/#/code/peon/#; s#/share/tuicraft/#/share/peon/#' ~/.config/peon/config.toml
   sed -i 's#tuicraft-factory#peon-factory#g' ~/.local/state/peon-factory/orca-settings-restart.sh
   ```

   `soap.env` holds 7 `TUICRAFT_*` keys. `config.toml` holds
   `navigation_data_dir` (under the checkout's `tmp/`) and
   `navigation_library` (under `~/.local/share/…/namigator`). The namigator
   key does not depend on the path, so the built library stays valid.

8. **Runner.**

   ```sh
   R=~/.local/share/peon-factory/runner
   git -C $R fetch -q origin main
   git -C $R reset -q --hard origin/main
   bun install --cwd $R --frozen-lockfile --filter @peon/factory
   ```

   Run these from `~`, because the runner is not mise-trusted.

9. **systemd.**

   ```sh
   cd ~/.config/systemd/user
   rm tuicraft-factory-reaper.{service,timer}
   mv tuicraft-factory-reaper.timer.d peon-factory-reaper.timer.d
   mv tuicraft-factory-reaper.service.d peon-factory-reaper.service.d
   cp ~/code/peon/packages/factory/src/systemd/peon-factory-reaper.{service,timer} .
   systemctl --user daemon-reload
   systemctl --user enable --now peon-factory-reaper.timer
   ```

10. **Wrapper and Orca.** Run `bun packages/factory/src/main.ts setup
    wrapper --apply` to point `~/.local/bin/omp-factory` at the new runner.
    Then register the moved checkout with `orca-ide repo add --path
    ~/code/peon --json`. The CLI cannot rename or remove a repo, so remove
    the stale `tuicraft` entry (`3983f5d7-…`) in the app. Finally run
    `bun packages/factory/src/main.ts setup automations --apply`. The
    precheck path changed, so it edits all four automations, and each edit
    passes `--repo path:~/code/peon`.

11. **Verify.**
    - `mise factory:pace` shows no drift.
    - `journalctl --user -u peon-factory-reaper -n 20` shows a clean pass.
    - `orca-ide automations list --json` shows the new precheck path and
      repo.
    - A throwaway `soap create fresh` works with `PEON_*` keys and writes
      its launcher.
    - One scenario (`t0-who-is-near`) runs end to end on the renamed tree.
    - `bun ~/code/peon/tmp/rebrand/rename.ts --check ~/code/peon` exits 0,
      if `tmp/` survived the move.

## 5. Risks

- **Sessions keyed by path.** omp sessions (`~/.omp/agent/sessions/-code-tuicraft`,
  `-orca-workspaces-tuicraft-*`) and Claude Code projects
  (`~/.claude/projects/-home-deity-code-tuicraft*`) stay under the old
  names, so resume lists in `~/code/peon` start empty. Nothing is deleted.
- **Orca repo identity.** Adding `~/code/peon` gives it a new repo id. Old
  automation run history and worktree lineage stay with the old entry.
  Orca probably puts new worktrees under `~/orca/workspaces/peon/`, but that
  is unverified.
- **Import order.** `@peon` sorts before other scoped imports where
  `@tuicraft` sorted after them. `mise lint:fix` handles this, but a rebase
  onto new code can bring the lint failure back. Re-run it after any rebase.
- **In-flight PRs.** Any branch opened before the rename conflicts on every
  `@tuicraft` import. Land or rebase them first, or re-run the codemod on
  them after rebasing.
