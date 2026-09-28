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

const SIGHT_YARDS = 100;
const MELEE_YARDS = 4;
const STEP_YARDS = 20;
const MAX_STEPS = 8;
const PET_HIGH = 0xf1_40n;
const PET_SPAN = 0x1_00_00_00_00_00_00n;
const DEFAULT_SECONDS = 90;
const POLL_MS = 250;
const TOGGLE_MS = 2000;
const STRIKE_MS = 2000;
const TOGGLES = ["hover", "disable_gravity"];

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Stop = "target_dead" | "target_lost" | "self_dead" | "timeout";

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

function healthOf(row: Row | undefined): number | undefined {
  return row && "health" in row.entity ? row.entity.health : undefined;
}

function prey(handle: WorldHandle): Row | undefined {
  return others(handle).find(
    (row) =>
      entityType(row) === "unit" &&
      row.entity.guid / PET_SPAN !== PET_HIGH &&
      !row.tappedByOther &&
      row.attackable &&
      row.relation === "hostile" &&
      (healthOf(row) ?? 0) > 0 &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS,
  );
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`unitmotion-kill needs seconds > 0, not "${seconds}".`);
  return seconds;
}

async function closeIn(handle: WorldHandle, target: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = rowOf(handle, target);
    if (!row?.position || row.distance === null || row.distance <= MELEE_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - MELEE_YARDS + 1);
    const walked = await handle
      .walkTowardPoint({ x, y, z }, yards)
      .catch(() => undefined);
    if (!walked || walked.traveled === 0) return;
  }
}

function strike(handle: WorldHandle, target: bigint): void {
  try {
    handle.faceGuid(target);
  } catch {
    ignoreFailure();
  }
  handle.attack(target);
}

function selfDead(handle: WorldHandle): boolean {
  return healthOf(handle.queryNearby().find((entry) => entry.self)) === 0;
}

async function fight(
  handle: WorldHandle,
  target: bigint,
  seconds: number,
): Promise<Stop> {
  const started = Date.now();
  let struck = 0;
  while (Date.now() - started < seconds * 1000) {
    if (selfDead(handle)) return "self_dead";
    const row = rowOf(handle, target);
    if (!row) return "target_lost";
    if (healthOf(row) === 0) return "target_dead";
    await closeIn(handle, target);
    if (Date.now() - struck >= STRIKE_MS) {
      struck = Date.now();
      strike(handle, target);
    }
    await Bun.sleep(POLL_MS);
  }
  return "timeout";
}

async function lingerFor(toggles: readonly string[]): Promise<void> {
  const until = Date.now() + TOGGLE_MS;
  while (Date.now() < until && !TOGGLES.every((flag) => toggles.includes(flag)))
    await Bun.sleep(POLL_MS);
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const seconds = secondsOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = (await settle(() => prey(handle))) ?? prey(handle);
  if (!found)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  const target = found.entity.guid;
  const toggles: string[] = [];
  const off = handle.unitmotion.onEvent((event) => {
    if (event.type === "flag" && event.guid === target && !event.on)
      toggles.push(event.flag);
  });
  try {
    handle.selectTarget(target);
    await closeIn(handle, target);
    const stop = await fight(handle, target, seconds);
    if (stop === "target_dead") await lingerFor(toggles);
    return { stop, target: summary(found), toggles };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "unitmotion-kill",
  run,
  usage:
    "--flow unitmotion-kill [--arg seconds=<n>]: pick the nearest living hostile creature within 100 yards, walk into melee range, attack it until it dies, the character dies or the time limit (90 s) passes, and list the movement flags its death cleared.",
};
