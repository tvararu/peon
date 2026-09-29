import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { AreaState, NamedInventoryState } from "@peon/core";
type TradeAnswer = "yes" | "busy" | "ignore";
import type { Occupied } from "#harness/areas/items/tool-resolve";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { parseRef } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { knownUnits } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const tradeParams = Type.Object({
  accept: Type.Optional(
    Type.Boolean({
      description: "For answer: false refuses the request. Default true.",
    }),
  ),
  do: Type.Optional(
    StringEnum(["give", "answer", "offer", "accept", "cancel", "show"], {
      description:
        "give: offer items and gold to a player and accept. answer: answer a request. offer: change your offer. accept: accept the open trade. cancel: cancel the trade. show: read both offers. Default show.",
    }),
  ),
  gold: Type.Optional(
    Type.Number({
      description: "For give and offer: copper to offer. Default 0.",
    }),
  ),
  items: Type.Optional(
    Type.Array(Type.String(), {
      description: "For give and offer: item names from journal bags.",
    }),
  ),
  version: Type.Optional(
    Type.Number({
      description:
        "For accept: the offer version from the last show. Omit to accept the latest.",
    }),
  ),
  with: Type.Optional(
    Type.String({
      description: 'For give: a player name or ref like "u3" from look.',
    }),
  ),
});

export type TradeArgs = Static<typeof tradeParams>;
export type TradeDo =
  | "give"
  | "answer"
  | "offer"
  | "accept"
  | "cancel"
  | "show";

export type TradeAfter = {
  do: TradeDo;
  with: string | undefined;
  items: string[];
  gold: number;
  version: number | undefined;
};

export type TradeCtx = ToolCtx<TradeAfter>;

export function emptyTrade(): TradeAfter {
  return {
    do: "show",
    gold: 0,
    items: [],
    version: undefined,
    with: undefined,
  };
}

type TradeState = AreaState<"trade">;

const TRADE_SLOTS = 6;
const TRADE_RANGE_YD = 11.11;
const ITEM_ID = /^item (\d+)$/i;

function refusalOf(reason: string, detail: string, next?: string): Refusal {
  return new Refusal({
    detail,
    next: next ?? nextCall("trade", { do: "show" }),
    reason,
  });
}

function bagsNext(): string {
  return nextCall("journal", { about: "bags" });
}

function lookNext(): string {
  return nextCall("look");
}

function occupied(state: NamedInventoryState): Occupied[] {
  return state.slots.filter(
    (slot): slot is Occupied => slot.status === "occupied",
  );
}

function itemLabel(held: Occupied): string {
  return held.item.name ?? `item ${held.item.entry ?? 0}`;
}

function pickCarried(
  ctx: TradeCtx,
  text: string,
): { bag: number; slot: number; label: string } {
  const trimmed = text.trim();
  const id = ITEM_ID.exec(trimmed)?.[1];
  const pool = occupied(ctx.handle.getInventoryState());
  const matches = pool.filter((held) =>
    id
      ? held.item.entry === Number(id)
      : held.item.name?.toLowerCase() === trimmed.toLowerCase(),
  );
  const near =
    matches.length > 0 || id
      ? matches
      : pool.filter((held) =>
          held.item.name?.toLowerCase().includes(trimmed.toLowerCase()),
        );
  if (near.length === 0)
    throw refusalOf(
      "no_such_item",
      `no carried item matches "${text}".`,
      bagsNext(),
    );
  if (near.length > 1)
    throw refusalOf(
      "ambiguous_item",
      `"${text}" matches more than one item; name one item.`,
      bagsNext(),
    );
  const held = near[0];
  if (!held)
    throw refusalOf(
      "no_such_item",
      `no carried item matches "${text}".`,
      bagsNext(),
    );
  if (held.region !== "backpack" && held.region !== "bag_item")
    throw refusalOf(
      "equipped_item",
      `${itemLabel(held)} is equipped; trade only carried items.`,
      bagsNext(),
    );
  return { bag: held.bag, label: itemLabel(held), slot: held.slot };
}

