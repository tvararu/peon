import { describe, expect, test } from "bun:test";
import { type Entity, EntityStore } from "#wow/entity-store";
import { readInventory } from "#wow/inventory";
import { ObjectType } from "#wow/protocol/entity-fields";

function entity(
  guid: bigint,
  objectType: ObjectType,
  fields: [number, number][],
  complete = true,
): Entity {
  return {
    guid,
    objectType,
    entry: 0,
    scale: 1,
    position: undefined,
    rawFields: new Map(fields),
    name: undefined,
    createComplete: complete,
  };
}

function view(entities: Entity[], selfGuid = 1n) {
  const byGuid = new Map(entities.map((value) => [value.guid, value]));
  return readInventory(selfGuid, (guid) => byGuid.get(guid));
}

describe("carried inventory authority", () => {
  test("distinguishes missing self, partial private fields, and complete empty inventory", () => {
    expect(view([]).status).toBe("unknown");
    const partial = view([entity(1n, ObjectType.PLAYER, [], false)]);
    expect(partial.status).toBe("partial");
    expect(partial.coinage).toBeUndefined();
    expect(partial.freeSlots).toBeUndefined();
    expect(
      partial.slots.find((slot) => slot.bag === 255 && slot.slot === 23)
        ?.status,
    ).toBe("unknown");
    const complete = view([entity(1n, ObjectType.PLAYER, [])]);
    expect(complete.status).toBe("complete");
    expect(complete.coinage).toBe(0);
    expect(complete.freeSlots).toBe(16);
    expect(
      complete.slots.find((slot) => slot.bag === 255 && slot.slot === 23)
        ?.status,
    ).toBe("empty");
    expect(view([entity(1n, ObjectType.UNIT, [[0x4_92, 100]])]).status).toBe(
      "unknown",
    );
    expect(
      readInventory(1n, () => entity(2n, ObjectType.PLAYER, [[0x4_92, 100]])),
    ).toMatchObject({ status: "unknown", coinage: undefined });
  });

  test("reads literal player, item, and container offsets without inventing stack count one", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [0x4_92, 987],
      [0x1_6a, 2],
      [0x1_72, 3],
    ]);
    const bag = entity(2n, ObjectType.CONTAINER, [
      [3, 100],
      [6, 1],
      [8, 1],
      [14, 1],
      [0x40, 2],
      [0x42, 4],
    ]);
    const packItem = entity(3n, ObjectType.ITEM, [
      [3, 200],
      [6, 1],
      [8, 1],
      [14, 7],
    ]);
    const bagItem = entity(4n, ObjectType.ITEM, [
      [3, 300],
      [6, 1],
      [8, 2],
      [14, 12],
    ]);
    const inventory = view([self, bag, packItem, bagItem]);
    expect(inventory.status).toBe("complete");
    expect(inventory.coinage).toBe(987);
    expect(inventory.freeSlots).toBe(16);
    expect(
      inventory.slots.find((slot) => slot.bag === 255 && slot.slot === 23),
    ).toMatchObject({
      status: "occupied",
      guid: 3n,
      item: { entry: 200, count: 7 },
    });
    expect(
      inventory.slots.find((slot) => slot.bag === 19 && slot.slot === 0),
    ).toMatchObject({
      status: "occupied",
      guid: 4n,
      item: { entry: 300, count: 12, contained: 2n },
    });
    expect(
      inventory.slots.find((slot) => slot.bag === 19 && slot.slot === 1)
        ?.status,
    ).toBe("empty");
    const missingItem = view([self, bag, packItem]);
    expect(missingItem.status).toBe("partial");
    expect(
      missingItem.slots.find((slot) => slot.bag === 19 && slot.slot === 0),
    ).toMatchObject({
      status: "occupied",
      guid: 4n,
      item: { count: undefined },
    });
  });

  test("requires both GUID halves unless complete CREATE establishes omitted zeros", () => {
    const self = entity(1n, ObjectType.PLAYER, [[0x1_72, 3]], false);
    expect(view([self]).slots.find((slot) => slot.slot === 23)?.status).toBe(
      "unknown",
    );
    const rawFields = new Map([...self.rawFields, [0x1_73, 0x80_00_00_00]]);
    expect(
      view([{ ...self, rawFields }]).slots.find((slot) => slot.slot === 23),
    ).toMatchObject({
      status: "occupied",
      guid: 0x8000000000000003n,
    });
  });

  test("rejects other owners, wrong contained chains, aliased items and impossible bag sizes", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [0x1_6a, 2],
      [0x1_72, 3],
      [0x1_74, 3],
    ]);
    const bag = entity(2n, ObjectType.CONTAINER, [
      [3, 100],
      [6, 1],
      [8, 1],
      [14, 1],
      [0x40, 37],
    ]);
    const otherItem = entity(3n, ObjectType.ITEM, [
      [3, 200],
      [6, 9],
      [8, 8],
      [14, 7],
    ]);
    const inventory = view([self, bag, otherItem]);
    expect(inventory.status).toBe("partial");
    expect(inventory.freeSlots).toBeUndefined();
    expect(inventory.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "owner_mismatch",
        "contained_mismatch",
        "duplicate_guid",
        "invalid_bag_size",
      ]),
    );
    expect(inventory.slots.find((slot) => slot.slot === 23)).toMatchObject({
      status: "occupied",
      item: { count: undefined },
    });
    expect(inventory.slots.some((slot) => slot.bag === 19)).toBe(false);
  });

  test("does not recursively follow a container cycle or count bank storage as carried", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [0x1_6a, 2],
      [0x1_92, 9],
      [0x1_f0, 3],
      [0x2_30, 4],
    ]);
    const bag = entity(2n, ObjectType.CONTAINER, [
      [3, 100],
      [6, 1],
      [8, 1],
      [14, 1],
      [0x40, 1],
      [0x42, 2],
    ]);
    const state = view([self, bag]);
    expect(state.issues.some((issue) => issue.code === "duplicate_guid")).toBe(
      true,
    );
    expect(
      state.bank?.slots.find((slot) => slot.bag === 255 && slot.slot === 39),
    ).toMatchObject({ region: "bank", status: "occupied", guid: 9n });
    expect(state.slots.some((slot) => slot.region === "bank")).toBe(false);
    expect(state.slots.find((slot) => slot.slot === 86)).toMatchObject({
      status: "occupied",
      guid: 3n,
    });
    expect(state.slots.find((slot) => slot.slot === 118)).toMatchObject({
      status: "occupied",
      guid: 4n,
    });
  });

  test("reads a bank bag's contents apart from the carried surface", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [0x4_92, 987],
      [0x1_ca, 5],
      [0x1_cc, 7],
    ]);
    const bag = entity(5n, ObjectType.CONTAINER, [
      [3, 100],
      [6, 1],
      [8, 1],
      [14, 1],
      [0x40, 2],
      [0x42, 6],
    ]);
    const stored = entity(6n, ObjectType.ITEM, [
      [3, 200],
      [6, 1],
      [8, 5],
      [14, 4],
    ]);
    const state = view([self, bag, stored]);
    const bank = state.bank;
    expect(
      bank?.slots.find((slot) => slot.bag === 255 && slot.slot === 67),
    ).toMatchObject({ region: "bankbag", status: "occupied", guid: 5n });
    expect(
      bank?.slots.find(
        (slot) => slot.region === "bank_bag_item" && slot.bag === 67,
      ),
    ).toMatchObject({ slot: 0, status: "occupied", guid: 6n });
    expect(
      bank?.slots.filter((slot) => slot.region === "bank_bag_item"),
    ).toHaveLength(2);
    expect(bank?.bags.find((entry) => entry.slot === 67)?.size).toBe(2);
    expect(state.slots.some((slot) => slot.region.startsWith("bank"))).toBe(
      false,
    );
  });

  test("keeps an unavailable bank bag out of carried completeness and free slots", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [0x4_92, 987],
      [0x1_ca, 5],
      [0x1_cc, 7],
    ]);
    const state = view([self]);
    expect(state.freeSlots).toBe(16);
    expect(state.bags.every((entry) => entry.size !== undefined)).toBe(true);
    expect(state.bank?.bags.some((entry) => entry.size === undefined)).toBe(
      true,
    );
  });

  test("does not count one equipped bag twice through two ambiguous addresses", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [0x1_6a, 2],
      [0x1_6c, 2],
    ]);
    const bag = entity(2n, ObjectType.CONTAINER, [
      [3, 100],
      [6, 1],
      [8, 1],
      [14, 1],
      [0x40, 2],
    ]);
    const state = view([self, bag]);
    expect(state.status).toBe("partial");
    expect(state.freeSlots).toBeUndefined();
    expect(
      state.bags
        .filter((candidate) => candidate.guid === 2n)
        .map((entry) => entry.status),
    ).toEqual(["unknown", "unknown"]);
    expect(state.slots.some((slot) => slot.region === "bag_item")).toBe(false);
  });

  test("tracks raw count and coinage updates without mutating a prior snapshot", () => {
    const store = new EntityStore();
    store.create(1n, ObjectType.PLAYER, {
      createComplete: true,
      rawFields: new Map([
        [0x4_92, 10],
        [0x1_72, 3],
      ]),
    });
    store.create(3n, ObjectType.ITEM, {
      createComplete: true,
      rawFields: new Map([
        [3, 200],
        [6, 1],
        [8, 1],
        [14, 2],
      ]),
    });
    const read = () => readInventory(1n, (guid) => store.get(guid));
    const before = read();
    store.update(1n, {}, new Map([[0x4_92, 19]]));
    store.update(3n, {}, new Map([[14, 5]]));
    const after = read();
    expect(before.coinage).toBe(10);
    expect(after.coinage).toBe(19);
    expect(before.slots.find((slot) => slot.slot === 23)).toMatchObject({
      item: { count: 2 },
    });
    expect(after.slots.find((slot) => slot.slot === 23)).toMatchObject({
      item: { count: 5 },
    });
  });
});

