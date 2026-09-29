import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildBeginTrade,
  buildBusyTrade,
  buildCancelTrade,
  buildIgnoreTrade,
  buildInitiateTrade,
} from "#wow/areas/trade/protocol";
import type {
  TradeEvent,
  TradeState,
  TradeStore,
} from "#wow/areas/trade/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const TRADE_ANSWER_MS = 60_000;
export const TRADE_CANCEL_MS = 5000;

export type TradeResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "unanswered" };

export type TradeAnswer = "yes" | "busy" | "ignore";

export type TradeActs = {
  requestTrade: (guid: bigint) => Promise<TradeResult>;
  answerTrade: (answer: TradeAnswer) => Promise<TradeResult>;
  cancelTrade: () => Promise<TradeResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<TradeEvent>;
  store: TradeStore;
};

function outcomeOf(event: TradeEvent, mode: "open" | "cancel"): TradeResult {
  if (event.type === "opened") return { status: "ok" };
  if (event.type === "unanswered") return { status: "unanswered" };
  if (event.type === "refused")
    return { status: "refused", reason: event.status };
  if (event.type === "canceled") {
    if (event.status === "trade_canceled" && mode === "cancel")
      return { status: "ok" };
    return { status: "refused", reason: event.status };
  }
  return { status: "unanswered" };
}

function subscribeBeforeSend(
  env: Env,
  match: (event: TradeEvent) => boolean,
  send: () => void,
  options: {
    mode: "open" | "cancel";
    timeoutMs: number;
    restore?: () => void;
  },
): Promise<TradeResult> {
  const abort = new AbortController();
  const waited = env.ctx.until(match, {
    signal: AbortSignal.any([env.ctx.signal, abort.signal]),
    timeoutMs: options.timeoutMs,
  });
  const handled = waited.then(
    (event) => outcomeOf(event, options.mode),
    (error: unknown) => {
      if (error instanceof Error && error.message === "timeout") {
        env.store.expire();
        return outcomeOf({ type: "unanswered" }, options.mode);
      }
      throw error;
    },
  );
  try {
    send();
  } catch (error) {
    abort.abort();
    options.restore?.();
    return handled.catch(() => {
      throw error;
    });
  }
  return handled;
}

function liveCheck(env: Env): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

function requestTrade(env: Env, guid: bigint): Promise<TradeResult> {
  liveCheck(env);
  const phase = env.store.snapshot().phase;
  if (phase !== "idle" && phase !== "closed")
    throw new Error("a trade is already in progress");
  env.store.beginRequest(guid);
  return subscribeBeforeSend(
    env,
    (event) =>
      event.type === "opened" ||
      event.type === "canceled" ||
      event.type === "refused" ||
      event.type === "unanswered",
    () =>
      env.ctx.send(GameOpcode.CMSG_INITIATE_TRADE, buildInitiateTrade(guid)),
    {
      mode: "open",
      restore: () => env.store.abandon(),
      timeoutMs: TRADE_ANSWER_MS,
    },
  ).then((result) => {
    if (result.status === "unanswered") {
      env.store.settlePending();
      env.ctx.send(GameOpcode.CMSG_CANCEL_TRADE, buildCancelTrade());
    }
    return result;
  });
}

function answerTrade(env: Env, answer: TradeAnswer): Promise<TradeResult> {
  liveCheck(env);
  const state: TradeState = env.store.snapshot();
  if (state.phase !== "requested_in") throw new Error("no_request");
  if (answer === "yes")
    return subscribeBeforeSend(
      env,
      (event) =>
        event.type === "opened" ||
        event.type === "canceled" ||
        event.type === "refused",
      () => env.ctx.send(GameOpcode.CMSG_BEGIN_TRADE, buildBeginTrade()),
      { mode: "open", timeoutMs: TRADE_CANCEL_MS },
    );
  const opcode =
    answer === "busy"
      ? GameOpcode.CMSG_BUSY_TRADE
      : GameOpcode.CMSG_IGNORE_TRADE;
  const body = answer === "busy" ? buildBusyTrade() : buildIgnoreTrade();
  return subscribeBeforeSend(
    env,
    (event) =>
      event.type === "canceled" ||
      event.type === "refused" ||
      event.type === "opened",
    () => env.ctx.send(opcode, body),
    { mode: "open", timeoutMs: TRADE_CANCEL_MS },
  );
}

function cancelTrade(env: Env): Promise<TradeResult> {
  liveCheck(env);
  const phase = env.store.snapshot().phase;
  if (phase !== "open" && phase !== "requested_in" && phase !== "requested_out")
    throw new Error("no trade to cancel");
  return subscribeBeforeSend(
    env,
    (event) => event.type === "canceled" || event.type === "unanswered",
    () => env.ctx.send(GameOpcode.CMSG_CANCEL_TRADE, buildCancelTrade()),
    { mode: "cancel", timeoutMs: TRADE_CANCEL_MS },
  );
}

export function tradeRuntime(
  ctx: AreaRuntimeCtx<TradeEvent>,
  store: TradeStore,
  core: CoreStores,
): AreaRuntime<TradeActs> {
  void core;
  const env: Env = { ctx, store };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (event: TradeEvent) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (event.type !== "requested") return;
    timer = setTimeout(() => {
      timer = undefined;
      if (store.snapshot().phase !== "requested_in") return;
      try {
        ctx.send(GameOpcode.CMSG_BUSY_TRADE, buildBusyTrade());
      } catch {
        store.abandon();
      }
    }, TRADE_ANSWER_MS);
  };
  const off = store.onEvent(arm);
  return {
    act: {
      answerTrade: (answer) => answerTrade(env, answer),
      cancelTrade: () => cancelTrade(env),
      requestTrade: (guid) => requestTrade(env, guid),
    },
    dispose: () => {
      off();
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
