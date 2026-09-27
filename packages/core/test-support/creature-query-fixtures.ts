import { PacketWriter } from "#wow/protocol/packet";

export type CreatureAnswer = {
  entry: number;
  name: string;
  subName: string;
  creatureType: number;
  family: number;
  rank: number;
};

const TAIL_WORDS = 15;

export function creatureQueryResponse(answer: CreatureAnswer): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(answer.entry);
  w.cString(answer.name);
  for (let i = 0; i < 3; i++) w.cString("");
  w.cString(answer.subName);
  w.cString("");
  w.uint32LE(0);
  w.uint32LE(answer.creatureType);
  w.uint32LE(answer.family);
  w.uint32LE(answer.rank);
  for (let i = 0; i < TAIL_WORDS; i++) w.uint32LE(0);
  w.uint8(0);
  return w.finish();
}
