import { describe, expect, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { vehiclesHarness } from "#harness/areas/vehicles/area";
import { testRuleInput } from "#test-support/rule-fixtures";

type VehiclesEvent = AreaEventOf<"vehicles">;

const GUID = 0xf1_30_00_3e_ea_00_0a_bcn;

function rules() {
  const event = vehiclesHarness.rules?.().event;
  if (!event) throw new Error("vehicles has no event rule");
  return (e: VehiclesEvent): readonly AreaDraft[] => event(e, testRuleInput());
}

describe("vehicles/player_vehicle", () => {
  test("becoming a vehicle and ceasing to be one each write a log row", () => {
    const [became, ...restBecame] = rules()({
      guid: GUID,
      type: "player_vehicle",
      vehicleId: 315,
    });
    expect(restBecame).toEqual([]);
    expect(became).toMatchObject({
      class: "log",
      data: { guid: "0xf130003eea000abc", vehicleId: 315 },
      name: "player_vehicle",
    });
    expect(became?.text).toContain("became vehicle 315");
    const [cleared, ...restCleared] = rules()({
      guid: GUID,
      type: "player_vehicle",
      vehicleId: 0,
    });
    expect(restCleared).toEqual([]);
    expect(cleared).toMatchObject({
      class: "log",
      data: { guid: "0xf130003eea000abc", vehicleId: 0 },
      name: "player_vehicle",
    });
    expect(cleared?.text).toContain("no longer a vehicle");
  });
});

describe("vehicles/ride_aura_cancel", () => {
  test("the cancel writes one log row", () => {
    const [row, ...rest] = rules()({ type: "ride_aura_cancel" });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ class: "log", name: "ride_aura_cancel" });
    expect(row?.text).toContain("ride aura");
  });
});

describe("vehicles flood guard", () => {
  test("spline writes nothing inside or outside a run", () => {
    const set = areaRuleSet();
    const event: VehiclesEvent = {
      duration: 1000,
      flags: 0,
      guid: GUID,
      offset: { x: 0, y: 0, z: 0 },
      seat: 2,
      splineId: 9,
      transportGuid: GUID,
      type: "spline",
    };
    for (const runActive of [false, true])
      expect(
        areaDrafts(
          set,
          { area: "vehicles", event },
          testRuleInput({ runActive }),
        ),
      ).toEqual([]);
  });
});

describe("vehicles/entered", () => {
  const entered: VehiclesEvent = {
    duration: 1200,
    entry: 31_857,
    facing: 0.5,
    offset: { x: 1, y: 0, z: 2 },
    seat: 0,
    splineId: 7,
    type: "entered",
    vehicle: GUID,
  };

  test("sitting down writes a wake row naming the seat", () => {
    const [row, ...rest] = rules()(entered);
    expect(rest).toEqual([]);
    expect(row?.class).toBe("wake");
    expect(row?.name).toBe("entered");
    expect(row?.data).toEqual({
      entry: 31_857,
      seat: 0,
      vehicle: "0xf130003eea000abc",
    });
  });

  test("an unknown vehicle entry still writes the wake row", () => {
    const [row] = rules()({ ...entered, entry: undefined } as VehiclesEvent);
    expect(row?.class).toBe("wake");
    expect(row?.data).toEqual({
      entry: undefined,
      seat: 0,
      vehicle: "0xf130003eea000abc",
    });
    expect(row?.text).toContain("seat 0");
  });
});

describe("vehicles/exited and seat_changed", () => {
  test("leaving the seat writes a log row", () => {
    const [row] = rules()({ type: "exited", vehicle: GUID });
    expect(row?.class).toBe("log");
    expect(row?.name).toBe("exited");
    expect(row?.data).toEqual({ vehicle: "0xf130003eea000abc" });
  });

  test("switching seat writes a log row with the new seat", () => {
    const [row] = rules()({
      duration: 1,
      facing: 0,
      offset: { x: 0, y: 0, z: 0 },
      seat: 3,
      splineId: 1,
      type: "seat_changed",
      vehicle: GUID,
    });
    expect(row?.class).toBe("log");
    expect(row?.name).toBe("seat_changed");
    expect(row?.data).toEqual({ seat: 3, vehicle: "0xf130003eea000abc" });
  });
});

describe("vehicles attach", () => {
  function attach() {
    const fn = vehiclesHarness.rules?.().attach;
    if (!fn) throw new Error("vehicles has no attach rule");
    return fn;
  }
  const base = {
    passengers: new Map(),
    seat: undefined,
    vehicleIds: new Map(),
  };

  test("a character already seated gets one row", () => {
    const rows = attach()(
      {
        ...base,
        seat: {
          controlling: false,
          entry: 31_857,
          seat: 1,
          vehicle: GUID,
        },
      },
      testRuleInput(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ seat: 1 });
  });

  test("an unseated character gets no row", () => {
    expect(attach()(base, testRuleInput())).toEqual([]);
  });
});

describe("vehicles/control", () => {
  test("taking the vehicle writes a wake row and losing it writes one too", () => {
    const [gained] = rules()({ allow: true, mover: GUID, type: "control" });
    expect(gained).toMatchObject({
      class: "wake",
      data: { allow: true, mover: "0xf130003eea000abc" },
      name: "control",
    });
    expect(gained?.text).toContain("now control");
    const [lost] = rules()({ allow: false, mover: GUID, type: "control" });
    expect(lost).toMatchObject({
      class: "wake",
      data: { allow: false, mover: "0xf130003eea000abc" },
      name: "control",
    });
    expect(lost?.text).toContain("no longer control");
  });
});
