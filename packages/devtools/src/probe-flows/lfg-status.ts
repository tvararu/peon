import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle }: FlowContext): Promise<Json> {
  const status = json(await handle.lfg.act.requestStatus());
  const dungeons = json(await handle.lfg.act.requestDungeons());
  return json({
    dungeons,
    state: handle.lfg.state(),
    status,
  });
}

export const flow: ProbeFlow = {
  name: "lfg-status",
  run,
  usage:
    "--flow lfg-status: request the dungeon finder status and lock info, then report available dungeons and locks.",
};
