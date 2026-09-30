import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { flushMicrotasks } from "#test-support/microtasks";

const FIELDS = 19;

function displayRow(id: number, bounds: readonly number[]): number[] {
  const row = new Array<number>(FIELDS).fill(0);
  row[0] = id;
  for (let i = 0; i < 6; i++) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, bounds[i] ?? 0, true);
    row[12 + i] = view.getUint32(0, true);
  }
  return row;
}

describe("objects display bounds on the area handle", () => {
  test("state exposes loaded bounds with reversed endpoints ordered", async () => {
    const dbc = dbcFiles(
      new Map([
        [
          "GameObjectDisplayInfo.dbc",
          packDbc(FIELDS, [
            displayRow(3011, [-0.236, 0.0004, 0.083, 0.236, 0.4726, 0]),
          ]),
        ],
      ]),
    );
    const rig = areaRig("objects", { dbc });
    try {
      expect(rig.handle.state().displays).toBeUndefined();
      await flushMicrotasks();
      const bounds = rig.handle.state().displays?.get(3011);
      expect(bounds?.minZ).toBeCloseTo(0, 5);
      expect(bounds?.maxZ).toBeCloseTo(0.083, 5);
      expect(bounds?.minX).toBeCloseTo(-0.236, 5);
      expect(bounds?.maxY).toBeCloseTo(0.4726, 5);
    } finally {
      rig.dispose();
    }
  });

  test("state has no catalog without a data source", () => {
    const rig = areaRig("objects", {});
    try {
      expect(rig.handle.state().displays).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
