import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildAcceptTrade,
  buildBeginTrade,
  buildBusyTrade,
  buildCancelTrade,
  buildClearTradeItem,
  buildIgnoreTrade,
  buildInitiateTrade,
  buildSetTradeGold,
  buildSetTradeItem,
  buildUnacceptTrade,
} from "#wow/areas/trade/protocol";
import type {
  TradeEvent,
  TradeOfferItem,
  TradeState,
  TradeStore,
} from "#wow/areas/trade/store";
import { type InventoryState, readInventory } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const TRADE_ANSWER_MS = 60_000;
export const TRADE_CANCEL_MS = 5000;
export const TRADE_ACCEPT_MS = 60_000;
export type TradeResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "unanswered" }
  | { status: "superseded" };

export type TradeAnswer = "yes" | "busy" | "ignore";

export type TradeActs = {
  requestTrade: (guid: bigint) => Promise<TradeResult>;
  answerTrade: (answer: TradeAnswer) => Promise<TradeResult>;
  cancelTrade: () => Promise<TradeResult>;
  offerItem: (
    tradeSlot: number,
    bag: number,
    slot: number,
  ) => Promise<{ slot: number }>;
  withdrawItem: (tradeSlot: number) => Promise<{ cleared: boolean }>;
  offerGold: (copper: number) => Promise<{ gold: number }>;
  acceptTrade: (expectVersion?: number) => Promise<TradeResult>;
  unacceptTrade: () => Promise<{ unaccepted: boolean }>;
};

type Env = {
  ctx: AreaRuntimeCtx<TradeEvent>;
  store: TradeStore;
  armSettle: () => void;
};

