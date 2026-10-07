import { runList, runRead, runStatus } from "#harness/areas/calendar/tool-read";
import { runRsvp } from "#harness/areas/calendar/tool-rsvp";
import { refuse } from "#harness/areas/calendar/tool-run";
import {
  type CalendarAfter,
  type CalendarArgs,
  type CalendarCtx,
  type CalendarDo,
  calendarParams,
} from "#harness/areas/calendar/tool-types";
import {
  runCopy,
  runCreate,
  runInvite,
  runRemove,
  runUpdate,
} from "#harness/areas/calendar/tool-write";
import type { ToolResult } from "#harness/contract/result";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export function emptyCalendar(): CalendarAfter {
  return { do: "list", target: undefined };
}

export function runCalendar(
  args: CalendarArgs,
  ctx: CalendarCtx,
): Promise<ToolResult<CalendarAfter>> {
  const verb = (args.do ?? "list") as CalendarDo;
  if (verb === "list") return runList(ctx);
  if (verb === "read") return runRead(args, ctx);
  if (verb === "create") return runCreate(args, ctx);
  if (verb === "update") return runUpdate(args, ctx);
  if (verb === "remove") return runRemove(args, ctx);
  if (verb === "copy") return runCopy(args, ctx);
  if (verb === "invite") return runInvite(args, ctx);
  if (verb === "rsvp") return runRsvp(args, ctx);
  if (verb === "status") return runStatus(args, ctx);
  throw refuse("unknown_verb", `Unknown calendar verb ${String(verb)}.`);
}

function calendarCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "list",
      argText(args, "event") ?? argText(args, "title") ?? argText(args, "name"),
      argText(args, "step"),
    ],
    theme,
    verb: "calendar",
  });
}

function calendarBody({
  expanded,
  result: out,
}: BodyInit<CalendarAfter>): string[] {
  return expanded ? out.body : [];
}

const calendarRenderers: ToolRenderers<"calendar", CalendarAfter> = {
  renderCall: callRenderer(calendarCall),
  renderResult: resultRenderer("calendar", calendarBody),
};

export const calendarSpec: GameToolSpec<
  typeof calendarParams,
  "calendar",
  CalendarAfter
> = {
  allowStopped: (args) =>
    (args.do ?? "list") === "list" || (args.do ?? "list") === "read",
  fallback: emptyCalendar,
  kind: "action",
  maxLines: 30,
  minimalArgs: { do: "list" },
  name: "calendar",
  parameters: calendarParams,
  renderers: calendarRenderers,
  run: runCalendar,
  text: {
    description:
      "Read your calendar and one event's details, create a personal event for a day, change or delete your event, copy it to another day, invite a named player, answer an invite, and read who is coming.",
    guidelines: [
      "Call list first so event ids and titles are known.",
      "Creating and copying share a 5-second server cooldown. Only events you created can change.",
    ],
    label: "Calendar",
  },
};

export const calendarTool = defineGameTool(calendarSpec);
