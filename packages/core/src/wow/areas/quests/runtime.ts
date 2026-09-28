import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { buildQuestgiverStatusQuery } from "#wow/areas/quests/protocol";
import type { QuestsEvent, QuestsStore } from "#wow/areas/quests/store";
import type { Entity, EntityEvent } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { QuestEvent } from "#wow/quests";

export const MARKS_DEBOUNCE_MS = 500;
export const MARKS_MIN_GAP_MS = 2000;

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

export function questsRuntime(
  ctx: AreaRuntimeCtx<QuestsEvent>,
  store: QuestsStore,
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
  const offQuest = ctx.listen("quest", (event) => {
    if (LOG_CHANGES.has(event.type)) query.schedule();
  });
  const queryGiverStatus = (guid: bigint): boolean => {
    if (!known.has(guid)) return false;
    ctx.send(
      GameOpcode.CMSG_QUESTGIVER_STATUS_QUERY,
      buildQuestgiverStatusQuery(guid),
    );
    return true;
  };
  return {
    act: { queryGiverStatus, queryGiverStatuses: query.sendNow },
    dispose: () => {
      offEntity();
      offQuest();
      query.dispose();
      known.clear();
    },
  };
}
