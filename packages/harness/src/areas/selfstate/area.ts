import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type SelfEvent = AreaEventOf<"selfstate">;
type SelfState = AreaState<"selfstate">;

const REASON_WORDS: Record<number, string> = {
  1: "a transfer error",
  2: "the instance is full",
  3: "instance not found",
  4: "too many instances entered recently",
  6: "an encounter in progress",
  7: "a missing expansion",
  8: "an unavailable difficulty",
  9: "the Death Knight starting area, which you cannot leave yet",
  10: "no instance slot free",
  11: "a required group",
  12: "instance not found",
  13: "instance not found",
  14: "instance not found",
  15: "a same-realm party",
  16: "a closed map",
};

const secondsLeft = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

function underWater(remainingMs: number): AreaDraft {
  const remainingS = secondsLeft(remainingMs);
  return {
    class: "wake",
    data: { remainingS, timer: "breath" },
    name: "under_water",
    text: `You are under water: breath ${remainingS} s.`,
  };
}

function breathLow(
  event: Extract<SelfEvent, { type: "breath_low" }>,
): AreaDraft {
  const remainingS = secondsLeft(event.remainingMs);
  return {
    class: "wake",
    data: { remainingS },
    name: "breath_low",
    text: `Breath ${remainingS} s left. Surface now.`,
  };
}

function refusedTransfer(
  event: Extract<SelfEvent, { type: "transfer_aborted" }>,
): AreaDraft {
  return {
    class: "wake",
    data: { mapId: event.mapId, reason: event.reason },
    name: "transfer_aborted",
    text: `Could not enter map ${event.mapId}: ${REASON_WORDS[event.reason] ?? `reason ${event.reason}`}.`,
  };
}

function mirrorTimer(
  event: Extract<SelfEvent, { type: "mirror_timer" }>,
): readonly AreaDraft[] {
  if (event.timer !== "breath") return [];
  if (event.change === "stopped")
    return [
      {
        class: "log",
        data: {},
        name: "surfaced",
        text: "You can breathe again.",
      },
    ];
  if (event.value.paused || event.value.scale >= 0) return [];
  return [underWater(event.value.valueMs)];
}

export const selfstateHarness = defineHarnessArea({
  area: "selfstate",
  glyph: "self",
  rules: () => ({
    attach: (state: SelfState, rc: RuleInput) => {
      const timer = state.timers.breath;
      if (!timer || timer.paused || timer.scale >= 0) return [];
      const left = timer.valueMs + timer.scale * (rc.now - timer.at);
      return left > 0 ? [underWater(left)] : [];
    },
    event: (event: SelfEvent) => {
      switch (event.type) {
        case "mirror_timer":
          return mirrorTimer(event);
        case "breath_low":
          return [breathLow(event)];
        case "transfer_aborted":
          return [refusedTransfer(event)];
        default:
          return [];
      }
    },
  }),
  worldActs: [],
});
