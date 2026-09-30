import { describe, expect, test } from "bun:test";
import { scratchDir } from "@peon/core/test-support/scratch";
import { SOAP } from "#harness/grader/accounts";
import type { Exec } from "#harness/grader/exec";
import { expandArgv, newPartnerTrack } from "#harness/grader/partner";
import { cleanup, newRunState, stopHarness } from "#harness/grader/run-finish";
import {
  actPartners,
  createPartners,
  partnerSpecs,
  placePartners,
  readPartners,
  startPartners,
} from "#harness/grader/run-partners";
import {
  loadScenario,
  parseScenario,
  type Scenario,
} from "#harness/grader/scenarios";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const NOW = Date.parse("2026-09-28T02:00:00.000Z");
const AGENT = {
  account: "FAC00000000A0",
  character: "Fevala",
  preset: "eversong10",
  wrapper: "/wt/tmp/puppet-FAC00000000A0",
};
const WHISPER = loadScenario("t2-whisper-reply");
const SCENARIO: Scenario = {
  ...WHISPER,
  partner: null,
  partnerActions: [
    {
      actor: 2,
      argv: ["send", "-w", "<PARTNER1>", "<PARTNER2> and <AGENT> say hi"],
      at: { kind: "elapsed", ms: 1000 },
      windowMs: 5000,
    },
  ],
  partners: [
    { preset: "eversong10", role: "partner" },
    { preset: "eversong10-warrior", role: "witness" },
  ],
};

const accountOf = (n: number): string => `FAC000000000${n}`;

function truthOf(account: string, online: boolean): string {
  return JSON.stringify({
    account,
    alive: true,
    class: 1,
    deathState: "alive",
    guid: 2,
    health: 100,
    inventory: [],
    level: 10,
    money: 0,
    name: account,
    ok: true,
    online,
    position: { map: 530, o: 0, x: 1, y: 2, z: 3, zone: 3430 },
    quests: [],
    race: 10,
    rewardedQuests: [],
    savedAt: new Date(NOW).toISOString(),
    spells: [],
    xp: 0,
  });
}

function soapWorld(opts: { failCreate?: number; online?: string } = {}) {
  let created = 0;
  return fakeExec((argv) => {
    if (argv[3] === "truth")
      return ok(truthOf(argv[4] ?? "", argv[4] === opts.online));
    if (argv[3] === "create") {
      created += 1;
      if (created === opts.failCreate) return failed(1, "pdump copy failed");
      const account = accountOf(created);
      return ok(
        JSON.stringify({
          account,
          character: `Partner${created}`,
          password: "pw-secret-123",
          preset: argv[4],
          wrapper: `/wt/tmp/puppet-${account}`,
        }),
      );
    }
    if (argv[3] === "list") return ok("[]");
    if (argv[0] === "rg") return failed(1, "");
    if (argv[1] === "read") return ok('{"events":[]}');
    return ok('{"ok":true}');
  });
}

function runState(exec: Exec, scenario: Scenario = SCENARIO) {
  const runDir = scratchDir("partners");
  return newRunState({
    clock: { now: () => NOW },
    exec,
    log: () => undefined,
    replica: 1,
    round: 1,
    runDir,
    scenario,
    sha: "3af5aa3",
    tab: "eval-1-t9-raid-convert-1",
    truthWaitMs: 1,
  });
}

const deletes = (calls: { argv: string[] }[]): string[] =>
  calls.flatMap(({ argv }) =>
    argv[3] === "delete" && argv[4] !== undefined ? [argv[4]] : [],
  );

describe("partnerSpecs", () => {
  test("numbers each partner and keeps the single partner as is", () => {
    expect(partnerSpecs(SCENARIO)).toEqual([
      { kind: "partner", preset: "eversong10", role: "partner1" },
      { kind: "witness", preset: "eversong10-warrior", role: "partner2" },
    ]);
    expect(partnerSpecs(WHISPER)).toEqual([
      { kind: "partner", preset: WHISPER.preset, role: "partner" },
    ]);
  });
});

describe("two partners", () => {
  test("are created, started with a header trace and deleted on finish", async () => {
    const { calls, exec } = soapWorld();
    const st = runState(exec);
    await createPartners(
      { ...st, log: st.log, owner: st.tab },
      partnerSpecs(SCENARIO),
    );
    expect(
      calls.filter(({ argv }) => argv[3] === "create").map(({ argv }) => argv),
    ).toEqual([
      [...SOAP, "create", "eversong10", "--owner", st.tab],
      [...SOAP, "create", "eversong10-warrior", "--owner", st.tab],
    ]);
    expect(await Bun.file(`${st.runDir}/partner2-names.json`).json()).toEqual({
      account: accountOf(2),
      character: "Partner2",
      preset: "eversong10-warrior",
      wrapper: `/wt/tmp/puppet-${accountOf(2)}`,
    });
    await startPartners(st);
    expect(
      calls.filter(({ argv }) => argv[1] === "start").map(({ argv }) => argv),
    ).toEqual(
      [1, 2].map((n) => [
        `/wt/tmp/puppet-${accountOf(n)}`,
        "start",
        "--json",
        "--packet-trace",
        "headers",
      ]),
    );
    await stopHarness(st);
    expect(
      calls.filter(({ argv }) => argv[1] === "stop").map(({ argv }) => argv[0]),
    ).toEqual([1, 2].map((n) => `/wt/tmp/puppet-${accountOf(n)}`));
    await cleanup(st);
    expect(deletes(calls)).toEqual([accountOf(1), accountOf(2)]);
    expect(await Bun.file(`${st.runDir}/partner1.json`).exists()).toBe(false);
    expect(await Bun.file(`${st.runDir}/partner2.json`).exists()).toBe(false);
  });

  test("a failed second create deletes the first", async () => {
    const { calls, exec } = soapWorld({ failCreate: 2 });
    const st = runState(exec);
    const error = await createPartners(
      { ...st, log: st.log, owner: st.tab },
      partnerSpecs(SCENARIO),
    ).catch((err: unknown) => err);
    expect(String(error)).toContain("soap_create");
    await cleanup(st);
    expect(deletes(calls)).toEqual([accountOf(1)]);
  });

  test("an action with actor 2 runs on the second wrapper and expands every name", async () => {
    const { calls, exec } = soapWorld();
    const st = { ...runState(exec), agent: AGENT };
    await createPartners(
      { ...st, log: st.log, owner: st.tab },
      partnerSpecs(SCENARIO),
    );
    const track = newPartnerTrack(NOW - 2000);
    expect(await actPartners(st, track, [])).toBe(true);
    const sent = calls.find(({ argv }) => argv[1] === "send")?.argv;
    expect(sent).toEqual([
      `/wt/tmp/puppet-${accountOf(2)}`,
      "send",
      "-w",
      "Partner1",
      "Partner2 and Fevala say hi",
    ]);
    const steers = await Bun.file(`${st.runDir}/steers.jsonl`).json();
    expect(steers).toMatchObject({ actor: "partner2", code: 0 });
    await readPartners(st);
    expect(await Bun.file(`${st.runDir}/partner2-read.jsonl`).exists()).toBe(
      true,
    );
    expect(await Bun.file(`${st.runDir}/partner1-read.jsonl`).exists()).toBe(
      false,
    );
  });
});

