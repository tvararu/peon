import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaState } from "@peon/core";
import { mailSpec } from "#harness/areas/mail/tool";
import { mailParams } from "#harness/areas/mail/tool-types";
import {
  contentOf,
  objectRow,
  setUnits,
  toolCtx,
} from "#test-support/ops-fixtures";
import type { MockHandle } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { stocked } from "#test-support/trade-fixtures";
import { coinage } from "#test-support/vendor-fixtures";

const BOX = 0xf1_10_00_00_00_00_00_01n;
const FAR_BOX = 0xf1_10_00_00_00_00_00_02n;
const CLOTH = 0x40_00_00_00_00_00_0c_02n;

const BODY =
  "Meet at the inn at dusk and bring the ledger for the night watch. ".repeat(
    5,
  );

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
    id: 3,
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

function mailbox(handle: MockHandle, guid: bigint, distance: number): void {
  jest.spyOn(handle.objects, "state").mockReturnValue({
    displays: { get: () => undefined },
    lastMessage: undefined,
    pages: new Map(),
    pendingUse: undefined,
    templates: new Map([[1, { entry: 1, name: "Mailbox", type: 19 }]]),
    triggers: { catalog: "none", inside: [], map: undefined, sent: [] },
  } as never);
  setUnits(handle, [
    objectRow({ distance, guid, name: "Mailbox", x: 1, y: 1 }),
  ]);
}

function inboxOf(handle: MockHandle, mails: MailLetter[]): void {
  Object.assign(handle.mail, {
    state: () => ({ inbox: mails, unread: mails.length > 0 }),
  });
}

function mailActs(handle: MockHandle) {
  const act = handle.mail.act;
  return {
    listMail: jest.spyOn(act, "listMail").mockResolvedValue({ status: "ok" }),
    markMailRead: jest
      .spyOn(act, "markMailRead")
      .mockResolvedValue({ status: "ok" }),
    sendMail: jest
      .spyOn(act, "sendMail")
      .mockImplementation(async () => ({ status: "ok" })),
    takeMailItem: jest
      .spyOn(act, "takeMailItem")
      .mockImplementation(async () => ({ status: "ok" })),
    takeMailMoney: jest
      .spyOn(act, "takeMailMoney")
      .mockImplementation(async () => ({ status: "ok" })),
  };
}

async function world() {
  const t = await createTestRuntime({});
  mailbox(t.handle, BOX, 4);
  t.handle.itemLabel = (() => ({
    name: "Refreshing Spring Water",
    quality: 1,
  })) as never;
  const acts = mailActs(t.handle);
  return { ...t, acts };
}

