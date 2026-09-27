import { inflateSync } from "node:zlib";
import type { CreatureInfo, CreatureRank } from "#wow/client-extras";
import { ObjectType, UpdateFlag } from "#wow/protocol/entity-fields";
import {
  buildCreatureQuery,
  buildGameObjectQuery,
  type CreatureQueryResult,
  parseCreatureQueryResponse,
  parseGameObjectQueryResponse,
} from "#wow/protocol/entity-queries";
import {
  extractGameObjectFields,
  extractObjectFields,
  extractUnitFields,
  type GameObjectFieldsResult,
  type UnitFieldsResult,
} from "#wow/protocol/extract-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import {
  parseUpdateObject,
  type UpdateEntry,
} from "#wow/protocol/update-object";
import type { SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid, sendPacket } from "#wow/world-handlers";

type EntityStores = Pick<SessionStores, "motion" | "quests" | "self">;

type TypeFields = Partial<UnitFieldsResult> & Partial<GameObjectFieldsResult>;
type Entry<T extends UpdateEntry["type"]> = Extract<UpdateEntry, { type: T }>;

export function handleUpdateObject(
  conn: WorldConn,
  stores: EntityStores,
  r: PacketReader,
): void {
  const entries = parseUpdateObject(r, stores.self.mapId);
  for (const entry of entries) applyEntry(conn, stores, entry);
  stores.quests.observeQuestLog();
}

function applyEntry(
  conn: WorldConn,
  stores: EntityStores,
  entry: UpdateEntry,
): void {
  switch (entry.type) {
    case "create":
      applyCreate(conn, stores, entry);
      return;
    case "values":
      applyValues(conn, stores, entry);
      return;
    case "movement":
      applyMovement(conn, stores, entry);
      return;
    case "outOfRange":
      for (const guid of entry.guids) conn.entityStore.destroy(guid);
      return;
    case "nearObjects":
      return;
    case "malformed":
      conn.remoteMotion.invalidate(entry.guid, "malformed");
      return;
    default: {
      const unhandled: never = entry;
      throw new Error("unhandled update entry type", { cause: unhandled });
    }
  }
}

function typeFields(
  objectType: ObjectType,
  fields: ReadonlyMap<number, number>,
  previous?: ReadonlyMap<number, number>,
): TypeFields {
  if (objectType === ObjectType.UNIT || objectType === ObjectType.PLAYER)
    return extractUnitFields(fields, previous);
  if (objectType === ObjectType.GAMEOBJECT)
    return extractGameObjectFields(fields);
  return {};
}

function applyCreate(
  conn: WorldConn,
  { motion, quests, self: selfStore }: EntityStores,
  entry: Entry<"create">,
): void {
  const { guid, objectType, fields, position } = entry;
  const { _changed: _o, ...object } = extractObjectFields(fields);
  const { _changed: _t, ...extra } = typeFields(objectType, fields);
  const name = lookupCachedName(conn, guid, objectType, object.entry);
  conn.entityStore.create(guid, objectType, {
    ...object,
    ...extra,
    ...(name ? { name } : {}),
    ...(position ? { position } : {}),
    rawFields: new Map(fields),
    createComplete: true,
  });
  const self = selfGuid(conn);
  const created = guid === self ? conn.entityStore.get(self) : undefined;
  if (created) quests.observeSelfCreate(created);
  if (position) {
    motion.observe(guid, position, entry.spline);
    conn.remoteMotion.observe(guid, {
      position,
      source: "create",
      info: entry.movementInfo,
    });
  }
  if (!name) queryEntityName(conn, guid, objectType, object.entry);
  if (guid !== self && (entry.updateFlags & UpdateFlag.SELF) === 0) return;
  selfStore.receive({
    type: "observed",
    observation: {
      position,
      movementFlags: entry.movementInfo?.flags,
      runSpeed: entry.runSpeed,
      runBackSpeed: entry.runBackSpeed,
      turnRate: entry.turnRate,
      target: extra.target,
      unitFlags: extra.unitFlags,
    },
  });
}

function applyValues(
  conn: WorldConn,
  { self }: EntityStores,
  entry: Entry<"values">,
): void {
  const entity = conn.entityStore.get(entry.guid);
  if (!entity) return;
  const object = extractObjectFields(entry.fields, entity.rawFields);
  const extra = typeFields(entity.objectType, entry.fields, entity.rawFields);
  const changed = new Set([...object._changed, ...(extra._changed ?? [])]);
  const merged = Object.fromEntries(
    Object.entries({ ...object, ...extra }).filter(([key]) => changed.has(key)),
  );
  conn.entityStore.update(entry.guid, merged, entry.fields);
  if (changed.has("health")) conn.remoteMotion.observeVitals(entry.guid);
  if (entry.guid === selfGuid(conn))
    self.receive({
      type: "observed",
      observation: {
        target: extra.target,
        unitFlags: extra.unitFlags,
      },
    });
}

