import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
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
type Live = {
  cause: StopCause | undefined;
  controller: AbortController;
  record: RunRecord;
};

export function runLabel({
  kind,
  args,
}: Pick<RunRecord, "kind" | "args">): string {
  const words = Object.values(args)
    .filter((value) => value !== undefined)
    .map(String);
  return [kind, ...words].join(" ");
}

export function runView(record: RunRecord, now: number): RunView {
  const { id, kind, progress, startedAt } = record;
  return {
    elapsedMs: now - startedAt,
    id,
    kind,
    label: runLabel(record),
    progress,
  };
}

function cancelStatus(cause: StopCause): Exclude<RunStatus, "running"> {
  return cause === "lost" ? "interrupted" : "cancelled";
}

function busyRefusal({ id, kind }: RunRecord): Refusal {
  return new Refusal({
    detail: `${id} (${kind}) is still running.`,
    next: `stop(run: "${id}")`,
    reason: "busy",
  });
}

function runRow({
  args,
  endedAt,
  id,
  kind,
  reason,
  startedAt,
  status,
  summary,
}: RunRecord) {
  return { args, endedAt, id, kind, reason, startedAt, status, summary };
}

function failure(error: unknown): RunEnd<undefined> {
  const message = messageOf(error);
  return {
    reason: message,
    status: "failed",
    summary: message,
    value: undefined,
  };
}

type RegistryState = {
  clock: Clock;
  emit: (type: RunEvent["type"], record: RunRecord) => void;
  next: () => string;
  running: () => Live[];
  runs: Map<string, Live>;
  settle: <R>(live: Live, end: RunEnd<R>) => RunEnd<R>;
};

function startRun<R>(
  state: RegistryState,
  { args, kind, launch, toolCallId }: RunStart<R>,
): RunHandle<R> {
  const busy = state.running()[0];
  if (busy) throw busyRefusal(busy.record);
  const record: RunRecord = {
    args,
    awaited: true,
    endedAt: undefined,
    id: state.next(),
    kind,
    progress: undefined,
    reason: undefined,
    startedAt: state.clock.now(),
    status: "running",
    summary: undefined,
    toolCallId,
  };
  const live: Live = {
    cause: undefined,
    controller: new AbortController(),
    record,
  };
  state.runs.set(record.id, live);
  state.emit("started", record);
  const progress = (text: string) => {
    record.progress = text;
    state.emit("progress", record);
  };
  const { signal } = live.controller;
  const done = launch({ progress, signal }).then(
    (end) => state.settle(live, end),
    (error: unknown) => {
      state.settle(live, failure(error));
      throw error;
    },
  );
  done.catch(ignoreFailure);
  return { done, id: record.id, signal };
}

export function createRunRegistry({ clock, sink }: RegistryInit): RunRegistry {
  const runs = new Map<string, Live>();
  const listeners = new Set<(event: RunEvent) => void>();
  let count = 0;
  const emit = (type: RunEvent["type"], record: RunRecord) => {
    for (const cb of listeners) cb({ record: { ...record }, type });
  };
  const running = () =>
    [...runs.values()].filter((live) => live.record.status === "running");
  const settle = <R>(live: Live, end: RunEnd<R>): RunEnd<R> => {
    const { cause } = live;
    const final =
      cause === undefined
        ? end
        : { ...end, reason: CANCEL_CODES[cause], status: cancelStatus(cause) };
    Object.assign(live.record, {
      endedAt: clock.now(),
      reason: final.reason,
      status: final.status,
      summary: final.summary,
    });
    sink.write(runRow(live.record));
    emit("ended", live.record);
    return final;
  };
  const next = () => {
    count += 1;
    return `r${count}`;
  };
  const state: RegistryState = { clock, emit, next, running, runs, settle };
  const snapshot = (live: Live | undefined) => live && { ...live.record };
  function cancel(id: string, cause: StopCause): RunRecord | undefined {
    const live = runs.get(id);
    if (live?.record.status !== "running") return;
    live.cause ??= cause;
    live.controller.abort(new Error(CANCEL_CODES[cause]));
    return { ...live.record };
  }
  return {
    active: () => snapshot(running()[0]),
    cancel,
    cancelAll: (cause) =>
      running().flatMap((live) => cancel(live.record.id, cause) ?? []),
    get: (id) => snapshot(runs.get(id)),
    list: () => [...runs.values()].map((live) => ({ ...live.record })),
    release(id) {
      const live = runs.get(id);
      if (live) live.record.awaited = false;
    },
    start: (init) => startRun(state, init),
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
