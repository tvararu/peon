import type { AreaState, ControlPose } from "@peon/core";
import type { QuestMark, UnitView } from "#harness/contract/views";
import { compassWord } from "#harness/ops/explore";
import { compassTo } from "#harness/ops/range";

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

type QuestsPois = AreaState<"quests">["pois"];
type PoiEntry = QuestsPois extends ReadonlyMap<number, infer E> ? E : never;
type QuestPoi = PoiEntry["pois"][number];
type QuestPoiPoint = QuestPoi["points"][number];
type PoiMap = QuestsPois;

export type QuestRegion = {
  kind: "objective" | "turn_in";
  label: string;
  points: readonly { x: number; y: number }[];
  to: string;
};

function centroid(points: readonly QuestPoiPoint[]): QuestPoiPoint {
  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 },
  );
  return {
    x: Math.round(sum.x / points.length),
    y: Math.round(sum.y / points.length),
  };
}

function regionLabel(
  kind: QuestRegion["kind"],
  to: QuestPoiPoint,
  pose: ControlPose | undefined,
): string {
  const what = kind === "turn_in" ? "turn-in region" : "objective region";
  const where = `around ${to.x}, ${to.y}`;
  if (!pose) return `${what} ${where}`;
  const yards = Math.round(Math.hypot(to.x - pose.x, to.y - pose.y));
  return `${what} ${where} (${yards} yd ${compassWord(compassTo(pose, to))})`;
}

export function questRegion(
  quest: { id: number; status: "incomplete" | "complete" | "failed" },
  pois: PoiMap,
  pose: ControlPose | undefined,
): QuestRegion | { none: true } | undefined {
  const entry = pois.get(quest.id);
  if (!entry || entry.status === "pending" || entry.status === "no_reply")
    return undefined;
  if (entry.status !== "known" || quest.status === "failed")
    return { none: true };
  const kind = quest.status === "complete" ? "turn_in" : "objective";
  const seen = entry.pois.filter((poi) =>
    kind === "turn_in" ? poi.objectiveIndex === -1 : poi.objectiveIndex >= 0,
  );
  const ranked = seen
    .filter((poi) => pose === undefined || poi.mapId === pose.mapId)
    .map((poi) => ({ at: centroid(poi.points), points: poi.points }))
    .filter(({ at }) => !(Number.isNaN(at.x) || Number.isNaN(at.y)))
    .sort((one, other) =>
      pose
        ? Math.hypot(one.at.x - pose.x, one.at.y - pose.y) -
          Math.hypot(other.at.x - pose.x, other.at.y - pose.y)
        : 0,
    );
  const first = ranked[0];
  if (!first) return { none: true };
  const spot = first.at;
  return {
    kind,
    label: regionLabel(kind, spot, pose),
    points: first.points,
    to: `${spot.x}, ${spot.y}`,
  };
}
