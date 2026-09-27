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
    quests: new Map(),
    ready: readyDouble(forceReady),
    refs: memoryRefs(),
    repeats: {
      blocks: () => false,
      check: () => undefined,
      hits: () => 0,
      positionalPoses: () => [],
      record: () => {},
    } satisfies RepeatGuard,
    router: { ...detached, setSink: () => {} } satisfies EventRouter,
    runs: memoryRuns(clock),
    sightings: {
      ...detached,
      all: () => [],
      forget: () => {},
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
      blockedBearings: new Map(),
      exploreOrigin: undefined,
      explores: [],
      lastGoodPose: undefined,
      lastRefusedGoal: undefined,
      obstructedExplores: new Map(),
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
