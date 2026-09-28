import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/items-move";

type Inventory = ReturnType<WorldHandle["getInventoryState"]>;

const SWORD = 0x40_00_00_00_00_00_00_01n;
const SETTLED = {
  last: {
    observedAt: 5,
    reason: undefined,
    request: {
      count: 1,
      entry: 25,
      from: { bag: 255, slot: 23 },
      itemGuid: SWORD,
      kind: "equip" as const,
      requestedAt: 1,
      stackBefore: 1,
      target: undefined,
      to: undefined,
    },
    status: "confirmed" as const,
  },
  pending: undefined,
};

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  const inventory = {
    slots: [
      {
        bag: 255,
        guid: SWORD,
        item: { entry: 25, guid: SWORD },
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

function spy(handle: MockHandle, name: keyof MockHandle["items"]["act"]) {
  return jest.spyOn(handle.items.act, name).mockResolvedValue(SETTLED);
}

describe("items-move flow", () => {
  test("do=equip equips the item at bag:slot and prints the settled move", async () => {
    const ctx = context({ bag: "255", do: "equip", slot: "23" });
    const equip = spy(ctx.handle, "equip");
    expect(await flow.run(ctx)).toMatchObject({
      do: "equip",
      outcome: {
        last: {
          request: { itemGuid: "0x4000000000000001" },
          status: "confirmed",
        },
      },
    });
    expect(equip).toHaveBeenCalledWith({ bag: 255, slot: 23 });
  });

  test("do=equip_to reads the guid at bag:slot and names the equipment slot", async () => {
    const ctx = context({ do: "equip_to", slot: "23", to: "16" });
    const equipTo = spy(ctx.handle, "equipTo");
    await flow.run(ctx);
    expect(equipTo).toHaveBeenCalledWith(SWORD, 16);
  });

  test("do=unequip stores the slot into bag to, or any bag", async () => {
    const ctx = context({ do: "unequip", slot: "15" });
    const unequip = spy(ctx.handle, "unequip");
    await flow.run(ctx);
    await flow.run({ ...ctx, args: { do: "unequip", slot: "15", to: "19" } });
    expect(unequip.mock.calls).toEqual([
      [15, 0],
      [15, 19],
    ]);
  });

  test("do=move and do=split read to as bag:slot or a backpack slot", async () => {
    const ctx = context({ do: "move", slot: "23", to: "19:0" });
    const move = spy(ctx.handle, "move");
    const split = spy(ctx.handle, "split");
    await flow.run(ctx);
    await flow.run({
      ...ctx,
      args: { count: "5", do: "split", slot: "24", to: "30" },
    });
    expect(move).toHaveBeenCalledWith(
      { bag: 255, slot: 23 },
      { bag: 19, slot: 0 },
    );
    expect(split).toHaveBeenCalledWith(
      { bag: 255, slot: 24 },
      { bag: 255, slot: 30 },
      5,
    );
  });

  test("refuses an unknown do, a missing slot and an empty source", async () => {
    await expect(
      Promise.resolve(flow.run(context({ do: "drop" }))),
    ).rejects.toThrow("do=");
    await expect(
      Promise.resolve(flow.run(context({ do: "equip" }))),
    ).rejects.toThrow("slot=");
    await expect(
      Promise.resolve(
        flow.run(context({ do: "equip_to", slot: "30", to: "16" })),
      ),
    ).rejects.toThrow("holds no item");
  });
});
