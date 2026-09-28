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
    default:
      return [];
  }
}

export const instancesHarness = defineHarnessArea({
  area: "instances",
  rules: () => ({ event: rule }),
  worldActs: [],
});
