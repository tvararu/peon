import type { ChatMessage, DuelEvent, GroupEvent } from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function chatDrafts(_msg: ChatMessage, _rc: RuleInput): Drafts {
  return [];
}

export function groupDrafts(_event: GroupEvent, _rc: RuleInput): Drafts {
  return [];
}

export function duelDrafts(_event: DuelEvent, _rc: RuleInput): Drafts {
  return [];
}
