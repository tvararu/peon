# Eval infrastructure (area: eval-infra) Implementation Plan

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Area overview

1. This area builds the grader tooling in `packages/harness/src/grader/` (contract 2.13, decision D1), not in `packages/devtools`: devtools cannot import `ui/glyphs.ts`.
2. The tools drive one Orca pane per run (`orca-ide terminal create/send/read --screen/wait/close`), save tagged frames, tail `gamelog.jsonl` and `status.json` (the P6 watcher) and read t1 truth through `bun packages/factory/src/main.ts soap truth`.
3. The round-1 scenarios are data: 13 JSON files with the task text, preset, setup calls, steers, budgets and pass checks from `design/eval-suite.md` §2.3 and §6.
4. A runner does eval-suite steps 1-13 for one scenario id: create, setup, baseline, launch, ready check, watcher, task, steers, end detection, quit, final truth, and a cleanup that always deletes the accounts and closes the pane.
5. The runner writes `result.json` itself for an `aborted` run and a schema-valid `grader/draft.json` otherwise; the Workflow grader agent grades the checks and friction and writes `result.json` with `cli.ts result`.

**Goal:** A Workflow grader agent runs one round-1 scenario with one command and gets a run dir, a draft `EvalResult` and clean accounts.

**Architecture:** Small modules behind the frozen contract types: `exec` (subprocess), `pane` (Orca), `frames`, `truth`, `result` (schema and validator), `scenarios` (data), `watch` (P6), then the runner split into `accounts`, `steer`, `efficiency`, `run-finish`, `run`, and the `cli` front end. Every external effect goes through the injected `Exec`, so tests use a fake `Exec` and never `mock.module`.

**Tech Stack:** Bun, TypeScript (strict), `bun:test`, `orca-ide` CLI, `rg`, the factory `soap` CLI.

**Spec:** `docs/plans/2026-09-26-pi-harness-epic-design.md` §8, [`eval-suite.md`](../2026-09-26-pi-harness-epic/eval-suite.md) (§2.3, §3, §4, §6, t1 revision), [`harness-design.md`](../2026-09-26-pi-harness-epic/harness-design.md) §I, [`contract.md`](contract.md) §2.13, §3.2, §4.

## Contract issues

The contract is not changed. Each item says how this plan works around it.

1. **Quit keys.** Contract 2.13 says `quit` sends two `\x03`. The approved spec (§7 settlement 6, §8) says `<HARNESS_QUIT>` is Ctrl-D on an empty editor, then two Ctrl-C only if Pi still shows. E1b keeps the signature `quit: () => Promise<void>` and implements the spec: send `\x04` (the runner types nothing after the last steer, so the editor is empty), wait up to `QUIT_CONFIRM_MS` (3 s) for exit, confirm with `read --screen`, and only if the pane still shows Pi send two `\x03` without an await between them (Pi exits on two within 500 ms, luna-runtime §6).
2. **`exec` prefix on the launch command.** Contract 2.13 gives `harnessCommand` → `bun packages/harness/src/entry.ts …`. Orca types `--command` into an interactive shell, and the shell stays alive after Pi exits (luna-runtime §6, measured), so `terminal wait --for exit` never fires. Measured here on 2026-09-26: a pane created with `--command "exec sleep 4"` gave `wait --for exit` → `ok: true, satisfied: true, status: "exited"`, a timeout gave `ok: false, error.code: "timeout"` with exit code 1, `read --screen` after the exit gave `status: "exited", tail: []`, and `close --tab` after the exit gave `ok: false, error.code: "terminal_handle_stale"` while `terminal list` no longer showed the tab. So E1b returns `exec bun packages/harness/src/entry.ts --profile <p> --run-dir <d> --glyphs nerd` (`HARNESS_LAUNCH` is unchanged), `close` treats `terminal_handle_stale` as closed, and the watcher saves the final frame before the quit (the screen is empty after the exit).
3. **Frame interval.** The coordinator's brief says "frame capture every 15 s". The contract (`FRAME_EVERY_MS = 5000`), eval-suite step 7a and design I.2 say 5 s. This plan keeps 5000 ms; 15 s is the eval-suite step 9 fallback poll for a grader without the watcher. Frames are saved only when the tagged screen changed, so 5 s does not multiply the files.
4. **`SteerAt` cannot count or delay.** Round 1 needs "after the second kill" (`t7-question-while-acting`) and "20 s after the agent acknowledges" (`t7-halt-resume`). This plan keeps the contract type and gives the runner sequential semantics (E7b): steer *i* is armed only after steer *i−1* was sent; a `trigger` steer fires on the first matching trigger row later than the previous steer (or the task); an `elapsed` steer fires `ms` after the previous steer (or the task). The data then uses the closest legal values: `t7-question-while-acting` steer 1 fires at the **first** kill, and `t7-halt-resume` steer 2 fires 25 s after the stop steer. The coordinator can add `count?: number` and `afterMs?: number` to the trigger variant later; E5 owns the type.
5. **Partner actions have no field.** `t2-whisper-reply` needs the partner to whisper at task + 60 s. `Scenario` has no partner-action field, and `steers` are typed into Pi only. The runner creates, starts and stops the partner and writes `partner-names.json` (with the wrapper path); the grader agent sends `<wrapper> send -w <AGENT> "hey, what level are you?"` itself. The check text in `t2-whisper-reply.json` says so.
6. **Runner, cleanup and result writer are not in the contract.** Contract E7 is `grader/cli.ts` only, with nine subcommands. The brief asks for a runner with one scenario id, cleanup and `result.json` writing. This plan splits E7 (contract 0.4 allows `<id>a`, `<id>b`, …) and gives E7 these new files: `grader/accounts.ts` (E7a), `grader/steer.ts` (E7b), `grader/efficiency.ts` (E7c), `grader/run-finish.ts` (E7d), `grader/run.ts` (E7e); `grader/cli.ts` and the `mise.toml` `[tasks.eval]` block stay E7 (E7f). `cli.ts` gets two more subcommands, `run` and `result`. Efficiency from the Pi session JSONL goes in `efficiency.ts`, so `result.ts` stays exactly the contract surface.
7. **Test support files.** No test-support file for the grader is in the contract. E1a creates `packages/harness/test-support/fake-exec.ts`, E1b creates `packages/harness/test-support/fake-pane.ts`.
8. **Extra exports.** Beside the contract names, these files export helpers that later tasks in this area use: `exec.ts` `parseJsonOutput`, `isRecord`; `pane.ts` `shellQuote`, `QUIT_CONFIRM_MS`; `truth.ts` `TRUTH_ARGV`, `STALE_SLACK_MS`; `watch.ts` `LogTail`, `createLogTail`, `triggerRows`, `lastAnswerAt`, `progressOf`, `readStatus`, `LOG_POLL_MS`, `WITNESS_EVERY_MS`. No other area uses them.
9. **JSON keys are sorted by biome.** Measured on 2026-09-26: a two-key unsorted `.json` under `packages/harness/src/` fails `biome check` with `assist/source/useSortedKeys` (fixable). "Copied verbatim" for `eval-result.schema.json` therefore means the same schema with keys sorted by `mise lint:fix`; arrays (enum order, `required` order) do not change. The same applies to the 13 scenario files and to every object literal in TypeScript (`useSortedKeys` is on for `packages/harness/**`).
10. **JSON imports are relative.** The `#harness/*` map points at `./src/*.ts`, so it cannot name a `.json` file. `result.ts` and `scenarios.ts` import their JSON with `./…json` and `with { type: "json" }` (contract D13 measured this form to type-check).
11. **`watchRun` does one tick at start and one at stop.** The contract does not say when the first frame is taken. E6b runs one full tick (log, status, frame, witness) at start and one at `stop()`, beside the interval ticks. The final tick at `stop()` is how the runner saves the last frame before the quit (item 2).
12. **Navigation track.** The nav track has landed (HANDOVER, epic head `c91f70f`; spec §7 settlement 12). E5 still sets `"navBound": true` on the four scenarios that contract 0.5 names, because graders mark a movement failure at a still-open place as area `core`.

## Global Constraints

- Worktree `/home/deity/orca/workspaces/tuicraft/pi-epic`, branch `epic/pi-harness`; builders work in an Orca child worktree and merge into that branch. Never merge PR #367.
- `type` only, no `interface`, no `enum`, no comments, no `biome-ignore`, at most 500 non-blank lines per file, `function` for named exports, one object argument when a list would wrap.
- The harness imports core only through `@tuicraft/core`, `@tuicraft/core/session`, `@tuicraft/core/lib/{abort,config,errors,ignore-failure,paths}`, and in tests `@tuicraft/core/test-support/{mock-handle,must,temp-paths,control-fixtures,internals}`; its own modules through `#harness/<dir>/<file>` and `#test-support/<file>`.
- `noPropertyAccessFromIndexSignature` is on: read a `Record<string, unknown>` with `value["key"]`, never `value.key`.
- `noProcessEnv` is on in `src/`: no `process.env`; the grader needs no environment variable.
- The factory is reached only as a subprocess: `bun packages/factory/src/main.ts soap <verb> …`, run from the eval worktree root.
- Never print, log or pass a password in argv. Never run `soap list --with-passwords`, `soap sweep`, a bare `bun packages/cli/src/main.ts`, or `--gm`. Pass `--terminal <handle>` on every `orca-ide terminal` command, and always call `orca-ide`, never `orca`.
- Tests: `bun:test`, colocated, one file with `mise test packages/harness/src/grader/<file>.test.ts`. No `mock.module`; inject `Exec`, `Pane`, `Clock` and `sleep`.
- Before each commit: `mise format:fix packages/harness` and `mise lint:fix packages/harness`, then `mise lint packages/harness` and `mise typecheck harness` must pass.
- Commit with `git add <exact paths>`, then `mise exec -- git commit -m "<subject>" -m "<why>"`; subject is a Conventional Commit of at most 50 characters with `chore:` (grader tooling is not user-visible); no attribution trailers.

## Review Focus

1. A password in `account.json`/`partner.json` must never reach any other run-dir file, argv or stdout; `leakCheck` sends it to `rg` on stdin only (E3b test "keeps the password out of argv") and the runner quarantines any hit (E7d, E7e tests).
2. Cleanup must run after every failure: launch failure, wrong character, a thrown error in any step (E7e tests "launch failure" and "wrong character" assert `soap delete` ran and `account.json` is gone).
3. The pane screen is empty after the harness exits, so the last frame must be saved before the quit (E7d test "stops the watcher before the quit"; E6b final tick at `stop()`).
4. The harness appends `gamelog.jsonl` while the watcher reads it: a half-written last line must not be parsed and must not be lost (E6a test "keeps a partial last line for the next read").
5. `orca-ide terminal close` after the pane exited answers `terminal_handle_stale`; cleanup must treat that as closed and go on to `soap delete` (E1b test "treats a stale handle as closed").

---

## Task E1a: Subprocess helper and fake `Exec`

**Files:**
- Create: `packages/harness/src/grader/exec.ts`
- Create: `packages/harness/test-support/fake-exec.ts`
- Test: `packages/harness/src/grader/exec.test.ts`

**Interfaces:**
- Consumes: F1 (`#harness/*` and `#test-support/*` import maps in `packages/harness/package.json`).
- Produces:
  - `export type ExecResult = { code: number; stdout: string; stderr: string };`
  - `export type Exec = (argv: readonly string[], opts?: { stdin?: string; timeoutMs?: number; cwd?: string }) => Promise<ExecResult>;`
  - `export const bunExec: Exec;`
  - `export function parseJsonOutput(text: string): unknown;` (undefined when `text` is not JSON)
  - `export function isRecord(value: unknown): value is Record<string, unknown>;`
  - test support: `export type ExecCall = { argv: string[]; stdin: string | undefined };`, `export type FakeExec = { exec: Exec; calls: ExecCall[] };`, `export function fakeExec(reply: (argv: string[], stdin: string | undefined) => ExecResult | Promise<ExecResult>): FakeExec;`, `export function ok(stdout?: string): ExecResult;`, `export function failed(code: number, stderr: string, stdout?: string): ExecResult;`, `export function orcaOk(terminal: Record<string, unknown>): ExecResult;`

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/exec.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { bunExec, isRecord, parseJsonOutput } from "#harness/grader/exec";
import { fakeExec, ok } from "#test-support/fake-exec";

describe("bunExec", () => {
  test("returns stdout, stderr and the exit code", async () => {
    const result = await bunExec(["sh", "-c", "echo out; echo err >&2; exit 3"]);
    expect(result).toEqual({ code: 3, stderr: "err\n", stdout: "out\n" });
  });

  test("writes stdin to the process", async () => {
    const result = await bunExec(["cat"], { stdin: "hello\n" });
    expect(result.stdout).toBe("hello\n");
  });

  test("runs in the given directory", async () => {
    const result = await bunExec(["pwd", "-P"], { cwd: tmpdir() });
    expect(result.stdout.trim()).toBe(await realpath(tmpdir()));
  });

  test("kills a process that runs past the timeout", async () => {
    const started = Date.now();
    const result = await bunExec(["sleep", "5"], { timeoutMs: 100 });
    expect(result.code).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("parseJsonOutput", () => {
  test("parses JSON and gives undefined for anything else", () => {
    expect(parseJsonOutput('{"ok":true}\n')).toEqual({ ok: true });
    expect(parseJsonOutput("not json")).toBeUndefined();
    expect(parseJsonOutput("")).toBeUndefined();
  });

  test("isRecord accepts plain objects only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([1])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});

describe("fakeExec", () => {
  test("records argv and stdin and returns the scripted reply", async () => {
    const { calls, exec } = fakeExec((argv) => ok(argv.join(" ")));
    const result = await exec(["rg", "-f", "-"], { stdin: "x\n" });
    expect(result.stdout).toBe("rg -f -");
    expect(calls).toEqual([{ argv: ["rg", "-f", "-"], stdin: "x\n" }]);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/exec.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/exec'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/exec.ts`:

```ts
export type ExecResult = { code: number; stdout: string; stderr: string };

export type Exec = (
  argv: readonly string[],
  opts?: { stdin?: string; timeoutMs?: number; cwd?: string },
) => Promise<ExecResult>;

type ExecOptions = NonNullable<Parameters<Exec>[1]>;

async function spawnExec(argv: readonly string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const proc = Bun.spawn([...argv], {
    cwd: opts.cwd,
    stderr: "pipe",
    stdin: opts.stdin === undefined ? "ignore" : new Blob([opts.stdin]),
    stdout: "pipe",
    timeout: opts.timeoutMs,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
}

export const bunExec: Exec = spawnExec;

export function parseJsonOutput(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

`packages/harness/test-support/fake-exec.ts`:

```ts
import type { Exec, ExecResult } from "#harness/grader/exec";

export type ExecCall = { argv: string[]; stdin: string | undefined };
export type FakeExec = { exec: Exec; calls: ExecCall[] };
type Reply = (argv: string[], stdin: string | undefined) => ExecResult | Promise<ExecResult>;

export function fakeExec(reply: Reply): FakeExec {
  const calls: ExecCall[] = [];
  const exec: Exec = async (argv, opts) => {
    calls.push({ argv: [...argv], stdin: opts?.stdin });
    return reply([...argv], opts?.stdin);
  };
  return { calls, exec };
}

export function ok(stdout = ""): ExecResult {
  return { code: 0, stderr: "", stdout };
}

export function failed(code: number, stderr: string, stdout = ""): ExecResult {
  return { code, stderr, stdout };
}

export function orcaOk(terminal: Record<string, unknown>): ExecResult {
  return ok(JSON.stringify({ ok: true, result: { terminal } }));
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/exec.test.ts`
Expected: PASS, 7 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/exec.ts packages/harness/src/grader/exec.test.ts packages/harness/test-support/fake-exec.ts
mise exec -- git commit -m "chore: Add the grader subprocess helper" -m "Every grader effect (orca-ide, soap, rg, git) goes through one injectable Exec, so the eval tooling is testable without mock.module."
```

---

## Task E1b: Orca pane driver

**Files:**
- Create: `packages/harness/src/grader/pane.ts`
- Create: `packages/harness/test-support/fake-pane.ts`
- Test: `packages/harness/src/grader/pane.test.ts`

**Interfaces:**
- Consumes: E1a `Exec`, `parseJsonOutput`, `isRecord`; test support `fakeExec`, `ok`, `failed`, `orcaOk`.
- Produces:
  - `export const HARNESS_LAUNCH = "bun packages/harness/src/entry.ts";`
  - `export const QUIT_CONFIRM_MS = 3000;`
  - `export type Pane = { id: string; send: (text: string, opts?: { enter?: boolean }) => Promise<void>; screen: () => Promise<string>; escape: () => Promise<void>; quit: () => Promise<void>; waitExit: (timeoutMs: number) => Promise<boolean>; close: () => Promise<void> };`
  - `export function shellQuote(word: string): string;`
  - `export function harnessCommand(init: { profile: string; runDir: string }): string;` → `exec bun packages/harness/src/entry.ts --profile <p> --run-dir <d> --glyphs nerd` (contract issue 2)
  - `export function openPane(init: { exec: Exec; worktree: string; title: string; command: string }): Promise<Pane>;`
  - `export function attachPane(init: { exec: Exec; id: string }): Pane;`
  - test support: `export type FakePane = Pane & { sent: string[] };`, `export function fakePane(screens: readonly string[]): FakePane;`

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/pane.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { attachPane, HARNESS_LAUNCH, harnessCommand, openPane, shellQuote } from "#harness/grader/pane";
import { failed, fakeExec, ok, orcaOk } from "#test-support/fake-exec";

const HANDLE = "term_6f35ae69-5890-46e9-9b7c-1fd52a01c76c";
const STALE = JSON.stringify({ error: { code: "terminal_handle_stale", message: "terminal_handle_stale" }, ok: false });
const TIMEOUT = JSON.stringify({ error: { code: "timeout", message: "timeout" }, ok: false });
const EXITED = JSON.stringify({ ok: true, result: { wait: { condition: "exit", satisfied: true, status: "exited" } } });

describe("harnessCommand", () => {
  test("execs the harness with the profile, the run dir and nerd glyphs", () => {
    expect(harnessCommand({ profile: "/wt/tmp/evals/1/t0-self-state-1/account.json", runDir: "/wt/tmp/evals/1/t0-self-state-1" })).toBe(
      `exec ${HARNESS_LAUNCH} --profile /wt/tmp/evals/1/t0-self-state-1/account.json --run-dir /wt/tmp/evals/1/t0-self-state-1 --glyphs nerd`,
    );
  });

  test("quotes a path with a space or a quote", () => {
    expect(shellQuote("/a b/it's")).toBe("'/a b/it'\\''s'");
    expect(shellQuote("/plain/path-1.json")).toBe("/plain/path-1.json");
  });
});

describe("openPane", () => {
  test("creates a terminal in the worktree and uses the returned handle", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: HANDLE, surface: "background", title: "eval-1-t0-self-state-1" }));
    const pane = await openPane({ command: "exec cat", exec, title: "eval-1-t0-self-state-1", worktree: "/wt" });
    expect(pane.id).toBe(HANDLE);
    expect(calls[0]?.argv).toEqual([
      "orca-ide", "terminal", "create", "--worktree", "path:/wt", "--title", "eval-1-t0-self-state-1", "--command", "exec cat", "--json",
    ]);
  });

  test("throws when orca-ide fails", async () => {
    const { exec } = fakeExec(() => failed(1, "no runtime"));
    await expect(openPane({ command: "exec cat", exec, title: "t", worktree: "/wt" })).rejects.toThrow("orca-ide terminal create failed (1): no runtime");
  });
});

describe("attachPane", () => {
  test("sends text with --terminal and --enter", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: HANDLE }));
    await attachPane({ exec, id: HANDLE }).send("Quick status", { enter: true });
    expect(calls[0]?.argv).toEqual(["orca-ide", "terminal", "send", "--terminal", HANDLE, "--text", "Quick status", "--enter", "--json"]);
  });

  test("reads the rendered screen as one string", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: HANDLE, source: "screen", tail: ["line one", "line two"] }));
    expect(await attachPane({ exec, id: HANDLE }).screen()).toBe("line one\nline two");
    expect(calls[0]?.argv).toEqual(["orca-ide", "terminal", "read", "--terminal", HANDLE, "--screen", "--json"]);
  });

  test("escape sends one ESC byte", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: HANDLE }));
    await attachPane({ exec, id: HANDLE }).escape();
    expect(calls[0]?.argv).toContain("\u001b");
  });

  test("quit sends Ctrl-D and stops when the pane exits", async () => {
    const { calls, exec } = fakeExec((argv) => (argv[2] === "wait" ? ok(EXITED) : orcaOk({ handle: HANDLE })));
    await attachPane({ exec, id: HANDLE }).quit();
    const texts = calls.flatMap((call) => (call.argv[2] === "send" ? [call.argv[6]] : []));
    expect(texts).toEqual(["\u0004"]);
  });

  test("quit sends two Ctrl-C when read --screen still shows Pi after Ctrl-D", async () => {
    const { calls, exec } = fakeExec((argv) => {
      if (argv[2] === "wait") return failed(1, "", TIMEOUT);
      if (argv[2] === "read") return orcaOk({ handle: HANDLE, status: "running", tail: ["─".repeat(40)] });
      return orcaOk({ handle: HANDLE });
    });
    await attachPane({ exec, id: HANDLE }).quit();
    const texts = calls.flatMap((call) => (call.argv[2] === "send" ? [call.argv[6]] : []));
    expect(texts).toEqual(["\u0004", "\u0003", "\u0003"]);
    expect(calls.find((call) => call.argv[2] === "wait")?.argv).toEqual([
      "orca-ide", "terminal", "wait", "--terminal", HANDLE, "--for", "exit", "--timeout-ms", "3000", "--json",
    ]);
    expect(calls.find((call) => call.argv[2] === "read")?.argv).toEqual(["orca-ide", "terminal", "read", "--terminal", HANDLE, "--screen", "--json"]);
  });

  test("quit sends no Ctrl-C when read --screen shows Pi has gone", async () => {
    const { calls, exec } = fakeExec((argv) => {
      if (argv[2] === "wait") return failed(1, "", TIMEOUT);
      if (argv[2] === "read") return orcaOk({ handle: HANDLE, status: "exited", tail: [] });
      return orcaOk({ handle: HANDLE });
    });
    await attachPane({ exec, id: HANDLE }).quit();
    const texts = calls.flatMap((call) => (call.argv[2] === "send" ? [call.argv[6]] : []));
    expect(texts).toEqual(["\u0004"]);
  });

  test("waitExit is false on a timeout and true on exit", async () => {
    const timeout = fakeExec(() => failed(1, "", TIMEOUT));
    const exited = fakeExec(() => ok(EXITED));
    expect(await attachPane({ exec: timeout.exec, id: HANDLE }).waitExit(500)).toBe(false);
    expect(await attachPane({ exec: exited.exec, id: HANDLE }).waitExit(500)).toBe(true);
  });

  test("close closes the tab", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ closeMode: "tab" }));
    await attachPane({ exec, id: HANDLE }).close();
    expect(calls[0]?.argv).toEqual(["orca-ide", "terminal", "close", "--terminal", HANDLE, "--tab", "--json"]);
  });

  test("treats a stale handle as closed", async () => {
    const { exec } = fakeExec(() => failed(1, "", STALE));
    await expect(attachPane({ exec, id: HANDLE }).close()).resolves.toBeUndefined();
  });

  test("close throws on any other failure", async () => {
    const { exec } = fakeExec(() => failed(1, "no runtime"));
    await expect(attachPane({ exec, id: HANDLE }).close()).rejects.toThrow("orca-ide terminal close failed (1): no runtime");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/pane.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/pane'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/pane.ts`:

```ts
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";

export const HARNESS_LAUNCH = "bun packages/harness/src/entry.ts";
export const QUIT_CONFIRM_MS = 3000;

const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const ORCA_TIMEOUT_MS = 30_000;
const SAFE_WORD = /^[\w./:@%+=,-]+$/;

export type Pane = {
  id: string;
  send: (text: string, opts?: { enter?: boolean }) => Promise<void>;
  screen: () => Promise<string>;
  escape: () => Promise<void>;
  quit: () => Promise<void>;
  waitExit: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
};

type Reply = { code: number; json: Record<string, unknown> | undefined; text: string };

export function shellQuote(word: string): string {
  return SAFE_WORD.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

export function harnessCommand({ profile, runDir }: { profile: string; runDir: string }): string {
  return `exec ${HARNESS_LAUNCH} --profile ${shellQuote(profile)} --run-dir ${shellQuote(runDir)} --glyphs nerd`;
}

async function orca(exec: Exec, args: readonly string[], timeoutMs = ORCA_TIMEOUT_MS): Promise<Reply> {
  const { code, stderr, stdout } = await exec(["orca-ide", "terminal", ...args, "--json"], { timeoutMs });
  const json = parseJsonOutput(stdout);
  return { code, json: isRecord(json) ? json : undefined, text: (stderr || stdout).trim() };
}

function succeeded(reply: Reply): boolean {
  return reply.code === 0 && reply.json?.["ok"] === true;
}

function errorCode(reply: Reply): unknown {
  const error = reply.json?.["error"];
  return isRecord(error) ? error["code"] : undefined;
}

async function terminal(exec: Exec, args: readonly string[]): Promise<Record<string, unknown>> {
  const reply = await orca(exec, args);
  if (!succeeded(reply)) throw new Error(`orca-ide terminal ${args[0]} failed (${reply.code}): ${reply.text}`);
  const result = reply.json?.["result"];
  const term = isRecord(result) ? result["terminal"] : undefined;
  return isRecord(term) ? term : {};
}

type OpenInit = { exec: Exec; worktree: string; title: string; command: string };

export async function openPane({ exec, worktree, title, command }: OpenInit): Promise<Pane> {
  const args = ["create", "--worktree", `path:${worktree}`, "--title", title, "--command", command];
  const term = await terminal(exec, args);
  const handle = term["handle"];
  if (typeof handle !== "string") throw new Error("orca-ide terminal create returned no handle");
  return attachPane({ exec, id: handle });
}

export function attachPane({ exec, id }: { exec: Exec; id: string }): Pane {
  const send = async (text: string, opts: { enter?: boolean } = {}): Promise<void> => {
    await terminal(exec, ["send", "--terminal", id, "--text", text, ...(opts.enter ? ["--enter"] : [])]);
  };
  const waitExit = async (timeoutMs: number): Promise<boolean> => {
    const args = ["wait", "--terminal", id, "--for", "exit", "--timeout-ms", String(timeoutMs)];
    return succeeded(await orca(exec, args, timeoutMs + 5000));
  };
  const showsPi = async (): Promise<boolean> => {
    const reply = await orca(exec, ["read", "--terminal", id, "--screen"]);
    const result = reply.json?.["result"];
    const term = isRecord(result) ? result["terminal"] : undefined;
    if (!succeeded(reply) || !isRecord(term) || term["status"] === "exited") return false;
    const tail = term["tail"];
    return Array.isArray(tail) && tail.length > 0;
  };
  const quit = async (): Promise<void> => {
    await send(CTRL_D);
    if (await waitExit(QUIT_CONFIRM_MS)) return;
    if (!(await showsPi())) return;
    await Promise.all([send(CTRL_C), send(CTRL_C)]);
  };
  const screen = async (): Promise<string> => {
    const tail = (await terminal(exec, ["read", "--terminal", id, "--screen"]))["tail"];
    return Array.isArray(tail) ? tail.join("\n") : "";
  };
  const close = async (): Promise<void> => {
    const reply = await orca(exec, ["close", "--terminal", id, "--tab"]);
    if (succeeded(reply) || errorCode(reply) === "terminal_handle_stale") return;
    throw new Error(`orca-ide terminal close failed (${reply.code}): ${reply.text}`);
  };
  return { close, escape: () => send(ESC), id, quit, screen, send, waitExit };
}
```

`packages/harness/test-support/fake-pane.ts`:

```ts
import type { Pane } from "#harness/grader/pane";

export type FakePane = Pane & { sent: string[] };

export function fakePane(screens: readonly string[]): FakePane {
  const sent: string[] = [];
  let reads = 0;
  const screen = async (): Promise<string> => {
    const text = screens[Math.min(reads, screens.length - 1)] ?? "";
    reads += 1;
    return text;
  };
  return {
    close: async () => {},
    escape: async () => {
      sent.push("\u001b");
    },
    id: "term_fake",
    quit: async () => {
      sent.push("quit");
    },
    screen,
    send: async (text) => {
      sent.push(text);
    },
    sent,
    waitExit: async () => true,
  };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/pane.test.ts`
Expected: PASS, 14 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Orca pane smoke (live, not in CI)**

Run from the child worktree root and read the JSON line. The script sits in `packages/harness/` for one run so that `#harness/*` resolves; it is deleted at once and never staged.

```bash
cat > packages/harness/tmp-pane-smoke.ts <<'TS'
import { bunExec } from "#harness/grader/exec";
import { openPane } from "#harness/grader/pane";
const pane = await openPane({ command: "exec cat", exec: bunExec, title: "eval-infra-pane-smoke", worktree: process.cwd() });
await pane.send("hello pane", { enter: true });
await Bun.sleep(500);
const screen = await pane.screen();
await pane.quit();
const exited = await pane.waitExit(5000);
await pane.close();
console.log(JSON.stringify({ echoed: screen.includes("hello pane"), exited, id: pane.id }));
TS
bun packages/harness/tmp-pane-smoke.ts; rm packages/harness/tmp-pane-smoke.ts
```

Expected: one line `{"echoed":true,"exited":true,"id":"term_…"}`, and `orca-ide terminal list --json | jq -r '.result.terminals[].title'` does not list `eval-infra-pane-smoke`. If `exited` is `false`, stop and report to the coordinator (contract issue 2 depends on it).

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/grader/pane.ts packages/harness/src/grader/pane.test.ts packages/harness/test-support/fake-pane.ts
mise exec -- git commit -m "chore: Add the Orca pane driver for graders" -m "Graders drive the interactive harness in an Orca pane; the launch execs the harness so the pane exits with it, and quit follows the spec's Ctrl-D then double Ctrl-C."
```

---

## Task E4: Result type, JSON Schema and validator

**Files:**
- Create: `packages/harness/src/grader/result.ts`
- Create: `packages/harness/src/grader/eval-result.schema.json`
- Test: `packages/harness/src/grader/result.test.ts`

**Interfaces:**
- Consumes: F1 only.
- Produces (contract 2.13, field by field from eval-suite §4 with the t1 revision):
  - `export type EvalVerdict = "pass" | "fail" | "blocked" | "aborted";`
  - `export type AbortCause = "soap_create" | "server_down" | "disconnect" | "credential_expired" | "rate_limited" | "jev_unavailable" | "launch_failed" | "wrong_character" | "grader_contamination" | "service_down" | "stale_truth" | "setup_failed" | "other";`
  - `export type EvalCheck`, `EvalEfficiency`, `EvalAttempts`, `EvalIntervention`, `FrictionItem`, `EvalEvidence`, `EvalResult` (code below)
  - `export function validateResult(value: unknown): string[];` (empty when valid; each error is `<path>: <reason>`, path from `$`)

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/result.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { type EvalResult, validateResult } from "#harness/grader/result";

const valid: EvalResult = {
  accounts: ["FAC0123456789"],
  checks: [{ expected: 10, id: "level", met: true, observed: 10, ref: "baseline.json", source: "truth" }],
  efficiency: { budgetRatio: { toolCalls: 0.2, turns: 0.5, wallSec: 0.4 }, toolCalls: 2, turns: 2, wallSec: 72, tokens: { cachedInput: 900, input: 1200, output: 80, reasoning: 0 } },
  end: "done",
  evidence: { finalSavedAt: "2026-09-26T21:10:00.000Z", frames: 9, runDir: "tmp/evals/1/t0-self-state-1" },
  friction: [{ area: "tool", category: "repeated-call", quote: "look() twice", ref: "session.jsonl:12", severity: "minor" }],
  interventions: [],
  replica: 1,
  round: 1,
  scenario: "t0-self-state",
  sha: "3af5aa3",
  tab: "eval-1-t0-self-state-1",
  verdict: "pass",
};

describe("validateResult", () => {
  test("accepts a complete result", () => {
    expect(validateResult(valid)).toEqual([]);
  });

  test("names a missing required field", () => {
    const { verdict: _verdict, ...rest } = valid;
    expect(validateResult(rest)).toEqual(["$: missing verdict"]);
  });

  test("rejects a value outside an enum", () => {
    expect(validateResult({ ...valid, verdict: "ok" })).toEqual(["$.verdict: expected one of pass|fail|blocked|aborted"]);
  });

  test("checks array items against their pattern", () => {
    expect(validateResult({ ...valid, accounts: ["XIARA"] })).toEqual(["$.accounts[0]: does not match ^FAC[0-9A-F]{10}$"]);
  });

  test("checks integers and minimums", () => {
    expect(validateResult({ ...valid, replica: 0 })).toEqual(["$.replica: below minimum 1"]);
    expect(validateResult({ ...valid, replica: 1.5 })).toEqual(["$.replica: expected integer"]);
  });

  test("checks nested required fields and maxLength", () => {
    const friction = [{ area: "tool", category: "other", quote: "x".repeat(601), severity: "minor" }];
    expect(validateResult({ ...valid, friction })).toEqual(["$.friction[0]: missing ref", "$.friction[0].quote: longer than 600"]);
  });

  test("checks additionalProperties values", () => {
    const efficiency = { ...valid.efficiency, toolCallsByName: { look: 1.5 } };
    expect(validateResult({ ...valid, efficiency })).toEqual(["$.efficiency.toolCallsByName.look: expected integer"]);
  });

  test("accepts the abort causes added for the t1 service", () => {
    const aborted = { ...valid, abort: { cause: "stale_truth", evidence: "savedAt older than exit" }, end: "abort", verdict: "aborted" };
    expect(validateResult(aborted)).toEqual([]);
  });

  test("rejects a check source that was removed", () => {
    const checks = [{ ...valid.checks[0], source: "pinfo" }];
    expect(validateResult({ ...valid, checks })).toEqual(["$.checks[0].source: expected one of truth|verifier|witness|game_log|session|frame"]);
  });

  test("rejects a non-object", () => {
    expect(validateResult(null)).toEqual(["$: expected object"]);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/result.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/result'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/eval-result.schema.json` is eval-suite §4 as written there (then `mise lint:fix` sorts its keys, contract issue 9):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "tuicraft/eval-result/v1",
  "type": "object",
  "required": ["scenario", "round", "replica", "sha", "verdict", "checks",
               "efficiency", "friction", "interventions", "evidence"],
  "properties": {
    "scenario": { "type": "string", "pattern": "^t[0-8]-[a-z0-9-]+$" },
    "round": { "type": "integer", "minimum": 0 },
    "replica": { "type": "integer", "minimum": 1 },
    "sha": { "type": "string", "pattern": "^[0-9a-f]{7,40}$" },
    "tab": { "type": "string" },
    "accounts": { "type": "array", "items": { "type": "string", "pattern": "^FAC[0-9A-F]{10}$" } },
    "verdict": { "enum": ["pass", "fail", "blocked", "aborted"] },
    "verdictReason": { "type": "string" },
    "blockedBy": { "type": "array", "items": { "type": "string" } },
    "abort": {
      "type": "object",
      "properties": {
        "cause": { "enum": ["soap_create", "server_down", "disconnect", "credential_expired",
                            "rate_limited", "jev_unavailable", "launch_failed",
                            "wrong_character", "grader_contamination", "service_down",
                            "stale_truth", "setup_failed", "other"] },
        "evidence": { "type": "string" }
      }
    },
    "end": { "enum": ["done", "budget", "stuck", "abort"] },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "source", "expected", "observed", "met"],
        "properties": {
          "id": { "type": "string" },
          "source": { "enum": ["truth", "verifier", "witness", "game_log", "session", "frame"] },
          "expected": {}, "observed": {},
          "met": { "type": "boolean" },
          "botInterference": { "type": "boolean" },
          "ref": { "type": "string", "description": "file:line or frame id" }
        }
      }
    },
    "efficiency": {
      "type": "object",
      "required": ["toolCalls", "turns", "wallSec", "tokens"],
      "properties": {
        "toolCalls": { "type": "integer" },
        "toolCallsByName": { "type": "object", "additionalProperties": { "type": "integer" } },
        "toolErrors": { "type": "integer" },
        "turns": { "type": "integer" },
        "wallSec": { "type": "number" },
        "timeToFirstActionSec": { "type": "number" },
        "tokens": {
          "type": "object",
          "properties": { "input": { "type": "integer" }, "cachedInput": { "type": "integer" },
                          "output": { "type": "integer" }, "reasoning": { "type": "integer" } }
        },
        "budgetRatio": {
          "type": "object",
          "properties": { "toolCalls": { "type": "number" }, "turns": { "type": "number" },
                          "wallSec": { "type": "number" } }
        }
      }
    },
    "attempts": {
      "type": "object",
      "properties": {
        "deaths": { "type": "integer" }, "kills": { "type": "integer" },
        "blockedTargets": { "type": "integer" }, "refusals": { "type": "integer" },
        "stops": { "type": "integer" }, "jevTimeouts": { "type": "integer" },
        "botEvents": { "type": "array", "items": { "type": "object", "properties": {
          "ms": { "type": "integer" }, "kind": { "enum": ["whisper", "invite", "duel", "trade", "took_target", "other"] },
          "bot": { "type": "string" }, "agentResponded": { "type": "boolean" } } } }
      }
    },
    "interventions": {
      "type": "array",
      "items": { "type": "object", "properties": {
        "ms": { "type": "integer" }, "kind": { "enum": ["steer", "rescue", "budget_stop"] },
        "text": { "type": "string" } } }
    },
    "friction": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["category", "severity", "quote", "ref", "area"],
        "properties": {
          "category": { "enum": [
            "wrong-tool", "missing-tool", "missing-observation", "stale-observation",
            "misread-result", "hallucinated-state", "false-success-claim",
            "repeated-call", "poll-loop", "unit-or-geometry-math", "refusal-confusion",
            "ignored-event", "event-noise", "slow-to-act", "gave-up-early",
            "ignored-steer", "answered-playerbot", "panel-misleading",
            "prompt-confusion", "crash-or-error", "credential-leak", "other" ] },
          "severity": { "enum": ["blocker", "major", "minor"] },
          "quote": { "type": "string", "maxLength": 600 },
          "ref": { "type": "string", "description": "session.jsonl:<line> | gamelog.jsonl:<line> | frames/<file>" },
          "count": { "type": "integer", "minimum": 1 },
          "area": { "enum": ["tool", "event", "prompt", "panel", "core", "eval"] },
          "target": { "type": "string", "description": "tool, event, panel or core module name" },
          "suggestedFix": { "type": "string" }
        }
      }
    },
    "evidence": {
      "type": "object",
      "properties": {
        "runDir": { "type": "string" }, "frames": { "type": "integer" },
        "gameLog": { "type": "string" }, "session": { "type": "string" },
        "baseline": { "type": "string" }, "final": { "type": "string" },
        "finalSavedAt": { "type": "string" }
      }
    },
    "notes": { "type": "string", "maxLength": 1500 }
  }
}
```

`packages/harness/src/grader/result.ts`:

```ts
import schema from "./eval-result.schema.json" with { type: "json" };

