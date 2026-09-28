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
