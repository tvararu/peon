import { describe, expect, test } from "bun:test";
import { type EvalResult, validateResult } from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";
import { BUDGET_STOP } from "#harness/grader/steer";
import {
  ACC,
  deleted,
  jsonLines,
  leaked,
  newWorld,
  QUIT_MS,
  run,
  SELF_STATE,
} from "#test-support/run-world";

describe("runScenario", () => {
  test("a finished run leaves a valid draft, a deleted account and no password", async () => {
    const world = await newWorld();
    expect(await run(world)).toMatch(
      /^t0-self-state-1 draft 0\/5 tools=0 wall=\d+$/,
    );
    const draft = (await Bun.file(
      `${world.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(validateResult({ ...draft, verdict: "fail" })).toEqual([]);
    expect(draft.verdict).toBeNull();
    expect(
      (await Bun.file(`${world.runDir}/run.json`).json()).bots,
    ).toMatchObject({ count: 105, risk: "low" });
    expect(draft.end).toBe("done");
    expect(draft.tab).toBe("eval-1-t0-self-state-1");
    expect(draft.evidence.finalSavedAt).toBeDefined();
    const setups = world.calls.filter((call) => call[3] === "setup");
    expect(setups.map((call) => call.slice(4))).toEqual([
      [
        ACC,
        "position",
        JSON.stringify({
          map: 530,
          o: 1.686,
          x: 8735,
          y: -6693,
          z: 71.5,
          zone: 3430,
        }),
      ],
    ]);
    const progress = await Bun.file(
      `${world.runDir}/grader/progress.log`,
    ).text();
    expect(progress).toContain(`run dir ${world.runDir}`);
    expect(progress).toContain("end done");
    for (const step of [
      "watcher",
      "quit",
      "final truth",
      "delete",
      "leak check",
      "concurrent",
      "session files",
    ])
      expect(progress).toContain(`cleanup ${step} done`);
    expect(progress).toContain("draft written");
    expect(world.logs[0]).toBe(`run dir ${world.runDir}`);
    expect(world.logs[1]).toBe(
      `grader log ${world.runDir}/grader/progress.log; write grader notes and command output under ${world.runDir}/grader/, not tmp/`,
    );
    const triggers = await jsonLines(`${world.runDir}/triggers.jsonl`);
    expect(triggers[0]?.["trigger"]).toBe("task_landed");
    expect(draft.checks[0]?.observed).toMatchObject({
      baseline: { level: 10 },
      final: { level: 10 },
    });
    for (const file of [
      "run.json",
      "names.json",
      "baseline.json",
      "final.json",
      "triggers.jsonl",
      "progress.json",
      "grader/concurrent.json",
    ]) {
      expect(await Bun.file(`${world.runDir}/${file}`).exists()).toBe(true);
    }
    expect(deleted(world)).toBe(true);
    expect(await Bun.file(`${world.runDir}/account.json`).exists()).toBe(false);
    expect(await leaked(world.runDir)).toBe("");
    expect(world.calls.find((call) => call[2] === "create")).toContain(
      `exec bun packages/harness/src/entry.ts --profile ${world.runDir}/account.json --run-dir ${world.runDir} --glyphs nerd --packet-trace headers`,
    );
  });

  test("a launch failure aborts, still deletes the account and removes account.json", async () => {
    const world = await newWorld({ launchFails: true });
    expect(await run(world)).toStartWith("t0-self-state-1 aborted 0/5 ");
    const result = (await Bun.file(
      `${world.runDir}/result.json`,
    ).json()) as EvalResult;
    expect(result.abort?.cause).toBe("launch_failed");
    expect(result.abort?.evidence).toContain("orca runtime not reachable");
    expect(validateResult(result)).toEqual([]);
    expect(deleted(world)).toBe(true);
    expect(await Bun.file(`${world.runDir}/account.json`).exists()).toBe(false);
  });

  test("a wrong character aborts and quits the harness", async () => {
    const world = await newWorld({ char: "Xiara" });
    await run(world);
    const result = (await Bun.file(
      `${world.runDir}/result.json`,
    ).json()) as EvalResult;
    expect(result.abort).toEqual({
      cause: "wrong_character",
      evidence: "session/in_world names Xiara, names.json names Fevala",
    });
    expect(
      world.calls.some((call) => call[2] === "send" && call.includes("\u0004")),
    ).toBe(true);
    expect(world.calls.some((call) => call.includes(SELF_STATE.task))).toBe(
      false,
    );
    expect(deleted(world)).toBe(true);
  });

  test("a run past its budget gets the stop steer and ends as budget", async () => {
    const world = await newWorld({ agent: "tool", answers: false });
    await run(world);
    const draft = (await Bun.file(
      `${world.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(draft.end).toBe("budget");
    expect(draft.interventions.map((item) => item.kind)).toEqual([
      "budget_stop",
    ]);
    expect(draft.interventions[0]?.text).toBe(BUDGET_STOP);
  });

  test("an elapsed steer is typed and recorded", async () => {
    const world = await newWorld();
    const scenario: Scenario = {
      ...SELF_STATE,
      steers: [{ at: { kind: "elapsed", ms: 4000 }, text: "How is it going?" }],
    };
    await run(world, scenario);
    const steers = (await Bun.file(`${world.runDir}/steers.jsonl`).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(steers).toEqual([
      {
        ms: expect.any(Number),
        text: "How is it going?",
        trigger: "elapsed:4000",
      },
    ]);
    const draft = (await Bun.file(
      `${world.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(draft.interventions.map((item) => item.kind)).toEqual(["steer"]);
  });

  test("a partner action waits for its time, runs through the partner wrapper and holds the done", async () => {
    const world = await newWorld();
    const scenario: Scenario = {
      ...SELF_STATE,
      partner: "partner",
      partnerActions: [
        {
          argv: ["send", "-w", "<AGENT>", "hey, what level are you?"],
          at: { kind: "elapsed", ms: 40_000 },
          windowMs: 20_000,
        },
      ],
    };
    const wrapper = `${world.worktree}/tmp/puppet-${ACC}`;
    await run(world, scenario);
    const sent = world.calls.find(
      (call) => call[0] === wrapper && call[1] === "send",
    );
    expect(sent).toEqual([
      wrapper,
      "send",
      "-w",
      "Fevala",
      "hey, what level are you?",
    ]);
    expect(await jsonLines(`${world.runDir}/steers.jsonl`)).toEqual([
      {
        actor: "partner",
        code: 0,
        ms: expect.any(Number),
        text: "send -w Fevala hey, what level are you?",
        trigger: "elapsed:40000",
      },
    ]);
    const setups = world.calls.filter((call) => call[3] === "setup");
    expect(setups.map((call) => call.slice(4))).toEqual([
      [
        ACC,
        "position",
        JSON.stringify({
          map: 530,
          o: 1.686,
          x: 8735,
          y: -6693,
          z: 71.5,
          zone: 3430,
        }),
      ],
      [
        ACC,
        "position",
        JSON.stringify({
          map: 530,
          o: 1.686,
          x: 8735,
          y: -6677,
          z: 69.58,
          zone: 3430,
        }),
      ],
    ]);
    const reads = await jsonLines(`${world.runDir}/partner-read.jsonl`);
    expect(reads.at(-1)?.["events"]).toEqual([
      { message: "10", sender: "Fevala", type: "whisper" },
    ]);
    const draft = (await Bun.file(
      `${world.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(draft.end).toBe("done");
    const [task, answer] = await jsonLines(`${world.runDir}/triggers.jsonl`);
    expect(answer?.["trigger"]).toBe("answer_text");
    expect(draft.efficiency).toMatchObject({
      exitSec: 60 + QUIT_MS / 1000,
      wallSec: (Number(answer?.["ms"]) - Number(task?.["ms"])) / 1000,
    });
  });

  test("two partners start with a header trace, and each is stopped and deleted", async () => {
    const world = await newWorld();
    const scenario: Scenario = {
      ...SELF_STATE,
      partners: [
        { preset: "eversong10", role: "partner" },
        { preset: "eversong10", role: "witness" },
      ],
    };
    await run(world, scenario);
    const wrapper = `${world.worktree}/tmp/puppet-${ACC}`;
    const of = (verb: string) =>
      world.calls.filter((call) => call[0] === wrapper && call[1] === verb);
    expect(of("start")).toEqual(
      [1, 2].map(() => [
        wrapper,
        "start",
        "--json",
        "--packet-trace",
        "headers",
      ]),
    );
    expect(of("stop")).toHaveLength(2);
    expect(of("nearby").length).toBeGreaterThan(0);
    expect(
      world.calls.filter((call) => call[3] === "delete" && call[4] === ACC),
    ).toHaveLength(3);
    for (const file of ["partner1-names.json", "partner2-names.json"])
      expect(await Bun.file(`${world.runDir}/${file}`).exists()).toBe(true);
    expect(await leaked(world.runDir)).toBe("");
  });

  test("a blockedBy key grades blocked with no account until the scenario drops it", async () => {
    const world = await newWorld();
    const scenario: Scenario = {
      ...SELF_STATE,
      blockedBy: ["map-0-navigation"],
    };
    expect(await run(world, scenario)).toStartWith(
      "t0-self-state-1 blocked 0/5 ",
    );
    const result = (await Bun.file(
      `${world.runDir}/result.json`,
    ).json()) as EvalResult;
    expect(validateResult(result)).toEqual([]);
    expect(result.verdict).toBe("blocked");
    expect(result.blockedBy).toEqual(["map-0-navigation"]);
    expect(result.verdictReason).toBe(
      "preflight: map-0-navigation is still missing",
    );
    expect(world.calls.some((call) => call[3] === "create")).toBe(false);
    expect(result.evidence).toEqual({ frames: 0, runDir: world.runDir });
  });

  test("a trigger steer that never fired drafts the run as blocked", async () => {
    const world = await newWorld();
    const scenario: Scenario = {
      ...SELF_STATE,
      steers: [
        { at: { kind: "trigger", trigger: "death" }, text: "You died." },
      ],
    };
    await run(world, scenario);
    const draft = (await Bun.file(
      `${world.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(validateResult(draft)).toEqual([]);
    expect(draft.end).toBe("stuck");
    expect(draft.verdict).toBe("blocked");
    expect(draft.blockedBy).toEqual(["no_death"]);
    expect(draft.verdictReason).toStartWith(
      "no_death: the death steer never fired",
    );
  });

  test("a question to the human ends stuck after one rescue nudge", async () => {
    const world = await newWorld({ reply: "What would you like me to do?" });
    await run(world);
    const draft = (await Bun.file(
      `${world.runDir}/grader/draft.json`,
    ).json()) as EvalResult;
    expect(draft.end).toBe("stuck");
    expect(draft.interventions.map((item) => item.kind)).toEqual([
      "rescue",
      "budget_stop",
    ]);
    expect(draft.efficiency).toMatchObject({
      exitSec: 152 + QUIT_MS / 1000,
      wallSec: 152,
    });
  });

  test("a lifted blocker lets the run go ahead", async () => {
    const world = await newWorld();
    const scenario: Scenario = {
      ...SELF_STATE,
      blockedBy: ["map-0-navigation"],
    };
    expect(await run(world, scenario, async () => false)).toStartWith(
      "t0-self-state-1 draft ",
    );
  });

  test("refuses a run dir that was used before", async () => {
    const world = await newWorld();
    await run(world);
    await expect(run(world)).rejects.toThrow(
      `run dir already used: ${world.runDir}`,
    );
  });
});
