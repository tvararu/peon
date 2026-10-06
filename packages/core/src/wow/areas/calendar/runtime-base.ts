import { ignoreFailure } from "#lib/ignore-failure";
import { CalendarError } from "#wow/areas/calendar/protocol";
import type {
  CalendarDetail,
  CalendarEvent,
  CalendarState,
  CalendarStore,
} from "#wow/areas/calendar/store";
import type { AreaRuntimeCtx } from "#wow/areas/contract";

const CALENDAR_READ_TIMEOUT_MS = 5000;

export type CalendarReadResult = { status: "ok"; state: CalendarState };

export type CalendarEventResult =
  | { status: "ok"; detail: CalendarDetail; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarPendingResult = { status: "ok"; pending: number };

export type CalendarCreateResult =
  | { status: "ok"; eventId: bigint; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarMutateResult =
  | { status: "ok"; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarInviteResult =
  | { status: "ok"; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type Ctx = AreaRuntimeCtx<CalendarEvent>;

export function watch(
  ctx: Ctx,
  match: (event: CalendarEvent) => boolean,
  opcode: number,
  body: Uint8Array,
): Promise<CalendarEvent> {
  const cancel = new AbortController();
  const settled = ctx.until(match, {
    signal: cancel.signal,
    timeoutMs: CALENDAR_READ_TIMEOUT_MS,
  });
  try {
    ctx.send(opcode, body);
  } catch (error) {
    cancel.abort();
    settled.catch(ignoreFailure);
    throw error;
  }
  return settled;
}

export type Env = { ctx: Ctx; store: CalendarStore };

export type Target = { eventId: bigint; inviteId: bigint };

export type Refusal = { status: "refused"; error: number; name: string };

export function refusalOf(seen: CalendarEvent): Refusal | undefined {
  if (seen.type !== "command_result") return undefined;
  return { error: seen.error, name: seen.name, status: "refused" };
}

export function ownEvent(
  store: CalendarStore,
  eventId: bigint,
): Refusal | undefined {
  if (!store.snapshot().createdByMe.includes(eventId))
    return { error: CalendarError.EventInvalid, name: "", status: "refused" };
  return undefined;
}
