import { describe, expect, test } from "bun:test";
import { type VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";

const GUID = 0xf1_30_00_3e_ea_00_0a_bcn;
const TRANSPORT = 0xf1_30_00_3e_ea_00_0b_bcn;

function storeWithEvents() {
  const store = new VehiclesStore({ getEntity: () => undefined } as never);
  const seen: VehiclesEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

describe("VehiclesStore", () => {
  test("starts with no seat, vehicles or passengers", () => {
    expect(new VehiclesStore({ getEntity: () => undefined } as never).snapshot()).toEqual({
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
    expect(store.snapshot().passengers.get(GUID)).toEqual({
      seat: -1,
      transportGuid: TRANSPORT,
    });
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
