import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { gearParams, gearSpec, gearTool } from "#harness/areas/items/tool";
import { contentOf, limitProblem, toolCtx } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

type Occupied = {
  bag: number;
  entry: number | undefined;
  guid: bigint;
  name: string;
  slot: number;
};

const STAFF = 0x40_00_00_00_00_00_00_01n;
const BAG_SLOT = 0x40_00_00_00_00_00_00_02n;
const SHIRT = 0x40_00_00_00_00_00_00_03n;
const LETTER = 0x40_00_00_00_00_00_00_05n;
const CHEST = 0x40_00_00_00_00_00_00_06n;

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

function stocked(handle: MockHandle, items: Occupied[]): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    slots: slots(items),
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
    equip: jest.spyOn(act, "equip").mockResolvedValue(outcome("confirmed", 25)),
    equipTo: jest
      .spyOn(act, "equipTo")
      .mockResolvedValue(outcome("confirmed", 25)),
    move: jest.spyOn(act, "move").mockResolvedValue(outcome("confirmed", 25)),
    open: jest.spyOn(act, "open").mockResolvedValue({
      guid: BAG_SLOT,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 2,
      money: 0,
      openedAt: 0,
      phase: "open",
    }),
    queryText: jest.spyOn(act, "queryText").mockResolvedValue("Read me."),
    read: jest.spyOn(act, "read").mockResolvedValue({
      observedAt: 0,
      reason: undefined,
      request: {
        entry: 123,
        from: { bag: 255, slot: 35 },
        itemGuid: LETTER,
        kind: "read",
        requestedAt: 0,
      },
      status: "ok",
    }),
    setAmmo: jest
      .spyOn(act, "setAmmo")
      .mockResolvedValue(outcome("confirmed", 2512)),
    split: jest.spyOn(act, "split").mockResolvedValue(outcome("confirmed", 59)),
    unequip: jest
      .spyOn(act, "unequip")
      .mockResolvedValue(outcome("confirmed", 36)),
  };
}

