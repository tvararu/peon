import type { AreaActsOf, AreaState } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import { noMailboxText, pickMailbox } from "#harness/areas/mail/tool-check";
import type {
  MailAfter,
  MailArgs,
  MailCtx,
} from "#harness/areas/mail/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type MailLetter = AreaState<"mail">["inbox"][number];
type MailOutcome = Awaited<ReturnType<AreaActsOf<"mail">["takeMailMoney"]>>;

export const EQUIP_INVENTORY_FULL = 50;

function takeRefusal(reason: string, detail: string): Refusal {
  return new Refusal({
    detail,
    next: nextCall("mail", { do: "check" }),
    reason,
  });
}

function settledOf(outcome: MailOutcome, kind: string, id: number): void {
  if (outcome.status === "ok") return;
  if (outcome.status === "unanswered")
    throw takeRefusal("no_answer", `Letter ${id} went unanswered.`);
  if (outcome.why === "equip_error")
    throw takeRefusal(
      "equip_error",
      `The mail ${kind} of letter ${id} hit an equip error; check its log row.`,
    );
  throw takeRefusal(
    "mail_refused",
    `The mail ${kind} of letter ${id} was refused (${outcome.why}).`,
  );
}

export function takeTargets(
  inbox: readonly MailLetter[],
  mail: MailArgs["mail"],
): MailLetter[] {
  if (typeof mail === "number") {
    const letter = inbox[mail - 1];
    if (letter === undefined)
      throw takeRefusal(
        "no_such_mail",
        `Letter ${mail} is not waiting; call check first.`,
      );
    return [letter];
  }
  return [...inbox];
}

export async function takeLetter(
  ctx: MailCtx,
  letter: MailLetter,
  payCod: boolean,
): Promise<string[]> {
  const act = ctx.handle.mail.act;
  const taken: string[] = [];
  if (letter.money > 0) {
    const money = await ctx.rt.mutex.run(async () => {
      ctx.signal.throwIfAborted();
      return await abortable(act.takeMailMoney(letter.id), ctx.signal);
    });
    settledOf(money, "money take", letter.id);
    taken.push(`${letter.money} copper from letter ${letter.id}`);
  }
  const items = [...letter.items];
  for (const item of items) {
    const outcome = await ctx.rt.mutex.run(async () => {
      ctx.signal.throwIfAborted();
      return await abortable(
        act.takeMailItem(letter.id, item.guidLow, { payCod }),
        ctx.signal,
      );
    });
    settledOf(outcome, "item take", letter.id);
    taken.push(`${item.count} of item ${item.entry} from letter ${letter.id}`);
  }
  return taken;
}

export async function runTake(
  args: MailArgs,
  ctx: MailCtx,
): Promise<ToolResult<MailAfter>> {
  const picked = pickMailbox(ctx);
  if (!picked.found)
    throw takeRefusal("no_mailbox", noMailboxText(picked.known));
  const payCod = args.pay_cod ?? false;
  const targets = takeTargets(ctx.handle.mail.state().inbox, args.mail);
  const taken: string[] = [];
  for (const letter of targets)
    taken.push(...(await takeLetter(ctx, letter, payCod)));
  const detail =
    taken.length === 0
      ? "Nothing to collect."
      : `Collected ${taken.join("; ")}.`;
  return result("DONE", {
    after: { do: "take", letters: targets.length, sentTo: undefined, taken },
    body: taken,
    detail,
  });
}
