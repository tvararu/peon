import type { ToolKind, ToolName, ToolResult } from "#harness/contract/result";
import type {
  Clock,
  RepeatCall,
  RepeatGuard,
  RepeatHit,
  RepeatScene,
} from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";

export const TIME_CODES: readonly string[] = [
  "not_ready",
  "offline",
  "turn_budget",
  "busy",
  "human_waiting",
  "no_summon",
];
export const CONTINUES: readonly string[] = [
  "time_limit",
  "cancelled",
  "max_starts_reached",
  "loot_denied:release_only",
  "loot_denied:timeout",
  "loot_denied:loot_source_unavailable",
];
export const REPEAT_MOVE_YD = 2;
export const POSITIONAL: ReadonlySet<string> = new Set([
  "no_ground",
  "ambiguous_floor",
  "unreachable",
  "target_unreachable",
  "not_in_view",
  "obstructed",
]);
export const OFFERED_BY: Record<string, readonly string[]> = {
  "dungeon:no_bind_offer": ["instances/bind_offer"],
  "dungeon:no_proposal": ["lfg/proposal"],
  "dungeon:no_role_check": ["lfg/role_check"],
  "dungeon:no_vote": ["lfg/boot_vote"],
  "group:no_check": ["raid/ready_check"],
  "group:no_offer": ["quests/offered"],
  "group:no_roll": ["loot/roll"],
  "social:nothing_to_accept": ["group/invite"],
  "social:nothing_to_decline": ["group/invite"],
  "trade:no_request": ["trade/requested"],
};

const REPEAT_TTL_MS = 300_000;
const UNTRIED_MAX = 3;
const POSES_MAX = 4;
const UNANSWERED = "no_answer";

type Probe = Omit<RepeatCall, "kind">;

export type CallShape = { tool: string; args: Record<string, unknown> };

