import type { CombatEvent, ControlEvent } from "@peon/core";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx, ViewCtx } from "#harness/contract/services";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { poseView, selfView } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const HEARTHSTONE_ITEM = 6948;
export const HEARTHSTONE_SPELL = 8690;
export const HEARTH_WAIT_MS = 30_000;

const BAG_REGIONS: Record<string, true> = { backpack: true, bag_item: true };

type Hearth = { bag: number; slot: number; spell: number };

function findStone(ctx: ViewCtx): Hearth | undefined {
  for (const slot of ctx.handle.getInventoryState().slots) {
    if (slot.status !== "occupied" || !BAG_REGIONS[slot.region]) continue;
    const { item } = slot;
    if (item.entry !== HEARTHSTONE_ITEM) continue;
    const [spell] = item.useSpellIds ?? [];
    if (spell === undefined) continue;
    return { bag: slot.bag, slot: slot.slot, spell };
  }
  return undefined;
}

type Wait = { done: "arrived" } | { done: "started" } | { done: "interrupted" };

function waitForArrival(
  ctx: ToolCtx<TravelAfter>,
  stone: Hearth,
): Promise<Wait | undefined> {
  return settle<Wait>({
    match: (event) => event.done !== "started",
    send: () => {
      void ctx.rt.mutex.run(() => {
        ctx.handle.takeControl("manual_override");
        return ctx.handle.useItem(stone.bag, stone.slot);
      });
    },
    signal: ctx.signal,
    subscribe: (cb) => {
      const offControl = ctx.handle.onControlEvent((event: ControlEvent) => {
        if (event.type === "server_correction" && ARRIVALS[event.reason ?? ""])
          cb({ done: "arrived" });
        else if (
          event.type === "control_changed" &&
          event.reason === "teleporting"
        )
          cb({ done: "started" });
      });
      const offCombat = ctx.handle.onCombatEvent((event: CombatEvent) => {
        if (event.type === "cast_interrupted" || event.type === "cast_failed")
          cb({ done: "interrupted" });
      });
      return () => {
        offControl();
        offCombat();
      };
    },
    timeoutMs: HEARTH_WAIT_MS,
  });
}

const ARRIVALS: Record<string, true> = {
  near_teleport: true,
  new_world: true,
  teleport: true,
};

function homeLine(ctx: ToolCtx<TravelAfter>): string {
  const home = ctx.handle.travel.state().home;
  const pose = poseView(ctx);
  if (!home) return "home, but the bind point is unknown.";
  if (!pose || pose.mapId !== home.mapId)
    return `home at ${Math.round(home.x)}, ${Math.round(home.y)}.`;
  const away = Math.hypot(pose.x - home.x, pose.y - home.y);
  return `home, ${away < 10 ? away.toFixed(1) : Math.round(away).toString()} yd from your home.`;
}

function arrivalReport(
  ctx: ToolCtx<TravelAfter>,
  after: TravelAfter,
): ToolResult<TravelAfter> {
  return result("DONE", {
    after,
    detail: `used your hearthstone and arrived ${homeLine(ctx)} ${youLine(ctx)}`,
  });
}

function youLine(ctx: ToolCtx<TravelAfter>): string {
  const vitals = selfView(ctx);
  return `You: HP ${vitals.hp}/${vitals.maxHp}.`;
}

export async function hearthWork(
  ctx: ToolCtx<TravelAfter>,
  after: (patch: Partial<TravelAfter>) => TravelAfter,
): Promise<ToolResult<TravelAfter>> {
  const stone = findStone(ctx);
  if (!stone)
    throw new Refusal({
      detail: "you have no hearthstone; check journal bags for one.",
      next: nextCall("journal", { about: "bags" }),
      reason: "no_hearthstone",
    });
  if (ctx.handle.spellReadyAt(stone.spell) > ctx.rt.clock.now())
    throw new Refusal({
      detail: "your hearthstone is on cooldown; wait before you use it again.",
      next: nextCall("rest"),
      reason: "cooldown",
    });
  const [attacker] = dangerView(ctx).attackers;
  if (attacker)
    throw new Refusal({
      detail: `${attacker.name} ${attacker.ref} is attacking you.`,
      next: nextCall("engage", { target: attacker.ref }),
      reason: "attacked",
    });
  if (ctx.handle.getControlState().blockedReason === "in_flight")
    throw new Refusal({
      detail: "you are on a flight; you cannot hearth until you land.",
      next: nextCall("travel", { to: "explore" }),
      reason: "in_flight",
    });
  const done = await waitForArrival(ctx, stone);
  const view = after({ goal: { kind: "hearth" } });
  if (done?.done === "interrupted")
    return result("REFUSED", {
      after: view,
      detail: "your hearth was interrupted before you arrived.",
      next: nextCall("travel", { to: "hearth" }),
      reason: "interrupted",
    });
  if (done?.done === "arrived") return arrivalReport(ctx, view);
  return result("UNCONFIRMED", {
    after: view,
    detail:
      "you used your hearthstone but no arrival was seen; check journal bags for your home.",
    next: nextCall("travel", { to: "hearth" }),
    reason: "no_teleport",
  });
}
