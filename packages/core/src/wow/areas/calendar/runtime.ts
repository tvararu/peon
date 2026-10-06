import {
  buildAddEvent,
  buildCopyEvent,
  buildGetCalendar,
  buildGetEvent,
  buildGetNumPending,
  buildRemoveEvent,
  buildUpdateEvent,
  CALENDAR_CREATE_COOLDOWN_MS,
  CALENDAR_DESCRIPTION_MAX,
  CALENDAR_PAST_SLACK_SECONDS,
  CALENDAR_TITLE_MAX,
  CalendarError,
  type CalendarEventSpec,
  CalendarFlag,
  CalendarRank,
  CalendarSendType,
  CalendarStatus,
} from "#wow/areas/calendar/protocol";
import {
  type CalendarCreateResult,
  type CalendarEventResult,
  type CalendarInviteResult,
  type CalendarMutateResult,
  type CalendarPendingResult,
  type CalendarReadResult,
  type Ctx,
  type Env,
  ownEvent,
  type Refusal,
  refusalOf,
  type Target,
  watch,
} from "#wow/areas/calendar/runtime-base";
import {
  answerInvite,
  complainAbout,
  filterGuild,
  invitePlayer,
  queryArenaTeam,
  removeEventInvite,
  setInviteModerator,
  setInviteStatus,
  signupEvent,
} from "#wow/areas/calendar/runtime-invites";
import type { CalendarStore } from "#wow/areas/calendar/store";
import type { AreaRuntime } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

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
  copy: (
    eventId: bigint,
    inviteId: bigint,
    at: CalendarEventSpec["time"],
  ) => Promise<CalendarCreateResult>;
  invite: (eventId: bigint, name: string) => Promise<CalendarInviteResult>;
  answer: (
    eventId: bigint,
    inviteId: bigint,
    status: number,
  ) => Promise<CalendarMutateResult>;
  signup: (
    eventId: bigint,
    tentative: boolean,
  ) => Promise<CalendarMutateResult>;
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

function titleBytes(title: string): number {
  return new TextEncoder().encode(title).length;
}

async function readCalendar(env: Env): Promise<CalendarReadResult> {
  await watch(
    env.ctx,
    (seen) => seen.type === "calendar",
    GameOpcode.CMSG_CALENDAR_GET_CALENDAR,
    buildGetCalendar(),
  );
  return { state: env.store.snapshot(), status: "ok" };
}

async function readEvent(env: Env, id: bigint): Promise<CalendarEventResult> {
  const key = id.toString();
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "event" &&
        candidate.state.details[key] !== undefined) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_GET_EVENT,
    buildGetEvent(id),
  );
  const snapshot = env.store.snapshot();
  const detail = snapshot.details[key];
  if (detail) return { detail, state: snapshot, status: "ok" };
  const refused = refusalOf(seen);
  if (refused) return refused;
  throw new Error("timeout");
}

async function readPending(env: Env): Promise<CalendarPendingResult> {
  await watch(
    env.ctx,
    (seen) => seen.type === "pending",
    GameOpcode.CMSG_CALENDAR_GET_NUM_PENDING,
    buildGetNumPending(),
  );
  const count = env.store.snapshot().pending;
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
  if (
    titleBytes(spec.title) === 0 ||
    titleBytes(spec.title) > CALENDAR_TITLE_MAX
  )
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

async function createEvent(
  env: Env,
  mutable: Mutable,
  spec: CalendarEventSpec,
): Promise<CalendarCreateResult> {
  const snapshot = env.store.snapshot();
  const invalid = checkSpec(
    spec,
    snapshot.serverOffsetSeconds,
    snapshot.serverTime,
  );
  if (invalid) return invalid;
  const elapsed = env.ctx.now() - mutable.lastCreateMs;
  if (elapsed < CALENDAR_CREATE_COOLDOWN_MS)
    return { error: CalendarError.Internal, name: "", status: "refused" };
  mutable.lastCreateMs = env.ctx.now();
  const sentInvite =
    (spec.flags & CalendarFlag.WithoutInvites) === 0
      ? [
          {
            guid: env.ctx.selfGuid(),
            rank: CalendarRank.Owner,
            status: CalendarStatus.Confirmed,
          },
        ]
      : [];
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "event" &&
        candidate.sendType === CalendarSendType.Add) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_ADD_EVENT,
    buildAddEvent(spec, sentInvite),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  if (seen.type !== "event") throw new Error("timeout");
  const fresh = env.store.snapshot();
  const known = Object.keys(fresh.details).find(
    (id) => snapshot.details[id] === undefined,
  );
  const detail = known === undefined ? undefined : fresh.details[known];
  if (!detail)
    return { error: CalendarError.Internal, name: "", status: "refused" };
  env.store.markCreated(detail.eventId);
  return { eventId: detail.eventId, state: fresh, status: "ok" };
}

