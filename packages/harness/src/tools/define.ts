import type {
  AgentToolResult,
  AgentToolUpdateCallback,
} from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { WorldHandle } from "@tuicraft/core";
import { JevUnavailableError, nextStepFor } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { AfterMap, ToolDetails } from "#harness/contract/details";
import type {
  ResultInit,
  ToolName,
  ToolResult,
  ToolStatus,
} from "#harness/contract/result";
import type {
  HarnessRuntime,
  RepeatCall,
  ToolCtx,
} from "#harness/contract/services";
import type {
  PlaceView,
  SelfView,
  UnitView,
  VitalsView,
} from "#harness/contract/views";
import { dangerLine, dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { repeatRefusal } from "#harness/ops/repeat-guard";
import { poseView } from "#harness/ops/views";
import { TOOL_TEXT } from "#harness/prompt/guidelines";
export const TURN_BUDGET = 40;
export const READY_WAIT_MS = 10_000;
export const UPDATE_EVERY_MS = 500;
export const MAX_CONTENT_LINES = 12;
export const MAX_CONTENT_BYTES = 700;

type Mapped = Pick<
  ToolResult<unknown>,
  "detail" | "next" | "reason" | "status"
>;

const CODED = /^([a-z][a-z0-9_]*): (.+)$/;
const SOCKET_DOWN = "World socket is not connected";
const OFFLINE: Mapped = {
  detail: "the game connection is down.",
  next: "ask the human to run /connect.",
  reason: "offline",
  status: "REFUSED",
};
const NO_HELPER: Mapped = {
  detail: "TYPESAFE_API_KEY is not set.",
  next: "ask the human to set it.",
  reason: "no_combat_helper",
  status: "REFUSED",
};
const jevDown = (detail: string): Mapped => ({
  detail: `the fight helper is not answering (${detail}).`,
  next: askHuman("The fight helper is not answering. What should I do?"),
  reason: "jev_unavailable",
  status: "FAILED",
});
const KNOWN = new Map<string, Mapped>([
  ["missing_jev_key", NO_HELPER],
  [
    "not_implemented",
    {
      detail: "this part of the harness is not built yet.",
      next: askHuman("This action is not built yet. What should I do instead?"),
      reason: "not_implemented",
      status: "FAILED",
    },
  ],
  [
    "self_not_alive",
    {
      detail: "you are dead.",
      next: nextCall("recover"),
      reason: "dead",
      status: "REFUSED",
    },
  ],
]);

export function result<A>(
  status: ToolStatus,
  init: ResultInit<A>,
): ToolResult<A> {
  return { ...init, body: init.body ?? [], status };
}

function headLine({
  detail,
  reason,
  runId,
  status,
}: ToolResult<unknown>): string {
  if (status === "RUNNING" && runId) return `${status} ${runId}: ${detail}`;
  if (reason) return `${status} ${reason}: ${detail}`;
  return `${status} ${detail}`;
}

function fitBody(body: readonly string[], room: number): string[] {
  if (body.length <= room) return [...body];
  if (room <= 0) return [];
  return [
    ...body.slice(0, room - 1),
    `+${body.length - room + 1} more; narrow the call.`,
  ];
}

export function formatContent(
  outcome: ToolResult<unknown>,
  init: { danger: string | undefined; maxLines: number },
): string {
  const next = outcome.next === undefined ? undefined : `Next: ${outcome.next}`;
  const tail = [init.danger, next].filter((line) => line !== undefined);
  const room = init.maxLines - 1 - tail.length;
  return [headLine(outcome), ...fitBody(outcome.body, room), ...tail].join(
    "\n",
  );
}

export function nextCall(
  tool: ToolName,
  args: Record<string, string | number | boolean> = {},
): string {
  const parts = Object.entries(args).map(
    ([key, value]) =>
      `${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`,
  );
  return `${tool}(${parts.join(", ")})`;
}

export function askHuman(question: string): string {
  return `ask the human: "${question}"`;
}

function mapped<A>(fields: Mapped, after: A): ToolResult<A> {
  return { ...fields, after, body: [] };
}

function codedResult<A>(message: string, after: A): ToolResult<A> {
  const line = message.split("\n")[0] ?? message;
  const [, code, raw] = CODED.exec(line) ?? [];
  if (!(code && raw))
    return result("FAILED", {
      after,
      detail: line,
      next: nextCall("look"),
      reason: "error",
    });
  const step = nextStepFor(code);
  return result("FAILED", {
    after,
    body: step ? [step] : [],
    detail: raw,
    next: nextCall("look"),
    reason: code,
  });
}

export function coreErrorResult<A>(error: unknown, after: A): ToolResult<A> {
  const message = messageOf(error);
  if (message.startsWith(SOCKET_DOWN)) return mapped(OFFLINE, after);
  if (error instanceof JevUnavailableError)
    return error.detail === "missing_jev_key"
      ? mapped(NO_HELPER, after)
      : mapped(jevDown(error.detail), after);
  const known = KNOWN.get(message);
  return known ? mapped(known, after) : codedResult(message, after);
}

export function emptyVitals(): VitalsView {
  return { hp: 0, maxHp: 0, maxPower: 0, power: 0, powerKind: "none" };
}

export function emptyPlace(): PlaceView {
  return {
    ageMs: undefined,
    area: undefined,
    areaId: undefined,
    zone: undefined,
    zoneId: undefined,
  };
}

export function emptySelf(): SelfView {
  return {
    ...emptyVitals(),
    className: "unknown",
    copper: undefined,
    freeSlots: undefined,
    guid: "0",
    inCombat: false,
    level: 0,
    life: "unknown",
    name: "",
    pose: undefined,
    race: "unknown",
    xpPct: undefined,
  };
}

export function emptyUnit(): UnitView {
  return {
    alive: false,
    attackable: false,
    attackingMe: false,
    compass: undefined,
    distance: undefined,
    entry: 0,
    guid: "0",
    hp: 0,
    hpPct: 0,
    inView: false,
    kind: "creature",
    level: 0,
    lootable: false,
    maxHp: 0,
    name: "",
    ref: "",
    relation: "unknown",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: false,
    x: undefined,
    y: undefined,
    z: undefined,
  };
}

export type ToolKind = "read" | "action" | "run" | "control";

export type GameToolSpec<P extends TSchema, K extends ToolName> = {
  name: K;
  kind: ToolKind;
  parameters: P;
  run: (
    args: Static<P>,
    ctx: ToolCtx<AfterMap[K]>,
  ) => Promise<ToolResult<AfterMap[K]>>;
  fallback: () => AfterMap[K];
  maxLines?: number;
};

export type GameTool = ToolDefinition<TSchema, ToolDetails>;

type Call<P extends TSchema, K extends ToolName> = {
  args: Static<P>;
  onUpdate: AgentToolUpdateCallback<ToolDetails> | undefined;
  rt: HarnessRuntime;
  signal: AbortSignal | undefined;
  spec: GameToolSpec<P, K>;
  state: { current: AfterMap[K]; updatedAt: number | undefined };
  toolCallId: string;
};

type Closing<A> = {
  handle: WorldHandle | undefined;
  ms: number;
  outcome: ToolResult<A>;
};

const ACTING: ReadonlySet<ToolKind> = new Set(["action", "run"]);
const SECRET = "[secret]";
const HUMAN_STOP: Mapped = {
  detail: "the human stopped you. Start nothing new.",
  next: "end your turn and wait for the human.",
  reason: "cancelled",
  status: "FAILED",
};

function detailsOf<K extends ToolName>(
  tool: K,
  outcome: ToolResult<AfterMap[K]>,
): ToolDetails {
  return { result: outcome, tool } as ToolDetails;
}

function scrub(value: unknown, secret: string): unknown {
  if (secret.length === 0) return value;
  if (typeof value === "string") return value.replaceAll(secret, SECRET);
  if (Array.isArray(value)) return value.map((item) => scrub(item, secret));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrub(item, secret)]),
    );
  return value;
}

