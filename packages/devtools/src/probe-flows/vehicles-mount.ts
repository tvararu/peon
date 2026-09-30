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
  let dismounted = false;
  const off = handle.vehicles.onEvent((event) => {
    seen.push(event.type);
    if (event.type !== "player_vehicle" || event.vehicleId !== 0) return;
    const self = handle.queryNearby().find((row) => row.self);
    if (self && event.guid === self.entity.guid) dismounted = true;
  });
  try {
    await settle(() => undefined);
    handle.cast(spell, 0n);
    await Bun.sleep(WAIT_MS);
    const cancel = handle.spells.act.cancelAura(spell);
    if (!cancel.ok)
      throw new Error(`vehicles-mount cancelAura refused: ${cancel.reason}.`);
    dismounted = false;
    const found = await settle(() => (dismounted ? true : undefined));
    if (!found)
      throw new Error(
        `vehicles-mount saw no dismount after cancelling ${spell}.`,
      );
    return { dismounted: true, events: seen, spell };
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
