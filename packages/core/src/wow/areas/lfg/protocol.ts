import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type LfgUpdate = {
  updateType: number;
  dungeons: readonly number[];
  comment: string;
  queued: boolean;
  joined?: boolean;
};

export type LfgLock = { entry: number; status: number };
export type LfgRandomDungeon = {
  entry: number;
  done: boolean;
  money: number;
  xp: number;
  items: readonly { itemId: number; displayId: number; count: number }[];
};
export type LfgPlayerInfo = {
  random: readonly LfgRandomDungeon[];
  locks: readonly LfgLock[];
};
export type LfgPartyPlayer = { guid: bigint; locks: readonly LfgLock[] };

export function dungeonEntry(entry: number): { id: number; type: number } {
  return { id: entry & 0x00_ff_ff_ff, type: (entry >>> 24) & 0xff };
}

function readDungeons(r: PacketReader): {
  dungeons: readonly number[];
  comment: string;
} {
  const count = r.uint8();
  const dungeons: number[] = [];
  for (let i = 0; i < count; i++) dungeons.push(r.uint32LE());
  return { dungeons, comment: r.cString() };
}

export function parseLfgUpdate(r: PacketReader, scope: "player"): LfgUpdate;
export function parseLfgUpdate(
  r: PacketReader,
  scope: "party",
): LfgUpdate & { joined: boolean };
export function parseLfgUpdate(
  r: PacketReader,
  scope: "player" | "party",
): LfgUpdate {
  const updateType = r.uint8();
  if (r.uint8() === 0)
    return scope === "party"
      ? { updateType, dungeons: [], comment: "", queued: false, joined: false }
      : { updateType, dungeons: [], comment: "", queued: false };
  if (scope === "party") {
    const joined = r.uint8() !== 0;
    const queued = r.uint8() !== 0;
    r.skip(5);
    const { dungeons, comment } = readDungeons(r);
    return { updateType, dungeons, comment, queued, joined };
  }
  const queued = r.uint8() !== 0;
  r.skip(2);
  const { dungeons, comment } = readDungeons(r);
  return { updateType, dungeons, comment, queued };
}

export function parseLockBlock(r: PacketReader): readonly LfgLock[] {
  const count = r.uint32LE();
  const locks: LfgLock[] = [];
  for (let i = 0; i < count; i++)
    locks.push({ entry: r.uint32LE(), status: r.uint32LE() });
  return locks;
}

export function parsePartyLockBlock(
  r: PacketReader,
): readonly LfgPartyPlayer[] {
  const count = r.uint8();
  const players: LfgPartyPlayer[] = [];
  for (let i = 0; i < count; i++)
    players.push({ guid: r.uint64LE(), locks: parseLockBlock(r) });
  return players;
}

export function parseLfgPlayerInfo(r: PacketReader): LfgPlayerInfo {
  const count = r.uint8();
  const random: LfgRandomDungeon[] = [];
  for (let i = 0; i < count; i++) {
    const entry = r.uint32LE();
    const done = r.uint8() !== 0;
    const money = r.uint32LE();
    const xp = r.uint32LE();
    r.uint32LE();
    r.uint32LE();
    const itemCount = r.uint8();
    const items: { itemId: number; displayId: number; count: number }[] = [];
    for (let j = 0; j < itemCount; j++)
      items.push({
        itemId: r.uint32LE(),
        displayId: r.uint32LE(),
        count: r.uint32LE(),
      });
    random.push({ entry, done, money, xp, items });
  }
  return { random, locks: parseLockBlock(r) };
}

