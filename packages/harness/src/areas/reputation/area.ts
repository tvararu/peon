import { RANK_NAMES, type AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type ReputationEvent = AreaEventOf<"reputation">;
type Of<T extends ReputationEvent["type"]> = Extract<
  ReputationEvent,
  { type: T }
>;
type ForcedRow = { factionId: number; name: string | undefined; rank: number };
const POINTS_IN_RANK = [36_000, 3000, 3000, 3000, 6000, 12_000, 21_000, 1000];

function rankName(rank: number): string {
  return RANK_NAMES[rank] ?? `rank ${rank}`;
}

function floorOf(rank: number): number {
  let floor = -42_000;
  for (let i = 0; i < rank; i++) floor += POINTS_IN_RANK[i] ?? 0;
  return floor;
}

function progress(after: number, rank: number): string | undefined {
  const width = POINTS_IN_RANK[rank];
  if (width === undefined || width <= 1) return undefined;
  return ` ${after - floorOf(rank)}/${width}`;
}

function whom(e: Of<"standing_changed">): string {
  return e.name ?? `Faction ${e.repListId}`;
}

function standingText(e: Of<"standing_changed">): string {
  const delta = `${e.after - e.before >= 0 ? "+" : ""}${e.after - e.before}`;
  if (e.rank === undefined) return `${whom(e)} reputation ${delta}.`;
  return `${whom(e)} reputation ${delta}: ${rankName(e.rank)}${progress(e.after, e.rank) ?? ""}.`;
}

function dataOf(e: Of<"standing_changed">): Record<string, unknown> {
  return {
    after: e.after,
    before: e.before,
    factionId: e.factionId,
    rank: e.rank,
    repListId: e.repListId,
  };
}

function onStanding(e: Of<"standing_changed">): AreaDraft[] {
  if (e.atWar && !e.wasAtWar)
    return [
      {
        class: "log",
        data: dataOf(e),
        name: "at_war",
        text: `You are now at war with ${whom(e)}; its guards will attack you.`,
      },
    ];
  if (e.rankChanged && e.rank !== undefined)
    return [
      {
        class: "log",
        data: dataOf(e),
        name: "rank",
        text: `You are now ${rankName(e.rank)} with ${whom(e)}.`,
      },
    ];
  return [
    {
      class: "log",
      data: dataOf(e),
      name: "changed",
      text: standingText(e),
    },
  ];
}

function forcedRow(row: ForcedRow, rc: RuleInput, ended: boolean): AreaDraft {
  const cls = rc.runActive ? "log" : "wake";
  const whomName = row.name ?? `faction ${row.factionId}`;
  return {
    class: cls,
    data: { factionId: row.factionId, rank: row.rank },
    name: "forced",
    text: ended
      ? `Units of ${whomName} no longer treat you as ${rankName(row.rank)}.`
      : `Units of ${whomName} now treat you as ${rankName(row.rank)} while an effect lasts.`,
  };
}

function onForced(e: Of<"forced_changed">, rc: RuleInput): AreaDraft[] {
  const added = e.added.map((row) => forcedRow(row, rc, false));
  const ended = e.removed.map((row) => forcedRow(row, rc, true));
  return [...added, ...ended];
}

export const reputationHarness = defineHarnessArea({
  area: "reputation",
  rules: () => ({
    event: (event, rc) => {
      switch (event.type) {
        case "forced_changed":
          return onForced(event, rc);
        case "initialized":
          return [];
        case "standing_changed":
          return onStanding(event);
        case "visible":
          return [
            {
              class: "log",
              data: { repListId: event.repListId },
              name: "discovered",
              text: `You discovered the faction ${event.name ?? `faction ${event.repListId}`}.`,
            },
          ];
        case "watched_changed":
          return [];
        default:
          return [];
      }
    },
  }),
  worldActs: [],
});
