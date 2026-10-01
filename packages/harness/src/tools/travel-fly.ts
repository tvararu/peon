import { messageOf } from "@peon/core/lib/errors";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { OpsCtx, ToolCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { INTERACT_APPROACH_YD, TALK_RANGE_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";
import { poseView, unitViews } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { shortMoney } from "#harness/tools/interact-quest";
import { nextCall } from "#harness/tools/next-call";
import type { TravelArgs } from "#harness/tools/params-travel";
import { legReport, youLine } from "#harness/tools/travel-report";

export const FLIGHT_WAIT_MS = 20 * 60_000;
export const NODE_WALK_YD = 300;
const NODE_WITHIN_YD = 8;
const MAP_TRIES = 2;

type After = (patch: Partial<TravelAfter>) => TravelAfter;
type Report = ToolResult<TravelAfter>;
type FlyWork = {
  ops: OpsCtx;
  ctx: ToolCtx<TravelAfter>;
  args: TravelArgs;
  destination: string;
  after: After;
};

export type MapOpen =
  | { kind: "map"; currentNode: number; learned: boolean }
  | { kind: "silent" }
  | { kind: "refused"; reason: string };

export async function openFlightMap(
  ctx: OpsCtx,
  npc: bigint,
): Promise<MapOpen> {
  let learned = false;
  for (let attempt = 0; attempt < MAP_TRIES; attempt++) {
    const opened = await ctx.rt.mutex.run(async () => {
      ctx.signal.throwIfAborted();
      ctx.handle.takeControl("manual_override");
      return await ctx.handle.travel.act.openTaxiMap(npc);
    });
    if (opened.status === "no_answer") return { kind: "silent" };
    if (opened.status !== "ok")
      return { kind: "refused", reason: opened.reason };
    if (opened.kind === "map")
      return { currentNode: opened.currentNode, kind: "map", learned };
    learned = true;
  }
  return { kind: "silent" };
}

function noMaster(): Refusal {
  return new Refusal({
    detail:
      "No flight master in view. Use look find:flight_master or travel explore.",
    next: nextCall("look", { find: "flight_master" }),
    reason: "no_flight_master",
  });
}

function nearestMaster(ctx: OpsCtx): UnitView | undefined {
  return unitViews(ctx)
    .filter(
      (unit) =>
        unit.roles.includes("flight_master") &&
        unit.alive &&
        unit.relation !== "hostile",
    )
    .sort(
      (a, b) =>
        (a.distance ?? Number.POSITIVE_INFINITY) -
        (b.distance ?? Number.POSITIVE_INFINITY),
    )[0];
}

function legView(after: After, leg: LegResult): TravelAfter {
  return after({
    floorRetried: leg.floorRetried,
    floors: leg.floors,
    legs: [
      {
        index: 0,
        reason: leg.reason,
        status: leg.status,
        traveledYd: leg.traveledYd,
      },
    ],
    traveledYd: leg.traveledYd,
  });
}

async function nearestKnownNode(
  ops: OpsCtx,
): Promise<{ x: number; y: number; z: number } | undefined> {
  const pose = poseView(ops);
  const known = ops.handle.travel.state().known ?? [];
  if (!pose) return undefined;
  let best: { x: number; y: number; z: number; away: number } | undefined;
  for (const id of known) {
    const listed = await ops.handle.travel.act.destinations(id);
    if (listed.status !== "ok" || listed.node.map !== pose.mapId) continue;
    const { x, y, z } = listed.node;
    const away = Math.hypot(pose.x - x, pose.y - y);
    if (away <= NODE_WALK_YD && (best === undefined || away < best.away))
      best = { away, x, y, z };
  }
  return best;
}

async function walkToNode(work: FlyWork): Promise<Report | undefined> {
  const { ops, args, after } = work;
  const node = await nearestKnownNode(ops);
  if (!node) return undefined;
  const leg = await travelLeg(ops, {
    goal: { kind: "point", x: node.x, y: node.y, z: node.z },
    within: NODE_WITHIN_YD,
  });
  if (leg.status === "arrived") return undefined;
  return legReport({
    after: legView(after, leg),
    ctx: ops,
    goal: { kind: "point", x: node.x, y: node.y, z: node.z },
    leg,
    to: args.to,
  });
}

type Reached = { master: UnitView; guid: bigint } | { report: Report };

async function reachMaster(work: FlyWork): Promise<Reached> {
  const { ops, args, after } = work;
  let master = nearestMaster(ops);
  if (!master) {
    const walked = await walkToNode(work);
    if (walked) return { report: walked };
    master = nearestMaster(ops);
  }
  const guid = master ? ops.rt.refs.guidOf(master.ref) : undefined;
  if (!(master && guid !== undefined)) throw noMaster();
  if ((master.distance ?? 0) <= TALK_RANGE_YD) return { guid, master };
  const leg = await travelLeg(ops, {
    goal: { guid, kind: "unit", name: master.name },
    within: INTERACT_APPROACH_YD,
  });
  if (leg.status === "arrived") return { guid, master };
  return {
    report: legReport({
      after: legView(after, leg),
      ctx: ops,
      goal: { guid, kind: "unit", unit: master },
      leg,
      to: args.to,
    }),
  };
}

type Planned = {
  status: "refused";
  reason: string;
  matches?: { node: number; name: string }[];
};

function planRefusal(planned: Planned, master: UnitView): Refusal {
  const talk = nextCall("interact", { do: "talk", npc: master.ref });
  if (planned.reason === "ambiguous" && planned.matches) {
    const names = planned.matches.map((match) => match.name);
    return new Refusal({
      detail: `more than one flight destination matches: ${names.join(", ")}.`,
      next: nextCall("travel", { to: `fly ${names[0]}` }),
      reason: "ambiguous",
    });
  }
  const text: Record<string, string> = {
    missing_taxi_data: "the flight path data is missing on this machine.",
    no_route: "no known flight route leads there from here.",
    not_known:
      "you have not discovered that flight path; visit its flight master first.",
    unknown_node: "no flight destination has that name.",
  };
  const reason =
    planned.reason === "unknown_node" ? "unknown_destination" : planned.reason;
  return new Refusal({
    detail:
      text[planned.reason] ?? `the route was refused (${planned.reason}).`,
    next: talk,
    reason,
  });
}

function activateRefusal(reason: string, args: TravelArgs): Refusal {
  if (reason === "mounted")
    return new Refusal({
      detail: "Get off your mount first.",
      reason: "mounted",
    });
  const text: Record<string, string> = {
    busy: "you are busy (combat, casting or stunned); try again when free.",
    moving: "stop moving first, then try again.",
    no_such_path: "the flight master has no direct path for this route.",
    not_enough_money: "you cannot afford this flight.",
    not_known: "you have not discovered a flight path on this route.",
    not_standing: "stand up first, then try again.",
    not_visited: "you have not discovered a flight path on this route.",
    same_node: "you are already at that flight path.",
    server_error: "the server refused the flight (server error).",
    shapeshifted: "you cannot fly while shapeshifted.",
    too_far: "the flight master is too far away; move closer and try again.",
  };
  return new Refusal({
    detail: text[reason] ?? `the flight master refused (${reason}).`,
    next:
      reason === "not_enough_money"
        ? nextCall("journal", { about: "bags" })
        : nextCall("travel", { to: args.to }),
    reason,
  });
}

type LandingEnd = "landed" | "timeout" | "aborted";
type Landing = {
  end: Promise<LandingEnd>;
  arm: () => void;
  dispose: () => void;
};

function watchLanding(ctx: OpsCtx): Landing {
  const outcome = Promise.withResolvers<LandingEnd>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = (): void => outcome.resolve("aborted");
  const off = ctx.handle.travel.onEvent((event) => {
    if (event.type === "flight_landed") outcome.resolve("landed");
  });
  ctx.signal.addEventListener("abort", abort, { once: true });
  if (ctx.signal.aborted) abort();
  return {
    arm: () => {
      timer = setTimeout(() => outcome.resolve("timeout"), FLIGHT_WAIT_MS);
    },
    dispose: () => {
      clearTimeout(timer);
      off();
      ctx.signal.removeEventListener("abort", abort);
    },
    end: outcome.promise,
  };
}

const SETTLE_YD = 1;

async function settleOnGround(ops: OpsCtx): Promise<string | undefined> {
  const pose = ops.handle.getControlState().pose;
  if (!pose) return "no pose to step from";
  const target = {
    x: pose.x + Math.cos(pose.orientation) * SETTLE_YD,
    y: pose.y + Math.sin(pose.orientation) * SETTLE_YD,
    z: pose.z,
  };
  try {
    const stepped = await ops.rt.mutex.run(async () => {
      ops.signal.throwIfAborted();
      ops.handle.takeControl("manual_override");
      return await ops.handle.walkTowardPoint(target, SETTLE_YD, ops.signal);
    });
    return stepped.status === "completed" ? undefined : stepped.reason;
  } catch (error) {
    return messageOf(error);
  }
}

async function nodeName(ops: OpsCtx, id: number): Promise<string> {
  const listed = await ops.handle.travel.act.destinations(id);
  return listed.status === "ok" ? listed.node.name : `node ${id}`;
}

async function ending(
  work: FlyWork,
  route: { destination: number; price: number },
  end: LandingEnd | "instant",
): Promise<Report> {
  const { ops, after, args } = work;
  const view = after({ goal: { destination: work.destination, kind: "fly" } });
  const name = await nodeName(ops, route.destination);
  const paid = `list price ${shortMoney(route.price)}`;
  if (end === "instant")
    return result("DONE", {
      after: view,
      detail: `arrived by instant flight at ${name} (${paid}). ${youLine(ops)}`,
      next: nextCall("look"),
    });
  if (end === "landed") {
    const unsettled = await settleOnGround(ops);
    const note = unsettled
      ? ` The step onto the ground stopped (${unsettled}).`
      : "";
    return result("DONE", {
      after: view,
      detail: `flew and landed at ${name} (${paid}).${note} ${youLine(ops)}`,
      next: nextCall("look"),
    });
  }
  if (end === "aborted")
    return result("PARTLY", {
      after: view,
      detail: `stopped waiting for the flight to ${name}; it continues until it lands.`,
      next: nextCall("look"),
      reason: "stopped",
    });
  return result("UNCONFIRMED", {
    after: view,
    detail: `no landing at ${name} was seen after ${FLIGHT_WAIT_MS / 60_000} min.`,
    next: nextCall("travel", { to: args.to }),
    reason: "no_landing",
  });
}

type Plan = {
  master: UnitView;
  guid: bigint;
  route: { destination: number; nodes: readonly number[]; price: number };
};

async function planWork(work: FlyWork): Promise<Plan | Report> {
  const { ops, args, destination } = work;
  const reached = await reachMaster(work);
  if ("report" in reached) return reached.report;
  const { master, guid } = reached;
  const goal = { destination, kind: "fly" } as const;
  const opened = await openFlightMap(ops, guid);
  if (opened.kind === "silent")
    return result("UNCONFIRMED", {
      after: work.after({ goal }),
      detail: `${master.name} (${master.ref}) showed no flight map in 3 s.`,
      next: nextCall("travel", { to: args.to }),
      reason: "no_answer",
    });
  if (opened.kind === "refused")
    throw new Refusal({
      detail: `${master.name} (${master.ref}) refused the flight map (${opened.reason}).`,
      next: nextCall("travel", { to: args.to }),
      reason: opened.reason,
    });
  const planned = await ops.handle.travel.act.planFlight(
    opened.currentNode,
    destination,
  );
  ops.signal.throwIfAborted();
  if (planned.status === "refused") throw planRefusal(planned, master);
  if (planned.status !== "ok")
    return result("UNCONFIRMED", {
      after: work.after({ goal }),
      detail: "the flight data did not answer.",
      next: nextCall("travel", { to: args.to }),
      reason: "no_answer",
    });
  if (planned.nodes.length < 2)
    throw new Refusal({
      detail: `you are already at ${destination}.`,
      next: nextCall("look"),
      reason: "already_there",
    });
  return {
    guid,
    master,
    route: {
      destination: planned.destination,
      nodes: planned.nodes,
      price: planned.price,
    },
  };
}

export async function flyWork(work: FlyWork): Promise<Report> {
  const { ops, args, destination } = work;
  if (ops.handle.getControlState().blockedReason === "in_flight")
    throw new Refusal({
      detail: "you are already on a flight; wait for the landing.",
      next: nextCall("look"),
      reason: "in_flight",
    });
  const plan = await planWork(work);
  if ("status" in plan) return plan;
  const { guid, master, route } = plan;
  const landing = watchLanding(ops);
  try {
    const flown = await ops.rt.mutex.run(async () => {
      ops.signal.throwIfAborted();
      ops.handle.takeControl("manual_override");
      return await ops.handle.travel.act.activateTaxi(guid, route);
    });
    if (flown.status === "refused") throw activateRefusal(flown.reason, args);
    if (flown.status !== "ok")
      return result("UNCONFIRMED", {
        after: work.after({ goal: { destination, kind: "fly" } }),
        detail: `${master.name} (${master.ref}) gave no flight reply in 5 s; check look.`,
        next: nextCall("travel", { to: args.to }),
        reason: "no_answer",
      });
    if (flown.instant) return await ending(work, route, "instant");
    landing.arm();
    ops.progress(`flying to ${destination}`);
    return await ending(work, route, await landing.end);
  } finally {
    landing.dispose();
  }
}
