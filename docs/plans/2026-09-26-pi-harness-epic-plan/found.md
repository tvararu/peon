# Pi harness foundation (area "found") Implementation Plan

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the harness foundation: package scaffold, frozen contract types, flags, profile, lock, omp credentials, the process runtime and connection, the ready gate, the Pi runtime, the `wow` extension input path, the entry and composition root, and the smoke tests V1–V7 (V3 first).

**Architecture:** A process-lifetime `HarnessRuntime` (config, credentials, connection, ready gate, run registry, log) lives outside the Pi extension closure. `createPiRuntime` builds Pi sessions with no built-in tools, no context files, skills, extensions or templates, in-memory settings and session files in the run dir. The `wow` extension factory closes over the runtime, so `/new`, `/reload`, `/resume` and `/fork` keep the game handle.

**Tech Stack:** Bun 1.4.2, TypeScript (strict), `bun:test`, `bun:sqlite`, Pi 0.87.1 (`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`, `pi-tui`), `@tuicraft/core`.

**Spec:** `docs/plans/2026-09-26-pi-harness-epic-design.md` (committed spec), `docs/plans/2026-09-26-pi-harness-epic/harness-design.md` (design A–K, sections H.1–H.9, C.4, the two Verification sections), `docs/plans/2026-09-26-pi-harness-epic/luna-runtime.md`. Names and types: `contract.md` (key `contract`). This file is the plan for area `found`.

## Area overview

1. Tasks: F1, F2, F3a, F3b, F3c, F4a, F4b, F5aa, F5b, F5ab, F5c, F6a, F7a, F7b, F7c, F8a (V3), F8b (V4), F8c (V6), F8d (V2), F6b, F8e (V1, V5, V6 live half, V7 live).
2. Order inside the area: F1 → F2 → {F3a, F3b → F3c, F4a → F4b, F5aa → F5b → F5ab → {F5c, F6a, F7a → {F7b, F7c}}} → F8a → {F8b, F8c, F8d} → F6b → F8e.
3. F8a (V3) is the gate for every run tool (B5, B10, B11, B13). It is the first behaviour test after F6a and F7b. It passed as a scratch probe on the faux provider (see "Measured facts").
4. Every task runs in an Orca child worktree of the epic worktree `/home/deity/orca/workspaces/tuicraft/pi-epic` and lands on `epic/pi-harness` by rebase and fast-forward push ([plan index](../2026-09-26-pi-harness-epic-plan.md) "Execution mechanics"; never a merge commit). Live steps run from that child worktree root, so they test the task's own code. No task merges PR #367.
5. The harness adds no CLI verb and no core change. Legacy `mise ci` stays green after every commit (R21).

## Contract issues

These are defects in `contract.md`. The contract is not changed here. Each item says how this plan works around it. The coordinator decides.

1. **Soap session config path.** Contract 0.5 and 2.1 say `<dir>/config/config.toml`. Measured: `packages/factory/src/soap-wrapper.ts:19` sets `XDG_CONFIG_HOME = ${dir}/config` and `packages/factory/src/soap.ts:305` writes `${XDG_CONFIG_HOME}/tuicraft/config.toml`. F3b reads `<dir>/config/tuicraft/config.toml`, and refuses the profile when that file names a different account or character (the wrapper does the same check).
2. **Code after `InteractiveMode.run()` does not run on quit.** Measured in `pi-coding-agent/dist/modes/interactive/interactive-mode.js:3362-3396`: `shutdown()` awaits `runtimeHost.dispose()` (which emits `session_shutdown`) and then calls `process.exit(0)`. So contract 2.4's "`rt.shutdown()` → lock release → `writeMeta` with `endedAt`" after `run()` never executes. F6b composes the extension factory as `wowExtension(rt)` plus one more `session_shutdown` handler registered after it (Pi runs handlers of one extension in registration order and awaits each, `core/extensions/runner.js:716-743`, read). That handler, on `quit` only, stops the status and stats writers, writes the final `meta.json`, finalizes `session.jsonl` and releases the lock. `process.on("exit")` still calls `lock.releaseSync()`.
3. **`PiRuntimeInit` cannot take the faux provider.** A faux model must be registered with `modelRuntime.registerNativeProvider(faux.provider)` before `getModel("faux", "faux-1")` (measured in the probe). F6a adds one optional field to `PiRuntimeInit` in its own file `runtime/pi-runtime.ts`: `providers?: readonly Provider[]`, applied right after `ModelRuntime.create`. Production passes nothing. This is a deviation from the contract text of 2.3.
4. **F5a needs F5b.** `RuntimeParts` carries `login`, and `HarnessRuntime` needs `connect`, `handle`, `connection`, so `createHarnessRuntime` must call `createConnection`. `runtime-fixture.ts` needs `createHarnessRuntime`. This plan splits F5a: **F5aa** (`runtime/mutex.ts`, `runtime/yield.ts`) → **F5b** (`runtime/connection.ts`, needs only F2) → **F5ab** (`runtime/harness-runtime.ts`, `test-support/runtime-fixture.ts`). Every other area's "needs F5a" means "needs F5ab".
5. **V4 fails on faux (measured).** A call with invalid arguments produced `tool_execution_start` and `tool_execution_end` with `isError: true` and the text `Validation failed for tool "block": …`, but **no** `tool_result` event; `tool_result` fired only for the valid call. So the A.4 "invalid schema" guard cannot work in a `tool_result` hook. F8b pins the measured behaviour. Fallback per design H.7: graders count `Validation failed` in the session JSONL; A1 or L13 can count validation errors from `tool_execution_end` instead. The coordinator should tell A1.
6. **Entry order misses two calls.** `initTheme` is called by Pi's own `main.js:719`, not by `InteractiveMode` (measured with `rg`). F6b calls `initTheme(settingsManager.getTheme(), false)` before `new InteractiveMode(...)`. F6b's `entry.ts` also calls `registerBunOAuthFlows()` from `@earendil-works/pi-ai/bun-oauth` after the `PI_*` env is set (luna-runtime §5 break 1).
7. **Workspace must exist before the Pi runtime.** Measured: `createAgentSessionRuntime` throws `MissingSessionCwdError: Stored session working directory does not exist` when `cwd` is absent. F6a creates `paths.workspace` and `paths.piSessions` with `mkdir -p` before it builds the runtime.
8. **`--check` exit code.** Contract 2.4 says `--check` prints the line and exits 0. A pre-flight that exits 0 on a missing or expiring login is of no use to the eval runner. F6b returns `0` when `startupCheck` is ok and `3` when it is not.
9. **Order of lock, credential and run dir.** Contract 2.4 puts the run dir before the credential check. With `--check` that leaves an empty run dir per pre-flight. F6b checks credentials before it creates the run dir. The lock records `runDir` as `flags.runDir ?? runsRoot(home)` because the final run dir name is not known yet.
10. **F6b needs two more tasks.** `main.ts` calls `snapshotWorld` (A3, `ops/views.ts`) for `createWorldSnapshots` and `createWakeGuard` (L9, `events/guard.ts`) for `RouterInit.guard`. Add A3 and L9 to F6b's Needs. Both land before wave 7, so the critical path does not change. F6b also lists F8a: a composition root that can start run tools must not land before V3 is proven.
11. **Added files.** This plan adds three test-support files and gives each one owner: `packages/harness/test-support/omp-db.ts` (F4a), `packages/harness/test-support/fake-pi.ts` (F7a), `packages/harness/test-support/faux-session.ts` (F6a, already in the contract).
12. **Added optional arguments.** `main(flags, deps?)` (F6b) takes an optional `MainDeps` for tests; `ProfileError` takes an optional third `options?: ErrorOptions` (biome `useErrorCause`). Both keep the contract call shape.
13. **`OmpCredentialStore.reads()`** is not defined in the contract. This plan defines it as the number of database reads (cache misses), so a test can prove the mtime cache.
14. **`package.json` scripts.** The brief asks for scripts. The root `package.json` `typecheck` script already runs `tsc --noEmit -p packages/harness`, and `mise test` runs every package. P4 owns the `mise harness` launcher. F1 adds no `scripts` block, so there is no second launch path.

## Measured facts (scratch probe, 2026-09-26, Pi 0.87.1 from the harness `node_modules`, faux provider)

Probe: `/tmp/claude-1001/-home-deity-code-tuicraft/7fa1d885-6568-4f60-ba6d-a5a41a3c39f3/scratchpad/probe/v3.ts` (and `v3b.ts`, `v3c.ts`). It built a session with `createAgentSessionServices` + `createAgentSessionFromServices` + `createAgentSessionRuntime`, one inline extension, `noTools: "builtin"`.

- **V3 ordering holds (measured).** With a tool that blocks on a promise: `session.prompt("where are you?", { streamingBehavior: "steer" })` while the tool blocked ran the `input` handler with `streamingBehavior: "steer"`; a `setTimeout(…, 50)` started in that handler resolved the tool **after** `prompt()` returned (the steer was queued); the next model request carried the steer user message after the tool results. Log order: `tool:start`, `input:where are you?:steer`, `steer:queued`, `yield`, `tool:end`.
- **V6 holds on faux (measured).** A `before_agent_start` result `{ message: { customType: "now", content: "[now] hidden", display: false } }` reached the model as a user message after the prompt.
- **V2 holds on faux (measured).** A message that a `context` handler appended was in the model request and was **not** in the session JSONL file (`rg -c CTX-INJECT` = 0).
- **V4 fails (measured).** See Contract issue 5.
- **Esc path (measured).** `session.abort()` aborts the tool's `signal`, so contract 2.5's "Pi aborts the tool's signal; `tools/define.ts` then calls `rt.stopAll("esc")`" needs no hook.
- **`noTools: "builtin"` (measured).** `session.getActiveToolNames()` returned only the extension tool.
- **No env needed in tests (measured).** Without `PI_CODING_AGENT_DIR` set before import and with an explicit `agentDir`, the probe created nothing under `~/.pi`.
- **Handler order (read).** `runner.js:716-743`: handlers run per extension in registration order, each awaited.

## Global Constraints

- Pi packages pinned exactly at `0.87.1` (`packages/harness/package.json`, already present).
- Harness imports: `@tuicraft/core`, `@tuicraft/core/session`, `@tuicraft/core/lib/{abort,config,errors,ignore-failure,paths}`; in tests also `@tuicraft/core/test-support/{mock-handle,must,temp-paths,control-fixtures,internals}`; `@earendil-works/*`; own `#harness/*` and `#test-support/*`. Never a relative path into another package.
- `type` only, no `interface`, no `enum`, no comments, no `biome-ignore`, files at most 500 non-blank lines, functions at most 30 lines.
- Biome is strict here (read `biome.json`): `useAwait` (an `async` function must `await`; return a `Promise` instead), `noProcessEnv` in `src/**` (use `Bun.env["X"]`), `useErrorCause` (an error made inside `catch` passes `{ cause }`), `useSortedKeys` (object keys sorted; `mise lint:fix` sorts them), `useNumericSeparators` (`15_000`), `noUselessCatchBinding`, `useExplicitLengthCheck`, `useTopLevelRegex` in `src/**`. `tsconfig.base.json` has `noPropertyAccessFromIndexSignature`: read index signatures with brackets.
- Before every commit: `mise lint:fix`, `mise format:fix`, then `mise lint`, `mise format`, `bun run tsc --noEmit -p packages/harness`. Stage only the task's files.
- Commit with `git add <paths>` then `mise exec -- git commit` (separate commands). Subject: Conventional Commit, at most 50 characters, capital after the prefix. Body: 1–3 sentences of why, wrapped at 72. No attribution trailers.
- The Codex token, the refresh token and `Profile.client.password` never reach a log row, `meta.json`, `status.json`, stdout or a test snapshot.
- Protected accounts `ADMIN, DEITY, X, Y, AUCTIONHOUSE, TCFACTORY, TCPRESETS`, prefix `RNDBOT`, character `Xiara`: refused before any network call. No override flag (R38).
- Live gates use throwaway soap accounts only (`bun packages/factory/src/main.ts soap create …`), deleted afterwards.

## Review Focus

1. A soap session JSON whose `dir` was deleted (the account was reaped): the harness must print one line that names the missing file and exit 2, not a stack. Pinned in F3b (`unreadable` for a missing session TOML).
2. Two harnesses started on the same character within one second: the second must refuse with the holder's pid, and the first must keep its lock. Pinned in F3c (second `acquireLock` with a live pid refuses; the first file stays).
3. The omp row expires while a session runs: the next model request must show the `Run omp once so that it refreshes the login` text, and no refresh request is made. Pinned in F4a (`modify` rejects with `CredentialExpiredError` and never calls `fn`).
4. A human types `stop` while no run is active and the agent is idle: nothing breaks, the text still reaches the model, `humanWaiting` stays false. Pinned in F7b (idle reflex test).
5. The game socket drops during a blocking run: the run ends `interrupted` with reason `connection_lost`, and reconnect starts at 5 s. Pinned in F5b (loss cancels runs with cause `lost`) and F5ab (fixture registry maps `lost` to `interrupted`).

---
### Task F1: Harness imports map

**Needs:** —

**Files:**
- Modify: `packages/harness/package.json` (add `imports`)
- Test: `packages/harness/src/index.test.ts`

**Interfaces:**
- Consumes: nothing (the package exists with the Pi pins; `tsconfig.json` already includes `src` and `test-support`; `src/index.ts` exists and is empty).
- Produces: `#harness/*` → `./src/*.ts` and `#test-support/*` → `./test-support/*.ts` for every later harness file.

- [ ] **Step 1: Write the failing test** `packages/harness/src/index.test.ts`

```ts
import { expect, test } from "bun:test";

test("the harness resolves its own modules through #harness", async () => {
  const self = await import("#harness/index");
  expect(Object.keys(self)).toEqual([]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/index.test.ts`
Expected: FAIL with `Cannot find module "#harness/index"` (or a package-imports resolution error).

- [ ] **Step 3: Implement** `packages/harness/package.json` (whole file; keys sorted)

```json
{
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.87.1",
    "@earendil-works/pi-ai": "0.87.1",
    "@earendil-works/pi-coding-agent": "0.87.1",
    "@earendil-works/pi-tui": "0.87.1",
    "@tuicraft/core": "workspace:*"
  },
  "exports": {},
  "imports": {
    "#harness/*": "./src/*.ts",
    "#test-support/*": "./test-support/*.ts"
  },
  "name": "@tuicraft/harness",
  "private": true,
  "type": "module"
}
```

`src/index.ts` stays empty. No `scripts` block (Contract issue 14).

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/index.test.ts`
Expected: PASS, 1 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/package.json packages/harness/src/index.test.ts
mise exec -- git commit -m "chore: Map the harness package's own imports" -m "Harness modules import each other as #harness/<dir>/<file> and test support as #test-support/<file>, the same shape core uses. No other package can import the harness, because exports stays empty."
```

### Task F2: Frozen contract types and Refusal

**Needs:** F1, C1

**Files:**
- Create: `packages/harness/src/contract/result.ts`, `views.ts`, `details.ts`, `log.ts`, `runs.ts`, `config.ts`, `services.ts`
- Create: `packages/harness/src/ops/refusal.ts`
- Test: `packages/harness/src/ops/refusal.test.ts`

**Interfaces:**
- Consumes: C0 and C1 core exports: `Capabilities`, `FactionRelation`, `NpcRole`, `PlayerLife`, `ItemKind`, `Unsubscribe`, `ClientConfig`, `NearbyRow`, `WorldHandle` from `@tuicraft/core`; `ThinkingLevel` from `@earendil-works/pi-agent-core`.
- Produces: every type in contract.md §2.0 (`contract/*.ts`), and `class Refusal extends Error` with `constructor(init: RefusalInit)`, fields `reason`, `detail`, `next: string | undefined`, `body: string[]`, `options: unknown`, `status: "REFUSED" | "FAILED" | "UNCONFIRMED"`; `message` is `${reason}: ${detail}`.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/refusal.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { Refusal } from "#harness/ops/refusal";

