import { appendFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { messageOf } from "@peon/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import {
  type AccountNames,
  applySetup,
  createAccount,
  RunAbort,
  sessionFile,
} from "#harness/grader/accounts";
import { recordBots } from "#harness/grader/bots";
import type { Exec } from "#harness/grader/exec";
import { harnessCommand, openPane, type Pane } from "#harness/grader/pane";
import { newPartnerTrack, type PartnerTrack } from "#harness/grader/partner";
import {
  blockersOf,
  heldUntilRemoved,
  type Preflight,
} from "#harness/grader/preflight";
import type { EvalResult } from "#harness/grader/result";
import {
  cleanup,
  newRunState,
  type RunState,
  stopHarness,
  writeJson,
  writeOutcome,
} from "#harness/grader/run-finish";
import {
  actPartners,
  createPartners,
  partnerSpecs,
  placePartners,
  readPartners,
  startPartners,
  witnessOf,
} from "#harness/grader/run-partners";
import type { Scenario } from "#harness/grader/scenarios";
import { startSlots } from "#harness/grader/spawn-slots";
import {
  asksHuman,
  BUDGET_STOP,
  describeAt,
  dueSteer,
  type EndAction,
  type EndMemory,
  type EndView,
  endAction,
  pendingAction,
  RESCUE_NUDGE,
  type SteerCursor,
} from "#harness/grader/steer";
import { readTruth } from "#harness/grader/truth";
import {
  createLogTail,
  hasTask,
  type LogTail,
  lastAnswer,
  progressOf,
  readStatus,
  type TriggerRow,
  triggerRows,
  watchRun,
} from "#harness/grader/watch";

export const POLL_MS = 2000;
export const READY_TIMEOUT_MS = 120_000;
export const SUBMIT_TIMEOUT_MS = 10_000;

const EDITOR_RULE = /─{20,}/;
const LANDED_POLL_MS = 1000;

export type RunInit = {
  exec: Exec;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  worktree: string;
  scenario: Scenario;
  round: number;
  replica: number;
  truthWaitMs?: number;
  preflight?: Preflight;
};

type Live = RunState & {
  init: RunInit;
  tail: LogTail;
  triggers: TriggerRow[];
  answerAt: number | undefined;
  answerAsks: boolean;
  inWorld: string | undefined;
  statusAt: number | undefined;
  cursor: SteerCursor;
  memory: EndMemory;
  lastSteerAt: number | undefined;
  partnerTrack: PartnerTrack;
};

type PathInit = {
  worktree: string;
  round: number;
  scenario: string;
  replica: number;
};

export function runPaths({ worktree, round, scenario, replica }: PathInit): {
  runDir: string;
  tab: string;
} {
  return {
    runDir: `${worktree}/tmp/evals/${round}/${scenario}-${replica}`,
    tab: `eval-${round}-${scenario}-${replica}`,
  };
}

async function headSha({ exec, worktree }: RunInit): Promise<string> {
  const { code, stderr, stdout } = await exec([
    "git",
    "-C",
    worktree,
    "rev-parse",
    "HEAD",
  ]);
  if (code !== 0)
    throw new Error(`git rev-parse HEAD failed: ${stderr.trim()}`);
  return stdout.trim();
}

function progressLogger(init: RunInit, runDir: string): RunInit["log"] {
  const file = `${runDir}/grader/progress.log`;
  return (line) => {
    init.log(line);
    appendFileSync(
      file,
      `${new Date(init.clock.now()).toISOString()} ${line}\n`,
    );
  };
}

const freshMemory = (taskMs: number): EndMemory => ({
  nudgedAt: undefined,
  stopAt: undefined,
  stopReason: undefined,
  taskMs,
});

async function prepare(given: RunInit): Promise<Live> {
  const paths = runPaths({
    replica: given.replica,
    round: given.round,
    scenario: given.scenario.id,
    worktree: given.worktree,
  });
  const runDir = resolve(paths.runDir);
  const { tab } = paths;
  if (await Bun.file(`${runDir}/run.json`).exists())
    throw new Error(`run dir already used: ${runDir}`);
  await mkdir(`${runDir}/frames`, { recursive: true });
  await mkdir(`${runDir}/grader`, { recursive: true });
  const init = { ...given, log: progressLogger(given, runDir) };
  init.log(`run dir ${runDir}`);
  const sha = await headSha(init);
  await writeJson(`${runDir}/run.json`, {
    replica: init.replica,
    round: init.round,
    scenario: init.scenario.id,
    sha,
    t0: init.clock.now(),
    tab,
  });
  const { clock, exec, replica, round, scenario, truthWaitMs } = init;
  const base = newRunState({
    clock,
    exec,
    log: init.log,
    replica,
    round,
    runDir,
    scenario,
    sha,
    tab,
    truthWaitMs,
  });
  const memory = freshMemory(0);
  const tail = createLogTail(`${runDir}/gamelog.jsonl`);
  return {
    ...base,
    answerAsks: false,
    answerAt: undefined,
    cursor: { index: 0, since: 0 },
    init,
    inWorld: undefined,
    lastSteerAt: undefined,
    memory,
    partnerTrack: newPartnerTrack(0),
    statusAt: undefined,
    tail,
    triggers: [],
  };
}

