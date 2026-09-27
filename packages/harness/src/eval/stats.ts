import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { ToolStatsRow, ToolsJson } from "#harness/contract/config";
import type { Clock, ToolStats } from "#harness/contract/services";
import { writeJsonAtomic } from "#harness/eval/run-dir";

export const STATS_EVERY_MS = 10_000;
export const KEEP_DURATIONS = 1000;

type Tally = Omit<ToolStatsRow, "p50Ms" | "p95Ms"> & { durations: number[] };

function newTally(): Tally {
  return {
    calls: 0,
    durations: [],
    lastError: undefined,
    repeatHits: 0,
    statuses: {},
    validationErrors: 0,
  };
}

function percentile(
  sorted: readonly number[],
  fraction: number,
): number | undefined {
  if (sorted.length === 0) return;
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function statsRow({ durations, statuses, ...rest }: Tally): ToolStatsRow {
  const sorted = [...durations].sort((a, b) => a - b);
  return {
    ...rest,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    statuses: { ...statuses },
  };
}

export function createToolStats(clock: Clock): ToolStats {
  const tallies = new Map<string, Tally>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let file: string | undefined;
  let chain: Promise<void> = Promise.resolve();
  const tally = (tool: string): Tally => {
    const found = tallies.get(tool) ?? newTally();
    tallies.set(tool, found);
    return found;
  };
  const snapshot = (): ToolsJson => {
    const tools = Object.fromEntries(
      [...tallies].map(([tool, row]) => [tool, statsRow(row)]),
    );
    return { tools, updatedAt: clock.now(), v: 1 };
  };
  const write = (): Promise<void> => {
    const writeNow = () =>
      file === undefined ? undefined : writeJsonAtomic(file, snapshot());
    chain = chain.catch(ignoreFailure).then(writeNow);
    return chain;
  };
  return {
    call(tool) {
      tally(tool).calls += 1;
    },
    error({ tool, message }) {
      tally(tool).lastError = message;
    },
    repeatHit(tool) {
      tally(tool).repeatHits += 1;
    },
    result({ tool, status, ms }) {
      const row = tally(tool);
      row.statuses[status] = (row.statuses[status] ?? 0) + 1;
      row.durations.push(ms);
      if (row.durations.length > KEEP_DURATIONS) row.durations.shift();
    },
    snapshot,
    start({ path, everyMs }) {
      file = path;
      clearInterval(timer);
      timer = setInterval(() => write().catch(ignoreFailure), everyMs);
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await write();
    },
    validationError(tool) {
      tally(tool).validationErrors += 1;
    },
  };
}
