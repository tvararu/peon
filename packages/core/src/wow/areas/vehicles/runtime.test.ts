import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  vehiclesMonsterMoveBody,
  vehiclesMonsterMoveTransportBody,
  vehiclesPlayerVehicleDataBody,
} from "#test-support/areas/vehicles";
import { vehiclesRuntime } from "#wow/areas/vehicles/runtime";
import { type VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { SplineFlag } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0xf1_30_00_3e_ea_00_0a_bcn;
const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;
const PARTNER = 0xf1_30_00_3e_ea_00_0c_bcn;

function unit(guid: bigint, npcFlags: number): Entity {
  return {
    createComplete: true,
    entry: 0,
    guid,
    name: undefined,
    npcFlags,
    objectType: ObjectType.UNIT,
    position: undefined,
    rawFields: new Map(),
    scale: 1,
  } as unknown as Entity;
}

function board(rig: ReturnType<typeof rigWith>, guid: bigint): void {
  rig.inject(
    GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
    vehiclesMonsterMoveTransportBody({
      flags: SplineFlag.TRANSPORT_ENTER,
      guid,
      seat: 0,
      stop: false,
      transportGuid: SELF,
    }),
  );
}

function rigWith(flags: Map<bigint, number>) {
  const rig = areaRig("vehicles", {
    getEntity: (guid) => {
      const npcFlags = flags.get(guid);
      return npcFlags === undefined ? undefined : unit(guid, npcFlags);
    },
    selfGuid: SELF,
  });
  return rig;
}

describe("vehicles acts", () => {
  test("spellClick sends the guid and settles ok on the boarding spline (AC Handlers/VehicleHandler.cpp:76)", async () => {
    const rig = rigWith(new Map([[VEHICLE, 0x01_00_00_00]]));
    try {
      const pending = rig.handle.act.spellClick(VEHICLE);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_SPELLCLICK,
      ]);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: SELF,
          seat: 0,
          stop: false,
          transportGuid: VEHICLE,
          flags: SplineFlag.TRANSPORT_ENTER,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("spellClick without the click flag refuses and sends nothing (AC Entities/Vehicle/Vehicle.cpp:395-397)", async () => {
    const rig = rigWith(new Map([[VEHICLE, 0]]));
    try {
      expect(await rig.handle.act.spellClick(VEHICLE)).toEqual({
        status: "refused",
        reason: "not_clickable",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("silence for 3 s settles no_answer (AC Handlers/VehicleHandler.cpp:76,171,240)", async () => {
    jest.useFakeTimers();
    const rig = rigWith(new Map([[VEHICLE, 0x01_00_00_00]]));
    try {
      const pending = rig.handle.act.spellClick(VEHICLE);
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("exitVehicle sends exit and settles ok when control returns to the character (AC Unit.cpp:15343-15346)", async () => {
    const rig = rigWith(new Map());
    rig.stores.areas.vehicles.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    try {
      const pending = rig.handle.act.exitVehicle();
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_REQUEST_VEHICLE_EXIT,
      ]);
      rig.events.control.emit({ type: "control_changed", state: {} as never });
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("exitVehicle after a boarding spline uses the seat the spline named", async () => {
    const rig = rigWith(new Map([[VEHICLE, 0x01_00_00_00]]));
    try {
      const boarding = rig.handle.act.spellClick(VEHICLE);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: SELF,
          seat: 0,
          stop: false,
          transportGuid: VEHICLE,
          flags: SplineFlag.TRANSPORT_ENTER,
        }),
      );
      expect(await boarding).toEqual({ status: "ok" });
      const exit = rig.handle.act.exitVehicle();
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_SPELLCLICK,
        GameOpcode.CMSG_REQUEST_VEHICLE_EXIT,
      ]);
      rig.events.control.emit({ type: "control_changed", state: {} as never });
      expect(await exit).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("the character guid is read when the act runs, not when the runtime is built", async () => {
    let self = 0n;
    const store = new VehiclesStore({
      getEntity: () => undefined,
      selfGuid: () => self,
    } as never);
    const sent: number[] = [];
    const ctx = {
      listen: () => () => undefined,
      selfGuid: () => self,
      send: (opcode: number) => void sent.push(opcode),
      signal: new AbortController().signal,
      until: (match: (event: VehiclesEvent) => boolean) =>
        new Promise<VehiclesEvent>((resolve) => {
          const off = store.onEvent((event) => {
            if (!match(event)) return;
            off();
            resolve(event);
          });
        }),
    } as unknown as Parameters<typeof vehiclesRuntime>[0];
    const runtime = vehiclesRuntime(ctx, store, {
      self: { receive: () => undefined },
    } as never);
    self = SELF;
    store.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    const pending = runtime.act.nextSeat();
    store.receiveTransport({
      guid: SELF,
      move: {
        kind: "move",
        duration: 1,
        facing: { kind: "none" },
        flags: 0,
        splineId: 1,
      } as never,
      seat: 1,
      transportGuid: VEHICLE,
    });
    expect(await pending).toEqual({ status: "ok" });
    expect(sent).toEqual([GameOpcode.CMSG_REQUEST_VEHICLE_NEXT_SEAT]);
  });

  test("exitVehicle ignores control changes that carry a reason and times out", async () => {
    jest.useFakeTimers();
    const rig = rigWith(new Map());
    rig.stores.areas.vehicles.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    try {
      const pending = rig.handle.act.exitVehicle();
      rig.events.control.emit({
        type: "control_changed",
        reason: "rooted",
        state: {} as never,
      });
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("exitVehicle without a seat refuses and sends nothing", async () => {
    const rig = rigWith(new Map());
    try {
      expect(await rig.handle.act.exitVehicle()).toEqual({
        status: "refused",
        reason: "not_seated",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("nextSeat sends next and settles ok on a higher seat spline", async () => {
    const rig = rigWith(new Map());
    rig.stores.areas.vehicles.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    try {
      const pending = rig.handle.act.nextSeat();
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_REQUEST_VEHICLE_NEXT_SEAT,
      ]);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: SELF,
          seat: 1,
          stop: false,
          transportGuid: VEHICLE,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("switchSeat sends the packed guid and seat", async () => {
    const rig = rigWith(new Map());
    rig.stores.areas.vehicles.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    try {
      const pending = rig.handle.act.switchSeat(2);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_REQUEST_VEHICLE_SWITCH_SEAT,
      ]);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: SELF,
          seat: 2,
          stop: false,
          transportGuid: VEHICLE,
          flags: SplineFlag.TRANSPORT_ENTER,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("enterPlayerVehicle sends the player guid and settles ok on the partner spline", async () => {
    const rig = rigWith(new Map());
    try {
      const pending = rig.handle.act.enterPlayerVehicle(PARTNER);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_PLAYER_VEHICLE_ENTER,
      ]);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          guid: SELF,
          seat: 1,
          stop: false,
          transportGuid: PARTNER,
          flags: SplineFlag.TRANSPORT_ENTER,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("ejectPassenger sends the passenger guid when seated in a vehicle id (AC Handlers/VehicleHandler.cpp:167-173)", async () => {
    const rig = rigWith(new Map());
    rig.inject(
      GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
      vehiclesPlayerVehicleDataBody({ guid: SELF, vehicleId: 123 }),
    );
    rig.stores.areas.vehicles.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    try {
      const pending = rig.handle.act.ejectPassenger(PARTNER);
      await Promise.resolve();
      const ejectSent = rig.sent.slice(-1).map((packet) => packet.opcode);
      expect(ejectSent).toEqual([GameOpcode.CMSG_CONTROLLER_EJECT_PASSENGER]);
      board(rig, PARTNER);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({
          flags: SplineFlag.TRANSPORT_EXIT,
          guid: PARTNER,
          stop: false,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });
  test("ejectPassenger sends the passenger guid from a driver with no seat of its own (AC Handlers/VehicleHandler.cpp:167-173)", async () => {
    const rig = rigWith(new Map());
    rig.inject(
      GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
      vehiclesPlayerVehicleDataBody({ guid: SELF, vehicleId: 123 }),
    );
    try {
      const pending = rig.handle.act.ejectPassenger(PARTNER);
      await Promise.resolve();
      const ejectSent = rig.sent.slice(-1).map((packet) => packet.opcode);
      expect(ejectSent).toEqual([GameOpcode.CMSG_CONTROLLER_EJECT_PASSENGER]);
      board(rig, PARTNER);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({
          flags: SplineFlag.TRANSPORT_EXIT,
          guid: PARTNER,
          stop: false,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("an exit spline for another passenger does not settle the eject", async () => {
    jest.useFakeTimers();
    const rig = rigWith(new Map());
    const other = 0xf1_30_00_3e_ea_00_0d_bcn;
    rig.inject(
      GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
      vehiclesPlayerVehicleDataBody({ guid: SELF, vehicleId: 123 }),
    );
    board(rig, PARTNER);
    board(rig, other);
    try {
      const pending = rig.handle.act.ejectPassenger(PARTNER);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({
          flags: SplineFlag.TRANSPORT_EXIT,
          guid: other,
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

  test("a plain move of a passenger does not count as leaving the vehicle", async () => {
    jest.useFakeTimers();
    const rig = rigWith(new Map());
    rig.inject(
      GameOpcode.SMSG_PLAYER_VEHICLE_DATA,
      vehiclesPlayerVehicleDataBody({ guid: SELF, vehicleId: 123 }),
    );
    board(rig, PARTNER);
    try {
      const pending = rig.handle.act.ejectPassenger(PARTNER);
      rig.inject(
        GameOpcode.SMSG_MONSTER_MOVE,
        vehiclesMonsterMoveBody({ guid: PARTNER, stop: false }),
      );
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
      expect(rig.stores.areas.vehicles.snapshot().passengers.has(PARTNER)).toBe(
        true,
      );
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("disposing the rig while an exit waits aborts it", async () => {
    const rig = rigWith(new Map());
    rig.stores.areas.vehicles.setSeat({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: VEHICLE,
    });
    const settled = rig.handle.act.exitVehicle().then(
      () => "resolved",
      () => "rejected",
    );
    rig.dispose();
    expect(await settled).toBe("rejected");
  });

  test("disposing the rig while waiting aborts the pending act", async () => {
    const rig = rigWith(new Map([[VEHICLE, 0x01_00_00_00]]));
    const pending = rig.handle.act.spellClick(VEHICLE);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    rig.dispose();
    expect(await settled).toBe("rejected");
  });

  test("ejectPassenger while not a vehicle refuses and sends nothing", async () => {
    const rig = rigWith(new Map());
    try {
      expect(await rig.handle.act.ejectPassenger(PARTNER)).toEqual({
        status: "refused",
        reason: "not_a_vehicle",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
