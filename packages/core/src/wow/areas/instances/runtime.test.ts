import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  instancesInstanceDifficultyBody,
  instancesLockWarningBody,
  instancesRaidGroupOnlyBody,
  instancesRaidInstanceInfoBody,
  instancesSaveCreatedBody,
} from "#test-support/areas/instances";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLockResponse,
  buildSetLockoutExtended,
} from "#wow/areas/instances/protocol";
import { instancesRuntime } from "#wow/areas/instances/runtime";
import {
  createInstancesStore,
  type InstancesEvent,
} from "#wow/areas/instances/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

const ORGRIMMAR = { mapId: 1, x: 1, y: 2, z: 3, orientation: 0 };
const DEADMINES = { mapId: 36, x: 1, y: 2, z: 3, orientation: 0 };

function armed() {
  const rig = areaRig("instances");
  rig.stores.self.receive({ type: "login_verified", position: DEADMINES });
  rig.inject(
    GameOpcode.SMSG_INSTANCE_DIFFICULTY,
    instancesInstanceDifficultyBody({ difficulty: 1, dynamicHeroic: false }),
  );
  rig.inject(
    GameOpcode.SMSG_RAID_GROUP_ONLY,
    instancesRaidGroupOnlyBody({ timerMs: 60_000, code: 1 }),
  );
  return rig;
}

