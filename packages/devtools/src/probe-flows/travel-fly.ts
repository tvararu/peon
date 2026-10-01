import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const REACH_YARDS = 4;
const STEP_YARDS = 20;
const MAX_STEPS = 6;
const LANDING_WAIT_MS = 300_000;

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function freeze(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_, entry) =>
      typeof entry === "bigint" ? hex(entry) : entry,
    ),
  ) as Json;
}

function destinationOf(args: Readonly<Record<string, string>>): string {
  const to = args["to"];
  if (to === undefined || to === "")
    throw new Error("travel-fly needs to=<destination>.");
  return to;
}

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

async function flyRoute(
  ctx: FlowContext,
  guid: bigint,
  planned: { nodes: readonly number[]; price: number; destination: number },
  express: boolean,
): Promise<{ flight: unknown; landed: boolean; phase: string }> {
  const seen: string[] = [];
  const off = ctx.handle.travel.onEvent((event) => seen.push(event.type));
  try {
    const flight = await ctx.handle.travel.act.activateTaxi(
      guid,
      planned,
      express ? { express: true } : undefined,
    );
    const instant =
      flight.status === "ok" && "instant" in flight && flight.instant === true;
    const deadline = Date.now() + LANDING_WAIT_MS;
    while (
      flight.status === "ok" &&
      !instant &&
      !seen.includes("flight_landed") &&
      Date.now() < deadline
    )
      await Bun.sleep(200);
    return {
      flight,
      landed: instant || seen.includes("flight_landed"),
      phase: ctx.handle.travel.state().flight.phase,
    };
  } finally {
    off();
  }
}

async function run(ctx: FlowContext): Promise<Json> {
  const to = destinationOf(ctx.args);
  const express = ctx.args["express"] === "1";
  const master = await ctx.settle(() =>
    others(ctx.handle).find((r) => r.roles.includes("flight_master")),
  );
  if (!master) throw new Error("no flight master is in view.");
  await reach(ctx.handle, master.entity.guid);
  const guid = master.entity.guid;
  const mapped = await ctx.handle.travel.act.openTaxiMap(guid);
  if (mapped.status !== "ok" || mapped.kind !== "map")
    throw new Error("the flight master sent no taxi map.");
  const from = mapped.currentNode;
  const listed = await ctx.handle.travel.act.destinations(from);
  if (listed.status !== "ok")
    throw new Error("the taxi catalog has no record of this node.");
  const stray = listed.list.find((hop) => !hop.known)?.node;
  const unknown =
    stray === undefined
      ? null
      : await ctx.handle.travel.act.activateTaxi(
          guid,
          { destination: stray, nodes: [from, stray], price: 0 },
          { express, unchecked: true },
        );
  const planned = await ctx.handle.travel.act.planFlight(from, to);
  if (planned.status !== "ok")
    return {
      flight: null,
      from,
      landed: null,
      master: summary(master),
      planned: freeze(planned),
      unknown: freeze(unknown),
    };
  const flown = await flyRoute(ctx, guid, planned, express);
  return {
    flight: freeze(flown.flight),
    from,
    landed: flown.landed,
    master: summary(master),
    phase: flown.phase,
    planned: freeze(planned),
    unknown: freeze(unknown),
  };
}

export const flow: ProbeFlow = {
  name: "travel-fly",
  run,
  usage:
    "--flow travel-fly --arg to=<destination> [--arg express=1]: walk to the nearest flight master, send an unchecked activate for an unvisited node, plan a route to <to>, fly it (express=1 forces CMSG_ACTIVATETAXIEXPRESS) and wait for flight_landed.",
};
