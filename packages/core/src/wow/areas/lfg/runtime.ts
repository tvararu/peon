import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLfgGetStatus,
  buildPartyLockInfoRequest,
  buildPlayerLockInfoRequest,
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

export type LfgActs = {
  requestStatus: () => Promise<LfgStatusResult>;
  requestDungeons: () => Promise<LfgDungeonsResult>;
  requestPartyLocks: () => Promise<LfgPartyLocksResult>;
};

type Ctx = AreaRuntimeCtx<LfgEvent>;
type Env = { ctx: Ctx; store: LfgStore };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function guard(running: { count: number }) {
  return async <T>(body: () => Promise<T>): Promise<T> => {
    if (running.count > 0)
      return { status: "refused", reason: "busy" } as T;
    running.count += 1;
    try {
      return await body();
    } finally {
      running.count -= 1;
    }
  };
}

async function waitForStatus(ctx: Ctx, grouped: boolean): Promise<void> {
  const seen = { player: false, party: !grouped };
  await ctx.until(
    (event) => {
      if (event.type !== "status" || event.source === "search") return false;
      if (event.source === "player") seen.player = true;
      if (event.source === "party") seen.party = true;
      return seen.player && seen.party;
    },
    { timeoutMs: LFG_REQUEST_TIMEOUT_MS },
  );
}

function statusAct({ ctx }: Env) {
  return async (): Promise<LfgStatusResult> => {
    const wait = waitForStatus(ctx, ctx.legacy.party().members.length > 0);
    ctx.send(GameOpcode.CMSG_LFG_GET_STATUS, buildLfgGetStatus());
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
    const wait = ctx.until(
      (event) => event.type === "dungeons" && event.scope === "player",
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS },
    );
    ctx.send(
      GameOpcode.CMSG_LFD_PLAYER_LOCK_INFO_REQUEST,
      buildPlayerLockInfoRequest(),
    );
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
    const wait = ctx.until(
      (event) => event.type === "dungeons" && event.scope === "party",
      { timeoutMs: LFG_REQUEST_TIMEOUT_MS },
    );
    ctx.send(
      GameOpcode.CMSG_LFD_PARTY_LOCK_INFO_REQUEST,
      buildPartyLockInfoRequest(),
    );
    try {
      await wait;
      return { status: "ok", partyLocks: store.snapshot().partyLocks };
    } catch (error) {
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

export function lfgRuntime(ctx: Ctx, store: LfgStore): AreaRuntime<LfgActs> {
  const env: Env = { ctx, store };
  const run = guard({ count: 0 });
  const requestStatus = () => run(statusAct(env));
  const requestDungeons = () => run(dungeonsAct(env));
  const requestPartyLocks = () => run(partyLocksAct(env));
  return {
    act: { requestDungeons, requestPartyLocks, requestStatus },
    dispose: () => undefined,
  };
}
