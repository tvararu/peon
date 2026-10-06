import { runOpen } from "#harness/areas/guildbank/tool-open";
import {
  type GuildBankAfter,
  type GuildBankArgs,
  type GuildBankCtx,
  type GuildBankDo,
  guildbankParams,
} from "#harness/areas/guildbank/tool-types";
import {
  runBuy,
  runDeposit,
  runDepositMoney,
  runLimits,
  runLog,
  runMove,
  runRename,
  runShow,
  runText,
  runWithdraw,
  runWithdrawMoney,
} from "#harness/areas/guildbank/tool-verbs";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
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

export function emptyGuildBank(): GuildBankAfter {
  return { do: "show", lines: [], money: undefined, tab: 0 };
}

export function guildbankRun(
  args: GuildBankArgs,
  ctx: GuildBankCtx,
): Promise<ToolResult<GuildBankAfter>> {
  const verb = (args.do ?? "show") as GuildBankDo;
  if (verb === "open") return runOpen(ctx);
  if (verb === "show") return runShow(ctx, args);
  if (verb === "buy") return runBuy(ctx, args);
  if (verb === "rename") return runRename(ctx, args);
  if (verb === "deposit_money") return runDepositMoney(ctx, args);
  if (verb === "withdraw_money") return runWithdrawMoney(ctx, args);
  if (verb === "deposit") return runDeposit(ctx, args);
  if (verb === "withdraw") return runWithdraw(ctx, args);
  if (verb === "move") return runMove(ctx, args);
  if (verb === "text") return runText(ctx, args);
  if (verb === "log") return runLog(ctx, args);
  if (verb === "limits") return runLimits(ctx);
  throw new Refusal({
    detail: `Unknown guildbank verb ${String(verb)}. Use open, show, buy, rename, deposit_money, withdraw_money, deposit, withdraw, move, text, log or limits.`,
    next: "guildbank(do: show)",
    reason: "unknown_verb",
  });
}

function guildbankCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "show",
      argText(args, "item") ?? argText(args, "copper"),
    ],
    theme,
    verb: "guildbank",
  });
}

function guildbankBody({ expanded, result: out }: BodyInit<GuildBankAfter>): string[] {
  if (!expanded) return [];
  return out.after.lines;
}

const guildbankRenderers: ToolRenderers<"guildbank", GuildBankAfter> = {
  renderCall: callRenderer(guildbankCall),
  renderResult: resultRenderer("guildbank", guildbankBody),
};

export const guildbankSpec: GameToolSpec<
  typeof guildbankParams,
  "guildbank",
  GuildBankAfter
> = {
  fallback: emptyGuildBank,
  kind: "action",
  maxLines: 30,
  minimalArgs: { do: "show" },
  name: "guildbank",
  parameters: guildbankParams,
  renderers: guildbankRenderers,
  run: guildbankRun,
  text: {
    description:
      "Use the guild vault: open it at a nearby guild vault, read tabs, buy and rename tabs, move copper and items in and out, move items between vault slots, and read the log, text and daily limits.",
    guidelines: [
      "Call open first at a guild vault, then show to read a tab before moving its items. A deposit names a carried item; a withdraw or move names the vault tab and slot from the last show.",
    ],
    label: "Guild bank",
  },
};

export const guildbankTool = defineGameTool(guildbankSpec);
