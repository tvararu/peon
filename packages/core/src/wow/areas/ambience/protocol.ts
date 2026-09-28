import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type UpdateWorldState = { id: number; value: number };
export type Weather = { state: number; intensity: number; abrupt: boolean };

export function parseUpdateWorldState(r: PacketReader): UpdateWorldState {
  const id = r.uint32LE() | 0;
  const value = r.uint32LE() | 0;
  return { id, value };
}

export function parseWeather(r: PacketReader): Weather {
  const state = r.uint32LE();
  const intensity = r.floatLE();
  const abrupt = r.uint8() !== 0;
  return { state, intensity, abrupt };
}

export function buildZoneUpdate(zoneId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(zoneId);
  return w.finish();
}
