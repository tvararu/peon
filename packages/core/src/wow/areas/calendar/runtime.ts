import { ignoreFailure } from "#lib/ignore-failure";
import {
  CALENDAR_CREATE_COOLDOWN_MS,
  CALENDAR_DESCRIPTION_MAX,
  CALENDAR_PAST_SLACK_SECONDS,
  CALENDAR_TITLE_MAX,
  CalendarError,
  CalendarFlag,
  CalendarRank,
  CalendarSendType,
  CalendarStatus,
  type CalendarEventSpec,
  buildAddEvent,
  buildArenaTeam,
  buildComplain,
  buildCopyEvent,
  buildEventInvite,
  buildEventRsvp,
  buildEventSignup,
  buildEventStatus,
  buildGetCalendar,
  buildGetEvent,
  buildGetNumPending,
  buildGuildFilter,
  buildModeratorStatus,
  buildRemoveEvent,
  buildRemoveInvite,
  buildUpdateEvent,
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

export type CalendarCreateResult =
  | { status: "ok"; eventId: bigint; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarMutateResult =
  | { status: "ok"; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarInviteResult =
  | { status: "ok"; state: CalendarState }
  | { status: "refused"; error: number; name: string };

export type CalendarActs = {
  get: () => Promise<CalendarReadResult>;
  event: (id: bigint) => Promise<CalendarEventResult>;
  pending: () => Promise<CalendarPendingResult>;
  create: (spec: CalendarEventSpec) => Promise<CalendarCreateResult>;
  update: (
    eventId: bigint,
    inviteId: bigint,
    spec: CalendarEventSpec,
  ) => Promise<CalendarMutateResult>;
  remove: (eventId: bigint, inviteId: bigint) => Promise<CalendarMutateResult>;
  copy: (eventId: bigint, inviteId: bigint, at: CalendarEventSpec["time"]) => Promise<CalendarCreateResult>;
  invite: (eventId: bigint, name: string) => Promise<CalendarInviteResult>;
  answer: (
    eventId: bigint,
    inviteId: bigint,
    status: number,
  ) => Promise<CalendarMutateResult>;
  signup: (eventId: bigint, tentative: boolean) => Promise<CalendarMutateResult>;
  setStatus: (
    eventId: bigint,
    inviteId: bigint,
    invitee: bigint,
    status: number,
  ) => Promise<CalendarMutateResult>;
  removeInvite: (
    eventId: bigint,
    inviteId: bigint,
    invitee: bigint,
  ) => Promise<CalendarMutateResult>;
  setModerator: (
    eventId: bigint,
    inviteId: bigint,
    invitee: bigint,
    rank: number,
  ) => Promise<CalendarMutateResult>;
  complain: (eventId: bigint, guid: bigint) => void;
  filterGuild: (
    minLevel: number,
    maxLevel: number,
    minRank: number,
  ) => Promise<CalendarMutateResult>;
  arenaTeam: (teamId: number) => Promise<CalendarMutateResult>;
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

type Refusal = { status: "refused"; error: number; name: string };

function refusalOf(seen: CalendarEvent): Refusal | undefined {
  if (seen.type !== "command_result") return undefined;
  return { error: seen.error, name: seen.name, status: "refused" };
}

function titleBytes(title: string): number {
  return new TextEncoder().encode(title).length;
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
  const refused = refusalOf(seen);
  if (refused) return refused;
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

function timeToEpoch(time: CalendarEventSpec["time"]): number {
  return Math.floor(
    Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute) /
      1000,
  );
}

function checkSpec(
  spec: CalendarEventSpec,
  offset: number | undefined,
  serverTime: number | undefined,
): Refusal | undefined {
  if (titleBytes(spec.title) === 0 || titleBytes(spec.title) > CALENDAR_TITLE_MAX)
    return { error: CalendarError.NeedsTitle, name: "", status: "refused" };
  if (titleBytes(spec.description) > CALENDAR_DESCRIPTION_MAX)
    return { error: CalendarError.Internal, name: "", status: "refused" };
  if (
    offset !== undefined &&
    serverTime !== undefined &&
    timeToEpoch(spec.time) + offset <
      serverTime + offset - CALENDAR_PAST_SLACK_SECONDS
  )
    return { error: CalendarError.EventPassed, name: "", status: "refused" };
  return undefined;
}

type Mutable = {
  lastCreateMs: number;
  dispose: () => void;
};

function createdIds(store: CalendarStore): readonly bigint[] {
  return store.snapshot().createdByMe;
}

function ownEvent(
  store: CalendarStore,
  eventId: bigint,
): Refusal | undefined {
  if (!createdIds(store).includes(eventId))
    return { error: CalendarError.EventInvalid, name: "", status: "refused" };
  return undefined;
}

async function createEvent(
  ctx: Ctx,
  store: CalendarStore,
  mutable: Mutable,
  spec: CalendarEventSpec,
): Promise<CalendarCreateResult> {
  const snapshot = store.snapshot();
  const invalid = checkSpec(spec, snapshot.serverOffsetSeconds, snapshot.serverTime);
  if (invalid) return invalid;
  const elapsed = ctx.now() - mutable.lastCreateMs;
  if (elapsed < CALENDAR_CREATE_COOLDOWN_MS)
    return { error: CalendarError.Internal, name: "", status: "refused" };
  mutable.lastCreateMs = ctx.now();
  const sentInvite =
    (spec.flags & CalendarFlag.WithoutInvites) === 0
      ? [{ guid: ctx.selfGuid(), rank: CalendarRank.Owner, status: CalendarStatus.Confirmed }]
      : [];
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "event" && candidate.sendType === CalendarSendType.Add) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_ADD_EVENT,
    buildAddEvent(spec, sentInvite),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  if (seen.type !== "event") throw new Error("timeout");
  const fresh = store.snapshot();
  const known = Object.keys(fresh.details).find(
    (id) => snapshot.details[id] === undefined,
  );
  const detail = known === undefined ? undefined : fresh.details[known];
  if (!detail) return { error: CalendarError.Internal, name: "", status: "refused" };
  store.markCreated(detail.eventId);
  return { eventId: detail.eventId, state: fresh, status: "ok" };
}

async function updateEvent(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
  spec: CalendarEventSpec,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  const invalid = checkSpec(
    spec,
    store.snapshot().serverOffsetSeconds,
    store.snapshot().serverTime,
  );
  if (invalid) return invalid;
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "updated_alert" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_UPDATE_EVENT,
    buildUpdateEvent(eventId, inviteId, spec),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function removeEvent(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "removed_alert" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_REMOVE_EVENT,
    buildRemoveEvent(eventId, inviteId, 0),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function copyEvent(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
  at: CalendarEventSpec["time"],
): Promise<CalendarCreateResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  const before = new Set(Object.keys(store.snapshot().details));
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "event" && candidate.sendType === CalendarSendType.Copy) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_COPY_EVENT,
    buildCopyEvent(eventId, inviteId, at),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  const fresh = store.snapshot();
  const known = Object.keys(fresh.details).find((id) => !before.has(id));
  const detail = known === undefined ? undefined : fresh.details[known];
  if (!detail) return { error: CalendarError.Internal, name: "", status: "refused" };
  store.markCreated(detail.eventId);
  return { eventId: detail.eventId, state: fresh, status: "ok" };
}

async function invitePlayer(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  name: string,
): Promise<CalendarInviteResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "invite" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_INVITE,
    buildEventInvite(eventId, 0n, name, false, false),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function answerInvite(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
  status: number,
): Promise<CalendarMutateResult> {
  const key = eventId.toString();
  const seen = await watch(
    ctx,
    (candidate) =>
      ((candidate.type === "status" || candidate.type === "clear_pending") &&
        candidate.state.details[key] !== undefined) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_RSVP,
    buildEventRsvp(eventId, inviteId, status),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function signupEvent(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  tentative: boolean,
): Promise<CalendarMutateResult> {
  const key = eventId.toString();
  const seen = await watch(
    ctx,
    (candidate) =>
      ((candidate.type === "invite" || candidate.type === "clear_pending") &&
        (candidate.type !== "invite" || candidate.eventId === eventId)) ||
      (candidate.type === "status" && candidate.state.details[key] !== undefined) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_SIGNUP,
    buildEventSignup(eventId, tentative),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function setInviteStatus(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
  invitee: bigint,
  status: number,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "status" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_STATUS,
    buildEventStatus(invitee, eventId, inviteId, inviteId, status),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function removeEventInvite(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
  invitee: bigint,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  if (invitee === ctx.selfGuid())
    return { error: CalendarError.DeleteCreatorFailed, name: "", status: "refused" };
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "invite_removed" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_REMOVE_INVITE,
    buildRemoveInvite(invitee, inviteId, inviteId, eventId),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function setInviteModerator(
  ctx: Ctx,
  store: CalendarStore,
  eventId: bigint,
  inviteId: bigint,
  invitee: bigint,
  rank: number,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(store, eventId);
  if (owned) return owned;
  const seen = await watch(
    ctx,
    (candidate) =>
      (candidate.type === "moderator_alert" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_MODERATOR_STATUS,
    buildModeratorStatus(invitee, eventId, inviteId, inviteId, rank),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

function complainAbout(ctx: Ctx, eventId: bigint, guid: bigint): void {
  ctx.send(GameOpcode.CMSG_CALENDAR_COMPLAIN, buildComplain(eventId, guid));
}

async function filterGuild(
  ctx: Ctx,
  store: CalendarStore,
  minLevel: number,
  maxLevel: number,
  minRank: number,
): Promise<CalendarMutateResult> {
  const seen = await watch(
    ctx,
    (candidate) =>
      candidate.type === "filter_guild" || candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_GUILD_FILTER,
    buildGuildFilter(minLevel, maxLevel, minRank),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

async function queryArenaTeam(
  ctx: Ctx,
  store: CalendarStore,
  teamId: number,
): Promise<CalendarMutateResult> {
  const seen = await watch(
    ctx,
    (candidate) =>
      candidate.type === "arena_team" || candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_ARENA_TEAM,
    buildArenaTeam(teamId),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: store.snapshot(), status: "ok" };
}

export function calendarRuntime(
  ctx: Ctx,
  store: CalendarStore,
  _core: CoreStores,
): AreaRuntime<CalendarActs> {
  const mutable: Mutable = { dispose: () => undefined, lastCreateMs: -CALENDAR_CREATE_COOLDOWN_MS };
  return {
    act: {
      answer: (eventId, inviteId, status) => answerInvite(ctx, store, eventId, inviteId, status),
      arenaTeam: (teamId) => queryArenaTeam(ctx, store, teamId),
      complain: (eventId, guid) => complainAbout(ctx, eventId, guid),
      copy: (eventId, inviteId, at) => copyEvent(ctx, store, eventId, inviteId, at),
      create: (spec) => createEvent(ctx, store, mutable, spec),
      event: (id) => readEvent(ctx, store, id),
      filterGuild: (minLevel, maxLevel, minRank) => filterGuild(ctx, store, minLevel, maxLevel, minRank),
      get: () => readCalendar(ctx, store),
      invite: (eventId, name) => invitePlayer(ctx, store, eventId, name),
      pending: () => readPending(ctx, store),
      remove: (eventId, inviteId) => removeEvent(ctx, store, eventId, inviteId),
      removeInvite: (eventId, inviteId, invitee) => removeEventInvite(ctx, store, eventId, inviteId, invitee),
      setModerator: (eventId, inviteId, invitee, rank) => setInviteModerator(ctx, store, eventId, inviteId, invitee, rank),
      setStatus: (eventId, inviteId, invitee, status) => setInviteStatus(ctx, store, eventId, inviteId, invitee, status),
      signup: (eventId, tentative) => signupEvent(ctx, store, eventId, tentative),
      update: (eventId, inviteId, spec) => updateEvent(ctx, store, eventId, inviteId, spec),
    },
    dispose: () => mutable.dispose(),
  };
}
