import { appendFile, mkdir } from "node:fs/promises";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { AgentState, StatusJson } from "#harness/contract/config";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import type { Clock } from "#harness/contract/services";
import { type Exec, parseJsonOutput } from "#harness/grader/exec";
import { captureFrame } from "#harness/grader/frames";
import type { Pane } from "#harness/grader/pane";
import type { TriggerName } from "#harness/grader/scenarios";

export type TriggerRow = {
  ms: number;
  trigger: TriggerName;
  seq: number;
  text: string;
};

export type ProgressJson = {
  at: number;
  agent: AgentState;
  lastToolCallAt: number | undefined;
  lastProgress: { at: number; event: LogEvent } | undefined;
  idleSinceMs: number | undefined;
};

export type LogTail = { read: () => Promise<GameLogEntry[]> };

export const FRAME_EVERY_MS = 5000;

type EventTrigger = Exclude<TriggerName, "task_landed">;

export const TRIGGER_EVENTS: Readonly<
  Record<EventTrigger, readonly LogEvent[]>
> = {
  answer_text: ["agent/message"],
  channel_start: ["spells/channel_start"],
  death: ["life/dead"],
  fight_start: ["fight/start"],
  kill: ["combat/kill_credit"],
  lfg_proposal: ["lfg/proposal"],
  lfg_role_check: ["lfg/role_check"],
  movement_start: ["nav/route_start", "control/move_start"],
  steer_landed: ["human/input"],
};

const NEWLINE = 10;

const TRIGGER_BY_EVENT: ReadonlyMap<LogEvent, TriggerName> = new Map(
  (
    Object.entries(TRIGGER_EVENTS) as [EventTrigger, readonly LogEvent[]][]
  ).flatMap(([trigger, events]) =>
    events.map((event) => [event, trigger] as const),
  ),
);

function parseRows(text: string): GameLogEntry[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as GameLogEntry);
}

export function createLogTail(file: string): LogTail {
  let offset = 0;
  const read = async (): Promise<GameLogEntry[]> => {
    const handle = Bun.file(file);
    if (!(await handle.exists())) return [];
    const bytes = new Uint8Array(await handle.slice(offset).arrayBuffer());
    const end = bytes.lastIndexOf(NEWLINE);
    if (end < 0) return [];
    offset += end + 1;
    return parseRows(new TextDecoder().decode(bytes.subarray(0, end)));
  };
  return { read };
}

export function triggerRows(
  entries: readonly GameLogEntry[],
  taskLanded = false,
): TriggerRow[] {
  let landed = taskLanded;
  return entries.flatMap((entry) => {
    const found = TRIGGER_BY_EVENT.get(entry.event);
    if (found === undefined) return [];
    const task = found === "steer_landed" && !landed;
    landed ||= task;
    const trigger: TriggerName = task ? "task_landed" : found;
    return [{ ms: entry.ts, seq: entry.seq, text: entry.text, trigger }];
  });
}

export const hasTask = (rows: readonly TriggerRow[]): boolean =>
  rows.some((row) => row.trigger === "task_landed");

export function lastAnswerAt(
  entries: readonly GameLogEntry[],
  previous: number | undefined,
): number | undefined {
  return entries
    .filter((entry) => entry.event === "agent/message")
    .reduce<number | undefined>(
      (newest, entry) => Math.max(newest ?? entry.ts, entry.ts),
      previous,
    );
}

export function lastAnswer(
  entries: readonly GameLogEntry[],
): { at: number; text: string } | undefined {
  const row = entries.findLast((entry) => entry.event === "agent/message");
  return row === undefined ? undefined : { at: row.ts, text: row.text };
}

type ProgressInit = {
  status: StatusJson;
  lastAnswerAt: number | undefined;
  now: number;
};

export function progressOf({
  status,
  lastAnswerAt: answerAt,
  now,
}: ProgressInit): ProgressJson {
  const marks = [status.lastProgress?.at, answerAt].filter(
    (mark): mark is number => mark !== undefined,
  );
  return {
    agent: status.agent,
    at: now,
    idleSinceMs: marks.length > 0 ? now - Math.max(...marks) : undefined,
    lastProgress: status.lastProgress,
    lastToolCallAt: status.lastToolCallAt,
  };
}

