import type { PlayerLife, RecoveryState, WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

const DEFAULT_SECONDS = 300;
const POLL_MS = 250;
const LIFE_MS = 30_000;
const GHOST_PAUSE_MS = 10_000;
const SIGHT_YARDS = 120;
const LOOK_MS = 15_000;
const MELEE_YARDS = 3;
const STEP_YARDS = 20;
const MAX_LEGS = 40;
const MAX_STALLS = 3;
const RECLAIM_YARDS = 30;
const RECLAIM_MARGIN_MS = 2000;

type Point = { x: number; y: number; z: number };
type Mark = { life: PlayerLife; atMs: number };

function reclaimOf(args: Readonly<Record<string, string>>): boolean {
  const reclaim = args["reclaim"] ?? "yes";
  if (reclaim !== "yes" && reclaim !== "no")
    throw new Error(`selfstate-death needs reclaim=yes|no, not "${reclaim}".`);
  return reclaim === "yes";
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`selfstate-death needs seconds > 0, not "${seconds}".`);
  return seconds;
}

async function until<T>(
  read: () => T | undefined,
  ms: number,
): Promise<T | undefined> {
  const deadline = Date.now() + ms;
  let value = read();
  while (value === undefined && Date.now() < deadline) {
    await Bun.sleep(POLL_MS);
    value = read();
  }
  return value;
}

function lifeIs(handle: WorldHandle, life: PlayerLife): true | undefined {
  return handle.getRecoveryState().life === life ? true : undefined;
}

function nearestHostile(handle: WorldHandle): Point | undefined {
  const row = others(handle).find(
    (candidate) =>
      candidate.attackable &&
      candidate.relation === "hostile" &&
      candidate.distance !== null &&
      candidate.distance <= SIGHT_YARDS,
  );
  return row?.position ?? undefined;
}

async function provoke(handle: WorldHandle): Promise<boolean> {
  const hostile = await until(() => nearestHostile(handle), LOOK_MS);
  if (!hostile) return false;
  for (let i = 0; i < MAX_LEGS; i++) {
    const pose = handle.getControlState().pose;
    if (!pose) return true;
    const left = Math.hypot(hostile.x - pose.x, hostile.y - pose.y);
    if (left <= MELEE_YARDS) return true;
    const walked = await handle
      .walkTowardPoint(hostile, Math.min(STEP_YARDS, left - MELEE_YARDS + 1))
      .catch(() => undefined);
    if (!walked || walked.traveled === 0) return true;
  }
  return true;
}

function corpseOf(state: RecoveryState): Point | undefined {
  return state.corpse.status === "found" ? state.corpse.position : undefined;
}

async function walkBack(handle: WorldHandle, corpse: Point): Promise<number> {
  let legs = 0;
  let stalls = 0;
  for (; legs < MAX_LEGS && stalls < MAX_STALLS; legs++) {
    const { distance } = handle.getRecoveryState().reclaim;
    const pose = handle.getControlState().pose;
    if (!pose) break;
    const left = distance ?? Math.hypot(corpse.x - pose.x, corpse.y - pose.y);
    if (left <= RECLAIM_YARDS) break;
    const walked = await handle
      .walkTowardPoint(corpse, Math.min(STEP_YARDS, left - RECLAIM_YARDS + 5))
      .catch(() => undefined);
    stalls = !walked || walked.traveled === 0 ? stalls + 1 : 0;
  }
  return legs;
}

async function reclaimCorpse(handle: WorldHandle): Promise<Json> {
  handle.queryCorpse();
  const corpse = await until(
    () => corpseOf(handle.getRecoveryState()),
    LIFE_MS,
  );
  if (!corpse) return { stop: "corpse_not_found" };
  const legs = await walkBack(handle, corpse);
  const remaining = handle.getRecoveryState().reclaim.remainingMs ?? 0;
  if (remaining > 0) await Bun.sleep(remaining + RECLAIM_MARGIN_MS);
  handle.reclaimCorpse();
  const alive = await until(() => lifeIs(handle, "alive"), LIFE_MS);
  return {
    legs,
    range: handle.getRecoveryState().reclaim.distance ?? null,
    stop: alive ? "alive" : "reclaim_not_confirmed",
  };
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const back = reclaimOf(args);
  const seconds = secondsOf(args);
  const started = Date.now();
  const marks: Mark[] = [];
  const mark = (life: PlayerLife) =>
    marks.push({ atMs: Date.now() - started, life });
  const report = (stop: string, extra: Record<string, Json> = {}): Json => ({
    marks,
    stop,
    ...extra,
  });
  const first = handle.getRecoveryState().life;
  mark(first);
  if (first !== "dead" && first !== "ghost") {
    const provoked = await provoke(handle);
    if (!provoked) return report("no_hostile");
    const dead = await until(() => lifeIs(handle, "dead"), seconds * 1000);
    if (!dead) return report("no_death");
    mark("dead");
  }
  if (lifeIs(handle, "dead")) {
    handle.releaseSpirit();
    const ghost = await until(() => lifeIs(handle, "ghost"), LIFE_MS);
    if (!ghost) return report("release_unanswered");
    mark("ghost");
  }
  await Bun.sleep(GHOST_PAUSE_MS);
  if (!back) return report("ghost");
  const reclaimed = await reclaimCorpse(handle);
  mark(handle.getRecoveryState().life);
  return report("reclaim", { reclaim: reclaimed });
}

export const flow: ProbeFlow = {
  name: "selfstate-death",
  run,
  usage:
    "--flow selfstate-death [--arg reclaim=yes|no] [--arg seconds=<s>]: walk into the nearest hostile creature, wait up to <s> seconds (default 300) for the character to die, release the spirit, wait 10 s as a ghost, then (unless reclaim=no) walk back to the corpse and reclaim it.",
};
