import type { AreaActsOf, QuestDialog } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";

type ResetResult = AreaActsOf<"talents">["resetTalents"] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;

import type { InteractAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import {
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
  openDialog,
  shortMoney,
} from "#harness/tools/interact-quest";
import { nextCall } from "#harness/tools/next-call";

const UNLEARN_PREFIX = "i wish to unlearn my talents";

function unlearnIndex(dialog: QuestDialog | undefined): number | undefined {
  if (dialog?.kind !== "gossip") return undefined;
  return dialog.data.options.find((option) =>
    option.text.trim().toLowerCase().startsWith(UNLEARN_PREFIX),
  )?.optionIndex;
}

function noOffer(npc: NpcTarget): Refusal {
  return new Refusal({
    detail: `${npcLabel(npc)} does not offer a talent reset: it is not a class trainer for a character of level 10 or more.`,
    next: nextCall("look", { find: "class trainer" }),
    reason: "option_not_offered",
  });
}

function stateOf(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
  dialog: QuestDialog | undefined,
  before: number | undefined,
): { after: InteractAfter; change: ReturnType<typeof moneyChange> } {
  const after = {
    ...baseAfter(ctx, npc, "reset_talents"),
    dialogOpened: dialog !== undefined,
    money: moneyChange(ctx, before),
  };
  return { after, change: moneyChange(ctx, before) };
}

function paid(cost: number): string {
  return `Paid ${shortMoney(cost)}.`;
}

function lineOf(outcome: ResetResult): string {
  switch (outcome.outcome) {
    case "reset":
      return `Talents reset. ${outcome.freePoints} ${outcome.freePoints === 1 ? "point" : "points"} free. ${paid(outcome.cost)}`;
    case "too_expensive":
      return `Talent reset costs ${shortMoney(outcome.cost)}. Call again with max_cost ${outcome.cost} to pay.`;
    case "nothing_to_reset":
      return "No talents spent: there is nothing to reset.";
    case "not_enough_money":
      return "The trainer could not reset your talents: not enough money.";
    default:
      return "The trainer said nothing about the reset; the offer may still be open.";
  }
}

export const resetTalentsStep: InteractStep = async ({ args, ctx, npc }) => {
  const dialog = await openDialog(ctx, npc);
  const optionIndex = unlearnIndex(dialog);
  if (optionIndex === undefined) throw noOffer(npc);
  const before = ctx.handle.getInventoryState().coinage;
  const queued = ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await ctx.handle.talents.act.resetTalents({
      maxCost: args.max_cost ?? 0,
      optionIndex,
    });
  });
  queued.then(
    () => undefined,
    () => undefined,
  );
  const outcome = await abortable(queued, ctx.signal);
  const { after, change } = stateOf(ctx, npc, dialog, before);
  const detail = `${lineOf(outcome)}${moneyText(change)}`;
  if (outcome.outcome === "reset")
    return result("DONE", { after, body: [detail], detail });
  if (outcome.outcome === "too_expensive")
    throw new Refusal({
      body: [detail],
      detail,
      next: nextCall("interact", {
        do: "reset_talents",
        max_cost: outcome.cost,
        npc: npc.unit.ref,
      }),
      reason: "too_expensive",
    });
  if (outcome.outcome === "no_reply")
    return result("UNCONFIRMED", {
      after,
      body: [detail],
      detail,
      next: nextCall("interact", {
        do: "reset_talents",
        npc: npc.unit.ref,
        ...(args.max_cost === undefined ? {} : { max_cost: args.max_cost }),
      }),
      reason: "no_reply",
    });
  throw new Refusal({
    body: [detail],
    detail,
    next: nextCall("interact", { do: "reset_talents", npc: npc.unit.ref }),
    reason: outcome.outcome,
  });
};
