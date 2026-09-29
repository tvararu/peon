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

type JoinRequest = {
  roles: number;
  entries: readonly number[];
  comment?: string;
};

function groupRefusal(ctx: Ctx, store: LfgStore): LfgJoinResult | undefined {
  const party = ctx.legacy.party();
  if (party.inGroup && !selfLeads(party))
    return { status: "refused", reason: "not_leader" };
  if (store.snapshot().status === "proposal")
    return { status: "refused", reason: "busy_proposal" };
  return undefined;
}

function joinRefusal(env: Env, join: JoinRequest): LfgJoinResult | undefined {
  if (join.roles === 0) return { status: "refused", reason: "no_role" };
  if (join.entries.length > LFG_MAX_ENTRIES)
    return { status: "refused", reason: "too_many" };
  const blocked = groupRefusal(env.ctx, env.store);
  if (blocked !== undefined) return blocked;
  const random = join.entries.some((e) => e >>> 24 === 1);
  if (random && join.entries.length > 1)
    return { status: "refused", reason: "mixed_random" };
  if (!join.entries.every((entry) => knownEntry(env.store, entry)))
    return { status: "refused", reason: "unknown_dungeon" };
  return undefined;
}

type JoinWaits = {
  resultWait: Promise<LfgEvent>;
  queuedWait: Promise<LfgEvent>;
};

function armJoinWaits(
  ctx: Ctx,
  signal: AbortSignal,
  grouped: boolean,
): JoinWaits {
  const resultWait = ctx.until((event) => event.type === "join_result", {
    timeoutMs: LFG_REQUEST_TIMEOUT_MS,
    signal,
  });
  resultWait.catch(() => undefined);
  const queuedWait = ctx.until(
    (event) =>
      grouped
        ? event.type === "role_check" && event.state === 2
        : event.type === "status" &&
          event.status === "queued" &&
          event.source !== "search",
    { timeoutMs: LFG_REQUEST_TIMEOUT_MS, signal },
  );
  queuedWait.catch(() => undefined);
  return { resultWait, queuedWait };
}

function queuedResult(
  store: LfgStore,
  entries: readonly number[],
  roleCheck: boolean,
): LfgJoinResult {
  if (roleCheck) return { status: "ok", queued: entries, roleCheck: true };
  const queued = store.snapshot().selected;
  return {
    status: "ok",
    queued: queued.length > 0 ? queued : entries,
    roleCheck: false,
  };
}

async function settleJoin(
  store: LfgStore,
  entries: readonly number[],
  waits: JoinWaits,
): Promise<LfgJoinResult> {
  const first = await Promise.race([
    waits.resultWait.then((result) => ({ kind: "result" as const, result })),
    waits.queuedWait.then((event) => ({ kind: "queued" as const, event })),
  ]);
  if (first.kind === "queued")
    return queuedResult(store, entries, first.event.type === "role_check");
  if (first.result.type === "join_result" && first.result.reason !== "ok") {
    return {
      status: "refused",
      reason: first.result.reason,
      partyLocks: store.snapshot().joinResult?.partyLocks ?? [],
    } as LfgJoinResult;
  }
  const settled = await waits.queuedWait;
  return queuedResult(store, entries, settled.type === "role_check");
}

function joinAct({ ctx, store }: Env) {
  return async (join: JoinRequest): Promise<LfgJoinResult> => {
    const refusal = joinRefusal({ ctx, store }, join);
    if (refusal !== undefined) return refusal;
    const scope = requestScope();
    const entries = [...join.entries];
    const inGroup = ctx.legacy.party().inGroup;
    const waits = armJoinWaits(ctx, scope.abort.signal, inGroup);
    try {
      ctx.send(
        GameOpcode.CMSG_LFG_JOIN,
        buildLfgJoin({
          roles: join.roles,
          entries,
          comment: join.comment ?? "",
        }),
      );
      return await settleJoin(store, entries, waits);
    } catch (error) {
      if (isTimeout(error))
        return { status: "refused", reason: "lfg_disabled_or_ignored" };
      throw error;
    } finally {
      scope.abort.abort();
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
      if (chosen.type === "role_chosen" && chosen.ready)
        return { status: "ok", roles: chosen.roles };
      if (chosen.type === "role_chosen")
        return { status: "refused", reason: "no_role" };
      throw new Error("unreachable");
    } catch (error) {
      scope.abort.abort();
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function setCommentAct({ ctx }: Env) {
  return (comment: string): Promise<LfgCommentResult> => {
    if (new TextEncoder().encode(comment).length > 64)
      return Promise.resolve({ status: "refused", reason: "too_long" });
    try {
      ctx.send(GameOpcode.CMSG_SET_LFG_COMMENT, buildLfgComment(comment));
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve({ status: "ok" });
  };
}
export function lfgRuntime(ctx: Ctx, store: LfgStore): AreaRuntime<LfgActs> {
  const env: Env = { ctx, store };
  const run = guard({ count: 0 });
  const requestStatus = () => run(statusAct(env));
  const requestDungeons = () => run(dungeonsAct(env));
  const requestPartyLocks = () => run(partyLocksAct(env));
  const join = (request: JoinRequest) => run(() => joinAct(env)(request));
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
