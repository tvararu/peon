import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export const ARENA_TYPES = [2, 3, 5] as const;
export type ArenaType = (typeof ARENA_TYPES)[number];

export const TEAM_EVENT_JOIN = 3;
export const TEAM_EVENT_LEAVE = 4;
export const TEAM_EVENT_REMOVE = 5;
export const TEAM_EVENT_LEADER_IS = 6;
export const TEAM_EVENT_LEADER_CHANGED = 7;
export const TEAM_EVENT_DISBANDED = 8;

export const EVENT_NAMES: Record<number, string> = {
  [TEAM_EVENT_JOIN]: "join",
  [TEAM_EVENT_LEAVE]: "leave",
  [TEAM_EVENT_REMOVE]: "remove",
  [TEAM_EVENT_LEADER_IS]: "leader_is",
  [TEAM_EVENT_LEADER_CHANGED]: "leader_changed",
  [TEAM_EVENT_DISBANDED]: "disbanded",
};

export const ACTION_NAMES: Record<number, string> = {
  0: "create",
  1: "invite",
  3: "quit",
  14: "founder",
};

export const ERROR_NAMES: Record<number, string> = {
  0: "ok",
  1: "internal",
  2: "already_in_team",
  3: "target_already_in_team",
  4: "already_invited",
  5: "target_already_invited",
  6: "name_invalid",
  7: "name_exists",
  8: "permissions",
  9: "not_in_team",
  10: "target_not_in_team",
  11: "player_not_found",
  12: "not_allied",
  19: "ignoring_you",
  21: "target_too_low",
  22: "target_too_high",
  23: "team_full",
  27: "not_found",
  30: "teams_locked",
};

export type ArenaTeamQuery = {
  id: number;
  name: string;
  type: number;
  backgroundColor: number;
  emblemStyle: number;
  emblemColor: number;
  borderStyle: number;
  borderColor: number;
};

export function parseTeamQuery(r: PacketReader): ArenaTeamQuery {
  return {
    id: r.uint32LE(),
    name: r.cString(),
    type: r.uint32LE(),
    backgroundColor: r.uint32LE(),
    emblemStyle: r.uint32LE(),
    emblemColor: r.uint32LE(),
    borderStyle: r.uint32LE(),
    borderColor: r.uint32LE(),
  };
}

export type ArenaTeamStats = {
  id: number;
  rating: number;
  weekGames: number;
  weekWins: number;
  seasonGames: number;
  seasonWins: number;
  rank: number;
};

export function parseTeamStats(r: PacketReader): ArenaTeamStats {
  return {
    id: r.uint32LE(),
    rating: r.uint32LE(),
    weekGames: r.uint32LE(),
    weekWins: r.uint32LE(),
    seasonGames: r.uint32LE(),
    seasonWins: r.uint32LE(),
    rank: r.uint32LE(),
  };
}

export type ArenaRosterMember = {
  guid: bigint;
  online: boolean;
  name: string;
  captain: boolean;
  level: number;
  class: number;
  weekGames: number;
  weekWins: number;
  seasonGames: number;
  seasonWins: number;
  personalRating: number;
};

export type ArenaTeamRoster = {
  id: number;
  type: number;
  members: ArenaRosterMember[];
};

export function parseTeamRoster(r: PacketReader): ArenaTeamRoster {
  const id = r.uint32LE();
  const extra = r.uint8() !== 0;
  const count = r.uint32LE();
  const type = r.uint32LE();
  const members: ArenaRosterMember[] = [];
  for (let i = 0; i < count; i++) {
    const guid = r.uint64LE();
    const online = r.uint8() !== 0;
    const name = r.cString();
    const captain = r.uint32LE() === 0;
    const level = r.uint8();
    const class_ = r.uint8();
    const member: ArenaRosterMember = {
      guid,
      online,
      name,
      captain,
      level,
      class: class_,
      weekGames: r.uint32LE(),
      weekWins: r.uint32LE(),
      seasonGames: r.uint32LE(),
      seasonWins: r.uint32LE(),
      personalRating: r.uint32LE(),
    };
    if (extra) r.skip(8);
    members.push(member);
  }
  return { id, type, members };
}

export type ArenaTeamInvite = { inviter: string; team: string };

export function parseTeamInvite(r: PacketReader): ArenaTeamInvite {
  return { inviter: r.cString(), team: r.cString() };
}

export type ArenaTeamEvent = {
  event: number;
  name: string;
  strings: string[];
  guid: bigint | undefined;
};

export function parseTeamEvent(r: PacketReader): ArenaTeamEvent {
  const event = r.uint8();
  const count = r.uint8();
  const strings: string[] = [];
  for (let i = 0; i < count; i++) strings.push(r.cString());
  const guid = r.remaining >= 8 ? r.uint64LE() : undefined;
  return { event, guid, name: EVENT_NAMES[event] ?? `event_${event}`, strings };
}

export type ArenaCommandResult = {
  action: number;
  team: string;
  player: string;
  error: number;
};

export function parseTeamCommandResult(r: PacketReader): ArenaCommandResult {
  return {
    action: r.uint32LE(),
    team: r.cString(),
    player: r.cString(),
    error: r.uint32LE(),
  };
}

export type ArenaErrorPacket = { arenaType: number | undefined };

export function parseArenaError(r: PacketReader): ArenaErrorPacket {
  const unknown = r.uint32LE();
  return { arenaType: unknown === 0 ? r.uint8() : undefined };
}

export type ArenaInspect = {
  guid: bigint;
  slot: number;
  teamId: number;
  rating: number;
  seasonGames: number;
  seasonWins: number;
  memberGames: number;
  personalRating: number;
};

export function parseInspectArenaTeams(r: PacketReader): ArenaInspect {
  return {
    guid: r.uint64LE(),
    slot: r.uint8(),
    teamId: r.uint32LE(),
    rating: r.uint32LE(),
    seasonGames: r.uint32LE(),
    seasonWins: r.uint32LE(),
    memberGames: r.uint32LE(),
    personalRating: r.uint32LE(),
  };
}


export type ArenaQueueStatus = {
  slot: number;
  arenaType: number;
  kind: "none" | "queued" | "invited" | "active" | "leaving";
  rated: boolean;
};

const STATUS_KINDS: Record<number, ArenaQueueStatus["kind"]> = {
  1: "queued",
  2: "invited",
  3: "active",
  4: "leaving",
};

export function parseQueueStatus(r: PacketReader): ArenaQueueStatus {
  const slot = r.uint32LE();
  if (r.remaining === 8) return { arenaType: 0, kind: "none", rated: false, slot };
  const arenaType = r.uint8();
  r.skip(1 + 4 + 2 + 1 + 1 + 4);
  const rated = r.uint8() !== 0;
  const kind = STATUS_KINDS[r.uint32LE()] ?? "none";
  return { arenaType, kind, rated, slot };
}


export function buildTeamId(id: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(id);
  return w.finish();
}

export function buildTeamName(id: number, name: string): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(id);
  w.cString(name);
  return w.finish();
}

export function buildInspectArenaTeams(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function buildJoinArena(
  master: bigint,
  slot: number,
  asGroup: boolean,
  rated: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(master);
  w.uint8(slot);
  w.uint8(asGroup ? 1 : 0);
  w.uint8(rated ? 1 : 0);
  return w.finish();
}