function applyMovement(
  conn: WorldConn,
  { motion, self }: EntityStores,
  entry: Entry<"movement">,
): void {
  if (!entry.position) return;
  conn.remoteMotion.observe(entry.guid, {
    position: entry.position,
    source: "update",
    info: entry.movementInfo,
  });
  conn.entityStore.setPosition(entry.guid, entry.position);
  motion.observe(entry.guid, entry.position, entry.spline);
  if (entry.guid !== selfGuid(conn)) return;
  self.receive({
    type: "observed",
    observation: {
      position: entry.position,
      movementFlags: entry.movementInfo?.flags,
      runSpeed: entry.runSpeed,
      runBackSpeed: entry.runBackSpeed,
      turnRate: entry.turnRate,
    },
  });
}

export function handleCompressedUpdateObject(
  conn: WorldConn,
  stores: EntityStores,
  r: PacketReader,
): void {
  const uncompressedSize = r.uint32LE();
  const compressed = r.bytes(r.remaining);
  const decompressed = inflateSync(compressed);
  if (decompressed.length !== uncompressedSize) {
    throw new Error(
      `Compressed update size mismatch: expected ${uncompressedSize}, got ${decompressed.length}`,
    );
  }
  handleUpdateObject(
    conn,
    stores,
    new PacketReader(new Uint8Array(decompressed)),
  );
}

export function handleDestroyObject(
  conn: WorldConn,
  stores: Pick<SessionStores, "quests">,
  r: PacketReader,
): void {
  const guid = r.uint64LE();
  r.skip(1);
  conn.entityStore.destroy(guid);
  stores.quests.observeQuestLog();
}

function lookupCachedName(
  conn: WorldConn,
  guid: bigint,
  objectType: number,
  entry: number | undefined,
): string | undefined {
  if (objectType === ObjectType.PLAYER) {
    const guidLow = Number(guid & 0xffffffffn);
    return conn.nameCache.get(guidLow);
  }
  if (entry === undefined) return undefined;
  if (objectType === ObjectType.UNIT) return conn.creatureNameCache.get(entry);
  if (objectType === ObjectType.GAMEOBJECT)
    return conn.gameObjectNameCache.get(entry);
  return undefined;
}

function queryEntityName(
  conn: WorldConn,
  guid: bigint,
  objectType: number,
  entry: number | undefined,
): void {
  if (objectType === ObjectType.PLAYER) {
    const guidLow = Number(guid & 0xffffffffn);
    const key = `player:${guidLow}`;
    if (conn.pendingNameQueries.has(key)) return;
    conn.pendingNameQueries.add(key);
    const w = new PacketWriter();
    w.uint64LE(guid);
    sendPacket(conn, GameOpcode.CMSG_NAME_QUERY, w.finish());
    return;
  }
  if (entry === undefined) return;
  const key = `${objectType}:${entry}`;
  if (conn.pendingNameQueries.has(key)) return;
  conn.pendingNameQueries.add(key);
  if (objectType === ObjectType.UNIT) {
    sendPacket(
      conn,
      GameOpcode.CMSG_CREATURE_QUERY,
      buildCreatureQuery(entry, guid),
    );
    return;
  }
  if (objectType === ObjectType.GAMEOBJECT) {
    sendPacket(
      conn,
      GameOpcode.CMSG_GAMEOBJECT_QUERY,
      buildGameObjectQuery(entry, guid),
    );
  }
}

const RANKS: CreatureRank[] = ["normal", "elite", "rare_elite", "boss", "rare"];

function cacheCreatureInfo(conn: WorldConn, result: CreatureQueryResult): void {
  const { entry, name, details } = result;
  if (!(name && details)) return;
  const { subName, creatureType, family, rank } = details;
  const info: CreatureInfo = {
    entry,
    name,
    subName: subName === "" ? undefined : subName,
    creatureType,
    family,
    rank: RANKS[rank] ?? "normal",
  };
  conn.creatureInfoCache.set(entry, info);
}

export function handleCreatureQueryResponse(
  conn: WorldConn,
  r: PacketReader,
): void {
  const result = parseCreatureQueryResponse(r);
  conn.pendingNameQueries.delete(`${ObjectType.UNIT}:${result.entry}`);
  if (!result.name) return;
  cacheCreatureInfo(conn, result);
  conn.creatureNameCache.set(result.entry, result.name);
  for (const entity of conn.entityStore.all()) {
    if (entity.entry === result.entry && !entity.name) {
      conn.entityStore.setName(entity.guid, result.name);
    }
  }
}

export function handleGameObjectQueryResponse(
  conn: WorldConn,
  r: PacketReader,
): void {
  const result = parseGameObjectQueryResponse(r);
  conn.pendingNameQueries.delete(`${ObjectType.GAMEOBJECT}:${result.entry}`);
  if (!result.name) return;
  conn.gameObjectNameCache.set(result.entry, result.name);
  for (const entity of conn.entityStore.all()) {
    if (entity.entry === result.entry) {
      if (!entity.name) conn.entityStore.setName(entity.guid, result.name);
      if (result.gameObjectType !== undefined) {
        conn.entityStore.update(entity.guid, {
          gameObjectType: result.gameObjectType,
        });
      }
    }
  }
}
