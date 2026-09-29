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
