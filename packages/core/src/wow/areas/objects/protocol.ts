import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type AreaTriggerMessage = { text: string };

export function buildAreaTrigger(triggerId: number): Uint8Array {
  const w = new PacketWriter(4);
  w.uint32LE(triggerId);
  return w.finish();
}

export function parseAreaTriggerMessage(r: PacketReader): AreaTriggerMessage {
  r.uint32LE();
  const text = r.cString();
  return { text };
}

export function buildGameObjUse(guid: bigint): Uint8Array {
  const w = new PacketWriter(8);
  w.uint64LE(guid);
  return w.finish();
}

export function buildGameObjReportUse(guid: bigint): Uint8Array {
  const w = new PacketWriter(8);
  w.uint64LE(guid);
  return w.finish();
}
