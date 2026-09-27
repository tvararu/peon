import type { LootAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { type LootOpResult, lootCorpseOp } from "#harness/ops/loot";
import { completeQuestIds, noteQuestsDone } from "#harness/ops/quest-memory";
import { LOOT_APPROACH_YD, LOOT_WALK_MAX_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import { reachNext } from "#harness/ops/unreached";
import { unitViews } from "#harness/ops/views";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { type LootArgs, lootParams } from "#harness/tools/params";
import { lootRenderers } from "#harness/ui/renderers/card";

type Corpse = { unit: UnitView; guid: bigint };

const LOOK_LOOTABLE = nextCall("look", { find: "lootable" });

function emptyLoot(): LootAfter {
  return {
    copper: 0,
    corpse: undefined,
    freeSlots: undefined,
    items: [],
    windowClosed: true,
  };
}

function label(unit: UnitView): string {
  return `${unit.name} (${unit.ref})`;
}

function nearestCorpse(ctx: ToolCtx<LootAfter>): Corpse {
  const unit = unitViews(ctx).find(
    (view) =>
      view.lootable &&
      !view.alive &&
      (view.distance ?? Number.POSITIVE_INFINITY) <= LOOT_WALK_MAX_YD,
  );
  const guid = unit ? ctx.rt.refs.guidOf(unit.ref) : undefined;
  if (!unit || guid === undefined)
    throw new Refusal({
      detail: `no lootable corpse within ${LOOT_WALK_MAX_YD} yd.`,
      next: LOOK_LOOTABLE,
      reason: "not_lootable",
    });
  return { guid, unit };
}

function namedCorpse(ctx: ToolCtx<LootAfter>, text: string): Corpse {
  const resolved = resolveUnit(ctx, { alive: false, text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "loot" });
  if (!resolved.unit.lootable)
    throw new Refusal({
      detail: `${label(resolved.unit)} has nothing for you (no lootable flag).`,
      next: LOOK_LOOTABLE,
      reason: "not_lootable",
    });
  return { guid: resolved.guid, unit: resolved.unit };
}

async function approach(
  ctx: ToolCtx<LootAfter>,
  corpse: Corpse,
): Promise<void> {
  const distance = corpse.unit.distance ?? 0;
  const walkTo = nextCall("travel", { to: corpse.unit.ref });
  if (distance > LOOT_WALK_MAX_YD)
    throw new Refusal({
      detail: `${label(corpse.unit)} is ${Math.round(distance)} yd away; loot walks at most ${LOOT_WALK_MAX_YD} yd.`,
      next: walkTo,
      reason: "too_far",
    });
  if (distance <= LOOT_APPROACH_YD) return;
  const leg = await travelLeg(ctx, {
    goal: { guid: corpse.guid, kind: "unit", name: corpse.unit.name },
    within: LOOT_APPROACH_YD,
  });
  if (leg.status !== "arrived")
    throw new Refusal({
      detail: `could not reach ${label(corpse.unit)}: ${leg.detail}.`,
      next: reachNext(leg, corpse.unit),
      reason: leg.reason ?? leg.status,
      status: "FAILED",
    });
}

function lootText(op: LootOpResult): string {
  const parts = op.items.map((item) => `${item.name} x${item.count}`);
  if (op.copper > 0) parts.push(`${op.copper} copper`);
  return parts.join(", ");
}

function report(
  ctx: ToolCtx<LootAfter>,
  corpse: Corpse,
  op: LootOpResult,
): ToolResult<LootAfter> {
  const windowClosed = ctx.handle.getRewardsState().loot.phase === "closed";
  const after: LootAfter = {
    copper: op.copper,
    corpse: corpse.unit,
    freeSlots: op.freeSlots,
    items: op.items,
    windowClosed,
  };
  const name = label(corpse.unit);
  const bags = `${windowClosed ? "Window closed." : "Window still open."} Bags: ${op.freeSlots ?? "?"} free.`;
  const { outcome } = op;
  if (!outcome.ok)
    return result("FAILED", {
      after,
      detail: `looting ${name} stopped (${outcome.cause}).`,
      next: LOOK_LOOTABLE,
      reason: outcome.cause,
    });
  if (!outcome.record)
    return result("DONE", {
      after,
      detail: `${name} had nothing left to loot. ${bags}`,
    });
  const left = outcome.record.slotsLeft.length;
  if (left > 0)
    return result("PARTLY", {
      after,
      detail: `looted ${name}: ${lootText(op) || "nothing"}; ${left} item(s) left behind. ${bags}`,
      next: nextCall("journal", { about: "bags" }),
      reason: "bags_full",
    });
  return result("DONE", {
    after,
    detail: `looted ${name}: ${lootText(op)}. ${bags}`,
  });
}

async function runLoot(
  args: LootArgs,
  ctx: ToolCtx<LootAfter>,
): Promise<ToolResult<LootAfter>> {
  const corpse =
    args.target === undefined
      ? nearestCorpse(ctx)
      : namedCorpse(ctx, args.target);
  const before = completeQuestIds(ctx.handle.getQuestState());
  await approach(ctx, corpse);
  const op = await lootCorpseOp(ctx, corpse.guid);
  return noteQuestsDone(ctx, before, report(ctx, corpse, op));
}

export const lootSpec: GameToolSpec<typeof lootParams, "loot", LootAfter> = {
  fallback: emptyLoot,
  kind: "action",
  minimalArgs: {},
  name: "loot",
  parameters: lootParams,
  renderers: lootRenderers,
  run: runLoot,
  text: {
    description:
      "Takes every item and the money from one corpse, one slot at a time. It walks to the corpse first. Leave target empty to loot the nearest lootable corpse within 30 yards.",
    guidelines: [
      "engage loots each kill already. Use loot only for a corpse that engage did not loot.",
    ],
    label: "Loot",
  },
};

export const lootTool = defineGameTool(lootSpec);
