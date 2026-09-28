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

function signed(v: number): number {
  return v >= 0x80_00_00_00 ? v - 0x1_00_00_00_00 : v;
}

export function parseQuestPoiResponse(r: PacketReader): QuestPoiReply[] {
  const count = r.uint32LE();
  const replies: QuestPoiReply[] = [];
  for (let i = 0; i < count; i++) {
    const questId = r.uint32LE();
    const poiCount = r.uint32LE();
    const pois: QuestPoi[] = [];
    for (let p = 0; p < poiCount; p++) {
      const poiId = r.uint32LE();
      const objectiveIndex = signed(r.uint32LE());
      const mapId = r.uint32LE();
      const areaId = r.uint32LE();
      const floorId = r.uint32LE();
      const unk3 = r.uint32LE();
      const unk4 = r.uint32LE();
      const pointCount = r.uint32LE();
      const points: QuestPoiPoint[] = [];
      for (let q = 0; q < pointCount; q++)
        points.push({ x: signed(r.uint32LE()), y: signed(r.uint32LE()) });
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
