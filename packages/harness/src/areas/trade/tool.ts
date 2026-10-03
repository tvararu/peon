import { runGive } from "#harness/areas/trade/tool-give";
import {
  runAccept,
  runAnswer,
  runCancel,
  runOffer,
  runShow,
} from "#harness/areas/trade/tool-offer";
import {
  emptyTrade,
  refusalOf,
  type TradeAfter,
  type TradeArgs,
  type TradeCtx,
  type TradeDo,
  tradeParams,
} from "#harness/areas/trade/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export async function runTrade(
  args: TradeArgs,
  ctx: TradeCtx,
): Promise<ToolResult<TradeAfter>> {
  const verb = (args.do ?? "show") as TradeDo;
  if (verb === "show") return await runShow(ctx);
  if (verb === "give") return await runGive(args, ctx);
  if (verb === "answer") return await runAnswer(args, ctx);
  if (verb === "offer") return await runOffer(args, ctx);
  if (verb === "accept") return await runAccept(args, ctx);
  if (verb === "cancel") return await runCancel(ctx);
  throw refusalOf(
    "unknown_verb",
    `Unknown trade verb ${String(verb)}. Use give, answer, offer, accept, cancel or show.`,
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
        "Trade only with a player you see, and give only items you named. A named item goes as its whole stack: split first to give part.",
        "Accept a trade only after you read both offers.",
      ],
      label: "Trade",
    },
  };

export const tradeTool = defineGameTool(tradeSpec);
