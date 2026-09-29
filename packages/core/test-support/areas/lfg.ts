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
