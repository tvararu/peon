import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  afterOf,
  completedText,
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

function raceAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("the trade was stopped"));
  const gate = Promise.withResolvers<T>();
  const onAbort = () => gate.reject(new Error("the trade was stopped"));
  signal.addEventListener("abort", onAbort, { once: true });
  pending.then(
    (value) => {
      signal.removeEventListener("abort", onAbort);
      gate.resolve(value);
    },
    (error: unknown) => {
      signal.removeEventListener("abort", onAbort);
      gate.reject(error);
    },
  );
  return gate.promise;
}

async function sendUnder<T>(
  ctx: TradeCtx,
  send: () => Promise<T>,
): Promise<{ sent: Promise<T>; settled: Promise<void> }> {
  const gate = Promise.withResolvers<void>();
  let sent!: Promise<T>;
  const released = ctx.rt.mutex.run(() => {
    try {
      sent = send();
    } finally {
      gate.resolve();
    }
  });
  released.catch(() => undefined);
  await released;
  return { sent, settled: gate.promise };
}

async function giveFlow(
  ctx: TradeCtx,
  offer: Offer,
  signal: AbortSignal,
): Promise<Settled> {
  stopped(signal);
  const request = await sendUnder(ctx, () =>
    ctx.handle.trade.act.requestTrade(offer.guid),
  );
  await request.settled;
  const requested: Settled = await raceAbort(request.sent, signal);
  if (requested.status !== "ok") return requested;
  for (const [index, item] of offer.picked.entries()) {
    stopped(signal);
    const offered = await sendUnder(ctx, () =>
      ctx.handle.trade.act.offerItem(index, item.bag, item.slot),
    );
    await offered.settled;
    await raceAbort(offered.sent, signal);
  }
  if (offer.copper > 0) {
    const gold = await sendUnder(ctx, () =>
      ctx.handle.trade.act.offerGold(offer.copper),
    );
    await gold.settled;
    await raceAbort(gold.sent, signal);
  }
  stopped(signal);
  const version = ctx.handle.trade.state().theirOffer.version;
  const accepted = await sendUnder(ctx, () =>
    ctx.handle.trade.act.acceptTrade(version),
  );
  await accepted.settled;
  return await raceAbort(accepted.sent, signal);
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
      settled = await giveFlow(ctx, offer, signal);
    } catch (error) {
      const phase = ctx.handle.trade.state().phase;
      if (
        phase === "open" ||
        phase === "requested_in" ||
        phase === "requested_out"
      )
        ctx.rt.mutex
          .run(() => ctx.handle.trade.act.cancelTrade())
          .catch(ignoreFailure);
      throw error;
    }
    if (settled.status !== "ok") throw refusalFor(settled, "give", offer.name);
    const last = ctx.handle.trade.state().lastOutcome;
    const detail =
      last?.kind === "completed"
        ? await completedText(ctx, last, signal, offer.name)
        : gaveDetail(offer);
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
        detail,
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
    detail: `Giving to ${seen}; run ${run.id} keeps going. End your turn, or ${nextCall("stop", { run: run.id })}.`,
    runId: run.id,
  });
}
