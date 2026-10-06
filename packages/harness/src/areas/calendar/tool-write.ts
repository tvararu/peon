import type { AreaState } from "@peon/core";
import { findEvent, ownInviteId } from "#harness/areas/calendar/tool-read";
import {
  afterOf,
  needText,
  refusedOf,
  refuse,
} from "#harness/areas/calendar/tool-run";
import type {
  CalendarAfter,
  CalendarArgs,
  CalendarCtx,
} from "#harness/areas/calendar/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";

type Packed = AreaState<"calendar">["zoneTime"];

function tomorrow(state: AreaState<"calendar">): NonNullable<Packed> {
  const zone = state.zoneTime;
  if (zone === undefined)
    throw refuse(
      "no_calendar",
      "The calendar has not loaded yet. Call list first.",
    );
  const at = new Date(
    Date.UTC(zone.year, zone.month - 1, zone.day, zone.hour, zone.minute) +
      86_400_000,
  );
  return {
    day: at.getUTCDate(),
    hour: 19,
    minute: 0,
    month: at.getUTCMonth() + 1,
    weekday: at.getUTCDay(),
    year: at.getUTCFullYear(),
  };
}

function atOf(
  args: CalendarArgs,
  state: AreaState<"calendar">,
): NonNullable<Packed> {
  const base = tomorrow(state);
  return {
    day: args.day ?? base.day,
    hour: args.hour ?? base.hour,
    minute: args.minute ?? base.minute,
    month: args.month ?? base.month,
    weekday: base.weekday,
    year: args.year ?? base.year,
  };
}

export async function runCreate(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  const title = needText(args, "title");
  const state = (await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get()))
    .state;
  const time = atOf(args, state);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.create({
      description: args.description ?? "",
      dungeonId: -1,
      flags: 0,
      maxInvites: 100,
      repeat: 0,
      time,
      title,
      type: 0,
      zoneTime: time,
    }),
  );
  if (out.status === "refused") return refusedOf("create", out.error);
  return result("DONE", {
    after: afterOf("create", out.eventId.toString()),
    detail: `Created event ${out.eventId} "${title}".`,
  });
}

export async function runUpdate(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const state = ctx.handle.calendar.state();
  const found = findEvent(state, args.event);
  const detail = state.details[found.id.toString()];
  if (detail === undefined)
    throw refuse(
      "no_such_event",
      `Event ${found.id} has no loaded details. Call read first.`,
    );
  const title = args.title ?? detail.title;
  const time =
    args.day === undefined &&
    args.month === undefined &&
    args.year === undefined &&
    args.hour === undefined &&
    args.minute === undefined
      ? { ...detail.time }
      : atOf(args, state);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.update(
      found.id,
      ownInviteId(state, found.id),
      {
        description: args.description ?? detail.description,
        dungeonId: detail.dungeonId,
        flags: detail.flags,
        maxInvites: detail.maxInvites,
        repeat: detail.repeat,
        time,
        title,
        type: detail.type,
        zoneTime: { ...time },
      },
    ),
  );
  if (out.status === "refused") return refusedOf("update", out.error);
  return result("DONE", {
    after: afterOf("update", found.id.toString()),
    detail: `Updated event ${found.id} to "${title}".`,
  });
}

export async function runRemove(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const state = ctx.handle.calendar.state();
  const found = findEvent(state, args.event);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.remove(found.id, ownInviteId(state, found.id)),
  );
  if (out.status === "refused") return refusedOf("remove", out.error);
  return result("DONE", {
    after: afterOf("remove", found.id.toString()),
    detail: `Removed event ${found.id} "${found.title}".`,
  });
}

export async function runCopy(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  const state = (await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get()))
    .state;
  const found = findEvent(state, args.event);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.copy(
      found.id,
      ownInviteId(state, found.id),
      atOf(args, state),
    ),
  );
  if (out.status === "refused") return refusedOf("copy", out.error);
  return result("DONE", {
    after: afterOf("copy", out.eventId.toString()),
    detail: `Copied event ${found.id} to event ${out.eventId}.`,
  });
}

export async function runInvite(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  const name = needText(args, "name");
  await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const found = findEvent(ctx.handle.calendar.state(), args.event);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.invite(found.id, name),
  );
  if (out.status === "refused") return refusedOf("invite", out.error, name);
  return result("DONE", {
    after: afterOf("invite", name),
    detail: `Invited ${name} to event ${found.id}.`,
  });
}
