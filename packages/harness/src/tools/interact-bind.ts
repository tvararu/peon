import type { InteractAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import {
  baseAfter,
  type InteractStep,
  npcLabel,
} from "#harness/tools/interact-quest";
import { nextCall } from "#harness/tools/next-call";

function homeName(ctx: ToolCtx<InteractAfter>, areaId: number): string {
  try {
    return ctx.handle.getPlaceState().area ?? `area ${areaId}`;
  } catch {
    return `area ${areaId}`;
  }
}

export const bindStep: InteractStep = async ({ ctx, npc }) => {
  if (!npc.unit.roles.includes("innkeeper"))
    throw new Refusal({
      detail: `${npcLabel(npc)} is not an innkeeper; it cannot make an inn your home.`,
      next: nextCall("look", { find: "innkeeper" }),
      reason: "not_innkeeper",
    });
  const outcome = await ctx.rt.mutex.run(async () => {
    ctx.handle.takeControl("manual_override");
    return await ctx.handle.travel.act.bindActivate(npc.guid);
  });
  const after = baseAfter(ctx, npc, "bind");
  if (outcome.status === "ok")
    return result("DONE", {
      after,
      detail: `Home is now ${homeName(ctx, outcome.home.areaId)}.`,
    });
  if (outcome.status === "no_answer")
    return result("UNCONFIRMED", {
      after,
      detail: `${npcLabel(npc)} said nothing; you may be dead, out of range or in an instance. Check journal bags for your home.`,
      next: nextCall("interact", { do: "bind", npc: npc.unit.ref }),
      reason: "no_answer",
    });
  throw new Refusal({
    detail: `${npcLabel(npc)} refused the bind (${outcome.reason}).`,
    next: nextCall("interact", { do: "bind", npc: npc.unit.ref }),
    reason: outcome.reason,
  });
};