async function updateEvent(
  env: Env,
  target: Target,
  spec: CalendarEventSpec,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(env.store, target.eventId);
  if (owned) return owned;
  const invalid = checkSpec(
    spec,
    env.store.snapshot().serverOffsetSeconds,
    env.store.snapshot().serverTime,
  );
  if (invalid) return invalid;
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "updated_alert" &&
        candidate.eventId === target.eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_UPDATE_EVENT,
    buildUpdateEvent(target.eventId, target.inviteId, spec),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

async function removeEvent(
  env: Env,
  target: Target,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(env.store, target.eventId);
  if (owned) return owned;
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "removed_alert" &&
        candidate.eventId === target.eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_REMOVE_EVENT,
    buildRemoveEvent(target.eventId, target.inviteId, 0),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

async function copyEvent(
  env: Env,
  target: Target,
  at: CalendarEventSpec["time"],
): Promise<CalendarCreateResult> {
  const owned = ownEvent(env.store, target.eventId);
  if (owned) return owned;
  const before = new Set(Object.keys(env.store.snapshot().details));
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "event" &&
        candidate.sendType === CalendarSendType.Copy) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_COPY_EVENT,
    buildCopyEvent(target.eventId, target.inviteId, at),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  const fresh = env.store.snapshot();
  const known = Object.keys(fresh.details).find((id) => !before.has(id));
  const detail = known === undefined ? undefined : fresh.details[known];
  if (!detail)
    return { error: CalendarError.Internal, name: "", status: "refused" };
  env.store.markCreated(detail.eventId);
  return { eventId: detail.eventId, state: fresh, status: "ok" };
}

export function calendarRuntime(
  ctx: Ctx,
  store: CalendarStore,
  _core: CoreStores,
): AreaRuntime<CalendarActs> {
  const env: Env = { ctx, store };
  const mutable: Mutable = {
    dispose: () => undefined,
    lastCreateMs: -CALENDAR_CREATE_COOLDOWN_MS,
  };
  return {
    act: {
      answer: (eventId, inviteId, status) =>
        answerInvite(env, { eventId, inviteId }, status),
      arenaTeam: (teamId) => queryArenaTeam(env, teamId),
      complain: (eventId, guid) => complainAbout(ctx, eventId, guid),
      copy: (eventId, inviteId, at) =>
        copyEvent(env, { eventId, inviteId }, at),
      create: (spec) => createEvent(env, mutable, spec),
      event: (id) => readEvent(env, id),
      filterGuild: (minLevel, maxLevel, minRank) =>
        filterGuild(env, minLevel, maxLevel, minRank),
      get: () => readCalendar(env),
      invite: (eventId, name) => invitePlayer(env, eventId, name),
      pending: () => readPending(env),
      remove: (eventId, inviteId) => removeEvent(env, { eventId, inviteId }),
      removeInvite: (eventId, inviteId, invitee) =>
        removeEventInvite(env, { eventId, inviteId }, invitee),
      setModerator: (eventId, inviteId, invitee, rank) =>
        setInviteModerator(env, { eventId, inviteId }, invitee, rank),
      setStatus: (eventId, inviteId, invitee, status) =>
        setInviteStatus(env, { eventId, inviteId }, invitee, status),
      signup: (eventId, tentative) => signupEvent(env, eventId, tentative),
      update: (eventId, inviteId, spec) =>
        updateEvent(env, { eventId, inviteId }, spec),
    },
    dispose: () => mutable.dispose(),
  };
}
