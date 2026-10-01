import {
  type QuestLogSlot,
  type QuestQuery,
  type QuestState,
  questSlotStatus,
} from "@peon/core";
import { questRegion } from "#harness/areas/quests/reads";
import { dailyResetLine } from "#harness/areas/reputation/journal";
import type { JournalAfter, QuestLine } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { questGoal, questTitle } from "#harness/ops/quest-memory";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];
type LoggedSlot = QuestLogSlot & { questId: number };
type Ctx = ToolCtx<JournalAfter>;

const STOP = /[.!?]$/;
const QUEST_STATUS = {
  complete: "complete",
  failed: "failed",
  "in progress": "incomplete",
} as const;

function knownQuest(
  state: QuestState,
  questId: number,
): KnownQuest | undefined {
  const query = state.queries.find(
    (candidate) => candidate.questId === questId,
  );
  return query?.status === "known" ? query.data : undefined;
}

function killObjectives(
  slot: LoggedSlot,
  quest: KnownQuest | undefined,
): QuestLine["objectives"] {
  if (!quest) return [];
  return quest.targets.flatMap((target, index) => {
    if (target.count === 0) return [];
    const text = quest.objectiveTexts[index] || `objective ${index + 1}`;
    return [{ count: slot.counters[index] ?? 0, required: target.count, text }];
  });
}

function itemObjectives(
  state: QuestState,
  questId: number,
): QuestLine["objectives"] {
  const items = state.items.filter((item) => item.questId === questId);
  return items.map((item) => ({
    count: item.carried ?? 0,
    required: item.required,
    text: `item ${item.itemId}`,
  }));
}

type ShownQuest = QuestLine & { goal: string };

function questLine(ctx: Ctx, state: QuestState, slot: LoggedSlot): ShownQuest {
  const quest = knownQuest(state, slot.questId);
  const goal = questGoal(ctx, slot.questId);
  const status = QUEST_STATUS[questSlotStatus(slot)];
  const shown = {
    goal: goal.objectives.replace(STOP, ""),
    id: slot.questId,
    level: quest?.level,
    objectives: [
      ...killObjectives(slot, quest),
      ...itemObjectives(state, slot.questId),
    ],
    status,
    title: questTitle(ctx, slot.questId),
    turnIn: goal.ender,
  };
  const pose = ctx.handle.getControlState().pose ?? undefined;
  return {
    ...shown,
    region: questRegion(
      { id: shown.id, status },
      ctx.handle.quests.state().pois,
      pose,
    ),
  };
}

function turnInText(status: QuestLine["status"], turnIn: string | undefined) {
  if (turnIn) return ` Turn in to ${turnIn}.`;
  return status === "complete"
    ? ` Turn in to the NPC named in the goal; try ${nextCall("look", { find: "questgiver" })}.`
    : "";
}

function questText({
  goal,
  id,
  level,
  objectives,
  region,
  status,
  title,
  turnIn,
}: ShownQuest): string {
  const levelText = level ? ` (L${level})` : "";
  const counts = objectives
    .map((item) => `${item.text} ${item.count}/${item.required}`)
    .join(", ");
  const empty = status === "complete" ? "" : "no counted objectives";
  const goals = counts || goal || empty;
  const shown = goals === "" ? `${status}.` : `${goals}; ${status}.`;
  let where = "";
  if (region !== undefined)
    where = "none" in region ? " no map region." : ` ${region.label}.`;
  return `#${id} ${title}${levelText}: ${shown}${turnInText(status, turnIn)}${where}`;
}

export function questsResult({ handle, rt }: Ctx): ToolResult<JournalAfter> {
  const state = handle.getQuestState();
  const logged = state.log.slots.filter(
    (slot): slot is LoggedSlot =>
      slot.questId !== undefined && slot.questId > 0,
  );
  const loggedIds = new Set(logged.map((slot) => slot.questId));
  const shown = logged.map((slot) =>
    questLine({ handle, rt } as Ctx, state, slot),
  );
  const quests = shown.map(({ goal: _goal, ...line }) => line);
  const first = shown.find(
    (line) => line.region !== undefined && !("none" in line.region),
  );
  const to =
    first?.region && "to" in first.region ? first.region.to : undefined;
  const reset = dailyResetLine(handle.time.state(), rt.clock.now());
  const daily = [...(handle.quests.state().daily ?? [])]
    .filter((questId) => !loggedIds.has(questId))
    .sort((a, b) => a - b)
    .map(
      (questId) =>
        `#${questId} ${questTitle({ handle, rt } as Ctx, questId)}: done today.`,
    );
  const detail = `${quests.length} quests. This is your quest log. To see what an NPC offers, use interact.`;
  return result("DONE", {
    after: { about: "quests", quests },
    body: [
      ...(reset === undefined ? [] : [reset]),
      ...shown.map(questText),
      ...daily,
    ],
    detail,
    next: to === undefined ? undefined : nextCall("travel", { to }),
  });
}
