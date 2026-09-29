export type LfgJoinReason =
  | "ok"
  | "failed"
  | "group_full"
  | "internal_error"
  | "not_meet_reqs"
  | "party_not_meet_reqs"
  | "mixed_raid_dungeon"
  | "multi_realm"
  | "disconnected"
  | "party_info_failed"
  | "dungeon_invalid"
  | "deserter"
  | "party_deserter"
  | "random_cooldown"
  | "party_random_cooldown"
  | "too_many_members"
  | "using_bg_system"
  | "unknown";

export type LfgRoleCheckStateName =
  | "default"
  | "finished"
  | "initializing"
  | "missing_role"
  | "wrong_roles"
  | "aborted"
  | "no_role"
  | "unknown";

const JOIN_REASONS: Readonly<Record<number, LfgJoinReason>> = {
  0: "ok",
  1: "failed",
  2: "group_full",
  4: "internal_error",
  5: "not_meet_reqs",
  6: "party_not_meet_reqs",
  7: "mixed_raid_dungeon",
  8: "multi_realm",
  9: "disconnected",
  10: "party_info_failed",
  11: "dungeon_invalid",
  12: "deserter",
  13: "party_deserter",
  14: "random_cooldown",
  15: "party_random_cooldown",
  16: "too_many_members",
  17: "using_bg_system",
};

export function joinReasonName(result: number): LfgJoinReason {
  return JOIN_REASONS[result] ?? "unknown";
}

const ROLE_CHECK_NAMES: Readonly<Record<number, LfgRoleCheckStateName>> = {
  0: "default",
  1: "finished",
  2: "initializing",
  3: "missing_role",
  4: "wrong_roles",
  5: "aborted",
  6: "no_role",
};

export function roleCheckStateName(state: number): LfgRoleCheckStateName {
  return ROLE_CHECK_NAMES[state] ?? "unknown";
}
