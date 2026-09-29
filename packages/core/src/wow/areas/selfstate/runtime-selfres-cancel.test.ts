import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { selfstateCorpseMapPositionQueryResponseBody } from "#test-support/areas/selfstate";
import type { AreaRuntimeCtx, Listener } from "#wow/areas/contract";
import { selfstateRuntime } from "#wow/areas/selfstate/runtime";
import type { SelfstateEvent } from "#wow/areas/selfstate/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { ExpectOptions } from "#wow/protocol/world";
import type { CoreEvents } from "#wow/world-events";

const SELF = 0x0e01n;

const deadSelf: Entity = {
  entry: 0,
  guid: SELF,
  name: undefined,
  objectType: ObjectType.PLAYER,
  position: undefined,
  rawFields: new Map([
    [UNIT_FIELDS.HEALTH.offset, 0],
    [PLAYER_FIELDS.FLAGS.offset, 0],
    [PLAYER_FIELDS.SELF_RES_SPELL.offset, 21_169],
  ]),
  scale: 1,
};

function brokenSocketRuntime() {
  const rig = areaRig("selfstate", {
    getEntity: (guid) => (guid === SELF ? deadSelf : undefined),
    selfGuid: SELF,
  });
  const lifetime = new AbortController();
  const ctx = {
    dbc: undefined,
    expect: (opcode: number, options?: ExpectOptions) =>
      rig.dispatch.expect(opcode, options),
    legacy: undefined,
    listen: <K extends keyof CoreEvents>(name: K, cb: Listener<K>) =>
      rig.events[name].subscribe(cb),
    now: () => 0,
    selfGuid: () => SELF,
    send: () => {
      throw new Error("world socket is not connected");
    },
    signal: lifetime.signal,
    until: () => Promise.reject(new Error("unused")),
  } as unknown as AreaRuntimeCtx<SelfstateEvent>;
  const store = rig.stores.areas.selfstate;
  const runtime = selfstateRuntime(ctx, store, rig.stores);
  return { lifetime, rig, runtime, store };
}

describe("selfstate runtime: a send that throws releases the wait", () => {
  test("selfResurrect rejects with the send error and leaves no timer", async () => {
    jest.useFakeTimers();
    const { rig, runtime, lifetime } = brokenSocketRuntime();
    try {
      await expect(runtime.act.selfResurrect()).rejects.toThrow(
        "world socket is not connected",
      );
      expect(jest.getTimerCount()).toBe(0);
      lifetime.abort();
      await Promise.resolve();
    } finally {
      runtime.dispose?.();
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("queryCorpseMapPosition rejects with the send error and leaves no timer or waiter", async () => {
    jest.useFakeTimers();
    const { rig, runtime, lifetime } = brokenSocketRuntime();
    try {
      await expect(runtime.act.queryCorpseMapPosition()).rejects.toThrow(
        "world socket is not connected",
      );
      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
      lifetime.abort();
      await Promise.resolve();
    } finally {
      runtime.dispose?.();
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("selfstate runtime: aborting a corpse query releases its wait", () => {
  test("the timer is cleared and a late reply is ignored", async () => {
    jest.useFakeTimers();
    const rig = areaRig("selfstate", { selfGuid: SELF });
    try {
      const pending = rig.handle.act.queryCorpseMapPosition();
      const outcome = pending.then(
        () => "resolved",
        () => "rejected",
      );
      rig.dispose();
      expect(await outcome).toBe("rejected");
      expect(jest.getTimerCount()).toBe(0);
      rig.inject(
        GameOpcode.SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE,
        selfstateCorpseMapPositionQueryResponseBody(),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
