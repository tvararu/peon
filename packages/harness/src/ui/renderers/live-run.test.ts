import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type {
  EngageAfter,
  RecoverAfter,
  RestAfter,
  TravelAfter,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { nerd } from "#harness/ui/glyphs";
import {
  open,
  partial,
  renderCallLine,
  renderResultLines,
} from "#test-support/render-fixture";
import {
  painted,
  plain,
  testTheme,
  unitFixture,
} from "#test-support/ui-fixture";

const theme = testTheme();
const vitals = {
  hp: 175,
  maxHp: 217,
  maxPower: 300,
  power: 212,
  powerKind: "mana" as const,
};

const travel: TravelAfter = {
  elapsedMs: 4200,
  floorRetried: false,
  floors: undefined,
  goal: { kind: "corpse" },
  legs: [{ index: 0, reason: undefined, status: "arrived", traveledYd: 23 }],
  newInView: [],
  pose: undefined,
  remainingYd: 34.3,
  totalYd: 57.3,
  traveledYd: 23,
};

const engage: EngageAfter = {
  cast: { elapsedMs: 400, spell: "Smite", totalMs: 1500 },
  castErrors: [{ code: 12, count: 2, word: "OUT_OF_RANGE" }],
  copper: 75,
  current: unitFixture(),
  decisions: [
    { at: 1, disposition: "applied", kind: "spell", label: "Smite" },
    { at: 2, disposition: "discarded", kind: "move", label: "step back" },
  ],
  how: "",
  kills: 1,
  loot: [{ count: 1, itemId: 2966, name: "Dragonhawk Egg", quality: 1 }],
  mode: "cycle",
  questId: undefined,
  self: vitals,
  swingErrors: [],
  targets: [
    {
      durationMs: 6000,
      name: "Springpaw Stalker",
      outcome: "killed",
      reason: undefined,
      ref: "u9",
      xp: 84,
    },
  ],
  timeouts: 0,
  wanted: 3,
  xp: 84,
};

const rest: RestAfter = {
  auraConfirmed: true,
  durationMs: 18_000,
  hpPct: 95,
  idle: false,
  itemsLeft: 4,
  manaPct: 91,
  used: [
    { count: 1, itemId: 159, name: "Refreshing Spring Water", quality: 1 },
  ],
};

const recover: RecoverAfter = {
  alive: true,
  alternatives: ["spirit_healer"],
  corpseYd: 0.8,
  durationMs: 41_000,
  hp: 108,
  legs: 3,
  maxHp: 217,
  pose: undefined,
  via: "corpse",
};

const done = <A>(after: A, detail: string): ToolResult<A> => ({
  after,
  body: [],
  detail,
  status: "DONE",
});

describe("live-run family", () => {
  test("call lines", () => {
    expect(renderCallLine("travel", { to: "corpse" })).toBe(
      `${nerd.route} travel → corpse`,
    );
    expect(
      renderCallLine("engage", { count: 3, target: "Springpaw Stalker" }),
    ).toBe(`${nerd.combat} engage Springpaw Stalker ×3`);
    expect(renderCallLine("rest", {})).toBe(`${nerd.idle} rest until 90%`);
    expect(renderCallLine("recover", {})).toBe(
      `${nerd.ghost} recover via corpse`,
    );
  });

  test("a running travel draws a progress bar and the run id", () => {
    const running: ToolResult<TravelAfter> = {
      ...done(travel, "walking to your corpse."),
      runId: "r4",
      status: "RUNNING",
    };
    const lines = renderResultLines("travel", running, { options: partial });
    const text = plain(lines);
    expect(text[0]).toBe(
      `${nerd.runRunning} RUNNING r4: walking to your corpse.`,
    );
    expect(text[1]).toContain("23y/57y · 34y left 4.2s");
    expect(text[2]).toBe(`${nerd.mapPin} corpse`);
    expect(painted(theme, "warning", lines[0] ?? "")).toBe(true);
  });

  test("a finished travel summarises the legs", () => {
    const text = plain(
      renderResultLines("travel", done(travel, "arrived at your corpse."), {
        options: open,
      }),
    );
    expect(text.slice(1)).toEqual([
      `${nerd.mapPin} corpse`,
      "walked 23y in 4.2s · 1 legs",
      "leg 1 arrived 23y",
    ]);
  });

  test("engage shows target, vitals, cast, the Jev strip and the tally", () => {
    const text = plain(
      renderResultLines("engage", done(engage, "killed 1 of 3.")),
    );
    expect(text).toHaveLength(6);
    expect(text[1]).toContain(`${nerd.hostile} Springpaw Stalker u9 L7`);
    expect(text[2]).toContain("175/217");
    expect(text[3]).toContain(`${nerd.cast} Smite`);
    expect(text[4]).toBe(
      `${nerd.jevDecision} Jev ${nerd.spell}${nerd.compassN}`,
    );
    expect(text[5]).toBe(
      `${nerd.kill} 1/3 · ${nerd.xp} +84 xp · ${nerd.loot} 1 items · ${nerd.copper}75`,
    );
  });

  test("engage drops the target row of a dead unit and empty vitals", () => {
    const dead = unitFixture({ alive: false, hp: 0, lootable: true });
    const refused = {
      ...engage,
      cast: undefined,
      current: dead,
      self: { ...vitals, hp: 0, maxHp: 0, maxPower: 0, power: 0 },
    };
    const text = plain(
      renderResultLines("engage", done(refused, "killed 1 of 3.")),
    );
    expect(text[1]).toBe(`${nerd.target} no current target`);
    expect(text.join("\n")).not.toMatch(/\b0\/0\b/);
    expect(text.join("\n")).not.toContain(nerd.self);
  });

  test("expanded engage adds targets, decisions and error codes", () => {
    const text = plain(
      renderResultLines("engage", done(engage, "killed 1 of 3."), {
        options: open,
      }),
    );
    expect(text).toContain("u9 Springpaw Stalker killed 6s");
    expect(text).toContain("OUT_OF_RANGE (12) ×2");
    expect(text).toContain(`${nerd.spell} Smite applied`);
    expect(text).toContain(`${nerd.compassN} step back discarded`);
  });

  test("expanded engage draws every decision, not only the last few", () => {
    const decisions = Array.from({ length: 9 }, (_, i) => ({
      at: i,
      disposition: "applied" as const,
      kind: "spell" as const,
      label: `Smite ${i}`,
    }));
    const text = plain(
      renderResultLines(
        "engage",
        done({ ...engage, decisions }, "killed 1 of 3."),
        { options: open },
      ),
    );
    for (const d of decisions) {
      expect(text).toContain(`${nerd.spell} ${d.label} applied`);
    }
  });

  test("rest and recover", () => {
    expect(
      plain(renderResultLines("rest", done(rest, "rested to 95%.")))[2],
    ).toBe("used Refreshing Spring Water ×1");
    const text = plain(
      renderResultLines("recover", done(recover, "you are alive."), {
        options: open,
      }),
    );
    expect(text[1]).toBe(
      `${nerd.health} alive via corpse in 41s · 3 legs · ${nerd.corpse} 0.8y`,
    );
    expect(text).toContain("other ways: spirit_healer");
  });

  test("every live-run result fits a 40-column pane", () => {
    const all = [
      renderResultLines("travel", done(travel, "arrived."), {
        options: open,
        width: 40,
      }),
      renderResultLines("engage", done(engage, "killed 1 of 3."), {
        options: open,
        width: 40,
      }),
      renderResultLines("rest", done(rest, "rested."), {
        options: open,
        width: 40,
      }),
      renderResultLines("recover", done(recover, "alive."), {
        options: open,
        width: 40,
      }),
    ];
    for (const line of all.flat())
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });
});
