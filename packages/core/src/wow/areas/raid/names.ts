const RESULT_NAMES: ReadonlyMap<number, string> = new Map([
  [0, "ok"],
  [1, "bad_player_name"],
  [2, "target_not_in_group"],
  [3, "target_not_in_instance"],
  [4, "group_full"],
  [5, "already_in_group"],
  [6, "not_in_group"],
  [7, "not_leader"],
  [8, "player_wrong_faction"],
  [9, "ignoring_you"],
  [12, "lfg_pending"],
  [13, "invite_restricted"],
  [14, "group_swap_failed"],
  [15, "invite_unknown_realm"],
  [16, "invite_no_party_server"],
  [17, "invite_party_busy"],
  [18, "party_target_ambiguous"],
  [19, "lfg_invite_raid_locked"],
  [20, "lfg_boot_limit"],
  [21, "lfg_boot_cooldown"],
  [22, "lfg_boot_in_progress"],
  [23, "lfg_boot_too_few_players"],
  [24, "lfg_boot_not_eligible"],
  [25, "raid_disallowed_by_level"],
  [26, "lfg_boot_in_combat"],
  [27, "vote_kick_reason_needed"],
  [28, "lfg_boot_dungeon_complete"],
  [29, "lfg_boot_loot_rolls"],
  [30, "lfg_teleport_in_combat"],
]);

const OPERATION_NAMES: ReadonlyMap<number, string> = new Map([
  [0, "invite"],
  [1, "uninvite"],
  [2, "leave"],
  [4, "swap"],
]);

export function partyResultName(code: number): string {
  return RESULT_NAMES.get(code) ?? `result_${code}`;
}

export function partyOperationName(code: number): string {
  return OPERATION_NAMES.get(code) ?? `operation_${code}`;
}
