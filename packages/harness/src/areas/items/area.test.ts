import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const GUID = 0x40_00_00_00_00_00_00_01n;
const HEX = "4000000000000001";

function moved(kind: string): AreaEvent {
  return {
    area: "items",
    event: {
      count: 1,
      entry: 25,
      from: { bag: 255, slot: 23 },
      itemGuid: GUID,
      kind,
      requestedAt: 0,
      stackBefore: 1,
      target: undefined,
      to: undefined,
      type: "moved",
    },
  } as unknown as AreaEvent;
}

function failed(type: string): AreaEvent {
  return {
    area: "items",
    event: {
      entry: 25,
      itemGuid: GUID,
      kind: "equip",
      reason: "cant_equip_level_i",
      result: 1,
      type,
    },
  } as unknown as AreaEvent;
}

describe("items harness rules", () => {
  test("a confirmed move writes a log row", () => {
    const rules = areaRuleSet();
    const rc = testRuleInput({
      lookup: testLookup({ itemName: () => "Gnarled Staff" }),
    });
    for (const [kind, name, text] of [
      ["equip", "equipped", "Equipped Gnarled Staff."],
      ["equip_slot", "equipped", "Equipped Gnarled Staff."],
      ["unequip", "unequipped", "Took off Gnarled Staff."],
      ["swap", "moved", "Moved Gnarled Staff."],
      ["split", "split", "Split Gnarled Staff."],
      ["ammo", "ammo", "Loaded Gnarled Staff."],
    ] as const)
      expect(areaDrafts(rules, moved(kind), rc)).toEqual([
        {
          class: "log",
          data: { entry: 25, item: HEX, kind },
          domain: "items",
          event: `items/${name}`,
          guid: HEX,
          ref: HEX,
          text,
        },
      ]);
  });

  test("a refused or unanswered move writes a wake row", () => {
    const rules = areaRuleSet();
    expect(areaDrafts(rules, failed("move_refused"), testRuleInput())).toEqual([
      {
        class: "wake",
        data: { entry: 25, reason: "cant_equip_level_i" },
        domain: "items",
        event: "items/refused",
        guid: HEX,
        ref: HEX,
        text: "Move refused: cant_equip_level_i.",
      },
    ]);
    expect(
      areaDrafts(
        rules,
        {
          area: "items",
          event: {
            entry: 25,
            itemGuid: GUID,
            kind: "equip",
            type: "move_unanswered",
          },
        } as unknown as AreaEvent,
        testRuleInput(),
      ),
    ).toEqual([
      {
        class: "wake",
        data: { entry: 25, kind: "equip" },
        domain: "items",
        event: "items/unanswered",
        guid: HEX,
        ref: HEX,
        text: "The move went unanswered.",
      },
    ]);
  });

  test("a better item writes one upgrade wake row", () => {
    const rules = areaRuleSet();
    const event = {
      area: "items",
      event: {
        entry: 36,
        guid: undefined,
        inventoryType: 21,
        itemLevel: 5,
        type: "item_received",
        wornItemLevel: 2,
      },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, event, testRuleInput())).toEqual([
      {
        class: "wake",
        data: { entry: 36, itemLevel: 5, wornItemLevel: 2 },
        domain: "items",
        event: "items/upgrade",
        text: "Better item: item 36 (item level 5, worn 2).",
      },
    ]);
  });

  test("an equal item writes no row", () => {
    const rules = areaRuleSet();
    const event = {
      area: "items",
      event: {
        entry: 36,
        guid: undefined,
        inventoryType: 21,
        itemLevel: 2,
        type: "item_received",
        wornItemLevel: 2,
      },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, event, testRuleInput())).toEqual([]);
  });

  test("a read writes a log row", () => {
    const rules = areaRuleSet();
    const readOk = {
      area: "items",
      event: { entry: 123, itemGuid: GUID, kind: "read", type: "read_ok" },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, readOk, testRuleInput())).toEqual([
      {
        class: "log",
        data: { entry: 123 },
        domain: "items",
        event: "items/read",
        guid: HEX,
        ref: HEX,
        text: `Read ${HEX}.`,
      },
    ]);
    const text = {
      area: "items",
      event: { guid: GUID, text: "Read me.", type: "item_text" },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, text, testRuleInput())).toEqual([
      {
        class: "log",
        data: { text: "Read me." },
        domain: "items",
        event: "items/read",
        guid: HEX,
        ref: HEX,
        text: "Read me.",
      },
    ]);
  });
});
