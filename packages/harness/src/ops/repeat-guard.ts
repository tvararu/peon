import type { ToolName, ToolResult } from "#harness/contract/result";
import type {
  Clock,
  RepeatCall,
  RepeatGuard,
  RepeatHit,
} from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";

export const TIME_CODES: readonly string[] = [
  "not_ready",
  "offline",
  "turn_budget",
  "busy",
  "human_waiting",
];
export const REPEAT_MOVE_YD = 2;

const REPEAT_TTL_MS = 300_000;
const UNTRIED_MAX = 3;
const CLEARING: ReadonlySet<ToolName> = new Set([
  "travel",
  "engage",
  "loot",
  "interact",
  "rest",
  "recover",
  "social",
]);

type Failure = {
  at: number;
  digest: string;
  next: string | undefined;
  pose: PoseView | undefined;
  reason: string;
  times: number;
};

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(
      ([, item]) => item !== undefined,
    );
    entries.sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function keyOf({ args, tool }: RepeatCall): string {
  return `${tool}:${stable(args)}`;
}

function moved(a: PoseView | undefined, b: PoseView | undefined): boolean {
  if (!(a && b)) return a !== b;
  return (
    a.mapId !== b.mapId || Math.hypot(a.x - b.x, a.y - b.y) >= REPEAT_MOVE_YD
  );
}

function storable(
  result: ToolResult<unknown>,
): result is ToolResult<unknown> & { reason: string } {
  const failed = result.status === "REFUSED" || result.status === "FAILED";
  return (
    failed &&
    result.reason !== undefined &&
    result.reason !== "repeat" &&
    !TIME_CODES.includes(result.reason)
  );
}

function untriedOf(failures: Map<string, Failure>): string[] {
  const newest = [...failures.values()].sort((a, b) => b.at - a.at);
  const nexts = newest.flatMap((failure) =>
    failure.next ? [failure.next] : [],
  );
  return [...new Set(nexts)].slice(0, UNTRIED_MAX);
}

export function createRepeatGuard(clock: Clock): RepeatGuard {
  const failures = new Map<string, Failure>();
  let hitCount = 0;
  const blocking = (failure: Failure, call: RepeatCall) =>
    clock.now() - failure.at <= REPEAT_TTL_MS &&
    failure.digest === call.digest &&
    !moved(failure.pose, call.pose);
  const stored = (call: RepeatCall) =>
    call.tool === "look" ? undefined : failures.get(keyOf(call));
  return {
    blocks(call) {
      const failure = stored(call);
      return failure !== undefined && blocking(failure, call);
    },
    check(call) {
      const failure = stored(call);
      if (!(failure && blocking(failure, call))) return;
      hitCount += 1;
      failure.times += 1;
      return {
        reason: failure.reason,
        times: failure.times,
        untried: untriedOf(failures),
      };
    },
    hits: () => hitCount,
    record(call) {
      const { result } = call;
      if (result.status === "DONE" && CLEARING.has(call.tool)) failures.clear();
      if (call.tool === "look" || !storable(result)) return;
      const times = failures.get(keyOf(call))?.times ?? 0;
      const failure = {
        at: clock.now(),
        digest: call.digest,
        next: result.next,
        pose: call.pose,
        reason: result.reason,
        times: times + 1,
      };
      failures.set(keyOf(call), failure);
    },
  };
}

export function repeatRefusal({
  hit,
  tool,
}: {
  hit: RepeatHit;
  tool: ToolName;
}): Refusal {
  const ask = `ask the human: "My ${tool} call keeps failing (${hit.reason}). What should I do?"`;
  return new Refusal({
    body: hit.untried.length > 0 ? [`Untried: ${hit.untried.join("; ")}`] : [],
    detail: `you already tried this from here and it failed (${hit.reason}).`,
    next: hit.untried[0] ?? ask,
    reason: "repeat",
  });
}
