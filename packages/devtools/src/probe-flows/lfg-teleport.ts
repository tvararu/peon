import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle }: FlowContext): Promise<Json> {
  const teleport = await handle.lfg.act.teleport(false, { force: true });
  return json({ denied: handle.lfg.state().teleportDenied, teleport });
}

export const flow: ProbeFlow = {
  name: "lfg-teleport",
  run,
  usage:
    "--flow lfg-teleport: send CMSG_LFG_TELEPORT in from a character outside an LFG group with the local refusal bypassed, and report the SMSG_LFG_TELEPORT_DENIED code.",
};
