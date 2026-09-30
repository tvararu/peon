import { describe, expect, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import { travelSpec } from "#harness/tools/travel";
import {
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 0, y: 0 });
  return t;
}

describe("travel floor failures", () => {
  test.each([
    {
      cause: "ambiguous ground column",
      floor: 72.6,
      refused: "ambiguous_floor",
      z: 0,
    },
    {
      cause: "ambiguous ground column",
      floor: 80.1,
      refused: "ambiguous_floor",
      z: 80,
    },
    {
      cause: "UNKNOWN_HEIGHT",
      floor: 72.6,
      refused: "no_ground",
      z: 0,
    },
  ])(
    "a failed floor walk for a unit reports the failure ($refused)",
    async ({ cause, floor, refused, z }) => {
      const t = await world();
      setUnits(t.handle, [
        unitRow({
          distance: 36,
          guid: 0x10n,
          name: "Marniel Amberlight",
          relation: "friendly",
          x: 36,
          y: 0,
          z,
        }),
      ]);
      const second =
        refused === "no_ground"
          ? "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)"
          : "pick_destination: ambiguous ground column at destination";
      const goTo = driveGoto(t.handle, [
        {
          floors: [72.6, 80.1],
          refuse: "pick_destination: ambiguous ground column at destination",
        },
        { refuse: second },
      ]);
      const res = await travelSpec.run(
        { to: "Marniel Amberlight" },
        toolCtx<TravelAfter>(t),
      );
      expect(goTo).toHaveBeenCalledTimes(2);
      expect(goTo).toHaveBeenNthCalledWith(2, {
        kind: "point",
        x: 36,
        y: 0,
        z: floor,
      });
      expect(res.status).toBe("FAILED");
      expect(res.reason).toBe(refused);
      expect(res.detail).toContain(cause);
      expect(res.detail).toContain("floor retry");
      expect(res.next).toContain("ask the human");
    },
  );
});
