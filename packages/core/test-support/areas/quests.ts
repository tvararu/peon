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

export type QuestsNpcTextOption = {
  probability: number;
  text0: string;
  text1: string;
  language: number;
  emotes: readonly { delay: number; emote: number }[];
};

const NPC_TEXT_OPTIONS = 8;
const NPC_TEXT_EMOTES = 3;

export function questsNpcTextUpdateBody(
  textId: number,
  options?: readonly QuestsNpcTextOption[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(textId);
  for (let i = 0; i < NPC_TEXT_OPTIONS; i++) {
    const option = options?.[i];
    w.floatLE(option?.probability ?? 0);
    const text0 = options ? (option?.text0 ?? "") : "Greetings $N";
    const text1 = options ? (option?.text1 ?? "") : "Greetings $N";
    w.cString(text0 || text1);
    w.cString(text1 || text0);
    w.uint32LE(option?.language ?? 0);
    for (let j = 0; j < NPC_TEXT_EMOTES; j++) {
      w.uint32LE(option?.emotes[j]?.delay ?? 0);
      w.uint32LE(option?.emotes[j]?.emote ?? 0);
    }
  }
  return w.finish();
}

function signed(v: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setInt32(0, v, true);
  return buf;
}

export type QuestsGossipPoi = {
  flags: number;
  x: number;
  y: number;
  icon: number;
  importance: number;
  name: string;
};

export function questsGossipPoiBody(poi: QuestsGossipPoi): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(poi.flags);
  w.floatLE(poi.x);
  w.floatLE(poi.y);
  w.uint32LE(poi.icon);
  w.uint32LE(poi.importance);
  w.cString(poi.name);
  return w.finish();
}

export function questsQueryQuestsCompletedResponseBody(
  ids: readonly number[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(ids.length);
  for (const id of ids) w.uint32LE(id);
  return w.finish();
}

export function questsQuestPushResultBody(
  guid: bigint,
  result: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint8(result);
  return w.finish();
}

export function questsQuestConfirmAcceptBody(
  questId: number,
  title: string,
  guid: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(questId);
  w.cString(title);
  w.uint64LE(guid);
  return w.finish();
}

export type QuestsQuestDetails = {
  guid: bigint;
  divider: bigint;
  questId: number;
  title: string;
  flags?: number;
};

export function questsQuestgiverQuestDetailsBody(
  quest: QuestsQuestDetails,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(quest.guid);
  w.uint64LE(quest.divider);
  w.uint32LE(quest.questId);
  w.cString(quest.title);
  w.cString("Details");
  w.cString("Objectives");
  w.uint8(1);
  w.uint32LE(quest.flags ?? 0x88);
  w.uint32LE(0);
  w.uint8(0);
  for (let i = 0; i < 4; i++) w.uint32LE(0);
  w.uint32LE(0);
  w.floatLE(0);
  for (let i = 0; i < 6; i++) w.uint32LE(0);
  for (let i = 0; i < 15; i++) w.uint32LE(0);
  w.uint32LE(0);
  return w.finish();
}

export function questsQuestgiverRequestItemsBody(
  guid: bigint,
  questId: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint32LE(questId);
  w.cString("Title");
  w.cString("Request");
  for (let i = 0; i < 6; i++) w.uint32LE(0);
  w.uint32LE(0);
  for (let i = 0; i < 4; i++) w.uint32LE(0);
  return w.finish();
}

export function questsQuestgiverOfferRewardBody(
  guid: bigint,
  questId: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint32LE(questId);
  w.cString("Title");
  w.cString("Reward");
  w.uint8(0);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint32LE(0);
  const zeros = (count: number): void => {
    for (let i = 0; i < count; i++) w.uint32LE(0);
  };
  zeros(13);
  w.uint32LE(0);
  zeros(9);
  w.uint32LE(0);
  zeros(21);
  return w.finish();
}