function resolvePlayer(ctx: TradeCtx, with_: string): bigint {
  const ref = parseRef(with_.trim());
  const players = knownUnits(ctx).filter((unit) => unit.kind === "player");
  const found = ref
    ? players.find((unit) => unit.ref === with_.trim())
    : players.find(
        (unit) => unit.name.toLowerCase() === with_.trim().toLowerCase(),
      );
  if (!found)
    throw refusalOf("not_seen", `no player "${with_}" is in view.`, lookNext());
  if (found.distance !== undefined && found.distance > TRADE_RANGE_YD)
    throw refusalOf(
      "too_far",
      `${found.name} is ${found.distance} yd away; trade needs 11.11 yd.`,
      lookNext(),
    );
  return BigInt(`0x${found.guid}`);
}

function playerName(ctx: TradeCtx, guid: bigint): string {
  const hex = guid.toString(16);
  const seen = knownUnits(ctx).find(
    (unit) => unit.kind === "player" && unit.guid.toLowerCase() === hex,
  );
  return seen?.name ?? `player ${guid.toString(10)}`;
}

type Settled =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "unanswered" }
  | { status: "superseded" };

function settleOutcome(
  outcome: Settled,
  verb: TradeDo,
  ok: TradeAfter,
): ToolResult<TradeAfter> {
  if (outcome.status === "ok")
    return result("DONE", { after: ok, detail: okDetail(verb, ok) });
  if (outcome.status === "unanswered")
    throw refusalOf("no_answer", "The trade went unanswered.", tradeNext(verb));
  if (outcome.status === "superseded")
    throw refusalOf(
      "superseded",
      "Another trade request arrived; read it first.",
      tradeNext(verb),
    );
  throw refusalOf(
    "trade_refused",
    `The trade was refused (${outcome.reason}).`,
    tradeNext(verb),
  );
}

function okDetail(verb: TradeDo, after: TradeAfter): string {
  return after.with ?? `${verb} done.`;
}

function tradeNext(verb: TradeDo): string {
  return nextCall("trade", { do: verb === "give" ? "show" : verb });
}

function throwUnlessOpen(ctx: TradeCtx): TradeState {
  const state = ctx.handle.trade.state();
  if (state.phase !== "open")
    throw refusalOf("no_trade", "No trade is open.", tradeNext("show"));
  return state;
}

function stateLines(ctx: TradeCtx, state: TradeState): string[] {
  const own = state.ownOffer.items.map(
    (item) =>
      `slot ${item.slot}: ${item.count ?? 1} ${ctx.handle.itemLabel(item.entry ?? 0).name ?? `item ${item.entry ?? 0}`}`,
  );
  const theirs = state.theirOffer.items.map(
    (item) =>
      `slot ${item.slot}: ${item.count ?? 1} ${ctx.handle.itemLabel(item.entry ?? 0).name ?? `item ${item.entry ?? 0}`}`,
  );
  return [
    `with: ${playerName(ctx, state.with ?? 0n)}`,
    `own offer: ${own.length === 0 ? "no items" : own.join(", ")}; ${state.ownOffer.gold} copper`,
    `their offer: ${theirs.length === 0 ? "no items" : theirs.join(", ")}; ${state.theirOffer.gold} copper`,
    `version ${state.theirOffer.version}; you ${state.selfAccepted ? "accepted" : "not accepted"}, they ${state.theyAccepted ? "accepted" : "not accepted"}`,
  ];
}

async function runShow(ctx: TradeCtx): Promise<ToolResult<TradeAfter>> {
  const state = ctx.handle.trade.state();
  const lines = stateLines(ctx, state);
  return result("DONE", {
    after: {
      do: "show",
      gold: state.ownOffer.gold,
      items: [],
      version: state.theirOffer.version,
      with: state.with === undefined ? undefined : playerName(ctx, state.with),
    },
    body: lines,
    detail:
      state.phase === "open"
        ? `Trade with ${playerName(ctx, state.with ?? 0n)}: ${lines[1] ?? ""}.`
        : "No trade is open.",
  });
}

