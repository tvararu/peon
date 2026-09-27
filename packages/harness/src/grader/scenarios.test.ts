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
  "eversong10-warrior",
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
    expect(["low", "med", "high"]).toContain(scenario.botRisk);
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
      "t3-ghostlands-kill",
    ]);
  });

  test("every kill scenario names its target field", () => {
    const kills = [
      "t3-ghostlands-kill",
      "t3-kill-one-hunter",
      "t4-alliance-first",
      "t4-quest-first",
      "t6-die-and-recover",
      "t7-halt-resume",
      "t7-question-while-acting",
    ];
    for (const id of kills)
      expect(loadScenario(id).field ?? "").toMatch(/^[a-z]+(-[a-z]+)+$/);
    expect(ids((id) => loadScenario(id).field !== undefined)).toEqual(kills);
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

  test("t6 heads northeast, the bearing of the stalker field from its spawn", () => {
    expect(loadScenario("t6-die-and-recover").task).toBe(
      "Head northeast out of the village and fight the first big cat you see.",
    );
  });

  test("t3-kill-one-hunter splits ranged casts from the pet attack, which has no event", () => {
    const checks = loadScenario("t3-kill-one-hunter").checks;
    expect(checks.map((check) => check.id)).not.toContain("pet-and-ranged");
    expect(checks.find((check) => check.id === "ranged-cast")).toMatchObject({
      events: ["combat/cast"],
      ids: [75, 3044, 1978, 13_549, 5116],
      source: "game_log",
    });
    expect(checks.find((check) => check.id === "pet-attack")).toMatchObject({
      blockedBy: "P5:pet_attack",
      source: "game_log",
    });
  });

  test("t7 steers fire on the second kill and 20 s after the acknowledgement", () => {
    expect(loadScenario("t7-question-while-acting").steers[0]?.at).toEqual({
      kind: "trigger",
      nth: 2,
      trigger: "kill",
    });
    expect(loadScenario("t7-halt-resume").steers[1]?.at).toEqual({
      delayMs: 20_000,
      kind: "trigger",
      trigger: "answer_text",
    });
  });

  test("t2-whisper-reply whispers the agent through the partner at task + 60 s", () => {
    expect(loadScenario("t2-whisper-reply").partnerActions).toEqual([
      {
        argv: ["send", "-w", "<AGENT>", "hey, what level are you?"],
        at: { kind: "elapsed", ms: 60_000 },
        windowMs: 90_000,
      },
    ]);
    expect(
      ids((id) => (loadScenario(id).partnerActions ?? []).length > 0),
    ).toEqual(["t2-whisper-reply"]);
  });

  test("an unknown id throws and names the known ids", () => {
    expect(() => loadScenario("t9-nope")).toThrow(
      "unknown scenario: t9-nope (known: t4-quest-first,",
    );
  });
});

const expectOf = (id: string, check: string): string =>
  loadScenario(id).checks.find((entry) => entry.id === check)?.expect ?? "";

describe("expectations match preset truth", () => {
  test("t0-self-state counts free slots from T final rows", () => {
    const text = expectOf("t0-self-state", "free-slots");
    expect(text).toContain("T final");
    expect(text).toContain("112");
    expect(text).toContain("conjured");
    expect(text).not.toContain("occupied T baseline rows");
  });

  test("t1-walk-to-npc anchors on Marniel's spawn", () => {
    const text = expectOf("t1-walk-to-npc", "at-marniel");
    expect(text).toContain("(8700.4, -6638.4, 72.8, map 530)");
    expect(text).not.toContain("8703.9");
  });

  test("t3-ghostlands-kill accepts non-gray hostiles", () => {
    const text = expectOf("t3-ghostlands-kill", "two-kills");
    expect(text).toContain("level 14-23");
    expect(text).not.toContain("17-23");
  });

  test("t0-hostiles lists the hostile and neutral types in view", () => {
    const hostile = expectOf("t0-hostiles", "hostile-names");
    for (const name of [
      "Springpaw Stalker",
      "Eversong Tender",
      "Rotlimb Cannibal",
      "Plaguebone Pillager",
    ])
      expect(hostile).toContain(name);
    const neutral = expectOf("t0-hostiles", "neutral-not-hostile");
    for (const name of [
      "Crazed Dragonhawk",
      "Feral Dragonhawk Hatchling",
      "Red Dragonhawk Hatchling",
      "Golden Dragonhawk Hatchling",
      "Silver Dragonhawk Hatchling",
    ])
      expect(neutral).toContain(name);
  });

  test("t6 keeps its gear: a level-1 fresh character with no level write", () => {
    const scenario = loadScenario("t6-die-and-recover");
    expect(scenario.preset).toBe("fresh");
    expect(scenario.setup).toEqual([]);
    expect(scenario.spawn).toBe("eversong");
  });

  test("t3-ghostlands-kill starts on the only floor at z 88.66", () => {
    expect(loadScenario("t3-ghostlands-kill").setup).toEqual([
      {
        body: { map: 530, o: 4.007, x: 7575, y: -6835, z: 88.66, zone: 3433 },
        endpoint: "position",
      },
    ]);
  });

  test("t1 judges the stop by move rows, not a 10 s quiet window", () => {
    const text = expectOf("t1-walk-to-npc", "stopped");
    expect(text).toContain(
      "the last control/move_stop comes before the done message",
    );
    expect(text).not.toContain("10 s");
  });

  test("t7-halt accepts a halted target another player killed", () => {
    const text = expectOf("t7-halt-resume", "halted-target");
    expect(text).toContain("botInterference");
    expect(text).toContain("names the death");
  });

  test("t7-question-while-acting states when and how close the vitals must be", () => {
    const text = expectOf("t7-question-while-acting", "answer-values");
    expect(text).toContain("at the answer time");
    expect(text).toContain("10 percentage points");
  });

  test("t5-vendor-buy-goldshire sums item 159 over every row", () => {
    expect(expectOf("t5-vendor-buy-goldshire", "water")).toContain(
      "summed over every T row",
    );
  });
});

describe("checks measure what they name", () => {
  const checkOf = (id: string, check: string) =>
    loadScenario(id).checks.find((entry) => entry.id === check);

  test("every measure is a known draft measure", () => {
    for (const id of ROUND_1)
      for (const { measure } of loadScenario(id).checks)
        if (measure !== undefined)
          expect(["kill_xp", "max_attackers"]).toContain(measure);
  });

  test("t3-ghostlands-kill counts only XP from kill credits", () => {
    const check = checkOf("t3-ghostlands-kill", "total-xp");
    expect(check).toMatchObject({ measure: "kill_xp", source: "game_log" });
    expect(check?.expect).toContain("combat/kill_credit");
    expect(check?.expect).toContain("do not count");
  });

  test("t3-ghostlands-kill one-at-a-time needs a fight", () => {
    const check = checkOf("t3-ghostlands-kill", "one-at-a-time");
    expect(check).toMatchObject({ measure: "max_attackers" });
    expect(check?.expect).toContain("at least one GL fight");
    expect(check?.expect).toContain("no fight is not met");
  });

  test("t7-question-while-acting names its truth stream and tolerance", () => {
    const text = checkOf("t7-question-while-acting", "answer-values")?.expect;
    expect(text).toContain("jev.jsonl");
    expect(text).toContain("2 s");
    expect(text).toContain("10 percentage points");
    expect(text).toContain("snapshot/world");
  });
});
