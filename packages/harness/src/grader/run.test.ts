import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import { bunExec, type Exec, type ExecResult } from "#harness/grader/exec";
import type { Preflight } from "#harness/grader/preflight";
import { type EvalResult, validateResult } from "#harness/grader/result";
import { runPaths, runScenario } from "#harness/grader/run";
import { loadScenario, type Scenario } from "#harness/grader/scenarios";
import { BUDGET_STOP } from "#harness/grader/steer";
import { failed, ok, orcaOk } from "#test-support/fake-exec";

const ACC = "FAC0123456789";
const PASSWORD = "pw-secret-123";
const SELF_STATE = loadScenario("t0-self-state");
const EDITOR = ["", "─".repeat(40), "", "─".repeat(40), "gpt-6-luna • high"];

type World = {
  worktree: string;
  runDir: string;
  now: number;
  char: string;
  answers: boolean;
  reply: string;
  launchFails: boolean;
  exited: boolean;
  seq: number;
  agent: StatusJson["agent"];
  calls: string[][];
  logs: string[];
};

async function newWorld(overrides: Partial<World> = {}): Promise<World> {
  const worktree = await mkdtemp(`${tmpdir()}/run-`);
  const { runDir } = runPaths({
    replica: 1,
    round: 1,
    scenario: "t0-self-state",
    worktree,
  });
  const base: World = {
    agent: "idle",
    answers: true,
    calls: [],
    char: "Fevala",
    exited: false,
    launchFails: false,
    logs: [],
    now: Date.parse("2026-09-26T21:00:00.000Z"),
    reply: "Level 10, 100% health.",
    runDir,
    seq: 0,
    worktree,
  };
  return { ...base, ...overrides };
}

async function log(world: World, event: LogEvent, text: string): Promise<void> {
  world.seq += 1;
  const entry: GameLogEntry = {
    char: world.char,
    class: "passive",
    data: {},
    domain: event.split("/")[0] as Domain,
    event,
    seq: world.seq,
    text,
    ts: world.now,
    v: 1,
  };
  await appendFile(
    `${world.runDir}/gamelog.jsonl`,
    `${JSON.stringify(entry)}\n`,
  );
}

async function writeStatus(world: World): Promise<void> {
  const lastProgress =
    world.agent === "tool"
      ? { at: world.now, event: "nav/route_start" as const }
      : undefined;
  const status: StatusJson = {
    agent: world.agent,
    at: world.now,
    connection: "online",
    lastProgress,
    lastToolCallAt: undefined,
    ready: true,
    run: undefined,
    tool: undefined,
    v: 1,
  };
  await writeFile(`${world.runDir}/status.json`, JSON.stringify(status));
}

function truth(world: World): string {
  const savedAt = world.exited
    ? new Date(world.now).toISOString()
    : "2026-09-25T10:00:00.000Z";
  const position = { map: 530, o: 0, x: 8735, y: -6685, z: 70.5, zone: 3430 };
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
    position,
    quests: [],
    race: 10,
    rewardedQuests: [],
    savedAt,
    spells: [],
    xp: 0,
  });
}

function soap(world: World, verb: string | undefined): ExecResult {
  const session = {
    account: ACC,
    character: "Fevala",
    dir: `${world.worktree}/tmp/factory-account-${ACC}`,
    password: PASSWORD,
    preset: "eversong10",
    wrapper: `${world.worktree}/tmp/tc-${ACC}`,
  };
  if (verb === "create") return ok(JSON.stringify(session));
  if (verb === "truth") return ok(truth(world));
  if (verb === "list") return ok("[]");
  return ok('{"ok":true}');
}

async function onSend(world: World, text: string): Promise<void> {
  if (text === "\u0004") {
    world.exited = true;
    return;
  }
  await log(world, "human/input", text);
  if (text === BUDGET_STOP || world.answers) {
    world.agent = "idle";
    await log(world, "agent/message", world.reply);
  }
}

async function orca(world: World, args: string[]): Promise<ExecResult> {
  const [sub] = args;
  if (sub === "create") {
    if (world.launchFails) return failed(1, "orca runtime not reachable");
    await log(world, "session/in_world", "in world");
    await writeStatus(world);
    return orcaOk({ handle: "term_run" });
  }
  if (sub === "read") return orcaOk({ tail: world.exited ? [] : EDITOR });
  if (sub === "send") {
    await onSend(world, args[args.indexOf("--text") + 1] ?? "");
    return orcaOk({});
  }
  if (sub === "wait")
    return world.exited
      ? ok('{"ok":true,"result":{"wait":{"satisfied":true}}}')
      : failed(1, "", '{"ok":false,"error":{"code":"timeout"}}');
  return orcaOk({});
}

function worldExec(world: World): Exec {
  return async (argv, opts) => {
    world.calls.push([...argv]);
    if (argv[0]?.endsWith(`/tmp/tc-${ACC}`))
      return argv[1] === "read"
        ? ok('[{"type":"whisper","sender":"Fevala","message":"10"}]')
        : ok('{"ok":true}');
    if (argv[0] === "git") return ok("3af5aa3\n");
    if (argv[0] === "rg") return bunExec(argv, opts);
    if (argv[0] === "orca-ide") return orca(world, argv.slice(2));
    if (argv[1] === "packages/factory/src/main.ts") return soap(world, argv[3]);
    return failed(127, `unexpected ${argv.join(" ")}`);
  };
}

function run(
  world: World,
  scenario: Scenario = SELF_STATE,
  preflight?: Preflight,
): Promise<string> {
  const sleep = async (ms: number): Promise<void> => {
    world.now += ms;
    await writeStatus(world);
  };
  return runScenario({
    clock: { now: () => world.now },
    exec: worldExec(world),
    log: (line) => world.logs.push(line),
    ...(preflight === undefined ? {} : { preflight }),
    replica: 1,
    round: 1,
    scenario,
    sleep,
    truthWaitMs: 1,
    worktree: world.worktree,
  });
}

async function leaked(dir: string): Promise<string> {
  return (await bunExec(["rg", "-uu", "-l", "-F", PASSWORD, dir])).stdout;
}

async function jsonLines(file: string): Promise<Record<string, unknown>[]> {
  return (await Bun.file(file).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const deleted = (world: World): boolean =>
  world.calls.some((call) => call[3] === "delete" && call[4] === ACC);

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
          x: 8743,
          y: -6685,
          z: 69.89,
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
      `exec bun packages/harness/src/entry.ts --profile ${world.runDir}/account.json --run-dir ${world.runDir} --glyphs nerd`,
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
    const wrapper = `${world.worktree}/tmp/tc-${ACC}`;
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
          x: 8743,
          y: -6685,
          z: 69.89,
          zone: 3430,
        }),
      ],
      [
        ACC,
        "position",
        JSON.stringify({
          map: 530,
          o: 1.686,
          x: 8727,
          y: -6689,
          z: 71.26,
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
    expect(draft.efficiency.exitSec).toBeGreaterThanOrEqual(60);
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
