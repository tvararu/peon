import { ignoreFailure } from "#lib/ignore-failure";
import {
  buildGetCalendar,
  buildGetEvent,
  buildGetNumPending,
} from "#wow/areas/calendar/protocol";
import type {
  CalendarDetail,
  CalendarEvent,
  CalendarState,
  CalendarStore,
} from "#wow/areas/calendar/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const CALENDAR_READ_TIMEOUT_MS = 5000;

export type CalendarReadResult = { status: "ok"; state: CalendarState };

export type CalendarEventResult =
  | { status: "ok"; detail: CalendarDetail; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarPendingResult = { status: "ok"; pending: number };

export type CalendarActs = {
  get: () => Promise<CalendarReadResult>;
  event: (id: bigint) => Promise<CalendarEventResult>;
  pending: () => Promise<CalendarPendingResult>;
};

type Ctx = AreaRuntimeCtx<CalendarEvent>;

function watch(
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

async function readCalendar(
  ctx: Ctx,
  store: CalendarStore,
): Promise<CalendarReadResult> {
  await watch(
    ctx,
    (seen) => seen.type === "calendar",
    GameOpcode.CMSG_CALENDAR_GET_CALENDAR,
    buildGetCalendar(),
  );
  return { state: store.snapshot(), status: "ok" };
}

async function readEvent(
  ctx: Ctx,
  store: CalendarStore,
  id: bigint,
): Promise<CalendarEventResult> {
  const key = id.toString();
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "event" &&
        candidate.state.details[key] !== undefined) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_GET_EVENT,
    buildGetEvent(id),
  );
  const snapshot = store.snapshot();
  const detail = snapshot.details[key];
  if (detail) return { detail, state: snapshot, status: "ok" };
  if (seen.type === "command_result")
    return { error: seen.error, name: seen.name, status: "refused" };
  throw new Error("timeout");
}

async function readPending(
  ctx: Ctx,
  store: CalendarStore,
): Promise<CalendarPendingResult> {
  await watch(
    ctx,
    (seen) => seen.type === "pending",
    GameOpcode.CMSG_CALENDAR_GET_NUM_PENDING,
    buildGetNumPending(),
  );
  const count = store.snapshot().pending;
  if (count === undefined) throw new Error("timeout");
  return { pending: count, status: "ok" };
}

export function calendarRuntime(
  ctx: Ctx,
  store: CalendarStore,
  _core: CoreStores,
): AreaRuntime<CalendarActs> {
  return {
    act: {
      event: (id) => readEvent(ctx, store, id),
      get: () => readCalendar(ctx, store),
      pending: () => readPending(ctx, store),
    },
    dispose: () => undefined,
  };
}
