import { describe, expect, test } from "bun:test";
import {
  type Entity,
  type GameObjectEntity,
  ObjectType,
  type QuestLog,
  type QuestLogSlot,
  type QuestQueryResponse,
  UNIT_FIELDS,
  type UnitEntity,
} from "@peon/core";
import {
  OBJECTIVE_REACH,
  pickObjectiveTarget,
  type QuestObjective,
  questObjective,
} from "#harness/loops/quest-objective";

const CRATE = 161_557;
const MILLY = 11_119;
const GO_DYNAMIC_OFFSET = 14;
const emptyTemplates = new Map<number, { questItems: readonly number[] }>();
const WYRM = 15_274;
const TENDER = 15_294;

function query(
  targets: [npcOrGoId: number, count: number][],
  items: [itemId: number, count: number][] = [],
): QuestQueryResponse {
  return {
    questId: 8325,
    requiredItems: items.map(([itemId, count]) => ({ count, itemId })),
    targets: targets.map(([npcOrGoId, count]) => ({
      count,
      encodedNpcOrGoId: npcOrGoId,
      itemDropId: 0,
      npcOrGoId,
      unknownSourceCount: 0,
    })),
  } as QuestQueryResponse;
}

function log(flags: number, counters: number[], questId = 8325): QuestLog {
  const slot: QuestLogSlot = {
    counters: [counters[0], counters[1], counters[2], counters[3]],
    expiresAtSeconds: 0,
    flags,
    questId,
    slot: 3,
  };
  return { complete: true, slots: [slot] };
}

