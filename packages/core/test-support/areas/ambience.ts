import { PacketWriter } from "#wow/protocol/packet";

export function ambienceUpdateWorldStateBody(init: {
  id: number;
  value: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.id >>> 0);
  w.uint32LE(init.value >>> 0);
  return w.finish();
}

export function ambienceWeatherBody(init: {
  state: number;
  intensity: number;
  abrupt: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.state);
  w.floatLE(init.intensity);
  w.uint8(init.abrupt ? 1 : 0);
  return w.finish();
}

export function ambienceInitWorldStatesBody(init: {
  mapId: number;
  zoneId: number;
  areaId: number;
  states: readonly { id: number; value: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.mapId);
  w.uint32LE(init.zoneId);
  w.uint32LE(init.areaId);
  w.uint16LE(init.states.length);
  for (const state of init.states) {
    w.uint32LE(state.id >>> 0);
    w.uint32LE(state.value >>> 0);
  }
  return w.finish();
}
export function ambienceTriggerCinematicBody(sequenceId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(sequenceId >>> 0);
  return w.finish();
}

export function ambienceTriggerMovieBody(movieId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(movieId >>> 0);
  return w.finish();
}

export function ambiencePlaySoundBody(soundKitId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(soundKitId);
  return w.finish();
}

export function ambiencePlayMusicBody(soundKitId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(soundKitId);
  return w.finish();
}

export function ambiencePlayObjectSoundBody(init: {
  soundKitId: number;
  source: bigint;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.soundKitId);
  w.uint64LE(init.source);
  return w.finish();
}

export function ambienceOverrideLightBody(init: {
  defaultId: number;
  overrideId: number;
  fadeMs: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.defaultId);
  w.uint32LE(init.overrideId);
  w.uint32LE(init.fadeMs);
  return w.finish();
}

export function ambienceSetPhaseShiftBody(mask: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(mask);
  return w.finish();
}
