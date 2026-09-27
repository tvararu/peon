import type { Domain, GameLogEntry } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type { GameLog } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";

export const JOURNAL_LOG_LIMIT = 15;

export type LogQuery = { find?: string; since?: string; limit?: number };
export type LogPage = { rows: GameLogEntry[]; more: number; label: string };

type QueryInit = {
  log: GameLog;
  runs: RunRegistry;
  turnStartSeq: number;
  now: number;
  query: LogQuery;
};
type SpanInit = {
  log: GameLog;
  runs: RunRegistry;
  turnStartSeq: number;
  now: number;
  since: string;
};
type Span = { rows: GameLogEntry[]; label: string };

const DURATION = /^(\d+)(s|m|h)$/;
const RUN_ID = /^r\d+$/;
const SPACES = /\s+/;
const UNIT_MS = new Map([
  ["s", 1000],
  ["m", 60_000],
  ["h", 3_600_000],
]);
const QUIET_DOMAINS = new Set<Domain>(["agent", "entity", "snapshot", "tool"]);
const RETRY = 'journal(about: "log", since: "5m")';

function ago(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runSpan({ log, runs, now, since }: SpanInit): Span {
  const run = runs.get(since);
  if (!run)
    throw new Refusal({
      detail: `no run ${since} in this session.`,
      next: RETRY,
      reason: "unknown_run",
    });
  const rows = log.since(0).filter((row) => row.ts >= run.startedAt);
  return {
    label: `since ${since} started (${ago(now - run.startedAt)} ago)`,
    rows,
  };
}

function span(init: SpanInit): Span {
  const { log, now, since, turnStartSeq } = init;
  if (since === "last_turn")
    return {
      label: "since your last turn started",
      rows: log.since(turnStartSeq),
    };
  const [, count, unit] = DURATION.exec(since) ?? [];
  if (count !== undefined && unit !== undefined) {
    const cutoff = now - Number(count) * (UNIT_MS.get(unit) ?? 1000);
    return {
      label: `in the last ${since}`,
      rows: log.since(0).filter((row) => row.ts >= cutoff),
    };
  }
  if (RUN_ID.test(since)) return runSpan(init);
  const detail = `since "${since}" is not a time like 5m, a run id like r4, or last_turn.`;
  throw new Refusal({ detail, next: RETRY, reason: "bad_since" });
}

function rowFilter(find: string | undefined): (row: GameLogEntry) => boolean {
  if (find?.startsWith("domain:")) {
    const domain = find.slice("domain:".length);
    return (row) => row.domain === domain;
  }
  if (find?.startsWith("from:")) {
    const who = find.slice("from:".length).toLowerCase();
    return (row) =>
      row.domain === "chat" && String(row.data["sender"]).toLowerCase() === who;
  }
  const words = (find ?? "")
    .toLowerCase()
    .split(SPACES)
    .filter((word) => word.length > 0);
  return (row) =>
    !QUIET_DOMAINS.has(row.domain) &&
    words.every((word) => row.text.toLowerCase().includes(word));
}

export function queryLog({
  log,
  runs,
  turnStartSeq,
  now,
  query,
}: QueryInit): LogPage {
  const picked = span({
    log,
    now,
    runs,
    since: query.since ?? "last_turn",
    turnStartSeq,
  });
  const matched = picked.rows.filter(rowFilter(query.find));
  const rows = matched.slice(-(query.limit ?? JOURNAL_LOG_LIMIT));
  const label = query.find
    ? `${picked.label}, matching "${query.find}"`
    : picked.label;
  return { label, more: matched.length - rows.length, rows };
}

function relative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 120) return `-${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 120 ? `-${minutes}m` : `-${Math.round(minutes / 60)}h`;
}

export function formatLogRows(
  rows: readonly GameLogEntry[],
  now: number,
): string[] {
  return rows.map((row) => `${relative(now - row.ts)} ${row.text}`);
}
