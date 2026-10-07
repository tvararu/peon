import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const PVP_LOG_PLAYERS_MAX = 80;

export const PVP_TEAM_HORDE = 0;
export const PVP_TEAM_ALLIANCE = 1;

export type PvpLogPlayer = {
  guid: bigint;
  killingBlows: number;
  honorableKills: number | undefined;
  deaths: number | undefined;
  bonusHonor: number | undefined;
  arenaTeam: number | undefined;
  damage: number;
  healing: number;
  objectives: readonly number[];
};

export type PvpLogArenaTeam = {
  ratingLost: number;
  ratingWon: number;
  matchmakerRating: number;
  name: string;
};

export type PvpLogData = {
  arena: boolean;
  teams: readonly PvpLogArenaTeam[];
  ended: boolean;
  winner: number | undefined;
  players: readonly PvpLogPlayer[];
};

export type PlayerPositions = {
  carriers: readonly { guid: bigint; x: number; y: number }[];
};

export type AreaSpiritHealerTime = { guid: bigint; ms: number };

function readObjectives(reader: PacketReader): number[] {
  const count = reader.uint32LE();
  if (count > reader.remaining / 4)
    throw new Error(`pvp log lists ${count} objectives`);
  const objectives: number[] = [];
  for (let i = 0; i < count; i++) objectives.push(reader.uint32LE());
  return objectives;
}

function readPlayer(reader: PacketReader, arena: boolean): PvpLogPlayer {
  const guid = reader.uint64LE();
  const killingBlows = reader.uint32LE();
  if (arena) {
    const arenaTeam = reader.uint8();
    const damage = reader.uint32LE();
    const healing = reader.uint32LE();
    return {
      arenaTeam,
      bonusHonor: undefined,
      damage,
      deaths: undefined,
      guid,
      healing,
      honorableKills: undefined,
      killingBlows,
      objectives: readObjectives(reader),
    };
  }
  const honorableKills = reader.uint32LE();
  const deaths = reader.uint32LE();
  const bonusHonor = reader.uint32LE();
  const damage = reader.uint32LE();
  const healing = reader.uint32LE();
  return {
    arenaTeam: undefined,
    bonusHonor,
    damage,
    deaths,
    guid,
    healing,
    honorableKills,
    killingBlows,
    objectives: readObjectives(reader),
  };
}

export function parsePvpLogData(reader: PacketReader): PvpLogData {
  const arena = reader.uint8() !== 0;
  const ratings: { ratingLost: number; ratingWon: number; mmr: number }[] = [];
  const teams: PvpLogArenaTeam[] = [];
  if (arena) {
    for (let i = 0; i < 2; i++)
      ratings.push({
        ratingLost: reader.uint32LE(),
        ratingWon: reader.uint32LE(),
        mmr: reader.uint32LE(),
      });
    for (const rating of ratings)
      teams.push({
        matchmakerRating: rating.mmr,
        name: reader.cString(),
        ratingLost: rating.ratingLost,
        ratingWon: rating.ratingWon,
      });
  }
  const ended = reader.uint8() !== 0;
  const winner = ended ? reader.uint8() : undefined;
  const count = reader.uint32LE();
  if (count > PVP_LOG_PLAYERS_MAX)
    throw new Error(`pvp log lists ${count} players`);
  const players: PvpLogPlayer[] = [];
  for (let i = 0; i < count; i++) players.push(readPlayer(reader, arena));
  return { arena, ended, players, teams, winner };
}

export function parsePlayerPositions(reader: PacketReader): PlayerPositions {
  const others = reader.uint32LE();
  if (others !== 0) throw new Error(`positions list ${others} players`);
  const count = reader.uint32LE();
  if (count > reader.remaining / 16)
    throw new Error(`positions list ${count} carriers`);
  const carriers: { guid: bigint; x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const guid = reader.uint64LE();
    const x = reader.floatLE();
    const y = reader.floatLE();
    carriers.push({ guid, x, y });
  }
  return { carriers };
}

export function parseBattlegroundPlayerGuid(reader: PacketReader): bigint {
  return reader.uint64LE();
}

export function parseAreaSpiritHealerTime(
  reader: PacketReader,
): AreaSpiritHealerTime {
  const guid = reader.uint64LE();
  const ms = reader.uint32LE();
  return { guid, ms };
}

export function buildEmptyRequest(): Uint8Array {
  return new PacketWriter().finish();
}

export function buildLeaveBattlefield(): Uint8Array {
  const w = new PacketWriter();
  w.uint8(0);
  w.uint8(0);
  w.uint32LE(0);
  w.uint16LE(0);
  return w.finish();
}

function spiritGuid(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildReportPvpAfk(guid: bigint): Uint8Array {
  return spiritGuid(guid);
}

export function buildAreaSpiritHealerQuery(guid: bigint): Uint8Array {
  return spiritGuid(guid);
}

export function buildAreaSpiritHealerQueue(guid: bigint): Uint8Array {
  return spiritGuid(guid);
}
