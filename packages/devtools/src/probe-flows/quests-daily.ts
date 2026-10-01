import type { AreaState } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function dailyIds(daily: AreaState<"quests">["daily"]): number[] {
  return [...(daily ?? [])].sort((a, b) => a - b);
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const quests = handle.quests;
  const seen: number[] = [];
  const off = quests.onEvent((event) => {
    if (event.type === "daily") seen.push(event.count);
  });
  try {
    await settle(() => (quests.state().daily === undefined ? undefined : true));
    const daily = dailyIds(quests.state().daily);
    return { counts: seen, daily };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "quests-daily",
  run,
  usage:
    "--flow quests-daily: wait for the first daily-quest field read and print the daily ids with the counts of every daily event seen.",
};
