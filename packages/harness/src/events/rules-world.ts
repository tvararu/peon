import type {
  ControlEvent,
  EntityEvent,
  NoticeEvent,
  TrainerEvent,
  VendorEvent,
} from "@tuicraft/core";
import type { Drafts, RuleInput } from "#harness/events/rules";

export function controlDrafts(_event: ControlEvent, _rc: RuleInput): Drafts {
  return [];
}

export function vendorDrafts(_event: VendorEvent, _rc: RuleInput): Drafts {
  return [];
}

export function trainerDrafts(_event: TrainerEvent, _rc: RuleInput): Drafts {
  return [];
}

export function entityDrafts(
  _event: EntityEvent,
  _rc: RuleInput & { logEntities: boolean },
): Drafts {
  return [];
}

export function packetErrorDrafts(
  _opcode: number,
  _error: Error,
  _rc: RuleInput,
): Drafts {
  return [];
}

export function noticeDrafts(_event: NoticeEvent, _rc: RuleInput): Drafts {
  return [];
}
