# Layout B migration plan (judge)

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Key: `judge`. Base: `main` at `5dca819`, which is 3 commits after the `a6d941e` that the three attempts used. Toolchain: Bun 1.4.2, tsc 7.0.2, Biome 2.5.14.

Tags: **[measured]** means I ran it in a scratch clone and saw the result. **[read]** means I read the file. **[inferred]** means I did not verify it.

| Artefact | Path |
|---|---|
| Final codemod (the single source of truth) | `design/migration.codemod.ts` (not kept) |
| Generator that built it (strict codemod + grafts, for audit only) | `design/migration.graft-generator.ts` (not kept) |
| Move map, 476 renames at `-M30%` | `design/migration.moves.tsv` (not kept) |
| Raw check output from mig-final | `design/migration.checks.tsv` (not kept) |
| Proof clone (staged, not committed) | `/home/deity/.cache/pi-epic-scratch/mig-final` |
| Adversarial verification and the fixes it made (V1–V4) | `design/migration-verify.md` (not kept) |

**Verifier note.** The adversarial verify pass changed the codemod in four places (V1–V4 in `migration-verify.md`): a relative-path escape ban in every `noRestrictedImports` override, `bun install --cwd "$RUNNER"` in the reaper unit, prefixed forms in the dead-path rule, and an up-front refusal of untracked files. The tree hash is now `f6e9a151`. The rows below that name a hash or a probe list are updated to match.

## 1. Decision

**Base: `migration-strict-boundaries`, with six grafts from the other two attempts.** No hand edits are needed after the codemod runs on current `main` [measured]. Getting there took 3 codemod iterations beyond the grafts: the `typecheck` description anchor, a stale `src` pathspec in the staging step, and the one-line typecheck script. All three are fixed in the codemod; none is a hand edit to the output.

### Scores

I re-ran every codemod on current `main` (`5dca819`), not on `a6d941e`, because the real migration will run on a newer `main` too. Scale 1–5.

| Criterion | strict-boundaries | minimal-risk | harness-dx | **final** |
|---|---|---|---|---|
| Hard gate on current `main` | pass: codemod exit 0 and all checks pass [measured] | **fail**: codemod exit 1, `cannot cut` anchor at `codemod.ts:669` (its `quests.ts` type move no longer matches after `171bd4c`) [measured] | pass: codemod exit 0 and all checks pass [measured] | pass (section 6) |
| Boundary enforcement | 5: explicit `exports` with no wildcard; runtime, tsc and biome each reject a deep core import from a shell | 2: `./*` export, biome only | 3: `./wow/*` and `./test/*` exported, biome only for shells | 5 |
| Codemod reproducibility | 4: clean on drifted `main`, but it silently re-sorted object keys in `control-replan.test.ts` (8 files differ outside imports; one was not intended) [measured] | 2: anchors break on drift; it changes code bodies (type moves) to meet the 500-line cap | 5: clean on drifted `main`; 7 files differ outside imports, all intended [measured] | 5: deterministic (two fresh runs give tree `f6e9a151` after V1–V4), 7 intended body diffs, refuses a dirty (tracked or untracked) or migrated tree [measured] |
| Harness readiness | 3: Pi installs, per-package tsc works, no per-package mise args | 3: per-package typecheck in the gate | 5: Pi probed (run, tsc, compile), `mise typecheck <pkg>`, `[path]` args, dependabot ignore, filtered runner install | 5: all of harness-dx's items, Pi probe re-run [measured] |
| Reviewability | 3: flattens factory and devtools, `src/test` becomes `test-support/`, per-symbol import split, generated `internals.ts` | 2: long specifiers add 972 wrapped lines and force type moves | 4: path below `src/` never changes, `packages/factory/src/factory/` nesting | 4 |
| Vendor scripts (`vendor/namigator/*.ts`) | broken, and silently dropped from tsc | fixed | broken, and silently dropped from tsc | fixed [measured] |

### Why strict is the base, not harness-dx

On raw totals harness-dx edges strict. I chose strict because of the cost to graft:

