import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { reputationHarness } from "#harness/areas/reputation/area";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import type { RuleInput } from "#harness/events/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

type ReputationEvent = AreaEventOf<"reputation">;
type Standing = Extract<ReputationEvent, { type: "standing_changed" }>;

function rules() {
  const event = reputationHarness.rules?.().event;
  if (!event) throw new Error("reputation has no event rule");
  return (
    e: ReputationEvent,
    rc: RuleInput = testRuleInput(),
  ): readonly AreaDraft[] => event(e, rc);
}

function standing(over: Partial<Standing> = {}): Standing {
  return {
    after: 4250,
    atWar: false,
    before: 4000,
    factionId: 911,
    increased: false,
    name: "Silvermoon City",
    rank: 4,
    rankChanged: false,
    repListId: 55,
    type: "standing_changed",
    wasAtWar: false,
    ...over,
  };
}

describe("reputation/changed", () => {
  test("a gain inside a rank logs the delta and the place in the rank", () => {
    expect(rules()(standing())).toEqual([
      {
        class: "log",
        data: {
          after: 4250,
          before: 4000,
          factionId: 911,
          rank: 4,
          repListId: 55,
        },
        name: "changed",
        text: "Silvermoon City reputation +250: Friendly 1250/6000.",
      },
    ]);
  });

  test("a loss shows a minus sign and the rank it stays in", () => {
    const [row] = rules()(
      standing({
        after: -100,
        before: 50,
        factionId: 21,
        name: "Booty Bay",
        rank: 3,
      }),
    );
    expect(row?.text).toBe("Booty Bay reputation -150: Neutral -100/3000.");
  });

  test("with no faction catalog the row holds the delta only", () => {
    const [row] = rules()(
      standing({
        after: 250,
        before: 0,
        factionId: undefined,
        rank: undefined,
      }),
    );
    expect(row).toMatchObject({
      class: "log",
      name: "changed",
      text: "Silvermoon City reputation +250.",
    });
  });

  test("with no name the row names the reputation list id", () => {
    const [row] = rules()(
      standing({
        after: 250,
        before: 0,
        factionId: undefined,
        name: undefined,
        rank: undefined,
      }),
    );
    expect(row?.text).toBe("Faction 55 reputation +250.");
  });

  test("the row class stays log inside a run", () => {
    const [row] = rules()(standing(), testRuleInput({ runActive: true }));
    expect(row?.class).toBe("log");
  });
});

describe("reputation/rank", () => {
  test("a new rank logs the rank reached", () => {
    const [row] = rules()(
      standing({
        after: 9250,
        before: 8900,
        increased: true,
        rank: 5,
        rankChanged: true,
      }),
    );
    expect(row).toEqual({
      class: "log",
      data: {
        after: 9250,
        before: 8900,
        factionId: 911,
        rank: 5,
        repListId: 55,
      },
      name: "rank",
      text: "You are now Honored with Silvermoon City.",
    });
  });
});

describe("reputation/at_war", () => {
  test("falling to Hostile on a faction now at war warns of its guards", () => {
    const [row] = rules()(
      standing({
        after: -3100,
        atWar: true,
        before: -2900,
        factionId: 21,
        name: "Booty Bay",
        rank: 1,
        rankChanged: true,
      }),
    );
    expect(row).toMatchObject({
      class: "log",
      data: { after: -3100, before: -2900, factionId: 21, rank: 1 },
      name: "at_war",
      text: "You are now at war with Booty Bay; its guards will attack you.",
    });
  });

  test("a change inside a rank on a faction already at war is a changed row", () => {
    const [row] = rules()(
      standing({
        after: -3200,
        atWar: true,
        before: -3100,
        factionId: 21,
        name: "Booty Bay",
        rank: 1,
        wasAtWar: true,
      }),
    );
    expect(row).toMatchObject({
      name: "changed",
      text: "Booty Bay reputation -100: Hostile 2800/3000.",
    });
  });

  test("a war flag set without a rank change still warns of its guards", () => {
    const [row] = rules()(
      standing({
        after: -3200,
        atWar: true,
        before: -3100,
        factionId: 21,
        name: "Booty Bay",
        rank: 1,
      }),
    );
    expect(row).toMatchObject({
      name: "at_war",
      text: "You are now at war with Booty Bay; its guards will attack you.",
    });
  });

  test("a drop to Hostile on a faction already at war is a rank row", () => {
    const [row] = rules()(
      standing({
        after: -3100,
        atWar: true,
        before: -2900,
        factionId: 21,
        name: "Booty Bay",
        rank: 1,
        rankChanged: true,
        wasAtWar: true,
      }),
    );
    expect(row).toMatchObject({
      name: "rank",
      text: "You are now Hostile with Booty Bay.",
    });
  });

  test("a rank change on a faction already at war keeps the rank row", () => {
    const [row] = rules()(
      standing({
        after: -2500,
        atWar: true,
        before: -3100,
        factionId: 21,
        name: "Booty Bay",
        rank: 2,
        rankChanged: true,
        wasAtWar: true,
      }),
    );
    expect(row).toMatchObject({
      name: "rank",
      text: "You are now Unfriendly with Booty Bay.",
    });
  });
});

describe("reputation/discovered", () => {
  test("a faction made visible is discovered", () => {
    expect(
      rules()({ name: "Tranquillien", repListId: 56, type: "visible" }),
    ).toEqual([
      {
        class: "log",
        data: { repListId: 56 },
        name: "discovered",
        text: "You discovered the faction Tranquillien.",
      },
    ]);
  });
});

describe("reputation/forced", () => {
  const forced: ReputationEvent = {
    added: [{ factionId: 1037, name: "Dragonmaw", rank: 4 }],
    removed: [],
    type: "forced_changed",
  };

  test("a forced reaction wakes the agent outside a run", () => {
    expect(rules()(forced)).toEqual([
      {
        class: "wake",
        data: { factionId: 1037, rank: 4 },
        name: "forced",
        text: "Units of Dragonmaw now treat you as Friendly while an effect lasts.",
      },
    ]);
  });

  test("inside a run the forced row is a log row", () => {
    const [row] = rules()(forced, testRuleInput({ runActive: true }));
    expect(row).toMatchObject({ class: "log", name: "forced" });
  });

  test("a removed forced reaction says the effect ended", () => {
    const [row] = rules()({
      added: [],
      removed: [{ factionId: 1037, name: undefined, rank: 4 }],
      type: "forced_changed",
    });
    expect(row).toMatchObject({
      data: { factionId: 1037, rank: 4 },
      name: "forced",
      text: "Units of faction 1037 no longer treat you as Friendly.",
    });
  });
});

describe("reputation flood guard", () => {
  test("initialized and watched_changed write no row and no fallback", () => {
    const set = areaRuleSet();
    const quiet: ReputationEvent[] = [
      { count: 12, type: "initialized", visible: 6 },
      { name: "Silvermoon City", repListId: 55, type: "watched_changed" },
    ];
    for (const runActive of [false, true])
      for (const event of quiet)
        expect(
          areaDrafts(
            set,
            { area: "reputation", event },
            testRuleInput({ runActive }),
          ),
        ).toEqual([]);
  });

  test("the router names each row reputation/<name>", () => {
    const [row] = areaDrafts(
      areaRuleSet(),
      { area: "reputation", event: standing() },
      testRuleInput(),
    );
    expect(row).toMatchObject({
      domain: "reputation",
      event: "reputation/changed",
    });
  });
});
