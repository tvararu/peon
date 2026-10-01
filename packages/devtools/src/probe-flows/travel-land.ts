import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

function freeze(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_, entry) =>
      typeof entry === "bigint" ? `0x${(entry as bigint).toString(16)}` : entry,
    ),
  ) as Json;
}
const REACH_YARDS = 4;
const STEP_YARDS = 20;
const MAX_STEPS = 6;
const NORTH_YARDS = 10;
const LAND_WAIT_MS = 300_000;

async function reach(handle: WorldHandle, guid: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = others(handle).find((r) => r.entity.guid === guid);
    if (!row?.position || row.distance === null || row.distance <= REACH_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - REACH_YARDS + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

async function waitForTakeoff(
  handle: WorldHandle,
  ms: number,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (handle.getControlState().blockedReason === "in_flight") return true;
    if (handle.getControlState().blockedReason === "teleporting") return false;
    await Bun.sleep(500);
  }
  return handle.getControlState().blockedReason === "in_flight";
}

async function waitForLanding(
  handle: WorldHandle,
  ms: number,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const reason = handle.getControlState().blockedReason;
    if (reason !== "in_flight" && reason !== "teleporting") return true;
    await Bun.sleep(500);
  }
  const reason = handle.getControlState().blockedReason;
  return reason !== "in_flight" && reason !== "teleporting";
}

async function landAndWalk(
  handle: WorldHandle,
): Promise<{ landed: boolean; tookOff: boolean }> {
  const tookOff = await waitForTakeoff(handle, LAND_WAIT_MS);
  const landed = tookOff && (await waitForLanding(handle, LAND_WAIT_MS));
  return { landed, tookOff };
}

async function walkNorth(handle: WorldHandle): Promise<Json> {
  const after = handle.getControlState();
  if (after.blockedReason !== undefined) return null;
  const walked = await handle.walkTowardPoint(
    {
      x: (after.pose?.x ?? 0) + NORTH_YARDS,
      y: after.pose?.y ?? 0,
      z: after.pose?.z ?? 0,
    },
    NORTH_YARDS,
  );
  return freeze(
    walked
      ? { reason: walked.reason ?? null, traveled: walked.traveled }
      : null,
  );
}

async function run(ctx: FlowContext): Promise<Json> {
  const to = ctx.args["to"];
  if (!to) throw new Error("travel-land needs --arg to=<destination>.");
  const master = await ctx.settle(() =>
    others(ctx.handle).find((r) => r.roles.includes("flight_master")),
  );
  if (!master) throw new Error("no flight master is in view.");
  await reach(ctx.handle, master.entity.guid);
  const opened = await ctx.handle.travel.act.openTaxiMap(master.entity.guid);
  if (opened.status !== "ok") throw new Error("the taxi map did not open.");
  const state = ctx.handle.travel.state();
  const node =
    state.masters.find((m) => m.npc === master.entity.guid)?.node ??
    state.known?.[0];
  if (node === undefined) throw new Error("no known taxi node here.");
  const planned = await ctx.handle.travel.act.planFlight(node, to);
  if (planned.status !== "ok") throw new Error(`no flight to ${to} from here.`);
  const taken = await ctx.handle.travel.act.activateTaxi(
    master.entity.guid,
    planned,
  );
  if (taken.status !== "ok")
    return freeze({
      destination: to,
      landed: false,
      pose: null,
      takeoff: taken,
      tookOff: false,
      walked: null,
    });
  if (taken.status === "ok" && taken.instant)
    return freeze({
      destination: to,
      landed: true,
      pose: null,
      takeoff: taken,
      tookOff: false,
      walked: null,
    });
  const { landed, tookOff } = await landAndWalk(ctx.handle);
  const walked = landed ? await walkNorth(ctx.handle) : null;
  const pose = ctx.handle.getControlState().pose;
  return freeze({
    destination: to,
    landed,
    pose: pose ? { mapId: pose.mapId, x: pose.x, y: pose.y, z: pose.z } : null,
    takeoff: taken,
    tookOff,
    walked,
  });
}

export const flow: ProbeFlow = {
  name: "travel-land",
  run,
  usage:
    "--flow travel-land --arg to=<destination>: take the flight there, wait for flight_landed, walk 10 yd north with the control handle, then report the pose.",
};
