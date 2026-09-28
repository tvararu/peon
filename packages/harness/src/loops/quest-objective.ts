import {
  distance,
  type Entity,
  extractGameObjectFields,
  isUnit,
  ObjectType,
  type QuestLog,
  type QuestQueryResponse,
  type Vec3,
} from "@peon/core";
import { type CycleStop, cycleStop } from "#harness/loops/cycle-stop";
import { tappedByOther } from "#harness/loops/cycle-vet";

export const OBJECTIVE_REACH = 50;

export function outOfReach(
  pick: { guid: bigint; distance: number },
  cause: string | undefined,
): CycleStop | undefined {
  if (cause !== "target_unreachable" || pick.distance <= OBJECTIVE_REACH)
    return undefined;
  return cycleStop("objective_targets_out_of_reach", {
    nearest: `0x${pick.guid.toString(16)}`,
    distance: Math.round(pick.distance),
    reach: OBJECTIVE_REACH,
  });
}

const GO_DYNFLAG_LO_ACTIVATE = 0x01;
const LOG_COMPLETE = 1;
const LOG_FAILED = 2;

export type ObjectiveKill = { entry: number; index: number; required: number };
export type ObjectiveObject = {
  entry: number;
  index: number;
  required: number;
};
export type ObjectiveItem = { itemId: number; required: number };
export type ObjectTemplates = ReadonlyMap<
  number,
  { questItems: readonly number[] }
>;

export type QuestObjective = {
  questId: number;
  kills: ObjectiveKill[];
  objects: ObjectiveObject[];
  items: ObjectiveItem[];
  sources: number[];
  chests: number[];
};

export type ObjectiveProgress = {
  questId: number;
  slot: number;
  complete: boolean;
  kills: (ObjectiveKill & { current: number | undefined })[];
  objects?: (ObjectiveObject & { current: number | undefined })[];
  items: ObjectiveItem[];
};

export type ObjectivePick =
  | { kind: "complete"; progress: ObjectiveProgress }
  | { kind: "target"; guid: bigint; entry: number; distance: number }
  | { kind: "object"; guid: bigint; entry: number; distance: number }
  | CycleStop;

function chestEntries(
  items: readonly ObjectiveItem[],
  templates: ObjectTemplates,
): number[] {
  const wanted = new Set(items.map((item) => item.itemId));
  const entries: number[] = [];
  for (const [entry, template] of templates)
    if (template.questItems.some((itemId) => wanted.has(itemId)))
      entries.push(entry);
  return entries;
}

export function questObjective(
  query: QuestQueryResponse,
  sources: readonly number[],
  templates: ObjectTemplates,
): QuestObjective | CycleStop {
  const kills: ObjectiveKill[] = [];
  const objects: ObjectiveObject[] = [];
  for (const [index, target] of query.targets.entries()) {
    if (target.npcOrGoId < 0 && target.count > 0)
      objects.push({
        entry: -target.npcOrGoId,
        index,
        required: target.count,
      });
    if (target.npcOrGoId > 0 && target.count > 0)
      kills.push({ entry: target.npcOrGoId, index, required: target.count });
  }
  const items = query.requiredItems
    .filter((item) => item.itemId > 0 && item.count > 0)
    .map((item) => ({ itemId: item.itemId, required: item.count }));
  const chests = chestEntries(items, templates);
  if (items.length > 0 && sources.length === 0 && chests.length === 0)
    return cycleStop("objective_item_sources_unknown", {
      items: items.map((item) => item.itemId),
    });
  if (kills.length === 0 && items.length === 0 && objects.length === 0)
    return cycleStop("objective_unsupported", { questId: query.questId });
  return {
    chests,
    items,
    kills,
    objects,
    questId: query.questId,
    sources: [...sources],
  };
}

export function objectiveProgress(
  objective: QuestObjective,
  log: QuestLog,
): ObjectiveProgress | CycleStop {
  const slot = log.slots.find((entry) => entry.questId === objective.questId);
  if (slot === undefined)
    return cycleStop("quest_not_in_log", { questId: objective.questId });
  if (slot.flags === undefined)
    return cycleStop("quest_log_unobserved", { questId: objective.questId });
  if (slot.flags & LOG_FAILED)
    return cycleStop("quest_failed", { questId: objective.questId });
  return {
    questId: objective.questId,
    slot: slot.slot,
    complete: (slot.flags & LOG_COMPLETE) !== 0,
    kills: objective.kills.map((kill) => ({
      ...kill,
      current: slot.counters[kill.index],
    })),
    objects: objective.objects.map((object) => ({
      ...object,
      current: slot.counters[object.index],
    })),
    items: objective.items,
  };
}

function wantedEntries(progress: ObjectiveProgress, sources: number[]) {
  const entries = new Set(sources);
  for (const kill of progress.kills)
    if (kill.current === undefined || kill.current < kill.required)
      entries.add(kill.entry);
  return entries;
}

function wantedObjects(progress: ObjectiveProgress, chests: number[]) {
  const entries = new Set(chests);
  for (const object of progress.objects ?? [])
    if (object.current === undefined || object.current < object.required)
      entries.add(object.entry);
  return entries;
}

function activatable(entity: Entity): boolean {
  const dynFlags = extractGameObjectFields(entity.rawFields).dynFlags ?? 0;
  return (dynFlags & GO_DYNFLAG_LO_ACTIVATE) !== 0;
}

export function pickObjectiveTarget(args: {
  objective: QuestObjective;
  log: QuestLog;
  entities: readonly Entity[];
  self: Vec3 | undefined;
  tried: ReadonlySet<bigint>;
}): ObjectivePick {
  const progress = objectiveProgress(args.objective, args.log);
  if ("ok" in progress) return progress;
  if (progress.complete) return { kind: "complete", progress };
  if (args.self === undefined) return cycleStop("self_pose_unobserved");
  const self = args.self;
  const entries = wantedEntries(progress, args.objective.sources);
  const objects = wantedObjects(progress, args.objective.chests);
  const candidates = args.entities
    .flatMap((entity) => {
      if (entity.position === undefined || args.tried.has(entity.guid))
        return [];
      const kind = candidateKind(entity, entries, objects);
      if (kind === undefined) return [];
      return [
        {
          distance: distance(self, entity.position),
          entry: entity.entry,
          guid: entity.guid,
          kind,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];
  if (nearest === undefined)
    return cycleStop("objective_targets_absent", {
      entries: [...entries],
      objects: [...objects],
    });
  return nearest;
}

function candidateKind(
  entity: Entity,
  entries: ReadonlySet<number>,
  objects: ReadonlySet<number>,
): "target" | "object" | undefined {
  if (
    isUnit(entity) &&
    entity.objectType === ObjectType.UNIT &&
    entries.has(entity.entry) &&
    entity.health > 0 &&
    !tappedByOther(entity)
  )
    return "target";
  if (
    entity.objectType === ObjectType.GAMEOBJECT &&
    objects.has(entity.entry) &&
    activatable(entity)
  )
    return "object";
  return undefined;
}
