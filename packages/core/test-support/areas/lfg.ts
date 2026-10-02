import { PacketWriter } from "#wow/protocol/packet";

type UpdateData = {
  queued?: boolean;
  join?: boolean;
  dungeons: readonly number[];
  comment?: string;
};

type UpdateInit = { updateType: number; data?: UpdateData };

export function lfgUpdatePlayerBody(init: UpdateInit): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.updateType);
  w.uint8(init.data ? 1 : 0);
  if (init.data) {
    w.uint8(init.data.queued ? 1 : 0);
    w.uint8(0);
    w.uint8(0);
    w.uint8(init.data.dungeons.length);
    for (const entry of init.data.dungeons) w.uint32LE(entry);
    w.cString(init.data.comment ?? "");
  }
  return w.finish();
}

export function lfgUpdatePartyBody(init: UpdateInit): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.updateType);
  w.uint8(init.data ? 1 : 0);
  if (init.data) {
    w.uint8(init.data.join ? 1 : 0);
    w.uint8(init.data.queued ? 1 : 0);
    for (let i = 0; i < 5; i++) w.uint8(0);
    w.uint8(init.data.dungeons.length);
    for (const entry of init.data.dungeons) w.uint32LE(entry);
    w.cString(init.data.comment ?? "");
  }
  return w.finish();
}

export type LfgLockInit = { entry: number; status: number };

export type LfgRandomInit = {
  entry: number;
  done?: boolean;
  money?: number;
  xp?: number;
  items?: readonly { itemId: number; displayId: number; count: number }[];
};

function lockBlock(w: PacketWriter, locks: readonly LfgLockInit[]): void {
  w.uint32LE(locks.length);
  for (const lock of locks) {
    w.uint32LE(lock.entry);
    w.uint32LE(lock.status);
  }
}

export function lfgPlayerInfoBody(init: {
  random: readonly LfgRandomInit[];
  locks: readonly LfgLockInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.random.length);
  for (const dungeon of init.random) {
    w.uint32LE(dungeon.entry);
    w.uint8(dungeon.done ? 1 : 0);
    w.uint32LE(dungeon.money ?? 0);
    w.uint32LE(dungeon.xp ?? 0);
    w.uint32LE(0);
    w.uint32LE(0);
    const items = dungeon.items ?? [];
    w.uint8(items.length);
    for (const item of items) {
      w.uint32LE(item.itemId);
      w.uint32LE(item.displayId);
      w.uint32LE(item.count);
    }
  }
  lockBlock(w, init.locks);
  return w.finish();
}

export function lfgPartyInfoBody(
  players: readonly { guid: bigint; locks: readonly LfgLockInit[] }[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(players.length);
  for (const player of players) {
    w.uint64LE(player.guid);
    lockBlock(w, player.locks);
  }
  return w.finish();
}

export function lfgUpdateSearchBody(on: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(on ? 1 : 0);
  return w.finish();
}

export function lfgJoinResultBody(init: {
  result: number;
  state?: number;
  partyLocks?: readonly { guid: bigint; locks: readonly LfgLockInit[] }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.result);
  w.uint32LE(init.state ?? 0);
  const locks = init.partyLocks ?? [];
  if (locks.length > 0) {
    w.uint8(locks.length);
    for (const player of locks) {
      w.uint64LE(player.guid);
      lockBlock(w, player.locks);
    }
  }
  return w.finish();
}

export type LfgQueueStatusInit = {
  dungeon: number;
  avgWait?: number;
  wait?: number;
  waitTank?: number;
  waitHealer?: number;
  waitDps?: number;
  tanks?: number;
  healers?: number;
  dps?: number;
  queuedTime?: number;
};

export function lfgQueueStatusBody(init: LfgQueueStatusInit): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.dungeon);
  w.uint32LE(init.avgWait ?? 0);
  w.uint32LE(init.wait ?? 0);
  w.uint32LE(init.waitTank ?? 0);
  w.uint32LE(init.waitHealer ?? 0);
  w.uint32LE(init.waitDps ?? 0);
  w.uint8(init.tanks ?? 0);
  w.uint8(init.healers ?? 0);
  w.uint8(init.dps ?? 0);
  w.uint32LE(init.queuedTime ?? 0);
  return w.finish();
}