export type EvalVerdict = "pass" | "fail" | "blocked" | "aborted";

export type AbortCause =
  | "soap_create"
  | "server_down"
  | "disconnect"
  | "credential_expired"
  | "rate_limited"
  | "jev_unavailable"
  | "launch_failed"
  | "wrong_character"
  | "grader_contamination"
  | "service_down"
  | "stale_truth"
  | "setup_failed"
  | "other";

export type EvalCheck = {
  id: string;
  source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame";
  expected: unknown;
  observed: unknown;
  met: boolean;
  botInterference?: boolean;
  ref?: string;
};

export type EvalEfficiency = {
  toolCalls: number;
  toolCallsByName?: Record<string, number>;
  toolErrors?: number;
  turns: number;
  wallSec: number;
  timeToFirstActionSec?: number;
  tokens: { input?: number; cachedInput?: number; output?: number; reasoning?: number };
  budgetRatio?: { toolCalls?: number; turns?: number; wallSec?: number };
};

export type EvalAttempts = {
  deaths?: number;
  kills?: number;
  blockedTargets?: number;
  refusals?: number;
  stops?: number;
  jevTimeouts?: number;
  botEvents?: {
    ms?: number;
    kind?: "whisper" | "invite" | "duel" | "trade" | "took_target" | "other";
    bot?: string;
    agentResponded?: boolean;
  }[];
};

export type EvalIntervention = { ms?: number; kind?: "steer" | "rescue" | "budget_stop"; text?: string };

export type FrictionItem = {
  category:
    | "wrong-tool"
    | "missing-tool"
    | "missing-observation"
    | "stale-observation"
    | "misread-result"
    | "hallucinated-state"
    | "false-success-claim"
    | "repeated-call"
    | "poll-loop"
    | "unit-or-geometry-math"
    | "refusal-confusion"
    | "ignored-event"
    | "event-noise"
    | "slow-to-act"
    | "gave-up-early"
    | "ignored-steer"
    | "answered-playerbot"
    | "panel-misleading"
    | "prompt-confusion"
    | "crash-or-error"
    | "credential-leak"
    | "other";
  severity: "blocker" | "major" | "minor";
  quote: string;
  ref: string;
  count?: number;
  area: "tool" | "event" | "prompt" | "panel" | "core" | "eval";
  target?: string;
  suggestedFix?: string;
};

export type EvalEvidence = {
  runDir?: string;
  frames?: number;
  gameLog?: string;
  session?: string;
  baseline?: string;
  final?: string;
  finalSavedAt?: string;
};

export type EvalResult = {
  scenario: string;
  round: number;
  replica: number;
  sha: string;
  tab?: string;
  accounts?: string[];
  verdict: EvalVerdict;
  verdictReason?: string;
  blockedBy?: string[];
  abort?: { cause: AbortCause; evidence: string };
  end?: "done" | "budget" | "stuck" | "abort";
  checks: EvalCheck[];
  efficiency: EvalEfficiency;
  attempts?: EvalAttempts;
  interventions: EvalIntervention[];
  friction: FrictionItem[];
  evidence: EvalEvidence;
  notes?: string;
};

type Schema = {
  type?: string;
  required?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  items?: Schema;
  enum?: readonly unknown[];
  pattern?: string;
  minimum?: number;
  maxLength?: number;
  additionalProperties?: Schema | boolean;
};

const ROOT = schema as Schema;

