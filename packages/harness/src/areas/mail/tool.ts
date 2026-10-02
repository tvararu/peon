import { runCheck } from "#harness/areas/mail/tool-check";
import { runSend } from "#harness/areas/mail/tool-send";
import { runTake } from "#harness/areas/mail/tool-take";
import {
  type MailAfter,
  type MailArgs,
  type MailCtx,
  type MailDo,
  mailParams,
} from "#harness/areas/mail/tool-types";
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

export function emptyMail(): MailAfter {
  return { do: "check", letters: 0, sentTo: undefined, taken: [] };
}

export function mailRun(
  args: MailArgs,
  ctx: MailCtx,
): Promise<ToolResult<MailAfter>> {
  const verb = (args.do ?? "check") as MailDo;
  if (verb === "check") return runCheck(ctx);
  if (verb === "take") return runTake(args, ctx);
  if (verb === "send") return runSend(args, ctx);
  throw new Refusal({
    detail: `Unknown mail verb ${String(verb)}. Use check, take or send.`,
    next: "mail(do: check)",
    reason: "unknown_verb",
  });
}

function mailCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "check",
      argText(args, "to") ?? argText(args, "mail"),
    ],
    theme,
    verb: "mail",
  });
}

function mailBody({ expanded, result: out }: BodyInit<MailAfter>): string[] {
  if (!expanded) return [];
  if (out.after.do === "send" && out.after.sentTo)
    return [`sent to ${out.after.sentTo}`];
  return out.after.taken;
}

const mailRenderers: ToolRenderers<"mail", MailAfter> = {
  renderCall: callRenderer(mailCall),
  renderResult: resultRenderer("mail", mailBody),
};

export const mailSpec: GameToolSpec<typeof mailParams, "mail", MailAfter> = {
  fallback: emptyMail,
  kind: "action",
  maxLines: 30,
  minimalArgs: { do: "check" },
  name: "mail",
  parameters: mailParams,
  renderers: mailRenderers,
  run: mailRun,
  text: {
    description:
      "Read the letters waiting in your inbox, collect gold and items from them, or send a letter with gold or items at a mailbox within 10 yards.",
    guidelines: [
      "Call check first so letter numbers are known before taking. A take of all collects every waiting letter in order.",
    ],
    label: "Mail",
  },
};

export const mailTool = defineGameTool(mailSpec);