function outcomeOf(event: TradeEvent, mode: "open" | "cancel"): TradeResult {
  if (event.type === "opened") return { status: "ok" };
  if (event.type === "unanswered") return { status: "unanswered" };
  if (event.type === "requested") return { status: "superseded" };
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
    onTimeout?: () => void;
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
        options.onTimeout?.();
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
  if (env.store.snapshot().phase === "settling")
    return Promise.resolve({ status: "refused", reason: "busy" });
  const phase = env.store.snapshot().phase;
  if (phase !== "idle" && phase !== "closed")
    throw new Error("a trade is already in progress");
  env.store.beginRequest(guid);
  return subscribeBeforeSend(
    env,
    (event) =>
      event.type === "requested" ||
      event.type === "opened" ||
      event.type === "canceled" ||
      event.type === "refused" ||
      event.type === "unanswered",
    () =>
      env.ctx.send(GameOpcode.CMSG_INITIATE_TRADE, buildInitiateTrade(guid)),
    {
      mode: "open",
      onTimeout: () => env.store.expire(),
      restore: () => env.store.abandon(),
      timeoutMs: TRADE_ANSWER_MS,
    },
  ).then((result) => {
    if (result.status !== "unanswered") return result;
    if (env.store.snapshot().phase !== "requested_out") return result;
    env.store.settlePending();
    try {
      env.ctx.send(GameOpcode.CMSG_CANCEL_TRADE, buildCancelTrade());
      env.armSettle();
    } catch (error) {
      env.store.endSettling();
      throw error;
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
    () => {
      env.store.settleCancel();
      env.ctx.send(GameOpcode.CMSG_CANCEL_TRADE, buildCancelTrade());
    },
    {
      mode: "cancel",
      onTimeout: () => {
        env.store.expire();
        env.store.endSettling();
      },
      restore: () => env.store.restorePhase(phase),
      timeoutMs: TRADE_CANCEL_MS,
    },
  );
}
const TRADE_SLOT_COUNT = 7;
const TRADE_SLOT_TRADED_COUNT = 6;

function openInventory(env: Env): InventoryState {
  liveCheck(env);
  if (env.store.snapshot().phase !== "open")
    throw new Error("no trade is open");
  const inventory = readInventory(env.ctx.selfGuid() ?? 0n, env.store.entityOf);
  if (inventory.status === "unknown")
    throw new Error("the character is not in world");
  return inventory;
}

function offeredSlot(
  env: Env,
  tradeSlot: number,
  bag: number,
  slot: number,
): TradeOfferItem {
  if (
    !Number.isInteger(tradeSlot) ||
    tradeSlot < 0 ||
    tradeSlot >= TRADE_SLOT_TRADED_COUNT
  )
    throw new Error(`trade slot ${tradeSlot} is outside 0-5`);
  if (bag === 255 && slot >= 0 && slot <= 22)
    throw new Error(`equipped position ${slot} cannot be traded`);
  const inventory = openInventory(env);
  const found = inventory.slots.find(
    (position) => position.bag === bag && position.slot === slot,
  );
  if (found?.status !== "occupied")
    throw new Error(`bag position ${bag}/${slot} is empty`);
  if (
    env.store.snapshot().ownOffer.items.some((held) => held.guid === found.guid)
  )
    throw new Error("that item is already in another trade slot");
  return {
    count: found.item.count,
    entry: found.item.entry,
    guid: found.guid,
    slot: tradeSlot,
  };
}

function offerItem(
  env: Env,
  tradeSlot: number,
  bag: number,
  slot: number,
): Promise<{ slot: number }> {
  const held = offeredSlot(env, tradeSlot, bag, slot);
  env.ctx.send(
    GameOpcode.CMSG_SET_TRADE_ITEM,
    buildSetTradeItem(tradeSlot, bag, slot),
  );
  const state = env.store.snapshot();
  env.store.recordOwnOffer({
    gold: state.ownOffer.gold,
    items: [
      ...state.ownOffer.items.filter((item) => item.slot !== tradeSlot),
      held,
    ],
    spell: state.ownOffer.spell,
  });
  return Promise.resolve({ slot: tradeSlot });
}

function withdrawItem(
  env: Env,
  tradeSlot: number,
): Promise<{ cleared: boolean }> {
  liveCheck(env);
  if (env.store.snapshot().phase !== "open")
    throw new Error("no trade is open");
  if (
    !Number.isInteger(tradeSlot) ||
    tradeSlot < 0 ||
    tradeSlot >= TRADE_SLOT_COUNT
  )
    throw new Error(`trade slot ${tradeSlot} is outside 0-6`);
  env.ctx.send(
    GameOpcode.CMSG_CLEAR_TRADE_ITEM,
    buildClearTradeItem(tradeSlot),
  );
  const state = env.store.snapshot();
  env.store.recordOwnOffer({
    gold: state.ownOffer.gold,
    items: state.ownOffer.items.filter((item) => item.slot !== tradeSlot),
    spell: state.ownOffer.spell,
  });
  return Promise.resolve({ cleared: true });
}

function offerGold(env: Env, copper: number): Promise<{ gold: number }> {
  const inventory = openInventory(env);
  if (!Number.isInteger(copper) || copper < 0)
    throw new Error(`gold ${copper} is not a copper amount`);
  if (inventory.coinage !== undefined && copper > inventory.coinage)
    throw new Error(`gold ${copper} is above the coinage ${inventory.coinage}`);
  env.ctx.send(GameOpcode.CMSG_SET_TRADE_GOLD, buildSetTradeGold(copper));
  const state = env.store.snapshot();
  env.store.recordOwnOffer({
    gold: copper,
    items: state.ownOffer.items,
    spell: state.ownOffer.spell,
  });
  return Promise.resolve({ gold: copper });
}

function acceptResult(store: TradeStore): TradeResult {
  const last = store.snapshot().lastOutcome;
  if (!last) return { status: "unanswered" };
  if (last.kind === "completed") return { status: "ok" };
  return { status: "refused", reason: last.status };
}

function acceptTrade(env: Env, expectVersion?: number): Promise<TradeResult> {
  liveCheck(env);
  if (env.store.snapshot().phase !== "open")
    throw new Error("no trade is open");
  const seen = env.store.snapshot().theirOffer.version;
  if (expectVersion !== undefined && expectVersion !== seen)
    throw new Error("offer_changed");
  return subscribeBeforeSend(
    env,
    (event) =>
      event.type === "completed" ||
      event.type === "canceled" ||
      event.type === "refused" ||
      event.type === "unanswered",
    () => {
      env.ctx.send(GameOpcode.CMSG_ACCEPT_TRADE, buildAcceptTrade());
      env.store.noteSelfAccepted(true);
    },
    {
      mode: "open",
      onTimeout: () => env.store.expire(),
      restore: () => env.store.noteSelfAccepted(false),
      timeoutMs: TRADE_ACCEPT_MS,
    },
  ).then((result) => {
    if (result.status !== "unanswered") return result;
    return acceptResult(env.store);
  });
}

function unacceptTrade(env: Env): Promise<{ unaccepted: boolean }> {
  liveCheck(env);
  if (env.store.snapshot().phase !== "open")
    throw new Error("no trade is open");
  if (!env.store.snapshot().selfAccepted)
    throw new Error("the trade is not accepted");
  env.ctx.send(GameOpcode.CMSG_UNACCEPT_TRADE, buildUnacceptTrade());
  env.store.noteSelfAccepted(false);
  return Promise.resolve({ unaccepted: true });
}

export function tradeRuntime(
  ctx: AreaRuntimeCtx<TradeEvent>,
  store: TradeStore,
  core: CoreStores,
): AreaRuntime<TradeActs> {
  void core;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const armSettle = () => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      settle = undefined;
      store.endSettling();
    }, TRADE_CANCEL_MS);
  };
  const env: Env = { armSettle, ctx, store };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (event: TradeEvent) => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (
      event.type === "requested" &&
      store.snapshot().phase === "requested_in"
    ) {
      timer = setTimeout(() => {
        timer = undefined;
        if (store.snapshot().phase !== "requested_in") return;
        try {
          ctx.send(GameOpcode.CMSG_BUSY_TRADE, buildBusyTrade());
        } catch {
          store.abandon();
        }
      }, TRADE_ANSWER_MS);
    }
    if (event.type === "canceled" || event.type === "requested") {
      clearTimeout(settle);
      settle = undefined;
    }
    if (event.type === "canceled" && store.snapshot().phase === "settling")
      store.endSettling();
  };
  const off = store.onEvent(arm);
  return {
    act: {
      acceptTrade: (expectVersion) => acceptTrade(env, expectVersion),
      answerTrade: (answer) => answerTrade(env, answer),
      cancelTrade: () => cancelTrade(env),
      offerGold: (copper) => offerGold(env, copper),
      offerItem: (tradeSlot, bag, slot) => offerItem(env, tradeSlot, bag, slot),
      requestTrade: (guid) => requestTrade(env, guid),
      unacceptTrade: () => unacceptTrade(env),
      withdrawItem: (tradeSlot) => withdrawItem(env, tradeSlot),
    },
    dispose: () => {
      off();
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      clearTimeout(settle);
      settle = undefined;
      store.endSettling();
    },
  };
}
