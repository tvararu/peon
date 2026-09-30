import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type UpdateWorldState = { id: number; value: number };
export type Weather = { state: number; intensity: number; abrupt: boolean };
export type TriggerCinematic = { sequenceId: number };
export type TriggerMovie = { movieId: number };
export type PlaySound = { soundKitId: number };
export type PlayObjectSound = { soundKitId: number; source: bigint };
export type OverrideLight = {
  defaultId: number;
  overrideId: number;
  fadeMs: number;
};
export type SetPhaseShift = { mask: number };

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

export function parsePlaySound(r: PacketReader): PlaySound {
  return { soundKitId: r.uint32LE() };
}

export function parsePlayMusic(r: PacketReader): PlaySound {
  return { soundKitId: r.uint32LE() };
}

export function parsePlayObjectSound(r: PacketReader): PlayObjectSound {
  const soundKitId = r.uint32LE();
  const source = r.uint64LE();
  return { soundKitId, source };
}

export function parseOverrideLight(r: PacketReader): OverrideLight {
  const defaultId = r.uint32LE();
  const overrideId = r.uint32LE();
  const fadeMs = r.uint32LE();
  return { defaultId, overrideId, fadeMs };
}

export function parseSetPhaseShift(r: PacketReader): SetPhaseShift {
  return { mask: r.uint32LE() };
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
