import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

const DEFAULT_SECONDS = 300;
const POLL_MS = 250;
const LIFE_MS = 30_000;
const SPELL_MS = 10_000;
const SIGHT_YARDS = 500;
const LOOK_MS = 15_000;
const SCOUT_LEGS = 30;
const SCOUT_STEP_YARDS = 20;
const MELEE_YARDS = 3;
const STEP_YARDS = 20;
const MAX_LEGS = 400;
const RETURN_YARDS = 60;

type Point = { x: number; y: number; z: number };

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`selfstate-selfres needs seconds > 0, not "${seconds}".`);
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

function nearestHostile(handle: WorldHandle): Point | undefined {
  const row = others(handle).find(
    (candidate) =>
      (candidate.relation === "hostile" || candidate.attackable) &&
      candidate.distance !== null &&
      candidate.distance <= SIGHT_YARDS,
  );
  return row?.position ?? undefined;
}

async function scout(
  handle: WorldHandle,
  dx: number,
  dy: number,
): Promise<Point | undefined> {
  const pose = handle.getControlState().pose;
  if (!pose) return undefined;
  for (let i = 1; i <= SCOUT_LEGS; i++) {
    const found = nearestHostile(handle);
    if (found) return found;
    const target = {
      x: pose.x + dx * SCOUT_STEP_YARDS * i,
      y: pose.y + dy * SCOUT_STEP_YARDS * i,
      z: pose.z,
    };
    const walked = await handle
      .walkTowardPoint(target, SCOUT_STEP_YARDS)
      .catch(() => undefined);
    if (!walked || walked.traveled === 0) break;
  }
  return nearestHostile(handle);
}

async function provoke(handle: WorldHandle): Promise<boolean> {
  const hostile =
    (await until(() => nearestHostile(handle), LOOK_MS)) ??
    (await scout(handle, 1, -1)) ??
    (await scout(handle, -1, 1));
  if (!hostile) return false;
  for (let i = 0; i < MAX_LEGS; i++) {
    const pose = handle.getControlState().pose;
    if (!pose) return true;
    const left = Math.hypot(hostile.x - pose.x, hostile.y - pose.y);
    if (left <= MELEE_YARDS) return true;
    const walked = await handle
      .walkTowardPoint(hostile, Math.min(STEP_YARDS, left - MELEE_YARDS + 1))
      .catch(() => undefined);
    if (!walked) return false;
    if (walked.traveled === 0) return true;
  }
  return true;
}

async function walkBack(handle: WorldHandle, home: Point): Promise<void> {
  const pose = handle.getControlState().pose;
  if (!pose) return;
  const left = Math.hypot(home.x - pose.x, home.y - pose.y);
  if (left <= RETURN_YARDS) return;
  await handle
    .walkTowardPoint(home, Math.min(STEP_YARDS, left - RETURN_YARDS))
    .catch(() => undefined);
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const seconds = secondsOf(args);
  const started = Date.now();
  const events: Json[] = [];
  const off = handle.selfstate.onEvent((event) => {
    if (event.type === "self_res_available")
      events.push({
        atMs: Date.now() - started,
        name: event.name ?? null,
        spellId: event.spellId,
      });
  });
  try {
    if (handle.getRecoveryState().life === "alive") {
      const provoked = await provoke(handle);
      if (!provoked) throw new Error("selfstate-selfres: no hostile in view.");
      const dead = await until(
        () => (handle.getRecoveryState().life === "dead" ? true : undefined),
        seconds * 1000,
      );
      if (!dead)
        throw new Error("selfstate-selfres: the character never died.");
    }
    const deathMs = Date.now() - started;
    const home = handle.getControlState().pose;
    if (home) await walkBack(handle, home);
    const spell = await until(() => {
      const id = handle.selfstate.state().selfResSpell;
      return id === 0 ? undefined : id;
    }, SPELL_MS);
    const refusedBefore = spell === undefined;
    const corpse = await handle.selfstate.act.queryCorpseMapPosition();
    const res = await handle.selfstate.act.selfResurrect();
    const alive = await until(
      () => (handle.getRecoveryState().life === "alive" ? true : undefined),
      LIFE_MS,
    );
    const report: Json = {
      alive: alive === true,
      corpseQuery:
        corpse.status === "ok"
          ? { position: [...corpse.position], status: "ok" }
          : { status: corpse.status },
      deathMs,
      events,
      selfRes:
        res.status === "refused"
          ? { reason: res.reason, status: "refused" }
          : { status: res.status },
      selfResSpell: spell ?? 0,
    };
    if (refusedBefore || res.status !== "ok" || !alive)
      throw new Error(
        `selfstate-selfres did not come back: ${JSON.stringify(report)}`,
      );
    return report;
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "selfstate-selfres",
  run,
  usage:
    "--flow selfstate-selfres [--arg seconds=<s>]: walk into the nearest hostile creature, wait up to <s> seconds (default 300) for the character to die, read the self-resurrection spell from the self fields, send CMSG_CORPSE_MAP_POSITION_QUERY, then send CMSG_SELF_RES and wait for the character to be alive; exits non-zero when it does not come back.",
};
