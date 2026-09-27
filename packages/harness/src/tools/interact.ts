import type { InteractAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { INTERACT_APPROACH_YD, TALK_RANGE_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  defineGameTool,
  emptyUnit,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
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
  turnInStep,
} from "#harness/tools/interact-quest";
import { type InteractArgs, interactParams } from "#harness/tools/params";

const SHOP_ROLES = new Set([
  "vendor",
  "trainer",
  "class_trainer",
  "profession_trainer",
  "repair",
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

const TALK_EXTRAS: TalkExtra[] = [];

function talkNext(npc: NpcTarget, after: InteractAfter): string | undefined {
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
}

async function talkStep({
  ctx,
  npc,
}: StepInit): Promise<ToolResult<InteractAfter>> {
  const dialog = await openDialog(ctx, npc);
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
  const ready = offers
    .filter((offer) => offer.state === "ready")
    .map((offer) => `${offer.line}. ${offer.title} #${offer.id}`);
  const shop = npc.unit.roles.some((role) => SHOP_ROLES.has(role))
    ? ""
    : " Not a vendor or trainer.";
  const body = [
    ...offers.filter((offer) => offer.state !== "ready").map(offerLine),
    ...gossip.map((line) => `Gossip ${line.line}: ${line.text}`),
    ...extra,
    `Ready to turn in: ${ready.length === 0 ? "none" : ready.join(", ")}.${shop}`,
  ];
  const opened = dialog !== undefined || extra.length > 0;
  const detail = opened
    ? `${npcLabel(npc)} offers:`
    : `${npcLabel(npc)} opened no dialog in 3 s.`;
  return result("DONE", { after, body, detail, next: talkNext(npc, after) });
}

const STEPS = new Map<string, InteractStep>([
  ["talk", talkStep],
  ["accept", acceptStep],
  ["turn_in", turnInStep],
  ["gossip", gossipStep],
]);

function findNpc(ctx: ToolCtx<InteractAfter>, text: string): NpcTarget {
  const resolved = resolveUnit(ctx, { alive: true, text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "npc", resolved, tool: "interact" });
  return { guid: resolved.guid, unit: resolved.unit };
}

async function approach(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<void> {
  if ((npc.unit.distance ?? 0) <= TALK_RANGE_YD) return;
  const leg = await travelLeg(ctx, {
    goal: { guid: npc.guid, kind: "unit", name: npc.unit.name },
    within: INTERACT_APPROACH_YD,
  });
  if (leg.status !== "arrived")
    throw new Refusal({
      detail: `could not reach ${npcLabel(npc)}: ${leg.detail}.`,
      next: nextCall("travel", { to: npc.unit.ref }),
      reason: leg.reason ?? leg.status,
      status: "FAILED",
    });
}

async function runInteract(
  args: InteractArgs,
  ctx: ToolCtx<InteractAfter>,
): Promise<ToolResult<InteractAfter>> {
  const npc = findNpc(ctx, args.npc);
  const step = STEPS.get(args.do ?? "talk");
  if (!step) throw new Error("not_implemented");
  await approach(ctx, npc);
  try {
    return await step({ args, ctx, npc });
  } finally {
    await ctx.rt.mutex.run(() => ctx.handle.cancelInteraction());
  }
}

export const interactSpec: GameToolSpec<typeof interactParams, "interact"> = {
  fallback: emptyInteract,
  kind: "action",
  name: "interact",
  parameters: interactParams,
  run: runInteract,
};

export const interactTool = defineGameTool(interactSpec);
