import type {
  LfgBootUpdate,
  LfgProposal,
  LfgProposalPlayer,
  LfgReward,
} from "#wow/areas/lfg/protocol";

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
