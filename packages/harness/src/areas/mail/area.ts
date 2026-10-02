import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type MailEvent = AreaEventOf<"mail">;

function takenRow(id: number, extra: Record<string, unknown>): AreaDraft {
  return {
    class: "log",
    data: { id, ...extra },
    name: "taken",
    text: `Took attachments from letter ${id}.`,
  };
}

type MailResult = Extract<MailEvent, { type: "result" }>["result"];

function resultRow(result: MailResult): AreaDraft[] {
  if (result.status === "ok") {
    if (result.action === "money_taken") return [takenRow(result.id, {})];
    if (result.action === "item_taken" && "itemLow" in result)
      return [
        takenRow(result.id, {
          ...("count" in result ? { count: result.count } : {}),
          itemLow: result.itemLow,
        }),
      ];
    if (result.action === "send") {
      const sent: AreaDraft = {
        class: "log",
        data: {},
        name: "sent",
        text: "The letter was sent.",
      };
      return [sent];
    }
    return [];
  }
  return [
    {
      class: "wake",
      data: { action: result.action, id: result.id, reason: result.status },
      name: "refused",
      text: `The mail ${result.action === "send" ? "send" : "take"} was refused (${result.status}).`,
    },
  ];
}

function onEvent(event: MailEvent, _rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "result") return resultRow(event.result);
  if (event.type === "new_mail")
    return [
      { class: "passive", data: {}, name: "new", text: "New mail arrived." },
    ];
  if (event.type === "next_time") {
    if (!event.unread && event.senders.length === 0) return [];
    return [
      {
        class: "passive",
        data: {},
        name: "new",
        text: "Unread mail is waiting.",
      },
    ];
  }
  if (event.type === "listed") {
    const count = event.inbox.length;
    return [
      {
        class: "log",
        data: { count, hidden: event.hidden },
        name: "listed",
        text: `The inbox holds ${count} letter${count === 1 ? "" : "s"}.`,
      },
    ];
  }
  return [];
}

export const mailHarness = defineHarnessArea({
  area: "mail",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
  worldActs: [
    "listMail",
    "markMailRead",
    "queryNextMail",
    "takeMailMoney",
    "takeMailItem",
    "returnMail",
    "deleteMail",
    "copyMailText",
    "sendMail",
  ],
});
