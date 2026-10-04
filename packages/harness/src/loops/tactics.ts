import { abortable, abortReason, bounded, pause } from "@peon/core/lib/abort";
import { Emitter, type Unsubscribe } from "@peon/core/lib/emitter";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type {
  JevActionResult,
  JevCandidate,
  JevExchange,
  JevSelect,
} from "#harness/jev/contract";
import { JevTransportError, JevUnavailableError } from "#harness/jev/failure";
import type { FramingVariant } from "#harness/jev/framing";
import {
  judge,
  offers,
  WAIT_CANDIDATE,
  withWait,
} from "#harness/loops/tactics-select";

export const DEFAULT_FIGHT_INSTRUCTION =
  "defeat the selected target while keeping the character alive";
const DEFAULT_MAX_AGE_MS = 2000;
const DEFAULT_INTERVAL_MS = 200;
const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_TIMEOUTS = 3;
export const SERVER_REJECTION = "server_action_rejected:";
export const TRANSPORT_LIMIT = 3;

export type TacticsBase<O = unknown> = {
  instruction: string;
  framing?: FramingVariant;
  objective?: O;
};

export type TacticsContext = TacticsBase<unknown> & { targetGuid: bigint };

export type TacticsOutcome = {
  status: "completed" | "blocked" | "failed";
  reason: string;
  observation?: Readonly<Record<string, unknown>>;
};

export type TacticsDefense = "auto_attack" | "uncontrolled_in_combat" | "none";

export type TacticsFrame = {
  observation: Readonly<Record<string, unknown>>;
  candidates: readonly JevCandidate[];
  outcome?: TacticsOutcome;
};

export type TacticsDeps<C extends TacticsBase = TacticsContext> = {
  prepare: (context: C, signal: AbortSignal) => Promise<void>;
  activate: (context: C) => void;
  observe: (context: C) => TacticsFrame;
  commit?: (context: C) => TacticsFrame;
  execute: (actionId: string, context: C) => void;
  halt: () => void;
  defend: (context: C) => TacticsDefense;
  select: JevSelect | undefined;
  now?: () => number;
  maxResultAgeMs?: number;
  minIntervalMs?: number;
  requestTimeoutMs?: number;
  fault?: string;
  characterClass?: () => string | undefined;
  wait?: JevCandidate | null;
};

type TacticsRequest = {
  call: number;
  observation: Readonly<Record<string, unknown>>;
  candidates: readonly JevCandidate[];
  instruction: string;
  sentAtMs: number;
  framing: FramingVariant;
  characterClass?: string;
};

export type TacticsState = {
  status: "idle" | "preparing" | "active";
  runId: string | undefined;
  targetGuid: bigint | undefined;
  instruction: string;
  framing?: FramingVariant;
  lastRequest: TacticsRequest | undefined;
  lastResult: JevActionResult | undefined;
  lastDecision:
    | { actionId: string; disposition: "applied" | "discarded"; reason: string }
    | undefined;
  lastOutcome: TacticsOutcome | undefined;
  lastDiscardReason: string | undefined;
  lastStopReason?: string;
  fault?: string;
  timeouts: { consecutive: number; total: number; limit: number };
  defense?: TacticsDefense;
};

export type TacticsEvent =
  | {
      type: "started";
      runId: string;
      targetGuid: string | undefined;
      instruction: string;
      framing: FramingVariant;
      fault?: string;
      objective?: unknown;
    }
  | { type: "activated"; runId: string }
  | ({ type: "request"; runId: string } & TacticsRequest)
  | ({ type: "exchange"; runId: string; call: number } & JevExchange)
  | ({ type: "result"; runId: string; call: number } & JevActionResult)
  | {
      type: "applied";
      runId: string;
      call: number;
      actionId: string;
      ageMs: number;
    }
  | {
      type: "discarded";
      runId: string;
      call: number;
      reason: string;
      actionId?: string;
    }
  | ({ type: "outcome"; runId: string } & TacticsOutcome)
  | { type: "transport"; runId: string; call?: number; error: string }
  | { type: "stopped"; runId: string; reason: string; state: TacticsState };

