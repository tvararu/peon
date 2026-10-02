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

const FLAMESTRIKE = 2120;
const CAST_YARDS = 30;
const SIGHT_YARDS = 120;
const STEP_YARDS = 20;
const MAX_STEPS = 10;
const POLL_MS = 50;
const CASTING_WAIT_MS = 2500;
const REPLY_WAIT_MS = 3000;
const MISSILE_SPEED = 20;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

function spellOf(args: Readonly<Record<string, string>>): number {
  const raw = args["spell"];
  if (raw === undefined) return FLAMESTRIKE;
  const spell = Number(raw);
  if (!(Number.isInteger(spell) && spell > 0))
    throw new Error(`spells-missile needs spell=<id>, not "${raw}".`);
  return spell;
}

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

function nearestHostile(handle: WorldHandle): Row | undefined {
  return others(handle).find(
    (row) =>
      entityType(row) === "unit" &&
      row.attackable &&
      row.relation === "hostile" &&
      !row.tappedByOther &&
      "health" in row.entity &&
      row.entity.health > 0 &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS,
  );
}

async function closeIn(handle: WorldHandle, target: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = rowOf(handle, target);
    if (!row?.position || row.distance === null || row.distance <= CAST_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - CAST_YARDS + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

async function until(test: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test()) return true;
    await Bun.sleep(POLL_MS);
  }
  return test();
}

function isCasting(handle: WorldHandle, spell: number): boolean {
  return handle.getCombatState().casting?.spellId === spell;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = await settle(() => nearestHostile(handle));
  if (!found)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  const target = found.entity.guid;
  const moved: { caster: string; castCount: number }[] = [];
  const stop = handle.spells.onEvent((event) => {
    if (event.type !== "projectile_moved") return;
    moved.push({
      castCount: event.castCount,
      caster: `0x${event.caster.toString(16)}`,
    });
  });
  try {
    await closeIn(handle, target);
    handle.selectTarget(target);
    handle.faceGuid(target);
    handle.cast(spell, target);
    const casting = await until(
      () => isCasting(handle, spell),
      CASTING_WAIT_MS,
    );
    const at = rowOf(handle, target)?.position;
    const self = handle.queryNearby().find((row) => row.self)?.position;
    if (!(casting && at && self))
      return {
        casting,
        moved,
        projectile: "not_sent",
        spell,
        target: summary(found),
      };
    const projectile = handle.spells.act.reportProjectile(
      spell,
      at.x,
      at.y,
      at.z,
    );
    const trajectory = handle.spells.act.reportMissileTrajectory(spell, {
      current: self,
      elevation: 0,
      speed: MISSILE_SPEED,
      target: at,
    });
    await until(() => moved.length > 0, REPLY_WAIT_MS);
    return {
      casting,
      moved,
      projectile,
      spell,
      target: summary(found),
      trajectory,
    };
  } finally {
    stop();
  }
}

export const flow: ProbeFlow = {
  name: "spells-missile",
  run,
  usage:
    "--flow spells-missile [--arg spell=<id>]: pick the nearest living hostile creature within 120 yards, close to 30 yards, cast the spell (Flamestrike 2120 by default, a 2 s cast with a destination), report the target's position with CMSG_UPDATE_PROJECTILE_POSITION and a trajectory with CMSG_UPDATE_MISSILE_TRAJECTORY while it casts, then wait 3 s for SMSG_SET_PROJECTILE_POSITION.",
};