function openCall<P extends TSchema, K extends ToolName>({
  args,
  rt,
  spec,
  toolCallId,
}: Call<P, K>): void {
  rt.session.turnToolCalls += 1;
  const data = {
    args: scrub(args, rt.profile.client.password),
    name: spec.name,
    toolCallId,
  };
  rt.log.append({
    class: "log",
    data,
    domain: "tool",
    event: "tool/call",
    text: `${spec.name} called`,
    tool: spec.name,
  });
  rt.stats.call(spec.name);
}

function repeatCall<P extends TSchema, K extends ToolName>(
  { args, rt, spec }: Call<P, K>,
  handle: WorldHandle,
): RepeatCall {
  return {
    args,
    digest: rt.progress.digest(handle),
    pose: poseView({ handle, rt }),
    tool: spec.name,
  };
}

async function admit<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
): Promise<WorldHandle> {
  const { rt, spec } = call;
  if (rt.session.turnToolCalls > TURN_BUDGET)
    throw new Refusal({
      detail: "report to the human now.",
      next: "end your turn and report to the human.",
      reason: "turn_budget",
    });
  const handle = rt.requireHandle();
  if (ACTING.has(spec.kind) && rt.session.humanWaiting) {
    throw new Refusal({
      detail: "the human wrote a message. Read it before you act.",
      next: "end your turn and read the human's message.",
      reason: "human_waiting",
    });
  }
  if (!(await rt.ready.whenReady(READY_WAIT_MS))) {
    throw new Refusal({
      detail: "the world is still loading.",
      next: "call look again in a few seconds.",
      reason: "not_ready",
    });
  }
  const hit =
    spec.name === "look"
      ? undefined
      : rt.repeats.check(repeatCall(call, handle));
  if (!hit) return handle;
  rt.stats.repeatHit(spec.name);
  throw repeatRefusal({ hit, tool: spec.name });
}

