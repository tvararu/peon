import {
  type MonsterMove,
  parseMonsterMoveBody,
} from "#wow/protocol/monster-move";
import {
  buildMoveMessage,
  type MovementInfo,
  writeMovementInfo,
} from "#wow/protocol/movement";
import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const NPC_FLAG_SPELLCLICK = 0x01_00_00_00;

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

export function buildSpellClick(guid: bigint): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(guid);
  return writer.finish();
}

export function buildRequestVehicleSwitchSeat(
  guid: bigint,
  seat: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.packedGuidBig(guid);
  writer.uint8(seat & 0xff);
  return writer.finish();
}

export function buildPlayerVehicleEnter(guid: bigint): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(guid);
  return writer.finish();
}

export function buildEjectPassenger(guid: bigint): Uint8Array {
  const writer = new PacketWriter();
  writer.uint64LE(guid);
  return writer.finish();
}

export function buildDismissControlledVehicle(
  vehicle: bigint,
  info: MovementInfo,
): Uint8Array {
  return buildMoveMessage(vehicle, info);
}

export function buildChangeSeatsOnControlledVehicle(
  vehicle: bigint,
  info: MovementInfo,
  accessory: bigint,
  seat: number,
): Uint8Array {
  const writer = new PacketWriter();
  writer.packedGuidBig(vehicle);
  writeMovementInfo(writer, info);
  writer.packedGuidBig(accessory);
  writer.uint8(seat & 0xff);
  return writer.finish();
}