describe("item update fields", () => {
  const self = (fields: [number, number][] = []) =>
    entity(1n, ObjectType.PLAYER, [[0x1_72, 3], ...fields]);
  const packItem = (fields: [number, number][]) =>
    entity(3n, ObjectType.ITEM, [[3, 200], [6, 1], [8, 1], [14, 1], ...fields]);
  const itemOf = (entities: Entity[]) => {
    const found = view(entities).slots.find((slot) => slot.slot === 23);
    return found?.status === "occupied" ? found.item : undefined;
  };

  test("reads timed items", () => {
    const item = itemOf([
      self(),
      packItem([
        [10, 0x2a],
        [12, 0x2b],
        [15, 3600],
        [16, 0xff_ff_ff_ff],
        [17, 2],
      ]),
    ]);
    expect(item).toMatchObject({
      creator: 0x2an,
      giftCreator: 0x2bn,
      duration: 3600,
      spellCharges: [-1, 2, 0, 0, 0],
    });
  });

  test("reads the 12 enchantment slots", () => {
    const item = itemOf([
      self(),
      packItem([
        [22, 1900],
        [25, 2684],
        [26, 1800],
        [27, 5],
        [55, 3000],
        [56, 60],
        [57, 7],
      ]),
    ]);
    expect(item?.enchantments).toEqual([
      { slot: 0, id: 1900, duration: 0, charges: 0 },
      { slot: 1, id: 2684, duration: 1800, charges: 5 },
      { slot: 11, id: 3000, duration: 60, charges: 7 },
    ]);
  });

  test("names the flag bits", () => {
    const item = itemOf([
      self(),
      packItem([[21, 0x1 | 0x8 | 0x2_00 | 0x10_00]]),
    ]);
    expect(item?.flags).toBe(0x1 | 0x8 | 0x2_00 | 0x10_00);
    expect(item?.flagBits).toEqual({
      soulbound: true,
      wrapped: true,
      readable: true,
      refundable: true,
    });
    expect(itemOf([self(), packItem([[21, 0x1]])])?.flagBits).toEqual({
      soulbound: true,
      wrapped: false,
      readable: false,
      refundable: false,
    });
  });

  test("reads the loaded ammo", () => {
    expect(view([self([[0x4_ae, 2512]]), packItem([])]).ammoId).toBe(2512);
    expect(view([self(), packItem([])]).ammoId).toBe(0);
    expect(view([]).ammoId).toBeUndefined();
  });
});

