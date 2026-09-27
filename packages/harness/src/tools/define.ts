import { JevUnavailableError, nextStepFor } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type {
  ResultInit,
  ToolName,
  ToolResult,
  ToolStatus,
} from "#harness/contract/result";
import type {
  PlaceView,
  SelfView,
  UnitView,
  VitalsView,
} from "#harness/contract/views";

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