function paneOf(run: Live): Pane {
  if (run.pane === undefined) throw new Error("the pane is not open");
  return run.pane;
}

async function createAgent(run: Live): Promise<AccountNames> {
  const names = await createAccount({
    exec: run.exec,
    owner: run.tab,
    preset: run.scenario.preset,
    role: "agent",
    runDir: run.runDir,
  });
  run.init.log(`agent ${names.account} ${names.character}`);
  return names;
}

async function baseline(run: Live, account: string): Promise<void> {
  const truth = await readTruth(run.exec, account).catch((err: unknown) => {
    throw new RunAbort("service_down", messageOf(err), { cause: err });
  });
  await writeJson(`${run.runDir}/baseline.json`, truth);
  if (truth.online)
    throw new RunAbort("other", "baseline truth says the character is online");
}

async function launch(run: Live): Promise<void> {
  const command = harnessCommand({
    profile: sessionFile(run.runDir, "agent"),
    runDir: run.runDir,
  });
  const pane = await openPane({
    command,
    exec: run.exec,
    title: run.tab,
    worktree: run.init.worktree,
  }).catch((err: unknown) => {
    throw new RunAbort("launch_failed", messageOf(err), { cause: err });
  });
  run.pane = pane;
  run.init.log(`pane ${pane.id}`);
}

async function pollLog(run: Live): Promise<void> {
  const rows = await run.tail.read();
  run.triggers.push(...triggerRows(rows, hasTask(run.triggers)));
  const answer = lastAnswer(rows);
  if (answer !== undefined) {
    run.answerAt = answer.at;
    run.answerAsks = asksHuman(answer.text);
  }
  run.inWorld ??= rows.find((row) => row.event === "session/in_world")?.char;
  const { taskMs } = run;
  if (taskMs !== undefined)
    run.firstToolAt ??= rows.find(
      (row) => row.event === "tool/call" && row.ts >= taskMs,
    )?.ts;
}

function checkCharacter(run: Live, char: string): void {
  const expected = run.agent?.character;
  if (char !== expected)
    throw new RunAbort(
      "wrong_character",
      `session/in_world names ${char}, names.json names ${expected}`,
    );
  run.init.log("ready");
}

async function waitReady(run: Live): Promise<void> {
  const pane = paneOf(run);
  const deadline = run.clock.now() + READY_TIMEOUT_MS;
  while (run.clock.now() < deadline) {
    await pollLog(run);
    if (run.inWorld !== undefined && EDITOR_RULE.test(await pane.screen()))
      return checkCharacter(run, run.inWorld);
    if (await pane.waitExit(1))
      throw new RunAbort(
        "launch_failed",
        "the harness exited before it was ready",
      );
    await run.init.sleep(POLL_MS);
  }
  throw new RunAbort(
    "launch_failed",
    `no session/in_world row and Pi editor within ${READY_TIMEOUT_MS / 1000} s`,
  );
}

async function typeText(run: Live, text: string): Promise<void> {
  await paneOf(run).send(text, { enter: true });
}

async function awaitLanded(run: Live, since: number): Promise<void> {
  const deadline = since + SUBMIT_TIMEOUT_MS;
  while (run.clock.now() <= deadline) {
    await pollLog(run);
    if (
      run.triggers.some(
        (row) => row.trigger === "task_landed" && row.ms >= since,
      )
    )
      return;
    await run.init.sleep(LANDED_POLL_MS);
  }
  throw new RunAbort(
    "launch_failed",
    "the task did not reach the harness: no human/input row within 10 s",
  );
}

async function sendTask(run: Live): Promise<void> {
  const taskMs = run.clock.now();
  run.taskMs = taskMs;
  await typeText(run, run.scenario.task);
  run.init.log("task sent");
  await awaitLanded(run, taskMs);
  run.cursor = { index: 0, since: taskMs };
  run.partnerTrack = newPartnerTrack(taskMs);
  run.memory = freshMemory(taskMs);
}

async function steer(run: Live, now: number): Promise<void> {
  const due = dueSteer({
    cursor: run.cursor,
    now,
    steers: run.scenario.steers,
    triggers: run.triggers,
  });
  if (due === undefined) return;
  await typeText(run, due.text);
  await appendFile(
    `${run.runDir}/steers.jsonl`,
    `${JSON.stringify({ ms: now, text: due.text, trigger: describeAt(due.at) })}\n`,
  );
  run.interventions.push({ kind: "steer", ms: now, text: due.text });
  run.cursor = { index: run.cursor.index + 1, since: now };
  run.lastSteerAt = now;
  run.steersFired = run.cursor.index;
  run.init.log(`steer ${run.cursor.index}`);
}

