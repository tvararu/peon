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
    const boarded = await settle(() => {
      const passengers = handle.vehicles.state().passengers;
      for (const [guid] of passengers) return `0x${guid.toString(16)}`;
      return;
    });
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
    "--flow vehicles-ride-with --arg mount=<spell> --arg partner=<name>: cast the mount, invite the partner to ride as passenger, report who boarded, then eject them with the ejectPassenger act.",
};
