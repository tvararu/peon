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
