import { appendFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { messageOf } from "@peon/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import { bunExec, type Exec } from "#harness/grader/exec";
import { awaitField, fieldClashes, liveClash } from "#harness/grader/fields";
import { captureFrame } from "#harness/grader/frames";
import { attachPane, harnessCommand, openPane } from "#harness/grader/pane";
import { type EvalResult, validateResult } from "#harness/grader/result";
import { runPaths, runScenario } from "#harness/grader/run";
import { summaryLine, writeJson } from "#harness/grader/run-finish";
import {
  loadScenario,
  ROUND_1,
  type Scenario,
} from "#harness/grader/scenarios";
import { finalTruth, leakCheck, readTruth } from "#harness/grader/truth";
import { watchRun } from "#harness/grader/watch";

export type CliDeps = {
  exec: Exec;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  signal: () => Promise<void>;
};

type Command = (args: string[], deps: CliDeps) => number | Promise<number>;

export const CLI_USAGE = `usage: mise eval <command>
  run <scenario> --round <n> [--replica <n>] [--no-wait]  run one scenario replica end to end (steps 1-13);
                                                    it queues up to 20 min while another run holds the field;
                                                    --no-wait exits 1 at once instead
  result <run-dir> <file>                           validate a graded result and write <run-dir>/result.json
  scenario [<id>]                                   print one scenario as JSON, or the round-1 ids
  round <id>...                                     refuse a round plan in which two scenarios share a target field
  launch <run-dir> --title <tab>                    open a harness pane for <run-dir>/account.json
  send <terminal> <text> [--enter]                  type into a pane
  frame <terminal> <dir> <seq>                      save one tagged screen frame
  watch <run-dir> <terminal> [--witness <wrapper>]  run the P6 watcher until SIGINT or SIGTERM
  truth <ACCOUNT>                                   print soap truth, checked
  final-truth <ACCOUNT> <exit-ms>                   final truth with the savedAt check
  leak-check <run-dir> <secret-file>...             list run-dir files that hold a password
  validate <file>                                   check a result file against the schema`;

const printJson = (deps: CliDeps, value: unknown): void =>
  deps.out(JSON.stringify(value));

function usage(deps: CliDeps): number {
  deps.err(CLI_USAGE);
  return 2;
}

async function progressLog(
  runDir: string,
  deps: CliDeps,
): Promise<(line: string) => void> {
  await mkdir(`${runDir}/grader`, { recursive: true });
  const file = `${runDir}/grader/progress.log`;
  return (line) => {
    deps.err(line);
    const stamp = new Date(deps.clock.now()).toISOString();
    appendFileSync(file, `${stamp} ${line}\n`);
  };
}

type FieldInit = {
  deps: CliDeps;
  runDir: string;
  scenario: Scenario;
  wait: boolean;
};

async function fieldFree({
  deps,
  runDir,
  scenario,
  wait,
}: FieldInit): Promise<boolean> {
  const round = dirname(runDir);
  const { clock, sleep } = deps;
  if (!wait) {
    const clash = await liveClash({ now: clock.now(), round, scenario });
    if (clash !== undefined) deps.err(clash);
    return clash === undefined;
  }
  const log = await progressLog(runDir, deps);
  try {
    await awaitField({ clock, log, round, scenario, sleep });
    return true;
  } catch (err) {
    log(messageOf(err));
    return false;
  }
}

async function run(args: string[], deps: CliDeps): Promise<number> {
  const options = {
    replica: { type: "string" },
    round: { type: "string" },
    wait: { default: true, type: "boolean" },
  } as const;
  const { positionals, values } = parseArgs({
    allowNegative: true,
    allowPositionals: true,
    args,
    options,
  });
  const [id] = positionals;
  const round = Number(values.round);
  const replica = Number(values.replica ?? "1");
  if (
    id === undefined ||
    !Number.isInteger(round) ||
    round < 0 ||
    !Number.isInteger(replica) ||
    replica < 1
  )
    return usage(deps);
  const scenario = loadScenario(id);
  if (!(await Bun.file(`${deps.cwd}/packages/factory/src/main.ts`).exists())) {
    throw new Error(
      "run from the eval worktree root (packages/factory/src/main.ts not found)",
    );
  }
  const { clock, exec, sleep } = deps;
  const { runDir } = runPaths({
    replica,
    round,
    scenario: id,
    worktree: deps.cwd,
  });
  if (!(await fieldFree({ deps, runDir, scenario, wait: values.wait })))
    return 1;
  deps.out(
    await runScenario({
      clock,
      exec,
      log: deps.err,
      replica,
      round,
      scenario,
      sleep,
      worktree: deps.cwd,
    }),
  );
  return 0;
}

async function result(
  [runDir, file]: string[],
  deps: CliDeps,
): Promise<number> {
  if (runDir === undefined || file === undefined) return usage(deps);
  const value: unknown = await Bun.file(file).json();
  const errors = validateResult(value);
  if (errors.length > 0) {
    printJson(deps, { errors, ok: false });
    return 1;
  }
  const graded = value as EvalResult;
  await writeJson(`${runDir}/result.json`, graded);
  deps.out(summaryLine(graded, graded.verdict));
  return 0;
}

async function validate([file]: string[], deps: CliDeps): Promise<number> {
  if (file === undefined) return usage(deps);
  const errors = validateResult(await Bun.file(file).json());
  printJson(deps, { errors, ok: errors.length === 0 });
  return errors.length === 0 ? 0 : 1;
}

function showScenario([id]: string[], deps: CliDeps): number {
  if (id === undefined) {
    for (const name of ROUND_1) deps.out(name);
    return 0;
  }
  printJson(deps, loadScenario(id));
  return 0;
}

function planRound(ids: string[], deps: CliDeps): number {
  if (ids.length === 0) return usage(deps);
  const clashes = fieldClashes(ids);
  for (const clash of clashes) deps.err(clash);
  if (clashes.length > 0) return 1;
  deps.out("no field is shared");
  return 0;
}

async function launch(args: string[], deps: CliDeps): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args,
    options: { title: { type: "string" } },
  });
  const [runDir] = positionals;
  if (runDir === undefined || values.title === undefined) return usage(deps);
  const command = harnessCommand({ profile: `${runDir}/account.json`, runDir });
  const pane = await openPane({
    command,
    exec: deps.exec,
    title: values.title,
    worktree: deps.cwd,
  });
  printJson(deps, { terminal: pane.id });
  return 0;
}

