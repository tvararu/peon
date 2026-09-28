import type { CombatEvent, ControlEvent } from "@peon/core";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx, ViewCtx } from "#harness/contract/services";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { poseView, selfView } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const HEARTHSTONE_ITEM = 6948;
export const HEARTHSTONE_SPELL = 8690;
export const HEARTH_WAIT_MS = 30_000;
export const FINISH_GRACE_MS = 10_000;

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

type Wait =
  | { done: "arrived" }
  | { done: "interrupted" }
  | { done: "send_failed" }
  | { done: "finished" };

type Arrival = { closed: boolean; finished: boolean; started: boolean };

function waitForArrival(
  ctx: ToolCtx<TravelAfter>,
  stone: Hearth,
): Promise<Wait | undefined> {
  const seen: Arrival = { closed: false, finished: false, started: false };
  const outcome = Promise.withResolvers<Wait | undefined>();
  const close = (value: Wait | undefined): void => {
    if (seen.closed) return;
    seen.closed = true;
    outcome.resolve(value);
  };
  const timer = setTimeout(() => close(undefined), HEARTH_WAIT_MS);
  const grace = setTimeout(() => {
    if (!seen.finished || seen.started) return;
    close({ done: "finished" });
  }, FINISH_GRACE_MS);
  const abort = (): void => close(undefined);
  ctx.signal?.throwIfAborted();
  ctx.signal?.addEventListener("abort", abort, { once: true });
  const offControl = ctx.handle.onControlEvent((event: ControlEvent) => {
    if (seen.closed) return;
    if (event.type === "server_correction" && ARRIVALS[event.reason ?? ""])
      close({ done: "arrived" });
    else if (event.type === "control_changed" && event.reason === "teleporting")
      seen.started = true;
  });
  const offCombat = ctx.handle.onCombatEvent((event: CombatEvent) => {
    if (seen.closed) return;
    const cast = event.state.lastOutcome;
    if (cast?.kind !== "cast" || cast.spellId !== HEARTHSTONE_SPELL) return;
    if (event.type === "cast_interrupted" || event.type === "cast_failed")
      close({ done: "interrupted" });
    else if (event.type === "cast_succeeded") {
      seen.finished = true;
      grace.refresh();
    }
  });
  void ctx.rt.mutex
    .run(() => {
      ctx.handle.takeControl("manual_override");
      return ctx.handle.useItem(stone.bag, stone.slot);
    })
    .then(
      () => undefined,
      () => close({ done: "send_failed" }),
    )
    .finally(() => {
      void outcome.promise.finally(() => {
        clearTimeout(timer);
        clearTimeout(grace);
        offControl();
        offCombat();
        ctx.signal?.removeEventListener("abort", abort);
      });
    });
  return outcome.promise;
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
  if (done?.done === "send_failed")
    return result("REFUSED", {
      after: view,
      detail: "your hearthstone would not start; check journal bags for one.",
      next: nextCall("journal", { about: "bags" }),
      reason: "use_failed",
    });
  if (done?.done === "interrupted" || done?.done === "finished")
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
