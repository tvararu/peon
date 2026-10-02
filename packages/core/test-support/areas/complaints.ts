import { PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ComplainRead = {
  type: number;
  guid: bigint;
  unk1: number;
  messageType: number;
  channelId: number;
  secondsAgo: number | undefined;
  description: string | undefined;
  remaining: number;
};

export function complaintsResultBody(code: number, extra?: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(code);
  if (extra !== undefined) w.uint8(extra);
  return w.finish();
}

export function readComplain(body: Uint8Array): ComplainRead {
  const r = new PacketReader(body);
  const type = r.uint8();
  const guid = r.uint64LE();
  const unk1 = r.uint32LE();
  const messageType = r.uint32LE();
  const channelId = r.uint32LE();
  if (type !== 1)
    return {
      channelId,
      description: undefined,
      guid,
      messageType,
      remaining: r.remaining,
      secondsAgo: undefined,
      type,
      unk1,
    };
  const secondsAgo = r.uint32LE();
  const description = r.cString();
  return {
    channelId,
    description,
    guid,
    messageType,
    remaining: r.remaining,
    secondsAgo,
    type,
    unk1,
  };
}
