import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { bunExec, type Exec } from "#harness/grader/exec";
import { type EvalResult, validateResult } from "#harness/grader/result";
import {
  cleanup,
  newRunState,
  type RunState,
  stopHarness,
  writeOutcome,
} from "#harness/grader/run-finish";
import { loadScenario } from "#harness/grader/scenarios";
import { failed, ok } from "#test-support/fake-exec";
import { fakePane } from "#test-support/fake-pane";

const ACC = "FAC0123456789";
const PARTNER = "FAC0000000002";
const PASSWORD = "pw-secret-123";
const NOW = Date.parse("2026-09-26T21:00:00.000Z");
const AGENT = {
  account: ACC,
  character: "Fevala",
  preset: "eversong10",
  wrapper: `/wt/tmp/tc-${ACC}`,
};

function truth(savedAt: string): string {
  return JSON.stringify({
    account: ACC,
    alive: true,
    class: 5,
    deathState: "alive",
    guid: 1,
    health: 100,
    inventory: [],
    level: 10,
    money: 50_000,
    name: "Fevala",
    ok: true,
    online: false,
    position: { map: 530, o: 0, x: 8735, y: -6685, z: 70.5, zone: 3430 },
    quests: [],
    race: 10,
    rewardedQuests: [],
    savedAt,
    spells: [],
    xp: 0,
  });
}

type Router = { calls: string[][]; exec: Exec };

function router(opts: { savedAt?: string; listed?: string[] } = {}): Router {
  const calls: string[][] = [];
  const exec: Exec = async (argv, execOpts) => {
    calls.push([...argv]);
    if (argv[0] === "rg") return bunExec(argv, execOpts);
    if (argv[3] === "truth")
      return ok(truth(opts.savedAt ?? new Date(NOW).toISOString()));
    if (argv[3] === "list")
      return ok(
        JSON.stringify((opts.listed ?? []).map((account) => ({ account }))),
      );
    return ok();
  };
  return { calls, exec };
}

async function state(
  exec: Exec,
  overrides: Partial<RunState> = {},
): Promise<RunState> {
  const runDir = await mkdtemp(`${tmpdir()}/finish-`);
  await mkdir(`${runDir}/grader`);
  await mkdir(`${runDir}/frames`);
  const base = newRunState({
    clock: { now: () => NOW },
    exec,
    log: () => undefined,
    replica: 1,
    round: 1,
    runDir,
    scenario: loadScenario("t0-self-state"),
    sha: "3af5aa3",
    tab: "eval-1-t0-self-state-1",
    truthWaitMs: 1,
  });
  return { ...base, agent: AGENT, ...overrides };
}

describe("stopHarness", () => {
  test("stops the watcher before the quit and keeps a fresh final truth", async () => {
    const order: string[] = [];
    const { exec } = router();
    const pane = {
      ...fakePane(["x"]),
      quit: async () => {
        order.push("quit");
      },
    };
    const st = await state(exec, {
      pane,
      watcher: {
        stop: async () => {
          order.push("watcher");
        },
      },
    });
    await stopHarness(st);
    expect(order).toEqual(["watcher", "quit"]);
    expect(st.exitMs).toBe(NOW);
    expect(st.finalSavedAt).toBe("2026-09-26T21:00:00.000Z");
    expect(st.abort).toBeUndefined();
    expect((await Bun.file(`${st.runDir}/final.json`).json()).level).toBe(10);
  });

  test("a stale final truth aborts the run as stale_truth", async () => {
    const { calls, exec } = router({ savedAt: "2026-09-25T10:00:00.000Z" });
    const st = await state(exec, { pane: fakePane(["x"]) });
    await stopHarness(st);
    expect(st.abort?.cause).toBe("stale_truth");
    expect(calls.filter((call) => call[3] === "truth")).toHaveLength(1);
  });

  test("keeps an earlier abort cause", async () => {
    const { exec } = router({ savedAt: "2026-09-25T10:00:00.000Z" });
    const st = await state(exec, {
      abort: { cause: "wrong_character", evidence: "Xiara" },
      pane: fakePane(["x"]),
    });
    await stopHarness(st);
    expect(st.abort?.cause).toBe("wrong_character");
  });

  test("without a pane it only stops the partner", async () => {
    const { calls, exec } = router();
    const partner = {
      ...AGENT,
      account: PARTNER,
      wrapper: `/wt/tmp/tc-${PARTNER}`,
    };
    const st = await state(exec, { partner });
    await stopHarness(st);
    expect(calls).toEqual([[`/wt/tmp/tc-${PARTNER}`, "stop"]]);
  });
});

