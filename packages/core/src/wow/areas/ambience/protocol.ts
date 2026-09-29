import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type UpdateWorldState = { id: number; value: number };
export type Weather = { state: number; intensity: number; abrupt: boolean };
export type TriggerCinematic = { sequenceId: number };
export type TriggerMovie = { movieId: number };

export function parseUpdateWorldState(r: PacketReader): UpdateWorldState {
  const id = r.int32LE();
  const value = r.int32LE();
  return { id, value };
}

export function parseWeather(r: PacketReader): Weather {
  const state = r.uint32LE();
  const intensity = r.floatLE();
  const abrupt = r.uint8() !== 0;
  return { state, intensity, abrupt };
}

export function parseTriggerCinematic(r: PacketReader): TriggerCinematic {
  return { sequenceId: r.uint32LE() };
}

export function parseTriggerMovie(r: PacketReader): TriggerMovie {
  return { movieId: r.uint32LE() };
}

export function buildCompleteCinematic(): Uint8Array {
  return new Uint8Array(0);
}

export function buildNextCinematicCamera(): Uint8Array {
  return new Uint8Array(0);
}

export function buildZoneUpdate(zoneId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(zoneId);
  return w.finish();
}
