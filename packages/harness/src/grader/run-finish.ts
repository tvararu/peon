import { readdir, writeFile } from "node:fs/promises";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { Clock } from "#harness/contract/services";
import {
  type AccountNames,
  deleteAccounts,
  quarantine,
  removeSessionFiles,
  sessionFile,
} from "#harness/grader/accounts";
import { observedChecks } from "#harness/grader/draft-fill";
import { efficiency, readSessionUsage } from "#harness/grader/efficiency";
import type { Exec } from "#harness/grader/exec";
import type { Pane } from "#harness/grader/pane";
import {
  type EvalEvidence,
  type EvalIntervention,
  type EvalResult,
  type FrictionItem,
  validateResult,
} from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";
import { finalTruth, leakCheck } from "#harness/grader/truth";
import type { Watcher } from "#harness/grader/watch";

export const EXIT_WAIT_MS = 20_000;
export const DRAFT_REASON =
  "draft: the grader decides the checks, friction and verdict";

const PARTNER_STOP_MS = 60_000;
const NOTES_MAX = 1500;

export type RunState = {
  exec: Exec;
  clock: Clock;
  scenario: Scenario;
  round: number;
  replica: number;
  runDir: string;
  tab: string;
  sha: string;
  truthWaitMs: number;
  agent: AccountNames | undefined;
  partner: AccountNames | undefined;
  pane: Pane | undefined;
  watcher: Watcher | undefined;
  taskMs: number | undefined;
  exitMs: number | undefined;
  firstToolAt: number | undefined;
  end: EvalResult["end"];
  abort: EvalResult["abort"];
  interventions: EvalIntervention[];
  finalSavedAt: string | undefined;
  cleanupFailed: string[];
  leaks: string[];
  notes: string[];
  blockedBy: string[];
  steersFired: number;
};

export type RunStateInit = Pick<
  RunState,
  "exec" | "clock" | "scenario" | "round" | "replica" | "runDir" | "tab" | "sha"
> & { truthWaitMs?: number };

