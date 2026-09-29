import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLockResponse,
  buildRequestRaidInfo,
  buildSetLockoutExtended,
  type LockoutExtension,
  type RaidLock,
} from "#wow/areas/instances/protocol";
import {
  type DifficultyRequest,
  type DifficultyResult,
  type ResetResult,
  requestDifficulty,
  requestReset,
} from "#wow/areas/instances/runtime-requests";
import type {
  InstancesEvent,
  InstancesStore,
} from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const INSTANCES_ACT_TIMEOUT_MS = 5000;

export type InstancesRefusal =
  | "busy"
  | "no_bind_offer"
  | "no_matching_lock"
  | "unchanged"
  | "out_of_range"
  | "not_leader"
  | "server_refused"
  | "heroic_no_reset";

export type InstancesOutcome<T = Readonly<Record<never, never>>> =
  | ({ status: "ok" } & T)
  | { status: "refused"; reason: InstancesRefusal }
  | { status: "no_answer" }
  | { status: "unconfirmed_solo" }
  | { status: "nothing_to_reset" };

export type InstancesActs = {
  requestLockouts: () => Promise<
    InstancesOutcome<{ locks: readonly RaidLock[] }>
  >;
  answerBind: (accept: boolean) => Promise<InstancesOutcome>;
  setLockoutExtended: (init: LockoutExtension) => Promise<InstancesOutcome>;
  setDifficulty: (init: DifficultyRequest) => Promise<DifficultyResult>;
  resetInstances: () => Promise<ResetResult>;
};

type Ctx = AreaRuntimeCtx<InstancesEvent>;

const NO_ANSWER = { status: "no_answer" } as const;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function refused(reason: InstancesRefusal) {
  return { status: "refused", reason } as const;
}

type Exclusive = <T>(
  act: () => Promise<InstancesOutcome<T>>,
) => Promise<InstancesOutcome<T>>;

type MapChangeWaiters = Set<() => void>;

function exclusiveGuard(): Exclusive {
  let inFlight = false;
  return async (act) => {
    if (inFlight) return refused("busy");
    inFlight = true;
    try {
      return await act();
    } catch (error) {
      if (isTimeout(error)) return NO_ANSWER;
      throw error;
    } finally {
      inFlight = false;
    }
  };
}

async function reply(
  ctx: Ctx,
  match: (event: InstancesEvent) => boolean,
  send: () => void,
): Promise<void> {
  const cancel = new AbortController();
  const wait = ctx.until(match, {
    timeoutMs: INSTANCES_ACT_TIMEOUT_MS,
    signal: cancel.signal,
  });
  try {
    send();
  } catch (error) {
    cancel.abort();
    wait.catch(ignoreFailure);
    throw error;
  }
  await wait;
}

function nextMapChange(
  ctx: Ctx,
  waiters: MapChangeWaiters,
  send: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (ctx.signal.aborted) return reject(ctx.signal.reason);
    const timer = setTimeout(
      () => finish(() => reject(new Error("timeout"))),
      INSTANCES_ACT_TIMEOUT_MS,
    );
    const settle = () => finish(resolve);
    const abort = () => finish(() => reject(ctx.signal.reason));
    function finish(done: () => void): void {
      clearTimeout(timer);
      waiters.delete(settle);
      ctx.signal.removeEventListener("abort", abort);
      done();
    }
    waiters.add(settle);
    ctx.signal.addEventListener("abort", abort, { once: true });
    try {
      send();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function fetchLocks(
  ctx: Ctx,
  store: InstancesStore,
): Promise<readonly RaidLock[]> {
  await reply(
    ctx,
    (event) => event.type === "lockouts",
    () => ctx.send(GameOpcode.CMSG_REQUEST_RAID_INFO, buildRequestRaidInfo()),
  );
  return store.snapshot().locks ?? [];
}

function lockActs(
  ctx: Ctx,
  store: InstancesStore,
  exclusive: Exclusive,
): Pick<InstancesActs, "requestLockouts" | "setLockoutExtended"> {
  const requestLockouts = () =>
    exclusive(async () => ({
      status: "ok" as const,
      locks: await fetchLocks(ctx, store),
    }));

  const setLockoutExtended = (init: LockoutExtension) =>
    exclusive<Readonly<Record<never, never>>>(async () => {
      const held = store
        .snapshot()
        .locks?.find(
          (lock) =>
            lock.mapId === init.mapId &&
            lock.difficulty === init.difficulty &&
            lock.extended !== init.extended,
        );
      if (!held) return refused("no_matching_lock");
      ctx.send(
        GameOpcode.CMSG_SET_SAVED_INSTANCE_EXTEND,
        buildSetLockoutExtended(init),
      );
      const locks = await fetchLocks(ctx, store);
      const now = locks.find(
        (lock) =>
          lock.mapId === init.mapId && lock.difficulty === init.difficulty,
      );
      return now?.extended === init.extended
        ? { status: "ok" }
        : refused("unchanged");
    });

  return { requestLockouts, setLockoutExtended };
}

function bindAct(
  ctx: Ctx,
  store: InstancesStore,
  exclusive: Exclusive,
  waiters: MapChangeWaiters,
): InstancesActs["answerBind"] {
  return (accept) =>
    exclusive<Readonly<Record<never, never>>>(async () => {
      if (store.snapshot().pendingBind === undefined)
        return refused("no_bind_offer");
      const send = () =>
        ctx.send(
          GameOpcode.CMSG_INSTANCE_LOCK_RESPONSE,
          buildLockResponse(accept),
        );
      if (accept) await reply(ctx, (event) => event.type === "bound", send);
      else await nextMapChange(ctx, waiters, send);
      return { status: "ok" };
    });
}

export function instancesRuntime(
  ctx: Ctx,
  store: InstancesStore,
  core: CoreStores,
): AreaRuntime<InstancesActs> {
  const exclusive = exclusiveGuard();
  const waiters: MapChangeWaiters = new Set();
  const off = core.self.onEvent((event) => {
    if (event.type !== "login_verified" && event.type !== "new_world") return;
    store.mapChanged();
    for (const settle of [...waiters]) settle();
  });
  return {
    act: {
      ...lockActs(ctx, store, exclusive),
      answerBind: bindAct(ctx, store, exclusive, waiters),
      setDifficulty: (init) =>
        exclusive(() => requestDifficulty(ctx, store, init)),
      resetInstances: () => exclusive(() => requestReset(ctx, store)),
    },
    dispose: off,
  };
}
