import type { AreaState } from "@peon/core";
import type { QuestMark, UnitView } from "#harness/contract/views";

export type MarkedUnit = { guid: bigint; mark: QuestMark };

const WORD_BY_STATUS: Record<number, QuestMark | undefined> = {
  2: "available_low",
  3: "reward",
  4: "available_repeatable",
  5: "incomplete",
  6: "reward",
  7: "available_repeatable",
  8: "available",
  9: "reward",
  10: "reward",
};

type MarkEntry =
  AreaState<"quests">["marks"] extends ReadonlyMap<bigint, infer E> ? E : never;

export function questMarkOf(
  entry: MarkEntry | undefined,
): QuestMark | undefined {
  if (!entry) return undefined;
  return WORD_BY_STATUS[entry.status];
}

function guidOf(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

export function withQuestMarks(
  rows: readonly UnitView[],
  marks: ReadonlyMap<bigint, MarkEntry>,
): UnitView[] {
  return rows.map((row) => {
    const mark = questMarkOf(marks.get(guidOf(row.guid)));
    return mark ? { ...row, questMark: mark } : row;
  });
}

export function markedUnits(
  rows: readonly UnitView[],
  marks: ReadonlyMap<bigint, MarkEntry>,
): MarkedUnit[] {
  return rows.flatMap((row) => {
    const mark = questMarkOf(marks.get(guidOf(row.guid)));
    return mark ? [{ guid: guidOf(row.guid), mark }] : [];
  });
}
