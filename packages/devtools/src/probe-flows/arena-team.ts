import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

type Attempt = { result: Json } | { error: string };

async function attempt(action: () => Promise<unknown>): Promise<Attempt> {
  try {
    return { result: json(await action()) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function run(ctx: FlowContext) {
  const handle: WorldHandle = ctx.handle;
  const id = Number(ctx.args["team"] ?? Number.NaN);
  if (!Number.isInteger(id))
    throw new Error("arena-team needs team=<id>, not empty.");
  const self = handle.getControlState().selfGuid;
  return json({
    id,
    inspect: await attempt(() => handle.arena.act.inspect(self ?? 0n)),
    query: await attempt(() => handle.arena.act.query(id)),
    refresh: await attempt(() => handle.arena.act.refresh()),
    roster: await attempt(() => handle.arena.act.roster(id)),
  });
}

export const flow: ProbeFlow = {
  name: "arena-team",
  run,
  usage:
    "--flow arena-team --arg team=<id>: refresh the arena teams, then query, roster and inspect that team. The team id comes from the staged team (soap gm arena-create); inspect uses the logged-in character.",
};
