import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const USAGE =
  "vehicles-ride-with needs mount=<spell> and partner=<name>: cast the mount, invite the partner, wait for their ride, then eject them.";

function argOf(args: FlowContext["args"], name: string): string {
  const raw = args[name];
  if (!raw) throw new Error(`${USAGE} not ${name}="${raw}".`);
  return raw;
}

function spellOf(args: FlowContext["args"]): number {
  const raw = argOf(args, "mount");
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${USAGE} not mount="${raw}".`);
  return value;
}

type Outcome = { status: string; reason?: string };

function describe(outcome: Outcome): string {
  return outcome.reason ?? outcome.status;
}

const PASSENGER_WAITS = 6;

async function waitForPassenger(
  handle: FlowContext["handle"],
  settle: FlowContext["settle"],
  partner: string,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < PASSENGER_WAITS; attempt++) {
    const found = await settle(() => {
      const rows = [...handle.queryNearby()];
      const row = rows.find(
        (nearby) => nearby.entity.name === partner && !nearby.self,
      );
      if (row === undefined) return;
      const passenger = handle.vehicles.state().passengers.get(row.entity.guid);
      if (passenger === undefined) return;
      const self = rows.find((nearby) => nearby.self);
      if (self === undefined) return;
      if (passenger.transportGuid !== self.entity.guid) return;
      return `0x${row.entity.guid.toString(16)}`;
    });
    if (found !== undefined) return found;
  }
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const partner = argOf(args, "partner");
  const events: string[] = [];
  const off = handle.vehicles.onEvent((event) => events.push(event.type));
  try {
    handle.cast(spell, 0n);
    const mounted = await settle(() => {
      if (!handle.selfstate.state().mounted) return;
      return true;
    });
    if (!mounted)
      throw new Error(`vehicles-ride-with never mounted spell ${spell}.`);
    const self = handle.queryNearby().find((row) => row.self);
    if (!self) throw new Error("vehicles-ride-with found no self row.");
    const vehicle = `0x${self.entity.guid.toString(16)}`;
    handle.invite(partner);
    const boarded = await waitForPassenger(handle, settle, partner);
    const holds = Number(args["hold"] ?? 0);
    for (let wait = 0; wait < holds; wait++) await settle(() => undefined);
    const eject =
      boarded === undefined
        ? null
        : describe(await handle.vehicles.act.ejectPassenger(BigInt(boarded)));
    return { boarded: boarded ?? null, eject, events, partner, vehicle };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "vehicles-ride-with",
  run,
  usage:
    "--flow vehicles-ride-with --arg mount=<spell> --arg partner=<name> [--arg hold=<n>]: cast the mount, invite the partner to ride as passenger, report who boarded, wait hold settle periods so the partner can change seats, then eject them with the ejectPassenger act.",
};
