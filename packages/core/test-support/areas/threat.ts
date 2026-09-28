import type { ThreatWireEntry } from "#wow/areas/threat/protocol";
import { PacketWriter } from "#wow/protocol/packet";

function writeEntries(w: PacketWriter, entries: readonly ThreatWireEntry[]) {
  w.uint32LE(entries.length);
  for (const entry of entries) {
    w.packedGuidBig(entry.victim);
    w.uint32LE(entry.threat);
  }
}

export function threatHighestThreatUpdateBody(init: {
  unit: bigint;
  newVictim: bigint;
  entries: readonly ThreatWireEntry[];
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.unit);
  w.packedGuidBig(init.newVictim);
  writeEntries(w, init.entries);
  return w.finish();
}

export function threatThreatUpdateBody(init: {
  unit: bigint;
  entries: readonly ThreatWireEntry[];
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.unit);
  writeEntries(w, init.entries);
  return w.finish();
}

export function threatThreatRemoveBody(init: {
  unit: bigint;
  victim: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.unit);
  w.packedGuidBig(init.victim);
  return w.finish();
}

export function threatThreatClearBody(init: { unit: bigint }): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.unit);
  return w.finish();
}
