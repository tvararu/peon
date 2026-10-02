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
