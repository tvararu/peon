import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type TalentsEvent = AreaEventOf<"talents">;
type Info = Extract<TalentsEvent, { type: "info" }>;
type Points = Extract<TalentsEvent, { type: "points" }>;
type Refused = Extract<TalentsEvent, { type: "refused" }>;
type Offer = Extract<TalentsEvent, { type: "wipe_offer" }>;

function copper(copper: number): string {
  if (copper < 100) return `${copper} copper`;
  const gold = Math.floor(copper / 10_000);
  const silver = Math.floor((copper % 10_000) / 100);
  const rest = copper % 100;
  return [
    gold > 0 ? `${gold}g` : "",
    silver > 0 ? `${silver}s` : "",
    rest > 0 ? `${rest}c` : "",
  ]
    .filter((part) => part !== "")
    .join(" ");
}

function offerRow(event: Offer, rc: RuleInput): AreaDraft[] {
  const npc = rc.refOf(event.npcGuid);
  return [
    {
      class: "log",
      data: { cost: event.cost },
      name: "wipe_offer",
      ref: npc,
      text: `Talent reset offered for ${copper(event.cost)} by ${npc}.`,
    },
  ];
}

function resetRow(event: Info): AreaDraft[] {
  const noun = event.pointsAfter === 1 ? "point" : "points";
  return [
    {
      class: "log",
      data: { freePoints: event.pointsAfter },
      name: "reset",
      text: `Talents reset. ${event.pointsAfter} ${noun} free.`,
    },
  ];
}

function isReset(event: Info): boolean {
  return (
    event.pointsAfter > event.pointsBefore &&
    event.talents.every((change) => change.to <= change.from)
  );
}

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

function rows(event: TalentsEvent, rc: RuleInput): AreaDraft[] {
  if (event.type === "points") return pointsRow(event);
  if (event.type === "info")
    return isReset(event) ? resetRow(event) : learnedRows(event);
  if (event.type === "refused") return refusedRows(event);
  if (event.type === "wipe_offer") return offerRow(event, rc);
  return [];
}

export const talentsHarness = defineHarnessArea({
  area: "talents",
  glyph: "system",
  rules: () => ({ event: rows }),
  worldActs: ["learnTalents", "resetTalents"],
});
