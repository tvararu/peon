import { areaRig } from "#test-support/area-rig";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

export const BG_ME = 0x0b_00n;
export const BG_OTHER = 0x0c_00n;

export function battlegroundsPvpCreditBody(init: {
  honor: number;
  victim: bigint;
  rank: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.honor);
  w.uint64LE(init.victim);
  w.uint32LE(init.rank);
  return w.finish();
}

export function battlegroundsInspectHonorStatsBody(init: {
  guid: bigint;
  honor: number;
  kills: number;
  today: number;
  yesterday: number;
  lifetime: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint8(init.honor);
  w.uint32LE(init.kills);
  w.uint32LE(init.today);
  w.uint32LE(init.yesterday);
  w.uint32LE(init.lifetime);
  return w.finish();
}

export function battlegroundsZoneUnderAttackBody(init: {
  areaId: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.areaId);
  return w.finish();
}

export function battlegroundsQuestUpdateAddPvpKillBody(init: {
  quest: number;
  count: number;
  required: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.quest);
  w.uint32LE(init.count);
  w.uint32LE(init.required);
  return w.finish();
}

export type BattlegroundsSelfFields = {
  playerFlags?: number;
  byte2?: number;
  kills?: number;
  today?: number;
  yesterday?: number;
  lifetime?: number;
  honor?: number;
  arena?: number;
  unitFlags?: number;
};

export function battlegroundsPlayer(
  guid: bigint,
  fields: BattlegroundsSelfFields = {},
): Entity {
  const raw = new Map<number, number>();
  const set = (offset: number, value: number | undefined) => {
    if (value !== undefined) raw.set(offset, value >>> 0);
  };
  set(PLAYER_FIELDS.FLAGS.offset, fields.playerFlags);
  set(UNIT_FIELDS.BYTES_2.offset, fields.byte2);
  set(PLAYER_FIELDS.KILLS.offset, fields.kills);
  set(PLAYER_FIELDS.TODAY_CONTRIBUTION.offset, fields.today);
  set(PLAYER_FIELDS.YESTERDAY_CONTRIBUTION.offset, fields.yesterday);
  set(PLAYER_FIELDS.LIFETIME_HONORBALE_KILLS.offset, fields.lifetime);
  set(PLAYER_FIELDS.HONOR_CURRENCY.offset, fields.honor);
  set(PLAYER_FIELDS.ARENA_CURRENCY.offset, fields.arena);
  return {
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    guid,
    health: 100,
    level: 10,
    maxHealth: 100,
    name: undefined,
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 },
    rawFields: raw,
    scale: 1,
    target: 0n,
    unitFlags: fields.unitFlags ?? 0,
  } as Entity;
}
export function battlegroundsScene(now: () => number = () => 0) {
  const players = new Map<bigint, Entity>([
    [BG_ME, battlegroundsPlayer(BG_ME)],
  ]);
  const rig = areaRig("battlegrounds", {
    getEntity: (guid) => players.get(guid),
    now,
    selfGuid: BG_ME,
  });
  const update = (guid: bigint, fields: BattlegroundsSelfFields) => {
    const player = battlegroundsPlayer(guid, fields);
    players.set(guid, player);
    rig.events.entity.emit({
      changed: [],
      entity: player,
      type: "update",
    });
  };
  return { rig, update };
}

export type BattlegroundsListRewards = {
  hasWin?: number;
  winHonor: number;
  winArena: number;
  lossHonor: number;
};

export function battlegroundsBattlefieldListBody(init: {
  guid: bigint;
  fromWhere: number;
  bgType: number;
  rewards?: BattlegroundsListRewards;
  random?: BattlegroundsListRewards;
  instances?: readonly number[];
}): Uint8Array {
  const rewards = init.rewards ?? { lossHonor: 0, winArena: 0, winHonor: 0 };
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint8(init.fromWhere);
  w.uint32LE(init.bgType);
  w.uint8(0);
  w.uint8(0);
  w.uint8(rewards.hasWin ?? 0);
  w.uint32LE(rewards.winHonor);
  w.uint32LE(rewards.winArena);
  w.uint32LE(rewards.lossHonor);
  w.uint8(init.random ? 1 : 0);
  if (init.random) {
    w.uint8(init.random.hasWin ?? 0);
    w.uint32LE(init.random.winHonor);
    w.uint32LE(init.random.winArena);
    w.uint32LE(init.random.lossHonor);
  }
  if (init.bgType === 6) {
    w.uint32LE(0);
    return w.finish();
  }
  const instances = init.instances ?? [];
  w.uint32LE(instances.length);
  for (const id of instances) w.uint32LE(id);
  return w.finish();
}

