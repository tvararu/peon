import { PacketWriter } from "#wow/protocol/packet";

export function wintergraspEntryInviteBody(init: {
  battleId: number;
  zone: number;
  expiry: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.battleId);
  w.uint32LE(init.zone);
  w.uint32LE(init.expiry);
  return w.finish();
}

export function wintergraspQueueInviteBody(init: {
  battleId: number;
  warmup: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.battleId);
  w.uint8(init.warmup ? 1 : 0);
  return w.finish();
}

export function wintergraspQueueResponseBody(init: {
  battleId: number;
  zone: number;
  canQueue: boolean;
  full: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.battleId);
  w.uint32LE(init.zone);
  w.uint8(init.canQueue ? 1 : 0);
  w.uint8(init.full ? 0 : 1);
  w.uint8(1);
  return w.finish();
}

export function wintergraspEnteredBody(init: {
  battleId: number;
  afk: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.battleId);
  w.uint8(1);
  w.uint8(1);
  w.uint8(init.afk ? 1 : 0);
  return w.finish();
}

export function wintergraspEjectedBody(init: {
  battleId: number;
  reason: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.battleId);
  w.uint8(init.reason);
  w.uint8(2);
  w.uint8(0);
  return w.finish();
}

export function wintergraspBuildingDamageBody(init: {
  building: bigint;
  attacker: bigint;
  player: bigint;
  wireChange: number;
  spell: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.building);
  w.packedGuidBig(init.attacker);
  w.packedGuidBig(init.player);
  w.uint32LE(init.wireChange >>> 0);
  w.uint32LE(init.spell);
  return w.finish();
}
