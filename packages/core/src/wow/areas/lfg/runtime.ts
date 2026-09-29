import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLfgComment,
  buildLfgGetStatus,
  buildLfgJoin,
  buildLfgLeave,
  buildLfgSetRoles,
  buildPartyLockInfoRequest,
  buildPlayerLockInfoRequest,
  LFG_MAX_ENTRIES,
} from "#wow/areas/lfg/protocol";
import type {
  LfgEvent,
  LfgLockView,
  LfgPartyLocks,
  LfgRandomView,
  LfgStore,
} from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const LFG_REQUEST_TIMEOUT_MS = 5000;

export type LfgOutcome<T = Readonly<Record<never, never>>> =
  | ({ status: "ok" } & T)
  | { status: "refused"; reason: string }
  | { status: "no_answer" };

export type LfgStatusResult = LfgOutcome;
export type LfgDungeonsResult = LfgOutcome<{
  available: readonly LfgRandomView[];
  locks: readonly LfgLockView[];
}>;
export type LfgPartyLocksResult = LfgOutcome<{
  partyLocks: readonly LfgPartyLocks[];
}>;
export type LfgJoinResult = LfgOutcome<{
  queued: readonly number[];
  roleCheck: boolean;
}>;
export type LfgLeaveResult = LfgOutcome;
export type LfgSetRolesResult = LfgOutcome<{ roles: number }>;
export type LfgCommentResult = LfgOutcome;
export type LfgActs = {
  requestStatus: () => Promise<LfgStatusResult>;
  requestDungeons: () => Promise<LfgDungeonsResult>;
  requestPartyLocks: () => Promise<LfgPartyLocksResult>;
  join: (join: {
    roles: number;
    entries: readonly number[];
    comment?: string;
  }) => Promise<LfgJoinResult>;
  leave: () => Promise<LfgLeaveResult>;
  setRoles: (roles: number) => Promise<LfgSetRolesResult>;
  setComment: (comment: string) => Promise<LfgCommentResult>;
};

type Ctx = AreaRuntimeCtx<LfgEvent>;
type Env = { ctx: Ctx; store: LfgStore };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function guard(running: { count: number }) {
  return async <T>(body: () => Promise<T>): Promise<T> => {
    if (running.count > 0) return { status: "refused", reason: "busy" } as T;
    running.count += 1;
    try {
      return await body();
    } finally {
      running.count -= 1;
    }
  };
}

async function waitForStatus(
  ctx: Ctx,
  grouped: boolean,
  signal: AbortSignal,
): Promise<void> {
  const seen = { player: false, party: !grouped };
  await ctx.until(
    (event) => {
      if (event.type !== "status" || event.source === "search") return false;
      if (event.source === "player") seen.player = true;
      if (event.source === "party") seen.party = true;
      return seen.player && seen.party;
    },
    { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal },
  );
}

function requestScope(): { abort: AbortController } {
  return { abort: new AbortController() };
}

