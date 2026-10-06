import type {
  CalendarAfter,
  CalendarArgs,
  CalendarDo,
} from "#harness/areas/calendar/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export function afterOf(verb: CalendarDo, target?: string): CalendarAfter {
  return { do: verb, target };
}

export function refuse(
  reason: string,
  detail: string,
  next = nextCall("calendar", { do: "list" }),
): Refusal {
  return new Refusal({ detail, next, reason });
}

export function silent(
  verb: CalendarDo,
  what: string,
): ToolResult<CalendarAfter> {
  return result("UNCONFIRMED", {
    after: afterOf(verb),
    detail: `${what} got no answer. The server may be silent for this call.`,
    next: nextCall("calendar", { do: "list" }),
    reason: "no_reply",
  });
}

export function needText(args: CalendarArgs, field: "name" | "title"): string {
  const value = args[field];
  if (value === undefined || value === "")
    throw refuse("missing_arg", `Give ${field} for this call.`);
  return value;
}

const ERROR_TEXT: Record<number, string> = {
  2: "you already hold the maximum of 30 events",
  5: "you may not change that event",
  6: "no such event",
  9: "guild events need a guild",
  11: "no such player",
  16: "the date is invalid",
  17: "the time is invalid",
  19: "the event needs a title",
  20: "the event time is in the past; give a date after the server time shown by list, or leave day, month and year out for tomorrow",
};

export function refusedOf(
  verb: CalendarDo,
  error: number,
  target?: string,
): ToolResult<CalendarAfter> {
  return result("REFUSED", {
    after: afterOf(verb, target),
    detail: `The server refused with error ${error}${ERROR_TEXT[error] === undefined ? "" : `: ${ERROR_TEXT[error]}`}.`,
    next: nextCall("calendar", { do: "list" }),
    reason: `error_${error}`,
  });
}
