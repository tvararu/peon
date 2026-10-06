import { describe, expect, test } from "bun:test";
import { itemsItemQuerySingleResponseBody } from "#test-support/areas/items";
import {
  LESSER_HEALING_POTION_RESPONSE,
  UNKNOWN_ITEM_999999_RESPONSE,
} from "#test-support/item-query-fixtures";
import {
  buildItemQuery,
  buildUseItem,
  type ItemTemplate,
  parseItemQueryResponse,
} from "#wow/protocol/item";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const NONE = 0xff_ff_ff_ff;

const SWORD: ItemTemplate = {
  entry: 2488,
  name: "Gladius",
  quality: 2,
  itemClass: 2,
  subclass: 7,
  stackSize: 1,
  spells: [
    {
      id: 7597,
      trigger: 1,
      charges: 0,
      cooldownMs: -1,
      category: 0,
      categoryCooldownMs: -1,
    },
    {
      id: 18_107,
      trigger: 2,
      charges: -3,
      cooldownMs: 1500,
      category: 4,
      categoryCooldownMs: 30_000,
    },
  ],
  flags: 0x80_00_00_01,
  inventoryType: 13,
  allowableClass: 0x5_ff,
  allowableRace: 0x2_ff,
  itemLevel: 17,
  requiredLevel: 12,
  requiredSkill: 43,
  requiredSkillRank: 55,
  requiredSpell: 201,
  maxCount: -1,
  containerSlots: 0,
  stats: [
    { type: 4, value: 3 },
    { type: 7, value: -2 },
  ],
  damage: [
    { min: 11.5, max: 22.25, school: 0 },
    { min: 1, max: 3, school: 2 },
  ],
  armor: 40,
  resistances: {
    holy: 1,
    fire: -5,
    nature: 3,
    frost: 4,
    shadow: 5,
    arcane: 6,
  },
  delay: 2300,
  ammoType: 0,
  bonding: 2,
  pageText: 0,
  lockId: 0,
  itemSet: 0,
  maxDurability: 65,
  bagFamily: 0,
  sockets: [
    { color: 1, content: 0 },
    { color: 8, content: 0 },
    { color: 0, content: 0 },
  ],
  socketBonus: 2874,
  gemProperties: 0,
  duration: 0,
  limitCategory: 0,
};

function readAll(body: Uint8Array) {
  const reader = new PacketReader(body);
  const response = parseItemQueryResponse(reader);
  return { response, left: reader.remaining };
}

