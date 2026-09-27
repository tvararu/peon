import { appendFileSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  opcodeName,
  type PacketCounts,
  type TraceRow,
  type TraceSender,
  type TraceSink,
} from "@peon/core/session";

export type TracePaths = { rows: string; counts: string };
export type Arrival = { count: number; firstAt: number };
export type SinkInit = {
  root: string;
  account: string;
  bodies: boolean;
  out?: string;
};
export type Finish = {
  received: Record<string, Arrival>;
  counts: PacketCounts | null;
  missing: string[];
};

export type ProbeSink = {
  paths: TracePaths;
  trace: TraceSink;
  send: (opcode: number, body: Uint8Array) => void;
  waitFor: (until: readonly number[], ms: number) => Promise<void>;
  finish: (expect: readonly number[]) => Promise<Finish>;
};

type State = {
  dir: string;
  paths: TracePaths;
  arrivals: Map<number, Arrival>;
  sender?: TraceSender;
  counts?: PacketCounts;
  opened: boolean;
  wake: () => void;
};

const STAMP_PUNCTUATION = /[-:]/g;
const STAMP_FRACTION = /\.\d+Z$/;

function stamp(now = new Date()): string {
  return now
    .toISOString()
    .replace(STAMP_PUNCTUATION, "")
    .replace(STAMP_FRACTION, "Z");
}

function append(state: State, { opcode, ...row }: TraceRow): void {
  if (!state.opened) mkdirSync(state.dir, { mode: 0o700, recursive: true });
  state.opened = true;
  appendFileSync(
    state.paths.rows,
    `${JSON.stringify({ ...row, opcode: opcodeName(opcode) })}\n`,
  );
}

function arrive(state: State, row: TraceRow): void {
  if (row.dir !== "in") return;
  const seen = state.arrivals.get(row.opcode);
  state.arrivals.set(row.opcode, {
    count: (seen?.count ?? 0) + 1,
    firstAt: seen?.firstAt ?? row.at,
  });
  state.wake();
}

function trace(state: State, bodies: boolean): TraceSink {
  return {
    attach: (send) => {
      state.sender = send;
    },
    bodies,
    close: (counts) => {
      state.counts = counts;
    },
    row: (row) => {
      append(state, row);
      arrive(state, row);
    },
  };
}

function waitFor(
  state: State,
  until: readonly number[],
  ms: number,
): Promise<void> {
  const done = () =>
    until.length > 0 && until.every((opcode) => state.arrivals.has(opcode));
  const { promise, resolve } = Promise.withResolvers<void>();
  const timer = setTimeout(resolve, ms);
  state.wake = () => {
    if (done()) resolve();
  };
  state.wake();
  return promise.finally(() => {
    clearTimeout(timer);
    state.wake = () => undefined;
  });
}

async function finish(
  state: State,
  expect: readonly number[],
): Promise<Finish> {
  const { arrivals, counts } = state;
  const received = Object.fromEntries(
    [...arrivals].map(([opcode, a]) => [opcodeName(opcode), a]),
  );
  const missing = expect
    .filter((opcode) => !arrivals.has(opcode))
    .map(opcodeName);
  if (counts && state.opened)
    await writeFile(state.paths.counts, `${JSON.stringify(counts)}\n`);
  return { counts: counts ?? null, missing, received };
}

export function createProbeSink({
  root,
  account,
  bodies,
  out,
}: SinkInit): ProbeSink {
  const dir = out ?? `${root}/tmp/probe/${account}-${stamp()}`;
  const paths = { counts: `${dir}/packets.json`, rows: `${dir}/packets.jsonl` };
  const state: State = {
    arrivals: new Map(),
    dir,
    opened: false,
    paths,
    wake: () => undefined,
  };
  const send = (opcode: number, body: Uint8Array) => {
    if (!state.sender)
      throw new Error("the session gave the probe no packet sender.");
    state.sender(opcode, body);
  };
  return {
    finish: (expect) => finish(state, expect),
    paths,
    send,
    trace: trace(state, bodies),
    waitFor: (until, ms) => waitFor(state, until, ms),
  };
}
