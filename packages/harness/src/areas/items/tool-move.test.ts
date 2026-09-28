import { describe, expect, jest, type Mock, test } from "bun:test";
import type { NamedInventorySlot } from "@peon/core";
import { gearSpec } from "#harness/areas/items/tool";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

type Occupied = {
  bag: number;
  entry: number;
  guid: bigint;
  name: string;
  slot: number;
};

const WATER = 0x40_00_00_00_00_00_00_04n;
const SHIRT = 0x40_00_00_00_00_00_00_03n;

function slots(items: Occupied[]) {
  return items.map(
    (item) =>
      ({
        bag: item.bag,
        guid: item.guid,
        item: {
          contained: undefined,
          count: 1,
          durability: undefined,
          entry: item.entry,
          flags: 0,
          guid: item.guid,
          maxDurability: undefined,
          name: item.name,
          owner: undefined,
          quality: 1,
          randomPropertyId: 0,
        },
        region: item.bag === 255 && item.slot <= 22 ? "equipment" : "backpack",
        slot: item.slot,
        status: "occupied",
      }) as never,
  );
}

type Empty = Extract<NamedInventorySlot, { status: "empty" }>;

function empty(bag: number, slot: number): Empty {
  return {
    bag,
    region: bag === 255 ? "backpack" : "bag_item",
    slot,
    status: "empty",
  } as Empty;
}

function stocked(
  handle: MockHandle,
  items: Occupied[],
  free: readonly Empty[] = [],
): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    slots: [...slots(items), ...free],
  });
}

type MoveStatus = "confirmed" | "refused" | "no_change" | "unanswered";

function state(status: { status: MoveStatus; reason?: string }): never {
  return {
    last: {
      observedAt: 0,
      reason: status.reason,
      request: {
        count: 1,
        entry: 25,
        from: { bag: 255, slot: 23 },
        itemGuid: 1n,
        kind: "equip",
        requestedAt: 0,
        stackBefore: 1,
        target: undefined,
        to: undefined,
      },
      status: status.status,
    },
    pending: undefined,
  } as never;
}

function outcome(status: MoveStatus, entry: number, reason?: string): never {
  const seen = state({ reason, status }) as {
    last: { request: { entry: number } };
  };
  seen.last.request.entry = entry;
  return seen as never;
}

function itemActs(handle: MockHandle) {
  type ItemsHandle = { act: Record<string, unknown> };
  const items = handle.items as unknown as ItemsHandle;
  items.act = { ...items.act };
  const act = items.act;
  return {
    move: jest.spyOn(act, "move").mockResolvedValue(outcome("confirmed", 25)),
    split: jest.spyOn(act, "split").mockResolvedValue(outcome("confirmed", 59)),
    unequip: jest
      .spyOn(act, "unequip")
      .mockResolvedValue(outcome("confirmed", 36)),
  };
}

describe("gear tool move", () => {
  test("move parses a bag-slot destination", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 6948, guid: WATER, name: "Hearthstone", slot: 25 },
    ]);
    const acts = itemActs(t.handle);
    await gearSpec.run(
      { do: "move", item: "Hearthstone", to: "bag 19 slot 0" },
      toolCtx(t),
    );
    expect(acts.move).toHaveBeenCalledWith(
      { bag: 255, slot: 25 },
      { bag: 19, slot: 0 },
    );
  });

  test("move to a bag takes that bag's first empty slot", async () => {
    const t = await createTestRuntime();
    stocked(
      t.handle,
      [{ bag: 255, entry: 6948, guid: WATER, name: "Hearthstone", slot: 25 }],
      [empty(255, 30), empty(20, 4)],
    );
    const acts = itemActs(t.handle);
    await gearSpec.run(
      { do: "move", item: "Hearthstone", to: "bag 20" },
      toolCtx(t),
    );
    await gearSpec.run(
      { do: "move", item: "Hearthstone", to: "backpack" },
      toolCtx(t),
    );
    expect(acts.move.mock.calls as unknown[][]).toEqual([
      [
        { bag: 255, slot: 25 },
        { bag: 20, slot: 4 },
      ],
      [
        { bag: 255, slot: 25 },
        { bag: 255, slot: 30 },
      ],
    ]);
  });

  test("to bags searches every carried bag", async () => {
    const t = await createTestRuntime();
    stocked(
      t.handle,
      [{ bag: 255, entry: 6948, guid: WATER, name: "Hearthstone", slot: 25 }],
      [empty(19, 2)],
    );
    const acts = itemActs(t.handle);
    await gearSpec.run(
      { do: "move", item: "Hearthstone", to: "bags" },
      toolCtx(t),
    );
    expect(acts.move).toHaveBeenCalledWith(
      { bag: 255, slot: 25 },
      { bag: 19, slot: 2 },
    );
  });
});

