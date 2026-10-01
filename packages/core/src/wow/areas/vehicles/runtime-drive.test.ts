import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  vehiclesCreateVehicleBlock,
  vehiclesMonsterMoveTransportBody,
} from "#test-support/areas/vehicles";
import { must } from "#test-support/must";
import { buildChangeSeatsOnControlledVehicle } from "#wow/areas/vehicles/protocol";
import type { VehiclesEvent } from "#wow/areas/vehicles/store";
import type { ControlEvent, ControlState } from "#wow/control";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { type MovementInfo, parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { SelfEvent } from "#wow/self-store";

const SELF = 0xf1_30_00_3e_ea_00_0a_bcn;
const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;
const ACCESSORY = 0xf1_30_00_3e_ea_00_0c_bcn;

const POSE = { mapId: 571, orientation: 1, x: 2792, y: 6738, z: 7.8 };

function vehicleEntity(): Entity {
  return {
    createComplete: true,
    entry: 25_334,
    guid: VEHICLE,
    name: undefined,
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: POSE,
    rawFields: new Map(),
    scale: 1,
  } as unknown as Entity;
}

function rig() {
  const made = areaRig("vehicles", {
    getEntity: (guid) => (guid === VEHICLE ? vehicleEntity() : undefined),
    selfGuid: SELF,
  });
  made.stores.areas.vehicles.setSeat({
    controlling: false,
    entry: 25_334,
    seat: 0,
    vehicle: VEHICLE,
  });
  const selfEvents: SelfEvent[] = [];
  made.stores.self.onEvent((event) => selfEvents.push(event));
  const areaEvents: VehiclesEvent[] = [];
  made.stores.areas.vehicles.onEvent((event) => areaEvents.push(event));
  return { areaEvents, made, selfEvents };
}

function controlEvent(
  reason: string | undefined,
  mover: bigint | undefined,
): ControlEvent {
  return {
    reason,
    state: { mover } as ControlState,
    type: "control_changed",
  };
}

describe("seat.controlling follows control", () => {
  test("a control change whose mover is the seat vehicle sets controlling and emits control allow", () => {
    const { made, areaEvents } = rig();
    try {
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      expect(made.stores.areas.vehicles.snapshot().seat?.controlling).toBe(
        true,
      );
      expect(areaEvents).toContainEqual({
        allow: true,
        mover: VEHICLE,
        type: "control",
      });
    } finally {
      made.dispose();
    }
  });

  test("losing the mover clears controlling and emits control with allow false", () => {
    const { made, areaEvents } = rig();
    try {
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      made.events.control.emit(controlEvent("vehicle", undefined));
      expect(made.stores.areas.vehicles.snapshot().seat?.controlling).toBe(
        false,
      );
      expect(areaEvents.at(-1)).toEqual({
        allow: false,
        mover: VEHICLE,
        type: "control",
      });
    } finally {
      made.dispose();
    }
  });

  test("a control change with an unchanged mover emits nothing", () => {
    const { made, areaEvents } = rig();
    try {
      made.events.control.emit(controlEvent("rooted", undefined));
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      made.events.control.emit(controlEvent("rooted", VEHICLE));
      expect(
        areaEvents.filter((event) => event.type === "control"),
      ).toHaveLength(1);
    } finally {
      made.dispose();
    }
  });

  test("the vehicle's speeds from its create block and its pose reach control as mover_state before the control event", () => {
    const { made, selfEvents, areaEvents } = rig();
    try {
      made.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        vehiclesCreateVehicleBlock({
          guid: VEHICLE,
          orientation: 1,
          vehicleId: 318,
        }),
      );
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      const state = selfEvents.find((event) => event.type === "mover_state");
      expect(state).toMatchObject({
        guid: VEHICLE,
        pose: POSE,
        run: 7,
        type: "mover_state",
      });
      expect(areaEvents.some((event) => event.type === "control")).toBe(true);
    } finally {
      made.dispose();
    }
  });
});

describe("driving acts", () => {
  test("exitVehicle while controlling sends the dismiss form through mover_packet", async () => {
    const { made, selfEvents } = rig();
    try {
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      const pending = made.handle.act.exitVehicle();
      const packet = selfEvents.find((event) => event.type === "mover_packet");
      expect(packet).toBeDefined();
      if (packet?.type !== "mover_packet") return;
      expect(packet.opcode).toBe(GameOpcode.CMSG_DISMISS_CONTROLLED_VEHICLE);
      const info: MovementInfo = {
        extraFlags: 0,
        fallTime: 0,
        flags: 0,
        orientation: 0,
        time: 1,
        x: 1,
        y: 2,
        z: 3,
      };
      const read = new PacketReader(packet.build(VEHICLE, info));
      expect(read.packedGuidBig()).toBe(VEHICLE);
      expect(parseMovementInfo(read).x).toBe(1);
      expect(made.sent).toEqual([]);
      made.events.control.emit(controlEvent("vehicle", undefined));
      made.events.control.emit(controlEvent(undefined, undefined));
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      made.dispose();
    }
  });

  test("dismissControlled refuses when the character is not driving", async () => {
    const { made, selfEvents } = rig();
    try {
      expect(await made.handle.act.dismissControlled()).toEqual({
        reason: "not_controlling",
        status: "refused",
      });
      expect(selfEvents.some((event) => event.type === "mover_packet")).toBe(
        false,
      );
    } finally {
      made.dispose();
    }
  });

  test("changeSeatOnControlled refuses without controlling and sends nothing", async () => {
    const { made, selfEvents } = rig();
    try {
      expect(
        await made.handle.act.changeSeatOnControlled(ACCESSORY, 1),
      ).toEqual({ reason: "not_controlling", status: "refused" });
      expect(selfEvents.some((event) => event.type === "mover_packet")).toBe(
        false,
      );
    } finally {
      made.dispose();
    }
  });

  test("changeSeatOnControlled builds the accessory and seat tail and settles ok on the seat change spline", async () => {
    jest.useFakeTimers();
    const { made, selfEvents } = rig();
    try {
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      const pending = made.handle.act.changeSeatOnControlled(ACCESSORY, 2);
      const packet = must(
        selfEvents.find((event) => event.type === "mover_packet"),
      );
      if (packet.type !== "mover_packet") throw new Error("not a packet");
      expect(packet.opcode).toBe(
        GameOpcode.CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE,
      );
      const info: MovementInfo = {
        extraFlags: 0,
        fallTime: 0,
        flags: 0,
        orientation: 0,
        time: 1,
        x: 1,
        y: 2,
        z: 3,
      };
      expect(packet.build(VEHICLE, info)).toEqual(
        buildChangeSeatsOnControlledVehicle(VEHICLE, info, ACCESSORY, 2),
      );
      made.inject(
        GameOpcode.SMSG_MONSTER_MOVE_TRANSPORT,
        vehiclesMonsterMoveTransportBody({
          flags: 0,
          guid: SELF,
          seat: 2,
          stop: false,
          transportGuid: VEHICLE,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      made.dispose();
      jest.useRealTimers();
    }
  });

  test("changeSeatOnControlled with no seat change answer settles no_answer after 3 s", async () => {
    jest.useFakeTimers();
    const { made } = rig();
    try {
      made.events.control.emit(controlEvent("vehicle", VEHICLE));
      const pending = made.handle.act.changeSeatOnControlled(ACCESSORY, 2);
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      made.dispose();
      jest.useRealTimers();
    }
  });
});
