import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  ACTION_NAMES,
  ERROR_NAMES,
  type ArenaCommandResult,
  type ArenaInspect,
  type ArenaQueueStatus,
  type ArenaRosterMember,
  type ArenaTeamEvent,
  type ArenaTeamInvite,
  type ArenaTeamQuery,
  type ArenaTeamRoster,
  type ArenaTeamStats,
  TEAM_EVENT_DISBANDED,
  TEAM_EVENT_JOIN,
  TEAM_EVENT_LEADER_CHANGED,
  TEAM_EVENT_LEAVE,
  TEAM_EVENT_REMOVE,
} from "#wow/areas/arena/protocol";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

export type ArenaTeam = {
  id: number;
  name: string;
  type: number;
  backgroundColor: number;
  emblemStyle: number;
  emblemColor: number;
  borderStyle: number;
  borderColor: number;
  rating: number;
  weekGames: number;
  weekWins: number;
  seasonGames: number;
  seasonWins: number;
  rank: number;
  members: ArenaRosterMember[];
  stale: boolean;
};

export type ArenaInvite = { inviter: string; team: string };

export type ArenaResult = {
  action: string;
  team: string;
  player: string;
  error: string;
  ok: boolean;
};

export type ArenaInspectRow = ArenaInspect;

export type ArenaQueue = {
  slot: number;
  arenaType: number;
  kind: ArenaQueueStatus["kind"];
  rated: boolean;
};

export type ArenaState = {
  teams: Record<string, ArenaTeam>;
  invite: ArenaInvite | undefined;
  inspected: Record<string, ArenaInspectRow[]>;
  result: ArenaResult | undefined;
  queue: ArenaQueue[];
  refused: number | undefined;
  destroyed: string[];
};

export type ArenaEvent =
  | { type: "team"; id: number; team: ArenaTeam }
  | { type: "stats"; id: number; team: ArenaTeam }
  | { type: "roster"; id: number; members: ArenaRosterMember[] }
  | { type: "invited"; inviter: string; team: string }
  | { type: "team_event"; event: number; name: string; strings: string[] }
  | { type: "result"; result: ArenaResult }
  | { type: "arena_error"; arenaType: number | undefined }
  | { type: "inspect"; guid: bigint; rows: ArenaInspectRow[] }
  | { type: "queue"; queue: ArenaQueue[] }
  | { type: "queue_refused"; result: number }
  | { type: "unit_destroyed"; guid: bigint };

function emptyTeam(query: ArenaTeamQuery): ArenaTeam {
  return {
    ...query,
    members: [],
    rank: 0,
    rating: 0,
    seasonGames: 0,
    seasonWins: 0,
    stale: true,
    weekGames: 0,
    weekWins: 0,
  };
}

export class ArenaStore {
  private readonly events = new Emitter<[ArenaEvent]>();
  private readonly deps: SessionDeps;
  private readonly teams = new Map<number, ArenaTeam>();
  private readonly inspected = new Map<string, ArenaInspectRow[]>();
  private readonly queue = new Map<number, ArenaQueue>();
  private invite: ArenaInvite | undefined;
  private result: ArenaResult | undefined;
  private refused: number | undefined;
  private destroyed: string[] = [];

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  snapshot(): ArenaState {
    return {
      destroyed: [...this.destroyed],
      inspected: Object.fromEntries(this.inspected),
      invite: this.invite,
      queue: [...this.queue.values()],
      refused: this.refused,
      result: this.result,
      teams: Object.fromEntries(this.teams),
    };
  }

