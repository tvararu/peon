import type { GiverStatus } from "#wow/areas/quests/protocol";

export type QuestMark =
  | "available"
  | "available_low"
  | "available_repeatable"
  | "reward"
  | "incomplete"
  | "none";
export type MarkSource = "multiple" | "single";
export type MarkEntry = { status: number; at: number; source: MarkSource };
export type Marks = ReadonlyMap<bigint, MarkEntry>;
export type GiverMark = { guid: bigint; status: number; mark: QuestMark };
export type MarksChange = { marks: Marks; changed: bigint[] };

const MARKS: Readonly<Record<number, QuestMark>> = {
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

export function markOf(status: number): QuestMark {
  return MARKS[status] ?? "none";
}

export function giversOf(marks: Marks): GiverMark[] {
  return [...marks].map(([guid, { status }]) => ({
    guid,
    status,
    mark: markOf(status),
  }));
}

export function receiveMultiple(
  marks: Marks,
  givers: readonly GiverStatus[],
  at: number,
): MarksChange {
  const next = new Map<bigint, MarkEntry>();
  for (const { guid, status } of givers)
    next.set(guid, { status, at, source: "multiple" });
  const changed = [...next]
    .filter(([guid, entry]) => marks.get(guid)?.status !== entry.status)
    .map(([guid]) => guid);
  for (const guid of marks.keys()) if (!next.has(guid)) changed.push(guid);
  return { marks: next, changed };
}

export function receiveSingle(
  marks: Marks,
  giver: GiverStatus,
  at: number,
): MarksChange {
  const next = new Map(marks);
  next.set(giver.guid, { status: giver.status, at, source: "single" });
  const same = marks.get(giver.guid)?.status === giver.status;
  return { marks: next, changed: same ? [] : [giver.guid] };
}

export function forget(marks: Marks, guid: bigint): Marks {
  const next = new Map(marks);
  next.delete(guid);
  return next;
}
