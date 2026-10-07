import { buildTeamName, TEAM_EVENT_JOIN } from "#wow/areas/arena/protocol";
import {
  ARENA_ANSWER_MS,
  type Ctx,
  noReply,
} from "#wow/areas/arena/runtime-shared";
import type {
  ArenaAcceptResult,
  ArenaActs,
  ArenaDeclineResult,
  ArenaInviteResult,
} from "#wow/areas/arena/runtime-types";
import type { ArenaEvent, ArenaStore } from "#wow/areas/arena/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const LATE_REFUSAL_MS = 500;

export type ArenaInviteActs = Pick<ArenaActs, "accept" | "decline" | "invite">;

function refusedReason(event: ArenaEvent | undefined): string | undefined {
  if (event?.type === "result" && !event.result.ok) return event.result.error;
  return undefined;
}

async function lateRefusal(ctx: Ctx): Promise<ArenaAcceptResult> {
  const reply = await noReply(
    ctx,
    (incoming) => incoming.type === "result",
    LATE_REFUSAL_MS,
    () => undefined,
  );
  return { reason: refusedReason(reply) ?? "no_answer", status: "refused" };
}

async function settleAccept(
  ctx: Ctx,
  store: ArenaStore,
  pendingTeam: string,
): Promise<ArenaAcceptResult> {
  const self = store.selfName();
  const joined = ctx.until(
    (incoming) =>
      incoming.type === "team_event" &&
      incoming.event === TEAM_EVENT_JOIN &&
      (self === undefined || incoming.strings[0] === self),
    { signal: ctx.signal, timeoutMs: ARENA_ANSWER_MS },
  );
  ctx.send(GameOpcode.CMSG_ARENA_TEAM_ACCEPT);
  try {
    const reply = await joined;
    if (reply.type !== "team_event")
      return { reason: "no_answer", status: "refused" };
    store.clearInvite();
    return { team: reply.strings[1] ?? pendingTeam };
  } catch (error) {
    if (error instanceof Error && error.message === "timeout")
      return lateRefusal(ctx);
    throw error;
  }
}

async function invite(
  ctx: Ctx,
  id: number,
  name: string,
): Promise<ArenaInviteResult> {
  if (!name) throw new Error("arena invite needs a name");
  const reply = await noReply(
    ctx,
    (incoming) => incoming.type === "result",
    ARENA_ANSWER_MS,
    () => ctx.send(GameOpcode.CMSG_ARENA_TEAM_INVITE, buildTeamName(id, name)),
  );
  const reason = refusedReason(reply);
  if (reason !== undefined) return { reason, status: "refused" };
  return { status: "sent" };
}
export function arenaInviteActs(ctx: Ctx, store: ArenaStore): ArenaInviteActs {
  function decline(): Promise<ArenaDeclineResult> {
    if (!store.snapshot().invite)
      return Promise.resolve({ status: "no_invite" });
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_DECLINE);
    store.clearInvite();
    return Promise.resolve({ status: "ok" });
  }

  return {
    accept: () => {
      const pending = store.snapshot().invite;
      if (!pending)
        return Promise.resolve<ArenaAcceptResult>({
          reason: "no_invite",
          status: "refused",
        });
      return settleAccept(ctx, store, pending.team);
    },
    decline,
    invite: (id: number, name: string) => invite(ctx, id, name),
  };
}
