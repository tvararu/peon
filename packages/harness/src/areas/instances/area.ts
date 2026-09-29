import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type InstancesEvent = AreaEventOf<"instances">;
type Of<T extends InstancesEvent["type"]> = Extract<
  InstancesEvent,
  { type: T }
>;

const label = (name: string | undefined, value: number) =>
  name ?? `difficulty ${value}`;

function span(seconds: number): string {
  if (seconds >= 86_400) return `${Math.round(seconds / 86_400)} d`;
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} h`;
  return `${Math.ceil(seconds / 60)} min`;
}

function difficulty(event: Of<"difficulty">): AreaDraft[] {
  if (event.previous === undefined) return [];
  const kind = event.kind === "dungeon" ? "Dungeon" : "Raid";
  return [
    {
      class: "log",
      data: {
        difficulty: event.difficulty,
        inGroup: event.inGroup,
        kind: event.kind,
        previous: event.previous,
      },
      name: "difficulty",
      text: `${kind} difficulty is now ${label(event.name, event.difficulty)}.`,
    },
  ];
}

function mapDifficulty(event: Of<"map_difficulty">): AreaDraft[] {
  if (event.difficulty === 0) return [];
  return [
    {
      class: "log",
      data: {
        difficulty: event.difficulty,
        dynamicHeroic: event.dynamicHeroic,
        mapId: event.mapId,
      },
      name: "map_difficulty",
      text: `Entered map ${event.mapId} (${label(event.name, event.difficulty)}).`,
    },
  ];
}

function warningText(event: Of<"warning">): string {
  const left = span(event.secondsLeft);
  switch (event.kind) {
    case 1:
    case 2:
      return `Map ${event.mapId} resets in ${left}.`;
    case 3:
      return `Map ${event.mapId} resets in ${left}: leave it or you go back to your bind point.`;
    case 4:
      return `Entered map ${event.mapId}. It resets in ${left}${event.locked ? "; you are saved to it" : ""}.`;
    default:
      return `Map ${event.mapId}: the instance save expired.`;
  }
}

function warning(event: Of<"warning">): AreaDraft[] {
  return [
    {
      class: "wake",
      data: {
        difficulty: event.difficulty,
        extended: event.extended,
        kind: event.kind,
        locked: event.locked,
        mapId: event.mapId,
        secondsLeft: event.secondsLeft,
      },
      name: "warning",
      text: warningText(event),
    },
  ];
}

function homebindTimer(event: Of<"homebind_timer">): AreaDraft[] {
  const started = event.state === "started";
  return [
    {
      class: started ? "wake" : "log",
      data: { code: event.code, ms: event.ms, state: event.state },
      name: "homebind_timer",
      text: started
        ? `Not in this dungeon's group: moving to the graveyard in ${Math.round(event.ms / 1000)} s.`
        : "The dungeon group timer stopped.",
    },
  ];
}

function bindOffer(event: Of<"bind_offer">): AreaDraft[] {
  const seconds = Math.max(1, Math.round(event.timeoutMs / 1000));
  return [
    {
      class: "wake",
      data: { encounterMask: event.encounterMask, timeoutMs: event.timeoutMs },
      name: "bind_offer",
      text: `You will be saved to this instance in ${seconds} s. Answer with dungeon(do: "bind").`,
    },
  ];
}

function resetFailedReason(reason: number): string {
  switch (reason) {
    case 0:
      return "players are still inside";
    case 1:
      return "a party member is offline";
    case 2:
      return "a party member is zoning";
    default:
      return `reason ${reason}`;
  }
}

function reset(event: Of<"reset">): AreaDraft[] {
  return [
    {
      class: "log",
      data: { mapId: event.mapId },
      name: "reset",
      progress: true,
      text: `Instance map ${event.mapId} was reset.`,
    },
  ];
}

function resetFailed(event: Of<"reset_failed">): AreaDraft[] {
  return [
    {
      class: "wake",
      data: { mapId: event.mapId, reason: event.reason },
      name: "reset_failed",
      text: `Map ${event.mapId} was not reset: ${resetFailedReason(event.reason)}.`,
    },
  ];
}

function resetBlocked(event: Of<"reset_blocked">): AreaDraft[] {
  return [
    {
      class: "wake",
      data: { mapId: event.mapId },
      name: "reset_blocked",
      text: `Map ${event.mapId} cannot reset while players are inside it.`,
    },
  ];
}

function lockouts(event: Of<"lockouts">): AreaDraft[] {
  if (event.added.length === 0 && event.removed.length === 0) return [];
  const added = event.added.map((lock) => lock.mapId);
  const removed = event.removed.map((lock) => lock.mapId);
  const parts = [
    ...added.map((mapId) => `saved to ${mapId}`),
    ...removed.map((mapId) => `no longer saved to ${mapId}`),
  ];
  return [
    {
      class: "log",
      data: { added, removed },
      name: "lockouts",
      text: `Raid lockouts: ${parts.join(", ")}.`,
    },
  ];
}
function rule(event: InstancesEvent): AreaDraft[] {
  switch (event.type) {
    case "difficulty":
      return difficulty(event);
    case "map_difficulty":
      return mapDifficulty(event);
    case "warning":
      return warning(event);
    case "homebind_timer":
      return homebindTimer(event);
    case "corpse_elsewhere":
      return [
        {
          class: "wake",
          data: {},
          name: "corpse_elsewhere",
          text: "Cannot enter: your corpse is in a different instance.",
        },
      ];
    case "bind_offer":
      return bindOffer(event);
    case "bound":
      return [
        {
          class: "passive",
          data: {},
          name: "bound",
          text: "You are now saved to this instance.",
        },
      ];
    case "reset":
      return reset(event);
    case "reset_failed":
      return resetFailed(event);
    case "reset_blocked":
      return resetBlocked(event);
    case "lockouts":
      return lockouts(event);
    case "encounter":
      return [];
    default:
      return [];
  }
}

export const instancesHarness = defineHarnessArea({
  area: "instances",
  rules: () => ({ event: rule }),
  worldActs: [],
});
