import { parseGameObjectQueryResponse } from "#wow/protocol/entity-queries";
import type { PacketReader } from "#wow/protocol/packet";

export type GameObjectTemplateRow = {
  entry: number;
  taxiPathId: number;
  moveSpeed: number;
  accelRate: number;
  mapId: number;
  pauseAtTime: number;
  startOpen: number;
};

const MO_TRANSPORT = 15;
const LIFT = 11;

function word(data: readonly number[], at: number): number {
  return data[at] ?? 0;
}

export function templateFromQueryBody(
  r: PacketReader,
): GameObjectTemplateRow | undefined {
  const result = parseGameObjectQueryResponse(r);
  if (result.gameObjectType === undefined || result.name === undefined)
    return undefined;
  if (result.gameObjectType !== MO_TRANSPORT && result.gameObjectType !== LIFT)
    return undefined;
  const data = result.data;
  if (result.gameObjectType === MO_TRANSPORT)
    return {
      entry: result.entry,
      taxiPathId: word(data, 0),
      moveSpeed: word(data, 1),
      accelRate: word(data, 2),
      mapId: word(data, 6),
      pauseAtTime: 0,
      startOpen: 0,
    };
  return {
    entry: result.entry,
    taxiPathId: 0,
    moveSpeed: 0,
    accelRate: 0,
    mapId: 0,
    pauseAtTime: word(data, 0),
    startOpen: word(data, 1),
  };
}

export function readGameObjectTemplate(
  row: GameObjectTemplateRow | undefined,
): GameObjectTemplateRow | undefined {
  return row;
}
