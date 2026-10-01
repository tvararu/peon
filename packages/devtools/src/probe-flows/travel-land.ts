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

async function waitForLanding(
  handle: WorldHandle,
  ms: number,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (handle.getControlState().blockedReason !== "in_flight") return true;
    await Bun.sleep(500);
  }
  return handle.getControlState().blockedReason !== "in_flight";
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
  const tookOff = ctx.handle.getControlState().blockedReason === "in_flight";
  const landed = await waitForLanding(ctx.handle, LAND_WAIT_MS);
  const after = ctx.handle.getControlState();
  const walked =
    landed && after.blockedReason === undefined
      ? await ctx.handle.walkTowardPoint(
          {
            x: (after.pose?.x ?? 0) + NORTH_YARDS,
            y: after.pose?.y ?? 0,
            z: after.pose?.z ?? 0,
          },
          NORTH_YARDS,
        )
      : null;
  const pose = ctx.handle.getControlState().pose;
  return freeze({
    destination: to,
    landed,
    pose: pose ? { mapId: pose.mapId, x: pose.x, y: pose.y, z: pose.z } : null,
    takeoff: taken,
    tookOff,
    walked: walked
      ? { reason: walked.reason ?? null, traveled: walked.traveled }
      : null,
  });
}

export const flow: ProbeFlow = {
  name: "travel-land",
  run,
  usage:
    "--flow travel-land --arg to=<destination>: take the flight there, wait for flight_landed, walk 10 yd north with the control handle, then report the pose.",
};
