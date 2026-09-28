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
  readPartners,
  startPartners,
} from "#harness/grader/run-partners";
import { loadScenario, type Scenario } from "#harness/grader/scenarios";
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

function soapWorld(opts: { failCreate?: number } = {}) {
  let created = 0;
  return fakeExec((argv) => {
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
