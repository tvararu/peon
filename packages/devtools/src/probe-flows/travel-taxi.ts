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

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function freeze(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_, entry) =>
      typeof entry === "bigint" ? hex(entry) : entry,
    ),
  ) as Json;
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

async function run(ctx: FlowContext): Promise<Json> {
  const master = await ctx.settle(() =>
    others(ctx.handle).find((r) => r.roles.includes("flight_master")),
  );
  if (!master) throw new Error("no flight master is in view.");
  await reach(ctx.handle, master.entity.guid);
  const guid = master.entity.guid;
  const status = await ctx.handle.travel.act.queryTaxiStatus(guid);
  const first = await ctx.handle.travel.act.openTaxiMap(guid);
  const second = await ctx.handle.travel.act.openTaxiMap(guid);
  const enabled = await ctx.handle.travel.act.openTaxiMap(guid, {
    enable: true,
  });
  const benchmarkOn = await ctx.handle.travel.act.setTaxiBenchmark(true);
  const benchmarkOff = await ctx.handle.travel.act.setTaxiBenchmark(false);
  const state = ctx.handle.travel.state();
  const node =
    state.masters.find((m) => m.npc === guid)?.node ?? state.known?.[0];
  const catalog =
    node === undefined
      ? null
      : await ctx.handle.travel.act.destinations(node).catch(() => null);
  const record =
    node === undefined || catalog?.status !== "ok" ? null : catalog.node;
  return {
    benchmarkOff: freeze(benchmarkOff),
    benchmarkOn: freeze(benchmarkOn),
    catalog: freeze(catalog),
    enabled: freeze(enabled),
    first: freeze(first),
    master: summary(master),
    masterGuid: hex(guid),
    masterPosition: freeze(master.position ?? null),
    node: node ?? null,
    nodeCoordinates:
      record === null ? null : { x: record.x, y: record.y, z: record.z },
    nodeMap: record?.map ?? null,
    nodeName: record?.name ?? null,
    second: freeze(second),
    status: freeze(status),
  };
}

export const flow: ProbeFlow = {
  name: "travel-taxi",
  run,
  usage:
    "--flow travel-taxi: walk to the nearest flight master, query its taxi status, open its map (learning the node on the first query), open it again and with enable, then set the taxi benchmark mode on and off.",
};
