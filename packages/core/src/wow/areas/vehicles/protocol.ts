import {
  type MonsterMove,
  parseMonsterMoveBody,
} from "#wow/protocol/monster-move";
import type { PacketReader } from "#wow/protocol/packet";

export const NPC_FLAG_SPELLCLICK = 0x01_00_00_00;
export const NPC_FLAG_PLAYER_VEHICLE = 0x02_00_00_00;

export type MonsterMoveTransport = {
  guid: bigint;
  transportGuid: bigint;
  seat: number;
  move: MonsterMove;
};

export type PlayerVehicleData = { guid: bigint; vehicleId: number };

function signedSeat(raw: number): number {
  return raw > 127 ? raw - 256 : raw;
}

export function parseMonsterMoveTransport(
  r: PacketReader,
): MonsterMoveTransport {
  const guid = r.packedGuidBig();
  const transportGuid = r.packedGuidBig();
  const seat = signedSeat(r.uint8());
  return { guid, transportGuid, seat, move: parseMonsterMoveBody(r, guid) };
}

export function parsePlayerVehicleData(r: PacketReader): PlayerVehicleData {
  return { guid: r.packedGuidBig(), vehicleId: r.uint32LE() };
}
