import type { AreaEventOf, QuestDialog, QuestEvent } from "@peon/core";
import { pause } from "@peon/core/lib/abort";
import { standingLine, standingRow } from "#harness/areas/reputation/area";
import type {
  InteractAfter,
  QuestOffer,
  StandingChange,
} from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import {
  completeQuestIds,
  questTitle,
  turnInTarget,
} from "#harness/ops/quest-memory";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  findOffer,
  type InteractStep,
  type NpcTarget,
  npcLabel,
  offersOf,
  openDialog,
  pickRefusal,
  questStep,
  type StepInit,
  unanswered,
} from "#harness/tools/interact-quest";
import {
  choiceLine,
  choicesOf,
  type NamedChoice,
  nameRewards,
  rewardText,
} from "#harness/tools/interact-reward-text";
import { nextCall } from "#harness/tools/next-call";

const REPUTATION_WAIT_MS = 500;

type Standing = Extract<
  AreaEventOf<"reputation">,
  { type: "standing_changed" }
>;

async function collectStandings(
  ctx: ToolCtx<InteractAfter>,
  seen: Standing[],
): Promise<void> {
  ctx.signal.throwIfAborted();
  const stop = ctx.handle.onAreaEvent((row) => {
    if (row.area === "reputation" && row.event.type === "standing_changed")
      seen.push(row.event);
  });
  try {
    await pause(REPUTATION_WAIT_MS, ctx.signal);
  } finally {
    stop();
  }
}

function reputationText(seen: readonly Standing[]): string {
  if (seen.length === 0) return "";
  const changes: StandingChange[] = seen.map((event) => ({
    after: event.after,
    before: event.before,
    name: event.name ?? `Faction ${event.repListId}`,
  }));
  return ` Reputation: ${changes.map((row) => standingLine(row)).join("; ")}.`;
}

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

function notEnder(init: StepInit): Refusal | undefined {
  const { ctx, npc } = init;
  const [questId] = completeQuestIds(ctx.handle.getQuestState());
  if (questId === undefined) return;
  const target = turnInTarget(ctx, questId);
  const other = target && target !== npc.unit.name ? target : undefined;
  const title = questTitle(ctx, questId);
  const where = other ? ` Turn in to ${other}.` : "";
  return new Refusal({
    detail: `${npcLabel(npc)} has no quest you can turn in now. This NPC is not the ender of ${title} #${questId}.${where}`,
    next: other
      ? nextCall("interact", { npc: other })
      : nextCall("look", { find: "questgiver" }),
    reason: "no_offer",
  });
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
  if (!offer)
    throw (
      (offers.length === 0 ? notEnder(init) : undefined) ??
      pickRefusal(npc, offers, "turn_in")
    );
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
  choices: readonly NamedChoice[],
  asked: number | undefined,
): Refusal {
  const wrong =
    asked === undefined
      ? ""
      : `reward ${asked} is not one of the ${choices.length} choices; `;
  return new Refusal({
    body: choices.map(choiceLine),
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
  const check = nextCall("journal", { about: "quests" });
  const reward = await rewardOffer(ctx, offer.id);
  if (reward?.kind !== "offer")
    throw unanswered(npc, `with the reward of ${offer.title}`, check);
  await nameRewards(ctx.handle, reward, ctx.signal);
  const named = choicesOf(ctx.handle, reward);
  const picking = named.length > 1;
  if (picking && (args.reward === undefined || args.reward > named.length))
    throw rewardRefusal(npc, offer, named, args.reward);
  const picked = picking ? (args.reward ?? 1) - 1 : 0;
  const before = ctx.handle.getInventoryState().coinage;
  const seen: Standing[] = [];
  const stop = ctx.handle.onAreaEvent((row) => {
    if (row.area === "reputation" && row.event.type === "standing_changed")
      seen.push(row.event);
  });
  let rewarded: QuestEvent | undefined;
  try {
    rewarded = await questStep(ctx, {
      match: (event) => event.type === "rewarded" && event.questId === offer.id,
      packet: () => ctx.handle.chooseQuestReward(picked),
      timeoutMs: ANSWER_MS,
    });
    if (rewarded) await collectStandings(ctx, seen);
  } finally {
    stop();
  }
  if (!rewarded) throw unanswered(npc, `the turn-in of ${offer.title}`, check);
  const last = rewarded.state.lastReward;
  const got = last?.questId === offer.id ? last : undefined;
  const money =
    got && before !== undefined
      ? { after: before + got.money, before }
      : undefined;
  const rewardChoices = named.map(({ kind: _kind, ...choice }) => choice);
  const reputation = seen.map(standingRow);
  return result("DONE", {
    after: {
      ...baseAfter(ctx, npc, "turn_in"),
      dialogOpened: true,
      money,
      offers: [offer],
      reputation,
      rewardChoices,
    },
    detail: `turned in ${offer.title} #${offer.id}.${rewardText({ handle: ctx.handle, offer: reward, picked, reward: got })}${reputationText(seen)}`,
  });
};
