import {
  type AreaState,
  type ChatMessage,
  ChatType,
  type GameObjectEntity,
  type NearbyRow,
  ObjectType,
  type RemotePose,
  type UnitEntity,
} from "@peon/core";

export type ChatEvent = {
  message: string;
  sender: string;
  type: string;
  channel?: string;
};

const COLOR_PATTERN = /\|c[0-9a-fA-F]{8}|\|r|\|H[^|]*\|h|\|h/g;

const CHAT_TYPES: Record<number, string> = {
  [ChatType.SYSTEM]: "SYSTEM",
  [ChatType.SAY]: "SAY",
  [ChatType.PARTY]: "PARTY",
  [ChatType.RAID]: "RAID",
  [ChatType.GUILD]: "GUILD",
  [ChatType.OFFICER]: "OFFICER",
  [ChatType.YELL]: "YELL",
  [ChatType.WHISPER]: "WHISPER_FROM",
  [ChatType.WHISPER_INFORM]: "WHISPER_TO",
  [ChatType.EMOTE]: "EMOTE",
  [ChatType.CHANNEL]: "CHANNEL",
  [ChatType.RAID_LEADER]: "RAID_LEADER",
  [ChatType.RAID_WARNING]: "RAID_WARNING",
  [ChatType.PARTY_LEADER]: "PARTY_LEADER",
  [ChatType.ROLL]: "ROLL",
  [ChatType.MONSTER_SAY]: "MONSTER_SAY",
  [ChatType.MONSTER_PARTY]: "MONSTER_PARTY",
  [ChatType.MONSTER_YELL]: "MONSTER_YELL",
  [ChatType.MONSTER_WHISPER]: "MONSTER_WHISPER",
  [ChatType.MONSTER_EMOTE]: "MONSTER_EMOTE",
  [ChatType.RAID_BOSS_EMOTE]: "RAID_BOSS_EMOTE",
  [ChatType.RAID_BOSS_WHISPER]: "RAID_BOSS_WHISPER",
};

const ORIGIN_TYPES: Record<string, string> = {
  mail: "MAIL",
  notification: "NOTIFICATION",
  server: "SERVER_BROADCAST",
};

const MONSTER_EMOTES: readonly number[] = [
  ChatType.MONSTER_EMOTE,
  ChatType.RAID_BOSS_EMOTE,
];

const OBJECT_TYPES: Record<number, string> = {
  [ObjectType.UNIT]: "unit",
  [ObjectType.PLAYER]: "player",
  [ObjectType.GAMEOBJECT]: "gameobject",
};

export function resultJson(command: string, data: unknown): string {
  return JSON.stringify({
    command,
    data,
    error: null,
    events: [],
    kind: "result",
  });
}

export function eventsJson(command: string, events: ChatEvent[]): string {
  return JSON.stringify({
    command,
    data: null,
    error: null,
    events,
    kind: "events",
  });
}

export function chatEventObj(msg: ChatMessage): ChatEvent {
  const text = msg.message.replace(COLOR_PATTERN, "");
  const event: ChatEvent = {
    message: MONSTER_EMOTES.includes(msg.type)
      ? text.replaceAll("%s", msg.sender)
      : text,
    sender: msg.sender,
    type:
      (msg.origin && ORIGIN_TYPES[msg.origin]) ??
      CHAT_TYPES[msg.type] ??
      `TYPE_${msg.type}`,
  };
  if (msg.channel) event.channel = msg.channel;
  return event;
}

function guid(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function remotePoseObj(pose: RemotePose, now: number): Record<string, unknown> {
  const { position } = pose;
  return {
    ageMs: now - pose.receivedAt,
    extraFlags: pose.extraFlags ?? null,
    flags: pose.flags ?? null,
    invalid: pose.invalid ?? null,
    mapId: position.mapId,
    motion: pose.motion ?? null,
    moverTime: pose.moverTime ?? null,
    orientation: position.orientation,
    receivedAt: pose.receivedAt,
    source: pose.source,
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

function positionObj(row: NearbyRow): Record<string, unknown> {
  const { position, positionObservedAt } = row;
  if (!position) return {};
  return {
    mapId: position.mapId,
    orientation: position.orientation,
    positionAgeMs:
      positionObservedAt === null ? null : row.preparedAt - positionObservedAt,
    positionKind: row.positionKind,
    positionObservedAt,
    positionSource: row.positionSource,
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

function addKindFields(obj: Record<string, unknown>, row: NearbyRow): void {
  const { entity } = row;
  if (
    entity.objectType === ObjectType.UNIT ||
    entity.objectType === ObjectType.PLAYER
  ) {
    const unit = entity as UnitEntity;
    obj["level"] = unit.level;
    obj["health"] = unit.health;
    obj["maxHealth"] = unit.maxHealth;
    obj["target"] = guid(unit.target);
    obj["unitFlags"] = unit.unitFlags;
    obj["npcFlags"] = unit.npcFlags;
    obj["factionTemplate"] = unit.factionTemplate;
  }
  if (entity.objectType === ObjectType.GAMEOBJECT)
    obj["gameObjectType"] = (entity as GameObjectEntity).gameObjectType;
}
const MOVEMENT_ROOT_BIT = 0x00_00_08_00;

type UnitMovement = AreaState<"unitmotion">["units"][number];

function movementObj(movement: UnitMovement): Record<string, unknown> {
  const speeds: Record<string, { source: string; value: number }> = {};
  for (const [kind, reading] of Object.entries(movement.speeds))
    speeds[kind] = { source: reading.source, value: reading.value };
  return {
    flags: movement.flags,
    rooted: Math.floor(movement.flags / MOVEMENT_ROOT_BIT) % 2 === 1,
    serverControlled: movement.serverControlled,
    speeds,
  };
}

export function nearbyRowObj(
  row: NearbyRow,
  movements?: ReadonlyMap<string, UnitMovement>,
): Record<string, unknown> {
  const { entity } = row;
  const obj: Record<string, unknown> = {
    bearingRadians: row.bearingRadians,
    distance: rounded(row.distance),
    entry: entity.entry,
    guid: guid(entity.guid),
    horizontalDistance: rounded(row.horizontalDistance),
    name: entity.name,
    originSource: row.originSource,
    originUpdatedAt: row.originUpdatedAt,
    self: row.self,
    turnRadians: row.turnRadians,
    type: OBJECT_TYPES[entity.objectType] ?? "object",
  };
  addKindFields(obj, row);
  Object.assign(obj, positionObj(row));
  if (row.remotePose)
    obj["remotePose"] = remotePoseObj(row.remotePose, row.preparedAt);
  const movement = movements?.get(entity.guid.toString());
  if (movement) obj["movement"] = movementObj(movement);
  return obj;
}
