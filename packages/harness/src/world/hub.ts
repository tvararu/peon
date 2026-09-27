import type { Unsubscribe, WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { HarnessRuntime } from "#harness/contract/services";
import type {
  ControlHolder,
  ControlOwner,
  Grant,
} from "#harness/runtime/control-owner";
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
import { snapshot } from "#harness/world/snapshot";

export type WorldRuntime = Pick<
  HarnessRuntime,
  "handle" | "connection" | "onConnection" | "control" | "mutex" | "log"
>;

export type WorldHub = { service: WorldService; dispose: () => void };

type Live = { handle: WorldHandle; session: WorldSession };
type LiveClaim = { grant: Grant; lose: () => void };

const DISPOSED = "world_disposed";

export function createWorldService(rt: WorldRuntime): WorldHub {
  const hooks = new Set<Unsubscribe>();
  const claims = new Set<LiveClaim>();
  let disposed = false;
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
      disposed ? undefined : claim({ claims, owner, reason, rt, track }),
    connection: rt.connection,
    control: Object.freeze({
      onOwner: (cb: Parameters<WorldService["control"]["onOwner"]>[0]) =>
        track(rt.control.onChange((change) => cb(change.owner))),
      owner: rt.control.owner,
    }),
    current,
    log: Object.freeze({
      recent: (n: number) => snapshot(rt.log.recent(n)),
      subscribe: (cb: Parameters<WorldService["log"]["subscribe"]>[0]) =>
        track(rt.log.subscribe((entry) => cb(snapshot(entry)))),
    }),
    onConnection: (cb: Parameters<WorldService["onConnection"]>[0]) =>
      track(rt.onConnection(cb)),
    onSession: (attach: Parameters<WorldService["onSession"]>[0]) =>
      track(sessions(rt, current, attach)),
    version: 1,
  });
  return {
    dispose() {
      disposed = true;
      for (const held of [...claims]) {
        rt.control.release(held.grant, DISPOSED);
        held.lose();
      }
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

function picked<T>(
  keys: readonly (keyof T & string)[],
  value: (key: keyof T & string) => unknown,
): T {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as T;
}

function session(handle: WorldHandle): WorldSession {
  const offs = new Set<Unsubscribe>();
  handle.closed
    .then(() => {
      for (const off of [...offs]) off();
      offs.clear();
    })
    .catch(ignoreFailure);
  const reads = picked<WorldReads>(READ_KEYS, (key) => {
    const read = handle[key] as (...args: never[]) => unknown;
    return (...args: never[]) => snapshot(read(...args));
  });
  const events = picked<WorldEvents>(EVENT_KEYS, (key) => {
    const on = handle[key] as (cb: (event: unknown) => void) => Unsubscribe;
    return (cb: (event: unknown) => void) => {
      const off = on((event) => cb(snapshot(event)));
      offs.add(off);
      return () => {
        offs.delete(off);
        off();
      };
    };
  });
  return Object.freeze({
    closed: handle.closed,
    events: Object.freeze(events),
    reads: Object.freeze(reads),
  });
}

type ClaimInit = {
  claims: Set<LiveClaim>;
  owner: ControlOwner;
  reason: string;
  rt: WorldRuntime;
  track: (off: Unsubscribe) => Unsubscribe;
};

function claim(init: ClaimInit): Claim | undefined {
  const { claims, owner, reason, rt, track } = init;
  const granted = rt.control.claim(owner, reason);
  if (!granted.granted) return undefined;
  const { grant } = granted;
  let lost = false;
  const listeners = new Set<(to: ControlHolder) => void>();
  const entry: LiveClaim = {
    grant,
    lose() {
      if (lost) return;
      lost = true;
      claims.delete(entry);
      stopWatch();
      const to = rt.control.owner();
      for (const cb of [...listeners]) cb(to);
      listeners.clear();
    },
  };
  claims.add(entry);
  const stopWatch = track(
    rt.control.onChange(() => {
      if (!rt.control.holds(grant)) entry.lose();
    }),
  );
  const held = () => !lost && rt.control.holds(grant);
  const send =
    (key: (typeof ACT_KEYS)[number]) =>
    (...args: never[]) =>
      rt.mutex.run(() => {
        if (!held()) throw new Error("not_owner" satisfies WorldRefusal);
        const handle = rt.handle();
        if (!handle || rt.connection() !== "online")
          throw new Error("offline" satisfies WorldRefusal);
        return (handle[key] as (...args: never[]) => unknown)(...args);
      });
  return Object.freeze({
    act: Object.freeze(picked<WorldActuators>(ACT_KEYS, send)),
    held,
    onLost(cb: (to: ControlHolder) => void) {
      if (lost) {
        cb(rt.control.owner());
        return () => undefined;
      }
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    owner,
    release() {
      rt.control.release(grant, reason);
      entry.lose();
    },
  });
}
