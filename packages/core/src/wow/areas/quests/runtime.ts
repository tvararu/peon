import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildNpcTextQuery,
  buildQuestgiverStatusQuery,
  buildQuestPoiQuery,
  MAX_POI_QUERY_IDS,
} from "#wow/areas/quests/protocol";
import {
  type QuestLogActs,
  questLogRuntime,
} from "#wow/areas/quests/runtime-log";
import { type ShareActs, shareRuntime } from "#wow/areas/quests/runtime-share";
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
  queryNpcText: (textId: number, guid: bigint) => boolean;
  greeting: (textId: number) => string | undefined;
} & QuestLogActs &
  ShareActs;

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
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
): PoiQueue {
  const pending = new Map<number, Timer>();
  function sendBatch(batch: readonly number[]): void {
    ctx.send(GameOpcode.CMSG_QUEST_POI_QUERY, buildQuestPoiQuery(batch));
    for (const id of batch) {
      clearTimeout(pending.get(id));
      pending.set(
        id,
        setTimeout(() => onReplyTimeout(id), REPLY_TIMEOUT_MS),
      );
    }
  }
  function onReplyTimeout(id: number): void {
    pending.delete(id);
    if (store.snapshot().pois.get(id)?.status === "pending")
      store.expirePois([id]);
  }
  function request(ids: readonly number[]): void {
    const queue = store.queryPois(ids);
    for (let i = 0; i < queue.length; i += MAX_POI_QUERY_IDS)
      sendBatch(queue.slice(i, i + MAX_POI_QUERY_IDS));
  }
  return {
    request,
    dispose: () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
}
type LogEntry = { ids: number[]; entered: number[] };

function logEntry(
  slots: readonly { questId?: number }[],
  seen: ReadonlySet<number>,
): LogEntry {
  const ids: number[] = [];
  for (const slot of slots)
    if (slot.questId !== undefined && slot.questId > 0) ids.push(slot.questId);
  return { ids, entered: ids.filter((id) => !seen.has(id)) };
}

type QuestPoiHooks = {
  seenInLog: Set<number>;
  store: QuestsStore;
  core: CoreStores;
  pois: PoiQueue;
};

function trackPoiEntry(event: QuestEvent, hooks: QuestPoiHooks): void {
  const { seenInLog, store, core, pois } = hooks;
  if (event.type === "accepted" && event.questId !== undefined) {
    store.refreshAbsentPois([event.questId]);
    pois.request([event.questId]);
    seenInLog.add(event.questId);
    return;
  }
  if (event.type === "log") {
    const { ids, entered } = logEntry(
      core.quests.snapshot().log.slots,
      seenInLog,
    );
    if (entered.length > 0) store.refreshAbsentPois(entered);
    seenInLog.clear();
    for (const id of ids) seenInLog.add(id);
    pois.request(ids);
    return;
  }
  if (event.type === "removed" && event.questId !== undefined)
    seenInLog.delete(event.questId);
}

type TextEnv = {
  ctx: AreaRuntimeCtx<QuestsEvent>;
  store: QuestsStore;
};

type TextQuery = {
  send: (textId: number, guid: bigint) => boolean;
  dispose: () => void;
};

function queryDialogText(core: CoreStores, texts: TextQuery): void {
  const dialog = core.quests.dialog;
  if (dialog?.kind === "gossip")
    texts.send(dialog.data.titleTextId, dialog.data.guid);
}

function textQuery({ ctx, store }: TextEnv): TextQuery {
  const timers = new Map<number, Timer>();
  function send(textId: number, guid: bigint): boolean {
    if (!store.requestNpcText(textId, guid)) return false;
    ctx.send(GameOpcode.CMSG_NPC_TEXT_QUERY, buildNpcTextQuery(textId, guid));
    clearTimeout(timers.get(textId));
    timers.set(
      textId,
      setTimeout(() => {
        timers.delete(textId);
        store.npcTextNoReply(textId);
      }, REPLY_TIMEOUT_MS),
    );
    return true;
  }
  return {
    send,
    dispose: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

function queryGiverStatus(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  known: ReadonlyMap<bigint, boolean>,
  guid: bigint,
): boolean {
  if (!known.has(guid)) return false;
  ctx.send(
    GameOpcode.CMSG_QUESTGIVER_STATUS_QUERY,
    buildQuestgiverStatusQuery(guid),
  );
  return true;
}

export function questsRuntime(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
  core: CoreStores,
): AreaRuntime<QuestsActs> {
  const log = questLogRuntime(ctx, store, core);
  const share = shareRuntime(ctx, store, core);
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
  const pois = poiQueue(ctx, store);
  const texts = textQuery({ ctx, store });
  const seenInLog = new Set<number>();
  const offQuest = ctx.listen("quest", (event) => {
    if (LOG_CHANGES.has(event.type)) query.schedule();
    trackPoiEntry(event, { seenInLog, store, core, pois });
    if (event.type === "dialog") queryDialogText(core, texts);
  });
  const queryPoi = (ids: readonly number[]): PoiEntryView[] => {
    pois.request(ids);
    return store.poiOf(ids);
  };
  return {
    act: {
      queryGiverStatus: (guid) => queryGiverStatus(ctx, known, guid),
      queryGiverStatuses: query.sendNow,
      queryPoi,
      queryNpcText: texts.send,
      greeting: (textId) => store.greeting(textId),
      ...log.act,
      ...share.act,
    },
    dispose: () => {
      log.dispose();
      share.dispose();
      offEntity();
      offQuest();
      query.dispose();
      texts.dispose();
      known.clear();
      pois.dispose();
    },
  };
}
