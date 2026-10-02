import { ignoreFailure } from "#lib/ignore-failure";
import {
  type BattlefieldList,
  buildBattlefieldList,
  buildBattlefieldPort,
  buildBattlemasterHello,
  buildBattlemasterJoin,
} from "#wow/areas/battlegrounds/protocol-queue";
import type {
  BattlegroundsEvent,
  BattlegroundsStore,
} from "#wow/areas/battlegrounds/store";
import type { BattlegroundsSlot } from "#wow/areas/battlegrounds/store-queue";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const BG_LIST_MS = 3000;
export const BG_JOIN_MS = 5000;
export const BG_PORT_MS = 10_000;

export type BattlegroundsJoinOptions = {
  asGroup?: boolean;
  instanceId?: number;
  via?: bigint;
};

export type BattlegroundsJoined = { slot: number; status: BattlegroundsSlot };

export type BattlegroundsAnswered = { slot: number; kind: "active" | "none" };

export type BattlegroundsQueueActs = {
  list: (bgType: number) => Promise<BattlefieldList>;
  hello: (guid: bigint) => Promise<BattlefieldList>;
  join: (
    bgType: number,
    options?: BattlegroundsJoinOptions,
  ) => Promise<BattlegroundsJoined>;
  answer: (slot: number, accept: boolean) => Promise<BattlegroundsAnswered>;
  leaveQueue: (slot: number) => Promise<BattlegroundsAnswered>;
};

type Ctx = AreaRuntimeCtx<BattlegroundsEvent>;

function request(
  ctx: Ctx,
  match: (event: BattlegroundsEvent) => boolean,
  timeoutMs: number,
  send: () => void,
): Promise<BattlegroundsEvent> {
  const local = new AbortController();
  const answered = ctx.until(match, {
    signal: AbortSignal.any([ctx.signal, local.signal]),
    timeoutMs,
  });
  try {
    send();
  } catch (error) {
    local.abort();
    answered.catch(ignoreFailure);
    throw error;
  }
  return answered;
}

function listActs(ctx: Ctx): Pick<BattlegroundsQueueActs, "list" | "hello"> {
  const asList = (event: BattlegroundsEvent): BattlefieldList => {
    if (event.type !== "bg_list") throw new Error("no_answer");
    const { type: _type, ...list } = event;
    return list;
  };
  return {
    hello: async (guid) =>
      asList(
        await request(
          ctx,
          (event) => event.type === "bg_list" && event.guid === guid,
          BG_LIST_MS,
          () =>
            ctx.send(
              GameOpcode.CMSG_BATTLEMASTER_HELLO,
              buildBattlemasterHello(guid),
            ),
        ),
      ),
    list: async (bgType) =>
      asList(
        await request(
          ctx,
          (event) => event.type === "bg_list" && event.bgType === bgType,
          BG_LIST_MS,
          () =>
            ctx.send(
              GameOpcode.CMSG_BATTLEFIELD_LIST,
              buildBattlefieldList(bgType, 1, 0),
            ),
        ),
      ),
  };
}

function joinAct(ctx: Ctx): BattlegroundsQueueActs["join"] {
  return async (bgType, options = {}) => {
    const event = await request(
      ctx,
      (e) =>
        (e.type === "bg_status" &&
          e.previous !== "queued" &&
          e.status.kind === "queued" &&
          e.status.bgType === bgType) ||
        (e.type === "bg_join_result" && e.error !== undefined),
      BG_JOIN_MS,
      () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEMASTER_JOIN,
          buildBattlemasterJoin(
            options.via ?? 0n,
            bgType,
            options.instanceId ?? 0,
            options.asGroup ?? false,
          ),
        ),
    );
    if (event.type === "bg_join_result")
      throw new Error(event.error ?? "join_failed");
    if (event.type !== "bg_status") throw new Error("no_answer");
    return { slot: event.slot, status: event.status };
  };
}

function portActs(
  ctx: Ctx,
  store: BattlegroundsStore,
): Pick<BattlegroundsQueueActs, "answer" | "leaveQueue"> {
  const answer = async (
    slot: number,
    accept: boolean,
  ): Promise<BattlegroundsAnswered> => {
    const current = store.slot(slot);
    if (current.kind === "none") throw new Error("no_slot");
    if (store.selfInCombat()) throw new Error("in_combat");
    const event = await request(
      ctx,
      (e) =>
        e.type === "bg_status" &&
        e.slot === slot &&
        (e.status.kind === "active" || e.status.kind === "none"),
      BG_PORT_MS,
      () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEFIELD_PORT,
          buildBattlefieldPort(current.arenaType, current.bgType, accept),
        ),
    );
    if (event.type !== "bg_status" || event.status.kind === "queued")
      throw new Error("no_answer");
    return { kind: event.status.kind === "active" ? "active" : "none", slot };
  };
  return {
    answer,
    leaveQueue: (slot) => {
      const kind = store.slot(slot).kind;
      if (kind === "queued") return answer(slot, false);
      return Promise.reject(
        new Error(kind === "none" ? "no_slot" : "not_queued"),
      );
    },
  };
}

export function battlegroundsQueueRuntime(
  ctx: Ctx,
  store: BattlegroundsStore,
  core: CoreStores,
): AreaRuntime<BattlegroundsQueueActs> {
  const off = core.self.onEvent((event) => {
    if (event.type !== "login_verified" && event.type !== "new_world") return;
    ctx.send(GameOpcode.CMSG_BATTLEFIELD_STATUS);
  });
  return {
    act: { ...listActs(ctx), join: joinAct(ctx), ...portActs(ctx, store) },
    dispose: off,
  };
}
