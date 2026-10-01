import { describe, expect, jest, test } from "bun:test";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import type { WorldHandle } from "@peon/core";
type ItemsActs = WorldHandle["items"]["act"];
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/items-sets";

const SWORD = 0x40_00_00_00_00_00_00_01n;
const SETTLED = {
  index: 0,
  observedAt: 5,
  reason: undefined,
  request: {
    index: 0,
    items: [],
    kind: "create" as const,
    name: "Peon",
    requestedAt: 1,
  },
  setGuid: 9n,
  status: "saved" as const,
};

function inventory() {
  return {
    slots: Array.from({ length: 19 }, (_, slot) => ({
      bag: 255,
      guid: SWORD,
      item: { entry: 25, guid: SWORD },
      region: "equipment",
      slot,
      status: "occupied",
    })),
    status: "complete",
  } as unknown as ReturnType<MockHandle["getInventoryState"]>;
}

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.getInventoryState = jest.fn(() => inventory());
  return { args, handle, settle: settleWithin(200) };
}

describe("items-sets flow", () => {
  test("do=save saves index 0 as Peon and prints the worn guids and the list", async () => {
    const ctx = context({ do: "save", index: "0", name: "Peon" });
    const act = {
      deleteSet: jest.fn(),
      saveSet: jest.fn(() => Promise.resolve(SETTLED)),
      useSet: jest.fn(),
    };
    Object.assign(ctx.handle, {
      items: {
        act: act as unknown as ItemsActs,
        state: () => ({ sets: { sets: [{ index: 0, name: "Peon" }] } }),
      },
    });
    const saveSet = act.saveSet;
    expect(await flow.run(ctx)).toMatchObject({
      do: "save",
      outcome: { index: 0, status: "saved" },
    });
    expect(saveSet).toHaveBeenCalledWith({ index: 0, name: "Peon" });
  });

  test("do=use and do=delete name the index", async () => {
    const use = context({ do: "use", index: "2" });
    const useSet = jest.fn(() => Promise.resolve({ status: "ok" }));
    const deleteSet = jest.fn(() => Promise.resolve({ index: 2 }));
    Object.assign(use.handle, {
      items: {
        act: { useSet, deleteSet } as unknown as ItemsActs,
        state: () => ({ sets: { sets: [] } }),
      },
    });
    await flow.run(use);
    expect(useSet).toHaveBeenCalledWith(2);
    const drop = context({ do: "delete", index: "2" });
    Object.assign(drop.handle, {
      items: {
        act: { useSet, deleteSet } as unknown as ItemsActs,
        state: () => ({ sets: { sets: [] } }),
      },
    });
    await flow.run(drop);
    expect(deleteSet).toHaveBeenCalledWith(2);
  });

  test("refuses an unknown do, a missing index and a long name", async () => {
    await expect(
      Promise.resolve(flow.run(context({ do: "drop", index: "0" }))),
    ).rejects.toThrow("do=");
    await expect(
      Promise.resolve(flow.run(context({ do: "save" }))),
    ).rejects.toThrow("index=");
    await expect(
      Promise.resolve(
        flow.run(context({ do: "save", index: "10", name: "Peon" })),
      ),
    ).rejects.toThrow("index");
    await expect(
      Promise.resolve(
        flow.run(context({ do: "save", index: "0", name: "x".repeat(17) })),
      ),
    ).rejects.toThrow("name");
  });
});
