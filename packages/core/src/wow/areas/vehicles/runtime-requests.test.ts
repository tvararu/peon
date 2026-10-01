import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  vehiclesMonsterMoveBody,
  vehiclesMonsterMoveTransportBody,
} from "#test-support/areas/vehicles";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { vehiclesRuntime } from "#wow/areas/vehicles/runtime";
import { type VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";
import { SplineFlag } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

const SELF = 0xf1_30_00_3e_ea_00_0a_bcn;
const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;
const PARTNER = 0xf1_30_00_3e_ea_00_0c_bcn;
const CLICKABLE = 0x01_00_00_00;

function rigWith() {
  return areaRig("vehicles", {
    getEntity: (guid: bigint) =>
      guid === VEHICLE ? ({ npcFlags: CLICKABLE } as never) : undefined,
    selfGuid: SELF,
  });
}

function seat(rig: ReturnType<typeof rigWith>): void {
  rig.stores.areas.vehicles.setSeat({
    controlling: false,
    entry: undefined,
    seat: 0,
    vehicle: VEHICLE,
  });
}

function boardSelf(rig: ReturnType<typeof rigWith>): void {
  rig.inject(
    GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
    vehiclesMonsterMoveTransportBody({
      flags: SplineFlag.TRANSPORT_ENTER,
      guid: SELF,
      seat: 0,
      stop: false,
      transportGuid: VEHICLE,
    }),
  );
}

type Pending = {
  live: boolean;
  match: (event: VehiclesEvent) => boolean;
  resolve: (event: VehiclesEvent) => void;
  reject: (error: unknown) => void;
};

type FakeCtx = {
  ctx: AreaRuntimeCtx<VehiclesEvent>;
  emit: (event: VehiclesEvent) => void;
  failWith: (error: Error | undefined) => void;
  liveWaiters: () => number;
  sent: () => number[];
  store: VehiclesStore;
};

function fakeCtx(): FakeCtx {
  const store = new VehiclesStore({
    getEntity: (guid: bigint) =>
      guid === VEHICLE ? ({ npcFlags: CLICKABLE } as never) : undefined,
  } as never);
  store.setSeat({
    controlling: false,
    entry: undefined,
    seat: 0,
    vehicle: VEHICLE,
  });
  store.setVehicleId(SELF, 123);
  const lifetime = new AbortController();
  const pending: Pending[] = [];
  const sent: number[] = [];
  let failure: Error | undefined;
  const ctx = {
    dbc: undefined,
    expect: () => Promise.reject(new Error("unused")),
    legacy: {},
    listen: () => () => undefined,
    now: () => 0,
    selfGuid: () => SELF,
    send: (opcode: number) => {
      if (failure) throw failure;
      sent.push(opcode);
    },
    signal: lifetime.signal,
    until: (
      match: (event: VehiclesEvent) => boolean,
      options: { timeoutMs: number; signal?: AbortSignal },
    ) => {
      const { promise, resolve, reject } =
        Promise.withResolvers<VehiclesEvent>();
      const entry: Pending = {
        live: true,
        match,
        reject: (error: unknown) => {
          entry.live = false;
          clearTimeout(timer);
          reject(error);
        },
        resolve: (event: VehiclesEvent) => {
          entry.live = false;
          clearTimeout(timer);
          resolve(event);
        },
      };
      pending.push(entry);
      const timer = setTimeout(
        () => entry.reject(new Error("timeout")),
        options.timeoutMs,
      );
      options.signal?.addEventListener(
        "abort",
        () => entry.reject(options.signal?.reason ?? new Error("aborted")),
        { once: true },
      );
      return promise;
    },
  } as unknown as AreaRuntimeCtx<VehiclesEvent>;
  return {
    ctx,
    emit: (event: VehiclesEvent) => {
      for (const entry of [...pending])
        if (entry.live && entry.match(event)) entry.resolve(event);
    },
    failWith: (error: Error | undefined) => {
      failure = error;
    },
    liveWaiters: () => pending.filter((entry) => entry.live).length,
    sent: () => sent,
    store,
  };
}

function boardedSelf(): VehiclesEvent {
  return {
    duration: 0,
    flags: SplineFlag.TRANSPORT_ENTER,
    guid: SELF,
    seat: 1,
    splineId: 1,
    transportGuid: VEHICLE,
    type: "spline",
  };
}

describe("seat change answers", () => {
  test("an ejection spline while a seat request waits is not a seat change", async () => {
    jest.useFakeTimers();
    const rig = rigWith();
    seat(rig);
    boardSelf(rig);
    try {
      const pending = rig.handle.act.switchSeat(2);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode).at(-1)).toBe(
        GameOpcode.CMSG_REQUEST_VEHICLE_SWITCH_SEAT,
      );
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({
          flags: SplineFlag.TRANSPORT_EXIT,
          guid: SELF,
          stop: false,
        }),
      );
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a seat spline on another vehicle is not the requested seat change", async () => {
    jest.useFakeTimers();
    const rig = rigWith();
    seat(rig);
    boardSelf(rig);
    try {
      const pending = rig.handle.act.nextSeat();
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: SELF,
          seat: 1,
          stop: false,
          transportGuid: PARTNER,
        }),
      );
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("a failing send", () => {
  const requests: Readonly<
    Record<string, (fake: FakeCtx) => Promise<unknown>>
  > = {
    click: (fake) =>
      vehiclesRuntime(fake.ctx, fake.store, {} as CoreStores).act.spellClick(
        VEHICLE,
      ),
    next: (fake) =>
      vehiclesRuntime(fake.ctx, fake.store, {} as CoreStores).act.nextSeat(),
    prev: (fake) =>
      vehiclesRuntime(fake.ctx, fake.store, {} as CoreStores).act.prevSeat(),
    switch: (fake) =>
      vehiclesRuntime(fake.ctx, fake.store, {} as CoreStores).act.switchSeat(2),
    exit: (fake) =>
      vehiclesRuntime(fake.ctx, fake.store, {} as CoreStores).act.exitVehicle(),
    enter: (fake) =>
      vehiclesRuntime(
        fake.ctx,
        fake.store,
        {} as CoreStores,
      ).act.enterPlayerVehicle(PARTNER),
    eject: (fake) =>
      vehiclesRuntime(
        fake.ctx,
        fake.store,
        {} as CoreStores,
      ).act.ejectPassenger(PARTNER),
  };

  for (const [name, call] of Object.entries(requests)) {
    test(`${name} rejects through the returned promise and releases its waiter`, async () => {
      jest.useFakeTimers();
      try {
        const fake = fakeCtx();
        fake.failWith(new Error("not connected"));
        const pending = call(fake);
        await expect(pending).rejects.toThrow("not connected");
        jest.advanceTimersByTime(3000);
        expect(fake.liveWaiters()).toBe(0);
        expect(fake.sent()).toEqual([]);
      } finally {
        jest.useRealTimers();
      }
    });
  }

  test("a retry after the failure sends and settles", async () => {
    const fake = fakeCtx();
    const runtime = vehiclesRuntime(fake.ctx, fake.store, {} as CoreStores);
    fake.failWith(new Error("not connected"));
    await expect(runtime.act.enterPlayerVehicle(PARTNER)).rejects.toThrow(
      "not connected",
    );
    expect(fake.liveWaiters()).toBe(0);
    fake.failWith(undefined);
    const pending = runtime.act.enterPlayerVehicle(PARTNER);
    expect(fake.sent()).toEqual([GameOpcode.CMSG_PLAYER_VEHICLE_ENTER]);
    fake.emit(boardedSelf());
    expect(await pending).toEqual({ status: "ok" });
    expect(fake.liveWaiters()).toBe(0);
  });
});
