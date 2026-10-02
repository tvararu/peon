import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/items-wrap";

type Inventory = ReturnType<WorldHandle["getInventoryState"]>;

const PAPER = 0x40_00_00_00_00_00_00_01n;
const SWORD = 0x40_00_00_00_00_00_00_02n;

function slot(init: {
  at: number;
  guid: bigint;
  entry: number;
  count?: number;
}) {
  return {
    bag: 255,
    guid: init.guid,
    item: {
      count: init.count ?? 1,
      entry: init.entry,
      flagBits: { wrapped: init.entry === 5043 },
      guid: init.guid,
    },
    region: "backpack",
    slot: init.at,
    status: "occupied",
  };
}

function inventory(wrapped: boolean): Inventory {
  return {
    slots: [
      slot({ at: 24, count: wrapped ? 4 : 5, entry: 5042, guid: PAPER }),
      slot({ at: 25, entry: wrapped ? 5043 : 25, guid: SWORD }),
      { bag: 255, region: "backpack", slot: 26, status: "empty" },
    ],
    status: "complete",
  } as unknown as Inventory;
}

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
  wrap: ReturnType<typeof jest.fn>;
  query: ReturnType<typeof jest.fn>;
} {
  const handle = createMockHandle();
  handle.getInventoryState = jest.fn(() => inventory(false));
  const wrap = jest.fn(async () => {
    handle.getInventoryState = jest.fn(() => inventory(true));
    return { last: { status: "confirmed" }, pending: undefined };
  });
  const query = jest.fn(async (entry: number) =>
    entry === 6473
      ? { entry, inventoryType: 5, name: "Armor of the Fang" }
      : undefined,
  );
  Object.assign(handle, {
    items: { act: { querySetItemName: query, wrap } },
  });
  return { args, handle, query, settle: settleWithin(200), wrap };
}

describe("items-wrap flow", () => {
  test("do=wrap resolves entries to carried positions and reports the item afterwards", async () => {
    const ctx = context({ do: "wrap", gift: "5042", item: "25" });
    expect(await flow.run(ctx)).toMatchObject({
      after: {
        entry: 5043,
        guid: `0x${SWORD.toString(16)}`,
        wrapped: true,
      },
      gift: { bag: 255, slot: 24 },
      item: { bag: 255, slot: 25 },
      paper: { count: 4 },
    });
    expect(ctx.wrap).toHaveBeenCalledWith(
      { bag: 255, slot: 24 },
      { bag: 255, slot: 25 },
    );
  });

  test("a bag:slot argument names the position directly", async () => {
    const ctx = context({ do: "wrap", gift: "255:24", item: "255:24" });
    await flow.run(ctx);
    expect(ctx.wrap).toHaveBeenCalledWith(
      { bag: 255, slot: 24 },
      { bag: 255, slot: 24 },
    );
  });

  test("do=name returns the cached row, or null when the server stays silent", async () => {
    expect(await flow.run(context({ do: "name", entry: "6473" }))).toEqual({
      name: { entry: 6473, inventoryType: 5, name: "Armor of the Fang" },
    });
    const silent = context({ do: "name", entry: "25" });
    expect(await flow.run(silent)).toEqual({ name: null });
    expect(silent.query).toHaveBeenCalledWith(25);
  });

  test("refuses an unknown do, bad arguments and an entry that is not carried", async () => {
    expect(() => flow.run(context({ do: "gift" }))).toThrow("do=");
    expect(() => flow.run(context({ do: "name" }))).toThrow("entry=");
    expect(() => flow.run(context({ do: "name", entry: "x" }))).toThrow(
      "entry=",
    );
    expect(() => flow.run(context({ do: "wrap", item: "25" }))).toThrow(
      "gift=",
    );
    await expect(
      flow.run(context({ do: "wrap", gift: "5042", item: "999" })),
    ).rejects.toThrow("999");
    await expect(
      flow.run(context({ do: "wrap", gift: "5042", item: "255:99" })),
    ).rejects.toThrow("255:99");
  });
});
