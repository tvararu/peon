import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { mailHarness } from "#harness/areas/mail/area";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function draftsOf(event: unknown) {
  return areaDrafts(
    areaRuleSet(),
    { area: "mail", event } as unknown as AreaEvent,
    testRuleInput(),
  );
}

const SENDER = {
  delay: 0,
  entry: 0,
  guid: 0x2an,
  stationery: 41,
  type: 0,
};

describe("mail harness rules", () => {
  test("it exposes every mail act to the world", () => {
    expect(mailHarness.worldActs).toEqual([
      "listMail",
      "markMailRead",
      "queryNextMail",
      "takeMailMoney",
      "takeMailItem",
      "returnMail",
      "deleteMail",
      "copyMailText",
      "sendMail",
    ]);
  });

  test("a new mail event gives one passive mail/new row", () => {
    const rows = draftsOf({ type: "new_mail" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "passive",
      domain: "mail",
      event: "mail/new",
    });
  });

  test("next-mail-time with senders gives one passive mail/new row", () => {
    const rows = draftsOf({
      senders: [SENDER],
      type: "next_time",
      unread: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ class: "passive", event: "mail/new" });
  });

  test("next-mail-time with no senders gives no row", () => {
    expect(
      draftsOf({ senders: [], type: "next_time", unread: false }),
    ).toHaveLength(0);
  });

  test("a listed inbox gives one log row with the letter count", () => {
    const rows = draftsOf({
      hidden: 0,
      inbox: [{ id: 1 }, { id: 2 }],
      type: "listed",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ class: "log", event: "mail/listed" });
    expect(rows[0]?.data).toMatchObject({ count: 2 });
  });

  test("an ok take result gives a log row for money and for an item", () => {
    const money = draftsOf({
      result: { action: "money_taken", id: 7, status: "ok" },
      type: "result",
    });
    expect(money).toHaveLength(1);
    expect(money[0]).toMatchObject({ class: "log", event: "mail/taken" });
    const item = draftsOf({
      result: {
        action: "item_taken",
        count: 5,
        id: 7,
        itemLow: 9,
        status: "ok",
      },
      type: "result",
    });
    expect(item).toHaveLength(1);
    expect(item[0]).toMatchObject({ class: "log", event: "mail/taken" });
    expect(item[0]?.data).toMatchObject({ count: 5, id: 7 });
  });

  test("an ok send result gives a log row", () => {
    const rows = draftsOf({
      result: { action: "send", id: 0, status: "ok" },
      type: "result",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ class: "log", event: "mail/sent" });
  });

  test("a refused result gives a wake row that names the reason", () => {
    const rows = draftsOf({
      result: { action: "send", id: 0, status: "recipient_not_found" },
      type: "result",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ class: "wake", event: "mail/refused" });
    expect(rows[0]?.text).toContain("recipient_not_found");
  });

  test("an ok return, delete or copy result adds no row", () => {
    for (const action of ["returned_to_sender", "deleted", "made_permanent"])
      expect(
        draftsOf({ result: { action, id: 3, status: "ok" }, type: "result" }),
      ).toHaveLength(0);
  });
});
