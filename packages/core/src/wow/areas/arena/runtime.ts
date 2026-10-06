import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildBattlefieldPort,
  buildInspectArenaTeams,
  buildJoinArena,
  buildTeamId,
  buildTeamName,
  type ArenaEvent,
  type ArenaInspectRow,
  type ArenaQueue,
  type ArenaRosterMember,
  type ArenaTeam,
  TEAM_EVENT_DISBANDED,
  TEAM_EVENT_JOIN,
  TEAM_EVENT_LEADER_CHANGED,
} from "#wow/areas/arena/protocol";
import type { ArenaStore } from "#wow/areas/arena/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const ARENA_ANSWER_MS = 5000;
export const ARENA_INSPECT_MS = 3000;
export const BG_TYPE_ARENA = 6;

export type ArenaQueryResult = { team: ArenaTeam };
export type ArenaRosterResult = { id: number; members: ArenaRosterMember[] };
export type ArenaInviteResult = { status: "sent" } | { status: "refused"; reason: string };
export type ArenaAcceptResult = { team: string } | { status: "refused"; reason: string };
export type ArenaSimpleResult = { status: "ok" } | { status: "refused"; reason: string } | { status: "no_reply" };
export type ArenaInspectResult = { guid: bigint; rows: ArenaInspectRow[] };
export type ArenaJoinResult =
  | { status: "queued"; slot: number; queue: ArenaQueue[] }
  | { status: "refused"; reason: string }
  | { status: "no_teams"; arenaType: number }
  | { status: "no_reply" };

export type ArenaActs = {
  refresh: () => Promise<ArenaTeam[]>;
  query: (id: number) => Promise<ArenaQueryResult>;
  roster: (id: number) => Promise<ArenaRosterResult>;
  invite: (id: number, name: string) => Promise<ArenaInviteResult>;
  accept: () => Promise<ArenaAcceptResult>;
  decline: () => Promise<{ status: "ok" } | { status: "no_invite" }>;
  leave: (id: number) => Promise<ArenaSimpleResult>;
  remove: (id: number, name: string) => Promise<ArenaSimpleResult>;
  disband: (id: number) => Promise<ArenaSimpleResult>;
  setLeader: (id: number, name: string) => Promise<ArenaSimpleResult>;
  inspect: (guid: bigint) => Promise<ArenaInspectResult>;
  joinQueue: (master: bigint, slot: number, rated: boolean) => Promise<ArenaJoinResult>;
  leaveQueue: (slot: number) => Promise<{ status: "left" } | { status: "no_slot" }>;
};

type Ctx = AreaRuntimeCtx<ArenaEvent>;

function noReply(ctx: Ctx, match: (event: ArenaEvent) => boolean, timeoutMs: number, send: () => void): Promise<ArenaEvent | undefined> {
  const cancel = new AbortController();
  const answered = ctx.until(match, {
    signal: AbortSignal.any([ctx.signal, cancel.signal]),
    timeoutMs,
  });
  answered.catch(ignoreFailure);
  try {
    send();
  } catch (error) {
    cancel.abort();
    throw error;
  }
  return answered.then(
    (event) => event,
    (error: unknown) => {
      if (error instanceof Error && error.message === "timeout") return undefined;
      throw error;
    },
  );
}

function eventStrings(event: ArenaEvent & { type: "team_event" }): string[] {
  return event.strings;
}