  onEvent(cb: (event: ArenaEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  dispose(): void {
    this.events.clear();
  }

  selfName(): string | undefined {
    return this.deps.getEntity(this.deps.selfGuid())?.name ?? undefined;
  }

  teamIds(): number[] {
    const self = this.deps.getEntity(this.deps.selfGuid());
    const ids: number[] = [];
    for (let slot = 0; slot < 3; slot++) {
      const id =
        self?.rawFields.get(PLAYER_FIELDS.ARENA_TEAM_INFO_1_1.offset + slot * 7) ??
        (self?.createComplete ? 0 : undefined);
      if (id !== undefined && id !== 0) ids.push(id);
    }
    return ids;
  }

  team(id: number): ArenaTeam | undefined {
    return this.teams.get(id);
  }

  receiveQuery(query: ArenaTeamQuery): void {
    const known = this.teams.get(query.id);
    const team = { ...(known ?? emptyTeam(query)), ...query, stale: false };
    this.teams.set(query.id, team);
    this.events.emit({ id: query.id, team, type: "team" });
  }

  receiveStats(stats: ArenaTeamStats): void {
    const known = this.teams.get(stats.id);
    const team: ArenaTeam = {
      ...(known ?? emptyTeam({ ...stats, backgroundColor: 0, borderColor: 0, borderStyle: 0, emblemColor: 0, emblemStyle: 0, name: "", type: 0 })),
      ...stats,
      stale: false,
    };
    this.teams.set(stats.id, team);
    this.events.emit({ id: stats.id, team, type: "stats" });
  }

  receiveRoster(roster: ArenaTeamRoster): void {
    const known = this.teams.get(roster.id);
    const team: ArenaTeam = {
      ...(known ?? emptyTeam({ backgroundColor: 0, borderColor: 0, borderStyle: 0, emblemColor: 0, emblemStyle: 0, id: roster.id, name: "", type: roster.type })),
      type: roster.type,
    };
    team.members = [...roster.members];
    team.stale = false;
    this.teams.set(roster.id, team);
    this.events.emit({ id: roster.id, members: [...roster.members], type: "roster" });
  }

  receiveInvite(invite: ArenaTeamInvite): void {
    this.invite = { inviter: invite.inviter, team: invite.team };
    this.events.emit({ inviter: invite.inviter, team: invite.team, type: "invited" });
  }

  clearInvite(): void {
    this.invite = undefined;
  }

  receiveTeamEvent(packet: ArenaTeamEvent): void {
    this.applyTeamEvent(packet);
    this.events.emit({ event: packet.event, name: packet.name, strings: [...packet.strings], type: "team_event" });
  }

  receiveCommandResult(packet: ArenaCommandResult): void {
    const result: ArenaResult = {
      action: ACTION_NAMES[packet.action] ?? `action_${packet.action}`,
      error: ERROR_NAMES[packet.error] ?? `error_${packet.error}`,
      ok: packet.error === 0,
      player: packet.player,
      team: packet.team,
    };
    this.result = result;
    this.events.emit({ result, type: "result" });
  }

  receiveArenaError(arenaType: number | undefined): void {
    this.events.emit({ arenaType, type: "arena_error" });
  }

  receiveInspect(inspect: ArenaInspect): void {
    const key = `0x${inspect.guid.toString(16)}`;
    const rows = [...(this.inspected.get(key) ?? []), inspect];
    const seen = new Set<number>();
    const merged = rows.filter((row) => {
      if (seen.has(row.slot)) return false;
      seen.add(row.slot);
      return true;
    });
    this.inspected.set(key, merged);
    this.events.emit({ guid: inspect.guid, rows: [...merged], type: "inspect" });
  }

  receiveQueueStatus(status: ArenaQueueStatus): void {
    if (status.kind === "none") this.queue.delete(status.slot);
    else
      this.queue.set(status.slot, {
        arenaType: status.arenaType,
        kind: status.kind,
        rated: status.rated,
        slot: status.slot,
      });
    this.events.emit({ queue: [...this.queue.values()], type: "queue" });
  }

  receiveQueueRefused(resultCode: number): void {
    this.refused = resultCode;
    this.events.emit({ result: resultCode, type: "queue_refused" });
  }

  receiveUnitDestroyed(guid: bigint): void {
    this.destroyed.push(`0x${guid.toString(16)}`);
    this.events.emit({ guid, type: "unit_destroyed" });
  }

  private applyTeamEvent(packet: ArenaTeamEvent): void {
    const [first, second, third] = packet.strings;
    if (packet.event === TEAM_EVENT_DISBANDED && second !== undefined) {
      for (const [id, team] of this.teams)
        if (team.name === second) this.teams.delete(id);
      return;
    }
    if (packet.event === TEAM_EVENT_LEAVE && first !== undefined && second !== undefined) {
      for (const team of this.teams.values())
        if (team.name === second)
          team.members = team.members.filter((member) => member.name !== first);
      return;
    }
    if (packet.event === TEAM_EVENT_REMOVE && first !== undefined && second !== undefined) {
      for (const team of this.teams.values())
        if (team.name === second)
          team.members = team.members.filter((member) => member.name !== first);
      return;
    }
    if (
      packet.event === TEAM_EVENT_LEADER_CHANGED &&
      second !== undefined &&
      third !== undefined
    ) {
      for (const team of this.teams.values())
        if (team.name === third)
          for (const member of team.members)
            member.captain = member.name === second;
      return;
    }
    if (packet.event === TEAM_EVENT_JOIN && second !== undefined) {
      for (const team of this.teams.values())
        if (team.name === second) team.stale = true;
    }
  }
}
