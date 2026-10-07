import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ReferFailure = {
  error: number;
  reason: string;
  name: string | undefined;
};

const NOT_IN_GROUP = 9;

const REFER_ERRORS: Readonly<Record<number, string>> = {
  1: "not_referred_by",
  2: "target_too_high",
  3: "insufficient_grantable_levels",
  4: "too_far",
  5: "different_faction",
  6: "not_now",
  7: "grant_level_max",
  8: "no_target",
  9: "not_in_group",
  10: "summon_level_max",
  11: "summon_cooldown",
  12: "insufficient_expansion",
  13: "summon_offline",
};

function packedGuidBody(guid: bigint): Uint8Array {
  const w = new PacketWriter(9);
  w.packedGuidBig(guid);
  return w.finish();
}

export function buildGrantLevel(guid: bigint): Uint8Array {
  return packedGuidBody(guid);
}

export function buildAcceptLevelGrant(guid: bigint): Uint8Array {
  return packedGuidBody(guid);
}

export function parseReferAFriendFailure(r: PacketReader): ReferFailure {
  const error = r.uint32LE();
  return {
    error,
    reason: REFER_ERRORS[error] ?? `error_${error}`,
    name: error === NOT_IN_GROUP ? r.cString() : undefined,
  };
}

export function parseProposeLevelGrant(r: PacketReader): bigint {
  return r.packedGuidBig();
}
