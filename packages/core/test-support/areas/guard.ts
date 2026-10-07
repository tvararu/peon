import { PacketReader, PacketWriter } from "#wow/protocol/packet";

export type WorldTeleportRead = {
  time: number;
  map: number;
  x: number;
  y: number;
  z: number;
  orientation: number;
  remaining: number;
};

export function readWorldTeleport(body: Uint8Array): WorldTeleportRead {
  const r = new PacketReader(body);
  const time = r.uint32LE();
  const map = r.uint32LE();
  const x = r.floatLE();
  const y = r.floatLE();
  const z = r.floatLE();
  const orientation = r.floatLE();
  return { map, orientation, remaining: r.remaining, time, x, y, z };
}

export function guardReadyBody(code: number): Uint8Array {
  const w = new PacketWriter(1);
  w.uint8(code);
  return w.finish();
}

export function guardNotificationBody(text: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(text);
  return w.finish();
}

export function guardWardenBody(size: number): Uint8Array {
  return new Uint8Array(size).fill(0xa5);
}