async function send(args: string[], deps: CliDeps): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args,
    options: { enter: { type: "boolean" } },
  });
  const [id, text] = positionals;
  if (id === undefined || text === undefined) return usage(deps);
  await attachPane({ exec: deps.exec, id }).send(text, {
    enter: values.enter === true,
  });
  printJson(deps, { sent: true });
  return 0;
}

async function frame([id, dir, seq]: string[], deps: CliDeps): Promise<number> {
  if (id === undefined || dir === undefined || seq === undefined)
    return usage(deps);
  const pane = attachPane({ exec: deps.exec, id });
  const shot = await captureFrame({
    dir,
    last: undefined,
    now: deps.clock.now(),
    pane,
    seq: Number(seq),
  });
  printJson(deps, { file: shot?.file });
  return 0;
}

async function watch(args: string[], deps: CliDeps): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args,
    options: { witness: { type: "string" } },
  });
  const [runDir, id] = positionals;
  if (runDir === undefined || id === undefined) return usage(deps);
  const pane = attachPane({ exec: deps.exec, id });
  const watcher = watchRun({
    clock: deps.clock,
    exec: deps.exec,
    pane,
    runDir,
    witness: values.witness,
  });
  await deps.signal();
  await watcher.stop();
  return 0;
}

async function truth([account]: string[], deps: CliDeps): Promise<number> {
  if (account === undefined) return usage(deps);
  printJson(deps, await readTruth(deps.exec, account));
  return 0;
}

async function final(
  [account, exitMs]: string[],
  deps: CliDeps,
): Promise<number> {
  if (account === undefined || exitMs === undefined) return usage(deps);
  const reply = await finalTruth({
    account,
    clock: deps.clock,
    exec: deps.exec,
    exitMs: Number(exitMs),
  });
  printJson(deps, reply);
  return reply.ok ? 0 : 1;
}

async function leaks(
  [runDir, ...secretFiles]: string[],
  deps: CliDeps,
): Promise<number> {
  if (runDir === undefined || secretFiles.length === 0) return usage(deps);
  const files = await leakCheck({ exec: deps.exec, runDir, secretFiles });
  printJson(deps, { files });
  return files.length === 0 ? 0 : 1;
}

const COMMANDS: Readonly<Record<string, Command>> = {
  "final-truth": final,
  frame,
  launch,
  "leak-check": leaks,
  result,
  round: planRound,
  run,
  scenario: showScenario,
  send,
  truth,
  validate,
  watch,
};

export async function main(
  argv: readonly string[],
  deps: CliDeps,
): Promise<number> {
  const [name, ...args] = argv;
  const command =
    name !== undefined && Object.hasOwn(COMMANDS, name)
      ? COMMANDS[name]
      : undefined;
  if (command === undefined) return usage(deps);
  try {
    return await command(args, deps);
  } catch (err) {
    deps.err(messageOf(err));
    return 1;
  }
}

function waitForSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
}

function defaultDeps(): CliDeps {
  return {
    clock: { now: () => Date.now() },
    cwd: process.cwd(),
    err: (line) => console.error(line),
    exec: bunExec,
    out: (line) => console.log(line),
    signal: waitForSignal,
    sleep: (ms) => Bun.sleep(ms),
  };
}

if (import.meta.main)
  process.exit(await main(Bun.argv.slice(2), defaultDeps()));
