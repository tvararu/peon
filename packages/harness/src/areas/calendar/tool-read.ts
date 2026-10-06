import type { AreaState } from "@peon/core";
import { afterOf, refusedOf, refuse } from "#harness/areas/calendar/tool-run";
import type {
  CalendarAfter,
  CalendarArgs,
  CalendarCtx,
} from "#harness/areas/calendar/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";

type CalendarEvent = AreaState<"calendar">["events"][number];
type CalendarDetail = AreaState<"calendar">["details"][string];

function stamp(time: CalendarEvent["time"]): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time.year}-${pad(time.month)}-${pad(time.day)} ${pad(time.hour)}:${pad(time.minute)}`;
}

export function findEvent(
  state: AreaState<"calendar">,
  text: string,
): CalendarEvent {
  const trimmed = text.trim();
  const exact = state.events.filter(
    (event) => event.id.toString() === trimmed,
  );
  if (exact.length === 1 && exact[0] !== undefined) return exact[0];
  const lower = trimmed.toLowerCase();
  const named = state.events.filter((event) =>
    event.title.toLowerCase().includes(lower),
  );
  if (named.length === 1 && named[0] !== undefined) return named[0];
  if (named.length > 1)
    throw refuse(
      "ambiguous_event",
      `"${trimmed}" matches ${named.length} events; give the event id from list.`,
    );
  throw refuse(
    "no_such_event",
    `No event matches "${trimmed}". Call list first.`,
  );
}

export function ownInviteId(
  state: AreaState<"calendar">,
  eventId: bigint,
): bigint {
  const fromInvites = state.invites.find(
    (invite) => invite.eventId === eventId,
  )?.inviteId;
  if (fromInvites !== undefined) return fromInvites;
  return (
    state.details[eventId.toString()]?.invites.find(
      (invite) => invite.rank === 2,
    )?.inviteId ?? 0n
  );
}

const STATUS_NAMES: Record<number, string> = {
  0: "invited",
  1: "accepted",
  2: "declined",
  3: "confirmed",
  4: "out",
  5: "standby",
  6: "signed up",
  7: "not signed up",
  8: "tentative",
  9: "removed",
};

function detailLine(detail: CalendarDetail): string[] {
  const body = [
    `event ${detail.eventId} "${detail.title}" on ${stamp(detail.time)}`,
    `description: ${detail.description === "" ? "(none)" : detail.description}`,
  ];
  for (const invite of detail.invites)
    body.push(
      `invitee ${invite.invitee.toString(16)}: ${STATUS_NAMES[invite.status] ?? `status ${invite.status}`}${invite.text === "" ? "" : ` "${invite.text}"`}`,
    );
  return body;
}

export async function runList(
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  const out = await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const state = out.state;
  return result("DONE", {
    after: afterOf("list"),
    body: state.events.map(
      (event) => `event ${event.id} "${event.title}" on ${stamp(event.time)}`,
    ),
    detail: `The calendar holds ${state.events.length} events and ${state.invites.length} invites.`,
  });
}

export async function runRead(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const found = findEvent(ctx.handle.calendar.state(), args.event);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.event(found.id),
  );
  if (out.status === "refused") return refusedOf("read", out.error);
  return result("DONE", {
    after: afterOf("read", found.id.toString()),
    body: detailLine(out.detail),
    detail: `Event ${found.id} is "${out.detail.title}".`,
  });
}

export async function runStatus(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const found = findEvent(ctx.handle.calendar.state(), args.event);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.event(found.id),
  );
  if (out.status === "refused") return refusedOf("status", out.error);
  return result("DONE", {
    after: afterOf("status", found.id.toString()),
    body: detailLine(out.detail),
    detail: `Event ${found.id} has ${out.detail.invites.length} invites.`,
  });
}