export async function readStatus(
  file: string,
): Promise<StatusJson | undefined> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) return undefined;
  const json = parseJsonOutput(await handle.text());
  return json === undefined ? undefined : (json as StatusJson);
}

export type Watcher = { stop: () => Promise<void> };

export const LOG_POLL_MS = 1000;
export const WITNESS_EVERY_MS = 5000;

const WITNESS_TIMEOUT_MS = 4000;

type WatchInit = {
  runDir: string;
  pane: Pane;
  exec: Exec;
  clock: Clock;
  witness?: string;
  frameEveryMs?: number;
};
type Job = () => Promise<void>;
type WatchJobs = { all: Job; frame: Job; log: Job; sample: Job };

function createSerial(errorLog: string): (job: Job) => Promise<void> {
  let chain = Promise.resolve();
  return (job) => {
    chain = chain
      .then(job)
      .catch((err: unknown) =>
        appendFile(
          errorLog,
          `${new Date().toISOString()} ${messageOf(err)}\n`,
        ).catch(ignoreFailure),
      );
    return chain;
  };
}

function createJobs({
  runDir,
  pane,
  exec,
  clock,
  witness,
}: WatchInit): WatchJobs {
  const tail = createLogTail(`${runDir}/gamelog.jsonl`);
  const frames = { last: undefined as string | undefined, seq: 0 };
  let answerAt: number | undefined;
  let taskLanded = false;
  const log = async (): Promise<void> => {
    const rows = await tail.read();
    answerAt = lastAnswerAt(rows, answerAt);
    const found = triggerRows(rows, taskLanded);
    taskLanded ||= hasTask(found);
    const triggers = found.map((trigger) => `${JSON.stringify(trigger)}\n`);
    if (triggers.length > 0)
      await appendFile(`${runDir}/triggers.jsonl`, triggers.join(""));
    const status = await readStatus(`${runDir}/status.json`);
    if (status === undefined) return;
    const progress = progressOf({
      lastAnswerAt: answerAt,
      now: clock.now(),
      status,
    });
    await Bun.write(`${runDir}/progress.json`, `${JSON.stringify(progress)}\n`);
  };
  const frame = async (): Promise<void> => {
    const shot = await captureFrame({
      dir: `${runDir}/frames`,
      last: frames.last,
      now: clock.now(),
      pane,
      seq: frames.seq,
    });
    if (shot === undefined) return;
    frames.last = shot.text;
    frames.seq += 1;
  };
  const sample = async (): Promise<void> => {
    if (witness === undefined) return;
    const { code, stdout } = await exec([witness, "nearby", "--json"], {
      timeoutMs: WITNESS_TIMEOUT_MS,
    });
    await appendFile(
      `${runDir}/witness.jsonl`,
      `${JSON.stringify({ code, ms: clock.now(), nearby: parseJsonOutput(stdout) ?? null })}\n`,
    );
  };
  const all = async (): Promise<void> => {
    await mkdir(`${runDir}/frames`, { recursive: true });
    await mkdir(`${runDir}/grader`, { recursive: true });
    await log();
    await sample();
    await frame();
  };
  return { all, frame, log, sample };
}

export function watchRun(init: WatchInit): Watcher {
  const jobs = createJobs(init);
  const serial = createSerial(`${init.runDir}/grader/watch-errors.log`);
  const timers = [
    setInterval(() => serial(jobs.log), LOG_POLL_MS),
    setInterval(() => serial(jobs.frame), init.frameEveryMs ?? FRAME_EVERY_MS),
    ...(init.witness === undefined
      ? []
      : [setInterval(() => serial(jobs.sample), WITNESS_EVERY_MS)]),
  ];
  serial(jobs.all).catch(ignoreFailure);
  const stop = async (): Promise<void> => {
    for (const timer of timers) clearInterval(timer);
    await serial(jobs.all);
  };
  return { stop };
}