export function newRunState({
  truthWaitMs = 10_000,
  ...init
}: RunStateInit): RunState {
  return {
    ...init,
    abort: undefined,
    agent: undefined,
    blockedBy: [],
    cleanupFailed: [],
    end: undefined,
    exitMs: undefined,
    finalSavedAt: undefined,
    firstToolAt: undefined,
    interventions: [],
    leaks: [],
    notes: [],
    pane: undefined,
    partner: undefined,
    steersFired: 0,
    taskMs: undefined,
    truthWaitMs,
    watcher: undefined,
  };
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function accountsOf(st: RunState): string[] {
  return [st.agent?.account, st.partner?.account].filter(
    (account): account is string => account !== undefined,
  );
}

async function attempt(
  st: RunState,
  what: string,
  job: () => Promise<unknown>,
): Promise<void> {
  try {
    await job();
  } catch (err) {
    st.notes.push(`${what}: ${messageOf(err)}`);
  }
}

async function quitPane(st: RunState, pane: Pane): Promise<void> {
  await pane.quit();
  if (!(await pane.waitExit(EXIT_WAIT_MS)))
    st.notes.push(
      `quit: the harness did not exit within ${EXIT_WAIT_MS / 1000} s`,
    );
}

async function verifyFinal(st: RunState, account: string): Promise<void> {
  const final = await finalTruth({
    account,
    clock: st.clock,
    exec: st.exec,
    exitMs: st.exitMs ?? st.clock.now(),
    waitMs: st.truthWaitMs,
  });
  if (!final.ok) {
    st.abort ??= { cause: final.cause, evidence: final.detail };
    return;
  }
  await writeJson(`${st.runDir}/final.json`, final.truth);
  st.finalSavedAt = final.truth.savedAt;
}

export async function stopHarness(st: RunState): Promise<void> {
  const { agent, pane, partner, watcher } = st;
  if (watcher !== undefined) await attempt(st, "watcher", () => watcher.stop());
  if (pane !== undefined) await attempt(st, "quit", () => quitPane(st, pane));
  if (pane !== undefined) st.exitMs = st.clock.now();
  if (partner !== undefined)
    await attempt(st, "partner stop", () =>
      st.exec([partner.wrapper, "stop"], { timeoutMs: PARTNER_STOP_MS }),
    );
  if (pane !== undefined && agent !== undefined)
    await attempt(st, "final truth", () => verifyFinal(st, agent.account));
}

async function deleteAll(st: RunState, accounts: string[]): Promise<void> {
  if (accounts.length === 0) return;
  try {
    st.cleanupFailed = await deleteAccounts({ accounts, exec: st.exec });
  } catch (err) {
    st.cleanupFailed = [...accounts];
    st.notes.push(`delete: ${messageOf(err)}`);
  }
}

async function checkLeaks(st: RunState): Promise<void> {
  const secretFiles = [
    sessionFile(st.runDir, "agent"),
    sessionFile(st.runDir, "partner"),
  ];
  st.leaks = await leakCheck({ exec: st.exec, runDir: st.runDir, secretFiles });
  await quarantine({ files: st.leaks, runDir: st.runDir });
}

export async function cleanup(st: RunState): Promise<void> {
  const { pane } = st;
  if (pane !== undefined) await attempt(st, "close", () => pane.close());
  await deleteAll(st, accountsOf(st));
  await attempt(st, "leak check", () => checkLeaks(st));
  await attempt(st, "session files", () => removeSessionFiles(st.runDir));
  if (st.cleanupFailed.length > 0)
    await writeFile(
      `${st.runDir}/cleanup-failed`,
      `${st.cleanupFailed.join("\n")}\n`,
    );
}

export function summaryLine(result: EvalResult, label: string): string {
  const met = result.checks.filter((check) => check.met).length;
  const { toolCalls, wallSec } = result.efficiency;
  return `${result.scenario}-${result.replica} ${label} ${met}/${result.checks.length} tools=${toolCalls} wall=${Math.round(wallSec)}`;
}

function leakFriction(file: string): FrictionItem {
  const quote = `a password was found in ${file}; the file is in quarantine/`;
  return {
    area: "tool",
    category: "credential-leak",
    quote,
    ref: `quarantine/${file.replaceAll("/", "_")}`,
    severity: "blocker",
  };
}

async function evidenceOf(st: RunState): Promise<EvalEvidence> {
  const frames = await readdir(`${st.runDir}/frames`).then(
    (names) => names.length,
    () => 0,
  );
  const final = st.finalSavedAt === undefined ? undefined : "final.json";
  return {
    baseline: "baseline.json",
    final,
    finalSavedAt: st.finalSavedAt,
    frames,
    gameLog: "gamelog.jsonl",
    runDir: st.runDir,
    session: "session.jsonl",
  };
}

type Verdict = Pick<EvalResult, "blockedBy" | "verdict" | "verdictReason">;

function unfiredTrigger(st: RunState): string | undefined {
  const next = st.scenario.steers[st.steersFired];
  return next?.at.kind === "trigger" ? next.at.trigger : undefined;
}

function verdictOf(st: RunState): Verdict {
  if (st.abort !== undefined)
    return { verdict: "aborted", verdictReason: st.abort.cause };
  if (st.blockedBy.length > 0)
    return {
      blockedBy: st.blockedBy,
      verdict: "blocked",
      verdictReason: `preflight: ${st.blockedBy.join(", ")} is still missing`,
    };
  const trigger = st.end === undefined ? undefined : unfiredTrigger(st);
  if (trigger === undefined)
    return { verdict: "fail", verdictReason: DRAFT_REASON };
  return {
    blockedBy: [`no_${trigger}`],
    verdict: "blocked",
    verdictReason: `no_${trigger}: the ${trigger} steer never fired; ${DRAFT_REASON}`,
  };
}

async function draftResult(st: RunState): Promise<EvalResult> {
  const now = st.clock.now();
  const taskMs = st.taskMs ?? now;
  const usage = await readSessionUsage(`${st.runDir}/session.jsonl`);
  const firstActionMs =
    st.firstToolAt === undefined ? undefined : st.firstToolAt - taskMs;
  const aborted = st.abort !== undefined;
  return {
    ...verdictOf(st),
    abort: st.abort,
    accounts: accountsOf(st),
    checks: await observedChecks(st.runDir, st.scenario.checks),
    efficiency: efficiency({
      budget: st.scenario.budget,
      firstActionMs,
      usage,
      wallMs: (st.exitMs ?? now) - taskMs,
    }),
    end: st.end ?? (aborted ? "abort" : undefined),
    evidence: await evidenceOf(st),
    friction: st.leaks.map(leakFriction),
    interventions: st.interventions,
    notes:
      st.notes.length > 0 ? st.notes.join("\n").slice(0, NOTES_MAX) : undefined,
    replica: st.replica,
    round: st.round,
    scenario: st.scenario.id,
    sha: st.sha,
    tab: st.tab,
  };
}

export async function writeOutcome(st: RunState): Promise<string> {
  const result = await draftResult(st);
  const errors = validateResult(JSON.parse(JSON.stringify(result)));
  if (errors.length > 0)
    throw new Error(`the draft result breaks the schema: ${errors.join("; ")}`);
  const final = result.verdict === "aborted" || st.blockedBy.length > 0;
  await writeJson(
    final ? `${st.runDir}/result.json` : `${st.runDir}/grader/draft.json`,
    result,
  );
  return summaryLine(result, final ? result.verdict : "draft");
}