describe("Refusal", () => {
  test("carries the reason and detail in its message", () => {
    const refusal = new Refusal({
      detail: "r3 (engage) is still running.",
      next: 'stop(run: "r3")',
      reason: "busy",
    });
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.message).toBe("busy: r3 (engage) is still running.");
    expect(refusal.next).toBe('stop(run: "r3")');
  });

  test("defaults status to REFUSED and body to no lines", () => {
    const refusal = new Refusal({
      detail: "the game connection is down.",
      reason: "offline",
    });
    expect(refusal.status).toBe("REFUSED");
    expect(refusal.body).toEqual([]);
    expect(refusal.next).toBeUndefined();
    expect(refusal.options).toBeUndefined();
  });

  test("keeps a FAILED status, body lines and options", () => {
    const refusal = new Refusal({
      body: ["line"],
      detail: "x",
      options: { rows: 2 },
      reason: "died",
      status: "FAILED",
    });
    expect(refusal.status).toBe("FAILED");
    expect(refusal.body).toEqual(["line"]);
    expect(refusal.options).toEqual({ rows: 2 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/refusal.test.ts`
Expected: FAIL with `Cannot find module "#harness/ops/refusal"`.

- [ ] **Step 3: Write the seven contract files from the contract, byte for byte**

The contract's fenced blocks are the source. Copy them with this script (run from the worktree root). `CONTRACT` is the contract file; it is committed at `docs/plans/2026-09-26-pi-harness-epic-plan/contract.md`.

```bash
CONTRACT=${CONTRACT:-docs/plans/2026-09-26-pi-harness-epic-plan/contract.md}
mkdir -p packages/harness/src/contract
for name in result views details log runs config services; do
  awk -v h="#### \`contract/$name.ts\`" '
    $0 == h { found = 1; next }
    found && /^```ts$/ { inside = 1; next }
    inside && /^```$/ { exit }
    inside { print }
  ' "$CONTRACT" > "packages/harness/src/contract/$name.ts"
  test -s "packages/harness/src/contract/$name.ts" || echo "EMPTY: $name"
done
wc -l packages/harness/src/contract/*.ts
```

Expected: no `EMPTY:` line; line counts 29 (`result`), 143 (`views`), 275 (`details`), 118 (`log`), 54 (`runs`), 88 (`config`), 203 (`services`) as measured on the contract of 2026-09-26 21:29. The files hold types only; `mise lint:fix` later sorts members and imports, which changes no type.

- [ ] **Step 4: Implement** `packages/harness/src/ops/refusal.ts`

```ts
import type { ToolStatus } from "#harness/contract/result";

type RefusalStatus = Extract<ToolStatus, "REFUSED" | "FAILED" | "UNCONFIRMED">;

export type RefusalInit = {
  reason: string;
  detail: string;
  next?: string;
  body?: string[];
  options?: unknown;
  status?: RefusalStatus;
};

export class Refusal extends Error {
  readonly reason: string;
  readonly detail: string;
  readonly next: string | undefined;
  readonly body: string[];
  readonly options: unknown;
  readonly status: RefusalStatus;

  constructor(init: RefusalInit) {
    super(`${init.reason}: ${init.detail}`);
    this.name = "Refusal";
    this.reason = init.reason;
    this.detail = init.detail;
    this.next = init.next;
    this.body = init.body ?? [];
    this.options = init.options;
    this.status = init.status ?? "REFUSED";
  }
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/harness/src/ops/refusal.test.ts`
Expected: PASS, 3 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

Also run `bun run tsc --noEmit -p packages/harness` once before `lint:fix`: it proves the contract resolves every core name (C0, C1 landed). A missing core export here is a contract defect: stop and report it to the coordinator.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/contract packages/harness/src/ops/refusal.ts packages/harness/src/ops/refusal.test.ts
mise exec -- git commit -m "feat: Add the frozen harness contract types" -m "Every cross-module harness type lives in contract/ so the tool, UI, log and eval tracks build in parallel against one frozen surface. Refusal is the one runtime file: any harness code throws it and tools/define.ts turns it into a result."
```

### Task F3a: Harness flags

**Needs:** F2

**Files:**
- Create: `packages/harness/src/config/flags.ts`
- Test: `packages/harness/src/config/flags.test.ts`

**Interfaces:**
- Consumes: `HarnessFlags` (`contract/config.ts`), `ThinkingLevel` (type only), `messageOf` (`@tuicraft/core/lib/errors`).
- Produces: `class UsageError extends Error`; `const USAGE: string`; `const DEFAULT_MODEL = "openai-codex/gpt-6-luna"`; `parseFlags(argv: readonly string[]): HarnessFlags`; `harnessStateDir(home: string): string`. This file imports nothing from `@earendil-works/*` at run time (only `import type`), because `entry.ts` loads it before the `PI_*` env is set.

- [ ] **Step 1: Write the failing test** `packages/harness/src/config/flags.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL,
  harnessStateDir,
  parseFlags,
  USAGE,
  UsageError,
} from "#harness/config/flags";

describe("parseFlags", () => {
  test("gives the design H.8 defaults", () => {
    expect(parseFlags(["--profile", "/p.json"])).toEqual({
      check: false,
      connect: true,
      glyphs: undefined,
      logEntities: false,
      model: DEFAULT_MODEL,
      nowPerCall: false,
      profile: "/p.json",
      runDir: undefined,
      stopReflex: true,
      thinking: "high",
      wake: true,
    });
  });

  test("reads every flag", () => {
    const argv = [
      "--profile",
      "/p.json",
      "--run-dir",
      "/r",
      "--model",
      "faux/faux-1",
      "--thinking",
      "low",
      "--no-connect",
      "--wake",
      "off",
      "--glyphs",
      "ascii",
      "--stop-reflex",
      "off",
      "--now-per-call",
      "--log-entities",
      "--check",
    ];
    expect(parseFlags(argv)).toEqual({
      check: true,
      connect: false,
      glyphs: "ascii",
      logEntities: true,
      model: "faux/faux-1",
      nowPerCall: true,
      profile: "/p.json",
      runDir: "/r",
      stopReflex: false,
      thinking: "low",
      wake: false,
    });
  });

  test("requires --profile", () => {
    expect(() => parseFlags([])).toThrow(UsageError);
    expect(() => parseFlags([])).toThrow("--profile <path> is required.");
  });

  test("refuses an unknown thinking level", () => {
    expect(() => parseFlags(["--profile", "/p", "--thinking", "huge"])).toThrow(
      '--thinking must be one of off|minimal|low|medium|high|xhigh|max, not "huge".',
    );
  });

  test("refuses a wake value that is not on or off", () => {
    expect(() => parseFlags(["--profile", "/p", "--wake", "yes"])).toThrow(
      '--wake must be on or off, not "yes".',
    );
  });

  test("turns an unknown flag into a UsageError", () => {
    expect(() => parseFlags(["--profile", "/p", "--account", "X"])).toThrow(
      UsageError,
    );
  });

  test("names every flag in the usage text", () => {
    for (const flag of [
      "--profile",
      "--run-dir",
      "--model",
      "--thinking",
      "--no-connect",
      "--wake",
      "--glyphs",
      "--stop-reflex",
      "--now-per-call",
      "--log-entities",
      "--check",
    ]) {
      expect(USAGE).toContain(flag);
    }
  });
});

test("harnessStateDir is a fixed home path", () => {
  expect(harnessStateDir("/home/me")).toBe(
    "/home/me/.local/state/tuicraft-harness",
  );
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/config/flags.test.ts`
Expected: FAIL with `Cannot find module "#harness/config/flags"`.

- [ ] **Step 3: Implement** `packages/harness/src/config/flags.ts`

```ts
import { parseArgs } from "node:util";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { HarnessFlags } from "#harness/contract/config";

export class UsageError extends Error {}

export const DEFAULT_MODEL = "openai-codex/gpt-6-luna";

export const USAGE = `Usage: bun packages/harness/src/entry.ts --profile <path> [options]

  --profile <path>        soap session JSON, soap ledger JSON or tuicraft config.toml (required)
  --run-dir <path>        run directory (default: <state>/runs/<utc>-<character>)
  --model <provider/id>   model (default: ${DEFAULT_MODEL})
  --thinking <level>      off|minimal|low|medium|high|xhigh|max (default: high)
  --no-connect            do not log in at start; use /connect
  --wake on|off           let game events start a turn (default: on)
  --glyphs <name>         nerd|unicode|ascii (default: nerd, or TUICRAFT_GLYPHS)
  --stop-reflex on|off    stop all actions when a short message starts with "stop" (default: on)
  --now-per-call          send the [now] line before every model request
  --log-entities          write raw entity rows to the game log
  --check                 check the profile, the lock and the Codex login, then exit`;

const THINKING: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const OPTIONS = {
  check: { type: "boolean" },
  glyphs: { type: "string" },
  "log-entities": { type: "boolean" },
  model: { type: "string" },
  "no-connect": { type: "boolean" },
  "now-per-call": { type: "boolean" },
  profile: { type: "string" },
  "run-dir": { type: "string" },
  "stop-reflex": { type: "string" },
  thinking: { type: "string" },
  wake: { type: "string" },
} as const;

export function harnessStateDir(home: string): string {
  return `${home}/.local/state/tuicraft-harness`;
}

export function parseFlags(argv: readonly string[]): HarnessFlags {
  const values = readArgs(argv);
  if (!values.profile) throw new UsageError("--profile <path> is required.");
  return {
    check: values.check ?? false,
    connect: !values["no-connect"],
    glyphs: values.glyphs,
    logEntities: values["log-entities"] ?? false,
    model: values.model ?? DEFAULT_MODEL,
    nowPerCall: values["now-per-call"] ?? false,
    profile: values.profile,
    runDir: values["run-dir"],
    stopReflex: onOff("--stop-reflex", values["stop-reflex"]),
    thinking: thinkingOf(values.thinking),
    wake: onOff("--wake", values.wake),
  };
}

function readArgs(argv: readonly string[]) {
  try {
    return parseArgs({
      allowPositionals: false,
      args: [...argv],
      options: OPTIONS,
      strict: true,
    }).values;
  } catch (error) {
    throw new UsageError(messageOf(error), { cause: error });
  }
}

function thinkingOf(value: string | undefined): ThinkingLevel {
  if (value === undefined) return "high";
  const level = THINKING.find((known) => known === value);
  if (!level)
    throw new UsageError(
      `--thinking must be one of ${THINKING.join("|")}, not "${value}".`,
    );
  return level;
}

function onOff(flag: string, value: string | undefined): boolean {
  if (value === undefined || value === "on") return true;
  if (value === "off") return false;
  throw new UsageError(`${flag} must be on or off, not "${value}".`);
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/config/flags.test.ts`
Expected: PASS, 8 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/config/flags.ts packages/harness/src/config/flags.test.ts
mise exec -- git commit -m "feat: Parse harness flags" -m "The harness reads its settings only from argv (design H.8), never from WOW_* env, so the main checkout's mise.local.toml cannot point it at a fixed account."
```

### Task F3b: Profile loader and protected-account refusal

**Needs:** F2

**Files:**
- Create: `packages/harness/src/config/profile.ts`
- Test: `packages/harness/src/config/profile.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ProfileSource` (`contract/config.ts`); `parseConfig`, `clientConfig`, `Config`, `serializeConfig` (tests) from `@tuicraft/core/lib/config`; `messageOf`, `ignoreFailure`.
- Produces: `type ProfileErrorCode`; `class ProfileError extends Error { readonly code: ProfileErrorCode; constructor(code, message, options?: ErrorOptions) }`; `PROTECTED_ACCOUNTS`, `PROTECTED_ACCOUNT_PREFIXES`, `PROTECTED_CHARACTERS`; `isProtected(account: string, character: string): boolean`; `loadProfile(path: string, home?: string): Promise<Profile>`.

Format rules (measured in `packages/factory/src/soap.ts` and `soap-wrapper.ts`): a soap session JSON has `dir` and `wrapper`, and its config is `<dir>/config/tuicraft/config.toml` (Contract issue 1); a soap ledger JSON has `createdAt` and `owner` and no `dir`, so its paths come from `<home>/.config/tuicraft/config.toml`, and its language is 7 for the Alliance presets `elwynn1`, `elwynn10`, else 1 (`soap-presets.ts:78,95`); anything that does not start with `{` is a tuicraft `config.toml`. This test also carries the NAV follow-up from contract 0.5: `navigationLibrary` comes from the session's own config, not from home.

- [ ] **Step 1: Write the failing test** `packages/harness/src/config/profile.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeConfig } from "@tuicraft/core/lib/config";
import {
  isProtected,
  loadProfile,
  ProfileError,
} from "#harness/config/profile";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-profile-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

type TomlInit = {
  path: string;
  account: string;
  character: string;
  library: string;
};

async function writeToml({
  path,
  account,
  character,
  library,
}: TomlInit): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const config = {
    account,
    character,
    host: "t1",
    language: 1,
    navigation_data_dir: "/nav/data",
    navigation_library: library,
    password: "pw-in-toml",
    port: 3724,
    spell_data_dir: "/spells",
    timeout_minutes: 30,
  };
  await writeFile(path, `${serializeConfig(config)}\n`);
}

async function writeJson(name: string, value: unknown): Promise<string> {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

async function sessionProfile(
  account: string,
  character: string,
): Promise<string> {
  const dir = join(root, `factory-account-${account}`);
  await writeToml({
    account,
    character,
    library: "/patched/libnamigator.so",
    path: join(dir, "config/tuicraft/config.toml"),
  });
  return writeJson("session.json", {
    account,
    character,
    dir,
    password: "secretpw",
    preset: "fresh",
    wrapper: join(root, `tc-${account}`),
  });
}

describe("loadProfile", () => {
  test("reads a soap session JSON and its account config", async () => {
    const profile = await loadProfile(
      await sessionProfile("FACABC0123456", "Fgklibhlflc"),
      root,
    );
    expect(profile.source).toBe("soap_session");
    expect(profile.account).toBe("FACABC0123456");
    expect(profile.character).toBe("Fgklibhlflc");
    expect(profile.client.password).toBe("SECRETPW");
    expect(profile.client.host).toBe("t1");
    expect(profile.client.spellDataDir).toBe("/spells");
  });

  test("takes the navigation library from the session's config, not from home", async () => {
    await writeToml({
      account: "HOMEACC",
      character: "Homechar",
      library: "/unpatched/libnamigator.so",
      path: join(root, ".config/tuicraft/config.toml"),
    });
    const profile = await loadProfile(
      await sessionProfile("FACABC0123456", "Fgklibhlflc"),
      root,
    );
    expect(profile.client.navigationLibrary).toBe("/patched/libnamigator.so");
    expect(profile.client.navigationDataDir).toBe("/nav/data");
  });

  test("refuses a session whose config logs in as another character", async () => {
    const dir = join(root, "factory-account-FACABC0123456");
    await writeToml({
      account: "FACABC0123456",
      character: "Other",
      library: "/lib.so",
      path: join(dir, "config/tuicraft/config.toml"),
    });
    const path = await writeJson("s.json", {
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      dir,
      password: "pw",
      preset: "fresh",
      wrapper: "/w",
    });
    await expect(loadProfile(path, root)).rejects.toMatchObject({
      code: "unknown_format",
    });
  });

  test("names the missing file when the session's account dir is gone", async () => {
    const path = await writeJson("s.json", {
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      dir: join(root, "gone"),
      password: "pw",
      preset: "fresh",
      wrapper: "/w",
    });
    const error = await loadProfile(path, root).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ code: "unreadable" });
    expect(String(error)).toContain(
      join(root, "gone/config/tuicraft/config.toml"),
    );
  });

  test("reads a soap ledger entry with navigation paths from home", async () => {
    await writeToml({
      account: "HOMEACC",
      character: "Homechar",
      library: "/home/lib.so",
      path: join(root, ".config/tuicraft/config.toml"),
    });
    const path = await writeJson("ledger.json", {
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      createdAt: "2026-09-26T00:00:00Z",
      owner: "/w",
      password: "pw",
      preset: "elwynn10",
    });
    const profile = await loadProfile(path, root);
    expect(profile.source).toBe("soap_ledger");
    expect(profile.client.account).toBe("FACABC0123456");
    expect(profile.client.navigationLibrary).toBe("/home/lib.so");
    expect(profile.client.language).toBe(7);
  });

  test("reads a tuicraft config.toml", async () => {
    const path = join(root, "config.toml");
    await writeToml({
      account: "myacc",
      character: "Mychar",
      library: "/lib.so",
      path,
    });
    const profile = await loadProfile(path, root);
    expect(profile.source).toBe("config_toml");
    expect(profile.account).toBe("MYACC");
  });

  test.each([
    ["ADMIN", "Anyone", "protected_account"],
    ["rndbot123", "Bot", "protected_account"],
    ["FACABC0123456", "xiara", "protected_character"],
  ])("refuses %s / %s", async (account, character, code) => {
    const path = join(root, "config.toml");
    await writeToml({ account, character, library: "/lib.so", path });
    await expect(loadProfile(path, root)).rejects.toMatchObject({ code });
  });

  test("refuses a ledger entry with no password", async () => {
    const path = await writeJson("l.json", {
      account: "A",
      character: "B",
      createdAt: "x",
      owner: "/w",
      preset: "fresh",
    });
    await expect(loadProfile(path, root)).rejects.toMatchObject({
      code: "missing_field",
    });
  });

  test("refuses JSON that is neither a session nor a ledger entry", async () => {
    await expect(
      loadProfile(await writeJson("x.json", { foo: 1 }), root),
    ).rejects.toMatchObject({ code: "unknown_format" });
  });

  test("refuses a file that does not exist", async () => {
    await expect(
      loadProfile(join(root, "missing.json"), root),
    ).rejects.toMatchObject({ code: "unreadable" });
  });
});

test("isProtected matches accounts, the RNDBOT prefix and Xiara", () => {
  expect(isProtected("deity", "Anyone")).toBe(true);
  expect(isProtected("RNDBOT7", "Bot")).toBe(true);
  expect(isProtected("FACABC0123456", "XIARA")).toBe(true);
  expect(isProtected("FACABC0123456", "Fgklibhlflc")).toBe(false);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/config/profile.test.ts`
Expected: FAIL with `Cannot find module "#harness/config/profile"`.

- [ ] **Step 3: Implement** `packages/harness/src/config/profile.ts`

```ts
import { homedir } from "node:os";
import {
  type Config,
  clientConfig,
  parseConfig,
} from "@tuicraft/core/lib/config";
import { messageOf } from "@tuicraft/core/lib/errors";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { Profile, ProfileSource } from "#harness/contract/config";

export type ProfileErrorCode =
  | "unreadable"
  | "unknown_format"
  | "missing_field"
  | "protected_account"
  | "protected_character";

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;

  constructor(code: ProfileErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProfileError";
    this.code = code;
  }
}

export const PROTECTED_ACCOUNTS: readonly string[] = [
  "ADMIN",
  "DEITY",
  "X",
  "Y",
  "AUCTIONHOUSE",
  "TCFACTORY",
  "TCPRESETS",
];
export const PROTECTED_ACCOUNT_PREFIXES: readonly string[] = ["RNDBOT"];
export const PROTECTED_CHARACTERS: readonly string[] = ["Xiara"];

type Json = Record<string, unknown>;
type Parsed = { source: ProfileSource; config: Config };
type NavFields = Pick<
  Config,
  "spell_data_dir" | "navigation_data_dir" | "navigation_library"
>;

const ALLIANCE_PRESETS: readonly string[] = ["elwynn1", "elwynn10"];

export function isProtected(account: string, character: string): boolean {
  return protectedAccount(account) || protectedCharacter(character);
}

export async function loadProfile(
  path: string,
  home = homedir(),
): Promise<Profile> {
  const { source, config } = await parseProfile({
    home,
    path,
    text: await readText(path),
  });
  if (protectedAccount(config.account))
    throw new ProfileError(
      "protected_account",
      `The account ${config.account.toUpperCase()} is protected. The harness does not log in to it.`,
    );
  if (protectedCharacter(config.character))
    throw new ProfileError(
      "protected_character",
      `The character ${config.character} is protected. The harness does not log in to it.`,
    );
  return {
    account: config.account.toUpperCase(),
    character: config.character,
    client: clientConfig(config),
    path,
    source,
  };
}

function protectedAccount(account: string): boolean {
  const upper = account.toUpperCase();
  return (
    PROTECTED_ACCOUNTS.includes(upper) ||
    PROTECTED_ACCOUNT_PREFIXES.some((prefix) => upper.startsWith(prefix))
  );
}

function protectedCharacter(character: string): boolean {
  return PROTECTED_CHARACTERS.some(
    (name) => name.toLowerCase() === character.toLowerCase(),
  );
}

async function readText(path: string): Promise<string> {
  const text = await Bun.file(path).text().catch(ignoreFailure);
  if (text === undefined)
    throw new ProfileError("unreadable", `Cannot read ${path}.`);
  return text;
}

async function parseProfile({
  path,
  text,
  home,
}: {
  path: string;
  text: string;
  home: string;
}): Promise<Parsed> {
  if (!text.trimStart().startsWith("{"))
    return { config: parseToml(text, path), source: "config_toml" };
  const json = parseJson(text, path);
  if (typeof json["dir"] === "string")
    return { config: await sessionConfig(json), source: "soap_session" };
  if (typeof json["createdAt"] === "string")
    return { config: await ledgerConfig(json, home), source: "soap_ledger" };
  throw new ProfileError(
    "unknown_format",
    `${path} is not a soap session, a soap ledger entry or a tuicraft config.toml.`,
  );
}

function attempt<T>(read: () => T): T | Error {
  try {
    return read();
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error(messageOf(error), { cause: error });
  }
}

function parseJson(text: string, path: string): Json {
  const value: unknown = attempt(() => JSON.parse(text));
  if (value instanceof Error)
    throw new ProfileError(
      "unknown_format",
      `${path} is not valid JSON: ${value.message}`,
      { cause: value },
    );
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ProfileError(
      "unknown_format",
      `${path} does not hold a JSON object.`,
    );
  return value as Json;
}

function parseToml(text: string, path: string): Config {
  const config = attempt(() => parseConfig(text));
  if (!(config instanceof Error)) return config;
  const code = config.message.startsWith("Missing required config field")
    ? "missing_field"
    : "unknown_format";
  throw new ProfileError(code, `${path}: ${config.message}`, { cause: config });
}

function field(json: Json, name: string): string {
  const value = json[name];
  if (typeof value !== "string" || value.length === 0)
    throw new ProfileError("missing_field", `The profile has no "${name}".`);
  return value;
}

async function sessionConfig(json: Json): Promise<Config> {
  const character = field(json, "character");
  const path = `${field(json, "dir")}/config/tuicraft/config.toml`;
  const base = parseToml(await readText(path), path);
  const logsIn =
    base.account.toUpperCase() === field(json, "account").toUpperCase() &&
    base.character === character;
  if (!logsIn)
    throw new ProfileError(
      "unknown_format",
      `${path} logs in as ${base.account}/${base.character}, not as ${character}.`,
    );
  return { ...base, password: field(json, "password") };
}

async function ledgerConfig(json: Json, home: string): Promise<Config> {
  const nav = await navFields(`${home}/.config/tuicraft/config.toml`);
  const language = ALLIANCE_PRESETS.includes(field(json, "preset")) ? 7 : 1;
  const [account, character, password] = [
    field(json, "account"),
    field(json, "character"),
    field(json, "password"),
  ];
  return {
    account,
    character,
    host: "t1",
    language,
    password,
    port: 3724,
    timeout_minutes: 30,
    ...nav,
  };
}

async function navFields(path: string): Promise<Partial<NavFields>> {
  const text = await Bun.file(path).text().catch(ignoreFailure);
  if (text === undefined) return {};
  const { spell_data_dir, navigation_data_dir, navigation_library } = parseToml(
    text,
    path,
  );
  return { navigation_data_dir, navigation_library, spell_data_dir };
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/config/profile.test.ts`
Expected: PASS, 13 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/config/profile.ts packages/harness/src/config/profile.test.ts
mise exec -- git commit -m "feat: Load harness profiles" -m "The harness logs in only with an explicit profile (R19): a soap session, a soap ledger entry or a config.toml. Protected accounts and Xiara are refused before any network call, with no override (R38)."
```

### Task F3c: Per-character lock that also detects a daemon

**Needs:** F3b

**Files:**
- Create: `packages/harness/src/config/lock.ts`
- Test: `packages/harness/src/config/lock.test.ts`

**Interfaces:**
- Consumes: `Profile`; `parseConfig`, `Config`; `ignoreFailure`.
- Produces: `type LockInit = { profile; stateDir; runDir; pid?; host?; procDir? }`; `type Lock = { path; release(): Promise<void>; releaseSync(): void }`; `class LockError extends Error { code: "held_by_harness" | "held_by_daemon"; holder: string }`; `acquireLock(init: LockInit): Promise<Lock>`.

Rules: lock file `<stateDir>/locks/<ACCOUNT>-<character>.lock`, `open("wx", 0o600)`, body `{host, pid, runDir, startedAt}`. A holder is alive when `<procDir>/<pid>` exists (so tests inject `procDir`). A daemon holds the character when `<procDir>/<pid>/cmdline` has the argument `--daemon` (the CLI spawns `bun main.ts --daemon`, `packages/cli/src/cli/ipc.ts:68-71`) and its `XDG_CONFIG_HOME` (else `$HOME/.config`, both read from `<procDir>/<pid>/environ`) holds a `tuicraft/config.toml` with the same account and character. An unreadable proc file is skipped.

- [ ] **Step 1: Write the failing test** `packages/harness/src/config/lock.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeConfig } from "@tuicraft/core/lib/config";
import { acquireLock, LockError } from "#harness/config/lock";
import type { Profile } from "#harness/contract/config";

let root: string;
let procDir: string;
let stateDir: string;

const profile: Profile = {
  account: "FACABC0123456",
  character: "Fgklibhlflc",
  client: {
    account: "FACABC0123456",
    character: "Fgklibhlflc",
    host: "t1",
    password: "PW",
    port: 3724,
  },
  path: "/p.json",
  source: "soap_session",
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-lock-"));
  procDir = join(root, "proc");
  stateDir = join(root, "state");
  await mkdir(procDir);
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function liveProcess(
  pid: number,
  files: Record<string, string> = {},
): Promise<void> {
  await mkdir(join(procDir, String(pid)));
  for (const [name, text] of Object.entries(files))
    await writeFile(join(procDir, String(pid), name), text);
}

async function daemonConfig(
  account: string,
  character: string,
): Promise<string> {
  const xdg = join(root, `config-${account}-${character}`);
  await mkdir(join(xdg, "tuicraft"), { recursive: true });
  const config = {
    account,
    character,
    host: "t1",
    language: 1,
    password: "pw",
    port: 3724,
    timeout_minutes: 30,
  };
  await writeFile(join(xdg, "tuicraft/config.toml"), serializeConfig(config));
  return xdg;
}

describe("acquireLock", () => {
  test("creates a 0600 lock file named after account and character", async () => {
    const lock = await acquireLock({
      host: "h1",
      pid: 111,
      procDir,
      profile,
      runDir: "/runs/a",
      stateDir,
    });
    expect(lock.path).toBe(
      join(stateDir, "locks/FACABC0123456-Fgklibhlflc.lock"),
    );
    expect((await stat(lock.path)).mode % 0o1000).toBe(0o600);
    expect(JSON.parse(await readFile(lock.path, "utf8"))).toMatchObject({
      host: "h1",
      pid: 111,
      runDir: "/runs/a",
    });
  });

  test("refuses while another live harness holds the lock and keeps its file", async () => {
    await liveProcess(111);
    const first = await acquireLock({
      host: "h1",
      pid: 111,
      procDir,
      profile,
      runDir: "/runs/a",
      stateDir,
    });
    const second = acquireLock({
      host: "h1",
      pid: 222,
      procDir,
      profile,
      runDir: "/runs/b",
      stateDir,
    });
    await expect(second).rejects.toBeInstanceOf(LockError);
    await expect(second).rejects.toMatchObject({ code: "held_by_harness" });
    expect(JSON.parse(await readFile(first.path, "utf8")).pid).toBe(111);
  });

  test("replaces a lock whose pid is dead", async () => {
    await acquireLock({
      host: "h1",
      pid: 111,
      procDir,
      profile,
      runDir: "/runs/a",
      stateDir,
    });
    const lock = await acquireLock({
      host: "h1",
      pid: 222,
      procDir,
      profile,
      runDir: "/runs/b",
      stateDir,
    });
    expect(JSON.parse(await readFile(lock.path, "utf8")).pid).toBe(222);
  });

  test("refuses when a daemon is logged in as the character", async () => {
    const xdg = await daemonConfig("facabc0123456", "Fgklibhlflc");
    await liveProcess(333, {
      cmdline: "bun\0main.ts\0--daemon\0",
      environ: `HOME=/nowhere\0XDG_CONFIG_HOME=${xdg}\0`,
    });
    await expect(
      acquireLock({ pid: 222, procDir, profile, runDir: "/r", stateDir }),
    ).rejects.toMatchObject({ code: "held_by_daemon", holder: "pid 333" });
  });

  test("ignores a daemon of another character and a non-daemon process", async () => {
    const xdg = await daemonConfig("OTHERACC", "Other");
    await liveProcess(333, {
      cmdline: "bun\0main.ts\0--daemon\0",
      environ: `XDG_CONFIG_HOME=${xdg}\0`,
    });
    await liveProcess(444, {
      cmdline: "bun\0main.ts\0status\0",
      environ: `XDG_CONFIG_HOME=${await daemonConfig("FACABC0123456", "Fgklibhlflc")}\0`,
    });
    await expect(
      acquireLock({ pid: 222, procDir, profile, runDir: "/r", stateDir }),
    ).resolves.toBeDefined();
  });

  test("release and releaseSync remove only their own lock", async () => {
    const lock = await acquireLock({
      pid: 111,
      procDir,
      profile,
      runDir: "/r",
      stateDir,
    });
    await lock.release();
    expect(existsSync(lock.path)).toBe(false);
    const again = await acquireLock({
      pid: 222,
      procDir,
      profile,
      runDir: "/r",
      stateDir,
    });
    lock.releaseSync();
    expect(existsSync(again.path)).toBe(true);
    again.releaseSync();
    expect(existsSync(again.path)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/config/lock.test.ts`
Expected: FAIL with `Cannot find module "#harness/config/lock"`.

- [ ] **Step 3: Implement** `packages/harness/src/config/lock.ts`

```ts
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { type Config, parseConfig } from "@tuicraft/core/lib/config";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { Profile } from "#harness/contract/config";

export type LockInit = {
  profile: Profile;
  stateDir: string;
  runDir: string;
  pid?: number;
  host?: string;
  procDir?: string;
};
export type Lock = {
  path: string;
  release: () => Promise<void>;
  releaseSync: () => void;
};

type LockCode = "held_by_harness" | "held_by_daemon";
type LockFile = {
  pid: number;
  startedAt: string;
  runDir: string;
  host: string;
};
type Claim = { path: string; body: LockFile; procDir: string };

export class LockError extends Error {
  readonly code: LockCode;
  readonly holder: string;

  constructor(code: LockCode, holder: string) {
    super(
      code === "held_by_daemon"
        ? `A tuicraft daemon (${holder}) is logged in as this character. Stop that daemon first.`
        : `Another harness (${holder}) holds this character. Stop it first.`,
    );
    this.name = "LockError";
    this.code = code;
    this.holder = holder;
  }
}

export async function acquireLock(init: LockInit): Promise<Lock> {
  const procDir = init.procDir ?? "/proc";
  const pid = init.pid ?? process.pid;
  const daemon = findDaemon({ procDir, profile: init.profile, self: pid });
  if (daemon !== undefined)
    throw new LockError("held_by_daemon", `pid ${daemon}`);
  const path = `${init.stateDir}/locks/${init.profile.account.toUpperCase()}-${init.profile.character}.lock`;
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const body = {
    host: init.host ?? hostname(),
    pid,
    runDir: init.runDir,
    startedAt: new Date().toISOString(),
  };
  await claim({ body, path, procDir });
  return {
    path,
    release: () => release(path, pid),
    releaseSync: () => releaseSync(path, pid),
  };
}

async function claim({ path, body, procDir }: Claim): Promise<void> {
  if (await tryCreate(path, body)) return;
  const holder = parseLock(await readFile(path, "utf8").catch(ignoreFailure));
  if (holder && existsSync(`${procDir}/${holder.pid}`))
    throw new LockError(
      "held_by_harness",
      `pid ${holder.pid} on ${holder.host}, run dir ${holder.runDir}`,
    );
  await rm(path, { force: true });
  if (!(await tryCreate(path, body)))
    throw new LockError(
      "held_by_harness",
      "a harness that started at the same time",
    );
}

async function tryCreate(path: string, body: LockFile): Promise<boolean> {
  try {
    const file = await open(path, "wx", 0o600);
    await file.writeFile(`${JSON.stringify(body)}\n`);
    await file.close();
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return false;
    throw error;
  }
}

function parseLock(text: string | undefined): LockFile | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as LockFile;
  } catch {
    return undefined;
  }
}

async function release(path: string, pid: number): Promise<void> {
  const holder = parseLock(await readFile(path, "utf8").catch(ignoreFailure));
  if (holder?.pid === pid) await rm(path, { force: true });
}

function releaseSync(path: string, pid: number): void {
  if (parseLock(readQuiet(path))?.pid === pid) rmSync(path, { force: true });
}

function readQuiet(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function findDaemon({
  procDir,
  profile,
  self,
}: {
  procDir: string;
  profile: Profile;
  self: number;
}): number | undefined {
  for (const name of readdirSync(procDir)) {
    const pid = Number(name);
    if (!Number.isInteger(pid) || pid === self) continue;
    if (daemonHolds(`${procDir}/${name}`, profile)) return pid;
  }
  return undefined;
}

function daemonHolds(dir: string, profile: Profile): boolean {
  const args = readQuiet(`${dir}/cmdline`)?.split("\0") ?? [];
  if (!args.includes("--daemon")) return false;
  const config = daemonConfig(readQuiet(`${dir}/environ`) ?? "");
  if (!config) return false;
  return (
    config.account.toUpperCase() === profile.account.toUpperCase() &&
    config.character.toLowerCase() === profile.character.toLowerCase()
  );
}

function daemonConfig(environ: string): Config | undefined {
  const env = new Map(
    environ
      .split("\0")
      .filter((line) => line.includes("="))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ]),
  );
  const home = env.get("HOME");
  const base =
    env.get("XDG_CONFIG_HOME") ?? (home ? `${home}/.config` : undefined);
  const text = base ? readQuiet(`${base}/tuicraft/config.toml`) : undefined;
  if (text === undefined) return undefined;
  try {
    return parseConfig(text);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/config/lock.test.ts`
Expected: PASS, 6 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/config/lock.ts packages/harness/src/config/lock.test.ts
mise exec -- git commit -m "feat: Lock a character for one harness" -m "Two clients on one character fight over movement and chat. The lock refuses a second harness and a CLI daemon that is logged in as the same character, and replaces a lock whose process is gone."
```

### Task F4a: Read-only omp credential store

**Needs:** F2

**Files:**
- Create: `packages/harness/src/credentials/omp-store.ts`
- Create: `packages/harness/test-support/omp-db.ts` (added file, Contract issue 11)
- Test: `packages/harness/src/credentials/omp-store.test.ts`

**Interfaces:**
- Consumes: `CredentialStore`, `Credential`, `CredentialInfo`, `AuthOperationOptions` (`@earendil-works/pi-ai`, `dist/auth/types.d.ts:21-79`); `bun:sqlite`; `messageOf`.
- Produces: `type OmpRow = { access; expires; accountId }`; `type OmpStoreInit = { dbPath; now }`; `ompDbPath(home): string`; `readOmpRow(dbPath): OmpRow | undefined`; `class CredentialExpiredError extends Error { provider; expires }`; `class OmpCredentialStore implements CredentialStore` with `read`, `list`, `modify`, `delete`, `reads(): number` (database reads, Contract issue 13). Test support: `writeOmpDb(path, rows)`, `codexRow({access, expires, updatedAt?})`, `type OmpDbRow`.

Facts (luna-runtime §1, measured there): the only live Codex login is omp's row in `~/.omp/agent/agent.db`, table `auth_credentials(id, provider, credential_type, data TEXT, disabled_cause, identity_key, created_at, updated_at)`; `data` keys `access, refresh, expires, accountId, email, orgId, orgName, authorizedAt`. Pi calls `modify` when `now + 5 min >= expires` and refreshes only inside `fn` (`pi-ai/dist/auth/resolve.js:62-92`, read), so a `modify` that never calls `fn` can never refresh. The `SQLITE_BUSY` retry (3 times, 50 ms) has no test: `OmpStoreInit` gives no way to inject a busy database, and a real lock race is not reproducible in a unit test.

- [ ] **Step 1: Write the test support** `packages/harness/test-support/omp-db.ts`

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type OmpDbRow = {
  provider: string;
  type: string;
  data: Record<string, unknown>;
  disabled?: string;
  updatedAt: number;
};

export function codexRow(init: {
  access: string;
  expires: number;
  updatedAt?: number;
}): OmpDbRow {
  const data = {
    access: init.access,
    accountId: "acct-test",
    email: "test@example.invalid",
    expires: init.expires,
    refresh: "refresh-never-read",
  };
  return {
    data,
    provider: "openai-codex",
    type: "oauth",
    updatedAt: init.updatedAt ?? 1,
  };
}

export function writeOmpDb(path: string, rows: readonly OmpDbRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.run(
    "create table if not exists auth_credentials (id integer primary key, provider text, credential_type text, data text, disabled_cause text, identity_key text, created_at integer, updated_at integer)",
  );
  db.run("delete from auth_credentials");
  const insert = db.query(
    "insert into auth_credentials (provider, credential_type, data, disabled_cause, identity_key, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const row of rows)
    insert.run(
      row.provider,
      row.type,
      JSON.stringify(row.data),
      row.disabled ?? null,
      "id-key",
      row.updatedAt,
      row.updatedAt,
    );
  db.close();
}
```

- [ ] **Step 2: Write the failing test** `packages/harness/src/credentials/omp-store.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { utimesSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CredentialExpiredError,
  OmpCredentialStore,
  ompDbPath,
  readOmpRow,
} from "#harness/credentials/omp-store";
import { codexRow, writeOmpDb } from "#test-support/omp-db";

const NOW = Date.parse("2026-09-26T19:00:00Z");
const HOUR = 3_600_000;

let home: string;
let dbPath: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "harness-omp-"));
  dbPath = ompDbPath(home);
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

function store(): OmpCredentialStore {
  return new OmpCredentialStore({ dbPath, now: () => NOW });
}

function touch(path: string, seconds: number): void {
  const at = new Date(NOW + seconds * 1000);
  utimesSync(path, at, at);
}

describe("readOmpRow", () => {
  test("returns the newest enabled codex oauth row, access and expiry only", () => {
    writeOmpDb(dbPath, [
      codexRow({ access: "old-access", expires: NOW + HOUR, updatedAt: 1 }),
      codexRow({ access: "new-access", expires: NOW + 2 * HOUR, updatedAt: 2 }),
      {
        ...codexRow({
          access: "disabled-access",
          expires: NOW + 3 * HOUR,
          updatedAt: 3,
        }),
        disabled: "revoked",
      },
      {
        ...codexRow({
          access: "other-access",
          expires: NOW + 3 * HOUR,
          updatedAt: 4,
        }),
        provider: "anthropic",
      },
    ]);
    expect(readOmpRow(dbPath)).toEqual({
      access: "new-access",
      accountId: "acct-test",
      expires: NOW + 2 * HOUR,
    });
  });

  test("returns undefined when the database or the row is missing", () => {
    expect(readOmpRow(dbPath)).toBeUndefined();
    writeOmpDb(dbPath, []);
    expect(readOmpRow(dbPath)).toBeUndefined();
  });

  test("ompDbPath is under the omp agent dir", () => {
    expect(ompDbPath("/home/me")).toBe("/home/me/.omp/agent/agent.db");
  });
});

describe("OmpCredentialStore", () => {
  test("reads the codex row as an oauth credential with an empty refresh token", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    expect(await store().read("openai-codex")).toEqual({
      access: "a1",
      accountId: "acct-test",
      expires: NOW + HOUR,
      refresh: "",
      type: "oauth",
    });
    expect(await store().read("anthropic")).toBeUndefined();
  });

  test("caches the row until the database or its -wal file changes", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    touch(dbPath, 1);
    const s = store();
    await s.read("openai-codex");
    await s.read("openai-codex");
    expect(s.reads()).toBe(1);
    writeFileSync(`${dbPath}-wal`, "");
    touch(`${dbPath}-wal`, 2);
    await s.read("openai-codex");
    expect(s.reads()).toBe(2);
    writeOmpDb(dbPath, [codexRow({ access: "a2", expires: NOW + HOUR })]);
    touch(dbPath, 3);
    expect(await s.read("openai-codex")).toMatchObject({ access: "a2" });
  });

  test("modify never calls fn and returns the row while more than 5 min are left", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    const fn = jest.fn(async () => undefined);
    expect(await store().modify("openai-codex", fn)).toMatchObject({
      access: "a1",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  test("modify refuses a login inside the refresh window without calling fn", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + 120_000 })]);
    const fn = jest.fn(async () => undefined);
    const result = store().modify("openai-codex", fn);
    await expect(result).rejects.toBeInstanceOf(CredentialExpiredError);
    await expect(result).rejects.toThrow(
      "The Codex login expired at 2026-09-26T19:02:00.000Z. Run omp once so that it refreshes the login. Then send your message again.",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  test("modify re-reads the database, so an omp refresh meanwhile is accepted", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + 120_000 })]);
    const s = store();
    await s.read("openai-codex");
    writeOmpDb(dbPath, [codexRow({ access: "a2", expires: NOW + HOUR })]);
    expect(await s.modify("openai-codex", async () => undefined)).toMatchObject(
      { access: "a2" },
    );
  });

  test("delete refuses and list names only the codex provider", async () => {
    writeOmpDb(dbPath, [codexRow({ access: "a1", expires: NOW + HOUR })]);
    await expect(store().delete("openai-codex")).rejects.toThrow(
      "The harness does not own this login.",
    );
    expect(await store().list()).toEqual([
      { providerId: "openai-codex", type: "oauth" },
    ]);
  });

  test("the expired error text holds no token", async () => {
    writeOmpDb(dbPath, [
      codexRow({ access: "secret-access-value", expires: NOW }),
    ]);
    const error = await store()
      .modify("openai-codex", async () => undefined)
      .catch((caught: unknown) => caught);
    expect(String(error)).not.toContain("secret-access-value");
    expect(String(error)).not.toContain("refresh-never-read");
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `mise test packages/harness/src/credentials/omp-store.test.ts`
Expected: FAIL with `Cannot find module "#harness/credentials/omp-store"`.

- [ ] **Step 4: Implement** `packages/harness/src/credentials/omp-store.ts`

```ts
import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { messageOf } from "@tuicraft/core/lib/errors";

export type OmpRow = {
  access: string;
  expires: number;
  accountId: string | undefined;
};
export type OmpStoreInit = { dbPath: string; now: () => number };

type Modify = (
  current: Credential | undefined,
) => Promise<Credential | undefined>;

const PROVIDER = "openai-codex";
const REFRESH_WINDOW_MS = 300_000;
const BUSY_RETRIES = 3;
const BUSY_WAIT_MS = 50;
const ROW_SQL =
  "select data from auth_credentials where provider = 'openai-codex' and credential_type = 'oauth' and disabled_cause is null order by updated_at desc limit 1";
const MISSING =
  "No Codex login found in omp. Run omp and log in to openai-codex. Then send your message again.";

export class CredentialExpiredError extends Error {
  readonly provider: string;
  readonly expires: number;

  constructor(provider: string, expires: number) {
    super(
      `The Codex login expired at ${new Date(expires).toISOString()}. Run omp once so that it refreshes the login. Then send your message again.`,
    );
    this.name = "CredentialExpiredError";
    this.provider = provider;
    this.expires = expires;
  }
}

export function ompDbPath(home: string): string {
  return `${home}/.omp/agent/agent.db`;
}

export function readOmpRow(dbPath: string): OmpRow | undefined {
  if (!existsSync(dbPath)) return undefined;
  const data = queryWithRetry(dbPath);
  return data === undefined ? undefined : parseRow(data);
}

function queryWithRetry(dbPath: string): string | undefined {
  let attempt = 0;
  while (true) {
    try {
      return queryOnce(dbPath);
    } catch (error) {
      if (!isBusy(error) || attempt >= BUSY_RETRIES) throw error;
      attempt += 1;
      Bun.sleepSync(BUSY_WAIT_MS);
    }
  }
}

function queryOnce(dbPath: string): string | undefined {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.query<{ data: string }, []>(ROW_SQL).get()?.data;
  } finally {
    db.close();
  }
}

function isBusy(error: unknown): boolean {
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  return (
    code === "SQLITE_BUSY" || messageOf(error).includes("database is locked")
  );
}

function parseRow(data: string): OmpRow | undefined {
  const row: unknown = JSON.parse(data);
  if (typeof row !== "object" || row === null) return undefined;
  const { access, expires, accountId } = row as Record<string, unknown>;
  if (typeof access !== "string" || typeof expires !== "number")
    return undefined;
  return {
    access,
    accountId: typeof accountId === "string" ? accountId : undefined,
    expires,
  };
}

function credentialOf(row: OmpRow): Credential {
  return {
    access: row.access,
    accountId: row.accountId,
    expires: row.expires,
    refresh: "",
    type: "oauth",
  };
}

function mtimeOf(path: string): number {
  return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
}

export class OmpCredentialStore implements CredentialStore {
  private readonly dbPath: string;
  private readonly now: () => number;
  private cache: { key: string; row: OmpRow | undefined } | undefined;
  private dbReads = 0;

  constructor(init: OmpStoreInit) {
    this.dbPath = init.dbPath;
    this.now = init.now;
  }

  read(
    providerId: string,
    _options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    const row = providerId === PROVIDER ? this.cached() : undefined;
    return Promise.resolve(row && credentialOf(row));
  }

  list(_options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
    return Promise.resolve(
      this.cached() ? [{ providerId: PROVIDER, type: "oauth" }] : [],
    );
  }

  modify(
    providerId: string,
    _fn: Modify,
    _options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    if (providerId !== PROVIDER) return Promise.resolve(undefined);
    const row = this.fresh();
    if (!row) return Promise.reject(new Error(MISSING));
    if (row.expires - this.now() <= REFRESH_WINDOW_MS)
      return Promise.reject(new CredentialExpiredError(PROVIDER, row.expires));
    return Promise.resolve(credentialOf(row));
  }

  delete(_providerId: string, _options?: AuthOperationOptions): Promise<void> {
    return Promise.reject(new Error("The harness does not own this login."));
  }

  reads(): number {
    return this.dbReads;
  }

  private cached(): OmpRow | undefined {
    const key = `${mtimeOf(this.dbPath)}:${mtimeOf(`${this.dbPath}-wal`)}`;
    if (this.cache?.key !== key) this.cache = { key, row: this.fresh() };
    return this.cache.row;
  }

  private fresh(): OmpRow | undefined {
    this.dbReads += 1;
    return readOmpRow(this.dbPath);
  }
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/harness/src/credentials/omp-store.test.ts`
Expected: PASS, 10 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/credentials/omp-store.ts packages/harness/src/credentials/omp-store.test.ts packages/harness/test-support/omp-db.ts
mise exec -- git commit -m "feat: Read the Codex login from omp read-only" -m "omp owns the Codex login and its refresh token. The harness reads only the access token and expiry, caches on the database and -wal mtimes, and refuses instead of refreshing, so it can never rotate omp's token (R16)."
```

### Task F4b: Startup credential check

**Needs:** F4a

**Files:**
- Create: `packages/harness/src/credentials/status.ts`
- Test: `packages/harness/src/credentials/status.test.ts`

**Interfaces:**
- Consumes: `CredentialStore` (any store; F6b passes `OmpCredentialStore`).
- Produces: `type CredentialStatus`; `type StartupCheck = { ok: true; warn; line } | { ok: false; exitCode: 3; line }`; `MIN_VALID_MS = 600_000`; `WARN_VALID_MS = 1_800_000`; `credentialStatus(store, now): Promise<CredentialStatus>`; `startupCheck(status): StartupCheck`.

- [ ] **Step 1: Write the failing test** `packages/harness/src/credentials/status.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { credentialStatus, startupCheck } from "#harness/credentials/status";

const NOW = Date.parse("2026-09-26T19:00:00Z");

function storeWith(credential: Credential | undefined): CredentialStore {
  return {
    delete: async () => {},
    list: async () => [],
    modify: async () => credential,
    read: async () => credential,
  };
}

const oauth = (expires: number): Credential => ({
  access: "token-never-printed",
  expires,
  refresh: "",
  type: "oauth",
});

describe("credentialStatus", () => {
  test("reports expiry and remaining time of the codex login", async () => {
    expect(
      await credentialStatus(storeWith(oauth(NOW + 3_600_000)), NOW),
    ).toEqual({
      expiresAt: NOW + 3_600_000,
      present: true,
      validForMs: 3_600_000,
    });
  });

  test("reports a missing login", async () => {
    expect(await credentialStatus(storeWith(undefined), NOW)).toEqual({
      expiresAt: undefined,
      present: false,
      validForMs: undefined,
    });
  });
});

describe("startupCheck", () => {
  test("accepts a valid login without a warning", () => {
    const check = startupCheck({
      expiresAt: Date.parse("2026-09-30T20:20:18Z"),
      present: true,
      validForMs: 3_600_000,
    });
    expect(check).toEqual({
      line: "Codex login: valid until 2026-09-30 20:20 UTC (omp).",
      ok: true,
      warn: false,
    });
  });

  test("warns under 30 minutes", () => {
    expect(
      startupCheck({
        expiresAt: NOW + 1_200_000,
        present: true,
        validForMs: 1_200_000,
      }),
    ).toMatchObject({ ok: true, warn: true });
  });

  test("refuses under 10 minutes with exit code 3", () => {
    expect(
      startupCheck({
        expiresAt: NOW + 540_000,
        present: true,
        validForMs: 540_000,
      }),
    ).toEqual({
      exitCode: 3,
      line: "The Codex login expires in 9 min. Run omp once so that it refreshes the login. Then start the harness again.",
      ok: false,
    });
  });

  test("refuses a missing login with exit code 3", () => {
    expect(
      startupCheck({
        expiresAt: undefined,
        present: false,
        validForMs: undefined,
      }),
    ).toEqual({
      exitCode: 3,
      line: "No Codex login found in omp. Run omp and log in to openai-codex. Then start the harness again.",
      ok: false,
    });
  });

  test("never prints the token", async () => {
    const check = startupCheck(
      await credentialStatus(storeWith(oauth(NOW + 3_600_000)), NOW),
    );
    expect(check.line).not.toContain("token-never-printed");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/credentials/status.test.ts`
Expected: FAIL with `Cannot find module "#harness/credentials/status"`.

- [ ] **Step 3: Implement** `packages/harness/src/credentials/status.ts`

```ts
import type { CredentialStore } from "@earendil-works/pi-ai";

export type CredentialStatus = {
  present: boolean;
  expiresAt: number | undefined;
  validForMs: number | undefined;
};
export type StartupCheck =
  | { ok: true; warn: boolean; line: string }
  | { ok: false; exitCode: 3; line: string };

export const MIN_VALID_MS = 600_000;
export const WARN_VALID_MS = 1_800_000;

const MISSING =
  "No Codex login found in omp. Run omp and log in to openai-codex. Then start the harness again.";

export async function credentialStatus(
  store: CredentialStore,
  now: number,
): Promise<CredentialStatus> {
  const credential = await store.read("openai-codex");
  if (credential?.type !== "oauth")
    return { expiresAt: undefined, present: false, validForMs: undefined };
  return {
    expiresAt: credential.expires,
    present: true,
    validForMs: credential.expires - now,
  };
}

export function startupCheck(status: CredentialStatus): StartupCheck {
  const { expiresAt, validForMs } = status;
  if (expiresAt === undefined || validForMs === undefined)
    return { exitCode: 3, line: MISSING, ok: false };
  if (validForMs < MIN_VALID_MS)
    return { exitCode: 3, line: expiringLine(validForMs), ok: false };
  return {
    line: `Codex login: valid until ${utcMinute(expiresAt)} UTC (omp).`,
    ok: true,
    warn: validForMs < WARN_VALID_MS,
  };
}

function expiringLine(validForMs: number): string {
  const minutes = Math.max(0, Math.floor(validForMs / 60_000));
  return `The Codex login expires in ${minutes} min. Run omp once so that it refreshes the login. Then start the harness again.`;
}

function utcMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/credentials/status.test.ts`
Expected: PASS, 7 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/credentials/status.ts packages/harness/src/credentials/status.test.ts
mise exec -- git commit -m "feat: Check the Codex login at harness start" -m "Pi refreshes a login under 5 minutes, and our store refuses that, so the harness refuses to start under 10 minutes and warns under 30. The lines name the expiry and never the token."
```

### Task F5aa: World mutex and yield gate

**Needs:** F2

**Files:**
- Create: `packages/harness/src/runtime/mutex.ts`, `packages/harness/src/runtime/yield.ts`
- Test: `packages/harness/src/runtime/mutex.test.ts`, `packages/harness/src/runtime/yield.test.ts`

**Interfaces:**
- Consumes: `WorldMutex`, `YieldGate` (`contract/services.ts`); `ignoreFailure`.
- Produces: `createWorldMutex(): WorldMutex`; `YIELD_DELAY_MS = 50`; `createYieldGate(): YieldGate` (`trigger()` resolves every pending `wait()` after `setTimeout(…, 50)`; a `wait()` after a trigger waits for the next trigger).

- [ ] **Step 1: Write the failing tests** `packages/harness/src/runtime/mutex.test.ts` and `packages/harness/src/runtime/yield.test.ts`

```ts
import { expect, test } from "bun:test";
import { createWorldMutex } from "#harness/runtime/mutex";

test("runs sends one at a time in call order", async () => {
  const mutex = createWorldMutex();
  const order: string[] = [];
  const gate = Promise.withResolvers<void>();
  const first = mutex.run(async () => {
    order.push("first:start");
    await gate.promise;
    order.push("first:end");
  });
  const second = mutex.run(() => order.push("second"));
  await Bun.sleep(1);
  expect(order).toEqual(["first:start"]);
  gate.resolve();
  await Promise.all([first, second]);
  expect(order).toEqual(["first:start", "first:end", "second"]);
});

test("a failed send rejects its caller and does not block the next one", async () => {
  const mutex = createWorldMutex();
  const failed = mutex.run(() => {
    throw new Error("socket closed");
  });
  await expect(failed).rejects.toThrow("socket closed");
  expect(await mutex.run(() => 7)).toBe(7);
});
```

```ts
import { expect, jest, test } from "bun:test";
import { createYieldGate, YIELD_DELAY_MS } from "#harness/runtime/yield";

test("trigger resolves every pending wait after the yield delay", async () => {
  jest.useFakeTimers();
  try {
    const gate = createYieldGate();
    const seen: string[] = [];
    gate.wait().then((why) => seen.push(`a:${why}`));
    gate.wait().then((why) => seen.push(`b:${why}`));
    gate.trigger();
    jest.advanceTimersByTime(YIELD_DELAY_MS - 1);
    await Promise.resolve();
    expect(seen).toEqual([]);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(["a:human", "b:human"]);
  } finally {
    jest.useRealTimers();
  }
});

test("a wait that starts after a trigger waits for the next trigger", async () => {
  jest.useFakeTimers();
  try {
    const gate = createYieldGate();
    gate.trigger();
    let resolved = false;
    gate.wait().then(() => {
      resolved = true;
    });
    jest.advanceTimersByTime(YIELD_DELAY_MS * 2);
    await Promise.resolve();
    expect(resolved).toBe(false);
    gate.trigger();
    jest.advanceTimersByTime(YIELD_DELAY_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `mise test packages/harness/src/runtime/mutex.test.ts packages/harness/src/runtime/yield.test.ts`
Expected: FAIL with `Cannot find module "#harness/runtime/mutex"` and `"#harness/runtime/yield"`.

- [ ] **Step 3: Implement** `packages/harness/src/runtime/mutex.ts`

```ts
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { WorldMutex } from "#harness/contract/services";

export function createWorldMutex(): WorldMutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(send: () => T): Promise<T> {
      const result = tail.then(send);
      tail = result.catch(ignoreFailure);
      return result;
    },
  };
}
```

- [ ] **Step 3: Implement** `packages/harness/src/runtime/yield.ts`

```ts
import type { YieldGate } from "#harness/contract/services";

export const YIELD_DELAY_MS = 50;

export function createYieldGate(): YieldGate {
  let waiters: ((why: "human") => void)[] = [];
  return {
    trigger() {
      const due = waiters;
      waiters = [];
      setTimeout(() => {
        for (const resolve of due) resolve("human");
      }, YIELD_DELAY_MS);
    },
    wait() {
      const { promise, resolve } = Promise.withResolvers<"human">();
      waiters.push(resolve);
      return promise;
    },
  };
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/runtime/mutex.test.ts packages/harness/src/runtime/yield.test.ts`
Expected: PASS, 4 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runtime/mutex.ts packages/harness/src/runtime/yield.ts packages/harness/src/runtime/mutex.test.ts packages/harness/src/runtime/yield.test.ts
mise exec -- git commit -m "feat: Add the harness world mutex and yield gate" -m "Actions share one socket, so their synchronous sends go through one queue (design H.9). The yield gate lets a blocking run tool return after Pi has queued a human steer (design C.4 step 2)."
```

### Task F5b: Connection with login, backoff and lost wake

**Needs:** F2 (Contract issue 4: not F5a)

**Files:**
- Create: `packages/harness/src/runtime/connection.ts`
- Test: `packages/harness/src/runtime/connection.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ConnectionState` (`contract/config.ts`); `LogDraft`; `Clock`, `GameLog`, `HandleObserver`, `HarnessRuntime`, `Login` (`contract/services.ts`); `RunRegistry`; `Refusal`; `authWithRetry`, `worldSession` (`@tuicraft/core/session`); `ClientConfig`, `Unsubscribe`, `WorldHandle` (`@tuicraft/core`); `createMockHandle` (tests).
- Produces: `type ConnectionInit`; `type Connection = Pick<HarnessRuntime, "handle" | "requireHandle" | "connection" | "onConnection" | "connect" | "disconnect">`; `BACKOFF_MS = [5000, 15_000, 45_000]`; `createConnection(init): Connection`; `defaultLogin(config: ClientConfig): Promise<WorldHandle>` (= `authWithRetry(config, { maxAttempts: 2 })` then `worldSession`). Log rows: `session/connected` (class `log`), `session/lost` (class `log` at the loss and per failed retry; one class `wake` row `Connection lost. The human must run /connect.` after the last retry).

- [ ] **Step 1: Write the failing test** `packages/harness/src/runtime/connection.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { Profile } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type { GameLog, HandleObserver } from "#harness/contract/services";
import { BACKOFF_MS, createConnection } from "#harness/runtime/connection";

const profile: Profile = {
  account: "FACABC0123456",
  character: "Fgklibhlflc",
  client: {
    account: "FACABC0123456",
    character: "Fgklibhlflc",
    host: "t1",
    password: "PW",
    port: 3724,
  },
  path: "/p.json",
  source: "soap_session",
};

function setup(login: (n: number) => Promise<WorldHandle>) {
  const drafts: LogDraft[] = [];
  const attached: string[] = [];
  const log = {
    append: (draft: LogDraft) => drafts.push(draft),
  } as unknown as GameLog;
  const runs = { cancelAll: jest.fn(() => []) } as unknown as RunRegistry;
  const observer = (name: string): HandleObserver => ({
    attach: () => {
      attached.push(`attach:${name}`);
      return () => attached.push(`detach:${name}`);
    },
  });
  let calls = 0;
  const connection = createConnection({
    clock: { now: () => 0 },
    log,
    login: () => login(++calls),
    observers: [observer("ready"), observer("router")],
    profile,
    runs,
  });
  return { attached, calls: () => calls, connection, drafts, runs };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("createConnection", () => {
  test("connect logs in with the profile, attaches observers in order and goes online", async () => {
    const handle = createMockHandle();
    const { attached, connection, drafts } = setup(async () => handle);
    const states: string[] = [];
    connection.onConnection((state) => states.push(state));
    await connection.connect();
    expect(connection.handle()).toBe(handle);
    expect(connection.requireHandle()).toBe(handle);
    expect(attached).toEqual(["attach:ready", "attach:router"]);
    expect(states).toEqual(["connecting", "online"]);
    expect(drafts.map((d) => d.event)).toEqual(["session/connected"]);
  });

  test("requireHandle refuses offline with the /connect hint", () => {
    const { connection } = setup(async () => createMockHandle());
    expect(() => connection.requireHandle()).toThrow(
      "offline: the game connection is down.",
    );
  });

  test("a failed first login leaves the connection offline and rejects", async () => {
    const { connection } = setup(async () => {
      throw new Error("auth failed");
    });
    await expect(connection.connect()).rejects.toThrow("auth failed");
    expect(connection.connection()).toBe("offline");
  });

  test("disconnect logs out, detaches observers and goes offline", async () => {
    const handle = createMockHandle();
    const { attached, connection } = setup(async () => handle);
    await connection.connect();
    await connection.disconnect();
    expect(handle.logout).toHaveBeenCalled();
    expect(connection.connection()).toBe("offline");
    expect(connection.handle()).toBeUndefined();
    expect(attached).toContain("detach:router");
  });

  test("a lost socket cancels runs as lost and reconnects after 5 s", async () => {
    jest.useFakeTimers();
    try {
      const first = createMockHandle();
      const second = createMockHandle();
      const { calls, connection, drafts, runs } = setup(async (n) =>
        n === 1 ? first : second,
      );
      await connection.connect();
      first.resolveClosed();
      await flush();
      expect(runs.cancelAll).toHaveBeenCalledWith("lost");
      expect(connection.connection()).toBe("backoff");
      expect(drafts.at(-1)).toMatchObject({
        class: "log",
        event: "session/lost",
      });
      jest.advanceTimersByTime(BACKOFF_MS[0] ?? 0);
      await flush();
      expect(calls()).toBe(2);
      expect(connection.handle()).toBe(second);
      expect(connection.connection()).toBe("online");
    } finally {
      jest.useRealTimers();
    }
  });

  test("after 5 s, 15 s and 45 s of failed retries it wakes the agent once and stays offline", async () => {
    jest.useFakeTimers();
    try {
      const first = createMockHandle();
      const { connection, drafts } = setup(async (n) => {
        if (n === 1) return first;
        throw new Error("realm down");
      });
      await connection.connect();
      first.resolveClosed();
      await flush();
      for (const delay of BACKOFF_MS) {
        jest.advanceTimersByTime(delay);
        await flush();
      }
      expect(connection.connection()).toBe("offline");
      const wakes = drafts.filter((d) => d.class === "wake");
      expect(wakes).toEqual([
        expect.objectContaining({
          event: "session/lost",
          text: "Connection lost. The human must run /connect.",
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runtime/connection.test.ts`
Expected: FAIL with `Cannot find module "#harness/runtime/connection"`.

- [ ] **Step 3: Implement** `packages/harness/src/runtime/connection.ts`

```ts
import type { ClientConfig, Unsubscribe, WorldHandle } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import { authWithRetry, worldSession } from "@tuicraft/core/session";
import type { ConnectionState, Profile } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type {
  Clock,
  GameLog,
  HandleObserver,
  HarnessRuntime,
  Login,
} from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";

export type ConnectionInit = {
  profile: Profile;
  login: Login;
  observers: HandleObserver[];
  log: GameLog;
  runs: RunRegistry;
  clock: Clock;
  backoffMs?: readonly number[];
};
export type Connection = Pick<
  HarnessRuntime,
  | "handle"
  | "requireHandle"
  | "connection"
  | "onConnection"
  | "connect"
  | "disconnect"
>;

export const BACKOFF_MS: readonly number[] = [5000, 15_000, 45_000];

const CLOSE_WAIT_MS = 5000;
const LOST_TEXT = "Connection lost. The human must run /connect.";

export function defaultLogin(config: ClientConfig): Promise<WorldHandle> {
  return authWithRetry(config, { maxAttempts: 2 }).then((auth) =>
    worldSession(config, auth),
  );
}

export function createConnection(init: ConnectionInit): Connection {
  const slot = new ConnectionSlot(init);
  return {
    connect: () => slot.connect(),
    connection: () => slot.state,
    disconnect: () => slot.disconnect(),
    handle: () => slot.current,
    onConnection: (cb) => slot.subscribe(cb),
    requireHandle: () => slot.require(),
  };
}

class ConnectionSlot {
  state: ConnectionState = "offline";
  current: WorldHandle | undefined;
  private readonly init: ConnectionInit;
  private readonly backoff: readonly number[];
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private detach: Unsubscribe[] = [];
  private retry: ReturnType<typeof setTimeout> | undefined;

  constructor(init: ConnectionInit) {
    this.init = init;
    this.backoff = init.backoffMs ?? BACKOFF_MS;
  }

  async connect(): Promise<void> {
    if (this.state === "online" || this.state === "connecting") return;
    this.clearRetry();
    this.set("connecting");
    const handle = await this.init
      .login(this.init.profile.client)
      .catch((error: unknown) => {
        this.set("offline");
        throw error;
      });
    this.attach(handle, 1);
  }

  async disconnect(): Promise<void> {
    this.clearRetry();
    const handle = this.current;
    if (!handle) {
      this.set("offline");
      return;
    }
    this.set("closing");
    handle.logout();
    if (!(await closedWithin(handle, CLOSE_WAIT_MS))) handle.close();
    await handle.closed;
    this.set("offline");
  }

  subscribe(cb: (state: ConnectionState) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  require(): WorldHandle {
    if (this.current) return this.current;
    throw new Refusal({
      detail: "the game connection is down.",
      next: "ask the human to run /connect.",
      reason: "offline",
    });
  }

  private set(next: ConnectionState): void {
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }

  private append(draft: Omit<LogDraft, "domain">): void {
    this.init.log.append({ ...draft, domain: "session" });
  }

  private clearRetry(): void {
    clearTimeout(this.retry);
    this.retry = undefined;
  }

  private attach(handle: WorldHandle, attempt: number): void {
    this.current = handle;
    this.detach = this.init.observers.map((observer) =>
      observer.attach(handle),
    );
    handle.closed.then(() => this.closed(handle));
    this.append({
      class: "log",
      data: { attempt },
      event: "session/connected",
      text: `Connected as ${this.init.profile.character}.`,
    });
    this.set("online");
  }

  private closed(handle: WorldHandle): void {
    if (handle !== this.current) return;
    for (const off of this.detach) off();
    this.detach = [];
    this.current = undefined;
    if (this.state === "closing") {
      this.set("offline");
      return;
    }
    this.init.runs.cancelAll("lost");
    this.append({
      class: "log",
      data: { attempt: 1, inMs: this.backoff[0] },
      event: "session/lost",
      text: "The game connection closed. The harness tries to connect again.",
    });
    this.schedule(0);
  }

  private schedule(index: number): void {
    const delay = this.backoff[index];
    if (delay === undefined) {
      this.set("offline");
      this.append({
        class: "wake",
        data: { attempts: this.backoff.length },
        event: "session/lost",
        text: LOST_TEXT,
      });
      return;
    }
    this.set("backoff");
    this.retry = setTimeout(() => this.reconnect(index), delay);
  }

  private reconnect(index: number): void {
    this.retry = undefined;
    this.set("connecting");
    this.init.login(this.init.profile.client).then(
      (handle) => this.attach(handle, index + 1),
      (error: unknown) => this.failed(index, error),
    );
  }

  private failed(index: number, error: unknown): void {
    this.append({
      class: "log",
      data: { attempt: index + 1, error: messageOf(error) },
      event: "session/lost",
      text: `Reconnect attempt ${index + 1} failed.`,
    });
    this.schedule(index + 1);
  }
}

async function closedWithin(handle: WorldHandle, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const done = await Promise.race([
    handle.closed.then(() => true as const),
    timeout,
  ]);
  clearTimeout(timer);
  return done;
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/runtime/connection.test.ts`
Expected: PASS, 6 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runtime/connection.ts packages/harness/src/runtime/connection.test.ts
mise exec -- git commit -m "feat: Connect and reconnect the harness" -m "The handle lives in the process runtime, not in the Pi closure, so /new and /reload keep it (design H.3). A lost socket interrupts the active run, retries at 5, 15 and 45 s, then wakes the agent once."
```

### Task F5ab: Process-lifetime HarnessRuntime and the test runtime

**Needs:** F5aa, F5b

**Files:**
- Create: `packages/harness/src/runtime/harness-runtime.ts`
- Create: `packages/harness/test-support/runtime-fixture.ts`
- Test: `packages/harness/src/runtime/harness-runtime.test.ts`

**Interfaces:**
- Consumes: `createConnection`, `Connection` (F5b); `createWorldMutex`, `createYieldGate` (F5aa); `Refusal`; every service type in `contract/services.ts`; `createMockHandle` (`@tuicraft/core/test-support/mock-handle`, C0 stubs included).
- Produces: `createHarnessRuntime(parts: RuntimeParts): HarnessRuntime` (connect attaches `ready, router, sightings, attacks, progress, snapshots` in that order; `stopAll(cause)` = `runs.cancelAll(cause)` then `halt()`, `stopCycle()`, `stopAttack()`; `shutdown()` = `stopAll("quit")`, disconnect (logout, 5 s wait, close), `log.flush()`, `jevLog.close()`, `stats.stop()`). Test support: `createTestRuntime(init?): Promise<TestRuntime>`, `testProfile()`, `testPaths(dir)`, types `MockHandle`, `TestClock`, `TestRuntimeInit`, `TestRuntime`. The fixture's run registry double maps causes to codes `human_stop`, `esc`, `quit`, `connection_lost`, `stopped_by_tool`; `lost` gives `interrupted`, the others `cancelled`; a second start throws `Refusal` `busy`. With this task F5a (contract) is complete.

- [ ] **Step 1: Write the failing test** `packages/harness/src/runtime/harness-runtime.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { RunEnd } from "#harness/contract/runs";
import type { HandleObserver } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { createTestRuntime } from "#test-support/runtime-fixture";

function observer(name: string, seen: string[]): HandleObserver {
  return {
    attach: () => {
      seen.push(name);
      return () => {};
    },
  };
}

function blockingRun(signal: AbortSignal): Promise<RunEnd<undefined>> {
  const { promise, resolve } = Promise.withResolvers<RunEnd<undefined>>();
  signal.addEventListener("abort", () =>
    resolve({
      reason: String((signal.reason as Error).message),
      status: "cancelled",
      summary: "stopped",
      value: undefined,
    }),
  );
  return promise;
}

describe("createHarnessRuntime", () => {
  test("starts with idle session flags and wake from the flags", async () => {
    const { rt } = await createTestRuntime({ flags: { wake: false } });
    expect(rt.session).toEqual({
      agent: "idle",
      humanWaiting: false,
      lastNow: undefined,
      lastToolCallAt: undefined,
      tool: undefined,
      turnStartSeq: 0,
      turnToolCalls: 0,
      unreadWhispers: 0,
      wake: false,
    });
  });

  test("connect attaches ready, router, sightings, attacks, progress, snapshots in that order", async () => {
    const seen: string[] = [];
    const names = [
      "ready",
      "router",
      "sightings",
      "attacks",
      "progress",
      "snapshots",
    ] as const;
    const { rt } = await createTestRuntime({ connect: false });
    const parts = Object.fromEntries(
      names.map((name) => [name, { ...rt[name], ...observer(name, seen) }]),
    );
    const { rt: wired } = await createTestRuntime({ parts });
    expect(wired.connection()).toBe("online");
    expect(seen).toEqual([...names]);
  });

  test("requireHandle refuses offline before connect", async () => {
    const { rt } = await createTestRuntime({ connect: false });
    expect(() => rt.requireHandle()).toThrow(Refusal);
    expect(rt.handle()).toBeUndefined();
  });

  test("stopAll cancels runs, halts the character and returns the cancelled records", async () => {
    const { rt, handle } = await createTestRuntime();
    const run = rt.runs.start({
      args: {},
      kind: "engage",
      launch: ({ signal }) => blockingRun(signal),
      toolCallId: "t1",
    });
    const stopped = rt.stopAll("human");
    expect(
      stopped.map((record) => [record.id, record.status, record.reason]),
    ).toEqual([["r1", "cancelled", "human_stop"]]);
    expect(handle.halt).toHaveBeenCalled();
    expect(handle.stopCycle).toHaveBeenCalled();
    expect(handle.stopAttack).toHaveBeenCalled();
    expect((await run.done).reason).toBe("human_stop");
  });

  test("a lost connection interrupts the active run", async () => {
    const { rt, handle } = await createTestRuntime();
    rt.runs.start({
      args: {},
      kind: "travel",
      launch: ({ signal }) => blockingRun(signal),
      toolCallId: "t1",
    });
    handle.resolveClosed();
    await Bun.sleep(0);
    expect(rt.runs.get("r1")).toMatchObject({
      reason: "connection_lost",
      status: "interrupted",
    });
  });

  test("shutdown stops runs, logs out and goes offline", async () => {
    const { rt, handle } = await createTestRuntime();
    await rt.shutdown();
    expect(handle.halt).toHaveBeenCalled();
    expect(handle.logout).toHaveBeenCalled();
    expect(rt.connection()).toBe("offline");
  });

  test("a second run refuses busy with the stop call", async () => {
    const { rt } = await createTestRuntime();
    rt.runs.start({
      args: {},
      kind: "engage",
      launch: ({ signal }) => blockingRun(signal),
      toolCallId: "t1",
    });
    expect(() =>
      rt.runs.start({
        args: {},
        kind: "travel",
        launch: ({ signal }) => blockingRun(signal),
        toolCallId: "t2",
      }),
    ).toThrow("busy: r1 (engage) is still running.");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runtime/harness-runtime.test.ts`
Expected: FAIL with `Cannot find module "#test-support/runtime-fixture"` (Step 3 writes `harness-runtime.ts`, Step 4 the fixture; both land before Step 5).

- [ ] **Step 3: Implement** `packages/harness/src/runtime/harness-runtime.ts`

```ts
import type { WorldHandle } from "@tuicraft/core";
import type { RunRecord, RunRegistry, StopCause } from "#harness/contract/runs";
import type {
  HarnessRuntime,
  RuntimeParts,
  SessionFlags,
} from "#harness/contract/services";
import { type Connection, createConnection } from "#harness/runtime/connection";

export function createHarnessRuntime(parts: RuntimeParts): HarnessRuntime {
  const { login, ...rest } = parts;
  const observers = [
    parts.ready,
    parts.router,
    parts.sightings,
    parts.attacks,
    parts.progress,
    parts.snapshots,
  ];
  const link = createConnection({
    clock: parts.clock,
    log: parts.log,
    login,
    observers,
    profile: parts.profile,
    runs: parts.runs,
  });
  const stopAll = (cause: StopCause) =>
    stopEverything(parts.runs, link.handle(), cause);
  const shutdown = () => shutdownAll({ link, parts, stopAll });
  return {
    ...rest,
    ...link,
    session: initialSession(parts.flags.wake),
    shutdown,
    stopAll,
  };
}

function initialSession(wake: boolean): SessionFlags {
  return {
    agent: "idle",
    humanWaiting: false,
    lastNow: undefined,
    lastToolCallAt: undefined,
    tool: undefined,
    turnStartSeq: 0,
    turnToolCalls: 0,
    unreadWhispers: 0,
    wake,
  };
}

function stopEverything(
  runs: RunRegistry,
  handle: WorldHandle | undefined,
  cause: StopCause,
): RunRecord[] {
  const stopped = runs.cancelAll(cause);
  handle?.halt();
  handle?.stopCycle();
  handle?.stopAttack();
  return stopped;
}

type Shutdown = {
  parts: RuntimeParts;
  link: Connection;
  stopAll: (cause: StopCause) => RunRecord[];
};

async function shutdownAll({ parts, link, stopAll }: Shutdown): Promise<void> {
  stopAll("quit");
  await link.disconnect();
  await parts.log.flush();
  await parts.jevLog.close();
  await parts.stats.stop();
}
```

- [ ] **Step 4: Implement the test runtime** `packages/harness/test-support/runtime-fixture.ts`

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { HarnessFlags, Profile, RunPaths } from "#harness/contract/config";
import type { GameLogEntry } from "#harness/contract/log";
import type {
  RunEvent,
  RunHandle,
  RunRecord,
  RunRegistry,
  RunStart,
  StopCause,
} from "#harness/contract/runs";
import type {
  AttackLedger,
  Clock,
  EventRouter,
  GameLog,
  HarnessRuntime,
  JsonlSink,
  ProgressTracker,
  ReadyGate,
  RefTable,
  RepeatGuard,
  RuntimeParts,
  Sightings,
  ToolStats,
  WorldSnapshots,
} from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { createHarnessRuntime } from "#harness/runtime/harness-runtime";
import { createWorldMutex } from "#harness/runtime/mutex";
import { createYieldGate } from "#harness/runtime/yield";

export type MockHandle = ReturnType<typeof createMockHandle>;
export type TestClock = Clock & {
  set: (ms: number) => void;
  advance: (ms: number) => void;
};
export type TestRuntimeInit = {
  parts?: Partial<RuntimeParts>;
  ready?: boolean;
  flags?: Partial<HarnessFlags>;
  connect?: boolean;
};
export type TestRuntime = {
  rt: HarnessRuntime;
  handle: MockHandle;
  clock: TestClock;
};

const CANCEL_CODES: Record<StopCause, string> = {
  esc: "esc",
  human: "human_stop",
  lost: "connection_lost",
  quit: "quit",
  tool: "stopped_by_tool",
};
const FLAGS: HarnessFlags = {
  check: false,
  connect: true,
  glyphs: "ascii",
  logEntities: false,
  model: "faux/faux-1",
  nowPerCall: false,
  profile: "/test/profile.json",
  runDir: undefined,
  stopReflex: true,
  thinking: "high",
  wake: true,
};

export function testProfile(): Profile {
  const client = {
    account: "TESTACC",
    character: "Testchar",
    host: "t1",
    password: "TESTPASSWORD",
    port: 3724,
  };
  return {
    account: "TESTACC",
    character: "Testchar",
    client,
    path: "/test/profile.json",
    source: "soap_session",
  };
}

export function testPaths(dir: string): RunPaths {
  const at = (name: string) => join(dir, name);
  return {
    dir,
    gamelog: at("gamelog.jsonl"),
    jev: at("jev.jsonl"),
    meta: at("meta.json"),
    piSessions: at("pi-sessions"),
    runs: at("runs.jsonl"),
    session: at("session.jsonl"),
    snapshots: at("snapshots"),
    status: at("status.json"),
    tools: at("tools.json"),
    workspace: at("workspace"),
  };
}

export async function createTestRuntime(
  init: TestRuntimeInit = {},
): Promise<TestRuntime> {
  const handle = createMockHandle();
  const clock = testClock();
  const parts = {
    ...defaultParts({
      clock,
      flags: { ...FLAGS, ...init.flags },
      forceReady: init.ready !== false,
    }),
    login: async () => handle,
    ...init.parts,
  };
  const rt = createHarnessRuntime(parts);
  if (init.connect !== false) await rt.connect();
  return { clock, handle, rt };
}

function testClock(): TestClock {
  let now = Date.parse("2026-09-26T19:00:00Z");
  return {
    advance: (ms) => (now += ms),
    now: () => now,
    set: (ms) => (now = ms),
  };
}

type PartsInit = { clock: Clock; flags: HarnessFlags; forceReady: boolean };

function defaultParts({
  clock,
  flags,
  forceReady,
}: PartsInit): Omit<RuntimeParts, "login"> {
  const log = memoryLog(clock);
  const detached = { attach: () => () => {} };
  return {
    attacks: {
      ...detached,
      lastAttacker: () => undefined,
      lastHitAt: () => undefined,
    } satisfies AttackLedger,
    clock,
    flags,
    jevLog: memorySink(),
    log,
    mutex: createWorldMutex(),
    paths: testPaths(mkdtempSync(join(tmpdir(), "harness-run-"))),
    profile: testProfile(),
    progress: {
      ...detached,
      afterAction: () => {},
      count: () => 0,
      digest: () => "",
      lastProgress: () => undefined,
      noProgress: () => undefined,
    } satisfies ProgressTracker,
    ready: readyDouble(forceReady),
    refs: memoryRefs(),
    repeats: {
      check: () => undefined,
      hits: () => 0,
      record: () => {},
    } satisfies RepeatGuard,
    router: { ...detached, setSink: () => {} } satisfies EventRouter,
    runs: memoryRuns(clock),
    sightings: {
      ...detached,
      all: () => [],
      get: () => undefined,
      note: () => {},
      prune: () => {},
    } satisfies Sightings,
    snapshots: {
      ...detached,
      capture: () => {},
      write: async (label) => label,
    } satisfies WorldSnapshots,
    stats: statsDouble(),
    travel: {
      lastGoodPose: undefined,
      lastRefusedGoal: undefined,
      visitedCells: new Set(),
    },
    yields: createYieldGate(),
  };
}

function memoryLog(clock: Clock): GameLog {
  const rows: GameLogEntry[] = [];
  const listeners = new Set<(entry: GameLogEntry) => void>();
  return {
    append(draft) {
      const entry: GameLogEntry = {
        ...draft,
        char: "Testchar",
        seq: rows.length + 1,
        ts: draft.ts ?? clock.now(),
        v: 1,
      };
      rows.push(entry);
      for (const cb of listeners) cb(entry);
      return entry;
    },
    close: async () => {},
    count: () => rows.length,
    flush: async () => {},
    get: (seq) => rows[seq - 1],
    lastSeq: () => rows.length,
    mark(seq, patch) {
      const row = rows[seq - 1];
      if (row) Object.assign(row, patch);
    },
    recent: (n) => rows.slice(-n),
    since: (seq) => rows.filter((row) => row.seq > seq),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

function memorySink(): JsonlSink & { rows: unknown[] } {
  const rows: unknown[] = [];
  return {
    close: async () => {},
    flush: async () => {},
    rows,
    write: (row) => rows.push(row),
  };
}

function memoryRefs(): RefTable {
  const byGuid = new Map<bigint, string>();
  const byRef = new Map<string, bigint>();
  return {
    guidOf: (ref) => byRef.get(ref),
    refOf(guid) {
      const known = byGuid.get(guid);
      if (known) return known;
      const ref = `u${byGuid.size + 1}`;
      byGuid.set(guid, ref);
      byRef.set(ref, guid);
      return ref;
    },
    size: () => byGuid.size,
  };
}

function readyDouble(forced: boolean): ReadyGate {
  return {
    attach: () => () => {},
    inWorld: () => undefined,
    isReady: () => forced,
    onReady: () => () => {},
    whenReady: async () => forced,
  };
}

function statsDouble(): ToolStats {
  const snapshot = () => ({ tools: {}, updatedAt: 0, v: 1 as const });
  return {
    call: () => {},
    error: () => {},
    repeatHit: () => {},
    result: () => {},
    snapshot,
    start: () => {},
    stop: async () => {},
    validationError: () => {},
  };
}

function memoryRuns(clock: Clock): RunRegistry {
  const records = new Map<string, RunRecord>();
  const controllers = new Map<string, AbortController>();
  const listeners = new Set<(event: RunEvent) => void>();
  const emit = (type: RunEvent["type"], record: RunRecord) => {
    for (const cb of listeners) cb({ record, type });
  };
  const active = () =>
    [...records.values()].find((record) => record.status === "running");
  const cancel = (id: string, cause: StopCause) => {
    const record = records.get(id);
    if (record?.status !== "running") return;
    Object.assign(record, {
      reason: CANCEL_CODES[cause],
      status: cause === "lost" ? "interrupted" : "cancelled",
    });
    controllers.get(id)?.abort(new Error(CANCEL_CODES[cause]));
    return record;
  };
  return {
    active,
    cancel,
    cancelAll: (cause) =>
      [...records.keys()].flatMap((id) => cancel(id, cause) ?? []),
    get: (id) => records.get(id),
    list: () => [...records.values()],
    release(id) {
      const record = records.get(id);
      if (record) record.awaited = false;
    },
    start: <R>(init: RunStart<R>) =>
      startRun({ active: active(), clock, controllers, emit, init, records }),
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

type StartRun<R> = {
  init: RunStart<R>;
  active: RunRecord | undefined;
  clock: Clock;
  records: Map<string, RunRecord>;
  controllers: Map<string, AbortController>;
  emit: (type: RunEvent["type"], record: RunRecord) => void;
};

function startRun<R>({
  init,
  active,
  clock,
  records,
  controllers,
  emit,
}: StartRun<R>): RunHandle<R> {
  if (active)
    throw new Refusal({
      detail: `${active.id} (${active.kind}) is still running.`,
      next: `stop(run: "${active.id}")`,
      reason: "busy",
    });
  const id = `r${records.size + 1}`;
  const controller = new AbortController();
  const record: RunRecord = {
    args: init.args,
    awaited: true,
    endedAt: undefined,
    id,
    kind: init.kind,
    progress: undefined,
    reason: undefined,
    startedAt: clock.now(),
    status: "running",
    summary: undefined,
    toolCallId: init.toolCallId,
  };
  records.set(id, record);
  controllers.set(id, controller);
  emit("started", record);
  const progress = (text: string) => {
    record.progress = text;
    emit("progress", record);
  };
  const done = init
    .launch({ progress, signal: controller.signal })
    .then((end) => {
      Object.assign(record, {
        endedAt: clock.now(),
        reason: record.reason ?? end.reason,
        status: record.status === "running" ? end.status : record.status,
        summary: end.summary,
      });
      emit("ended", record);
      return end;
    });
  return { done, id, signal: controller.signal };
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/harness/src/runtime/harness-runtime.test.ts`
Expected: PASS, 7 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/runtime/harness-runtime.ts packages/harness/src/runtime/harness-runtime.test.ts packages/harness/test-support/runtime-fixture.ts
mise exec -- git commit -m "feat: Add the process-lifetime harness runtime" -m "Pi reruns the extension factory on /new, /reload, /resume and /fork, so the handle, the log and the runs live in one runtime outside that closure (design H.3). The fixture gives every later task a connected runtime over the mock handle."
```

### Task F5c: World-ready gate

**Needs:** F5ab, A2, C0

**Files:**
- Create: `packages/harness/src/runtime/ready.ts`
- Test: `packages/harness/src/runtime/ready.test.ts`

**Interfaces:**
- Consumes: `guidHex(guid: bigint): string` (A2, `ops/refs.ts`); `CLASS_NAMES`, `ObjectType`, `Capabilities`, `UnitEntity`, `Entity`, `WorldHandle` (`@tuicraft/core`; `getPlaceState` and `capabilities` from C0); `Profile`; `Clock`, `GameLog`, `ReadyGate`; `InWorld`; `createTestRuntime`, `MockHandle`, `TestClock` (F5ab).
- Produces: `type ReadyInit = { clock; log; profile; stableMs? }`; `READY_STABLE_MS = 1000`; `createReadyGate(init): ReadyGate`. Ready = self pose known and the entity count unchanged for `stableMs` (polled every 100 ms, counted in polls so fake timers drive it). On ready: `InWorld` built, one `session/in_world` row (class `log`), `onReady` callbacks, pending `whenReady` resolve `true`. A throwing `getPlaceState` or `capabilities` gives `undefined` place and all-false capabilities. Race names are AzerothCore `SharedDefines.h:71-81` (read: 9 Goblin is commented out, so it is absent).

- [ ] **Step 1: Write the failing test** `packages/harness/src/runtime/ready.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import { type Entity, ObjectType, type UnitEntity } from "@tuicraft/core";
import { createReadyGate, READY_STABLE_MS } from "#harness/runtime/ready";
import {
  createTestRuntime,
  type MockHandle,
  type TestClock,
} from "#test-support/runtime-fixture";

const SELF = 0x42n;

function selfUnit(): UnitEntity {
  return {
    baseMana: 0,
    class_: 5,
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    gender: 0,
    guid: SELF,
    health: 100,
    level: 10,
    maxHealth: 100,
    maxPower: [],
    name: "Testchar",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [],
    race: 10,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function placeSelf(handle: MockHandle, entities: Entity[]): void {
  const state = handle.getControlState();
  state.selfGuid = SELF;
  state.pose = {
    mapId: 530,
    orientation: 0,
    source: "server",
    updatedAt: 0,
    x: 8813,
    y: -6691,
    z: 30,
  };
  handle.getNearbyEntities = jest.fn(() => entities);
}

function step(clock: TestClock, ms: number): void {
  clock.advance(ms);
  jest.advanceTimersByTime(ms);
}

async function setup() {
  const { rt, handle, clock } = await createTestRuntime({ connect: false });
  const gate = createReadyGate({ clock, log: rt.log, profile: rt.profile });
  return { clock, gate, handle, rt };
}

describe("createReadyGate", () => {
  test("becomes ready when the pose is known and the entity count is stable for 1 s", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle, rt } = await setup();
      const seen = jest.fn();
      gate.onReady(seen);
      gate.attach(handle);
      placeSelf(handle, [selfUnit()]);
      step(clock, READY_STABLE_MS - 200);
      expect(gate.isReady()).toBe(false);
      step(clock, 400);
      expect(gate.isReady()).toBe(true);
      expect(gate.inWorld()).toMatchObject({
        account: "TESTACC",
        char: "Testchar",
        className: "Priest",
        guid: "42",
        level: 10,
        mapId: 530,
        pose: { mapId: 530, x: 8813, y: -6691, z: 30 },
        race: "Blood Elf",
      });
      expect(seen).toHaveBeenCalledTimes(1);
      expect(rt.log.recent(1)[0]).toMatchObject({
        class: "log",
        domain: "session",
        event: "session/in_world",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("waits while entities keep arriving", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      gate.attach(handle);
      const entities: Entity[] = [selfUnit()];
      placeSelf(handle, entities);
      for (let i = 0; i < 5; i++) {
        entities.push({ ...selfUnit(), guid: BigInt(100 + i) });
        step(clock, 500);
      }
      expect(gate.isReady()).toBe(false);
      step(clock, READY_STABLE_MS + 100);
      expect(gate.isReady()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("whenReady resolves false after the timeout and true once ready", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      gate.attach(handle);
      const early = gate.whenReady(500);
      step(clock, 500);
      expect(await early).toBe(false);
      placeSelf(handle, [selfUnit()]);
      const later = gate.whenReady(10_000);
      step(clock, READY_STABLE_MS + 200);
      expect(await later).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("gives unknown names and no capabilities when core data is missing", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      handle.capabilities = () => {
        throw new Error("not_implemented");
      };
      gate.attach(handle);
      placeSelf(handle, []);
      step(clock, READY_STABLE_MS + 200);
      expect(gate.inWorld()).toMatchObject({
        capabilities: {
          factions: false,
          jev: false,
          navigation: false,
          spells: false,
        },
        className: "unknown",
        level: 0,
        race: "unknown",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("a new handle resets readiness", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      const detach = gate.attach(handle);
      placeSelf(handle, [selfUnit()]);
      step(clock, READY_STABLE_MS + 200);
      detach();
      expect(gate.isReady()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runtime/ready.test.ts`
Expected: FAIL with `Cannot find module "#harness/runtime/ready"`.

- [ ] **Step 3: Implement** `packages/harness/src/runtime/ready.ts`

```ts
import {
  type Capabilities,
  CLASS_NAMES,
  type UnitEntity,
  type WorldHandle,
} from "@tuicraft/core";
import type { Profile } from "#harness/contract/config";
import type { Clock, GameLog, ReadyGate } from "#harness/contract/services";
import type { InWorld } from "#harness/contract/views";
import { guidHex } from "#harness/ops/refs";

export type ReadyInit = {
  clock: Clock;
  log: GameLog;
  profile: Profile;
  stableMs?: number;
};

export const READY_STABLE_MS = 1000;

const POLL_MS = 100;
const NO_CAPABILITIES: Capabilities = {
  factions: false,
  jev: false,
  navigation: false,
  spells: false,
};
const RACE_NAMES: Record<number, string> = {
  1: "Human",
  2: "Orc",
  3: "Dwarf",
  4: "Night Elf",
  5: "Undead",
  6: "Tauren",
  7: "Gnome",
  8: "Troll",
  10: "Blood Elf",
  11: "Draenei",
};

export function createReadyGate(init: ReadyInit): ReadyGate {
  return new Gate(init);
}

class Gate implements ReadyGate {
  private readonly init: ReadyInit;
  private readonly callbacks = new Set<(world: InWorld) => void>();
  private waiters: ((ready: boolean) => void)[] = [];
  private world: InWorld | undefined;

  constructor(init: ReadyInit) {
    this.init = init;
  }

  attach = (handle: WorldHandle) => {
    this.world = undefined;
    const watch = { count: -1, stablePolls: 0 };
    const timer = setInterval(() => this.poll(handle, watch), POLL_MS);
    return () => {
      clearInterval(timer);
      this.world = undefined;
    };
  };

  isReady = () => this.world !== undefined;

  inWorld = () => this.world;

  onReady = (cb: (world: InWorld) => void) => {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  };

  whenReady = (timeoutMs: number): Promise<boolean> => {
    if (this.world) return Promise.resolve(true);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    this.waiters.push((ready) => {
      clearTimeout(timer);
      resolve(ready);
    });
    return promise;
  };

  private poll(
    handle: WorldHandle,
    watch: { count: number; stablePolls: number },
  ): void {
    if (this.world) return;
    const count = handle.getNearbyEntities().length;
    const stablePolls = count === watch.count ? watch.stablePolls + 1 : 0;
    Object.assign(watch, { count, stablePolls });
    const stable =
      stablePolls * POLL_MS >= (this.init.stableMs ?? READY_STABLE_MS);
    if (stable && handle.getControlState().pose)
      this.ready(inWorldOf(handle, this.init.profile, this.init.clock.now()));
  }

  private ready(world: InWorld): void {
    this.world = world;
    const text = `In world as ${world.char}, level ${world.level} ${world.race} ${world.className}, on map ${world.mapId}.`;
    this.init.log.append({
      class: "log",
      data: { ...world },
      domain: "session",
      event: "session/in_world",
      text,
    });
    for (const cb of this.callbacks) cb(world);
    for (const resolve of this.waiters) resolve(true);
    this.waiters = [];
  }
}

function inWorldOf(
  handle: WorldHandle,
  profile: Profile,
  now: number,
): InWorld {
  const { selfGuid, pose } = handle.getControlState();
  const self = handle
    .getNearbyEntities()
    .find(
      (entity): entity is UnitEntity =>
        entity.guid === selfGuid && "class_" in entity,
    );
  const place = attempt(() => handle.getPlaceState());
  const at = {
    mapId: pose?.mapId ?? 0,
    x: pose?.x ?? 0,
    y: pose?.y ?? 0,
    z: pose?.z ?? 0,
  };
  return {
    account: profile.account,
    at: now,
    capabilities: attempt(() => handle.capabilities()) ?? NO_CAPABILITIES,
    char: self?.name ?? profile.character,
    className: CLASS_NAMES[self?.class_ ?? 0] ?? "unknown",
    guid: guidHex(selfGuid),
    level: self?.level ?? 0,
    mapId: at.mapId,
    pose: at,
    race: RACE_NAMES[self?.race ?? 0] ?? "unknown",
    zone: place?.zone,
    zoneId: place?.zoneId,
  };
}

function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/runtime/ready.test.ts`
Expected: PASS, 5 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runtime/ready.ts packages/harness/src/runtime/ready.test.ts
mise exec -- git commit -m "feat: Gate harness tools on world ready" -m "Tools that act before the first object burst see an empty world, which is the start-then-sleep pattern of 36 sessions (design H.3). The gate marks the world ready once the pose is known and entities stop arriving for 1 s."
```

### Task F6a: Pi runtime factory and the faux session

**Needs:** F5ab

**Files:**
- Create: `packages/harness/src/runtime/pi-runtime.ts`
- Create: `packages/harness/test-support/faux-session.ts`
- Test: `packages/harness/src/runtime/pi-runtime.test.ts`

**Interfaces:**
- Consumes: `HarnessRuntime` (paths, flags); `createTestRuntime` (F5ab); Pi: `createAgentSessionRuntime`, `createAgentSessionServices`, `createAgentSessionFromServices`, `ModelRuntime`, `SessionManager`, `SettingsManager`, `ExtensionFactory`, `AgentSessionRuntime`, `AgentSession` (`pi-coding-agent`); `CredentialStore`, `Provider`, `fauxProvider`, `FauxProviderHandle`, `fauxAssistantMessage`, `Type` (`pi-ai`).
- Produces: `type PiRuntimeInit = { runtime; credentials; agentDir; extension; providers?: readonly Provider[] }` (Contract issue 3); `type ModelRef`; `splitModel(ref: string): ModelRef`; `createPiRuntime(init): Promise<AgentSessionRuntime>`. It creates `paths.workspace` and `paths.piSessions`, uses `SessionManager.create(workspace, piSessions)`, `SettingsManager.inMemory({ compaction: { enabled: false }, quietStartup: true })`, loader options `noContextFiles, noExtensions, noPromptTemplates, noSkills` and the `wow` factory as the only inline extension, `noTools: "builtin"`, model and thinking from the flags. Test support: `FAUX_MODEL = "faux/faux-1"`, `createFauxSession({ rt, extension }): Promise<FauxSession>`, `emptyCredentials`, `withExtensions(...factories): ExtensionFactory`, `type FauxSession = { runtime; session; faux; dispose }`.

Measured (probe, see "Measured facts"): the workspace must exist before `createAgentSessionRuntime`; `noTools: "builtin"` leaves only extension tools; tests need no `PI_*` env.

- [ ] **Step 1: Write the test support** `packages/harness/test-support/faux-session.ts`

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CredentialStore,
  type FauxProviderHandle,
  fauxProvider,
} from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionRuntime,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";
import { createPiRuntime } from "#harness/runtime/pi-runtime";

export const FAUX_MODEL = "faux/faux-1";

export type FauxSession = {
  runtime: AgentSessionRuntime;
  session: AgentSession;
  faux: FauxProviderHandle;
  dispose: () => Promise<void>;
};

export const emptyCredentials: CredentialStore = {
  delete: async () => {},
  list: async () => [],
  modify: async () => undefined,
  read: async () => undefined,
};

export async function createFauxSession(init: {
  rt: HarnessRuntime;
  extension: ExtensionFactory;
}): Promise<FauxSession> {
  const faux = fauxProvider({
    models: [{ id: "faux-1", reasoning: true }],
    provider: "faux",
  });
  const agentDir = await mkdtemp(join(tmpdir(), "harness-agent-"));
  const runtime = await createPiRuntime({
    agentDir,
    credentials: emptyCredentials,
    extension: init.extension,
    providers: [faux.provider],
    runtime: init.rt,
  });
  return {
    dispose: () => runtime.dispose(),
    faux,
    runtime,
    session: runtime.session,
  };
}

export function withExtensions(
  ...factories: ExtensionFactory[]
): ExtensionFactory {
  return async (pi) => {
    for (const factory of factories) await factory(pi);
  };
}
```

- [ ] **Step 2: Write the failing test** `packages/harness/src/runtime/pi-runtime.test.ts`

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { fauxAssistantMessage, Type } from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createPiRuntime, splitModel } from "#harness/runtime/pi-runtime";
import {
  createFauxSession,
  emptyCredentials,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

const probeTool: ExtensionFactory = (pi) => {
  pi.registerTool({
    description: "probe",
    execute: async () => ({
      content: [{ text: "ok", type: "text" }],
      details: {},
    }),
    label: "probe",
    name: "probe",
    parameters: Type.Object({}),
  });
};

describe("splitModel", () => {
  test("splits provider and id at the first slash", () => {
    expect(splitModel("openai-codex/gpt-6-luna")).toEqual({
      id: "gpt-6-luna",
      provider: "openai-codex",
    });
  });

  test("refuses a model without a provider", () => {
    expect(() => splitModel("gpt-6-luna")).toThrow(
      '--model must be <provider>/<id>, not "gpt-6-luna".',
    );
  });
});

describe("createPiRuntime", () => {
  test("has only extension tools, the flag model and the flag thinking level", async () => {
    const { rt } = await createTestRuntime({
      flags: { model: FAUX_MODEL, thinking: "low" },
    });
    open = await createFauxSession({ extension: probeTool, rt });
    expect(open.session.getActiveToolNames()).toEqual(["probe"]);
    expect(`${open.session.model?.provider}/${open.session.model?.id}`).toBe(
      FAUX_MODEL,
    );
    expect(open.session.thinkingLevel).toBe("low");
  });

  test("writes the session file into the run dir's pi-sessions and uses workspace as cwd", async () => {
    const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
    open = await createFauxSession({ extension: probeTool, rt });
    open.faux.setResponses([fauxAssistantMessage("hello")]);
    await open.session.prompt("hi");
    expect(open.runtime.cwd).toBe(rt.paths.workspace);
    expect(
      readdirSync(rt.paths.piSessions).some((name) => name.endsWith(".jsonl")),
    ).toBe(true);
  });

  test("a new session reruns the extension factory and keeps the game handle", async () => {
    const { rt, handle } = await createTestRuntime({
      flags: { model: FAUX_MODEL },
    });
    let factoryRuns = 0;
    open = await createFauxSession({
      extension: () => {
        factoryRuns += 1;
      },
      rt,
    });
    await open.runtime.newSession();
    expect(factoryRuns).toBe(2);
    expect(rt.handle()).toBe(handle);
  });

  test("refuses a model that is not in the catalog", async () => {
    const { rt } = await createTestRuntime({
      flags: { model: "faux/missing" },
    });
    await expect(
      createPiRuntime({
        agentDir: rt.paths.dir,
        credentials: emptyCredentials,
        extension: probeTool,
        runtime: rt,
      }),
    ).rejects.toThrow("The model faux/missing is not in the Pi catalog.");
    expect(existsSync(rt.paths.workspace)).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `mise test packages/harness/src/runtime/pi-runtime.test.ts`
Expected: FAIL with `Cannot find module "#harness/runtime/pi-runtime"`.

- [ ] **Step 4: Implement** `packages/harness/src/runtime/pi-runtime.ts`

```ts
import { mkdir } from "node:fs/promises";
import type { CredentialStore, Provider } from "@earendil-works/pi-ai";
import {
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

export type PiRuntimeInit = {
  runtime: HarnessRuntime;
  credentials: CredentialStore;
  agentDir: string;
  extension: ExtensionFactory;
  providers?: readonly Provider[];
};

export type ModelRef = { provider: string; id: string };

const LOADER = {
  noContextFiles: true,
  noExtensions: true,
  noPromptTemplates: true,
  noSkills: true,
} as const;

export function splitModel(ref: string): ModelRef {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1)
    throw new Error(`--model must be <provider>/<id>, not "${ref}".`);
  return { id: ref.slice(slash + 1), provider: ref.slice(0, slash) };
}

export async function createPiRuntime(
  init: PiRuntimeInit,
): Promise<AgentSessionRuntime> {
  const { workspace, piSessions } = init.runtime.paths;
  await mkdir(workspace, { recursive: true });
  await mkdir(piSessions, { recursive: true });
  const sessionManager = SessionManager.create(workspace, piSessions);
  return createAgentSessionRuntime(sessionFactory(init), {
    agentDir: init.agentDir,
    cwd: workspace,
    sessionManager,
  });
}

function sessionFactory(init: PiRuntimeInit): CreateAgentSessionRuntimeFactory {
  const { flags } = init.runtime;
  const ref = splitModel(flags.model);
  return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    const modelRuntime = await createModels(init);
    const model = modelRuntime.getModel(ref.provider, ref.id);
    if (!model)
      throw new Error(`The model ${flags.model} is not in the Pi catalog.`);
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      quietStartup: true,
    });
    const resourceLoaderOptions = {
      ...LOADER,
      extensionFactories: [{ factory: init.extension, name: "wow" }],
    };
    const services = await createAgentSessionServices({
      agentDir,
      cwd,
      modelRuntime,
      resourceLoaderOptions,
      settingsManager,
    });
    const created = await createAgentSessionFromServices({
      model,
      noTools: "builtin",
      services,
      sessionManager,
      sessionStartEvent,
      thinkingLevel: flags.thinking,
    });
    return { ...created, diagnostics: services.diagnostics, services };
  };
}

async function createModels(init: PiRuntimeInit): Promise<ModelRuntime> {
  const models = await ModelRuntime.create({
    credentials: init.credentials,
    modelsPath: null,
    refreshOnCreate: false,
  });
  for (const provider of init.providers ?? [])
    models.registerNativeProvider(provider);
  return models;
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/harness/src/runtime/pi-runtime.test.ts`
Expected: PASS, 6 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/runtime/pi-runtime.ts packages/harness/src/runtime/pi-runtime.test.ts packages/harness/test-support/faux-session.ts
mise exec -- git commit -m "feat: Build Pi sessions for the harness" -m "The harness session has no coding tools, context files, skills or templates, keeps settings in memory and writes its session files into the run dir. The factory closes over the process runtime, so a new session keeps the game handle."
```

### Task F7a: wow extension factory, shutdown and first input and guard slices

**Needs:** F5ab

**Files:**
- Create: `packages/harness/src/extension/extension.ts`
- Create: `packages/harness/src/extension/input.ts` (agent-state slice; F7b completes it)
- Create: `packages/harness/src/extension/guards.ts` (shell slice; F7c completes it)
- Create: `packages/harness/test-support/fake-pi.ts` (added file, Contract issue 11)
- Test: `packages/harness/src/extension/extension.test.ts`, `packages/harness/src/extension/input.test.ts`, `packages/harness/src/extension/guards.test.ts`

**Interfaces:**
- Consumes: `HarnessRuntime`; `createTestRuntime` (F5ab); Pi types `ExtensionAPI`, `ExtensionFactory`, `ExtensionContext`, `TerminalInputHandler`, `UserBashEventResult`, `AgentMessage`.
- Produces: `wowExtension(rt): ExtensionFactory`; `installShutdown(pi, rt): void` (`session_shutdown`: `rt.router.setSink(undefined)`; on `quit` only `await rt.shutdown()`); `installInput(pi, rt)` and `installGuards(pi, rt)` exist from here on. Test support: `createFakePi(mode?): FakePi` with `api`, `ctx`, `ui` (`editor`, `notes`, `inputs`), `events()`, `emit(event)`, `press(key)`, `typeRaw(data)`. The factory body keeps the contract's insertion order; later tasks add their one line each between `installGuards` and `installShutdown`: `installTools` (A1), `installEvents` (L10), `installPrompt` (P3), `installUi` (U11), `installCommands` (U10).

Why the slices: an empty installer is a `noEmptyBlockStatements` error in `src/**`. So F7a's `installInput` already tracks the agent state (contract 2.5: `agent_start`, `turn_start`, `tool_execution_start/end`, `agent_end`, `message_end`), and its `installGuards` already refuses `user_bash`. F7b and F7c add the rest.

- [ ] **Step 1: Write the test support** `packages/harness/test-support/fake-pi.ts`

```ts
import type {
  ExtensionAPI,
  ExtensionContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";

type Handler = (event: never, ctx: ExtensionContext) => unknown;
type Shortcut = {
  description?: string;
  handler: (ctx: ExtensionContext) => Promise<void> | void;
};

export type FakeUi = {
  editor: string;
  notes: string[];
  inputs: TerminalInputHandler[];
};

export type FakePi = {
  api: ExtensionAPI;
  ui: FakeUi;
  ctx: ExtensionContext;
  events: () => string[];
  emit: (
    event: { type: string } & Record<string, unknown>,
  ) => Promise<unknown[]>;
  press: (key: string) => Promise<void>;
  typeRaw: (
    data: string,
  ) => ({ consume?: boolean; data?: string } | undefined)[];
};

export function createFakePi(mode: "tui" | "print" = "tui"): FakePi {
  const handlers = new Map<string, Handler[]>();
  const shortcuts = new Map<string, Shortcut>();
  const ui: FakeUi = { editor: "", inputs: [], notes: [] };
  const ctx = fakeContext(ui, mode);
  const api = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () =>
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        );
    },
    registerShortcut(key: string, shortcut: Shortcut) {
      shortcuts.set(key, shortcut);
    },
  } as unknown as ExtensionAPI;
  return {
    api,
    ctx,
    emit: async (event) =>
      Promise.all(
        (handlers.get(event.type) ?? []).map((h) => h(event as never, ctx)),
      ),
    events: () =>
      [...handlers.keys()].filter(
        (name) => (handlers.get(name) ?? []).length > 0,
      ),
    press: async (key) => {
      await shortcuts.get(key)?.handler(ctx);
    },
    typeRaw: (data) => ui.inputs.map((input) => input(data)),
    ui,
  };
}

function fakeContext(ui: FakeUi, mode: "tui" | "print"): ExtensionContext {
  const context = {
    mode,
    ui: {
      getEditorText: () => ui.editor,
      notify: (message: string) => ui.notes.push(message),
      onTerminalInput(handler: TerminalInputHandler) {
        ui.inputs.push(handler);
        return () => {
          ui.inputs = ui.inputs.filter((h) => h !== handler);
        };
      },
      setEditorText: (text: string) => {
        ui.editor = text;
      },
    },
  };
  return context as unknown as ExtensionContext;
}
```

- [ ] **Step 2: Write the failing tests**

`packages/harness/src/extension/extension.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { installShutdown, wowExtension } from "#harness/extension/extension";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("wowExtension", () => {
  test("installs input, guards and shutdown handlers", async () => {
    const { rt } = await createTestRuntime();
    const fake = createFakePi();
    await wowExtension(rt)(fake.api);
    expect(fake.events()).toEqual(
      expect.arrayContaining([
        "agent_start",
        "agent_end",
        "user_bash",
        "session_shutdown",
      ]),
    );
  });
});

describe("installShutdown", () => {
  test("detaches the sink and keeps the game session on reload, new, resume and fork", async () => {
    const { rt, handle } = await createTestRuntime();
    const sinks: unknown[] = [];
    rt.router.setSink = (sink) => void sinks.push(sink);
    const fake = createFakePi();
    installShutdown(fake.api, rt);
    for (const reason of ["reload", "new", "resume", "fork"])
      await fake.emit({ reason, type: "session_shutdown" });
    expect(sinks).toEqual([undefined, undefined, undefined, undefined]);
    expect(handle.logout).not.toHaveBeenCalled();
    expect(rt.connection()).toBe("online");
  });

  test("on quit it shuts the runtime down", async () => {
    const { rt, handle } = await createTestRuntime();
    const fake = createFakePi();
    installShutdown(fake.api, rt);
    await fake.emit({ reason: "quit", type: "session_shutdown" });
    expect(handle.logout).toHaveBeenCalled();
    expect(rt.connection()).toBe("offline");
  });
});
```

`packages/harness/src/extension/input.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { installInput } from "#harness/extension/input";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup() {
  const { rt } = await createTestRuntime();
  const fake = createFakePi();
  installInput(fake.api, rt);
  return { fake, rt };
}

describe("installInput", () => {
  test("tracks the agent state through a turn", async () => {
    const { fake, rt } = await setup();
    await fake.emit({ type: "agent_start" });
    expect(rt.session).toMatchObject({ agent: "streaming", turnToolCalls: 0 });
    rt.session.humanWaiting = true;
    await fake.emit({ timestamp: 0, turnIndex: 0, type: "turn_start" });
    expect(rt.session.humanWaiting).toBe(false);
    await fake.emit({
      args: {},
      toolCallId: "c1",
      toolName: "look",
      type: "tool_execution_start",
    });
    expect(rt.session).toMatchObject({ agent: "tool", tool: "look" });
    await fake.emit({
      isError: false,
      result: {},
      toolCallId: "c1",
      toolName: "look",
      type: "tool_execution_end",
    });
    expect(rt.session).toMatchObject({ agent: "streaming", tool: undefined });
    await fake.emit({ messages: [], type: "agent_end" });
    expect(rt.session.agent).toBe("idle");
  });
  test("logs assistant text as agent/message", async () => {
    const { fake, rt } = await setup();
    await fake.emit({
      message: {
        content: [{ text: "I am level 10.", type: "text" }],
        role: "assistant",
      },
      type: "message_end",
    });
    expect(rt.log.recent(1)[0]).toMatchObject({
      event: "agent/message",
      text: "I am level 10.",
    });
  });
});
```

`packages/harness/src/extension/guards.test.ts`:

```ts
import { expect, test } from "bun:test";
import { installGuards } from "#harness/extension/guards";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

test("refuses a user shell command", async () => {
  const { rt } = await createTestRuntime();
  const fake = createFakePi();
  installGuards(fake.api, rt);
  const [result] = await fake.emit({
    command: "ls",
    cwd: "/",
    excludeFromContext: false,
    type: "user_bash",
  });
  expect(result).toEqual({
    result: {
      cancelled: false,
      exitCode: 1,
      output: "Shell commands are off in the harness.",
      truncated: false,
    },
  });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `mise test packages/harness/src/extension`
Expected: FAIL with `Cannot find module "#harness/extension/extension"` (and `input`, `guards`).

- [ ] **Step 4: Implement** `packages/harness/src/extension/extension.ts`

```ts
import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";
import { installGuards } from "#harness/extension/guards";
import { installInput } from "#harness/extension/input";

export function wowExtension(rt: HarnessRuntime): ExtensionFactory {
  return (pi) => {
    installInput(pi, rt);
    installGuards(pi, rt);
    installShutdown(pi, rt);
  };
}

export function installShutdown(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.on("session_shutdown", async ({ reason }) => {
    rt.router.setSink(undefined);
    if (reason === "quit") await rt.shutdown();
  });
}
```

`packages/harness/src/extension/input.ts` (F7a slice):

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

export function installInput(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const { session } = rt;
  pi.on("agent_start", () => {
    Object.assign(session, {
      agent: "streaming",
      turnStartSeq: rt.log.lastSeq(),
      turnToolCalls: 0,
    });
  });
  pi.on("turn_start", () => {
    session.humanWaiting = false;
  });
  pi.on("tool_execution_start", (event) => {
    Object.assign(session, {
      agent: "tool",
      lastToolCallAt: rt.clock.now(),
      tool: event.toolName,
    });
  });
  pi.on("tool_execution_end", () => {
    Object.assign(session, { agent: "streaming", tool: undefined });
  });
  pi.on("agent_end", () => {
    Object.assign(session, { agent: "idle", tool: undefined });
  });
  pi.on("message_end", (event) => noteAssistant(rt, event.message));
}

function noteAssistant(rt: HarnessRuntime, message: AgentMessage): void {
  if (!("role" in message) || message.role !== "assistant") return;
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  if (text.trim().length === 0) return;
  rt.log.append({
    class: "log",
    data: { text },
    domain: "agent",
    event: "agent/message",
    text,
  });
}
```

`packages/harness/src/extension/guards.ts` (F7a slice):

```ts
import type {
  ExtensionAPI,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

const BASH_OFF = "Shell commands are off in the harness.";

export function installGuards(pi: ExtensionAPI, _rt: HarnessRuntime): void {
  pi.on(
    "user_bash",
    (): UserBashEventResult => ({
      result: {
        cancelled: false,
        exitCode: 1,
        output: BASH_OFF,
        truncated: false,
      },
    }),
  );
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/harness/src/extension`
Expected: PASS, 6 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/extension packages/harness/test-support/fake-pi.ts
mise exec -- git commit -m "feat: Add the wow extension factory" -m "One factory installs every harness hook in a fixed order, so later tasks each add one line. Shutdown keeps the character logged in on /new and /reload and logs out only on quit (design H.3)."
```

### Task F7b: Stop reflex, human-waiting flag, steer yield and F9

**Needs:** F7a

**Files:**
- Modify: `packages/harness/src/extension/input.ts` (whole file below)
- Test: `packages/harness/src/extension/input.test.ts` (whole file below; it keeps the F7a tests)

**Interfaces:**
- Consumes: F7a's `installInput`; `rt.stopAll`, `rt.yields.trigger`, `rt.session`, `rt.log` (F5ab); `createFakePi` (F7a); Pi `InputEvent`, `InputEventResult`.
- Produces: `STOP_WORDS = ["stop", "halt", "freeze", "hold"]`; `STOP_MAX_WORDS = 5`; `isStopReflex(text): boolean` (at most 5 words, first word without punctuation, lower case, in `STOP_WORDS`); `humanStop({ rt, via: "reflex" | "command" | "key", text }): RunRecord[]` (calls `rt.stopAll("human")` and appends one `human/input` row `{ stopReflex: true, stoppedRuns, text, via }`; U10's `/stop` calls it with `via: "command"`). The `input` handler ignores `source: "extension"`, runs the reflex when `flags.stopReflex`, otherwise appends `human/input` with `via: "input"`; for every human text while `session.agent !== "idle"` it sets `humanWaiting` and calls `rt.yields.trigger()`; it always returns `{ action: "continue" }`. `F9` calls `humanStop` with `via: "key"`. Esc needs no hook: Pi aborts the tool signal (measured) and A1's `define.ts` calls `rt.stopAll("esc")`.

- [ ] **Step 1: Write the failing test** `packages/harness/src/extension/input.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import type { RunEnd } from "#harness/contract/runs";
import { YIELD_DELAY_MS } from "#harness/runtime/yield";
import {
  humanStop,
  installInput,
  isStopReflex,
} from "#harness/extension/input";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

function waitForAbort(signal: AbortSignal): Promise<RunEnd<undefined>> {
  const { promise, resolve } = Promise.withResolvers<RunEnd<undefined>>();
  signal.addEventListener("abort", () =>
    resolve({
      reason: (signal.reason as Error).message,
      status: "cancelled",
      summary: "stopped",
      value: undefined,
    }),
  );
  return promise;
}

async function setup(flags: { stopReflex?: boolean } = {}) {
  const { rt, handle } = await createTestRuntime({ flags });
  const fake = createFakePi();
  installInput(fake.api, rt);
  return { fake, handle, rt };
}

const human = (text: string) => ({
  source: "interactive",
  text,
  type: "input",
});

describe("isStopReflex", () => {
  test.each([
    "stop",
    "Stop!",
    "Stop! Stop right now.",
    "Stop, we're done.",
    "HALT",
    "freeze now",
    "hold on",
  ])("matches %p", (text) => {
    expect(isStopReflex(text)).toBe(true);
  });

  test.each([
    "wait",
    "please stop",
    "stop and then go north past the big tree",
    "",
    "stopwatch",
  ])("does not match %p", (text) => {
    expect(isStopReflex(text)).toBe(false);
  });
});

describe("installInput", () => {
  test("a stop reflex cancels the run, halts the character and logs the stopped runs", async () => {
    const { fake, handle, rt } = await setup();
    rt.runs.start({
      args: {},
      kind: "engage",
      launch: ({ signal }) => waitForAbort(signal),
      toolCallId: "t1",
    });
    const [result] = await fake.emit(human("Stop! Stop right now."));
    expect(result).toEqual({ action: "continue" });
    expect(rt.runs.get("r1")).toMatchObject({
      reason: "human_stop",
      status: "cancelled",
    });
    expect(handle.halt).toHaveBeenCalled();
    expect(rt.log.recent(1)[0]).toMatchObject({
      data: { stoppedRuns: ["r1"], stopReflex: true, via: "reflex" },
      event: "human/input",
    });
  });

  test("--stop-reflex off lets a stop message through without stopping", async () => {
    const { fake, handle, rt } = await setup({ stopReflex: false });
    await fake.emit(human("stop"));
    expect(handle.halt).not.toHaveBeenCalled();
    expect(rt.log.recent(1)[0]).toMatchObject({
      data: { stopReflex: false, via: "input" },
    });
  });

  test("human text while the agent works sets humanWaiting and triggers a yield", async () => {
    const { fake, rt } = await setup();
    jest.useFakeTimers();
    try {
      let yielded = false;
      rt.yields.wait().then(() => {
        yielded = true;
      });
      await fake.emit({ type: "agent_start" });
      await fake.emit({
        args: {},
        toolCallId: "c1",
        toolName: "engage",
        type: "tool_execution_start",
      });
      await fake.emit(human("how much health do you have?"));
      expect(rt.session.humanWaiting).toBe(true);
      jest.advanceTimersByTime(YIELD_DELAY_MS - 1);
      await Promise.resolve();
      expect(yielded).toBe(false);
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      expect(yielded).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("an idle stop reflex stops nothing, logs the text and does not set humanWaiting", async () => {
    const { fake, rt } = await setup();
    await fake.emit(human("stop"));
    expect(rt.session.humanWaiting).toBe(false);
    expect(rt.log.recent(1)[0]).toMatchObject({
      data: { stoppedRuns: [] },
      text: "Human: stop",
    });
  });

  test("text that an extension sends is not human input", async () => {
    const { fake, rt } = await setup();
    await fake.emit({ source: "extension", text: "stop", type: "input" });
    expect(rt.log.recent(1)[0]?.event).not.toBe("human/input");
  });

  test("tracks the agent state through a turn", async () => {
    const { fake, rt } = await setup();
    await fake.emit({ type: "agent_start" });
    expect(rt.session).toMatchObject({ agent: "streaming", turnToolCalls: 0 });
    rt.session.humanWaiting = true;
    await fake.emit({ timestamp: 0, turnIndex: 0, type: "turn_start" });
    expect(rt.session.humanWaiting).toBe(false);
    await fake.emit({
      args: {},
      toolCallId: "c1",
      toolName: "look",
      type: "tool_execution_start",
    });
    expect(rt.session).toMatchObject({ agent: "tool", tool: "look" });
    await fake.emit({
      isError: false,
      result: {},
      toolCallId: "c1",
      toolName: "look",
      type: "tool_execution_end",
    });
    expect(rt.session).toMatchObject({ agent: "streaming", tool: undefined });
    await fake.emit({ messages: [], type: "agent_end" });
    expect(rt.session.agent).toBe("idle");
  });

  test("logs assistant text as agent/message", async () => {
    const { fake, rt } = await setup();
    await fake.emit({
      message: {
        content: [{ text: "I am level 10.", type: "text" }],
        role: "assistant",
      },
      type: "message_end",
    });
    expect(rt.log.recent(1)[0]).toMatchObject({
      event: "agent/message",
      text: "I am level 10.",
    });
  });

  test("F9 stops every run", async () => {
    const { fake, rt } = await setup();
    rt.runs.start({
      args: {},
      kind: "rest",
      launch: ({ signal }) => waitForAbort(signal),
      toolCallId: "t1",
    });
    await fake.press("f9");
    expect(rt.runs.get("r1")?.status).toBe("cancelled");
    expect(rt.log.recent(1)[0]).toMatchObject({
      data: { via: "key" },
      text: "Human: F9",
    });
  });
});

test("humanStop returns the cancelled records", async () => {
  const { rt } = await createTestRuntime();
  rt.runs.start({
    args: {},
    kind: "travel",
    launch: ({ signal }) => waitForAbort(signal),
    toolCallId: "t1",
  });
  expect(
    humanStop({ rt, text: "/stop", via: "command" }).map((run) => run.id),
  ).toEqual(["r1"]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/extension/input.test.ts`
Expected: FAIL with `SyntaxError: Export named 'humanStop' not found in module` (F7a's `input.ts` exports only `installInput`).

- [ ] **Step 3: Implement** `packages/harness/src/extension/input.ts`

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  InputEvent,
  InputEventResult,
} from "@earendil-works/pi-coding-agent";
import type { RunRecord } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";

type Via = "reflex" | "command" | "key";
type HumanRow = {
  text: string;
  via: Via | "input";
  stopReflex: boolean;
  stoppedRuns: string[];
};

export const STOP_WORDS: readonly string[] = ["stop", "halt", "freeze", "hold"];
export const STOP_MAX_WORDS = 5;

const PUNCTUATION = /[^\p{L}\p{N}]/gu;
const SPACES = /\s+/;

export function isStopReflex(text: string): boolean {
  const words = text
    .trim()
    .split(SPACES)
    .filter((word) => word.length > 0);
  const first = words[0]?.replace(PUNCTUATION, "").toLowerCase() ?? "";
  return words.length <= STOP_MAX_WORDS && STOP_WORDS.includes(first);
}

export function humanStop(init: {
  rt: HarnessRuntime;
  via: Via;
  text: string;
}): RunRecord[] {
  const stopped = init.rt.stopAll("human");
  appendHuman(init.rt, {
    stoppedRuns: stopped.map((run) => run.id),
    stopReflex: true,
    text: init.text,
    via: init.via,
  });
  return stopped;
}

export function installInput(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const { session } = rt;
  pi.on("input", (event) => onInput(rt, event));
  pi.on("agent_start", () => {
    Object.assign(session, {
      agent: "streaming",
      turnStartSeq: rt.log.lastSeq(),
      turnToolCalls: 0,
    });
  });
  pi.on("turn_start", () => {
    session.humanWaiting = false;
  });
  pi.on("tool_execution_start", (event) => {
    Object.assign(session, {
      agent: "tool",
      lastToolCallAt: rt.clock.now(),
      tool: event.toolName,
    });
  });
  pi.on("tool_execution_end", () => {
    Object.assign(session, { agent: "streaming", tool: undefined });
  });
  pi.on("agent_end", () => {
    Object.assign(session, { agent: "idle", tool: undefined });
  });
  pi.on("message_end", (event) => noteAssistant(rt, event.message));
  pi.registerShortcut("f9", {
    description: "Stop every action now.",
    handler: () => void humanStop({ rt, text: "F9", via: "key" }),
  });
}

function onInput(rt: HarnessRuntime, event: InputEvent): InputEventResult {
  if (event.source === "extension") return { action: "continue" };
  if (rt.flags.stopReflex && isStopReflex(event.text))
    humanStop({ rt, text: event.text, via: "reflex" });
  else
    appendHuman(rt, {
      stoppedRuns: [],
      stopReflex: false,
      text: event.text,
      via: "input",
    });
  if (rt.session.agent !== "idle") {
    rt.session.humanWaiting = true;
    rt.yields.trigger();
  }
  return { action: "continue" };
}

function appendHuman(rt: HarnessRuntime, row: HumanRow): void {
  rt.log.append({
    class: "log",
    data: row,
    domain: "human",
    event: "human/input",
    text: `Human: ${row.text}`,
  });
}

function noteAssistant(rt: HarnessRuntime, message: AgentMessage): void {
  if (!("role" in message) || message.role !== "assistant") return;
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  if (text.trim().length === 0) return;
  rt.log.append({
    class: "log",
    data: { text },
    domain: "agent",
    event: "agent/message",
    text,
  });
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/extension/input.test.ts`
Expected: PASS, 21 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/extension/input.ts packages/harness/src/extension/input.test.ts
mise exec -- git commit -m "feat: Add the stop reflex and steer yield" -m "A short stop message must halt the character inside 5 s, faster than one model turn, so code does it (design C.4). Any other human text while a tool blocks sets human_waiting and yields the tool after Pi has queued the steer."
```

### Task F7c: Shell refusal and the /login guard (V7 path)

**Needs:** F7a

**Files:**
- Modify: `packages/harness/src/extension/guards.ts` (whole file below)
- Test: `packages/harness/src/extension/guards.test.ts` (whole file below)

**Interfaces:**
- Consumes: F7a's `installGuards`; `createFakePi` (F7a); Pi `ExtensionContext` (`ui.onTerminalInput`, `ui.getEditorText`, `ui.setEditorText`, `ui.notify`, `mode`).
- Produces: `LOGIN_NOTE` (the human-only line; F6b's fallback banner reuses it if F8e finds V7 fails); `installGuards(pi, rt)`: `user_bash` refused; on `session_start` in `tui` mode one `onTerminalInput` listener swallows Enter (`\r`, `\n`, `ESC[13u`) when the editor text is `/login` or `/logout` (with or without arguments), clears the editor, notifies `LOGIN_NOTE` and logs `human/input` with `(blocked)`; the listener is removed on `session_shutdown`.

Why: `/login` and `/logout` are built-ins matched before extension commands and before the `input` event (design H.5, pi-ui.md §6), and `/login` runs a real browser login before our read-only store discards it (luna-runtime "Corrected 1"). Whether the raw listener sees Enter first is V7, checked live in F8e.

- [ ] **Step 1: Write the failing test** `packages/harness/src/extension/guards.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { installGuards, LOGIN_NOTE } from "#harness/extension/guards";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup(mode: "tui" | "print" = "tui") {
  const { rt } = await createTestRuntime();
  const fake = createFakePi(mode);
  installGuards(fake.api, rt);
  await fake.emit({ reason: "startup", type: "session_start" });
  return { fake, rt };
}

describe("installGuards", () => {
  test("refuses a user shell command", async () => {
    const { fake } = await setup();
    const [result] = await fake.emit({
      command: "ls",
      cwd: "/",
      excludeFromContext: false,
      type: "user_bash",
    });
    expect(result).toEqual({
      result: {
        cancelled: false,
        exitCode: 1,
        output: "Shell commands are off in the harness.",
        truncated: false,
      },
    });
  });

  test.each(["/login", "/logout", "/login openai-codex"])(
    "swallows Enter on %s and prints a human-only line",
    async (text) => {
      const { fake, rt } = await setup();
      fake.ui.editor = text;
      expect(fake.typeRaw("\r")).toEqual([{ consume: true }]);
      expect(fake.ui.editor).toBe("");
      expect(fake.ui.notes).toEqual([LOGIN_NOTE]);
      expect(rt.log.recent(1)[0]).toMatchObject({
        event: "human/input",
        text: `Human: ${text} (blocked)`,
      });
    },
  );

  test("lets other text and other keys through", async () => {
    const { fake } = await setup();
    fake.ui.editor = "/loginx";
    expect(fake.typeRaw("\r")).toEqual([undefined]);
    fake.ui.editor = "/login";
    expect(fake.typeRaw("a")).toEqual([undefined]);
    expect(fake.ui.editor).toBe("/login");
  });

  test("adds no terminal listener outside the TUI and removes it on shutdown", async () => {
    const { fake: print } = await setup("print");
    expect(print.ui.inputs).toEqual([]);
    const { fake } = await setup();
    expect(fake.ui.inputs.length).toBe(1);
    await fake.emit({ reason: "reload", type: "session_shutdown" });
    expect(fake.ui.inputs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/extension/guards.test.ts`
Expected: FAIL with `SyntaxError: Export named 'LOGIN_NOTE' not found in module`.

- [ ] **Step 3: Implement** `packages/harness/src/extension/guards.ts`

```ts
import type {
  ExtensionAPI,
  ExtensionContext,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

export const LOGIN_NOTE =
  "/login and /logout do nothing useful here. The harness reads the Codex login from omp.";

const BASH_OFF = "Shell commands are off in the harness.";
const ENTER_KEYS: readonly string[] = ["\r", "\n", "\u001b[13u"];
const LOGIN_COMMANDS: readonly string[] = ["/login", "/logout"];

export function installGuards(pi: ExtensionAPI, rt: HarnessRuntime): void {
  let offInput: (() => void) | undefined;
  pi.on(
    "user_bash",
    (): UserBashEventResult => ({
      result: {
        cancelled: false,
        exitCode: 1,
        output: BASH_OFF,
        truncated: false,
      },
    }),
  );
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    offInput = ctx.ui.onTerminalInput((data) => guardLogin(rt, ctx, data));
  });
  pi.on("session_shutdown", () => {
    offInput?.();
    offInput = undefined;
  });
}

function guardLogin(
  rt: HarnessRuntime,
  ctx: ExtensionContext,
  data: string,
): { consume: boolean } | undefined {
  if (!ENTER_KEYS.includes(data)) return undefined;
  const text = ctx.ui.getEditorText().trim();
  if (
    !LOGIN_COMMANDS.some(
      (command) => text === command || text.startsWith(`${command} `),
    )
  )
    return undefined;
  ctx.ui.setEditorText("");
  ctx.ui.notify(LOGIN_NOTE, "warning");
  rt.log.append({
    class: "log",
    data: { text },
    domain: "human",
    event: "human/input",
    text: `Human: ${text} (blocked)`,
  });
  return { consume: true };
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/extension/guards.test.ts`
Expected: PASS, 6 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/extension/guards.ts packages/harness/src/extension/guards.test.ts
mise exec -- git commit -m "feat: Refuse shell and /login in the harness" -m "The harness has no shell, and Pi's /login runs a browser login that the read-only omp store then throws away. A raw input listener swallows Enter on those commands and tells the human why (design H.5)."
```

### Task F8a: Smoke test V3: steer yield ordering (the gate; run it first)

**Needs:** F6a, F7b

**Files:**
- Test: `packages/harness/src/smoke/v3-yield.test.ts`

**Interfaces:**
- Consumes: `wowExtension` (F7a) with the real `installInput` (F7b); `createFauxSession`, `withExtensions`, `FAUX_MODEL` (F6a); `createTestRuntime` (F5ab); `rt.runs`, `rt.yields`, `rt.stopAll`; Pi `fauxAssistantMessage`, `fauxToolCall`, `FauxResponseFactory`, `Type`.
- Produces: gate **V3** (contract 4): B5, B10, B11, B13 start only after this commit. The test tool here is test-only; it does what A1's run tools must do (start a run, race `rt.yields.wait()` against `run.done`, `rt.runs.release(id)` on yield, `rt.stopAll("esc")` on the Pi signal).

This is the scratch probe ("Measured facts") rewritten against the real `input.ts`: in the probe the same ordering held. It checks three things: a steer yields the blocking tool **after** Pi queued it and the next model request carries the steer; a `Stop!` steer cancels the run through the reflex before the model runs; Esc (`session.abort()`) aborts the tool signal and `stopAll("esc")` ends the run with reason `esc`. If the first test fails, stop: the coordinator applies design H.7's fallback (raise `YIELD_DELAY_MS`; last resort: runs return at 20 s) before any run tool is built.

- [ ] **Step 1: Write the test** `packages/harness/src/smoke/v3-yield.test.ts`

```ts
import { afterEach, expect, test } from "bun:test";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { RunEnd } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";
import { wowExtension } from "#harness/extension/extension";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
  withExtensions,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let current: FauxSession | undefined;

afterEach(async () => {
  await current?.dispose();
  current = undefined;
});

type Probe = {
  order: string[];
  started: PromiseWithResolvers<void>;
  signals: AbortSignal[];
};

function holdRunTool(rt: HarnessRuntime, probe: Probe): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      description:
        "Start a run and wait for it, or yield when the human writes.",
      execute: async (toolCallId, _params, signal) => {
        if (signal) probe.signals.push(signal);
        signal?.addEventListener("abort", () => rt.stopAll("esc"), {
          once: true,
        });
        const run = rt.runs.start({
          args: {},
          kind: "engage",
          launch: ({ signal: runSignal }) =>
            new Promise<RunEnd<undefined>>((resolve) =>
              runSignal.addEventListener("abort", () =>
                resolve({
                  status: "cancelled",
                  summary: "stopped",
                  value: undefined,
                }),
              ),
            ),
          toolCallId,
        });
        probe.order.push("tool:start");
        probe.started.resolve();
        const why = await Promise.race([
          rt.yields.wait(),
          run.done.then(() => "ended" as const),
        ]);
        rt.runs.release(run.id);
        probe.order.push(`tool:${why}`);
        return {
          content: [
            {
              text: `RUNNING ${run.id}: the human wrote a message. Read it before you act.`,
              type: "text",
            },
          ],
          details: {},
        };
      },
      label: "hold run",
      name: "hold_run",
      parameters: Type.Object({}),
    });
  };
}

function textsAfterLastToolResult(
  messages: readonly { role: string; content: unknown }[],
): string[] {
  const last = messages.findLastIndex(
    (message) => message.role === "toolResult",
  );
  return messages
    .slice(last + 1)
    .flatMap((message) =>
      message.role === "user" && Array.isArray(message.content)
        ? message.content.flatMap((part: { type: string; text?: string }) =>
            part.type === "text" && part.text ? [part.text] : [],
          )
        : [],
    );
}

async function setup() {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  const probe: Probe = {
    order: [],
    signals: [],
    started: Promise.withResolvers<void>(),
  };
  const open = await createFauxSession({
    extension: withExtensions(wowExtension(rt), holdRunTool(rt, probe)),
    rt,
  });
  current = open;
  return { open, probe, rt };
}

test("V3: a steer typed while a run tool blocks yields after Pi queued it, and the model sees it next", async () => {
  const { open, probe, rt } = await setup();
  let seen: string[] = [];
  const answer: FauxResponseFactory = (context) => {
    seen = textsAfterLastToolResult(context.messages);
    return fauxAssistantMessage("I am at the camp. The fight goes on.");
  };
  open.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hold_run", {}), {
      stopReason: "toolUse",
    }),
    answer,
  ]);
  const turn = open.session.prompt("kill three stalkers");
  await probe.started.promise;
  await open.session.prompt("where are you?", { streamingBehavior: "steer" });
  probe.order.push("steer:queued");
  await turn;
  expect(probe.order).toEqual(["tool:start", "steer:queued", "tool:human"]);
  expect(seen).toEqual(["where are you?"]);
  expect(rt.runs.get("r1")).toMatchObject({
    awaited: false,
    status: "running",
  });
  expect(
    rt.log
      .since(0)
      .filter((row) => row.event === "human/input")
      .map((row) => row.data),
  ).toEqual([
    expect.objectContaining({ stopReflex: false, text: "kill three stalkers" }),
    expect.objectContaining({ stopReflex: false, text: "where are you?" }),
  ]);
});

test("V3: a stop steer cancels the run through the reflex before the model runs", async () => {
  const { open, probe, rt } = await setup();
  open.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hold_run", {}), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Stopped."),
  ]);
  const turn = open.session.prompt("kill three stalkers");
  await probe.started.promise;
  await open.session.prompt("Stop! Stop right now.", {
    streamingBehavior: "steer",
  });
  expect(rt.runs.get("r1")).toMatchObject({
    reason: "human_stop",
    status: "cancelled",
  });
  await turn;
  expect(probe.order.at(-1)).toMatch(/^tool:(ended|human)$/);
});

test("Esc: aborting the turn aborts the tool's signal, and stopAll(esc) ends the run", async () => {
  const { open, probe, rt } = await setup();
  open.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hold_run", {}), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("unused"),
  ]);
  const turn = open.session.prompt("kill three stalkers");
  await probe.started.promise;
  await open.session.abort();
  await turn;
  expect(probe.signals[0]?.aborted).toBe(true);
  expect(rt.runs.get("r1")).toMatchObject({
    reason: "esc",
    status: "cancelled",
  });
  expect(probe.order.at(-1)).toBe("tool:ended");
});
```

- [ ] **Step 2: Run it**

Run: `mise test packages/harness/src/smoke/v3-yield.test.ts`
Expected: PASS, 3 tests (all dependencies exist, so there is no red phase: this task proves a Pi behaviour, and a failure here is the finding, not a missing module). If it fails, do not change `input.ts` or `yield.ts` to make it pass; report the failing assertion and `probe.order` to the coordinator.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 3: Commit**

```bash
git add packages/harness/src/smoke/v3-yield.test.ts
mise exec -- git commit -m "test: Prove the steer yield on the faux provider" -m "The blocking run model rests on one ordering: Pi queues a steer after the input handler returns, and the tool yields after that (design H.7 V3). This test pins it on Pi 0.87.1 with the real input handler."
```

### Task F8b: Smoke test V4: where schema failures show

**Needs:** F8a

**Files:**
- Test: `packages/harness/src/smoke/v4-validation.test.ts`

**Interfaces:**
- Consumes: `createFauxSession`, `FAUX_MODEL` (F6a); `createTestRuntime` (F5ab).
- Produces: the measured V4 answer for A1 and L13: `tool_result` does **not** fire for a call that fails schema validation; `tool_execution_end` does, with `isError: true` and `Validation failed for tool "<name>"` in its result (Contract issue 5).

- [ ] **Step 1: Write the test** `packages/harness/src/smoke/v4-validation.test.ts`

```ts
import { afterEach, expect, test } from "bun:test";
import {
  fauxAssistantMessage,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

type Seen = {
  toolResults: string[];
  executionEnds: { isError: boolean; text: string }[];
};

function countTool(seen: Seen): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      description: "Count to n.",
      execute: async () => ({
        content: [{ text: "counted", type: "text" }],
        details: {},
      }),
      label: "count",
      name: "count",
      parameters: Type.Object({ n: Type.Integer({ minimum: 1 }) }),
    });
    pi.on("tool_result", (event) => void seen.toolResults.push(event.toolName));
    pi.on("tool_execution_end", (event) => {
      const text = JSON.stringify(event.result);
      seen.executionEnds.push({ isError: event.isError, text });
    });
  };
}

test("V4: tool_result does not see a schema failure; tool_execution_end does", async () => {
  const seen: Seen = { executionEnds: [], toolResults: [] };
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  open = await createFauxSession({ extension: countTool(seen), rt });
  open.faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("count", { n: 2 }), fauxToolCall("count", { n: "many" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);
  await open.session.prompt("count");
  expect(seen.toolResults).toEqual(["count"]);
  const failed = seen.executionEnds.filter((end) => end.isError);
  expect(failed.length).toBe(1);
  expect(failed[0]?.text).toContain('Validation failed for tool \\"count\\"');
});
```

- [ ] **Step 2: Run it**

Run: `mise test packages/harness/src/smoke/v4-validation.test.ts`
Expected: PASS, 1 test (it pins the measured behaviour). If a Pi upgrade makes `tool_result` see the failure, this test fails and A.4's invalid-schema hint can move into `tool_result`.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 3: Commit**

```bash
git add packages/harness/src/smoke/v4-validation.test.ts
mise exec -- git commit -m "test: Pin how Pi reports schema failures" -m "Design A.4 wanted the tool_result hook to add a valid example after two schema errors. On Pi 0.87.1 that hook never sees them; tool_execution_end does, so counting moves there (design H.7 V4 fallback)."
```

### Task F8c: Smoke test V6: hidden [now] message reaches the model

**Needs:** F8a

**Files:**
- Test: `packages/harness/src/smoke/v6-now.test.ts`

**Interfaces:**
- Consumes: `createFauxSession`, `FAUX_MODEL` (F6a); `createTestRuntime` (F5ab).
- Produces: evidence for L10 and P3 that a `before_agent_start` result `{ message: { customType, content, display: false } }` reaches the model as user text after the prompt and is stored in the session file with `display: false`.

- [ ] **Step 1: Write the test** `packages/harness/src/smoke/v6-now.test.ts`

```ts
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
} from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

const NOW_LINE = "[now 19:13:31] Testchar L10 Priest HP 190/217 alive";

const hiddenNow: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", () => ({
    message: { content: NOW_LINE, customType: "wow-now", display: false },
  }));
};

test("V6: a hidden before_agent_start message reaches the model as user text after the prompt", async () => {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  open = await createFauxSession({ extension: hiddenNow, rt });
  let texts: string[] = [];
  const answer: FauxResponseFactory = (context) => {
    texts = context.messages.flatMap((message) =>
      message.role === "user" && Array.isArray(message.content)
        ? message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          )
        : [],
    );
    return fauxAssistantMessage("ok");
  };
  open.faux.setResponses([answer]);
  await open.session.prompt("what do you see?");
  expect(texts).toEqual(["what do you see?", NOW_LINE]);
  const file = open.session.sessionManager.getSessionFile() ?? "";
  expect(readFileSync(file, "utf8")).toContain('"display":false');
});
```

- [ ] **Step 2: Run it**

Run: `mise test packages/harness/src/smoke/v6-now.test.ts`
Expected: PASS, 1 test. On a failure the design H.7 fallback applies: inject `[now]` as a visible one-line message; report it to the L10 builder.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 3: Commit**

```bash
git add packages/harness/src/smoke/v6-now.test.ts
mise exec -- git commit -m "test: Prove the hidden [now] message reaches Pi" -m "Every agent run starts with a hidden [now] line (design C.3). This proves on the faux provider that a display false custom message is sent to the model; the live Luna half is F8e."
```

### Task F8d: Smoke test V2: context rewrites are not stored

**Needs:** F8a

**Files:**
- Test: `packages/harness/src/smoke/v2-context.test.ts`

**Interfaces:**
- Consumes: `createFauxSession`, `FAUX_MODEL` (F6a); `createTestRuntime` (F5ab).
- Produces: evidence for `--now-per-call` (L10): a message added in the `context` hook reaches the model and is absent from the session JSONL; and evidence for the wake-run `[now]` of main plan ruling R-L10: a hidden `role: "custom"` `wow-now` message that a `context` hook adds on a `sendMessage(…, { triggerTurn: true })` wake run reaches the model and is absent from the session JSONL.

- [ ] **Step 1: Write the test** `packages/harness/src/smoke/v2-context.test.ts`

```ts
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

const MARK = "CONTEXT-ONLY-NOW-LINE";

const perCallNow: ExtensionFactory = (pi) => {
  pi.on("context", (event) => ({
    messages: [
      ...event.messages,
      {
        content: [{ text: MARK, type: "text" }],
        role: "user",
        timestamp: Date.now(),
      },
    ],
  }));
};

test("V2: a context-hook message reaches the model but is not stored in the session file", async () => {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  open = await createFauxSession({ extension: perCallNow, rt });
  let sent = "";
  const answer: FauxResponseFactory = (context) => {
    sent = JSON.stringify(context.messages);
    return fauxAssistantMessage("ok");
  };
  open.faux.setResponses([answer]);
  await open.session.prompt("hello");
  expect(sent).toContain(MARK);
  const file = open.session.sessionManager.getSessionFile() ?? "";
  expect(readFileSync(file, "utf8")).not.toContain(MARK);
});

const WAKE_MARK = "CONTEXT-HIDDEN-WAKE-NOW";

function wakeNow(ended: () => void): {
  extension: ExtensionFactory;
  api: () => ExtensionAPI | undefined;
} {
  let saved: ExtensionAPI | undefined;
  const extension: ExtensionFactory = (pi) => {
    saved = pi;
    pi.on("agent_end", () => ended());
    pi.on("context", (event) => {
      const last = event.messages.at(-1) as { customType?: string } | undefined;
      if (last?.customType !== "wow-event") return undefined;
      return {
        messages: [
          ...event.messages,
          {
            content: WAKE_MARK,
            customType: "wow-now",
            display: false,
            role: "custom",
            timestamp: Date.now(),
          },
        ],
      };
    });
  };
  return { api: () => saved, extension };
}

test("V2: a hidden custom message added in context on a wake run reaches the model and is not stored", async () => {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  const done = Promise.withResolvers<void>();
  const wake = wakeNow(() => done.resolve());
  open = await createFauxSession({ extension: wake.extension, rt });
  let sent = "";
  const answer: FauxResponseFactory = (context) => {
    sent = JSON.stringify(context.messages);
    return fauxAssistantMessage("ok");
  };
  open.faux.setResponses([answer]);
  wake.api()?.sendMessage(
    {
      content: "[game 0s] r4 travel ended.",
      customType: "wow-event",
      details: { entries: [], kind: "wake" },
      display: true,
    },
    { triggerTurn: true },
  );
  await done.promise;
  expect(sent).toContain(WAKE_MARK);
  const file = open.session.sessionManager.getSessionFile() ?? "";
  expect(readFileSync(file, "utf8")).not.toContain(WAKE_MARK);
});
```

- [ ] **Step 2: Run it**

Run: `mise test packages/harness/src/smoke/v2-context.test.ts`
Expected: PASS, 2 tests. On a failure of the first test `--now-per-call` stays off (design H.7). On a failure of the second test, report it to the coordinator before L10b starts: L10b then carries the wake-run `[now]` line as the last line of the wake message instead (a coordinator brief changes L9b's `send` and L10b's `contextNow`).

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 3: Commit**

```bash
git add packages/harness/src/smoke/v2-context.test.ts
mise exec -- git commit -m "test: Prove context rewrites are not stored" -m "--now-per-call rewrites the context before each request (design C.3). If Pi stored those rewrites, every call would grow the session file with stale [now] lines; this pins that it does not."
```

### Task F6b: Entry and composition root

**Needs:** F3a, F3b, F3c, F4b, F5b, F5ab, F5c, F6a, F7a, F7b, F7c, F8a, L1b, L3b, L5b, L9a, L11, L12b, L13, L14, A1d, A2, A3b, A6, A7a, A8, A9, U1a (the [plan index](../2026-09-26-pi-harness-epic-plan.md) ids; Contract issue 10 adds A3b and L9a)

**Files:**
- Create: `packages/harness/src/entry.ts`, `packages/harness/src/main.ts`
- Test: `packages/harness/src/entry.test.ts`, `packages/harness/src/main.test.ts`

**Interfaces:**
- Consumes: F3a `parseFlags`, `USAGE`, `UsageError`, `harnessStateDir`; F3b `loadProfile`, `ProfileError`; F3c `acquireLock`, `Lock`, `LockError`; F4a `OmpCredentialStore`, `ompDbPath`; F4b `credentialStatus`, `startupCheck`; F5aa `createWorldMutex`, `createYieldGate`; F5b `defaultLogin`; F5ab `createHarnessRuntime`; F5c `createReadyGate`; F6a `createPiRuntime`; F7a `wowExtension`; L1 `createGameLog`, `createJsonlSink`; L3 `createRunRegistry`; L5 `createEventRouter`, `RuleContext`; L9 `createWakeGuard`; L11 `createWorldSnapshots`; L12 `createRunDir`, `writeMeta`, `linkSession`, `finalizeSession`, `runsRoot`, `RunDirError`; L13 `createToolStats`, `STATS_EVERY_MS`; L14 `createStatusWriter`, `statusSnapshot`, `STATUS_EVERY_MS`, `StatusWriter`; A2 `createRefTable`; A3 `snapshotWorld`; A6 `createRepeatGuard`; A7 `createAttackLedger`; A8 `createSightings`; A9 `createProgressTracker`; U1 `resolveGlyphSet`, `GlyphSetName`, `setGlyphs`; Pi `InteractiveMode`, `initTheme`, `AgentSessionRuntime`, `ExtensionFactory`, `registerBunOAuthFlows` (`@earendil-works/pi-ai/bun-oauth`); test support `writeOmpDb`, `codexRow` (F4a).
- Produces: `EXIT = { credential: 3, ok: 0, refused: 2, usage: 2 }`; `main(flags: HarnessFlags, deps?: MainDeps): Promise<number>` (Contract issue 12); `type MainDeps = { home; now; out; err; interactive }`. Launch: `bun packages/harness/src/entry.ts --profile <path> --run-dir <dir>` (`HARNESS_LAUNCH`). Order: flags → `PI_*` env defaults (`PI_CODING_AGENT_DIR=<state>/agent`, `PI_OFFLINE=1`, `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`, only when unset) → `registerBunOAuthFlows()` → dynamic `import("#harness/main")` → profile → lock → credential check (`--check` stops: 0 when ok, 3 when not; Contract issues 8, 9) → run dir → parts → runtime → glyphs → `meta.json` → stats and status writers → Pi runtime (the `wow` factory plus one quit handler that writes the final `meta.json`, finalizes `session.jsonl` and releases the lock; Contract issue 2) → `linkSession` → `rt.connect()` in the background unless `--no-connect` → `initTheme` → `InteractiveMode.run()`.

The `--check` tests need only this area. The last `main.test.ts` test runs the full start with a fake `interactive` that reads the active tools and calls `runtime.dispose()` (Pi's quit path, `agent-session-runtime.js:296-303`: `session_shutdown` with reason `quit`); it needs the L, A and U tasks above and was not run in the scratch probe.

- [ ] **Step 1: Write the failing tests** `packages/harness/src/main.test.ts` and `packages/harness/src/entry.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessStateDir, parseFlags } from "#harness/config/flags";
import { ompDbPath } from "#harness/credentials/omp-store";
import { EXIT, type MainDeps, main } from "#harness/main";
import { codexRow, writeOmpDb } from "#test-support/omp-db";

const NOW = Date.parse("2026-09-26T19:00:00Z");

let home: string;
let lines: { out: string[]; err: string[] };

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "harness-main-"));
  lines = { err: [], out: [] };
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

function deps(): MainDeps {
  return {
    err: (line) => lines.err.push(line),
    home,
    interactive: async () => {
      throw new Error("the --check path must not start Pi");
    },
    now: () => NOW,
    out: (line) => lines.out.push(line),
  };
}

async function ledger(account = "FACABC0123456"): Promise<string> {
  const path = join(home, "ledger.json");
  await writeFile(
    path,
    JSON.stringify({
      account,
      character: "Fgklibhlflc",
      createdAt: "2026-09-26T00:00:00Z",
      owner: home,
      password: "pw",
      preset: "eversong10",
    }),
  );
  return path;
}

function locks(): string[] {
  const dir = join(harnessStateDir(home), "locks");
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe("main --check", () => {
  test("prints the credential line, exits 0 and releases the lock", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.ok);
    expect(lines.out).toEqual([
      "Codex login: valid until 2026-09-26 20:00 UTC (omp).",
    ]);
    expect(locks()).toEqual([]);
  });

  test("exits 3 when omp has no Codex login", async () => {
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.credential);
    expect(lines.err).toEqual([
      "No Codex login found in omp. Run omp and log in to openai-codex. Then start the harness again.",
    ]);
    expect(locks()).toEqual([]);
  });

  test("exits 3 without --check when the login expires in under 10 minutes", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 300_000 }),
    ]);
    expect(await main(parseFlags(["--profile", await ledger()]), deps())).toBe(
      EXIT.credential,
    );
  });

  test("refuses a protected account before it takes a lock", async () => {
    const code = await main(
      parseFlags(["--profile", await ledger("ADMIN"), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.refused);
    expect(lines.err).toEqual([
      "The account ADMIN is protected. The harness does not log in to it.",
    ]);
    expect(locks()).toEqual([]);
  });

  test("refuses while another live harness holds the character", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const lockDir = join(harnessStateDir(home), "locks");
    await Bun.write(
      join(lockDir, "FACABC0123456-Fgklibhlflc.lock"),
      JSON.stringify({ host: "h", pid: 1, runDir: "/r", startedAt: "x" }),
    );
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.refused);
    expect(lines.err[0]).toContain("Another harness (pid 1");
  });
});

describe("main without --check", () => {
  test("builds the run dir, starts Pi with the game tools and finishes on quit", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const profile = join(home, "ledger.json");
    await writeFile(
      profile,
      JSON.stringify({
        account: "FACABC0123456",
        character: "Fgklibhlflc",
        createdAt: "2026-09-26T00:00:00Z",
        owner: home,
        password: "zq-secret-pass",
        preset: "eversong10",
      }),
    );
    const runDir = join(home, "run1");
    let tools: string[] = [];
    const quitting: MainDeps = {
      ...deps(),
      interactive: async (runtime) => {
        tools = runtime.session.getActiveToolNames();
        await runtime.dispose();
      },
    };
    const flags = ["--profile", profile, "--run-dir", runDir, "--no-connect"];
    expect(await main(parseFlags(flags), quitting)).toBe(EXIT.ok);
    expect(tools).toEqual(
      expect.arrayContaining(["look", "travel", "engage", "stop"]),
    );
    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    expect(meta).toMatchObject({
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      exitReason: "quit",
      model: "openai-codex/gpt-6-luna",
      v: 1,
    });
    expect(typeof meta.endedAt).toBe("number");
    expect(locks()).toEqual([]);
    for (const name of readdirSync(runDir, { recursive: true })) {
      const path = join(runDir, String(name));
      if (!statSync(path).isFile()) continue;
      const text = readFileSync(path, "utf8").toLowerCase();
      expect(text).not.toContain("zq-secret-pass");
    }
  });
});
```

```ts
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ompDbPath } from "#harness/credentials/omp-store";
import { codexRow, writeOmpDb } from "#test-support/omp-db";

const ENTRY = join(import.meta.dir, "entry.ts");

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "harness-entry-"));
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", ENTRY, ...args], {
    env: { HOME: home, PATH: Bun.env["PATH"] ?? "" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
}

test("a usage error prints the usage and exits 2", async () => {
  const result = await run(["--account", "X"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain(
    "Usage: bun packages/harness/src/entry.ts --profile <path>",
  );
});

test("--check runs the pre-flight through the dynamic import and exits 0", async () => {
  writeOmpDb(ompDbPath(home), [
    codexRow({
      access: "access-never-printed",
      expires: Date.now() + 3_600_000,
    }),
  ]);
  const profile = join(home, "ledger.json");
  await writeFile(
    profile,
    JSON.stringify({
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      createdAt: "x",
      owner: home,
      password: "pw",
      preset: "fresh",
    }),
  );
  const result = await run(["--profile", profile, "--check"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Codex login: valid until");
  expect(result.stdout).not.toContain("access-never-printed");
  expect(existsSync(join(home, ".pi"))).toBe(false);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `mise test packages/harness/src/main.test.ts packages/harness/src/entry.test.ts`
Expected: FAIL with `Cannot find module "#harness/main"`; the entry tests fail with exit code 1 (`Module not found`) instead of 2 and 0.

- [ ] **Step 3: Implement** `packages/harness/src/main.ts`

```ts
import { homedir } from "node:os";
import type { CredentialStore } from "@earendil-works/pi-ai";
import {
  type AgentSessionRuntime,
  type ExtensionFactory,
  InteractiveMode,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import { messageOf } from "@tuicraft/core/lib/errors";
import { harnessStateDir } from "#harness/config/flags";
import { acquireLock, type Lock, LockError } from "#harness/config/lock";
import { loadProfile, ProfileError } from "#harness/config/profile";
import type {
  HarnessFlags,
  Profile,
  RunMeta,
  RunPaths,
} from "#harness/contract/config";
import type { Clock, HarnessRuntime } from "#harness/contract/services";
import { OmpCredentialStore, ompDbPath } from "#harness/credentials/omp-store";
import { credentialStatus, startupCheck } from "#harness/credentials/status";
import {
  createRunDir,
  finalizeSession,
  linkSession,
  RunDirError,
  runsRoot,
  writeMeta,
} from "#harness/eval/run-dir";
import { createToolStats, STATS_EVERY_MS } from "#harness/eval/stats";
import {
  createStatusWriter,
  STATUS_EVERY_MS,
  type StatusWriter,
  statusSnapshot,
} from "#harness/eval/status";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import type { RuleContext } from "#harness/events/rules";
import { createWorldSnapshots } from "#harness/events/snapshot";
import { wowExtension } from "#harness/extension/extension";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createProgressTracker } from "#harness/ops/progress";
import { createRefTable } from "#harness/ops/refs";
import { createRepeatGuard } from "#harness/ops/repeat-guard";
import { createSightings } from "#harness/ops/sightings";
import { snapshotWorld } from "#harness/ops/views";
import { createRunRegistry } from "#harness/runs/registry";
import { defaultLogin } from "#harness/runtime/connection";
import { createHarnessRuntime } from "#harness/runtime/harness-runtime";
import { createWorldMutex } from "#harness/runtime/mutex";
import { createPiRuntime } from "#harness/runtime/pi-runtime";
import { createReadyGate } from "#harness/runtime/ready";
import { createYieldGate } from "#harness/runtime/yield";
import { setGlyphs } from "#harness/ui/context";
import { type GlyphSetName, resolveGlyphSet } from "#harness/ui/glyphs";

export const EXIT = { credential: 3, ok: 0, refused: 2, usage: 2 } as const;

export type MainDeps = {
  home: string;
  now: () => number;
  out: (line: string) => void;
  err: (line: string) => void;
  interactive: (runtime: AgentSessionRuntime) => Promise<void>;
};

type Started = {
  flags: HarnessFlags;
  deps: MainDeps;
  profile: Profile;
  lock: Lock;
  credentials: CredentialStore;
};
type Finish = {
  rt: HarnessRuntime;
  paths: RunPaths;
  meta: RunMeta;
  status: StatusWriter;
  lock: Lock;
  now: () => number;
};

export async function main(
  flags: HarnessFlags,
  deps: MainDeps = defaultDeps(),
): Promise<number> {
  try {
    return await start(flags, deps);
  } catch (error) {
    if (
      !(
        error instanceof ProfileError ||
        error instanceof LockError ||
        error instanceof RunDirError
      )
    )
      throw error;
    deps.err(error.message);
    return EXIT.refused;
  }
}

function defaultDeps(): MainDeps {
  return {
    err: (line) => console.error(line),
    home: homedir(),
    interactive: runInteractive,
    now: () => Date.now(),
    out: (line) => console.log(line),
  };
}

async function start(flags: HarnessFlags, deps: MainDeps): Promise<number> {
  const profile = await loadProfile(flags.profile, deps.home);
  const lock = await acquireLock({
    profile,
    runDir: flags.runDir ?? runsRoot(deps.home),
    stateDir: harnessStateDir(deps.home),
  });
  process.once("exit", lock.releaseSync);
  const credentials = new OmpCredentialStore({
    dbPath: ompDbPath(deps.home),
    now: deps.now,
  });
  const check = startupCheck(await credentialStatus(credentials, deps.now()));
  if (check.ok) deps.out(check.line);
  else deps.err(check.line);
  if (!check.ok || flags.check) {
    await lock.release();
    return check.ok ? EXIT.ok : EXIT.credential;
  }
  await play({ credentials, deps, flags, lock, profile });
  return EXIT.ok;
}

async function play({
  flags,
  deps,
  profile,
  lock,
  credentials,
}: Started): Promise<void> {
  const paths = await createRunDir({
    character: profile.character,
    flag: flags.runDir,
    home: deps.home,
    now: new Date(deps.now()),
  });
  const rt = composeRuntime({ flags, paths, profile });
  const glyphs = resolveGlyphSet(
    flags.glyphs,
    Bun.env["TUICRAFT_GLYPHS"],
    deps.err,
  );
  setGlyphs(glyphs);
  const meta = runMeta({ flags, glyphs, profile, startedAt: deps.now() });
  await writeMeta(paths, meta);
  rt.stats.start({ everyMs: STATS_EVERY_MS, path: paths.tools });
  const status = createStatusWriter({
    path: paths.status,
    snapshot: () => statusSnapshot(rt),
  });
  status.start(STATUS_EVERY_MS);
  const finish = finisher({ lock, meta, now: deps.now, paths, rt, status });
  const agentDir = `${harnessStateDir(deps.home)}/agent`;
  const piRuntime = await createPiRuntime({
    agentDir,
    credentials,
    extension: withFinish(wowExtension(rt), finish),
    runtime: rt,
  });
  await linkSession(
    paths,
    piRuntime.session.sessionManager.getSessionFile() ?? paths.session,
  );
  if (flags.connect)
    rt.connect().catch((error: unknown) =>
      deps.err(
        `The harness could not connect: ${messageOf(error)}. Use /connect to try again.`,
      ),
    );
  await deps.interactive(piRuntime);
}

function composeRuntime({
  flags,
  paths,
  profile,
}: {
  flags: HarnessFlags;
  paths: RunPaths;
  profile: Profile;
}): HarnessRuntime {
  const clock: Clock = { now: () => Date.now() };
  const log = createGameLog({
    char: () => profile.character,
    clock,
    file: paths.gamelog,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: paths.runs }),
  });
  const attacks = createAttackLedger(clock);
  const jevLog = createJsonlSink({ file: paths.jev });
  const late: { rt?: HarnessRuntime } = {};
  const router = createEventRouter({
    attacks,
    context: () => ruleContext(built(late.rt)),
    flags,
    guard: createWakeGuard(clock),
    jevLog,
    log,
    runs,
  });
  const snapshots = createWorldSnapshots({
    clock,
    log,
    paths,
    world: () => snapshotWorld(built(late.rt)),
  });
  const travel = {
    lastGoodPose: undefined,
    lastRefusedGoal: undefined,
    visitedCells: new Set<string>(),
  };
  const shared = {
    attacks,
    clock,
    flags,
    jevLog,
    log,
    login: defaultLogin,
    paths,
    profile,
    router,
    runs,
    snapshots,
    travel,
  };
  late.rt = createHarnessRuntime({
    ...shared,
    ...services({ clock, log, profile }),
  });
  return late.rt;
}

function services({
  clock,
  log,
  profile,
}: {
  clock: Clock;
  log: ReturnType<typeof createGameLog>;
  profile: Profile;
}) {
  return {
    mutex: createWorldMutex(),
    progress: createProgressTracker({ clock, log }),
    ready: createReadyGate({ clock, log, profile }),
    refs: createRefTable(),
    repeats: createRepeatGuard(clock),
    sightings: createSightings(clock),
    stats: createToolStats(clock),
    yields: createYieldGate(),
  };
}

function built(rt: HarnessRuntime | undefined): HarnessRuntime {
  if (!rt) throw new Error("The harness runtime is not built yet.");
  return rt;
}

function ruleContext(rt: HarnessRuntime): RuleContext {
  const selfGuid = rt.handle()?.getControlState().selfGuid ?? 0n;
  return {
    now: rt.clock.now(),
    refOf: (guid) => rt.refs.refOf(guid),
    runActive: rt.runs.active() !== undefined,
    selfGuid,
    selfName: rt.profile.character,
    wake: rt.session.wake,
  };
}

function runMeta({
  flags,
  glyphs,
  profile,
  startedAt,
}: {
  flags: HarnessFlags;
  glyphs: GlyphSetName;
  profile: Profile;
  startedAt: number;
}): RunMeta {
  const files = {
    gamelog: "gamelog.jsonl",
    jev: "jev.jsonl",
    runs: "runs.jsonl",
    session: "session.jsonl",
    status: "status.json",
    tools: "tools.json",
  };
  const run = {
    capabilities: undefined,
    characterGuid: undefined,
    endedAt: undefined,
    exitReason: undefined,
    gitSha: gitSha(),
    startedAt,
  };
  return {
    ...run,
    account: profile.account,
    character: profile.character,
    files,
    flags,
    glyphs,
    model: flags.model,
    thinking: flags.thinking,
    v: 1,
  };
}

function gitSha(): string | undefined {
  const proc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: import.meta.dir,
    stderr: "ignore",
  });
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : undefined;
}

function finisher({
  rt,
  paths,
  meta,
  status,
  lock,
  now,
}: Finish): () => Promise<void> {
  return async () => {
    await status.stop();
    const world = rt.ready.inWorld();
    await writeMeta(paths, {
      ...meta,
      capabilities: world?.capabilities,
      characterGuid: world?.guid,
      endedAt: now(),
      exitReason: "quit",
    });
    await finalizeSession(paths);
    await lock.release();
  };
}

function withFinish(
  factory: ExtensionFactory,
  finish: () => Promise<void>,
): ExtensionFactory {
  return async (pi) => {
    await factory(pi);
    pi.on("session_shutdown", async ({ reason }) => {
      if (reason === "quit") await finish();
    });
  };
}

async function runInteractive(runtime: AgentSessionRuntime): Promise<void> {
  initTheme(runtime.services.settingsManager.getTheme(), false);
  const mode = new InteractiveMode(runtime, {
    modelFallbackMessage: runtime.modelFallbackMessage,
    startupDiagnostics: [...runtime.diagnostics],
  });
  await mode.run();
}
```

- [ ] **Step 3: Implement** `packages/harness/src/entry.ts`

```ts
import { homedir } from "node:os";
import {
  harnessStateDir,
  parseFlags,
  USAGE,
  UsageError,
} from "#harness/config/flags";
import type { HarnessFlags } from "#harness/contract/config";

const flags = readFlags(Bun.argv.slice(2));
setDefault("PI_CODING_AGENT_DIR", `${harnessStateDir(homedir())}/agent`);
setDefault("PI_OFFLINE", "1");
setDefault("PI_SKIP_VERSION_CHECK", "1");
setDefault("PI_TELEMETRY", "0");
const { registerBunOAuthFlows } = await import(
  "@earendil-works/pi-ai/bun-oauth"
);
registerBunOAuthFlows();
const { main } = await import("#harness/main");
process.exit(await main(flags));

function readFlags(argv: readonly string[]): HarnessFlags {
  try {
    return parseFlags(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return process.exit(2);
  }
}

function setDefault(name: string, value: string): void {
  Bun.env[name] ??= value;
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/main.test.ts packages/harness/src/entry.test.ts`
Expected: PASS, 8 tests, 0 fail.

Run: `mise lint:fix && mise format:fix && mise lint && mise format && bun run tsc --noEmit -p packages/harness`
Expected: exit 0 for each command.

- [ ] **Step 5: Start it in an Orca pane (manual check, no game login)**

This checks what a unit test cannot: the TUI starts from source, and quit writes the final `meta.json` and removes the lock. It needs a valid omp login; the `--check` line proves it.

```bash
cd "$(git rev-parse --show-toplevel)"
ACC_JSON=$(bun packages/factory/src/main.ts soap create fresh)
echo "$ACC_JSON" > tmp/f6b-account.json
bun packages/harness/src/entry.ts --profile tmp/f6b-account.json --check
orca-ide terminal create --worktree "path:$(git rev-parse --show-toplevel)" --title f6b-boot \
  --command "bun packages/harness/src/entry.ts --profile tmp/f6b-account.json --run-dir tmp/f6b-run --no-connect" --json
orca-ide terminal read --terminal <handle> --screen --json
orca-ide terminal send --terminal <handle> --text $'\x04' --json
jq '{endedAt, exitReason, character}' tmp/f6b-run/meta.json
ls ~/.local/state/tuicraft-harness/locks/
bun packages/factory/src/main.ts soap delete "$(jq -r .account tmp/f6b-account.json)"
```

Expected: `--check` prints `Codex login: valid until … UTC (omp).`; the screen shows Pi's editor and footer with `gpt-6-luna • high` and no stack trace; after Ctrl-D, `meta.json` has a numeric `endedAt` and `exitReason: "quit"`, and the lock dir has no `<ACCOUNT>-<character>.lock`. Send Ctrl-D only on an empty editor (luna-runtime §6). Close the pane with `orca-ide terminal close --terminal <handle> --tab --json`.

- [ ] **Step 6 (optional, not a gate): compiled binary**

```bash
bun build --compile packages/harness/src/entry.ts --outfile tmp/harness-bin/harness
mkdir -p tmp/harness-bin/theme
cp packages/harness/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/{dark,light}.json tmp/harness-bin/theme/
tmp/harness-bin/harness --profile tmp/f6b-account.json --check
```

Expected: the same credential line (luna-runtime §5: the binary needs `registerBunOAuthFlows()`, which `entry.ts` calls, and `theme/*.json` beside it). Round 1 runs from source; record a failure here in the commit body, do not block on it.

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/entry.ts packages/harness/src/main.ts packages/harness/src/entry.test.ts packages/harness/src/main.test.ts
mise exec -- git commit -m "feat: Add the harness entry and composition root" -m "Pi reads its agent dir when its modules load, so entry.ts sets the PI_* env before a dynamic import of main. Pi exits the process after the quit handlers, so the final meta.json and the lock release run in a quit handler, not after run()."
```

### Task F8e: Live smoke checks V1, V5, V6 (live half), V7 in an Orca pane

**Needs:** F6b, U11, L10, P3

**Files:**
- Create: `docs/plans/2026-09-26-pi-harness-epic/smoke-live.md`

**Interfaces:**
- Consumes: F6b (launch), U11 (`installUi`, the footer for V5), L10 (`installEvents`, `--now-per-call` for V1), P3 (`installPrompt`), F7c (the `/login` guard for V7); a throwaway soap account; Luna on `openai-codex/gpt-6-luna` with a valid omp login.
- Produces: the V1, V5, V6, V7 verdicts in `smoke-live.md`, which decide: `--now-per-call` may be used (V1); the footer uses `setFooter` or falls back to a 4-line `setWidget` (V5, U11 owns the change); the `/login` guard stays, or F7c's listener is removed and `main.ts` prints `LOGIN_NOTE` as a startup banner line (V7; the coordinator assigns that follow-up).

This is the harness live gate (AGENTS.md "Testing": live evidence, throwaway soap accounts; the harness changes no protocol or daemon code, so `mise test:live` is not its gate, but the FINAL gate runs it). Run it from the builder's child worktree root, rebased on the `epic/pi-harness` tip that holds F6b, U11a, L10b and P3; never on another agent's character.

- [ ] **Step 1: Make a throwaway account and check the login**

```bash
cd "$(git rev-parse --show-toplevel)"
bun packages/factory/src/main.ts soap create eversong10 > tmp/f8e-account.json
bun packages/harness/src/entry.ts --profile tmp/f8e-account.json --check
```

Expected: exit 0 and `Codex login: valid until … UTC (omp).` Under 10 minutes left: run omp once, then repeat.

- [ ] **Step 2: V5 and V7 in one pane (default flags)**

```bash
orca-ide terminal create --worktree "path:$(git rev-parse --show-toplevel)" --title f8e-v5-v7 \
  --command "bun packages/harness/src/entry.ts --profile tmp/f8e-account.json --run-dir tmp/f8e-run1" --json
# wait about 15 s: Pi draws its footer within 5 s and the login finishes within 10 s
orca-ide terminal read --terminal <handle> --screen --json > tmp/f8e-v5-screen.json
orca-ide terminal send --terminal <handle> --text "/login" --enter --json
orca-ide terminal read --terminal <handle> --screen --json > tmp/f8e-v7-screen.json
rg -c '"event":"human/input".*\(blocked\)' tmp/f8e-run1/gamelog.jsonl
```

V5 passes when the screen shows the unit-frame footer rows (design E.2) in place of Pi's default footer. V7 passes when the screen shows `/login and /logout do nothing useful here.`, no login selector or browser URL appears, and the `rg -c` count is 1. If a login selector appears, press Esc to close it and record V7 as failed.

- [ ] **Step 2b: V6 live half in the same pane (default flags)**

```bash
orca-ide terminal send --terminal <handle> --text "How much health do you have? Answer from what you already know; do not call a tool." --enter --json
# wait about 20 s: Luna answers a no-tool turn in 4-8 s
orca-ide terminal read --terminal <handle> --screen --json > tmp/f8e-v6-screen.json
rg '"event":"agent/now"' tmp/f8e-run1/gamelog.jsonl | tail -n 1
rg -c '"role":"toolResult"' tmp/f8e-run1/session.jsonl
```

V6 passes when the answer on the screen names the HP pair (for example `217/217`) that the last `agent/now` row holds, and the `toolResult` count is 0 (the model had the number without a tool, so the hidden `[now]` message reached Luna). A missing number, or a `look` call before the answer, is a fail. On a fail the design H.7 fallback applies: P3 and L10b send `[now]` as a visible one-line message (`display: true`); the coordinator assigns that change.

- [ ] **Step 3: V1 in a second pane**

```bash
orca-ide terminal send --terminal <handle> --text $'\x04' --json
orca-ide terminal create --worktree "path:$(git rev-parse --show-toplevel)" --title f8e-v1 \
  --command "bun packages/harness/src/entry.ts --profile tmp/f8e-account.json --run-dir tmp/f8e-run2 --now-per-call" --json
# wait about 15 s for the login
orca-ide terminal send --terminal <handle2> --text "Look around and tell me the nearest questgiver." --enter --json
# wait about 30 s: Luna answers a one-tool turn in 4-8 s; read again if it still works
orca-ide terminal read --terminal <handle2> --screen --json > tmp/f8e-v1-screen.json
rg -c '"role":"toolResult"' tmp/f8e-run2/session.jsonl
rg -c 'Error|400' tmp/f8e-v1-screen.json
orca-ide terminal send --terminal <handle2> --text $'\x04' --json
```

V1 passes when the turn with a `look` call completes with an assistant answer after the tool result (at least one `toolResult` row) and the screen shows no provider error. A `400` or `invalid_request` error means the Responses API refused a user message after a tool result: V1 fails and `--now-per-call` stays off.

- [ ] **Step 4: Clean up**

```bash
orca-ide terminal close --terminal <handle> --tab --json
orca-ide terminal close --terminal <handle2> --tab --json
bun packages/factory/src/main.ts soap delete "$(jq -r .account tmp/f8e-account.json)"
```

- [ ] **Step 5: Write the record** `docs/plans/2026-09-26-pi-harness-epic/smoke-live.md`

Write the three verdicts from the observations above, in this layout (present tense, one date line because the date is the fact a reader needs):

```markdown
# Pi harness live smoke checks (V1, V5, V6, V7)

Taken 2026-MM-DD on `epic/pi-harness` at <short sha>, Pi 0.87.1, `openai-codex/gpt-6-luna` thinking `high`, soap preset `eversong10`.

| Id | Question (design H.7) | Verdict | Evidence |
|---|---|---|---|
| V1 | A `context`-hook user message after a tool result is accepted by `openai-codex-responses` | pass or fail | turn text, `toolResult` count, error text if any |
| V5 | `setFooter` from `session_start` takes effect in an Orca pane | pass or fail | the footer rows as read with `--screen` |
| V6 | A hidden `before_agent_start` message (`display: false`) reaches Luna | pass or fail | the answer text, the `agent/now` HP pair, the `toolResult` count |
| V7 | An `onTerminalInput` listener swallows Enter on `/login` before the built-in handler | pass or fail | the notice line, the `(blocked)` row count |

## Consequences

- V1: `--now-per-call` <may be used | stays off>.
- V5: the footer <uses setFooter | falls back to a 4-line setWidget below the editor (U11)>.
- V6: `[now]` <stays hidden | is sent as a visible one-line message (P3, L10b)>.
- V7: the `/login` guard <stays | is removed; main prints LOGIN_NOTE as a startup banner line>.
```

Fill every `<…>` and every `pass or fail` from Steps 2, 2b and 3; leave none. `mise lint:docs` checks this file only if `src/tools/stale-docs.ts` lists it; run `mise lint:docs` anyway.

- [ ] **Step 6: Commit**

```bash
git add docs/plans/2026-09-26-pi-harness-epic/smoke-live.md
mise exec -- git commit -m "docs: Record the live harness smoke checks" -m "V1, V5 and V7 depend on Luna and on a real terminal, so the faux provider cannot answer them. This record decides --now-per-call, the footer path and the /login guard."
```

---

## Self-review

- Spec coverage: H.2 entry order (F6b), H.3 lifetimes and `session_shutdown` (F5ab, F7a, F6b), H.4 profile and lock (F3b, F3c), H.5 credentials (F4a, F4b, F7c), H.7 V1–V7 (F8a–F8e; V4 answered "no" with a measured fallback), H.8 flags (F3a), H.9 `registerBunOAuthFlows` and themes (F6b Step 6), C.4 steps 1–4 (F7b; `/stop` is U10's command calling `humanStop`; Esc is A1's `define.ts`, proven by F8a's third test), A.3 one run at a time (fixture double; L3 owns the real registry).
- Every code block in this file compiled with `tsc` under `tsconfig.base.json` and passed `bun test` and the repo `biome.json` in a scratch copy (118 tests), with stubs for the L, A and U functions that F6b calls. Exceptions: `ready.ts` and its test type-check only after C0 (`getPlaceState`, `capabilities` on `WorldHandle`); the last `main.test.ts` test needs the real L, A and U tasks.
- Names match contract.md §2.1–2.5 and §6; the deviations are listed under "Contract issues".