function unit(
  guid: bigint,
  entry: number,
  x: number,
  options: { health?: number; dynamicFlags?: number } = {},
): Entity {
  const entity: UnitEntity = {
    class_: 0,
    displayId: 0,
    entry,
    factionTemplate: 7,
    gender: 0,
    guid,
    health: options.health ?? 50,
    level: 1,
    maxHealth: 50,
    maxPower: [],
    name: undefined,
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: { mapId: 530, orientation: 0, x, y: 0, z: 0 },
    power: [],
    race: 0,
    rawFields: new Map([
      [UNIT_FIELDS.DYNAMIC_FLAGS.offset, options.dynamicFlags ?? 0],
    ]),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
  return entity;
}

function crate(
  guid: bigint,
  x: number,
  options: { entry?: number; dynFlags?: number } = {},
): Entity {
  const entity: GameObjectEntity = {
    bytes1: 0,
    displayId: 0,
    entry: options.entry ?? CRATE,
    flags: 0,
    gameObjectType: 3,
    guid,
    name: undefined,
    objectType: ObjectType.GAMEOBJECT,
    position: { mapId: 0, orientation: 0, x, y: 0, z: 0 },
    rawFields: new Map([[GO_DYNAMIC_OFFSET, options.dynFlags ?? 1]]),
    scale: 1,
  };
  return entity;
}

function kills(): QuestObjective {
  const objective = questObjective(query([[WYRM, 8]]), [], emptyTemplates);
  if ("ok" in objective) throw new Error(objective.cause);
  return objective;
}

const origin = { x: 0, y: 0, z: 0 };
const unknownCarried = () => undefined;

describe("quest objective derivation", () => {
  test("creature targets keep their log counter index and count", () => {
    const objective = questObjective(
      query([
        [0, 0],
        [WYRM, 8],
      ]),
      [],
      emptyTemplates,
    );
    expect(objective).toEqual({
      chests: [],
      items: [],
      kills: [{ entry: WYRM, index: 1, required: 8 }],
      objects: [],
      questId: 8325,
      sources: [],
    });
  });

  test("a negative target id is an object objective with its counter index", () => {
    const objective = questObjective(
      query([
        [0, 0],
        [-181_000, 4],
      ]),
      [],
      emptyTemplates,
    );
    expect(objective).toMatchObject({
      kills: [],
      objects: [{ entry: 181_000, index: 1, required: 4 }],
    });
  });

  test("an item objective finds the chest whose template lists the item", () => {
    const templates = new Map([
      [CRATE, { questItems: [MILLY] }],
      [4321, { questItems: [999] }],
    ]);
    const objective = questObjective(query([], [[MILLY, 8]]), [], templates);
    expect(objective).toMatchObject({
      chests: [{ entry: CRATE, itemIds: [MILLY] }],
      items: [{ itemId: MILLY, required: 8 }],
      sources: [],
    });
  });

  test("objectives the loop cannot pursue are named, not guessed", () => {
    expect(
      questObjective(query([], [[20_797, 8]]), [], emptyTemplates),
    ).toMatchObject({
      cause: "objective_item_sources_unknown",
      detail: { items: [20_797] },
    });
    expect(questObjective(query([]), [], emptyTemplates)).toMatchObject({
      cause: "objective_unsupported",
    });
  });

  test("item objectives use supervisor-named creature sources", () => {
    const objective = questObjective(
      query([], [[20_797, 8]]),
      [TENDER],
      emptyTemplates,
    );
    expect(objective).toMatchObject({
      items: [{ itemId: 20_797, required: 8 }],
      sources: [TENDER],
    });
  });
});

describe("objective target selection", () => {
  const pick = (
    entities: Entity[],
    questLog = log(0, [0]),
    tried = new Set<bigint>(),
  ) =>
    pickObjectiveTarget({
      entities,
      log: questLog,
      objective: kills(),
      carried: unknownCarried,
      self: origin,
      tried,
    });

  test("picks the nearest live, untried, untapped objective creature", () => {
    const entities = [
      unit(1n, WYRM, 30),
      unit(2n, WYRM, 5, { health: 0 }),
      unit(3n, TENDER, 2),
      unit(4n, WYRM, 8, { dynamicFlags: 0x4 }),
      unit(5n, WYRM, 12, { dynamicFlags: 0x4 | 0x8 }),
      unit(6n, WYRM, 10),
    ];
    expect(pick(entities)).toMatchObject({ guid: 6n, kind: "target" });
    expect(pick(entities, log(0, [0]), new Set([6n]))).toMatchObject({
      guid: 5n,
    });
  });

  test("a complete log slot ends the objective with server counters", () => {
    expect(pick([unit(1n, WYRM, 5)], log(1, [8]))).toEqual({
      kind: "complete",
      progress: {
        complete: true,
        items: [],
        kills: [{ current: 8, entry: WYRM, index: 0, required: 8 }],
        objects: [],
        questId: 8325,
        slot: 3,
      },
    });
  });

  test("a filled kill counter stops targeting that creature", () => {
    expect(pick([unit(1n, WYRM, 5)], log(0, [8]))).toMatchObject({
      cause: "objective_targets_absent",
      detail: { entries: [] },
    });
  });

  test("absent quest, failed quest, missing and distant targets are named stops", () => {
    expect(pick([], log(0, [0], 1))).toMatchObject({
      cause: "quest_not_in_log",
    });
    expect(pick([], log(2, [0]))).toMatchObject({ cause: "quest_failed" });
    expect(pick([])).toMatchObject({ cause: "objective_targets_absent" });
  });

  test("a target in view beyond the objective reach is picked to route to", () => {
    expect(pick([unit(1n, WYRM, OBJECTIVE_REACH + 40)])).toMatchObject({
      distance: OBJECTIVE_REACH + 40,
      guid: 1n,
      kind: "target",
    });
  });
});

describe("object target selection", () => {
  const chestObjective = (): QuestObjective => {
    const objective = questObjective(
      query([], [[MILLY, 8]]),
      [],
      new Map([[CRATE, { questItems: [MILLY] }]]),
    );
    if ("ok" in objective) throw new Error(objective.cause);
    return objective;
  };
  const pick = (
    entities: Entity[],
    tried = new Set<bigint>(),
    objective = chestObjective(),
  ) =>
    pickObjectiveTarget({
      entities,
      log: log(0, [0]),
      objective,
      carried: unknownCarried,
      self: origin,
      tried,
    });

  test("picks the nearest untried chest that still glows for the quest", () => {
    const entities = [
      crate(1n, 30),
      crate(2n, 5, { dynFlags: 0 }),
      crate(3n, 12),
      crate(4n, 3, { entry: 555 }),
      unit(5n, WYRM, 1),
    ];
    expect(pick(entities)).toEqual({
      distance: 12,
      entry: CRATE,
      guid: 3n,
      kind: "object",
    });
    expect(pick(entities, new Set([3n]))).toMatchObject({ guid: 1n });
  });

  test("an object objective picks its object until the counter fills", () => {
    const objective = questObjective(
      query([[-181_000, 2]]),
      [],
      emptyTemplates,
    );
    if ("ok" in objective) throw new Error(objective.cause);
    const entities = [crate(1n, 9, { entry: 181_000 })];
    const open = pickObjectiveTarget({
      entities,
      log: log(0, [1]),
      objective,
      carried: unknownCarried,
      self: origin,
      tried: new Set(),
    });
    expect(open).toMatchObject({ guid: 1n, kind: "object" });
    const filled = pickObjectiveTarget({
      entities,
      log: log(0, [2]),
      objective,
      carried: unknownCarried,
      self: origin,
      tried: new Set(),
    });
    expect(filled).toMatchObject({ cause: "objective_targets_absent" });
  });

  test("a chest is wanted only while its quest item is outstanding", () => {
    const templates = new Map([
      [CRATE, { questItems: [MILLY] }],
      [777, { questItems: [999] }],
    ]);
    const objective = questObjective(
      query(
        [],
        [
          [MILLY, 8],
          [999, 2],
        ],
      ),
      [],
      templates,
    );
    if ("ok" in objective) throw new Error(objective.cause);
    const entities = [crate(1n, 5), crate(2n, 20, { entry: 777 })];
    const carrying = (counts: Record<number, number>) =>
      pickObjectiveTarget({
        carried: (itemId) => counts[itemId],
        entities,
        log: log(0, [0]),
        objective,
        self: origin,
        tried: new Set(),
      });
    expect(carrying({ [MILLY]: 3, 999: 2 })).toMatchObject({ guid: 1n });
    expect(carrying({ [MILLY]: 8, 999: 1 })).toMatchObject({ guid: 2n });
    expect(carrying({ [MILLY]: 8, 999: 2 })).toMatchObject({
      cause: "objective_targets_absent",
    });
    expect(carrying({})).toMatchObject({ guid: 1n });
  });

  test("a creature and a chest compete by distance", () => {
    const objective = questObjective(
      query([[WYRM, 8]], [[MILLY, 8]]),
      [],
      new Map([[CRATE, { questItems: [MILLY] }]]),
    );
    if ("ok" in objective) throw new Error(objective.cause);
    const near = pick([unit(1n, WYRM, 4), crate(2n, 9)], new Set(), objective);
    expect(near).toMatchObject({ guid: 1n, kind: "target" });
  });
});
