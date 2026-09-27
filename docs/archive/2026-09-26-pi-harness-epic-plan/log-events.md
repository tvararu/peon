# Pi harness epic: log and events area plan (key: log-events)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans
> (or superpowers:subagent-driven-development) to do this plan task by task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the harness records every game event in its own typed game log,
routes a few of them to the model (wake, passive), builds the `[now]` line,
tracks runs, and writes the eval run dir.

**Architecture (5 lines):**

1. `log/store.ts` holds a 5,000-row ring, a seq map and a JSONL writer that
   serializes rows at flush time (every 250 ms), so late `mark()` calls reach disk.
2. `events/router.ts` subscribes all 21 `WorldHandle` hooks and `runs.subscribe`, turns
   events into drafts with pure translators, admits wakes through the guard, appends, and
   delivers wake and passive rows from its own `log.subscribe`.
3. `events/delivery.ts` sends wakes as `followUp` only, holds them while the agent works
   so tool results can mark `consumedBy` first, and batches passive lines.
4. `events/now.ts` is the pure `[now]` builder; `events/install.ts` injects it at
   `before_agent_start` (hidden, V6 fallback is one constant).
5. `runs/` holds the `r<n>` registry, the yield wait and the core adapters; `eval/`
   writes `meta.json`, `tools.json`, `runs.jsonl`, `status.json` and the session link.

**Tech stack:** Bun 1.4, `bun:test`, TypeScript strict, Pi 0.87.1
(`@earendil-works/pi-coding-agent` `ExtensionAPI`), `@tuicraft/core` barrel.

**Sources:** `design/harness-design.md` C, D, H.3, H.6, I.1, V.4, LU.3 (committed
copy: `docs/plans/2026-09-26-pi-harness-epic-design.md`), [`contract.md`](contract.md)
2.9–2.12, 3.2, 4.1, `design/harness-architecture.md` 6–8, `design/event-volume.md`.

**Live gate:** no task in this area changes core protocol or the daemon, so no
task runs `mise test:live`. The harness cannot start before F6b (BOOT), so no
task here has an Orca pane smoke; F8e (V1, V5, V6, V7) and the FINAL canary
`t0-self-state` check this area live. L10b reads the result of F8c (V6).

**Plan check (measured, 2026-09-26):** the test and implementation code of
every task was assembled into a scratch package with the `contract/*.ts`
types copied from `contract.md`, stubs for `Refusal`, `harnessStateDir`,
`nowSnapshot` and a minimal `createTestRuntime`, and a copy of core at
`epic/pi-harness` `3af5aa3` with C0/C1 shims (`onNotice`,
`triggerCycleEvent`, `CombatEvent.attacker`, `CombatState.attackers`,
`"place_changed"`, the C1 barrel lines). Result: `bun test` 142 pass, 0 fail;
`tsc --noEmit` reports no error in the harness files; `biome check` reports
only import-order and `import type` findings that `mise lint:fix` fixes.
The real F5a fixture and A3 views may differ from the stubs; the L3b, L9b,
L14 and L10b tests depend on them.

**Rules for every task (from `contract.md` 0.1, AGENTS.md, typescript-style):**

- Work in an Orca child worktree of `/home/deity/orca/workspaces/tuicraft/pi-epic`
  (branch `epic/pi-harness`); merge back into `epic/pi-harness`. Never merge PR #367.
- `type` only, no comments, no `biome-ignore`, no `mock.module`, files at most
  500 non-blank lines, `function` for named exports, one object argument when
  a list would wrap. Harness imports: `@tuicraft/core`, `@tuicraft/core/lib/*`
  (five helpers), `@tuicraft/core/test-support/{mock-handle,must,temp-paths}`,
  `@earendil-works/*`, `#harness/*`, `#test-support/*`.
- `biome.json` turns on `useSortedKeys` for harness code. The code below has
  sorted keys; if `mise lint` still reports an assist or a shorthand fix, run
  `mise lint:fix` and keep its change.
- Before each commit: run `mise format:fix`; then the task's test passes,
  `bun run tsc --noEmit -p packages/harness` exits 0, and `mise lint` exits 0. `git add` the exact paths, then commit with
  `mise exec -- git commit` in a separate command.
- Commit messages: the subject is at most 50 characters; body lines are at
  most 72 characters (the `hk` commit-msg hook checks both; never set
  `HK=0`). Each Step 5 gives the message as a heredoc. `feat:` marks the
  harness runtime (the product on this branch); the `eval/` tasks use
  `chore:` because they are grader infrastructure.

## Contract issues

The contract is not changed. Each item says how this plan works around it.

1. **Build order.** `events/router.ts` (L5) imports the translators of L6–L8
   and `WakeGuard` from L9, but section 4.1 makes L6–L9 need L5. Plan: L5a
   creates `rules-chat.ts`, `rules-combat.ts`, `rules-world.ts` and
   `rules-world-quest.ts` with every contract-named export returning `[]`, and
   ownership passes to L6, L7, L8a, L8b (the A1 stub pattern). L9 splits:
   **L9a** (`guard.ts`: `WakeGuard`, constants, `createWakeGuard`) goes before
   L5b; **L9b** (`delivery.ts`, `createStuckWatch`) goes after L5b and A9.
2. **`run/*` rows twice.** 2.9 says the registry appends `run/*` rows; 2.11
   says the router turns `runs.subscribe` events into drafts and appends them.
   Plan: the router is the only appender (through `runDrafts`); the registry
   writes only `runs.jsonl` and emits events. Reason: only the router passes a
   row through the wake guard and the sink, and an unawaited `run/ended` must
   reach the model. `createRunRegistry` keeps `log` in its init type and does
   not read it.
3. **Stateful rules.** "life change only", the low-health re-arm at +10
   points, the aura gain/fade diff, `money/change` before/after and the cycle
   state need memory, and `life/dead.killer`, item names and quest titles need
   the handle. `RuleContext` has neither. Plan: translators take
   `RuleInput = RuleContext & { lookup: RuleLookup; memo: RuleMemo }`
   (`events/rules.ts`, L5a). `RouterInit.context` stays `() => RuleContext`,
   so F6b is not affected. The router owns `memo` (new at each attach) and
   builds `lookup` from the handle and `attacks`. Translators never call the
   handle; they call `lookup`, which tests stub.
4. **No log event for a guild invite or a trade.** C.1 wakes on both;
   `LogEvent` and `Domain` have no guild or trade entry, and core has no trade
   hook. Plan: the router subscribes `onGuildEvent` with zero rows. The
   coordinator decides whether F2 adds `social/guild_invite`; until then no
   guild invite wake exists. `onFriendEvent`, `onIgnoreEvent`,
   `onRemoteMotionEvent`, `onDestroyEvent` and `onDefenseEvent` are also
   subscribed with zero rows (volume, design D.1).
5. **`WakeGuard.admit` input.** The router must know the final class before
   `append` (the row is written with it). Plan: `admit` takes
   `WakeCandidate = Pick<GameLogEntry, "class" | "data" | "event">`. Every
   `GameLogEntry` still fits, so the contract type is satisfied.
6. **`createDelivery` return.** C.1 adds passive lines after `[now]` when a
   human message starts a run; the contract return type has no way to take
   them. Plan: `Delivery = DeliverySink & { flush; takePassive }`. Delivery
   also holds wakes while `session.agent` is not `idle` and sends them at
   `agent_end` with `deliverAs: "followUp"`, so a tool result can set
   `consumedBy` first (C.2). This is the same queue position as a `followUp`.
7. **Indexes.** D.3 asks for indexes by domain, name, guid and run; `GameLog`
   exposes only `get`, `since`, `recent`. Plan: the store keeps the ring and a
   seq map; `queryLog` scans at most 5,000 rows. Per-reader cursors are
   `since(seq)`: each reader keeps its own seq, and reads never change the store.
8. **Call sites that no task names.** The router calls `sink.human` for
   `packet/error`, `session/connected`, `session/lost` and
   `session/wake_throttled`. The router's `log.subscribe` also delivers wake
   rows that other modules append (`session/lost` from F5b, the stuck wake
   from L9b). L10b calls `linkSession` at every `session_start`;
   `finalizeSession` stays with F6b.
9. **`chat/out` twice.** The router logs `chat/out` (class `log`) from the
   server echo (sender is the character, or `WHISPER_INFORM`). A12 must not
   append `chat/out` itself. The coordinator tells A12.
10. **New edges.** L3a, L3b and L5b need L1b (a real `GameLog` in tests). L13 and
    L14 need L12a (`writeJsonAtomic`). L5b needs L9a.
11. **New files.** `packages/harness/test-support/rule-fixtures.ts` (L5a) and
    `packages/harness/src/events/rules-world-quest.ts` (the `rules-world.ts`
    split, L8b) are not in section 3.2. `questDrafts` and `rewardsDrafts` live
    in `rules-world-quest.ts`, not `rules-world.ts`.
12. **D.2 fields with no source.** Aura names (no spell-name lookup for auras),
    `relation` on `entity/appear`, and `xp`/`casts` on `fight/end` are left out.
    `xp/gain.total` and `.next` come from `getExperienceState` through `lookup`.
13. **Hook count.** The brief says 20 hooks; contract 2.11 says 21 (20 plus
    `onNotice`). The plan uses 21.
14. **Cancel status.** The registry sets `cancelled` (or `interrupted` for
    `lost`) and the cancel code when its own controller aborted, whatever the
    launch returned. `done` rejections are also caught inside the registry so
    an unawaited run never raises an unhandled rejection.
15. **Run helpers.** `runLabel(record)` and `runView(record, now)` are exported
    from `runs/registry.ts` (L3a) for L5a, L14 and, if it wants, A3.

## Build order

L1a → L1b → L9a → L3a → L3b → L4a → L4b → L5a → L5b → L6 → L7 → L8a → L8b →
L2 → L9b → L11 → L12a → L12b → L13 → L14 → L10a → L10b.

| Task | Owns | Needs |
|---|---|---|
| L1a | `src/log/store.ts` (sink part) | F2 |
| L1b | `src/log/store.ts` (`createGameLog`) | L1a |
| L9a | `src/events/guard.ts` (guard part) | F2 |
| L3a | `src/runs/registry.ts` | F2, L1b |
| L3b | `src/runs/wait.ts` | L3a, F5a |
| L4a | `src/runs/adapters.ts` (`awaitGoto`) | F2, C0 |
| L4b | `src/runs/adapters.ts` (fight, cycle, `jevCode`) | L4a, C1 |
| L5a | `src/events/rules.ts`, `test-support/rule-fixtures.ts`, stubs of `rules-chat.ts`, `rules-combat.ts`, `rules-world.ts`, `rules-world-quest.ts` | L3a |
| L5b | `src/events/router.ts` | L1b, L3a, L5a, L9a |
| L6 | `src/events/rules-chat.ts` | L5b |
| L7 | `src/events/rules-combat.ts` | L5a (C5 for `attacker`) |
| L8a | `src/events/rules-world.ts` | L5a |
| L8b | `src/events/rules-world-quest.ts` | L5a |
| L2 | `src/log/query.ts` | L1b, L3a |
| L9b | `src/events/delivery.ts`, `src/events/guard.ts` (`createStuckWatch`) | L5b, A9, F5a |
| L11 | `src/events/snapshot.ts` | L1b |
| L12a | `src/eval/run-dir.ts` (dir, prune, `writeJsonAtomic`) | F3a |
| L12b | `src/eval/run-dir.ts` (meta, session link) | L12a |
| L13 | `src/eval/stats.ts` | F2, L12a |
| L14 | `src/eval/status.ts` | L3a, F5a, L12a |
| L10a | `src/events/now.ts` | F2 |
| L10b | `src/events/install.ts`, one line in `src/extension/extension.ts` | L9b, L10a, L12b, A3, F7a, F8c, F8d, A1d (lands after `installTools` in `extension.ts`) |

All paths below are relative to `/home/deity/orca/workspaces/tuicraft/pi-epic`.

---

### Task L1a: JSONL sink

**Files:**
- Create: `packages/harness/src/log/store.ts`
- Test: `packages/harness/src/log/store.test.ts`

**Interfaces:**
- Consumes: `JsonlSink` (`#harness/contract/services`, F2); `ignoreFailure`
  (`@tuicraft/core/lib/ignore-failure`).
- Produces:
  ```ts
  export const FLUSH_MS = 250;
  export type BufferedWriter = { push: (row: unknown) => void; flush: () => Promise<void> };
  export type WriterInit = { write: (text: string) => Promise<void>; flushMs: number };
  export function jsonLine(row: unknown): string;
  export function createBufferedWriter(init: WriterInit): BufferedWriter;
  export function createJsonlSink(init: { file: string | undefined; flushMs?: number }): JsonlSink;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBufferedWriter,
  createJsonlSink,
  FLUSH_MS,
  jsonLine,
} from "#harness/log/store";

function recorder() {
  const writes: string[] = [];
  const write = async (text: string) => {
    writes.push(text);
  };
  return { write, writes };
}

describe("jsonLine", () => {
  test("writes a bigint as lowercase hex", () => {
    expect(jsonLine({ guid: 0x1fn })).toBe('{"guid":"1f"}\n');
  });
});

describe("createBufferedWriter", () => {
  test("writes nothing before flushMs and one batch at flushMs", async () => {
    const { write, writes } = recorder();
    jest.useFakeTimers();
    try {
      const writer = createBufferedWriter({ flushMs: FLUSH_MS, write });
      writer.push({ a: 1 });
      jest.advanceTimersByTime(FLUSH_MS - 1);
      writer.push({ a: 2 });
      jest.advanceTimersByTime(1);
      await writer.flush();
      expect(writes).toEqual(['{"a":1}\n{"a":2}\n']);
    } finally {
      jest.useRealTimers();
    }
  });

  test("serializes a row when it flushes, so later changes reach disk", async () => {
    const { write, writes } = recorder();
    const writer = createBufferedWriter({ flushMs: FLUSH_MS, write });
    const row: Record<string, unknown> = { a: 1 };
    writer.push(row);
    row["b"] = 2;
    await writer.flush();
    expect(writes).toEqual(['{"a":1,"b":2}\n']);
  });

  test("keeps the write order across flushes", async () => {
    const { write, writes } = recorder();
    const writer = createBufferedWriter({ flushMs: FLUSH_MS, write });
    writer.push({ n: 1 });
    const first = writer.flush();
    writer.push({ n: 2 });
    await Promise.all([first, writer.flush()]);
    expect(writes).toEqual(['{"n":1}\n', '{"n":2}\n']);
  });
});

describe("createJsonlSink", () => {
  test("appends rows to the file on flush and close", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tc-harness-sink-"));
    const file = join(dir, "runs.jsonl");
    const sink = createJsonlSink({ file });
    sink.write({ id: "r1" });
    await sink.flush();
    sink.write({ id: "r2" });
    await sink.close();
    expect(await readFile(file, "utf8")).toBe('{"id":"r1"}\n{"id":"r2"}\n');
  });

  test("keeps nothing when there is no file", async () => {
    const sink = createJsonlSink({ file: undefined });
    sink.write({ id: "r1" });
    await expect(sink.flush()).resolves.toBeUndefined();
    await expect(sink.close()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/log/store.test.ts`
Expected: FAIL with `Cannot find module "#harness/log/store"`.

- [ ] **Step 3: Implement**