export function lfgRoleCheckUpdateBody(init: {
  state: number;
  dungeons: readonly number[];
  members: readonly {
    guid: bigint;
    roles: number;
    level?: number;
  }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.state);
  w.uint8(init.state === 2 ? 1 : 0);
  w.uint8(init.dungeons.length);
  for (const entry of init.dungeons) w.uint32LE(entry);
  w.uint8(init.members.length);
  for (const member of init.members) {
    w.uint64LE(member.guid);
    w.uint8(member.roles > 0 ? 1 : 0);
    w.uint32LE(member.roles);
    w.uint8(member.level ?? 0);
  }
  return w.finish();
}

export function lfgRoleChosenBody(init: {
  guid: bigint;
  roles: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint8(init.roles > 0 ? 1 : 0);
  w.uint32LE(init.roles);
  return w.finish();
}

export type LfgProposalPlayerInit = {
  role: number;
  self?: boolean;
  inDungeon?: boolean;
  sameGroup?: boolean;
  answered?: boolean;
  accepted?: boolean;
};

export function lfgProposalBody(init: {
  dungeon: number;
  state: number;
  id: number;
  encounters?: number;
  silent?: boolean;
  players: readonly LfgProposalPlayerInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.dungeon);
  w.uint8(init.state);
  w.uint32LE(init.id);
  w.uint32LE(init.encounters ?? 0);
  w.uint8(init.silent ? 1 : 0);
  w.uint8(init.players.length);
  for (const player of init.players) {
    w.uint32LE(player.role);
    w.uint8(player.self ? 1 : 0);
    w.uint8(player.inDungeon ? 1 : 0);
    w.uint8(player.sameGroup ? 1 : 0);
    w.uint8(player.answered ? 1 : 0);
    w.uint8(player.accepted ? 1 : 0);
  }
  return w.finish();
}

export function lfgBootBody(init: {
  inProgress: boolean;
  didVote?: boolean;
  agree?: boolean;
  victim: bigint;
  votes?: number;
  agrees?: number;
  timeLeft: number;
  needed?: number;
  reason: string;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.inProgress ? 1 : 0);
  w.uint8(init.didVote ? 1 : 0);
  w.uint8(init.agree ? 1 : 0);
  w.uint64LE(init.victim);
  w.uint32LE(init.votes ?? 0);
  w.uint32LE(init.agrees ?? 0);
  w.uint32LE(init.timeLeft);
  w.uint32LE(init.needed ?? 3);
  w.cString(init.reason);
  return w.finish();
}

export function lfgRewardBody(init: {
  randomDungeon: number;
  dungeon: number;
  done?: boolean;
  money: number;
  xp: number;
  items: readonly { itemId: number; displayId: number; count: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.randomDungeon);
  w.uint32LE(init.dungeon);
  w.uint8(init.done ? 1 : 0);
  w.uint32LE(1);
  w.uint32LE(init.money);
  w.uint32LE(init.xp);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint8(init.items.length);
  for (const item of init.items) {
    w.uint32LE(item.itemId);
    w.uint32LE(item.displayId);
    w.uint32LE(item.count);
  }
  return w.finish();
}

export function lfgTeleportDeniedBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(code);
  return w.finish();
}

export function lfgOfferContinueBody(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry);
  return w.finish();
}

