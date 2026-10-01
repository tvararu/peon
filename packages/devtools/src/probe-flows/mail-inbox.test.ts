import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/mail-inbox";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type MailState = ReturnType<WorldHandle["mail"]["state"]>;

const BOX = 0xf1_10_00_00_00_00_00_01n;

function boxRow(distance: number | null): Row {
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance,
    entity: {
      entry: 32_349,
      guid: BOX,
      name: "Mailbox",
      objectType: 5,
      position: { mapId: 0, orientation: 0, x: 5, y: 0, z: 0 },
      rawFields: new Map(),
      scale: 1,
    },
    horizontalDistance: distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position: { mapId: 0, orientation: 0, x: 5, y: 0, z: 0 },
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: ["mailbox"],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function state(over: Partial<MailState> = {}): MailState {
  return {
    hidden: 0,
    inbox: [
      {
        body: "Meet me at the inn.",
        cod: 0,
        daysLeft: 29.5,
        flags: {
          codPayment: false,
          copied: false,
          hasBody: false,
          raw: 0,
          read: false,
          returned: false,
        },
        id: 101,
        items: [],
        money: 250,
        sender: { guid: 0x2an, kind: "player" },
        stationery: 41,
        subject: "Meet at the inn",
        template: 0,
        type: 0,
      },
    ],
    lastResult: undefined,
    mailbox: BOX,
    newMail: false,
    pending: undefined,
    senders: [],
    unread: true,
    ...over,
  };
}

function context(
  args: Record<string, string>,
  mailState: () => MailState = () => state(),
): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.queryNearby = () => [boxRow(30)];
  handle.walkTowardPoint = jest.fn(async () => ({
    pose: {
      mapId: 0,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 5,
      y: 0,
      z: 0,
    },
    status: "completed" as const,
    traveled: 25,
  }));
  jest.spyOn(handle.mail, "state").mockImplementation(mailState);
  jest.spyOn(handle.mail.act, "listMail").mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.mail.act, "markMailRead")
    .mockResolvedValue({ status: "ok" });
  jest.spyOn(handle.mail.act, "queryNextMail").mockResolvedValue({
    status: "ok",
    unread: true,
  });
  return { args, handle, settle: settleWithin(200) };
}

describe("mail-inbox flow", () => {
  test("walks to the mailbox, queries, lists, marks the first unread letter and lists again", async () => {
    const ctx = context({});
    const out = await flow.run(ctx);
    expect(ctx.handle.mail.act.queryNextMail).toHaveBeenCalledTimes(2);
    expect(ctx.handle.mail.act.listMail).toHaveBeenCalledTimes(2);
    expect(ctx.handle.mail.act.markMailRead).toHaveBeenCalledWith(101);
    expect(out).toMatchObject({
      first: { id: 101, subject: "Meet at the inn" },
      listed: { status: "ok" },
      marked: { status: "ok" },
    });
  });

  test("skips the mark when the inbox has no unread letter", async () => {
    const ctx = context({}, () =>
      state({
        inbox: [
          {
            body: "",
            cod: 0,
            daysLeft: 1,
            flags: {
              codPayment: false,
              copied: false,
              hasBody: false,
              raw: 1,
              read: true,
              returned: false,
            },
            id: 102,
            items: [],
            money: 0,
            sender: { guid: 0x2an, kind: "player" },
            stationery: 41,
            subject: "Read already",
            template: 0,
            type: 0,
          },
        ],
      }),
    );
    const out = await flow.run(ctx);
    expect(ctx.handle.mail.act.markMailRead).not.toHaveBeenCalled();
    expect(out).toMatchObject({
      first: null,
      marked: { skipped: "the inbox has no unread letter" },
    });
  });

  test("finds a mailbox by its gameobject template when no npc role names it", async () => {
    const ctx = context({});
    ctx.handle.queryNearby = () => [{ ...boxRow(30), roles: [] }];
    const templates = new Map([[32_349, { type: 19 }]]);
    jest
      .spyOn(ctx.handle.objects, "state")
      .mockReturnValue({ pendingUse: undefined, templates } as never);
    const out = await flow.run(ctx);
    expect(ctx.handle.mail.act.listMail).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ listed: { status: "ok" } });
  });

  test("throws when no mailbox is in view", () =>
    withFakeTimers(async () => {
      const ctx = context({});
      ctx.handle.queryNearby = () => [];
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "no mailbox is in view",
      );
    }));
});
