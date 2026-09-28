import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { spellsHarness } from "#harness/areas/spells/area";
import { testRuleInput } from "#test-support/rule-fixtures";

const ME = 0x2an;
const TRAINER = 0xf1_30_00_3e_d7_00_1a_2bn;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("spells harness rules", () => {
  test("the area claims the cancelAura and setActionButton acts", () => {
    expect(spellsHarness.worldActs).toEqual(["cancelAura", "setActionButton"]);
  });

  test("a spell visual or impact writes no row", () => {
    const events: AreaEvent[] = [
      {
        area: "spells",
        event: { guid: TRAINER, impact: false, kit: 179, type: "spell_visual" },
      },
      {
        area: "spells",
        event: { guid: ME, impact: true, kit: 362, type: "spell_visual" },
      },
    ];
    const rules = areaRuleSet();
    for (const event of events)
      expect(areaDrafts(rules, event, testRuleInput())).toEqual([]);
  });

  test("a channel start or end writes its ruled row", () => {
    const events: AreaEvent[] = [
      {
        area: "spells",
        event: {
          durationMs: 3000,
          spellId: 5143,
          target: MOB,
          type: "channel_start",
        },
      },
      {
        area: "spells",
        event: {
          durationMs: undefined,
          spellId: 5143,
          target: undefined,
          type: "channel_start",
        },
      },
      {
        area: "spells",
        event: { reason: "cancelled", spellId: 5143, type: "channel_end" },
      },
    ];
    const rules = areaRuleSet();
    const [started, startedEndless, ended] = events.map(
      (event) => areaDrafts(rules, event, testRuleInput())[0]!,
    );
    expect(started!.event).toBe("spells/channel_start");
    expect(started!.text).toBe("Channelling spell 5143.");
    expect(startedEndless!.text).toBe("Channelling spell 5143.");
    expect(ended!.event).toBe("spells/channel_end");
    expect(ended!.text).toBe("spell 5143 ended (cancelled).");
  });
});