async function runGive(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const with_ = args.with?.trim() ?? "";
  if (with_ === "")
    throw refusalOf(
      "missing_player",
      "Name the player to trade with.",
      lookNext(),
    );
  const names = args.items ?? [];
  if (names.length === 0 && (args.gold ?? 0) <= 0)
    throw refusalOf("missing_offer", "Name items or gold to give.", bagsNext());
  if (names.length > TRADE_SLOTS)
    throw refusalOf(
      "too_many_items",
      `A trade holds 6 items, not ${names.length}.`,
      bagsNext(),
    );
  const guid = resolvePlayer(ctx, with_);
  const picked = names.map((name) => pickCarried(ctx, name));
  const copper = args.gold ?? 0;
  if (!Number.isInteger(copper) || copper < 0)
    throw refusalOf(
      "bad_gold",
      `Gold ${copper} is not a copper amount.`,
      bagsNext(),
    );
  const coinage = ctx.handle.getInventoryState().coinage ?? 0;
  if (copper > coinage)
    throw refusalOf(
      "not_enough_gold",
      `Gold ${copper} is above the coinage ${coinage}.`,
      bagsNext(),
    );
  const name = playerName(ctx, guid);
  const run = ctx.rt.runs.start<ToolResult<TradeAfter>>({
    args: { do: "give", gold: copper, with: with_ },
    kind: "trade",
    launch: async () => ({
      status: "succeeded",
      summary: `gave to ${name}`,
      value: result("DONE", {
        after: {
          do: "give",
          gold: copper,
          items: picked.map((item) => item.label),
          version: undefined,
          with: name,
        },
        detail: `Gave ${name}.`,
      }),
    }),
    toolCallId: ctx.toolCallId,
  });
  try {
    const outcome = await ctx.rt.mutex.run(async () => {
      const requested = await ctx.handle.trade.act.requestTrade(guid);
      if (requested.status !== "ok")
        return settleOutcome(requested, "give", {
          do: "give",
          gold: copper,
          items: [],
          version: undefined,
          with: name,
        });
      for (const [index, item] of picked.entries())
        await ctx.handle.trade.act.offerItem(index, item.bag, item.slot);
      if (copper > 0) await ctx.handle.trade.act.offerGold(copper);
      const version = ctx.handle.trade.state().theirOffer.version;
      const accepted = await ctx.handle.trade.act.acceptTrade(version);
      return settleOutcome(accepted, "give", {
        do: "give",
        gold: copper,
        items: picked.map((item) => item.label),
        version,
        with: name,
      });
    });
    const waited = await awaitRun({ rt: ctx.rt, run });
    void waited;
    const labels = picked.map((item) => item.label);
    const gave =
      labels.length === 0
        ? `${copper} copper`
        : copper > 0
          ? `${labels.join(", ")} and ${copper} copper`
          : labels.join(", ");
    return { ...outcome, detail: `Gave ${gave} to ${name}.` };
  } catch (error) {
    ctx.rt.runs.cancel(run.id, "tool");
    throw error;
  } finally {
    ctx.rt.runs.release(run.id);
  }
}

async function runAnswer(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const answer: TradeAnswer = args.accept === false ? "busy" : "yes";
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.trade.act.answerTrade(answer),
  );
  return settleOutcome(outcome, "answer", {
    do: "answer",
    gold: 0,
    items: [],
    version: undefined,
    with: undefined,
  });
}