export function buildLfgGetStatus(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildPlayerLockInfoRequest(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildPartyLockInfoRequest(): Uint8Array {
  return new PacketWriter().finish();
}

export const LFG_MAX_ENTRIES = 50;

export type LfgJoinResult = {
  result: number;
  state: number;
  partyLocks: readonly LfgPartyPlayer[];
};

export type LfgQueueStatus = {
  dungeon: number;
  avgWait: number;
  wait: number;
  waitTank: number;
  waitHealer: number;
  waitDps: number;
  tanks: number;
  healers: number;
  dps: number;
  queuedTime: number;
};

export type RoleCheckMember = {
  guid: bigint;
  ready: boolean;
  roles: number;
  level: number;
};

export type RoleCheckUpdate = {
  state: number;
  initializing: boolean;
  dungeons: readonly number[];
  members: readonly RoleCheckMember[];
};

export type RoleChosen = { guid: bigint; ready: boolean; roles: number };

export function parseLfgJoinResult(r: PacketReader): LfgJoinResult {
  const result = r.uint32LE();
  const state = r.uint32LE();
  const partyLocks = r.remaining > 0 ? parsePartyLockBlock(r) : [];
  return { result, state, partyLocks };
}

export function parseLfgQueueStatus(r: PacketReader): LfgQueueStatus {
  return {
    dungeon: r.uint32LE(),
    avgWait: r.int32LE(),
    wait: r.int32LE(),
    waitTank: r.int32LE(),
    waitHealer: r.int32LE(),
    waitDps: r.int32LE(),
    tanks: r.uint8(),
    healers: r.uint8(),
    dps: r.uint8(),
    queuedTime: r.uint32LE(),
  };
}

export function parseRoleCheckUpdate(r: PacketReader): RoleCheckUpdate {
  const state = r.uint32LE();
  const initializing = r.uint8() !== 0;
  const dungeonCount = r.uint8();
  const dungeons: number[] = [];
  for (let i = 0; i < dungeonCount; i++) dungeons.push(r.uint32LE());
  const memberCount = r.uint8();
  const members: RoleCheckMember[] = [];
  for (let i = 0; i < memberCount; i++)
    members.push({
      guid: r.uint64LE(),
      ready: r.uint8() !== 0,
      roles: r.uint32LE(),
      level: r.uint8(),
    });
  return { state, initializing, dungeons, members };
}

export function parseRoleChosen(r: PacketReader): RoleChosen {
  return { guid: r.uint64LE(), ready: r.uint8() !== 0, roles: r.uint32LE() };
}

export function buildLfgJoin(join: {
  roles: number;
  entries: readonly number[];
  comment: string;
}): Uint8Array {
  if (join.entries.length > LFG_MAX_ENTRIES)
    throw new RangeError(
      `An LFG join carries at most ${LFG_MAX_ENTRIES} dungeon entries, got ${join.entries.length}.`,
    );
  const w = new PacketWriter();
  w.uint32LE(join.roles);
  w.uint8(0);
  w.uint8(0);
  w.uint8(join.entries.length);
  for (const entry of join.entries) w.uint32LE(entry);
  w.uint8(3);
  for (let i = 0; i < 3; i++) w.uint8(0);
  w.cString(join.comment);
  return w.finish();
}

export function buildLfgLeave(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildLfgSetRoles(roles: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(roles);
  return w.finish();
}

export function buildLfgComment(comment: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(comment);
  return w.finish();
}

export type LfgProposalPlayer = {
  role: number;
  self: boolean;
  inDungeon: boolean;
  sameGroup: boolean;
  answered: boolean;
  accepted: boolean;
};

export type LfgProposal = {
  dungeon: number;
  state: number;
  id: number;
  encounters: number;
  silent: boolean;
  players: readonly LfgProposalPlayer[];
};

export type LfgBootUpdate = {
  inProgress: boolean;
  didVote: boolean;
  agree: boolean;
  victim: bigint;
  votes: number;
  agrees: number;
  timeLeft: number;
  needed: number;
  reason: string;
};

export type LfgRewardItem = {
  itemId: number;
  displayId: number;
  count: number;
};

export type LfgReward = {
  randomDungeon: number;
  dungeon: number;
  done: boolean;
  money: number;
  xp: number;
  items: readonly LfgRewardItem[];
};

export function parseLfgProposal(r: PacketReader): LfgProposal {
  const dungeon = r.uint32LE();
  const state = r.uint8();
  const id = r.uint32LE();
  const encounters = r.uint32LE();
  const silent = r.uint8() !== 0;
  const count = r.uint8();
  const players: LfgProposalPlayer[] = [];
  for (let i = 0; i < count; i++)
    players.push({
      role: r.uint32LE(),
      self: r.uint8() !== 0,
      inDungeon: r.uint8() !== 0,
      sameGroup: r.uint8() !== 0,
      answered: r.uint8() !== 0,
      accepted: r.uint8() !== 0,
    });
  return { dungeon, state, id, encounters, silent, players };
}

export function parseBootProposal(r: PacketReader): LfgBootUpdate {
  return {
    inProgress: r.uint8() !== 0,
    didVote: r.uint8() !== 0,
    agree: r.uint8() !== 0,
    victim: r.uint64LE(),
    votes: r.uint32LE(),
    agrees: r.uint32LE(),
    timeLeft: r.uint32LE(),
    needed: r.uint32LE(),
    reason: r.cString(),
  };
}

export function parseLfgReward(r: PacketReader): LfgReward {
  const randomDungeon = r.uint32LE();
  const dungeon = r.uint32LE();
  const done = r.uint8() !== 0;
  r.skip(4);
  const money = r.uint32LE();
  const xp = r.uint32LE();
  r.skip(8);
  const count = r.uint8();
  const items: LfgRewardItem[] = [];
  for (let i = 0; i < count; i++)
    items.push({
      itemId: r.uint32LE(),
      displayId: r.uint32LE(),
      count: r.uint32LE(),
    });
  return { randomDungeon, dungeon, done, money, xp, items };
}

export function parseTeleportDenied(r: PacketReader): { code: number } {
  return { code: r.uint32LE() };
}

export function parseOfferContinue(r: PacketReader): { entry: number } {
  return { entry: r.uint32LE() };
}

export function buildLfgProposalResult(
  id: number,
  accept: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(id);
  w.uint8(accept ? 1 : 0);
  return w.finish();
}

export function buildLfgTeleport(out: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(out ? 1 : 0);
  return w.finish();
}

export function buildLfgBootVote(agree: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(agree ? 1 : 0);
  return w.finish();
}