```ts
import { appendFile } from "node:fs/promises";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { JsonlSink } from "#harness/contract/services";

export const FLUSH_MS = 250;

export type BufferedWriter = {
  push: (row: unknown) => void;
  flush: () => Promise<void>;
};
export type WriterInit = {
  write: (text: string) => Promise<void>;
  flushMs: number;
};
type SinkInit = { file: string | undefined; flushMs?: number };

export function jsonLine(row: unknown): string {
  return `${JSON.stringify(row, bigintHex)}\n`;
}

function bigintHex(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString(16) : value;
}

export function createBufferedWriter({
  write,
  flushMs,
}: WriterInit): BufferedWriter {
  let pending: unknown[] = [];
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drain = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (pending.length === 0) return chain;
    const rows = pending;
    pending = [];
    chain = chain.then(() => write(rows.map(jsonLine).join("")));
    return chain;
  };
  return {
    flush: drain,
    push(row) {
      pending.push(row);
      timer ??= setTimeout(drain, flushMs);
    },
  };
}

function settled(): Promise<void> {
  return Promise.resolve();
}

export function createJsonlSink({
  file,
  flushMs = FLUSH_MS,
}: SinkInit): JsonlSink {
  if (file === undefined)
    return { close: settled, flush: settled, write: ignoreFailure };
  const writer = createBufferedWriter({
    flushMs,
    write: (text) => appendFile(file, text),
  });
  return { close: writer.flush, flush: writer.flush, write: writer.push };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/log/store.test.ts` → PASS (6 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/log/store.ts packages/harness/src/log/store.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness JSONL sink

The game log, runs.jsonl and jev.jsonl need one buffered writer that
serializes rows at flush time.
EOF
```

---

### Task L1b: Game log store

**Files:**
- Modify: `packages/harness/src/log/store.ts`
- Test: `packages/harness/src/log/store.test.ts`

**Interfaces:**
- Consumes: `GameLogEntry`, `LogDraft` (`#harness/contract/log`); `Clock`,
  `GameLog` (`#harness/contract/services`); `createJsonlSink`, `FLUSH_MS` (L1a).
- Produces:
  ```ts
  export const LOG_CAPACITY = 5000;
  export function createGameLog(init: { file: string | undefined; char: () => string; clock: Clock; capacity?: number; flushMs?: number }): GameLog;
  ```

- [ ] **Step 1: Write the failing test** (add to `store.test.ts`; merge the
  import lines with the ones from L1a)

```ts
import type { LogDraft } from "#harness/contract/log";
import { createGameLog } from "#harness/log/store";

function draft(text: string): LogDraft {
  return { class: "log", data: {}, domain: "chat", event: "chat/in", text };
}

function memoryLog(capacity?: number) {
  let now = 1000;
  const log = createGameLog({
    capacity,
    char: () => "Fgk",
    clock: { now: () => now },
    file: undefined,
  });
  return { log, tick: (ms: number) => { now += ms; } };
}

describe("createGameLog", () => {
  test("stamps v, seq, ts and char on each row", () => {
    const { log, tick } = memoryLog();
    log.append(draft("a"));
    tick(5);
    expect(log.append(draft("b"))).toEqual({
      char: "Fgk",
      class: "log",
      data: {},
      domain: "chat",
      event: "chat/in",
      seq: 2,
      text: "b",
      ts: 1005,
      v: 1,
    });
  });

  test("keeps a draft's own ts", () => {
    const { log } = memoryLog();
    expect(log.append({ ...draft("a"), ts: 42 }).ts).toBe(42);
  });

  test("drops the oldest rows past the capacity", () => {
    const { log } = memoryLog(3);
    for (const text of ["a", "b", "c", "d", "e"]) log.append(draft(text));
    expect(log.count()).toBe(3);
    expect(log.lastSeq()).toBe(5);
    expect(log.get(2)).toBeUndefined();
    expect(log.since(0).map((row) => row.seq)).toEqual([3, 4, 5]);
    expect(log.since(4).map((row) => row.seq)).toEqual([5]);
    expect(log.recent(2).map((row) => row.seq)).toEqual([4, 5]);
    expect(log.recent(0)).toEqual([]);
  });

  test("gives each reader its own cursor; reads change nothing", () => {
    const { log } = memoryLog();
    log.append(draft("a"));
    log.append(draft("b"));
    const agent = log.since(0);
    const panel = log.since(1);
    expect(agent.map((row) => row.text)).toEqual(["a", "b"]);
    expect(panel.map((row) => row.text)).toEqual(["b"]);
    expect(log.since(0)).toHaveLength(2);
  });

  test("mark patches the stored row", () => {
    const { log } = memoryLog();
    log.append(draft("a"));
    log.mark(1, { consumedBy: "call-1", delivered: false });
    expect(log.get(1)).toMatchObject({ consumedBy: "call-1", delivered: false });
    log.mark(9, { consumedBy: "call-2" });
    expect(log.get(9)).toBeUndefined();
  });

  test("calls subscribers until they unsubscribe", () => {
    const { log } = memoryLog();
    const seen: number[] = [];
    const off = log.subscribe((entry) => seen.push(entry.seq));
    log.append(draft("a"));
    off();
    log.append(draft("b"));
    expect(seen).toEqual([1]);
  });

  test("writes rows to the file with marks made before the flush", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tc-harness-log-"));
    const file = join(dir, "gamelog.jsonl");
    const log = createGameLog({ char: () => "Fgk", clock: { now: () => 7 }, file });
    log.append(draft("a"));
    log.mark(1, { consumedBy: "call-1" });
    await log.flush();
    const [line] = (await readFile(file, "utf8")).trim().split("\n");
    expect(JSON.parse(line ?? "{}")).toMatchObject({ consumedBy: "call-1", seq: 1, text: "a", v: 1 });
    await log.close();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/log/store.test.ts`
Expected: FAIL with `Export named 'createGameLog' not found in module`.

- [ ] **Step 3: Implement** (add to `store.ts`; add the two type imports)

```ts
import type { GameLogEntry, LogDraft } from "#harness/contract/log";
import type { Clock, GameLog } from "#harness/contract/services";

export const LOG_CAPACITY = 5000;

type LogInit = {
  file: string | undefined;
  char: () => string;
  clock: Clock;
  capacity?: number;
  flushMs?: number;
};

export function createGameLog({
  file,
  char,
  clock,
  capacity = LOG_CAPACITY,
  flushMs = FLUSH_MS,
}: LogInit): GameLog {
  const ring: GameLogEntry[] = [];
  const bySeq = new Map<number, GameLogEntry>();
  const listeners = new Set<(entry: GameLogEntry) => void>();
  const sink = createJsonlSink({ file, flushMs });
  let last = 0;
  const keep = (entry: GameLogEntry) => {
    ring.push(entry);
    bySeq.set(entry.seq, entry);
    if (ring.length <= capacity) return;
    const old = ring.shift();
    if (old) bySeq.delete(old.seq);
  };
  const stamp = ({ ts, ...rest }: LogDraft): GameLogEntry => {
    last += 1;
    return { char: char(), seq: last, ts: ts ?? clock.now(), v: 1, ...rest };
  };
  return {
    append(draft) {
      const entry = stamp(draft);
      keep(entry);
      sink.write(entry);
      for (const cb of listeners) cb(entry);
      return entry;
    },
    close: () => sink.close(),
    count: () => ring.length,
    flush: () => sink.flush(),
    get: (seq) => bySeq.get(seq),
    lastSeq: () => last,
    mark(seq, patch) {
      const entry = bySeq.get(seq);
      if (entry) Object.assign(entry, patch);
    },
    recent: (n) => (n > 0 ? ring.slice(-n) : []),
    since(seq) {
      const first = ring[0]?.seq ?? last + 1;
      return ring.slice(Math.max(0, seq + 1 - first));
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/log/store.test.ts` → PASS (13 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/log/store.ts packages/harness/src/log/store.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness game log store

Every reader keeps its own seq cursor over a 5,000-row ring (design
D.3), so reads never drain the log.
EOF
```

---
### Task L9a: Wake guard

**Files:**
- Create: `packages/harness/src/events/guard.ts`
- Test: `packages/harness/src/events/guard.test.ts`

**Interfaces:**
- Consumes: `GameLogEntry`, `LogClass` (`#harness/contract/log`); `Clock`
  (`#harness/contract/services`).
- Produces:
  ```ts
  export type WakeCandidate = Pick<GameLogEntry, "class" | "data" | "event">;
  export type WakeGuard = { admit: (entry: WakeCandidate) => LogClass };
  export const WAKE_MIN_GAP_MS = 5000;
  export const WAKE_PER_MINUTE = 6;
  export const WAKE_BURST = 3;
  export const SENDER_GAP_MS = 20_000;
  export const SENDER_JOIN_MS = 2000;
  export const ATTACKER_GAP_MS = 30_000;
  export const STUCK_WAKE_MS = 300_000;
  export function createWakeGuard(clock: Clock): WakeGuard;
  ```

Rules (design C.1, C.5): a non-wake class passes through. A wake with a
sender (`data.sender`, `data.from`) or an attacker (`data.attacker`) is keyed
per event and sender. The same sender within 2 s joins the open wake (stays
`wake`, spends no token); within 20 s it becomes `passive`. The same attacker
within 30 s becomes `log` (C.1 "once per attacker per 30 s"). Every other wake
spends a token from a bucket of 3 that refills at 6 per minute; no token →
`passive` (the router then logs `session/wake_throttled`). The 5 s global gap
is applied by delivery (L9b), which joins wakes that come inside it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  ATTACKER_GAP_MS,
  createWakeGuard,
  SENDER_GAP_MS,
  SENDER_JOIN_MS,
  type WakeCandidate,
} from "#harness/events/guard";

function clockAt(start = 0) {
  let now = start;
  return { clock: { now: () => now }, tick: (ms: number) => { now += ms; } };
}

const runEnd: WakeCandidate = { class: "wake", data: {}, event: "run/ended" };

function whisper(sender: string): WakeCandidate {
  return { class: "wake", data: { sender }, event: "chat/in" };
}

function attacked(attacker: string): WakeCandidate {
  return { class: "wake", data: { attacker }, event: "combat/attacked" };
}

describe("createWakeGuard", () => {
  test("passes passive and log rows through", () => {
    const guard = createWakeGuard(clockAt().clock);
    expect(guard.admit({ ...runEnd, class: "passive" })).toBe("passive");
    expect(guard.admit({ ...runEnd, class: "log" })).toBe("log");
  });

  test("admits a burst of 3 wakes, then makes wakes passive", () => {
    const guard = createWakeGuard(clockAt().clock);
    const classes = [1, 2, 3, 4].map(() => guard.admit(runEnd));
    expect(classes).toEqual(["wake", "wake", "wake", "passive"]);
  });

  test("refills 6 wakes a minute", () => {
    const { clock, tick } = clockAt();
    const guard = createWakeGuard(clock);
    for (const _ of [1, 2, 3]) guard.admit(runEnd);
    tick(10_000);
    expect(guard.admit(runEnd)).toBe("wake");
    expect(guard.admit(runEnd)).toBe("passive");
  });

  test("joins lines from one sender inside 2 s, then holds them for 20 s", () => {
    const { clock, tick } = clockAt();
    const guard = createWakeGuard(clock);
    expect(guard.admit(whisper("Kaelyn"))).toBe("wake");
    tick(SENDER_JOIN_MS - 1);
    expect(guard.admit(whisper("Kaelyn"))).toBe("wake");
    tick(1);
    expect(guard.admit(whisper("Kaelyn"))).toBe("passive");
    expect(guard.admit(whisper("Bob"))).toBe("wake");
    tick(SENDER_GAP_MS);
    expect(guard.admit(whisper("Kaelyn"))).toBe("wake");
  });

  test("wakes once per attacker per 30 s", () => {
    const { clock, tick } = clockAt();
    const guard = createWakeGuard(clock);
    expect(guard.admit(attacked("2a"))).toBe("wake");
    tick(1000);
    expect(guard.admit(attacked("2a"))).toBe("log");
    expect(guard.admit(attacked("2b"))).toBe("wake");
    tick(ATTACKER_GAP_MS);
    expect(guard.admit(attacked("2a"))).toBe("wake");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/guard.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/guard"`.

- [ ] **Step 3: Implement**

```ts
import type { GameLogEntry, LogClass } from "#harness/contract/log";
import type { Clock } from "#harness/contract/services";

export type WakeCandidate = Pick<GameLogEntry, "class" | "data" | "event">;
export type WakeGuard = { admit: (entry: WakeCandidate) => LogClass };

export const WAKE_MIN_GAP_MS = 5000;
export const WAKE_PER_MINUTE = 6;
export const WAKE_BURST = 3;
export const SENDER_GAP_MS = 20_000;
export const SENDER_JOIN_MS = 2000;
export const ATTACKER_GAP_MS = 30_000;
export const STUCK_WAKE_MS = 300_000;

const ATTACKED = "combat/attacked";

type HeldInit = { entry: WakeCandidate; now: number; since: number | undefined };

function createBucket(start: number) {
  let tokens = WAKE_BURST;
  let at = start;
  return {
    take(now: number): boolean {
      const refill = ((now - at) * WAKE_PER_MINUTE) / 60_000;
      tokens = Math.min(WAKE_BURST, tokens + refill);
      at = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

function senderKey({ data, event }: WakeCandidate): string | undefined {
  const who = data["sender"] ?? data["from"] ?? data["attacker"];
  if (typeof who === "string") return `${event}:${who}`;
  return event === ATTACKED ? event : undefined;
}

function heldClass({ entry, now, since }: HeldInit): LogClass | undefined {
  if (since === undefined) return undefined;
  const attack = entry.event === ATTACKED;
  if (!attack && now - since < SENDER_JOIN_MS) return "wake";
  if (now - since >= (attack ? ATTACKER_GAP_MS : SENDER_GAP_MS)) return undefined;
  return attack ? "log" : "passive";
}

export function createWakeGuard(clock: Clock): WakeGuard {
  const bucket = createBucket(clock.now());
  const senders = new Map<string, number>();
  return {
    admit(entry) {
      if (entry.class !== "wake") return entry.class;
      const now = clock.now();
      const key = senderKey(entry);
      const since = key === undefined ? undefined : senders.get(key);
      const held = heldClass({ entry, now, since });
      if (held !== undefined) return held;
      if (!bucket.take(now)) return "passive";
      if (key !== undefined) senders.set(key, now);
      return "wake";
    },
  };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/guard.test.ts` → PASS (5 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/guard.ts packages/harness/src/events/guard.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness wake guard

Design C.5 caps wakes at a burst of 3 and 6 a minute, with per-sender
and per-attacker gaps.
EOF
```

---

### Task L3a: Run registry

**Files:**
- Create: `packages/harness/src/runs/registry.ts`
- Test: `packages/harness/src/runs/registry.test.ts`

**Interfaces:**
- Consumes: `RunEnd`, `RunEvent`, `RunHandle`, `RunRecord`, `RunRegistry`,
  `RunStart`, `StopCause` (`#harness/contract/runs`); `Clock`, `GameLog`,
  `JsonlSink` (`#harness/contract/services`); `RunView`
  (`#harness/contract/views`); `Refusal` (`#harness/ops/refusal`);
  `messageOf`, `ignoreFailure`; `createGameLog`, `createJsonlSink` (L1, tests).
- Produces:
  ```ts
  export const CANCEL_CODES: Record<StopCause, string>;
  export function runLabel(record: Pick<RunRecord, "kind" | "args">): string;
  export function runView(record: RunRecord, now: number): RunView;
  export function createRunRegistry(init: { clock: Clock; log: GameLog; sink: JsonlSink }): RunRegistry;
  ```

Rules: ids `r1`, `r2`, … per process. One run at a time: `start` throws
`Refusal` `busy` (contract 2.9). `cancel` aborts with `new Error(<code>)`; the
registry then records `cancelled` (`interrupted` for `lost`) with the code as
`reason`, whatever the launch returns (contract issue 14). A rejecting launch
records `failed` and `done` rejects. One `runs.jsonl` row per run at its end.
The registry does not append game log rows (contract issue 2).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { RunEnd, RunEvent } from "#harness/contract/runs";
import type { JsonlSink } from "#harness/contract/services";
import { createGameLog } from "#harness/log/store";
import { Refusal } from "#harness/ops/refusal";
import { createRunRegistry, runLabel, runView } from "#harness/runs/registry";

function setup() {
  let now = 100;
  const clock = { now: () => now };
  const rows: unknown[] = [];
  const sink: JsonlSink = {
    close: async () => {},
    flush: async () => {},
    write: (row) => {
      rows.push(row);
    },
  };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink });
  return { log, rows, runs, tick: (ms: number) => { now += ms; } };
}

function succeeded(summary: string): RunEnd<number> {
  return { status: "succeeded", summary, value: 1 };
}

function waitForAbort() {
  return ({ signal }: { signal: AbortSignal }) =>
    new Promise<RunEnd<number>>((resolve) => {
      signal.addEventListener("abort", () =>
        resolve({ reason: messageOf(signal.reason), status: "cancelled", summary: "stopped", value: 0 }),
      );
    });
}

describe("createRunRegistry", () => {
  test("gives ids r1, r2 and records the end", async () => {
    const { rows, runs, tick } = setup();
    const first = runs.start({ args: { to: "u4" }, kind: "travel", launch: async () => succeeded("arrived"), toolCallId: "c1" });
    expect(first.id).toBe("r1");
    tick(50);
    await first.done;
    const second = runs.start({ args: {}, kind: "rest", launch: async () => succeeded("rested"), toolCallId: undefined });
    await second.done;
    expect(second.id).toBe("r2");
    expect(runs.get("r1")).toMatchObject({ endedAt: 150, startedAt: 100, status: "succeeded", summary: "arrived" });
    expect(rows).toEqual([
      { args: { to: "u4" }, endedAt: 150, id: "r1", kind: "travel", reason: undefined, startedAt: 100, status: "succeeded", summary: "arrived" },
      { args: {}, endedAt: 150, id: "r2", kind: "rest", reason: undefined, startedAt: 150, status: "succeeded", summary: "rested" },
    ]);
    expect(runs.list().map((run) => run.id)).toEqual(["r1", "r2"]);
  });

  test("refuses a second run while one is active", () => {
    const { runs } = setup();
    runs.start({ args: {}, kind: "engage", launch: waitForAbort(), toolCallId: "c1" });
    const second = () => runs.start({ args: {}, kind: "travel", launch: waitForAbort(), toolCallId: "c2" });
    expect(second).toThrow(Refusal);
    try {
      second();
    } catch (error) {
      expect(error).toMatchObject({ detail: "r1 (engage) is still running.", next: 'stop(run: "r1")', reason: "busy" });
    }
  });

  test("emits started, progress and ended", async () => {
    const { runs } = setup();
    const events: RunEvent[] = [];
    runs.subscribe((event) => events.push(event));
    const run = runs.start({
      args: {},
      kind: "engage",
      launch: async ({ progress }) => {
        progress("1 of 3 kills");
        return succeeded("3 kills");
      },
      toolCallId: "c1",
    });
    await run.done;
    expect(events.map((event) => [event.type, event.record.progress])).toEqual([
      ["started", undefined],
      ["progress", "1 of 3 kills"],
      ["ended", "1 of 3 kills"],
    ]);
  });

  test("cancel aborts with the cause code and records the status", async () => {
    const { runs } = setup();
    const human = runs.start({ args: {}, kind: "engage", launch: waitForAbort(), toolCallId: "c1" });
    expect(runs.cancel(human.id, "human")?.status).toBe("running");
    expect(await human.done).toMatchObject({ reason: "human_stop", status: "cancelled" });
    const lost = runs.start({ args: {}, kind: "travel", launch: waitForAbort(), toolCallId: "c2" });
    expect(runs.cancelAll("lost").map((run) => run.id)).toEqual(["r2"]);
    await lost.done;
    expect(runs.get("r2")).toMatchObject({ reason: "connection_lost", status: "interrupted" });
    expect(runs.cancel("r2", "tool")).toBeUndefined();
  });

  test("records failed and rejects done when the launch throws", async () => {
    const { runs } = setup();
    const run = runs.start({
      args: {},
      kind: "rest",
      launch: async () => {
        throw new Error("no_food");
      },
      toolCallId: "c1",
    });
    await expect(run.done).rejects.toThrow("no_food");
    expect(runs.get(run.id)).toMatchObject({ reason: "no_food", status: "failed" });
    expect(runs.active()).toBeUndefined();
  });

  test("release marks a run as not awaited", () => {
    const { runs } = setup();
    const run = runs.start({ args: {}, kind: "engage", launch: waitForAbort(), toolCallId: "c1" });
    expect(runs.active()?.awaited).toBe(true);
    runs.release(run.id);
    expect(runs.get(run.id)?.awaited).toBe(false);
  });

  test("runLabel and runView describe a record", () => {
    const { runs } = setup();
    runs.start({ args: { count: 3, target: "u9" }, kind: "engage", launch: waitForAbort(), toolCallId: "c1" });
    const record = runs.get("r1");
    expect(record && runLabel(record)).toBe("engage 3 u9");
    expect(record && runView(record, 1100)).toEqual({ elapsedMs: 1000, id: "r1", kind: "engage", label: "engage 3 u9", progress: undefined });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runs/registry.test.ts`
Expected: FAIL with `Cannot find module "#harness/runs/registry"`.

- [ ] **Step 3: Implement**

```ts
import { messageOf } from "@tuicraft/core/lib/errors";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type {
  RunEnd,
  RunEvent,
  RunHandle,
  RunRecord,
  RunRegistry,
  RunStart,
  RunStatus,
  StopCause,
} from "#harness/contract/runs";
import type { Clock, GameLog, JsonlSink } from "#harness/contract/services";
import type { RunView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";

export const CANCEL_CODES: Record<StopCause, string> = {
  esc: "esc",
  human: "human_stop",
  lost: "connection_lost",
  quit: "quit",
  tool: "stopped_by_tool",
};

type RegistryInit = { clock: Clock; log: GameLog; sink: JsonlSink };
type Live = { cause: StopCause | undefined; controller: AbortController; record: RunRecord };

export function runLabel({ kind, args }: Pick<RunRecord, "kind" | "args">): string {
  const words = Object.values(args).filter((value) => value !== undefined).map(String);
  return [kind, ...words].join(" ");
}

export function runView(record: RunRecord, now: number): RunView {
  const { id, kind, progress, startedAt } = record;
  return { elapsedMs: now - startedAt, id, kind, label: runLabel(record), progress };
}

function cancelStatus(cause: StopCause): Exclude<RunStatus, "running"> {
  return cause === "lost" ? "interrupted" : "cancelled";
}

function busyRefusal({ id, kind }: RunRecord): Refusal {
  return new Refusal({ detail: `${id} (${kind}) is still running.`, next: `stop(run: "${id}")`, reason: "busy" });
}

function runRow({ args, endedAt, id, kind, reason, startedAt, status, summary }: RunRecord) {
  return { args, endedAt, id, kind, reason, startedAt, status, summary };
}

function failure(error: unknown): RunEnd<undefined> {
  const message = messageOf(error);
  return { reason: message, status: "failed", summary: message, value: undefined };
}

export function createRunRegistry({ clock, sink }: RegistryInit): RunRegistry {
  const runs = new Map<string, Live>();
  const listeners = new Set<(event: RunEvent) => void>();
  let next = 0;
  const emit = (type: RunEvent["type"], record: RunRecord) => {
    for (const cb of listeners) cb({ record: { ...record }, type });
  };
  const running = () => [...runs.values()].filter((live) => live.record.status === "running");
  const settle = <R>(live: Live, end: RunEnd<R>): RunEnd<R> => {
    const { cause } = live;
    const final = cause === undefined ? end : { ...end, reason: CANCEL_CODES[cause], status: cancelStatus(cause) };
    Object.assign(live.record, { endedAt: clock.now(), reason: final.reason, status: final.status, summary: final.summary });
    sink.write(runRow(live.record));
    emit("ended", live.record);
    return final;
  };
  function start<R>({ args, kind, launch, toolCallId }: RunStart<R>): RunHandle<R> {
    const busy = running()[0];
    if (busy) throw busyRefusal(busy.record);
    next += 1;
    const record: RunRecord = {
      args,
      awaited: true,
      endedAt: undefined,
      id: `r${next}`,
      kind,
      progress: undefined,
      reason: undefined,
      startedAt: clock.now(),
      status: "running",
      summary: undefined,
      toolCallId,
    };
    const live: Live = { cause: undefined, controller: new AbortController(), record };
    runs.set(record.id, live);
    emit("started", record);
    const progress = (text: string) => {
      record.progress = text;
      emit("progress", record);
    };
    const { signal } = live.controller;
    const done = launch({ progress, signal }).then(
      (end) => settle(live, end),
      (error: unknown) => {
        settle(live, failure(error));
        throw error;
      },
    );
    done.catch(ignoreFailure);
    return { done, id: record.id, signal };
  }
  function cancel(id: string, cause: StopCause): RunRecord | undefined {
    const live = runs.get(id);
    if (!live || live.record.status !== "running") return;
    live.cause ??= cause;
    live.controller.abort(new Error(CANCEL_CODES[cause]));
    return { ...live.record };
  }
  return {
    active: () => {
      const live = running()[0];
      return live && { ...live.record };
    },
    cancel,
    cancelAll: (cause) => running().flatMap((live) => cancel(live.record.id, cause) ?? []),
    get: (id) => {
      const live = runs.get(id);
      return live && { ...live.record };
    },
    list: () => [...runs.values()].map((live) => ({ ...live.record })),
    release(id) {
      const live = runs.get(id);
      if (live) live.record.awaited = false;
    },
    start,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/runs/registry.test.ts` → PASS (7 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.
If `noExcessiveLinesPerFunction` flags `createRunRegistry`, move `start` to a
top-level `function startRun<R>(state: RegistryState, init: RunStart<R>)` with
`type RegistryState = { runs; emit; settle; clock; next: () => string }` in the
same file; the test does not change.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runs/registry.ts packages/harness/src/runs/registry.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness run registry

Runs get short r<n> ids, one at a time, with cancel codes and one
runs.jsonl row each (design H.6).
EOF
```

---

### Task L3b: Run wait with yields

**Files:**
- Create: `packages/harness/src/runs/wait.ts`
- Test: `packages/harness/src/runs/wait.test.ts`

**Interfaces:**
- Consumes: `RunHandle`, `RunWait` (`#harness/contract/runs`); `HarnessRuntime`
  (`#harness/contract/services`); `createRunRegistry` (L3a);
  `createTestRuntime` (`#test-support/runtime-fixture`, F5a).
- Produces:
  ```ts
  export const YIELD_AFTER_MS = 120_000;
  export function awaitRun<R>(init: { rt: HarnessRuntime; run: RunHandle<R>; yieldAfterMs?: number }): Promise<RunWait<R>>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import type { RunEnd } from "#harness/contract/runs";
import type { YieldGate } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { awaitRun } from "#harness/runs/wait";
import { createTestRuntime } from "#test-support/runtime-fixture";

function gate(): YieldGate {
  let fire = () => {};
  return {
    trigger: () => fire(),
    wait: () =>
      new Promise<"human">((resolve) => {
        fire = () => resolve("human");
      }),
  };
}

async function setup() {
  const clock = { now: () => 0 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const yields = gate();
  const { rt } = await createTestRuntime({ parts: { runs, yields } });
  return { rt, runs, yields };
}

const never = () => new Promise<RunEnd<number>>(() => {});

describe("awaitRun", () => {
  test("returns the run end when the run ends first", async () => {
    const { rt, runs } = await setup();
    const run = runs.start({ args: {}, kind: "rest", launch: async () => ({ status: "succeeded", summary: "rested", value: 90 }), toolCallId: "c1" });
    expect(await awaitRun({ rt, run })).toEqual({ end: { status: "succeeded", summary: "rested", value: 90 }, kind: "ended" });
    expect(runs.get(run.id)?.awaited).toBe(true);
  });

  test("yields to the human and releases the run", async () => {
    const { rt, runs, yields } = await setup();
    const run = runs.start({ args: {}, kind: "engage", launch: never, toolCallId: "c1" });
    const waiting = awaitRun({ rt, run });
    yields.trigger();
    expect(await waiting).toEqual({ kind: "yielded", why: "human" });
    expect(runs.get(run.id)?.awaited).toBe(false);
  });

  test("yields after yieldAfterMs", async () => {
    const { rt, runs } = await setup();
    const run = runs.start({ args: {}, kind: "engage", launch: never, toolCallId: "c1" });
    jest.useFakeTimers();
    try {
      const waiting = awaitRun({ rt, run, yieldAfterMs: 1000 });
      jest.advanceTimersByTime(1000);
      expect(await waiting).toEqual({ kind: "yielded", why: "timeout" });
      expect(runs.get(run.id)?.awaited).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runs/wait.test.ts`
Expected: FAIL with `Cannot find module "#harness/runs/wait"`.

- [ ] **Step 3: Implement**

```ts
import type { RunHandle, RunWait } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";

export const YIELD_AFTER_MS = 120_000;

type AwaitInit<R> = { rt: HarnessRuntime; run: RunHandle<R>; yieldAfterMs?: number };

export async function awaitRun<R>({ rt, run, yieldAfterMs = YIELD_AFTER_MS }: AwaitInit<R>): Promise<RunWait<R>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RunWait<R>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "yielded", why: "timeout" }), yieldAfterMs);
  });
  const human = rt.yields.wait().then((): RunWait<R> => ({ kind: "yielded", why: "human" }));
  const ended = run.done.then((end): RunWait<R> => ({ end, kind: "ended" }));
  const outcome = await Promise.race([ended, human, timeout]).finally(() => clearTimeout(timer));
  if (outcome.kind === "yielded") rt.runs.release(run.id);
  return outcome;
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/runs/wait.test.ts` → PASS (3 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runs/wait.ts packages/harness/src/runs/wait.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness run wait with yields

Run tools block until the run ends and yield only for a human message or
after 120 s (design A.3).
EOF
```

---
### Task L4a: Goto adapter

**Files:**
- Create: `packages/harness/src/runs/adapters.ts`
- Test: `packages/harness/src/runs/adapters.test.ts`

**Interfaces:**
- Consumes: `WorldHandle`, `GotoTarget`, `ControlPose`, `NavigationState`,
  `nextStepFor` (`@tuicraft/core`); `messageOf`; `createMockHandle`
  (`@tuicraft/core/test-support/mock-handle`, tests).
- Produces:
  ```ts
  export type GotoEnd = {
    status: "arrived" | "refused" | "stopped";
    refusal: string | undefined;
    floors: number[] | undefined;
    nextStep: string | undefined;
    traveledYd: number;
    pose: ControlPose | undefined;
  };
  export const GOTO_POLL_MS = 500;
  export function rawRefusal(message: string): string;
  export function awaitGoto(handle: WorldHandle, init: { target: GotoTarget; signal: AbortSignal; pollMs?: number }): Promise<GotoEnd>;
  ```

Facts (read, `client-control.ts:165-183`, `control-drive.ts:300-325`):
`goTo` throws `<category>: <raw>` synchronously, where the category is
`wait`, `pick_destination`, `unreachable` or `stop`, and writes `refusal`
and `floors` into the navigation state before it throws. A route ends with
`active: false` and `blockedReason` undefined on arrival, or the raw reason
otherwise. A replannable end keeps `replan.pending: true` while core plans
again, so the adapter waits until `pending` is false. `GotoEnd.refusal` is
always the raw text, because B1's `refusalCode` matches raw strings. The
navigation track (G8, N1) may change goTo internals; this adapter reads only
the public `NavigationState`, so it does not change.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import { type ControlPose, type NavigationState, nextStepFor } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { awaitGoto, rawRefusal } from "#harness/runs/adapters";

const target = { kind: "point" as const, x: 10, y: 0 };
const idle: NavigationState = {
  active: false,
  blockedReason: undefined,
  destination: undefined,
  owner: "none",
  refusal: undefined,
  remaining: undefined,
};

function pose(x: number): ControlPose {
  return { mapId: 530, orientation: 0, source: "server", updatedAt: 0, x, y: 0, z: 0 };
}

function movingHandle() {
  const handle = createMockHandle();
  const base = handle.getControlState();
  let nav: NavigationState = idle;
  let at = pose(0);
  handle.getNavigationState = () => nav;
  handle.getControlState = () => ({ ...base, pose: at });
  handle.goTo = jest.fn(() => {
    nav = { ...idle, active: true, owner: "none" };
  });
  const stop = (next: NavigationState, x: number) => {
    nav = next;
    at = pose(x);
    handle.triggerControlEvent({ state: handle.getControlState(), type: "movement_stopped" });
  };
  const set = (next: NavigationState) => {
    nav = next;
  };
  return { handle, set, stop };
}

describe("rawRefusal", () => {
  test("strips a navigation category and keeps other text", () => {
    expect(rawRefusal("unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)")).toBe("pathfind_find_height failed (UNKNOWN_HEIGHT)");
    expect(rawRefusal("World socket is not connected")).toBe("World socket is not connected");
    expect(rawRefusal("no_pose: x")).toBe("no_pose: x");
  });
});

describe("awaitGoto", () => {
  test("returns refused with floors when goTo throws", async () => {
    const handle = createMockHandle();
    const raw = "ambiguous ground column at destination";
    handle.goTo = jest.fn(() => {
      throw new Error(`pick_destination: ${raw}`);
    });
    handle.getNavigationState = () => ({ ...idle, floors: [72.5, 80.1], refusal: "pick_destination" });
    const end = await awaitGoto(handle, { signal: new AbortController().signal, target });
    expect(end).toEqual({
      floors: [72.5, 80.1],
      nextStep: nextStepFor(raw) ?? undefined,
      pose: undefined,
      refusal: raw,
      status: "refused",
      traveledYd: 0,
    });
  });

  test("returns arrived on movement_stopped with no blocked reason", async () => {
    const { handle, stop } = movingHandle();
    const waiting = awaitGoto(handle, { signal: new AbortController().signal, target });
    stop(idle, 10);
    expect(await waiting).toMatchObject({ refusal: undefined, status: "arrived", traveledYd: 10 });
  });

  test("returns refused with the raw reason when the route ends blocked", async () => {
    const { handle, stop } = movingHandle();
    const waiting = awaitGoto(handle, { signal: new AbortController().signal, target });
    stop({ ...idle, blockedReason: "obstructed", refusal: "pick_destination" }, 4);
    expect(await waiting).toMatchObject({ nextStep: nextStepFor("obstructed") ?? undefined, refusal: "obstructed", status: "refused", traveledYd: 4 });
  });

  test("waits while a replan is pending, then polls the end", async () => {
    const { handle, set, stop } = movingHandle();
    const replan = { elapsedMs: 0, interruptions: [], limits: { displacement: 0, elapsedMs: 0, plans: 0, traveled: 0 }, pending: true, plans: 1, traveled: 3 };
    jest.useFakeTimers();
    try {
      let ended = false;
      const waiting = awaitGoto(handle, { pollMs: 500, signal: new AbortController().signal, target }).then((end) => {
        ended = true;
        return end;
      });
      stop({ ...idle, blockedReason: "server_correction", replan }, 3);
      await Promise.resolve();
      expect(ended).toBe(false);
      set(idle);
      jest.advanceTimersByTime(500);
      expect((await waiting).status).toBe("arrived");
    } finally {
      jest.useRealTimers();
    }
  });

  test("halts and returns stopped on abort", async () => {
    const { handle } = movingHandle();
    const controller = new AbortController();
    const waiting = awaitGoto(handle, { signal: controller.signal, target });
    controller.abort(new Error("esc"));
    expect((await waiting).status).toBe("stopped");
    expect(handle.halt).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runs/adapters.test.ts`
Expected: FAIL with `Cannot find module "#harness/runs/adapters"`.

- [ ] **Step 3: Implement**

```ts
import {
  type ControlPose,
  type GotoTarget,
  type NavigationState,
  nextStepFor,
  type WorldHandle,
} from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";

export type GotoEnd = {
  status: "arrived" | "refused" | "stopped";
  refusal: string | undefined;
  floors: number[] | undefined;
  nextStep: string | undefined;
  traveledYd: number;
  pose: ControlPose | undefined;
};

export const GOTO_POLL_MS = 500;

const CATEGORIES = ["wait", "pick_destination", "unreachable", "stop"];

type GotoInit = { target: GotoTarget; signal: AbortSignal; pollMs?: number };
type WaitInit = { handle: WorldHandle; signal: AbortSignal; pollMs: number };
type EndInit = {
  handle: WorldHandle;
  from: ControlPose | undefined;
  status: GotoEnd["status"];
  refusal: string | undefined;
};

export function rawRefusal(message: string): string {
  const cut = message.indexOf(": ");
  if (cut < 0 || !CATEGORIES.includes(message.slice(0, cut))) return message;
  return message.slice(cut + 2);
}

function idle(nav: NavigationState): boolean {
  return !nav.active && nav.replan?.pending !== true;
}

function travelled(from: ControlPose | undefined, to: ControlPose | undefined): number {
  if (!(from && to)) return 0;
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
}

function gotoEnd({ handle, from, status, refusal }: EndInit): GotoEnd {
  const pose = handle.getControlState().pose;
  const { floors } = handle.getNavigationState();
  const nextStep = nextStepFor(refusal) ?? undefined;
  return { floors, nextStep, pose, refusal, status, traveledYd: travelled(from, pose) };
}

function navigationEnd({ handle, signal, pollMs }: WaitInit): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (stopped: boolean) => {
      clearInterval(timer);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(stopped);
    };
    const check = () => {
      if (idle(handle.getNavigationState())) finish(false);
    };
    const onAbort = () => {
      handle.halt();
      finish(true);
    };
    const unsubscribe = handle.onControlEvent((event) => {
      if (event.type === "movement_stopped") check();
    });
    const timer = setInterval(check, pollMs);
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    check();
  });
}

export async function awaitGoto(handle: WorldHandle, { target, signal, pollMs = GOTO_POLL_MS }: GotoInit): Promise<GotoEnd> {
  const from = handle.getControlState().pose;
  try {
    handle.goTo(target);
  } catch (error) {
    return gotoEnd({ from, handle, refusal: rawRefusal(messageOf(error)), status: "refused" });
  }
  const stopped = await navigationEnd({ handle, pollMs, signal });
  const { blockedReason } = handle.getNavigationState();
  if (stopped) return gotoEnd({ from, handle, refusal: blockedReason, status: "stopped" });
  const status = blockedReason === undefined ? "arrived" : "refused";
  return gotoEnd({ from, handle, refusal: blockedReason, status });
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/runs/adapters.test.ts` → PASS (6 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runs/adapters.ts packages/harness/src/runs/adapters.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness goto run adapter

goTo has no promise, so travel legs need one end: arrival, a raw refusal
with floors, or a halt.
EOF
```

---

### Task L4b: Fight and cycle adapters

**Files:**
- Modify: `packages/harness/src/runs/adapters.ts`
- Test: `packages/harness/src/runs/adapters.test.ts`

**Interfaces:**
- Consumes: `CycleState`, `TacticsOutcome`, `TacticsEvent`, `WorldHandle`,
  `JevUnavailableError` (`@tuicraft/core`, C1 exports the last three);
  `ignoreFailure`; mock handle `triggerTacticsEvent`, `triggerCycleEvent` (C0).
- Produces:
  ```ts
  export type FightEnd = { outcome: TacticsOutcome | undefined; error: string | undefined };
  export type CycleEnd = { state: CycleState; error: string | undefined };
  export function awaitTactics(handle: WorldHandle, init: { guid: bigint; instruction: string; signal: AbortSignal }): Promise<FightEnd>;
  export function awaitCycle(handle: WorldHandle, init: { guids: bigint[]; instruction: string; maxStarts: number; signal: AbortSignal }): Promise<CycleEnd>;
  export function awaitQuestCycle(handle: WorldHandle, init: { questId: number; sources: number[]; instruction: string; maxStarts: number | undefined; signal: AbortSignal }): Promise<CycleEnd>;
  export function jevCode(end: FightEnd): string | undefined;
  ```

Facts (read): `startTactics` throws `self_not_alive` synchronously
(`client-gameplay.ts:36-40`); `TacticsLoop.start` rejects with
`JevUnavailableError` (message `jev_unavailable: <detail>`,
`jev-failure.ts:1-10`) and resolves when the fight loop ends
(`tactics.ts:151-171`). The `started` event carries `targetGuid` as
`0x<hex>` (`tactics.ts:257`). `stopped` may come without an `outcome`; then
the outcome is `state.lastOutcome`.

- [ ] **Step 1: Write the failing test** (add to `adapters.test.ts`; merge imports)

```ts
import { JevUnavailableError, type TacticsEvent } from "@tuicraft/core";
import { awaitCycle, awaitQuestCycle, awaitTactics, jevCode } from "#harness/runs/adapters";

function started(runId: string, guid: bigint): TacticsEvent {
  return { framing: "none", instruction: "fight", runId, targetGuid: `0x${guid.toString(16)}`, type: "started" };
}

describe("awaitTactics", () => {
  test("ends on the outcome of its own run", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(() => new Promise<void>(() => {}));
    const waiting = awaitTactics(handle, { guid: 0x2an, instruction: "fight", signal: new AbortController().signal });
    handle.triggerTacticsEvent(started("other", 0x3bn));
    handle.triggerTacticsEvent({ reason: "server_kill_credit", runId: "other", status: "completed", type: "outcome" });
    handle.triggerTacticsEvent(started("t1", 0x2an));
    handle.triggerTacticsEvent({ reason: "server_kill_credit", runId: "t1", status: "completed", type: "outcome" });
    expect(await waiting).toEqual({ error: undefined, outcome: { observation: undefined, reason: "server_kill_credit", status: "completed" } });
  });

  test("takes the last outcome when stopped comes without one", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(() => new Promise<void>(() => {}));
    const waiting = awaitTactics(handle, { guid: 0x2an, instruction: "fight", signal: new AbortController().signal });
    handle.triggerTacticsEvent(started("t1", 0x2an));
    const state = { ...handle.getTacticsState(), lastOutcome: { reason: "target_lost", status: "blocked" as const } };
    handle.triggerTacticsEvent({ reason: "halt", runId: "t1", state, type: "stopped" });
    expect((await waiting).outcome).toEqual({ reason: "target_lost", status: "blocked" });
  });

  test("catches a synchronous throw", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(() => {
      throw new Error("self_not_alive");
    });
    const end = await awaitTactics(handle, { guid: 1n, instruction: "fight", signal: new AbortController().signal });
    expect(end).toEqual({ error: "self_not_alive", outcome: undefined });
  });

  test("catches a rejected start and maps it to jev_unavailable", async () => {
    const handle = createMockHandle();
    handle.startTactics = jest.fn(async () => {
      throw new JevUnavailableError("missing_jev_key");
    });
    const end = await awaitTactics(handle, { guid: 1n, instruction: "fight", signal: new AbortController().signal });
    expect(end.error).toBe("jev_unavailable: missing_jev_key");
    expect(jevCode(end)).toBe("jev_unavailable");
  });

  test("halts on abort", async () => {
    const handle = createMockHandle();
    const controller = new AbortController();
    handle.startTactics = jest.fn(() => new Promise<void>(() => {}));
    const waiting = awaitTactics(handle, { guid: 1n, instruction: "fight", signal: controller.signal });
    controller.abort(new Error("esc"));
    handle.triggerTacticsEvent(started("t1", 1n));
    handle.triggerTacticsEvent({ reason: "cancelled", runId: "t1", status: "failed", type: "outcome" });
    await waiting;
    expect(handle.halt).toHaveBeenCalled();
  });
});

describe("jevCode", () => {
  test("maps jev_timeout and leaves other outcomes", () => {
    expect(jevCode({ error: undefined, outcome: { reason: "jev_timeout", status: "failed" } })).toBe("jev_unavailable");
    expect(jevCode({ error: undefined, outcome: { reason: "server_kill_credit", status: "completed" } })).toBeUndefined();
    expect(jevCode({ error: "self_not_alive", outcome: undefined })).toBeUndefined();
  });
});

describe("awaitCycle", () => {
  test("ends at the stopped cycle event", async () => {
    const handle = createMockHandle();
    const base = handle.getCycleState();
    handle.startCycle = jest.fn(async () => {});
    handle.getCycleState = () => ({ ...base, active: false, stopCause: "queue_done" });
    const waiting = awaitCycle(handle, { guids: [1n, 2n], instruction: "fight", maxStarts: 3, signal: new AbortController().signal });
    handle.triggerCycleEvent({ at: 0, state: handle.getCycleState(), type: "stopped" });
    expect(await waiting).toMatchObject({ error: undefined, state: { active: false, stopCause: "queue_done" } });
    expect(handle.startCycle).toHaveBeenCalledWith([1n, 2n], "fight", 3);
  });

  test("returns the error of a rejected start", async () => {
    const handle = createMockHandle();
    handle.startCycle = jest.fn(async () => {
      throw new Error("cycle_empty_queue");
    });
    const end = await awaitCycle(handle, { guids: [], instruction: "fight", maxStarts: 1, signal: new AbortController().signal });
    expect(end.error).toBe("cycle_empty_queue");
  });

  test("stops the cycle on abort", async () => {
    const handle = createMockHandle();
    const controller = new AbortController();
    handle.startQuestCycle = jest.fn(() => new Promise<void>(() => {}));
    handle.stopCycle = jest.fn(() => {
      handle.triggerCycleEvent({ at: 0, state: handle.getCycleState(), type: "stopped" });
    });
    const waiting = awaitQuestCycle(handle, { instruction: "fight", maxStarts: undefined, questId: 8325, signal: controller.signal, sources: [15366] });
    controller.abort(new Error("human_stop"));
    await waiting;
    expect(handle.stopCycle).toHaveBeenCalled();
    expect(handle.startQuestCycle).toHaveBeenCalledWith(8325, [15366], "fight", undefined);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/runs/adapters.test.ts`
Expected: FAIL with `Export named 'awaitTactics' not found in module`.

- [ ] **Step 3: Implement** (add to `adapters.ts`; merge imports)

```ts
import type { CycleState, TacticsOutcome } from "@tuicraft/core";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";

export type FightEnd = { outcome: TacticsOutcome | undefined; error: string | undefined };
export type CycleEnd = { state: CycleState; error: string | undefined };

const JEV_UNAVAILABLE = "jev_unavailable";

type TacticsInit = { guid: bigint; instruction: string; signal: AbortSignal };
type CycleInit = { guids: bigint[]; instruction: string; maxStarts: number; signal: AbortSignal };
type QuestCycleInit = {
  questId: number;
  sources: number[];
  instruction: string;
  maxStarts: number | undefined;
  signal: AbortSignal;
};
type CycleWait = { handle: WorldHandle; signal: AbortSignal; start: () => Promise<void> };

function watchFight(handle: WorldHandle, hex: string) {
  let runId: string | undefined;
  let outcome: TacticsOutcome | undefined;
  let done: () => void = ignoreFailure;
  const ended = new Promise<void>((resolve) => {
    done = resolve;
  });
  const stop = handle.onTacticsEvent((event) => {
    if (event.type === "started" && event.targetGuid === hex) runId = event.runId;
    if (runId === undefined || event.runId !== runId) return;
    if (event.type === "outcome") {
      outcome = { observation: event.observation, reason: event.reason, status: event.status };
      done();
    }
    if (event.type === "stopped") {
      outcome ??= event.state.lastOutcome;
      done();
    }
  });
  return { ended, outcome: () => outcome, stop };
}

export async function awaitTactics(handle: WorldHandle, { guid, instruction, signal }: TacticsInit): Promise<FightEnd> {
  const watch = watchFight(handle, `0x${guid.toString(16)}`);
  const onAbort = () => handle.halt();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([handle.startTactics(guid, instruction, signal), watch.ended]);
    return { error: undefined, outcome: watch.outcome() ?? handle.getTacticsState().lastOutcome };
  } catch (error) {
    return { error: messageOf(error), outcome: watch.outcome() };
  } finally {
    watch.stop();
    signal.removeEventListener("abort", onAbort);
  }
}

async function cycleEnd({ handle, signal, start }: CycleWait): Promise<CycleEnd> {
  let unsubscribe: () => void = ignoreFailure;
  const stopped = new Promise<void>((resolve) => {
    unsubscribe = handle.onCycleEvent((event) => {
      if (event.type === "stopped") resolve();
    });
  });
  const onAbort = () => handle.stopCycle();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([stopped, start().then(() => stopped)]);
    return { error: undefined, state: handle.getCycleState() };
  } catch (error) {
    return { error: messageOf(error), state: handle.getCycleState() };
  } finally {
    unsubscribe();
    signal.removeEventListener("abort", onAbort);
  }
}

export function awaitCycle(handle: WorldHandle, { guids, instruction, maxStarts, signal }: CycleInit): Promise<CycleEnd> {
  return cycleEnd({ handle, signal, start: () => handle.startCycle(guids, instruction, maxStarts) });
}

export function awaitQuestCycle(handle: WorldHandle, init: QuestCycleInit): Promise<CycleEnd> {
  const { questId, sources, instruction, maxStarts, signal } = init;
  const start = () => handle.startQuestCycle(questId, sources, instruction, maxStarts);
  return cycleEnd({ handle, signal, start });
}

export function jevCode({ outcome, error }: FightEnd): string | undefined {
  if (outcome?.reason === "jev_timeout") return JEV_UNAVAILABLE;
  return error?.startsWith(JEV_UNAVAILABLE) ? JEV_UNAVAILABLE : undefined;
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/runs/adapters.test.ts` → PASS (15 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/runs/adapters.ts packages/harness/src/runs/adapters.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness fight and cycle adapters

startTactics fails both synchronously and by rejection (design V.4 #2);
cycles end only on a stopped event.
EOF
```

---
### Task L5a: Rule types, run rules and translator stubs

**Files:**
- Create: `packages/harness/src/events/rules.ts`
- Create: `packages/harness/test-support/rule-fixtures.ts`
- Create (stubs, ownership passes on): `packages/harness/src/events/rules-chat.ts` (→ L6),
  `packages/harness/src/events/rules-combat.ts` (→ L7),
  `packages/harness/src/events/rules-world.ts` (→ L8a),
  `packages/harness/src/events/rules-world-quest.ts` (→ L8b)
- Test: `packages/harness/src/events/rules.test.ts`

**Interfaces:**
- Consumes: `LogClass`, `LogDraft`, `LogEvent` (`#harness/contract/log`);
  `RunEvent`, `RunRecord` (`#harness/contract/runs`); `runLabel` (L3a);
  core event types from `@tuicraft/core` (`ChatMessage`, `GroupEvent`,
  `DuelEvent`, `CombatEvent`, `TacticsEvent`, `CycleEvent`, `RecoveryEvent`,
  `EntityEvent`, `ControlEvent`, `QuestEvent`, `RewardsEvent`, `VendorEvent`,
  `TrainerEvent`, `NoticeEvent`, `PlayerLife`).
- Produces (`events/rules.ts`):
  ```ts
  export type RuleContext = { selfName: string; selfGuid: bigint; runActive: boolean; wake: boolean; now: number; refOf: (guid: bigint) => string };
  export type Drafts = LogDraft[];
  export type SelfVitals = { hp: number; maxHp: number; power: number; maxPower: number };
  export type PlaceNames = { zone: string | undefined; area: string | undefined };
  export type RuleLookup = {
    experience: () => { xp: number | undefined; next: number | undefined };
    itemName: (itemId: number) => string | undefined;
    lastAttacker: () => bigint | undefined;
    place: () => PlaceNames;
    questTitle: (questId: number) => string | undefined;
    selfVitals: () => SelfVitals | undefined;
    unitLevel: (guid: bigint) => number | undefined;
    unitName: (guid: bigint) => string | undefined;
  };
  export type PoseMemo = { mapId: number; x: number; y: number; z: number };
  export type RuleMemo = {
    auras: Map<number, number>;
    coinage: number | undefined;
    cycleActive: boolean;
    fights: Map<string, { at: number; guid: bigint }>;
    levelAt: number | undefined;
    life: PlayerLife | undefined;
    lowHealth: Map<number, boolean>;
    moneyNoticeAt: number | undefined;
    pose: PoseMemo | undefined;
    runProgressAt: Map<string, number>;
    xpAt: number | undefined;
  };
  export type RuleInput = RuleContext & { lookup: RuleLookup; memo: RuleMemo };
  export const RUN_PROGRESS_MS = 5000;
  export function createRuleMemo(): RuleMemo;
  export function guidText(guid: bigint): string;
  export function unitIds(guid: bigint | undefined, rc: RuleContext): { guid?: string; ref?: string };
  export function runDrafts(event: RunEvent, rc: RuleInput): Drafts;
  ```
- Produces (`test-support/rule-fixtures.ts`):
  ```ts
  export function testLookup(over?: Partial<RuleLookup>): RuleLookup;
  export function testRuleInput(over?: Partial<RuleInput>): RuleInput;
  ```
- Produces (stubs, each returns `[]` until its task lands): the contract
  signatures of 2.11 with `rc: RuleInput`, and `questDrafts`, `rewardsDrafts`
  in `rules-world-quest.ts`:
  ```ts
  export function chatDrafts(msg: ChatMessage, rc: RuleInput): Drafts;
  export function groupDrafts(event: GroupEvent, rc: RuleInput): Drafts;
  export function duelDrafts(event: DuelEvent, rc: RuleInput): Drafts;
  export function combatDrafts(event: CombatEvent, rc: RuleInput): Drafts;
  export function tacticsDrafts(event: TacticsEvent, rc: RuleInput): Drafts;
  export function cycleDrafts(event: CycleEvent, rc: RuleInput): Drafts;
  export function recoveryDrafts(event: RecoveryEvent, rc: RuleInput): Drafts;
  export function vitalsDrafts(event: EntityEvent, rc: RuleInput): Drafts;
  export function controlDrafts(event: ControlEvent, rc: RuleInput): Drafts;
  export function vendorDrafts(event: VendorEvent, rc: RuleInput): Drafts;
  export function trainerDrafts(event: TrainerEvent, rc: RuleInput): Drafts;
  export function entityDrafts(event: EntityEvent, rc: RuleInput & { logEntities: boolean }): Drafts;
  export function packetErrorDrafts(opcode: number, error: Error, rc: RuleInput): Drafts;
  export function noticeDrafts(event: NoticeEvent, rc: RuleInput): Drafts;
  export function questDrafts(event: QuestEvent, rc: RuleInput): Drafts;
  export function rewardsDrafts(event: RewardsEvent, rc: RuleInput): Drafts;
  ```

Run rules (design C.1, D.2; contract issue 2): `run/started` and
`run/progress` are `log`; `run/progress` at most once per 5 s per run;
`run/cancelled` for `cancelled` and `interrupted`, class `log`; `run/ended`
is `wake` when `awaited` is false, else `log`. Every run row has `runId`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type { RunEvent, RunRecord } from "#harness/contract/runs";
import { RUN_PROGRESS_MS, runDrafts, unitIds } from "#harness/events/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    args: { target: "u9" },
    awaited: true,
    endedAt: undefined,
    id: "r4",
    kind: "engage",
    progress: undefined,
    reason: undefined,
    startedAt: 1000,
    status: "running",
    summary: undefined,
    toolCallId: "call-1",
    ...over,
  };
}

function event(type: RunEvent["type"], over: Partial<RunRecord> = {}): RunEvent {
  return { record: record(over), type };
}

describe("unitIds", () => {
  test("gives the hex guid and the ref, or nothing", () => {
    expect(unitIds(0x2an, testRuleInput())).toEqual({ guid: "2a", ref: "u42" });
    expect(unitIds(undefined, testRuleInput())).toEqual({});
  });
});

describe("runDrafts", () => {
  test("logs a run start", () => {
    expect(runDrafts(event("started"), testRuleInput())).toEqual([
      {
        class: "log",
        data: { args: { target: "u9" }, id: "r4", kind: "engage", progress: undefined, reason: undefined, status: "running", summary: undefined },
        domain: "run",
        event: "run/started",
        runId: "r4",
        text: "r4 started: engage u9",
        tool: "call-1",
      },
    ]);
  });

  test("logs progress at most once per 5 s per run", () => {
    const rc = testRuleInput({ now: 10_000 });
    const progress = event("progress", { progress: "1 of 3 kills" });
    expect(runDrafts(progress, rc).map((draft) => draft.text)).toEqual(["r4 1 of 3 kills"]);
    expect(runDrafts(progress, { ...rc, now: 10_000 + RUN_PROGRESS_MS - 1 })).toEqual([]);
    expect(runDrafts(progress, { ...rc, now: 10_000 + RUN_PROGRESS_MS })).toHaveLength(1);
  });

  test("an awaited end is log, an unawaited end is a wake", () => {
    const end = { endedAt: 5000, status: "succeeded" as const, summary: "3 kills, 390 xp" };
    const [awaited] = runDrafts(event("ended", end), testRuleInput());
    const [alone] = runDrafts(event("ended", { ...end, awaited: false }), testRuleInput());
    expect(awaited).toMatchObject({ class: "log", event: "run/ended", text: "r4 engage u9 succeeded: 3 kills, 390 xp" });
    expect(alone).toMatchObject({ class: "wake", event: "run/ended" });
  });

  test("a cancelled or interrupted run is run/cancelled and never wakes", () => {
    const [cancelled] = runDrafts(event("ended", { awaited: false, reason: "human_stop", status: "cancelled" }), testRuleInput());
    const [lost] = runDrafts(event("ended", { reason: "connection_lost", status: "interrupted" }), testRuleInput());
    expect(cancelled).toMatchObject({ class: "log", event: "run/cancelled", text: "r4 engage u9 cancelled: human_stop" });
    expect(lost).toMatchObject({ class: "log", event: "run/cancelled" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/rules.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/rules"`.

- [ ] **Step 3: Implement**

`packages/harness/src/events/rules.ts`:

```ts
import type { PlayerLife } from "@tuicraft/core";
import type { LogClass, LogDraft, LogEvent } from "#harness/contract/log";
import type { RunEvent, RunRecord } from "#harness/contract/runs";
import { runLabel } from "#harness/runs/registry";

export type RuleContext = {
  selfName: string;
  selfGuid: bigint;
  runActive: boolean;
  wake: boolean;
  now: number;
  refOf: (guid: bigint) => string;
};
export type Drafts = LogDraft[];
export type SelfVitals = { hp: number; maxHp: number; power: number; maxPower: number };
export type PlaceNames = { zone: string | undefined; area: string | undefined };
export type RuleLookup = {
  experience: () => { xp: number | undefined; next: number | undefined };
  itemName: (itemId: number) => string | undefined;
  lastAttacker: () => bigint | undefined;
  place: () => PlaceNames;
  questTitle: (questId: number) => string | undefined;
  selfVitals: () => SelfVitals | undefined;
  unitLevel: (guid: bigint) => number | undefined;
  unitName: (guid: bigint) => string | undefined;
};
export type PoseMemo = { mapId: number; x: number; y: number; z: number };
export type RuleMemo = {
  auras: Map<number, number>;
  coinage: number | undefined;
  cycleActive: boolean;
  fights: Map<string, { at: number; guid: bigint }>;
  levelAt: number | undefined;
  life: PlayerLife | undefined;
  lowHealth: Map<number, boolean>;
  moneyNoticeAt: number | undefined;
  pose: PoseMemo | undefined;
  runProgressAt: Map<string, number>;
  xpAt: number | undefined;
};
export type RuleInput = RuleContext & { lookup: RuleLookup; memo: RuleMemo };

export const RUN_PROGRESS_MS = 5000;

type RunRow = { record: RunRecord; event: LogEvent; cls: LogClass; text: string };

export function createRuleMemo(): RuleMemo {
  return {
    auras: new Map(),
    coinage: undefined,
    cycleActive: false,
    fights: new Map(),
    levelAt: undefined,
    life: undefined,
    lowHealth: new Map(),
    moneyNoticeAt: undefined,
    pose: undefined,
    runProgressAt: new Map(),
    xpAt: undefined,
  };
}

export function guidText(guid: bigint): string {
  return guid.toString(16);
}

export function unitIds(guid: bigint | undefined, rc: RuleContext): { guid?: string; ref?: string } {
  return guid === undefined ? {} : { guid: guidText(guid), ref: rc.refOf(guid) };
}

function runRow({ record, event, cls, text }: RunRow): LogDraft {
  const { args, id, kind, progress, reason, status, summary, toolCallId } = record;
  const data = { args, id, kind, progress, reason, status, summary };
  return { class: cls, data, domain: "run", event, runId: id, text, tool: toolCallId };
}

function progressDrafts(record: RunRecord, rc: RuleInput): Drafts {
  const last = rc.memo.runProgressAt.get(record.id);
  if (record.progress === undefined) return [];
  if (last !== undefined && rc.now - last < RUN_PROGRESS_MS) return [];
  rc.memo.runProgressAt.set(record.id, rc.now);
  return [runRow({ cls: "log", event: "run/progress", record, text: `${record.id} ${record.progress}` })];
}

function endDraft(record: RunRecord): LogDraft {
  const cancelled = record.status === "cancelled" || record.status === "interrupted";
  const cls = cancelled || record.awaited ? "log" : "wake";
  const why = record.summary ?? record.reason ?? "no summary";
  const text = `${record.id} ${runLabel(record)} ${record.status}: ${why}`;
  return runRow({ cls, event: cancelled ? "run/cancelled" : "run/ended", record, text });
}

export function runDrafts({ type, record }: RunEvent, rc: RuleInput): Drafts {
  if (type === "progress") return progressDrafts(record, rc);
  if (type === "ended") return [endDraft(record)];
  const text = `${record.id} started: ${runLabel(record)}`;
  return [runRow({ cls: "log", event: "run/started", record, text })];
}
```

Note for the reviewer: for a cancelled run, `summary` is what the launch
returned; the registry forces `reason` to the cancel code. The test above sets
no summary for the cancelled case, so the text shows the reason.

`packages/harness/test-support/rule-fixtures.ts`:

```ts
import { createRuleMemo, type RuleInput, type RuleLookup } from "#harness/events/rules";

export function testLookup(over: Partial<RuleLookup> = {}): RuleLookup {
  return {
    experience: () => ({ next: undefined, xp: undefined }),
    itemName: () => undefined,
    lastAttacker: () => undefined,
    place: () => ({ area: undefined, zone: undefined }),
    questTitle: () => undefined,
    selfVitals: () => undefined,
    unitLevel: () => undefined,
    unitName: () => undefined,
    ...over,
  };
}

export function testRuleInput(over: Partial<RuleInput> = {}): RuleInput {
  return {
    lookup: testLookup(),
    memo: createRuleMemo(),
    now: 1_000_000,
    refOf: (guid) => `u${guid}`,
    runActive: false,
    selfGuid: 1n,
    selfName: "Fgk",
    wake: true,
    ...over,
  };
}
```

`packages/harness/src/events/rules-chat.ts` (stub):

```ts
import type { ChatMessage, DuelEvent, GroupEvent } from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function chatDrafts(_msg: ChatMessage, _rc: RuleInput): Drafts {
  return [];
}

export function groupDrafts(_event: GroupEvent, _rc: RuleInput): Drafts {
  return [];
}

export function duelDrafts(_event: DuelEvent, _rc: RuleInput): Drafts {
  return [];
}
```

`packages/harness/src/events/rules-combat.ts` (stub):

```ts
import type { CombatEvent, CycleEvent, EntityEvent, RecoveryEvent, TacticsEvent } from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function combatDrafts(_event: CombatEvent, _rc: RuleInput): Drafts {
  return [];
}

export function tacticsDrafts(_event: TacticsEvent, _rc: RuleInput): Drafts {
  return [];
}

export function cycleDrafts(_event: CycleEvent, _rc: RuleInput): Drafts {
  return [];
}

export function recoveryDrafts(_event: RecoveryEvent, _rc: RuleInput): Drafts {
  return [];
}

export function vitalsDrafts(_event: EntityEvent, _rc: RuleInput): Drafts {
  return [];
}
```

`packages/harness/src/events/rules-world.ts` (stub):

```ts
import type { ControlEvent, EntityEvent, NoticeEvent, TrainerEvent, VendorEvent } from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function controlDrafts(_event: ControlEvent, _rc: RuleInput): Drafts {
  return [];
}

export function vendorDrafts(_event: VendorEvent, _rc: RuleInput): Drafts {
  return [];
}

export function trainerDrafts(_event: TrainerEvent, _rc: RuleInput): Drafts {
  return [];
}

export function entityDrafts(_event: EntityEvent, _rc: RuleInput & { logEntities: boolean }): Drafts {
  return [];
}

export function packetErrorDrafts(_opcode: number, _error: Error, _rc: RuleInput): Drafts {
  return [];
}

export function noticeDrafts(_event: NoticeEvent, _rc: RuleInput): Drafts {
  return [];
}
```

`packages/harness/src/events/rules-world-quest.ts` (stub):

```ts
import type { QuestEvent, RewardsEvent } from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function questDrafts(_event: QuestEvent, _rc: RuleInput): Drafts {
  return [];
}

export function rewardsDrafts(_event: RewardsEvent, _rc: RuleInput): Drafts {
  return [];
}
```

TypeScript does not report `_`-prefixed unused parameters under
`noUnusedParameters`; biome's `noUnusedFunctionParameters` also skips
them. The stubs live only until L6–L8b replace each body.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/rules.test.ts` → PASS (5 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/rules.ts packages/harness/src/events/rules.test.ts packages/harness/test-support/rule-fixtures.ts packages/harness/src/events/rules-chat.ts packages/harness/src/events/rules-combat.ts packages/harness/src/events/rules-world.ts packages/harness/src/events/rules-world-quest.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness run rules and rule stubs

The router needs every translator name before the rule tasks fill them,
and run ends that no tool awaits must wake.
EOF
```

---

### Task L5b: Event router

**Files:**
- Create: `packages/harness/src/events/router.ts`
- Test: `packages/harness/src/events/router.test.ts`

**Interfaces:**
- Consumes: `WorldHandle`, `Unsubscribe`, `TacticsEvent` (`@tuicraft/core`);
  `ignoreFailure`; `HarnessFlags` (`#harness/contract/config`);
  `GameLogEntry`, `LogClass`, `LogDraft`, `LogEvent` (`#harness/contract/log`);
  `RunRegistry` (`#harness/contract/runs`); `AttackLedger`, `DeliverySink`,
  `EventRouter`, `GameLog`, `JsonlSink` (`#harness/contract/services`);
  `WakeGuard` (L9a); everything in `events/rules*.ts` (L5a).
- Produces:
  ```ts
  export type RouterInit = {
    log: GameLog;
    jevLog: JsonlSink;
    runs: RunRegistry;
    attacks: AttackLedger;
    guard: WakeGuard;
    flags: HarnessFlags;
    context: () => RuleContext;
  };
  export function lookupFor(init: { handle: WorldHandle; attacks: AttackLedger } | undefined): RuleLookup;
  export function createEventRouter(init: RouterInit): EventRouter;
  ```

Behaviour (contract 2.11; issues 2–5, 8):

- `attach(handle)` builds `lookup` from the handle, starts a new `memo`, and
  subscribes all 21 hooks. Six hooks (`onGuildEvent`, `onFriendEvent`,
  `onIgnoreEvent`, `onRemoteMotionEvent`, `onDestroyEvent`,
  `onDefenseEvent`) have zero rows. The returned function unsubscribes all 21.
- Tactics `request`, `result` and `applied` go to `jevLog` with `ts`, never
  to the game log.
- For each draft: `wake` becomes `passive` when `rc.wake` is false; a `wake`
  or `passive` draft goes through `guard.admit`; the row is appended with the
  admitted class, `delivered: false` for wake and passive, and `runId` from the
  draft or the active run. A wake that the guard lowered adds a
  `session/wake_throttled` row (class `log`).
- `log.subscribe` delivers every appended row, from any module: wake →
  `sink.wake([entry])`, passive → `sink.passive(entry)`, and `packet/error`,
  `session/connected`, `session/lost`, `session/wake_throttled` →
  `sink.human(entry)`. No sink → nothing is delivered; the row stays in the log.
- `runs.subscribe` is set once at creation (runs outlive a handle).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { HarnessFlags } from "#harness/contract/config";
import type { RunEnd, RunRegistry } from "#harness/contract/runs";
import type { AttackLedger, JsonlSink } from "#harness/contract/services";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import type { RuleContext } from "#harness/events/rules";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";

const testFlags: HarnessFlags = {
  check: false,
  connect: true,
  glyphs: undefined,
  logEntities: false,
  model: "openai-codex/gpt-6-luna",
  nowPerCall: false,
  profile: "profile.json",
  runDir: undefined,
  stopReflex: true,
  thinking: "high",
  wake: true,
};

function setup(over: Partial<RuleContext> = {}) {
  const now = 1_000_000;
  const clock = { now: () => now };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const jevRows: unknown[] = [];
  const jevLog: JsonlSink = {
    close: async () => {},
    flush: async () => {},
    write: (row) => {
      jevRows.push(row);
    },
  };
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const attacks: AttackLedger = { attach: () => () => {}, lastAttacker: () => undefined, lastHitAt: () => undefined };
  const context = (): RuleContext => ({ now, refOf: (guid) => `u${guid}`, runActive: false, selfGuid: 1n, selfName: "Fgk", wake: true, ...over });
  const router = createEventRouter({ attacks, context, flags: testFlags, guard: createWakeGuard(clock), jevLog, log, runs });
  const sink = { human: jest.fn(), passive: jest.fn(), wake: jest.fn() };
  router.setSink(sink);
  return { jevRows, log, router, runs, sink };
}

async function endRun(runs: RunRegistry, awaited: boolean): Promise<string> {
  let finish = () => {};
  const launch = () =>
    new Promise<RunEnd<number>>((resolve) => {
      finish = () => resolve({ status: "succeeded", summary: "killed u9", value: 1 });
    });
  const run = runs.start({ args: { target: "u9" }, kind: "engage", launch, toolCallId: "call-1" });
  if (!awaited) runs.release(run.id);
  finish();
  await run.done;
  return run.id;
}

describe("createEventRouter", () => {
  test("attach subscribes all 21 hooks and detach removes them", () => {
    const { router } = setup();
    const handle = createMockHandle();
    const hooks = Object.keys(handle).filter((key) => /^on[A-Z]/.test(key));
    const live = new Set<string>();
    const spied: Record<string, unknown> = {};
    for (const name of hooks)
      spied[name] = () => {
        live.add(name);
        return () => live.delete(name);
      };
    const detach = router.attach({ ...handle, ...spied } as WorldHandle);
    expect(hooks).toHaveLength(21);
    expect([...live].sort()).toEqual([...hooks].sort());
    detach();
    expect(live.size).toBe(0);
  });

  test("an unawaited run end is a delivered wake with its run id", async () => {
    const { log, runs, sink } = setup();
    const id = await endRun(runs, false);
    const ended = log.since(0).find((row) => row.event === "run/ended");
    expect(ended).toMatchObject({ class: "wake", delivered: false, runId: id });
    expect(sink.wake).toHaveBeenCalledWith([ended]);
  });

  test("an awaited run end stays in the log", async () => {
    const { log, runs, sink } = setup();
    await endRun(runs, true);
    expect(log.since(0).map((row) => [row.event, row.class])).toEqual([
      ["run/started", "log"],
      ["run/ended", "log"],
    ]);
    expect(sink.wake).not.toHaveBeenCalled();
  });

  test("wake off turns a wake into a passive line", async () => {
    const { log, runs, sink } = setup({ wake: false });
    await endRun(runs, false);
    expect(log.since(0).find((row) => row.event === "run/ended")?.class).toBe("passive");
    expect(sink.passive).toHaveBeenCalled();
  });

  test("a throttled wake becomes passive and logs session/wake_throttled", async () => {
    const { log, runs, sink } = setup();
    for (const _ of [1, 2, 3, 4]) await endRun(runs, false);
    const ends = log.since(0).filter((row) => row.event === "run/ended");
    expect(ends.map((row) => row.class)).toEqual(["wake", "wake", "wake", "passive"]);
    const throttled = log.since(0).filter((row) => row.event === "session/wake_throttled");
    expect(throttled).toHaveLength(1);
    expect(sink.human).toHaveBeenCalledWith(throttled[0]);
  });

  test("sends Jev request, result and applied rows to jev.jsonl only", () => {
    const { jevRows, log, router } = setup();
    const handle = createMockHandle();
    router.attach(handle);
    handle.triggerTacticsEvent({ candidates: [], framing: "none", instruction: "fight", observation: {}, runId: "t1", sentAtMs: 0, type: "request" });
    handle.triggerTacticsEvent({ actionId: "a1", ageMs: 5, runId: "t1", type: "applied" });
    expect(jevRows).toHaveLength(2);
    expect(jevRows[0]).toMatchObject({ runId: "t1", ts: 1_000_000, type: "request" });
    expect(log.count()).toBe(0);
  });

  test("delivers wake rows that other modules append", () => {
    const { log, sink } = setup();
    const lost = log.append({ class: "wake", data: {}, domain: "session", event: "session/lost", text: "Connection lost. The human must run /connect." });
    expect(sink.wake).toHaveBeenCalledWith([lost]);
    expect(sink.human).toHaveBeenCalledWith(lost);
  });

  test("delivers nothing without a sink", async () => {
    const { log, router, runs, sink } = setup();
    router.setSink(undefined);
    await endRun(runs, false);
    expect(log.since(0).some((row) => row.event === "run/ended")).toBe(true);
    expect(sink.wake).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/router.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/router"`.

- [ ] **Step 3: Implement**

```ts
import type { TacticsEvent, Unsubscribe, WorldHandle } from "@tuicraft/core";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { HarnessFlags } from "#harness/contract/config";
import type { GameLogEntry, LogClass, LogDraft, LogEvent } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type { AttackLedger, DeliverySink, EventRouter, GameLog, JsonlSink } from "#harness/contract/services";
import type { WakeGuard } from "#harness/events/guard";
import {
  createRuleMemo,
  type Drafts,
  type RuleContext,
  type RuleInput,
  type RuleLookup,
  runDrafts,
} from "#harness/events/rules";
import { chatDrafts, duelDrafts, groupDrafts } from "#harness/events/rules-chat";
import { combatDrafts, cycleDrafts, recoveryDrafts, tacticsDrafts, vitalsDrafts } from "#harness/events/rules-combat";
import {
  controlDrafts,
  entityDrafts,
  noticeDrafts,
  packetErrorDrafts,
  trainerDrafts,
  vendorDrafts,
} from "#harness/events/rules-world";
import { questDrafts, rewardsDrafts } from "#harness/events/rules-world-quest";

export type RouterInit = {
  log: GameLog;
  jevLog: JsonlSink;
  runs: RunRegistry;
  attacks: AttackLedger;
  guard: WakeGuard;
  flags: HarnessFlags;
  context: () => RuleContext;
};

type Route = (make: (rc: RuleInput) => Drafts) => void;
type SubscribeInit = { handle: WorldHandle; route: Route; jev: (event: TacticsEvent) => void; logEntities: boolean };
type LookupInit = { handle: WorldHandle; attacks: AttackLedger };

const HUMAN_EVENTS = new Set<LogEvent>(["packet/error", "session/connected", "session/lost", "session/wake_throttled"]);
const JEV_EVENTS = new Set<TacticsEvent["type"]>(["request", "result", "applied"]);

const NO_LOOKUP: RuleLookup = {
  experience: () => ({ next: undefined, xp: undefined }),
  itemName: () => undefined,
  lastAttacker: () => undefined,
  place: () => ({ area: undefined, zone: undefined }),
  questTitle: () => undefined,
  selfVitals: () => undefined,
  unitLevel: () => undefined,
  unitName: () => undefined,
};

function itemNameIn(handle: WorldHandle, itemId: number): string | undefined {
  for (const slot of handle.getInventoryState().slots)
    if (slot.status === "occupied" && slot.item.entry === itemId && slot.item.name) return slot.item.name;
  const { loot } = handle.getRewardsState();
  if (loot.phase !== "open" && loot.phase !== "closing") return;
  return loot.items.find((item) => item.itemId === itemId)?.name ?? undefined;
}

function questTitleIn(handle: WorldHandle, questId: number): string | undefined {
  const query = handle.getQuestState().queries.find((candidate) => candidate.questId === questId);
  return query?.status === "known" ? query.data.title : undefined;
}

function placeOf(handle: WorldHandle): { zone: string | undefined; area: string | undefined } {
  try {
    const { area, zone } = handle.getPlaceState();
    return { area, zone };
  } catch {
    return { area: undefined, zone: undefined };
  }
}

export function lookupFor(init: LookupInit | undefined): RuleLookup {
  if (!init) return NO_LOOKUP;
  const { handle, attacks } = init;
  const unit = (guid: bigint) => handle.getNearbyEntities().find((entity) => entity.guid === guid);
  return {
    experience() {
      const { nextLevelXp, xp } = handle.getExperienceState();
      return { next: nextLevelXp, xp };
    },
    itemName: (itemId) => itemNameIn(handle, itemId),
    lastAttacker: () => attacks.lastAttacker(),
    place: () => placeOf(handle),
    questTitle: (questId) => questTitleIn(handle, questId),
    selfVitals() {
      const { health, maxHealth, maxPower, power } = handle.getCombatState().self;
      if (health === undefined || maxHealth === undefined) return;
      return { hp: health, maxHp: maxHealth, maxPower: maxPower ?? 0, power: power ?? 0 };
    },
    unitLevel(guid) {
      const entity = unit(guid);
      return entity && "level" in entity ? entity.level : undefined;
    },
    unitName: (guid) => unit(guid)?.name,
  };
}

function subscribeAll({ handle, route, jev, logEntities }: SubscribeInit): Unsubscribe[] {
  return [
    handle.onMessage((msg) => route((rc) => chatDrafts(msg, rc))),
    handle.onGroupEvent((event) => route((rc) => groupDrafts(event, rc))),
    handle.onDuelEvent((event) => route((rc) => duelDrafts(event, rc))),
    handle.onCombatEvent((event) => route((rc) => combatDrafts(event, rc))),
    handle.onTacticsEvent((event) => {
      if (JEV_EVENTS.has(event.type)) jev(event);
      else route((rc) => tacticsDrafts(event, rc));
    }),
    handle.onCycleEvent((event) => route((rc) => cycleDrafts(event, rc))),
    handle.onRecoveryEvent((event) => route((rc) => recoveryDrafts(event, rc))),
    handle.onEntityEvent((event) =>
      route((rc) => [...entityDrafts(event, { ...rc, logEntities }), ...vitalsDrafts(event, rc)]),
    ),
    handle.onControlEvent((event) => route((rc) => controlDrafts(event, rc))),
    handle.onQuestEvent((event) => route((rc) => questDrafts(event, rc))),
    handle.onRewardsEvent((event) => route((rc) => rewardsDrafts(event, rc))),
    handle.onVendorEvent((event) => route((rc) => vendorDrafts(event, rc))),
    handle.onTrainerEvent((event) => route((rc) => trainerDrafts(event, rc))),
    handle.onPacketError((opcode, error) => route((rc) => packetErrorDrafts(opcode, error, rc))),
    handle.onNotice((event) => route((rc) => noticeDrafts(event, rc))),
    handle.onGuildEvent(ignoreFailure),
    handle.onFriendEvent(ignoreFailure),
    handle.onIgnoreEvent(ignoreFailure),
    handle.onRemoteMotionEvent(ignoreFailure),
    handle.onDestroyEvent(ignoreFailure),
    handle.onDefenseEvent(ignoreFailure),
  ];
}

function deliver(sink: DeliverySink, entry: GameLogEntry): void {
  if (HUMAN_EVENTS.has(entry.event)) sink.human(entry);
  if (entry.class === "wake") sink.wake([entry]);
  if (entry.class === "passive") sink.passive(entry);
}

function throttled(draft: LogDraft, cls: LogClass): LogDraft {
  const text = `Wake held back: ${draft.event} became ${cls}.`;
  return { class: "log", data: { event: draft.event, to: cls }, domain: "session", event: "session/wake_throttled", text };
}

export function createEventRouter(init: RouterInit): EventRouter {
  const { guard, log, runs } = init;
  let sink: DeliverySink | undefined;
  let lookup = lookupFor(undefined);
  let memo = createRuleMemo();
  const admit = (draft: LogDraft, rc: RuleContext): LogClass => {
    const wanted = draft.class === "wake" && !rc.wake ? "passive" : draft.class;
    return wanted === "log" ? "log" : guard.admit({ ...draft, class: wanted });
  };
  const record = (draft: LogDraft, rc: RuleContext) => {
    const cls = admit(draft, rc);
    const runId = draft.runId ?? runs.active()?.id;
    const delivered = cls === "log" ? undefined : false;
    log.append({ ...draft, class: cls, delivered, runId });
    if (draft.class === "wake" && rc.wake && cls !== "wake") log.append(throttled(draft, cls));
  };
  const route: Route = (make) => {
    const rc: RuleInput = { ...init.context(), lookup, memo };
    for (const draft of make(rc)) record(draft, rc);
  };
  const jev = (event: TacticsEvent) => init.jevLog.write({ ...event, ts: init.context().now });
  log.subscribe((entry) => {
    if (sink) deliver(sink, entry);
  });
  runs.subscribe((event) => route((rc) => runDrafts(event, rc)));
  return {
    attach(handle) {
      lookup = lookupFor({ attacks: init.attacks, handle });
      memo = createRuleMemo();
      const offs = subscribeAll({ handle, jev, logEntities: init.flags.logEntities, route });
      return () => {
        for (const off of offs) off();
      };
    },
    setSink(next) {
      sink = next;
    },
  };
}
```

`handle.getPlaceState()` throws `not_implemented` until C6b lands (contract
1.3); `placeOf` catches only that call, because C0 makes it throw on
purpose.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/router.test.ts` → PASS (8 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/router.ts packages/harness/src/events/router.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness event router

Every core event reaches the game log through one place that applies the
wake rules and guards (design C).
EOF
```

---
### Task L6: Chat, group and duel rules

**Files:**
- Modify: `packages/harness/src/events/rules-chat.ts` (replace the L5a stub bodies)
- Test: `packages/harness/src/events/rules-chat.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `ChatType`, `DuelEvent`, `GroupEvent`
  (`@tuicraft/core`); `LogClass`, `LogDraft`, `LogEvent`
  (`#harness/contract/log`); `Drafts`, `RuleInput` (L5a); `testRuleInput`
  (L5a fixtures); the router and its parts (L5b, L1b, L3a, L9a) for one
  end-to-end test.
- Produces: `chatDrafts`, `groupDrafts`, `duelDrafts` with the L5a signatures.

Rules (design C.1, C.5; contract issue 9):

| Input | Row | Class |
|---|---|---|
| `WHISPER_INFORM` (own whisper echo) | `chat/out`, `data.to` = sender | log |
| sender is the character | `chat/out` | log |
| whisper, party, raid, guild, officer from another sender | `chat/in` | wake |
| say or yell that names the character (word boundary, any case) | `chat/in` | wake |
| other say or yell; emote; monster say, yell, whisper, emote; raid boss lines | `chat/in` | passive |
| system line: "not yet implemented", `[debug]`, login banners | `chat/in` | log |
| other system line | `chat/in` | passive |
| channel and every other type | `chat/in` | log |
| group `invite_received`, `kicked`, `group_destroyed` | `group/invite`, `group/kicked`, `group/disbanded` | wake |
| group `group_list`, `leader_changed`, `invite_declined` | `group/roster` | passive |
| `duel_requested` | `social/duel_request` | wake |

`data` for chat is `{ channel, self, sender, text, type }` (`type` is the
numeric `ChatType`, which delivery reads for the whisper answer hint).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import { type ChatMessage, ChatType } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { RunEnd } from "#harness/contract/runs";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import { chatDrafts, duelDrafts, groupDrafts } from "#harness/events/rules-chat";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { testRuleInput } from "#test-support/rule-fixtures";

function msg(type: number, sender: string, message: string, channel?: string): ChatMessage {
  return { channel, message, sender, type };
}

function one(message: ChatMessage) {
  const [draft] = chatDrafts(message, testRuleInput());
  return draft;
}

describe("chatDrafts", () => {
  test("a whisper from another player wakes the agent", () => {
    expect(one(msg(ChatType.WHISPER, "Kaelyn", "hey, what level are you?"))).toEqual({
      class: "wake",
      data: { channel: undefined, self: false, sender: "Kaelyn", text: "hey, what level are you?", type: ChatType.WHISPER },
      domain: "chat",
      event: "chat/in",
      text: 'Whisper from Kaelyn: "hey, what level are you?"',
    });
  });

  test("own echoes never rise above log", () => {
    expect(one(msg(ChatType.WHISPER_INFORM, "Kaelyn", "I'm level 10."))).toMatchObject({
      class: "log",
      data: { self: true, to: "Kaelyn" },
      event: "chat/out",
      text: `You whisper to Kaelyn: "I'm level 10."`,
    });
    expect(one(msg(ChatType.SAY, "Fgk", "hello"))).toMatchObject({ class: "log", event: "chat/out", text: 'Fgk says: "hello"' });
    expect(one(msg(ChatType.PARTY, "Fgk", "omw"))).toMatchObject({ class: "log", event: "chat/out" });
  });

  test("group channels from others wake", () => {
    expect(one(msg(ChatType.PARTY, "Bob", "inc"))).toMatchObject({ class: "wake", text: '[party] Bob: "inc"' });
    expect(one(msg(ChatType.GUILD, "Bob", "gz"))).toMatchObject({ class: "wake", text: '[guild] Bob: "gz"' });
  });

  test("say wakes only when it names the character", () => {
    expect(one(msg(ChatType.SAY, "Bob", "hi fgk, want a group?"))?.class).toBe("wake");
    expect(one(msg(ChatType.YELL, "Bob", "anyone here?"))).toMatchObject({ class: "passive", text: 'Bob yells: "anyone here?"' });
    expect(one(msg(ChatType.SAY, "Bob", "Fgkx is my alt"))?.class).toBe("passive");
  });

  test("monster lines and emotes are passive, channels are log", () => {
    expect(one(msg(ChatType.MONSTER_SAY, "Magistrix Erona", "Welcome."))?.class).toBe("passive");
    expect(one(msg(ChatType.EMOTE, "Bob", "waves."))).toMatchObject({ class: "passive", text: "Bob waves." });
    expect(one(msg(ChatType.CHANNEL, "Bob", "wts", "General"))).toMatchObject({ class: "log", text: '[General] Bob: "wts"' });
  });

  test("quiet system lines are log, other system lines passive", () => {
    expect(one(msg(ChatType.SYSTEM, "", "[tuicraft] SMSG_FOO is not yet implemented"))?.class).toBe("log");
    expect(one(msg(ChatType.SYSTEM, "", "Welcome to AzerothCore"))?.class).toBe("log");
    expect(one(msg(ChatType.SYSTEM, "", "Bob has invited you to a group."))).toMatchObject({ class: "passive", text: "[system] Bob has invited you to a group." });
  });
});

describe("groupDrafts", () => {
  test("invites, kicks and disbands wake; roster changes are passive", () => {
    const rc = testRuleInput();
    expect(groupDrafts({ from: "Bob", type: "invite_received" }, rc)).toEqual([
      { class: "wake", data: { from: "Bob" }, domain: "group", event: "group/invite", text: "Bob invites you to a group." },
    ]);
    expect(groupDrafts({ type: "kicked" }, rc)[0]).toMatchObject({ class: "wake", event: "group/kicked" });
    expect(groupDrafts({ type: "group_destroyed" }, rc)[0]).toMatchObject({ class: "wake", event: "group/disbanded" });
    expect(groupDrafts({ name: "Bob", type: "leader_changed" }, rc)[0]).toMatchObject({ class: "passive", event: "group/roster", text: "Bob is now the group leader." });
    expect(groupDrafts({ guidLow: 2, type: "member_stats" }, rc)).toEqual([]);
  });

  test("a group list names the members and the leader", () => {
    const members = [
      { guidHigh: 0, guidLow: 2, name: "Bob", online: true },
      { guidHigh: 0, guidLow: 3, name: "Kaelyn", online: false },
    ];
    const [draft] = groupDrafts({ change: { added: ["Kaelyn"], formed: false, removed: [] }, leader: "Bob", loot: null, members, type: "group_list" }, testRuleInput());
    expect(draft).toMatchObject({ class: "passive", data: { leader: "Bob", members: ["Bob", "Kaelyn"] }, text: "Group: Bob, Kaelyn; leader Bob." });
  });
});

describe("duelDrafts", () => {
  test("a duel request wakes; the rest is dropped", () => {
    expect(duelDrafts({ challenger: "Bob", type: "duel_requested" }, testRuleInput())).toEqual([
      { class: "wake", data: { challenger: "Bob" }, domain: "social", event: "social/duel_request", text: "Bob challenges you to a duel." },
    ]);
    expect(duelDrafts({ timeMs: 3000, type: "duel_countdown" }, testRuleInput())).toEqual([]);
  });
});

describe("router with chat rules", () => {
  test("stamps the active run on a whisper and delivers it as a wake", () => {
    const clock = { now: () => 5000 };
    const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
    const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
    const router = createEventRouter({
      attacks: { attach: () => () => {}, lastAttacker: () => undefined, lastHitAt: () => undefined },
      context: () => ({ now: 5000, refOf: (guid) => `u${guid}`, runActive: true, selfGuid: 1n, selfName: "Fgk", wake: true }),
      flags: { check: false, connect: true, glyphs: undefined, logEntities: false, model: "m", nowPerCall: false, profile: "p", runDir: undefined, stopReflex: true, thinking: "high", wake: true },
      guard: createWakeGuard(clock),
      jevLog: createJsonlSink({ file: undefined }),
      log,
      runs,
    });
    const sink = { human: jest.fn(), passive: jest.fn(), wake: jest.fn() };
    router.setSink(sink);
    const handle = createMockHandle();
    router.attach(handle);
    runs.start({ args: {}, kind: "engage", launch: () => new Promise<RunEnd<number>>(() => {}), toolCallId: "c1" });
    handle.triggerMessage(msg(ChatType.WHISPER, "Kaelyn", "hey"));
    const whisper = log.since(0).find((row) => row.event === "chat/in");
    expect(whisper).toMatchObject({ class: "wake", runId: "r1" });
    expect(sink.wake).toHaveBeenCalledWith([whisper]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/rules-chat.test.ts`
Expected: FAIL; the first assertion gets `undefined` because the L5a stub
returns `[]` (`expect(received).toEqual(expected)`, received `undefined`).

- [ ] **Step 3: Implement** (replace the whole file)

```ts
import { type ChatMessage, ChatType, type DuelEvent, type GroupEvent } from "@tuicraft/core";
import type { LogClass, LogDraft, LogEvent } from "#harness/contract/log";
import type { Drafts, RuleInput } from "#harness/events/rules";

const WAKE_TYPES = new Set<number>([
  ChatType.WHISPER,
  ChatType.WHISPER_FOREIGN,
  ChatType.PARTY,
  ChatType.PARTY_LEADER,
  ChatType.RAID,
  ChatType.RAID_LEADER,
  ChatType.RAID_WARNING,
  ChatType.GUILD,
  ChatType.OFFICER,
]);
const OPEN_TYPES = new Set<number>([ChatType.SAY, ChatType.YELL]);
const PASSIVE_TYPES = new Set<number>([
  ChatType.EMOTE,
  ChatType.MONSTER_SAY,
  ChatType.MONSTER_PARTY,
  ChatType.MONSTER_YELL,
  ChatType.MONSTER_WHISPER,
  ChatType.MONSTER_EMOTE,
  ChatType.RAID_BOSS_EMOTE,
  ChatType.RAID_BOSS_WHISPER,
]);
const WHISPERS = new Set<number>([ChatType.WHISPER, ChatType.WHISPER_FOREIGN]);
const EMOTES = new Set<number>([ChatType.EMOTE, ChatType.MONSTER_EMOTE]);
const TAGS = new Map<number, string>([
  [ChatType.PARTY, "party"],
  [ChatType.PARTY_LEADER, "party"],
  [ChatType.RAID, "raid"],
  [ChatType.RAID_LEADER, "raid"],
  [ChatType.RAID_WARNING, "raid warning"],
  [ChatType.GUILD, "guild"],
  [ChatType.OFFICER, "officer"],
]);
const VERBS = new Map<number, string>([
  [ChatType.YELL, "yells"],
  [ChatType.MONSTER_YELL, "yells"],
  [ChatType.MONSTER_WHISPER, "whispers"],
]);
const QUIET_SYSTEM =
  /not yet implemented|^\[debug\]|^(This server|Playerbots:|Individual Progression|Joined channel|Left channel|Welcome)/;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

type GroupRow = { cls: LogClass; event: LogEvent; text: string; data?: Record<string, unknown> };

function namesMe(text: string, name: string): boolean {
  const escaped = name.replace(REGEX_SPECIALS, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function chatClass({ type, message }: ChatMessage, rc: RuleInput): LogClass {
  if (WAKE_TYPES.has(type)) return "wake";
  if (OPEN_TYPES.has(type)) return namesMe(message, rc.selfName) ? "wake" : "passive";
  if (PASSIVE_TYPES.has(type)) return "passive";
  if (type === ChatType.SYSTEM) return QUIET_SYSTEM.test(message) ? "log" : "passive";
  return "log";
}

function chatText({ type, sender, message, channel }: ChatMessage): string {
  if (WHISPERS.has(type)) return `Whisper from ${sender}: "${message}"`;
  if (type === ChatType.SYSTEM) return `[system] ${message}`;
  if (EMOTES.has(type)) return `${sender} ${message}`;
  const tag = TAGS.get(type) ?? channel;
  if (tag) return `[${tag}] ${sender}: "${message}"`;
  return `${sender} ${VERBS.get(type) ?? "says"}: "${message}"`;
}

function chatOut(data: Record<string, unknown>, text: string): LogDraft {
  return { class: "log", data, domain: "chat", event: "chat/out", text };
}

export function chatDrafts(msg: ChatMessage, rc: RuleInput): Drafts {
  const { channel, message, sender, type } = msg;
  const base = { channel, sender, text: message, type };
  if (type === ChatType.WHISPER_INFORM)
    return [chatOut({ ...base, self: true, to: sender }, `You whisper to ${sender}: "${message}"`)];
  if (sender === rc.selfName) return [chatOut({ ...base, self: true }, chatText(msg))];
  const data = { ...base, self: false };
  return [{ class: chatClass(msg, rc), data, domain: "chat", event: "chat/in", text: chatText(msg) }];
}

function groupRow({ cls, event, text, data = {} }: GroupRow): LogDraft {
  return { class: cls, data, domain: "group", event, text };
}

export function groupDrafts(event: GroupEvent, _rc: RuleInput): Drafts {
  switch (event.type) {
    case "invite_received":
      return [groupRow({ cls: "wake", data: { from: event.from }, event: "group/invite", text: `${event.from} invites you to a group.` })];
    case "kicked":
      return [groupRow({ cls: "wake", event: "group/kicked", text: "You were removed from the group." })];
    case "group_destroyed":
      return [groupRow({ cls: "wake", event: "group/disbanded", text: "Your group was disbanded." })];
    case "group_list": {
      const members = event.members.map((member) => member.name);
      const text = `Group: ${members.join(", ")}; leader ${event.leader}.`;
      return [groupRow({ cls: "passive", data: { leader: event.leader, members }, event: "group/roster", text })];
    }
    case "leader_changed":
      return [groupRow({ cls: "passive", data: { leader: event.name }, event: "group/roster", text: `${event.name} is now the group leader.` })];
    case "invite_declined":
      return [groupRow({ cls: "passive", data: { declined: event.name }, event: "group/roster", text: `${event.name} declined your group invite.` })];
    default:
      return [];
  }
}

export function duelDrafts(event: DuelEvent, _rc: RuleInput): Drafts {
  if (event.type !== "duel_requested") return [];
  const { challenger } = event;
  const text = `${challenger} challenges you to a duel.`;
  return [{ class: "wake", data: { challenger }, domain: "social", event: "social/duel_request", text }];
}
```

`noSecrets` may flag `QUIET_SYSTEM` or `REGEX_SPECIALS` as a high-entropy
string. If it does, split the pattern into named `RegExp` constants joined
with `|` through `new RegExp([...].join("|"))` at the top level; do not add
an override.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/rules-chat.test.ts` → PASS (10 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/rules-chat.ts packages/harness/src/events/rules-chat.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness chat and group rules

Whispers, group chat and invites wake the agent; own echoes stay in the
log so the spike's self-whisper loop cannot return.
EOF
```

---
### Task L7: Combat, fight and life rules

**Files:**
- Modify: `packages/harness/src/events/rules-combat.ts` (replace the L5a stub bodies)
- Test: `packages/harness/src/events/rules-combat.test.ts`

**Interfaces:**
- Consumes: `CombatEvent` (with `attacker` from C0/C5), `CombatState`,
  `CycleEvent`, `EntityEvent`, `RecoveryEvent`, `TacticsEvent`,
  `TacticsOutcome` (C1), `ObjectType`, `UnitEntity` (`@tuicraft/core`);
  `LogClass`, `LogDraft` (`#harness/contract/log`); `Drafts`, `RuleInput`,
  `guidText`, `unitIds` (L5a); `testRuleInput`, `testLookup` (L5a fixtures).
- Produces: `combatDrafts`, `tacticsDrafts`, `cycleDrafts`, `recoveryDrafts`,
  `vitalsDrafts` with the L5a signatures.

Rules (design C.1, D.2, V.4 #3):

| Input | Row | Class |
|---|---|---|
| combat `attacked` (attacker = `event.attacker`, else the last of `state.attackers`) | `combat/attacked` | wake when no run is active, else log; the guard keeps it to one per attacker per 30 s |
| combat `attack_started` | `combat/attack_start` | log |
| combat `cast_succeeded`, `cast_failed`, `cast_interrupted` | `combat/cast` | log |
| combat `xp` (new `lastXp.at`) | `combat/kill_credit` (kind `kill` only), then `xp/gain` | passive |
| combat `level_up` (new `lastLevelUp.at`) | `xp/level_up` | passive |
| combat `aura` | `aura/gain` / `aura/fade` by slot diff against `memo.auras` | log |
| entity `update` of self with `health` changed | `life/low_health` when HP falls under 50 % or 25 % (one row, the lowest line); a line re-arms 10 points above it | wake when no run is active, else log |
| tactics `started` | `fight/start` (`hpBefore`, `manaBefore` from `lookup.selfVitals`) | passive inside a cycle, else log |
| tactics `outcome`, or `stopped` without an outcome | `fight/end` with `durationMs` | passive inside a cycle, else log |
| cycle `started`, `resumed` / `stopped` | sets / clears `memo.cycleActive`; no row | — |
| cycle `target_done`, `loot_done`, `recovery`, `recovered` | `run/progress` | log |
| recovery `life_observed`, life changes to `dead` | `life/dead` with `killer` from `lookup.lastAttacker()` | wake |
| life changes to `ghost` | `life/released` | wake |
| life changes to `alive` from `dead` or `ghost` | `life/alive` | wake |
| recovery `resurrection_offered` | `life/resurrect_offer` | passive |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  type CombatAura,
  type CombatEvent,
  type CombatState,
  type EntityEvent,
  ObjectType,
  type RecoveryEvent,
  type TacticsEvent,
  type UnitEntity,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { combatDrafts, cycleDrafts, recoveryDrafts, tacticsDrafts, vitalsDrafts } from "#harness/events/rules-combat";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();
const combatBase = handle.getCombatState();
const recoveryBase = handle.getRecoveryState();
const cycleBase = handle.getCycleState();
const stalker = testLookup({ unitLevel: () => 7, unitName: () => "Springpaw Stalker" });

function combat(type: CombatEvent["type"], state: Partial<CombatState> = {}, over: Partial<CombatEvent> = {}): CombatEvent {
  return { state: { ...combatBase, ...state }, type, ...over };
}

function aura(slot: number, spellId: number): CombatAura {
  return { caster: 1n, duration: 30_000, flags: 0, level: 10, slot, spellId, stacks: 1, timeLeft: 30_000 };
}

function self(health: number, guid = 1n): UnitEntity {
  return {
    class_: 5,
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    gender: 0,
    guid,
    health,
    level: 10,
    maxHealth: 100,
    maxPower: [],
    name: "Fgk",
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

function hp(health: number, changed = ["health"]): EntityEvent {
  return { changed, entity: self(health), type: "update" };
}

function life(state: RecoveryEvent["state"]["life"]): RecoveryEvent {
  return { at: 0, state: { ...recoveryBase, life: state }, type: "life_observed" };
}

describe("combatDrafts", () => {
  test("an attack wakes only while no run is active", () => {
    const rc = testRuleInput({ lookup: stalker });
    expect(combatDrafts(combat("attacked", {}, { attacker: 0x2an }), rc)).toEqual([
      {
        class: "wake",
        data: { attacker: "2a", name: "Springpaw Stalker" },
        domain: "combat",
        event: "combat/attacked",
        guid: "2a",
        ref: "u42",
        text: "Springpaw Stalker u42 attacks you.",
      },
    ]);
    expect(combatDrafts(combat("attacked", {}, { attacker: 0x2an }), { ...rc, runActive: true })[0]?.class).toBe("log");
  });

  test("attack start and casts are log rows", () => {
    const rc = testRuleInput({ lookup: stalker });
    expect(combatDrafts(combat("attack_started", { attackTarget: 0x2an }), rc)[0]).toMatchObject({ class: "log", event: "combat/attack_start", text: "You attack Springpaw Stalker u42." });
    const lastOutcome = { at: 0, kind: "cast" as const, reason: "out_of_range", spellId: 585, status: "failed" as const, target: 0x2an };
    const failed = combat("cast_failed", { lastOutcome }, { reason: "cast_failed:out_of_range", spellName: "Smite" });
    expect(combatDrafts(failed, rc)).toEqual([
      {
        class: "log",
        data: { name: "Smite", reason: "cast_failed:out_of_range", result: "failed", spellId: 585, target: "2a" },
        domain: "combat",
        event: "combat/cast",
        text: "Cast Smite failed (cast_failed:out_of_range).",
      },
    ]);
    expect(combatDrafts(combat("cast_sent"), rc)).toEqual([]);
  });

  test("a kill gives kill credit and xp once", () => {
    const rc = testRuleInput({ lookup: testLookup({ experience: () => ({ next: 8000, xp: 4200 }), unitName: () => "Springpaw Stalker" }) });
    const event = combat("xp", { lastXp: { at: 10, kind: "kill", total: 130, victim: 0x2an } });
    expect(combatDrafts(event, rc)).toEqual([
      { class: "passive", data: { name: "Springpaw Stalker", xp: 130 }, domain: "combat", event: "combat/kill_credit", guid: "2a", ref: "u42", text: "Kill credit: Springpaw Stalker u42 (+130 XP)." },
      { class: "passive", data: { amount: 130, next: 8000, source: "kill", total: 4200, victim: "2a" }, domain: "xp", event: "xp/gain", text: "You gain 130 XP." },
    ]);
    expect(combatDrafts(event, rc)).toEqual([]);
  });

  test("a level up is passive once", () => {
    const rc = testRuleInput();
    const event = combat("level_up", { lastLevelUp: { at: 11, healthDelta: 10, level: 11, powerDeltas: [], statDeltas: [] } });
    expect(combatDrafts(event, rc)[0]).toMatchObject({ class: "passive", data: { level: 11 }, event: "xp/level_up", text: "You reached level 11." });
    expect(combatDrafts(event, rc)).toEqual([]);
  });

  test("auras are logged as gains and fades by slot", () => {
    const rc = testRuleInput();
    const events = (auras: CombatAura[]) => combatDrafts(combat("aura", { auras }), rc).map((draft) => [draft.event, draft.data["spellId"]]);
    expect(events([aura(0, 433)])).toEqual([["aura/gain", 433]]);
    expect(events([])).toEqual([["aura/fade", 433]]);
    expect(events([aura(0, 433), aura(1, 1243)])).toEqual([
      ["aura/gain", 433],
      ["aura/gain", 1243],
    ]);
  });
});

describe("vitalsDrafts", () => {
  test("wakes once per line and re-arms 10 points above it", () => {
    const rc = testRuleInput();
    const lines = (health: number) => vitalsDrafts(hp(health), rc).map((draft) => draft.data["threshold"]);
    expect(lines(80)).toEqual([]);
    expect(lines(45)).toEqual([50]);
    expect(lines(40)).toEqual([]);
    expect(lines(20)).toEqual([25]);
    expect(lines(70)).toEqual([]);
    expect(lines(40)).toEqual([50]);
  });

  test("a big drop gives one row at the lowest line", () => {
    const [draft] = vitalsDrafts(hp(20), testRuleInput());
    expect(draft).toEqual({
      class: "wake",
      data: { hp: 20, maxHp: 100, pct: 20, threshold: 25 },
      domain: "life",
      event: "life/low_health",
      text: "You are at 20% HP (20/100).",
    });
    expect(vitalsDrafts(hp(20), testRuleInput({ runActive: true }))[0]?.class).toBe("log");
  });

  test("ignores other units, other fields and death", () => {
    const rc = testRuleInput();
    expect(vitalsDrafts({ changed: ["health"], entity: self(10, 7n), type: "update" }, rc)).toEqual([]);
    expect(vitalsDrafts(hp(10, ["level"]), rc)).toEqual([]);
    expect(vitalsDrafts(hp(0), rc)).toEqual([]);
  });
});

describe("tacticsDrafts and cycleDrafts", () => {
  const started: TacticsEvent = { framing: "none", instruction: "fight", runId: "t1", targetGuid: "0x2a", type: "started" };

  test("logs a fight start and end with its duration", () => {
    const rc = testRuleInput({ lookup: testLookup({ selfVitals: () => ({ hp: 190, maxHp: 217, maxPower: 300, power: 250 }), unitLevel: () => 7, unitName: () => "Springpaw Stalker" }) });
    expect(tacticsDrafts(started, rc)).toEqual([
      {
        class: "log",
        data: { hpBefore: 190, jevRun: "t1", level: 7, manaBefore: 250, maxHp: 217, name: "Springpaw Stalker", target: "2a" },
        domain: "fight",
        event: "fight/start",
        guid: "2a",
        ref: "u42",
        text: "Fight started: Springpaw Stalker u42.",
      },
    ]);
    const end = tacticsDrafts({ reason: "server_kill_credit", runId: "t1", status: "completed", type: "outcome" }, { ...rc, now: rc.now + 9000 });
    expect(end[0]).toMatchObject({ data: { durationMs: 9000, outcome: "completed", reason: "server_kill_credit" }, event: "fight/end", text: "Fight ended: Springpaw Stalker u42 completed (server_kill_credit)." });
    expect(tacticsDrafts({ reason: "done", runId: "t1", state: handle.getTacticsState(), type: "stopped" }, rc)).toEqual([]);
  });

  test("a stop without an outcome ends the fight with the last outcome", () => {
    const rc = testRuleInput();
    tacticsDrafts(started, rc);
    const state = { ...handle.getTacticsState(), lastOutcome: { reason: "target_lost", status: "blocked" as const } };
    const [end] = tacticsDrafts({ reason: "halt", runId: "t1", state, type: "stopped" }, rc);
    expect(end?.data).toMatchObject({ outcome: "blocked", reason: "target_lost" });
  });

  test("fights inside a cycle are passive; cycle steps are run progress", () => {
    const rc = testRuleInput();
    expect(cycleDrafts({ at: 0, state: cycleBase, type: "started" }, rc)).toEqual([]);
    expect(tacticsDrafts(started, rc)[0]?.class).toBe("passive");
    const done = cycleDrafts({ at: 0, state: { ...cycleBase, maxStarts: 3, startsUsed: 1 }, type: "target_done" }, rc);
    expect(done).toEqual([
      { class: "log", data: { cycle: "target_done", maxStarts: 3, startsUsed: 1 }, domain: "run", event: "run/progress", text: "cycle target done (1 of 3 fights)" },
    ]);
    cycleDrafts({ at: 0, state: cycleBase, type: "stopped" }, rc);
    expect(tacticsDrafts({ ...started, runId: "t2" }, rc)[0]?.class).toBe("log");
  });
});

describe("recoveryDrafts", () => {
  test("wakes on each change of life only", () => {
    const rc = testRuleInput({ lookup: testLookup({ lastAttacker: () => 0x2an, unitName: () => "Springpaw Stalker" }) });
    expect(recoveryDrafts(life("alive"), rc)).toEqual([]);
    expect(recoveryDrafts(life("dead"), rc)[0]).toMatchObject({
      class: "wake",
      data: { killer: "2a", killerName: "Springpaw Stalker" },
      event: "life/dead",
      ref: "u42",
      text: "You died (last hit by Springpaw Stalker u42).",
    });
    expect(recoveryDrafts(life("dead"), rc)).toEqual([]);
    expect(recoveryDrafts(life("ghost"), rc)[0]).toMatchObject({ class: "wake", event: "life/released" });
    expect(recoveryDrafts(life("alive"), rc)[0]).toMatchObject({ class: "wake", data: { from: "ghost" }, event: "life/alive", text: "You are alive again." });
  });

  test("a resurrection offer is passive", () => {
    const resurrection = { delayMs: undefined, guid: 7n, name: "Bob", readyAt: undefined, receivedAt: 0, reserved: 0, response: "unanswered" as const, sickness: 0 };
    const event: RecoveryEvent = { at: 0, state: { ...recoveryBase, resurrection }, type: "resurrection_offered" };
    expect(recoveryDrafts(event, testRuleInput())).toEqual([
      { class: "passive", data: { from: "Bob" }, domain: "life", event: "life/resurrect_offer", text: "Bob offers to resurrect you." },
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/rules-combat.test.ts`
Expected: FAIL; `expect(received).toEqual(expected)` gets `[]` from the L5a stubs.

- [ ] **Step 3: Implement** (replace the whole file)

```ts
import type {
  CombatEvent,
  CycleEvent,
  EntityEvent,
  RecoveryEvent,
  TacticsEvent,
  TacticsOutcome,
} from "@tuicraft/core";
import type { LogClass, LogDraft } from "#harness/contract/log";
import { type Drafts, guidText, type RuleInput, unitIds } from "#harness/events/rules";

const LOW_HEALTH = [50, 25];
const REARM_POINTS = 10;
const CYCLE_STEPS = new Set<CycleEvent["type"]>(["target_done", "loot_done", "recovery", "recovered"]);

function named(guid: bigint, rc: RuleInput): string {
  return `${rc.lookup.unitName(guid) ?? "A unit"} ${rc.refOf(guid)}`;
}

function attackedDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const attacker = event.attacker ?? event.state.attackers.at(-1);
  const name = attacker === undefined ? undefined : rc.lookup.unitName(attacker);
  const text = `${attacker === undefined ? "A unit" : named(attacker, rc)} attacks you.`;
  const data = { attacker: attacker === undefined ? undefined : guidText(attacker), name };
  const cls = rc.runActive ? "log" : "wake";
  return [{ class: cls, data, domain: "combat", event: "combat/attacked", ...unitIds(attacker, rc), text }];
}

function attackStartDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const target = event.state.attackTarget;
  if (target === undefined) return [];
  const text = `You attack ${named(target, rc)}.`;
  const data = { name: rc.lookup.unitName(target), target: guidText(target) };
  return [{ class: "log", data, domain: "combat", event: "combat/attack_start", text }];
}

function castDrafts(event: CombatEvent): Drafts {
  const outcome = event.state.lastOutcome;
  const result = event.type.slice("cast_".length);
  const name = event.spellName ?? `spell ${outcome?.spellId ?? "?"}`;
  const why = event.reason ? ` (${event.reason})` : "";
  const target = outcome?.target === undefined ? undefined : guidText(outcome.target);
  const data = { name, reason: event.reason, result, spellId: outcome?.spellId, target };
  return [{ class: "log", data, domain: "combat", event: "combat/cast", text: `Cast ${name} ${result}${why}.` }];
}

function xpDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const xp = event.state.lastXp;
  if (!xp || rc.memo.xpAt === xp.at) return [];
  rc.memo.xpAt = xp.at;
  const { next, xp: total } = rc.lookup.experience();
  const gain: LogDraft = {
    class: "passive",
    data: { amount: xp.total, next, source: xp.kind, total, victim: guidText(xp.victim) },
    domain: "xp",
    event: "xp/gain",
    text: `You gain ${xp.total} XP.`,
  };
  if (xp.kind !== "kill") return [gain];
  const credit: LogDraft = {
    class: "passive",
    data: { name: rc.lookup.unitName(xp.victim), xp: xp.total },
    domain: "combat",
    event: "combat/kill_credit",
    ...unitIds(xp.victim, rc),
    text: `Kill credit: ${named(xp.victim, rc)} (+${xp.total} XP).`,
  };
  return [credit, gain];
}

function levelDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const up = event.state.lastLevelUp;
  if (!up || rc.memo.levelAt === up.at) return [];
  rc.memo.levelAt = up.at;
  return [{ class: "passive", data: { level: up.level }, domain: "xp", event: "xp/level_up", text: `You reached level ${up.level}.` }];
}

function auraRow(event: "aura/gain" | "aura/fade", data: { slot: number; spellId: number }): LogDraft {
  const verb = event === "aura/gain" ? "gained" : "faded";
  return { class: "log", data, domain: "aura", event, text: `Aura ${data.spellId} ${verb}.` };
}

function auraDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const current = new Map(event.state.auras.map((aura) => [aura.slot, aura.spellId]));
  const drafts: Drafts = [];
  for (const [slot, spellId] of rc.memo.auras)
    if (current.get(slot) !== spellId) drafts.push(auraRow("aura/fade", { slot, spellId }));
  for (const [slot, spellId] of current)
    if (rc.memo.auras.get(slot) !== spellId) drafts.push(auraRow("aura/gain", { slot, spellId }));
  rc.memo.auras = current;
  return drafts;
}

export function combatDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  switch (event.type) {
    case "attacked":
      return attackedDrafts(event, rc);
    case "attack_started":
      return attackStartDrafts(event, rc);
    case "cast_succeeded":
    case "cast_failed":
    case "cast_interrupted":
      return castDrafts(event);
    case "xp":
      return xpDrafts(event, rc);
    case "level_up":
      return levelDrafts(event, rc);
    case "aura":
      return auraDrafts(event, rc);
    default:
      return [];
  }
}

function armed(rc: RuleInput, line: number): boolean {
  return rc.memo.lowHealth.get(line) ?? true;
}

export function vitalsDrafts(event: EntityEvent, rc: RuleInput): Drafts {
  if (event.type !== "update" || event.entity.guid !== rc.selfGuid || !event.changed.includes("health")) return [];
  const { entity } = event;
  if (!("health" in entity) || entity.health <= 0 || entity.maxHealth <= 0) return [];
  const pct = (entity.health * 100) / entity.maxHealth;
  const crossed = LOW_HEALTH.filter((line) => armed(rc, line) && pct < line);
  for (const line of LOW_HEALTH) if (pct >= line + REARM_POINTS) rc.memo.lowHealth.set(line, true);
  for (const line of crossed) rc.memo.lowHealth.set(line, false);
  if (crossed.length === 0) return [];
  const shown = Math.round(pct);
  const data = { hp: entity.health, maxHp: entity.maxHealth, pct: shown, threshold: Math.min(...crossed) };
  const text = `You are at ${shown}% HP (${entity.health}/${entity.maxHealth}).`;
  return [{ class: rc.runActive ? "log" : "wake", data, domain: "life", event: "life/low_health", text }];
}

function fightClass(rc: RuleInput): LogClass {
  return rc.memo.cycleActive ? "passive" : "log";
}

function fightStart(runId: string, guid: bigint, rc: RuleInput): Drafts {
  rc.memo.fights.set(runId, { at: rc.now, guid });
  const vitals = rc.lookup.selfVitals();
  const data = {
    hpBefore: vitals?.hp,
    jevRun: runId,
    level: rc.lookup.unitLevel(guid),
    manaBefore: vitals?.power,
    maxHp: vitals?.maxHp,
    name: rc.lookup.unitName(guid),
    target: guidText(guid),
  };
  const text = `Fight started: ${named(guid, rc)}.`;
  return [{ class: fightClass(rc), data, domain: "fight", event: "fight/start", ...unitIds(guid, rc), text }];
}

function fightEnd(runId: string, outcome: TacticsOutcome, rc: RuleInput): Drafts {
  const fight = rc.memo.fights.get(runId);
  if (!fight) return [];
  rc.memo.fights.delete(runId);
  const { guid } = fight;
  const data = {
    durationMs: rc.now - fight.at,
    jevRun: runId,
    name: rc.lookup.unitName(guid),
    outcome: outcome.status,
    reason: outcome.reason,
    target: guidText(guid),
  };
  const text = `Fight ended: ${named(guid, rc)} ${outcome.status} (${outcome.reason}).`;
  return [{ class: fightClass(rc), data, domain: "fight", event: "fight/end", ...unitIds(guid, rc), text }];
}

export function tacticsDrafts(event: TacticsEvent, rc: RuleInput): Drafts {
  if (event.type === "started") return fightStart(event.runId, BigInt(event.targetGuid), rc);
  if (event.type === "outcome") return fightEnd(event.runId, { reason: event.reason, status: event.status }, rc);
  if (event.type !== "stopped") return [];
  const outcome: TacticsOutcome = event.state.lastOutcome ?? { reason: event.reason, status: "failed" };
  return fightEnd(event.runId, outcome, rc);
}

export function cycleDrafts(event: CycleEvent, rc: RuleInput): Drafts {
  if (event.type === "started" || event.type === "resumed") rc.memo.cycleActive = true;
  if (event.type === "stopped") rc.memo.cycleActive = false;
  if (!CYCLE_STEPS.has(event.type)) return [];
  const { maxStarts, startsUsed } = event.state;
  const text = `cycle ${event.type.replace("_", " ")} (${startsUsed} of ${maxStarts} fights)`;
  const data = { cycle: event.type, maxStarts, startsUsed };
  return [{ class: "log", data, domain: "run", event: "run/progress", text }];
}

function deathDraft(event: RecoveryEvent, rc: RuleInput): LogDraft {
  const killer = rc.lookup.lastAttacker();
  const by = killer === undefined ? "" : ` (last hit by ${named(killer, rc)})`;
  const data = {
    killer: killer === undefined ? undefined : guidText(killer),
    killerName: killer === undefined ? undefined : rc.lookup.unitName(killer),
    pose: event.state.reclaim.pose,
  };
  return { class: "wake", data, domain: "life", event: "life/dead", ...unitIds(killer, rc), text: `You died${by}.` };
}

function lifeDrafts(event: RecoveryEvent, rc: RuleInput): Drafts {
  const { life, graveyard } = event.state;
  const before = rc.memo.life;
  rc.memo.life = life;
  if (life === before) return [];
  if (life === "dead") return [deathDraft(event, rc)];
  if (life === "ghost") {
    const text = "You released your spirit. You are a ghost at the graveyard.";
    return [{ class: "wake", data: { graveyard }, domain: "life", event: "life/released", text }];
  }
  if (life !== "alive" || (before !== "dead" && before !== "ghost")) return [];
  return [{ class: "wake", data: { from: before }, domain: "life", event: "life/alive", text: "You are alive again." }];
}

export function recoveryDrafts(event: RecoveryEvent, rc: RuleInput): Drafts {
  if (event.type === "life_observed") return lifeDrafts(event, rc);
  if (event.type !== "resurrection_offered") return [];
  const from = event.state.resurrection?.name;
  const text = `${from ?? "Someone"} offers to resurrect you.`;
  return [{ class: "passive", data: { from }, domain: "life", event: "life/resurrect_offer", text }];
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/rules-combat.test.ts` → PASS (14 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.
The file is about 250 non-blank lines, under the 500 cap.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/rules-combat.ts packages/harness/src/events/rules-combat.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness combat and life rules

Deaths, low health and idle attacks wake the agent; kills, xp and fights
inside a cycle become passive lines (design C.1).
EOF
```

---
### Task L8a: Control, vendor, trainer, entity, packet and notice rules

**Files:**
- Modify: `packages/harness/src/events/rules-world.ts` (replace the L5a stub bodies)
- Test: `packages/harness/src/events/rules-world.test.ts`

**Interfaces:**
- Consumes: `ControlEvent` (with `"place_changed"` from C0), `ControlPose`,
  `EntityEvent`, `NoticeEvent` (C0), `TrainerEvent` (C1), `VendorEvent` (C1),
  `VendorOutcome`, `TrainerOutcome`, `ObjectType` (`@tuicraft/core`);
  `LogDraft` (`#harness/contract/log`); `Drafts`, `PoseMemo`, `RuleInput`,
  `guidText`, `unitIds` (L5a).
- Produces: `controlDrafts`, `vendorDrafts`, `trainerDrafts`, `entityDrafts`,
  `packetErrorDrafts`, `noticeDrafts` with the L5a signatures.

Rules (design C.1, D.1, D.2):

| Input | Row | Class |
|---|---|---|
| control `server_correction`, reason `teleport`, `near_teleport`, `new_world` | `control/teleport` | passive |
| control `server_correction`, other reason | `control/server_correction` with `from`, `to`, `driftYd` | passive over 5 yd, else log |
| control `movement_started` / `movement_stopped` | `control/move_start` / `control/move_stop` | log |
| control `place_changed` | `control/place_changed` (names from `lookup.place()`) | log |
| vendor `listed` | `vendor/list` | log |
| vendor `bought`, `sold`, `repaired`, `refused`, `partial`, `unanswered` | `vendor/buy`, `vendor/sell`, `vendor/repair` or `vendor/list` by `lastOutcome.action` | passive |
| trainer `listed` | `trainer/list` | log |
| trainer `trained`, `refused`, `unanswered` of a `train` request | `trainer/learn` | passive |
| entity `appear` / `disappear`, only with `--log-entities` | `entity/appear` / `entity/disappear` | log |
| packet error | `packet/error` (`sink.human` too, L5b) | log |
| notice | `notice/not_implemented`, `ts` = `event.at` | log |

Every control event also stores the self pose in `memo.pose`, so the next
correction can measure its drift.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  type ControlEvent,
  type ControlPose,
  ObjectType,
  type TrainerEvent,
  type VendorEvent,
  type VendorOutcome,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import {
  controlDrafts,
  entityDrafts,
  noticeDrafts,
  packetErrorDrafts,
  trainerDrafts,
  vendorDrafts,
} from "#harness/events/rules-world";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();
const controlBase = handle.getControlState();
const vendorBase = handle.getVendorState();

function pose(x: number): ControlPose {
  return { mapId: 530, orientation: 0, source: "server", updatedAt: 0, x, y: 0, z: 0 };
}

function control(type: ControlEvent["type"], x?: number, reason?: string): ControlEvent {
  const at = x === undefined ? undefined : pose(x);
  return { reason, state: { ...controlBase, pose: at, serverPose: at }, type };
}

function vendor(type: VendorEvent["type"], lastOutcome?: VendorOutcome): VendorEvent {
  return { at: 0, state: { ...vendorBase, lastOutcome }, type };
}

const bought: VendorOutcome = {
  action: "buy",
  coinageAfter: 475,
  moneyDelta: -25,
  observedAt: 0,
  reason: undefined,
  request: { action: "buy", answer: undefined, coinageBefore: 500, count: 1, guid: 0x10n, itemId: 159, maxPrice: 25, minPrice: 25, requestedAt: 0, slot: 1 },
  status: "confirmed",
};

function trainer(type: TrainerEvent["type"], trained: boolean): TrainerEvent {
  const request = { action: "train" as const, coinageBefore: 1000, cost: 100, guid: 0x11n, learnedBefore: [], requestedAt: 0, spellId: 591, succeeded: trained };
  const lastOutcome = { action: "train" as const, coinageAfter: 900, learnedSpells: [591], moneyDelta: -100, observedAt: 0, reason: undefined, request, status: "confirmed" as const };
  return { at: 0, state: { coinage: 900, lastOutcome, level: 10, offer: undefined, pending: undefined }, type };
}

describe("controlDrafts", () => {
  test("measures correction drift against the last pose", () => {
    const rc = testRuleInput();
    expect(controlDrafts(control("movement_started", 0), rc)[0]).toMatchObject({ class: "log", event: "control/move_start" });
    const [far] = controlDrafts(control("server_correction", 8, "observed"), rc);
    expect(far).toMatchObject({ class: "passive", data: { driftYd: 8, reason: "observed" }, event: "control/server_correction", text: "The server corrected your position by 8 yd." });
    const [near] = controlDrafts(control("server_correction", 10, "observed"), rc);
    expect(near).toMatchObject({ class: "log", data: { driftYd: 2 } });
  });

  test("a teleport is its own passive row", () => {
    expect(controlDrafts(control("server_correction", 100, "teleport"), testRuleInput())).toEqual([
      { class: "passive", data: { reason: "teleport", to: { mapId: 530, x: 100, y: 0, z: 0 } }, domain: "control", event: "control/teleport", text: "You were moved (teleport) to 100, 0." },
    ]);
  });

  test("logs stops and place changes and drops the rest", () => {
    const rc = testRuleInput({ lookup: testLookup({ place: () => ({ area: "Fairbreeze Village", zone: "Eversong Woods" }) }) });
    expect(controlDrafts(control("movement_stopped", 3, "arrived"), rc)[0]).toMatchObject({ data: { cause: "arrived" }, event: "control/move_stop", text: "You stop (arrived)." });
    expect(controlDrafts(control("place_changed", 3), rc)).toEqual([
      { class: "log", data: { area: "Fairbreeze Village", zone: "Eversong Woods" }, domain: "control", event: "control/place_changed", text: "You entered Fairbreeze Village, Eversong Woods." },
    ]);
    expect(controlDrafts(control("facing_changed", 3), rc)).toEqual([]);
  });
});

describe("vendorDrafts and trainerDrafts", () => {
  test("a purchase is passive with the item name", () => {
    const rc = testRuleInput({ lookup: testLookup({ itemName: () => "Refreshing Spring Water" }) });
    expect(vendorDrafts(vendor("bought", bought), rc)).toEqual([
      {
        class: "passive",
        data: { cost: -25, count: 1, itemId: 159, name: "Refreshing Spring Water", npc: "10", outcome: "confirmed", reason: undefined },
        domain: "vendor",
        event: "vendor/buy",
        guid: "10",
        ref: "u16",
        text: "Vendor buy Refreshing Spring Water x1: confirmed.",
      },
    ]);
    expect(vendorDrafts(vendor("buy_requested", bought), rc)).toEqual([]);
  });

  test("a vendor list is a log row", () => {
    const window = { emptyReason: undefined, guid: 0x10n, invalidatedReason: undefined, items: [], openedAt: 0 };
    const event: VendorEvent = { at: 0, state: { ...vendorBase, window }, type: "listed" };
    expect(vendorDrafts(event, testRuleInput())[0]).toMatchObject({ class: "log", data: { items: 0, npc: "10" }, event: "vendor/list", text: "The vendor lists 0 items." });
  });

  test("a trained spell is passive; a list is log", () => {
    expect(trainerDrafts(trainer("trained", true), testRuleInput())[0]).toMatchObject({
      class: "passive",
      data: { cost: 100, learned: [591], outcome: "confirmed", spellId: 591 },
      event: "trainer/learn",
      text: "Train spell 591: confirmed.",
    });
    expect(trainerDrafts(trainer("listed", true), testRuleInput())[0]).toMatchObject({ class: "log", event: "trainer/list", text: "The trainer lists 0 spells." });
    expect(trainerDrafts(trainer("train_requested", true), testRuleInput())).toEqual([]);
  });
});

describe("entity, packet and notice rules", () => {
  test("entity rows only with --log-entities", () => {
    const entity = { entry: 15366, guid: 0x2an, name: "Springpaw Stalker", objectType: ObjectType.UNIT, position: undefined, rawFields: new Map(), scale: 1 };
    const on = { ...testRuleInput(), logEntities: true };
    expect(entityDrafts({ entity, type: "appear" }, { ...on, logEntities: false })).toEqual([]);
    expect(entityDrafts({ entity, type: "appear" }, on)).toEqual([
      { class: "log", data: { entry: 15366, name: "Springpaw Stalker", objectType: ObjectType.UNIT }, domain: "entity", event: "entity/appear", guid: "2a", text: "Springpaw Stalker came into view." },
    ]);
    expect(entityDrafts({ guid: 0x2an, name: "Springpaw Stalker", type: "disappear" }, on)[0]).toMatchObject({ event: "entity/disappear", guid: "2a", text: "Springpaw Stalker left view." });
    expect(entityDrafts({ changed: ["health"], entity, type: "update" }, on)).toEqual([]);
  });

  test("packet errors and notices are log rows", () => {
    expect(packetErrorDrafts(0x1f6, new Error("short read"), testRuleInput())).toEqual([
      { class: "log", data: { message: "short read", opcode: 0x1f6 }, domain: "packet", event: "packet/error", text: "Packet 0x1f6 failed: short read" },
    ]);
    const notice = { at: 42, label: "SMSG_FOO", opcode: 0x123, text: "[tuicraft] SMSG_FOO is not yet implemented", type: "not_implemented" as const };
    expect(noticeDrafts(notice, testRuleInput())).toEqual([
      { class: "log", data: { label: "SMSG_FOO", opcode: 0x123 }, domain: "notice", event: "notice/not_implemented", text: notice.text, ts: 42 },
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/rules-world.test.ts`
Expected: FAIL; the first `toMatchObject` gets `undefined` from the L5a stubs.

- [ ] **Step 3: Implement** (replace the whole file)

```ts
import type {
  ControlEvent,
  ControlPose,
  EntityEvent,
  NoticeEvent,
  TrainerEvent,
  VendorEvent,
  VendorOutcome,
} from "@tuicraft/core";
import type { LogDraft, LogEvent } from "#harness/contract/log";
import { type Drafts, guidText, type PoseMemo, type RuleInput, unitIds } from "#harness/events/rules";

const TELEPORTS = new Set(["teleport", "near_teleport", "new_world"]);
const DRIFT_PASSIVE_YD = 5;
const VENDOR_SETTLED = new Set<VendorEvent["type"]>(["bought", "sold", "repaired", "refused", "partial", "unanswered"]);
const TRAINER_SETTLED = new Set<TrainerEvent["type"]>(["trained", "refused", "unanswered"]);
const VENDOR_EVENTS: Record<VendorOutcome["action"], LogEvent> = {
  buy: "vendor/buy",
  list: "vendor/list",
  repair: "vendor/repair",
  sell: "vendor/sell",
};

type Correction = { before: PoseMemo | undefined; to: PoseMemo | undefined; reason: string };

function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function poseMemo(pose: ControlPose | undefined): PoseMemo | undefined {
  return pose && { mapId: pose.mapId, x: tenth(pose.x), y: tenth(pose.y), z: tenth(pose.z) };
}

function where(pose: PoseMemo | undefined): string {
  return pose ? `${Math.round(pose.x)}, ${Math.round(pose.y)}` : "an unknown position";
}

function drift(from: PoseMemo | undefined, to: PoseMemo | undefined): number {
  if (!(from && to)) return 0;
  return tenth(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
}

function correction({ before, to, reason }: Correction): LogDraft {
  if (TELEPORTS.has(reason)) {
    const text = `You were moved (${reason}) to ${where(to)}.`;
    return { class: "passive", data: { reason, to }, domain: "control", event: "control/teleport", text };
  }
  const driftYd = drift(before, to);
  const text = `The server corrected your position by ${driftYd} yd.`;
  const cls = driftYd > DRIFT_PASSIVE_YD ? "passive" : "log";
  return { class: cls, data: { driftYd, from: before, reason, to }, domain: "control", event: "control/server_correction", text };
}

function moveRow(event: ControlEvent, pose: PoseMemo | undefined): LogDraft {
  const cause = event.reason;
  if (event.type === "movement_started")
    return { class: "log", data: { cause, pose }, domain: "control", event: "control/move_start", text: "You start to move." };
  const text = cause ? `You stop (${cause}).` : "You stop.";
  return { class: "log", data: { cause, pose }, domain: "control", event: "control/move_stop", text };
}

function placeRow(rc: RuleInput): LogDraft {
  const { area, zone } = rc.lookup.place();
  const name = [area, zone].filter((part) => part !== undefined).join(", ") || "an unknown area";
  return { class: "log", data: { area, zone }, domain: "control", event: "control/place_changed", text: `You entered ${name}.` };
}

export function controlDrafts(event: ControlEvent, rc: RuleInput): Drafts {
  const before = rc.memo.pose;
  const pose = poseMemo(event.state.pose);
  rc.memo.pose = pose ?? before;
  if (event.type === "server_correction") {
    const to = poseMemo(event.state.serverPose) ?? pose;
    return [correction({ before, reason: event.reason ?? "observed", to })];
  }
  if (event.type === "movement_started" || event.type === "movement_stopped") return [moveRow(event, pose)];
  if (event.type === "place_changed") return [placeRow(rc)];
  return [];
}

function vendorDeal(outcome: VendorOutcome, rc: RuleInput): LogDraft {
  const { action, moneyDelta, reason, request, status } = outcome;
  const itemId = "itemId" in request ? request.itemId : undefined;
  const count = "count" in request ? request.count : undefined;
  const name = itemId === undefined ? undefined : rc.lookup.itemName(itemId);
  const what = [name ?? (itemId === undefined ? undefined : `item ${itemId}`), count === undefined ? undefined : `x${count}`];
  const words = [`Vendor ${action}`, ...what.filter((part) => part !== undefined)].join(" ");
  const why = reason ? ` (${reason})` : "";
  const data = { cost: moneyDelta, count, itemId, name, npc: guidText(request.guid), outcome: status, reason };
  return { class: "passive", data, domain: "vendor", event: VENDOR_EVENTS[action], ...unitIds(request.guid, rc), text: `${words}: ${status}${why}.` };
}

export function vendorDrafts(event: VendorEvent, rc: RuleInput): Drafts {
  const { lastOutcome, window } = event.state;
  if (event.type === "listed") {
    const items = window?.items.length ?? 0;
    const data = { items, npc: window && guidText(window.guid) };
    return [{ class: "log", data, domain: "vendor", event: "vendor/list", ...unitIds(window?.guid, rc), text: `The vendor lists ${items} items.` }];
  }
  if (!(lastOutcome && VENDOR_SETTLED.has(event.type))) return [];
  return [vendorDeal(lastOutcome, rc)];
}

export function trainerDrafts(event: TrainerEvent, rc: RuleInput): Drafts {
  const { lastOutcome, offer } = event.state;
  if (event.type === "listed") {
    const spells = offer?.spells.length ?? 0;
    return [{ class: "log", data: { spells }, domain: "trainer", event: "trainer/list", text: `The trainer lists ${spells} spells.` }];
  }
  if (!(lastOutcome && TRAINER_SETTLED.has(event.type))) return [];
  const request = lastOutcome.request;
  if (request.action !== "train") return [];
  const why = lastOutcome.reason ? ` (${lastOutcome.reason})` : "";
  const data = {
    cost: request.cost,
    learned: lastOutcome.learnedSpells,
    npc: guidText(request.guid),
    outcome: lastOutcome.status,
    reason: lastOutcome.reason,
    spellId: request.spellId,
  };
  const text = `Train spell ${request.spellId}: ${lastOutcome.status}${why}.`;
  return [{ class: "passive", data, domain: "trainer", event: "trainer/learn", ...unitIds(request.guid, rc), text }];
}

export function entityDrafts(event: EntityEvent, rc: RuleInput & { logEntities: boolean }): Drafts {
  if (!rc.logEntities || event.type === "update") return [];
  if (event.type === "disappear") {
    const text = `${event.name ?? "A unit"} left view.`;
    return [{ class: "log", data: { name: event.name }, domain: "entity", event: "entity/disappear", guid: guidText(event.guid), text }];
  }
  const { entity } = event;
  const data = { entry: entity.entry, name: entity.name, objectType: entity.objectType };
  const text = `${entity.name ?? `Object ${entity.entry}`} came into view.`;
  return [{ class: "log", data, domain: "entity", event: "entity/appear", guid: guidText(entity.guid), text }];
}

export function packetErrorDrafts(opcode: number, error: Error, _rc: RuleInput): Drafts {
  const text = `Packet 0x${opcode.toString(16)} failed: ${error.message}`;
  return [{ class: "log", data: { message: error.message, opcode }, domain: "packet", event: "packet/error", text }];
}

export function noticeDrafts(event: NoticeEvent, _rc: RuleInput): Drafts {
  const data = { label: event.label, opcode: event.opcode };
  return [{ class: "log", data, domain: "notice", event: "notice/not_implemented", text: event.text, ts: event.at }];
}
```

`[area, zone]` joins to `"Fairbreeze Village, Eversong Woods"`. The empty-string
fallback `|| "an unknown area"` is the one place a string is tested for
emptiness; if `mise lint` objects, write it as `name.length > 0 ? name : "an unknown area"`.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/rules-world.test.ts` → PASS (10 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/rules-world.ts packages/harness/src/events/rules-world.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness control and vendor rules

Pose corrections, teleports, vendor and trainer results, packet errors
and notices reach the game log as typed rows (design D.2).
EOF
```

---

### Task L8b: Quest, loot and money rules

**Files:**
- Modify: `packages/harness/src/events/rules-world-quest.ts` (replace the L5a stub bodies)
- Test: `packages/harness/src/events/rules-world-quest.test.ts`

**Interfaces:**
- Consumes: `QuestEvent`, `QuestState`, `RewardsEvent`, `RewardsState`
  (`@tuicraft/core`); `LogDraft` (`#harness/contract/log`); `Drafts`,
  `RuleInput`, `guidText` (L5a).
- Produces: `questDrafts`, `rewardsDrafts` with the L5a signatures.

Rules (design C.1, D.2): `quest/accepted`, `quest/progress`,
`quest/completed`, `quest/rewarded` are passive (a tool that reports them marks
`consumedBy`, and delivery skips them). `loot/item` (own pushes only) and
`money/change` are passive. `loot/open` and `loot/release` are log.
`money/change` comes from the inventory coinage in every rewards event
(before, after, delta); its `reason` is `loot` when a `money_notice` came in
the last 2 s, else `other`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type { QuestEvent, QuestState, RewardsEvent, RewardsState } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { MONEY_NOTICE_MS, questDrafts, rewardsDrafts } from "#harness/events/rules-world-quest";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();
const questBase = handle.getQuestState();
const rewardsBase: RewardsState = handle.getRewardsState();

function quest(type: QuestEvent["type"], state: Partial<QuestState> = {}): QuestEvent {
  return { questId: 8325, source: "packet", state: { ...questBase, ...state }, type };
}

function rewards(type: RewardsEvent["type"], state: Partial<RewardsState> = {}, coinage?: number): RewardsEvent {
  const inventory = { ...rewardsBase.inventory, coinage };
  return { at: 0, state: { ...rewardsBase, inventory, ...state }, type };
}

const titled = testRuleInput({ lookup: testLookup({ questTitle: () => "Unfortunate Measures" }) });

describe("questDrafts", () => {
  test("accept, complete and reward are passive rows with the title", () => {
    expect(questDrafts(quest("accepted"), titled)).toEqual([
      { class: "passive", data: { questId: 8325, title: "Unfortunate Measures" }, domain: "quest", event: "quest/accepted", text: "Quest accepted: Unfortunate Measures (#8325)." },
    ]);
    expect(questDrafts(quest("completed"), titled)[0]).toMatchObject({ event: "quest/completed", text: "Quest complete: Unfortunate Measures (#8325). Turn it in." });
    const lastReward = { arenaPoints: 0, at: 0, experience: 450, honor: 0, money: 75, questId: 8325, talents: 0 };
    expect(questDrafts(quest("rewarded", { lastReward }), titled)[0]).toMatchObject({
      data: { money: 75, xp: 450 },
      event: "quest/rewarded",
      text: "Quest rewarded: Unfortunate Measures (+450 XP, 75 copper).",
    });
  });

  test("kill and collect progress carry counts", () => {
    const kill = { at: 0, data: { currentCount: 3, encodedNpcOrGoId: 15366, guid: 0x2an, npcOrGoId: 15366, questId: 8325, requiredCount: 8 }, kind: "kill" as const };
    expect(questDrafts(quest("progress", { lastProgress: kill }), titled)[0]).toMatchObject({
      data: { count: 3, objective: 15366, required: 8 },
      event: "quest/progress",
      text: "Unfortunate Measures: 3/8.",
    });
    expect(questDrafts(quest("progress", { lastProgress: undefined }), titled)[0]?.text).toBe("Unfortunate Measures: progress.");
  });

  test("drops events without a quest id and other types", () => {
    expect(questDrafts({ ...quest("accepted"), questId: undefined }, titled)).toEqual([]);
    expect(questDrafts(quest("dialog"), titled)).toEqual([]);
  });
});

describe("rewardsDrafts", () => {
  test("an own item push is a passive loot row", () => {
    const rc = testRuleInput({ lookup: testLookup({ itemName: () => "Lynx Tooth" }) });
    const lastItemPush = { bagSlot: 255, count: 1, created: 0, guid: 1n, itemId: 20797, observedAt: 0, randomPropertyId: 0, randomSuffix: 0, received: 0, showInChat: 1, slot: 23, totalCount: 4 };
    expect(rewardsDrafts(rewards("item_push", { lastItemPush }), rc)).toEqual([
      {
        class: "passive",
        data: { bag: 255, count: 1, itemId: 20797, name: "Lynx Tooth", slot: 23, source: "loot", total: 4 },
        domain: "loot",
        event: "loot/item",
        text: "You receive Lynx Tooth x1.",
      },
    ]);
    expect(rewardsDrafts(rewards("item_push", { lastItemPush: { ...lastItemPush, guid: 9n } }), rc)).toEqual([]);
  });

  test("loot open and release are log rows", () => {
    const loot = { guid: 0x2an, invalidatedReason: undefined, items: [], lootType: 1, money: 12, openedAt: 0, phase: "open" as const };
    expect(rewardsDrafts(rewards("loot_opened", { loot }), testRuleInput())[0]).toMatchObject({ class: "log", data: { guid: "2a", money: 12, slots: 0 }, event: "loot/open" });
    const lastRelease = { guid: 0x2an, observedAt: 0, status: 1 };
    expect(rewardsDrafts(rewards("loot_release_observed", { lastRelease }), testRuleInput())[0]).toMatchObject({ class: "log", event: "loot/release" });
  });

  test("money changes come from coinage, with loot as the reason after a notice", () => {
    const rc = testRuleInput();
    expect(rewardsDrafts(rewards("inventory_observed", {}, 100), rc)).toEqual([]);
    expect(rewardsDrafts(rewards("money_notice", {}, 100), rc)).toEqual([]);
    expect(rewardsDrafts(rewards("inventory_observed", {}, 112), rc)).toEqual([
      { class: "passive", data: { after: 112, before: 100, delta: 12, reason: "loot" }, domain: "money", event: "money/change", text: "Money +12 copper (now 112)." },
    ]);
    const later = { ...rc, now: rc.now + MONEY_NOTICE_MS };
    expect(rewardsDrafts(rewards("inventory_observed", {}, 87), later)[0]?.data).toMatchObject({ delta: -25, reason: "other" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/rules-world-quest.test.ts`
Expected: FAIL with `Export named 'MONEY_NOTICE_MS' not found in module`.

- [ ] **Step 3: Implement** (replace the whole file)

```ts
import type { QuestEvent, QuestState, RewardsEvent, RewardsState } from "@tuicraft/core";
import type { LogDraft, LogEvent } from "#harness/contract/log";
import { type Drafts, guidText, type RuleInput } from "#harness/events/rules";

export const MONEY_NOTICE_MS = 2000;

type QuestRow = { event: LogEvent; data: Record<string, unknown>; text: string };
type Objective = { count: number; objective: number; required: number };
type ItemPush = NonNullable<RewardsState["lastItemPush"]>;

function questRow({ event, data, text }: QuestRow): LogDraft {
  return { class: "passive", data, domain: "quest", event, text };
}

function objective(progress: QuestState["lastProgress"]): Objective | undefined {
  if (progress?.kind === "kill") {
    const { currentCount, npcOrGoId, requiredCount } = progress.data;
    return { count: currentCount, objective: npcOrGoId, required: requiredCount };
  }
  if (progress?.kind === "collect") return { count: progress.carried, objective: progress.itemId, required: progress.required };
  return;
}

function progressRow(event: QuestEvent, base: Record<string, unknown>, label: string): LogDraft {
  const step = objective(event.state.lastProgress);
  const text = step ? `${label}: ${step.count}/${step.required}.` : `${label}: progress.`;
  return questRow({ data: { ...base, ...step }, event: "quest/progress", text });
}

function rewardRow(event: QuestEvent, base: Record<string, unknown>, label: string): LogDraft {
  const reward = event.state.lastReward;
  const xp = reward?.experience ?? 0;
  const money = reward?.money ?? 0;
  const text = `Quest rewarded: ${label} (+${xp} XP, ${money} copper).`;
  return questRow({ data: { ...base, money, xp }, event: "quest/rewarded", text });
}

export function questDrafts(event: QuestEvent, rc: RuleInput): Drafts {
  const { questId } = event;
  if (questId === undefined) return [];
  const title = rc.lookup.questTitle(questId);
  const label = title ?? `quest ${questId}`;
  const base = { questId, title };
  switch (event.type) {
    case "accepted":
      return [questRow({ data: base, event: "quest/accepted", text: `Quest accepted: ${label} (#${questId}).` })];
    case "completed":
      return [questRow({ data: base, event: "quest/completed", text: `Quest complete: ${label} (#${questId}). Turn it in.` })];
    case "progress":
      return [progressRow(event, base, label)];
    case "rewarded":
      return [rewardRow(event, base, label)];
    default:
      return [];
  }
}

function itemSource({ created, received }: ItemPush): string {
  if (created === 1) return "created";
  return received === 1 ? "received" : "loot";
}

function itemRow(push: ItemPush, rc: RuleInput): Drafts {
  if (push.guid !== rc.selfGuid) return [];
  const name = rc.lookup.itemName(push.itemId);
  const data = { bag: push.bagSlot, count: push.count, itemId: push.itemId, name, slot: push.slot, source: itemSource(push), total: push.totalCount };
  const text = `You receive ${name ?? `item ${push.itemId}`} x${push.count}.`;
  return [{ class: "passive", data, domain: "loot", event: "loot/item", text }];
}

function lootDrafts({ type, state }: RewardsEvent, rc: RuleInput): Drafts {
  const { lastItemPush, lastRelease, loot } = state;
  if (type === "item_push" && lastItemPush) return itemRow(lastItemPush, rc);
  if (type === "loot_opened" && loot.phase === "open") {
    const data = { guid: guidText(loot.guid), money: loot.money, slots: loot.items.length };
    return [{ class: "log", data, domain: "loot", event: "loot/open", text: `Loot window open: ${loot.items.length} items, ${loot.money} copper.` }];
  }
  if (type === "loot_release_observed" && lastRelease) {
    const data = { guid: guidText(lastRelease.guid), status: lastRelease.status };
    return [{ class: "log", data, domain: "loot", event: "loot/release", text: "Loot window closed." }];
  }
  return [];
}

function moneyDrafts({ state }: RewardsEvent, rc: RuleInput): Drafts {
  const after = state.inventory.coinage;
  const before = rc.memo.coinage;
  rc.memo.coinage = after ?? before;
  if (after === undefined || before === undefined || after === before) return [];
  const notice = rc.memo.moneyNoticeAt;
  const reason = notice !== undefined && rc.now - notice < MONEY_NOTICE_MS ? "loot" : "other";
  const delta = after - before;
  const text = `Money ${delta > 0 ? "+" : ""}${delta} copper (now ${after}).`;
  return [{ class: "passive", data: { after, before, delta, reason }, domain: "money", event: "money/change", text }];
}

export function rewardsDrafts(event: RewardsEvent, rc: RuleInput): Drafts {
  if (event.type === "money_notice") rc.memo.moneyNoticeAt = rc.now;
  return [...lootDrafts(event, rc), ...moneyDrafts(event, rc)];
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/rules-world-quest.test.ts` → PASS (6 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/rules-world-quest.ts packages/harness/src/events/rules-world-quest.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness quest and reward rules

Graders check quest counters, item pushes and coinage in the game log
(design D.2); the model sees them as passive lines.
EOF
```

---
### Task L2: Game log query

**Files:**
- Create: `packages/harness/src/log/query.ts`
- Test: `packages/harness/src/log/query.test.ts`

**Interfaces:**
- Consumes: `GameLogEntry`, `LogDraft` (`#harness/contract/log`); `RunRegistry`
  (`#harness/contract/runs`); `GameLog` (`#harness/contract/services`);
  `Refusal` (`#harness/ops/refusal`); `createGameLog`, `createJsonlSink` (L1);
  `createRunRegistry` (L3a).
- Produces:
  ```ts
  export const JOURNAL_LOG_LIMIT = 15;
  export type LogQuery = { find?: string; since?: string; limit?: number };
  export type LogPage = { rows: GameLogEntry[]; more: number; label: string };
  export function queryLog(init: { log: GameLog; runs: RunRegistry; turnStartSeq: number; now: number; query: LogQuery }): LogPage;
  export function formatLogRows(rows: readonly GameLogEntry[], now: number): string[];
  ```

Rules (design D.4, contract 2.10): `since` is `last_turn` (default, rows with
`seq > turnStartSeq`), a duration `30s`, `5m`, `2h`, or a run id `r4` (rows
from that run's start). An unknown run id throws `Refusal` `unknown_run`; any
other `since` throws `Refusal` `bad_since`. `find` is `domain:<domain>`,
`from:<Name>` (chat sender, any case) or words (all must be in `text`, any
case). Without `domain:`, rows of the `agent`, `entity`, `snapshot` and
`tool` domains are left out: they are the model's own calls and raw state,
not "what happened". At most `limit` rows, the newest, oldest first; `more`
counts the rest.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type { LogDraft } from "#harness/contract/log";
import type { RunEnd } from "#harness/contract/runs";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { formatLogRows, queryLog } from "#harness/log/query";
import { Refusal } from "#harness/ops/refusal";
import { createRunRegistry } from "#harness/runs/registry";

function setup() {
  let now = 0;
  const clock = { now: () => now };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const add = (draft: Partial<LogDraft> & { text: string }, at: number) => {
    now = at;
    return log.append({ class: "log", data: {}, domain: "chat", event: "chat/in", ...draft });
  };
  return { add, log, runs, setNow: (at: number) => { now = at; } };
}

describe("queryLog", () => {
  test("defaults to rows since the last turn and hides tool rows", () => {
    const { add, log, runs } = setup();
    add({ text: "old" }, 1000);
    const turnStartSeq = log.lastSeq();
    add({ text: "new" }, 2000);
    add({ domain: "tool", event: "tool/call", text: "look()" }, 2100);
    const page = queryLog({ log, now: 3000, query: {}, runs, turnStartSeq });
    expect(page.rows.map((row) => row.text)).toEqual(["new"]);
    expect(page.label).toBe("since your last turn started");
    expect(page.more).toBe(0);
  });

  test("reads a time window", () => {
    const { add, log, runs } = setup();
    add({ text: "early" }, 0);
    add({ text: "late" }, 280_000);
    const page = queryLog({ log, now: 300_000, query: { since: "1m" }, runs, turnStartSeq: 0 });
    expect(page.rows.map((row) => row.text)).toEqual(["late"]);
    expect(page.label).toBe("in the last 1m");
  });

  test("reads from a run's start", () => {
    const { add, log, runs, setNow } = setup();
    add({ text: "before" }, 1000);
    setNow(2000);
    runs.start({ args: {}, kind: "engage", launch: () => new Promise<RunEnd<number>>(() => {}), toolCallId: "c1" });
    add({ text: "during" }, 3000);
    const page = queryLog({ log, now: 74_000, query: { since: "r1" }, runs, turnStartSeq: 0 });
    expect(page.rows.map((row) => row.text)).toEqual(["during"]);
    expect(page.label).toBe("since r1 started (1m 12s ago)");
  });

  test("refuses an unknown run and a bad since", () => {
    const { log, runs } = setup();
    const ask = (since: string) => () => queryLog({ log, now: 0, query: { since }, runs, turnStartSeq: 0 });
    expect(ask("r9")).toThrow(Refusal);
    expect(ask("yesterday")).toThrow(Refusal);
    try {
      ask("r9")();
    } catch (error) {
      expect(error).toMatchObject({ next: 'journal(about: "log", since: "5m")', reason: "unknown_run" });
    }
  });

  test("finds words, a sender and a domain", () => {
    const { add, log, runs } = setup();
    add({ data: { sender: "Kaelyn" }, text: 'Whisper from Kaelyn: "hey there"' }, 10);
    add({ data: { sender: "Bob" }, text: 'Bob says: "hey"' }, 20);
    add({ domain: "quest", event: "quest/progress", text: "Unfortunate Measures: 3/8." }, 30);
    add({ domain: "tool", event: "tool/call", text: "hey tool" }, 40);
    const find = (text: string) => queryLog({ log, now: 50, query: { find: text }, runs, turnStartSeq: 0 }).rows.map((row) => row.text);
    expect(find("HEY there")).toEqual(['Whisper from Kaelyn: "hey there"']);
    expect(find("from:kaelyn")).toEqual(['Whisper from Kaelyn: "hey there"']);
    expect(find("domain:quest")).toEqual(["Unfortunate Measures: 3/8."]);
    expect(find("domain:tool")).toEqual(["hey tool"]);
    expect(queryLog({ log, now: 50, query: { find: "hey" }, runs, turnStartSeq: 0 }).label).toBe('since your last turn started, matching "hey"');
  });

  test("keeps the newest rows up to the limit, oldest first", () => {
    const { add, log, runs } = setup();
    for (const n of [1, 2, 3, 4, 5]) add({ text: `row ${n}` }, n);
    const page = queryLog({ log, now: 10, query: { limit: 2 }, runs, turnStartSeq: 0 });
    expect(page.rows.map((row) => row.text)).toEqual(["row 4", "row 5"]);
    expect(page.more).toBe(3);
  });
});

describe("formatLogRows", () => {
  test("prefixes relative seconds, minutes or hours", () => {
    const { add } = setup();
    const rows = [add({ text: "a" }, 28_000), add({ text: "b" }, -20_000), add({ text: "c" }, -8_000_000)];
    expect(formatLogRows(rows, 100_000)).toEqual(["-72s a", "-2m b", "-2h c"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/log/query.test.ts`
Expected: FAIL with `Cannot find module "#harness/log/query"`.

- [ ] **Step 3: Implement**

```ts
import type { Domain, GameLogEntry } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type { GameLog } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";

export const JOURNAL_LOG_LIMIT = 15;

export type LogQuery = { find?: string; since?: string; limit?: number };
export type LogPage = { rows: GameLogEntry[]; more: number; label: string };

type QueryInit = { log: GameLog; runs: RunRegistry; turnStartSeq: number; now: number; query: LogQuery };
type SpanInit = { log: GameLog; runs: RunRegistry; turnStartSeq: number; now: number; since: string };
type Span = { rows: GameLogEntry[]; label: string };

const DURATION = /^(\d+)(s|m|h)$/;
const RUN_ID = /^r\d+$/;
const SPACES = /\s+/;
const UNIT_MS = new Map([
  ["s", 1000],
  ["m", 60_000],
  ["h", 3_600_000],
]);
const QUIET_DOMAINS = new Set<Domain>(["agent", "entity", "snapshot", "tool"]);
const RETRY = 'journal(about: "log", since: "5m")';

function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runSpan({ log, runs, now, since }: SpanInit): Span {
  const run = runs.get(since);
  if (!run) throw new Refusal({ detail: `no run ${since} in this session.`, next: RETRY, reason: "unknown_run" });
  const rows = log.since(0).filter((row) => row.ts >= run.startedAt);
  return { label: `since ${since} started (${ago(now - run.startedAt)} ago)`, rows };
}

function span(init: SpanInit): Span {
  const { log, now, since, turnStartSeq } = init;
  if (since === "last_turn") return { label: "since your last turn started", rows: log.since(turnStartSeq) };
  const [, count, unit] = DURATION.exec(since) ?? [];
  if (count !== undefined && unit !== undefined) {
    const cutoff = now - Number(count) * (UNIT_MS.get(unit) ?? 1000);
    return { label: `in the last ${since}`, rows: log.since(0).filter((row) => row.ts >= cutoff) };
  }
  if (RUN_ID.test(since)) return runSpan(init);
  const detail = `since "${since}" is not a time like 5m, a run id like r4, or last_turn.`;
  throw new Refusal({ detail, next: RETRY, reason: "bad_since" });
}

function rowFilter(find: string | undefined): (row: GameLogEntry) => boolean {
  if (find?.startsWith("domain:")) {
    const domain = find.slice("domain:".length);
    return (row) => row.domain === domain;
  }
  if (find?.startsWith("from:")) {
    const who = find.slice("from:".length).toLowerCase();
    return (row) => row.domain === "chat" && String(row.data["sender"]).toLowerCase() === who;
  }
  const words = (find ?? "").toLowerCase().split(SPACES).filter((word) => word.length > 0);
  return (row) => !QUIET_DOMAINS.has(row.domain) && words.every((word) => row.text.toLowerCase().includes(word));
}

export function queryLog({ log, runs, turnStartSeq, now, query }: QueryInit): LogPage {
  const picked = span({ log, now, runs, since: query.since ?? "last_turn", turnStartSeq });
  const matched = picked.rows.filter(rowFilter(query.find));
  const rows = matched.slice(-(query.limit ?? JOURNAL_LOG_LIMIT));
  const label = query.find ? `${picked.label}, matching "${query.find}"` : picked.label;
  return { label, more: matched.length - rows.length, rows };
}

function relative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 120) return `-${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 120 ? `-${minutes}m` : `-${Math.round(minutes / 60)}h`;
}

export function formatLogRows(rows: readonly GameLogEntry[], now: number): string[] {
  return rows.map((row) => `${relative(now - row.ts)} ${row.text}`);
}
```


- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/log/query.test.ts` → PASS (7 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/log/query.ts packages/harness/src/log/query.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness game log query

journal(about: log) needs tail, search and since over the log without a
draining cursor (design D.4).
EOF
```

---
### Task L9b: Delivery and the stuck watch

**Files:**
- Create: `packages/harness/src/events/delivery.ts`
- Modify: `packages/harness/src/events/guard.ts` (add `createStuckWatch`)
- Test: `packages/harness/src/events/delivery.test.ts`, `packages/harness/src/events/guard.test.ts`

**Interfaces:**
- Consumes: `ExtensionAPI` (`@earendil-works/pi-coding-agent`); `ChatType`
  (`@tuicraft/core`); `ignoreFailure`; `GameLogEntry`, `HumanLineDetails`,
  `LogDraft`, `WowEventDetails` (`#harness/contract/log`); `DeliverySink`,
  `HarnessRuntime`, `ProgressTracker` (`#harness/contract/services`);
  `WAKE_MIN_GAP_MS`, `STUCK_WAKE_MS` (L9a); `rt.progress` (A9);
  `createTestRuntime` (F5a).
- Produces:
  ```ts
  // events/delivery.ts
  export const PASSIVE_FLUSH_CAP = 20;
  export type Delivery = DeliverySink & { flush: () => void; takePassive: () => GameLogEntry[] };
  export function formatWake(entries: readonly GameLogEntry[], now: number): string;
  export function createDelivery(init: { pi: ExtensionAPI; rt: HarnessRuntime }): Delivery;
  // events/guard.ts
  export const STUCK_CHECK_MS = 30_000;
  export type StuckWatch = { start: () => void; stop: () => void };
  export function createStuckWatch(init: { rt: HarnessRuntime; everyMs?: number }): StuckWatch;
  ```

Behaviour (design C.1, C.2, C.5, C.6, LU.3 #1 and #11; contract issue 6):

- `wake(entries)`: while `rt.session.agent` is `idle`, send at once, or after
  the rest of the 5 s gap since the last wake (wakes inside the gap join one
  message). While the agent works, hold the wake until `flush()`
  (`agent_end`), so a tool result can set `consumedBy` first. A wake message is
  `sendMessage({ customType: "wow-event", content, display: true, details: {
  kind: "wake", entries } }, { deliverAs: "followUp", triggerTurn: true })`.
- `passive(entry)`: buffer. A wake message without a chat wake takes the
  buffered passive lines after its wake lines. A wake message that holds a
  chat wake (`chat/in`) takes no passive lines; they stay queued for the
  next flush (spec §6.C, settlement 3). `flush()` sends the rest as one
  `wow-event` with `{ triggerTurn: false }`. At most 20 passive lines per
  message (the newest), then `+N more in the log (journal about "log").`
- Rows with `consumedBy` set are skipped; sent rows are marked
  `delivered: true`.
- `human(entry)`: `pi.appendEntry("wow-human", { entry })`.
- `takePassive()`: returns the buffered passive rows (at most 20, newest),
  marks them delivered, and clears the buffer (L10b adds them after `[now]`).
- `formatWake`: one line per row, wake rows first, then the others:
  `[game <age>s] <text>`; a chat wake row adds the reply call (spec §6.C,
  settlement 2): a whisper ` Next: social(to: "<sender>", text: "…")`, a
  party or party-leader line ` Next: social(do: "party", text: "…")`, a
  guild or officer line ` Next: social(do: "guild", text: "…")`, any other
  chat wake (say or yell that names the character) ` Next: social(do:
  "say", text: "…")`.
- Stuck watch: after a `human/input` row, if no progress event
  (`rt.progress.lastProgress()`) comes for 5 min, append one `agent/stuck` wake:
  `No progress for 5 min. Untried: <list>. Tell the human what blocks you.`
  It then waits for the next `human/input`. The router's log subscription
  delivers it.

- [ ] **Step 1: Write the failing tests**

`packages/harness/src/events/delivery.test.ts`:

```ts
import { describe, expect, jest, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ChatType } from "@tuicraft/core";
import type { LogDraft } from "#harness/contract/log";
import { createDelivery, formatWake } from "#harness/events/delivery";
import { WAKE_MIN_GAP_MS } from "#harness/events/guard";
import { createGameLog } from "#harness/log/store";
import { createTestRuntime } from "#test-support/runtime-fixture";

type Sent = { message: Record<string, unknown>; options: unknown };

function fakePi() {
  const sent: Sent[] = [];
  const entries: { customType: string; data: unknown }[] = [];
  const api = {
    appendEntry: (customType: string, data?: unknown) => {
      entries.push({ customType, data });
    },
    sendMessage: (message: Record<string, unknown>, options?: unknown) => {
      sent.push({ message, options });
    },
  };
  return { api: api as unknown as ExtensionAPI, entries, sent };
}

function wakeDraft(text: string, data: Record<string, unknown> = {}): LogDraft {
  return { class: "wake", data, delivered: false, domain: "run", event: "run/ended", text };
}

function passiveDraft(text: string, event: LogDraft["event"] = "xp/gain"): LogDraft {
  return { class: "passive", data: {}, delivered: false, domain: event === "chat/in" ? "chat" : "xp", event, text };
}

const whisperDraft: LogDraft = {
  class: "wake",
  data: { sender: "Kaelyn", type: ChatType.WHISPER },
  delivered: false,
  domain: "chat",
  event: "chat/in",
  text: 'Whisper from Kaelyn: "hey"',
};

async function setup() {
  let now = 100_000;
  const clock = { now: () => now };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const { rt } = await createTestRuntime({ parts: { clock, log } });
  const pi = fakePi();
  const delivery = createDelivery({ pi: pi.api, rt });
  return { delivery, log, pi, rt, tick: (ms: number) => { now += ms; } };
}

function content(sent: Sent | undefined): string {
  return String(sent?.message["content"]);
}

describe("formatWake", () => {
  test("puts wake rows first, with ages and the whisper hint", () => {
    const base = { char: "Fgk", seq: 1, v: 1 as const };
    const passive = { ...base, ...passiveDraft("You gain 130 XP."), ts: 0 };
    const ended = { ...base, ...wakeDraft("r4 travel ended: DONE arrived."), seq: 2, ts: 3000 };
    expect(formatWake([passive, ended], 5000)).toBe("[game 2s] r4 travel ended: DONE arrived.\n[game 5s] You gain 130 XP.");
    const whisper = { ...base, ...whisperDraft, seq: 3, ts: 3000 };
    expect(formatWake([whisper], 5000)).toBe('[game 2s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")');
  });

  test("gives party, guild and say wakes their reply call", () => {
    const base = { char: "Fgk", seq: 1, ts: 0, v: 1 as const };
    const line = (type: number, text: string) => ({ ...base, ...whisperDraft, data: { sender: "Kaelyn", type }, text });
    expect(formatWake([line(ChatType.PARTY, '[party] Kaelyn: "pull"')], 0)).toBe(
      '[game 0s] [party] Kaelyn: "pull" Next: social(do: "party", text: "…")',
    );
    expect(formatWake([line(ChatType.GUILD, '[guild] Kaelyn: "hi"')], 0)).toBe(
      '[game 0s] [guild] Kaelyn: "hi" Next: social(do: "guild", text: "…")',
    );
    expect(formatWake([line(ChatType.SAY, 'Kaelyn says: "Fgk, hi"')], 0)).toBe(
      '[game 0s] Kaelyn says: "Fgk, hi" Next: social(do: "say", text: "…")',
    );
  });
});

describe("createDelivery", () => {
  test("sends a wake at once while idle, as a followUp", async () => {
    const { delivery, log, pi } = await setup();
    const whisper = log.append(whisperDraft);
    delivery.wake([whisper]);
    expect(pi.sent).toEqual([
      {
        message: {
          content: '[game 0s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")',
          customType: "wow-event",
          details: { entries: [whisper], kind: "wake" },
          display: true,
        },
        options: { deliverAs: "followUp", triggerTurn: true },
      },
    ]);
    expect(log.get(whisper.seq)?.delivered).toBe(true);
  });

  test("holds wakes while the agent works and skips consumed rows", async () => {
    const { delivery, log, pi, rt } = await setup();
    rt.session.agent = "tool";
    const consumed = log.append(wakeDraft("r1 engage u9 succeeded: 1 kill"));
    const other = log.append(wakeDraft("r2 rest succeeded: 90%"));
    delivery.wake([consumed]);
    delivery.wake([other]);
    expect(pi.sent).toEqual([]);
    log.mark(consumed.seq, { consumedBy: "call-1" });
    delivery.flush();
    expect(pi.sent).toHaveLength(1);
    expect(pi.sent[0]?.message["details"]).toEqual({ entries: [other], kind: "wake" });
    expect(log.get(consumed.seq)?.delivered).toBe(false);
  });

  test("joins wakes inside the 5 s gap", async () => {
    const { delivery, log, pi, tick } = await setup();
    delivery.wake([log.append(wakeDraft("first"))]);
    tick(1000);
    jest.useFakeTimers();
    try {
      delivery.wake([log.append(wakeDraft("second"))]);
      delivery.wake([log.append(wakeDraft("third"))]);
      expect(pi.sent).toHaveLength(1);
      jest.advanceTimersByTime(WAKE_MIN_GAP_MS - 1000);
      expect(pi.sent).toHaveLength(2);
      expect(content(pi.sent[1])).toBe("[game 0s] second\n[game 0s] third");
    } finally {
      jest.useRealTimers();
    }
  });

  test("flushes passive lines once, capped at 20", async () => {
    const { delivery, log, pi } = await setup();
    for (const n of Array.from({ length: 22 }, (_, i) => i + 1)) delivery.passive(log.append(passiveDraft(`line ${n}`)));
    expect(pi.sent).toEqual([]);
    delivery.flush();
    expect(pi.sent[0]?.options).toEqual({ triggerTurn: false });
    const lines = content(pi.sent[0]).split("\n");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe("[game 0s] line 3");
    expect(lines[20]).toBe('+2 more in the log (journal about "log").');
    delivery.flush();
    expect(pi.sent).toHaveLength(1);
  });

  test("a chat wake takes no passive lines; they wait for the next flush", async () => {
    const { delivery, log, pi } = await setup();
    delivery.passive(log.append(passiveDraft('Bob says: "lol"', "chat/in")));
    delivery.passive(log.append(passiveDraft("You gain 130 XP.")));
    delivery.wake([log.append(whisperDraft)]);
    expect(content(pi.sent[0])).toBe('[game 0s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")');
    delivery.flush();
    expect(content(pi.sent[1]).split("\n")).toEqual(['[game 0s] Bob says: "lol"', "[game 0s] You gain 130 XP."]);
  });

  test("a non-chat wake carries the passive lines after its wake line", async () => {
    const { delivery, log, pi } = await setup();
    delivery.passive(log.append(passiveDraft("You gain 130 XP.")));
    delivery.wake([log.append(wakeDraft("r4 travel ended: DONE arrived."))]);
    expect(content(pi.sent[0]).split("\n")).toEqual(["[game 0s] r4 travel ended: DONE arrived.", "[game 0s] You gain 130 XP."]);
  });

  test("human lines go to the session only", async () => {
    const { delivery, log, pi } = await setup();
    const error = log.append({ class: "log", data: {}, domain: "packet", event: "packet/error", text: "Packet 0x1f6 failed: short read" });
    delivery.human(error);
    expect(pi.entries).toEqual([{ customType: "wow-human", data: { entry: error } }]);
    expect(pi.sent).toEqual([]);
  });

  test("takePassive returns the buffer and clears it", async () => {
    const { delivery, log } = await setup();
    const line = log.append(passiveDraft("You gain 130 XP."));
    delivery.passive(line);
    expect(delivery.takePassive()).toEqual([line]);
    expect(log.get(line.seq)?.delivered).toBe(true);
    expect(delivery.takePassive()).toEqual([]);
  });
});
```

Add to `packages/harness/src/events/guard.test.ts` (merge imports):

```ts
import { jest } from "bun:test";
import type { ProgressTracker } from "#harness/contract/services";
import { createStuckWatch, STUCK_WAKE_MS } from "#harness/events/guard";
import { createGameLog } from "#harness/log/store";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("createStuckWatch", () => {
  test("wakes once when a human task sees no progress for 5 min", async () => {
    let now = 0;
    const clock = { now: () => now };
    const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
    const progress: ProgressTracker = {
      afterAction: () => {},
      attach: () => () => {},
      count: () => 0,
      digest: () => "",
      lastProgress: () => ({ at: 1000, event: "xp/gain" }),
      noProgress: () => ({ actions: 3, lastRefusal: "travel no_ground x3", sinceMs: 60_000, untried: ['travel(to: "unstick")'] }),
    };
    const { rt } = await createTestRuntime({ parts: { clock, log, progress } });
    const stuck = () => log.since(0).filter((row) => row.event === "agent/stuck");
    jest.useFakeTimers();
    try {
      const watch = createStuckWatch({ everyMs: 1000, rt });
      watch.start();
      log.append({ class: "log", data: {}, domain: "human", event: "human/input", text: "kill 3 stalkers" });
      now = STUCK_WAKE_MS;
      jest.advanceTimersByTime(1000);
      expect(stuck()).toHaveLength(0);
      now = STUCK_WAKE_MS + 1000;
      jest.advanceTimersByTime(1000);
      expect(stuck()).toEqual([
        expect.objectContaining({
          class: "wake",
          text: 'No progress for 5 min. Untried: travel(to: "unstick"). Tell the human what blocks you.',
        }),
      ]);
      now += STUCK_WAKE_MS;
      jest.advanceTimersByTime(1000);
      expect(stuck()).toHaveLength(1);
      watch.stop();
    } finally {
      jest.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `mise test packages/harness/src/events/delivery.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/delivery"`.
Run: `mise test packages/harness/src/events/guard.test.ts`
Expected: FAIL with `Export named 'createStuckWatch' not found in module`.

- [ ] **Step 3: Implement**

`packages/harness/src/events/delivery.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ChatType } from "@tuicraft/core";
import type { GameLogEntry, HumanLineDetails, WowEventDetails } from "#harness/contract/log";
import type { DeliverySink, HarnessRuntime } from "#harness/contract/services";
import { WAKE_MIN_GAP_MS } from "#harness/events/guard";

export const PASSIVE_FLUSH_CAP = 20;

export type Delivery = DeliverySink & { flush: () => void; takePassive: () => GameLogEntry[] };

type DeliveryInit = { pi: ExtensionAPI; rt: HarnessRuntime };
type Send = DeliveryInit & { kind: WowEventDetails["kind"]; wakes: GameLogEntry[]; passive: GameLogEntry[] };

function isChat(entry: GameLogEntry): boolean {
  return entry.event === "chat/in";
}

function isChatWake(entry: GameLogEntry): boolean {
  return entry.class === "wake" && isChat(entry);
}

const CHANNEL_REPLY = new Map<unknown, string>([
  [ChatType.PARTY, "party"],
  [ChatType.PARTY_LEADER, "party"],
  [ChatType.GUILD, "guild"],
  [ChatType.OFFICER, "guild"],
]);

function replyHint(entry: GameLogEntry): string {
  if (!isChatWake(entry)) return "";
  const type = entry.data["type"];
  if (type === ChatType.WHISPER) return ` Next: social(to: "${String(entry.data["sender"])}", text: "…")`;
  return ` Next: social(do: "${CHANNEL_REPLY.get(type) ?? "say"}", text: "…")`;
}

function wakeLine(entry: GameLogEntry, now: number): string {
  const age = Math.max(0, Math.round((now - entry.ts) / 1000));
  return `[game ${age}s] ${entry.text}${replyHint(entry)}`;
}

export function formatWake(entries: readonly GameLogEntry[], now: number): string {
  const wakes = entries.filter((entry) => entry.class === "wake");
  const others = entries.filter((entry) => entry.class !== "wake");
  return [...wakes, ...others].map((entry) => wakeLine(entry, now)).join("\n");
}

function capped(passive: GameLogEntry[]): { shown: GameLogEntry[]; more: number } {
  const shown = passive.slice(-PASSIVE_FLUSH_CAP);
  return { more: passive.length - shown.length, shown };
}

function drain(rt: HarnessRuntime, seqs: number[]): GameLogEntry[] {
  return seqs.splice(0).flatMap((seq) => {
    const entry = rt.log.get(seq);
    return entry && entry.consumedBy === undefined ? [entry] : [];
  });
}

function markDelivered(rt: HarnessRuntime, entries: readonly GameLogEntry[]): void {
  for (const entry of entries) rt.log.mark(entry.seq, { delivered: true });
}

function send({ pi, rt, kind, wakes, passive }: Send): void {
  const { more, shown } = capped(passive);
  const entries = [...wakes, ...shown];
  if (entries.length === 0) return;
  const tail = more > 0 ? `\n+${more} more in the log (journal about "log").` : "";
  const details: WowEventDetails = { entries, kind };
  const content = `${formatWake(entries, rt.clock.now())}${tail}`;
  const options = kind === "wake" ? { deliverAs: "followUp" as const, triggerTurn: true } : { triggerTurn: false };
  pi.sendMessage({ content, customType: "wow-event", details, display: true }, options);
  markDelivered(rt, entries);
}

export function createDelivery({ pi, rt }: DeliveryInit): Delivery {
  const wakeSeqs: number[] = [];
  const passiveSeqs: number[] = [];
  let lastWakeAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const passiveFor = (wakes: GameLogEntry[]): GameLogEntry[] => {
    if (wakes.some(isChatWake)) return [];
    return drain(rt, passiveSeqs);
  };
  const sendWakes = () => {
    clearTimeout(timer);
    timer = undefined;
    const wakes = drain(rt, wakeSeqs);
    if (wakes.length === 0) return;
    lastWakeAt = rt.clock.now();
    send({ kind: "wake", passive: passiveFor(wakes), pi, rt, wakes });
  };
  const schedule = () => {
    if (rt.session.agent !== "idle" || timer) return;
    const wait = lastWakeAt === undefined ? 0 : WAKE_MIN_GAP_MS - (rt.clock.now() - lastWakeAt);
    if (wait > 0) timer = setTimeout(sendWakes, wait);
    else sendWakes();
  };
  return {
    flush() {
      sendWakes();
      send({ kind: "passive", passive: drain(rt, passiveSeqs), pi, rt, wakes: [] });
    },
    human(entry) {
      pi.appendEntry<HumanLineDetails>("wow-human", { entry });
    },
    passive(entry) {
      passiveSeqs.push(entry.seq);
    },
    takePassive() {
      const { shown } = capped(drain(rt, passiveSeqs));
      markDelivered(rt, shown);
      return shown;
    },
    wake(entries) {
      wakeSeqs.push(...entries.map((entry) => entry.seq));
      schedule();
    },
  };
}
```

Add to `packages/harness/src/events/guard.ts`:

```ts
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { LogDraft } from "#harness/contract/log";
import type { HarnessRuntime } from "#harness/contract/services";

export const STUCK_CHECK_MS = 30_000;

export type StuckWatch = { start: () => void; stop: () => void };

type StuckInit = { rt: HarnessRuntime; everyMs?: number };

function stuckDraft(untried: string[], idleMs: number): LogDraft {
  const minutes = Math.round(idleMs / 60_000);
  const list = untried.length > 0 ? ` Untried: ${untried.join(", ")}.` : "";
  const text = `No progress for ${minutes} min.${list} Tell the human what blocks you.`;
  return { class: "wake", data: { idleMs, untried }, delivered: false, domain: "agent", event: "agent/stuck", text };
}

export function createStuckWatch({ rt, everyMs = STUCK_CHECK_MS }: StuckInit): StuckWatch {
  let humanAt: number | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: () => void = ignoreFailure;
  const check = () => {
    if (humanAt === undefined) return;
    const since = Math.max(humanAt, rt.progress.lastProgress()?.at ?? humanAt);
    const idleMs = rt.clock.now() - since;
    if (idleMs < STUCK_WAKE_MS) return;
    humanAt = undefined;
    rt.log.append(stuckDraft(rt.progress.noProgress()?.untried ?? [], idleMs));
  };
  return {
    start() {
      unsubscribe = rt.log.subscribe((entry) => {
        if (entry.event === "human/input") humanAt = entry.ts;
      });
      timer = setInterval(check, everyMs);
    },
    stop() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/delivery.test.ts` → PASS (10 tests).
Run: `mise test packages/harness/src/events/guard.test.ts` → PASS (6 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/delivery.ts packages/harness/src/events/delivery.test.ts packages/harness/src/events/guard.ts packages/harness/src/events/guard.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness event delivery

Wakes go as followUp only and wait for tool results, so one outcome
reaches the model in one place (design C.2).
EOF
```

---
### Task L11: World snapshots

**Files:**
- Create: `packages/harness/src/events/snapshot.ts`
- Test: `packages/harness/src/events/snapshot.test.ts`

**Interfaces:**
- Consumes: `LogDraft` (`#harness/contract/log`); `RunPaths`
  (`#harness/contract/config`); `Clock`, `GameLog`, `WorldSnapshots`
  (`#harness/contract/services`); `SnapshotWorld`, `UnitView`, `SelfView`
  (`#harness/contract/views`); `createGameLog` (L1b); `createMockHandle`.
- Produces:
  ```ts
  export const SNAPSHOT_EVERY_MS = 5000;
  export const SNAPSHOT_UNITS = 30;
  export const SNAPSHOT_RANGE_YD = 60;
  export function createWorldSnapshots(init: { log: GameLog; clock: Clock; paths: RunPaths; world: () => SnapshotWorld | undefined; everyMs?: number }): WorldSnapshots;
  ```

Rules (design D.2 `snapshot/world`): `capture("look")` always appends a full
row. A tick (`attach` starts one every `everyMs`) appends a full row only
when the set of units within 60 yd changed, or self HP or power moved by 5 %
of its maximum or more; else it appends `{ unchanged: true }`. No world (not
connected or not ready) → no row. A full row holds `self`, `place`,
`target`, `attackers` and up to 30 units within 60 yd, nearest first, each as
`{ alive, distance, entry, guid, hp, level, name, ref, relation, targetingMe }`.
`write(label)` writes `<paths.snapshots>/<label>.json` (label characters
outside `[A-Za-z0-9_.-]` become `_`) and returns the path. `main.ts` passes
`world: () => snapshotWorld(rt)` (A3).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { RunPaths } from "#harness/contract/config";
import type { SelfView, SnapshotWorld, UnitView } from "#harness/contract/views";
import { createWorldSnapshots, SNAPSHOT_EVERY_MS } from "#harness/events/snapshot";
import { createGameLog } from "#harness/log/store";

const self: SelfView = {
  className: "Priest",
  copper: 1200,
  freeSlots: 10,
  guid: "1",
  hp: 200,
  inCombat: false,
  level: 10,
  life: "alive",
  maxHp: 200,
  maxPower: 300,
  name: "Fgk",
  pose: undefined,
  power: 300,
  powerKind: "mana",
  race: "Blood Elf",
  xpPct: 40,
};

function unit(ref: string, distance: number): UnitView {
  return {
    alive: true,
    attackable: true,
    attackingMe: false,
    compass: "N",
    distance,
    entry: 15366,
    guid: ref.slice(1),
    hp: 137,
    hpPct: 100,
    inView: true,
    kind: "creature",
    level: 7,
    lootable: false,
    maxHp: 137,
    name: "Springpaw Stalker",
    ref,
    relation: "hostile",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: false,
    x: 0,
    y: 0,
    z: 0,
  };
}

function worldOf(units: UnitView[], hp = 200): SnapshotWorld {
  const place = { ageMs: 0, area: "Fairbreeze Village", areaId: 1, zone: "Eversong Woods", zoneId: 2 };
  return { attackers: [], place, self: { ...self, hp }, target: undefined, units };
}

async function setup(start: SnapshotWorld | undefined) {
  const dir = await mkdtemp(join(tmpdir(), "tc-harness-snap-"));
  const paths = { snapshots: join(dir, "snapshots") } as RunPaths;
  const clock = { now: () => 0 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  let current = start;
  const snapshots = createWorldSnapshots({ clock, log, paths, world: () => current });
  const rows = () => log.since(0).filter((row) => row.event === "snapshot/world");
  return { dir, rows, set: (next: SnapshotWorld | undefined) => { current = next; }, snapshots };
}

describe("createWorldSnapshots", () => {
  test("look always writes a full row with units within 60 yd, nearest first", async () => {
    const { rows, snapshots } = await setup(worldOf([unit("u2", 40), unit("u1", 10), unit("u3", 80)]));
    snapshots.capture("look");
    const [row] = rows();
    expect(row?.class).toBe("log");
    expect(row?.data["cause"]).toBe("look");
    expect((row?.data["units"] as { ref: string }[]).map((u) => u.ref)).toEqual(["u1", "u2"]);
    expect(row?.text).toBe("world: HP 200/200, 2 units within 60 yd");
  });

  test("a tick writes a heartbeat unless units or vitals changed", async () => {
    const { rows, set, snapshots } = await setup(worldOf([unit("u1", 10)]));
    snapshots.capture("tick");
    snapshots.capture("tick");
    set(worldOf([unit("u1", 10)], 195));
    snapshots.capture("tick");
    set(worldOf([unit("u1", 10)], 180));
    snapshots.capture("tick");
    set(worldOf([unit("u1", 10), unit("u2", 20)], 180));
    snapshots.capture("tick");
    expect(rows().map((row) => row.data["unchanged"] === true)).toEqual([false, true, true, false, false]);
  });

  test("writes nothing without a world", async () => {
    const { rows, snapshots } = await setup(undefined);
    snapshots.capture("look");
    expect(rows()).toEqual([]);
  });

  test("attach ticks every 5 s until detached", async () => {
    const { rows, snapshots } = await setup(worldOf([]));
    jest.useFakeTimers();
    try {
      const detach = snapshots.attach(createMockHandle());
      jest.advanceTimersByTime(SNAPSHOT_EVERY_MS * 2);
      detach();
      jest.advanceTimersByTime(SNAPSHOT_EVERY_MS * 2);
      expect(rows()).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("write saves the world under a safe label", async () => {
    const { dir, snapshots } = await setup(worldOf([unit("u1", 10)]));
    const path = await snapshots.write("before fight/1");
    expect(path).toBe(join(dir, "snapshots", "before_fight_1.json"));
    expect(JSON.parse(await readFile(path, "utf8")).self.name).toBe("Fgk");
  });
});
```

`{ snapshots: … } as RunPaths` is a test-only partial: `createWorldSnapshots`
reads only `paths.snapshots`. If the reviewer rejects the cast, use
`testPaths(dir)` from `#test-support/runtime-fixture` (F5a) instead.

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/snapshot.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/snapshot"`.

- [ ] **Step 3: Implement**

```ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunPaths } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type { Clock, GameLog, WorldSnapshots } from "#harness/contract/services";
import type { SnapshotWorld, UnitView } from "#harness/contract/views";

export const SNAPSHOT_EVERY_MS = 5000;
export const SNAPSHOT_UNITS = 30;
export const SNAPSHOT_RANGE_YD = 60;

const CHANGE_FRACTION = 0.05;
const UNSAFE_LABEL = /[^\w.-]/g;
const HEARTBEAT: LogDraft = {
  class: "log",
  data: { unchanged: true },
  domain: "snapshot",
  event: "snapshot/world",
  text: "world unchanged",
};

type SnapshotInit = {
  log: GameLog;
  clock: Clock;
  paths: RunPaths;
  world: () => SnapshotWorld | undefined;
  everyMs?: number;
};

function nearby(units: readonly UnitView[]): UnitView[] {
  return units
    .filter((unit) => unit.distance !== undefined && unit.distance <= SNAPSHOT_RANGE_YD)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, SNAPSHOT_UNITS);
}

function unitRow({ alive, distance, entry, guid, hp, level, name, ref, relation, targetsMe }: UnitView) {
  return { alive, distance, entry, guid, hp, level, name, ref, relation, targetingMe: targetsMe };
}

function moved(before: number, after: number, max: number): boolean {
  return max > 0 && Math.abs(after - before) / max >= CHANGE_FRACTION;
}

function unitKey(world: SnapshotWorld): string {
  return nearby(world.units)
    .map((unit) => unit.guid)
    .sort()
    .join(",");
}

function differs(before: SnapshotWorld, after: SnapshotWorld): boolean {
  const { self } = after;
  if (unitKey(before) !== unitKey(after)) return true;
  return moved(before.self.hp, self.hp, self.maxHp) || moved(before.self.power, self.power, self.maxPower);
}

function fullRow(world: SnapshotWorld, cause: "look" | "tick"): LogDraft {
  const units = nearby(world.units).map(unitRow);
  const { attackers, place, self, target } = world;
  const text = `world: HP ${self.hp}/${self.maxHp}, ${units.length} units within ${SNAPSHOT_RANGE_YD} yd`;
  const data = { attackers, cause, place, self, target, units };
  return { class: "log", data, domain: "snapshot", event: "snapshot/world", text };
}

export function createWorldSnapshots({ log, paths, world, everyMs = SNAPSHOT_EVERY_MS }: SnapshotInit): WorldSnapshots {
  let last: SnapshotWorld | undefined;
  const capture = (cause: "look" | "tick") => {
    const current = world();
    if (!current) return;
    const changed = cause === "look" || last === undefined || differs(last, current);
    if (changed) last = current;
    log.append(changed ? fullRow(current, cause) : HEARTBEAT);
  };
  return {
    attach() {
      const timer = setInterval(() => capture("tick"), everyMs);
      return () => clearInterval(timer);
    },
    capture,
    async write(label) {
      await mkdir(paths.snapshots, { recursive: true });
      const path = join(paths.snapshots, `${label.replace(UNSAFE_LABEL, "_")}.json`);
      await Bun.write(path, `${JSON.stringify(world() ?? null, null, 2)}\n`);
      return path;
    },
  };
}
```

`clock` stays in the init type (contract 2.11) and is not read: rows take
their `ts` from the log's own clock.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/snapshot.test.ts` → PASS (5 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/snapshot.ts packages/harness/src/events/snapshot.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness world snapshots

t0-hostiles and t0-self-state grade what the world held at a time, so
the log needs snapshot/world rows (design D.2).
EOF
```

---
### Task L12a: Run dir, pruning and atomic JSON writes

**Files:**
- Create: `packages/harness/src/eval/run-dir.ts`
- Test: `packages/harness/src/eval/run-dir.test.ts`

**Interfaces:**
- Consumes: `RunPaths` (`#harness/contract/config`); `harnessStateDir`
  (`#harness/config/flags`, F3a).
- Produces:
  ```ts
  export class RunDirError extends Error {}
  export const KEEP_RUNS = 50;
  export function runsRoot(home: string): string;
  export function runStamp(now: Date): string;
  export function runPaths(dir: string): RunPaths;
  export function createRunDir(init: { flag: string | undefined; home: string; character: string; now: Date }): Promise<RunPaths>;
  export function pruneRuns(root: string, keep?: number): Promise<string[]>;
  export function writeJsonAtomic(path: string, value: unknown): Promise<void>;
  ```

Rules (design I.1, D.3; contract 2.12): without `--run-dir` the dir is
`<runsRoot>/<yyyymmddThhmmssZ>-<character>/` and only the newest 50 stamped
dirs stay; a `--run-dir` is never pruned and may already exist (the grader
puts `account.json` in it first, eval-suite §launch); a dir that already has
`gamelog.jsonl` throws `RunDirError`. `createRunDir` makes `pi-sessions/`,
`snapshots/` and `workspace/`. The harness never writes `frames/`,
`grader/`, `triggers.jsonl`, `progress.json`, `steers.jsonl` or `result.json`.
`writeJsonAtomic` writes a unique temp file and renames it, so the watcher
never reads half a file.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRunDir,
  pruneRuns,
  RunDirError,
  runPaths,
  runsRoot,
  runStamp,
  writeJsonAtomic,
} from "#harness/eval/run-dir";

const now = new Date(Date.UTC(2026, 8, 26, 19, 13, 31, 123));

async function home() {
  return mkdtemp(join(tmpdir(), "tc-harness-home-"));
}

describe("runStamp and runPaths", () => {
  test("stamps UTC to the second", () => {
    expect(runStamp(now)).toBe("20260926T191331Z");
  });

  test("names every file of the run dir", () => {
    expect(runPaths("/r")).toEqual({
      dir: "/r",
      gamelog: "/r/gamelog.jsonl",
      jev: "/r/jev.jsonl",
      meta: "/r/meta.json",
      piSessions: "/r/pi-sessions",
      runs: "/r/runs.jsonl",
      session: "/r/session.jsonl",
      snapshots: "/r/snapshots",
      status: "/r/status.json",
      tools: "/r/tools.json",
      workspace: "/r/workspace",
    });
  });
});

describe("createRunDir", () => {
  test("makes a stamped dir under the state root", async () => {
    const dir = await home();
    const paths = await createRunDir({ character: "Fgk", flag: undefined, home: dir, now });
    expect(paths.dir).toBe(join(runsRoot(dir), "20260926T191331Z-Fgk"));
    expect((await readdir(paths.dir)).sort()).toEqual(["pi-sessions", "snapshots", "workspace"]);
  });

  test("takes an existing --run-dir and refuses one with a game log", async () => {
    const dir = join(await home(), "eval-run");
    await mkdir(dir);
    await writeFile(join(dir, "account.json"), "{}");
    const paths = await createRunDir({ character: "Fgk", flag: dir, home: "/nowhere", now });
    expect(paths.dir).toBe(dir);
    await writeFile(paths.gamelog, "");
    await expect(createRunDir({ character: "Fgk", flag: dir, home: "/nowhere", now })).rejects.toBeInstanceOf(RunDirError);
  });
});

describe("pruneRuns", () => {
  test("keeps the newest stamped dirs and ignores other names", async () => {
    const root = join(await home(), "runs");
    const names = ["20260101T000000Z-A", "20260102T000000Z-A", "20260103T000000Z-A", "notes"];
    for (const name of names) await mkdir(join(root, name), { recursive: true });
    expect(await pruneRuns(root, 2)).toEqual([join(root, "20260101T000000Z-A")]);
    expect((await readdir(root)).sort()).toEqual(["20260102T000000Z-A", "20260103T000000Z-A", "notes"]);
  });
});

describe("writeJsonAtomic", () => {
  test("writes pretty JSON and leaves no temp file", async () => {
    const dir = await home();
    const path = join(dir, "status.json");
    await Promise.all([writeJsonAtomic(path, { n: 1 }), writeJsonAtomic(path, { n: 2 })]);
    expect([1, 2]).toContain(JSON.parse(await readFile(path, "utf8")).n);
    expect(await readdir(dir)).toEqual(["status.json"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/eval/run-dir.test.ts`
Expected: FAIL with `Cannot find module "#harness/eval/run-dir"`.

- [ ] **Step 3: Implement**

```ts
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { harnessStateDir } from "#harness/config/flags";
import type { RunPaths } from "#harness/contract/config";

export class RunDirError extends Error {}

export const KEEP_RUNS = 50;

const STAMPED = /^\d{8}T\d{6}Z-/;
const STAMP_MARKS = /[-:]/g;

type RunDirInit = { flag: string | undefined; home: string; character: string; now: Date };

let tempCount = 0;

export function runsRoot(home: string): string {
  return join(harnessStateDir(home), "runs");
}

export function runStamp(now: Date): string {
  return `${now.toISOString().replace(STAMP_MARKS, "").slice(0, 15)}Z`;
}

export function runPaths(dir: string): RunPaths {
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

export async function pruneRuns(root: string, keep = KEEP_RUNS): Promise<string[]> {
  const names = (await readdir(root)).filter((name) => STAMPED.test(name)).sort();
  const old = names.slice(0, Math.max(0, names.length - keep)).map((name) => join(root, name));
  await Promise.all(old.map((path) => rm(path, { force: true, recursive: true })));
  return old;
}

export async function createRunDir({ flag, home, character, now }: RunDirInit): Promise<RunPaths> {
  const dir = resolve(flag ?? join(runsRoot(home), `${runStamp(now)}-${character}`));
  const paths = runPaths(dir);
  if (await Bun.file(paths.gamelog).exists())
    throw new RunDirError(`${dir} already holds gamelog.jsonl. Give a new --run-dir.`);
  await Promise.all([paths.piSessions, paths.snapshots, paths.workspace].map((sub) => mkdir(sub, { recursive: true })));
  if (flag === undefined) await pruneRuns(runsRoot(home));
  return paths;
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  tempCount += 1;
  const temp = `${path}.${process.pid}.${tempCount}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, path);
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/eval/run-dir.test.ts` → PASS (6 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/eval/run-dir.ts packages/harness/src/eval/run-dir.test.ts
mise exec -- git commit -F - <<'EOF'
chore: Add harness run dir

Graders need one run dir per harness start with the ES P2 file names,
and a busy dir must not be reused (design I.1).
EOF
```

---

### Task L12b: Run meta and session link

**Files:**
- Modify: `packages/harness/src/eval/run-dir.ts`
- Test: `packages/harness/src/eval/run-dir.test.ts`

**Interfaces:**
- Consumes: `RunMeta`, `RunPaths` (`#harness/contract/config`);
  `writeJsonAtomic` (L12a); `ignoreFailure`.
- Produces:
  ```ts
  export function writeMeta(paths: RunPaths, meta: RunMeta): Promise<void>;
  export function linkSession(paths: RunPaths, sessionFile: string): Promise<void>;
  export function finalizeSession(paths: RunPaths): Promise<void>;
  ```

Rules (design I.1): `meta.json` is written at start and again at exit
(F6b builds `RunMeta`; it never holds the password). `session.jsonl` is a
symlink to the current Pi session file, re-pointed on `/new` and `/fork`
(L10b calls `linkSession` at every `session_start`), and replaced by a copy
at exit (`finalizeSession`, called by F6b). A link to a file that Pi has not
written yet is allowed; `finalizeSession` then removes the link.

- [ ] **Step 1: Write the failing test** (add to `run-dir.test.ts`; merge imports)

```ts
import { lstat } from "node:fs/promises";
import type { RunMeta } from "#harness/contract/config";
import { finalizeSession, linkSession, writeMeta } from "#harness/eval/run-dir";

function meta(dir: string): RunMeta {
  const flags = {
    check: false,
    connect: true,
    glyphs: undefined,
    logEntities: false,
    model: "openai-codex/gpt-6-luna",
    nowPerCall: false,
    profile: join(dir, "account.json"),
    runDir: dir,
    stopReflex: true,
    thinking: "high" as const,
    wake: true,
  };
  const files = { gamelog: "gamelog.jsonl", jev: "jev.jsonl", runs: "runs.jsonl", session: "session.jsonl", status: "status.json", tools: "tools.json" };
  return { account: "TCFRESH1", capabilities: undefined, character: "Fgk", characterGuid: "1", endedAt: undefined, exitReason: undefined, files, flags, gitSha: "abc1234", glyphs: "nerd", model: flags.model, startedAt: 1000, thinking: "high", v: 1 };
}

describe("writeMeta", () => {
  test("writes meta.json without any password field", async () => {
    const paths = runPaths(await home());
    await writeMeta(paths, meta(paths.dir));
    const text = await readFile(paths.meta, "utf8");
    expect(JSON.parse(text)).toMatchObject({ account: "TCFRESH1", character: "Fgk", files: { gamelog: "gamelog.jsonl" }, v: 1 });
    expect(text.toLowerCase()).not.toContain("password");
  });
});

describe("linkSession and finalizeSession", () => {
  test("re-points the link and replaces it with a copy at exit", async () => {
    const dir = await home();
    const paths = runPaths(dir);
    const first = join(dir, "pi-a.jsonl");
    const second = join(dir, "pi-b.jsonl");
    await writeFile(first, "a\n");
    await writeFile(second, "b\n");
    await linkSession(paths, first);
    await linkSession(paths, second);
    expect((await lstat(paths.session)).isSymbolicLink()).toBe(true);
    expect(await readFile(paths.session, "utf8")).toBe("b\n");
    await finalizeSession(paths);
    expect((await lstat(paths.session)).isSymbolicLink()).toBe(false);
    expect(await readFile(paths.session, "utf8")).toBe("b\n");
  });

  test("removes a link to a file Pi never wrote, and ignores no link", async () => {
    const paths = runPaths(await home());
    await finalizeSession(paths);
    await linkSession(paths, join(paths.dir, "missing.jsonl"));
    await finalizeSession(paths);
    expect(await Bun.file(paths.session).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/eval/run-dir.test.ts`
Expected: FAIL with `Export named 'writeMeta' not found in module`.

- [ ] **Step 3: Implement** (add to `run-dir.ts`; merge imports)

```ts
import { copyFile, lstat, readlink, symlink } from "node:fs/promises";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { RunMeta } from "#harness/contract/config";

export function writeMeta(paths: RunPaths, meta: RunMeta): Promise<void> {
  return writeJsonAtomic(paths.meta, meta);
}

export async function linkSession(paths: RunPaths, sessionFile: string): Promise<void> {
  await rm(paths.session, { force: true });
  await symlink(sessionFile, paths.session);
}

export async function finalizeSession(paths: RunPaths): Promise<void> {
  const link = await lstat(paths.session).catch(ignoreFailure);
  if (!link?.isSymbolicLink()) return;
  const target = await readlink(paths.session);
  await rm(paths.session);
  if (await Bun.file(target).exists()) await copyFile(target, paths.session);
}
```

`lstat(...).catch(ignoreFailure)` turns a missing link into `undefined`: the
file system is a boundary, and "no link" is a normal state here.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/eval/run-dir.test.ts` → PASS (9 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/eval/run-dir.ts packages/harness/src/eval/run-dir.test.ts
mise exec -- git commit -F - <<'EOF'
chore: Add harness run meta and session link

Graders read meta.json and one session.jsonl per run, and the link must
follow /new and /fork (design I.1).
EOF
```

---

### Task L13: Tool stats

**Files:**
- Create: `packages/harness/src/eval/stats.ts`
- Test: `packages/harness/src/eval/stats.test.ts`

**Interfaces:**
- Consumes: `ToolStatus` (`#harness/contract/result`); `ToolStatsRow`,
  `ToolsJson` (`#harness/contract/config`); `Clock`, `ToolStats`
  (`#harness/contract/services`); `writeJsonAtomic` (L12a); `ignoreFailure`.
- Produces:
  ```ts
  export const STATS_EVERY_MS = 10_000;
  export const KEEP_DURATIONS = 1000;
  export function createToolStats(clock: Clock): ToolStats;
  ```

Rules (design I.1 `tools.json`): per tool, calls, status-word counts,
validation errors, repeat-guard hits, p50 and p95 ms over the last 1,000
results (nearest-rank), last error. `start({ path, everyMs })` rewrites
`tools.json` every `everyMs` (F6b passes `STATS_EVERY_MS`); `stop()` writes
it once more. Writes run one after another, and each takes its snapshot when
it runs, so `stop()` always leaves the last state on disk.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolStats } from "#harness/eval/stats";

async function fileAppears(path: string): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    if (await Bun.file(path).exists()) return;
    await Bun.sleep(5);
  }
  throw new Error(`${path} never appeared`);
}

describe("createToolStats", () => {
  test("counts calls, statuses, errors and hits per tool", () => {
    const stats = createToolStats({ now: () => 42 });
    stats.call("look");
    stats.call("travel");
    stats.call("travel");
    stats.result({ ms: 30, reason: undefined, status: "DONE", tool: "look" });
    stats.result({ ms: 900, reason: "no_ground", status: "REFUSED", tool: "travel" });
    stats.validationError("travel");
    stats.repeatHit("travel");
    stats.error({ message: "self_not_alive", tool: "travel" });
    expect(stats.snapshot()).toEqual({
      tools: {
        look: { calls: 1, lastError: undefined, p50Ms: 30, p95Ms: 30, repeatHits: 0, statuses: { DONE: 1 }, validationErrors: 0 },
        travel: { calls: 2, lastError: "self_not_alive", p50Ms: 900, p95Ms: 900, repeatHits: 1, statuses: { REFUSED: 1 }, validationErrors: 1 },
      },
      updatedAt: 42,
      v: 1,
    });
  });

  test("computes nearest-rank p50 and p95", () => {
    const stats = createToolStats({ now: () => 0 });
    for (const ms of Array.from({ length: 20 }, (_, i) => (i + 1) * 10)) stats.result({ ms, reason: undefined, status: "DONE", tool: "look" });
    expect(stats.snapshot().tools["look"]).toMatchObject({ p50Ms: 100, p95Ms: 190 });
  });

  test("a tick writes tools.json, and stop writes the last state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tc-harness-stats-"));
    const path = join(dir, "tools.json");
    const stats = createToolStats({ now: () => 7 });
    stats.start({ everyMs: 5, path });
    await fileAppears(path);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ tools: {}, updatedAt: 7, v: 1 });
    stats.call("look");
    await stats.stop();
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ tools: { look: { calls: 1 } } });
  });

  test("stop without start writes nothing", async () => {
    const stats = createToolStats({ now: () => 7 });
    await expect(stats.stop()).resolves.toBeUndefined();
  });
});
```

`fileAppears` waits on the file system, which fake timers cannot drive
(real I/O resolves outside the fake clock); a 5 ms interval keeps it short.

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/eval/stats.test.ts`
Expected: FAIL with `Cannot find module "#harness/eval/stats"`.

- [ ] **Step 3: Implement**

```ts
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { ToolStatsRow, ToolsJson } from "#harness/contract/config";
import type { Clock, ToolStats } from "#harness/contract/services";
import { writeJsonAtomic } from "#harness/eval/run-dir";

export const STATS_EVERY_MS = 10_000;
export const KEEP_DURATIONS = 1000;

type Tally = Omit<ToolStatsRow, "p50Ms" | "p95Ms"> & { durations: number[] };

function newTally(): Tally {
  return { calls: 0, durations: [], lastError: undefined, repeatHits: 0, statuses: {}, validationErrors: 0 };
}

function percentile(sorted: readonly number[], fraction: number): number | undefined {
  if (sorted.length === 0) return;
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function statsRow({ durations, statuses, ...rest }: Tally): ToolStatsRow {
  const sorted = [...durations].sort((a, b) => a - b);
  return { ...rest, p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), statuses: { ...statuses } };
}

export function createToolStats(clock: Clock): ToolStats {
  const tallies = new Map<string, Tally>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let file: string | undefined;
  let chain: Promise<void> = Promise.resolve();
  const tally = (tool: string): Tally => {
    const found = tallies.get(tool) ?? newTally();
    tallies.set(tool, found);
    return found;
  };
  const snapshot = (): ToolsJson => {
    const tools = Object.fromEntries([...tallies].map(([tool, row]) => [tool, statsRow(row)]));
    return { tools, updatedAt: clock.now(), v: 1 };
  };
  const write = (): Promise<void> => {
    const writeNow = () => (file === undefined ? undefined : writeJsonAtomic(file, snapshot()));
    chain = chain.catch(ignoreFailure).then(writeNow);
    return chain;
  };
  return {
    call(tool) {
      tally(tool).calls += 1;
    },
    error({ tool, message }) {
      tally(tool).lastError = message;
    },
    repeatHit(tool) {
      tally(tool).repeatHits += 1;
    },
    result({ tool, status, ms }) {
      const row = tally(tool);
      row.statuses[status] = (row.statuses[status] ?? 0) + 1;
      row.durations.push(ms);
      if (row.durations.length > KEEP_DURATIONS) row.durations.shift();
    },
    snapshot,
    start({ path, everyMs }) {
      file = path;
      clearInterval(timer);
      timer = setInterval(() => write().catch(ignoreFailure), everyMs);
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await write();
    },
    validationError(tool) {
      tally(tool).validationErrors += 1;
    },
  };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/eval/stats.test.ts` → PASS (4 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/eval/stats.ts packages/harness/src/eval/stats.test.ts
mise exec -- git commit -F - <<'EOF'
chore: Add harness tool stats

tools.json gives graders call counts, status words, guard hits and
latency per tool without parsing the session (design I.1).
EOF
```

---
### Task L14: Status file

**Files:**
- Create: `packages/harness/src/eval/status.ts`
- Test: `packages/harness/src/eval/status.test.ts`

**Interfaces:**
- Consumes: `StatusJson` (`#harness/contract/config`); `HarnessRuntime`
  (`#harness/contract/services`); `runView` (L3a); `writeJsonAtomic` (L12a);
  `ignoreFailure`; `createTestRuntime` (F5a); `createRunRegistry`,
  `createGameLog`, `createJsonlSink` (L1, L3a).
- Produces:
  ```ts
  export const STATUS_EVERY_MS = 1000;
  export type StatusWriter = { start: (everyMs: number) => void; stop: () => Promise<void> };
  export function statusSnapshot(rt: HarnessRuntime): StatusJson;
  export function createStatusWriter(init: { path: string; snapshot: () => StatusJson }): StatusWriter;
  ```

Rules (design I.1 `status.json`, contract 2.12): every second the file holds
the agent state, the tool that runs, the active run (as a `RunView`), the
last tool call time, the last progress event, the connection state and the
ready flag. F6b starts the writer with `STATUS_EVERY_MS` and calls `stop()`
at exit. Writes are serialized (as in L13), so the last write wins.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunEnd } from "#harness/contract/runs";
import type { StatusJson } from "#harness/contract/config";
import { createStatusWriter, statusSnapshot } from "#harness/eval/status";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function fileAppears(path: string): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    if (await Bun.file(path).exists()) return;
    await Bun.sleep(5);
  }
  throw new Error(`${path} never appeared`);
}

describe("statusSnapshot", () => {
  test("reads the session, the active run and the gates", async () => {
    const clock = { now: () => 10_000 };
    const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
    const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
    const { rt } = await createTestRuntime({ parts: { clock, log, runs } });
    runs.start({ args: { to: "u4" }, kind: "travel", launch: () => new Promise<RunEnd<number>>(() => {}), toolCallId: "c1" });
    Object.assign(rt.session, { agent: "tool", lastToolCallAt: 9000, tool: "travel" });
    expect(statusSnapshot(rt)).toEqual({
      agent: "tool",
      at: 10_000,
      connection: rt.connection(),
      lastProgress: rt.progress.lastProgress(),
      lastToolCallAt: 9000,
      ready: rt.ready.isReady(),
      run: { elapsedMs: 0, id: "r1", kind: "travel", label: "travel u4", progress: undefined },
      tool: "travel",
      v: 1,
    });
  });
});

describe("createStatusWriter", () => {
  test("writes status.json on each tick and the last state at stop", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "tc-harness-status-")), "status.json");
    let calls = 0;
    const snapshot = (): StatusJson => {
      calls += 1;
      return { agent: "idle", at: calls, connection: "online", lastProgress: undefined, lastToolCallAt: undefined, ready: true, run: undefined, tool: undefined, v: 1 };
    };
    const writer = createStatusWriter({ path, snapshot });
    writer.start(5);
    await fileAppears(path);
    await writer.stop();
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ agent: "idle", at: calls, v: 1 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/eval/status.test.ts`
Expected: FAIL with `Cannot find module "#harness/eval/status"`.

- [ ] **Step 3: Implement**

```ts
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { StatusJson } from "#harness/contract/config";
import type { HarnessRuntime } from "#harness/contract/services";
import { writeJsonAtomic } from "#harness/eval/run-dir";
import { runView } from "#harness/runs/registry";

export const STATUS_EVERY_MS = 1000;

export type StatusWriter = { start: (everyMs: number) => void; stop: () => Promise<void> };

type WriterInit = { path: string; snapshot: () => StatusJson };

export function statusSnapshot(rt: HarnessRuntime): StatusJson {
  const at = rt.clock.now();
  const active = rt.runs.active();
  const { agent, lastToolCallAt, tool } = rt.session;
  return {
    agent,
    at,
    connection: rt.connection(),
    lastProgress: rt.progress.lastProgress(),
    lastToolCallAt,
    ready: rt.ready.isReady(),
    run: active && runView(active, at),
    tool,
    v: 1,
  };
}

export function createStatusWriter({ path, snapshot }: WriterInit): StatusWriter {
  let timer: ReturnType<typeof setInterval> | undefined;
  let chain: Promise<void> = Promise.resolve();
  const write = (): Promise<void> => {
    chain = chain.catch(ignoreFailure).then(() => writeJsonAtomic(path, snapshot()));
    return chain;
  };
  return {
    start(everyMs) {
      clearInterval(timer);
      timer = setInterval(() => write().catch(ignoreFailure), everyMs);
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await write();
    },
  };
}
```

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/eval/status.test.ts` → PASS (2 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/eval/status.ts packages/harness/src/eval/status.test.ts
mise exec -- git commit -F - <<'EOF'
chore: Add harness status file

The eval watcher reads status.json every second to see agent state, the
active run and the last progress (design I.1).
EOF
```

---

### Task L10a: The `[now]` line

**Files:**
- Create: `packages/harness/src/events/now.ts`
- Test: `packages/harness/src/events/now.test.ts`

**Interfaces:**
- Consumes: `NowSnapshot`, `NearestKind`, `PlaceView`, `PoseView`,
  `RecoveryView`, `CastView`, `UnitView`, `SelfView`
  (`#harness/contract/views`).
- Produces:
  ```ts
  export const NOW_MAX_CHARS = 300;
  export function nowClock(at: number): string;
  export function formatNow(snapshot: NowSnapshot): string;
  ```

Format (design C.3, contract 2.11), parts joined with ` · `:

1. self (never drops): `[now HH:MM:SS] <name> L<level> <Class> HP <hp>/<max>`,
   then ` (<+/-delta> in 5s)` when `hpDelta5s` is set and not 0, then
   ` mana <pct>%` (mana), ` <kind> <value>` (rage, energy, focus, runic
   power) or nothing, then ` <life>`, then ` in combat` when in combat;
2. place (never drops): `<zone>, <area> (<x>,<y>) server fix <n>s`
   (`no server fix` without one; `(no position)` without a pose);
3. target (drops 5th): `target <name> <ref> <relation> <n>y <hp>/<max>`;
4. attackers (drops 4th): `attackers u9,u12`;
5. cast (drops 2nd): `casting <spell> <elapsed>/<total>s`;
6. running (never drops): `running <id> <kind> <n>s`;
7. recovery (drops 3rd): `corpse <n>y <compass> reclaim in <n>s`;
8. nearest (drops 1st): `nearest <kind> <ref> <n>y, …`, one per kind in
   the order hostile, attackable, questgiver, vendor, trainer, repair,
   lootable, player, spirit_healer, skipping a ref already shown.

Parts drop in that order until the line fits 300 characters; a line that
still does not fit is cut at 300. A second line
`No progress: <n> actions in <t> (last refusal <text>). Change plan. Untried: <list>.`
comes when `noProgress` is set; a last line `Wake is off.` when `wake` is
false. Time is UTC (`HH:MM:SS` of `snapshot.at`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type { NowSnapshot, SelfView, UnitView } from "#harness/contract/views";
import { formatNow, NOW_MAX_CHARS, nowClock } from "#harness/events/now";

const at = Date.UTC(2026, 8, 26, 19, 13, 31);

const self: SelfView = {
  className: "Priest",
  copper: 1200,
  freeSlots: 10,
  guid: "1",
  hp: 190,
  inCombat: true,
  level: 10,
  life: "alive",
  maxHp: 217,
  maxPower: 100,
  name: "Fgklibhlflc",
  pose: { ageMs: 0, facing: "N", mapId: 530, serverFixAgeMs: 3000, source: "server", x: 8813.4, y: -6691.2, z: 72.7 },
  power: 88,
  powerKind: "mana",
  race: "Blood Elf",
  xpPct: 40,
};

function unit(ref: string, name: string, distance: number): UnitView {
  return {
    alive: true,
    attackable: true,
    attackingMe: false,
    compass: "N",
    distance,
    entry: 15366,
    guid: ref.slice(1),
    hp: 35,
    hpPct: 26,
    inView: true,
    kind: "creature",
    level: 7,
    lootable: false,
    maxHp: 137,
    name,
    ref,
    relation: "hostile",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: true,
    x: 0,
    y: 0,
    z: 0,
  };
}

function snapshot(over: Partial<NowSnapshot> = {}): NowSnapshot {
  const stalker = unit("u9", "Springpaw Stalker", 23);
  return {
    at,
    attackers: [{ guid: "9", hitAgoMs: 3000, name: "Springpaw Stalker", ref: "u9" }],
    hpDelta5s: -23,
    nearest: { hostile: unit("u12", "Mana Wyrm", 41), questgiver: { ...unit("u3", "Magistrix Erona", 58), relation: "friendly" } },
    noProgress: undefined,
    place: { ageMs: 1000, area: "Fairbreeze Village", areaId: 3665, zone: "Eversong Woods", zoneId: 3430 },
    recovery: undefined,
    run: { elapsedMs: 9000, id: "r4", kind: "engage", label: "engage u9", progress: undefined },
    self,
    selfCast: undefined,
    target: stalker,
    targetAuras: [],
    wake: true,
    ...over,
  };
}

describe("formatNow", () => {
  test("matches the design C.3 example", () => {
    expect(formatNow(snapshot())).toBe(
      "[now 19:13:31] Fgklibhlflc L10 Priest HP 190/217 (-23 in 5s) mana 88% alive in combat · Eversong Woods, Fairbreeze Village (8813,-6691) server fix 3s · target Springpaw Stalker u9 hostile 23y 35/137 · attackers u9 · running r4 engage 9s · nearest hostile u12 41y, questgiver u3 58y",
    );
  });

  test("drops nearest first, then the rest, and never self, place or running", () => {
    const long = "A".repeat(90);
    const crowded = snapshot({ nearest: { hostile: unit("u12", long, 41), player: unit("u20", long, 9) }, target: unit("u9", long, 23) });
    const line = formatNow(crowded);
    expect(line.length).toBeLessThanOrEqual(NOW_MAX_CHARS);
    expect(line).not.toContain("nearest");
    expect(line).toContain("running r4 engage 9s");
    expect(line).toContain("Eversong Woods, Fairbreeze Village");
    const huge = formatNow(snapshot({ target: unit("u9", "B".repeat(300), 23) }));
    expect(huge).not.toContain("target");
    expect(huge).toContain("running r4 engage 9s");
    expect(huge.length).toBeLessThanOrEqual(NOW_MAX_CHARS);
  });

  test("shows a cast and a corpse, and drops them before attackers", () => {
    const cast = { elapsedMs: 1200, spell: "Smite", totalMs: 2500 };
    const recovery = { corpseCompass: "NE" as const, corpseYd: 41, reclaimInMs: 12_000, spiritHealer: undefined };
    const line = formatNow(snapshot({ nearest: {}, recovery, selfCast: cast }));
    expect(line).toContain("casting Smite 1.2/2.5s · running r4 engage 9s · corpse 41y NE reclaim in 12s");
  });

  test("adds the no-progress line and the wake-off line", () => {
    const noProgress = { actions: 5, lastRefusal: "travel no_ground x3", sinceMs: 180_000, untried: ['travel(to: "unstick")'] };
    const [, second, third] = formatNow(snapshot({ noProgress, wake: false })).split("\n");
    expect(second).toBe('No progress: 5 actions in 3 min (last refusal travel no_ground x3). Change plan. Untried: travel(to: "unstick").');
    expect(third).toBe("Wake is off.");
  });

  test("handles a quiet state with no pose, no power, no target and no run", () => {
    const quiet = snapshot({
      attackers: [],
      hpDelta5s: undefined,
      nearest: {},
      place: { ageMs: undefined, area: undefined, areaId: undefined, zone: undefined, zoneId: undefined },
      run: undefined,
      self: { ...self, inCombat: false, pose: undefined, powerKind: "none" },
      target: undefined,
    });
    expect(formatNow(quiet)).toBe("[now 19:13:31] Fgklibhlflc L10 Priest HP 190/217 alive · unknown zone (no position)");
  });
});

describe("nowClock", () => {
  test("prints UTC HH:MM:SS", () => {
    expect(nowClock(at)).toBe("19:13:31");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/now.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/now"`.

- [ ] **Step 3: Implement**

```ts
import type {
  CastView,
  NearestKind,
  NowSnapshot,
  PlaceView,
  PoseView,
  RecoveryView,
  SelfView,
  UnitView,
} from "#harness/contract/views";

export const NOW_MAX_CHARS = 300;

const NEAREST_ORDER: readonly NearestKind[] = [
  "hostile",
  "attackable",
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "lootable",
  "player",
  "spirit_healer",
];

type Part = { text: string; drop: number };

export function nowClock(at: number): string {
  return new Date(at).toISOString().slice(11, 19);
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

function yards(distance: number | undefined): string {
  return distance === undefined ? "?y" : `${Math.round(distance)}y`;
}

function powerText({ power, maxPower, powerKind }: SelfView): string {
  if (powerKind === "none") return "";
  if (powerKind !== "mana") return ` ${powerKind.replace("_", " ")} ${power}`;
  const pct = maxPower > 0 ? Math.round((power * 100) / maxPower) : 0;
  return ` mana ${pct}%`;
}

function selfText({ at, self, hpDelta5s }: NowSnapshot): string {
  const delta = hpDelta5s ? ` (${hpDelta5s > 0 ? "+" : ""}${hpDelta5s} in 5s)` : "";
  const combat = self.inCombat ? " in combat" : "";
  const head = `[now ${nowClock(at)}] ${self.name} L${self.level} ${self.className}`;
  return `${head} HP ${self.hp}/${self.maxHp}${delta}${powerText(self)} ${self.life}${combat}`;
}

function poseText(pose: PoseView | undefined): string {
  if (!pose) return " (no position)";
  const fix = pose.serverFixAgeMs === undefined ? "no server fix" : `server fix ${seconds(pose.serverFixAgeMs)}s`;
  return ` (${Math.round(pose.x)},${Math.round(pose.y)}) ${fix}`;
}

function placeText(place: PlaceView, pose: PoseView | undefined): string {
  const area = place.area ? `, ${place.area}` : "";
  return `${place.zone ?? "unknown zone"}${area}${poseText(pose)}`;
}

function targetText(target: UnitView): string {
  return `target ${target.name} ${target.ref} ${target.relation} ${yards(target.distance)} ${target.hp}/${target.maxHp}`;
}

function castText({ spell, elapsedMs, totalMs }: CastView): string {
  return `casting ${spell} ${(elapsedMs / 1000).toFixed(1)}/${(totalMs / 1000).toFixed(1)}s`;
}

function recoveryText({ corpseYd, corpseCompass, reclaimInMs }: RecoveryView): string {
  const compass = corpseCompass ? ` ${corpseCompass}` : "";
  const reclaim = reclaimInMs === undefined ? "" : ` reclaim in ${seconds(reclaimInMs)}s`;
  return `corpse ${yards(corpseYd)}${compass}${reclaim}`;
}

function nearestText(nearest: NowSnapshot["nearest"]): string {
  const shown = new Set<string>();
  const items: string[] = [];
  for (const kind of NEAREST_ORDER) {
    const unit = nearest[kind];
    if (!unit || shown.has(unit.ref)) continue;
    shown.add(unit.ref);
    items.push(`${kind} ${unit.ref} ${yards(unit.distance)}`);
  }
  return items.length > 0 ? `nearest ${items.join(", ")}` : "";
}

function parts(s: NowSnapshot): Part[] {
  const attackers = s.attackers.map((attacker) => attacker.ref).join(",");
  const running = s.run ? `running ${s.run.id} ${s.run.kind} ${seconds(s.run.elapsedMs)}s` : "";
  const list: Part[] = [
    { drop: 0, text: selfText(s) },
    { drop: 0, text: placeText(s.place, s.self.pose) },
    { drop: 1, text: s.target ? targetText(s.target) : "" },
    { drop: 2, text: attackers ? `attackers ${attackers}` : "" },
    { drop: 4, text: s.selfCast ? castText(s.selfCast) : "" },
    { drop: 0, text: running },
    { drop: 3, text: s.recovery ? recoveryText(s.recovery) : "" },
    { drop: 5, text: nearestText(s.nearest) },
  ];
  return list.filter((part) => part.text !== "");
}

function fit(list: Part[]): string {
  const kept = [...list];
  const line = () => kept.map((part) => part.text).join(" · ");
  const droppable = list.filter((part) => part.drop > 0).sort((a, b) => b.drop - a.drop);
  for (const part of droppable) {
    if (line().length <= NOW_MAX_CHARS) break;
    kept.splice(kept.indexOf(part), 1);
  }
  return line().slice(0, NOW_MAX_CHARS);
}

function progressText({ noProgress }: NowSnapshot): string | undefined {
  if (!noProgress) return;
  const { actions, lastRefusal, sinceMs, untried } = noProgress;
  const span = sinceMs < 60_000 ? `${seconds(sinceMs)}s` : `${Math.round(sinceMs / 60_000)} min`;
  const refusal = lastRefusal ? ` (last refusal ${lastRefusal})` : "";
  const options = untried.length > 0 ? ` Untried: ${untried.join(", ")}.` : "";
  return `No progress: ${actions} actions in ${span}${refusal}. Change plan.${options}`;
}

export function formatNow(snapshot: NowSnapshot): string {
  const lines = [fit(parts(snapshot)), progressText(snapshot), snapshot.wake ? undefined : "Wake is off."];
  return lines.filter((line) => line !== undefined).join("\n");
}
```

The drop numbers name the order: the highest drops first (nearest 5, cast 4,
recovery 3, attackers 2, target 1); 0 never drops.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/now.test.ts` → PASS (6 tests).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/now.ts packages/harness/src/events/now.test.ts
mise exec -- git commit -F - <<'EOF'
feat: Add harness now line

Each agent run starts from one 300-character situation line, so the
small model does not need a look call first (design C.3).
EOF
```

---
### Task L10b: Install events in the Pi session

**Files:**
- Create: `packages/harness/src/events/install.ts`
- Modify: `packages/harness/src/extension/extension.ts` (insertion point: one
  import line and the `installEvents(pi, rt);` line, contract 2.5)
- Test: `packages/harness/src/events/install.test.ts`

**Interfaces:**
- Consumes: `AgentMessage` (`@earendil-works/pi-agent-core`); `ExtensionAPI`,
  `ExtensionContext` (`@earendil-works/pi-coding-agent`); `ignoreFailure`;
  `HarnessRuntime`, `DeliverySink` (`#harness/contract/services`);
  `createDelivery`, `formatWake`, `Delivery` (L9b); `createStuckWatch` (L9b);
  `formatNow`, `nowClock` (L10a); `linkSession` (L12b); `nowSnapshot`
  (`#harness/ops/views`, A3); `createTestRuntime`, `testPaths` (F5ab).
- Produces:
  ```ts
  export const NOW_DISPLAY = false;
  export type NowMessage = { content: string; customType: "wow-now"; display: boolean };
  export function nowMessage(content: string, display?: boolean): NowMessage;
  export function nowText(rt: HarnessRuntime): string;
  export function installEvents(pi: ExtensionAPI, rt: HarnessRuntime): void;
  ```

Behaviour (design C.1, C.3, H.3, I.1; contract 2.11; issues 6, 8):

- `installEvents` creates the delivery sink and the stuck watch, calls
  `rt.router.setSink(delivery)`, and starts the watch. F7a's
  `installShutdown` detaches the sink at `session_shutdown`; this module stops
  the watch there. `/new`, `/resume` and `/fork` run the factory again, so a
  new sink and watch replace the old ones.
- `before_agent_start` returns `{ message: nowMessage(content) }`, where
  `content` is `nowText(rt)` plus the buffered passive lines
  (`delivery.takePassive()`, formatted by `formatWake`) on the next lines. It
  sets `rt.session.lastNow` and appends `agent/now` (class `log`, `text` = the
  first line, `data.text` = the whole content).
- `nowText`: `formatNow(nowSnapshot(rt))`; without a snapshot,
  `[now HH:MM:SS] the game connection is down.` (no handle) or
  `[now HH:MM:SS] the world is still loading.` (handle, not ready).
- `session_start`: `linkSession(rt.paths, ctx.sessionManager.getSessionFile())`
  when Pi has a session file; with reason `resume` it also sends the `[now]`
  message first (`pi.sendMessage(…, { triggerTurn: false })`; a
  `session_start` handler returns nothing).
- `agent_end`: `delivery.flush()`.
- **Wake turns** (main plan ruling R-L10, from prompt-docs issue 3): Pi fires
  `before_agent_start` only from `session.prompt()`, not for a run that a
  `sendMessage(…, { triggerTurn: true })` wake starts (measured by the
  prompt-docs writer, `agent-session.js:1283`, `:1502-1507`). So a `context`
  hook, always on, appends a hidden `wow-now` custom message
  (`{ role: "custom", customType: "wow-now", content, display: NOW_DISPLAY,
  timestamp }`) when the last message is a `wow-event` custom message with
  `details.kind === "wake"`. That is only the first LLM request of a wake
  run: after a tool call the last message is a tool result. The content is
  `nowText(rt)` only (passive lines stay queued, spec §6.C); it sets
  `rt.session.lastNow` and appends `agent/now` like the human path. A
  `context` message is not stored in the session file (V2, measured on faux).
- With `--now-per-call` only: the same `context` hook appends
  `{ role: "user", content: nowText(rt), timestamp }` before every other LLM
  call (the first request of a wake run gets only the hidden `wow-now`)
  (off by default until V1 and V2 pass, F8d and F8e).
- **V6 fallback.** `NOW_DISPLAY` is `false` (hidden message). F8c
  (`src/smoke/v6-now.test.ts`) proves or disproves that Luna sees a
  `display: false` message. Step 0 below reads its result; if V6 failed, set
  `NOW_DISPLAY = true`, which is the design H.7 fallback ("inject `[now]` as a
  visible one-line message"). Both paths are tested through
  `nowMessage(content, display)`.

- [ ] **Step 0: Read the V6 result**

Run: `mise test packages/harness/src/smoke/v6-now.test.ts`
Also run `mise test packages/harness/src/smoke/v2-context.test.ts`: its second test (F8d) proves that a hidden custom message that a `context` hook adds on a wake run reaches the model and is not stored, which the wake-run `[now]` below rests on. If that test fails, stop and report to the coordinator (main plan ruling R-L10 then moves the line into the wake message). If the V6 test passes, keep `NOW_DISPLAY = false`. If it fails on the hidden-message
assertion (not on a setup error), use `NOW_DISPLAY = true` in Step 3 and
change the `display` expectation in the first test below to `true`. If the
file does not exist yet, stop and report to the coordinator: L10b needs F8c.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, jest, test } from "bun:test";
import { mkdir, mkdtemp, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HarnessFlags } from "#harness/contract/config";
import type { DeliverySink } from "#harness/contract/services";
import { installEvents, NOW_DISPLAY, nowMessage, nowText } from "#harness/events/install";
import { createGameLog } from "#harness/log/store";
import { createTestRuntime, testPaths } from "#test-support/runtime-fixture";

type Handler = (event: unknown, ctx: unknown) => unknown;

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const sent: { message: Record<string, unknown>; options: unknown }[] = [];
  const api = {
    appendEntry: () => {},
    on: (name: string, handler: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return () => {};
    },
    sendMessage: (message: Record<string, unknown>, options?: unknown) => {
      sent.push({ message, options });
    },
  };
  const emit = async (name: string, event: unknown = {}, ctx: unknown = {}) => {
    const results: unknown[] = [];
    for (const handler of handlers.get(name) ?? []) results.push(await handler(event, ctx));
    return results;
  };
  return { api: api as unknown as ExtensionAPI, emit, handlers, sent };
}

async function setup(flags: Partial<HarnessFlags> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tc-harness-install-"));
  const clock = { now: () => 1000 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const paths = testPaths(dir);
  await mkdir(paths.dir, { recursive: true });
  const { rt } = await createTestRuntime({ flags, parts: { clock, log, paths } });
  const setSink = jest.fn();
  rt.router.setSink = setSink;
  const pi = fakePi();
  installEvents(pi.api, rt);
  const sink = () => setSink.mock.calls[0]?.[0] as DeliverySink;
  return { log, paths, pi, rt, setSink, sink };
}

type NowResult = { message: { content: string; customType: string; display: boolean } };

async function startAgent(pi: ReturnType<typeof fakePi>): Promise<NowResult["message"]> {
  const [result] = await pi.emit("before_agent_start", { prompt: "hi", type: "before_agent_start" });
  return (result as NowResult).message;
}

describe("installEvents", () => {
  test("hands the router a sink and injects [now] before each agent run", async () => {
    const { log, pi, rt, setSink } = await setup();
    expect(setSink).toHaveBeenCalledTimes(1);
    const message = await startAgent(pi);
    expect(message).toEqual({ content: nowText(rt), customType: "wow-now", display: NOW_DISPLAY });
    expect(message.content.startsWith("[now ")).toBe(true);
    expect(rt.session.lastNow).toBe(message.content);
    expect(log.since(0).filter((row) => row.event === "agent/now")).toHaveLength(1);
  });

  test("adds buffered passive lines after the [now] line", async () => {
    const { log, pi, rt, sink } = await setup();
    const line = log.append({ class: "passive", data: {}, delivered: false, domain: "xp", event: "xp/gain", text: "You gain 130 XP." });
    sink().passive(line);
    const message = await startAgent(pi);
    expect(message.content).toBe(`${nowText(rt)}\n[game 0s] You gain 130 XP.`);
  });

  test("flushes passive lines at agent_end", async () => {
    const { log, pi, sink } = await setup();
    sink().passive(log.append({ class: "passive", data: {}, delivered: false, domain: "xp", event: "xp/gain", text: "You gain 130 XP." }));
    await pi.emit("agent_end", { messages: [], type: "agent_end" });
    expect(pi.sent).toEqual([
      expect.objectContaining({ message: expect.objectContaining({ content: "[game 0s] You gain 130 XP.", customType: "wow-event" }), options: { triggerTurn: false } }),
    ]);
  });

  test("links the session file and re-sends [now] on resume", async () => {
    const { paths, pi } = await setup();
    const file = join(paths.dir, "pi.jsonl");
    await writeFile(file, "");
    const ctx = { sessionManager: { getSessionFile: () => file } };
    await pi.emit("session_start", { reason: "startup", type: "session_start" }, ctx);
    expect(await readlink(paths.session)).toBe(file);
    expect(pi.sent).toEqual([]);
    await pi.emit("session_start", { reason: "resume", type: "session_start" }, ctx);
    expect(pi.sent[0]).toMatchObject({ message: { customType: "wow-now", display: NOW_DISPLAY }, options: { triggerTurn: false } });
  });

  test("a wake run gets a hidden [now] message on its first request only", async () => {
    const { log, pi, rt } = await setup();
    const wake = { content: "[game 0s] r4 travel ended.", customType: "wow-event", details: { entries: [], kind: "wake" }, display: true, role: "custom", timestamp: 1 };
    const [first] = await pi.emit("context", { messages: [wake], type: "context" });
    const messages = (first as { messages: { content: string; customType?: string; display?: boolean; role: string }[] }).messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ content: nowText(rt), customType: "wow-now", display: NOW_DISPLAY, role: "custom" });
    expect(rt.session.lastNow).toBe(nowText(rt));
    expect(log.since(0).filter((row) => row.event === "agent/now")).toHaveLength(1);
    const toolResult = { content: [], role: "toolResult", timestamp: 2 };
    const [later] = await pi.emit("context", { messages: [wake, toolResult], type: "context" });
    expect(later).toBeUndefined();
    const passive = { ...wake, details: { entries: [], kind: "passive" } };
    const [flushOnly] = await pi.emit("context", { messages: [passive], type: "context" });
    expect(flushOnly).toBeUndefined();
  });

  test("adds the per-call message only with --now-per-call", async () => {
    const off = await setup();
    const [none] = await off.pi.emit("context", { messages: [], type: "context" });
    expect(none).toBeUndefined();
    const on = await setup({ nowPerCall: true });
    const [result] = await on.pi.emit("context", { messages: [], type: "context" });
    const messages = (result as { messages: { content: string; role: string }[] }).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "user" });
    expect(messages[0]?.content.startsWith("[now ")).toBe(true);
  });
});

describe("nowText and nowMessage", () => {
  test("says offline or loading when there is no snapshot", async () => {
    const clock = { now: () => Date.UTC(2026, 8, 26, 19, 13, 31) };
    const offline = await createTestRuntime({ connect: false, parts: { clock } });
    expect(nowText(offline.rt)).toBe("[now 19:13:31] the game connection is down.");
    const loading = await createTestRuntime({ parts: { clock }, ready: false });
    expect(nowText(loading.rt)).toBe("[now 19:13:31] the world is still loading.");
  });

  test("builds the hidden message and the visible V6 fallback", () => {
    expect(nowMessage("[now 19:13:31] x")).toEqual({ content: "[now 19:13:31] x", customType: "wow-now", display: NOW_DISPLAY });
    expect(nowMessage("[now 19:13:31] x", true).display).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/events/install.test.ts`
Expected: FAIL with `Cannot find module "#harness/events/install"`.

- [ ] **Step 3: Implement**

`packages/harness/src/events/install.ts`:

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { HarnessRuntime } from "#harness/contract/services";
import { createDelivery, type Delivery, formatWake } from "#harness/events/delivery";
import { createStuckWatch } from "#harness/events/guard";
import { formatNow, nowClock } from "#harness/events/now";
import { linkSession } from "#harness/eval/run-dir";
import { nowSnapshot } from "#harness/ops/views";

export const NOW_DISPLAY = false;

export type NowMessage = { content: string; customType: "wow-now"; display: boolean };

type StartInit = {
  ctx: ExtensionContext;
  delivery: Delivery;
  pi: ExtensionAPI;
  reason: string;
  rt: HarnessRuntime;
};

export function nowMessage(content: string, display = NOW_DISPLAY): NowMessage {
  return { content, customType: "wow-now", display };
}

export function nowText(rt: HarnessRuntime): string {
  const snapshot = nowSnapshot(rt);
  if (snapshot) return formatNow(snapshot);
  const why = rt.handle() ? "the world is still loading." : "the game connection is down.";
  return `[now ${nowClock(rt.clock.now())}] ${why}`;
}

function currentNow(rt: HarnessRuntime, delivery: Delivery): string {
  const line = nowText(rt);
  const passive = delivery.takePassive();
  const content = passive.length > 0 ? `${line}\n${formatWake(passive, rt.clock.now())}` : line;
  const [first = line] = line.split("\n");
  rt.session.lastNow = content;
  rt.log.append({ class: "log", data: { text: content }, domain: "agent", event: "agent/now", text: first });
  return content;
}

async function onSessionStart({ ctx, delivery, pi, reason, rt }: StartInit): Promise<void> {
  const file = ctx.sessionManager.getSessionFile();
  if (file) await linkSession(rt.paths, file).catch(ignoreFailure);
  if (reason === "resume") pi.sendMessage(nowMessage(currentNow(rt, delivery)), { triggerTurn: false });
}

function perCallNow(rt: HarnessRuntime): AgentMessage {
  return { content: nowText(rt), role: "user", timestamp: rt.clock.now() };
}

type Tail = { customType?: string; details?: { kind?: string }; role?: string };

function endsWithWake(messages: readonly AgentMessage[]): boolean {
  const last = messages.at(-1) as Tail | undefined;
  return last?.role === "custom" && last.customType === "wow-event" && last.details?.kind === "wake";
}

function wakeNow(rt: HarnessRuntime): AgentMessage {
  const content = nowText(rt);
  const [first = content] = content.split("\n");
  rt.session.lastNow = content;
  rt.log.append({ class: "log", data: { text: content }, domain: "agent", event: "agent/now", text: first });
  return { content, customType: "wow-now", display: NOW_DISPLAY, role: "custom", timestamp: rt.clock.now() };
}

function contextNow(rt: HarnessRuntime, messages: AgentMessage[]): { messages: AgentMessage[] } | undefined {
  if (endsWithWake(messages)) return { messages: [...messages, wakeNow(rt)] };
  if (rt.flags.nowPerCall) return { messages: [...messages, perCallNow(rt)] };
  return undefined;
}

export function installEvents(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const delivery = createDelivery({ pi, rt });
  const stuck = createStuckWatch({ rt });
  rt.router.setSink(delivery);
  stuck.start();
  pi.on("before_agent_start", () => ({ message: nowMessage(currentNow(rt, delivery)) }));
  pi.on("session_start", (event, ctx) => onSessionStart({ ctx, delivery, pi, reason: event.reason, rt }));
  pi.on("agent_end", () => delivery.flush());
  pi.on("session_shutdown", () => stuck.stop());
  pi.on("context", (event) => contextNow(rt, event.messages));
}
```

`packages/harness/src/extension/extension.ts`: add the import line
`import { installEvents } from "#harness/events/install";` and the line
`installEvents(pi, rt);` at its place in the fixed order of contract 2.5:
after `installTools(pi, rt);` if A1 has landed, else after
`installGuards(pi, rt);`, and before any `installPrompt`, `installUi`,
`installCommands` or `installShutdown` line. Change nothing else in the file.

- [ ] **Step 4: Run and pass**

Run: `mise test packages/harness/src/events/install.test.ts` → PASS (8 tests).
Run: `mise test packages/harness/src/extension/` → PASS (F7a's tests still pass
with the new line).
Run: `bun run tsc --noEmit -p packages/harness` → exit 0. Run: `mise lint` → exit 0.
Run: `mise ci` → green (the legacy shell stays green, R21).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/events/install.ts packages/harness/src/events/install.test.ts packages/harness/src/extension/extension.ts
mise exec -- git commit -F - <<'EOF'
feat: Install harness events in Pi

The session needs the delivery sink, the hidden [now] line at each agent
run and the session link, with the V6 fallback one constant away.
EOF
```

**Live check:** none in this task. The harness does not start before F6b
(BOOT). F8e checks the `[now]` message, wakes and the session link in an Orca
pane on a soap account, and the FINAL canary `t0-self-state` runs the whole
area against the server.

---

## Self-review against the design

| Design item | Task |
|---|---|
| D.1 record, `v`, `seq`, `ts`, `char`, `consumedBy`, `delivered`, 250 ms flush | L1a, L1b |
| D.2 every P5 event row | L5a (run), L6 (chat, group, duel), L7 (combat, xp, fight, life, aura), L8a (control, vendor, trainer, entity, packet, notice), L8b (quest, loot, money), L11 (snapshot); `session/*` from F5b/F5c, `tool/*` from A1, `human/*` and `agent/message` from F7b, `agent/stuck` count from A9 |
| D.3 ring of 5,000, per-reader cursors, no shared cursor | L1b (indexes: contract issue 7) |
| D.4 tail, search, since | L2 |
| C.1 wake, passive, log classes | L5a–L8b tables |
| C.2 `consumedBy` dedupe, ages on wake lines | L9b, L1b |
| C.3 `[now]` builder and injection, resume, `--now-per-call` | L10a, L10b |
| C.5 wake guards, self echoes never above log, `/wake off` | L9a, L5b, L6 |
| C.6 stuck wake | L9b |
| A.3 blocking runs, one at a time, yield on human or 120 s | L3a, L3b |
| H.3 21 hooks subscribed per handle, detach | L5b |
| H.6 adapters: goto poll, tactics sync and async failures, cycle stop | L4a, L4b |
| I.1 meta, tools, runs, status, session link, pruning | L12a, L12b, L13, L14, L3a (`runs.jsonl`) |
| V.4 #2, #3 | L4b, L7 |
| LU.3 #1 (wake format), #11 (no chat lines on a whisper wake) | L9b |
