import { describe, expect, test } from "bun:test";
import {
  loadScenario,
  parseScenario,
  ROUND_1,
  SCENARIO_IDS,
} from "#harness/grader/scenarios";

const PRESETS = [
  "fresh",
  "eversong10",
  "eversong10-hunter",
  "eversong10-warrior",
  "elwynn1",
  "elwynn10",
  "ghostlands20",
];
const ROUNDS = [ROUND_1];

describe("scenario files", () => {
  test("every file sits in a round and every round id has a file", () => {
    const listed = ROUNDS.flat();
    expect(listed.filter((id) => !SCENARIO_IDS.includes(id))).toEqual([]);
    expect(SCENARIO_IDS.filter((id) => !listed.includes(id))).toEqual([]);
    for (const round of ROUNDS) expect(new Set(round).size).toBe(round.length);
  });

  test("an invalid scenario throws with its file name", () => {
    const scenario = loadScenario("t0-self-state");
    const [check] = scenario.checks;
    const stale = { ...scenario, checks: [{ ...check, events: ["xp/gain"] }] };
    expect(() => parseScenario("t0-self-state.json", stale)).toThrow(
      "invalid scenario t0-self-state.json: $.checks[0]: unknown events",
    );
    expect(() =>
      parseScenario("t0-self-state.json", { ...scenario, botRisk: "none" }),
    ).toThrow(
      "invalid scenario t0-self-state.json: $.botRisk: expected one of",
    );
    expect(() => parseScenario("t0-copy.json", scenario)).toThrow(
      "invalid scenario t0-copy.json: $.id: expected t0-copy",
    );
  });

  test("an unknown id throws and names the known ids", () => {
    expect(() => loadScenario("t9-nope")).toThrow(
      "unknown scenario: t9-nope (known: t4-quest-first,",
    );
  });
});

describe("round-1 scenarios", () => {
  test.each([...ROUND_1])("%s is well formed", (id) => {
    const scenario = loadScenario(id);
    expect(scenario.id).toBe(id);
    expect(scenario.tier).toBe(Number(id[1]));
    expect(PRESETS).toContain(scenario.preset);
    expect(scenario.paneMinutes).toBe(scenario.budget.minutes + 3);
    expect(scenario.task.length).toBeGreaterThan(20);
    expect(scenario.checks.length).toBeGreaterThan(0);
    expect(new Set(scenario.checks.map((check) => check.id)).size).toBe(
      scenario.checks.length,
    );
    for (const { text } of scenario.steers)
      expect(text.length).toBeGreaterThan(0);
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
  });

  test("t6 keeps its gear: a level-1 fresh character with no level write", () => {
    const scenario = loadScenario("t6-die-and-recover");
    expect(scenario.preset).toBe("fresh");
    expect(scenario.setup).toEqual([]);
    expect(scenario.spawn).toBe("eversong");
  });
});

describe("checks measure what they name", () => {
  const checkOf = (id: string, check: string) =>
    loadScenario(id).checks.find((entry) => entry.id === check);

  test("t3-kill-one-hunter grades the ranged casts and the pet attack", () => {
    expect(checkOf("t3-kill-one-hunter", "ranged-cast")).toMatchObject({
      evidence: {
        events: ["combat/cast"],
        ids: [75, 3044, 1978, 13_549, 5116],
      },
      source: "game_log",
    });
    const pet = checkOf("t3-kill-one-hunter", "pet-attack");
    expect(pet).toMatchObject({ measure: "pet_attack", source: "game_log" });
    expect(pet?.blockedBy).toBeUndefined();
  });

  test("t3-ghostlands-kill counts kill XP and attackers per fight", () => {
    expect(checkOf("t3-ghostlands-kill", "total-xp")).toMatchObject({
      measure: "kill_xp",
      source: "game_log",
    });
    expect(checkOf("t3-ghostlands-kill", "one-at-a-time")).toMatchObject({
      measure: "max_attackers",
    });
  });

  test("t7-question-while-acting anchors each check on its steer", () => {
    const measures = Object.fromEntries(
      loadScenario("t7-question-while-acting").checks.map((check) => [
        check.id,
        check.measure,
      ]),
    );
    expect(measures).toEqual({
      "answer-time": "answer_time",
      "answer-values": "answer_values",
      "kept-grinding": "kill_after_answer",
      stopped: "no_fight_after_stop",
    });
  });
});
