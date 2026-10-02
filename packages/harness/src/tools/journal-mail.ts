import type { AreaState } from "@peon/core";
import type { MailLine, MailView } from "#harness/contract/details";

type MailLetter = AreaState<"mail">["inbox"][number];

export const MAIL_LINES_SHOWN = 10;
const BODY_SHOWN = 200;

function senderOf(mail: MailLetter): string {
  if (mail.sender.kind === "player")
    return `player ${mail.sender.guid.toString(10)}`;
  return `creature entry ${mail.sender.entry}`;
}

function itemLabel(
  nameOf: (entry: number) => string | undefined,
  entry: number,
  count: number,
): string {
  const name = nameOf(entry) ?? `item ${entry}`;
  return count > 1 ? `${name} x${count}` : name;
}

export function mailViewOf(
  mails: readonly MailLetter[],
  unread: boolean,
  nameOf: (entry: number) => string | undefined,
): MailView {
  const lines: MailLine[] = mails.map((mail, position) => ({
    body: mail.body,
    cod: mail.cod,
    daysLeft: mail.daysLeft,
    items: mail.items.map((item) => ({
      count: item.count,
      entry: item.entry,
      name: itemLabel(nameOf, item.entry, item.count),
    })),
    line: position + 1,
    money: mail.money,
    sender: senderOf(mail),
    subject: mail.subject,
  }));
  return { lines, unread };
}

export function mailBodyOf(view: MailView): string[] {
  if (view.lines.length === 0)
    return [view.unread ? "Mail: empty, unread waiting." : "Mail: empty."];
  const rows = view.lines.slice(0, MAIL_LINES_SHOWN);
  return rows.flatMap((mail) => {
    const head = `${mail.line}. ${mail.sender}: ${mail.subject}`;
    const attachments = [
      ...(mail.money > 0 ? [`${mail.money} copper`] : []),
      ...(mail.cod > 0 ? [`COD ${mail.cod} copper`] : []),
      ...mail.items.map((item) => item.name),
    ];
    const body = mail.body.slice(0, BODY_SHOWN);
    return [
      attachments.length > 0 ? `${head} (${attachments.join(", ")})` : head,
      `   ${body}`,
    ];
  });
}
