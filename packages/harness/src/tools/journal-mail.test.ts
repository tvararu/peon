import { describe, expect, test } from "bun:test";
import type { AreaState } from "@peon/core";
import { journalTool } from "#harness/tools/journal";
import type { MockHandle } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const FIRST_SUBJECT = "Meet at the inn at dusk";
const LONG_BODY = "Meet at the inn at dusk and bring the ledger. ".repeat(6);

type MailLetter = AreaState<"mail">["inbox"][number];

function letter(over: Partial<MailLetter> = {}): MailLetter {
  return {
    body: "plain letter.",
    cod: 0,
    daysLeft: 30,
    flags: {
      codPayment: false,
      copied: false,
      hasBody: true,
      raw: 1,
      read: false,
      returned: false,
    },
    id: 1,
    items: [],
    money: 0,
    sender: { guid: 0x2an, kind: "player" },
    stationery: 41,
    subject: "plain letter",
    template: 0,
    type: 0,
    ...over,
  };
}

function inboxOf(handle: MockHandle, mails: MailLetter[]) {
  Object.assign(handle.mail, {
    state: () => ({ inbox: mails, unread: mails.length > 0 }),
  });
}

describe("journal about mail", () => {
  test("it lists the waiting letters with sender, subject and attachments", async () => {
    const t = await createTestRuntime();
    inboxOf(t.handle, [
      letter({
        body: LONG_BODY,
        id: 3,
        items: [
          {
            charges: 0,
            count: 5,
            durability: 0,
            enchants: [],
            entry: 159,
            guidLow: 11,
            index: 0,
            maxDurability: 0,
            randomProperty: 0,
            suffixFactor: 0,
          },
        ],
        money: 250,
        subject: FIRST_SUBJECT,
      }),
    ]);
    t.handle.itemLabel = (() => ({
      name: "Refreshing Spring Water",
      quality: 1,
    })) as never;
    const out = await runTool(journalTool.definition(t.rt), {
      about: "mail",
    });
    expect(out.details.result.status).toBe("DONE");
    expect(out.text).toContain(FIRST_SUBJECT);
    expect(out.text).toContain("inn at dusk");
    expect(out.text).toContain("250 copper");
    expect(out.text).toContain("Refreshing Spring Water");
    expect(out.details.result.after).toMatchObject({ about: "mail" });
    expect(out.text.split("\n").length).toBeLessThanOrEqual(24);
  });

  test("an empty inbox names the unread flag", async () => {
    const t = await createTestRuntime();
    inboxOf(t.handle, []);
    const out = await runTool(journalTool.definition(t.rt), {
      about: "mail",
    });
    expect(out.text).toContain("empty");
  });

  test("mail reads stay away from the mailbox", async () => {
    const t = await createTestRuntime();
    inboxOf(t.handle, []);
    const list = t.handle.mail.act.listMail;
    await runTool(journalTool.definition(t.rt), { about: "mail" });
    expect(t.handle.mail.act.listMail).toBe(list);
  });
});
