import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function freeze(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_, entry) =>
      typeof entry === "bigint" ? `0x${(entry as bigint).toString(16)}` : entry,
    ),
  ) as Json;
}

const DOCK_WAIT_MS = 300_000;
const RIDE_WAIT_MS = 900_000;
const SETTLE_MS = 30_000;
const POLL_MS = 1000;

async function dockedAt(
  handle: WorldHandle,
  guid: bigint,
): Promise<{ x: number; y: number; z: number } | undefined> {
  const deadline = Date.now() + DOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const at = handle.transports.act.poseAt(guid);
    if (at && !at.moving) return { x: at.x, y: at.y, z: at.z };
    await Bun.sleep(Math.min(POLL_MS, deadline - Date.now()));
  }
  const at = handle.transports.act.poseAt(guid);
  if (at && !at.moving) return { x: at.x, y: at.y, z: at.z };
  return undefined;
}

async function waitRide(handle: WorldHandle): Promise<void> {
  const deadline = Date.now() + RIDE_WAIT_MS;
  while (Date.now() < deadline) {
    const state = handle.getControlState();
    if (state.blockedReason === "transport") return;
    await Bun.sleep(Math.min(POLL_MS, deadline - Date.now()));
  }
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const raw = args["transport"];
  const guid = raw === undefined ? undefined : BigInt(raw);
  if (guid === undefined)
    throw new Error("transports-ride needs transport=<guid>.");
  const seen = handle.transports.state().transports;
  const entry = seen.get(guid)?.entry ?? null;
  const dock = await dockedAt(handle, guid);
  if (!dock) throw new Error("transports-ride found no docked pose in time.");
  const walked = await handle.walkTowardPoint(dock, 3);
  const board = await handle.transports.act.board(guid);
  if (board.status !== "ok") return freeze({ board, dock, entry, walked });
  await waitRide(handle);
  const pose = handle.getControlState().pose;
  const leave = await handle.transports.act.leave();
  await Bun.sleep(SETTLE_MS);
  return freeze({
    board,
    dock,
    entry,
    leave,
    pose: pose ? { mapId: pose.mapId, x: pose.x, y: pose.y, z: pose.z } : null,
    walked,
  });
}

export const flow: ProbeFlow = {
  name: "transports-ride",
  run,
  usage:
    "--flow transports-ride --arg transport=<guid>: wait for the transport to dock, walk to the dock, board it, ride until still, then leave and report the pose.",
};
