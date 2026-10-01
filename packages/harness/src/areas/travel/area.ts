import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

type TravelEvent = AreaEventOf<"travel">;
type BindPoint = Extract<TravelEvent, { type: "bind_point" }>;

function homeText(point: BindPoint, rc: RuleInput): string {
  const area = rc.lookup.place().area ?? `area ${point.areaId}`;
  return `Home is now ${area}.`;
}

function flightDrafts(
  event: TravelEvent,
  rc: RuleInput,
): readonly AreaDraft[] | undefined {
  if (event.type === "taxi_node_learned") {
    const master =
      event.npc === undefined ? undefined : rc.lookup.unitName(event.npc);
    return [
      {
        class: "log",
        data: { npc: event.npc?.toString(10) },
        name: "node_learned",
        text: `New flight path: learned from ${master ?? "the flight master"}.`,
      },
    ];
  }
  if (event.type === "flight_started")
    return [
      {
        class: "log",
        data: { route: [...event.route] },
        name: "flight_started",
        text: `Flight started along ${event.route.length} stops.`,
      },
    ];
  if (event.type === "flight_landed")
    return [
      { class: "wake", data: {}, name: "flight_landed", text: "Flight landed." },
    ];
  if (event.type === "taxi_reply" && event.name !== "ok")
    return [
      {
        class: "log",
        data: { code: event.code, name: event.name },
        name: "flight_refused",
        text: `Flight refused: ${event.name}.`,
      },
    ];
  return undefined;
}

function onEvent(event: TravelEvent, rc: RuleInput): readonly AreaDraft[] {
  const flight = flightDrafts(event, rc);
  if (flight) return flight;
  if (event.type === "bind_point") {
    if (event.reason === "login") return [];
    return [
      {
        class: "log",
        data: {
          areaId: event.areaId,
          mapId: event.mapId,
          x: event.x,
          y: event.y,
          z: event.z,
        },
        name: "home_set",
        progress: true,
        text: homeText(event, rc),
      },
    ];
  }
  if (event.type === "bind_offer") {
    return [
      {
        class: "log",
        data: { npc: event.npc.toString(10) },
        guid: event.npc.toString(10),
        name: "bind_offer",
        text: "An innkeeper offers to make this inn your home.",
      },
    ];
  }
  return [];
}

export const travelHarness = defineHarnessArea({
  area: "travel",
  rules: () => ({ event: onEvent }),
  worldActs: ["bindActivate", "openTaxiMap", "activateTaxi"],
});
