import { describe, expect, test } from "bun:test";
import type { AreaState } from "@peon/core";
import {
  dailyResetLine,
  reputationLines,
  reputationRows,
} from "#harness/areas/reputation/journal";

type State = AreaState<"reputation">;
type Row = State["factions"][number];

function row(over: Partial<Row>): Row {
  return {
    atWar: false,
    changedAt: undefined,
    factionId: 911,
    inactive: false,
    name: "Silvermoon City",
    rank: 4,
    rankCeiling: 8999,
    rankFloor: 3000,
    repListId: 55,
    standing: 4250,
    visible: true,
    watched: false,
    ...over,
  };
}

function state(factions: Row[], over: Partial<State> = {}): State {
  return {
    catalog: true,
    factions,
    forced: [],
    watched: undefined,
    ...over,
  };
}

const booty = row({
  atWar: true,
  changedAt: 10,
  factionId: 21,
  name: "Booty Bay",
  rank: 3,
  rankCeiling: 2999,
  rankFloor: 0,
  repListId: 3,
  standing: 0,
});

describe("reputationLines", () => {
  test("lists visible factions, most recently changed first, with rank and points", () => {
    const factions = [booty, row({ changedAt: 20 })];
    expect(reputationLines(state(factions))).toEqual([
      "Silvermoon City: Friendly 1250/6000.",
      "Booty Bay: Neutral 0/3000, at war.",
    ]);
  });

  test("orders by change time whatever order the store gave", () => {
    const factions = [booty, row({ changedAt: 20 })];
    expect(reputationRows(state(factions)).map((line) => line.name)).toEqual([
      "Silvermoon City",
      "Booty Bay",
    ]);
  });

  test("skips factions the server has not made visible", () => {
    const hidden = row({ name: "Bloodsail Buccaneers", visible: false });
    expect(reputationLines(state([booty, hidden]))).toEqual([
      "Booty Bay: Neutral 0/3000, at war.",
    ]);
  });

  test("marks an inactive faction", () => {
    const line = reputationLines(state([row({ inactive: true })]));
    expect(line).toEqual(["Silvermoon City: Friendly 1250/6000, inactive."]);
  });

  test("names the watched faction last", () => {
    const factions = [row({ changedAt: 20, watched: true }), booty];
    expect(reputationLines(state(factions, { watched: 55 }))).toEqual([
      "Silvermoon City: Friendly 1250/6000.",
      "Booty Bay: Neutral 0/3000, at war.",
      "Watched: Silvermoon City.",
    ]);
  });

  test("find filters by faction name, ignoring case", () => {
    const factions = [booty, row({ changedAt: 20 })];
    expect(reputationLines(state(factions), "silver")).toEqual([
      "Silvermoon City: Friendly 1250/6000.",
    ]);
    expect(reputationLines(state(factions), "gnomer")).toEqual([
      'No faction matches "gnomer".',
    ]);
  });

  test("without a catalog it gives the change from the base and says ranks are unknown", () => {
    const bare = row({
      rank: undefined,
      rankCeiling: undefined,
      rankFloor: undefined,
      standing: 250,
    });
    expect(reputationLines(state([bare], { catalog: false }))).toEqual([
      "Silvermoon City: +250 from the base (ranks unknown).",
    ]);
  });

  test("an unnamed faction is shown by its list id", () => {
    const nameless = row({ factionId: undefined, name: undefined });
    expect(reputationLines(state([nameless]))[0]).toBe(
      "Faction 55: Friendly 1250/6000.",
    );
  });

  test("with no factions it says so", () => {
    expect(reputationLines(state([]))).toEqual([
      "The server has not listed any factions for you yet.",
    ]);
  });

  test("keeps the watched line and a count when there are too many factions", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      row({ changedAt: 100 - i, name: `Faction ${i}`, repListId: i + 1 }),
    );
    const lines = reputationLines(state(many, { watched: 1 }));
    expect(lines).toHaveLength(24);
    expect(lines.at(-1)).toBe("Watched: Faction 0.");
    expect(lines.at(-2)).toBe("+8 more factions; narrow with find.");
  });
});

describe("dailyResetLine", () => {
  const NOW = 2_000_000;
  const time = (over: Partial<AreaState<"time">>): AreaState<"time"> => ({
    dailyResetInSec: undefined,
    gameTime: undefined,
    receivedAt: undefined,
    serverTime: undefined,
    speed: undefined,
    uiTime: undefined,
    uiTimeAt: undefined,
    ...over,
  });

  test("counts down from the moment the server answered", () => {
    const answered = time({
      dailyResetInSec: 5 * 3600 + 20 * 60,
      receivedAt: NOW - 8 * 60_000,
    });
    expect(dailyResetLine(answered, NOW)).toBe(
      "Daily quests reset in 5 h 12 m.",
    );
  });

  test("says nothing before the server has answered", () => {
    expect(dailyResetLine(time({}), NOW)).toBeUndefined();
  });

  test("says nothing once the reset time has passed", () => {
    const stale = time({ dailyResetInSec: 60, receivedAt: NOW - 120_000 });
    expect(dailyResetLine(stale, NOW)).toBeUndefined();
  });
});
