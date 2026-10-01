import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

const FLAG_CHARACTER = 0x01;
const FLAG_COMMENT = 0x02;
const FLAG_LEADER = 0x04;
const FLAG_GROUP_GUID = 0x08;
const FLAG_ROLES = 0x10;
const FLAG_AREA = 0x20;
const FLAG_STATUS = 0x40;
const FLAG_BOUND = 0x80;

export type LfgListCharacter = {
  level: number;
  classId: number;
  raceId: number;
  talents: readonly [number, number, number];
  armor: number;
  spellDamage: number;
  spellHeal: number;
  critMelee: number;
  critRanged: number;
  critSpell: number;
  mp5: number;
  mp5Combat: number;
  attackPower: number;
  agility: number;
  health: number;
  mana: number;
  online: boolean;
  avgItemLevel: number;
  defense: number;
  dodge: number;
  block: number;
  parry: number;
  haste: number;
  expertise: number;
};

export type LfgListInstance = { guid: bigint; encounterMask: number };

export type LfgListGroup = {
  guid: bigint;
  flags: number;
  comment: string;
  instance: LfgListInstance | undefined;
};

export type LfgListPlayer = {
  guid: bigint;
  flags: number;
  character: LfgListCharacter | undefined;
  comment: string;
  leader: boolean;
  groupGuid: bigint | undefined;
  roles: number | undefined;
  area: number | undefined;
  status: number | undefined;
  instance: LfgListInstance | undefined;
};

export type LfgList = {
  type: number;
  dungeon: number;
  difference: boolean;
  deleted: readonly bigint[];
  groups: readonly LfgListGroup[];
  players: readonly LfgListPlayer[];
};

function readInstance(r: PacketReader, flags: number) {
  if ((flags & FLAG_BOUND) === 0) return;
  return { guid: r.uint64LE(), encounterMask: r.uint32LE() };
}

function readCharacter(r: PacketReader): LfgListCharacter {
  const level = r.uint8();
  const classId = r.uint8();
  const raceId = r.uint8();
  const talents: [number, number, number] = [r.uint8(), r.uint8(), r.uint8()];
  return {
    level,
    classId,
    raceId,
    talents,
    armor: r.uint32LE(),
    spellDamage: r.uint32LE(),
    spellHeal: r.uint32LE(),
    critMelee: r.uint32LE(),
    critRanged: r.uint32LE(),
    critSpell: r.uint32LE(),
    mp5: r.floatLE(),
    mp5Combat: r.floatLE(),
    attackPower: r.uint32LE(),
    agility: r.uint32LE(),
    health: r.uint32LE(),
    mana: r.uint32LE(),
    online: r.uint32LE() !== 0,
    avgItemLevel: r.floatLE(),
    defense: r.uint32LE(),
    dodge: r.uint32LE(),
    block: r.uint32LE(),
    parry: r.uint32LE(),
    haste: r.uint32LE(),
    expertise: r.uint32LE(),
  };
}

function readGroup(r: PacketReader): LfgListGroup {
  const guid = r.uint64LE();
  const flags = r.uint32LE();
  const comment = (flags & FLAG_COMMENT) === 0 ? "" : r.cString();
  if ((flags & FLAG_ROLES) !== 0) r.skip(3);
  return { guid, flags, comment, instance: readInstance(r, flags) };
}

function readPlayer(r: PacketReader): LfgListPlayer {
  const guid = r.uint64LE();
  const flags = r.uint32LE();
  const character =
    (flags & FLAG_CHARACTER) === 0 ? undefined : readCharacter(r);
  const comment = (flags & FLAG_COMMENT) === 0 ? "" : r.cString();
  const leader = (flags & FLAG_LEADER) !== 0;
  if (leader) r.uint8();
  const groupGuid = (flags & FLAG_GROUP_GUID) === 0 ? undefined : r.uint64LE();
  const roles = (flags & FLAG_ROLES) === 0 ? undefined : r.uint8();
  const area = (flags & FLAG_AREA) === 0 ? undefined : r.uint32LE();
  const status = (flags & FLAG_STATUS) === 0 ? undefined : r.uint8();
  return {
    guid,
    flags,
    character,
    comment,
    leader,
    groupGuid,
    roles,
    area,
    status,
    instance: readInstance(r, flags),
  };
}

export function parseLfgList(r: PacketReader): LfgList {
  const type = r.uint32LE();
  const dungeon = r.uint32LE();
  const difference = r.uint8() !== 0;
  const deleted: bigint[] = [];
  if (difference) {
    const deletedCount = r.uint32LE();
    for (let i = 0; i < deletedCount; i++) deleted.push(r.uint64LE());
  }
  const groupCount = r.uint32LE();
  r.uint32LE();
  const groups: LfgListGroup[] = [];
  for (let i = 0; i < groupCount; i++) groups.push(readGroup(r));
  const playerCount = r.uint32LE();
  r.uint32LE();
  const players: LfgListPlayer[] = [];
  for (let i = 0; i < playerCount; i++) players.push(readPlayer(r));
  return { type, dungeon, difference, deleted, groups, players };
}

export function buildSearchJoin(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  return w.finish();
}

export function buildSearchLeave(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  return w.finish();
}
