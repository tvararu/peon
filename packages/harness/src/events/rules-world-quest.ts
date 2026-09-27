import type { QuestEvent, RewardsEvent } from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function questDrafts(_event: QuestEvent, _rc: RuleInput): Drafts {
  return [];
}

export function rewardsDrafts(_event: RewardsEvent, _rc: RuleInput): Drafts {
  return [];
}
