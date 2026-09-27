import { type QuestState, questSlotStatus } from "@tuicraft/core";
import type { ViewCtx } from "#harness/contract/services";
import { unitViews } from "#harness/ops/views";
import { nextCall } from "#harness/tools/next-call";

type Accepted = { detail: string; next: string };

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

function objectivesOf(state: QuestState, questId: number): string {
  const query = state.queries.find((known) => known.questId === questId);
  if (query?.status === "known" && query.data.objectives.trim() !== "")
    return query.data.objectives.trim();
  const dialog = state.dialog;
  if (dialog?.kind === "details" && dialog.data.questId === questId)
    return dialog.data.objectives.trim();
  return "";
}

export function acceptedNext(
  ctx: ViewCtx,
  offer: { id: number; title: string },
): Accepted {
  const accepted = `accepted ${offer.title} #${offer.id}.`;
  const state = ctx.handle.getQuestState();
  if (counted(state, offer.id) !== false)
    return {
      detail: accepted,
      next: nextCall("engage", { quest: String(offer.id) }),
    };
  const goal = objectivesOf(state, offer.id);
  const named = unitViews(ctx).find(
    (unit) => unit.alive && goal.includes(unit.name),
  );
  const said = goal === "" ? "." : `: ${goal}`;
  return {
    detail: `${accepted} It has nothing to kill or collect${said}`,
    next: named
      ? nextCall("interact", { do: "turn_in", npc: named.ref })
      : nextCall("look", { find: "questgiver" }),
  };
}
