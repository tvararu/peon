import { writeFile } from "node:fs/promises";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  opcodeName,
  type PacketCounts,
  type TraceRow,
  type TraceSink,
} from "@peon/core/session";
import type { PacketTraceMode, RunPaths } from "#harness/contract/config";
import { createJsonlSink } from "#harness/log/store";

export const TRACE_FLUSH_MS = 1000;

export type PacketTrace = TraceSink & { flush: () => Promise<void> };

type TraceInit = {
  mode: PacketTraceMode;
  paths: Pick<RunPaths, "packets" | "packetCounts">;
};

type Totals = PacketCounts & { sessions: number };

export function createPacketTrace({ mode, paths }: TraceInit): PacketTrace {
  const file = mode === "off" ? undefined : paths.packets;
  const rows = createJsonlSink({ file, flushMs: TRACE_FLUSH_MS });
  const totals: Totals = { seen: {}, sent: {}, sessions: 0, unhandled: {} };
  let saved: Promise<void> = Promise.resolve();
  const save = () =>
    writeFile(paths.packetCounts, `${JSON.stringify(totals)}\n`);
  return {
    bodies: mode === "bodies",
    close(counts) {
      addCounts(totals, counts);
      saved = saved.then(save).catch(ignoreFailure);
      rows.flush().catch(ignoreFailure);
    },
    flush: () => Promise.all([saved, rows.flush()]).then(() => undefined),
    row: (row) => rows.write(namedRow(row)),
  };
}

function namedRow({ opcode, ...row }: TraceRow) {
  return { ...row, opcode: opcodeName(opcode) };
}

function addCounts(totals: Totals, counts: PacketCounts): void {
  totals.sessions += 1;
  for (const key of ["seen", "sent", "unhandled"] as const)
    for (const [name, n] of Object.entries(counts[key]))
      totals[key][name] = (totals[key][name] ?? 0) + n;
}
