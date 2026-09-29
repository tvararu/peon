import type { Unsubscribe } from "#lib/emitter";
import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { PLAYER_FLAG_GHOST, selfFields } from "#wow/areas/selfstate/fields";
import {
  buildCorpseMapPositionQuery,
  buildStandStateChange,
  type CorpseMapPosition,
  parseCorpseMapPosition,
  type StandStateName,
} from "#wow/areas/selfstate/protocol";
import type {
  MirrorTimer,
  SelfstateEvent,
  SelfstateStore,
} from "#wow/areas/selfstate/store";
import { readLife } from "#wow/player-state";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const STAND_TIMEOUT_MS = 2000;
export const BREATH_LOW_MS = 10_000;
export const SELF_RES_TIMEOUT_MS = 5000;
export const CORPSE_QUERY_TIMEOUT_MS = 3000;

const SETTABLE: readonly StandStateName[] = ["stand", "sit", "sleep", "kneel"];

export type StandOutcome =
  | { status: "ok" }
  | { status: "refused"; reason: "invalid_state" }
  | { status: "no_answer" };

export type SelfResOutcome =
  | { status: "ok" }
  | { status: "refused"; reason: "not_dead" | "no_self_res" }
  | { status: "no_answer" };

export type CorpseQueryOutcome =
  | { status: "ok"; position: CorpseMapPosition }
  | { status: "no_answer" };

export type SelfstateActs = {
  setStandState: (state: StandStateName) => Promise<StandOutcome>;
  selfResurrect: () => Promise<SelfResOutcome>;
  queryCorpseMapPosition: () => Promise<CorpseQueryOutcome>;
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function isExpectTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Timed out");
}

function remainingMs(timer: MirrorTimer, now: number): number {
  return timer.valueMs + timer.scale * (now - timer.at);
}

type Ctx = AreaRuntimeCtx<SelfstateEvent>;

function watchBreath(ctx: Ctx, store: SelfstateStore): () => void {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let warned = false;

  function cancel(): void {
    if (deadline !== undefined) clearTimeout(deadline);
    deadline = undefined;
  }

  function warn(): void {
    deadline = undefined;
    const timer = store.snapshot().timers.breath;
    if (!timer || warned) return;
    warned = true;
    store.breathLow(Math.max(0, remainingMs(timer, ctx.now())));
  }

  function arm(timer: MirrorTimer): void {
    cancel();
    if (timer.paused || timer.scale >= 0) return;
    const left = remainingMs(timer, ctx.now());
    if (left > BREATH_LOW_MS) warned = false;
    if (warned) return;
    if (left <= BREATH_LOW_MS) warn();
    else deadline = setTimeout(warn, (left - BREATH_LOW_MS) / -timer.scale);
  }

  const off = store.onEvent((event) => {
    if (event.type !== "mirror_timer" || event.timer !== "breath") return;
    if (event.change === "started") arm(event.value);
    else {
      cancel();
      warned = false;
    }
  });
  return () => {
    cancel();
    off();
  };
}

function watchSelfFields(
  ctx: Ctx,
  store: SelfstateStore,
  core: CoreStores,
): Unsubscribe {
  return ctx.listen("entity", (event) => {
    if (event.type === "disappear") return;
    const fields = selfFields(event.entity, ctx.selfGuid());
    if (!fields) return;
    if (fields.standState !== undefined)
      store.syncStandField(fields.standState);
    if (((fields.playerFlags ?? 0) & PLAYER_FLAG_GHOST) !== 0)
      store.clearGhostPending();
    if (fields.selfResSpell === undefined) return;
    const spellId = fields.selfResSpell;
    if (store.syncSelfResSpell(spellId))
      store.selfResAvailable(spellId, core.combat.definition(spellId)?.name);
  });
}

function standStateAct(ctx: Ctx, store: SelfstateStore) {
  return async (state: StandStateName): Promise<StandOutcome> => {
    if (!SETTABLE.includes(state))
      return { status: "refused", reason: "invalid_state" };
    if (store.snapshot().standState === state) return { status: "ok" };
    const answer = ctx.until(
      (event) => event.type === "stand_changed" && event.to === state,
      { timeoutMs: STAND_TIMEOUT_MS },
    );
    ctx.send(GameOpcode.CMSG_STANDSTATECHANGE, buildStandStateChange(state));
    try {
      await answer;
      return { status: "ok" };
    } catch (error) {
      if (isTimeout(error)) return { status: "no_answer" };
      throw error;
    }
  };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(ignoreFailure);
    return Promise.reject(signal.reason);
  }
  const { promise: aborted, reject } = Promise.withResolvers<never>();
  const onAbort = () => reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  return Promise.race([promise, aborted]).finally(() =>
    signal.removeEventListener("abort", onAbort),
  );
}

function waitAlive(ctx: Ctx, timeoutMs: number): Promise<boolean> {
  const { promise, resolve, reject } = Promise.withResolvers<boolean>();
  const { signal } = ctx;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let off: Unsubscribe | undefined;
  const settle = () => {
    clearTimeout(timer);
    off?.();
    signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    settle();
    reject(signal.reason);
  };
  if (signal.aborted) {
    reject(signal.reason);
    return promise;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") return;
    if (readLife(ctx.selfGuid(), () => event.entity).life !== "alive") return;
    settle();
    resolve(true);
  });
  timer = setTimeout(() => {
    settle();
    resolve(false);
  }, timeoutMs);
  return promise;
}

function selfResurrectAct(ctx: Ctx, store: SelfstateStore) {
  return async (): Promise<SelfResOutcome> => {
    const life = store.life();
    if (life !== "dead" && life !== "ghost")
      return { status: "refused", reason: "not_dead" };
    if (store.currentSelfResSpell() === 0)
      return { status: "refused", reason: "no_self_res" };
    const revived = waitAlive(ctx, SELF_RES_TIMEOUT_MS);
    ctx.send(GameOpcode.CMSG_SELF_RES);
    return (await revived) ? { status: "ok" } : { status: "no_answer" };
  };
}

function corpseQueryAct(ctx: Ctx) {
  return async (): Promise<CorpseQueryOutcome> => {
    const reply = ctx.expect(
      GameOpcode.SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE,
      {
        timeoutMs: CORPSE_QUERY_TIMEOUT_MS,
      },
    );
    ctx.send(
      GameOpcode.CMSG_CORPSE_MAP_POSITION_QUERY,
      buildCorpseMapPositionQuery(),
    );
    try {
      const reader = await abortable(reply, ctx.signal);
      return { status: "ok", position: parseCorpseMapPosition(reader) };
    } catch (error) {
      if (ctx.signal.aborted || !isExpectTimeout(error)) throw error;
      return { status: "no_answer" };
    }
  };
}

export function selfstateRuntime(
  ctx: Ctx,
  store: SelfstateStore,
  core: CoreStores,
): AreaRuntime<SelfstateActs> {
  const offBreath = watchBreath(ctx, store);
  const offFields = watchSelfFields(ctx, store, core);
  return {
    act: {
      setStandState: standStateAct(ctx, store),
      selfResurrect: selfResurrectAct(ctx, store),
      queryCorpseMapPosition: corpseQueryAct(ctx),
    },
    dispose: () => {
      offBreath();
      offFields();
    },
  };
}