describe("cleanup", () => {
  test("deletes the accounts, quarantines leaks and removes the session files", async () => {
    const { calls, exec } = router();
    const st = await state(exec, { pane: fakePane(["x"]) });
    await writeFile(
      `${st.runDir}/account.json`,
      JSON.stringify({ account: ACC, password: PASSWORD }),
      { mode: 0o600 },
    );
    await writeFile(`${st.runDir}/frames/00000-1.txt`, `echo ${PASSWORD}`);
    await cleanup(st);
    expect(calls.filter((call) => call[3] === "delete")).toEqual([
      ["bun", "packages/factory/src/main.ts", "soap", "delete", ACC],
    ]);
    expect(st.leaks).toEqual(["frames/00000-1.txt"]);
    expect(await readdir(`${st.runDir}/quarantine`)).toEqual([
      "frames_00000-1.txt",
    ]);
    expect(await Bun.file(`${st.runDir}/account.json`).exists()).toBe(false);
    expect(await Bun.file(`${st.runDir}/cleanup-failed`).exists()).toBe(false);
  });

  test("writes cleanup-failed when an account is still listed", async () => {
    const { exec } = router({ listed: [ACC] });
    const st = await state(exec);
    await cleanup(st);
    expect(await Bun.file(`${st.runDir}/cleanup-failed`).text()).toBe(
      `${ACC}\n`,
    );
  });

  test("a failed close still deletes the accounts", async () => {
    const { calls, exec } = router();
    const pane = {
      ...fakePane(["x"]),
      close: () => Promise.reject(new Error("no runtime")),
    };
    const st = await state(exec, { pane });
    await cleanup(st);
    expect(calls.some((call) => call[3] === "delete")).toBe(true);
    expect(st.notes).toContain("close: no runtime");
  });

  test("a failed soap list marks every account as not cleaned", async () => {
    const exec: Exec = async (argv) =>
      argv[3] === "list" ? failed(1, "service down") : ok();
    const st = await state(exec);
    await cleanup(st);
    expect(await Bun.file(`${st.runDir}/cleanup-failed`).text()).toBe(
      `${ACC}\n`,
    );
  });
});

describe("writeOutcome", () => {
  test("writes a schema-valid draft for a finished run", async () => {
    const { exec } = router();
    const st = await state(exec, {
      end: "done",
      exitMs: NOW,
      finalSavedAt: "2026-09-26T21:00:00.000Z",
      taskMs: NOW - 72_000,
    });
    expect(await writeOutcome(st)).toBe(
      "t0-self-state-1 draft 0/5 tools=0 wall=72",
    );
    const draft = (await Bun.file(
      `${st.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(validateResult(draft)).toEqual([]);
    expect(draft.checks.map((check) => check.id)).toEqual([
      "level",
      "money",
      "free-slots",
      "main-hand",
      "vitals",
    ]);
    expect(draft.checks[0]).toEqual({
      expected: "the stated level equals T baseline level",
      id: "level",
      met: false,
      observed: null,
      source: "truth",
    });
    expect(draft.accounts).toEqual([ACC]);
    expect(await Bun.file(`${st.runDir}/result.json`).exists()).toBe(false);
  });

  test("writes result.json for an aborted run with a leak friction item", async () => {
    const { exec } = router();
    const st = await state(exec, {
      abort: { cause: "launch_failed", evidence: "orca runtime not reachable" },
      end: "abort",
      leaks: ["frames/00000-1.txt"],
    });
    expect(await writeOutcome(st)).toStartWith("t0-self-state-1 aborted 0/5 ");
    const result = (await Bun.file(
      `${st.runDir}/result.json`,
    ).json()) as EvalResult;
    expect(validateResult(result)).toEqual([]);
    expect(result.verdict).toBe("aborted");
    expect(result.verdictReason).toBe("launch_failed");
    expect(result.friction[0]).toEqual({
      area: "tool",
      category: "credential-leak",
      quote:
        "a password was found in frames/00000-1.txt; the file is in quarantine/",
      ref: "quarantine/frames_00000-1.txt",
      severity: "blocker",
    });
  });
});