async function runOffer(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const state = throwUnlessOpen(ctx);
  const names = args.items ?? [];
  if (names.length > TRADE_SLOTS)
    throw refusalOf(
      "too_many_items",
      `A trade holds 6 items, not ${names.length}.`,
      bagsNext(),
    );
  const picked = names.map((name) => pickCarried(ctx, name));
  const copper = args.gold ?? state.ownOffer.gold;
  await ctx.rt.mutex.run(async () => {
    const wanted: Record<string, true> = {};
    for (const item of picked) wanted[`${item.bag}/${item.slot}`] = true;
    for (const held of state.ownOffer.items) {
      const slots = ctx.handle.getInventoryState().slots;
      const found = slots.find(
        (slot): slot is Extract<typeof slot, { status: "occupied" }> =>
          slot.status === "occupied" && slot.guid === held.guid,
      );
      if (found === undefined || wanted[`${found.bag}/${found.slot}`] !== true)
        await ctx.handle.trade.act.withdrawItem(held.slot);
    }
    for (const [index, item] of picked.entries()) {
      const slots = ctx.handle.getInventoryState().slots;
      const placed = slots.find(
        (slot): slot is Extract<typeof slot, { status: "occupied" }> =>
          slot.status === "occupied" &&
          slot.bag === item.bag &&
          slot.slot === item.slot,
      );
      const current = state.ownOffer.items.find(
        (held) => placed !== undefined && placed.guid === held.guid,
      );
      if (!current || current.slot !== index)
        await ctx.handle.trade.act.offerItem(index, item.bag, item.slot);
    }
    if (copper !== state.ownOffer.gold)
      await ctx.handle.trade.act.offerGold(copper);
  });
  return result("DONE", {
    after: {
      do: "offer",
      gold: copper,
      items: picked.map((item) => item.label),
      version: state.theirOffer.version,
      with: undefined,
    },
    detail: `Offered ${picked.map((item) => item.label).join(", ") || "nothing"} and ${copper} copper.`,
  });
}

async function runAccept(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  throwUnlessOpen(ctx);
  const version = args.version ?? ctx.handle.trade.state().theirOffer.version;
  try {
    const outcome = await ctx.rt.mutex.run(() =>
      ctx.handle.trade.act.acceptTrade(version),
    );
    return settleOutcome(outcome, "accept", {
      do: "accept",
      gold: 0,
      items: [],
      version,
      with: undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "offer_changed")
      throw refusalOf(
        "offer_changed",
        'Their offer changed; call trade with do "show" and accept the new version.',
        nextCall("trade", { do: "show" }),
      );
    throw error;
  }
}

async function runCancel(ctx: TradeCtx): Promise<ToolResult<TradeAfter>> {
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.trade.act.cancelTrade(),
  );
  return settleOutcome(outcome, "cancel", {
    do: "cancel",
    gold: 0,
    items: [],
    version: undefined,
    with: undefined,
  });
}

export async function runTrade(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const do_ = (args.do ?? "show") as TradeDo;
  if (do_ === "show") return runShow(ctx);
  if (do_ === "give") return runGive(args, ctx);
  if (do_ === "answer") return runAnswer(args, ctx);
  if (do_ === "offer") return runOffer(args, ctx);
  if (do_ === "accept") return runAccept(args, ctx);
  if (do_ === "cancel") return runCancel(ctx);
  throw refusalOf(
    "unknown_verb",
    `Unknown trade verb ${String(do_)}. Use give, answer, offer, accept, cancel or show.`,
  );
}

function tradeCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "show",
      argText(args, "with"),
      argText(args, "items"),
    ],
    theme,
    verb: "trade",
  });
}

function tradeBody({ after, expanded }: BodyInit<TradeAfter>): string[] {
  if (!expanded) return [];
  return [
    ...after.items.map((item) => `item: ${item}`),
    ...(after.gold > 0 ? [`gold: ${after.gold} copper`] : []),
  ];
}

export const tradeRenderers: ToolRenderers<"trade", TradeAfter> = {
  renderCall: callRenderer(tradeCall),
  renderResult: resultRenderer("trade", tradeBody),
};

export const tradeSpec: GameToolSpec<typeof tradeParams, "trade", TradeAfter> =
  {
    fallback: emptyTrade,
    kind: "run",
    minimalArgs: { do: "show" },
    name: "trade",
    parameters: tradeParams,
    renderers: tradeRenderers,
    run: runTrade,
    text: {
      description:
        "Trade items and gold with another player. Give items, answer a request, change your offer, accept or cancel the trade, and read both offers.",
      guidelines: [
        "Trade only with a player you see. Never give an item you did not name.",
        "Accept a trade only after you read both offers.",
      ],
      label: "Trade",
    },
  };

export const tradeTool = defineGameTool(tradeSpec);