async function actPartner(run: Live): Promise<void> {
  if (await actPartners(run, run.partnerTrack, run.triggers))
    run.init.log(`partner action ${run.partnerTrack.cursor.index}`);
}

function pendingOf(run: Live, now: number): boolean {
  return pendingAction({
    actionIndex: run.partnerTrack.cursor.index,
    actions: run.scenario.partnerActions?.length ?? 0,
    lastAnswerAt: run.answerAt,
    lastSteerAt: run.lastSteerAt,
    now,
    steerIndex: run.cursor.index,
    steers: run.scenario.steers.length,
    windowEnd: run.partnerTrack.windowEnd,
  });
}

async function endView(run: Live, now: number): Promise<EndView> {
  const status = await readStatus(`${run.runDir}/status.json`);
  if (status !== undefined) run.statusAt = status.at;
  return {
    answerAsks: run.answerAsks,
    budgetMs: run.scenario.budget.minutes * 60_000,
    lastAnswerAt: run.answerAt,
    now,
    pending: pendingOf(run, now),
    progress:
      status === undefined
        ? undefined
        : progressOf({ lastAnswerAt: run.answerAt, now, status }),
    statusAt: run.statusAt ?? run.memory.taskMs,
    tier: run.scenario.tier,
  };
}

async function nudge(run: Live, now: number): Promise<void> {
  await typeText(run, RESCUE_NUDGE);
  run.interventions.push({ kind: "rescue", ms: now, text: RESCUE_NUDGE });
  run.memory.nudgedAt = now;
}

async function stop(
  run: Live,
  reason: "budget" | "stuck",
  now: number,
): Promise<void> {
  await typeText(run, BUDGET_STOP);
  run.interventions.push({ kind: "budget_stop", ms: now, text: BUDGET_STOP });
  run.memory.stopAt = now;
  run.memory.stopReason = reason;
}

async function finish(
  run: Live,
  end: NonNullable<EvalResult["end"]>,
  pressEscape: boolean,
): Promise<void> {
  if (pressEscape) await paneOf(run).escape();
  run.end = end;
}

function act(run: Live, action: EndAction, now: number): Promise<void> {
  if (action.kind === "nudge") return nudge(run, now);
  if (action.kind === "stop") return stop(run, action.reason, now);
  if (action.kind === "end") return finish(run, action.end, action.escape);
  if (action.kind === "abort") {
    run.abort = { cause: "other", evidence: action.evidence };
    run.end = "abort";
  }
  return Promise.resolve();
}

async function drive(run: Live): Promise<void> {
  while (run.end === undefined) {
    await run.init.sleep(POLL_MS);
    await pollLog(run);
    const now = run.clock.now();
    if (run.memory.stopAt === undefined) {
      await steer(run, now);
      await actPartner(run);
    }
    await act(run, endAction(await endView(run, now), run.memory), now);
  }
  run.endMs = run.clock.now();
  if (run.end === "done") run.answerMs = run.answerAt;
  run.init.log(`end ${run.end}`);
}

async function play(run: Live): Promise<void> {
  const agent = await createAgent(run);
  run.agent = agent;
  await createPartners(
    { ...run, log: run.init.log, owner: run.tab },
    partnerSpecs(run.scenario),
  );
  const slots = startSlots(run.scenario, run.replica);
  await applySetup({
    account: agent.account,
    exec: run.exec,
    runDir: run.runDir,
    setup: [...run.scenario.setup, ...(slots ? [slots.agent] : [])],
  });
  await placePartners(run, slots?.partner);
  await baseline(run, agent.account);
  await startPartners(run);
  await launch(run);
  await waitReady(run);
  run.watcher = watchRun({
    clock: run.clock,
    exec: run.exec,
    pane: paneOf(run),
    runDir: run.runDir,
    witness: witnessOf(run.partners),
  });
  await sendTask(run);
  await drive(run);
  await readPartners(run);
}

function abortOf(err: unknown): NonNullable<EvalResult["abort"]> {
  if (err instanceof RunAbort)
    return { cause: err.abortCause, evidence: err.evidence };
  return { cause: "other", evidence: messageOf(err) };
}

export async function runScenario(init: RunInit): Promise<string> {
  const run = await prepare(init);
  run.log(
    `grader log ${run.runDir}/grader/progress.log; write grader notes and command output under ${run.runDir}/grader/, not tmp/`,
  );
  await recordBots({ ...run, scenario: init.scenario });
  run.blockedBy = await blockersOf(
    init.scenario,
    init.preflight ?? heldUntilRemoved,
  );
  if (run.blockedBy.length > 0) {
    run.init.log(`blocked ${run.blockedBy.join(", ")}`);
    return writeOutcome(run);
  }
  try {
    await play(run);
  } catch (err) {
    run.abort ??= abortOf(err);
    run.end = "abort";
  }
  try {
    await stopHarness(run);
  } finally {
    await cleanup(run);
  }
  return writeOutcome(run);
}