describe("partnerSetup", () => {
  const setups = (calls: { argv: string[] }[]) =>
    calls.flatMap(({ argv }) =>
      argv[3] === "setup" ? [`${argv[4]} ${argv[5]} ${argv[6]}`] : [],
    );

  test("applies each step to its partner after the start point", async () => {
    const { calls, exec } = soapWorld();
    const st = runState(exec);
    await createPartners(
      { ...st, log: st.log, owner: st.tab },
      partnerSpecs(SCENARIO),
    );
    const [one, two] = [accountOf(1), accountOf(2)];
    await placePartners(st, undefined, {
      partnerSetup: [
        { actor: 2, body: { quest: 8326 }, endpoint: "quest/add" },
        { body: { level: 9 }, endpoint: "level" },
      ],
    });
    expect(setups(calls)).toEqual([
      `${two} quest/add {"quest":8326}`,
      `${one} level {"level":9}`,
    ]);
  });

  test("a setup step for a missing partner is refused", () => {
    expect(() =>
      parseScenario("t2-whisper-reply.json", {
        ...SCENARIO,
        partnerSetup: [{ actor: 3, body: {}, endpoint: "level" }],
      }),
    ).toThrow("$.partnerSetup[0].actor: no partner 3");
  });

  test("a setup step without an actor is refused when no partner exists", () => {
    const { partners, ...rest } = SCENARIO;
    expect(() =>
      parseScenario("t2-whisper-reply.json", {
        ...rest,
        partner: null,
        partnerSetup: [{ body: { quest: 8326 }, endpoint: "quest/add" }],
      }),
    ).toThrow("$.partnerSetup[0].actor: no partner 1");
  });

  test("a setup step for a missing partner throws instead of skipping", async () => {
    const { exec } = soapWorld();
    const st = runState(exec);
    const error = await placePartners(st, undefined, {
      partnerSetup: [{ body: {}, endpoint: "level" }],
    }).catch((err: unknown) => err);
    expect(String(error)).toContain("no partner 1");
  });
});

describe("partner truth", () => {
  const steps = (calls: { argv: string[] }[]) =>
    calls.flatMap(({ argv }) => {
      if (argv[3] === "truth") return [`truth ${argv[4]}`];
      const verb = argv[1];
      return verb === "start" || verb === "stop"
        ? [`${verb} ${argv[0]?.slice(-13)}`]
        : [];
    });

  test("is read once before each start and once after each stop", async () => {
    const { calls, exec } = soapWorld();
    const st = runState(exec);
    await createPartners(
      { ...st, log: st.log, owner: st.tab },
      partnerSpecs(SCENARIO),
    );
    await startPartners(st);
    await stopHarness(st);
    const [one, two] = [accountOf(1), accountOf(2)];
    expect(steps(calls)).toEqual([
      `truth ${one}`,
      `start ${one}`,
      `truth ${two}`,
      `start ${two}`,
      `stop ${one}`,
      `stop ${two}`,
      `truth ${one}`,
      `truth ${two}`,
    ]);
    for (const [role, account] of [
      ["partner1", one],
      ["partner2", two],
    ])
      for (const when of ["baseline", "final"])
        expect(
          (await Bun.file(`${st.runDir}/${role}-${when}.json`).json()).account,
        ).toBe(account);
    expect(st.notes).toEqual([]);
  });

  test("a partner online at baseline aborts before its start", async () => {
    const { calls, exec } = soapWorld({ online: accountOf(1) });
    const st = runState(exec);
    await createPartners(
      { ...st, log: st.log, owner: st.tab },
      partnerSpecs(SCENARIO),
    );
    const error = await startPartners(st).catch((err: unknown) => err);
    expect(String(error)).toContain("partner1 baseline truth says");
    expect(steps(calls)).toEqual([`truth ${accountOf(1)}`]);
  });
});

describe("expandArgv", () => {
  test("<PARTNER2> is the second character and <PARTNER> the first", () => {
    expect(
      expandArgv(["<PARTNER>", "<PARTNER1>", "<PARTNER2>", "<AGENT>"], {
        agent: "Fevala",
        partners: ["Aro", "Bex"],
      }),
    ).toEqual(["Aro", "Aro", "Bex", "Fevala"]);
  });
});
