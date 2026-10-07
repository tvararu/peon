import { PacketReader, PacketWriter } from "#wow/protocol/packet";

export function referralFailureBody(error: number, name?: string): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(error);
  if (name !== undefined) w.cString(name);
  return w.finish();
}

export function referralProposeBody(guid: bigint): Uint8Array {
  const w = new PacketWriter(9);
  w.packedGuidBig(guid);
  return w.finish();
}

export function readReferralGuid(body: Uint8Array): {
  guid: bigint;
  remaining: number;
} {
  const r = new PacketReader(body);
  const guid = r.packedGuidBig();
  return { guid, remaining: r.remaining };
}
