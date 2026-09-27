import { appendFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { StatusJson } from "#harness/contract/config";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import { bunExec, type Exec, type ExecResult } from "#harness/grader/exec";
import type { Preflight } from "#harness/grader/preflight";
import { runPaths, runScenario } from "#harness/grader/run";
import { loadScenario, type Scenario } from "#harness/grader/scenarios";
import { BUDGET_STOP } from "#harness/grader/steer";
import { failed, ok, orcaOk } from "#test-support/fake-exec";

export const ACC = "FAC0123456789";
const PASSWORD = "pw-secret-123";
export const SELF_STATE = loadScenario("t0-self-state");
export const QUIT_MS = 5000;
const EDITOR = ["", "─".repeat(40), "", "─".repeat(40), "gpt-6-luna • high"];

export type World = {
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

export async function newWorld(overrides: Partial<World> = {}): Promise<World> {
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
  if (verb === "health")
    return ok(
      JSON.stringify({
        charactersInWorld: 107,
        factoryOnline: 2,
        ok: true,
        playersOnline: 0,
      }),
    );
  return ok('{"ok":true}');
}

async function onSend(world: World, text: string): Promise<void> {
  if (text === "\u0004") {
    world.exited = true;
    world.now += QUIT_MS;
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

export function run(
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

export async function leaked(dir: string): Promise<string> {
  return (await bunExec(["rg", "-uu", "-l", "-F", PASSWORD, dir])).stdout;
}

export async function jsonLines(
  file: string,
): Promise<Record<string, unknown>[]> {
  return (await Bun.file(file).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export const deleted = (world: World): boolean =>
  world.calls.some((call) => call[3] === "delete" && call[4] === ACC);
