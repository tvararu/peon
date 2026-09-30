import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const WAIT_MS = 8000;
const USAGE =
  "vehicles-mount needs spell=<id>: cast the mount, wait, then cancel its aura.";

function spellOf(args: FlowContext["args"]): number {
  const raw = args["spell"];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${USAGE} not spell="${raw}".`);
  return value;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const seen: string[] = [];
  const off = handle.vehicles.onEvent((event) => {
    seen.push(event.type);
  });
  try {
    handle.cast(spell, 0n);
    await Bun.sleep(WAIT_MS);
    handle.spells.act.cancelAura(spell);
    await settle(() => (seen.includes("ride_aura_cancel") ? true : undefined));
    return { events: seen, spell };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "vehicles-mount",
  run,
  usage:
    "--flow vehicles-mount --arg spell=<id>: cast the mount spell on the character, wait 8 s, cancel its aura, and report the vehicles events seen.",
};
