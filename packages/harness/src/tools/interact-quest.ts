import {
  type QuestDialog,
  type QuestEvent,
  type QuestState,
  questSlotStatus,
} from "@peon/core";
import type {
  GossipLine,
  InteractAction,
  InteractAfter,
  MoneyChange,
  QuestOffer,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { acceptedNext } from "#harness/tools/accept-next";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";
import type { InteractArgs } from "#harness/tools/params-interact";

export type NpcTarget = { unit: UnitView; guid: bigint };
export type StepInit = {
  args: InteractArgs;
  ctx: ToolCtx<InteractAfter>;
  npc: NpcTarget;
};
export type InteractStep = (
  init: StepInit,
) => Promise<ToolResult<InteractAfter>>;
export type TalkPart = { after: Partial<InteractAfter>; lines: string[] };
export type TalkExtra = (init: {
  ctx: ToolCtx<InteractAfter>;
  npc: NpcTarget;
}) => Promise<TalkPart>;

export const DIALOG_MS = 3000;
export const ANSWER_MS = 5000;
const READY_ICON = 4;
const HASH = /^#/;

export function formatMoney(copper: number): string {
  return `${Math.floor(copper / 10_000)}g ${Math.floor((copper % 10_000) / 100)}s ${copper % 100}c`;
}

export function shortMoney(copper: number): string {
  if (copper < 100) return `${copper} copper`;
  const parts = [
    [Math.floor(copper / 10_000), "g"],
    [Math.floor((copper % 10_000) / 100), "s"],
    [copper % 100, "c"],
  ] as const;
  return parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount}${unit}`)
    .join(" ");
}

export function moneyChange(
  ctx: ToolCtx<InteractAfter>,
  before: number | undefined,
): MoneyChange | undefined {
  const after = ctx.handle.getInventoryState().coinage;
  return before === undefined || after === undefined
    ? undefined
    : { after, before };
}

export function moneyText(change: MoneyChange | undefined): string {
  return change
    ? ` (money ${formatMoney(change.before)} -> ${formatMoney(change.after)})`
    : "";
}

export function npcLabel(npc: NpcTarget): string {
  return `${npc.unit.name} (${npc.unit.ref})`;
}

export function baseAfter(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
  action: InteractAction,
): InteractAfter {
  return {
    action,
    bought: undefined,
    dialogOpened: false,
    freeSlots: ctx.handle.getInventoryState().freeSlots,
    gossip: [],
    learned: [],
    money: undefined,
    npc: npc.unit,
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: npc.unit.roles,
    sold: [],
    spells: [],
    stock: [],
  };
}

export function send(
  ctx: ToolCtx<InteractAfter>,
  packet: () => void,
): () => Promise<void> {
  return () =>
    ctx.rt.mutex.run(() => {
      ctx.handle.takeControl("manual_override");
      packet();
    });
}

export function questStep(
  ctx: ToolCtx<InteractAfter>,
  init: {
    match: (event: QuestEvent) => boolean;
    packet: () => void;
    timeoutMs?: number;
  },
): Promise<QuestEvent | undefined> {
  return settle<QuestEvent>({
    match: init.match,
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onQuestEvent(cb),
    timeoutMs: init.timeoutMs ?? DIALOG_MS,
  });
}

export async function openDialog(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<QuestDialog | undefined> {
  const opened = await questStep(ctx, {
    match: (event) => event.type === "dialog" || event.type === "window",
    packet: () => ctx.handle.talk(npc.guid),
  });
  return opened?.type === "dialog"
    ? ctx.handle.getQuestState().dialog
    : undefined;
}

function menuState(
  entry: { questId: number; icon: number },
  state: QuestState,
): QuestOffer["state"] {
  if (entry.icon !== READY_ICON) return "available";
  const slot = state.log.slots.find((known) => known.questId === entry.questId);
  return slot && questSlotStatus(slot) === "complete" ? "ready" : "incomplete";
}

const COMPLETABLE_BITS = 4;
const COMPLETABLE = 3;

function completable(dialog: QuestDialog): boolean {
  return (
    dialog.kind === "requestItems" &&
    dialog.data.completionFlags[0] % COMPLETABLE_BITS === COMPLETABLE
  );
}

function singleState(dialog: QuestDialog): QuestOffer["state"] {
  if (dialog.kind === "details") return "available";
  if (dialog.kind === "offer" || completable(dialog)) return "ready";
  return "incomplete";
}

export function offersOf(
  dialog: QuestDialog | undefined,
  state: QuestState,
): QuestOffer[] {
  if (!dialog) return [];
  if (dialog.kind === "gossip" || dialog.kind === "list")
    return dialog.data.quests.map((entry, index) => ({
      id: entry.questId,
      level: entry.level > 0 ? entry.level : undefined,
      line: index + 1,
      state: menuState(entry, state),
      title: entry.title,
    }));
  return [
    {
      id: dialog.data.questId,
      level: undefined,
      line: 1,
      state: singleState(dialog),
      title: dialog.data.title,
    },
  ];
}

export function gossipOf(dialog: QuestDialog | undefined): GossipLine[] {
  if (dialog?.kind !== "gossip") return [];
  return dialog.data.options.map((option, index) => ({
    icon: option.icon,
    line: index + 1,
    text: option.text,
  }));
}

export function offerLine(offer: QuestOffer): string {
  const level = offer.level === undefined ? "" : ` (level ${offer.level})`;
  const state = offer.state === "ready" ? "ready to turn in" : offer.state;
  return `${offer.line}. ${offer.title} #${offer.id}${level}, ${state}`;
}

