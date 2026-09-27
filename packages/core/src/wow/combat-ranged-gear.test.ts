import { describe, expect, test } from "bun:test";
import { readRangedGear } from "#wow/combat-ranged-gear";
import type { Entity } from "#wow/entity-store";
import type { ItemLabel } from "#wow/item-labels";
import { ObjectType, PLAYER_FIELDS } from "#wow/protocol/entity-fields";

const BOW = 2504;
const ARROW = 2512;
const SLOT = PLAYER_FIELDS.INV_SLOT_HEAD.offset;
const PACK = PLAYER_FIELDS.PACK_SLOT_1.offset;

function entity(
  guid: bigint,
  objectType: ObjectType,
  fields: [number, number][],
): Entity {
  return {
    guid,
    objectType,
    entry: 0,
    scale: 1,
    position: undefined,
    rawFields: new Map(fields),
    name: undefined,
    createComplete: true,
  };
}

function item(guid: bigint, entry: number, count: number): Entity {
  return entity(guid, ObjectType.ITEM, [
    [3, entry],
    [6, 1],
    [8, 1],
    [14, count],
  ]);
}

const labels: Record<number, ItemLabel> = {
  [ARROW]: { itemClass: 6, name: "Rough Arrow", quality: 1, subclass: 2 },
  [BOW]: { itemClass: 2, name: "Worn Shortbow", quality: 1, subclass: 2 },
};

function gear(entities: Entity[], label = (entry: number) => labels[entry]) {
  const byGuid = new Map(entities.map((value) => [value.guid, value]));
  return readRangedGear(
    1n,
    (guid) => byGuid.get(guid),
    (entry) => label(entry) ?? { name: null, quality: null },
  );
}

describe("readRangedGear", () => {
  test("reads the ranged slot, the ammo field and the carried ammo count", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [SLOT + 34, 10],
      [SLOT + 35, 0],
      [PACK, 11],
      [PACK + 1, 0],
      [PACK + 2, 12],
      [PACK + 3, 0],
      [PLAYER_FIELDS.AMMO_ID.offset, ARROW],
    ]);
    expect(
      gear([
        self,
        item(10n, BOW, 1),
        item(11n, ARROW, 200),
        item(12n, ARROW, 50),
      ]),
    ).toEqual({
      ammo: { count: 250, entry: ARROW, itemClass: 6, subclass: 2 },
      weapon: { entry: BOW, itemClass: 2, subclass: 2 },
    });
  });

  test("an empty slot and ammo id 0 read as none", () => {
    expect(gear([entity(1n, ObjectType.PLAYER, [])])).toEqual({
      ammo: null,
      weapon: null,
    });
  });

  test("templates that have not arrived leave the class unknown", () => {
    const self = entity(1n, ObjectType.PLAYER, [
      [SLOT + 34, 10],
      [SLOT + 35, 0],
      [PLAYER_FIELDS.AMMO_ID.offset, ARROW],
    ]);
    expect(gear([self, item(10n, BOW, 1)], () => undefined)).toEqual({
      ammo: {
        count: 0,
        entry: ARROW,
        itemClass: undefined,
        subclass: undefined,
      },
      weapon: { entry: BOW, itemClass: undefined, subclass: undefined },
    });
  });

  test("a missing self is unobserved", () => {
    expect(gear([])).toEqual({ ammo: undefined, weapon: undefined });
  });
});