function statusAct({ ctx }: Env) {
  return async (): Promise<LfgStatusResult> => {
    const scope = requestScope();
    const wait = waitForStatus(
      ctx,
      ctx.legacy.party().members.length > 0,
      scope.abort.signal,
    );
    wait.catch(() => undefined);
    try {
      ctx.send(GameOpcode.CMSG_LFG_GET_STATUS, buildLfgGetStatus());
    } catch (error) {
      scope.abort.abort();
      throw error;
    }
    try {
      await wait;
      return { status: "ok" };
    } catch (error) {
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function dungeonsAct({ ctx, store }: Env) {
  return async (): Promise<LfgDungeonsResult> => {
    const scope = requestScope();
    const wait = ctx.until(
      (event) => event.type === "dungeons" && event.scope === "player",
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal: scope.abort.signal },
    );
    wait.catch(() => undefined);
    try {
      ctx.send(
        GameOpcode.CMSG_LFD_PLAYER_LOCK_INFO_REQUEST,
        buildPlayerLockInfoRequest(),
      );
    } catch (error) {
      scope.abort.abort();
      throw error;
    }
    try {
      await wait;
      const state = store.snapshot();
      return { status: "ok", available: state.available, locks: state.locks };
    } catch (error) {
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function partyLocksAct({ ctx, store }: Env) {
  return async (): Promise<LfgPartyLocksResult> => {
    if (ctx.legacy.party().members.length === 0)
      return { status: "refused", reason: "not_in_group" };
    const scope = requestScope();
    const wait = ctx.until(
      (event) => event.type === "dungeons" && event.scope === "party",
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal: scope.abort.signal },
    );
    wait.catch(() => undefined);
    try {
      ctx.send(
        GameOpcode.CMSG_LFD_PARTY_LOCK_INFO_REQUEST,
        buildPartyLockInfoRequest(),
      );
    } catch (error) {
      scope.abort.abort();
      throw error;
    }
    try {
      await wait;
      return { status: "ok", partyLocks: store.snapshot().partyLocks };
    } catch (error) {
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function knownEntry(store: LfgStore, entry: number): boolean {
  const state = store.snapshot();
  if (state.available.some((d) => d.entry === entry)) return true;
  return state.locks.some((l) => l.entry === entry);
}

type PartyView = {
  inGroup: boolean;
  leader: string | null;
  members: readonly { name: string }[];
};

function selfLeads(party: PartyView): boolean {
  return (
    party.inGroup &&
    party.leader !== null &&
    !party.members.some((m) => m.name === party.leader)
  );
}

function joinAct({ ctx, store }: Env) {
  return async (join: {
    roles: number;
    entries: readonly number[];
    comment?: string;
  }): Promise<LfgJoinResult> => {
    const scope = requestScope();
    if (join.roles === 0) return { status: "refused", reason: "no_role" };
    if (join.entries.length > LFG_MAX_ENTRIES)
      return { status: "refused", reason: "too_many" };
    const party = ctx.legacy.party();
    if (party.inGroup && !selfLeads(party))
      return { status: "refused", reason: "not_leader" };
    const fresh = store.snapshot();
    if (fresh.status === "proposal")
      return { status: "refused", reason: "busy_proposal" };
    const entries = [...join.entries];
    const random = entries.filter((e) => e >>> 24 === 1);
    if (random.length > 0 && entries.length > 1)
      return { status: "refused", reason: "mixed_random" };
    for (const entry of entries) {
      if (!knownEntry(store, entry))
        return { status: "refused", reason: "unknown_dungeon" };
    }
    const resultWait = ctx.until((event) => event.type === "join_result", {
      timeoutMs: LFG_REQUEST_TIMEOUT_MS,
      signal: scope.abort.signal,
    });
    resultWait.catch(() => undefined);
    const queuedWait = ctx.until(
      (event) =>
        (event.type === "status" &&
          event.status === "queued" &&
          event.source !== "search") ||
        (event.type === "role_check" && event.state === 2),
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal: scope.abort.signal },
    );
    queuedWait.catch(() => undefined);
    try {
      ctx.send(
        GameOpcode.CMSG_LFG_JOIN,
        buildLfgJoin({
          roles: join.roles,
          entries,
          comment: join.comment ?? "",
        }),
      );
    } catch (error) {
      scope.abort.abort();
      throw error;
    }
    try {
      const first = await Promise.race([
        resultWait.then((result) => ({ kind: "result" as const, result })),
        queuedWait.then((event) => ({ kind: "queued" as const, event })),
      ]);
      if (first.kind === "queued" && first.event.type === "role_check") {
        scope.abort.abort();
        return { status: "ok", queued: entries, roleCheck: true };
      }
      if (first.kind === "result") {
        if (
          first.result.type === "join_result" &&
          first.result.reason !== "ok"
        ) {
          const after = store.snapshot();
          scope.abort.abort();
          return {
            status: "refused",
            reason: first.result.reason,
            partyLocks: after.joinResult?.partyLocks ?? [],
          } as LfgJoinResult;
        }
        const settled = await queuedWait;
        scope.abort.abort();
        if (settled.type === "role_check")
          return { status: "ok", queued: entries, roleCheck: true };
        const queued = store.snapshot().selected;
        return {
          status: "ok",
          queued: queued.length > 0 ? queued : entries,
          roleCheck: false,
        };
      }
      scope.abort.abort();
      const queued = store.snapshot().selected;
      return {
        status: "ok",
        queued: queued.length > 0 ? queued : entries,
        roleCheck: false,
      };
    } catch (error) {
      scope.abort.abort();
      if (isTimeout(error))
        return { status: "refused", reason: "lfg_disabled_or_ignored" };
      throw error;
    }
  };
}

function leaveAct({ ctx }: Env) {
  return async (): Promise<LfgLeaveResult> => {
    const scope = requestScope();
    const wait = ctx.until(
      (event) =>
        event.type === "status" &&
        event.status === "none" &&
        event.source !== "search",
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal: scope.abort.signal },
    );
    wait.catch(() => undefined);
    try {
      ctx.send(GameOpcode.CMSG_LFG_LEAVE, buildLfgLeave());
    } catch (error) {
      scope.abort.abort();
      throw error;
    }
    try {
      await wait;
      scope.abort.abort();
      return { status: "ok" };
    } catch (error) {
      scope.abort.abort();
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function setRolesAct({ ctx, store }: Env) {
  return async (roles: number): Promise<LfgSetRolesResult> => {
    const current = store.snapshot().roleCheck;
    if (current === undefined || !current.initializing)
      return { status: "refused", reason: "no_role_check" };
    const scope = requestScope();
    const self = ctx.selfGuid();
    const wait = ctx.until(
      (event) => event.type === "role_chosen" && event.guid === self,
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal: scope.abort.signal },
    );
    wait.catch(() => undefined);
    try {
      ctx.send(GameOpcode.CMSG_LFG_SET_ROLES, buildLfgSetRoles(roles));
    } catch (error) {
      scope.abort.abort();
      throw error;
    }
    try {
      const chosen = await wait;
      scope.abort.abort();
      if (chosen.type === "role_chosen")
        return { status: "ok", roles: chosen.roles };
      throw new Error("unreachable");
    } catch (error) {
      scope.abort.abort();
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function setCommentAct({ ctx }: Env) {
  return async (comment: string): Promise<LfgCommentResult> => {
    if (new TextEncoder().encode(comment).length > 64)
      return { status: "refused", reason: "too_long" };
    ctx.send(GameOpcode.CMSG_SET_LFG_COMMENT, buildLfgComment(comment));
    return { status: "ok" };
  };
}
export function lfgRuntime(ctx: Ctx, store: LfgStore): AreaRuntime<LfgActs> {
  const env: Env = { ctx, store };
  const run = guard({ count: 0 });
  const requestStatus = () => run(statusAct(env));
  const requestDungeons = () => run(dungeonsAct(env));
  const requestPartyLocks = () => run(partyLocksAct(env));
  const join = (join: {
    roles: number;
    entries: readonly number[];
    comment?: string;
  }) => run(() => joinAct(env)(join));
  const leave = () => run(leaveAct(env));
  const setRoles = (roles: number) => run(() => setRolesAct(env)(roles));
  const setComment = (comment: string) =>
    run(() => setCommentAct(env)(comment));
  return {
    act: {
      join,
      leave,
      requestDungeons,
      requestPartyLocks,
      requestStatus,
      setComment,
      setRoles,
    },
    dispose: () => undefined,
  };
}
