import { pause } from "@peon/core/lib/abort";
import { messageOf } from "@peon/core/lib/errors";
import {
  namesNear,
  readNodes,
  type StopNode,
  servesStop,
} from "#harness/areas/transports/stops";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { OpsCtx, ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { travelLeg } from "#harness/ops/travel-leg";
import { poseView } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";
import type { TravelArgs } from "#harness/tools/params-travel";
import { youLine } from "#harness/tools/travel-report";

export const RIDE_POLL_MS = 1000;
export const SIGHT_WAIT_MS = 30_000;
export const DOCK_WAIT_MS = 15 * 60_000;
export const RIDE_WAIT_MS = 20 * 60_000;
export const DOCK_NEAR_YD = 400;
export const DECK_WALK_YD = 15;
export const BOARD_RANGE_YD = 30;
export const FAR_DOCK_YD = 100;

type After = (patch: Partial<TravelAfter>) => TravelAfter;
type Report = ToolResult<TravelAfter>;
type RideWork = {
  ops: OpsCtx;
  ctx: ToolCtx<TravelAfter>;
  args: TravelArgs;
  stop: string;
  after: After;
};
type Pose = {
  mapId: number;
  x: number;
  y: number;
  z: number;
  moving: boolean;
};
type Dock = { guid: bigint; pose: Pose };

function view(work: RideWork): TravelAfter {
  return work.after({ goal: { kind: "ride", name: work.stop } });
}

function missing(cause?: unknown): Refusal {
  return new Refusal({
    detail: `the transport paths or stop names are not available${cause === undefined ? "" : ` (${messageOf(cause)})`}, so a ride cannot be planned.`,
    next: nextCall("travel", { to: "explore" }),
    reason: "transport_data_missing",
  });
}

async function loadNodes(ops: OpsCtx): Promise<StopNode[]> {
  const source = ops.rt.profile.client.dbc;
  if (!source) throw missing();
  try {
    return await readNodes(source);
  } catch (error) {
    throw missing(error);
  }
}

function poses(ops: OpsCtx): Dock[] {
  const { act } = ops.handle.transports;
  const found: Dock[] = [];
  for (const entry of ops.handle.transports.state().transports.values()) {
    if (entry.kind !== "motion") continue;
    const pose = act.poseAt(entry.guid);
    if (pose) found.push({ guid: entry.guid, pose });
  }
  return found;
}

function seen(ops: OpsCtx): number {
  let count = 0;
  for (const entry of ops.handle.transports.state().transports.values())
    if (entry.kind === "motion") count += 1;
  return count;
}

function away(ops: OpsCtx, pose: Pose): number {
  const self = poseView(ops);
  return self
    ? Math.hypot(self.x - pose.x, self.y - pose.y)
    : Number.POSITIVE_INFINITY;
}

async function poll<T>(
  ops: OpsCtx,
  ms: number,
  check: () => T | undefined,
): Promise<T | undefined> {
  for (let waited = 0; waited <= ms; waited += RIDE_POLL_MS) {
    ops.signal.throwIfAborted();
    const found = check();
    if (found !== undefined) return found;
    try {
      await pause(RIDE_POLL_MS, ops.signal);
    } catch (error) {
      ops.signal.throwIfAborted();
      throw error;
    }
  }
  return undefined;
}

function dockedNear(ops: OpsCtx): Dock | undefined {
  return poses(ops).find(
    (dock) => !dock.pose.moving && away(ops, dock.pose) <= DOCK_NEAR_YD,
  );
}

async function findDock(work: RideWork): Promise<Dock | Report> {
  const { ops } = work;
  const sighted = await poll(ops, SIGHT_WAIT_MS, () =>
    seen(ops) > 0 ? true : undefined,
  );
  if (!sighted)
    throw new Refusal({
      detail: "no boat or zeppelin is in view here.",
      next: nextCall("travel", { to: "explore" }),
      reason: "no_transport",
    });
  if (poses(ops).length === 0) throw missing();
  const docked = await poll(ops, DOCK_WAIT_MS, () => dockedNear(ops));
  if (docked) return docked;
  return result("UNCONFIRMED", {
    after: view(work),
    detail: `no transport docked within ${DOCK_NEAR_YD} yd in ${DOCK_WAIT_MS / 60_000} min.`,
    next: nextCall("travel", { to: work.args.to }),
    reason: "no_dock",
  });
}

async function walkToDeck(work: RideWork, dock: Dock): Promise<Dock | Report> {
  const { ops } = work;
  if (away(ops, dock.pose) <= BOARD_RANGE_YD - DECK_WALK_YD) return dock;
  const leg = await travelLeg(ops, {
    goal: { kind: "point", x: dock.pose.x, y: dock.pose.y },
    within: DECK_WALK_YD,
  });
  if (leg.status !== "arrived")
    return result("FAILED", {
      after: view(work),
      detail: `could not walk to the dock (${leg.reason ?? leg.detail}).`,
      next: nextCall("look"),
      reason: leg.reason ?? "unreachable",
    });
  const still = ops.handle.transports.act.poseAt(dock.guid);
  if (!still || still.moving) return findDock(work);
  return { guid: dock.guid, pose: still };
}

async function board(work: RideWork, dock: Dock): Promise<Report | undefined> {
  const { ops } = work;
  const outcome = await ops.rt.mutex.run(async () => {
    ops.signal.throwIfAborted();
    ops.handle.takeControl("manual_override");
    return await ops.handle.transports.act.board(dock.guid);
  });
  if (outcome.status === "ok") return undefined;
  return result("REFUSED", {
    after: view(work),
    detail: `the transport refused you (${outcome.reason}).`,
    next: nextCall("travel", { to: work.args.to }),
    reason: outcome.reason,
  });
}

function arrived(
  ops: OpsCtx,
  nodes: readonly StopNode[],
  boarded: { dock: Dock; from: Pose; stop: string },
): Pose | undefined {
  const { dock, from, stop } = boarded;
  const pose = ops.handle.transports.act.poseAt(dock.guid);
  if (!pose || pose.moving) return undefined;
  const moved =
    pose.mapId !== from.mapId ||
    Math.hypot(pose.x - from.x, pose.y - from.y) > FAR_DOCK_YD;
  return moved && servesStop(nodes, pose, stop) ? pose : undefined;
}

async function leave(work: RideWork): Promise<Report | undefined> {
  const { ops } = work;
  const outcome = await ops.rt.mutex.run(async () => {
    ops.signal.throwIfAborted();
    ops.handle.takeControl("manual_override");
    return await ops.handle.transports.act.leave();
  });
  if (outcome.status === "ok") return undefined;
  return result("FAILED", {
    after: view(work),
    detail: `you rode to ${work.stop} but could not get off (${outcome.reason}); you are still aboard.`,
    next: nextCall("look"),
    reason: outcome.reason,
  });
}

export async function rideWork(work: RideWork): Promise<Report> {
  const { ops, stop } = work;
  const nodes = await loadNodes(ops);
  const found = await findDock(work);
  if ("status" in found) return found;
  if (servesStop(nodes, found.pose, stop))
    throw new Refusal({
      detail: `this dock already serves ${stop}.`,
      next: nextCall("look"),
      reason: "already_there",
    });
  const ready = await walkToDeck(work, found);
  if ("status" in ready) return ready;
  const refused = await board(work, ready);
  if (refused) return refused;
  ops.progress(`riding to ${stop}`);
  const landed = await poll(ops, RIDE_WAIT_MS, () =>
    arrived(ops, nodes, { dock: ready, from: ready.pose, stop }),
  );
  if (!landed)
    return result("UNCONFIRMED", {
      after: view(work),
      detail: `no dock serving ${stop} was reached in ${RIDE_WAIT_MS / 60_000} min; you are still aboard.`,
      next: nextCall("look"),
      reason: "no_arrival",
    });
  const failed = await leave(work);
  if (failed) return failed;
  const names = namesNear(nodes, landed);
  return result("DONE", {
    after: view(work),
    detail: `rode to ${names[0] ?? stop} and got off. ${youLine(ops)}`,
    next: nextCall("look"),
  });
}

export function rideStop(text: string): string {
  return text.slice("ride".length).trim();
}