export type LfgListCharacterInit = {
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

export type LfgListGroupInit = {
  guid: bigint;
  comment: string;
  instanceGuid: bigint;
  encounterMask: number;
};

export type LfgListPlayerInit = {
  guid: bigint;
  flags: number;
  character?: LfgListCharacterInit;
  comment?: string;
  groupGuid?: bigint;
  roles?: number;
  area?: number;
  status?: number;
  instanceGuid?: bigint;
  encounterMask?: number;
};

const LIST_FLAG = {
  area: 0x20,
  bound: 0x80,
  character: 0x01,
  comment: 0x02,
  groupGuid: 0x08,
  leader: 0x04,
  roles: 0x10,
  status: 0x40,
} as const;

function listGroup(w: PacketWriter, group: LfgListGroupInit): void {
  w.uint64LE(group.guid);
  w.uint32LE(LIST_FLAG.comment | LIST_FLAG.roles | LIST_FLAG.bound);
  w.cString(group.comment);
  for (let i = 0; i < 3; i++) w.uint8(0);
  w.uint64LE(group.instanceGuid);
  w.uint32LE(group.encounterMask);
}

function listCharacter(w: PacketWriter, c: LfgListCharacterInit): void {
  w.uint8(c.level);
  w.uint8(c.classId);
  w.uint8(c.raceId);
  for (const points of c.talents) w.uint8(points);
  w.uint32LE(c.armor);
  w.uint32LE(c.spellDamage);
  w.uint32LE(c.spellHeal);
  w.uint32LE(c.critMelee);
  w.uint32LE(c.critRanged);
  w.uint32LE(c.critSpell);
  w.floatLE(c.mp5);
  w.floatLE(c.mp5Combat);
  w.uint32LE(c.attackPower);
  w.uint32LE(c.agility);
  w.uint32LE(c.health);
  w.uint32LE(c.mana);
  w.uint32LE(c.online ? 1 : 0);
  w.floatLE(c.avgItemLevel);
  w.uint32LE(c.defense);
  w.uint32LE(c.dodge);
  w.uint32LE(c.block);
  w.uint32LE(c.parry);
  w.uint32LE(c.haste);
  w.uint32LE(c.expertise);
}

function listPlayer(w: PacketWriter, p: LfgListPlayerInit): void {
  w.uint64LE(p.guid);
  w.uint32LE(p.flags);
  if (p.flags & LIST_FLAG.character && p.character)
    listCharacter(w, p.character);
  if (p.flags & LIST_FLAG.comment) w.cString(p.comment ?? "");
  if (p.flags & LIST_FLAG.leader) w.uint8(1);
  if (p.flags & LIST_FLAG.groupGuid) w.uint64LE(p.groupGuid ?? 0n);
  if (p.flags & LIST_FLAG.roles) w.uint8(p.roles ?? 0);
  listPlayerTail(w, p);
}

function listPlayerTail(w: PacketWriter, p: LfgListPlayerInit): void {
  if (p.flags & LIST_FLAG.area) w.uint32LE(p.area ?? 0);
  if (p.flags & LIST_FLAG.status) w.uint8(p.status ?? 0);
  if (p.flags & LIST_FLAG.bound) {
    w.uint64LE(p.instanceGuid ?? 0n);
    w.uint32LE(p.encounterMask ?? 0);
  }
}

export function lfgListBody(init: {
  dungeon: number;
  deleted?: readonly bigint[];
  groups?: readonly LfgListGroupInit[];
  players?: readonly LfgListPlayerInit[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(2);
  w.uint32LE(init.dungeon);
  w.uint8(init.deleted ? 1 : 0);
  if (init.deleted) {
    w.uint32LE(init.deleted.length);
    for (const guid of init.deleted) w.uint64LE(guid);
  }
  const groups = init.groups ?? [];
  w.uint32LE(groups.length);
  w.uint32LE(0);
  for (const group of groups) listGroup(w, group);
  const players = init.players ?? [];
  w.uint32LE(players.length);
  w.uint32LE(0);
  for (const player of players) listPlayer(w, player);
  return w.finish();
}
