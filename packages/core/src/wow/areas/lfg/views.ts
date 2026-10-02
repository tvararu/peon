import {
  type LfgJoinReason,
  type LfgRoleCheckStateName,
  roleCheckStateName,
} from "#wow/areas/lfg/names";
import type {
  LfgBootUpdate,
  LfgProposal,
  LfgProposalPlayer,
  LfgReward,
  RoleCheckUpdate,
} from "#wow/areas/lfg/protocol";

export type LfgLockReason =
  | "none"
  | "insufficient_expansion"
  | "too_low_level"
  | "too_high_level"
  | "too_low_gear_score"
  | "too_high_gear_score"
  | "raid_locked"
  | "attunement_too_low_level"
  | "attunement_too_high_level"
  | "quest_not_completed"
  | "missing_item"
  | "not_in_season"
  | "missing_achievement"
  | "unknown";

export type LfgLockView = {
  entry: number;
  id: number;
  type: number;
  status: number;
  reason: LfgLockReason;
};
export type LfgRandomView = { entry: number; id: number };
export type LfgPartyLocks = {
  guid: bigint;
  locks: readonly LfgLockView[];
};
export type LfgJoinView = {
  result: number;
  state: number;
  reason: LfgJoinReason;
  partyLocks: readonly LfgPartyLocks[];
};

export type LfgRoleCheckView = {
  state: number;
  stateName: LfgRoleCheckStateName;
  initializing: boolean;
  dungeons: readonly number[];
  ready: readonly bigint[];
  pending: readonly bigint[];
};

const LOCK_REASONS: Readonly<Record<number, LfgLockReason>> = {
  0: "none",
  1: "insufficient_expansion",
  2: "too_low_level",
  3: "too_high_level",
  4: "too_low_gear_score",
  5: "too_high_gear_score",
  6: "raid_locked",
  1001: "attunement_too_low_level",
  1002: "attunement_too_high_level",
  1022: "quest_not_completed",
  1025: "missing_item",
  1031: "not_in_season",
  1034: "missing_achievement",
};

export function lockReason(status: number): LfgLockReason {
  return LOCK_REASONS[status] ?? "unknown";
}

export function lockView(entry: number, status: number): LfgLockView {
  return {
    entry,
    id: entry & 0x00_ff_ff_ff,
    type: (entry >>> 24) & 0xff,
    status,
    reason: lockReason(status),
  };
}

export function roleCheckView(update: RoleCheckUpdate): LfgRoleCheckView {
  return {
    state: update.state,
    stateName: roleCheckStateName(update.state),
    initializing: update.initializing,
    dungeons: [...update.dungeons],
    ready: update.members.filter((m) => m.ready).map((m) => m.guid),
    pending: update.members.filter((m) => !m.ready).map((m) => m.guid),
  };
}

export const LFG_PROPOSAL_SECONDS = 40;

export type LfgTeleportReason =
  | "dead"
  | "falling"
  | "in_vehicle"
  | "fatigue"
  | "invalid_location"
  | "combat"
  | "unknown";

export type LfgProposalView = {
  id: number;
  dungeon: number;
  state: number;
  encounters: number;
  silent: boolean;
  players: readonly LfgProposalPlayer[];
  at: number;
  deadline: number;
};

export type LfgBootView = {
  victim: bigint;
  didVote: boolean;
  agree: boolean;
  votes: number;
  agrees: number;
  needed: number;
  reason: string;
  deadline: number;
};

export type LfgTeleportDeniedView = {
  code: number;
  reason: LfgTeleportReason;
  at: number;
};

export type LfgOfferContinueView = { entry: number; at: number };

export type LfgRewardView = LfgReward & { at: number };

const TELEPORT_REASONS: Readonly<Record<number, LfgTeleportReason>> = {
  1: "dead",
  2: "falling",
  3: "in_vehicle",
  4: "fatigue",
  6: "invalid_location",
  8: "combat",
};

export function teleportReasonName(code: number): LfgTeleportReason {
  return TELEPORT_REASONS[code] ?? "unknown";
}

export function proposalView(
  proposal: LfgProposal,
  at: number,
  deadline: number,
): LfgProposalView {
  return {
    id: proposal.id,
    dungeon: proposal.dungeon,
    state: proposal.state,
    encounters: proposal.encounters,
    silent: proposal.silent,
    players: proposal.players.map((p) => ({ ...p })),
    at,
    deadline,
  };
}

export function bootView(boot: LfgBootUpdate, at: number): LfgBootView {
  return {
    victim: boot.victim,
    didVote: boot.didVote,
    agree: boot.agree,
    votes: boot.votes,
    agrees: boot.agrees,
    needed: boot.needed,
    reason: boot.reason,
    deadline: at + boot.timeLeft * 1000,
  };
}

export function copyProposal(view: LfgProposalView | undefined) {
  return view === undefined
    ? undefined
    : { ...view, players: view.players.map((p) => ({ ...p })) };
}

export function copyReward(view: LfgRewardView | undefined) {
  return view === undefined
    ? undefined
    : { ...view, items: view.items.map((item) => ({ ...item })) };
}
