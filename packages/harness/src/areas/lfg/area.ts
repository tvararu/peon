import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type LfgEvent = AreaEventOf<"lfg">;
type LfgState = AreaState<"lfg">;

function statusText(event: Extract<LfgEvent, { type: "status" }>): string {
  if (event.source === "search")
    return event.updateType === 3
      ? "Dungeon finder list updated."
      : "Dungeon finder list closed.";
  if (event.status === "queued") return "Queued for the dungeon finder.";
  if (event.status === "proposal") return "A dungeon group is ready.";
  return event.previous === "none"
    ? "Not queued for the dungeon finder."
    : "Left the dungeon finder queue.";
}

function status(event: Extract<LfgEvent, { type: "status" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: {
        previous: event.previous,
        source: event.source,
        status: event.status,
        updateType: event.updateType,
      },
      name: "status",
      text: statusText(event),
    },
  ];
}

function dungeons(event: Extract<LfgEvent, { type: "dungeons" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: { scope: event.scope },
      name: "dungeons",
      text:
        event.scope === "player"
          ? "Dungeon finder list received."
          : "Party lock list received.",
    },
  ];
}

function rule(event: LfgEvent): AreaDraft[] {
  switch (event.type) {
    case "status":
      return status(event);
    case "dungeons":
      return dungeons(event);
    default:
      return [];
  }
}

function attach(state: LfgState): AreaDraft[] {
  if (state.status === "none" && state.available.length === 0) return [];
  const locked = state.locks.filter((l) => l.status !== 0);
  return [
    {
      class: "log",
      data: {
        available: state.available.length,
        locks: state.locks.length,
        status: state.status,
      },
      name: "status",
      text:
        state.status === "queued"
          ? `Queued for ${state.selected.length} dungeon${state.selected.length === 1 ? "" : "s"}.`
          : `Dungeon finder offers ${state.available.length} random dungeons; ${locked.length} locked.`,
    },
  ];
}

export const lfgHarness = defineHarnessArea({
  area: "lfg",
  rules: () => ({
    attach: (state) => attach(state),
    event: (event) => rule(event),
  }),
  worldActs: ["requestDungeons", "requestPartyLocks", "requestStatus"],
});