describe("mail tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: mailParams },
        {
          arguments: mailSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(mailSpec.minimalArgs);
  });

  test("away from a mailbox every verb refuses and names the nearest box", async () => {
    for (const args of [
      { do: "check" },
      { do: "take", mail: 1 },
      { do: "send", text: "hi", to: "Fgkllpgpdnj" },
    ] as const) {
      const t = await world();
      mailbox(t.handle, FAR_BOX, 40);
      await expect(mailSpec.run(args, toolCtx(t))).rejects.toMatchObject({
        reason: "no_mailbox",
      });
      try {
        await mailSpec.run(args, toolCtx(t));
        expect.unreachable();
      } catch (error) {
        expect(String(error)).toContain("1, 1");
        expect(String(error)).toContain("40 yd away");
      }
      expect(t.acts.listMail).not.toHaveBeenCalled();
      expect(t.acts.takeMailMoney).not.toHaveBeenCalled();
      expect(t.acts.sendMail).not.toHaveBeenCalled();
    }
  });

  test("send with no known mailbox refuses without coordinates", async () => {
    const t = await world();
    setUnits(t.handle, []);
    const error = await mailSpec
      .run({ do: "send", text: "hi", to: "Fgk" }, toolCtx(t))
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ reason: "no_mailbox" });
    expect(String(error)).not.toContain("yd away");
    expect(t.acts.sendMail).not.toHaveBeenCalled();
  });

  test("check lists, marks each letter read and prints numbered letters", async () => {
    const t = await world();
    inboxOf(t.handle, [
      letter({
        body: BODY,
        cod: 300,
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
        subject: "Supplies for the watch",
      }),
    ]);
    const out = await mailSpec.run({ do: "check" }, toolCtx(t));
    expect(t.acts.listMail).toHaveBeenCalledWith(BOX);
    expect(t.acts.markMailRead).toHaveBeenCalledTimes(1);
    expect(t.acts.markMailRead).toHaveBeenCalledWith(3);
    expect(out.status).toBe("DONE");
    const text = contentOf(out);
    expect(text).toContain("Supplies for the watch");
    expect(text).toContain("250 copper");
    expect(text).toContain("COD 300 copper");
    expect(text).toContain("Refreshing Spring Water x5");
    expect(text).toContain(BODY.slice(0, 200));
    expect(text).not.toContain(BODY.slice(0, 201));
  });

  test("take collects money then every attachment in order", async () => {
    const t = await world();
    inboxOf(t.handle, [
      letter({
        id: 3,
        items: [
          {
            charges: 0,
            count: 1,
            durability: 0,
            enchants: [],
            entry: 159,
            guidLow: 11,
            index: 0,
            maxDurability: 0,
            randomProperty: 0,
            suffixFactor: 0,
          },
          {
            charges: 0,
            count: 2,
            durability: 0,
            enchants: [],
            entry: 160,
            guidLow: 12,
            index: 1,
            maxDurability: 0,
            randomProperty: 0,
            suffixFactor: 0,
          },
        ],
        money: 250,
      }),
    ]);
    const out = await mailSpec.run({ do: "take", mail: 1 }, toolCtx(t));
    expect(t.acts.takeMailMoney).toHaveBeenCalledWith(3);
    expect(t.acts.takeMailItem).toHaveBeenNthCalledWith(1, 3, 11, {
      payCod: false,
    });
    expect(t.acts.takeMailItem).toHaveBeenNthCalledWith(2, 3, 12, {
      payCod: false,
    });
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("250 copper");
  });

  test("take stops on an equip refusal with the gold already taken", async () => {
    const t = await world();
    inboxOf(t.handle, [
      letter({
        id: 3,
        items: [
          {
            charges: 0,
            count: 1,
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
      }),
    ]);
    t.acts.takeMailItem.mockResolvedValueOnce({
      status: "refused",
      why: "equip_error",
    });
    await expect(
      mailSpec.run({ do: "take", mail: 1 }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "equip_error" });
    expect(t.acts.takeMailMoney).toHaveBeenCalledWith(3);
    expect(t.acts.takeMailItem).toHaveBeenCalledTimes(1);
  });

  test("an equipped sword is not a carried attachment", async () => {
    const t = await world();
    stocked(t.handle, [
      {
        bag: 255,
        entry: 25,
        guid: CLOTH,
        name: "Worn Shortsword",
        slot: 16,
      },
    ]);
    await expect(
      mailSpec.run(
        { do: "send", items: ["Worn Shortsword"], to: "Fgk" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "no_such_item" });
    expect(t.acts.sendMail).not.toHaveBeenCalled();
  });
  test("the same stack named twice is refused before any send", async () => {
    const t = await world();
    stocked(t.handle, [
      {
        bag: 255,
        entry: 2589,
        guid: CLOTH,
        name: "Linen Cloth",
        slot: 25,
      },
    ]);
    await expect(
      mailSpec.run(
        { do: "send", items: ["Linen Cloth", "bag 255 slot 25"], to: "Fgk" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "duplicate_item" });
    expect(t.acts.sendMail).not.toHaveBeenCalled();
  });

  test("send posts the letter and reports the 30 copper postage", async () => {
    const t = await world();
    stocked(t.handle, [
      {
        bag: 255,
        entry: 2589,
        guid: CLOTH,
        name: "Linen Cloth",
        slot: 25,
      },
    ]);
    const out = await mailSpec.run(
      {
        copper: 100,
        do: "send",
        items: ["Linen Cloth"],
        subject: "Supplies",
        text: "for the watch",
        to: "Fgkllpgpdnj",
      },
      toolCtx(t),
    );
    expect(t.acts.sendMail).toHaveBeenCalledWith({
      body: "for the watch",
      items: [{ guid: CLOTH, slot: 0 }],
      mailbox: BOX,
      money: 100,
      receiver: "Fgkllpgpdnj",
      subject: "Supplies",
    });
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("30 copper");
  });

  test("send refuses an over-balance letter with the asked and carried amounts", async () => {
    const t = await world();
    stocked(t.handle, []);
    const failed = await mailSpec
      .run({ copper: 10_000, do: "send", to: "Fgkllpgpdnj" }, toolCtx(t))
      .then(
        () => undefined,
        (error: unknown) => error as { detail: string; reason: string },
      );
    expect(failed).toMatchObject({ reason: "not_enough_money" });
    expect(failed?.detail).toContain("10030");
    expect(failed?.detail).toContain("1000");
    expect(t.acts.sendMail).not.toHaveBeenCalled();
  });
  test("send reports the server shortfall when funds moved mid-send", async () => {
    const t = await world();
    coinage(t.handle, 20_000);
    t.acts.sendMail.mockResolvedValueOnce({
      status: "refused",
      why: "not_enough_money",
    });
    const failed = await mailSpec
      .run({ copper: 10_000, do: "send", to: "Fgkllpgpdnj" }, toolCtx(t))
      .then(
        () => undefined,
        (error: unknown) => error as { detail: string; reason: string },
      );
    expect(failed).toMatchObject({ reason: "not_enough_money" });
    expect(failed?.detail).toContain("10030");
    expect(t.acts.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ money: 10_000 }),
    );
  });

  test("send refuses with both amounts when funds drop while queued", async () => {
    const t = await world();
    coinage(t.handle, 20_000);
    let release!: () => void;
    const held = t.rt.mutex.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    await Promise.resolve();
    const pending = mailSpec
      .run({ copper: 10_000, do: "send", to: "Fgkllpgpdnj" }, toolCtx(t))
      .then(
        () => undefined,
        (error: unknown) => error as { detail: string; reason: string },
      );
    await Promise.resolve();
    await Promise.resolve();
    coinage(t.handle, 500);
    release();
    await held;
    const failed = await pending;
    expect(failed).toMatchObject({ reason: "not_enough_money" });
    expect(failed?.detail).toContain("10030");
    expect(failed?.detail).toContain("500");
    expect(t.acts.sendMail).not.toHaveBeenCalled();
  });
  test("send turns a runtime not_enough_money rejection into the detailed refusal", async () => {
    const t = await world();
    coinage(t.handle, 20_000);
    t.acts.sendMail.mockRejectedValueOnce(new Error("not_enough_money"));
    const failed = await mailSpec
      .run({ copper: 10_000, do: "send", to: "Fgkllpgpdnj" }, toolCtx(t))
      .then(
        () => undefined,
        (error: unknown) => error as { detail: string; reason: string },
      );
    expect(failed).toMatchObject({ reason: "not_enough_money" });
    expect(failed?.detail).toContain("10030");
    expect(failed?.detail).toContain("20000");
  });

  test("mail content fits the line cap", async () => {
    const t = await world();
    inboxOf(t.handle, [
      letter({ body: "x".repeat(900), id: 3, subject: "long" }),
    ]);
    const out = await mailSpec.run({ do: "check" }, toolCtx(t));
    expect(contentOf(out).split("\n").length).toBeLessThanOrEqual(31);
  });
});
