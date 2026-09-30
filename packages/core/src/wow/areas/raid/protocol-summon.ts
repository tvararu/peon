import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type SummonRequest = {
  summoner: bigint;
  zoneId: number;
  timeoutMs: number;
};

export function parseSummonRequest(r: PacketReader): SummonRequest {
  const summoner = r.uint64LE();
  const zoneId = r.uint32LE();
  return { summoner, timeoutMs: r.uint32LE(), zoneId };
}

export function buildSummonResponse(
  summoner: bigint,
  accept: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(summoner);
  w.uint8(accept ? 1 : 0);
  return w.finish();
}
