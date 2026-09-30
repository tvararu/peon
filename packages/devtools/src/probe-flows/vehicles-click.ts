import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const USAGE =
  "vehicles-click needs entry=<id>: find the nearest unit of that entry, click it, then exit.";

function entryOf(args: FlowContext["args"]): number {
  const raw = args["entry"];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${USAGE} not entry="${raw}".`);
  return value;
}

type Outcome = { status: string; reason?: string };

function describe(outcome: Outcome): string {
  return outcome.reason ?? outcome.status;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const entry = entryOf(args);
  const found = handle
    .queryNearby()
    .find((row) => !row.self && row.entity.entry === entry);
  if (!found)
    throw new Error(`vehicles-click found no unit of entry ${entry}.`);
  const guid = found.entity.guid;
  const hex = `0x${guid.toString(16)}`;
  const events: string[] = [];
  const off = handle.vehicles.onEvent((event) => events.push(event.type));
  try {
    const board = await handle.vehicles.act.spellClick(guid);
    const seat = handle.vehicles.state().seat;
    const seated =
      seat !== undefined && seat.vehicle === guid ? seat.seat : null;
    const exit =
      board.status === "ok"
        ? describe(await handle.vehicles.act.exitVehicle())
        : null;
    await settle(() => undefined);
    return {
      board: describe(board),
      entry,
      events,
      exit,
      guid: hex,
      seat: seated,
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "vehicles-click",
  run,
  usage:
    "--flow vehicles-click --arg entry=<id>: click the nearest unit of that entry with the vehicles spellClick act, report the board outcome and the seat, then exit with the exitVehicle act.",
};
