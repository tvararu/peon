import {
  buildArenaTeam,
  buildComplain,
  buildEventInvite,
  buildEventRsvp,
  buildEventSignup,
  buildEventStatus,
  buildGuildFilter,
  buildModeratorStatus,
  buildRemoveInvite,
  CalendarError,
} from "#wow/areas/calendar/protocol";
import {
  type CalendarInviteResult,
  type CalendarMutateResult,
  type Ctx,
  type Env,
  ownEvent,
  refusalOf,
  type Target,
  watch,
} from "#wow/areas/calendar/runtime-base";
import { GameOpcode } from "#wow/protocol/opcodes";

export async function invitePlayer(
  env: Env,
  eventId: bigint,
  name: string,
): Promise<CalendarInviteResult> {
  const owned = ownEvent(env.store, eventId);
  if (owned) return owned;
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "invite" && candidate.eventId === eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_INVITE,
    buildEventInvite({
      eventId,
      inviteId: 0n,
      name,
      isPreInvite: false,
      isGuildEvent: false,
    }),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export async function answerInvite(
  env: Env,
  target: Target,
  status: number,
): Promise<CalendarMutateResult> {
  const key = target.eventId.toString();
  const seen = await watch(
    env.ctx,
    (candidate) =>
      ((candidate.type === "status" || candidate.type === "clear_pending") &&
        candidate.state.details[key] !== undefined) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_RSVP,
    buildEventRsvp(target.eventId, target.inviteId, status),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export async function signupEvent(
  env: Env,
  eventId: bigint,
  tentative: boolean,
): Promise<CalendarMutateResult> {
  const key = eventId.toString();
  const seen = await watch(
    env.ctx,
    (candidate) =>
      ((candidate.type === "invite" || candidate.type === "clear_pending") &&
        (candidate.type !== "invite" || candidate.eventId === eventId)) ||
      (candidate.type === "status" &&
        candidate.state.details[key] !== undefined) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_SIGNUP,
    buildEventSignup(eventId, tentative),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export async function setInviteStatus(
  env: Env,
  target: Target,
  invitee: bigint,
  status: number,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(env.store, target.eventId);
  if (owned) return owned;
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "status" && candidate.eventId === target.eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_STATUS,
    buildEventStatus(
      {
        invitee,
        eventId: target.eventId,
        inviteId: target.inviteId,
        ownerInviteId: target.inviteId,
      },
      status,
    ),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export async function removeEventInvite(
  env: Env,
  target: Target,
  invitee: bigint,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(env.store, target.eventId);
  if (owned) return owned;
  if (invitee === env.ctx.selfGuid())
    return {
      error: CalendarError.DeleteCreatorFailed,
      name: "",
      status: "refused",
    };
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "invite_removed" &&
        candidate.eventId === target.eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_REMOVE_INVITE,
    buildRemoveInvite(
      invitee,
      target.inviteId,
      target.inviteId,
      target.eventId,
    ),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export async function setInviteModerator(
  env: Env,
  target: Target,
  invitee: bigint,
  rank: number,
): Promise<CalendarMutateResult> {
  const owned = ownEvent(env.store, target.eventId);
  if (owned) return owned;
  const seen = await watch(
    env.ctx,
    (candidate) =>
      (candidate.type === "moderator_alert" &&
        candidate.eventId === target.eventId) ||
      candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_EVENT_MODERATOR_STATUS,
    buildModeratorStatus(
      {
        invitee,
        eventId: target.eventId,
        inviteId: target.inviteId,
        ownerInviteId: target.inviteId,
      },
      rank,
    ),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export function complainAbout(ctx: Ctx, eventId: bigint, guid: bigint): void {
  ctx.send(GameOpcode.CMSG_CALENDAR_COMPLAIN, buildComplain(eventId, guid));
}

export async function filterGuild(
  env: Env,
  minLevel: number,
  maxLevel: number,
  minRank: number,
): Promise<CalendarMutateResult> {
  const seen = await watch(
    env.ctx,
    (candidate) =>
      candidate.type === "filter_guild" || candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_GUILD_FILTER,
    buildGuildFilter(minLevel, maxLevel, minRank),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}

export async function queryArenaTeam(
  env: Env,
  teamId: number,
): Promise<CalendarMutateResult> {
  const seen = await watch(
    env.ctx,
    (candidate) =>
      candidate.type === "arena_team" || candidate.type === "command_result",
    GameOpcode.CMSG_CALENDAR_ARENA_TEAM,
    buildArenaTeam(teamId),
  );
  const refused = refusalOf(seen);
  if (refused) return refused;
  return { state: env.store.snapshot(), status: "ok" };
}