describe("instances runtime", () => {
  test("a new_world self event clears the per-map state", () => {
    const rig = armed();
    try {
      expect(rig.handle.state().homebindTimer).toBeDefined();
      rig.stores.self.receive({ type: "new_world", position: ORGRIMMAR });
      expect(rig.handle.state()).toMatchObject({
        homebindTimer: undefined,
        mapDifficulty: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a login_verified self event clears the per-map state and other self events do not", () => {
    const rig = armed();
    try {
      rig.stores.self.receive({ type: "transfer_pending", mapId: 0 });
      expect(rig.handle.state().mapDifficulty).toMatchObject({ mapId: 36 });
      rig.stores.self.receive({ type: "login_verified", position: ORGRIMMAR });
      expect(rig.handle.state().mapDifficulty).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("dispose releases the self subscription", () => {
    const off = jest.fn();
    const onEvent = jest.fn(() => off);
    const core = { self: { onEvent } } as unknown as CoreStores;
    const deps = { now: () => 0 } as unknown as SessionDeps;
    const ctx = {} as AreaRuntimeCtx<InstancesEvent>;
    const runtime = instancesRuntime(
      ctx,
      createInstancesStore(deps, core),
      core,
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(off).not.toHaveBeenCalled();
    runtime.dispose();
    expect(off).toHaveBeenCalledTimes(1);
  });
});

const ICC = {
  mapId: 631,
  difficulty: 1,
  instanceGuid: 0x1f50_0000_0000_0007n,
  extended: false,
  secondsToReset: 86_400,
};

const opcodes = (rig: { sent: readonly { opcode: number }[] }) =>
  rig.sent.map((packet) => packet.opcode);

function offered(
  rig: { inject: (opcode: number, body: Uint8Array) => void },
  timeoutMs = 60_000,
): void {
  rig.inject(
    GameOpcode.SMSG_INSTANCE_LOCK_WARNING_QUERY,
    instancesLockWarningBody({ timeoutMs, encounterMask: 0 }),
  );
}

describe("instances runtime: requestLockouts", () => {
  test("sends one CMSG_REQUEST_RAID_INFO and settles ok with the reply's locks", async () => {
    const rig = armed();
    try {
      const pending = rig.handle.act.requestLockouts();
      expect(opcodes(rig)).toEqual([GameOpcode.CMSG_REQUEST_RAID_INFO]);
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([ICC]),
      );
      expect(await pending).toEqual({
        status: "ok",
        locks: [
          {
            mapId: 631,
            difficulty: 1,
            instanceGuid: 0x1f50_0000_0000_0007n,
            locked: true,
            extended: false,
            secondsToReset: 86_400,
          },
        ],
      });
    } finally {
      rig.dispose();
    }
  });

  test("an empty reply is an ok answer with no locks", async () => {
    const rig = armed();
    try {
      const pending = rig.handle.act.requestLockouts();
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([]),
      );
      expect(await pending).toEqual({ status: "ok", locks: [] });
    } finally {
      rig.dispose();
    }
  });

  test("settles no_answer after 5 s of silence and frees the act for the next call", async () => {
    jest.useFakeTimers();
    const rig = armed();
    try {
      const pending = rig.handle.act.requestLockouts();
      jest.advanceTimersByTime(4999);
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([]),
      );
      expect(await pending).toEqual({ status: "ok", locks: [] });
      const silent = rig.handle.act.requestLockouts();
      jest.advanceTimersByTime(5000);
      expect(await silent).toEqual({ status: "no_answer" });
      const again = rig.handle.act.requestLockouts();
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([]),
      );
      expect(await again).toMatchObject({ status: "ok" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a second instance act while one is in flight refuses busy and sends nothing", async () => {
    const rig = armed();
    try {
      const first = rig.handle.act.requestLockouts();
      expect(await rig.handle.act.requestLockouts()).toEqual({
        status: "refused",
        reason: "busy",
      });
      offered(rig);
      expect(await rig.handle.act.answerBind(true)).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(opcodes(rig)).toEqual([GameOpcode.CMSG_REQUEST_RAID_INFO]);
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([]),
      );
      await first;
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending request with the abort reason", async () => {
    const rig = armed();
    const pending = rig.handle.act.requestLockouts();
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  test("a failed send rejects and leaves no waiter or timer behind", async () => {
    jest.useFakeTimers();
    const rig = armed();
    try {
      Object.freeze(rig.sent);
      await expect(rig.handle.act.requestLockouts()).rejects.toThrow();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("instances runtime: answerBind", () => {
  test("refuses no_bind_offer without a pending bind and sends nothing (MiscHandler.cpp:1709-1714)", async () => {
    const rig = armed();
    try {
      for (const accept of [true, false])
        expect(await rig.handle.act.answerBind(accept)).toEqual({
          status: "refused",
          reason: "no_bind_offer",
        });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("an expired offer refuses no_bind_offer", async () => {
    let clock = 0;
    const rig = areaRig("instances", { now: () => clock });
    try {
      offered(rig);
      clock = 60_000;
      expect(await rig.handle.act.answerBind(true)).toEqual({
        status: "refused",
        reason: "no_bind_offer",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("accepting sends the response and settles ok on SMSG_INSTANCE_SAVE_CREATED", async () => {
    const rig = armed();
    try {
      offered(rig);
      const pending = rig.handle.act.answerBind(true);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_INSTANCE_LOCK_RESPONSE,
          body: buildLockResponse(true),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_INSTANCE_SAVE_CREATED,
        instancesSaveCreatedBody(),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().pendingBind).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("accepting settles no_answer after 5 s without SMSG_INSTANCE_SAVE_CREATED", async () => {
    jest.useFakeTimers();
    const rig = armed();
    try {
      offered(rig);
      const pending = rig.handle.act.answerBind(true);
      jest.advanceTimersByTime(5000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("declining sends 0 and settles ok on the next map change (MiscHandler.cpp:1719)", async () => {
    const rig = armed();
    try {
      offered(rig);
      const pending = rig.handle.act.answerBind(false);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_INSTANCE_LOCK_RESPONSE,
          body: buildLockResponse(false),
        },
      ]);
      rig.stores.self.receive({ type: "transfer_pending", mapId: 0 });
      rig.stores.self.receive({ type: "new_world", position: ORGRIMMAR });
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("declining settles no_answer after 5 s without a map change and releases the act", async () => {
    jest.useFakeTimers();
    const rig = armed();
    try {
      offered(rig);
      const pending = rig.handle.act.answerBind(false);
      jest.advanceTimersByTime(5000);
      expect(await pending).toEqual({ status: "no_answer" });
      const next = rig.handle.act.requestLockouts();
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([]),
      );
      expect(await next).toMatchObject({ status: "ok" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("dispose rejects a pending decline", async () => {
    const rig = armed();
    offered(rig);
    const pending = rig.handle.act.answerBind(false);
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("instances runtime: setLockoutExtended", () => {
  const extend = { mapId: 631, difficulty: 1, extended: true };

  async function withLock(rig: ReturnType<typeof armed>) {
    const first = rig.handle.act.requestLockouts();
    rig.inject(
      GameOpcode.SMSG_RAID_INSTANCE_INFO,
      instancesRaidInstanceInfoBody([ICC]),
    );
    await first;
  }

  test("refuses no_matching_lock with no known locks, another map, another difficulty or the flag already set (CalendarHandler.cpp:799-805)", async () => {
    const rig = armed();
    try {
      const refused = {
        status: "refused",
        reason: "no_matching_lock",
      } as const;
      expect(await rig.handle.act.setLockoutExtended(extend)).toEqual(refused);
      await withLock(rig);
      expect(
        await rig.handle.act.setLockoutExtended({ ...extend, mapId: 533 }),
      ).toEqual(refused);
      expect(
        await rig.handle.act.setLockoutExtended({ ...extend, difficulty: 3 }),
      ).toEqual(refused);
      expect(
        await rig.handle.act.setLockoutExtended({ ...extend, extended: false }),
      ).toEqual(refused);
      expect(opcodes(rig)).toEqual([GameOpcode.CMSG_REQUEST_RAID_INFO]);
    } finally {
      rig.dispose();
    }
  });

  test("sends the request, asks for the lockouts again and settles ok when the flag changed", async () => {
    const rig = armed();
    try {
      await withLock(rig);
      const pending = rig.handle.act.setLockoutExtended(extend);
      expect(rig.sent.slice(1)).toEqual([
        {
          opcode: GameOpcode.CMSG_SET_SAVED_INSTANCE_EXTEND,
          body: buildSetLockoutExtended(extend),
        },
        { opcode: GameOpcode.CMSG_REQUEST_RAID_INFO, body: new Uint8Array() },
      ]);
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([{ ...ICC, extended: true }]),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("refuses unchanged when the fresh list still has the old flag", async () => {
    const rig = armed();
    try {
      await withLock(rig);
      const pending = rig.handle.act.setLockoutExtended(extend);
      rig.inject(
        GameOpcode.SMSG_RAID_INSTANCE_INFO,
        instancesRaidInstanceInfoBody([ICC]),
      );
      expect(await pending).toEqual({ status: "refused", reason: "unchanged" });
    } finally {
      rig.dispose();
    }
  });

  test("settles no_answer when the lockouts never come back", async () => {
    jest.useFakeTimers();
    const rig = armed();
    try {
      await withLock(rig);
      const pending = rig.handle.act.setLockoutExtended(extend);
      jest.advanceTimersByTime(5000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