const CALL = /^([a-z_]+)\((.*)\)$/;
const ARG =
  /([a-z_]+): ("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false)(?:, |$)/y;

type Failure = {
  at: number;
  partly: boolean;
  digest: string;
  next: string | undefined;
  pose: PoseView | undefined;
  reason: string;
  scene: RepeatScene | undefined;
  seq: number | undefined;
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

function argValue(raw: string): unknown {
  if (raw === "true" || raw === "false") return raw === "true";
  return raw.startsWith('"') ? JSON.parse(raw) : Number(raw);
}

export function parseCall(text: string): CallShape | undefined {
  const [, tool, inner] = CALL.exec(text.trim()) ?? [];
  if (tool === undefined || inner === undefined) return;
  const args: Record<string, unknown> = {};
  ARG.lastIndex = 0;
  while (ARG.lastIndex < inner.length) {
    const at = ARG.lastIndex;
    const match = ARG.exec(inner);
    const [, key, raw] = match ?? [];
    if (key === undefined || raw === undefined || ARG.lastIndex === at) return;
    args[key] = argValue(raw);
  }
  return { args, tool };
}

function keyOf({ args, tool }: { args: unknown; tool: string }): string {
  return `${tool}:${stable(args)}`;
}

export function moved(
  a: PoseView | undefined,
  b: PoseView | undefined,
): boolean {
  if (!(a && b)) return a !== b;
  return (
    a.mapId !== b.mapId || Math.hypot(a.x - b.x, a.y - b.y) >= REPEAT_MOVE_YD
  );
}

function sceneMoved(
  a: RepeatScene | undefined,
  b: RepeatScene | undefined,
): boolean {
  if (!(a && b)) return false;
  const closed =
    a.targetYd !== undefined &&
    b.targetYd !== undefined &&
    Math.abs(a.targetYd - b.targetYd) >= REPEAT_MOVE_YD;
  return closed || a.combat !== b.combat;
}

function offerArrived(
  failure: Failure,
  call: Probe & { tool: ToolName },
): boolean {
  const events = OFFERED_BY[`${call.tool}:${failure.reason}`];
  if (!events || failure.seq === undefined || !call.log) return false;
  return call.log.since(failure.seq).some((row) => events.includes(row.event));
}

function storable(
  result: ToolResult<unknown>,
): result is ToolResult<unknown> & { reason: string } {
  const failed = result.status !== "DONE" && result.status !== "RUNNING";
  return (
    failed &&
    result.reason !== undefined &&
    result.reason !== "repeat" &&
    !TIME_CODES.includes(result.reason) &&
    !CONTINUES.includes(result.reason)
  );
}

function untriedOf(failures: Map<string, Failure>, key: string): string[] {
  const newest = [...failures.values()]
    .filter((failure) => !failure.partly)
    .sort((a, b) => b.at - a.at);
  const nexts = newest.flatMap((failure) => {
    const call = failure.next ? parseCall(failure.next) : undefined;
    return failure.next && !(call && keyOf(call) === key) ? [failure.next] : [];
  });
  return [...new Set(nexts)].slice(0, UNTRIED_MAX);
}

function forgetOnDone(failures: Map<string, Failure>, kind: ToolKind): void {
  if (kind === "action" || kind === "run") failures.clear();
  if (kind !== "read") return;
  for (const [key, failure] of failures)
    if (failure.reason === UNANSWERED) failures.delete(key);
}

type FailureStore = {
  call: RepeatCall & { result: ToolResult<unknown> };
  clock: Clock;
  failures: Map<string, Failure>;
  positional: Map<ToolName, { at: number; pose: PoseView }[]>;
};

function recordFailure({ call, clock, failures, positional }: FailureStore) {
  const { result } = call;
  if (result.status === "DONE") forgetOnDone(failures, call.kind);
  if (result.status === "DONE") positional.delete(call.tool);
  if (storable(result) && POSITIONAL.has(result.reason) && call.pose) {
    const kept = (positional.get(call.tool) ?? []).slice(1 - POSES_MAX);
    positional.set(call.tool, [...kept, { at: clock.now(), pose: call.pose }]);
  }
  if (call.tool === "look" || !storable(result)) return;
  const times = failures.get(keyOf(call))?.times ?? 0;
  failures.set(keyOf(call), {
    at: clock.now(),
    digest: call.digest,
    next: result.next,
    partly: result.status === "PARTLY",
    pose: call.pose,
    reason: result.reason,
    scene: call.scene,
    seq: call.log?.lastSeq(),
    times: times + 1,
  });
}
export function createRepeatGuard(clock: Clock): RepeatGuard {
  const failures = new Map<string, Failure>();
  const positional = new Map<ToolName, { at: number; pose: PoseView }[]>();
  let hitCount = 0;
  const blocking = (failure: Failure, call: Probe) =>
    !(call.tool === "engage" && call.scene?.targetAttacking) &&
    clock.now() - failure.at <= REPEAT_TTL_MS &&
    failure.digest === call.digest &&
    !moved(failure.pose, call.pose) &&
    !sceneMoved(failure.scene, call.scene) &&
    !offerArrived(failure, call);
  const stored = (call: Probe) =>
    call.tool === "look" ? undefined : failures.get(keyOf(call));
  return {
    blocks(call) {
      const failure = stored(call);
      return failure !== undefined && blocking(failure, call);
    },
    check(call) {
      const failure = stored(call);
      if (!failure || failure.partly || !blocking(failure, call)) return;
      hitCount += 1;
      failure.times += 1;
      return {
        reason: failure.reason,
        times: failure.times,
        untried: untriedOf(failures, keyOf(call)),
      };
    },
    hits: () => hitCount,
    positionalPoses: (tool) =>
      (positional.get(tool) ?? [])
        .filter((failure) => clock.now() - failure.at <= REPEAT_TTL_MS)
        .map((failure) => failure.pose),
    record(call) {
      recordFailure({ call, clock, failures, positional });
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
