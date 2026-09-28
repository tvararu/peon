import { PacketWriter } from "#wow/protocol/packet";

export type QuestsGiverStatus = { guid: bigint; status: number };

export function questsQuestgiverStatusMultipleBody(
  givers: readonly QuestsGiverStatus[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(givers.length);
  for (const giver of givers) {
    w.uint64LE(giver.guid);
    w.uint8(giver.status);
  }
  return w.finish();
}

export function questsQuestgiverStatusBody(
  giver: QuestsGiverStatus,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(giver.guid);
  w.uint8(giver.status);
  return w.finish();
}

export type QuestsPoiPoint = { x: number; y: number };
export type QuestsPoiEntry = {
  poiId: number;
  objectiveIndex: number;
  mapId: number;
  areaId: number;
  floorId: number;
  unk3: number;
  unk4: number;
  points: readonly QuestsPoiPoint[];
};
export type QuestsPoiReply = {
  questId: number;
  pois: readonly QuestsPoiEntry[];
};

export function questsQuestPoiQueryResponseBody(
  replies: readonly QuestsPoiReply[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(replies.length);
  for (const reply of replies) {
    w.uint32LE(reply.questId);
    w.uint32LE(reply.pois.length);
    for (const poi of reply.pois) {
      w.uint32LE(poi.poiId);
      w.rawBytes(signed(poi.objectiveIndex));
      w.uint32LE(poi.mapId);
      w.uint32LE(poi.areaId);
      w.uint32LE(poi.floorId);
      w.uint32LE(poi.unk3);
      w.uint32LE(poi.unk4);
      w.uint32LE(poi.points.length);
      for (const point of poi.points) {
        w.rawBytes(signed(point.x));
        w.rawBytes(signed(point.y));
      }
    }
  }
  return w.finish();
}

function signed(v: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setInt32(0, v, true);
  return buf;
}
