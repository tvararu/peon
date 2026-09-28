import type { AreaState } from "@peon/core";

type ThreatState = AreaState<"threat">;
type ThreatTable = ThreatState["tables"][number];
type ThreatEntry = ThreatTable["entries"][number];

export type ThreatOf = ThreatEntry & { pullAt: ThreatTable["pullAt"] };

export function engagedWith(state: ThreatState, guid: bigint): bigint[] {
  return state.tables
    .filter((table) => table.entries.some((entry) => entry.victim === guid))
    .map((table) => table.unit);
}

export function aggroOn(state: ThreatState, guid: bigint): bigint[] {
  return state.tables
    .filter((table) => table.victim === guid)
    .map((table) => table.unit);
}

export function threatOf(
  state: ThreatState,
  unit: bigint,
  guid: bigint,
): ThreatOf | undefined {
  const table = state.tables.find((row) => row.unit === unit);
  const entry = table?.entries.find((row) => row.victim === guid);
  return table && entry && { ...entry, pullAt: table.pullAt };
}
