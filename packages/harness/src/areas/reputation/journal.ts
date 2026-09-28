import type { AreaState } from "@peon/core";

const RANK_NAMES = [
  "Hated",
  "Hostile",
  "Unfriendly",
  "Neutral",
  "Friendly",
  "Honored",
  "Revered",
  "Exalted",
] as const;

type ReputationState = AreaState<"reputation">;
type TimeState = AreaState<"time">;
type Row = ReputationState["factions"][number];

const BUDGET = 24;

export function reputationRows(state: ReputationState, find?: string): Row[] {
  const visible = state.factions.filter((row) => row.visible);
  const needle = find?.trim().toLowerCase();
  const kept =
    needle === undefined || needle === ""
      ? visible
      : visible.filter((row) =>
          (row.name ?? `faction ${row.repListId}`)
            .toLowerCase()
            .includes(needle),
        );
  return [...kept].sort(
    (a, b) =>
      (b.changedAt ?? -1) - (a.changedAt ?? -1) || a.repListId - b.repListId,
  );
}

function withoutCatalog(row: Row, name: string): string {
  const delta = `${row.standing >= 0 ? "+" : ""}${row.standing}`;
  return `${name}: ${delta} from the base (ranks unknown).`;
}

function line(row: Row): string {
  const name = row.name ?? `Faction ${row.repListId}`;
  if (row.rank === undefined) return withoutCatalog(row, name);
  const width =
    row.rankFloor === undefined || row.rankCeiling === undefined
      ? undefined
      : row.rankCeiling - row.rankFloor + 1;
  const progress =
    width === undefined || width <= 1
      ? ""
      : ` ${row.standing - (row.rankFloor ?? 0)}/${width}`;
  const rank = RANK_NAMES[row.rank] ?? `rank ${row.rank}`;
  const marks = [
    ...(row.atWar ? ["at war"] : []),
    ...(row.inactive ? ["inactive"] : []),
  ];
  const suffix = marks.length > 0 ? `, ${marks.join(", ")}` : "";
  return `${name}: ${rank}${progress}${suffix}.`;
}

function watchedLine(
  rows: Row[],
  watched: number | undefined,
): string | undefined {
  if (watched === undefined) return undefined;
  const row = rows.find((entry) => entry.repListId === watched);
  if (row === undefined) return undefined;
  return `Watched: ${row.name ?? `Faction ${row.repListId}`}.`;
}

export function reputationLines(
  state: ReputationState,
  find?: string,
): string[] {
  const rows = reputationRows(state, find);
  if (rows.length === 0)
    return state.factions.length === 0
      ? ["The server has not listed any factions for you yet."]
      : [`No faction matches "${find ?? ""}".`];
  const watched = watchedLine(rows, state.watched);
  const room = watched === undefined ? BUDGET : BUDGET - 1;
  const head = rows.slice(0, room - 1);
  const more = rows.length - head.length;
  const lines = head.map(line);
  if (more > 0) lines.push(`+${more} more factions; narrow with find.`);
  if (watched !== undefined) lines.push(watched);
  return lines;
}

export function dailyResetLine(
  state: TimeState,
  now: number,
): string | undefined {
  if (state.dailyResetInSec === undefined || state.receivedAt === undefined)
    return undefined;
  const left =
    state.dailyResetInSec - Math.floor((now - state.receivedAt) / 1000);
  if (left <= 0) return undefined;
  const hours = Math.floor(left / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  return `Daily quests reset in ${hours} h ${String(minutes).padStart(2, "0")} m.`;
}
