import type { Unsubscribe } from "#lib/emitter";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildReadyCheckAnswer,
  buildReadyCheckFinished,
  buildReadyCheckStart,
} from "#wow/areas/raid/protocol-ready";
import { pendingGuids } from "#wow/areas/raid/store-ready";
import type { RaidEvent, RaidState } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

export const READY_CHECK_TIMEOUT_MS = 30_000;

export type ReadyActs = {
  startReadyCheck: () => void;
  answerReadyCheck: (ready: boolean) => void;
  finishReadyCheck: () => void;
};

type Ctx = AreaRuntimeCtx<RaidEvent>;
type Store = {
  snapshot: () => RaidState;
  onEvent: (cb: (event: RaidEvent) => void) => Unsubscribe;
  noteOwnReadyAnswer: (ready: boolean) => void;
};

function startedBySelf(store: Store, selfGuid: () => bigint): boolean {
  return store.snapshot().readyCheck?.initiator === selfGuid();
}

function allAnswered(store: Store): boolean {
  const state = store.snapshot();
  const check = state.readyCheck;
  if (!check) return false;
  return pendingGuids(state.group, check).length === 0;
}

function sendFinished(env: { ctx: Ctx; store: Store }): void {
  const state = env.store.snapshot();
  if (!state.readyCheck || state.readyCheck.finishedAt !== undefined) return;
  env.ctx.send(
    GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
    buildReadyCheckFinished(),
  );
}

export function composeReadyRuntime(env: { ctx: Ctx; store: Store }): {
  act: ReadyActs;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const self = (): bigint => env.ctx.selfGuid();
  function stop(): void {
    clearTimeout(timer);
    timer = undefined;
  }
  function maybeFinish(): void {
    const state = env.store.snapshot();
    const check = state.readyCheck;
    if (!check || check.initiator !== self()) return;
    if (allAnswered(env.store)) {
      stop();
      sendFinished(env);
    }
  }
  const off: Unsubscribe = env.store.onEvent((event) => {
    if (event.type === "ready_check_started") {
      stop();
      if (event.initiator === self()) {
        timer = setTimeout(() => {
          timer = undefined;
          if (startedBySelf(env.store, self)) sendFinished(env);
        }, READY_CHECK_TIMEOUT_MS);
      }
    } else if (event.type === "ready_check_finished") {
      stop();
    } else if (event.type === "ready_check_answer") {
      maybeFinish();
    } else if (event.type === "disbanded") {
      stop();
    }
  });
  function startReadyCheck(): void {
    env.ctx.send(GameOpcode.MSG_RAID_READY_CHECK, buildReadyCheckStart());
  }
  function answerReadyCheck(ready: boolean): void {
    env.ctx.send(GameOpcode.MSG_RAID_READY_CHECK, buildReadyCheckAnswer(ready));
    env.store.noteOwnReadyAnswer(ready);
  }
  function finishReadyCheck(): void {
    stop();
    sendFinished(env);
  }
  return {
    act: { answerReadyCheck, finishReadyCheck, startReadyCheck },
    dispose: () => {
      off();
      stop();
    },
  };
}
