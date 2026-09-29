import {
  afterOf,
  type Picked,
  pickAll,
  playerName,
  refusalFor,
  refusalOf,
  resolvePlayer,
  type Settled,
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

function gaveDetail(picked: Picked[], copper: number, name: string): string {
  const labels = picked.map((item) => item.label);
  const gave =
    labels.length === 0
      ? `${copper} copper`
      : copper > 0
        ? `${labels.join(", ")} and ${copper} copper`
        : labels.join(", ");
  return `Gave ${gave} to ${name}.`;
}

function tradeEnd(
  ctx: TradeCtx,
  guid: bigint,
  picked: Picked[],
  copper: number,
  name: string,
): (control: {
  signal: AbortSignal;
}) => Promise<RunEnd<ToolResult<TradeAfter>>> {
  return async (control) => {
    const aborted = control.signal.aborted;
    const flow = async (): Promise<Settled> => {
      if (aborted) throw new Error("the trade was stopped");
      const requested: Settled = await ctx.handle.trade.act.requestTrade(guid);
      if (requested.status !== "ok") return requested;
      for (const [index, item] of picked.entries()) {
        if (aborted) throw new Error("the trade was stopped");
        await ctx.handle.trade.act.offerItem(index, item.bag, item.slot);
      }
      if (copper > 0) await ctx.handle.trade.act.offerGold(copper);
      if (aborted) throw new Error("the trade was stopped");
      const version = ctx.handle.trade.state().theirOffer.version;
      const accepted: Settled = await ctx.handle.trade.act.acceptTrade(version);
      return accepted;
    };
    let settled: Settled;
    try {
      settled = await ctx.rt.mutex.run(flow);
    } finally {
      if (aborted)
        await ctx.rt.mutex
          .run(() => ctx.handle.trade.act.cancelTrade())
          .catch(() => undefined);
    }
    if (settled.status !== "ok") throw refusalFor(settled, "give");
    return {
      status: "succeeded",
      summary: `gave to ${name}`,
      value: result("DONE", {
        after: afterOf("give", {
          gold: copper,
          items: picked.map((item) => item.label),
          version: undefined,
          with: name,
        }),
        detail: gaveDetail(picked, copper, name),
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
    launch: tradeEnd(ctx, guid, picked, copper, seen),
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
