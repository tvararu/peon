import { describe, expect, test } from "bun:test";
import { observeGameLog } from "#harness/grader/draft-gamelog";
import {
  loadScenario,
  parseScenario,
  ROUND_1,
  SCENARIO_IDS,
  type TruthPick,
} from "#harness/grader/scenarios";

const PRESETS = [
  "fresh",
  "eversong10",
  "eversong10-hunter",
  "eversong10-mage",
  "eversong10-warrior",
  "eversong1-shaman",
  "elwynn1",
  "elwynn10",
  "ghostlands20",
  "max80",
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

  test("a schedule missing the field its kind needs is invalid", () => {
    const scenario = loadScenario("t2-whisper-reply");
    const text = "go";
    for (const at of [{ kind: "elapsed" }, { kind: "trigger" }]) {
      expect(() =>
        parseScenario("t2-whisper-reply.json", {
          ...scenario,
          steers: [{ at, text }],
        }),
      ).toThrow("$.steers[0].at: matches none of 2 shapes");
      const [action] = scenario.partnerActions ?? [];
      expect(() =>
        parseScenario("t2-whisper-reply.json", {
          ...scenario,
          partnerActions: [{ ...action, at }],
        }),
      ).toThrow("$.partnerActions[0].at: matches none of 2 shapes");
    }
  });

  test("a truth check may pick every truth field", () => {
    const picks: TruthPick[] = [
      "spells",
      "equipment",
      "bank",
      "hearth",
      "reputation",
      "mail",
      "durability",
    ];
    const scenario = loadScenario("t0-self-state");
    const check = {
      evidence: { truth: picks },
      expect: "gear",
      id: "gear",
      source: "truth",
    };
    const loaded = parseScenario("t0-self-state.json", {
      ...scenario,
      checks: [check],
    });
    expect(loaded.checks[0]?.evidence?.truth).toEqual(picks);
    expect(() =>
      parseScenario("t0-self-state.json", {
        ...scenario,
        checks: [{ ...check, evidence: { truth: ["talents"] } }],
      }),
    ).toThrow("invalid scenario t0-self-state.json: $.checks[0].evidence");
  });

  test("a console check loads and one without match or a valid regex is refused", () => {
    const scenario = loadScenario("t0-self-state");
    const check = {
      evidence: {
        console: { arg: "FacProbe", match: "^Guild", read: "guild" },
      },
      expect: "in a guild",
      id: "guild",
      source: "console",
    };
    const loaded = parseScenario("t0-self-state.json", {
      ...scenario,
      checks: [check],
    });
    expect(loaded.checks[0]?.evidence?.console?.read).toBe("guild");
    const refused = (evidence: unknown) =>
      expect(() =>
        parseScenario("t0-self-state.json", {
          ...scenario,
          checks: [{ ...check, evidence }],
        }),
      );
    refused({ console: { read: "group" } }).toThrow(
      "$.checks[0].evidence.console: missing match",
    );
    refused({ console: { match: "x", read: "bank" } }).toThrow(
      "$.checks[0].evidence.console.read: expected one of",
    );
    refused({ console: { match: "(", read: "group" } }).toThrow(
      "$.checks[0].evidence.console.match: invalid regex",
    );
    refused({}).toThrow("$.checks[0]: a console check needs evidence.console");
    refused({ console: { match: "x", read: "guild" } }).toThrow(
      "$.checks[0].evidence.console.arg: read guild needs arg",
    );
    refused({ console: { arg: "Fevala", match: "x", read: "group" } }).toThrow(
      "$.checks[0].evidence.console.arg: read group takes no arg",
    );
  });

  test("an unknown id throws and names the known ids", () => {
    expect(() => loadScenario("t9-nope")).toThrow(
      "unknown scenario: t9-nope (known: t4-quest-first,",
    );
  });
});

describe("multi-partner scenarios", () => {
  const base = loadScenario("t2-whisper-reply");
  const two = {
    ...base,
    partner: null,
    partnerActions: [
      {
        ...base.partnerActions?.[0],
        actor: 2,
        argv: ["send", "-w", "<PARTNER1>", "hi"],
      },
    ],
    partners: [
      { preset: "eversong10", role: "partner" as const },
      { preset: "eversong10-warrior", role: "witness" as const },
    ],
  };

  test("a scenario with two partners loads", () => {
    expect(parseScenario("t2-whisper-reply.json", two).partners).toEqual(
      two.partners,
    );
  });

  test("a scenario with both partner and partners is refused", () => {
    expect(() =>
      parseScenario("t2-whisper-reply.json", { ...two, partner: "partner" }),
    ).toThrow("$.partners: set partner or partners, not both");
  });

  test("five partners are refused", () => {
    const partners = Array.from({ length: 5 }, () => ({
      preset: "eversong10",
      role: "partner",
    }));
    expect(() =>
      parseScenario("t2-whisper-reply.json", { ...two, partners }),
    ).toThrow("$.partners: at most 4 partners");
  });

  test("an action names an actor the scenario has", () => {
    const [action] = two.partnerActions;
    expect(() =>
      parseScenario("t2-whisper-reply.json", {
        ...two,
        partnerActions: [{ ...action, actor: 3 }],
      }),
    ).toThrow("$.partnerActions[0].actor: no partner 3");
    expect(() =>
      parseScenario("t2-whisper-reply.json", {
        ...two,
        partnerActions: [{ ...action, actor: 0 }],
      }),
    ).toThrow("$.partnerActions[0].actor: below minimum 1");
  });
});