describe("buyback slots", () => {
  const SLOT_74 = 324 + 2 * 74;
  const PRICE_1 = 1201;
  const SOLD_AT_1 = 1213;

  test("reads buyback slot 74 with its price and sale time, outside the carried slots (update-fields.ts:264, 307-308)", () => {
    const sold = 0x40_00_00_00_00_00_00_07n;
    const before = view([entity(1n, ObjectType.PLAYER, [])]);
    const state = view([
      entity(1n, ObjectType.PLAYER, [
        [SLOT_74, Number(sold & 0xff_ff_ff_ffn)],
        [SLOT_74 + 1, Number(sold >> 32n)],
        [PRICE_1, 35],
        [SOLD_AT_1, 108_123],
      ]),
    ]);
    expect(state.buyback).toEqual([
      {
        bag: 255,
        guid: sold,
        price: 35,
        region: "buyback",
        slot: 74,
        soldAt: 108_123,
      },
    ]);
    expect(state.slots.some((slot) => slot.slot === 74)).toBe(false);
    expect(state.status).toBe("complete");
    expect(state.freeSlots).toBe(before.freeSlots);
  });

  test("lists no buyback slot while the slots are empty or unknown", () => {
    expect(view([entity(1n, ObjectType.PLAYER, [])]).buyback).toEqual([]);
    expect(view([entity(1n, ObjectType.PLAYER, [], false)]).buyback).toEqual(
      [],
    );
    expect(view([]).buyback).toEqual([]);
  });

  test("reads the price and sale time of slot 85 from the twelfth field", () => {
    const state = view([
      entity(1n, ObjectType.PLAYER, [
        [324 + 2 * 85, 9],
        [324 + 2 * 85 + 1, 0],
        [PRICE_1 + 11, 12],
        [SOLD_AT_1 + 11, 34],
      ]),
    ]);
    expect(state.buyback).toMatchObject([
      { guid: 9n, price: 12, slot: 85, soldAt: 34 },
    ]);
  });
});