function pushUpdate<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
  partial: ToolResult<AfterMap[K]>,
): void {
  const { rt, spec, state } = call;
  const running: ToolResult<AfterMap[K]> = { ...partial, status: "RUNNING" };
  const now = rt.clock.now();
  state.current = running.after;
  if (state.updatedAt !== undefined && now - state.updatedAt < UPDATE_EVERY_MS)
    return;
  state.updatedAt = now;
  const text = formatContent(running, {
    danger: undefined,
    maxLines: spec.maxLines ?? MAX_CONTENT_LINES,
  });
  call.onUpdate?.({
    content: [{ text, type: "text" }],
    details: detailsOf(spec.name, running),
  });
}

function toolCtx<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
  handle: WorldHandle,
): ToolCtx<AfterMap[K]> {
  const signal = call.signal ?? new AbortController().signal;
  return {
    handle,
    progress: ignoreFailure,
    rt: call.rt,
    signal,
    toolCallId: call.toolCallId,
    update: (partial) => pushUpdate(call, partial),
  };
}

async function invoke<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
  handle: WorldHandle,
): Promise<ToolResult<AfterMap[K]>> {
  const { rt, signal, spec } = call;
  const esc = () => {
    rt.stopAll("esc");
  };
  signal?.addEventListener("abort", esc, { once: true });
  try {
    return await spec.run(call.args, toolCtx(call, handle));
  } finally {
    signal?.removeEventListener("abort", esc);
  }
}

function fromRefusal<A>(refusal: Refusal, after: A): ToolResult<A> {
  const { body, detail, next, options, reason, status } = refusal;
  return { after, body, detail, next, options, reason, status };
}

async function outcomeOf<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
): Promise<ToolResult<AfterMap[K]>> {
  try {
    return await invoke(call, await admit(call));
  } catch (error) {
    return error instanceof Refusal
      ? fromRefusal(error, call.state.current)
      : coreErrorResult(error, call.state.current);
  }
}

function withHumanStop<A>(outcome: ToolResult<A>): ToolResult<A> {
  return outcome.reason === "human_stop"
    ? { ...outcome, ...HUMAN_STOP }
    : outcome;
}

function remember<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
  handle: WorldHandle,
  outcome: ToolResult<AfterMap[K]>,
): void {
  const { args, rt, spec } = call;
  const digest = rt.progress.digest(handle);
  const untried = outcome.next ? [outcome.next] : [];
  rt.repeats.record({
    args,
    digest,
    pose: poseView({ handle, rt }),
    result: outcome,
    tool: spec.name,
  });
  rt.progress.afterAction({
    digest,
    reason: outcome.reason,
    status: outcome.status,
    tool: spec.name,
    untried,
  });
}

function closeCall<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
  { handle, ms, outcome }: Closing<AfterMap[K]>,
): void {
  const { rt, spec, toolCallId } = call;
  const { reason, status } = outcome;
  if (handle) remember(call, handle, outcome);
  rt.stats.result({ ms, reason, status, tool: spec.name });
  const text = reason
    ? `${spec.name} ${status} ${reason}`
    : `${spec.name} ${status}`;
  rt.log.append({
    class: "log",
    data: { ms, reason, status, toolCallId },
    domain: "tool",
    event: "tool/result",
    text,
    tool: spec.name,
  });
  for (const row of outcome.evidence ?? [])
    rt.log.mark(row.seq, { consumedBy: toolCallId });
}

async function runCall<P extends TSchema, K extends ToolName>(
  call: Call<P, K>,
): Promise<AgentToolResult<ToolDetails>> {
  const { rt, spec } = call;
  const startedAt = rt.clock.now();
  openCall(call);
  const outcome = withHumanStop(await outcomeOf(call));
  const handle = rt.handle();
  closeCall(call, { handle, ms: rt.clock.now() - startedAt, outcome });
  const danger = handle
    ? dangerLine(dangerView({ handle, rt }), { still: spec.kind === "control" })
    : undefined;
  const text = formatContent(outcome, {
    danger,
    maxLines: spec.maxLines ?? MAX_CONTENT_LINES,
  });
  return {
    content: [{ text, type: "text" }],
    details: detailsOf(spec.name, outcome),
  };
}

export function defineGameTool<P extends TSchema, K extends ToolName>(
  spec: GameToolSpec<P, K>,
): (rt: HarnessRuntime) => GameTool {
  const text = TOOL_TEXT[spec.name];
  const executionMode = spec.kind === "read" ? "parallel" : "sequential";
  return (rt) => ({
    description: text.description,
    execute: (toolCallId, args, signal, onUpdate) =>
      runCall({
        args: args as Static<P>,
        onUpdate,
        rt,
        signal,
        spec,
        state: { current: spec.fallback(), updatedAt: undefined },
        toolCallId,
      }),
    executionMode,
    label: text.label,
    name: spec.name,
    parameters: spec.parameters,
    promptGuidelines: text.guidelines,
  });
}
