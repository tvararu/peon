import type { PacketReader } from "#wow/protocol/packet";

export type WorldState = { state: number; value: number };
export type InitWorldStates = {
  mapId: number;
  zoneId: number;
  areaId: number;
  states: WorldState[];
};

export function parseInitWorldStates(r: PacketReader): InitWorldStates {
  const mapId = r.uint32LE();
  const zoneId = r.uint32LE();
  const areaId = r.uint32LE();
  const count = r.uint16LE();
  const states: WorldState[] = [];
  for (let i = 0; i < count; i++)
    states.push({ state: r.uint32LE(), value: r.uint32LE() });
  return { mapId, zoneId, areaId, states };
}
