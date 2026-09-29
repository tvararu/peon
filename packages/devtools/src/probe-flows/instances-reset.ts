import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

async function run({ handle, args }: FlowContext): Promise<Json> {
  const action = args["do"];
  if (action === "reset") {
    const outcome = await handle.instances.act.resetInstances();
    return outcome.status === "ok"
      ? { ...outcome, failed: [...outcome.failed], reset: [...outcome.reset] }
      : outcome;
  }
  if (action === "difficulty") {
    const kind = args["kind"];
    const value = Number(args["value"]);
    if (kind !== "dungeon" && kind !== "raid")
      throw new Error("--arg kind=dungeon|raid is required");
    if (args["value"] === undefined || Number.isNaN(value))
      throw new Error("--arg value=<number> is required");
    return await handle.instances.act.setDifficulty({ kind, value });
  }
  throw new Error("--arg do=reset|difficulty is required");
}

export const flow: ProbeFlow = {
  name: "instances-reset",
  run,
  usage:
    "--flow instances-reset --arg do=reset: send CMSG_RESET_INSTANCES and print the maps reset or failed within 2 s; --arg do=difficulty --arg kind=dungeon|raid --arg value=<mode>: ask for a difficulty and print the echo's verdict.",
};
