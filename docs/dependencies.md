# Dependencies

Peon keeps its dependencies minimal. Pi is the one expected runtime
dependency; everything else needs a reason to stay. Before adding a
package or tool, check whether Bun, the standard library or a tool
already listed here does the job, and name the reason in the pull
request. Remove a dependency once nothing uses it.

## Packages

| Package | Where | Used for |
| --- | --- | --- |
| `@earendil-works/pi-coding-agent` | harness | Agent runtime, extension API, sessions, theme |
| `@earendil-works/pi-ai` | harness | Credential store, system message, schemas, the faux provider in tests |
| `@earendil-works/pi-agent-core` | harness | Agent message, tool and thinking-level types |
| `@earendil-works/pi-tui` | harness | TUI components and text width |
| `@types/bun` | root, dev | Bun types for `tsc` |
| `typescript` | root, peer | `mise typecheck` |

- The harness imports all four Pi packages directly, so each is declared
  even where another Pi package also depends on it. They share one exact
  version and move together; Dependabot skips them.
- Core has no dependencies. Devtools and factory depend only on core.
- `@types/bun` stays on `latest`. The transitive tree Pi brings in is
  accepted as part of Pi.

## mise tools

`mise.toml` declares every tool `mise ci` and the tasks need, all on
`latest`:

| Tool | Used for |
| --- | --- |
| `bun` | Runtime, tests and every task |
| `npm:@biomejs/biome` | `mise format`, `mise lint` and the Claude edit hook |
| `gh` | Factory, `gh signoff` in `mise ci`, agent prompts |
| `hk` | Git hooks; hk evaluates `hk.pkl` itself |
| `jq` | Claude hooks in `.claude/settings.json` and agent prompts |
| `rg` | The eval grader's password leak check and its tests |

Code that runs an external program declares it here, unless it is a host
prerequisite below.

## Host prerequisites

These come from the machine, not from mise:

- `git`, a POSIX shell and the usual utilities (`sed`, `awk`, `sort`,
  `head`, `wc`, `fmt`, `grep`).
- `mise` itself. The Claude session-start hook installs it with `curl`
  when it is missing.
- Orca (`orca-ide`) for the factory and eval panes.
- `systemctl --user` for the factory timers.
- A C++ toolchain for `mise namigator:build`: `bash`, `cmake`, `ninja`,
  `g++` and `nm`.

The harness looks up `fd` and `rg` and seeds a silent stub in Pi's
`bin/` directory when either is missing, so Pi never downloads them.

## Vendored code

`vendor/namigator/` holds the patches, build script and diagnostic
scripts for the navigation library. `UPSTREAM` pins the namigator
commit, and its `recastnavigation` and `stormlib` submodules follow that
commit.
