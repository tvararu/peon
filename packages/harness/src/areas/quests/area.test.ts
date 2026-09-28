import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { questsHarness } from "#harness/areas/quests/area";
import type { RuleInput } from "#harness/events/rules";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

type QuestsEvent = AreaEventOf<"quests">;
type Mark = Extract<QuestsEvent, { type: "marks" }>["givers"][number]["mark"];

const ERONA = 0xf1_30_00_3b_a3_00_00_10n;
const JULIA = 0xf1_30_00_3b_a4_00_00_11n;
const ARCANIST = 0xf1_30_00_3b_a5_00_00_12n;

const NAMES = new Map<bigint, string>([
  [ERONA, "Magistrix Erona"],
  [JULIA, "Julia Sunstriker"],
  [ARCANIST, "Arcanist Ithanas"],
]);
const REFS = new Map<bigint, string>([
  [ERONA, "u3"],
  [JULIA, "u4"],
  [ARCANIST, "u5"],
]);

function input(): RuleInput {
  return testRuleInput({
    lookup: testLookup({ unitName: (guid) => NAMES.get(guid) }),
    refOf: (guid) => REFS.get(guid) ?? "u?",
  });
}

function rules() {
  const event = questsHarness.rules?.().event;
  if (!event) throw new Error("quests has no event rule");
  const rc = input();
  return (e: QuestsEvent): readonly AreaDraft[] => event(e, rc);
}

function marks(...givers: [bigint, number, Mark][]): QuestsEvent {
  return {
    changed: givers.map(([guid]) => guid),
    givers: givers.map(([guid, status, mark]) => ({ guid, mark, status })),
    source: "multiple",
    type: "marks",
  };
}

describe("quests marks rule", () => {
  test("a giver with a quest to take writes one quests/marks row", () => {
    const rows = rules()(
      marks([ERONA, 8, "available"], [ARCANIST, 5, "incomplete"]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { givers: [{ mark: "available", name: "Magistrix Erona" }] },
      name: "marks",
    });
    expect(rows[0]?.text).toBe(
      "Quest givers near you: Magistrix Erona u3 has a quest for you.",
    );
  });

  test("the same givers with a quest or a turn-in write no second row", () => {
    const rule = rules();
    rule(marks([ERONA, 8, "available"]));
    expect(rule(marks([ERONA, 8, "available"]))).toEqual([]);
    expect(
      rule(marks([ERONA, 8, "available"], [ARCANIST, 5, "incomplete"])),
    ).toEqual([]);
    expect(
      rule(marks([ERONA, 8, "available"], [JULIA, 2, "available_low"])),
    ).toEqual([]);
  });

  test("a turn-in that appears or a quest that goes writes a new row", () => {
    const rule = rules();
    rule(marks([ERONA, 8, "available"]));
    const turnIn = rule(marks([ERONA, 8, "available"], [JULIA, 10, "reward"]));
    expect(turnIn).toHaveLength(1);
    expect(turnIn[0]?.text).toContain(
      "Julia Sunstriker u4 has a quest to turn in",
    );
    const gone = rule(marks([ERONA, 5, "incomplete"], [JULIA, 10, "reward"]));
    expect(gone).toHaveLength(1);
    expect(gone[0]?.text).not.toContain("Magistrix Erona");
  });

  test("givers with only gray or in-progress quests write no row", () => {
    expect(
      rules()(marks([JULIA, 2, "available_low"], [ARCANIST, 5, "incomplete"])),
    ).toEqual([]);
  });

  test("the last offering giver losing its mark says none is left", () => {
    const rule = rules();
    rule(marks([ERONA, 8, "available"]));
    const rows = rule(marks([ERONA, 5, "incomplete"]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe(
      "No quest giver in view has a quest for you or a quest to turn in.",
    );
  });
});
