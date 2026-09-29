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
function joinResult(
  event: Extract<LfgEvent, { type: "join_result" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: {
        reason: event.reason,
        result: event.result,
        state: event.state,
      },
      name: "join_result",
      text:
        event.reason === "ok"
          ? "Joined the dungeon finder queue."
          : "The dungeon finder refused the queue request.",
    },
  ];
}

function queue(event: Extract<LfgEvent, { type: "queue" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: { dungeon: event.dungeon, queuedTime: event.queuedTime },
      name: "queue",
      text: "Still waiting in the dungeon finder queue.",
    },
  ];
}

function roleCheck(
  event: Extract<LfgEvent, { type: "role_check" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: { state: event.state, stateName: event.stateName },
      name: "role_check",
      text:
        event.stateName === "initializing"
          ? "A role check started."
          : "The role check changed.",
    },
  ];
}

function roleChosen(
  event: Extract<LfgEvent, { type: "role_chosen" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: { guid: `${event.guid}`, ready: event.ready, roles: event.roles },
      name: "role_chosen",
      text: "A party member answered the role check.",
    },
  ];
}

function rule(event: LfgEvent): AreaDraft[] {
  switch (event.type) {
    case "status":
      return status(event);
    case "dungeons":
      return dungeons(event);
    case "join_result":
      return joinResult(event);
    case "queue":
      return queue(event);
    case "role_check":
      return roleCheck(event);
    case "role_chosen":
      return roleChosen(event);
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
