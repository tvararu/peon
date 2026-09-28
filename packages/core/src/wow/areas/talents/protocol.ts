import type { PacketReader } from "#wow/protocol/packet";
import {
  readTalentRanks,
  readTalentSpec,
  type TalentRank,
  type TalentSpec,
} from "#wow/protocol/talent-spec";

export type PlayerTalentsInfo = {
  kind: "player";
  freePoints: number;
  specCount: number;
  activeSpec: number;
  specs: TalentSpec[];
};
export type PetTalentsInfo = {
  kind: "pet";
  freePoints: number;
  talents: TalentRank[];
};
export type TalentsInfo = PlayerTalentsInfo | PetTalentsInfo;

function readPlayer(r: PacketReader): PlayerTalentsInfo {
  const freePoints = r.uint32LE();
  const specCount = r.uint8();
  const activeSpec = r.uint8();
  const specs: TalentSpec[] = [];
  for (let i = 0; i < specCount; i++) specs.push(readTalentSpec(r));
  return { kind: "player", freePoints, specCount, activeSpec, specs };
}

function readPet(r: PacketReader): PetTalentsInfo {
  const freePoints = r.uint32LE();
  const talents = readTalentRanks(r);
  return { kind: "pet", freePoints, talents };
}

export function parseTalentsInfo(r: PacketReader): TalentsInfo {
  const type = r.uint8();
  if (type === 0) return readPlayer(r);
  if (type === 1) return readPet(r);
  throw new Error("unknown_talents_info_type");
}