export function battlegroundsStatusNoneBody(slot: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(slot);
  w.uint64LE(0n);
  return w.finish();
}

export type BattlegroundsStatusInit = {
  slot: number;
  status: number;
  arenaType?: number;
  isArena?: number;
  bgType: number;
  minLevel?: number;
  maxLevel?: number;
  instanceId?: number;
  rated?: number;
  avgWait?: number;
  inQueue?: number;
  mapId?: number;
  timeToRemove?: number;
  autoLeave?: number;
  elapsed?: number;
  faction?: number;
};

function writeStatusTail(w: PacketWriter, init: BattlegroundsStatusInit) {
  if (init.status === 1) {
    w.uint32LE(init.avgWait ?? 0);
    w.uint32LE(init.inQueue ?? 0);
    return;
  }
  if (init.status !== 2 && init.status !== 3) return;
  w.uint32LE(init.mapId ?? 0);
  w.uint64LE(0n);
  if (init.status === 2) {
    w.uint32LE(init.timeToRemove ?? 0);
    return;
  }
  w.uint32LE(init.autoLeave ?? 0);
  w.uint32LE(init.elapsed ?? 0);
  w.uint8(init.faction ?? 0);
}

export function battlegroundsStatusBody(init: BattlegroundsStatusInit) {
  const w = new PacketWriter();
  w.uint32LE(init.slot);
  w.uint8(init.arenaType ?? 0);
  w.uint8(init.isArena ?? 0);
  w.uint32LE(init.bgType);
  w.uint16LE(0x1f_90);
  w.uint8(init.minLevel ?? 10);
  w.uint8(init.maxLevel ?? 19);
  w.uint32LE(init.instanceId ?? 0);
  w.uint8(init.rated ?? 0);
  w.uint32LE(init.status);
  writeStatusTail(w, init);
  return w.finish();
}

export function battlegroundsGroupJoinedBody(
  result: number,
  guid?: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(result);
  if (guid !== undefined) w.uint64LE(guid);
  return w.finish();
}

export function battlegroundsJoinedLeftBody(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export type BattlegroundsPvpPlayer = {
  guid: bigint;
  killingBlows?: number;
  honorableKills?: number;
  deaths?: number;
  bonusHonor?: number;
  arenaTeam?: number;
  damage?: number;
  healing?: number;
  objectives?: readonly number[];
};

export type BattlegroundsPvpLogInit = {
  arena?: boolean;
  teams?: readonly {
    ratingLost: number;
    ratingWon: number;
    mmr: number;
    name: string;
  }[];
  ended?: boolean;
  winner?: number;
  players?: readonly BattlegroundsPvpPlayer[];
};

export function battlegroundsPvpLogBody(
  init: BattlegroundsPvpLogInit = {},
): Uint8Array {
  const w = new PacketWriter();
  const arena = init.arena === true;
  w.uint8(arena ? 1 : 0);
  const teams = init.teams ?? [];
  if (arena) {
    for (const team of teams) {
      w.uint32LE(team.ratingLost);
      w.uint32LE(team.ratingWon);
      w.uint32LE(team.mmr);
    }
    for (let i = teams.length; i < 2; i++) {
      w.uint32LE(0);
      w.uint32LE(0);
      w.uint32LE(0);
    }
    for (const team of teams) w.cString(team.name);
    for (let i = teams.length; i < 2; i++) w.cString("");
  }
  w.uint8(init.ended === true ? 1 : 0);
  if (init.ended === true) w.uint8(init.winner ?? 0);
  const players = init.players ?? [];
  w.uint32LE(players.length);
  for (const player of players) {
    w.uint64LE(player.guid);
    w.uint32LE(player.killingBlows ?? 0);
    if (arena) {
      w.uint8(player.arenaTeam ?? 0);
    } else {
      w.uint32LE(player.honorableKills ?? 0);
      w.uint32LE(player.deaths ?? 0);
      w.uint32LE(player.bonusHonor ?? 0);
    }
    w.uint32LE(player.damage ?? 0);
    w.uint32LE(player.healing ?? 0);
    const objectives = player.objectives ?? [];
    w.uint32LE(objectives.length);
    for (const objective of objectives) w.uint32LE(objective);
  }
  return w.finish();
}

export function battlegroundsPositionsBody(
  carriers: readonly { guid: bigint; x: number; y: number }[] = [],
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0);
  w.uint32LE(carriers.length);
  for (const carrier of carriers) {
    w.uint64LE(carrier.guid);
    w.floatLE(carrier.x);
    w.floatLE(carrier.y);
  }
  return w.finish();
}

export function battlegroundsSpiritTimeBody(init: {
  guid: bigint;
  ms: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint32LE(init.ms);
  return w.finish();
}
