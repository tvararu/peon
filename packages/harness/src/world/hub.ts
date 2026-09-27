import type { Unsubscribe, WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { HarnessRuntime } from "#harness/contract/services";
import type { ControlOwner } from "#harness/runtime/control-owner";
import {
  ACT_KEYS,
  type Claim,
  EVENT_KEYS,
  READ_KEYS,
  type WorldActuators,
  type WorldEvents,
  type WorldReads,
  type WorldRefusal,
  type WorldService,
  type WorldSession,
} from "#harness/world/service";

export type WorldRuntime = Pick<
  HarnessRuntime,
  "handle" | "connection" | "onConnection" | "control" | "mutex" | "log"
>;

export type WorldHub = { service: WorldService; dispose: () => void };

type Live = { handle: WorldHandle; session: WorldSession };

export function createWorldService(rt: WorldRuntime): WorldHub {
  const hooks = new Set<Unsubscribe>();
  const track = (off: Unsubscribe): Unsubscribe => {
    hooks.add(off);
    return () => {
      hooks.delete(off);
      off();
    };
  };
  let live: Live | undefined;
  const current = (): WorldSession | undefined => {
    const handle = rt.handle();
    if (!handle) return undefined;
    if (live?.handle !== handle) live = { handle, session: session(handle) };
    return live.session;
  };
  const service: WorldService = Object.freeze({
    claim: (owner: ControlOwner, reason: string) =>
      claim({ owner, reason, rt, track }),
    connection: rt.connection,
    control: Object.freeze({
      onOwner: (cb: Parameters<WorldService["control"]["onOwner"]>[0]) =>
        track(rt.control.onChange((change) => cb(change.owner))),
      owner: rt.control.owner,
    }),
    current,
    log: Object.freeze({
      recent: (n: number) => rt.log.recent(n),
      subscribe: (cb: Parameters<WorldService["log"]["subscribe"]>[0]) =>
        track(rt.log.subscribe(cb)),
    }),
    onConnection: (cb: Parameters<WorldService["onConnection"]>[0]) =>
      track(rt.onConnection(cb)),
    onSession: (attach: Parameters<WorldService["onSession"]>[0]) =>
      track(sessions(rt, current, attach)),
    version: 1,
  });
  return {
    dispose() {
      for (const off of [...hooks]) off();
      hooks.clear();
    },
    service,
  };
}

function sessions(
  rt: WorldRuntime,
  current: () => WorldSession | undefined,
  attach: Parameters<WorldService["onSession"]>[0],
): Unsubscribe {
  let seen: WorldSession | undefined;
  let cleanup: Unsubscribe | undefined;
  const drop = () => {
    const off = cleanup;
    cleanup = undefined;
    off?.();
  };
  const visit = () => {
    const now = current();
    if (!now || now === seen) return;
    drop();
    seen = now;
    cleanup = attach(now);
    now.closed
      .then(() => {
        if (seen === now) drop();
      })
      .catch(ignoreFailure);
  };
  visit();
  const off = rt.onConnection((state) => {
    if (state === "online") visit();
  });
  return () => {
    off();
    drop();
    seen = undefined;
  };
}

function session(handle: WorldHandle): WorldSession {
  const offs = new Set<Unsubscribe>();
  handle.closed
    .then(() => {
      for (const off of [...offs]) off();
      offs.clear();
    })
    .catch(ignoreFailure);
  const reads = picked<WorldReads>(READ_KEYS, (key) =>
    handle[key].bind(handle),
  );
  const events = picked<WorldEvents>(EVENT_KEYS, (key) => (cb: never) => {
    const off = (handle[key] as (cb: never) => Unsubscribe)(cb);
    offs.add(off);
    return () => {
      offs.delete(off);
      off();
    };
  });
  return Object.freeze({
    closed: handle.closed,
    events: Object.freeze(events),
    reads: Object.freeze(reads),
  });
}

function picked<T>(
  keys: readonly (keyof T & string)[],
  value: (key: keyof T & string) => unknown,
): T {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as T;
}

type ClaimInit = {
  owner: ControlOwner;
  reason: string;
  rt: WorldRuntime;
  track: (off: Unsubscribe) => Unsubscribe;
};

function claim({ owner, reason, rt, track }: ClaimInit): Claim | undefined {
  if (!rt.control.claim(owner, reason).granted) return undefined;
  let held = true;
  const lost = new Set<Parameters<Claim["onLost"]>[0]>();
  const stopWatch = track(
    rt.control.onChange((change) => {
      if (change.owner === owner) return;
      held = false;
      stopWatch();
      for (const cb of lost) cb(change.owner);
      lost.clear();
    }),
  );
  const send =
    (key: (typeof ACT_KEYS)[number]) =>
    (...args: never[]) =>
      rt.mutex.run(() => {
        if (!held) throw new Error("not_owner" satisfies WorldRefusal);
        const handle = rt.handle();
        if (!handle) throw new Error("offline" satisfies WorldRefusal);
        return (handle[key] as (...args: never[]) => unknown)(...args);
      });
  const act = Object.freeze(picked<WorldActuators>(ACT_KEYS, send));
  return Object.freeze({
    act,
    held: () => held,
    onLost(cb: Parameters<Claim["onLost"]>[0]) {
      if (!held) {
        cb(rt.control.owner());
        return () => undefined;
      }
      lost.add(cb);
      return () => lost.delete(cb);
    },
    owner,
    release() {
      if (!held) return;
      rt.control.release(owner, reason);
    },
  });
}
