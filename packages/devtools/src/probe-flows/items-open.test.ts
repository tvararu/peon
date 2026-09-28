import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/items-open";

type Inventory = ReturnType<WorldHandle["getInventoryState"]>;
type Opened = Awaited<ReturnType<WorldHandle["items"]["act"]["open"]>>;

const LETTER = 0x40_00_00_00_00_00_00_01n;
const READ = {
  observedAt: 5,
  reason: undefined,
  request: {
    entry: 889,
    from: { bag: 255, slot: 23 },
    itemGuid: LETTER,
    kind: "read" as const,
    requestedAt: 1,
  },
  status: "ok" as const,
};
const LOOT: Opened = {
  guid: LETTER,
  invalidatedReason: undefined,
  items: [],
  lootType: 1,
  money: 57,
  openedAt: 5,
  phase: "open",
};

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  const inventory = {
    slots: [
      {
        bag: 255,
        guid: LETTER,
        item: { entry: 889, guid: LETTER },
        region: "backpack",
        slot: 23,
        status: "occupied",
      },
    ],
    status: "complete",
  } as unknown as Inventory;
  handle.getInventoryState = jest.fn(() => inventory);
  return { args, handle, settle: settleWithin(200) };
}

describe("items-open flow", () => {
  test("do=read reads the item at bag:slot and prints the outcome", async () => {
    const ctx = context({ do: "read", slot: "23" });
    const read = jest
      .spyOn(ctx.handle.items.act, "read")
      .mockResolvedValue(READ);
    expect(await flow.run(ctx)).toMatchObject({
      do: "read",
      outcome: { request: { itemGuid: "0x4000000000000001" }, status: "ok" },
    });
    expect(read).toHaveBeenCalledWith({ bag: 255, slot: 23 });
  });

  test("do=open opens the container and prints the loot window", async () => {
    const ctx = context({ bag: "255", do: "open", slot: "23" });
    const open = jest
      .spyOn(ctx.handle.items.act, "open")
      .mockResolvedValue(LOOT);
    expect(await flow.run(ctx)).toMatchObject({
      do: "open",
      outcome: { money: 57, phase: "open" },
    });
    expect(open).toHaveBeenCalledWith({ bag: 255, slot: 23 });
  });

  test("do=text queries the text of the item at bag:slot", async () => {
    const ctx = context({ do: "text", slot: "23" });
    const text = jest
      .spyOn(ctx.handle.items.act, "queryText")
      .mockResolvedValue("Dear Mother");
    expect(await flow.run(ctx)).toEqual({
      do: "text",
      guid: "0x4000000000000001",
      outcome: "Dear Mother",
    });
    expect(text).toHaveBeenCalledWith(LETTER);
  });

  test("refuses an unknown do, a missing slot and an empty slot", async () => {
    await expect(
      Promise.resolve(flow.run(context({ do: "drop" }))),
    ).rejects.toThrow("do=");
    await expect(
      Promise.resolve(flow.run(context({ do: "read" }))),
    ).rejects.toThrow("slot=");
    await expect(
      Promise.resolve(flow.run(context({ do: "text", slot: "30" }))),
    ).rejects.toThrow("holds no item");
  });
});
