import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const RAID_TARGET_REQUEST = 0xff;

export type RaidTargetUpdate =
  | { kind: "set"; who: bigint; icon: number; target: bigint }
  | { kind: "list"; entries: readonly { icon: number; target: bigint }[] };

export type MinimapPing = { guid: bigint; x: number; y: number };

export function parseRaidTargetUpdate(r: PacketReader): RaidTargetUpdate {
  if (r.uint8() === 0) {
    const who = r.uint64LE();
    const icon = r.uint8();
    return { icon, kind: "set", target: r.uint64LE(), who };
  }
  const entries: { icon: number; target: bigint }[] = [];
  while (r.remaining >= 9) {
    const icon = r.uint8();
    entries.push({ icon, target: r.uint64LE() });
  }
  return { entries, kind: "list" };
}

export function parseMinimapPing(r: PacketReader): MinimapPing {
  const guid = r.uint64LE();
  const x = r.floatLE();
  return { guid, x, y: r.floatLE() };
}

export function buildRaidTargetUpdate(icon: number, guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint8(icon);
  w.uint64LE(guid);
  return w.finish();
}

export function buildRaidTargetRequest(): Uint8Array {
  const w = new PacketWriter();
  w.uint8(RAID_TARGET_REQUEST);
  return w.finish();
}

export function buildMinimapPing(x: number, y: number): Uint8Array {
  const w = new PacketWriter();
  w.floatLE(x);
  w.floatLE(y);
  return w.finish();
}
