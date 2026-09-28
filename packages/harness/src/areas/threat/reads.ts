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

export type UnitThreat = {
  fightingMe: boolean;
  aggro: string | undefined;
  myThreatPct: number | undefined;
};

function aggroOf(
  victim: bigint | undefined,
  self: bigint,
  named: (guid: bigint) => string,
): string | undefined {
  if (victim === undefined) return undefined;
  return victim === self ? "you" : named(victim);
}

export function unitThreat(
  state: ThreatState,
  unit: bigint,
  self: bigint,
  named: (guid: bigint) => string,
): UnitThreat | undefined {
  const table = state.tables.find((row) => row.unit === unit);
  if (!table) return undefined;
  const mine = table.entries.find((entry) => entry.victim === self);
  return {
    aggro: aggroOf(table.victim, self, named),
    fightingMe: mine !== undefined,
    myThreatPct: mine?.pct,
  };
}
