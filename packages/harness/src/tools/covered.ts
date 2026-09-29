import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import type { ToolName, ToolStatus } from "#harness/contract/result";
import type { GameLog } from "#harness/contract/services";

const COVERS: Partial<Record<ToolName, ReadonlySet<LogEvent>>> = {
  dungeon: new Set<LogEvent>([
    "instances/reset",
    "instances/reset_failed",
    "instances/bound",
    "lfg/queued",
    "lfg/left",
    "lfg/refused",
    "lfg/teleport_refused",
  ]),
  group: new Set<LogEvent>(["raid/roster"]),
  interact: new Set<LogEvent>([
    "quest/accepted",
    "quest/rewarded",
    "xp/gain",
    "loot/item",
    "money/change",
    "vendor/buy",
    "vendor/sell",
    "vendor/repair",
    "trainer/learn",
  ]),
};
const REPORTED = new Set<ToolStatus>(["DONE", "PARTLY"]);

type Cover = {
  status: ToolStatus;
  tool: ToolName;
  toolCallId: string;
};

function reported(row: GameLogEntry, events: ReadonlySet<LogEvent>): boolean {
  if (row.class === "log" || row.consumedBy !== undefined) return false;
  if (row.event === "xp/gain") return row.data["source"] === "quest";
  return events.has(row.event);
}

export function coverRows(log: GameLog, cover: Cover): void {
  const events = COVERS[cover.tool];
  if (!(events && REPORTED.has(cover.status))) return;
  const rows = log.since(0);
  const start = rows.findLastIndex(
    (row) =>
      row.event === "tool/call" && row.data["toolCallId"] === cover.toolCallId,
  );
  if (start < 0) return;
  for (const row of rows.slice(start + 1))
    if (reported(row, events))
      log.mark(row.seq, { consumedBy: cover.toolCallId });
}
