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

export function refusedOf(
  verb: CalendarDo,
  error: number,
  target?: string,
): ToolResult<CalendarAfter> {
  return result("REFUSED", {
    after: afterOf(verb, target),
    detail: `The server refused with error ${error}.`,
    next: nextCall("calendar", { do: "list" }),
    reason: `error_${error}`,
  });
}
