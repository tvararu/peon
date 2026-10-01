import type { AreaState, QuestLogSlot, QuestState } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function loggedIds(log: QuestState["log"]): Set<number> {
  const ids = new Set<number>();
  for (const slot of log.slots as readonly QuestLogSlot[]) {
    const id = slot.questId;
    if (id !== undefined && id > 0) ids.add(id);
  }
  return ids;
}

function questTitle(state: QuestState, questId: number): string {
  const query = state.queries.find(
    (candidate) => candidate.questId === questId,
  );
  return query?.status === "known" ? query.data.title : `quest ${questId}`;
}

function doneTodayLines(state: QuestState, daily: readonly number[]): string[] {
  const logged = loggedIds(state.log);
  return daily
    .filter((questId) => !logged.has(questId))
    .map((questId) => `#${questId} ${questTitle(state, questId)}: done today.`);
}

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
    const state = handle.getQuestState();
    return { counts: seen, daily, lines: doneTodayLines(state, daily) };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "quests-daily",
  run,
  usage:
    "--flow quests-daily: wait for the first daily-quest field read and print the daily ids, the done-today lines of the journal for those ids, and the counts of every daily event seen.",
};
