import { GameOpcode } from "#wow/protocol/opcodes";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type WorldTeleportTarget = {
  time: number;
  map: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
};

export type WardenRequest = { size: number };

export type ReadyForRedirect = { code: number; ok: boolean };

export function buildWorldTeleport(target: WorldTeleportTarget): Uint8Array {
  const w = new PacketWriter(24);
  w.uint32LE(target.time);
  w.uint32LE(target.map);
  w.floatLE(target.x);
  w.floatLE(target.y);
  w.floatLE(target.z);
  w.floatLE(target.orientation);
  return w.finish();
}

export function buildSetFactionCheat(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildPrepareForRedirect(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildWardenData(payload: Uint8Array): {
  opcode: number;
  body: Uint8Array;
} {
  const w = new PacketWriter(Math.max(payload.length, 1));
  w.rawBytes(payload);
  return { opcode: GameOpcode.CMSG_WARDEN_DATA, body: w.finish() };
}

export function parseWardenData(r: PacketReader): WardenRequest {
  return { size: r.remaining };
}

export function parseReadyForRedirect(r: PacketReader): ReadyForRedirect {
  const code = r.uint8();
  return { code, ok: code === 0 };
}

export function parseNotification(r: PacketReader): string {
  return r.cString();
}
