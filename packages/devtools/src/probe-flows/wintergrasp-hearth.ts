import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

async function run({ handle }: FlowContext): Promise<Json> {
  const before = handle.wintergrasp.state();
  try {
    const result = await handle.wintergrasp.act.hearthAndResurrect();
    return JSON.parse(JSON.stringify({ before, result }));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const flow: ProbeFlow = {
  name: "wintergrasp-hearth",
  run,
  usage:
    "--flow wintergrasp-hearth: send CMSG_HEARTH_AND_RESURRECT from Wintergrasp (stage there first) and wait for the teleport. Check the end position with a truth read.",
};
