import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function freeze(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_, entry) =>
      typeof entry === "bigint" ? `0x${(entry as bigint).toString(16)}` : entry,
    ),
  ) as Json;
}

const DOCK_WAIT_MS = 700_000;
const RIDE_WAIT_MS = 900_000;
const SETTLE_MS = 30_000;
const POLL_MS = 1000;
const SIGHT_WAIT_MS = 30_000;

type Xyz = { x: number; y: number; z: number };

const NEAR_DOCK_YD = 25;
const FAR_DOCK_YD = 500;

async function waitDocked(
  handle: WorldHandle,
  guid: bigint,
  ok: (at: Xyz) => boolean,
  ms: number,
): Promise<Xyz | undefined> {
  const deadline = Date.now() + ms;
  for (;;) {
    const at = handle.transports.act.poseAt(guid);
    if (at && !at.moving && ok(at)) return { x: at.x, y: at.y, z: at.z };
    if (Date.now() >= deadline) return undefined;
    await Bun.sleep(POLL_MS);
  }
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const wanted = Number(args["entry"]);
  if (!Number.isInteger(wanted) || wanted <= 0)
    throw new Error("transports-ride needs entry=<transport entry>.");
  const lookup = () =>
    [...handle.transports.state().transports.values()].find(
      (transport) => transport.entry === wanted,
    );
  const sightDeadline = Date.now() + SIGHT_WAIT_MS;
  while (!lookup() && Date.now() < sightDeadline) await Bun.sleep(POLL_MS);
  const found = lookup();
  if (!found) {
    const seen = [...handle.transports.state().transports.values()].map(
      (transport) => transport.entry,
    );
    throw new Error(
      `transports-ride sees no transport ${wanted}; in view: ${seen.join(",")}.`,
    );
  }
  const guid = found.guid;
  const entry = found.entry;
  const from = handle.getControlState().pose;
  if (!from) throw new Error("transports-ride has no pose.");
  const near = (at: Xyz) =>
    Math.hypot(at.x - from.x, at.y - from.y) < NEAR_DOCK_YD;
  const dock = await waitDocked(handle, guid, near, DOCK_WAIT_MS);
  if (!dock)
    throw new Error("transports-ride found no docked pose near the character.");
  const board = await handle.transports.act.board(guid);
  if (board.status !== "ok") return freeze({ board, dock, entry });
  const far = (at: Xyz) =>
    Math.hypot(at.x - dock.x, at.y - dock.y) > FAR_DOCK_YD;
  const arrival = await waitDocked(handle, guid, far, RIDE_WAIT_MS);
  const pose = handle.getControlState().pose;
  const leave = await handle.transports.act.leave();
  await Bun.sleep(SETTLE_MS);
  return freeze({
    arrival,
    board,
    dock,
    entry,
    leave,
    pose: pose ? { mapId: pose.mapId, x: pose.x, y: pose.y, z: pose.z } : null,
  });
}

export const flow: ProbeFlow = {
  name: "transports-ride",
  run,
  usage:
    "--flow transports-ride --arg entry=<transport entry>: stand where the character is, wait for the transport to dock within 25 yd, board it, ride to a dock more than 500 yd away, leave and report the pose.",
};