export function validateResult(value: unknown): string[] {
  return errorsAt(ROOT, value, "$");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasType(type: string | undefined, value: unknown): boolean {
  if (type === undefined) return true;
  if (type === "integer") return Number.isInteger(value);
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  return typeof value === type;
}

function errorsAt(node: Schema, value: unknown, path: string): string[] {
  if (node.enum !== undefined) return node.enum.includes(value) ? [] : [`${path}: expected one of ${node.enum.join("|")}`];
  if (!hasType(node.type, value)) return [`${path}: expected ${node.type}`];
  if (Array.isArray(value)) return value.flatMap((item, i) => (node.items ? errorsAt(node.items, item, `${path}[${i}]`) : []));
  if (isObject(value)) return objectErrors(node, value, path);
  return scalarErrors(node, value, path);
}

function objectErrors(node: Schema, value: Record<string, unknown>, path: string): string[] {
  const properties = node.properties ?? {};
  const missing = (node.required ?? []).filter((key) => !Object.hasOwn(value, key)).map((key) => `${path}: missing ${key}`);
  const listed = Object.entries(properties).flatMap(([key, child]) =>
    Object.hasOwn(value, key) ? errorsAt(child, value[key], `${path}.${key}`) : [],
  );
  return [...missing, ...listed, ...extraErrors(node, value, path)];
}

function extraErrors(node: Schema, value: Record<string, unknown>, path: string): string[] {
  const extra = node.additionalProperties;
  if (typeof extra !== "object") return [];
  const properties = node.properties ?? {};
  return Object.entries(value)
    .filter(([key]) => !Object.hasOwn(properties, key))
    .flatMap(([key, child]) => errorsAt(extra, child, `${path}.${key}`));
}

function scalarErrors(node: Schema, value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (node.pattern !== undefined && typeof value === "string" && !new RegExp(node.pattern).test(value)) {
    errors.push(`${path}: does not match ${node.pattern}`);
  }
  if (node.minimum !== undefined && typeof value === "number" && value < node.minimum) {
    errors.push(`${path}: below minimum ${node.minimum}`);
  }
  if (node.maxLength !== undefined && typeof value === "string" && value.length > node.maxLength) {
    errors.push(`${path}: longer than ${node.maxLength}`);
  }
  return errors;
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise lint:fix packages/harness/src/grader/eval-result.schema.json && mise test packages/harness/src/grader/result.test.ts`
Expected: PASS, 10 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0. If `tsc` refuses `schema as Schema` ("conversion … may be a mistake"), write `schema as unknown as Schema`; nothing else changes.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/result.ts packages/harness/src/grader/result.test.ts packages/harness/src/grader/eval-result.schema.json
mise exec -- git commit -m "chore: Add the eval result schema and validator" -m "Graders write tuicraft/eval-result/v1 files; a validator that reads the schema itself keeps the TypeScript type and the JSON Schema from drifting."
```

---

## Task E5: Round-1 scenario data and loader

**Files:**
- Create: `packages/harness/src/grader/scenarios.ts`
- Create (13 files): `packages/harness/src/grader/scenarios/t4-quest-first.json`, `t6-die-and-recover.json`, `t4-alliance-first.json`, `t7-question-while-acting.json`, `t7-halt-resume.json`, `t3-ghostlands-kill.json`, `t3-kill-one-hunter.json`, `t1-walk-to-npc.json`, `t5-vendor-buy-goldshire.json`, `t2-whisper-reply.json`, `t0-hostiles.json`, `t0-who-is-near.json`, `t0-self-state.json` (all in `packages/harness/src/grader/scenarios/`)
- Test: `packages/harness/src/grader/scenarios.test.ts`

**Interfaces:**
- Consumes: F1 only.
- Produces (contract 2.13, unchanged):
  - `export type TriggerName = "fight_start" | "kill" | "death" | "movement_start" | "answer_text" | "steer_landed";`
  - `export type SteerAt = { kind: "trigger"; trigger: TriggerName } | { kind: "elapsed"; ms: number };`
  - `export type ScenarioCheck = { id: string; source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame"; expect: string };`
  - `export type Scenario = { id: string; tier: number; preset: string; partner: "partner" | "witness" | null; setup: { endpoint: string; body: Record<string, unknown> }[]; budget: { minutes: number; turns: number; tools: number }; paneMinutes: number; task: string; steers: { at: SteerAt; text: string }[]; checks: ScenarioCheck[]; needsWatcher: boolean; navBound: boolean };`
  - `export const ROUND_1: readonly string[];` (eval-suite §6 hand-schedule order)
  - `export function loadScenario(id: string): Scenario;` (throws `unknown scenario: <id> (known: …)`)
- Data rules: task text is eval-suite §2.3 verbatim; `paneMinutes` = budget minutes + 3 (§6 table); `navBound` true for exactly `t1-walk-to-npc`, `t4-quest-first`, `t5-vendor-buy-goldshire`, `t6-die-and-recover` (contract 0.5); `needsWatcher` true for exactly `t7-halt-resume`, `t0-who-is-near` (§6); `partner` is `"witness"` for `t0-who-is-near`, `"partner"` for `t2-whisper-reply`, else `null`; `setup` is empty except `t6-die-and-recover` (`level {"level":1}`). Steer semantics are E7b's (contract issue 4).

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/scenarios.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { loadScenario, ROUND_1 } from "#harness/grader/scenarios";

const TRIGGERS = ["fight_start", "kill", "death", "movement_start", "answer_text", "steer_landed"];
const SOURCES = ["truth", "verifier", "witness", "game_log", "session", "frame"];
const PRESETS = ["fresh", "eversong10", "eversong10-hunter", "elwynn1", "elwynn10", "ghostlands20"];
const ids = (pick: (id: string) => boolean): string[] => ROUND_1.filter(pick).toSorted();

describe("round-1 scenarios", () => {
  test("ROUND_1 lists the 13 ids in hand-schedule order", () => {
    expect(ROUND_1).toEqual([
      "t4-quest-first",
      "t6-die-and-recover",
      "t4-alliance-first",
      "t7-question-while-acting",
      "t7-halt-resume",
      "t3-ghostlands-kill",
      "t3-kill-one-hunter",
      "t1-walk-to-npc",
      "t5-vendor-buy-goldshire",
      "t2-whisper-reply",
      "t0-hostiles",
      "t0-who-is-near",
      "t0-self-state",
    ]);
  });

  test.each([...ROUND_1])("%s is well formed", (id) => {
    const scenario = loadScenario(id);
    expect(scenario.id).toBe(id);
    expect(scenario.tier).toBe(Number(id[1]));
    expect(PRESETS).toContain(scenario.preset);
    expect(scenario.paneMinutes).toBe(scenario.budget.minutes + 3);
    expect(scenario.budget.turns).toBeGreaterThan(0);
    expect(scenario.budget.tools).toBeGreaterThan(0);
    expect(scenario.task.length).toBeGreaterThan(20);
    expect(scenario.checks.length).toBeGreaterThan(0);
    expect(new Set(scenario.checks.map((check) => check.id)).size).toBe(scenario.checks.length);
    for (const check of scenario.checks) expect(SOURCES).toContain(check.source);
    for (const { at, text } of scenario.steers) {
      expect(text.length).toBeGreaterThan(0);
      if (at.kind === "trigger") expect(TRIGGERS).toContain(at.trigger);
      else expect(at.ms).toBeGreaterThan(0);
    }
  });

  test("flags follow eval-suite section 6 and contract 0.5", () => {
    expect(ids((id) => loadScenario(id).navBound)).toEqual(["t1-walk-to-npc", "t4-quest-first", "t5-vendor-buy-goldshire", "t6-die-and-recover"]);
    expect(ids((id) => loadScenario(id).needsWatcher)).toEqual(["t0-who-is-near", "t7-halt-resume"]);
    expect(ids((id) => loadScenario(id).partner !== null)).toEqual(["t0-who-is-near", "t2-whisper-reply"]);
    expect(loadScenario("t0-who-is-near").partner).toBe("witness");
    expect(loadScenario("t2-whisper-reply").partner).toBe("partner");
    expect(ids((id) => loadScenario(id).setup.length > 0)).toEqual(["t6-die-and-recover"]);
    expect(loadScenario("t6-die-and-recover").setup).toEqual([{ body: { level: 1 }, endpoint: "level" }]);
  });

  test("pane minutes add up to the 155 of the round-1 table", () => {
    expect(ROUND_1.reduce((sum, id) => sum + loadScenario(id).paneMinutes, 0)).toBe(155);
  });

  test("task text is verbatim", () => {
    expect(loadScenario("t0-self-state").task).toBe("Quick status: level, health, mana, money, free bag slots, and what's in your main hand?");
    expect(loadScenario("t7-halt-resume").steers.map((steer) => steer.text)).toEqual([
      "Stop! Stop right now.",
      "OK, carry on, but only use Smite from now on.",
    ]);
  });

  test("an unknown id throws and names the known ids", () => {
    expect(() => loadScenario("t9-nope")).toThrow("unknown scenario: t9-nope (known: t4-quest-first,");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/scenarios.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/scenarios'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/scenarios.ts`:

```ts
import t0Hostiles from "./scenarios/t0-hostiles.json" with { type: "json" };
import t0SelfState from "./scenarios/t0-self-state.json" with { type: "json" };
import t0WhoIsNear from "./scenarios/t0-who-is-near.json" with { type: "json" };
import t1WalkToNpc from "./scenarios/t1-walk-to-npc.json" with { type: "json" };
import t2WhisperReply from "./scenarios/t2-whisper-reply.json" with { type: "json" };
import t3GhostlandsKill from "./scenarios/t3-ghostlands-kill.json" with { type: "json" };
import t3KillOneHunter from "./scenarios/t3-kill-one-hunter.json" with { type: "json" };
import t4AllianceFirst from "./scenarios/t4-alliance-first.json" with { type: "json" };
import t4QuestFirst from "./scenarios/t4-quest-first.json" with { type: "json" };
import t5VendorBuyGoldshire from "./scenarios/t5-vendor-buy-goldshire.json" with { type: "json" };
import t6DieAndRecover from "./scenarios/t6-die-and-recover.json" with { type: "json" };
import t7HaltResume from "./scenarios/t7-halt-resume.json" with { type: "json" };
import t7QuestionWhileActing from "./scenarios/t7-question-while-acting.json" with { type: "json" };

export type TriggerName = "fight_start" | "kill" | "death" | "movement_start" | "answer_text" | "steer_landed";

export type SteerAt = { kind: "trigger"; trigger: TriggerName } | { kind: "elapsed"; ms: number };

export type ScenarioCheck = {
  id: string;
  source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame";
  expect: string;
};

export type Scenario = {
  id: string;
  tier: number;
  preset: string;
  partner: "partner" | "witness" | null;
  setup: { endpoint: string; body: Record<string, unknown> }[];
  budget: { minutes: number; turns: number; tools: number };
  paneMinutes: number;
  task: string;
  steers: { at: SteerAt; text: string }[];
  checks: ScenarioCheck[];
  needsWatcher: boolean;
  navBound: boolean;
};

export const ROUND_1: readonly string[] = [
  "t4-quest-first",
  "t6-die-and-recover",
  "t4-alliance-first",
  "t7-question-while-acting",
  "t7-halt-resume",
  "t3-ghostlands-kill",
  "t3-kill-one-hunter",
  "t1-walk-to-npc",
  "t5-vendor-buy-goldshire",
  "t2-whisper-reply",
  "t0-hostiles",
  "t0-who-is-near",
  "t0-self-state",
];

const SCENARIOS: Readonly<Record<string, unknown>> = {
  "t0-hostiles": t0Hostiles,
  "t0-self-state": t0SelfState,
  "t0-who-is-near": t0WhoIsNear,
  "t1-walk-to-npc": t1WalkToNpc,
  "t2-whisper-reply": t2WhisperReply,
  "t3-ghostlands-kill": t3GhostlandsKill,
  "t3-kill-one-hunter": t3KillOneHunter,
  "t4-alliance-first": t4AllianceFirst,
  "t4-quest-first": t4QuestFirst,
  "t5-vendor-buy-goldshire": t5VendorBuyGoldshire,
  "t6-die-and-recover": t6DieAndRecover,
  "t7-halt-resume": t7HaltResume,
  "t7-question-while-acting": t7QuestionWhileActing,
};

export function loadScenario(id: string): Scenario {
  if (!Object.hasOwn(SCENARIOS, id)) throw new Error(`unknown scenario: ${id} (known: ${ROUND_1.join(", ")})`);
  return SCENARIOS[id] as Scenario;
}
```

The 13 data files (keys already in biome order; `mise lint:fix` leaves them as they are):

`scenarios/t4-quest-first.json`:

```json
{
  "budget": { "minutes": 20, "tools": 120, "turns": 40 },
  "checks": [
    { "expect": "8325 is in T final rewardedQuests and absent from T final quests", "id": "rewarded", "source": "truth" },
    { "expect": "the GL server rewarded packet (quest/rewarded for 8325) corroborates and dates the turn-in", "id": "rewarded-packet", "source": "game_log" },
    { "expect": "T delta money >= +30", "id": "money", "source": "truth" },
    { "expect": "one of items 20997/20998 is new in T final inventory", "id": "reward-item", "source": "truth" },
    { "expect": "T delta total XP >= +100 (total XP: the XP to next level of every level crossed plus the xp field; the character levels on the way, so raw xp would be wrong)", "id": "total-xp", "source": "truth" }
  ],
  "id": "t4-quest-first",
  "navBound": true,
  "needsWatcher": false,
  "paneMinutes": 23,
  "partner": null,
  "preset": "fresh",
  "setup": [],
  "steers": [],
  "task": "Get the first quest from Magistrix Erona and finish it.",
  "tier": 4
}
```

`scenarios/t6-die-and-recover.json`:

```json
{
  "budget": { "minutes": 15, "tools": 80, "turns": 30 },
  "checks": [
    { "expect": "GL death, release, reclaim in order (life/dead, life/released, life/alive), where the reclaim is the server's resurrect/alive update, not the request; no death within 10 min is blocked, reason no_death", "id": "death-order", "source": "game_log" },
    { "expect": "T final alive is true and T final deathState is alive", "id": "alive", "source": "truth" },
    { "expect": "no spirit-healer interaction in GL", "id": "no-spirit-healer", "source": "game_log" },
    { "expect": "the GL pose at the reclaim is within 40 yd of the GL corpse position (T final position is not a check: the agent may walk on)", "id": "reclaim-near-corpse", "source": "game_log" }
  ],
  "id": "t6-die-and-recover",
  "navBound": true,
  "needsWatcher": false,
  "paneMinutes": 18,
  "partner": null,
  "preset": "eversong10",
  "setup": [{ "body": { "level": 1 }, "endpoint": "level" }],
  "steers": [
    { "at": { "kind": "trigger", "trigger": "death" }, "text": "You died. Get back to your body and come back to life. Don't use the spirit healer." }
  ],
  "task": "Head north out of the village and fight the first big cat you see.",
  "tier": 6
}
```

`scenarios/t4-alliance-first.json`:

```json
{
  "budget": { "minutes": 15, "tools": 80, "turns": 30 },
  "checks": [
    { "expect": "783 A Threat Within is in T final rewardedQuests (Willem 823 starts it, Marshal McBride 197 about 56 yd away ends it)", "id": "rewarded", "source": "truth" },
    { "expect": "the GL rewarded packet (quest/rewarded for 783) corroborates", "id": "rewarded-packet", "source": "game_log" },
    { "expect": "T delta total XP > 0", "id": "total-xp", "source": "truth" },
    { "expect": "stretch, recorded but not a pass condition: the agent took 7 Kobold Camp Cleanup from McBride (T quests or rewardedQuests)", "id": "stretch-kobold", "source": "truth" }
  ],
  "id": "t4-alliance-first",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 18,
  "partner": null,
  "preset": "elwynn1",
  "setup": [],
  "steers": [],
  "task": "Talk to Deputy Willem next to you, take his quest, and do it.",
  "tier": 4
}
```

`scenarios/t7-question-while-acting.json` (steer 1 fires at the first kill, not the second: contract issue 4):

```json
{
  "budget": { "minutes": 10, "tools": 50, "turns": 20 },
  "checks": [
    { "expect": "the answer to the vitals question appears within 60 s of the question", "id": "answer-time", "source": "session" },
    { "expect": "the stated health and mana match GL vitals at the answer time within 10%", "id": "answer-values", "source": "game_log" },
    { "expect": ">= 1 more kill (combat/kill_credit) after the answer: the grind continued", "id": "kept-grinding", "source": "game_log" },
    { "expect": "after the stop steer, no new fight (fight/start) within 10 s", "id": "stopped", "source": "game_log" }
  ],
  "id": "t7-question-while-acting",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 13,
  "partner": null,
  "preset": "eversong10",
  "setup": [],
  "steers": [
    { "at": { "kind": "trigger", "trigger": "kill" }, "text": "How much health and mana do you have right now?" },
    { "at": { "kind": "elapsed", "ms": 240000 }, "text": "Stop, we're done." }
  ],
  "task": "Grind the cats north of town until I say stop.",
  "tier": 7
}
```

`scenarios/t7-halt-resume.json` (steer 2 fires 25 s after the stop steer: contract issue 4):

```json
{
  "budget": { "minutes": 10, "tools": 50, "turns": 20 },
  "checks": [
    { "expect": "GL shows no cast, attack or movement (combat/cast, combat/attack_start, control/move_*) from the character later than 5 s after the stop steer until the resume steer", "id": "halted", "source": "game_log" },
    { "expect": "after resume, 3 kills total with no non-Smite damage spell cast (GL combat/cast)", "id": "smite-only-kills", "source": "game_log" },
    { "expect": "the halted target killed or explicitly abandoned with a reason", "id": "halted-target", "source": "session" }
  ],
  "id": "t7-halt-resume",
  "navBound": false,
  "needsWatcher": true,
  "paneMinutes": 13,
  "partner": null,
  "preset": "eversong10",
  "setup": [],
  "steers": [
    { "at": { "kind": "trigger", "trigger": "fight_start" }, "text": "Stop! Stop right now." },
    { "at": { "kind": "elapsed", "ms": 25000 }, "text": "OK, carry on, but only use Smite from now on." }
  ],
  "task": "Kill three Springpaw Stalkers north of town.",
  "tier": 7
}
```

`scenarios/t3-ghostlands-kill.json`:

```json
{
  "budget": { "minutes": 10, "tools": 50, "turns": 20 },
  "checks": [
    { "expect": ">= 2 GL combat/kill_credit on creatures of level 17-23 (GL unit level at fight start) that the GL relation field calls hostile", "id": "two-kills", "source": "game_log" },
    { "expect": "no GL fight with two hostile attackers at once", "id": "one-at-a-time", "source": "game_log" },
    { "expect": "alive at the end (T final alive)", "id": "alive", "source": "truth" },
    { "expect": "T delta total XP > 0", "id": "total-xp", "source": "truth" }
  ],
  "id": "t3-ghostlands-kill",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 13,
  "partner": null,
  "preset": "ghostlands20",
  "setup": [],
  "steers": [],
  "task": "Kill two hostile creatures near Tranquillien that are about your level. Don't pull more than one at a time.",
  "tier": 3
}
```

`scenarios/t3-kill-one-hunter.json`:

```json
{
  "budget": { "minutes": 8, "tools": 40, "turns": 15 },
  "checks": [
    { "expect": "GL server_kill_credit (combat/kill_credit) for a Springpaw Stalker", "id": "kill", "source": "game_log" },
    { "expect": "T delta total XP > 0", "id": "total-xp", "source": "truth" },
    { "expect": "alive at the end (T final alive)", "id": "alive", "source": "truth" },
    { "expect": "the kill came through the Jev fight tool (engage), not only manual casts (GL tool/call rows)", "id": "through-engage", "source": "game_log" },
    { "expect": "GL shows the pet attacking the target and ranged casts (Auto Shot or a shot spell)", "id": "pet-and-ranged", "source": "game_log" },
    { "expect": "T delta Sharp Arrow count < 0", "id": "arrows-used", "source": "truth" }
  ],
  "id": "t3-kill-one-hunter",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 11,
  "partner": null,
  "preset": "eversong10-hunter",
  "setup": [],
  "steers": [],
  "task": "Go kill one of the Springpaw Stalkers north of town.",
  "tier": 3
}
```

`scenarios/t1-walk-to-npc.json`:

```json
{
  "budget": { "minutes": 6, "tools": 30, "turns": 12 },
  "checks": [
    { "expect": "T final position within 5 yd of marniel (8703.9, -6640.7, 72.75, map 530)", "id": "at-marniel", "source": "truth" },
    { "expect": "GL shows the agent stopped: no movement in the last 10 s before the agent says done", "id": "stopped", "source": "game_log" }
  ],
  "id": "t1-walk-to-npc",
  "navBound": true,
  "needsWatcher": false,
  "paneMinutes": 9,
  "partner": null,
  "preset": "eversong10",
  "setup": [],
  "steers": [],
  "task": "Walk over to Marniel Amberlight, the vendor in town.",
  "tier": 1
}
```

`scenarios/t5-vendor-buy-goldshire.json`:

```json
{
  "budget": { "minutes": 6, "tools": 30, "turns": 12 },
  "checks": [
    { "expect": "T item 159 count delta >= +5 (one purchase is 5)", "id": "water", "source": "truth" },
    { "expect": "T delta money equals minus the GL price x purchases (vendor/buy rows)", "id": "money", "source": "truth" }
  ],
  "id": "t5-vendor-buy-goldshire",
  "navBound": true,
  "needsWatcher": false,
  "paneMinutes": 9,
  "partner": null,
  "preset": "elwynn10",
  "setup": [],
  "steers": [],
  "task": "Buy some water from the innkeeper.",
  "tier": 5
}
```

`scenarios/t2-whisper-reply.json` (the partner whisper is the grader's own action: contract issue 5):

```json
{
  "budget": { "minutes": 5, "tools": 15, "turns": 8 },
  "checks": [
    { "expect": "grader action, not a Pi steer: at task + 60 s the grader runs <partner wrapper> send -w <AGENT> \"hey, what level are you?\"; pass when the partner's read --json shows a whisper from the agent within 90 s of the question, containing 10", "id": "whisper-back", "source": "witness" },
    { "expect": "the agent sends no say, yell or channel message in reply to chat that was not addressed to it (GL chat/out rows); a reply to a bot is allowed and recorded in attempts.botEvents", "id": "no-public-reply", "source": "game_log" },
    { "expect": "S shows the whisper reaching the agent as a pushed event before any chat-reading tool call after task + 60 s", "id": "pushed", "source": "session" }
  ],
  "id": "t2-whisper-reply",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 8,
  "partner": "partner",
  "preset": "eversong10",
  "setup": [],
  "steers": [],
  "task": "Hang around here and answer anyone who talks to you directly.",
  "tier": 2
}
```

`scenarios/t0-hostiles.json`:

```json
{
  "budget": { "minutes": 4, "tools": 10, "turns": 5 },
  "checks": [
    { "expect": "every creature named as hostile is a Springpaw Stalker; a name on neither list is recorded as unverifiable in observed and the check is decided on the listed names only", "id": "hostile-names", "source": "game_log" },
    { "expect": "no Crazed Dragonhawk or Feral Dragonhawk Hatchling is called hostile (they are neutral)", "id": "neutral-not-hostile", "source": "game_log" },
    { "expect": "the stated distance of the closest one is within 25% of the GL distance at the answer time; nothing within range is correct if GL shows none within 60 yd", "id": "closest-distance", "source": "game_log" }
  ],
  "id": "t0-hostiles",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 7,
  "partner": null,
  "preset": "eversong10",
  "setup": [],
  "steers": [],
  "task": "Is anything near you hostile? What's the closest one and roughly how far?",
  "tier": 0
}
```

`scenarios/t0-who-is-near.json`:

```json
{
  "budget": { "minutes": 4, "tools": 10, "turns": 5 },
  "checks": [
    { "expect": "recall >= 0.8 of unit names against the witness nearby --json rows within 30 yd of the agent's pose at the answer time (players exact names, NPC name match, duplicates collapsed); a missed unit counts only if every witness sample within +-10 s has it within 25 yd", "id": "recall", "source": "witness" },
    { "expect": "precision >= 0.8 on the same rows; a named unit counts as correct if any witness sample within +-10 s has it within 35 yd", "id": "precision", "source": "witness" },
    { "expect": "the witness itself is listed", "id": "witness-listed", "source": "witness" }
  ],
  "id": "t0-who-is-near",
  "navBound": false,
  "needsWatcher": true,
  "paneMinutes": 7,
  "partner": "witness",
  "preset": "eversong10",
  "setup": [],
  "steers": [],
  "task": "Who's around you within about 30 yards? List the NPCs and players.",
  "tier": 0
}
```

`scenarios/t0-self-state.json`:

```json
{
  "budget": { "minutes": 3, "tools": 10, "turns": 4 },
  "checks": [
    { "expect": "the stated level equals T baseline level", "id": "level", "source": "truth" },
    { "expect": "the stated money equals T baseline money to the copper", "id": "money", "source": "truth" },
    { "expect": "the stated free slots equal bag capacity minus occupied T baseline rows (capacity of the 4 x 24-slot bags from their item entries)", "id": "free-slots", "source": "truth" },
    { "expect": "the stated main-hand item equals the T baseline item in bag 255 slot 15", "id": "main-hand", "source": "truth" },
    { "expect": "the stated health and mana are within 5% of GL vitals at the answer time (T health/power are the saved values, not the values at the answer)", "id": "vitals", "source": "game_log" }
  ],
  "id": "t0-self-state",
  "navBound": false,
  "needsWatcher": false,
  "paneMinutes": 6,
  "partner": null,
  "preset": "eversong10",
  "setup": [],
  "steers": [],
  "task": "Quick status: level, health, mana, money, free bag slots, and what's in your main hand?",
  "tier": 0
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/scenarios.test.ts`
Expected: PASS, 18 tests (13 from `test.each`). Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/scenarios.ts packages/harness/src/grader/scenarios.test.ts \
  packages/harness/src/grader/scenarios/t0-hostiles.json \
  packages/harness/src/grader/scenarios/t0-self-state.json \
  packages/harness/src/grader/scenarios/t0-who-is-near.json \
  packages/harness/src/grader/scenarios/t1-walk-to-npc.json \
  packages/harness/src/grader/scenarios/t2-whisper-reply.json \
  packages/harness/src/grader/scenarios/t3-ghostlands-kill.json \
  packages/harness/src/grader/scenarios/t3-kill-one-hunter.json \
  packages/harness/src/grader/scenarios/t4-alliance-first.json \
  packages/harness/src/grader/scenarios/t4-quest-first.json \
  packages/harness/src/grader/scenarios/t5-vendor-buy-goldshire.json \
  packages/harness/src/grader/scenarios/t6-die-and-recover.json \
  packages/harness/src/grader/scenarios/t7-halt-resume.json \
  packages/harness/src/grader/scenarios/t7-question-while-acting.json
mise exec -- git commit -m "chore: Add the round-1 eval scenarios as data" -m "The runner and the grader read one scenario file per id, so task text, budgets, steers and checks come from eval-suite section 2.3 and are not retyped per run."
```

---

## Task E2: Tagged screen frames

**Files:**
- Create: `packages/harness/src/grader/frames.ts`
- Test: `packages/harness/src/grader/frames.test.ts`

**Interfaces:**
- Consumes: E1b `Pane`, test support `fakePane`; U1 `tagNerdGlyphs`, `nerd` from `#harness/ui/glyphs` (copied from `docs/plans/2026-09-26-pi-harness-epic/glyphs.ts`).
- Produces:
  - `export type Frame = { seq: number; at: number; file: string; text: string };`
  - `export function tagFrame(screen: string): string;` (every Nerd glyph becomes `<name>`)
  - `export function captureFrame(init: { pane: Pane; dir: string; seq: number; last: string | undefined; now: number }): Promise<Frame | undefined>;` writes `<dir>/<seq padded to 5>-<now>.txt` (eval-suite step 9 names, padded so a plain sort is time order) and returns `undefined` when the tagged text equals `last`.

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/frames.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { captureFrame, tagFrame } from "#harness/grader/frames";
import { nerd } from "#harness/ui/glyphs";
import { fakePane } from "#test-support/fake-pane";

describe("tagFrame", () => {
  test("names every nerd glyph and keeps other text", () => {
    expect(tagFrame(`${nerd.hostile} Springpaw Stalker 12yd ${nerd.health} 80%`)).toBe("<hostile> Springpaw Stalker 12yd <health> 80%");
  });

  test("leaves plain text as it is", () => {
    expect(tagFrame("── Working ──")).toBe("── Working ──");
  });
});

describe("captureFrame", () => {
  test("saves a changed screen as <seq>-<ms>.txt", async () => {
    const dir = await mkdtemp(`${tmpdir()}/frames-`);
    const frame = await captureFrame({ dir, last: undefined, now: 1_727_384_400_000, pane: fakePane([`${nerd.self} you`]), seq: 3 });
    expect(frame).toEqual({ at: 1_727_384_400_000, file: `${dir}/00003-1727384400000.txt`, seq: 3, text: "<self> you" });
    expect(await Bun.file(`${dir}/00003-1727384400000.txt`).text()).toBe("<self> you");
  });

  test("skips a screen equal to the last frame", async () => {
    const dir = await mkdtemp(`${tmpdir()}/frames-`);
    const frame = await captureFrame({ dir, last: "<self> you", now: 5, pane: fakePane([`${nerd.self} you`]), seq: 4 });
    expect(frame).toBeUndefined();
    expect(await readdir(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/frames.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/frames'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/frames.ts`:

```ts
import type { Pane } from "#harness/grader/pane";
import { tagNerdGlyphs } from "#harness/ui/glyphs";

export type Frame = { seq: number; at: number; file: string; text: string };

type CaptureInit = { pane: Pane; dir: string; seq: number; last: string | undefined; now: number };

export function tagFrame(screen: string): string {
  return tagNerdGlyphs(screen);
}

export async function captureFrame({ pane, dir, seq, last, now }: CaptureInit): Promise<Frame | undefined> {
  const text = tagFrame(await pane.screen());
  if (text === last) return undefined;
  const file = `${dir}/${String(seq).padStart(5, "0")}-${now}.txt`;
  await Bun.write(file, text);
  return { at: now, file, seq, text };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/frames.test.ts`
Expected: PASS, 4 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/frames.ts packages/harness/src/grader/frames.test.ts
mise exec -- git commit -m "chore: Save tagged frames for eval graders" -m "Graders must match glyphs by name with the same glyphs.ts the harness renders with, and only a changed screen is worth a file."
```

---

## Task E3a: Truth reader and final-truth check

**Files:**
- Create: `packages/harness/src/grader/truth.ts`
- Test: `packages/harness/src/grader/truth.test.ts`

**Interfaces:**
- Consumes: E1a `Exec`, `parseJsonOutput`, `isRecord`, test support `fakeExec`, `ok`, `failed`; `messageOf` from `@tuicraft/core/lib/errors`.
- Produces (contract 2.13):
  - `export type TruthItem = { bag: number; slot: number; item: number; name: string; count: number };`
  - `export type TruthQuest = { quest: number; status: number; rewarded: boolean; mobCounts: number[]; itemCounts: number[] };`
  - `export type Truth = { ok: true; online: boolean; savedAt: string; guid: number; account: string; name: string; race: number; class: number; level: number; xp: number; money: number; position: { map: number; zone: number; x: number; y: number; z: number; o: number }; alive: boolean; deathState: "alive" | "dead" | "ghost"; health: number; inventory: TruthItem[]; quests: TruthQuest[]; rewardedQuests: number[]; spells: number[] };`
  - `export type FinalTruth = { ok: true; truth: Truth } | { ok: false; cause: "stale_truth" | "service_down"; detail: string };`
  - `export const TRUTH_ARGV = ["bun", "packages/factory/src/main.ts", "soap", "truth"] as const;`
  - `export const STALE_SLACK_MS = 5000;`
  - `export function parseTruth(json: unknown): Truth;` (boundary check; extra fields such as `hearth`, `power`, `mail`, `gender` are ignored; `{ ok: false }` throws `truth refused: <reason>`)
  - `export function readTruth(exec: Exec, account: string): Promise<Truth>;`
  - `export function finalTruth(init: { exec: Exec; account: string; exitMs: number; retries?: number; waitMs?: number }): Promise<FinalTruth>;` (eval-suite step 12: offline and `savedAt ≥ exitMs − 5 s`, up to `retries` (3) reads `waitMs` (10 s) apart, else `stale_truth`; a failed read is `service_down`)

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/truth.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { finalTruth, parseTruth, readTruth, TRUTH_ARGV } from "#harness/grader/truth";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACCOUNT = "FAC6AB817400D";

function reply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account: ACCOUNT,
    alive: true,
    class: 5,
    deathState: "alive",
    gender: 1,
    guid: 2958,
    health: 28,
    hearth: { map: 530, x: 8714.14, y: -6650.33, z: 72.75, zone: 3430 },
    inventory: [{ bag: 255, count: 20, durability: 0, guid: 1_055_036, item: 117, maxDurability: 0, name: "Tough Jerky", slot: 23 }],
    level: 12,
    mail: [],
    money: 123_486,
    name: "Fsvctesta",
    ok: true,
    online: false,
    position: { map: 530, o: 4.36, x: 7564.25, y: -6872.23, z: 96.04, zone: 3433 },
    power: [607, 0, 0, 100, 0, 0, 0],
    quests: [{ explored: false, itemCounts: [0, 0, 0, 0, 0, 0], mobCounts: [3, 0, 0, 0], quest: 8325, rewarded: false, status: 3, timer: 0 }],
    race: 10,
    rewardedQuests: [8325],
    savedAt: "2026-09-26T19:04:55.896Z",
    spells: [585, 2050],
    xp: 10,
    ...overrides,
  };
}

describe("parseTruth", () => {
  test("keeps the contract fields of a service reply", () => {
    expect(parseTruth(reply())).toEqual({
      account: ACCOUNT,
      alive: true,
      class: 5,
      deathState: "alive",
      guid: 2958,
      health: 28,
      inventory: [{ bag: 255, count: 20, item: 117, name: "Tough Jerky", slot: 23 }],
      level: 12,
      money: 123_486,
      name: "Fsvctesta",
      ok: true,
      online: false,
      position: { map: 530, o: 4.36, x: 7564.25, y: -6872.23, z: 96.04, zone: 3433 },
      quests: [{ itemCounts: [0, 0, 0, 0, 0, 0], mobCounts: [3, 0, 0, 0], quest: 8325, rewarded: false, status: 3 }],
      race: 10,
      rewardedQuests: [8325],
      savedAt: "2026-09-26T19:04:55.896Z",
      spells: [585, 2050],
      xp: 10,
    });
  });

  test("throws on a refusal with its reason", () => {
    expect(() => parseTruth({ error: "no such character", ok: false, reason: "character_not_found" })).toThrow("truth refused: character_not_found");
  });

  test("names a wrong field", () => {
    expect(() => parseTruth(reply({ deathState: "undead" }))).toThrow("truth.deathState: expected alive|dead|ghost");
    expect(() => parseTruth(reply({ position: { map: 530 } }))).toThrow("truth.position.o: expected a number");
    expect(() => parseTruth(reply({ inventory: [{ bag: 255 }] }))).toThrow("truth.inventory[0].count: expected a number");
  });
});

describe("readTruth", () => {
  test("runs soap truth for the account and parses the reply", async () => {
    const { calls, exec } = fakeExec(() => ok(JSON.stringify(reply(), null, 2)));
    const truth = await readTruth(exec, ACCOUNT);
    expect(truth.level).toBe(12);
    expect(calls[0]?.argv).toEqual([...TRUTH_ARGV, ACCOUNT]);
  });

  test("reports the service reason when soap truth fails", async () => {
    const { exec } = fakeExec(() => failed(1, "service down", JSON.stringify({ error: "fetch failed", ok: false, reason: "service_down" })));
    await expect(readTruth(exec, ACCOUNT)).rejects.toThrow("truth refused: service_down");
  });

  test("reports stderr when there is no JSON", async () => {
    const { exec } = fakeExec(() => failed(1, "usage: soap truth <ACCOUNT>"));
    await expect(readTruth(exec, ACCOUNT)).rejects.toThrow("soap truth exited 1: usage: soap truth <ACCOUNT>");
  });
});

describe("finalTruth", () => {
  const exitMs = Date.parse("2026-09-26T21:00:00.000Z");
  const fresh = reply({ savedAt: "2026-09-26T20:59:57.000Z" });

  test("accepts an offline save made after the exit minus 5 s", async () => {
    const { exec } = fakeExec(() => ok(JSON.stringify(fresh)));
    const final = await finalTruth({ account: ACCOUNT, exec, exitMs, waitMs: 1 });
    expect(final.ok && final.truth.savedAt).toBe("2026-09-26T20:59:57.000Z");
  });

  test("reads again while the character is still online", async () => {
    const replies = [reply({ online: true, savedAt: "2026-09-26T21:00:01.000Z" }), fresh];
    const { calls, exec } = fakeExec(() => ok(JSON.stringify(replies.shift() ?? fresh)));
    const final = await finalTruth({ account: ACCOUNT, exec, exitMs, waitMs: 1 });
    expect(final.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("gives stale_truth after three old saves", async () => {
    const { calls, exec } = fakeExec(() => ok(JSON.stringify(reply({ savedAt: "2026-09-25T10:00:00.000Z" }))));
    const final = await finalTruth({ account: ACCOUNT, exec, exitMs, waitMs: 1 });
    expect(final).toEqual({ cause: "stale_truth", detail: "online=false savedAt=2026-09-25T10:00:00.000Z exit=2026-09-26T21:00:00.000Z", ok: false });
    expect(calls).toHaveLength(3);
  });

  test("gives service_down when a read fails", async () => {
    const { exec } = fakeExec(() => failed(1, "connect refused"));
    const final = await finalTruth({ account: ACCOUNT, exec, exitMs, waitMs: 1 });
    expect(final).toEqual({ cause: "service_down", detail: "soap truth exited 1: connect refused", ok: false });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/truth.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/truth'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/truth.ts`:

```ts
import { messageOf } from "@tuicraft/core/lib/errors";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";

export type TruthItem = { bag: number; slot: number; item: number; name: string; count: number };

export type TruthQuest = { quest: number; status: number; rewarded: boolean; mobCounts: number[]; itemCounts: number[] };

export type Truth = {
  ok: true;
  online: boolean;
  savedAt: string;
  guid: number;
  account: string;
  name: string;
  race: number;
  class: number;
  level: number;
  xp: number;
  money: number;
  position: { map: number; zone: number; x: number; y: number; z: number; o: number };
  alive: boolean;
  deathState: "alive" | "dead" | "ghost";
  health: number;
  inventory: TruthItem[];
  quests: TruthQuest[];
  rewardedQuests: number[];
  spells: number[];
};

export type FinalTruth = { ok: true; truth: Truth } | { ok: false; cause: "stale_truth" | "service_down"; detail: string };

export const TRUTH_ARGV = ["bun", "packages/factory/src/main.ts", "soap", "truth"] as const;
export const STALE_SLACK_MS = 5000;

const DEATH_STATES = ["alive", "dead", "ghost"] as const;
const TRUTH_TIMEOUT_MS = 30_000;

type Json = Record<string, unknown>;

function fields(json: Json, where: string) {
  const fail = (key: string, what: string): never => {
    throw new Error(`${where}.${key}: expected ${what}`);
  };
  const num = (key: string): number => {
    const value = json[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fail(key, "a number");
  };
  const arr = (key: string): unknown[] => {
    const value = json[key];
    return Array.isArray(value) ? value : fail(key, "an array");
  };
  return {
    arr,
    bool: (key: string): boolean => (typeof json[key] === "boolean" ? (json[key] as boolean) : fail(key, "a boolean")),
    num,
    nums: (key: string): number[] => arr(key).map((value, i) => (typeof value === "number" ? value : fail(`${key}[${i}]`, "a number"))),
    obj: (key: string): Json => (isRecord(json[key]) ? (json[key] as Json) : fail(key, "an object")),
    str: (key: string): string => (typeof json[key] === "string" ? (json[key] as string) : fail(key, "a string")),
  };
}

function record(value: unknown, where: string): Json {
  if (!isRecord(value)) throw new Error(`${where}: expected an object`);
  return value;
}

function itemOf(value: unknown, where: string): TruthItem {
  const f = fields(record(value, where), where);
  return { bag: f.num("bag"), count: f.num("count"), item: f.num("item"), name: f.str("name"), slot: f.num("slot") };
}

function questOf(value: unknown, where: string): TruthQuest {
  const f = fields(record(value, where), where);
  return { itemCounts: f.nums("itemCounts"), mobCounts: f.nums("mobCounts"), quest: f.num("quest"), rewarded: f.bool("rewarded"), status: f.num("status") };
}

function positionOf(json: Json): Truth["position"] {
  const f = fields(json, "truth.position");
  return { map: f.num("map"), o: f.num("o"), x: f.num("x"), y: f.num("y"), z: f.num("z"), zone: f.num("zone") };
}

function deathStateOf(value: string): Truth["deathState"] {
  const state = DEATH_STATES.find((name) => name === value);
  if (state === undefined) throw new Error(`truth.deathState: expected ${DEATH_STATES.join("|")}`);
  return state;
}

export function parseTruth(json: unknown): Truth {
  const reply = record(json, "truth");
  if (reply["ok"] !== true) throw new Error(`truth refused: ${String(reply["reason"] ?? "no reason")}`);
  const f = fields(reply, "truth");
  return {
    account: f.str("account"),
    alive: f.bool("alive"),
    class: f.num("class"),
    deathState: deathStateOf(f.str("deathState")),
    guid: f.num("guid"),
    health: f.num("health"),
    inventory: f.arr("inventory").map((row, i) => itemOf(row, `truth.inventory[${i}]`)),
    level: f.num("level"),
    money: f.num("money"),
    name: f.str("name"),
    ok: true,
    online: f.bool("online"),
    position: positionOf(f.obj("position")),
    quests: f.arr("quests").map((row, i) => questOf(row, `truth.quests[${i}]`)),
    race: f.num("race"),
    rewardedQuests: f.nums("rewardedQuests"),
    savedAt: f.str("savedAt"),
    spells: f.nums("spells"),
    xp: f.num("xp"),
  };
}

export async function readTruth(exec: Exec, account: string): Promise<Truth> {
  const { code, stderr, stdout } = await exec([...TRUTH_ARGV, account], { timeoutMs: TRUTH_TIMEOUT_MS });
  const json = parseJsonOutput(stdout);
  if (json === undefined) throw new Error(`soap truth exited ${code}: ${stderr.trim()}`);
  return parseTruth(json);
}

type FinalInit = { exec: Exec; account: string; exitMs: number; retries?: number; waitMs?: number };
type Read = { truth: Truth } | { error: string };

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isFresh(truth: Truth, exitMs: number): boolean {
  return !truth.online && Date.parse(truth.savedAt) >= exitMs - STALE_SLACK_MS;
}

function staleDetail(truth: Truth | undefined, exitMs: number): string {
  if (truth === undefined) return "no truth read";
  return `online=${truth.online} savedAt=${truth.savedAt} exit=${new Date(exitMs).toISOString()}`;
}

export async function finalTruth({ exec, account, exitMs, retries = 3, waitMs = 10_000 }: FinalInit): Promise<FinalTruth> {
  let last: Truth | undefined;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (attempt > 1) await delay(waitMs);
    const read: Read = await readTruth(exec, account).then(
      (truth) => ({ truth }),
      (err: unknown) => ({ error: messageOf(err) }),
    );
    if ("error" in read) return { cause: "service_down", detail: read.error, ok: false };
    last = read.truth;
    if (isFresh(last, exitMs)) return { ok: true, truth: last };
  }
  return { cause: "stale_truth", detail: staleDetail(last, exitMs), ok: false };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/truth.test.ts`
Expected: PASS, 10 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Live check (a throwaway soap account)**

From the child worktree root, with the t1 service up (`bun packages/factory/src/main.ts soap health` prints `"ok": true`). The Session JSON goes to a mode-600 file and is read only with `jq -r .account`:

```bash
umask 077
bun packages/factory/src/main.ts soap create fresh --owner eval-infra-e3 > tmp/e3-account.json
ACC=$(jq -r .account tmp/e3-account.json)
cat > packages/harness/tmp-truth-smoke.ts <<'TS'
import { bunExec } from "#harness/grader/exec";
import { readTruth } from "#harness/grader/truth";
const truth = await readTruth(bunExec, process.argv[2] ?? "");
console.log(JSON.stringify({ deathState: truth.deathState, level: truth.level, online: truth.online, spells: truth.spells.length }));
TS
bun packages/harness/tmp-truth-smoke.ts "$ACC"; rm packages/harness/tmp-truth-smoke.ts
bun packages/factory/src/main.ts soap delete "$ACC"
bun packages/factory/src/main.ts soap list | jq -r '.[].account' | rg -c "$ACC" || echo "deleted"
rm tmp/e3-account.json
```

Expected: `{"deathState":"alive","level":1,"online":false,"spells":<n>}`, then `deleted`. If `soap health` is not ok, record the step as deferred to the coordinator (AGENTS.md "Testing": infrastructure failure) and go on.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/grader/truth.ts packages/harness/src/grader/truth.test.ts
mise exec -- git commit -m "chore: Read t1 truth for eval graders" -m "Graders grade on the server's saved character row; the final read must be offline and saved after the harness exit, else the run is aborted as stale_truth."
```

---

## Task E3b: Password leak check

**Files:**
- Modify: `packages/harness/src/grader/truth.ts` (add `leakCheck` at the end; E3 owns the file)
- Test: `packages/harness/src/grader/leak-check.test.ts`

**Interfaces:**
- Consumes: E1a `Exec`, `bunExec`, `isRecord`; test support `fakeExec`, `ok`.
- Produces: `export function leakCheck(init: { exec: Exec; runDir: string; secretFiles: readonly string[] }): Promise<string[]>;` returns run-dir-relative file names that contain a password read from `.password` of each existing secret file, sorted; the secret files are skipped by base name; the passwords go to `rg -uu -l -F -f -` on stdin, never in argv; no password and no match both give `[]`.

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/leak-check.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { bunExec } from "#harness/grader/exec";
import { leakCheck } from "#harness/grader/truth";
import { fakeExec, ok } from "#test-support/fake-exec";

const PASSWORD = "pw-secret-123";

async function runDir(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/leak-`);
  await mkdir(`${dir}/frames`);
  await writeFile(`${dir}/account.json`, JSON.stringify({ account: "FAC0123456789", password: PASSWORD }));
  await writeFile(`${dir}/gamelog.jsonl`, '{"event":"session/in_world"}\n');
  return dir;
}

describe("leakCheck", () => {
  test("finds no leak in a clean run dir", async () => {
    const dir = await runDir();
    expect(await leakCheck({ exec: bunExec, runDir: dir, secretFiles: [`${dir}/account.json`, `${dir}/partner.json`] })).toEqual([]);
  });

  test("lists every file that holds the password, but not the secret files", async () => {
    const dir = await runDir();
    await writeFile(`${dir}/frames/00001-5.txt`, `login ${PASSWORD} ok`);
    await writeFile(`${dir}/session.jsonl`, `{"text":"${PASSWORD}"}\n`);
    const files = await leakCheck({ exec: bunExec, runDir: dir, secretFiles: [`${dir}/account.json`] });
    expect(files).toEqual(["frames/00001-5.txt", "session.jsonl"]);
  });

  test("keeps the password out of argv", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ({ code: 1, stderr: "", stdout: "" }));
    await leakCheck({ exec, runDir: dir, secretFiles: [`${dir}/account.json`] });
    expect(calls[0]?.argv.join(" ")).not.toContain(PASSWORD);
    expect(calls[0]?.stdin).toBe(`${PASSWORD}\n`);
    expect(calls[0]?.argv).toEqual(["rg", "-uu", "-l", "-F", "-f", "-", "--glob", "!account.json", dir]);
  });

  test("returns nothing and runs nothing when no secret file exists", async () => {
    const dir = await mkdtemp(`${tmpdir()}/leak-`);
    const { calls, exec } = fakeExec(() => ok());
    expect(await leakCheck({ exec, runDir: dir, secretFiles: [`${dir}/account.json`] })).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("throws when rg fails", async () => {
    const dir = await runDir();
    const { exec } = fakeExec(() => ({ code: 2, stderr: "rg: bad glob", stdout: "" }));
    await expect(leakCheck({ exec, runDir: dir, secretFiles: [`${dir}/account.json`] })).rejects.toThrow("rg exited 2: rg: bad glob");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/leak-check.test.ts`
Expected: FAIL with `SyntaxError: Export named 'leakCheck' not found in module`.

- [ ] **Step 3: Implement**

Add to the imports of `packages/harness/src/grader/truth.ts`:

```ts
import { basename, relative } from "node:path";
```

Append to `packages/harness/src/grader/truth.ts`:

```ts
type LeakInit = { exec: Exec; runDir: string; secretFiles: readonly string[] };

async function passwordIn(file: string): Promise<string> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return "";
  const json: unknown = await handle.json();
  const password = isRecord(json) ? json["password"] : undefined;
  return typeof password === "string" ? password : "";
}

export async function leakCheck({ exec, runDir, secretFiles }: LeakInit): Promise<string[]> {
  const secrets = (await Promise.all(secretFiles.map(passwordIn))).filter((secret) => secret.length > 0);
  if (secrets.length === 0) return [];
  const skip = secretFiles.flatMap((file) => ["--glob", `!${basename(file)}`]);
  const argv = ["rg", "-uu", "-l", "-F", "-f", "-", ...skip, runDir];
  const { code, stderr, stdout } = await exec(argv, { stdin: `${secrets.join("\n")}\n` });
  if (code === 1) return [];
  if (code !== 0) throw new Error(`rg exited ${code}: ${stderr.trim()}`);
  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => relative(runDir, line))
    .toSorted();
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/leak-check.test.ts packages/harness/src/grader/truth.test.ts`
Expected: PASS, 15 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/truth.ts packages/harness/src/grader/leak-check.test.ts
mise exec -- git commit -m "chore: Scan eval run dirs for a leaked password" -m "Eval-suite step 13 needs the file names only; the password goes to rg on stdin so it never appears in argv, a process list or a log."
```

---

## Task E6a: Game-log tail, triggers and progress

**Files:**
- Create: `packages/harness/src/grader/watch.ts`
- Test: `packages/harness/src/grader/watch-rows.test.ts`

**Interfaces:**
- Consumes: F2 `GameLogEntry`, `LogEvent` (`#harness/contract/log`), `AgentState`, `StatusJson` (`#harness/contract/config`); E5 `TriggerName`.
- Produces (contract 2.13 plus the helpers of contract issue 8):
  - `export type TriggerRow = { ms: number; trigger: TriggerName; seq: number; text: string };`
  - `export type ProgressJson = { at: number; agent: AgentState; lastToolCallAt: number | undefined; lastProgress: { at: number; event: LogEvent } | undefined; idleSinceMs: number | undefined };`
  - `export const TRIGGER_EVENTS: Readonly<Record<TriggerName, readonly LogEvent[]>>;` (design I.2 table)
  - `export const FRAME_EVERY_MS = 5000;`
  - `export type LogTail = { read: () => Promise<GameLogEntry[]> };`
  - `export function createLogTail(file: string): LogTail;` (new complete lines since the last read; a missing file gives `[]`; a partial last line waits for the next read)
  - `export function triggerRows(entries: readonly GameLogEntry[]): TriggerRow[];`
  - `export function lastAnswerAt(entries: readonly GameLogEntry[], previous: number | undefined): number | undefined;` (newest `agent/message` `ts`)
  - `export function progressOf(init: { status: StatusJson; lastAnswerAt: number | undefined; now: number }): ProgressJson;` (`idleSinceMs` = `now` − the newest of `status.lastProgress.at` and `lastAnswerAt`; `undefined` when neither exists)
  - `export function readStatus(file: string): Promise<StatusJson | undefined>;` (missing, empty or half-written file gives `undefined`)

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/watch-rows.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import { createLogTail, lastAnswerAt, progressOf, readStatus, TRIGGER_EVENTS, triggerRows } from "#harness/grader/watch";

function row(seq: number, ts: number, event: LogEvent, text = event): GameLogEntry {
  return { char: "Fevala", class: "passive", data: {}, domain: event.split("/")[0] as Domain, event, seq, text, ts, v: 1 };
}

const jsonl = (rows: GameLogEntry[]): string => rows.map((entry) => `${JSON.stringify(entry)}\n`).join("");

function status(overrides: Partial<StatusJson> = {}): StatusJson {
  return { agent: "idle", at: 10_000, connection: "online", lastProgress: undefined, lastToolCallAt: undefined, ready: true, run: undefined, tool: undefined, v: 1, ...overrides };
}

describe("TRIGGER_EVENTS", () => {
  test("follows the design I.2 table", () => {
    expect(TRIGGER_EVENTS).toEqual({
      answer_text: ["agent/message"],
      death: ["life/dead"],
      fight_start: ["fight/start"],
      kill: ["combat/kill_credit"],
      movement_start: ["nav/route_start", "control/move_start"],
      steer_landed: ["human/input"],
    });
  });
});

describe("triggerRows", () => {
  test("keeps only trigger events, with ts, seq and text", () => {
    const rows = [row(1, 100, "session/in_world"), row(2, 200, "fight/start", "fight Springpaw Stalker"), row(3, 300, "control/move_start"), row(4, 400, "xp/gain")];
    expect(triggerRows(rows)).toEqual([
      { ms: 200, seq: 2, text: "fight Springpaw Stalker", trigger: "fight_start" },
      { ms: 300, seq: 3, text: "control/move_start", trigger: "movement_start" },
    ]);
  });

  test("lastAnswerAt keeps the newest agent message", () => {
    expect(lastAnswerAt([row(1, 100, "agent/message"), row(2, 250, "agent/message")], 50)).toBe(250);
    expect(lastAnswerAt([row(1, 100, "xp/gain")], 50)).toBe(50);
    expect(lastAnswerAt([], undefined)).toBeUndefined();
  });
});

describe("createLogTail", () => {
  test("reads only new complete lines", async () => {
    const file = `${await mkdtemp(`${tmpdir()}/tail-`)}/gamelog.jsonl`;
    const tail = createLogTail(file);
    expect(await tail.read()).toEqual([]);
    await writeFile(file, jsonl([row(1, 100, "session/in_world")]));
    expect((await tail.read()).map((entry) => entry.seq)).toEqual([1]);
    expect(await tail.read()).toEqual([]);
  });

  test("keeps a partial last line for the next read", async () => {
    const file = `${await mkdtemp(`${tmpdir()}/tail-`)}/gamelog.jsonl`;
    const tail = createLogTail(file);
    const second = JSON.stringify(row(2, 200, "combat/kill_credit"));
    await writeFile(file, `${jsonl([row(1, 100, "fight/start")])}${second.slice(0, 20)}`);
    expect((await tail.read()).map((entry) => entry.seq)).toEqual([1]);
    await appendFile(file, `${second.slice(20)}\n`);
    expect((await tail.read()).map((entry) => entry.seq)).toEqual([2]);
  });

  test("reads multi-byte text across reads", async () => {
    const file = `${await mkdtemp(`${tmpdir()}/tail-`)}/gamelog.jsonl`;
    const tail = createLogTail(file);
    await writeFile(file, jsonl([row(1, 100, "chat/in", "Thélia says «hi»")]));
    expect((await tail.read())[0]?.text).toBe("Thélia says «hi»");
  });
});

describe("progressOf", () => {
  test("measures idle time from the newest progress or answer", () => {
    const progress = progressOf({ lastAnswerAt: 7000, now: 10_000, status: status({ agent: "tool", lastProgress: { at: 8000, event: "combat/kill_credit" }, lastToolCallAt: 9000 }) });
    expect(progress).toEqual({ agent: "tool", at: 10_000, idleSinceMs: 2000, lastProgress: { at: 8000, event: "combat/kill_credit" }, lastToolCallAt: 9000 });
  });

  test("has no idle time before any progress or answer", () => {
    expect(progressOf({ lastAnswerAt: undefined, now: 10_000, status: status() }).idleSinceMs).toBeUndefined();
  });
});

describe("readStatus", () => {
  test("reads a status file and ignores a missing or half-written one", async () => {
    const dir = await mkdtemp(`${tmpdir()}/status-`);
    expect(await readStatus(`${dir}/status.json`)).toBeUndefined();
    await writeFile(`${dir}/status.json`, '{"v":1,"at":');
    expect(await readStatus(`${dir}/status.json`)).toBeUndefined();
    await writeFile(`${dir}/status.json`, JSON.stringify(status({ at: 42 })));
    expect((await readStatus(`${dir}/status.json`))?.at).toBe(42);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/watch-rows.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/watch'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/watch.ts`:

```ts
import type { AgentState, StatusJson } from "#harness/contract/config";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import { parseJsonOutput } from "#harness/grader/exec";
import type { TriggerName } from "#harness/grader/scenarios";

export type TriggerRow = { ms: number; trigger: TriggerName; seq: number; text: string };

export type ProgressJson = {
  at: number;
  agent: AgentState;
  lastToolCallAt: number | undefined;
  lastProgress: { at: number; event: LogEvent } | undefined;
  idleSinceMs: number | undefined;
};

export type LogTail = { read: () => Promise<GameLogEntry[]> };

export const FRAME_EVERY_MS = 5000;

export const TRIGGER_EVENTS: Readonly<Record<TriggerName, readonly LogEvent[]>> = {
  answer_text: ["agent/message"],
  death: ["life/dead"],
  fight_start: ["fight/start"],
  kill: ["combat/kill_credit"],
  movement_start: ["nav/route_start", "control/move_start"],
  steer_landed: ["human/input"],
};

const NEWLINE = 10;

const TRIGGER_BY_EVENT: ReadonlyMap<LogEvent, TriggerName> = new Map(
  (Object.entries(TRIGGER_EVENTS) as [TriggerName, readonly LogEvent[]][]).flatMap(([trigger, events]) =>
    events.map((event) => [event, trigger] as const),
  ),
);

function parseRows(text: string): GameLogEntry[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as GameLogEntry);
}

export function createLogTail(file: string): LogTail {
  let offset = 0;
  const read = async (): Promise<GameLogEntry[]> => {
    const handle = Bun.file(file);
    if (!(await handle.exists())) return [];
    const bytes = new Uint8Array(await handle.slice(offset).arrayBuffer());
    const end = bytes.lastIndexOf(NEWLINE);
    if (end < 0) return [];
    offset += end + 1;
    return parseRows(new TextDecoder().decode(bytes.subarray(0, end)));
  };
  return { read };
}

export function triggerRows(entries: readonly GameLogEntry[]): TriggerRow[] {
  return entries.flatMap((entry) => {
    const trigger = TRIGGER_BY_EVENT.get(entry.event);
    return trigger === undefined ? [] : [{ ms: entry.ts, seq: entry.seq, text: entry.text, trigger }];
  });
}

export function lastAnswerAt(entries: readonly GameLogEntry[], previous: number | undefined): number | undefined {
  return entries
    .filter((entry) => entry.event === "agent/message")
    .reduce<number | undefined>((newest, entry) => Math.max(newest ?? entry.ts, entry.ts), previous);
}

type ProgressInit = { status: StatusJson; lastAnswerAt: number | undefined; now: number };

export function progressOf({ status, lastAnswerAt: answerAt, now }: ProgressInit): ProgressJson {
  const marks = [status.lastProgress?.at, answerAt].filter((mark): mark is number => mark !== undefined);
  return {
    agent: status.agent,
    at: now,
    idleSinceMs: marks.length > 0 ? now - Math.max(...marks) : undefined,
    lastProgress: status.lastProgress,
    lastToolCallAt: status.lastToolCallAt,
  };
}

export async function readStatus(file: string): Promise<StatusJson | undefined> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return undefined;
  const json = parseJsonOutput(await handle.text());
  return json === undefined ? undefined : (json as StatusJson);
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/watch-rows.test.ts`
Expected: PASS, 9 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/watch.ts packages/harness/src/grader/watch-rows.test.ts
mise exec -- git commit -m "chore: Tail the game log for eval triggers" -m "The P6 watcher and the runner both need trigger rows and idle time from gamelog.jsonl and status.json, read while the harness is still writing them."
```

---

## Task E6b: The P6 watcher

**Files:**
- Modify: `packages/harness/src/grader/watch.ts` (add `watchRun`; E6 owns the file)
- Test: `packages/harness/src/grader/watch.test.ts`

**Interfaces:**
- Consumes: E6a `createLogTail`, `triggerRows`, `lastAnswerAt`, `progressOf`, `readStatus`, `FRAME_EVERY_MS`; E2 `captureFrame`; E1a `Exec`, `parseJsonOutput`; E1b `Pane`; F2 `Clock` (`#harness/contract/services`); `messageOf`, `ignoreFailure` from `@tuicraft/core/lib/*`; test support `fakeExec`, `ok`, `fakePane`.
- Produces:
  - `export type Watcher = { stop: () => Promise<void> };`
  - `export const LOG_POLL_MS = 1000;`, `export const WITNESS_EVERY_MS = 5000;`
  - `export function watchRun(init: { runDir: string; pane: Pane; exec: Exec; clock: Clock; witness?: string; frameEveryMs?: number }): Watcher;` — one full tick at start and one at `stop()` (contract issue 11), then every `LOG_POLL_MS` the log tick (append `triggers.jsonl`, rewrite `progress.json`), every `frameEveryMs` a frame into `frames/`, and with `witness` every `WITNESS_EVERY_MS` one `<witness> nearby --json` row `{ code, ms, nearby }` in `witness.jsonl`. Jobs run one at a time; a failed job appends one line to `grader/watch-errors.log` and the watcher goes on. It writes only inside `runDir`.

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/watch.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import { watchRun } from "#harness/grader/watch";
import { fakeExec, ok } from "#test-support/fake-exec";
import { fakePane } from "#test-support/fake-pane";

const WITNESS = "/wt/tmp/tc-FAC0000000002";

function row(seq: number, ts: number, event: LogEvent, text = event): GameLogEntry {
  return { char: "Fevala", class: "passive", data: {}, domain: event.split("/")[0] as Domain, event, seq, text, ts, v: 1 };
}

const jsonl = (rows: GameLogEntry[]): string => rows.map((entry) => `${JSON.stringify(entry)}\n`).join("");

async function lines(file: string): Promise<unknown[]> {
  return (await Bun.file(file).text())
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function runDir(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/watch-`);
  const status: StatusJson = {
    agent: "tool",
    at: 2500,
    connection: "online",
    lastProgress: { at: 2000, event: "fight/start" },
    lastToolCallAt: 1900,
    ready: true,
    run: undefined,
    tool: "engage",
    v: 1,
  };
  await writeFile(`${dir}/status.json`, JSON.stringify(status));
  await writeFile(`${dir}/gamelog.jsonl`, jsonl([row(1, 1000, "session/in_world"), row(2, 2000, "fight/start", "fight Springpaw Stalker")]));
  return dir;
}

describe("watchRun", () => {
  test("writes triggers once each, progress, frames and witness samples", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ok('{"data":[{"name":"Springpaw Stalker"}]}'));
    const watcher = watchRun({ clock: { now: () => 5000 }, exec, frameEveryMs: 60_000, pane: fakePane(["first", "second"]), runDir: dir, witness: WITNESS });
    await appendFile(`${dir}/gamelog.jsonl`, `${jsonl([row(3, 3000, "combat/kill_credit", "kill Springpaw Stalker")])}{"partial":`);
    await watcher.stop();
    expect(await lines(`${dir}/triggers.jsonl`)).toEqual([
      { ms: 2000, seq: 2, text: "fight Springpaw Stalker", trigger: "fight_start" },
      { ms: 3000, seq: 3, text: "kill Springpaw Stalker", trigger: "kill" },
    ]);
    expect(await Bun.file(`${dir}/progress.json`).json()).toEqual({
      agent: "tool",
      at: 5000,
      idleSinceMs: 3000,
      lastProgress: { at: 2000, event: "fight/start" },
      lastToolCallAt: 1900,
    });
    expect((await readdir(`${dir}/frames`)).toSorted()).toEqual(["00000-5000.txt", "00001-5000.txt"]);
    expect(await lines(`${dir}/witness.jsonl`)).toEqual([
      { code: 0, ms: 5000, nearby: { data: [{ name: "Springpaw Stalker" }] } },
      { code: 0, ms: 5000, nearby: { data: [{ name: "Springpaw Stalker" }] } },
    ]);
    expect(calls.map((call) => call.argv)).toEqual([
      [WITNESS, "nearby", "--json"],
      [WITNESS, "nearby", "--json"],
    ]);
  });

  test("samples no witness without a wrapper and keeps one frame for an unchanged screen", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ok());
    const watcher = watchRun({ clock: { now: () => 5000 }, exec, pane: fakePane(["same"]), runDir: dir });
    await watcher.stop();
    expect(calls).toEqual([]);
    expect(await readdir(`${dir}/frames`)).toEqual(["00000-5000.txt"]);
  });

  test("logs a failed job and keeps going", async () => {
    const dir = await runDir();
    const { exec } = fakeExec(() => ok());
    const pane = { ...fakePane(["x"]), screen: () => Promise.reject(new Error("terminal_handle_stale")) };
    const watcher = watchRun({ clock: { now: () => 5000 }, exec, pane, runDir: dir });
    await watcher.stop();
    expect(await Bun.file(`${dir}/grader/watch-errors.log`).text()).toContain("terminal_handle_stale");
    expect(await lines(`${dir}/triggers.jsonl`)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/watch.test.ts`
Expected: FAIL with `SyntaxError: Export named 'watchRun' not found in module`.

- [ ] **Step 3: Implement**

Replace the E6a line `import { parseJsonOutput } from "#harness/grader/exec";` with `import { type Exec, parseJsonOutput } from "#harness/grader/exec";` (one import per module, or `organizeImports` fails), and add these imports beside the other E6a imports:

```ts
import { appendFile, mkdir } from "node:fs/promises";
import { messageOf } from "@tuicraft/core/lib/errors";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { Clock } from "#harness/contract/services";
import { captureFrame } from "#harness/grader/frames";
import type { Pane } from "#harness/grader/pane";
```

Append to `packages/harness/src/grader/watch.ts`:

```ts
export type Watcher = { stop: () => Promise<void> };

export const LOG_POLL_MS = 1000;
export const WITNESS_EVERY_MS = 5000;

const WITNESS_TIMEOUT_MS = 4000;

type WatchInit = { runDir: string; pane: Pane; exec: Exec; clock: Clock; witness?: string; frameEveryMs?: number };
type Job = () => Promise<void>;
type WatchJobs = { all: Job; frame: Job; log: Job; sample: Job };

function createSerial(errorLog: string): (job: Job) => Promise<void> {
  let chain = Promise.resolve();
  return (job) => {
    chain = chain.then(job).catch((err: unknown) =>
      appendFile(errorLog, `${new Date().toISOString()} ${messageOf(err)}\n`).catch(ignoreFailure),
    );
    return chain;
  };
}

function createJobs({ runDir, pane, exec, clock, witness }: WatchInit): WatchJobs {
  const tail = createLogTail(`${runDir}/gamelog.jsonl`);
  const frames = { last: undefined as string | undefined, seq: 0 };
  let answerAt: number | undefined;
  const log = async (): Promise<void> => {
    const rows = await tail.read();
    answerAt = lastAnswerAt(rows, answerAt);
    const triggers = triggerRows(rows).map((trigger) => `${JSON.stringify(trigger)}\n`);
    if (triggers.length > 0) await appendFile(`${runDir}/triggers.jsonl`, triggers.join(""));
    const status = await readStatus(`${runDir}/status.json`);
    if (status === undefined) return;
    const progress = progressOf({ lastAnswerAt: answerAt, now: clock.now(), status });
    await Bun.write(`${runDir}/progress.json`, `${JSON.stringify(progress)}\n`);
  };
  const frame = async (): Promise<void> => {
    const shot = await captureFrame({ dir: `${runDir}/frames`, last: frames.last, now: clock.now(), pane, seq: frames.seq });
    if (shot === undefined) return;
    frames.last = shot.text;
    frames.seq += 1;
  };
  const sample = async (): Promise<void> => {
    if (witness === undefined) return;
    const { code, stdout } = await exec([witness, "nearby", "--json"], { timeoutMs: WITNESS_TIMEOUT_MS });
    await appendFile(`${runDir}/witness.jsonl`, `${JSON.stringify({ code, ms: clock.now(), nearby: parseJsonOutput(stdout) ?? null })}\n`);
  };
  const all = async (): Promise<void> => {
    await mkdir(`${runDir}/frames`, { recursive: true });
    await mkdir(`${runDir}/grader`, { recursive: true });
    await log();
    await sample();
    await frame();
  };
  return { all, frame, log, sample };
}

export function watchRun(init: WatchInit): Watcher {
  const jobs = createJobs(init);
  const serial = createSerial(`${init.runDir}/grader/watch-errors.log`);
  const timers = [
    setInterval(() => serial(jobs.log), LOG_POLL_MS),
    setInterval(() => serial(jobs.frame), init.frameEveryMs ?? FRAME_EVERY_MS),
    ...(init.witness === undefined ? [] : [setInterval(() => serial(jobs.sample), WITNESS_EVERY_MS)]),
  ];
  serial(jobs.all).catch(ignoreFailure);
  const stop = async (): Promise<void> => {
    for (const timer of timers) clearInterval(timer);
    await serial(jobs.all);
  };
  return { stop };
}
```

`all` runs the log and the witness sample before the frame, so a pane that fails `screen()` (the third test) still leaves its trigger rows.

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/watch.test.ts packages/harness/src/grader/watch-rows.test.ts`
Expected: PASS, 12 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0; `watch.ts` stays under 500 non-blank lines (about 170).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/watch.ts packages/harness/src/grader/watch.test.ts
mise exec -- git commit -m "chore: Add the P6 eval watcher" -m "Steers such as t7-halt-resume need about 5 s timing, and graders should read triggers and progress files rather than poll the pane into their own context."
```

---

## Task E7a: Accounts, setup and account cleanup

**Files:**
- Create: `packages/harness/src/grader/accounts.ts` (new E7 file, contract issue 6)
- Test: `packages/harness/src/grader/accounts.test.ts`

**Interfaces:**
- Consumes: E1a `Exec`, `parseJsonOutput`, `isRecord`; E4 `AbortCause`; E5 `Scenario`; test support `fakeExec`, `ok`, `failed`.
- Produces:
  - `export const SOAP = ["bun", "packages/factory/src/main.ts", "soap"] as const;`
  - `export type Role = "agent" | "partner";`
  - `export type AccountNames = { account: string; character: string; wrapper: string; preset: string };`
  - `export class RunAbort extends Error { readonly abortCause: AbortCause; readonly evidence: string; constructor(abortCause: AbortCause, evidence: string, options?: ErrorOptions) }`
  - `export function sessionFile(runDir: string, role: Role): string;` → `<runDir>/account.json` or `<runDir>/partner.json`
  - `export function createAccount(init: { exec: Exec; runDir: string; preset: string; owner: string; role: Role }): Promise<AccountNames>;` (Session JSON to the mode-600 session file; names only to `names.json` / `partner-names.json`; failure → `RunAbort("soap_create", …)`). Known gap: a reply that names a FAC account but lacks a field leaves that account unknown to the runner, so cleanup cannot delete it; the round pre-flight deletes leftover `eval-` accounts by owner label (eval-suite §5.3 step 1).
  - `export function applySetup(init: { exec: Exec; runDir: string; account: string; setup: Scenario["setup"] }): Promise<void>;` (one `soap setup <ACC> <endpoint> <json>` per entry, each reply appended compact to `setup.log`; a reply without `ok: true` → `RunAbort("setup_failed", "<endpoint>: <reason>")`)
  - `export function deleteAccounts(init: { exec: Exec; accounts: readonly string[] }): Promise<string[]>;` (`soap delete` each, then plain `soap list`; returns the accounts still listed; throws when `soap list` fails or prints no JSON array)
  - `export function quarantine(init: { runDir: string; files: readonly string[] }): Promise<void>;` (moves run-dir-relative files into `quarantine/` (mode 700), `/` in a name becomes `_`)
  - `export function removeSessionFiles(runDir: string): Promise<void>;`

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/accounts.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { applySetup, createAccount, deleteAccounts, quarantine, RunAbort, removeSessionFiles, SOAP, sessionFile } from "#harness/grader/accounts";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACC = "FAC0123456789";
const SESSION = { account: ACC, character: "Fevala", dir: "/wt/tmp/factory-account-FAC0123456789", password: "pw-secret-123", preset: "eversong10", wrapper: "/wt/tmp/tc-FAC0123456789" };

const dir = (): Promise<string> => mkdtemp(`${tmpdir()}/accounts-`);

describe("createAccount", () => {
  test("keeps the session in a mode-600 file and the names in names.json", async () => {
    const runDir = await dir();
    const { calls, exec } = fakeExec(() => ok(`${JSON.stringify(SESSION)}\n`));
    const names = await createAccount({ exec, owner: "eval-1-t0-self-state-1", preset: "eversong10", role: "agent", runDir });
    expect(names).toEqual({ account: ACC, character: "Fevala", preset: "eversong10", wrapper: "/wt/tmp/tc-FAC0123456789" });
    expect(calls[0]?.argv).toEqual([...SOAP, "create", "eversong10", "--owner", "eval-1-t0-self-state-1"]);
    expect((await stat(sessionFile(runDir, "agent"))).mode % 0o1000).toBe(0o600);
    expect(await Bun.file(`${runDir}/names.json`).json()).toEqual(names);
    expect(await Bun.file(`${runDir}/names.json`).text()).not.toContain("pw-secret-123");
  });

  test("writes partner files for the partner role", async () => {
    const runDir = await dir();
    const { exec } = fakeExec(() => ok(JSON.stringify(SESSION)));
    await createAccount({ exec, owner: "eval-1-t2-whisper-reply-1", preset: "eversong10", role: "partner", runDir });
    expect((await readdir(runDir)).toSorted()).toEqual(["partner-names.json", "partner.json"]);
  });

  test("aborts as soap_create when soap create fails", async () => {
    const { exec } = fakeExec(() => failed(1, "pdump copy failed 3 times"));
    const error = await createAccount({ exec, owner: "o", preset: "eversong10-hunter", role: "agent", runDir: await dir() }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RunAbort);
    expect((error as RunAbort).abortCause).toBe("soap_create");
    expect((error as RunAbort).evidence).toBe("soap create eversong10-hunter exited 1: pdump copy failed 3 times");
  });

  test("aborts when the reply names no factory account", async () => {
    const { exec } = fakeExec(() => ok(JSON.stringify({ ...SESSION, account: "XIARA" })));
    await expect(createAccount({ exec, owner: "o", preset: "eversong10", role: "agent", runDir: await dir() })).rejects.toThrow("soap_create: soap create returned no factory account");
  });
});

describe("applySetup", () => {
  test("runs each setup call and logs each reply", async () => {
    const runDir = await dir();
    const { calls, exec } = fakeExec(() => ok('{\n  "changed": { "level": 1, "xp": 0 },\n  "char": "Fevala",\n  "ok": true\n}\n'));
    await applySetup({ account: ACC, exec, runDir, setup: [{ body: { level: 1 }, endpoint: "level" }] });
    expect(calls[0]?.argv).toEqual([...SOAP, "setup", ACC, "level", '{"level":1}']);
    expect(await Bun.file(`${runDir}/setup.log`).text()).toBe('{"changed":{"level":1,"xp":0},"char":"Fevala","ok":true}\n');
  });

  test("aborts as setup_failed with the reason code", async () => {
    const { exec } = fakeExec(() => failed(1, "", JSON.stringify({ error: "online", ok: false, reason: "character_online" })));
    await expect(applySetup({ account: ACC, exec, runDir: await dir(), setup: [{ body: { level: 1 }, endpoint: "level" }] })).rejects.toThrow("setup_failed: level: character_online");
  });
});

describe("deleteAccounts", () => {
  test("deletes each account and reports the ones still listed", async () => {
    const other = "FAC0000000002";
    const { calls, exec } = fakeExec((argv) => (argv[3] === "list" ? ok(JSON.stringify([{ account: other, owner: "eval-1-x-1" }])) : ok()));
    expect(await deleteAccounts({ accounts: [ACC, other], exec })).toEqual([other]);
    expect(calls.map((call) => call.argv.slice(3))).toEqual([["delete", ACC], ["delete", other], ["list"]]);
  });

  test("throws when soap list fails, so the caller keeps every account", async () => {
    const { exec } = fakeExec((argv) => (argv[3] === "list" ? failed(1, "service down") : ok()));
    await expect(deleteAccounts({ accounts: [ACC], exec })).rejects.toThrow("soap list exited 1: service down");
  });
});

describe("quarantine and removeSessionFiles", () => {
  test("moves leaked files into a mode-700 quarantine dir", async () => {
    const runDir = await dir();
    await mkdir(`${runDir}/frames`);
    await writeFile(`${runDir}/frames/00001-5.txt`, "leak");
    await quarantine({ files: ["frames/00001-5.txt"], runDir });
    expect(await readdir(`${runDir}/quarantine`)).toEqual(["frames_00001-5.txt"]);
    expect((await stat(`${runDir}/quarantine`)).mode % 0o1000).toBe(0o700);
    expect(await readdir(`${runDir}/frames`)).toEqual([]);
  });

  test("removes the session files and tolerates missing ones", async () => {
    const runDir = await dir();
    await writeFile(sessionFile(runDir, "agent"), "{}");
    await removeSessionFiles(runDir);
    expect(await readdir(runDir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/accounts.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/accounts'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/accounts.ts`:

```ts
import { appendFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { AbortCause } from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";

export const SOAP = ["bun", "packages/factory/src/main.ts", "soap"] as const;

export type Role = "agent" | "partner";
export type AccountNames = { account: string; character: string; wrapper: string; preset: string };

const FILES = {
  agent: { names: "names.json", session: "account.json" },
  partner: { names: "partner-names.json", session: "partner.json" },
} as const;

const FACTORY_ACCOUNT = /^FAC[0-9A-F]{10}$/;
const CREATE_TIMEOUT_MS = 120_000;
const SOAP_TIMEOUT_MS = 60_000;

export class RunAbort extends Error {
  readonly abortCause: AbortCause;
  readonly evidence: string;

  constructor(abortCause: AbortCause, evidence: string, options?: ErrorOptions) {
    super(`${abortCause}: ${evidence}`, options);
    this.abortCause = abortCause;
    this.evidence = evidence;
  }
}

export function sessionFile(runDir: string, role: Role): string {
  return `${runDir}/${FILES[role].session}`;
}

function lastLine(text: string): string {
  return text.trim().split("\n").at(-1) ?? "";
}

function namesOf(json: unknown): AccountNames {
  const reply = isRecord(json) ? json : {};
  const account = reply["account"];
  const character = reply["character"];
  const preset = reply["preset"];
  const wrapper = reply["wrapper"];
  if (typeof account !== "string" || !FACTORY_ACCOUNT.test(account)) throw new RunAbort("soap_create", "soap create returned no factory account");
  if (typeof character !== "string" || typeof preset !== "string" || typeof wrapper !== "string") {
    throw new RunAbort("soap_create", "soap create reply lacks character, preset or wrapper");
  }
  return { account, character, preset, wrapper };
}

type CreateInit = { exec: Exec; runDir: string; preset: string; owner: string; role: Role };

export async function createAccount({ exec, runDir, preset, owner, role }: CreateInit): Promise<AccountNames> {
  const { code, stderr, stdout } = await exec([...SOAP, "create", preset, "--owner", owner], { timeoutMs: CREATE_TIMEOUT_MS });
  if (code !== 0) throw new RunAbort("soap_create", `soap create ${preset} exited ${code}: ${lastLine(stderr)}`);
  await writeFile(sessionFile(runDir, role), stdout, { mode: 0o600 });
  const names = namesOf(parseJsonOutput(stdout));
  await writeFile(`${runDir}/${FILES[role].names}`, `${JSON.stringify(names, null, 2)}\n`);
  return names;
}

type SetupInit = { exec: Exec; runDir: string; account: string; setup: Scenario["setup"] };

export async function applySetup({ exec, runDir, account, setup }: SetupInit): Promise<void> {
  for (const { endpoint, body } of setup) {
    const { stdout } = await exec([...SOAP, "setup", account, endpoint, JSON.stringify(body)], { timeoutMs: SOAP_TIMEOUT_MS });
    const reply = parseJsonOutput(stdout);
    await appendFile(`${runDir}/setup.log`, `${reply === undefined ? stdout.trim() : JSON.stringify(reply)}\n`);
    if (!isRecord(reply) || reply["ok"] !== true) {
      const reason = isRecord(reply) ? String(reply["reason"] ?? "no reason") : "no reply";
      throw new RunAbort("setup_failed", `${endpoint}: ${reason}`);
    }
  }
}

function listedAccounts(rows: unknown[]): Set<string> {
  return new Set(rows.flatMap((row) => (isRecord(row) && typeof row["account"] === "string" ? [row["account"]] : [])));
}

export async function deleteAccounts({ exec, accounts }: { exec: Exec; accounts: readonly string[] }): Promise<string[]> {
  for (const account of accounts) await exec([...SOAP, "delete", account], { timeoutMs: SOAP_TIMEOUT_MS });
  const { code, stderr, stdout } = await exec([...SOAP, "list"], { timeoutMs: SOAP_TIMEOUT_MS });
  const rows = parseJsonOutput(stdout);
  if (code !== 0 || !Array.isArray(rows)) throw new Error(`soap list exited ${code}: ${lastLine(stderr)}`);
  const listed = listedAccounts(rows);
  return accounts.filter((account) => listed.has(account));
}

export async function quarantine({ runDir, files }: { runDir: string; files: readonly string[] }): Promise<void> {
  if (files.length === 0) return;
  await mkdir(`${runDir}/quarantine`, { mode: 0o700, recursive: true });
  for (const file of files) await rename(`${runDir}/${file}`, `${runDir}/quarantine/${file.replaceAll("/", "_")}`);
}

export async function removeSessionFiles(runDir: string): Promise<void> {
  await rm(sessionFile(runDir, "agent"), { force: true });
  await rm(sessionFile(runDir, "partner"), { force: true });
}
```

`deleteAccounts` never passes `--with-passwords`; the `soap list` output is parsed in memory and never written or printed.

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/accounts.test.ts`
Expected: PASS, 10 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/accounts.ts packages/harness/src/grader/accounts.test.ts
mise exec -- git commit -m "chore: Create and clean up eval accounts" -m "Eval-suite steps 2, 3 and 13 need throwaway soap accounts whose password stays in one mode-600 file and whose deletion is confirmed, even after an abort."
```

---

## Task E7b: Steer schedule and end detection

**Files:**
- Create: `packages/harness/src/grader/steer.ts` (new E7 file, contract issue 6)
- Test: `packages/harness/src/grader/steer.test.ts`

**Interfaces:**
- Consumes: E5 `Scenario`, `SteerAt`; E6a `TriggerRow`, `ProgressJson`.
- Produces:
  - `export const RESCUE_NUDGE = "You seem stuck. What is blocking you?";`
  - `export const BUDGET_STOP = "Stop now and tell me where you got to.";`
  - `export const DONE_QUIET_MS = 30_000;`, `export const STOP_GRACE_MS = 60_000;`, `export const STATUS_STALE_MS = 30_000;`
  - `export function stuckAfterMs(tier: number): number;` (90 s tier 0, 480 s tier 8, else 180 s; eval-suite step 11)
  - `export function stuckStopMs(tier: number): number;` (60 s tier 0, else 120 s)
  - `export type SteerCursor = { index: number; since: number };`
  - `export function dueSteer(init: { steers: Scenario["steers"]; cursor: SteerCursor; triggers: readonly TriggerRow[]; now: number }): Scenario["steers"][number] | undefined;` (sequential semantics of contract issue 4)
  - `export function describeAt(at: SteerAt): string;` (`fight_start` or `elapsed:25000`)
  - `export type EndMemory = { taskMs: number; nudgedAt: number | undefined; stopAt: number | undefined; stopReason: "budget" | "stuck" | undefined };`
  - `export type EndView = { now: number; tier: number; budgetMs: number; progress: ProgressJson | undefined; lastAnswerAt: number | undefined; statusAt: number };`
  - `export type EndAction = { kind: "wait" } | { kind: "nudge" } | { kind: "stop"; reason: "budget" | "stuck" } | { kind: "end"; end: "done" | "budget" | "stuck"; escape: boolean } | { kind: "abort"; evidence: string };`
  - `export function endAction(view: EndView, memory: EndMemory): EndAction;`
- End rules (eval-suite step 11, made mechanical): **abort** when `status.json` is older than 30 s; after a stop steer, **end** when the agent answered after the stop and is idle, or with an Escape after 60 s; **stop** (`budget`) when the wall budget is spent; **done** when an answer came after the task, the agent is idle, and nothing (answer, progress, tool call) happened for 30 s; one **nudge** after `stuckAfterMs` without progress or answer; **stop** (`stuck`) when, after the nudge, `stuckStopMs` passed both since the nudge and since the last activity. The rule "the same failing call five times" stays with the grader agent; the runner has no tool-argument view.

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/steer.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Scenario } from "#harness/grader/scenarios";
import { describeAt, dueSteer, type EndMemory, type EndView, endAction, stuckAfterMs, stuckStopMs } from "#harness/grader/steer";
import type { ProgressJson, TriggerRow } from "#harness/grader/watch";

const steers: Scenario["steers"] = [
  { at: { kind: "trigger", trigger: "fight_start" }, text: "Stop! Stop right now." },
  { at: { kind: "elapsed", ms: 25_000 }, text: "OK, carry on, but only use Smite from now on." },
];

const trig = (trigger: TriggerRow["trigger"], ms: number): TriggerRow => ({ ms, seq: 1, text: trigger, trigger });

const TASK = 100_000;
const memory = (overrides: Partial<EndMemory> = {}): EndMemory => ({ nudgedAt: undefined, stopAt: undefined, stopReason: undefined, taskMs: TASK, ...overrides });

function progress(overrides: Partial<ProgressJson> = {}): ProgressJson {
  return { agent: "idle", at: 0, idleSinceMs: undefined, lastProgress: undefined, lastToolCallAt: undefined, ...overrides };
}

function view(now: number, overrides: Partial<EndView> = {}): EndView {
  return { budgetMs: 600_000, lastAnswerAt: undefined, now, progress: progress(), statusAt: now, tier: 1, ...overrides };
}

describe("dueSteer", () => {
  test("a trigger steer waits for a matching row after the cursor", () => {
    const cursor = { index: 0, since: 1000 };
    expect(dueSteer({ cursor, now: 5000, steers, triggers: [trig("fight_start", 900)] })).toBeUndefined();
    expect(dueSteer({ cursor, now: 5000, steers, triggers: [trig("kill", 2000)] })).toBeUndefined();
    expect(dueSteer({ cursor, now: 5000, steers, triggers: [trig("fight_start", 2000)] })).toBe(steers[0]);
  });

  test("an elapsed steer counts from the previous steer", () => {
    const cursor = { index: 1, since: 10_000 };
    expect(dueSteer({ cursor, now: 34_999, steers, triggers: [] })).toBeUndefined();
    expect(dueSteer({ cursor, now: 35_000, steers, triggers: [] })).toBe(steers[1]);
  });

  test("nothing is due after the last steer", () => {
    expect(dueSteer({ cursor: { index: 2, since: 0 }, now: 99_999, steers, triggers: [trig("fight_start", 5)] })).toBeUndefined();
  });

  test("describeAt names the trigger or the delay", () => {
    expect(steers.map((steer) => describeAt(steer.at))).toEqual(["fight_start", "elapsed:25000"]);
  });
});

describe("stuck thresholds", () => {
  test("follow eval-suite step 11", () => {
    expect([0, 1, 7, 8].map(stuckAfterMs)).toEqual([90_000, 180_000, 180_000, 480_000]);
    expect([0, 1, 8].map(stuckStopMs)).toEqual([60_000, 120_000, 120_000]);
  });
});

describe("endAction", () => {
  test("waits while the agent works", () => {
    const busy = progress({ agent: "tool", lastProgress: { at: TASK + 10_000, event: "nav/route_start" } });
    expect(endAction(view(TASK + 20_000, { progress: busy }), memory())).toEqual({ kind: "wait" });
  });

  test("ends as done after an answer and 30 s of quiet", () => {
    const answered = { lastAnswerAt: TASK + 5000 };
    expect(endAction(view(TASK + 34_999, answered), memory())).toEqual({ kind: "wait" });
    expect(endAction(view(TASK + 35_000, answered), memory())).toEqual({ end: "done", escape: false, kind: "end" });
  });

  test("is not done while the agent still streams", () => {
    const streaming = { lastAnswerAt: TASK + 5000, progress: progress({ agent: "streaming" }) };
    expect(endAction(view(TASK + 60_000, streaming), memory())).toEqual({ kind: "wait" });
  });

  test("stops at the wall budget", () => {
    expect(endAction(view(TASK + 600_000), memory())).toEqual({ kind: "stop", reason: "budget" });
  });

  test("nudges once when stuck, then stops", () => {
    const stuckAt = TASK + 180_000;
    expect(endAction(view(stuckAt - 1), memory())).toEqual({ kind: "wait" });
    expect(endAction(view(stuckAt), memory())).toEqual({ kind: "nudge" });
    const nudged = memory({ nudgedAt: stuckAt });
    expect(endAction(view(stuckAt + 119_999), nudged)).toEqual({ kind: "wait" });
    expect(endAction(view(stuckAt + 120_000), nudged)).toEqual({ kind: "stop", reason: "stuck" });
  });

  test("tier 0 nudges after 90 s", () => {
    expect(endAction(view(TASK + 90_000, { tier: 0 }), memory())).toEqual({ kind: "nudge" });
  });

  test("after a stop, ends when the agent answered and is idle, else escapes after 60 s", () => {
    const stopped = memory({ stopAt: TASK + 600_000, stopReason: "budget" });
    const busy = progress({ agent: "tool" });
    expect(endAction(view(TASK + 610_000, { progress: busy }), stopped)).toEqual({ kind: "wait" });
    expect(endAction(view(TASK + 610_000, { lastAnswerAt: TASK + 605_000 }), stopped)).toEqual({ end: "budget", escape: false, kind: "end" });
    expect(endAction(view(TASK + 660_000, { progress: busy }), stopped)).toEqual({ end: "budget", escape: true, kind: "end" });
  });

  test("aborts when status.json stops changing", () => {
    expect(endAction(view(TASK + 40_000, { statusAt: TASK + 9999 }), memory())).toEqual({ evidence: "status.json not updated for 30 s", kind: "abort" });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/steer.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/steer'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/steer.ts`:

```ts
import type { Scenario, SteerAt } from "#harness/grader/scenarios";
import type { ProgressJson, TriggerRow } from "#harness/grader/watch";

export const RESCUE_NUDGE = "You seem stuck. What is blocking you?";
export const BUDGET_STOP = "Stop now and tell me where you got to.";
export const DONE_QUIET_MS = 30_000;
export const STOP_GRACE_MS = 60_000;
export const STATUS_STALE_MS = 30_000;

export type SteerCursor = { index: number; since: number };
export type EndMemory = { taskMs: number; nudgedAt: number | undefined; stopAt: number | undefined; stopReason: "budget" | "stuck" | undefined };
export type EndView = { now: number; tier: number; budgetMs: number; progress: ProgressJson | undefined; lastAnswerAt: number | undefined; statusAt: number };
export type EndAction =
  | { kind: "wait" }
  | { kind: "nudge" }
  | { kind: "stop"; reason: "budget" | "stuck" }
  | { kind: "end"; end: "done" | "budget" | "stuck"; escape: boolean }
  | { kind: "abort"; evidence: string };

type Steer = Scenario["steers"][number];
type DueInit = { steers: Scenario["steers"]; cursor: SteerCursor; triggers: readonly TriggerRow[]; now: number };

const WAIT: EndAction = { kind: "wait" };

export function stuckAfterMs(tier: number): number {
  if (tier === 0) return 90_000;
  return tier === 8 ? 480_000 : 180_000;
}

export function stuckStopMs(tier: number): number {
  return tier === 0 ? 60_000 : 120_000;
}

export function dueSteer({ steers, cursor, triggers, now }: DueInit): Steer | undefined {
  const steer = steers[cursor.index];
  if (steer === undefined) return undefined;
  const { at } = steer;
  if (at.kind === "elapsed") return now - cursor.since >= at.ms ? steer : undefined;
  return triggers.some((row) => row.trigger === at.trigger && row.ms > cursor.since) ? steer : undefined;
}

export function describeAt(at: SteerAt): string {
  return at.kind === "trigger" ? at.trigger : `elapsed:${at.ms}`;
}

function afterStop(view: EndView, memory: EndMemory, stopAt: number): EndAction {
  const end = memory.stopReason ?? "budget";
  if (view.now - stopAt >= STOP_GRACE_MS) return { end, escape: true, kind: "end" };
  const answered = (view.lastAnswerAt ?? -1) >= stopAt;
  return answered && view.progress?.agent === "idle" ? { end, escape: false, kind: "end" } : WAIT;
}

function isDone({ now, progress, lastAnswerAt }: EndView, taskMs: number): boolean {
  if (lastAnswerAt === undefined || lastAnswerAt < taskMs || progress?.agent !== "idle") return false;
  const quietSince = Math.max(lastAnswerAt, progress.lastProgress?.at ?? 0, progress.lastToolCallAt ?? 0);
  return now - quietSince >= DONE_QUIET_MS;
}

function stuckAction(view: EndView, memory: EndMemory): EndAction {
  const active = Math.max(memory.taskMs, view.lastAnswerAt ?? 0, view.progress?.lastProgress?.at ?? 0);
  if (memory.nudgedAt === undefined) return view.now - active >= stuckAfterMs(view.tier) ? { kind: "nudge" } : WAIT;
  const waited = Math.min(view.now - memory.nudgedAt, view.now - active);
  return waited >= stuckStopMs(view.tier) ? { kind: "stop", reason: "stuck" } : WAIT;
}

export function endAction(view: EndView, memory: EndMemory): EndAction {
  if (view.now - view.statusAt > STATUS_STALE_MS) return { evidence: `status.json not updated for ${STATUS_STALE_MS / 1000} s`, kind: "abort" };
  if (memory.stopAt !== undefined) return afterStop(view, memory, memory.stopAt);
  if (view.now - memory.taskMs >= view.budgetMs) return { kind: "stop", reason: "budget" };
  if (isDone(view, memory.taskMs)) return { end: "done", escape: false, kind: "end" };
  return stuckAction(view, memory);
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/steer.test.ts`
Expected: PASS, 13 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/steer.ts packages/harness/src/grader/steer.test.ts
mise exec -- git commit -m "chore: Schedule eval steers and detect the end" -m "The runner must type scripted steers on triggers and stop a run on done, budget or stuck exactly as eval-suite step 11 says, and those rules are pure enough to test alone."
```

---

## Task E7c: Efficiency from the Pi session

**Files:**
- Create: `packages/harness/src/grader/efficiency.ts` (new E7 file, contract issue 6)
- Test: `packages/harness/src/grader/efficiency.test.ts`

**Interfaces:**
- Consumes: E1a `parseJsonOutput`, `isRecord`; E4 `EvalEfficiency`; E5 `Scenario`. Pi session entries (read in `pi-coding-agent/dist/core/session-manager.d.ts` and `pi-ai/dist/types.d.ts`, 0.87.1): each line is `{ type: "message", message }`; an assistant message has `role: "assistant"`, `usage: { input, output, cacheRead, reasoning? }` and `content` parts with `{ type: "toolCall", name }`; a tool result has `role: "toolResult"` and `isError: boolean`.
- Produces:
  - `export type SessionUsage = { turns: number; toolCalls: number; toolCallsByName: Record<string, number>; toolErrors: number; tokens: { input: number; cachedInput: number; output: number; reasoning: number } };`
  - `export function sessionUsage(jsonl: string): SessionUsage;` (bad lines are skipped)
  - `export function readSessionUsage(file: string): Promise<SessionUsage>;` (a missing file gives zeros)
  - `export function efficiency(init: { usage: SessionUsage; wallMs: number; budget: Scenario["budget"]; firstActionMs: number | undefined }): EvalEfficiency;` (budget ratios rounded to 2 places)

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/efficiency.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { efficiency, readSessionUsage, sessionUsage } from "#harness/grader/efficiency";

const usage = (input: number, cacheRead: number, output: number, reasoning?: number) => ({ cacheRead, cacheWrite: 0, input, output, reasoning, totalTokens: input + output });

const LINES = [
  { cwd: "/wt/tmp/evals/1/t0-self-state-1/workspace", id: "s1", timestamp: "2026-09-26T21:00:00.000Z", type: "session" },
  { id: "m1", message: { content: [{ text: "Quick status", type: "text" }], role: "user" }, parentId: null, timestamp: "t", type: "message" },
  {
    id: "m2",
    message: { content: [{ type: "thinking" }, { arguments: {}, id: "c1", name: "look", type: "toolCall" }, { arguments: {}, id: "c2", name: "journal", type: "toolCall" }], role: "assistant", usage: usage(1200, 900, 80, 10) },
    parentId: "m1",
    timestamp: "t",
    type: "message",
  },
  { id: "m3", message: { content: [], isError: true, role: "toolResult", toolCallId: "c1", toolName: "look" }, parentId: "m2", timestamp: "t", type: "message" },
  { id: "m4", message: { content: [{ text: "Level 10.", type: "text" }], role: "assistant", usage: usage(1500, 1100, 40) }, parentId: "m3", timestamp: "t", type: "message" },
];

const JSONL = `${LINES.map((line) => JSON.stringify(line)).join("\n")}\n{"broken":\n`;

describe("sessionUsage", () => {
  test("counts turns, tool calls, tool errors and tokens", () => {
    expect(sessionUsage(JSONL)).toEqual({
      tokens: { cachedInput: 2000, input: 2700, output: 120, reasoning: 10 },
      toolCalls: 2,
      toolCallsByName: { journal: 1, look: 1 },
      toolErrors: 1,
      turns: 2,
    });
  });

  test("gives zeros for a missing session file", async () => {
    const dir = await mkdtemp(`${tmpdir()}/session-`);
    expect((await readSessionUsage(`${dir}/session.jsonl`)).turns).toBe(0);
  });
});

describe("efficiency", () => {
  test("fills the schema fields and budget ratios", () => {
    const result = efficiency({ budget: { minutes: 3, tools: 10, turns: 4 }, firstActionMs: 4200, usage: sessionUsage(JSONL), wallMs: 72_000 });
    expect(result).toEqual({
      budgetRatio: { toolCalls: 0.2, turns: 0.5, wallSec: 0.4 },
      timeToFirstActionSec: 4.2,
      tokens: { cachedInput: 2000, input: 2700, output: 120, reasoning: 10 },
      toolCalls: 2,
      toolCallsByName: { journal: 1, look: 1 },
      toolErrors: 1,
      turns: 2,
      wallSec: 72,
    });
  });

  test("leaves out the first-action time when no tool was called", () => {
    const result = efficiency({ budget: { minutes: 3, tools: 10, turns: 4 }, firstActionMs: undefined, usage: sessionUsage(""), wallMs: 1000 });
    expect(result.timeToFirstActionSec).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/efficiency.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/efficiency'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/efficiency.ts`:

```ts
import { isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { EvalEfficiency } from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";

export type SessionUsage = {
  turns: number;
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  toolErrors: number;
  tokens: { input: number; cachedInput: number; output: number; reasoning: number };
};

type EfficiencyInit = { usage: SessionUsage; wallMs: number; budget: Scenario["budget"]; firstActionMs: number | undefined };

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const ratio = (value: number, cap: number): number => Math.round((value / cap) * 100) / 100;

function emptyUsage(): SessionUsage {
  return { tokens: { cachedInput: 0, input: 0, output: 0, reasoning: 0 }, toolCalls: 0, toolCallsByName: {}, toolErrors: 0, turns: 0 };
}

function messageIn(entry: unknown): Record<string, unknown> | undefined {
  if (!isRecord(entry) || entry["type"] !== "message") return undefined;
  const message = entry["message"];
  return isRecord(message) ? message : undefined;
}

function toolNames(content: unknown): string[] {
  const parts = Array.isArray(content) ? content : [];
  return parts.flatMap((part) => (isRecord(part) && part["type"] === "toolCall" && typeof part["name"] === "string" ? [part["name"]] : []));
}

function addAssistant(usage: SessionUsage, message: Record<string, unknown>): void {
  const tokens = isRecord(message["usage"]) ? message["usage"] : {};
  usage.turns += 1;
  usage.tokens.input += count(tokens["input"]);
  usage.tokens.cachedInput += count(tokens["cacheRead"]);
  usage.tokens.output += count(tokens["output"]);
  usage.tokens.reasoning += count(tokens["reasoning"]);
  for (const name of toolNames(message["content"])) {
    usage.toolCalls += 1;
    usage.toolCallsByName[name] = (usage.toolCallsByName[name] ?? 0) + 1;
  }
}

export function sessionUsage(jsonl: string): SessionUsage {
  const usage = emptyUsage();
  for (const line of jsonl.split("\n")) {
    const message = messageIn(parseJsonOutput(line));
    if (message?.["role"] === "assistant") addAssistant(usage, message);
    if (message?.["role"] === "toolResult" && message["isError"] === true) usage.toolErrors += 1;
  }
  return usage;
}

export async function readSessionUsage(file: string): Promise<SessionUsage> {
  const handle = Bun.file(file);
  return sessionUsage((await handle.exists()) ? await handle.text() : "");
}

export function efficiency({ usage, wallMs, budget, firstActionMs }: EfficiencyInit): EvalEfficiency {
  const wallSec = wallMs / 1000;
  return {
    budgetRatio: { toolCalls: ratio(usage.toolCalls, budget.tools), turns: ratio(usage.turns, budget.turns), wallSec: ratio(wallSec, budget.minutes * 60) },
    timeToFirstActionSec: firstActionMs === undefined ? undefined : firstActionMs / 1000,
    tokens: { ...usage.tokens },
    toolCalls: usage.toolCalls,
    toolCallsByName: { ...usage.toolCallsByName },
    toolErrors: usage.toolErrors,
    turns: usage.turns,
    wallSec,
  };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/efficiency.test.ts`
Expected: PASS, 4 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/efficiency.ts packages/harness/src/grader/efficiency.test.ts
mise exec -- git commit -m "chore: Count eval efficiency from the Pi session" -m "Every result carries turns, tool calls and tokens (eval-suite principle 7), and the Pi session JSONL is the only place that has them per assistant message."
```

---

## Task E7d: Harness stop, cleanup and the draft result

**Files:**
- Create: `packages/harness/src/grader/run-finish.ts` (new E7 file, contract issue 6)
- Test: `packages/harness/src/grader/run-finish.test.ts`

**Interfaces:**
- Consumes: E7a `AccountNames`, `deleteAccounts`, `quarantine`, `removeSessionFiles`, `sessionFile`; E7c `efficiency`, `readSessionUsage`; E3 `finalTruth`, `leakCheck`; E4 `EvalCheck`, `EvalEvidence`, `EvalIntervention`, `EvalResult`, `FrictionItem`, `validateResult`; E5 `Scenario`, `ScenarioCheck`, `loadScenario` (test); E6b `Watcher`; E1b `Pane`; F2 `Clock`; `messageOf`.
- Produces:
  - `export const EXIT_WAIT_MS = 20_000;`
  - `export const DRAFT_REASON = "draft: the grader decides the checks, friction and verdict";`
  - `export type RunState = { exec; clock; scenario; round; replica; runDir; tab; sha; truthWaitMs; agent; partner; pane; watcher; taskMs; exitMs; firstToolAt; end; abort; interventions; finalSavedAt; cleanupFailed; leaks; notes }` (full type below)
  - `export type RunStateInit = Pick<RunState, "exec" | "clock" | "scenario" | "round" | "replica" | "runDir" | "tab" | "sha"> & { truthWaitMs?: number };`
  - `export function newRunState(init: RunStateInit): RunState;`
  - `export function writeJson(file: string, value: unknown): Promise<void>;`
  - `export function accountsOf(st: RunState): string[];`
  - `export function stopHarness(st: RunState): Promise<void>;` (watcher stop first, so the last frame is saved; then quit and wait `EXIT_WAIT_MS`; `exitMs`; partner `stop`; final truth only when a pane was opened; a failed final truth sets `abort` unless one is already set; never throws)
  - `export function cleanup(st: RunState): Promise<void>;` (close the pane, delete every account, leak check and quarantine, remove `account.json`/`partner.json`, write `cleanup-failed` with the accounts still listed; each step runs even when an earlier one failed; never throws on a step failure)
  - `export function summaryLine(result: EvalResult, label: string): string;` → `<scenario>-<replica> <label> <met>/<checks> tools=<n> wall=<s>` (eval-suite step 14)
  - `export function writeOutcome(st: RunState): Promise<string>;` (`result.json` for an aborted run, else `grader/draft.json`; both pass `validateResult`; returns the summary line with label `aborted` or `draft`)

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/run-finish.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { bunExec, type Exec } from "#harness/grader/exec";
import { type EvalResult, validateResult } from "#harness/grader/result";
import { cleanup, newRunState, type RunState, stopHarness, writeOutcome } from "#harness/grader/run-finish";
import { loadScenario } from "#harness/grader/scenarios";
import { failed, ok } from "#test-support/fake-exec";
import { fakePane } from "#test-support/fake-pane";

const ACC = "FAC0123456789";
const PARTNER = "FAC0000000002";
const PASSWORD = "pw-secret-123";
const NOW = Date.parse("2026-09-26T21:00:00.000Z");
const AGENT = { account: ACC, character: "Fevala", preset: "eversong10", wrapper: `/wt/tmp/tc-${ACC}` };

function truth(savedAt: string): string {
  return JSON.stringify({
    account: ACC, alive: true, class: 5, deathState: "alive", guid: 1, health: 100, inventory: [], level: 10, money: 50_000, name: "Fevala", ok: true,
    online: false, position: { map: 530, o: 0, x: 8735, y: -6685, z: 70.5, zone: 3430 }, quests: [], race: 10, rewardedQuests: [], savedAt, spells: [], xp: 0,
  });
}

type Router = { calls: string[][]; exec: Exec };

function router(opts: { savedAt?: string; listed?: string[] } = {}): Router {
  const calls: string[][] = [];
  const exec: Exec = async (argv, execOpts) => {
    calls.push([...argv]);
    if (argv[0] === "rg") return bunExec(argv, execOpts);
    if (argv[3] === "truth") return ok(truth(opts.savedAt ?? new Date(NOW).toISOString()));
    if (argv[3] === "list") return ok(JSON.stringify((opts.listed ?? []).map((account) => ({ account }))));
    return ok();
  };
  return { calls, exec };
}

async function state(exec: Exec, overrides: Partial<RunState> = {}): Promise<RunState> {
  const runDir = await mkdtemp(`${tmpdir()}/finish-`);
  await mkdir(`${runDir}/grader`);
  await mkdir(`${runDir}/frames`);
  const base = newRunState({ clock: { now: () => NOW }, exec, replica: 1, round: 1, runDir, scenario: loadScenario("t0-self-state"), sha: "3af5aa3", tab: "eval-1-t0-self-state-1", truthWaitMs: 1 });
  return { ...base, agent: AGENT, ...overrides };
}

describe("stopHarness", () => {
  test("stops the watcher before the quit and keeps a fresh final truth", async () => {
    const order: string[] = [];
    const { exec } = router();
    const pane = { ...fakePane(["x"]), quit: async () => { order.push("quit"); } };
    const st = await state(exec, { pane, watcher: { stop: async () => { order.push("watcher"); } } });
    await stopHarness(st);
    expect(order).toEqual(["watcher", "quit"]);
    expect(st.exitMs).toBe(NOW);
    expect(st.finalSavedAt).toBe("2026-09-26T21:00:00.000Z");
    expect(st.abort).toBeUndefined();
    expect((await Bun.file(`${st.runDir}/final.json`).json()).level).toBe(10);
  });

  test("a stale final truth aborts the run as stale_truth", async () => {
    const { calls, exec } = router({ savedAt: "2026-09-25T10:00:00.000Z" });
    const st = await state(exec, { pane: fakePane(["x"]) });
    await stopHarness(st);
    expect(st.abort?.cause).toBe("stale_truth");
    expect(calls.filter((call) => call[3] === "truth")).toHaveLength(3);
  });

  test("keeps an earlier abort cause", async () => {
    const { exec } = router({ savedAt: "2026-09-25T10:00:00.000Z" });
    const st = await state(exec, { abort: { cause: "wrong_character", evidence: "Xiara" }, pane: fakePane(["x"]) });
    await stopHarness(st);
    expect(st.abort?.cause).toBe("wrong_character");
  });

  test("without a pane it only stops the partner", async () => {
    const { calls, exec } = router();
    const partner = { ...AGENT, account: PARTNER, wrapper: `/wt/tmp/tc-${PARTNER}` };
    const st = await state(exec, { partner });
    await stopHarness(st);
    expect(calls).toEqual([[`/wt/tmp/tc-${PARTNER}`, "stop"]]);
  });
});

describe("cleanup", () => {
  test("deletes the accounts, quarantines leaks and removes the session files", async () => {
    const { calls, exec } = router();
    const st = await state(exec, { pane: fakePane(["x"]) });
    await writeFile(`${st.runDir}/account.json`, JSON.stringify({ account: ACC, password: PASSWORD }), { mode: 0o600 });
    await writeFile(`${st.runDir}/frames/00000-1.txt`, `echo ${PASSWORD}`);
    await cleanup(st);
    expect(calls.filter((call) => call[3] === "delete")).toEqual([["bun", "packages/factory/src/main.ts", "soap", "delete", ACC]]);
    expect(st.leaks).toEqual(["frames/00000-1.txt"]);
    expect(await readdir(`${st.runDir}/quarantine`)).toEqual(["frames_00000-1.txt"]);
    expect(await Bun.file(`${st.runDir}/account.json`).exists()).toBe(false);
    expect(await Bun.file(`${st.runDir}/cleanup-failed`).exists()).toBe(false);
  });

  test("writes cleanup-failed when an account is still listed", async () => {
    const { exec } = router({ listed: [ACC] });
    const st = await state(exec);
    await cleanup(st);
    expect(await Bun.file(`${st.runDir}/cleanup-failed`).text()).toBe(`${ACC}\n`);
  });

  test("a failed close still deletes the accounts", async () => {
    const { calls, exec } = router();
    const pane = { ...fakePane(["x"]), close: () => Promise.reject(new Error("no runtime")) };
    const st = await state(exec, { pane });
    await cleanup(st);
    expect(calls.some((call) => call[3] === "delete")).toBe(true);
    expect(st.notes).toContain("close: no runtime");
  });

  test("a failed soap list marks every account as not cleaned", async () => {
    const exec: Exec = async (argv) => (argv[3] === "list" ? failed(1, "service down") : ok());
    const st = await state(exec);
    await cleanup(st);
    expect(await Bun.file(`${st.runDir}/cleanup-failed`).text()).toBe(`${ACC}\n`);
  });
});

describe("writeOutcome", () => {
  test("writes a schema-valid draft for a finished run", async () => {
    const { exec } = router();
    const st = await state(exec, { end: "done", exitMs: NOW, finalSavedAt: "2026-09-26T21:00:00.000Z", taskMs: NOW - 72_000 });
    expect(await writeOutcome(st)).toBe("t0-self-state-1 draft 0/5 tools=0 wall=72");
    const draft = (await Bun.file(`${st.runDir}/grader/draft.json`).json()) as EvalResult;
    expect(validateResult(draft)).toEqual([]);
    expect(draft.checks.map((check) => check.id)).toEqual(["level", "money", "free-slots", "main-hand", "vitals"]);
    expect(draft.checks[0]).toEqual({ expected: "the stated level equals T baseline level", id: "level", met: false, observed: null, source: "truth" });
    expect(draft.accounts).toEqual([ACC]);
    expect(await Bun.file(`${st.runDir}/result.json`).exists()).toBe(false);
  });

  test("writes result.json for an aborted run with a leak friction item", async () => {
    const { exec } = router();
    const st = await state(exec, { abort: { cause: "launch_failed", evidence: "orca runtime not reachable" }, end: "abort", leaks: ["frames/00000-1.txt"] });
    expect(await writeOutcome(st)).toStartWith("t0-self-state-1 aborted 0/5 ");
    const result = (await Bun.file(`${st.runDir}/result.json`).json()) as EvalResult;
    expect(validateResult(result)).toEqual([]);
    expect(result.verdict).toBe("aborted");
    expect(result.verdictReason).toBe("launch_failed");
    expect(result.friction[0]).toEqual({
      area: "tool",
      category: "credential-leak",
      quote: "a password was found in frames/00000-1.txt; the file is in quarantine/",
      ref: "quarantine/frames_00000-1.txt",
      severity: "blocker",
    });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/run-finish.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/run-finish'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/run-finish.ts`:

```ts
import { readdir, writeFile } from "node:fs/promises";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import { type AccountNames, deleteAccounts, quarantine, removeSessionFiles, sessionFile } from "#harness/grader/accounts";
import { efficiency, readSessionUsage } from "#harness/grader/efficiency";
import type { Exec } from "#harness/grader/exec";
import type { Pane } from "#harness/grader/pane";
import { type EvalCheck, type EvalEvidence, type EvalIntervention, type EvalResult, type FrictionItem, validateResult } from "#harness/grader/result";
import type { Scenario, ScenarioCheck } from "#harness/grader/scenarios";
import { finalTruth, leakCheck } from "#harness/grader/truth";
import type { Watcher } from "#harness/grader/watch";

export const EXIT_WAIT_MS = 20_000;
export const DRAFT_REASON = "draft: the grader decides the checks, friction and verdict";

const PARTNER_STOP_MS = 60_000;
const NOTES_MAX = 1500;

export type RunState = {
  exec: Exec;
  clock: Clock;
  scenario: Scenario;
  round: number;
  replica: number;
  runDir: string;
  tab: string;
  sha: string;
  truthWaitMs: number;
  agent: AccountNames | undefined;
  partner: AccountNames | undefined;
  pane: Pane | undefined;
  watcher: Watcher | undefined;
  taskMs: number | undefined;
  exitMs: number | undefined;
  firstToolAt: number | undefined;
  end: EvalResult["end"];
  abort: EvalResult["abort"];
  interventions: EvalIntervention[];
  finalSavedAt: string | undefined;
  cleanupFailed: string[];
  leaks: string[];
  notes: string[];
};

export type RunStateInit = Pick<RunState, "exec" | "clock" | "scenario" | "round" | "replica" | "runDir" | "tab" | "sha"> & { truthWaitMs?: number };

export function newRunState({ truthWaitMs = 10_000, ...init }: RunStateInit): RunState {
  return {
    ...init,
    abort: undefined,
    agent: undefined,
    cleanupFailed: [],
    end: undefined,
    exitMs: undefined,
    finalSavedAt: undefined,
    firstToolAt: undefined,
    interventions: [],
    leaks: [],
    notes: [],
    pane: undefined,
    partner: undefined,
    taskMs: undefined,
    truthWaitMs,
    watcher: undefined,
  };
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function accountsOf(st: RunState): string[] {
  return [st.agent?.account, st.partner?.account].filter((account): account is string => account !== undefined);
}

async function attempt(st: RunState, what: string, job: () => Promise<unknown>): Promise<void> {
  try {
    await job();
  } catch (err) {
    st.notes.push(`${what}: ${messageOf(err)}`);
  }
}

async function quitPane(st: RunState, pane: Pane): Promise<void> {
  await pane.quit();
  if (!(await pane.waitExit(EXIT_WAIT_MS))) st.notes.push(`quit: the harness did not exit within ${EXIT_WAIT_MS / 1000} s`);
}

async function verifyFinal(st: RunState, account: string): Promise<void> {
  const final = await finalTruth({ account, exec: st.exec, exitMs: st.exitMs ?? st.clock.now(), waitMs: st.truthWaitMs });
  if (!final.ok) {
    st.abort ??= { cause: final.cause, evidence: final.detail };
    return;
  }
  await writeJson(`${st.runDir}/final.json`, final.truth);
  st.finalSavedAt = final.truth.savedAt;
}

export async function stopHarness(st: RunState): Promise<void> {
  const { agent, pane, partner, watcher } = st;
  if (watcher !== undefined) await attempt(st, "watcher", () => watcher.stop());
  if (pane !== undefined) await attempt(st, "quit", () => quitPane(st, pane));
  if (pane !== undefined) st.exitMs = st.clock.now();
  if (partner !== undefined) await attempt(st, "partner stop", () => st.exec([partner.wrapper, "stop"], { timeoutMs: PARTNER_STOP_MS }));
  if (pane !== undefined && agent !== undefined) await attempt(st, "final truth", () => verifyFinal(st, agent.account));
}

async function deleteAll(st: RunState, accounts: string[]): Promise<void> {
  if (accounts.length === 0) return;
  try {
    st.cleanupFailed = await deleteAccounts({ accounts, exec: st.exec });
  } catch (err) {
    st.cleanupFailed = [...accounts];
    st.notes.push(`delete: ${messageOf(err)}`);
  }
}

async function checkLeaks(st: RunState): Promise<void> {
  const secretFiles = [sessionFile(st.runDir, "agent"), sessionFile(st.runDir, "partner")];
  st.leaks = await leakCheck({ exec: st.exec, runDir: st.runDir, secretFiles });
  await quarantine({ files: st.leaks, runDir: st.runDir });
}

export async function cleanup(st: RunState): Promise<void> {
  const { pane } = st;
  if (pane !== undefined) await attempt(st, "close", () => pane.close());
  await deleteAll(st, accountsOf(st));
  await attempt(st, "leak check", () => checkLeaks(st));
  await attempt(st, "session files", () => removeSessionFiles(st.runDir));
  if (st.cleanupFailed.length > 0) await writeFile(`${st.runDir}/cleanup-failed`, `${st.cleanupFailed.join("\n")}\n`);
}

export function summaryLine(result: EvalResult, label: string): string {
  const met = result.checks.filter((check) => check.met).length;
  const { toolCalls, wallSec } = result.efficiency;
  return `${result.scenario}-${result.replica} ${label} ${met}/${result.checks.length} tools=${toolCalls} wall=${Math.round(wallSec)}`;
}

function stubCheck({ expect, id, source }: ScenarioCheck): EvalCheck {
  return { expected: expect, id, met: false, observed: null, source };
}

function leakFriction(file: string): FrictionItem {
  const quote = `a password was found in ${file}; the file is in quarantine/`;
  return { area: "tool", category: "credential-leak", quote, ref: `quarantine/${file.replaceAll("/", "_")}`, severity: "blocker" };
}

async function evidenceOf(st: RunState): Promise<EvalEvidence> {
  const frames = await readdir(`${st.runDir}/frames`).then((names) => names.length, () => 0);
  const final = st.finalSavedAt === undefined ? undefined : "final.json";
  return { baseline: "baseline.json", final, finalSavedAt: st.finalSavedAt, frames, gameLog: "gamelog.jsonl", runDir: st.runDir, session: "session.jsonl" };
}

async function draftResult(st: RunState): Promise<EvalResult> {
  const now = st.clock.now();
  const taskMs = st.taskMs ?? now;
  const usage = await readSessionUsage(`${st.runDir}/session.jsonl`);
  const firstActionMs = st.firstToolAt === undefined ? undefined : st.firstToolAt - taskMs;
  const aborted = st.abort !== undefined;
  return {
    abort: st.abort,
    accounts: accountsOf(st),
    checks: st.scenario.checks.map(stubCheck),
    efficiency: efficiency({ budget: st.scenario.budget, firstActionMs, usage, wallMs: (st.exitMs ?? now) - taskMs }),
    end: st.end ?? (aborted ? "abort" : undefined),
    evidence: await evidenceOf(st),
    friction: st.leaks.map(leakFriction),
    interventions: st.interventions,
    notes: st.notes.length > 0 ? st.notes.join("\n").slice(0, NOTES_MAX) : undefined,
    replica: st.replica,
    round: st.round,
    scenario: st.scenario.id,
    sha: st.sha,
    tab: st.tab,
    verdict: aborted ? "aborted" : "fail",
    verdictReason: st.abort?.cause ?? DRAFT_REASON,
  };
}

export async function writeOutcome(st: RunState): Promise<string> {
  const result = await draftResult(st);
  const errors = validateResult(JSON.parse(JSON.stringify(result)));
  if (errors.length > 0) throw new Error(`the draft result breaks the schema: ${errors.join("; ")}`);
  const aborted = result.verdict === "aborted";
  await writeJson(aborted ? `${st.runDir}/result.json` : `${st.runDir}/grader/draft.json`, result);
  return summaryLine(result, aborted ? "aborted" : "draft");
}
```

`stubCheck` copies the scenario's `expect` text into `expected`; `observed: null` and `met: false` tell the grader agent which fields it must fill. The draft verdict is `fail` only as a placeholder; `DRAFT_REASON` says so, and `cli.ts result` is the only way to a graded `result.json`.

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/run-finish.test.ts`
Expected: PASS, 10 tests. Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/run-finish.ts packages/harness/src/grader/run-finish.test.ts
mise exec -- git commit -m "chore: Stop, clean up and draft each eval run" -m "Eval-suite steps 12 to 14 must run after any failure: quit after the last frame, check truth is fresh, delete every account, quarantine leaks and leave a schema-valid draft for the grader."
```

---

## Task E7e: The scenario runner

**Files:**
- Create: `packages/harness/src/grader/run.ts` (new E7 file, contract issue 6)
- Test: `packages/harness/src/grader/run.test.ts`

**Interfaces:**
- Consumes: E7a `applySetup`, `createAccount`, `Role`, `RunAbort`, `sessionFile`; E7b `BUDGET_STOP`, `RESCUE_NUDGE`, `describeAt`, `dueSteer`, `endAction`, `EndAction`, `EndMemory`, `EndView`, `SteerCursor`; E7d `RunState`, `newRunState`, `stopHarness`, `cleanup`, `writeOutcome`, `writeJson`; E6 `createLogTail`, `LogTail`, `lastAnswerAt`, `progressOf`, `readStatus`, `TriggerRow`, `triggerRows`, `watchRun`; E3a `readTruth`; E1b `harnessCommand`, `openPane`, `Pane`; E1a `Exec`, `bunExec` (test); E5 `Scenario`, `loadScenario` (test); E4 `validateResult`, `EvalResult` (test); F2 `Clock`, `GameLogEntry`, `LogEvent`, `Domain`, `StatusJson`; `messageOf`.
- Produces:
  - `export const POLL_MS = 2000;`, `export const READY_TIMEOUT_MS = 120_000;`, `export const SUBMIT_TIMEOUT_MS = 10_000;`
  - `export type RunInit = { exec: Exec; clock: Clock; sleep: (ms: number) => Promise<void>; log: (line: string) => void; worktree: string; scenario: Scenario; round: number; replica: number; truthWaitMs?: number };`
  - `export function runPaths(init: { worktree: string; round: number; scenario: string; replica: number }): { runDir: string; tab: string };` → `<worktree>/tmp/evals/<round>/<scenario>-<replica>` and `eval-<round>-<scenario>-<replica>` (eval-suite §3.2)
  - `export function runScenario(init: RunInit): Promise<string>;` (eval-suite steps 1-13; returns the E7d summary line; throws only when the run dir is already used or `git rev-parse HEAD` fails, before any account exists)
- Step mapping: 1 `run.json`; 2 `createAccount` (agent, then the partner or witness); 3 `applySetup`; 4 `baseline.json` (must be offline, else `aborted`/`other`; a failed read is `service_down`); 5 partner `start --json`; 6 `openPane(harnessCommand(...))` (failure → `launch_failed`); 7 ready = a `session/in_world` row and an editor rule (`─` × 20 or more) on screen within 120 s, the row's `char` must equal `names.json` `character` (else `wrong_character`), a pane that exits first is `launch_failed`; 7a `watchRun` (with the witness wrapper for `partner: "witness"`); 8 type the task, then wait up to 10 s for a `human/input` row (else `launch_failed`, never a second copy); 9-11 poll every 2 s: steers (E7b, `steers.jsonl`, intervention `steer`), then `endAction` (nudge → `RESCUE_NUDGE`, intervention `rescue`; stop → `BUDGET_STOP`, intervention `budget_stop`; end with Escape when `escape`; abort → `other`); 12-13 E7d `stopHarness`, `cleanup` (in `finally`), `writeOutcome`. Account names go to `log`; nothing prints a password.

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/run.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import { bunExec, type Exec, type ExecResult } from "#harness/grader/exec";
import { type EvalResult, validateResult } from "#harness/grader/result";
import { runPaths, runScenario } from "#harness/grader/run";
import { loadScenario, type Scenario } from "#harness/grader/scenarios";
import { BUDGET_STOP } from "#harness/grader/steer";
import { failed, ok, orcaOk } from "#test-support/fake-exec";

const ACC = "FAC0123456789";
const PASSWORD = "pw-secret-123";
const SELF_STATE = loadScenario("t0-self-state");
const EDITOR = ["", "─".repeat(40), "", "─".repeat(40), "gpt-6-luna • high"];

type World = {
  worktree: string;
  runDir: string;
  now: number;
  char: string;
  answers: boolean;
  launchFails: boolean;
  exited: boolean;
  seq: number;
  agent: StatusJson["agent"];
  calls: string[][];
  task: string;
};

async function newWorld(overrides: Partial<World> = {}): Promise<World> {
  const worktree = await mkdtemp(`${tmpdir()}/run-`);
  const { runDir } = runPaths({ replica: 1, round: 1, scenario: "t0-self-state", worktree });
  const base: World = { agent: "idle", answers: true, calls: [], char: "Fevala", exited: false, launchFails: false, now: Date.parse("2026-09-26T21:00:00.000Z"), runDir, seq: 0, task: SELF_STATE.task, worktree };
  return { ...base, ...overrides };
}

async function log(world: World, event: LogEvent, text: string): Promise<void> {
  world.seq += 1;
  const entry: GameLogEntry = { char: world.char, class: "passive", data: {}, domain: event.split("/")[0] as Domain, event, seq: world.seq, text, ts: world.now, v: 1 };
  await appendFile(`${world.runDir}/gamelog.jsonl`, `${JSON.stringify(entry)}\n`);
}

async function writeStatus(world: World): Promise<void> {
  const lastProgress = world.agent === "tool" ? { at: world.now, event: "nav/route_start" as const } : undefined;
  const status: StatusJson = { agent: world.agent, at: world.now, connection: "online", lastProgress, lastToolCallAt: undefined, ready: true, run: undefined, tool: undefined, v: 1 };
  await writeFile(`${world.runDir}/status.json`, JSON.stringify(status));
}

function truth(world: World): string {
  const savedAt = world.exited ? new Date(world.now).toISOString() : "2026-09-25T10:00:00.000Z";
  const position = { map: 530, o: 0, x: 8735, y: -6685, z: 70.5, zone: 3430 };
  return JSON.stringify({ account: ACC, alive: true, class: 5, deathState: "alive", guid: 1, health: 100, inventory: [], level: 10, money: 50_000, name: "Fevala", ok: true, online: false, position, quests: [], race: 10, rewardedQuests: [], savedAt, spells: [], xp: 0 });
}

function soap(world: World, verb: string | undefined): ExecResult {
  const session = { account: ACC, character: "Fevala", dir: `${world.worktree}/tmp/factory-account-${ACC}`, password: PASSWORD, preset: "eversong10", wrapper: `${world.worktree}/tmp/tc-${ACC}` };
  if (verb === "create") return ok(JSON.stringify(session));
  if (verb === "truth") return ok(truth(world));
  if (verb === "list") return ok("[]");
  return ok('{"ok":true}');
}

async function onSend(world: World, text: string): Promise<void> {
  if (text === "\u0004") {
    world.exited = true;
    return;
  }
  await log(world, "human/input", text);
  if (text === BUDGET_STOP || (text === world.task && world.answers)) {
    world.agent = "idle";
    await log(world, "agent/message", "Level 10, 100% health.");
  }
}

async function orca(world: World, args: string[]): Promise<ExecResult> {
  const [sub] = args;
  if (sub === "create") {
    if (world.launchFails) return failed(1, "orca runtime not reachable");
    await log(world, "session/in_world", "in world");
    await writeStatus(world);
    return orcaOk({ handle: "term_run" });
  }
  if (sub === "read") return orcaOk({ tail: world.exited ? [] : EDITOR });
  if (sub === "send") {
    await onSend(world, args[args.indexOf("--text") + 1] ?? "");
    return orcaOk({});
  }
  if (sub === "wait") return world.exited ? ok('{"ok":true,"result":{"wait":{"satisfied":true}}}') : failed(1, "", '{"ok":false,"error":{"code":"timeout"}}');
  return orcaOk({});
}

function worldExec(world: World): Exec {
  return async (argv, opts) => {
    world.calls.push([...argv]);
    if (argv[0] === "git") return ok("3af5aa3\n");
    if (argv[0] === "rg") return bunExec(argv, opts);
    if (argv[0] === "orca-ide") return orca(world, argv.slice(2));
    if (argv[1] === "packages/factory/src/main.ts") return soap(world, argv[3]);
    return failed(127, `unexpected ${argv.join(" ")}`);
  };
}

function run(world: World, scenario: Scenario = SELF_STATE): Promise<string> {
  const sleep = async (ms: number): Promise<void> => {
    world.now += ms;
    await writeStatus(world);
  };
  return runScenario({ clock: { now: () => world.now }, exec: worldExec(world), log: () => {}, replica: 1, round: 1, scenario, sleep, truthWaitMs: 1, worktree: world.worktree });
}

async function leaked(dir: string): Promise<string> {
  return (await bunExec(["rg", "-uu", "-l", "-F", PASSWORD, dir])).stdout;
}

const deleted = (world: World): boolean => world.calls.some((call) => call[3] === "delete" && call[4] === ACC);

describe("runScenario", () => {
  test("a finished run leaves a valid draft, a deleted account and no password", async () => {
    const world = await newWorld();
    expect(await run(world)).toMatch(/^t0-self-state-1 draft 0\/5 tools=0 wall=\d+$/);
    const draft = (await Bun.file(`${world.runDir}/grader/draft.json`).json()) as EvalResult;
    expect(validateResult(draft)).toEqual([]);
    expect(draft.end).toBe("done");
    expect(draft.tab).toBe("eval-1-t0-self-state-1");
    expect(draft.evidence.finalSavedAt).toBeDefined();
    for (const file of ["run.json", "names.json", "baseline.json", "final.json", "triggers.jsonl", "progress.json"]) {
      expect(await Bun.file(`${world.runDir}/${file}`).exists()).toBe(true);
    }
    expect(deleted(world)).toBe(true);
    expect(await Bun.file(`${world.runDir}/account.json`).exists()).toBe(false);
    expect(await leaked(world.runDir)).toBe("");
    expect(world.calls.find((call) => call[2] === "create")).toContain(`exec bun packages/harness/src/entry.ts --profile ${world.runDir}/account.json --run-dir ${world.runDir} --glyphs nerd`);
  });

  test("a launch failure aborts, still deletes the account and removes account.json", async () => {
    const world = await newWorld({ launchFails: true });
    expect(await run(world)).toStartWith("t0-self-state-1 aborted 0/5 ");
    const result = (await Bun.file(`${world.runDir}/result.json`).json()) as EvalResult;
    expect(result.abort?.cause).toBe("launch_failed");
    expect(result.abort?.evidence).toContain("orca runtime not reachable");
    expect(validateResult(result)).toEqual([]);
    expect(deleted(world)).toBe(true);
    expect(await Bun.file(`${world.runDir}/account.json`).exists()).toBe(false);
  });

  test("a wrong character aborts and quits the harness", async () => {
    const world = await newWorld({ char: "Xiara" });
    await run(world);
    const result = (await Bun.file(`${world.runDir}/result.json`).json()) as EvalResult;
    expect(result.abort).toEqual({ cause: "wrong_character", evidence: "session/in_world names Xiara, names.json names Fevala" });
    expect(world.calls.some((call) => call[2] === "send" && call.includes("\u0004"))).toBe(true);
    expect(world.calls.some((call) => call.includes(SELF_STATE.task))).toBe(false);
    expect(deleted(world)).toBe(true);
  });

  test("a run past its budget gets the stop steer and ends as budget", async () => {
    const world = await newWorld({ agent: "tool", answers: false });
    await run(world);
    const draft = (await Bun.file(`${world.runDir}/grader/draft.json`).json()) as EvalResult;
    expect(draft.end).toBe("budget");
    expect(draft.interventions.map((item) => item.kind)).toEqual(["budget_stop"]);
    expect(draft.interventions[0]?.text).toBe(BUDGET_STOP);
  });

  test("an elapsed steer is typed and recorded", async () => {
    const world = await newWorld();
    const scenario: Scenario = { ...SELF_STATE, steers: [{ at: { kind: "elapsed", ms: 4000 }, text: "How is it going?" }] };
    await run(world, scenario);
    const steers = (await Bun.file(`${world.runDir}/steers.jsonl`).text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(steers).toEqual([{ ms: expect.any(Number), text: "How is it going?", trigger: "elapsed:4000" }]);
    const draft = (await Bun.file(`${world.runDir}/grader/draft.json`).json()) as EvalResult;
    expect(draft.interventions.map((item) => item.kind)).toEqual(["steer"]);
  });

  test("refuses a run dir that was used before", async () => {
    const world = await newWorld();
    await run(world);
    await expect(run(world)).rejects.toThrow(`run dir already used: ${world.runDir}`);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/run.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/run'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/run.ts`:

```ts
import { appendFile, mkdir } from "node:fs/promises";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import { type AccountNames, applySetup, createAccount, type Role, RunAbort, sessionFile } from "#harness/grader/accounts";
import type { Exec } from "#harness/grader/exec";
import { harnessCommand, openPane, type Pane } from "#harness/grader/pane";
import type { EvalResult } from "#harness/grader/result";
import { cleanup, newRunState, type RunState, stopHarness, writeJson, writeOutcome } from "#harness/grader/run-finish";
import type { Scenario } from "#harness/grader/scenarios";
import {
  BUDGET_STOP,
  describeAt,
  dueSteer,
  type EndAction,
  type EndMemory,
  type EndView,
  endAction,
  RESCUE_NUDGE,
  type SteerCursor,
} from "#harness/grader/steer";
import { readTruth } from "#harness/grader/truth";
import { createLogTail, type LogTail, lastAnswerAt, progressOf, readStatus, type TriggerRow, triggerRows, watchRun } from "#harness/grader/watch";

export const POLL_MS = 2000;
export const READY_TIMEOUT_MS = 120_000;
export const SUBMIT_TIMEOUT_MS = 10_000;

const EDITOR_RULE = /─{20,}/;
const LANDED_POLL_MS = 1000;
const PARTNER_START_MS = 120_000;

export type RunInit = {
  exec: Exec;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  worktree: string;
  scenario: Scenario;
  round: number;
  replica: number;
  truthWaitMs?: number;
};

type Live = RunState & {
  init: RunInit;
  tail: LogTail;
  triggers: TriggerRow[];
  answerAt: number | undefined;
  inWorld: string | undefined;
  statusAt: number | undefined;
  cursor: SteerCursor;
  memory: EndMemory;
};

type PathInit = { worktree: string; round: number; scenario: string; replica: number };

export function runPaths({ worktree, round, scenario, replica }: PathInit): { runDir: string; tab: string } {
  return { runDir: `${worktree}/tmp/evals/${round}/${scenario}-${replica}`, tab: `eval-${round}-${scenario}-${replica}` };
}

async function headSha({ exec, worktree }: RunInit): Promise<string> {
  const { code, stderr, stdout } = await exec(["git", "-C", worktree, "rev-parse", "HEAD"]);
  if (code !== 0) throw new Error(`git rev-parse HEAD failed: ${stderr.trim()}`);
  return stdout.trim();
}

async function prepare(init: RunInit): Promise<Live> {
  const { runDir, tab } = runPaths({ replica: init.replica, round: init.round, scenario: init.scenario.id, worktree: init.worktree });
  if (await Bun.file(`${runDir}/run.json`).exists()) throw new Error(`run dir already used: ${runDir}`);
  await mkdir(`${runDir}/frames`, { recursive: true });
  await mkdir(`${runDir}/grader`, { recursive: true });
  const sha = await headSha(init);
  await writeJson(`${runDir}/run.json`, { replica: init.replica, round: init.round, scenario: init.scenario.id, sha, t0: init.clock.now(), tab });
  const { clock, exec, replica, round, scenario, truthWaitMs } = init;
  const base = newRunState({ clock, exec, replica, round, runDir, scenario, sha, tab, truthWaitMs });
  const memory: EndMemory = { nudgedAt: undefined, stopAt: undefined, stopReason: undefined, taskMs: 0 };
  const tail = createLogTail(`${runDir}/gamelog.jsonl`);
  return { ...base, answerAt: undefined, cursor: { index: 0, since: 0 }, init, inWorld: undefined, memory, statusAt: undefined, tail, triggers: [] };
}

function paneOf(run: Live): Pane {
  if (run.pane === undefined) throw new Error("the pane is not open");
  return run.pane;
}

async function create(run: Live, role: Role): Promise<AccountNames> {
  const names = await createAccount({ exec: run.exec, owner: run.tab, preset: run.scenario.preset, role, runDir: run.runDir });
  run.init.log(`${role} ${names.account} ${names.character}`);
  return names;
}

async function baseline(run: Live, account: string): Promise<void> {
  const truth = await readTruth(run.exec, account).catch((err: unknown) => {
    throw new RunAbort("service_down", messageOf(err), { cause: err });
  });
  await writeJson(`${run.runDir}/baseline.json`, truth);
  if (truth.online) throw new RunAbort("other", "baseline truth says the character is online");
}

async function startPartner(run: Live): Promise<void> {
  if (run.partner === undefined) return;
  const { code, stderr } = await run.exec([run.partner.wrapper, "start", "--json"], { timeoutMs: PARTNER_START_MS });
  if (code !== 0) throw new RunAbort("launch_failed", `partner start exited ${code}: ${stderr.trim()}`);
}

async function launch(run: Live): Promise<void> {
  const command = harnessCommand({ profile: sessionFile(run.runDir, "agent"), runDir: run.runDir });
  const pane = await openPane({ command, exec: run.exec, title: run.tab, worktree: run.init.worktree }).catch((err: unknown) => {
    throw new RunAbort("launch_failed", messageOf(err), { cause: err });
  });
  run.pane = pane;
  run.init.log(`pane ${pane.id}`);
}

async function pollLog(run: Live): Promise<void> {
  const rows = await run.tail.read();
  run.triggers.push(...triggerRows(rows));
  run.answerAt = lastAnswerAt(rows, run.answerAt);
  run.inWorld ??= rows.find((row) => row.event === "session/in_world")?.char;
  const { taskMs } = run;
  if (taskMs !== undefined) run.firstToolAt ??= rows.find((row) => row.event === "tool/call" && row.ts >= taskMs)?.ts;
}

function checkCharacter(run: Live, char: string): void {
  const expected = run.agent?.character;
  if (char !== expected) throw new RunAbort("wrong_character", `session/in_world names ${char}, names.json names ${expected}`);
  run.init.log("ready");
}

async function waitReady(run: Live): Promise<void> {
  const pane = paneOf(run);
  const deadline = run.clock.now() + READY_TIMEOUT_MS;
  while (run.clock.now() < deadline) {
    await pollLog(run);
    if (run.inWorld !== undefined && EDITOR_RULE.test(await pane.screen())) return checkCharacter(run, run.inWorld);
    if (await pane.waitExit(1)) throw new RunAbort("launch_failed", "the harness exited before it was ready");
    await run.init.sleep(POLL_MS);
  }
  throw new RunAbort("launch_failed", `no session/in_world row and Pi editor within ${READY_TIMEOUT_MS / 1000} s`);
}

async function typeText(run: Live, text: string): Promise<void> {
  await paneOf(run).send(text, { enter: true });
}

async function awaitLanded(run: Live, since: number): Promise<void> {
  const deadline = since + SUBMIT_TIMEOUT_MS;
  while (run.clock.now() <= deadline) {
    await pollLog(run);
    if (run.triggers.some((row) => row.trigger === "steer_landed" && row.ms >= since)) return;
    await run.init.sleep(LANDED_POLL_MS);
  }
  throw new RunAbort("launch_failed", "the task did not reach the harness: no human/input row within 10 s");
}

async function sendTask(run: Live): Promise<void> {
  const taskMs = run.clock.now();
  run.taskMs = taskMs;
  await typeText(run, run.scenario.task);
  run.init.log("task sent");
  await awaitLanded(run, taskMs);
  run.cursor = { index: 0, since: taskMs };
  run.memory = { nudgedAt: undefined, stopAt: undefined, stopReason: undefined, taskMs };
}

async function steer(run: Live, now: number): Promise<void> {
  const due = dueSteer({ cursor: run.cursor, now, steers: run.scenario.steers, triggers: run.triggers });
  if (due === undefined) return;
  await typeText(run, due.text);
  await appendFile(`${run.runDir}/steers.jsonl`, `${JSON.stringify({ ms: now, text: due.text, trigger: describeAt(due.at) })}\n`);
  run.interventions.push({ kind: "steer", ms: now, text: due.text });
  run.cursor = { index: run.cursor.index + 1, since: now };
  run.init.log(`steer ${run.cursor.index}`);
}

async function endView(run: Live, now: number): Promise<EndView> {
  const status = await readStatus(`${run.runDir}/status.json`);
  if (status !== undefined) run.statusAt = status.at;
  return {
    budgetMs: run.scenario.budget.minutes * 60_000,
    lastAnswerAt: run.answerAt,
    now,
    progress: status === undefined ? undefined : progressOf({ lastAnswerAt: run.answerAt, now, status }),
    statusAt: run.statusAt ?? run.memory.taskMs,
    tier: run.scenario.tier,
  };
}

async function nudge(run: Live, now: number): Promise<void> {
  await typeText(run, RESCUE_NUDGE);
  run.interventions.push({ kind: "rescue", ms: now, text: RESCUE_NUDGE });
  run.memory.nudgedAt = now;
}

async function stop(run: Live, reason: "budget" | "stuck", now: number): Promise<void> {
  await typeText(run, BUDGET_STOP);
  run.interventions.push({ kind: "budget_stop", ms: now, text: BUDGET_STOP });
  run.memory.stopAt = now;
  run.memory.stopReason = reason;
}

async function finish(run: Live, end: NonNullable<EvalResult["end"]>, escape: boolean): Promise<void> {
  if (escape) await paneOf(run).escape();
  run.end = end;
}

async function act(run: Live, action: EndAction, now: number): Promise<void> {
  if (action.kind === "nudge") return nudge(run, now);
  if (action.kind === "stop") return stop(run, action.reason, now);
  if (action.kind === "end") return finish(run, action.end, action.escape);
  if (action.kind === "abort") {
    run.abort = { cause: "other", evidence: action.evidence };
    run.end = "abort";
  }
}

async function drive(run: Live): Promise<void> {
  while (run.end === undefined) {
    await run.init.sleep(POLL_MS);
    await pollLog(run);
    const now = run.clock.now();
    if (run.memory.stopAt === undefined) await steer(run, now);
    await act(run, endAction(await endView(run, now), run.memory), now);
  }
  run.init.log(`end ${run.end}`);
}

async function play(run: Live): Promise<void> {
  const agent = await create(run, "agent");
  run.agent = agent;
  if (run.scenario.partner !== null) run.partner = await create(run, "partner");
  await applySetup({ account: agent.account, exec: run.exec, runDir: run.runDir, setup: run.scenario.setup });
  await baseline(run, agent.account);
  await startPartner(run);
  await launch(run);
  await waitReady(run);
  const witness = run.scenario.partner === "witness" ? run.partner?.wrapper : undefined;
  run.watcher = watchRun({ clock: run.clock, exec: run.exec, pane: paneOf(run), runDir: run.runDir, witness });
  await sendTask(run);
  await drive(run);
}

function abortOf(err: unknown): NonNullable<EvalResult["abort"]> {
  if (err instanceof RunAbort) return { cause: err.abortCause, evidence: err.evidence };
  return { cause: "other", evidence: messageOf(err) };
}

export async function runScenario(init: RunInit): Promise<string> {
  const run = await prepare(init);
  try {
    await play(run);
  } catch (err) {
    run.abort ??= abortOf(err);
    run.end = "abort";
  }
  try {
    await stopHarness(run);
  } finally {
    await cleanup(run);
  }
  return writeOutcome(run);
}
```

Notes for the builder: the watcher and the runner read the same `gamelog.jsonl` with separate `LogTail`s, so each keeps its own offset. `sessionFile(run.runDir, "agent")` is an absolute path, so the harness finds the profile from the pane's cwd (the worktree root). The partner/witness `start` runs before the harness launch so that the witness samples from the first tick.

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/grader/run.test.ts`
Expected: PASS, 6 tests (each finishes in well under 5 s because `sleep` only moves the fake clock). Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness` exits 0; `run.ts` stays under 500 non-blank lines (about 250).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/grader/run.ts packages/harness/src/grader/run.test.ts
mise exec -- git commit -m "chore: Run one eval scenario end to end" -m "A Workflow grader should spend its context on grading, not on typing the 13 protocol steps, and the runner guarantees the cleanup and the draft on every path."
```

---

## Task E7f: Grader CLI, `mise eval` and the canary run

**Files:**
- Create: `packages/harness/src/grader/cli.ts`
- Modify: `mise.toml` (E7 insertion point: add `[tasks.eval]` directly after P4's `[tasks.harness]` block; nothing else)
- Test: `packages/harness/src/grader/cli.test.ts`

**Interfaces:**
- Consumes: every earlier E task: `bunExec`, `Exec`; `attachPane`, `harnessCommand`, `openPane`; `captureFrame`; `readTruth`, `finalTruth`, `leakCheck`; `EvalResult`, `validateResult`; `loadScenario`, `ROUND_1`; `watchRun`; `runScenario`; `summaryLine`, `writeJson`; F2 `Clock`; `messageOf`. P4 (`[tasks.harness]` in `mise.toml`) and BOOT (F6b) for the canary.
- Produces:
  - `export type CliDeps = { exec: Exec; clock: Clock; sleep: (ms: number) => Promise<void>; cwd: string; out: (line: string) => void; err: (line: string) => void; signal: () => Promise<void> };`
  - `export const CLI_USAGE: string;`
  - `export function main(argv: readonly string[], deps: CliDeps): Promise<number>;` (0 ok, 1 failure or a finding, 2 usage)
  - Command line `bun packages/harness/src/grader/cli.ts <command>` and `mise eval <command>`, commands: `run <scenario> --round <n> [--replica <n>]`, `result <run-dir> <file>`, `scenario [<id>]`, `launch <run-dir> --title <tab>`, `send <terminal> <text> [--enter]`, `frame <terminal> <dir> <seq>`, `watch <run-dir> <terminal> [--witness <wrapper>]`, `truth <ACCOUNT>`, `final-truth <ACCOUNT> <exit-ms>`, `leak-check <run-dir> <secret-file>...`, `validate <file>`. JSON on stdout, progress lines on stderr, never a password.

- [ ] **Step 1: Write the failing test**

`packages/harness/src/grader/cli.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { type CliDeps, main } from "#harness/grader/cli";
import { bunExec } from "#harness/grader/exec";
import type { EvalResult } from "#harness/grader/result";
import { ROUND_1 } from "#harness/grader/scenarios";
import { fakeExec, orcaOk } from "#test-support/fake-exec";

type Captured = CliDeps & { lines: string[]; errors: string[] };

function deps(overrides: Partial<CliDeps> = {}): Captured {
  const lines: string[] = [];
  const errors: string[] = [];
  const base: CliDeps = {
    clock: { now: () => 1_727_384_400_000 },
    cwd: tmpdir(),
    err: (line) => errors.push(line),
    exec: fakeExec(() => orcaOk({ tail: ["hello"] })).exec,
    out: (line) => lines.push(line),
    signal: async () => {},
    sleep: async () => {},
  };
  return { ...base, ...overrides, errors, lines };
}

const graded: EvalResult = {
  checks: [{ expected: 10, id: "level", met: true, observed: 10, source: "truth" }],
  efficiency: { tokens: {}, toolCalls: 2, turns: 2, wallSec: 72 },
  evidence: {},
  friction: [],
  interventions: [],
  replica: 1,
  round: 1,
  scenario: "t0-self-state",
  sha: "3af5aa3",
  verdict: "pass",
};

describe("grader cli", () => {
  test("prints usage for an unknown command", async () => {
    const d = deps();
    expect(await main(["dance"], d)).toBe(2);
    expect(d.errors[0]).toContain("usage: bun packages/harness/src/grader/cli.ts <command>");
  });

  test("does not treat an Object prototype name as a command", async () => {
    expect(await main(["toString"], deps())).toBe(2);
  });

  test("scenario prints one scenario as JSON", async () => {
    const d = deps();
    expect(await main(["scenario", "t0-self-state"], d)).toBe(0);
    expect(JSON.parse(d.lines[0] ?? "").budget).toEqual({ minutes: 3, tools: 10, turns: 4 });
  });

  test("scenario without an id lists round 1", async () => {
    const d = deps();
    await main(["scenario"], d);
    expect(d.lines).toEqual([...ROUND_1]);
  });

  test("validate reports schema errors", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    await writeFile(`${dir}/r.json`, "{}");
    const d = deps();
    expect(await main(["validate", `${dir}/r.json`], d)).toBe(1);
    expect(JSON.parse(d.lines[0] ?? "").errors).toContain("$: missing scenario");
  });

  test("result writes result.json and prints the summary line", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    await writeFile(`${dir}/graded.json`, JSON.stringify(graded));
    const d = deps();
    expect(await main(["result", dir, `${dir}/graded.json`], d)).toBe(0);
    expect(d.lines).toEqual(["t0-self-state-1 pass 1/1 tools=2 wall=72"]);
    expect((await Bun.file(`${dir}/result.json`).json()).verdict).toBe("pass");
  });

  test("run refuses a bad round and names an unknown scenario", async () => {
    expect(await main(["run", "t0-self-state", "--round", "x"], deps())).toBe(2);
    const d = deps();
    expect(await main(["run", "t9-nope", "--round", "1"], d)).toBe(1);
    expect(d.errors[0]).toStartWith("unknown scenario: t9-nope");
  });

  test("run refuses to start outside the eval worktree root", async () => {
    const d = deps({ cwd: await mkdtemp(`${tmpdir()}/cli-`) });
    expect(await main(["run", "t0-self-state", "--round", "1"], d)).toBe(1);
    expect(d.errors[0]).toBe("run from the eval worktree root (packages/factory/src/main.ts not found)");
  });

  test("leak-check prints file names only", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    await writeFile(`${dir}/account.json`, JSON.stringify({ password: "pw-secret-123" }));
    await writeFile(`${dir}/frame.txt`, "pw-secret-123");
    const d = deps({ exec: bunExec });
    expect(await main(["leak-check", dir, `${dir}/account.json`], d)).toBe(1);
    expect(d.lines).toEqual(['{"files":["frame.txt"]}']);
  });

  test("launch opens a harness pane for the run dir", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: "term_launch" }));
    const d = deps({ cwd: "/wt", exec });
    expect(await main(["launch", "/wt/tmp/evals/1/t0-self-state-1", "--title", "eval-1-t0-self-state-1"], d)).toBe(0);
    expect(d.lines).toEqual(['{"terminal":"term_launch"}']);
    expect(calls[0]?.argv).toContain("exec bun packages/harness/src/entry.ts --profile /wt/tmp/evals/1/t0-self-state-1/account.json --run-dir /wt/tmp/evals/1/t0-self-state-1 --glyphs nerd");
  });

  test("watch runs until the signal and leaves a frame", async () => {
    const dir = await mkdtemp(`${tmpdir()}/cli-`);
    const d = deps();
    expect(await main(["watch", dir, "term_watch"], d)).toBe(0);
    expect(await Bun.file(`${dir}/frames/00000-1727384400000.txt`).text()).toBe("hello");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/grader/cli.test.ts`
Expected: FAIL with `Cannot find module '#harness/grader/cli'`.

- [ ] **Step 3: Implement**

`packages/harness/src/grader/cli.ts`:

```ts
import { parseArgs } from "node:util";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import { bunExec, type Exec } from "#harness/grader/exec";
import { captureFrame } from "#harness/grader/frames";
import { attachPane, harnessCommand, openPane } from "#harness/grader/pane";
import { type EvalResult, validateResult } from "#harness/grader/result";
import { runScenario } from "#harness/grader/run";
import { summaryLine, writeJson } from "#harness/grader/run-finish";
import { loadScenario, ROUND_1 } from "#harness/grader/scenarios";
import { finalTruth, leakCheck, readTruth } from "#harness/grader/truth";
import { watchRun } from "#harness/grader/watch";

export type CliDeps = {
  exec: Exec;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  signal: () => Promise<void>;
};

type Command = (args: string[], deps: CliDeps) => Promise<number>;

export const CLI_USAGE = `usage: bun packages/harness/src/grader/cli.ts <command>   (or: mise eval <command>, from the eval worktree root)
  run <scenario> --round <n> [--replica <n>]        run one scenario replica end to end (steps 1-13)
  result <run-dir> <file>                           validate a graded result and write <run-dir>/result.json
  scenario [<id>]                                   print one scenario as JSON, or the round-1 ids
  launch <run-dir> --title <tab>                    open a harness pane for <run-dir>/account.json
  send <terminal> <text> [--enter]                  type into a pane
  frame <terminal> <dir> <seq>                      save one tagged screen frame
  watch <run-dir> <terminal> [--witness <wrapper>]  run the P6 watcher until SIGINT or SIGTERM
  truth <ACCOUNT>                                   print soap truth, checked
  final-truth <ACCOUNT> <exit-ms>                   final truth with the savedAt check
  leak-check <run-dir> <secret-file>...             list run-dir files that hold a password
  validate <file>                                   check a result file against the schema`;

const printJson = (deps: CliDeps, value: unknown): void => deps.out(JSON.stringify(value));

function usage(deps: CliDeps): number {
  deps.err(CLI_USAGE);
  return 2;
}

async function run(args: string[], deps: CliDeps): Promise<number> {
  const options = { replica: { type: "string" }, round: { type: "string" } } as const;
  const { positionals, values } = parseArgs({ allowPositionals: true, args, options });
  const [id] = positionals;
  const round = Number(values.round);
  const replica = Number(values.replica ?? "1");
  if (id === undefined || !Number.isInteger(round) || round < 0 || !Number.isInteger(replica) || replica < 1) return usage(deps);
  const scenario = loadScenario(id);
  if (!(await Bun.file(`${deps.cwd}/packages/factory/src/main.ts`).exists())) {
    throw new Error("run from the eval worktree root (packages/factory/src/main.ts not found)");
  }
  const { clock, exec, sleep } = deps;
  deps.out(await runScenario({ clock, exec, log: deps.err, replica, round, scenario, sleep, worktree: deps.cwd }));
  return 0;
}

async function result([runDir, file]: string[], deps: CliDeps): Promise<number> {
  if (runDir === undefined || file === undefined) return usage(deps);
  const value: unknown = await Bun.file(file).json();
  const errors = validateResult(value);
  if (errors.length > 0) {
    printJson(deps, { errors, ok: false });
    return 1;
  }
  const graded = value as EvalResult;
  await writeJson(`${runDir}/result.json`, graded);
  deps.out(summaryLine(graded, graded.verdict));
  return 0;
}

async function validate([file]: string[], deps: CliDeps): Promise<number> {
  if (file === undefined) return usage(deps);
  const errors = validateResult(await Bun.file(file).json());
  printJson(deps, { errors, ok: errors.length === 0 });
  return errors.length === 0 ? 0 : 1;
}

async function scenario([id]: string[], deps: CliDeps): Promise<number> {
  if (id === undefined) {
    for (const name of ROUND_1) deps.out(name);
    return 0;
  }
  printJson(deps, loadScenario(id));
  return 0;
}

async function launch(args: string[], deps: CliDeps): Promise<number> {
  const { positionals, values } = parseArgs({ allowPositionals: true, args, options: { title: { type: "string" } } });
  const [runDir] = positionals;
  if (runDir === undefined || values.title === undefined) return usage(deps);
  const command = harnessCommand({ profile: `${runDir}/account.json`, runDir });
  const pane = await openPane({ command, exec: deps.exec, title: values.title, worktree: deps.cwd });
  printJson(deps, { terminal: pane.id });
  return 0;
}

async function send(args: string[], deps: CliDeps): Promise<number> {
  const { positionals, values } = parseArgs({ allowPositionals: true, args, options: { enter: { type: "boolean" } } });
  const [id, text] = positionals;
  if (id === undefined || text === undefined) return usage(deps);
  await attachPane({ exec: deps.exec, id }).send(text, { enter: values.enter === true });
  printJson(deps, { sent: true });
  return 0;
}

async function frame([id, dir, seq]: string[], deps: CliDeps): Promise<number> {
  if (id === undefined || dir === undefined || seq === undefined) return usage(deps);
  const pane = attachPane({ exec: deps.exec, id });
  const shot = await captureFrame({ dir, last: undefined, now: deps.clock.now(), pane, seq: Number(seq) });
  printJson(deps, { file: shot?.file });
  return 0;
}

async function watch(args: string[], deps: CliDeps): Promise<number> {
  const { positionals, values } = parseArgs({ allowPositionals: true, args, options: { witness: { type: "string" } } });
  const [runDir, id] = positionals;
  if (runDir === undefined || id === undefined) return usage(deps);
  const pane = attachPane({ exec: deps.exec, id });
  const watcher = watchRun({ clock: deps.clock, exec: deps.exec, pane, runDir, witness: values.witness });
  await deps.signal();
  await watcher.stop();
  return 0;
}

async function truth([account]: string[], deps: CliDeps): Promise<number> {
  if (account === undefined) return usage(deps);
  printJson(deps, await readTruth(deps.exec, account));
  return 0;
}

async function final([account, exitMs]: string[], deps: CliDeps): Promise<number> {
  if (account === undefined || exitMs === undefined) return usage(deps);
  const reply = await finalTruth({ account, exec: deps.exec, exitMs: Number(exitMs) });
  printJson(deps, reply);
  return reply.ok ? 0 : 1;
}

async function leaks([runDir, ...secretFiles]: string[], deps: CliDeps): Promise<number> {
  if (runDir === undefined || secretFiles.length === 0) return usage(deps);
  const files = await leakCheck({ exec: deps.exec, runDir, secretFiles });
  printJson(deps, { files });
  return files.length === 0 ? 0 : 1;
}

const COMMANDS: Readonly<Record<string, Command>> = {
  "final-truth": final,
  frame,
  launch,
  "leak-check": leaks,
  result,
  run,
  scenario,
  send,
  truth,
  validate,
  watch,
};

export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  const [name, ...args] = argv;
  const command = name !== undefined && Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command === undefined) return usage(deps);
  try {
    return await command(args, deps);
  } catch (err) {
    deps.err(messageOf(err));
    return 1;
  }
}

function waitForSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
}

function defaultDeps(): CliDeps {
  return {
    clock: { now: () => Date.now() },
    cwd: process.cwd(),
    err: (line) => console.error(line),
    exec: bunExec,
    out: (line) => console.log(line),
    signal: waitForSignal,
    sleep: (ms) => Bun.sleep(ms),
  };
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2), defaultDeps()));
```

`mise.toml`, inserted directly after the `[tasks.harness]` block that P4 adds:

```toml
[tasks.eval]
description = "Run the eval grader CLI: run a scenario, grade, read truth, check leaks"
raw = true
run = "bun packages/harness/src/grader/cli.ts"
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/grader/cli.test.ts`
Expected: PASS, 11 tests.
Run: `mise test packages/harness/src/grader` — every grader test file passes.
Run: `mise eval scenario` — prints the 13 round-1 ids, one per line.
Run: `mise eval run t0-self-state --round x; echo "exit $?"` — prints the CLI usage on stderr and `exit 2`, which proves that mise passes `--flags` through to `cli.ts`. Measured on 2026-09-26 with a scratch `raw = true` task (`run = "echo ARGS"`): `mise echoargs run t0-self-state --round 0 --replica 1` printed `ARGS run t0-self-state --round 0 --replica 1`. If a later mise version swallows the flags, stop and report it; graders then call `bun packages/harness/src/grader/cli.ts …` directly, which needs no mise.
Then `mise format:fix packages/harness && mise lint:fix packages/harness && mise lint packages/harness && mise typecheck harness && mise lint:docs` exits 0.

- [ ] **Step 5: Canary run in an Orca pane (live; needs BOOT, the t1 service and Codex credentials)**

This is the harness-task live gate the design asks for (eval-suite §6: `t0-self-state` is the canary; contract gate FINAL). From the child worktree root, after `git merge --ff-only` of `epic/pi-harness` so BOOT (F6b) and P4 are present:

```bash
bun packages/factory/src/main.ts soap health | jq '{ok, authUp, worldUp, dbUp, soapUp}'
systemctl --user is-active tuicraft-factory-reaper.timer
rm -rf tmp/evals/0/t0-self-state-1
mise eval run t0-self-state --round 0 --replica 1
```

Run the last command in the background (`run_in_background`, it takes about 4-7 minutes) and wait for it to exit. Expected:

- the health line shows `true` for every field, and the reaper timer prints `inactive` (if it prints `active`, stop: its sweep deletes eval accounts; ask the coordinator);
- stderr shows `agent FAC… F…`, `pane term_…`, `ready`, `task sent`, `end done` (or `end budget`); stdout's last line matches `t0-self-state-1 draft 0/5 tools=<n> wall=<s>`;
- `ls tmp/evals/0/t0-self-state-1` shows `run.json names.json baseline.json final.json gamelog.jsonl session.jsonl status.json triggers.jsonl progress.json frames grader` and no `account.json`;
- `ls tmp/evals/0/t0-self-state-1/frames | wc -l` is at least 2, and `rg -c '<' tmp/evals/0/t0-self-state-1/frames/*.txt | command head -3` shows tagged glyph names;
- `mise eval validate tmp/evals/0/t0-self-state-1/grader/draft.json` prints `{"errors":[],"ok":true}`;
- `bun packages/factory/src/main.ts soap list | jq -r '.[].account' | rg "$(jq -r .account tmp/evals/0/t0-self-state-1/names.json)"` prints nothing (the account is deleted);
- `orca-ide terminal list --json | jq -r '.result.terminals[].title' | rg eval-0-t0-self-state-1` prints nothing (the pane is gone).

If the draft is `aborted`, read `result.json` `abort` and `notes`: `launch_failed`, `service_down` or `credential_expired` are infrastructure (AGENTS.md "Testing": defer to the coordinator with the evidence); anything else is a defect in this area to fix before the commit. Record the command, the summary line and the file list in the task report; `tmp/` is not committed.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/grader/cli.ts packages/harness/src/grader/cli.test.ts mise.toml
mise exec -- git commit -m "chore: Add the grader CLI and mise eval task" -m "A Workflow grader agent runs one scenario with one command and grades with the same tool; the canary t0-self-state run proves launch, profile, run dir, truth and cleanup end to end."
```

---

## Build order and hand-off

| Task | Needs | Files |
|---|---|---|
| E1a | F1 | `grader/exec.ts`, `test-support/fake-exec.ts` |
| E1b | E1a | `grader/pane.ts`, `test-support/fake-pane.ts` |
| E4 | F1 | `grader/result.ts`, `grader/eval-result.schema.json` |
| E5 | F1 | `grader/scenarios.ts`, `grader/scenarios/*.json` (13) |
| E2 | E1b, U1 | `grader/frames.ts` |
| E3a | E1a | `grader/truth.ts` |
| E3b | E3a | `grader/truth.ts` (`leakCheck`) |
| E6a | E1a, E5, F2 | `grader/watch.ts` |
| E6b | E6a, E2 | `grader/watch.ts` (`watchRun`) |
| E7a | E1a, E4, E5 | `grader/accounts.ts` |
| E7b | E5, E6a | `grader/steer.ts` |
| E7c | E1a, E4, E5 | `grader/efficiency.ts` |
| E7d | E7a, E7c, E3b, E6b | `grader/run-finish.ts` |
| E7e | E7b, E7d | `grader/run.ts` |
| E7f | E7e, P4 (and BOOT for the canary) | `grader/cli.ts`, `mise.toml` `[tasks.eval]` |

All paths above are under `packages/harness/` except `mise.toml`. P6 documents `mise eval` in `README.md` and `AGENTS.md` after E7f lands; this area edits no doc file.
