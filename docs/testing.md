# Testing

Unit tests prove behaviour, protocol boundaries and failure recovery. Live
eval runs ([evals.md](evals.md)) prove gameplay. Coverage finds risk; it is
not a target.

## Unit tests

- Tests are colocated (`foo.ts` → `foo.test.ts`) and import from
  `bun:test`. `mise test` runs them all; `mise test <file>` runs one.
- The suite should finish in a few seconds: a test that waits on a real
  timer or bound takes an injected value or fake timers instead.
- Shared setup goes in `packages/<pkg>/test-support/<name>-fixtures.ts`.
  `packages/core/test-support/mock-handle.ts` is the shared `WorldHandle`
  mock: add new `WorldHandle` methods to it.
- `mock.module()` leaks across files in Bun, so `config/biome.grit` bans
  it. Inject dependencies instead: file locations come from a `Paths`
  value (`resolvePaths()` by default) and tests pass `pathsUnder(dir)`
  from `packages/core/test-support/temp-paths.ts`.
- Tests that spawn git use `git()` or `gitEnv()` from
  `packages/factory/test-support/git.ts`, which strip `GIT_*`: an
  inherited `GIT_DIR` makes `git init` write into another repository.
- Scratch files go in `./tmp/`, never `/tmp/`, and `tmp/` never holds a
  `.test.ts` file, because `bun test` scans it. macOS `tmpdir()` is not
  `/tmp/`, so never hard-code that path. `scratchDir(prefix)` from
  `packages/core/test-support/scratch.ts` makes a directory in `./tmp/`
  and removes it after the file's tests.

## Bun gotchas

- Timers: `jest.useFakeTimers()` and `advanceTimersByTime()` from
  `bun:test`, inside `try/finally` with `jest.useRealTimers()`. Fake
  timers also fake `Date.now()`, `performance.now()` and `Bun.sleep`, so
  `Bun.sleep(0)` never resolves under them; `setImmediate` stays real.
  `packages/harness/test-support/fake-time.ts` and
  `packages/core/test-support/tactics-fixtures.ts` drive fake time until
  a promise settles.
- Await the event rather than sleeping. `Bun.sleep(0)` yields one microtask
  tick (enough for `.then()` chains); `Bun.sleep(1)` yields one event-loop
  turn (needed for filesystem I/O such as `unlink`).
- `Bun.connect()` returns a promise, so connection errors escape a
  `new Promise` constructor: chain `.catch(reject)` on it.
- A `Bun.listen` server's `socket.end()` does not reliably fire the client's
  `close`; detect the protocol terminator in the `data` handler.
- Give each test its own socket path (counter plus timestamp).
- `Bun.file().exists()` is true only for regular files; use `fs.access()`
  for unix sockets.
- `Bun.write` has no mode option: write secrets with `writeFile` from
  `node:fs/promises` and `{ mode: 0o600 }`.
- `bun test` hides per-test lines when piped; use `mise test:slowest` or
  `--reporter=junit --reporter-outfile=<file>` for timings.

## Live characters

Run evals on throwaway accounts of your own, never on anyone else's
character.

1. `mise namigator:build` when the patch set in `vendor/namigator/`
   changed; `soap create` refuses without the build.
2. `mise factory soap create <preset>`, redirected to a
   file under `tmp/`. The JSON holds the password, so read fields with
   `jq` and never print it.
3. Drive the character only through the wrapper the JSON names
   (`.wrapper`, `tmp/puppet-<ACCOUNT>`), never by exporting `XDG_*` into
   your shell. It uses the account's own directories and refuses to run
   when that config logs in another character.
4. `soap delete <ACCOUNT>` afterwards.

Presets, the puppet wrapper and the t1 service are described in
[factory.md](factory.md). A run that fails because the server or SOAP is
down is an infrastructure failure: report it to the maintainer.
