import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { UnitmotionEvent } from "#wow/areas/unitmotion/store";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0a_bdn;

const SPEEDS = {
  walk: 2.5,
  run: 7,
  run_back: 4.5,
  swim: 4.722_222,
  swim_back: 2.5,
  flight: 7,
  flight_back: 4.5,
  turn: 3.141_594,
  pitch: 3.14,
};

describe("unitmotion runtime", () => {
  test("a unit that leaves view is removed", () => {
    const rig = areaRig("unitmotion");
    try {
      const seen: UnitmotionEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      for (const guid of [UNIT, OTHER])
        rig.stores.areas.unitmotion.seed(guid, { flags: 0, speeds: SPEEDS });
      rig.events.entity.emit({ guid: UNIT, type: "disappear" });
      expect(rig.handle.state().units.map((row) => row.guid)).toEqual([OTHER]);
      expect(seen).toEqual([{ type: "removed", guid: UNIT, self: false }]);
    } finally {
      rig.dispose();
    }
  });
});
