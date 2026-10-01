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

function timerEvent(event: Record<string, unknown>): AreaEvent {
  return { area: "items", event } as unknown as AreaEvent;
}

describe("items harness timer rows", () => {
  const rc = () =>
    testRuleInput({ lookup: testLookup({ itemName: () => "Dragonmaw Key" }) });

  test("an item cooldown writes a log row naming the item", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      timerEvent({
        entry: 25,
        itemGuid: GUID,
        spell: 7000,
        type: "item_cooldown",
      }),
      rc(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { entry: 25, spell: 7000 },
      event: "items/cooldown",
      guid: HEX,
    });
    expect(rows[0]?.text).toContain("Dragonmaw Key");
  });

  test("an expiring item is passive with a long time left and wakes under 60 seconds", () => {
    const rules = areaRuleSet();
    const at = (seconds: number) =>
      areaDrafts(
        rules,
        timerEvent({
          entry: 25,
          expiresAt: 0,
          itemGuid: GUID,
          seconds,
          type: "item_timer",
        }),
        rc(),
      )[0];
    expect(at(3600)).toMatchObject({
      class: "passive",
      event: "items/expiring",
    });
    expect(at(60)).toMatchObject({ class: "passive" });
    expect(at(59)).toMatchObject({ class: "wake", data: { seconds: 59 } });
    expect(at(0)).toMatchObject({ class: "wake" });
    expect(at(3600)?.text).toContain("1 h");
    expect(at(59)?.text).toContain("59 s");
  });

  test("a temporary enchant timer is an expiring row that names the enchant slot", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      timerEvent({
        entry: 25,
        expiresAt: 0,
        itemGuid: GUID,
        seconds: 30,
        slot: 1,
        type: "item_enchant_timer",
      }),
      rc(),
    );
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { enchantSlot: 1, seconds: 30 },
      event: "items/expiring",
    });
    expect(rows[0]?.text).toContain("enchant");
  });

  test("the death durability notice wakes with a repair hint", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      timerEvent({ type: "durability_loss_death" }),
      rc(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "items/durability_loss",
    });
    expect(rows[0]?.text).toContain("repair");
  });

  test("new skills write a log row naming them", () => {
    const rows = areaDrafts(
      areaRuleSet(),
      timerEvent({
        added: 3,
        kind: "weapon",
        mask: 3,
        names: ["one-handed axes", "two-handed axes"],
        type: "proficiency_changed",
      }),
      rc(),
    );
    expect(rows[0]).toMatchObject({
      class: "log",
      data: {
        kind: "weapon",
        mask: 3,
        names: ["one-handed axes", "two-handed axes"],
      },
      event: "items/proficiency",
    });
    expect(rows[0]?.text).toContain("one-handed axes");
  });

  test("a proficiency packet that adds nothing writes no row", () => {
    expect(
      areaDrafts(
        areaRuleSet(),
        timerEvent({
          added: 0,
          kind: "armor",
          mask: 2,
          names: [],
          type: "proficiency_changed",
        }),
        rc(),
      ),
    ).toEqual([]);
  });
});

describe("items harness attach replay", () => {
  const attachOf = () => {
    const set = areaRuleSet();
    const attach = set.items?.attach;
    if (!attach) throw new Error("items has no attach rule");
    return attach;
  };
  const at = (now: number) => testRuleInput({ now });
  const base = {
    move: { last: undefined, pending: undefined },
    read: { last: undefined, pending: undefined, texts: [] },
  };

  test("attach after login packets replays proficiency rows from retained masks", () => {
    const rows = attachOf()(
      {
        ...base,
        timers: {
          cooldowns: [],
          enchants: [],
          proficiency: { armor: 12, weapon: 272 },
          timers: [],
        },
      },
      at(1_000_000),
    );
    expect(rows.map((row) => row.name)).toEqual(["proficiency", "proficiency"]);
    expect(rows[0]?.text).toContain("one-handed maces");
    expect(rows[1]?.text).toContain("leather");
  });

  test("attach replays live timers with seconds left and drops expired ones", () => {
    const rows = attachOf()(
      {
        ...base,
        timers: {
          cooldowns: [],
          enchants: [
            {
              expiresAt: 1_030_000,
              itemGuid: GUID,
              seconds: 30,
              seenAt: 1_000_000,
              slot: 1,
            },
          ],
          proficiency: { armor: "unknown", weapon: "unknown" },
          timers: [
            {
              expiresAt: 1_060_000,
              itemGuid: GUID,
              seconds: 120,
              seenAt: 1_000_000,
            },
            {
              expiresAt: 999_000,
              itemGuid: 0x4000000000000002n,
              seconds: 5,
              seenAt: 990_000,
            },
          ],
        },
      },
      testRuleInput({
        lookup: testLookup({ itemName: () => "Dragonmaw Key" }),
        now: 1_030_000,
      }),
    );
    expect(rows.map((row) => [row.name, row.data])).toEqual([
      ["expiring", { entry: undefined, seconds: 30 }],
      ["expiring", { enchantSlot: 1, entry: undefined, seconds: 0 }],
    ]);
  });

  test("attach with empty retained state writes no rows", () => {
    expect(
      attachOf()(
        {
          ...base,
          timers: {
            cooldowns: [],
            enchants: [],
            proficiency: { armor: "unknown", weapon: "unknown" },
            timers: [],
          },
        },
        at(1_000_000),
      ),
    ).toEqual([]);
  });
});
