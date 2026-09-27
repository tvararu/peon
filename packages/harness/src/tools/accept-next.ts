import { type QuestState, questSlotStatus } from "@tuicraft/core";
import type { ViewCtx } from "#harness/contract/services";
import { enderIn } from "#harness/ops/quest-memory";
import { unitViews } from "#harness/ops/views";
import { nextCall } from "#harness/tools/next-call";

type Accepted = { detail: string; next: string };
type Shown = { giver: string; objectives: string };

const STOP = /[.!?]$/;

function counted(state: QuestState, questId: number): boolean | undefined {
  const query = state.queries.find(
    (known) => known.questId === questId && known.status === "known",
  );
  if (query?.status === "known")
    return (
      query.data.targets.some((target) => target.count > 0) ||
      query.data.requiredItems.some((item) => item.count > 0)
    );
  const slot = state.log.slots.find((known) => known.questId === questId);
  if (slot && questSlotStatus(slot) === "complete") return false;
}

function objectivesOf(
  state: QuestState,
  questId: number,
  shown: string,
): string {
  if (shown.trim() !== "") return shown.trim();
  const query = state.queries.find((known) => known.questId === questId);
  if (query?.status === "known") return query.data.objectives.trim();
  return "";
}

function sentence(text: string): string {
  return STOP.test(text) ? text : `${text}.`;
}

export function acceptedNext(
  ctx: ViewCtx,
  offer: { id: number; title: string },
  shown: Shown,
): Accepted {
  const accepted = `accepted ${offer.title} #${offer.id}.`;
  const state = ctx.handle.getQuestState();
  const goal = objectivesOf(state, offer.id, shown.objectives);
  const ender = enderIn(goal);
  ctx.rt.quests.set(offer.id, {
    ender,
    giver: shown.giver,
    objectives: goal,
    title: offer.title,
  });
  const detail = goal === "" ? accepted : `${accepted} Goal: ${sentence(goal)}`;
  if (counted(state, offer.id) !== false)
    return { detail, next: nextCall("engage", { quest: String(offer.id) }) };
  if (ender) return { detail, next: nextCall("interact", { npc: ender }) };
  const named = unitViews(ctx).find(
    (unit) => unit.alive && goal !== "" && goal.includes(unit.name),
  );
  return {
    detail: `${detail} It has nothing to kill or collect.`,
    next: named
      ? nextCall("interact", { do: "turn_in", npc: named.ref })
      : nextCall("look", { find: "questgiver" }),
  };
}
