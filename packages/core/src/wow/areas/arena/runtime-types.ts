import type { ArenaRosterMember } from "#wow/areas/arena/protocol";
import type {
  ArenaInspectRow,
  ArenaQueue,
  ArenaTeam,
} from "#wow/areas/arena/store";

export type ArenaQueryResult = { team: ArenaTeam };
export type ArenaRosterResult = { id: number; members: ArenaRosterMember[] };
export type ArenaInviteResult =
  | { status: "sent" }
  | { status: "refused"; reason: string };
export type ArenaAcceptResult =
  | { team: string }
  | { status: "refused"; reason: string };
export type ArenaSimpleResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "no_reply" };
export type ArenaInspectResult = { guid: bigint; rows: ArenaInspectRow[] };
export type ArenaJoinResult =
  | { status: "queued"; slot: number; queue: ArenaQueue[] }
  | { status: "refused"; reason: string }
  | { status: "no_teams"; arenaType: number }
  | { status: "no_reply" };

export type ArenaDeclineResult = { status: "ok" } | { status: "no_invite" };

export type ArenaActs = {
  refresh: () => Promise<ArenaTeam[]>;
  query: (id: number) => Promise<ArenaQueryResult>;
  roster: (id: number) => Promise<ArenaRosterResult>;
  invite: (id: number, name: string) => Promise<ArenaInviteResult>;
  accept: () => Promise<ArenaAcceptResult>;
  decline: () => Promise<ArenaDeclineResult>;
  leave: (id: number) => Promise<ArenaSimpleResult>;
  remove: (id: number, name: string) => Promise<ArenaSimpleResult>;
  disband: (id: number) => Promise<ArenaSimpleResult>;
  setLeader: (id: number, name: string) => Promise<ArenaSimpleResult>;
  inspect: (guid: bigint) => Promise<ArenaInspectResult>;
  joinQueue: (
    master: bigint,
    slot: number,
    rated: boolean,
  ) => Promise<ArenaJoinResult>;
  leaveQueue: (
    slot: number,
  ) => Promise<{ status: "left" } | { status: "no_slot" }>;
};
