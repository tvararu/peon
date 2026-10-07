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
const STAGED_OUT: Record<string, true> = { "t9-arena-inspect": true };

describe("scenario files", () => {
  test("every file sits in a round and every round id has a file", () => {
    const listed = ROUNDS.flat();
    expect(listed.filter((id) => !SCENARIO_IDS.includes(id))).toEqual([]);
    expect(
      SCENARIO_IDS.filter((id) => !(listed.includes(id) || STAGED_OUT[id])),
    ).toEqual([]);
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

  test("an unknown id throws and names the id and the known ids", () => {
    const [first] = ROUND_1;
    expect(() => loadScenario("t9-nope")).toThrow("unknown scenario: t9-nope");
    expect(() => loadScenario("t9-nope")).toThrow(`known: ${first}`);
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

  test("a reactive action needs a trigger", () => {
    const [action] = two.partnerActions;
    expect(() =>
      parseScenario("t2-whisper-reply.json", {
        ...two,
        partnerActions: [
          { ...action, at: { kind: "elapsed", ms: 1000 }, reactive: true },
        ],
      }),
    ).toThrow("$.partnerActions[0].reactive: needs a trigger at");
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
});

describe("scenario env", () => {
  test("an unknown env key is refused", () => {
    const scenario = loadScenario("t3-pilot-camp-greedy");
    expect(() =>
      parseScenario("t3-pilot-camp-greedy.json", {
        ...scenario,
        env: { PEON_PILOT_CHOOSER: "random" },
      }),
    ).toThrow("invalid scenario t3-pilot-camp-greedy.json: $.env");
    expect(() =>
      parseScenario("t3-pilot-camp-greedy.json", {
        ...scenario,
        env: { PEON_DEBUG: "1" },
      }),
    ).toThrow("invalid scenario t3-pilot-camp-greedy.json: $.env");
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