describe("gear tool", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: gearParams },
        {
          arguments: gearSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(gearSpec.minimalArgs);
  });

  test("equip resolves by name and wears it", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 25, guid: STAFF, name: "Gnarled Staff", slot: 23 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "equip", item: "Gnarled Staff" },
      toolCtx(t),
    );
    expect(acts.equip).toHaveBeenCalledWith({ bag: 255, slot: 23 });
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toMatch(/^DONE Wearing Gnarled Staff/);
  });

  test("equip with a slot name equips by guid", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 25, guid: STAFF, name: "Gnarled Staff", slot: 23 },
    ]);
    const acts = itemActs(t.handle);
    await gearSpec.run(
      { do: "equip", item: "Gnarled Staff", slot: "main_hand" },
      toolCtx(t),
    );
    expect(acts.equipTo).toHaveBeenCalledWith(STAFF, 15);
  });

  test("equip resolves an item id or a bag and slot", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 25, guid: STAFF, name: "Gnarled Staff", slot: 23 },
      { bag: 19, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 2 },
    ]);
    const acts = itemActs(t.handle);
    await gearSpec.run({ do: "equip", item: "item 25" }, toolCtx(t));
    await gearSpec.run({ do: "equip", item: "bag 19 slot 2" }, toolCtx(t));
    expect(acts.equip.mock.calls as unknown[][]).toEqual([
      [{ bag: 255, slot: 23 }],
      [{ bag: 19, slot: 2 }],
    ]);
  });

  test("equip names the old item and where it went", async () => {
    const t = await createTestRuntime();
    const staff = {
      bag: 255,
      entry: 25,
      guid: STAFF,
      name: "Gnarled Staff",
      slot: 23,
    };
    const old = { bag: 255, entry: 35, guid: SHIRT, name: "Bent Staff" };
    stocked(t.handle, [{ ...old, slot: 15 }, staff]);
    const items = t.handle.items as unknown as { act: Record<string, unknown> };
    items.act = {
      ...items.act,
      equipTo: async () => {
        stocked(t.handle, [
          { ...staff, slot: 15 },
          { ...old, slot: 23 },
        ]);
        return outcome("confirmed", 25);
      },
    };
    const res = await gearSpec.run(
      { do: "equip", item: "Gnarled Staff", slot: "main_hand" },
      toolCtx(t),
    );
    expect(contentOf(res)).toMatch(
      /^DONE Wearing Gnarled Staff \(main hand\)\. Old: Bent Staff, now in bag 255 slot 23\./,
    );
  });

  test("a refused equip renders the result name and required level", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 2284, guid: CHEST, name: "Rat Cloth Cloak", slot: 23 },
    ]);
    const acts = itemActs(t.handle);
    acts.equip.mockResolvedValue(
      outcome("refused", 2284, "cant_equip_level_i"),
    );
    const rewards = t.handle.getRewardsState();
    t.handle.getRewardsState = () => ({
      ...rewards,
      lastInventoryError: {
        bagFull: false,
        inventoryFull: false,
        observedAt: 0,
        packet: {
          bagType: 0,
          detail: { kind: "level", requiredLevel: 10 },
          item1: CHEST,
          item2: 0n,
          kind: "error",
          result: 1,
        },
      },
    });
    const res = await gearSpec
      .run({ do: "equip", item: "Rat Cloth Cloak" }, toolCtx(t))
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "cant_equip_level_i" });
    expect(`${res.detail}`).toMatch(/level 10/);
  });

  test("unequip resolves a worn item by name", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 3 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "unequip", item: "Brown Linen Shirt" },
      toolCtx(t),
    );
    expect(acts.unequip).toHaveBeenCalledWith(3, undefined);
    expect(res.status).toBe("DONE");
  });

  test("unequip to bags lets the server pick the first free slot", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 3 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "unequip", item: "Brown Linen Shirt", to: "bags" },
      toolCtx(t),
    );
    expect(acts.unequip).toHaveBeenCalledWith(3, undefined);
    expect(acts.move).not.toHaveBeenCalled();
    expect(res.status).toBe("DONE");
  });

  test("unequip into a named bag still un-equips through autostore", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 36, guid: SHIRT, name: "Brown Linen Shirt", slot: 3 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "unequip", item: "Brown Linen Shirt", to: "bag 19 slot 0" },
      toolCtx(t),
    );
    expect(acts.unequip).toHaveBeenCalledWith(3, 19);
    expect(acts.move).not.toHaveBeenCalled();
    expect(res.status).toBe("DONE");
  });

  test("equip finds the worn item by guid", async () => {
    const t = await createTestRuntime();
    const first = {
      bag: 19,
      entry: 25,
      guid: STAFF,
      name: "Gnarled Staff",
      slot: 3,
    };
    const twin = {
      bag: 255,
      entry: 25,
      guid: BAG_SLOT,
      name: "Gnarled Staff",
      slot: 24,
    };
    stocked(t.handle, [first, twin]);
    const items = t.handle.items as unknown as { act: Record<string, unknown> };
    items.act = {
      ...items.act,
      equipTo: async () => {
        stocked(t.handle, [
          { ...first, slot: 15 },
          { ...twin, slot: 24 },
        ]);
        const worn = t.handle
          .getInventoryState()
          .slots.find(
            (slot) => slot.status === "occupied" && slot.guid === first.guid,
          );
        if (worn) (worn as { region: string }).region = "equipment";
        return outcome("confirmed", 25);
      },
    };
    const res = await gearSpec.run(
      { do: "equip", item: "bag 19 slot 3", slot: "main_hand" },
      toolCtx(t),
    );
    expect(contentOf(res)).toMatch(/^DONE Wearing Gnarled Staff \(main hand\)/);
  });
  test("two matching slots refuse even with the same id", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 25, guid: STAFF, name: "Linen Cloth", slot: 23 },
      { bag: 255, entry: 25, guid: BAG_SLOT, name: "Linen Cloth", slot: 24 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec
      .run({ do: "equip", item: "Linen Cloth" }, toolCtx(t))
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "ambiguous_item" });
    expect(acts.equip).not.toHaveBeenCalled();
  });

  test("unequip resolves a bag in a bag slot", async () => {
    const t = await createTestRuntime();
    const inventory = t.handle.getInventoryState();
    t.handle.getInventoryState = () => ({
      ...inventory,
      slots: [
        {
          bag: 255,
          guid: BAG_SLOT,
          item: { entry: 4496, guid: BAG_SLOT, name: "Pouch" },
          region: "bag",
          slot: 20,
          status: "occupied",
        } as never,
      ],
    });
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "unequip", item: "Pouch" },
      toolCtx(t),
    );
    expect(acts.unequip).toHaveBeenCalledWith(20, undefined);
    expect(res.status).toBe("DONE");
  });

  test("read returns the item text", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 123, guid: LETTER, name: "Letter", slot: 35 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run({ do: "read", item: "Letter" }, toolCtx(t));
    expect(acts.read).toHaveBeenCalledWith({ bag: 255, slot: 35 });
    expect(acts.queryText).toHaveBeenCalledWith(LETTER);
    expect(contentOf(res)).toMatch(/^DONE Read Letter: Read me\./);
  });

  test("ammo resolves by name and loads the entry", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 2512, guid: SHIRT, name: "Rough Arrow", slot: 26 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec.run(
      { do: "ammo", item: "Rough Arrow" },
      toolCtx(t),
    );
    expect(acts.setAmmo).toHaveBeenCalledWith(2512);
    expect(contentOf(res)).toMatch(/^DONE Rough Arrow loaded\./);
  });

  test("ammo refuses a slot whose entry is still unknown before any send", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: undefined, guid: SHIRT, name: "Arrows", slot: 26 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec
      .run({ do: "ammo", item: "bag 255 slot 26" }, toolCtx(t))
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "unknown_item" });
    expect(acts.setAmmo).not.toHaveBeenCalled();
  });

  test("an unknown item refuses before any send", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, []);
    const acts = itemActs(t.handle);
    const res = await gearSpec
      .run({ do: "equip", item: "Missing Sword" }, toolCtx(t))
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "no_such_item" });
    expect(acts.equip).not.toHaveBeenCalled();
  });

  test("an ambiguous name refuses before any send", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 25, guid: STAFF, name: "Cloth A", slot: 23 },
      { bag: 255, entry: 36, guid: SHIRT, name: "Cloth B", slot: 24 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec
      .run({ do: "equip", item: "Cloth" }, toolCtx(t))
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "ambiguous_item" });
    expect(acts.equip).not.toHaveBeenCalled();
  });

  test("an unknown slot name refuses before any send", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 25, guid: STAFF, name: "Gnarled Staff", slot: 23 },
    ]);
    const acts = itemActs(t.handle);
    const res = await gearSpec
      .run({ do: "equip", item: "Gnarled Staff", slot: "nose" }, toolCtx(t))
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "no_such_slot" });
    expect(acts.equipTo).not.toHaveBeenCalled();
  });

  test("a sending tool is kind action", async () =>
    expectSendKind(gearTool, { do: "equip", item: "x" }));
});