export function findOffer(
  offers: readonly QuestOffer[],
  what: string | undefined,
): QuestOffer | undefined {
  if (what === undefined) return offers.length === 1 ? offers[0] : undefined;
  const text = what.trim().replace(HASH, "").toLowerCase();
  const number = Number(text);
  if (text !== "" && Number.isInteger(number))
    return (
      offers.find((offer) => offer.line === number) ??
      offers.find((offer) => offer.id === number)
    );
  return offers.find((offer) => offer.title.toLowerCase().includes(text));
}

export function pickRefusal(
  npc: NpcTarget,
  offers: readonly QuestOffer[],
  action: "accept" | "turn_in",
): Refusal {
  const verb = action === "accept" ? "accept" : "turn in";
  const [first] = offers;
  if (!first)
    return new Refusal({
      detail: `${npcLabel(npc)} has no quest you can ${verb} now.`,
      next: nextCall("interact", { npc: npc.unit.ref }),
      reason: "no_offer",
    });
  return new Refusal({
    body: offers.map(offerLine),
    detail: `say which quest to ${verb}; ${npcLabel(npc)} has ${offers.length}.`,
    next: nextCall("interact", {
      do: action,
      npc: npc.unit.ref,
      what: String(first.line),
    }),
    reason: "which_quest",
  });
}

export function unanswered(
  npc: NpcTarget,
  what: string,
  next: string,
): Refusal {
  return new Refusal({
    detail: `${npcLabel(npc)} did not answer ${what} in time.`,
    next,
    reason: "no_answer",
    status: "UNCONFIRMED",
  });
}

export const acceptStep: InteractStep = async ({ args, ctx, npc }) => {
  const dialog = await openDialog(ctx, npc);
  const offers = offersOf(dialog, ctx.handle.getQuestState());
  const available = offers.filter((known) => known.state === "available");
  const offer = findOffer(available, args.what);
  if (!offer) throw pickRefusal(npc, available, "accept");
  const check = nextCall("journal", { about: "quests" });
  if (dialog?.kind !== "details") {
    const details = await questStep(ctx, {
      match: (event) =>
        event.type === "dialog" && event.state.dialog?.kind === "details",
      packet: () => ctx.handle.selectQuest(offer.id),
    });
    if (!details)
      throw unanswered(npc, `with the text of ${offer.title}`, check);
  }
  const shown = ctx.handle.getQuestState().dialog;
  const objectives =
    shown?.kind === "details" && shown.data.questId === offer.id
      ? shown.data.objectives
      : "";
  const accepted = await questStep(ctx, {
    match: (event) => event.type === "accepted" && event.questId === offer.id,
    packet: () => ctx.handle.acceptQuest(),
    timeoutMs: ANSWER_MS,
  });
  if (!accepted) throw unanswered(npc, `the accept of ${offer.title}`, check);
  return result("DONE", {
    after: { ...baseAfter(ctx, npc, "accept"), dialogOpened: true, offers },
    ...acceptedNext(ctx, offer, { giver: npc.unit.name, objectives }),
  });
};

export const gossipStep: InteractStep = async ({ args, ctx, npc }) => {
  const dialog = await openDialog(ctx, npc);
  const lines = gossipOf(dialog);
  const line = lines.find((known) => known.line === Number(args.what));
  const option =
    dialog?.kind === "gossip" && line
      ? dialog.data.options[line.line - 1]
      : undefined;
  if (!(line && option))
    throw new Refusal({
      body: lines.map((known) => `${known.line}. ${known.text}`),
      detail: `${npcLabel(npc)} has no gossip option "${args.what ?? ""}".`,
      next: nextCall("interact", {
        do: "gossip",
        npc: npc.unit.ref,
        what: "1",
      }),
      reason: lines.length === 0 ? "no_gossip" : "which_option",
    });
  const answer = await questStep(ctx, {
    match: (event) =>
      event.type === "dialog" ||
      event.type === "window" ||
      event.type === "closed",
    packet: () => ctx.handle.selectGossipOption(option.optionIndex),
  });
  if (!answer)
    throw unanswered(
      npc,
      `option ${line.line}`,
      nextCall("interact", { npc: npc.unit.ref }),
    );
  const next = ctx.handle.getQuestState().dialog;
  const offers = offersOf(next, ctx.handle.getQuestState());
  return result("DONE", {
    after: {
      ...baseAfter(ctx, npc, "gossip"),
      dialogOpened: true,
      gossip: gossipOf(next),
      offers,
    },
    body: [
      ...offers.map(offerLine),
      ...gossipOf(next).map((known) => `Gossip ${known.line}: ${known.text}`),
    ],
    detail: `chose "${line.text}"; the NPC answered (${answer.type}).`,
  });
};
