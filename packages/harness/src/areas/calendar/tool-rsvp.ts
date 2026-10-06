import { findEvent, ownInviteId } from "#harness/areas/calendar/tool-read";
import { afterOf, refusedOf, refuse } from "#harness/areas/calendar/tool-run";
import type {
  CalendarAfter,
  CalendarArgs,
  CalendarCtx,
} from "#harness/areas/calendar/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";

const RSVP_STATUS: Record<string, number> = {
  accept: 1,
  decline: 2,
  tentative: 8,
};

export async function runRsvp(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  if (args.event === undefined)
    throw refuse("missing_arg", "Give event, the event id from list.");
  if (args.step === undefined)
    throw refuse("missing_arg", "Give step: accept, decline or tentative.");
  await ctx.rt.mutex.run(() => ctx.handle.calendar.act.get());
  const state = ctx.handle.calendar.state();
  const found = findEvent(state, args.event);
  const out = await ctx.rt.mutex.run(() =>
    ctx.handle.calendar.act.answer(
      found.id,
      ownInviteId(state, found.id),
      RSVP_STATUS[args.step ?? "accept"] ?? 1,
    ),
  );
  if (out.status === "refused") return refusedOf("rsvp", out.error);
  return result("DONE", {
    after: afterOf("rsvp", found.id.toString()),
    detail: `Answered ${args.step} to event ${found.id}.`,
  });
}
