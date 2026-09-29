import {
  afterOf,
  type Picked,
  pickAll,
  playerName,
  refusalFor,
  refusalOf,
  resolvePlayer,
  type Settled,
  stackText,
  type TradeAfter,
  type TradeArgs,
  type TradeCtx,
} from "#harness/areas/trade/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import type { RunEnd } from "#harness/contract/runs";
import { awaitRun } from "#harness/runs/wait";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

function givePicks(
  ctx: TradeCtx,
  args: TradeArgs,
): { copper: number; name: string; picked: Picked[] } {
  const with_ = args.with?.trim() ?? "";
  if (with_ === "")
    throw refusalOf(
      "missing_player",
      "Name the player to trade with.",
      "call look and name a player in view.",
    );
  const names = args.items ?? [];
  if (names.length === 0 && (args.gold ?? 0) <= 0)
    throw refusalOf(
      "missing_offer",
      "Name items or gold to give.",
      "call journal with about bags and name carried items.",
    );
  const picked = pickAll(ctx, names);
  const copper = args.gold ?? 0;
  if (!Number.isInteger(copper) || copper < 0)
    throw refusalOf(
      "bad_gold",
      `Gold ${copper} is not a copper amount.`,
      "call trade with a copper amount of 0 or more.",
    );
  const coinage = ctx.handle.getInventoryState().coinage ?? 0;
  if (copper > coinage)
    throw refusalOf(
      "not_enough_gold",
      `Gold ${copper} is above the coinage ${coinage}.`,
      "call trade with less gold.",
    );
  return { copper, name: with_, picked };
}

type Offer = { copper: number; guid: bigint; name: string; picked: Picked[] };

function gaveDetail({ copper, name, picked }: Offer): string {
  const items = picked.map(stackText).join(", ");
  const gave =
    copper > 0
      ? [items, `${copper} copper`].filter(Boolean).join(" and ")
      : items;
  return `Gave ${gave} to ${name}.`;
}

function stopped(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("the trade was stopped");
}

async function giveFlow(
  ctx: TradeCtx,
  offer: Offer,
  signal: AbortSignal,
): Promise<Settled> {
  stopped(signal);
  const requested: Settled = await ctx.handle.trade.act.requestTrade(
    offer.guid,
  );
  if (requested.status !== "ok") return requested;
  for (const [index, item] of offer.picked.entries()) {
    stopped(signal);
    await ctx.handle.trade.act.offerItem(index, item.bag, item.slot);
  }
  if (offer.copper > 0) await ctx.handle.trade.act.offerGold(offer.copper);
  stopped(signal);
  const version = ctx.handle.trade.state().theirOffer.version;
  return await ctx.handle.trade.act.acceptTrade(version);
}

function tradeEnd(
  ctx: TradeCtx,
  offer: Offer,
): (control: {
  signal: AbortSignal;
}) => Promise<RunEnd<ToolResult<TradeAfter>>> {
  return async ({ signal }) => {
    let settled: Settled;
    try {
      settled = await ctx.rt.mutex.run(() => giveFlow(ctx, offer, signal));
    } finally {
      if (signal.aborted)
        await ctx.rt.mutex
          .run(() => ctx.handle.trade.act.cancelTrade())
          .catch(() => undefined);
    }
    if (settled.status !== "ok") throw refusalFor(settled, "give");
    return {
      status: "succeeded",
      summary: `gave to ${offer.name}`,
      value: result("DONE", {
        after: afterOf("give", {
          gold: offer.copper,
          items: offer.picked.map((item) => item.label),
          version: undefined,
          with: offer.name,
        }),
        detail: gaveDetail(offer),
      }),
    };
  };
}

export async function runGive(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const { copper, name, picked } = givePicks(ctx, args);
  const guid = resolvePlayer(ctx, name);
  const seen = playerName(ctx, guid);
  const run = ctx.rt.runs.start<ToolResult<TradeAfter>>({
    args: { do: "give", gold: copper, with: name },
    kind: "trade",
    launch: tradeEnd(ctx, { copper, guid, name: seen, picked }),
    toolCallId: ctx.toolCallId,
  });
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") {
    if (waited.end.status === "succeeded") return waited.end.value;
    throw new Error(waited.end.reason ?? waited.end.summary);
  }
  return result("RUNNING", {
    after: afterOf("give", {
      gold: copper,
      items: picked.map((item) => item.label),
      version: undefined,
      with: seen,
    }),
    body: [
      waited.why === "human"
        ? "The human wrote a message. Read it before you act."
        : "still waiting; end your turn and the run keeps going.",
    ],
    detail: `giving to ${seen}; run ${run.id} keeps going. End your turn, or ${nextCall("stop", { run: run.id })}.`,
    runId: run.id,
  });
}