- Strict's boundary is the part that is expensive to add later. It needs the explicit exports map, the per-symbol rewrite and the generated `test-support/internals.ts`. Grafting it into harness-dx means rewriting harness-dx's specifier pass.
- Harness-dx's advantages are cheap to add: some `mise.toml` args, one dependabot rule and one reaper line. I grafted all of them and re-ran every check [measured].
- The maintainer's rule is "shells import core only through its public surface". Only strict makes that rule structural. With strict, a shell file that imports `@tuicraft/core/wow/...` fails in Bun and in tsc, not only in biome [measured, section 6.3]. A **relative** path into another package (`../../../core/src/wow/protocol/packet`, or core reaching `../../../cli/src/ui/...`) resolves in Bun and passes tsc; only biome rejects it, through the V1 escape ban [measured by the verifier].

### Grafts (all in the final codemod, all re-checked)

| # | Graft | From | Why | Proof |
|---|---|---|---|---|
| G1 | The `useSortedKeys`-off override also covers the two relocated core tests (`packages/cli/src/ui/{party-store,control-replan}.test.ts`) | minimal-risk, harness-dx | Strict's biome pass silently re-sorted about 20 object keys in `control-replan.test.ts` [measured diff] | The body diff now shows `control-replan` identical outside imports. Negative control: 0 vs 1395 diagnostics |
| G2 | `vendor/namigator/{collisions,measure}.ts` import `../../packages/core/src/wow/navigation(-native)`, and root `tsconfig.json` includes `vendor/**/*.ts` | minimal-risk (idea); relative path is mine | Today root tsc checks them (the original `tsconfig.json` has no `include`). Strict and harness-dx left `"wow/navigation"` in place and excluded them, so they broke silently. A relative path needs no new core export and no root dependency | `bun vendor/namigator/measure.ts` prints usage like baseline. An injected type error in `measure.ts` fails root tsc with TS2322 |
| G3 | Assert that no file is left under `src/`, then remove the empty tree. The codemod also stages its result explicitly and fails on any unstaged or untracked file | minimal-risk, advisor | `git mv` left 8 empty directories. The attempts left new files untracked | `git status --porcelain` after the codemod shows only staged `R`/`A`/`M`/`D` entries |
| G4 | `mise typecheck [package]`: with no argument it runs root tsc and then `tsc -p` for each of the 5 packages. `mise format [path]`, `format:fix`, `lint` and `lint:fix` take `[path]`, default `packages/` | harness-dx (args), minimal-risk (per-package in the gate) | Per-package programs catch a package that only type-checks through another one (for example `md.d.ts`, `types: ["bun"]`) | `mise typecheck` exit 0 in 1.4 s. `mise typecheck harness` exit 0 |
| G5 | `.github/dependabot.yml` ignores `@earendil-works/*` | harness-dx | Pi is pinned exactly at 0.87.1 | [read] diff |
| G6 | The reaper `ExecStartPre` runs `bun install --cwd "$RUNNER" --silent --frozen-lockfile --filter @tuicraft/factory` from `%h` (V2: a `cd "$RUNNER"` first makes the mise `bun` shim read the runner's untrusted `mise.toml` and exit 1, and the `-` prefix hides it). `docs/factory.md` says so | harness-dx | The runner needs `node_modules` now, but not the Pi tree | Runner simulation: this install links only `packages/factory/node_modules/@tuicraft`, then the factory prints usage |
| G7 | `stale-docs` `load` throws `no docs match <pattern>` when a source glob matches nothing | minimal-risk | It closes the silent zero-match gap that blast-radius found | A planted bad pattern throws [measured] |

## 2. Specifier scheme

| Where | Form | Resolved by |
|---|---|---|
| Inside a package | Private `#` subpath imports from the package's own `package.json` `imports`: core `#wow/*`, `#lib/*`, `#test-support/*`; cli `#cli/*`, `#daemon/*`, `#ui/*`, `#lib/*`, `#tools/*`, `#test-support/*`; factory `#factory/*`, `#factory/prompts/*` (`.md` text imports), `#test-support/*`; devtools `#tools/*` | Bun and tsc (`moduleResolution: bundler`). No tsconfig `paths` |
| Sibling relative | The existing `./x` imports stay. `packages/cli/src/main.ts` uses `../package.json` (now cli's manifest, which holds `version: 0.4.2`) and `../../../.claude/skills/tuicraft/SKILL.md` | path |
| Across packages | Only the explicit core `exports` | workspace link in `node_modules`, so `bun install` is required |
| Repo scripts outside packages | `vendor/namigator/*.ts` import core source by relative path | path |

The core exports map is generated from real cross-package use. It has no wildcard [measured, `packages/core/package.json`]:

```json
".": "./src/wow/index.ts",
"./session": "./src/wow/session.ts",
"./lib/{abort,config,errors,ignore-failure,paths}": "./src/lib/<m>.ts",
"./test-support/{control-fixtures,internals,mock-handle,must,temp-paths}": "./test-support/<m>.ts"
```

- `packages/core/test-support/internals.ts` is generated. It re-exports the core internals that shell tests use: `GroundRoute`, `NavPoint`, `groundError`, `NativeMap`, `observeNavigation`, `PartyStore`, `parseChatMessage`, `GroupList`, `GameOpcode`, `PacketReader`, `REPLAN_LIMITS` and `RouteSession`. The barrel does not grow.
- A deep `wow/*` import from another package is rewritten one symbol at a time. A session symbol goes to `@tuicraft/core/session`. A barrel symbol goes to `@tuicraft/core`. Any other symbol goes to `test-support/internals`, and only when the importer is a test. A production deep import makes the codemod abort.
- cli, factory, devtools and harness have `"exports": {}`, so nothing can import them. Each depends on `"@tuicraft/core": "workspace:*"`. harness also pins `@earendil-works/{pi-agent-core,pi-ai,pi-coding-agent,pi-tui}` at exactly `0.87.1`, and `packages/harness/src/index.ts` is empty.
- Biome `noRestrictedImports` has 6 path-scoped overrides:
  - core bans `@tuicraft/**` and `@earendil-works/**`; non-test core src also bans `#test-support/**`;
  - shells ban every `@tuicraft/**` except core, `/session`, `/lib/*` and (tests only) `/test-support/*`;
  - `@earendil-works/**` is banned everywhere except `packages/harness`.

  - every override also bans a relative specifier that climbs into another package (`../**/{core,cli,factory}/{src,test-support}/**`, `../**/{devtools,harness}/src/**`, `../**/packages/**`, `../**/node_modules/**`), the Pi ban also covers `../**/@earendil-works/**`, and non-test core src also bans `../**/test-support/**` (V1). Bun and tsc do not reject these relative forms, so this is biome-only.

  Biome takes the options of the last matching override (strict report, measured), so the harness overrides must stay last.

## 3. Configs

- **Root `package.json`**: `workspaces: ["packages/*"]`, `start: bun packages/cli/src/main.ts`, `typecheck: tsc --noEmit && tsc --noEmit -p packages/{core,cli,factory,devtools,harness}` (spelled out). `module` and `version` are removed.
- **`tsconfig.base.json`**: every old compiler option and strict flag. `paths` is replaced by `"types": ["bun"]`, which the isolated linker needs [measured by all three attempts].
- **Root `tsconfig.json`**: extends base; `include: ["packages/*/src", "packages/*/test-support", "vendor/**/*.ts"]`; `exclude: ["node_modules", "**/node_modules", "tmp"]`. The Pi spike under `docs/plans` stays outside, as it is today.
- **`packages/<p>/tsconfig.json`** (5 files): extends `../../tsconfig.base.json`, `include: ["src", "test-support"]`. There are no project references and no emit.
- **`md.d.ts`**: moves to `packages/cli/src/`, and a copy goes to `packages/factory/src/` for the prompt imports.
- **`biome.json`**: `files.includes: ["packages/**"]`. Every override is re-pointed. `useSortedKeys` off: `packages/core/src/wow/**` plus the two relocated tests. `noBarrelFile` off also covers `test-support/internals.ts`. Opcode-table cap exemption: `packages/core/src/wow/protocol/opcodes.ts`. `config/biome.grit` and the 500-line cap are unchanged.
- **`mise.toml`**: `build` sources and entry, `build:all`, `test:live` (`./packages/cli/test-support/live*.ts`), `typecheck [package]`, `format`/`format:fix`/`lint`/`lint:fix [path]`, `lint:docs` → `packages/devtools/src/stale-docs.ts`, `factory:pace` → `packages/factory/src/main.ts`, `evidence:encounter` → `packages/devtools/src/distil-encounter.ts`.
- **`.claude/settings.json`**: both PostToolUse `case` patterns become `packages/*/src/*.ts|*/packages/*/src/*.ts|packages/*/test-support/*.ts|*/packages/*/test-support/*.ts`.
- **`orca.yaml`, `hk.pkl`, `.claude/hooks/session-start.sh`**: no change. `mise bundle` is already a root `bun install`, which installs every member [read + measured].
- **Factory code**:
  - `setup.ts` precheck → `bun ${runner}/packages/factory/src/main.ts precheck`, and `wrapperTarget` → `${runner}/packages/factory/src/omp-factory`.
  - `soap-wrapper.ts` and its test → `${root}/packages/cli/src/main.ts`.
  - The `main.ts` usage string is updated.
  - The repo copy of the reaper unit: new ExecStart path, plus the G6 `ExecStartPre` (`bun install --cwd "$RUNNER" …`, never `cd "$RUNNER" && bun …`).
- **`stale-docs.ts`**: `sources` are re-pointed. The new dead-path rule flags any bare `src/<wow|lib|test|cli|daemon|ui|tools|factory|harness|main.ts|…>` path, and any `packages/<pkg>/{src,test-support}/…` path that does not exist (a glob is checked up to its directory), in instruction docs only. `../<repo>/src/…` and AzerothCore `src/server/…` are not flagged. The G7 zero-match throw is also added. There is 1 new test (2485 → 2486).

## 4. File-move map

The full list is `migration.moves.tsv`: 476 renames at `-M30%`, plus `wow/index.ts` and `wow/session.ts`, which show as add/delete because they are almost all import lines. Per package: core 307 files, cli 113, factory 62, devtools 6, harness 3 [measured, `git ls-files`].

| Old | New |
|---|---|
| `src/wow/**` | `packages/core/src/wow/**` |
| `src/lib/{abort,emitter,errors,ignore-failure,config,paths}{,.test}.ts` | `packages/core/src/lib/` |
| `src/lib/{session-log,ring-buffer,strip-colors}{,.test}.ts` | `packages/cli/src/lib/` |
| `src/{cli,daemon,ui}/**`, `src/main.ts`, `src/main.test.ts`, `src/md.d.ts` | `packages/cli/src/…` |
| `src/tools/session-record*`, `src/tools/session-latency.ts` | `packages/cli/src/tools/` |
| other `src/tools/*` (`stale-docs`, `distil-encounter`, tests) | `packages/devtools/src/` (flat) |
| `src/factory/**` (prompts, `systemd/`, `omp-factory`, `omp-factory.yml`) | `packages/factory/src/**` (flat) |
| `src/wow/{party-store,control-replan}.test.ts` | `packages/cli/src/ui/` |
| `src/test/*` | `packages/<pkg>/test-support/*`, placed by the import graph |

`src/test` placement is computed. A file goes to core when any core file (or core support file) imports it. Otherwise it goes to the package of its users. A `*.test.ts` follows its subject. On `5dca819` the result was [measured, codemod output]:

- **core (26 + generated `internals.ts`)**: must, hex, fixtures, dbc, temp-paths, mock-handle (+test), mock-world-server, mock-auth-server, quest-215/8325/8326-packets and every `*-fixtures` that a core test imports.
- **cli (9)**: commands-, format-, monster-chat- and tui-fixtures, live, live-helpers, live-quest, live-remote-motion, live-vendor.
- **factory (3)**: factory-fixtures, git, git.test.

Deviations from the context, all measured or read:
1. `session-latency.ts` goes to cli, because `session-record.ts:7` imports it.
2. `git.ts` and `git.test.ts` go to factory, because only factory tests use them.
3. Test support is in `packages/<pkg>/test-support/`, not `src/test/`, so that biome and the exports map can tell it apart from production code.

## 5. Execution steps for the real migration (one agent, one commit)

Preconditions: the factory is paused (`mise factory:pace pause`) and In review is drained. `pause` leaves QA and the reaper running (AGENTS.md Commands, `pace.ts:35`), and both run `src/factory/main.ts` from the runner, which the reaper resets to `origin/main` every minute. So also disable the QA automation and run `systemctl --user stop tuicraft-factory-reaper.timer` before the merge, and turn both back on only after section 9 steps 1–4. No other agent works on the epic branch. The machine has network access (`bun install` fetches the Pi tree).

1. Create the epic worktree from current `origin/main` (Orca worktree with `--parent-worktree active`, owner comment). Run `mise trust -y && mise bundle`.
2. Check that the tree is clean: `git status --porcelain` is empty.
3. Copy `design/migration.codemod.ts` (not kept) from the main checkout to a path outside the worktree, for example `$XDG_RUNTIME_DIR/migration.codemod.ts`, so it cannot become part of the commit.
4. Run it from the worktree root: `mise exec -- bun "$XDG_RUNTIME_DIR/migration.codemod.ts" > tmp/codemod.log`. It does these things:
   - refuses a dirty tree (tracked changes or untracked files, V4) or an already migrated tree;
   - runs `git mv`, rewrites imports, writes manifests and configs, and edits the docs;
   - runs `bun install` and the biome organise and format pass;
   - stages exactly its own paths, and fails on any unstaged or untracked file.

   If it throws, do not hand-edit the output. Fix the named anchor in the codemod, then `git reset --hard && git clean -fd` (no pathspec: the codemod also writes `tsconfig.base.json` at the root; `tmp/` and `node_modules` are ignored and survive) and run it again.
5. Run the check list in section 6. Everything must match. `mise test` must give baseline + 1 tests, where baseline is the count of `bun test` on the same `main` before step 4.
6. Commit the staged tree as one commit. `git status --porcelain` must show nothing unstaged first. Then `git commit` separately, with subject `chore: Split src into workspace packages` and a why-body.
7. Push the branch and open the PR (`Fixes #N`, `## Proof` with the section 6 table). Review with `git diff -M30%`; index/session need `-M10%`.
8. Gates before merge:
   - `mise ci` on the pushed head, so that `signoff/ci` is posted;
   - `mise test:live` from the epic worktree, with two throwaway soap accounts (`soap create fresh --gm 2` and `soap create eversong10`, run through `bun packages/factory/src/main.ts`, then `soap delete`). **The coordinator's live agent does this, not the migration agent.**
   - the factory review statuses per AGENTS.md "Shipping".

## 6. Check list, measured on mig-final (`5dca819` + final codemod, no hand edits)

### 6.1 Build and test gate

| Check | Command | Result |
|---|---|---|
| codemod | `mise exec -- bun migration.codemod.ts` | exit 0. 1824 import specifiers rewritten. 476 R + 16 A + 2 D + 14 M staged, nothing unstaged |
| determinism | second fresh clone, same codemod, `git write-tree` | both `f6e9a15134cb829ed5cfe9a2f179e804a77b3ac7` (after V1–V4; mig-final equals it) |
| rerun guard | codemod again on the migrated tree | throws `run from the root of an unmigrated checkout` |
| install | `bun install --frozen-lockfile` | exit 0, 129 installs across 172 packages |
| ci aggregate | `mise ci:checks` | exit 0 |
| typecheck, whole + each package | `mise typecheck` | exit 0, 1.4 s |
| typecheck, per package | `tsc --noEmit -p packages/{core,cli,factory,devtools,harness}`; `mise typecheck harness` | all exit 0 |
| typecheck negative control | inject `const x: number = "s";` into `packages/harness/src/index.ts` | `mise typecheck harness` exit 1 with TS2322 on that file; `mise typecheck` exit 1; reverted |
| unit tests | `bun test` | **2486 pass / 0 fail / 228 files**. Baseline `5dca819`: **2485 / 0 / 228**. +1 = the new dead-path test |
| tests per package | `mise test packages/<p>` | core 1331, cli 925, factory 214, devtools 16 (sum 2486), all exit 0. harness: exit 1, "no tests" (expected: the package is empty by design) |
| format | `mise format` | exit 0, 483 files |
| lint | `mise lint` | exit 0, 483 files, 0 diagnostics |
| docs | `mise lint:docs` | exit 0 |
| compile | `mise build`, then `./dist/tuicraft help`, `--version`, `skill` | exit 0; `0.4.2`; `skill` is byte-identical to `.claude/skills/tuicraft/SKILL.md` |
| CLI from source | `bun packages/cli/src/main.ts help` | byte-identical to baseline `bun src/main.ts help`; `--version` 0.4.2 |
| factory entry | `bun packages/factory/src/main.ts` | usage, rc 2 (same as baseline) |
| vendor scripts | `bun vendor/namigator/{measure,collisions}.ts` | usage lines, as on baseline. An injected error in `measure.ts` fails root tsc (TS2322) |
| bodies unchanged outside imports | `bodydiff.ts` against baseline | 461 of 468 renamed `.ts` identical. The 7 that differ are intended: `main.test.ts` (test title), `stale-docs{,.test}.ts`, factory `main.ts`, `setup.ts`, `soap-wrapper{,.test}.ts` |
| nested tmp dirt | `ls -d packages/*/tmp` after the full test run | none |

### 6.2 Rule and guard checks

| Check | Result |
|---|---|
| `useSortedKeys` guard | 0 diagnostics with the override. With its includes pointed at a path that does not exist: 1395 `assist/source/useSortedKeys` diagnostics in core and the two relocated tests |
| dead-path rule | Planted `src/wow/client.ts` and `packages/core/src/wow/nope.ts` in AGENTS.md: both flagged, "2 stale passage(s)". The glob `packages/cli/src/ui/**` and the real `packages/core/src/wow/client.ts` are not flagged. After V3 the prefixed forms `./src/main.ts`, `$root/src/main.ts`, `${runner}/src/factory/omp-factory` and `F=~/…/runner/src/factory/main.ts` are flagged too; `../wowser/src/lib/…` is not |
| zero-match source glob | Planted `packages/cli/src/cli/nohelp.ts` source: throws `no docs match` |
| leftover old paths | `rg` for bare `src/(wow\|lib\|cli\|daemon\|ui\|factory\|tools\|test\|main.ts)` outside `packages/`, `docs/plans`, `docs/evidence`, `bun.lock`: 0 hits. Inside packages: 2 intended strings in `stale-docs.test.ts`. `docs/evidence`: 19 files keep old paths on purpose (dated records) |
| PostToolUse format hook | `packages/core/src/wow/party-store.ts`, absolute `…/packages/cli/src/daemon/server.ts`, `packages/core/test-support/must.ts`: exit 0, "Checked 1 file" |
| PostToolUse test hook | core `wow/combat.ts` 16 pass, absolute cli `daemon/start.ts` 8 pass, core `test-support/mock-handle.ts` 15 pass, cli `lib/ring-buffer.ts` 16 pass; all exit 0 |
| `mock.module` ban | probe in `packages/cli/src/ui/*.test.ts`: biome `plugin` diagnostic |

### 6.3 Boundary probes (probe file created, checked, deleted)

| Probe | Bun runtime | tsc | biome |
|---|---|---|---|
| cli prod imports `@tuicraft/core/wow/protocol/packet` | Cannot find module | TS2307 | noRestrictedImports |
| cli prod imports `@tuicraft/core/test-support/must` | resolves | ok | noRestrictedImports |
| cli `*.test.ts` imports `test-support/must` and `/internals` | resolves | ok | allowed |
| cli imports `@tuicraft/harness` / `@tuicraft/factory` | Cannot find module | TS2307 | noRestrictedImports |
| cli imports `@earendil-works/pi-ai` | Cannot find module | TS2307 | noRestrictedImports |
| cli imports barrel value, `/session`, `/lib/paths` | resolves | ok | allowed |
| core imports `@tuicraft/cli` | Cannot find module | TS2307 | noRestrictedImports |
| cli prod imports `../../../core/src/wow/protocol/packet` (relative) | resolves | ok | noRestrictedImports (V1 only) |
| core imports `../../../cli/src/ui/format-party` (relative) | resolves | ok | noRestrictedImports (V1 only) |
| core prod imports `../test-support/must` (relative) | resolves | ok | noRestrictedImports (V1 only) |
| cli imports `../../../harness/node_modules/@earendil-works/pi-ai` | resolves | ok | noRestrictedImports (V1 only) |
| core prod imports `#test-support/must` | resolves | ok | noRestrictedImports |
| core / factory import `@earendil-works/pi-ai` | Cannot find module | TS2307 | noRestrictedImports |
| factory imports `@tuicraft/core/wow/protocol/packet` | Cannot find module | TS2307 | noRestrictedImports |
| devtools imports `#wow/client` (another package's alias) | Cannot find module | TS2307 | allowed |
| harness imports `@earendil-works/pi-ai` + `/session` | resolves | ok | allowed |
| harness prod imports `test-support/must` | resolves | ok | noRestrictedImports |
| harness imports `@tuicraft/core/wow/protocol/packet` | Cannot find module | TS2307 | noRestrictedImports |

### 6.4 Harness readiness and runner

| Check | Result |
|---|---|
| Pi under the isolated linker | all four `@earendil-works/*` 0.87.1 only in `packages/harness/node_modules`; none at root; `packages/cli/node_modules` has only `@tuicraft` |
| Pi probe (throwaway `packages/harness/src/zz-probe.ts` importing `Agent`, `Type`, `createAgentSessionRuntime`, `Container`, `WorldHandle`, `worldSession`) | `PI_OFFLINE=1 bun` runs; `mise typecheck harness` exit 0; `bun build --compile` + run exit 0. Only module loading was checked |
| runner simulation, before install (rsync copy without `node_modules`, `.git`, `dist`) | factory: `Cannot find module '@tuicraft/core/lib/config'`; CLI: `Cannot find module '@tuicraft/core/lib/errors'` |
| runner simulation, after `bun install --silent --frozen-lockfile --filter @tuicraft/factory` | exit 0; only `packages/factory/node_modules/@tuicraft`; no Pi; factory usage rc 2; `precheck --help` prints usage |
| live suite | **not run** (rules for this task). It is a merge gate for the coordinator's live agent (section 5 step 8) |

## 7. Doc sweep

The codemod edits all of these. `mise lint:docs` passes with the new rule.

- `AGENTS.md`:
  - the Commands paths, plus `typecheck [package]`, `format`/`lint [path]` and the `mise test <file>` example;
  - a new workspace/package import rule that replaces the old WorldHandle shell rule;
  - `ignore-failure` and `emitter` specifiers, fixture locations, `test-support` paths and biome override paths;
  - sibling-repo paths qualified as `../wowser/src/lib/…` and `../azerothcore-wotlk-playerbots/src/server/…`.
- `docs/factory.md`: 11 paths, plus the G6 runner-install sentence.
- `docs/manual.md`: `live.ts` and the soap commands.
- `README.md`: the soap commands (`:95-96`).
- `docs/roadmap.md`: path rewrites.
- `packages/factory/src/prompts/{worker,reviewer,merger,qa}.md`: `F=` and `bun src/main.ts`.
- `.claude/skills/tuicraft/SKILL.md` and `packages/cli/src/cli/help.ts`: checked, no change needed (the only `src/` path is AzerothCore's).
- `docs/plans/**` and `docs/evidence/**`: left as they are, because they are dated records. `docs/plans/2026-09-25-pi-harness-spike/*.ts` still import `../../../src/wow`. They were already excluded from tsc and biome, so the break is silent. The harness work replaces them.

Cosmetic: several rewritten lines in AGENTS.md and `docs/factory.md` go past 80 columns. No check enforces a width.

## 8. Rollback

- Before merge: delete the epic branch and worktree. Nothing outside the branch changes, and the factory and machine-local units still point at `src/`.
- After merge, before the machine-local steps: `git revert <squash sha>` in one PR, then `mise bundle` everywhere. The factory is still paused and nothing machine-local has moved.
- After the machine-local steps:
  1. revert as above;
  2. then undo section 9 in reverse: restore the old reaper unit from the reverted repo copy, run `setup wrapper --apply` and `setup automations --apply` from the runner on the reverted `main`, and regenerate the soap wrappers.

  The old tree needs no `node_modules` beyond `@types/bun`, so a stale `node_modules` does no harm.

## 9. Post-merge machine-local steps (list only; not done)

Keep the factory paused, the QA automation disabled and the reaper timer stopped (section 5 preconditions) until steps 1–4 are done; resume work/review/merge only after 1–6.

1. **Runner clone**: `git -C ~/.local/share/tuicraft-factory/runner fetch && git -C ~/.local/share/tuicraft-factory/runner reset --hard origin/main && bun install --cwd ~/.local/share/tuicraft-factory/runner --frozen-lockfile --filter @tuicraft/factory`, run from `~`. The runner is not mise-trusted, so running the `bun` shim from inside it fails (V2). Then check that `bun packages/factory/src/main.ts` prints usage.
2. **Reaper unit**: `cp packages/factory/src/systemd/tuicraft-factory-reaper.{service,timer} ~/.config/systemd/user/`, then `systemctl --user daemon-reload` and `systemctl --user start tuicraft-factory-reaper.timer`. Check `journalctl --user -u tuicraft-factory-reaper` shows a clean run: the install `ExecStartPre` has a `-` prefix, so its failure is silent there. The copy has the new ExecStart and the filtered-install ExecStartPre. Review the `proof-335.conf` drop-in: its patch targets `src/` paths and will stop applying.
3. **omp-factory symlink**: `bun packages/factory/src/main.ts setup wrapper --apply` points `~/.local/bin/omp-factory` at `runner/packages/factory/src/omp-factory`.
4. **Orca automation prechecks**: `bun packages/factory/src/main.ts setup automations --apply` rewrites the four prechecks. The reaper syncs the changed prompts (`F=` line) on its next pass.
5. **Orca setup for `auto-*` worktrees**: check that "Run setup for each new workspace" is on for the factory automations. If it is off, those worktrees have no `node_modules` and every `bun` entry fails with `Cannot find module '@tuicraft/core…'` [measured failure mode; the setting could not be determined].
6. Run `mise bundle` in the main checkout and in every live worktree. Recreate the `tmp/tc-<ACCOUNT>` wrappers (`soap delete` / `soap create`), because the old ones exec `src/main.ts`. Run `mise deploy` to rebuild `/usr/local/bin/tuicraft`.
7. Rebase any open branches across the rename, then resume with `mise factory:pace default`.

## 10. Risks

1. **Everything needs `bun install` before it runs.** This covers the runner, `auto-*` worktrees without Orca setup, and old wrappers. The failure is `Cannot find module '@tuicraft/core/…'` [measured].
2. **Every `mise bundle` installs the Pi tree** (122 packages on a cold install). The runner avoids it with `--filter`. The compiled CLI does not grow [inferred from the strict report: 175 modules].
3. **Relative-path escapes between packages are enforced by biome only** (V1). Bun and tsc resolve `../../../core/src/...` from any package. `mise lint` runs in `mise ci:checks`, and repo rules ban `biome-ignore`.
4. **The test-support boundary is enforced by biome only.** An `exports` subpath cannot tell a test importer from a production one. Repo rules ban `biome-ignore`, and lint runs in `mise ci:checks`.
5. **`test-support/internals.ts` opens the wall on purpose**, for 12 internals. When a symbol becomes public, move it to the barrel. Do not grow `internals.ts`.
6. **Biome uses the last matching override.** A reordered `biome.json` silently changes which bans apply. The harness overrides must stay last and repeat full pattern lists.
7. **Rename churn**: 508 files change. Open branches conflict. The factory must stay paused.
8. **The Claude test hook no longer runs `party-store` and `control-replan` tests** when someone edits their core subjects, because those tests now live in cli.
9. **`mise test packages/harness` exits 1** until the harness has its first test. The harness work should add a smoke test with its first module.
10. **Presentation code (`ui/format*`) stays in cli**, and harness may not import cli. The harness work must move shared formatters into core, or duplicate them.
11. **Anchored edits fail loudly on drift.** If `main` moves before execution, the codemod may stop at a named anchor. Fix the anchor, not the output, and re-run section 6.
12. **The codemod needs network** for `bun install`.
