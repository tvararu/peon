import { appendFile } from "node:fs/promises";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { JsonlSink } from "#harness/contract/services";

export const FLUSH_MS = 250;

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
