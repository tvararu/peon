import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type TalentsEvent = AreaEventOf<"talents">;
type Info = Extract<TalentsEvent, { type: "info" }>;
type Points = Extract<TalentsEvent, { type: "points" }>;
type Refused = Extract<TalentsEvent, { type: "refused" }>;

function pointsRow(event: Points): AreaDraft[] {
  const noun = event.after === 1 ? "point" : "points";
  return [
    {
      class: "log",
      data: { after: event.after, before: event.before },
      name: "points",
      text: `${event.after} talent ${noun} free.`,
    },
  ];
}

function learnedRows(event: Info): AreaDraft[] {
  return event.talents
    .filter((change) => change.to > change.from)
    .map((change) => ({
      class: "log",
      data: {
        freePoints: event.pointsAfter,
        rank: change.to,
        talentId: change.talentId,
      },
      name: "learned",
      text: `Learned talent ${change.talentId} rank ${change.to}.`,
    }));
}

function refusedRows(event: Refused): AreaDraft[] {
  return event.entries.map((entry) => ({
    class: "log",
    data: {
      rank: entry.rank + 1,
      reason: entry.reason,
      talentId: entry.talentId,
    },
    name: "refused",
    text: `Talent ${entry.talentId} rank ${entry.rank + 1} was not learned: ${entry.reason}.`,
  }));
}

function rows(event: TalentsEvent): AreaDraft[] {
  if (event.type === "points") return pointsRow(event);
  if (event.type === "info") return learnedRows(event);
  if (event.type === "refused") return refusedRows(event);
  return [];
}

export const talentsHarness = defineHarnessArea({
  area: "talents",
  glyph: "system",
  rules: () => ({ event: rows }),
  worldActs: ["learnTalents"],
});
