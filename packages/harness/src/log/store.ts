import { appendFile } from "node:fs/promises";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { GameLogEntry, LogDraft } from "#harness/contract/log";
import type { Clock, GameLog, JsonlSink } from "#harness/contract/services";

export const FLUSH_MS = 250;
export const LOG_CAPACITY = 5000;

export type BufferedWriter = {
  push: (row: unknown) => void;
  flush: () => Promise<void>;
};
export type WriterInit = {
  write: (text: string) => Promise<void>;
  flushMs: number;
};
type SinkInit = { file: string | undefined; flushMs?: number };

export function jsonLine(row: unknown): string {
  return `${JSON.stringify(row, bigintHex)}\n`;
}

function bigintHex(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString(16) : value;
}

export function createBufferedWriter({
  write,
  flushMs,
}: WriterInit): BufferedWriter {
  let pending: unknown[] = [];
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drain = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (pending.length === 0) return chain;
    const rows = pending;
    pending = [];
    chain = chain.then(() => write(rows.map(jsonLine).join("")));
    return chain;
  };
  return {
    flush: drain,
    push(row) {
      pending.push(row);
      timer ??= setTimeout(() => {
        drain().catch(ignoreFailure);
      }, flushMs);
    },
  };
}

function settled(): Promise<void> {
  return Promise.resolve();
}

export function createJsonlSink({
  file,
  flushMs = FLUSH_MS,
}: SinkInit): JsonlSink {
  if (file === undefined)
    return { close: settled, flush: settled, write: ignoreFailure };
  const writer = createBufferedWriter({
    flushMs,
    write: (text) => appendFile(file, text),
  });
  return { close: writer.flush, flush: writer.flush, write: writer.push };
}

type LogInit = {
  file: string | undefined;
  char: () => string;
  clock: Clock;
  capacity?: number;
  flushMs?: number;
};

export function createGameLog({
  file,
  char,
  clock,
  capacity = LOG_CAPACITY,
  flushMs = FLUSH_MS,
}: LogInit): GameLog {
  const ring: GameLogEntry[] = [];
  const bySeq = new Map<number, GameLogEntry>();
  const listeners = new Set<(entry: GameLogEntry) => void>();
  const sink = createJsonlSink({ file, flushMs });
  let last = 0;
  const keep = (entry: GameLogEntry) => {
    ring.push(entry);
    bySeq.set(entry.seq, entry);
    if (ring.length <= capacity) return;
    const old = ring.shift();
    if (old) bySeq.delete(old.seq);
  };
  const stamp = ({ ts, ...rest }: LogDraft): GameLogEntry => {
    last += 1;
    return { char: char(), seq: last, ts: ts ?? clock.now(), v: 1, ...rest };
  };
  return {
    append(draft) {
      const entry = stamp(draft);
      keep(entry);
      sink.write(entry);
      for (const cb of listeners) cb(entry);
      return entry;
    },
    close: () => sink.close(),
    count: () => ring.length,
    flush: () => sink.flush(),
    get: (seq) => bySeq.get(seq),
    lastSeq: () => last,
    mark(seq, patch) {
      const entry = bySeq.get(seq);
      if (entry) Object.assign(entry, patch);
    },
    recent: (n) => (n > 0 ? ring.slice(-n) : []),
    since(seq) {
      const first = ring[0]?.seq ?? last + 1;
      return ring.slice(Math.max(0, seq + 1 - first));
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