describe("CMSG_USE_ITEM", () => {
  test("writes the 3.3.5 layout AzerothCore reads, with self as target", () => {
    const body = buildUseItem({
      bag: 255,
      slot: 29,
      castCount: 3,
      spellId: 5005,
      itemGuid: 0x4000_0000_000f_17a9n,
    });
    expect([...body]).toEqual([
      0xff, 0x1d, 0x03, 0x8d, 0x13, 0x00, 0x00, 0xa9, 0x17, 0x0f, 0x00, 0x00,
      0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
  });

  test("glyphIndex fills the u32 after the item guid (SpellHandler.cpp:73)", () => {
    const body = buildUseItem({
      bag: 255,
      castCount: 3,
      glyphIndex: 3,
      itemGuid: 0x4000_0000_000f_17a9n,
      slot: 29,
      spellId: 5005,
    });
    expect([...body.slice(15, 19)]).toEqual([3, 0, 0, 0]);
    expect(body.length).toBe(24);
  });
});

describe("CMSG_USE_ITEM targets (Handlers/SpellHandler.cpp:193)", () => {
  test("object target writes the game object mask after the cast flags", () => {
    const body = buildUseItem({
      bag: 255,
      castCount: 3,
      itemGuid: 0x4000_0000_000f_17a9n,
      slot: 29,
      spellId: 5005,
      target: { guid: 0xf1_10_2c_14_00_00_52_80n, kind: "object" },
    });
    expect([...body]).toEqual([
      0xff, 0x1d, 0x03, 0x8d, 0x13, 0x00, 0x00, 0xa9, 0x17, 0x0f, 0x00, 0x00,
      0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00,
      0xf3, 0x80, 0x52, 0x14, 0x2c, 0x10, 0xf1,
    ]);
  });
});

describe("item template query", () => {
  test("asks for one entry", () => {
    expect([...buildItemQuery(2687)]).toEqual([0x7f, 0x0a, 0x00, 0x00]);
  });

  test("reads the whole AzerothCore item template", () => {
    const body = itemsItemQuerySingleResponseBody(SWORD, {
      soundOverride: 3,
      names: ["b", "c", "d"],
      displayId: 5001,
      flags2: 0x20_00,
      buyPrice: -7,
      sellPrice: 1234,
      honorRank: 9,
      cityRank: 8,
      reputationFaction: 72,
      reputationRank: 4,
      scalingDistribution: 11,
      scalingValue: 12,
      rangedModRange: 100,
      description: "A fine blade.",
      language: 7,
      pageMaterial: 2,
      startQuest: 33,
      material: -1,
      sheath: 3,
      randomProperty: -9,
      randomSuffix: 14,
      block: 15,
      area: 16,
      map: 17,
      totemCategory: 18,
      disenchantSkill: 19,
      armorDamageModifier: 2.5,
      holiday: 20,
    });
    expect(readAll(body)).toEqual({
      response: { entry: 2488, template: SWORD },
      left: 0,
    });
  });

  test("reads a stats count of 0 and of 10", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      type: i + 3,
      value: 10 - i * 3,
    }));
    for (const stats of [[], ten]) {
      const template = { ...SWORD, stats };
      expect(readAll(itemsItemQuerySingleResponseBody(template))).toEqual({
        response: { entry: 2488, template },
        left: 0,
      });
    }
  });

  test("keeps a missing spell out", () => {
    const template = { ...SWORD, spells: [] };
    const body = itemsItemQuerySingleResponseBody(template);
    expect(readAll(body).response.template?.spells).toEqual([]);
    const one = { ...SWORD, spells: SWORD.spells.slice(1) };
    expect(
      readAll(itemsItemQuerySingleResponseBody(one)).response.template,
    ).toEqual(one);
  });

  test("reads the tail after the spells", () => {
    const bag: ItemTemplate = {
      ...SWORD,
      entry: 4500,
      name: "Traveler's Backpack",
      itemClass: 1,
      subclass: 0,
      inventoryType: 18,
      containerSlots: 16,
      damage: [
        { min: 0, max: 0, school: 0 },
        { min: 0, max: 0, school: 0 },
      ],
      spells: [],
      bonding: 0,
      pageText: 77,
      lockId: 88,
      itemSet: 181,
      maxDurability: 0,
      bagFamily: 0x4_00,
      sockets: [
        { color: 2, content: 23 },
        { color: 4, content: 0 },
        { color: 14, content: 31 },
      ],
      socketBonus: 3312,
      gemProperties: 99,
      duration: 3600,
      limitCategory: 5,
    };
    const body = itemsItemQuerySingleResponseBody(bag, {
      description: "It holds things.",
      holiday: 141,
    });
    expect(readAll(body)).toEqual({
      response: { entry: 4500, template: bag },
      left: 0,
    });
  });

  test("reads every field of a captured response", () => {
    expect(readAll(LESSER_HEALING_POTION_RESPONSE)).toEqual({
      response: {
        entry: 858,
        template: {
          entry: 858,
          name: "Lesser Healing Potion",
          quality: 1,
          itemClass: 0,
          subclass: 1,
          stackSize: 20,
          spells: [
            {
              id: 440,
              trigger: 0,
              charges: -1,
              cooldownMs: 0,
              category: 4,
              categoryCooldownMs: 60_000,
            },
          ],
          flags: 0,
          inventoryType: 0,
          allowableClass: NONE,
          allowableRace: NONE,
          itemLevel: 13,
          requiredLevel: 3,
          requiredSkill: 0,
          requiredSkillRank: 0,
          requiredSpell: 0,
          maxCount: 0,
          containerSlots: 0,
          stats: [],
          damage: [
            { min: 0, max: 0, school: 0 },
            { min: 0, max: 0, school: 0 },
          ],
          armor: 0,
          resistances: {
            holy: 0,
            fire: 0,
            nature: 0,
            frost: 0,
            shadow: 0,
            arcane: 0,
          },
          delay: 0,
          ammoType: 0,
          bonding: 0,
          pageText: 0,
          lockId: 0,
          itemSet: 0,
          maxDurability: 0,
          bagFamily: 0,
          sockets: [
            { color: 0, content: 0 },
            { color: 0, content: 0 },
            { color: 0, content: 0 },
          ],
          socketBonus: 0,
          gemProperties: 0,
          duration: 0,
          limitCategory: 0,
        },
      },
      left: 0,
    });
    expect(readAll(UNKNOWN_ITEM_999999_RESPONSE)).toEqual({
      response: { entry: 999_999, template: undefined },
      left: 0,
    });
  });

  test("reports an unknown entry from the high bit", () => {
    const w = new PacketWriter();
    w.uint32LE(0x80_00_00_00 | 2687);
    expect(parseItemQueryResponse(new PacketReader(w.finish()))).toEqual({
      entry: 2687,
      template: undefined,
    });
  });
});
