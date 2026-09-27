import type { QuestDialog } from "@tuicraft/core";
import type {
  InteractAfter,
  QuestOffer,
  RewardChoice,
} from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { nextCall, result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  findOffer,
  type InteractStep,
  moneyChange,
  type NpcTarget,
  offersOf,
  openDialog,
  pickRefusal,
  questStep,
  type StepInit,
  shortMoney,
  unanswered,
} from "#harness/tools/interact-quest";

async function rewardOffer(
  ctx: ToolCtx<InteractAfter>,
  questId: number,
): Promise<QuestDialog | undefined> {
  const open = ctx.handle.getQuestState().dialog;
  const pending =
    open?.kind === "requestItems" && open.data.questId === questId;
  const shown =
    pending ||
    (await questStep(ctx, {
      match: (event) =>
        event.type === "dialog" &&
        ["offer", "requestItems"].includes(event.state.dialog?.kind ?? ""),
      packet: () => ctx.handle.completeQuest(questId),
    }));
  if (!shown) return;
  if (ctx.handle.getQuestState().dialog?.kind === "requestItems")
    await questStep(ctx, {
      match: (event) =>
        event.type === "dialog" && event.state.dialog?.kind === "offer",
      packet: () => ctx.handle.requestQuestReward(),
    });
  return ctx.handle.getQuestState().dialog;
}

function choicesOf(
  dialog: Extract<QuestDialog, { kind: "offer" }>,
): RewardChoice[] {
  return dialog.data.rewards.choices.map((choice, index) => ({
    count: choice.count,
    index: index + 1,
    name: `item ${choice.itemId}`,
  }));
}

function turnInOffer(
  init: StepInit,
  dialog: QuestDialog | undefined,
): QuestOffer {
  const { args, ctx, npc } = init;
  const offers = offersOf(dialog, ctx.handle.getQuestState()).filter(
    (known) => known.state !== "available",
  );
  const offer = findOffer(offers, args.what);
  if (!offer) throw pickRefusal(npc, offers, "turn_in");
  if (offer.state === "incomplete")
    throw new Refusal({
      detail: `${offer.title} #${offer.id} is not complete yet.`,
      next: nextCall("journal", { about: "quests" }),
      reason: "not_complete",
    });
  return offer;
}

function rewardRefusal(
  npc: NpcTarget,
  offer: QuestOffer,
  choices: readonly RewardChoice[],
  asked: number | undefined,
): Refusal {
  const wrong =
    asked === undefined
      ? ""
      : `reward ${asked} is not one of the ${choices.length} choices; `;
  return new Refusal({
    body: choices.map(
      (choice) => `${choice.index}. ${choice.name} x${choice.count}`,
    ),
    detail: `${wrong}pick a reward for ${offer.title}.`,
    next: nextCall("interact", {
      do: "turn_in",
      npc: npc.unit.ref,
      reward: 1,
      what: String(offer.line),
    }),
    options: choices,
    reason: "reward_needed",
  });
}

export const turnInStep: InteractStep = async (init) => {
  const { args, ctx, npc } = init;
  const offer = turnInOffer(init, await openDialog(ctx, npc));
  const retry = nextCall("interact", {
    do: "turn_in",
    npc: npc.unit.ref,
    what: String(offer.line),
  });
  const reward = await rewardOffer(ctx, offer.id);
  if (reward?.kind !== "offer")
    throw unanswered(npc, `with the reward of ${offer.title}`, retry);
  const rewardChoices = choicesOf(reward);
  const picking = rewardChoices.length > 1;
  if (
    picking &&
    (args.reward === undefined || args.reward > rewardChoices.length)
  )
    throw rewardRefusal(npc, offer, rewardChoices, args.reward);
  const before = ctx.handle.getInventoryState().coinage;
  const rewarded = await questStep(ctx, {
    match: (event) => event.type === "rewarded" && event.questId === offer.id,
    packet: () =>
      ctx.handle.chooseQuestReward(picking ? (args.reward ?? 1) - 1 : 0),
    timeoutMs: ANSWER_MS,
  });
  if (!rewarded) throw unanswered(npc, `the turn-in of ${offer.title}`, retry);
  const money = moneyChange(ctx, before);
  const gain =
    money && money.after > money.before
      ? ` Money +${shortMoney(money.after - money.before)}.`
      : "";
  return result("DONE", {
    after: {
      ...baseAfter(ctx, npc, "turn_in"),
      dialogOpened: true,
      money,
      offers: [offer],
      rewardChoices,
    },
    detail: `turned in ${offer.title} #${offer.id}.${gain}`,
  });
};
