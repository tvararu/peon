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

describe("quests harness area", () => {
  test("the area claims the giver, POI and share acts", () => {
    expect(questsHarness.worldActs).toEqual([
      "answerShare",
      "queryGiverStatuses",
      "queryPoi",
      "shareQuest",
    ]);
  });
});

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

  test("the same giver turning its offer into a turn-in writes no row", () => {
    const rule = rules();
    rule(marks([ERONA, 8, "available"]));
    expect(rule(marks([ERONA, 10, "reward"]))).toEqual([]);
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

  test("quest events other than marks write the quiet fallback row", () => {
    const rows = rules()({ count: 3, type: "completed" });
    expect(rows).toEqual([
      {
        class: "log",
        data: { count: 3, fallback: true, type: "completed" },
        name: "completed",
        text: "quests completed",
      },
    ]);
  });

  test("a gossip POI writes one quests/gossip_poi row", () => {
    const rows = rules()({
      from: ERONA,
      name: "Lion's Pride Inn",
      type: "gossip_poi",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      name: "gossip_poi",
    });
    expect(rows[0]?.text).toContain("Lion's Pride Inn");
  });

  test("a share offer writes one quests/offered wake row", () => {
    const rows = rules()({
      share: {
        from: ERONA,
        questId: 8329,
        title: "Unfortunate Measures",
        type: "offered",
      },
      type: "share",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ class: "wake", name: "offered" });
    expect(rows[0]?.text).toContain("Magistrix Erona");
    expect(rows[0]?.text).toContain("Unfortunate Measures");
    expect(rows[0]?.text).toContain("accept_quest");
    expect(rows[0]?.text).toContain("decline_quest");
  });

  test("a relayed accept writes one quests/share_result wake row", () => {
    const rows = rules()({
      share: { guid: JULIA, questId: 8329, result: 2, type: "relayed" },
      type: "share",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { answer: "accepted", member: "Julia Sunstriker", questId: 8329 },
      name: "share_result",
    });
    expect(rows[0]?.text).toContain("Julia Sunstriker");
    expect(rows[0]?.text).toContain("accepted");
  });

  test("a declined first result writes one quests/share_result wake row", () => {
    const rows = rules()({
      share: { guid: ARCANIST, questId: 8329, result: 3, type: "result" },
      type: "share",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      data: { answer: "declined" },
      name: "share_result",
    });
  });
});
