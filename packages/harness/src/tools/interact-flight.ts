import type { InteractAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import {
  type NpcTarget,
  shortMoney,
  type TalkPart,
} from "#harness/tools/interact-quest";
import { nextCall } from "#harness/tools/next-call";
import { openFlightMap } from "#harness/tools/travel-fly";

type Destination = { name: string; price: number; known: boolean };

export type FlightTalk = TalkPart & { next: string | undefined };

const NONE: FlightTalk = { after: {}, lines: [], next: undefined };

export function flightLines(init: {
  from: { name: string };
  list: readonly Destination[];
  learned: boolean;
}): string[] {
  const { from, list, learned } = init;
  const known = list.filter((one) => one.known);
  const head = learned ? [`Learned the flight path at ${from.name}.`] : [];
  if (known.length === 0)
    return [
      ...head,
      `No other flight path is known from ${from.name}. Visit more flight masters to learn them.`,
    ];
  const rows = known.map((one) => `${one.name} ${shortMoney(one.price)}`);
  return [...head, `Flights from ${from.name}: ${rows.join(", ")}.`];
}

export async function flightExtra(init: {
  ctx: ToolCtx<InteractAfter>;
  npc: NpcTarget;
}): Promise<FlightTalk> {
  const { ctx, npc } = init;
  if (!npc.unit.roles.includes("flight_master")) return NONE;
  const opened = await openFlightMap(ctx, npc.guid);
  if (opened.kind === "silent")
    return {
      after: {},
      lines: ["The flight master did not show its map in 3 s."],
      next: undefined,
    };
  if (opened.kind === "refused")
    return {
      after: {},
      lines: [`The flight master refused the map (${opened.reason}).`],
      next: undefined,
    };
  const listed = await ctx.handle.travel.act.destinations(opened.currentNode);
  if (listed.status !== "ok") return NONE;
  const first = listed.list.find((one) => one.known);
  return {
    after: {},
    lines: flightLines({
      from: listed.node,
      learned: opened.learned,
      list: listed.list,
    }),
    next: first ? nextCall("travel", { to: `fly ${first.name}` }) : undefined,
  };
}
