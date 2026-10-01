import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const GUID = 0x40_00_00_00_00_00_00_01n;
const HEX = "4000000000000001";

describe("items harness socket rows", () => {
  test("a socket result writes a socketed log row", () => {
    const rules = areaRuleSet();
    const event = {
      area: "items",
      event: {
        bonus: 3312,
        entry: 40_000,
        itemGuid: GUID,
        sockets: [3101, 0, 0],
        type: "sockets_updated",
      },
    } as unknown as AreaEvent;
    expect(
      areaDrafts(
        rules,
        event,
        testRuleInput({
          lookup: testLookup({ itemName: () => "Sturdy Ring" }),
        }),
      ),
    ).toEqual([
      {
        class: "log",
        data: { bonus: 3312, entry: 40_000, sockets: [3101, 0, 0] },
        domain: "items",
        event: "items/socketed",
        guid: HEX,
        ref: HEX,
        text: "Socketed Sturdy Ring.",
      },
    ]);
  });

  test("an own enchantment log writes an enchanted row; another player's does not", () => {
    const rules = areaRuleSet();
    const own = {
      area: "items",
      event: {
        caster: 0x0a_00n,
        enchantId: 3101,
        entry: 40_000,
        own: true,
        target: 0x0a_00n,
        type: "enchantment_log",
      },
    } as unknown as AreaEvent;
    expect(
      areaDrafts(
        rules,
        own,
        testRuleInput({
          lookup: testLookup({ itemName: () => "Sturdy Ring" }),
        }),
      ),
    ).toEqual([
      {
        class: "log",
        data: { enchantId: 3101, entry: 40_000 },
        domain: "items",
        event: "items/enchanted",
        guid: "a00",
        ref: "a00",
        text: "Enchanted Sturdy Ring.",
      },
    ]);
    const other = {
      area: "items",
      event: {
        caster: 0x0b_00n,
        enchantId: 3101,
        entry: 40_000,
        own: false,
        target: 0x0b_00n,
        type: "enchantment_log",
      },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, other, testRuleInput())).toEqual([]);
  });
});

describe("items harness set rows", () => {
  test("a saved set writes a set_saved row; an update names it still", () => {
    const rules = areaRuleSet();
    for (const status of ["saved", "saved_unconfirmed"] as const) {
      const event = {
        area: "items",
        event: {
          index: 0,
          kind: "create",
          name: "Peon",
          reason:
            status === "saved"
              ? undefined
              : "the server sends no reply for a set update",
          setGuid: 9n,
          status,
          type: "set_saved",
        },
      } as unknown as AreaEvent;
      expect(areaDrafts(rules, event, testRuleInput())).toEqual([
        {
          class: "log",
          data: { index: 0, kind: "create", name: "Peon", status },
          domain: "items",
          event: "items/set_saved",
          text: "Saved equipment set Peon.",
        },
      ]);
    }
  });

  test("a used set writes set_used; an unanswered save is a wake row", () => {
    const rules = areaRuleSet();
    const used = {
      area: "items",
      event: {
        failures: ["cant_do_right_now"],
        index: 0,
        reason: undefined,
        status: "ok",
        type: "set_used",
      },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, used, testRuleInput())).toEqual([
      {
        class: "log",
        data: { failures: ["cant_do_right_now"], index: 0, status: "ok" },
        domain: "items",
        event: "items/set_used",
        text: "Wore equipment set 0.",
      },
    ]);
    const bagsFull = {
      area: "items",
      event: {
        failures: [],
        index: 0,
        reason: "bags_full",
        status: "bags_full",
        type: "set_used",
      },
    } as unknown as AreaEvent;
    expect(areaDrafts(rules, bagsFull, testRuleInput())[0]).toMatchObject({
      class: "wake",
      event: "items/set_used",
    });
  });
});
