import { describe, expect, test } from "bun:test";
import { type VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";

const GUID = 0xf1_30_00_3e_ea_00_0a_bcn;
const TRANSPORT = 0xf1_30_00_3e_ea_00_0b_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0c_bcn;

function storeWithEvents(self = 0n) {
  const store = new VehiclesStore({
    getEntity: () => undefined,
    selfGuid: () => self,
  } as never);
  const seen: VehiclesEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

describe("VehiclesStore", () => {
  test("starts with no seat, vehicles or passengers", () => {
    expect(
      new VehiclesStore({
        getEntity: () => undefined,
        selfGuid: () => 0n,
      } as never).snapshot(),
    ).toEqual({
      passengers: new Map(),
      seat: undefined,
      vehicleIds: new Map(),
    });
  });

  test("duplicate vehicle data for the same guid keeps the latest id", () => {
    const { seen, store } = storeWithEvents();
    store.receivePlayerVehicle({ guid: GUID, vehicleId: 315 });
    store.receivePlayerVehicle({ guid: GUID, vehicleId: 316 });
    expect(store.snapshot().vehicleIds.get(GUID)).toBe(316);
    expect(seen).toEqual([
      { guid: GUID, type: "player_vehicle", vehicleId: 315 },
      { guid: GUID, type: "player_vehicle", vehicleId: 316 },
    ]);
  });

  test("transport splines accumulate per passenger guid", () => {
    const { store } = storeWithEvents();
    store.receiveTransport({
      guid: GUID,
      move: {
        extra: 0,
        guid: GUID,
        kind: "stop",
        splineId: 9,
        start: { x: 1, y: 2, z: 3 },
      },
      seat: -1,
      transportGuid: TRANSPORT,
    });
    store.receiveTransport({
      guid: OTHER,
      move: {
        extra: 0,
        guid: OTHER,
        kind: "stop",
        splineId: 10,
        start: { x: 1, y: 2, z: 3 },
      },
      seat: 3,
      transportGuid: TRANSPORT,
    });
    expect(store.snapshot().passengers).toEqual(
      new Map([
        [GUID, { seat: -1, transportGuid: TRANSPORT }],
        [OTHER, { seat: 3, transportGuid: TRANSPORT }],
      ]),
    );
  });

  test("a self boarding spline sets the seat and emits entered with the spline id", () => {
    const { seen, store } = storeWithEvents(GUID);
    store.receiveTransport({
      guid: GUID,
      move: {
        cyclic: false,
        duration: 800,
        extra: 0,
        facing: { kind: "none" },
        flags: 0x00_80_00_00,
        guid: GUID,
        interpolation: "linear",
        kind: "move",
        points: [{ x: 1, y: 2, z: 3 }],
        splineId: 4242,
        start: { x: 0, y: 0, z: 0 },
      },
      seat: 0,
      transportGuid: TRANSPORT,
    });
    expect(store.snapshot().seat).toEqual({
      controlling: false,
      entry: undefined,
      seat: 0,
      vehicle: TRANSPORT,
    });
    expect(seen.at(-1)).toEqual({
      duration: 800,
      entry: undefined,
      facing: 0,
      offset: { x: 1, y: 2, z: 3 },
      seat: 0,
      splineId: 4242,
      type: "entered",
      vehicle: TRANSPORT,
    });
  });

  test("a boarding spline facing carries the final angle (Unit.cpp:734-750)", () => {
    const { seen, store } = storeWithEvents(GUID);
    store.receiveTransport({
      guid: GUID,
      move: {
        cyclic: false,
        duration: 800,
        extra: 0,
        facing: { kind: "angle", angle: 1.5 },
        flags: 0x00_80_00_00,
        guid: GUID,
        interpolation: "linear",
        kind: "move",
        points: [{ x: 1, y: 2, z: 3 }],
        splineId: 4242,
        start: { x: 0, y: 0, z: 0 },
      },
      seat: 0,
      transportGuid: TRANSPORT,
    });
    expect(seen.at(-1)).toMatchObject({ facing: 1.5, type: "entered" });
  });

  test("a boarding spline without a final angle carries a zero facing", () => {
    const { seen, store } = storeWithEvents(GUID);
    store.receiveTransport({
      guid: GUID,
      move: {
        cyclic: false,
        duration: 800,
        extra: 0,
        facing: { kind: "none" },
        flags: 0x00_80_00_00,
        guid: GUID,
        interpolation: "linear",
        kind: "move",
        points: [{ x: 1, y: 2, z: 3 }],
        splineId: 4242,
        start: { x: 0, y: 0, z: 0 },
      },
      seat: 0,
      transportGuid: TRANSPORT,
    });
    expect(seen.at(-1)).toMatchObject({ facing: 0, type: "entered" });
  });

  test("snapshot maps are copies, and dispose clears the store", () => {
    const { seen, store } = storeWithEvents();
    store.receivePlayerVehicle({ guid: GUID, vehicleId: 315 });
    const snap = store.snapshot();
    expect(snap.vehicleIds.get(GUID)).toBe(315);
    expect(new Map(snap.vehicleIds).delete(GUID)).toBe(true);
    expect(store.snapshot().vehicleIds.get(GUID)).toBe(315);
    store.dispose();
    expect(store.snapshot().vehicleIds.size).toBe(0);
    expect(store.snapshot().passengers.size).toBe(0);
    store.receivePlayerVehicle({ guid: GUID, vehicleId: 315 });
    expect(seen).toHaveLength(1);
  });
});
