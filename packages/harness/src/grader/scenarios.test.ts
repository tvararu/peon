import { describe, expect, test } from "bun:test";
import { loadScenario, ROUND_1 } from "#harness/grader/scenarios";

const TRIGGERS = [
  "fight_start",
  "kill",
  "death",
  "movement_start",
  "answer_text",
  "steer_landed",
];
const SOURCES = [
  "truth",
  "verifier",
  "witness",
  "game_log",
  "session",
  "frame",
];
const PRESETS = [
  "fresh",
  "eversong10",
  "eversong10-hunter",
  "elwynn1",
  "elwynn10",
  "ghostlands20",
];
const ids = (pick: (id: string) => boolean): string[] =>
  ROUND_1.filter(pick).toSorted();

describe("round-1 scenarios", () => {
  test("ROUND_1 lists the 13 ids in hand-schedule order", () => {
    expect(ROUND_1).toEqual([
      "t4-quest-first",
      "t6-die-and-recover",
      "t4-alliance-first",
      "t7-question-while-acting",
      "t7-halt-resume",
      "t3-ghostlands-kill",
      "t3-kill-one-hunter",
      "t1-walk-to-npc",
      "t5-vendor-buy-goldshire",
      "t2-whisper-reply",
      "t0-hostiles",
      "t0-who-is-near",
      "t0-self-state",
    ]);
  });

  test.each([...ROUND_1])("%s is well formed", (id) => {
    const scenario = loadScenario(id);
    expect(scenario.id).toBe(id);
    expect(scenario.tier).toBe(Number(id[1]));
    expect(PRESETS).toContain(scenario.preset);
    expect(scenario.paneMinutes).toBe(scenario.budget.minutes + 3);
    expect(scenario.budget.turns).toBeGreaterThan(0);
    expect(scenario.budget.tools).toBeGreaterThan(0);
    expect(scenario.task.length).toBeGreaterThan(20);
    expect(scenario.checks.length).toBeGreaterThan(0);
    expect(new Set(scenario.checks.map((check) => check.id)).size).toBe(
      scenario.checks.length,
    );
    for (const check of scenario.checks)
      expect(SOURCES).toContain(check.source);
    for (const { at, text } of scenario.steers) {
      expect(text.length).toBeGreaterThan(0);
      if (at.kind === "trigger") expect(TRIGGERS).toContain(at.trigger);
      else expect(at.ms).toBeGreaterThan(0);
    }
  });

  test("flags follow eval-suite section 6 and contract 0.5", () => {
    expect(ids((id) => loadScenario(id).navBound)).toEqual([
      "t1-walk-to-npc",
      "t4-quest-first",
      "t5-vendor-buy-goldshire",
      "t6-die-and-recover",
    ]);
    expect(ids((id) => loadScenario(id).needsWatcher)).toEqual([
      "t0-who-is-near",
      "t7-halt-resume",
    ]);
    expect(ids((id) => loadScenario(id).partner !== null)).toEqual([
      "t0-who-is-near",
      "t2-whisper-reply",
    ]);
    expect(loadScenario("t0-who-is-near").partner).toBe("witness");
    expect(loadScenario("t2-whisper-reply").partner).toBe("partner");
    expect(ids((id) => loadScenario(id).setup.length > 0)).toEqual([
      "t6-die-and-recover",
    ]);
    expect(loadScenario("t6-die-and-recover").setup).toEqual([
      { body: { level: 1 }, endpoint: "level" },
    ]);
  });

  test("pane minutes add up to the 155 of the round-1 table", () => {
    expect(
      ROUND_1.reduce((sum, id) => sum + loadScenario(id).paneMinutes, 0),
    ).toBe(155);
  });

  test("task text is verbatim", () => {
    expect(loadScenario("t0-self-state").task).toBe(
      "Quick status: level, health, mana, money, free bag slots, and what's in your main hand?",
    );
    expect(
      loadScenario("t7-halt-resume").steers.map((steer) => steer.text),
    ).toEqual([
      "Stop! Stop right now.",
      "OK, carry on, but only use Smite from now on.",
    ]);
  });

  test("an unknown id throws and names the known ids", () => {
    expect(() => loadScenario("t9-nope")).toThrow(
      "unknown scenario: t9-nope (known: t4-quest-first,",
    );
  });
});
