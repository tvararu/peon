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
const OWNER_WAIT_MS = 3000;
const POLL_MS = 250;
const KILL_TRIES = 3;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function healthOf(row: Row | undefined): number | undefined {
  return row && "health" in row.entity ? row.entity.health : undefined;
}

function nearestTarget(handle: WorldHandle): Row | undefined {
  return others(handle).find(
    (row) =>
      entityType(row) === "unit" &&
      row.entity.guid / PET_SPAN !== PET_HIGH &&
      !row.tappedByOther &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS &&
      row.attackable &&
      row.relation === "hostile" &&
      (healthOf(row) ?? 0) > 0,
  );
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`looting-master needs seconds > 0, not "${seconds}".`);
  return seconds;
}

async function closeIn(handle: WorldHandle, target: Row): Promise<void> {
  if (!target.position || target.distance === null) return;
  if (target.distance <= MELEE_YARDS) return;
  const { x, y, z } = target.position;
  const yards = Math.min(STEP_YARDS, target.distance - MELEE_YARDS + 1);
  await handle.walkTowardPoint({ x, y, z }, yards);
}

function swing(handle: WorldHandle, target: bigint): boolean {
  try {
    handle.faceGuid(target);
    handle.attack(target);
    return true;
  } catch {
    return false;
  }
}

async function kill(
  handle: WorldHandle,
  target: bigint,
  seconds: number,
): Promise<boolean> {
  const started = Date.now();
  handle.selectTarget(target);
  while (Date.now() - started < seconds * 1000) {
    const self = handle.queryNearby().find((near) => near.self);
    if (healthOf(self) === 0) return false;
    const row = handle
      .queryNearby()
      .find((near) => near.entity.guid === target);
    if ((healthOf(row) ?? 0) === 0) return true;
    if (row) await closeIn(handle, row);
    swing(handle, target);
    await Bun.sleep(POLL_MS);
  }
  return false;
}

async function candidatesOf(
  handle: WorldHandle,
  creature: bigint,
): Promise<readonly bigint[]> {
  const deadline = Date.now() + OWNER_WAIT_MS;
  for (;;) {
    const owners = handle.looting.state().owners;
    if (owners.has(creature)) return handle.looting.state().masterCandidates;
    if (Date.now() >= deadline) return [];
    await Bun.sleep(POLL_MS);
  }
}

function lootingJson(handle: WorldHandle, creature: bigint | undefined): Json {
  const state = handle.looting.state();
  return {
    candidates: state.masterCandidates.map(hex),
    creature: creature === undefined ? null : hex(creature),
    mine:
      creature === undefined
        ? null
        : (state.owners.get(creature)?.mine ?? null),
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const seconds = secondsOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  for (let attempt = 1; attempt <= KILL_TRIES; attempt++) {
    const found = await settle(() => nearestTarget(handle));
    if (!found)
      throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
    const creature = found.entity.guid;
    const dead = await kill(handle, creature, seconds);
    if (!dead) continue;
    handle.openLoot(creature);
    const candidates = await candidatesOf(handle, creature);
    if (candidates.length === 0) continue;
    const given = await handle.looting.act.giveMasterLoot(creature, 0, "@self");
    handle.releaseLoot();
    return {
      attempt,
      candidates: candidates.map(hex),
      gave: given,
      looting: lootingJson(handle, creature),
      target: summary(found),
    };
  }
  throw new Error(`no master loot candidates after ${KILL_TRIES} kills.`);
}

export const flow: ProbeFlow = {
  name: "looting-master",
  run,
  usage:
    "--flow looting-master [--arg seconds=<n>]: kill creatures until a master-looted corpse lists candidates, give slot 0 to self, then release the loot.",
};