describe("gear tool unequip to a slot", () => {
  test("unequip into a named bag autostores then moves into the named slot", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 3 },
    ]);
    const acts = itemActs(t.handle);
    const spies = acts as unknown as Record<
      string,
      Mock<(...args: unknown[]) => Promise<never>>
    >;
    spies["unequip"]?.mockImplementation(async () => {
      stocked(t.handle, [
        { bag: 19, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 2 },
      ]);
      return outcome("confirmed", 36);
    });
    spies["move"]?.mockImplementation(async () => {
      stocked(t.handle, [
        { bag: 19, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 0 },
      ]);
      return outcome("confirmed", 36);
    });
    const res = await gearSpec.run(
      { do: "unequip", item: "Brown Linen Shirt", to: "bag 19 slot 0" },
      toolCtx(t),
    );
    expect(acts.unequip).toHaveBeenCalledWith(3, 19);
    expect(acts.move).toHaveBeenCalledWith(
      { bag: 19, slot: 2 },
      { bag: 19, slot: 0 },
    );
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toMatch(/bag 19 slot 0/);
  });
  test("unequip to backpack sends bag 255 to autostore", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 3 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "unequip", item: "Brown Linen Shirt", to: "backpack" },
      toolCtx(t),
    );
    expect(acts.unequip).toHaveBeenCalledWith(3, 255);
    expect(acts.move).not.toHaveBeenCalled();
    expect(res.status).toBe("DONE");
  });

  test("unequip to a taken slot reports the autostore landing, not the slot", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 3 },
    ]);
    const acts = itemActs(t.handle);
    const spies = acts as unknown as Record<
      string,
      Mock<(...args: unknown[]) => Promise<never>>
    >;
    spies["unequip"]?.mockImplementation(async () => {
      stocked(t.handle, [
        { bag: 19, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 2 },
      ]);
      return outcome("confirmed", 36);
    });
    acts.move.mockResolvedValue(outcome("refused", 36, "inventory_full"));
    const res = await gearSpec
      .run(
        { do: "unequip", item: "Brown Linen Shirt", to: "bag 19 slot 0" },
        toolCtx(t),
      )
      .catch((error) => error);
    expect(acts.unequip).toHaveBeenCalledWith(3, 19);
    expect(acts.move).toHaveBeenCalledWith(
      { bag: 19, slot: 2 },
      { bag: 19, slot: 0 },
    );
    expect(res).toMatchObject({ reason: "inventory_full" });
  });
});

describe("gear tool split", () => {
  test("split parses a bag-slot destination", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 159, guid: WATER, name: "Water", slot: 24 },
    ]);
    const acts = itemActs(t.handle);
    await gearSpec.run(
      { count: 5, do: "split", item: "Water", to: "bag 19 slot 0" },
      toolCtx(t),
    );
    expect(acts.split).toHaveBeenCalledWith(
      { bag: 255, slot: 24 },
      { bag: 19, slot: 0 },
      5,
    );
  });

  test("split goes to the first empty slot the inventory shows", async () => {
    const t = await createTestRuntime();
    stocked(
      t.handle,
      [{ bag: 255, entry: 159, guid: WATER, name: "Water", slot: 24 }],
      [empty(19, 3), empty(20, 0)],
    );
    const acts = itemActs(t.handle);
    await gearSpec.run({ do: "split", item: "Water" }, toolCtx(t));
    expect(acts.split).toHaveBeenCalledWith(
      { bag: 255, slot: 24 },
      { bag: 19, slot: 3 },
      1,
    );
  });
});
