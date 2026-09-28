import { PacketWriter } from "#wow/protocol/packet";

export function emotesEmoteBody(init: {
  emote: number;
  guid: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.emote);
  w.uint64LE(init.guid);
  return w.finish();
}

export function emotesTextEmoteBody(init: {
  guid: bigint;
  textEmote: number;
  emoteNum: number;
  name: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint32LE(init.textEmote);
  w.uint32LE(init.emoteNum);
  w.uint32LE(init.name.length);
  if (init.name.length > 1) w.cString(init.name);
  else w.uint8(0);
  return w.finish();
}
