import { PacketWriter } from "#wow/protocol/packet";

export function buildGetCalendar(): Uint8Array {
  return new Uint8Array();
}

export function buildGetEvent(eventId: bigint): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(eventId);
  return writer.finish();
}

export function buildGetNumPending(): Uint8Array {
  return new Uint8Array();
}
