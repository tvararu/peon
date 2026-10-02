import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const selfRow = () =>
    handle.queryNearby().find((row) => row.self)?.entity.guid;
  const guid = (await settle(selfRow)) ?? selfRow();
  if (guid === undefined)
    throw new Error("battlegrounds-flag needs the self unit in view.");
  const flagged = await handle.battlegrounds.act.setPvp(true);
  const self = handle.battlegrounds.state().self;
  const inspect = await handle.battlegrounds.act
    .inspectHonor(guid)
    .catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
  const unflagged = await handle.battlegrounds.act.setPvp(false);
  const after = handle.battlegrounds.state().self;
  return json({ after, flagged, guid, inspect, self, unflagged });
}

export const flow: ProbeFlow = {
  name: "battlegrounds-flag",
  run,
  usage:
    "--flow battlegrounds-flag: toggle the PvP flag on, inspect own honor, toggle off; reports the self flag state before and after.",
};
