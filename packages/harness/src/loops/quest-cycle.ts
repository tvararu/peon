import type { QuestEvent, QuestQueryResponse, WorldHandle } from "@peon/core";
import type { CycleObjective, CycleVisit } from "#harness/loops/cycle-types";
import { visitObject } from "#harness/loops/quest-cycle-object";
import {
  objectiveProgress,
  pickObjectiveTarget,
  questObjective,
} from "#harness/loops/quest-objective";

const QUERY_TIMEOUT_MS = 5000;
export const OBJECT_COMPLETE_WAIT_MS = 3000;

function completeNow(handle: WorldHandle, questId: number): boolean {
  const progress = objectiveProgress(
    { chests: [], items: [], kills: [], objects: [], questId, sources: [] },
    handle.getQuestState().log,
  );
  return !("ok" in progress) && progress.complete;
}

const COMPLETE_EVENTS: ReadonlySet<QuestEvent["type"]> = new Set([
  "log",
  "progress",
  "completed",
]);

export function awaitQuestComplete(
  handle: WorldHandle,
  questId: number,
  run: Pick<CycleVisit, "signal">,
  waitMs = OBJECT_COMPLETE_WAIT_MS,
): Promise<boolean> {
  if (completeNow(handle, questId)) return Promise.resolve(true);
  run.signal.throwIfAborted();
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const finish = (done: boolean) => {
    clearTimeout(timer);
    off();
    run.signal.removeEventListener("abort", onAbort);
    resolve(done);
  };
  const onAbort = () => finish(false);
  const off = handle.onQuestEvent((event: QuestEvent) => {
    if (COMPLETE_EVENTS.has(event.type) && completeNow(handle, questId))
      finish(true);
  });
  const timer = setTimeout(() => finish(false), waitMs);
  run.signal.addEventListener("abort", onAbort, { once: true });
  return promise;
}

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
  const carried = (itemId: number) =>
    handle.getQuestState().items.find((item) => item.itemId === itemId)
      ?.carried;
  const cycle: CycleObjective = {
    pick: (tried) =>
      pickObjectiveTarget({
        objective,
        carried,
        log: log(),
        entities: handle.getNearbyEntities(),
        self: handle.getControlState().pose,
        tried,
      }),
    progress: () => {
      const progress = objectiveProgress(objective, log(), carried);
      return "ok" in progress ? undefined : progress;
    },
    visit: visitObject(handle),
    awaitComplete: (run) => awaitQuestComplete(handle, questId, run),
  };
  return { objective: cycle, defaultMaxStarts: required * 2 };
}
