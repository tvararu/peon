import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/mail-actions";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

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

function context(
  args: Record<string, string>,
  handle: MockHandle,
): FlowContext & { handle: MockHandle } {
  handle.queryNearby = () => [boxRow(5)];
  jest.spyOn(handle.mail.act, "listMail").mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.mail.act, "queryNextMail")
    .mockResolvedValue({ status: "ok", unread: false });
  jest.spyOn(handle.mail.act, "sendMail").mockResolvedValue({ status: "ok" });
  return { args, handle, settle: settleWithin(200) };
}

function occupied(
  slot: number,
  guid: bigint,
  entry: number,
): { guid: bigint; item: { entry: number }; slot: number; status: "occupied" } {
  return {
    guid,
    item: { entry } as never,
    slot,
    status: "occupied",
  };
}

describe("mail-actions send", () => {
  test("sends the stack whose GUID was requested", async () => {
    const handle = createMockHandle();
    handle.getInventoryState = (() => ({
      slots: [occupied(23, 1001n, 159), occupied(24, 1002n, 159)],
    })) as never;
    const ctx = context(
      { do: "send", item0: "1002:159", to: "Target" },
      handle,
    );
    await flow.run(ctx);
    expect(handle.mail.act.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ guid: 1002n, slot: 24 }],
        receiver: "Target",
      }),
    );
  });

  test("refuses a stale GUID instead of substituting another stack", async () => {
    const handle = createMockHandle();
    handle.getInventoryState = (() => ({
      slots: [occupied(23, 1001n, 159)],
    })) as never;
    const ctx = context(
      { do: "send", item0: "9999:159", to: "Target" },
      handle,
    );
    const out = (await flow.run(ctx)) as { sent: unknown };
    expect(handle.mail.act.sendMail).not.toHaveBeenCalled();
    expect(out.sent).toMatchObject({ thrown: expect.stringContaining("9999") });
  });

  test("refuses two stale GUIDs for the same entry instead of sending one stack twice", async () => {
    const handle = createMockHandle();
    handle.getInventoryState = (() => ({
      slots: [occupied(23, 1001n, 159)],
    })) as never;
    const ctx = context(
      { do: "send", item0: "9998:159", item1: "9999:159", to: "Target" },
      handle,
    );
    const out = (await flow.run(ctx)) as { sent: unknown };
    expect(handle.mail.act.sendMail).not.toHaveBeenCalled();
    expect(out.sent).toMatchObject({ thrown: expect.any(String) });
  });

  test.each([
    ["1001:159", "0x3e9:159"],
    ["0x3E9:159", "1001:159"],
  ])(
    "refuses one stack spelled twice (%s, %s) and sends nothing",
    async (a, b) => {
      const handle = createMockHandle();
      handle.getInventoryState = (() => ({
        slots: [occupied(23, 1001n, 159)],
      })) as never;
      const ctx = context(
        { do: "send", item0: a, item1: b, to: "Target" },
        handle,
      );
      const out = (await flow.run(ctx)) as { sent: unknown };
      expect(handle.mail.act.sendMail).not.toHaveBeenCalled();
      expect(out.sent).toMatchObject({
        thrown: expect.stringContaining("duplicate item 1001"),
      });
    },
  );

  test("reports a malformed guid as a bad item, not a raw SyntaxError", async () => {
    const handle = createMockHandle();
    handle.getInventoryState = (() => ({
      slots: [occupied(23, 1001n, 159)],
    })) as never;
    const ctx = context({ do: "send", item0: "abc:159", to: "Target" }, handle);
    const out = (await flow.run(ctx)) as { sent: unknown };
    expect(handle.mail.act.sendMail).not.toHaveBeenCalled();
    expect(out.sent).toMatchObject({
      thrown: expect.stringContaining("bad item abc:159"),
    });
  });
});
