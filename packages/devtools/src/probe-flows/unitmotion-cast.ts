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
const CAST_YARDS = 5;
const STEP_YARDS = 20;
const MAX_STEPS = 8;
const PET_HIGH = 0xf1_40n;
const PET_SPAN = 0x1_00_00_00_00_00_00n;
const DEFAULT_SECONDS = 20;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

function prey(handle: WorldHandle): Row | undefined {
  return others(handle).find(
    (row) =>
      entityType(row) === "unit" &&
      row.entity.guid / PET_SPAN !== PET_HIGH &&
      !row.tappedByOther &&
      row.attackable &&
      row.relation === "hostile" &&
      "health" in row.entity &&
      row.entity.health > 0 &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS,
  );
}

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? "");
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(
      `unitmotion-cast needs spell=<id>, not "${args["spell"]}".`,
    );
  return spell;
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`unitmotion-cast needs seconds > 0, not "${seconds}".`);
  return seconds;
}

async function closeIn(handle: WorldHandle, target: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = rowOf(handle, target);
    if (!row?.position || row.distance === null || row.distance <= CAST_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - CAST_YARDS + 1);
    const walked = await handle
      .walkTowardPoint({ x, y, z }, yards)
      .catch(() => undefined);
    if (!walked || walked.traveled === 0) return;
  }
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const seconds = secondsOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = (await settle(() => prey(handle))) ?? prey(handle);
  if (!found)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  const target = found.entity.guid;
  const speeds: Json[] = [];
  const flags: Json[] = [];
  const off = handle.unitmotion.onEvent((event) => {
    if (event.guid !== target) return;
    if (event.type === "speed")
      speeds.push({
        kind: event.kind,
        previous: event.previous ?? null,
        value: event.value,
      });
    else if (event.type === "flag")
      flags.push({ flag: event.flag, on: event.on });
  });
  try {
    handle.selectTarget(target);
    await closeIn(handle, target);
    try {
      handle.faceGuid(target);
    } catch {
      ignoreFailure();
    }
    handle.cast(spell, target);
    await Bun.sleep(seconds * 1000);
    return { flags, speeds, spell, target: summary(found) };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "unitmotion-cast",
  run,
  usage:
    "--flow unitmotion-cast --arg spell=<id> [--arg seconds=<n>]: walk to the nearest living hostile creature within 100 yards until it is within 5 yards, target it, cast the spell at it, then wait 20 s (or seconds) so its aura ends, and list the speed and flag changes the creature showed.",
};
