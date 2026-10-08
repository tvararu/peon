import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type TalentsEvent = AreaEventOf<"talents">;
type Info = Extract<TalentsEvent, { type: "info" }>;
type Points = Extract<TalentsEvent, { type: "points" }>;
type Refused = Extract<TalentsEvent, { type: "refused" }>;
type Offer = Extract<TalentsEvent, { type: "wipe_offer" }>;

function copper(amount: number): string {
  if (amount < 100) return `${amount} copper`;
  const gold = Math.floor(amount / 10_000);
  const silver = Math.floor((amount % 10_000) / 100);
  const rest = amount % 100;
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
    event.talents.some((change) => change.to < change.from)
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

function glyphRows(event: Info): AreaDraft[] {
  return event.glyphs.map((change) => ({
    class: "log",
    data: { glyphId: change.to, slot: change.slot + 1 },
    name: "glyph",
    text:
      change.to === 0
        ? `Glyph slot ${change.slot + 1} cleared.`
        : `Glyph ${change.to} in slot ${change.slot + 1}.`,
  }));
}

type TalentsMemo = {
  pendingResetPoints: { after: number; before: number } | undefined;
};

function rows(
  event: TalentsEvent,
  rc: RuleInput,
  memo?: TalentsMemo,
): AreaDraft[] {
  if (event.type === "points") {
    const paired = memo?.pendingResetPoints;
    if (
      memo !== undefined &&
      paired !== undefined &&
      event.after === paired.after &&
      event.before === paired.before
    ) {
      memo.pendingResetPoints = undefined;
      return [];
    }
    return pointsRow(event);
  }
  if (event.type === "info") {
    if (memo !== undefined)
      memo.pendingResetPoints = isReset(event)
        ? { after: event.pointsAfter, before: event.pointsBefore }
        : undefined;
    const glyph = glyphRows(event);
    return isReset(event)
      ? [...resetRow(event), ...glyph]
      : [...learnedRows(event), ...glyph];
  }
  if (memo !== undefined) memo.pendingResetPoints = undefined;
  if (event.type === "refused") return refusedRows(event);
  if (event.type === "wipe_offer") return offerRow(event, rc);
  return [];
}

export const talentsHarness = defineHarnessArea({
  area: "talents",
  glyph: "system",
  rules: () => {
    const memo: TalentsMemo = { pendingResetPoints: undefined };
    return { event: (event, rc) => rows(event, rc, memo) };
  },
});
