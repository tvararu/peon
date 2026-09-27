import { isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const ROWS_MAX = 10;

export type GameLogRow = {
  line: number;
  seq: unknown;
  ts: unknown;
  event: string;
  text: unknown;
  data: unknown;
  guid?: unknown;
  ref?: unknown;
};

type Row = GameLogRow;

export type GameLogObserved = {
  events: string[];
  ids?: number[];
  count: number;
  match: Row | null;
  last: Row | null;
  rows: Row[];
  related: Row | null;
};

const domainOf = (event: string): string => event.split("/")[0] ?? event;

export function parseGameLog(text: string): Row[] {
  return text.split("\n").flatMap((line, index) => {
    const value = parseJsonOutput(line);
    if (!isRecord(value) || typeof value["event"] !== "string") return [];
    const { data, event, guid, ref, seq, text: said, ts } = value;
    return [{ data, event, guid, line: index + 1, ref, seq, text: said, ts }];
  });
}

const eventMatches = (pattern: string, event: string): boolean =>
  pattern.endsWith("*")
    ? event.startsWith(pattern.slice(0, -1))
    : event === pattern;

function holdsId(value: unknown, ids: readonly number[]): boolean {
  if (typeof value === "number") return ids.includes(value);
  if (Array.isArray(value)) return value.some((item) => holdsId(item, ids));
  return isRecord(value) && Object.values(value).some((v) => holdsId(v, ids));
}

export function observeGameLog(
  rows: readonly Row[],
  check: ScenarioCheck,
): GameLogObserved | null {
  const events = check.evidence?.events ?? [];
  if (events.length === 0) return null;
  const ids = check.evidence?.ids ?? [];
  const named = rows.filter((row) =>
    events.some((pattern) => eventMatches(pattern, row.event)),
  );
  const matched =
    ids.length === 0 ? named : named.filter((row) => holdsId(row.data, ids));
  const domains = new Set(events.map(domainOf));
  return {
    count: matched.length,
    events,
    ids: ids.length === 0 ? undefined : ids,
    last: matched.at(-1) ?? null,
    match: matched[0] ?? null,
    related: rows.findLast((row) => domains.has(domainOf(row.event))) ?? null,
    rows: matched.slice(0, ROWS_MAX),
  };
}
