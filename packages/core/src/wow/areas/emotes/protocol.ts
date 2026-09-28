import type { PacketReader } from "#wow/protocol/packet";

export type EmotePacket = { emote: number; guid: bigint };
export type TextEmotePacket = {
  guid: bigint;
  textEmote: number;
  emoteNum: number;
  target: string;
};

export function parseEmote(r: PacketReader): EmotePacket {
  const emote = r.uint32LE();
  const guid = r.uint64LE();
  return { emote, guid };
}

export function parseTextEmote(r: PacketReader): TextEmotePacket {
  const guid = r.uint64LE();
  const textEmote = r.uint32LE();
  const emoteNum = r.uint32LE();
  r.uint32LE();
  const target = r.cString();
  return { guid, textEmote, emoteNum, target };
}
