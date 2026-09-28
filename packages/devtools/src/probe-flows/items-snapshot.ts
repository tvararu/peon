import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const complete = () => {
    const state = handle.getInventoryState();
    return state.status === "complete" ? state : undefined;
  };
  return json((await settle(complete)) ?? handle.getInventoryState());
}

export const flow: ProbeFlow = {
  name: "items-snapshot",
  run,
  usage: "--flow items-snapshot: print the carried inventory state as JSON.",
};
