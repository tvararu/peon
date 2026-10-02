import type { AreaState } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import type {
  MailAfter,
  MailboxPick,
  MailCtx,
} from "#harness/areas/mail/tool-types";
import { objectRows } from "#harness/areas/objects/reads";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export type MailLetter = AreaState<"mail">["inbox"][number];

export const MAIL_LINES_SHOWN = 10;

function boxRefusal(
  reason: string,
  detail: string,
  extra: Record<string, string> = {},
): Refusal {
  return new Refusal({
    detail,
    next: nextCall("mail", { do: "check", ...extra }),
    reason,
  });
}

export function pickMailbox(ctx: MailCtx): MailboxPick {
  const boxes = objectRows(ctx).filter((row) => row.type === 19);
  const near = boxes
    .filter((row) => row.distance !== undefined)
    .sort((left, right) => (left.distance ?? 0) - (right.distance ?? 0));
  const first = near[0];
  if (first && (first.distance ?? 11) <= 10)
    return { found: true, guid: first.guid };
  return { found: false, known: near };
}

export function noMailboxText(
  known: readonly { distance: number | undefined; name: string }[],
): string {
  if (known.length === 0)
    return "No mailbox is known nearby. Walk to a mailbox and call again.";
  const [nearest] = [...known].sort(
    (left, right) => (left.distance ?? 0) - (right.distance ?? 0),
  );
  if (nearest === undefined)
    return "No mailbox is known nearby. Walk to a mailbox and call again.";
  const where =
    nearest.distance === undefined ? "" : ` ${nearest.distance} yd away`;
  return (
    `No mailbox is close enough. The nearest known mailbox is ${nearest.name}${where}. ` +
    "Walk to it with travel, then call again."
  );
}

export function letterLine(
  position: number,
  mail: MailLetter,
  labelOf: (entry: number) => string | undefined,
): string {
  const sender =
    mail.sender.kind === "player"
      ? `player ${mail.sender.guid.toString(10)}`
      : `creature entry ${mail.sender.entry}`;
  const head = `${position}. ${sender}: ${mail.subject}`;
  const attachments = [
    ...(mail.money > 0 ? [`${mail.money} copper`] : []),
    ...(mail.cod > 0 ? [`COD ${mail.cod} copper`] : []),
    ...mail.items.map((item) => {
      const name = labelOf(item.entry) ?? `item ${item.entry}`;
      return item.count > 1 ? `${name} x${item.count}` : name;
    }),
  ];
  const body = mail.body.slice(0, 200);
  const detail = attachments.length > 0 ? ` (${attachments.join(", ")})` : "";
  return `${head}${detail}, ${mail.daysLeft} days left\n   ${body}`;
}

export async function runCheck(ctx: MailCtx): Promise<ToolResult<MailAfter>> {
  const picked = pickMailbox(ctx);
  if (!picked.found)
    throw boxRefusal("no_mailbox", noMailboxText(picked.known));
  const act = ctx.handle.mail.act;
  const listed = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.listMail(picked.guid), ctx.signal);
  });
  if (listed.status !== "ok")
    throw boxRefusal("no_answer", "The mailbox did not answer the list.");
  const inbox = [...ctx.handle.mail.state().inbox];
  const shown = inbox.slice(0, MAIL_LINES_SHOWN);
  await ctx.rt.mutex.run(async () => {
    for (const mail of shown) {
      ctx.signal.throwIfAborted();
      await abortable(act.markMailRead(mail.id), ctx.signal);
    }
  });
  const body = shown.map((mail, index) =>
    letterLine(index + 1, mail, (entry) => ctx.handle.itemLabel(entry).name ?? undefined),
  );
  const detail =
    inbox.length === 0
      ? "The inbox is empty."
      : `${inbox.length} letter${inbox.length === 1 ? "" : "s"} waiting.`;
  return result("DONE", {
    after: { do: "check", letters: inbox.length, sentTo: undefined, taken: [] },
    body,
    detail,
  });
}
