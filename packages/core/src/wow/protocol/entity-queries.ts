import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export function buildCreatureQuery(entry: number, guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  w.uint64LE(guid);
  return w.finish();
}

export type CreatureDetails = {
  subName: string;
  creatureType: number;
  family: number;
  rank: number;
};

export type CreatureQueryResult = {
  entry: number;
  name: string | undefined;
  details: CreatureDetails | undefined;
};

const DETAIL_BYTES = 16;

export function parseCreatureQueryResponse(
  r: PacketReader,
): CreatureQueryResult {
  const raw = r.uint32LE();
  const masked = raw & 0x80_00_00_00;
  const entry = raw & 0x7f_ff_ff_ff;
  if (masked) return { entry, name: undefined, details: undefined };
  const name = r.cString();
  for (let i = 0; i < 3; i++) r.cString();
  const subName = r.cString();
  r.cString();
  if (r.remaining < DETAIL_BYTES) return { entry, name, details: undefined };
  r.uint32LE();
  const creatureType = r.uint32LE();
  const family = r.uint32LE();
  const rank = r.uint32LE();
  return { entry, name, details: { subName, creatureType, family, rank } };
}

export function buildGameObjectQuery(entry: number, guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  w.uint64LE(guid);
  return w.finish();
}

export type GameObjectQueryResult = {
  entry: number;
  name: string | undefined;
  gameObjectType: number | undefined;
};

export function parseGameObjectQueryResponse(
  r: PacketReader,
): GameObjectQueryResult {
  const raw = r.uint32LE();
  const masked = raw & 0x80_00_00_00;
  const entry = raw & 0x7f_ff_ff_ff;
  if (masked) return { entry, name: undefined, gameObjectType: undefined };
  const gameObjectType = r.uint32LE();
  r.uint32LE();
  const name = r.cString();
  return { entry, name, gameObjectType };
}
