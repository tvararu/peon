import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const SIGHT_YARDS = 35;
const MELEE_YARDS = 4;
const STEP_YARDS = 20;
const PET_HIGH = 0xf1_40n;
const PET_SPAN = 0x1_00_00_00_00_00_00n;
const DEFAULT_SECONDS = 120;
const DEFAULT_LINGER = 5;
const POLL_MS = 250;
const FACE_MS = 2000;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Stop = "target_dead" | "self_dead" | "timeout";

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function healthOf(row: Row | undefined): number {
  return row && "health" in row.entity ? row.entity.health : 0;
}

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

function selfRow(handle: WorldHandle): Row | undefined {
  return handle.queryNearby().find((row) => row.self);
}

function targetOf(handle: WorldHandle): Row | undefined {
  return others(handle).find(
    (row) =>
      entityType(row) === "unit" &&
      row.entity.guid / PET_SPAN !== PET_HIGH &&
      !row.tappedByOther &&
      healthOf(row) > 0 &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS &&
      row.attackable &&
      row.relation === "hostile",
  );
}

function secondsOf(
  args: Readonly<Record<string, string>>,
  key: string,
  fallback: number,
): number {
  const seconds = Number(args[key] ?? fallback);
  if (!(seconds >= 0))
    throw new Error(`achievements-level needs ${key} >= 0, not "${seconds}".`);
  return seconds;
}

function face(handle: WorldHandle, target: bigint): boolean {
  try {
    handle.faceGuid(target);
    return true;
  } catch {
    return false;
  }
}

async function closeIn(handle: WorldHandle, target: bigint): Promise<void> {
  const row = rowOf(handle, target);
  if (!row?.position || row.distance === null || row.distance <= MELEE_YARDS)
    return;
  const { x, y, z } = row.position;
  const yards = Math.min(STEP_YARDS, row.distance - MELEE_YARDS + 1);
  await handle.walkTowardPoint({ x, y, z }, yards);
  face(handle, target);
}

async function fight(
  handle: WorldHandle,
  target: bigint,
  seconds: number,
): Promise<Stop> {
  const started = Date.now();
  let facedAt = 0;
  while (Date.now() - started < seconds * 1000) {
    if (healthOf(selfRow(handle)) === 0) return "self_dead";
    if (healthOf(rowOf(handle, target)) === 0) return "target_dead";
    await closeIn(handle, target);
    if (Date.now() - facedAt >= FACE_MS) {
      facedAt = Date.now();
      face(handle, target);
    }
    await Bun.sleep(POLL_MS);
  }
  return "timeout";
}

function watchEarned(handle: WorldHandle) {
  const earned: Json[] = [];
  const off = handle.achievements.onEvent((event) => {
    if (event.type === "achievement_earned")
      earned.push({ guid: hex(event.guid), id: event.id, self: event.self });
  });
  return { earned, off };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const seconds = secondsOf(args, "seconds", DEFAULT_SECONDS);
  const linger = secondsOf(args, "linger", DEFAULT_LINGER);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = (await settle(() => targetOf(handle))) ?? targetOf(handle);
  if (!found)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  const target = found.entity.guid;
  const watch = watchEarned(handle);
  const before = handle.achievements.state();
  try {
    handle.selectTarget(target);
    face(handle, target);
    handle.attack(target);
    const stop = await fight(handle, target, seconds);
    await Bun.sleep(linger * 1000);
    const after = handle.achievements.state();
    return {
      achievements: { after: after.count, before: before.count },
      criteria: { after: after.criteria, before: before.criteria },
      earned: watch.earned,
      stop,
      target: summary(found),
    };
  } finally {
    watch.off();
  }
}

export const flow: ProbeFlow = {
  name: "achievements-level",
  run,
  usage:
    "--flow achievements-level [--arg seconds=<n>] [--arg linger=<n>]: attack the nearest living hostile creature within 35 yards in melee, wait for its death, the character's death or the time limit (120 s), then wait 5 s for late packets; reports the achievement count, the criteria count and each achievement earned.",
};
