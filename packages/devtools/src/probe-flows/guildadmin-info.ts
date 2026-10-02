import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run(ctx: FlowContext) {
  const handle: WorldHandle = ctx.handle;
  const info = await handle.guildadmin.act.info();
  const state = handle.guildadmin.state();
  const disband = await handle.guildadmin.act.disband({ confirm: true });
  return json({ disband, info, state });
}

export const flow: ProbeFlow = {
  name: "guildadmin-info",
  run,
  usage:
    "--flow guildadmin-info: call act.info() on the staged guild, then act.disband({ confirm: true }). The guild name comes from the staged guild (Fac + account id); the flow disbands it, so the run ends guildless.",
};
