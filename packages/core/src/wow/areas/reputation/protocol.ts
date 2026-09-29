import type { PacketReader } from "#wow/protocol/packet";

export type FactionWireSlot = { flags: number; standing: number };
export type InitializeFactions = { entries: FactionWireSlot[] };
export type FactionStandingEntry = { repListId: number; standing: number };
export type SetFactionStanding = {
  increased: boolean;
  entries: FactionStandingEntry[];
};
export type SetFactionVisible = { repListId: number };

export function parseInitializeFactions(r: PacketReader): InitializeFactions {
  const count = r.uint32LE();
  const entries: FactionWireSlot[] = [];
  for (let i = 0; i < count; i++) {
    const flags = r.uint8();
    const standing = r.int32LE();
    entries.push({ flags, standing });
  }
  return { entries };
}

export function parseSetFactionStanding(r: PacketReader): SetFactionStanding {
  r.floatLE();
  const increased = r.uint8() !== 0;
  const count = r.uint32LE();
  if (r.remaining < count * 8)
    throw new Error(
      `SMSG_SET_FACTION_STANDING: ${count} entries need ${count * 8} bytes, ${r.remaining} left`,
    );
  const entries: FactionStandingEntry[] = [];
  for (let i = 0; i < count; i++) {
    const repListId = r.uint32LE();
    const standing = r.int32LE();
    entries.push({ repListId, standing });
  }
  return { increased, entries };
}

export function parseSetFactionVisible(r: PacketReader): SetFactionVisible {
  const repListId = r.uint32LE();
  return { repListId };
}

export type ForcedReaction = { factionId: number; rank: number };
export type SetForcedReactions = { reactions: ForcedReaction[] };

export function parseSetForcedReactions(r: PacketReader): SetForcedReactions {
  const count = r.uint32LE();
  if (r.remaining < count * 8)
    throw new Error(
      `SMSG_SET_FORCED_REACTIONS: ${count} entries need ${count * 8} bytes, ${r.remaining} left`,
    );
  const reactions: ForcedReaction[] = [];
  for (let i = 0; i < count; i++) {
    const factionId = r.uint32LE();
    const rank = r.uint32LE();
    reactions.push({ factionId, rank });
  }
  return { reactions };
}
