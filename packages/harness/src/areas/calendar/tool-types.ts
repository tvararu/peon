import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { ToolCtx } from "#harness/contract/services";

export const CALENDAR_VERBS = [
  "list",
  "read",
  "create",
  "update",
  "remove",
  "copy",
  "invite",
  "rsvp",
  "status",
] as const;

export const calendarParams = Type.Object({
  day: Type.Optional(
    Type.Integer({
      description:
        "For create, update and copy: the day of the month. Default tomorrow.",
      maximum: 31,
      minimum: 1,
    }),
  ),
  description: Type.Optional(
    Type.String({
      description:
        "For create and update: the event description, 255 characters at most.",
    }),
  ),
  do: Type.Optional(
    StringEnum([...CALENDAR_VERBS], {
      description:
        "list: read the calendar. read: read one event's details. create: create a personal event. update: change your event's title, description or time. remove: delete your event. copy: copy your event to another day. invite: invite a named player to your event. rsvp: answer an invite to an event (accept, decline or tentative). status: read who is coming. Default list.",
    }),
  ),
  event: Type.Optional(
    Type.String({
      description:
        "For read, update, remove, copy, invite, rsvp and status: the event id from list, or an event title to match.",
    }),
  ),
  hour: Type.Optional(
    Type.Integer({
      description:
        "For create, update and copy: the hour of day, 0 to 23. Default 19.",
      maximum: 23,
      minimum: 0,
    }),
  ),
  minute: Type.Optional(
    Type.Integer({
      description:
        "For create, update and copy: the minute, 0 to 59. Default 0.",
      maximum: 59,
      minimum: 0,
    }),
  ),
  month: Type.Optional(
    Type.Integer({
      description:
        "For create, update and copy: the month number. Default tomorrow's.",
      maximum: 12,
      minimum: 1,
    }),
  ),
  name: Type.Optional(
    Type.String({
      description: "For invite: the player name to invite.",
    }),
  ),
  step: Type.Optional(
    StringEnum(["accept", "decline", "tentative"], {
      description: "For rsvp: accept, decline, or answer tentative.",
    }),
  ),
  title: Type.Optional(
    Type.String({
      description:
        "For create and update: the event title, 31 characters at most.",
    }),
  ),
  year: Type.Optional(
    Type.Integer({
      description:
        "For create, update and copy: the year. Default tomorrow's.",
      maximum: 2031,
      minimum: 2000,
    }),
  ),
});

export type CalendarArgs = Static<typeof calendarParams>;
export type CalendarDo = (typeof CALENDAR_VERBS)[number];

export type CalendarAfter = {
  do: CalendarDo;
  target: string | undefined;
};

export type CalendarCtx = ToolCtx<CalendarAfter>;
