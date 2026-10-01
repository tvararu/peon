import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const DEFAULT_ENTRY = 25_334;
const DRIVE_YARDS = 10;

const USAGE =
  "vehicles-drive takes entry=<id> (default 25334), yards=<n> (default 10, at most 20) and seat=<n> (optional).";

type Outcome = { status: string; reason?: string };

function describe(outcome: Outcome): string {
  return outcome.reason ?? outcome.status;
}

function numberArg(
  args: FlowContext["args"],
  name: string,
  fallback: number,
): number {
  const raw = args[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (name === "yards" && value > 20))
    throw new Error(`${USAGE} not ${name}="${raw}".`);
  return value;
}

async function driveAhead(
  handle: FlowContext["handle"],
  yards: number,
): Promise<{ traveled: number; reason: string | null }> {
  const start = handle.getControlState().pose;
  if (!start) return { reason: "no_pose", traveled: 0 };
  const walked = await handle.walkTowardPoint(
    {
      x: start.x + Math.cos(start.orientation) * yards,
      y: start.y + Math.sin(start.orientation) * yards,
      z: start.z,
    },
    yards,
  );
  return { reason: walked.reason ?? null, traveled: walked.traveled };
}

async function changeSeatStep(
  handle: FlowContext["handle"],
  args: FlowContext["args"],
): Promise<string | null> {
  if (args["seat"] === undefined) return null;
  const outcome = await handle.vehicles.act.changeSeatOnControlled(
    0n,
    numberArg(args, "seat", 1),
  );
  return describe(outcome);
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const entry = numberArg(args, "entry", DEFAULT_ENTRY);
  const yards = numberArg(args, "yards", DRIVE_YARDS);
  const found = await settle(() =>
    handle.queryNearby().find((row) => !row.self && row.entity.entry === entry),
  );
  if (!found)
    throw new Error(`vehicles-drive found no unit of entry ${entry}.`);
  const guid = found.entity.guid;
  const events: string[] = [];
  const off = handle.vehicles.onEvent((event) => events.push(event.type));
  try {
    const board = await handle.vehicles.act.spellClick(guid);
    if (board.status !== "ok")
      return {
        board: describe(board),
        controlled: false,
        entry,
        events,
        exit: null,
        guid: `0x${guid.toString(16)}`,
      };
    const controlled = await settle(() =>
      handle.vehicles.state().seat?.controlling ? true : undefined,
    );
    const drive =
      controlled === true
        ? await driveAhead(handle, yards)
        : { reason: null, traveled: 0 };
    const changeSeat =
      controlled === true ? await changeSeatStep(handle, args) : null;
    const mover = handle.getControlState().mover;
    const exit = describe(await handle.vehicles.act.exitVehicle());
    await settle(() => undefined);
    const after = handle.getControlState();
    return {
      board: describe(board),
      changeSeat,
      controlled: controlled === true,
      entry,
      events,
      exit,
      guid: `0x${guid.toString(16)}`,
      mover: mover === undefined ? null : `0x${mover.toString(16)}`,
      moverAfter:
        after.mover === undefined ? null : `0x${after.mover.toString(16)}`,
      stopReason: drive.reason,
      traveled: drive.traveled,
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "vehicles-drive",
  run,
  usage:
    "--flow vehicles-drive --arg entry=<id> --arg yards=<n> --arg seat=<n>: click the nearest unit of that entry, wait for control of the vehicle, walk the given yards along its facing, optionally ask for the next seat with changeSeatOnControlled, then dismiss it with the exitVehicle act.",
};
