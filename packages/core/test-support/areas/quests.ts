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