describe("who on a truth check", () => {
  const base = loadScenario("t2-whisper-reply");
  const check = (who: string) => ({
    evidence: { truth: ["inventory"], who },
    expect: "the partner holds the item",
    id: "partner-holds",
    source: "truth",
  });
  const withWho = (who: string, over: Record<string, unknown> = {}) => ({
    ...base,
    checks: [check(who)],
    ...over,
  });
  const two = {
    partner: null,
    partnerActions: [],
    partners: [
      { preset: "eversong10", role: "partner" },
      { preset: "eversong10", role: "partner" },
    ],
  };

  test("who names the agent or a partner the scenario has", () => {
    const [loaded] = parseScenario(
      "t2-whisper-reply.json",
      withWho("partner"),
    ).checks;
    expect(loaded?.evidence?.who).toBe("partner");
    expect(() =>
      parseScenario("t2-whisper-reply.json", withWho("partner2", two)),
    ).not.toThrow();
  });

  test("who names no partner the scenario lacks", () => {
    const refused = (who: string, over: Record<string, unknown> = {}) =>
      expect(() =>
        parseScenario("t2-whisper-reply.json", withWho(who, over)),
      ).toThrow(`$.checks[0].evidence.who: the scenario has no ${who}`);
    refused("partner3", two);
    refused("partner", two);
    refused("partner1");
    refused("partner", { partner: null, partnerActions: [] });
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

  test("t4-quests-level-five starts a fresh level 1 and grades level, rewards and XP on server truth", () => {
    const scenario = loadScenario("t4-quests-level-five");
    expect(scenario.preset).toBe("fresh");
    expect(scenario.setup).toEqual([]);
    expect(scenario.field).toBe(loadScenario("t4-quest-first").field);
    expect(scenario.budget.minutes).toBeGreaterThanOrEqual(60);
    const level = scenario.checks.find((check) => check.id === "level");
    expect(level).toMatchObject({
      evidence: { truth: ["level"] },
      source: "truth",
    });
    const rewarded = scenario.checks.find((c) => c.id === "quests-rewarded");
    expect(rewarded?.evidence?.truth).toContain("quests");
    const sources = scenario.checks.map((check) => check.source);
    expect(sources).toContain("game_log");
  });
});

describe("checks measure what they name", () => {
  const checkOf = (id: string, check: string) =>
    loadScenario(id).checks.find((entry) => entry.id === check);

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

  test("t4-reputation-gain accepts the faction by id when Faction.dbc is absent", () => {
    expect(checkOf("t4-reputation-gain", "reputation-rows")).toMatchObject({
      evidence: {
        events: ["reputation/changed", "reputation/rank"],
        ids: [55],
      },
    });
  });
  test("t9-raid-mark names a creature that spawns at its start", () => {
    const scenario = loadScenario("t9-raid-mark");
    expect(scenario.spawn).toBe("eversong-ready");
    expect(scenario.task).toContain("Springpaw Stalker");
    expect(scenario.task).not.toContain("Lynx");
  });
});

describe("t9-lfg-queue when bots fill the queue", () => {
  test("the wait check is met by a queue row or by the proposal that pre-empts it", () => {
    const scenario = loadScenario("t9-lfg-queue");
    const wait = scenario.checks.find((entry) => entry.id === "wait-row");
    const events = wait?.evidence?.events ?? [];
    expect(events).toContain("lfg/queue");
    expect(events).toContain("lfg/proposal");
    expect(events).toContain("lfg/queued");
  });

  test("queued and left stay required", () => {
    const scenario = loadScenario("t9-lfg-queue");
    const queued = scenario.checks.find((entry) => entry.id === "queued");
    const left = scenario.checks.find((entry) => entry.id === "left");
    expect(queued?.evidence?.events).toEqual(["lfg/queued"]);
    expect(left?.evidence?.events).toEqual(["lfg/left"]);
  });
});

describe("t9-lfg-queue wait evidence", () => {
  const waitCheck = () => {
    const check = loadScenario("t9-lfg-queue").checks.find(
      (entry) => entry.id === "wait-row",
    );
    if (check === undefined) throw new Error("wait-row missing");
    return check;
  };
  const row = (
    line: number,
    event: string,
    ts: number,
    data: unknown = {},
  ) => ({
    data,
    event,
    line,
    seq: line,
    text: event,
    ts,
  });

  test("a queue row that follows the proposal stays visible beside the join and proposal timing", () => {
    const observed = observeGameLog(
      [
        row(20, "lfg/join_result", 1000),
        row(21, "lfg/queued", 1000),
        row(26, "lfg/proposal", 1027),
        row(28, "lfg/queue", 1528, { dungeon: 1, queuedTime: 1 }),
        row(40, "lfg/left", 3000),
      ],
      waitCheck(),
    );
    expect(observed?.rows.map((entry) => entry.event)).toEqual([
      "lfg/join_result",
      "lfg/queued",
      "lfg/proposal",
      "lfg/queue",
    ]);
  });

  test("a run with no queue row shows the join and proposal timing alone", () => {
    const observed = observeGameLog(
      [
        row(16, "lfg/join_result", 1000),
        row(17, "lfg/queued", 1000),
        row(22, "lfg/proposal", 1006),
        row(44, "lfg/left", 3000),
      ],
      waitCheck(),
    );
    expect(observed?.rows.map((entry) => entry.event)).toEqual([
      "lfg/join_result",
      "lfg/queued",
      "lfg/proposal",
    ]);
  });
});
