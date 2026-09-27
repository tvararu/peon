import { isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const EVENT = /\b[a-z]+\/[a-z_]+\*?/g;
const DOMAINS = new Set([
  "agent",
  "aura",
  "chat",
  "combat",
  "control",
  "entity",
  "fight",
  "group",
  "human",
  "life",
  "loot",
  "money",
  "nav",
  "notice",
  "packet",
  "quest",
  "run",
  "session",
  "snapshot",
  "social",
  "tool",
  "trainer",
  "vendor",
  "xp",
]);
const ID = /\b\d{3,}\b/g;
const ROWS_MAX = 10;

type Row = {
  line: number;
  seq: unknown;
  ts: unknown;
  event: string;
  text: unknown;
  data: unknown;
};

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

export function checkEvents(check: ScenarioCheck): string[] {
  const named = (check.expect.match(EVENT) ?? []).filter((event) =>
    DOMAINS.has(domainOf(event)),
  );
  return check.events ?? [...new Set(named)];
}

export function checkIds(check: ScenarioCheck): number[] {
  return check.ids ?? [...new Set((check.expect.match(ID) ?? []).map(Number))];
}

export function parseGameLog(text: string): Row[] {
  return text.split("\n").flatMap((line, index) => {
    const value = parseJsonOutput(line);
    if (!isRecord(value) || typeof value["event"] !== "string") return [];
    const { data, event, seq, text: said, ts } = value;
    return [{ data, event, line: index + 1, seq, text: said, ts }];
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
  const events = checkEvents(check);
  if (events.length === 0) return null;
  const ids = checkIds(check);
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
