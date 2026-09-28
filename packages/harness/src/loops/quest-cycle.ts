import type { QuestQueryResponse, WorldHandle } from "@peon/core";
import type { CycleObjective } from "#harness/loops/encounter-cycle";
import { visitObject } from "#harness/loops/quest-cycle-object";
import {
  objectiveProgress,
  pickObjectiveTarget,
  questObjective,
} from "#harness/loops/quest-objective";

const QUERY_TIMEOUT_MS = 5000;

function knownQuery(
  handle: WorldHandle,
  questId: number,
): QuestQueryResponse | undefined {
  const query = handle
    .getQuestState()
    .queries.find((entry) => entry.questId === questId);
  return query?.status === "known" ? query.data : undefined;
}

async function questQuery(
  handle: WorldHandle,
  questId: number,
): Promise<QuestQueryResponse> {
  const known = knownQuery(handle, questId);
  if (known) return known;
  const { promise, resolve, reject } =
    Promise.withResolvers<QuestQueryResponse>();
  const timer = setTimeout(
    () => reject(new Error("quest_query_unanswered")),
    QUERY_TIMEOUT_MS,
  );
  const off = handle.onQuestEvent((event) => {
    const data = knownQuery(handle, questId);
    if (event.type === "query" && data) resolve(data);
  });
  try {
    handle.queryQuest(questId);
    return await promise;
  } finally {
    clearTimeout(timer);
    off();
  }
}

export async function questCycleObjective(
  handle: WorldHandle,
  questId: number,
  sources: readonly number[],
): Promise<{ objective: CycleObjective; defaultMaxStarts: number }> {
  const log = () => handle.getQuestState().log;
  if (!log().slots.some((slot) => slot.questId === questId))
    throw new Error("quest_not_in_log");
  const objective = questObjective(
    await questQuery(handle, questId),
    sources,
    handle.objects.state().templates,
  );
  if ("ok" in objective) throw new Error(objective.cause);
  const required = [
    ...objective.kills,
    ...objective.objects,
    ...objective.items,
  ].reduce((sum, entry) => sum + entry.required, 0);
  const cycle: CycleObjective = {
    pick: (tried) =>
      pickObjectiveTarget({
        objective,
        log: log(),
        entities: handle.getNearbyEntities(),
        self: handle.getControlState().pose,
        tried,
      }),
    progress: () => {
      const progress = objectiveProgress(objective, log());
      return "ok" in progress ? undefined : progress;
    },
    visit: visitObject(handle),
  };
  return { objective: cycle, defaultMaxStarts: required * 2 };
}
