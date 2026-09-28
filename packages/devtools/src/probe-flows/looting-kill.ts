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

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Stop = "target_dead" | "self_dead" | "timeout";

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

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
    throw new Error(`looting-kill needs seconds > 0, not "${seconds}".`);
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

async function fight(
  handle: WorldHandle,
  target: bigint,
  seconds: number,
): Promise<Stop> {
  const started = Date.now();
  handle.selectTarget(target);
  while (Date.now() - started < seconds * 1000) {
    const self = handle.queryNearby().find((near) => near.self);
    if (healthOf(self) === 0) return "self_dead";
    const row = rowOf(handle, target);
    if ((healthOf(row) ?? 0) === 0) return "target_dead";
    if (row) await closeIn(handle, row);
    swing(handle, target);
    await Bun.sleep(POLL_MS);
  }
  return "timeout";
}

async function ownerOf(handle: WorldHandle, creature: bigint) {
  const deadline = Date.now() + OWNER_WAIT_MS;
  let owner = handle.looting.state().owners.get(creature);
  while (owner === undefined && Date.now() < deadline) {
    await Bun.sleep(POLL_MS);
    owner = handle.looting.state().owners.get(creature);
  }
  return owner;
}

function lootingJson(handle: WorldHandle): Json {
  const state = handle.looting.state();
  return {
    owners: [...state.owners].map(([creature, owner]) => ({
      creature: hex(creature),
      looter: hex(owner.looter),
      master: hex(owner.master),
      mine: owner.mine,
    })),
    passOnLoot: state.passOnLoot,
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const seconds = secondsOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = await settle(() => nearestTarget(handle));
  if (!found)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  const creature = found.entity.guid;
  const stop = await fight(handle, creature, seconds);
  const owner =
    stop === "target_dead" ? await ownerOf(handle, creature) : undefined;
  return {
    looting: lootingJson(handle),
    owner: owner === undefined ? null : owner.mine,
    stop,
    target: summary(found),
  };
}

export const flow: ProbeFlow = {
  name: "looting-kill",
  run,
  usage:
    "--flow looting-kill [--arg seconds=<n>]: walk to the nearest living hostile creature within 35 yards, attack it until it dies, then print the looting state.",
};
