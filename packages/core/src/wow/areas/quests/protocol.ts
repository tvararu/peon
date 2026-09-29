import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type GiverStatus = { guid: bigint; status: number };

export function parseQuestgiverStatusMultiple(r: PacketReader): GiverStatus[] {
  const count = r.uint32LE();
  const givers: GiverStatus[] = [];
  for (let i = 0; i < count; i++) {
    const guid = r.uint64LE();
    const status = r.uint8();
    givers.push({ guid, status });
  }
  return givers;
}

export function buildQuestgiverStatusQuery(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export const MAX_POI_QUERY_IDS = 25;

export type QuestPoiPoint = { x: number; y: number };
export type QuestPoi = {
  poiId: number;
  objectiveIndex: number;
  mapId: number;
  areaId: number;
  floorId: number;
  unk3: number;
  unk4: number;
  points: QuestPoiPoint[];
};
export type QuestPoiReply = { questId: number; pois: QuestPoi[] };

export function parseQuestPoiResponse(r: PacketReader): QuestPoiReply[] {
  const count = r.uint32LE();
  const replies: QuestPoiReply[] = [];
  for (let i = 0; i < count; i++) {
    const questId = r.uint32LE();
    const poiCount = r.uint32LE();
    const pois: QuestPoi[] = [];
    for (let p = 0; p < poiCount; p++) {
      const poiId = r.uint32LE();
      const objectiveIndex = r.int32LE();
      const mapId = r.uint32LE();
      const areaId = r.uint32LE();
      const floorId = r.uint32LE();
      const unk3 = r.uint32LE();
      const unk4 = r.uint32LE();
      const pointCount = r.uint32LE();
      const points: QuestPoiPoint[] = [];
      for (let q = 0; q < pointCount; q++)
        points.push({ x: r.int32LE(), y: r.int32LE() });
      pois.push({
        poiId,
        objectiveIndex,
        mapId,
        areaId,
        floorId,
        unk3,
        unk4,
        points,
      });
    }
    replies.push({ questId, pois });
  }
  return replies;
}

export function buildQuestPoiQuery(ids: readonly number[]): Uint8Array {
  const unique: number[] = [];
  const seen: Record<number, true> = {};
  for (const id of ids)
    if (!seen[id]) {
      seen[id] = true;
      unique.push(id);
    }
  if (unique.length > MAX_POI_QUERY_IDS)
    throw new RangeError(
      `quest POI query holds at most ${MAX_POI_QUERY_IDS} quest ids`,
    );
  const w = new PacketWriter();
  w.uint32LE(unique.length);
  for (const id of unique) w.uint32LE(id);
  return w.finish();
}

export type NpcTextEmote = { delay: number; emote: number };
export type NpcTextOption = {
  probability: number;
  text0: string;
  text1: string;
  language: number;
  emotes: NpcTextEmote[];
};
export type NpcText = { textId: number; options: NpcTextOption[] };

export type GossipPoi = {
  flags: number;
  x: number;
  y: number;
  icon: number;
  importance: number;
  name: string;
};

const NPC_TEXT_OPTIONS = 8;
const NPC_TEXT_EMOTES = 3;

function parseNpcTextOption(r: PacketReader): NpcTextOption {
  const probability = r.floatLE();
  const text0 = r.cString();
  const text1 = r.cString();
  const language = r.uint32LE();
  const emotes: NpcTextEmote[] = [];
  for (let i = 0; i < NPC_TEXT_EMOTES; i++) {
    const delay = r.uint32LE();
    const emote = r.uint32LE();
    emotes.push({ delay, emote });
  }
  return { probability, text0, text1, language, emotes };
}

export function parseNpcTextUpdate(r: PacketReader): NpcText {
  const textId = r.uint32LE();
  const options: NpcTextOption[] = [];
  for (let i = 0; i < NPC_TEXT_OPTIONS; i++)
    options.push(parseNpcTextOption(r));
  return { textId, options };
}

export function parseGossipPoi(r: PacketReader): GossipPoi {
  const flags = r.uint32LE();
  const x = r.floatLE();
  const y = r.floatLE();
  const icon = r.uint32LE();
  const importance = r.uint32LE();
  const name = r.cString();
  return { flags, x, y, icon, importance, name };
}

export function buildNpcTextQuery(textId: number, guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(textId);
  w.uint64LE(guid);
  return w.finish();
}

export const QUEST_LOG_SIZE = 25;

export function parseQuestsCompleted(r: PacketReader): Set<number> {
  const count = r.uint32LE();
  const ids = new Set<number>();
  for (let i = 0; i < count; i++) ids.add(r.uint32LE());
  return ids;
}

export function buildQuestgiverHello(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

function isLogSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < QUEST_LOG_SIZE;
}

export function buildQuestLogSwapQuest(
  a: number,
  b: number,
): Uint8Array | undefined {
  if (a === b || !isLogSlot(a) || !isLogSlot(b)) return undefined;
  const w = new PacketWriter();
  w.uint8(a);
  w.uint8(b);
  return w.finish();
}

export const QuestShareResult = {
  SHARING_QUEST: 0,
  CANT_TAKE_QUEST: 1,
  ACCEPT_QUEST: 2,
  DECLINE_QUEST: 3,
  BUSY: 4,
  LOG_FULL: 5,
  HAVE_QUEST: 6,
  FINISH_QUEST: 7,
  CANT_BE_SHARED_TODAY: 8,
  SHARING_TIMER_EXPIRED: 9,
  NOT_IN_PARTY: 10,
} as const;

export type QuestPushResult = { guid: bigint; result: number };

export function parseQuestPushResult(r: PacketReader): QuestPushResult {
  const guid = r.uint64LE();
  const result = r.uint8();
  return { guid, result };
}

export function buildQuestPushResult(
  guid: bigint,
  questId: number,
  result: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint32LE(questId);
  w.uint8(result);
  return w.finish();
}

export function buildPushQuestToParty(questId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(questId);
  return w.finish();
}
