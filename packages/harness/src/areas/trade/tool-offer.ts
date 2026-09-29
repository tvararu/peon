import {
  afterOf,
  offerLine,
  pickAll,
  playerName,
  refusalOf,
  settleOutcome,
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
  return settleOutcome(outcome, "answer", afterOf("answer"));
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
    const slots = ctx.handle.getInventoryState().slots;
    const keyOf = (bag: number, slot: number): string => `${bag}/${slot}`;
    const wanted: Record<string, true> = {};
    for (const item of picked) wanted[keyOf(item.bag, item.slot)] = true;
    for (const held of [...live.ownOffer.items]) {
      const found = slots.find(
        (slot): slot is Extract<typeof slot, { status: "occupied" }> =>
          slot.status === "occupied" && slot.guid === held.guid,
      );
      if (found === undefined || wanted[keyOf(found.bag, found.slot)] !== true)
        await ctx.handle.trade.act.withdrawItem(held.slot);
    }
    const snap = ctx.handle.getInventoryState().slots;
    for (const [index, item] of picked.entries()) {
      const placed = snap.find(
        (slot): slot is Extract<typeof slot, { status: "occupied" }> =>
          slot.status === "occupied" &&
          slot.bag === item.bag &&
          slot.slot === item.slot,
      );
      const current = live.ownOffer.items.find(
        (held) => placed !== undefined && placed.guid === held.guid,
      );
      if (!current || current.slot !== index)
        await ctx.handle.trade.act.offerItem(index, item.bag, item.slot);
    }
    if (copper !== state.ownOffer.gold)
      await ctx.handle.trade.act.offerGold(copper);
  });
  return result("DONE", {
    after: afterOf("offer", {
      gold: copper,
      items: picked.map((item) => item.label),
      version: state.theirOffer.version,
    }),
    detail: `Offered ${picked.map((item) => item.label).join(", ") || "nothing"} and ${copper} copper.`,
  });
}

export async function runAccept(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  throwUnlessOpen(ctx);
  const version = args.version ?? ctx.handle.trade.state().theirOffer.version;
  let outcome;
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
  return settleOutcome(outcome, "accept", afterOf("accept", { version }));
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

export async function runShow(ctx: TradeCtx): Promise<ToolResult<TradeAfter>> {
  const state = ctx.handle.trade.state();
  const lines = stateLines(ctx, state);
  return result("DONE", {
    after: afterOf("show", {
      gold: state.phase === "open" ? state.ownOffer.gold : 0,
      version: state.phase === "open" ? state.theirOffer.version : undefined,
      with: state.with === undefined ? undefined : playerName(ctx, state.with),
    }),
    body: lines,
    detail:
      state.phase === "open"
        ? `Trade with ${playerName(ctx, state.with ?? 0n)}: ${offerLine(ctx, state.ownOffer)}.`
        : "No trade is open.",
  });
}
