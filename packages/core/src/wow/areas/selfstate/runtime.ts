import type { Unsubscribe } from "#lib/emitter";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { PLAYER_FLAG_GHOST, selfFields } from "#wow/areas/selfstate/fields";
import {
  buildStandStateChange,
  type StandStateName,
} from "#wow/areas/selfstate/protocol";
import type {
  MirrorTimer,
  SelfstateEvent,
  SelfstateStore,
} from "#wow/areas/selfstate/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const STAND_TIMEOUT_MS = 2000;
export const BREATH_LOW_MS = 10_000;

const SETTABLE: readonly StandStateName[] = ["stand", "sit", "sleep", "kneel"];

export type StandOutcome =
  | { status: "ok" }
  | { status: "refused"; reason: "invalid_state" }
  | { status: "no_answer" };

export type SelfstateActs = {
  setStandState: (state: StandStateName) => Promise<StandOutcome>;
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
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

function watchSelfFields(ctx: Ctx, store: SelfstateStore): Unsubscribe {
  return ctx.listen("entity", (event) => {
    if (event.type === "disappear") return;
    const fields = selfFields(event.entity, ctx.selfGuid());
    if (!fields) return;
    if (fields.standState !== undefined)
      store.syncStandField(fields.standState);
    if (((fields.playerFlags ?? 0) & PLAYER_FLAG_GHOST) !== 0)
      store.clearGhostPending();
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

export function selfstateRuntime(
  ctx: Ctx,
  store: SelfstateStore,
): AreaRuntime<SelfstateActs> {
  const offBreath = watchBreath(ctx, store);
  const offFields = watchSelfFields(ctx, store);
  return {
    act: { setStandState: standStateAct(ctx, store) },
    dispose: () => {
      offBreath();
      offFields();
    },
  };
}
