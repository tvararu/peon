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
