import {
  afterOf,
  completedText,
  lastCompletedLine,
  offerLine,
  type Picked,
  pickAll,
  playerName,
  refusalOf,
  type Settled,
  settleOutcome,
  stackText,
  type TradeAfter,
  type TradeArgs,
  type TradeCtx,
  type TradeState,
  throwUnlessOpen,
} from "#harness/areas/trade/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export async function runAnswer(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const answer = args.accept === false ? "busy" : "yes";
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.trade.act.answerTrade(answer),
  );
  if (
    args.accept === false &&
    outcome.status === "refused" &&
    (outcome.reason === "busy" || outcome.reason === "trade_canceled")
  )
    return result("DONE", {
      after: afterOf("answer"),
      detail: "Declined the trade.",
    });
  return settleOutcome(outcome, "answer", afterOf("answer"));
}
type OccupiedSlot = { bag: number; guid: bigint; slot: number };

function keyOf(bag: number, slot: number): string {
  return `${bag}/${slot}`;
}

function occupiedSlots(ctx: TradeCtx): OccupiedSlot[] {
  return ctx.handle
    .getInventoryState()
    .slots.flatMap((slot) => (slot.status === "occupied" ? [slot] : []));
}

async function withdrawMoved(
  ctx: TradeCtx,
  live: TradeState,
  picked: Picked[],
): Promise<Record<string, true>> {
  const moved: Record<string, true> = {};
  const wanted: Record<string, number> = {};
  for (const [index, item] of picked.entries())
    wanted[keyOf(item.bag, item.slot)] = index;
  const slots = occupiedSlots(ctx);
  for (const held of [...live.ownOffer.items]) {
    const found = slots.find((slot) => slot.guid === held.guid);
    const target =
      found === undefined ? undefined : wanted[keyOf(found.bag, found.slot)];
    if (target === undefined || target !== held.slot) {
      await ctx.handle.trade.act.withdrawItem(held.slot);
      moved[`${held.guid}`] = true;
    }
  }
  return moved;
}

async function placeWanted(
  ctx: TradeCtx,
  live: TradeState,
  picked: Picked[],
  moved: Record<string, true>,
): Promise<void> {
  const slots = occupiedSlots(ctx);
  for (const [index, item] of picked.entries()) {
    const placed = slots.find(
      (slot) => slot.bag === item.bag && slot.slot === item.slot,
    );
    const current = live.ownOffer.items.find(
      (held) => placed !== undefined && placed.guid === held.guid,
    );
    if (
      current === undefined ||
      current.slot !== index ||
      moved[`${current.guid}`] === true
    )
      await ctx.handle.trade.act.offerItem(index, item.bag, item.slot);
  }
}

export async function runOffer(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const state = throwUnlessOpen(ctx);
  const picked = pickAll(ctx, args.items ?? []);
  const copper = args.gold ?? state.ownOffer.gold;
  await ctx.rt.mutex.run(async () => {
    const live = ctx.handle.trade.state();
    if (live.phase !== "open") throw new Error("no trade is open");
    const moved = await withdrawMoved(ctx, live, picked);
    await placeWanted(ctx, live, picked, moved);
    if (copper !== state.ownOffer.gold)
      await ctx.handle.trade.act.offerGold(copper);
  });
  return result("DONE", {
    after: afterOf("offer", {
      gold: copper,
      items: picked.map((item) => item.label),
      version: state.theirOffer.version,
    }),
    detail: `Offered ${picked.map(stackText).join(", ") || "nothing"} and ${copper} copper.`,
  });
}

export async function runAccept(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  throwUnlessOpen(ctx);
  const version = args.version ?? ctx.handle.trade.state().theirOffer.version;
  let outcome: Settled;
  try {
    outcome = await ctx.rt.mutex.run(() =>
      ctx.handle.trade.act.acceptTrade(version),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "offer_changed")
      throw refusalOf(
        "offer_changed",
        'Their offer changed; call trade with do "show" and accept the new version.',
        nextCall("trade", { do: "show" }),
      );
    throw error;
  }
  if (outcome.status !== "ok")
    return settleOutcome(outcome, "accept", afterOf("accept", { version }));
  const last = ctx.handle.trade.state().lastOutcome;
  const detail =
    last?.kind === "completed"
      ? completedText(ctx, last)
      : `Trade with ${playerName(ctx, ctx.handle.trade.state().with ?? 0n)} accepted.`;
  return result("DONE", { after: afterOf("accept", { version }), detail });
}

export async function runCancel(
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.trade.act.cancelTrade(),
  );
  return settleOutcome(outcome, "cancel", afterOf("cancel"));
}

function stateLines(ctx: TradeCtx, state: TradeState): string[] {
  return [
    `with: ${playerName(ctx, state.with ?? 0n)}`,
    `own offer: ${offerLine(ctx, state.ownOffer)}`,
    `their offer: ${offerLine(ctx, state.theirOffer)}`,
    `version ${state.theirOffer.version}; you ${state.selfAccepted ? "accepted" : "not accepted"}, they ${state.theyAccepted ? "accepted" : "not accepted"}`,
  ];
}

export function runShow(ctx: TradeCtx): ToolResult<TradeAfter> {
  const state = ctx.handle.trade.state();
  if (state.phase !== "open") {
    const past = lastCompletedLine(ctx);
    return result("DONE", {
      after: afterOf("show", {
        with:
          state.with === undefined ? undefined : playerName(ctx, state.with),
      }),
      body: past === undefined ? [] : [past],
      detail: "No trade is open.",
    });
  }
  return result("DONE", {
    after: afterOf("show", {
      gold: state.ownOffer.gold,
      version: state.theirOffer.version,
      with: state.with === undefined ? undefined : playerName(ctx, state.with),
    }),
    body: stateLines(ctx, state),
    detail: `Trade with ${playerName(ctx, state.with ?? 0n)}: ${offerLine(ctx, state.ownOffer)}.`,
  });
}
