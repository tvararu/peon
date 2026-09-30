import { describe, expect, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { travelSpec } from "#harness/tools/travel";
import {
  contentOf,
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

function fit(res: ToolResult<TravelAfter>): string {
  const text = contentOf(res);
  return text;
}

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 0, y: 0 });
  return t;
}

describe("travel floor failures", () => {
  test.each([
    {
      floor: 72.6,
      height:
        "ambiguous ground column at destination. Walked 0 yd. Tried: planner twice (floor retry). Not tried: another destination.\nThe destination has more than one floor. Repeat the travel with one of floors as Z, or choose another destination. Do not guess Z.",
      nextLine:
        'ask the human: "I cannot reach Marniel Amberlight from here. Is there another way?"',
      refuse: "pick_destination: ambiguous ground column at destination",
      refused: "ambiguous_floor",
      refusedStatus: "FAILED",
      z: 0,
    },
    {
      floor: 80.1,
      height:
        "ambiguous ground column at destination. Walked 0 yd. Tried: planner twice (floor retry). Not tried: another destination.\nThe destination has more than one floor. Repeat the travel with one of floors as Z, or choose another destination. Do not guess Z.",
      nextLine:
        'ask the human: "I cannot reach Marniel Amberlight from here. Is there another way?"',
      refuse: "pick_destination: ambiguous ground column at destination",
      refused: "ambiguous_floor",
      refusedStatus: "FAILED",
      z: 80,
    },
    {
      floor: 72.6,
      height:
        "the path finder found no ground on the way (UNKNOWN_HEIGHT). Walked 0 yd. Tried: planner twice (floor retry).",
      nextLine:
        'ask the human: "I cannot reach Marniel Amberlight from here. Is there another way?"',
      refuse: "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)",
      refused: "no_ground",
      refusedStatus: "FAILED",
      z: 0,
    },
  ])(
    "a failed floor walk for a unit reports the failure ($refused)",
    async ({ floor, height, nextLine, refuse, refused, refusedStatus, z }) => {
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
      const goTo = driveGoto(t.handle, [
        {
          floors: [72.6, 80.1],
          refuse: "pick_destination: ambiguous ground column at destination",
        },
        { refuse },
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
      expect(res).toMatchObject({ reason: refused, status: refusedStatus });
      expect(fit(res)).toBe(
        `${refusedStatus} ${refused}: ${height}\nNext: ${nextLine}`,
      );
    },
  );
});