type Run<C extends TacticsBase> = {
  runId: string;
  context: C & { framing: FramingVariant };
  select: JevSelect;
  abort: AbortController;
  detach: () => void;
  timeouts: number;
  transportFailures: number;
  calls: number;
};

type Decision<C extends TacticsBase> = {
  run: Run<C>;
  call: number;
  candidates: readonly JevCandidate[];
  sentAtMs: number;
  result: JevActionResult;
};

export class TacticsLoop<C extends TacticsBase = TacticsContext> {
  private readonly deps: TacticsDeps<C>;
  private readonly maxResultAgeMs: number;
  private readonly minIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly events = new Emitter<[TacticsEvent]>();
  private run: Run<C> | undefined;
  private pending: Promise<void> | undefined;
  private state: TacticsState = {
    status: "idle",
    runId: undefined,
    targetGuid: undefined,
    instruction: "",
    lastRequest: undefined,
    lastResult: undefined,
    lastDecision: undefined,
    lastOutcome: undefined,
    lastDiscardReason: undefined,
    timeouts: noTimeouts(),
  };

  constructor(deps: TacticsDeps<C>) {
    this.deps = deps;
    this.maxResultAgeMs = deps.maxResultAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.minIntervalMs = deps.minIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async start(context: C, signal?: AbortSignal): Promise<void> {
    this.stop("replaced");
    const select = this.deps.select;
    if (!select) throw new JevUnavailableError("missing_jev_key");
    if (signal?.aborted) throw abortReason(signal);
    const run = this.begin(context, select, signal);
    try {
      await this.activate(run);
    } catch (error) {
      if (!this.live(run)) return;
      this.fail(run, error);
      throw error;
    }
    try {
      await this.decide(run);
    } catch (error) {
      const live = this.live(run);
      this.fail(run, error, true);
      if (live && error instanceof JevUnavailableError) throw error;
    }
  }

  stop(reason: string): void {
    this.end(reason, false);
  }

  private end(reason: string, defend: boolean): void {
    const run = this.run;
    if (!run) return;
    this.run = undefined;
    this.state.status = "idle";
    this.state.lastStopReason = reason;
    run.detach();
    run.abort.abort();
    try {
      if (defend) this.state.defense = this.deps.defend(run.context);
      else this.deps.halt();
    } finally {
      const state = this.snapshot();
      this.emit({ type: "stopped", runId: run.runId, reason, state });
    }
  }

  snapshot(): TacticsState {
    return structuredClone(this.state);
  }

  onEvent(listener: (event: TacticsEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  dispose(): void {
    this.events.clear();
    this.stop("disposed");
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : performance.now();
  }

  private emit(event: TacticsEvent): void {
    this.events.emit(structuredClone(event));
  }

  private begin(
    context: C,
    select: JevSelect,
    external: AbortSignal | undefined,
  ): Run<C> {
    const framing = context.framing ?? "none";
    const run: Run<C> = {
      runId: crypto.randomUUID(),
      context: { ...context, framing },
      select,
      abort: new AbortController(),
      detach: () => external?.removeEventListener("abort", onExternal),
      timeouts: 0,
      transportFailures: 0,
      calls: 0,
    };
    const onExternal = () => {
      if (this.live(run)) this.stop("aborted");
    };
    external?.addEventListener("abort", onExternal, { once: true });
    this.run = run;
    const { instruction, objective } = context;
    const targetGuid =
      "targetGuid" in context
        ? (context.targetGuid as bigint | undefined)
        : undefined;
    const fault = this.deps.fault;
    this.state = {
      status: "preparing",
      runId: run.runId,
      targetGuid,
      instruction,
      framing,
      lastRequest: undefined,
      lastResult: undefined,
      lastDecision: undefined,
      lastOutcome: undefined,
      lastDiscardReason: undefined,
      timeouts: noTimeouts(),
      fault,
    };
    const guid =
      targetGuid === undefined ? undefined : `0x${targetGuid.toString(16)}`;
    const started = { runId: run.runId, targetGuid: guid, instruction };
    this.emit({ type: "started", ...started, framing, fault, objective });
    return run;
  }

  private async activate(run: Run<C>): Promise<void> {
    const signal = run.abort.signal;
    await abortable(this.deps.prepare(run.context, signal), signal);
    if (this.pending)
      await bounded(this.pending, signal, this.requestTimeoutMs, TIMEOUT);
    if (!this.live(run)) return;
    this.deps.activate(run.context);
    if (!this.live(run)) return;
    this.state.status = "active";
    this.emit({ type: "activated", runId: run.runId });
  }

  private live(run: Run<C>): boolean {
    return this.run === run && !run.abort.signal.aborted;
  }

  private fail(run: Run<C>, error: unknown, defend = false): void {
    if (!this.live(run)) return;
    const reason = messageOf(error);
    this.state.lastDiscardReason = reason;
    this.emit({ type: "transport", runId: run.runId, error: reason });
    this.finish(run, { status: "failed", reason }, undefined, defend);
  }

  private finish(
    run: Run<C>,
    outcome: TacticsOutcome,
    observation?: TacticsFrame["observation"],
    defend = false,
  ): void {
    if (!this.live(run)) return;
    const recorded = structuredClone(
      observation === undefined ? outcome : { ...outcome, observation },
    );
    this.state.lastOutcome = recorded;
    this.emit({ type: "outcome", runId: run.runId, ...recorded });
    if (this.live(run)) this.end(recorded.status, defend);
  }

  private async decide(run: Run<C>): Promise<void> {
    while (this.live(run)) {
      const frame = this.deps.observe(run.context);
      if (!this.live(run)) return;
      if (frame.outcome) {
        const defend = frame.outcome.reason.startsWith(SERVER_REJECTION);
        this.finish(run, frame.outcome, frame.observation, defend);
        return;
      }
      const candidates = withWait(frame.candidates, this.deps.wait);
      const idle = this.deps.wait?.id ?? WAIT_CANDIDATE.id;
      const sentAtMs = this.now();
      if (candidates.some((candidate) => candidate.id !== idle)) {
        run.calls += 1;
        const call = run.calls;
        const result = await this.attempt(run, { ...frame, candidates }, call);
        if (result) this.commit({ run, call, result, candidates, sentAtMs });
      }
      if (this.live(run)) {
        const delay = Math.max(0, this.minIntervalMs - (this.now() - sentAtMs));
        await pause(delay, run.abort.signal);
      }
    }
  }

  private async attempt(
    run: Run<C>,
    frame: TacticsFrame,
    call: number,
  ): Promise<JevActionResult | undefined> {
    try {
      const result = await this.select(run, frame, call);
      run.timeouts = 0;
      run.transportFailures = 0;
      this.state.timeouts.consecutive = 0;
      return result;
    } catch (error) {
      if (!this.live(run)) throw error;
      this.retry(run, error);
      const reason = messageOf(error);
      this.state.lastDiscardReason = reason;
      this.emit({ type: "transport", runId: run.runId, call, error: reason });
      return undefined;
    }
  }

  private retry(run: Run<C>, error: unknown): void {
    if (error instanceof JevTransportError) {
      run.transportFailures += 1;
      if (run.transportFailures < TRANSPORT_LIMIT) return;
      const detail = `transport ${error.message} (${TRANSPORT_LIMIT} in a row)`;
      throw new JevUnavailableError(detail, { cause: error });
    }
    if (messageOf(error) !== TIMEOUT) throw error;
    run.timeouts += 1;
    this.state.timeouts.consecutive = run.timeouts;
    this.state.timeouts.total += 1;
    if (run.timeouts >= MAX_CONSECUTIVE_TIMEOUTS) throw error;
  }

  private async select(
    run: Run<C>,
    frame: TacticsFrame,
    call: number,
  ): Promise<JevActionResult> {
    const request: TacticsRequest = structuredClone({
      call,
      observation: frame.observation,
      candidates: frame.candidates,
      instruction: run.context.instruction,
      sentAtMs: this.now(),
      framing: run.context.framing,
      characterClass: this.deps.characterClass?.(),
    });
    this.state.lastRequest = request;
    this.emit({ type: "request", runId: run.runId, ...request });
    if (!this.live(run)) throw abortReason(run.abort.signal);
    const abort = new AbortController();
    const signal = AbortSignal.any([run.abort.signal, abort.signal]);
    const { runId } = run;
    const pending = run.select(request, {
      record: (exchange) =>
        this.emit({ type: "exchange", runId, call, ...exchange }),
      signal,
    });
    this.track(pending.then((result) => this.late(run, call, result, signal)));
    try {
      return await bounded(pending, signal, this.requestTimeoutMs, TIMEOUT);
    } finally {
      abort.abort();
    }
  }

  private track(settling: Promise<void>): void {
    const settled = settling.catch(ignoreFailure);
    this.pending = settled;
    void settled.then(() => {
      if (this.pending === settled) this.pending = undefined;
    });
  }

  private late(
    run: Run<C>,
    call: number,
    result: JevActionResult,
    signal: AbortSignal,
  ): void {
    if (this.live(run) && !signal.aborted) return;
    const { runId } = run;
    this.emit({ type: "result", runId, call, ...result });
    this.emit({
      type: "discarded",
      runId,
      call,
      reason: "aborted",
      actionId: result.choice,
    });
  }

  private commit({
    run,
    call,
    result,
    candidates,
    sentAtMs,
  }: Decision<C>): void {
    if (!this.live(run)) return;
    this.state.lastResult = structuredClone(result);
    this.emit({ type: "result", runId: run.runId, call, ...result });
    if (!this.live(run)) return;
    const ageMs = this.now() - sentAtMs;
    const choice = result.choice;
    const rejected = judge(choice, ageMs, this.maxResultAgeMs, candidates);
    if (rejected) {
      this.discard(run, call, rejected, choice);
      return;
    }
    const current = this.deps.commit
      ? this.deps.commit(run.context)
      : this.deps.observe(run.context);
    if (!this.live(run)) return;
    if (current.outcome) {
      const defend = current.outcome.reason.startsWith(SERVER_REJECTION);
      this.finish(run, current.outcome, current.observation, defend);
      return;
    }
    if (!offers(withWait(current.candidates, this.deps.wait), choice)) {
      this.discard(run, call, "unavailable", choice);
      return;
    }
    try {
      this.deps.execute(choice, run.context);
    } catch (error) {
      this.discard(run, call, messageOf(error), choice);
      return;
    }
    if (this.live(run)) this.applied(run, call, choice, ageMs);
  }

  private applied(
    run: Run<C>,
    call: number,
    actionId: string,
    ageMs: number,
  ): void {
    this.state.lastDecision = {
      actionId,
      disposition: "applied",
      reason: "ok",
    };
    this.state.lastDiscardReason = undefined;
    const { runId } = run;
    this.emit({ type: "applied", runId, call, actionId, ageMs });
  }

  private discard(
    run: Run<C>,
    call: number,
    reason: string,
    actionId: string,
  ): void {
    if (!this.live(run)) return;
    this.state.lastDiscardReason = reason;
    this.state.lastDecision = { actionId, disposition: "discarded", reason };
    this.emit({ type: "discarded", runId: run.runId, call, reason, actionId });
  }
}

const TIMEOUT = "jev_timeout";

function noTimeouts(): TacticsState["timeouts"] {
  return { consecutive: 0, total: 0, limit: MAX_CONSECUTIVE_TIMEOUTS };
}
