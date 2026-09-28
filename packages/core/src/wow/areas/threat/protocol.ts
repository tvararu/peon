import type { PacketReader } from "#wow/protocol/packet";

export type ThreatWireEntry = { victim: bigint; threat: number };
export type ThreatUpdate = {
  unit: bigint;
  newVictim: bigint | undefined;
  entries: ThreatWireEntry[];
};
export type ThreatRemove = { unit: bigint; victim: bigint };
export type ThreatClear = { unit: bigint };

export function parseThreatUpdate(
  r: PacketReader,
  options: { highest: boolean },
): ThreatUpdate {
  const unit = r.packedGuidBig();
  const newVictim = options.highest ? r.packedGuidBig() : undefined;
  const count = r.uint32LE();
  const entries: ThreatWireEntry[] = [];
  for (let i = 0; i < count; i++) {
    const victim = r.packedGuidBig();
    const threat = r.uint32LE();
    entries.push({ victim, threat });
  }
  return { unit, newVictim, entries };
}

export function parseThreatRemove(r: PacketReader): ThreatRemove {
  const unit = r.packedGuidBig();
  const victim = r.packedGuidBig();
  return { unit, victim };
}

export function parseThreatClear(r: PacketReader): ThreatClear {
  const unit = r.packedGuidBig();
  return { unit };
}
