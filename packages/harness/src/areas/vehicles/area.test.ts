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
    expect(
      rules()({ guid: GUID, type: "player_vehicle", vehicleId: 315 }),
    ).toEqual([
      {
        class: "log",
        data: { guid: "0xf130003eea000abc", vehicleId: 315 },
        name: "player_vehicle",
        text: "The unit became vehicle 315.",
      },
    ]);
    expect(
      rules()({ guid: GUID, type: "player_vehicle", vehicleId: 0 }),
    ).toEqual([
      {
        class: "log",
        data: { guid: "0xf130003eea000abc", vehicleId: 0 },
        name: "player_vehicle",
        text: "The unit is no longer a vehicle.",
      },
    ]);
  });
});

describe("vehicles/ride_aura_cancel", () => {
  test("the cancel writes one log row", () => {
    expect(rules()({ type: "ride_aura_cancel" })).toEqual([
      {
        class: "log",
        data: {},
        name: "ride_aura_cancel",
        text: "The server cancelled the expected ride aura.",
      },
    ]);
  });
});

describe("vehicles flood guard", () => {
  test("spline writes nothing inside or outside a run", () => {
    const set = areaRuleSet();
    const event: VehiclesEvent = {
      duration: 1000,
      flags: 0,
      guid: GUID,
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
