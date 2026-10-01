import {
  isObjectRef,
  objectUnit,
  resolveObjectRef,
} from "#harness/areas/objects/reads";
import type { InteractAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { INTERACT_APPROACH_YD, TALK_RANGE_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { notAtLastKnown, seekLastKnown } from "#harness/ops/remembered";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";
import { reachNext } from "#harness/ops/unreached";
import { defineGameTool, emptyUnit, result } from "#harness/tools/define";
import type { GameToolSpec } from "#harness/tools/game-tool";
import { bindStep } from "#harness/tools/interact-bind";
import { buybackStep } from "#harness/tools/interact-buyback";
import { flightExtra } from "#harness/tools/interact-flight";
import {
  acceptStep,
  baseAfter,
  gossipOf,
  gossipStep,
  type InteractStep,
  type NpcTarget,
  npcLabel,
  offerLine,
  offersOf,
  openDialog,
  type StepInit,
  type TalkExtra,
  waitGreeting,
} from "#harness/tools/interact-quest";
import { turnInStep } from "#harness/tools/interact-reward";
import {
  buySlotStep,
  stableExtra,
  stableStep,
  unstableStep,
} from "#harness/tools/interact-stable";
import { resetTalentsStep } from "#harness/tools/interact-talents";
import {
  repairStep,
  trainerExtra,
  trainStep,
} from "#harness/tools/interact-trainer";
import {
  buyStep,
  sellJunkStep,
  vendorExtra,
} from "#harness/tools/interact-vendor";
import { nextCall } from "#harness/tools/next-call";
import {
  type InteractArgs,
  interactParams,
} from "#harness/tools/params-interact";
import { interactRenderers } from "#harness/ui/renderers/card";

const SHOP_ROLES = new Set([
  "vendor",
  "trainer",
  "class_trainer",
  "profession_trainer",
  "repair",
  "stable_master",
]);

function emptyInteract(): InteractAfter {
  return {
    action: "talk",
    bought: undefined,
    dialogOpened: false,
    freeSlots: undefined,
    gossip: [],
    learned: [],
    money: undefined,
    npc: emptyUnit(),
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: [],
    sold: [],
    spells: [],
    stock: [],
  };
}

const TALK_EXTRAS: TalkExtra[] = [vendorExtra, trainerExtra, stableExtra];

function talkNext(
  npc: NpcTarget,
  after: InteractAfter,
  flightNext: string | undefined,
): string | undefined {
  const available = after.offers.find((offer) => offer.state === "available");
  if (available)
    return nextCall("interact", {
      do: "accept",
      npc: npc.unit.ref,
      what: String(available.line),
    });
  const ready = after.offers.find((offer) => offer.state === "ready");
  if (ready)
    return nextCall("interact", {
      do: "turn_in",
      npc: npc.unit.ref,
      what: String(ready.line),
    });
  return flightNext;
}

async function talkStep({
  ctx,
  npc,
}: StepInit): Promise<ToolResult<InteractAfter>> {
  const dialog = await openDialog(ctx, npc);
  const greeting = await waitGreeting(ctx, dialog);
  const gossip = gossipOf(dialog);
  const offers = offersOf(dialog, ctx.handle.getQuestState());
  let after: InteractAfter = {
    ...baseAfter(ctx, npc, "talk"),
    dialogOpened: dialog !== undefined,
    gossip,
    offers,
  };
  const extra: string[] = [];
  for (const part of TALK_EXTRAS) {
    const added = await part({ ctx, npc });
    after = { ...after, ...added.after };
    extra.push(...added.lines);
  }
  const flight = await flightExtra({ ctx, npc });
  extra.push(...flight.lines);
  const ready = offers
    .filter((offer) => offer.state === "ready")
    .map((offer) => `${offer.line}. ${offer.title} #${offer.id}`);
  const shop = npc.unit.roles.some((role) => SHOP_ROLES.has(role))
    ? ""
    : " Not a vendor or trainer.";
  const body = [
    ...(greeting === undefined ? [] : [`${npc.unit.name} says: "${greeting}"`]),
    ...offers.filter((offer) => offer.state !== "ready").map(offerLine),
    ...gossip.map((line) => `Gossip ${line.line}: ${line.text}`),
    ...extra,
    `Ready to turn in: ${ready.length === 0 ? "none" : ready.join(", ")}.${shop}`,
  ];
  const opened = dialog !== undefined || extra.length > 0;
  const said =
    greeting === undefined ? "" : ` ${npc.unit.name} says: "${greeting}"`;
  const detail = opened
    ? `${npcLabel(npc)} offers:${said}`
    : `${npcLabel(npc)} opened no dialog in 3 s.`;
  return result("DONE", {
    after,
    body,
    detail,
    next: talkNext(npc, after, flight.next),
  });
}

const STEPS = new Map<string, InteractStep>([
  ["talk", talkStep],
  ["accept", acceptStep],
  ["turn_in", turnInStep],
  ["gossip", gossipStep],
  ["buy", buyStep],
  ["sell_junk", sellJunkStep],
  ["train", trainStep],
  ["repair", repairStep],
  ["bind", bindStep],
  ["buyback", buybackStep],
  ["reset_talents", resetTalentsStep],
  ["stable", stableStep],
  ["unstable", unstableStep],
  ["buy_slot", buySlotStep],
]);

function objectTalk(ctx: ToolCtx<InteractAfter>, text: string): NpcTarget {
  const row = resolveObjectRef(ctx, text);
  if (!row) {
    const resolved = resolveUnit(ctx, { alive: true, text });
    if (resolved.kind !== "unit")
      throw unitRefusal({ param: "npc", resolved, tool: "interact" });
    return { guid: resolved.guid, unit: resolved.unit };
  }
  if (row.type !== 2)
    throw new Refusal({
      detail: `${row.name} (${row.ref}) is not a quest giver; it cannot talk.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_quest_giver",
    });
  return { guid: row.guid, unit: objectUnit(row) };
}

function findNpc(ctx: ToolCtx<InteractAfter>, text: string): NpcTarget {
  if (isObjectRef(text)) return objectTalk(ctx, text);
  const resolved = resolveUnit(ctx, { alive: true, text });
  if (resolved.kind === "unit")
    return { guid: resolved.guid, unit: resolved.unit };
  return objectTalk(ctx, text);
}

function unreached(npc: NpcTarget, leg: LegResult): Refusal {
  return new Refusal({
    detail: `could not reach ${npcLabel(npc)}: ${leg.detail}.`,
    next: reachNext(leg, npc.unit),
    reason: leg.reason ?? leg.status,
    status: "FAILED",
  });
}

async function lastKnown(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<NpcTarget> {
  if (npc.unit.inView) return npc;
  const { found, leg } = await seekLastKnown(ctx, npc.unit);
  if (found) return found;
  if (leg && leg.status !== "arrived") throw unreached(npc, leg);
  throw notAtLastKnown(ctx, npc.unit);
}

async function approach(
  ctx: ToolCtx<InteractAfter>,
  seen: NpcTarget,
): Promise<NpcTarget> {
  const npc = await lastKnown(ctx, seen);
  if ((npc.unit.distance ?? 0) <= TALK_RANGE_YD) return npc;
  const leg = await travelLeg(ctx, {
    goal: { guid: npc.guid, kind: "unit", name: npc.unit.name },
    within: INTERACT_APPROACH_YD,
  });
  if (leg.status !== "arrived") throw unreached(npc, leg);
  return npc;
}

async function runInteract(
  args: InteractArgs,
  ctx: ToolCtx<InteractAfter>,
): Promise<ToolResult<InteractAfter>> {
  const step = STEPS.get(args.do ?? "talk");
  if (!step) throw new Error("not_implemented");
  const npc = await approach(ctx, findNpc(ctx, args.npc));
  try {
    return await step({ args, ctx, npc });
  } finally {
    await ctx.rt.mutex.run(() => {
      ctx.handle.takeControl("manual_override");
      ctx.handle.cancelInteraction();
    });
  }
}

export const interactSpec: GameToolSpec<
  typeof interactParams,
  "interact",
  InteractAfter
> = {
  fallback: emptyInteract,
  kind: "action",
  minimalArgs: { npc: "u3" },
  name: "interact",
  parameters: interactParams,
  renderers: interactRenderers,
  run: runInteract,
  text: {
    description:
      "Walks to an NPC and does one job with it: talk, accept or turn in a quest, gossip, buy, sell junk, train, repair or reset talents. talk lists what the NPC offers, with a number for each line.",
    guidelines: [
      "talk lists what an NPC offers. Your own quest log is journal.",
      'For buy, what can be a stock line number, part of an item name (for example "water") or "item <id>".',
    ],
    label: "Interact",
  },
};

export const interactTool = defineGameTool(interactSpec);
