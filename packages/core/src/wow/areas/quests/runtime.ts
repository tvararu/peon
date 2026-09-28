import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildQuestgiverStatusQuery,
  buildQuestPoiQuery,
  MAX_POI_QUERY_IDS,
} from "#wow/areas/quests/protocol";
import type {
  PoiEntryView,
  QuestsEvent,
  QuestsStore,
} from "#wow/areas/quests/store";
import type { Entity, EntityEvent } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { QuestEvent } from "#wow/quests";
import type { CoreStores } from "#wow/session-stores";

export const MARKS_DEBOUNCE_MS = 500;
export const MARKS_MIN_GAP_MS = 2000;
export const REPLY_TIMEOUT_MS = 5000;

const NPC_FLAG_QUESTGIVER = 0x2;
const GAMEOBJECT_TYPE_QUESTGIVER = 2;
const LOG_CHANGES: ReadonlySet<QuestEvent["type"]> = new Set([
  "accepted",
  "removed",
  "completed",
  "failed",
]);

export type QuestsActs = {
  queryGiverStatus: (guid: bigint) => boolean;
  queryGiverStatuses: () => void;
  queryPoi: (ids: readonly number[]) => PoiEntryView[];
};

type Timer = ReturnType<typeof setTimeout>;

function isGiver(entity: Entity): boolean {
  if (entity.objectType === ObjectType.UNIT && "npcFlags" in entity)
    return (entity.npcFlags & NPC_FLAG_QUESTGIVER) !== 0;
  if (entity.objectType === ObjectType.GAMEOBJECT && "bytes1" in entity)
    return (
      entity.gameObjectType === GAMEOBJECT_TYPE_QUESTGIVER ||
      ((entity.bytes1 >> 8) & 0xff) === GAMEOBJECT_TYPE_QUESTGIVER
    );
  return false;
}

function isQueryable(entity: Entity): boolean {
  return (
    entity.objectType === ObjectType.UNIT ||
    entity.objectType === ObjectType.GAMEOBJECT
  );
}

type MarksQuery = {
  schedule: () => void;
  sendNow: () => void;
  dispose: () => void;
};

function marksQuery(send: () => void): MarksQuery {
  let debounce: Timer | undefined;
  let cooldown: Timer | undefined;
  let waiting = false;
  function sendMultiple(): void {
    send();
    clearTimeout(cooldown);
    cooldown = setTimeout(endCooldown, MARKS_MIN_GAP_MS);
  }
  function endCooldown(): void {
    cooldown = undefined;
    if (!waiting) return;
    waiting = false;
    sendMultiple();
  }
  function fire(): void {
    debounce = undefined;
    if (cooldown) waiting = true;
    else sendMultiple();
  }
  return {
    schedule: () => {
      clearTimeout(debounce);
      debounce = setTimeout(fire, MARKS_DEBOUNCE_MS);
    },
    sendNow: () => {
      clearTimeout(debounce);
      debounce = undefined;
      waiting = false;
      sendMultiple();
    },
    dispose: () => {
      clearTimeout(debounce);
      clearTimeout(cooldown);
    },
  };
}

function changesGiver(event: EntityEvent & { type: "update" }): boolean {
  return (
    event.changed.includes("npcFlags") ||
    event.changed.includes("gameObjectType")
  );
}

type PoiQueue = {
  request: (ids: readonly number[]) => void;
  dispose: () => void;
};

function poiQueue(
  send: (batch: readonly number[]) => void,
  store: QuestsStore,
): PoiQueue {
  const pending = new Map<number, Timer>();
  function sendBatch(batch: readonly number[]): void {
    send(batch);
    for (const id of batch) {
      clearTimeout(pending.get(id));
      pending.set(
        id,
        setTimeout(() => onReplyTimeout(id), REPLY_TIMEOUT_MS),
      );
    }
  }
  function flush(requested: readonly number[]): void {
    const queue: number[] = [];
    for (const id of requested)
      if (store.snapshot().pois.get(id)?.status === "pending") queue.push(id);
    for (let i = 0; i < queue.length; i += MAX_POI_QUERY_IDS)
      sendBatch(queue.slice(i, i + MAX_POI_QUERY_IDS));
  }
  function onReplyTimeout(id: number): void {
    pending.delete(id);
    if (store.snapshot().pois.get(id)?.status === "pending")
      store.expirePois([id]);
  }
  function request(ids: readonly number[]): void {
    store.queryPois(ids);
    flush(ids);
  }
  return {
    request,
    dispose: () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
}
export function questsRuntime(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
  core: CoreStores,
): AreaRuntime<QuestsActs> {
  const known = new Map<bigint, boolean>();
  const query = marksQuery(() =>
    ctx.send(GameOpcode.CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY),
  );
  function observe(entity: Entity, adds: boolean): void {
    if (!isQueryable(entity)) return;
    const was = known.get(entity.guid) ?? false;
    const giver = isGiver(entity);
    known.set(entity.guid, giver);
    if (adds && giver && !was && !store.hasMark(entity.guid)) query.schedule();
  }
  const offEntity = ctx.listen("entity", (event) => {
    if (event.type === "appear") return observe(event.entity, true);
    if (event.type === "update")
      return observe(event.entity, changesGiver(event));
    known.delete(event.guid);
    store.forget(event.guid);
  });
  const pois = poiQueue(
    (batch) =>
      ctx.send(GameOpcode.CMSG_QUEST_POI_QUERY, buildQuestPoiQuery(batch)),
    store,
  );
  const offQuest = ctx.listen("quest", (event) => {
    if (LOG_CHANGES.has(event.type)) query.schedule();
    if (event.type === "accepted" && event.questId !== undefined)
      pois.request([event.questId]);
    else if (event.type === "log") {
      const ids: number[] = [];
      for (const slot of core.quests.snapshot().log.slots)
        if (slot.questId !== undefined) ids.push(slot.questId);
      pois.request(ids);
    }
  });
  const queryGiverStatus = (guid: bigint): boolean => {
    if (!known.has(guid)) return false;
    ctx.send(
      GameOpcode.CMSG_QUESTGIVER_STATUS_QUERY,
      buildQuestgiverStatusQuery(guid),
    );
    return true;
  };
  const queryPoi = (ids: readonly number[]): PoiEntryView[] => {
    pois.request(ids);
    return store.poiOf(ids);
  };
  return {
    act: { queryGiverStatus, queryGiverStatuses: query.sendNow, queryPoi },
    dispose: () => {
      offEntity();
      offQuest();
      query.dispose();
      known.clear();
      pois.dispose();
    },
  };
}