export function arenaRuntime(ctx: Ctx, store: ArenaStore, _core: CoreStores): AreaRuntime<ArenaActs> {
  async function oneTeam(id: number): Promise<ArenaTeam> {
    const answered = ctx.until(
      (event) => (event.type === "team" || event.type === "stats") && event.id === id,
      { signal: ctx.signal, timeoutMs: ARENA_ANSWER_MS },
    );
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_QUERY, buildTeamId(id));
    const event = await answered;
    if (event.type !== "team" && event.type !== "stats") throw new Error("no_answer");
    const team = store.team(id);
    if (!team) throw new Error("no_answer");
    return team;
  }

  async function refresh(): Promise<ArenaTeam[]> {
    const ids = store.teamIds();
    const teams: ArenaTeam[] = [];
    for (const id of ids) teams.push(await oneTeam(id));
    return teams;
  }

  async function query(id: number): Promise<ArenaQueryResult> {
    return { team: await oneTeam(id) };
  }

  async function roster(id: number): Promise<ArenaRosterResult> {
    const answered = ctx.until(
      (event) => event.type === "roster" && event.id === id,
      { signal: ctx.signal, timeoutMs: ARENA_ANSWER_MS },
    );
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_ROSTER, buildTeamId(id));
    const event = await answered;
    if (event.type !== "roster") throw new Error("no_answer");
    return { id, members: [...event.members] };
  }

  async function invite(id: number, name: string): Promise<ArenaInviteResult> {
    if (!name) throw new Error("arena invite needs a name");
    const refused = await noReply(
      ctx,
      (event) => event.type === "result",
      ARENA_ANSWER_MS,
      () => ctx.send(GameOpcode.CMSG_ARENA_TEAM_INVITE, buildTeamName(id, name)),
    );
    if (refused?.type === "result" && !refused.result.ok)
      return { reason: refused.result.error, status: "refused" };
    return { status: "sent" };
  }

  async function accept(): Promise<ArenaAcceptResult> {
    const pending = store.snapshot().invite;
    if (!pending) return { reason: "no_invite", status: "refused" };
    const self = store.selfName();
    const joined = ctx.until(
      (event) =>
        event.type === "team_event" &&
        event.event === TEAM_EVENT_JOIN &&
        (self === undefined || eventStrings(event)[0] === self),
      { signal: ctx.signal, timeoutMs: ARENA_ANSWER_MS },
    );
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_ACCEPT);
    try {
      const event = await joined;
      if (event.type !== "team_event") return { reason: "no_answer", status: "refused" };
      store.clearInvite();
      return { team: eventStrings(event)[1] ?? pending.team };
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        const refused = await noReply(
          ctx,
          (event) => event.type === "result",
          500,
          () => undefined,
        );
        if (refused?.type === "result" && !refused.result.ok)
          return { reason: refused.result.error, status: "refused" };
        return { reason: "no_answer", status: "refused" };
      }
      throw error;
    }
  }

  async function decline(): Promise<{ status: "ok" } | { status: "no_invite" }> {
    if (!store.snapshot().invite) return { status: "no_invite" };
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_DECLINE);
    store.clearInvite();
    return { status: "ok" };
  }

  async function change(
    opcode: number,
    body: Uint8Array,
    done: (event: ArenaEvent) => boolean,
  ): Promise<ArenaSimpleResult> {
    const event = await noReply(ctx, done, ARENA_ANSWER_MS, () => ctx.send(opcode, body));
    if (!event) return { status: "no_reply" };
    if (event.type === "result")
      return event.result.ok ? { status: "ok" } : { reason: event.result.error, status: "refused" };
    return { status: "ok" };
  }

  const leave: ArenaActs["leave"] = (id) =>
    change(GameOpcode.CMSG_ARENA_TEAM_LEAVE, buildTeamId(id), (event) =>
      (event.type === "result" && (event.result.action === "quit" || event.result.action === "create")) ||
      (event.type === "team_event" && eventStrings(event).includes(store.team(id)?.name ?? "")),
    );

  const remove: ArenaActs["remove"] = (id, name) => {
    if (!name) throw new Error("arena remove needs a name");
    return change(GameOpcode.CMSG_ARENA_TEAM_REMOVE, buildTeamName(id, name), (event) =>
      (event.type === "result") ||
      (event.type === "team_event" && event.event === TEAM_EVENT_REMOVE && eventStrings(event)[0] === name),
    );
  };

  const disband: ArenaActs["disband"] = (id) =>
    change(GameOpcode.CMSG_ARENA_TEAM_DISBAND, buildTeamId(id), (event) =>
      (event.type === "team_event" && event.event === TEAM_EVENT_DISBANDED) ||
      (event.type === "result" && !event.result.ok),
    );

  const setLeader: ArenaActs["setLeader"] = (id, name) => {
    if (!name) throw new Error("arena leader needs a name");
    return change(GameOpcode.CMSG_ARENA_TEAM_LEADER, buildTeamName(id, name), (event) =>
      (event.type === "result") ||
      (event.type === "team_event" && event.event === TEAM_EVENT_LEADER_CHANGED && eventStrings(event)[1] === name),
    );
  };

  async function inspect(guid: bigint): Promise<ArenaInspectResult> {
    const answered = ctx.until(
      (event) => event.type === "inspect" && event.guid === guid,
      { signal: ctx.signal, timeoutMs: ARENA_INSPECT_MS },
    );
    ctx.send(GameOpcode.MSG_INSPECT_ARENA_TEAMS, buildInspectArenaTeams(guid));
    try {
      const event = await answered;
      if (event.type !== "inspect") throw new Error("no_answer");
      return { guid, rows: [...event.rows] };
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") return { guid, rows: [] };
      throw error;
    }
  }

  async function joinQueue(master: bigint, slot: number, rated: boolean): Promise<ArenaJoinResult> {
    if (slot < 0 || slot > 2) throw new Error(`arena slot ${slot} is not 0, 1 or 2`);
    const event = await noReply(
      ctx,
      (event) =>
        (event.type === "queue" && event.queue.some((row) => row.kind === "queued")) ||
        event.type === "queue_refused" ||
        event.type === "arena_error",
      ARENA_ANSWER_MS,
      () => ctx.send(GameOpcode.CMSG_BATTLEMASTER_JOIN_ARENA, buildJoinArena(master, slot, false, rated)),
    );
    if (!event) return { status: "no_reply" };
    if (event.type === "queue_refused") return { reason: `queue_${event.result}`, status: "refused" };
    if (event.type === "arena_error")
      return event.arenaType === undefined
        ? { reason: "arena_error", status: "refused" }
        : { arenaType: event.arenaType, status: "no_teams" };
    const queued = event.queue.find((row) => row.kind === "queued");
    if (!queued) return { status: "no_reply" };
    return { queue: [...event.queue], slot: queued.slot, status: "queued" };
  }

  async function leaveQueue(slot: number): Promise<{ status: "left" } | { status: "no_slot" }> {
    const current = store.snapshot().queue.find((row) => row.slot === slot);
    if (!current || current.kind === "none") return { status: "no_slot" };
    await noReply(
      ctx,
      (event) =>
        event.type === "queue" && !event.queue.some((row) => row.slot === slot && row.kind !== "none"),
      ARENA_ANSWER_MS,
      () => ctx.send(GameOpcode.CMSG_BATTLEFIELD_PORT, buildBattlefieldPort(current.arenaType, BG_TYPE_ARENA, false)),
    );
    return { status: "left" };
  }

  return {
    act: {
      accept,
      decline,
      disband,
      inspect,
      invite,
      joinQueue,
      leave,
      leaveQueue,
      query,
      refresh,
      remove,
      roster,
      setLeader,
    },
    dispose: () => undefined,
  };
}
