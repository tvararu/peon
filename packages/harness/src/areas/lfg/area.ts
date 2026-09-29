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

const PROPOSAL_TEXT: Readonly<Record<number, string>> = {
  0: "A dungeon group proposal is waiting for an answer.",
  1: "The dungeon group proposal failed.",
  2: "The dungeon group proposal succeeded.",
};

function proposal(event: Extract<LfgEvent, { type: "proposal" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: { dungeon: event.dungeon, id: event.id, state: event.state },
      name: "proposal",
      text: PROPOSAL_TEXT[event.state] ?? "The dungeon group proposal changed.",
    },
  ];
}

function boot(event: Extract<LfgEvent, { type: "boot" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: {
        agrees: event.agrees,
        inProgress: event.inProgress,
        needed: event.needed,
        victim: `${event.victim}`,
        votes: event.votes,
      },
      name: "boot",
      text: event.inProgress
        ? `A kick vote is open: ${event.agrees} of ${event.needed} needed agree.`
        : "The kick vote ended.",
    },
  ];
}

function teleportDenied(
  event: Extract<LfgEvent, { type: "teleport_denied" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: { code: event.code, reason: event.reason },
      name: "teleport_denied",
      text: `The dungeon teleport was denied: ${event.reason}.`,
    },
  ];
}

function offerContinue(
  event: Extract<LfgEvent, { type: "offer_continue" }>,
): AreaDraft[] {
  return [
    {
      class: "log",
      data: { entry: event.entry },
      name: "offer_continue",
      text: "The dungeon finder offers to fill the group again.",
    },
  ];
}

function reward(event: Extract<LfgEvent, { type: "reward" }>): AreaDraft[] {
  return [
    {
      class: "log",
      data: {
        dungeon: event.dungeon,
        itemCount: event.itemCount,
        money: event.money,
        randomDungeon: event.randomDungeon,
        xp: event.xp,
      },
      name: "reward",
      text: `Dungeon reward: ${event.money} copper, ${event.xp} experience, ${event.itemCount} item${event.itemCount === 1 ? "" : "s"}.`,
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
    case "proposal":
      return proposal(event);
    case "boot":
      return boot(event);
    case "teleport_denied":
      return teleportDenied(event);
    case "offer_continue":
      return offerContinue(event);
    case "reward":
      return reward(event);
    default: {
      const unhandled: never = event;
      return unhandled;
    }
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
