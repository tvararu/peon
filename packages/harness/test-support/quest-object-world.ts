import { jest } from "bun:test";
import type {
  AreaState,
  ControlPose,
  Entity,
  GameObjectEntity,
  QuestLog,
  QuestQueryResponse,
  RewardsEvent,
} from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import type { RewardsPort } from "#harness/loops/ports";
import { questCycleObjective } from "#harness/loops/quest-cycle";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  fakeControl,
  fakeLoot,
  fakeTactics,
  makeCycle,
  type Wired,
} from "#test-support/encounter-cycle-fixtures";

export const CRATE_ENTRY = 161_557;
export const CRATE_GUID = 2n;
export const MILLY = 11_119;
export const QUEST = 3904;
export const GO_DYNAMIC_OFFSET = 14;
export const OPEN_SPELL = 6478;
export const KEY = 12_301;

export type ObjectsState = AreaState<"objects">;
export type Template =
  ObjectsState["templates"] extends ReadonlyMap<number, infer T> ? T : never;

export function template(over: Partial<Template> = {}): Template {
  return {
    castBarCaption: "",
    data: [],
    displayId: 0,
    entry: CRATE_ENTRY,
    iconName: "",
    lockId: 43,
    name: "Milly's Harvest",
    pageId: undefined,
    questId: QUEST,
    questItems: [MILLY],
    size: 1,
    type: 3,
    ...over,
  };
}

export function crate(x: number, entry = CRATE_ENTRY): GameObjectEntity {
  return {
    bytes1: 0,
    displayId: 0,
    entry,
    flags: 0,
    gameObjectType: 3,
    guid: CRATE_GUID,
    name: undefined,
    objectType: 5,
    position: { mapId: 0, orientation: 0, x, y: 0, z: 0 },
    rawFields: new Map([[GO_DYNAMIC_OFFSET, 1]]),
    scale: 1,
  };
}

const known = {
  questId: QUEST,
  requiredItems: [{ count: 8, itemId: MILLY }],
  targets: [],
} as unknown as QuestQueryResponse;

export function questLog(flags: number): QuestLog {
  return {
    complete: true,
    slots: [
      {
        counters: [0, 0, 0, 0],
        expiresAtSeconds: 0,
        flags,
        questId: QUEST,
        slot: 0,
      },
    ],
  };
}

export type World = {
  acts: MockHandle["objects"]["act"];
  handle: MockHandle;
  loot: RewardsPort & Wired<RewardsEvent> & { taken: () => number[] };
  order: string[];
  pose: ControlPose;
  state: { entities: Entity[]; flags: number };
  walked: number[];
};

export function world(
  options: { x?: number; templates?: Template[] } = {},
): World {
  const handle = createMockHandle();
  const pose = { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 } as ControlPose;
  const control = handle.getControlState();
  handle.getControlState = () => ({ ...control, pose });
  const state = { entities: [crate(options.x ?? 2)], flags: 0 };
  handle.getNearbyEntities = () => state.entities;
  handle.getEntity = (guid): Entity | undefined =>
    state.entities.find((entity) => entity.guid === guid);
  const quests = handle.getQuestState();
  handle.getQuestState = () => ({
    ...quests,
    log: questLog(state.flags),
    queries: [{ data: known, questId: QUEST, receivedAt: 0, status: "known" }],
  });
  const templates = options.templates ?? [template()];
  jest.spyOn(handle.objects, "state").mockImplementation(
    () =>
      ({
        templates: new Map(templates.map((entry) => [entry.entry, entry])),
      }) as unknown as ObjectsState,
  );
  const walked: number[] = [];
  handle.walkTowardPoint = jest.fn(async (target, yards) => {
    walked.push(yards);
    pose.x = Math.min(target.x, pose.x + yards);
    return { pose, status: "completed" as const, traveled: yards };
  });
  const loot = fakeLoot({ items: [1] });
  const acts = handle.objects.act;
  const order: string[] = [];
  jest.spyOn(acts, "openLockSpell").mockImplementation(async () => {
    order.push("lock");
    return { by: "spell", spellId: OPEN_SPELL };
  });
  jest.spyOn(acts, "use").mockImplementation(() => {
    order.push("use");
    return { ok: true, record: { entry: CRATE_ENTRY, guid: CRATE_GUID } };
  });
  jest.spyOn(acts, "open").mockImplementation(() => {
    order.push("open");
    loot.open(CRATE_GUID);
    return { ok: true };
  });
  return { acts, handle, loot, order, pose, state, walked };
}

export function questCycle(t: World) {
  const tactics = fakeTactics([]);
  const runtime = makeCycle({
    control: fakeControl(),
    loot: t.loot,
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  return { runtime, tactics };
}

export async function run(t: World, maxStarts = 4) {
  const { objective } = await questCycleObjective(t.handle, QUEST, []);
  const { runtime, tactics } = questCycle(t);
  const started = runtime.start({
    guids: [],
    instruction: "get the crates",
    maxStarts,
    objective,
  });
  await started;
  return { runtime, tactics };
}
