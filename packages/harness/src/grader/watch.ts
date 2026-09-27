import type { AgentState, StatusJson } from "#harness/contract/config";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import { parseJsonOutput } from "#harness/grader/exec";
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

export const TRIGGER_EVENTS: Readonly<
  Record<TriggerName, readonly LogEvent[]>
> = {
  answer_text: ["agent/message"],
  death: ["life/dead"],
  fight_start: ["fight/start"],
  kill: ["combat/kill_credit"],
  movement_start: ["nav/route_start", "control/move_start"],
  steer_landed: ["human/input"],
};

const NEWLINE = 10;

const TRIGGER_BY_EVENT: ReadonlyMap<LogEvent, TriggerName> = new Map(
  (
    Object.entries(TRIGGER_EVENTS) as [TriggerName, readonly LogEvent[]][]
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

export function triggerRows(entries: readonly GameLogEntry[]): TriggerRow[] {
  return entries.flatMap((entry) => {
    const trigger = TRIGGER_BY_EVENT.get(entry.event);
    return trigger === undefined
      ? []
      : [{ ms: entry.ts, seq: entry.seq, text: entry.text, trigger }];
  });
}

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
