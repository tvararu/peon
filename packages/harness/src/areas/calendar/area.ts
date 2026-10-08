import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type CalendarState = AreaState<"calendar">;
type CalendarCommand = Extract<
  AreaEventOf<"calendar">,
  { type: "command_result" }
>;

function stamp(state: CalendarState): string | undefined {
  const zone = state.zoneTime;
  if (!zone) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${zone.year}-${pad(zone.month)}-${pad(zone.day)} ${pad(zone.hour)}:${pad(zone.minute)}`;
}

function calendarRow(state: CalendarState): AreaDraft[] {
  const when = stamp(state);
  if (when === undefined) return [];
  const invites = state.invites.length;
  const events = state.events.length;
  return [
    {
      class: "log",
      data: {
        events,
        holidays: state.holidays.length,
        invites,
        pending: state.pending,
        serverOffsetSeconds: state.serverOffsetSeconds,
        serverTime: state.serverTime,
        source: "calendar",
        zoneTime: when,
      },
      name: "read",
      text: `Calendar has ${invites} invites and ${events} events as of ${when}.`,
    },
  ];
}

function commandRow(event: CalendarCommand): AreaDraft[] {
  return [
    {
      class: "log",
      data: {
        error: event.error,
        name: event.name,
        source: "command_result",
      },
      name: "refused",
      text:
        event.name === ""
          ? `The calendar refused with error ${event.error}.`
          : `The calendar refused ${event.name} with error ${event.error}.`,
    },
  ];
}

function pendingRow(pending: number): AreaDraft[] {
  return [
    {
      class: "log",
      data: { pending, source: "pending" },
      name: "pending",
      text: `The calendar has ${pending} pending invites.`,
    },
  ];
}

export const calendarHarness = defineHarnessArea({
  area: "calendar",
  rules: () => ({
    attach: (state) => calendarRow(state),
    event: (event) => {
      if (event.type === "calendar") return calendarRow(event.state);
      if (event.type === "event") return [];
      if (event.type === "pending") return pendingRow(event.pending);
      if (event.type === "command_result") return commandRow(event);
      return [];
    },
  }),
});
