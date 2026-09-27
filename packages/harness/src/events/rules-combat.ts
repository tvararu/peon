import type {
  CombatEvent,
  CycleEvent,
  EntityEvent,
  RecoveryEvent,
  TacticsEvent,
} from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function combatDrafts(_event: CombatEvent, _rc: RuleInput): Drafts {
  return [];
}

export function tacticsDrafts(_event: TacticsEvent, _rc: RuleInput): Drafts {
  return [];
}

export function cycleDrafts(_event: CycleEvent, _rc: RuleInput): Drafts {
  return [];
}

export function recoveryDrafts(_event: RecoveryEvent, _rc: RuleInput): Drafts {
  return [];
}

export function vitalsDrafts(_event: EntityEvent, _rc: RuleInput): Drafts {
  return [];
}
