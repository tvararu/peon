import { describe, expect, test } from "bun:test";
import {
  transportsDbc,
  transportsTaxiPathNodeDbc,
} from "#test-support/areas/transports";
import { must } from "#test-support/must";
import {
  liftPoseAt,
  readLiftAnimations,
  TRANSPORT_ANIMATION_LAYOUT,
  TRANSPORT_ROTATION_LAYOUT,
} from "#wow/areas/transports/lift";
import { openDbc } from "#wow/dbc";

async function animOf(entry: number, times: readonly number[]) {
  const dbc = transportsDbc({
    animations: times.map((timeSeg, i) => ({
      entry,
      timeSeg,
      x: 0,
      y: 0,
      z: i * 10,
    })),
  });
  return must(
    (await readLiftAnimations(dbc, TRANSPORT_ANIMATION_LAYOUT)).get(entry),
  );
}

describe("readLiftAnimations", () => {
  test("groups rows by transport entry sorted by time segment", async () => {
    const anim = await animOf(77, [3000, 0, 1000]);
    expect(anim.nodes.map((n) => n.timeSeg)).toEqual([0, 1000, 3000]);
    expect(anim.totalTime).toBe(3000);
  });

  test("duplicate time segments overwrite the earlier row", async () => {
    const dbc = transportsDbc({
      animations: [
        { entry: 5, timeSeg: 0, x: 1, y: 0, z: 0 },
        { entry: 5, timeSeg: 0, x: 2, y: 0, z: 0 },
      ],
    });
    const anim = must(
      (await readLiftAnimations(dbc, TRANSPORT_ANIMATION_LAYOUT)).get(5),
    );
    expect(anim.nodes.map((n) => n.x)).toEqual([2]);
  });

  test("a file with the wrong layout is rejected", async () => {
    await expect(
      openDbc(
        async () =>
          transportsTaxiPathNodeDbc([
            { path: 1, index: 0, mapId: 0, x: 0, y: 0, z: 0 },
          ]),
        TRANSPORT_ANIMATION_LAYOUT,
      ),
    ).rejects.toThrow("unsupported layout");
  });
});

describe("liftPoseAt", () => {
  const BASE = { x: 100, y: 200, z: 300, orientation: 0.5 };

  test("interpolates the offset between animation nodes", async () => {
    const anim = await animOf(9, [0, 2000, 4000]);
    expect(must(liftPoseAt(anim, 1000, BASE, 0)).z).toBeCloseTo(305, 5);
    expect(must(liftPoseAt(anim, 3000, BASE, 0)).z).toBeCloseTo(315, 5);
  });

  test("progress wraps at the total time", async () => {
    const anim = await animOf(9, [0, 2000, 4000]);
    expect(must(liftPoseAt(anim, 5000, BASE, 0)).z).toBeCloseTo(305, 5);
  });

  test("below the first node time the lift waits at stationary", async () => {
    const anim = await animOf(9, [1000, 2000]);
    expect(liftPoseAt(anim, 500, BASE, 0)).toBeUndefined();
  });

  test("rotates the offset by the path rotation angle", async () => {
    const dbc = transportsDbc({
      animations: [
        { entry: 9, timeSeg: 0, x: 10, y: 0, z: 0 },
        { entry: 9, timeSeg: 4000, x: 10, y: 0, z: 10 },
      ],
    });
    const anim = must(
      (await readLiftAnimations(dbc, TRANSPORT_ANIMATION_LAYOUT)).get(9),
    );
    const pose = must(liftPoseAt(anim, 2000, BASE, Math.PI / 2));
    expect(pose.x).toBeCloseTo(100, 4);
    expect(pose.y).toBeCloseTo(210, 4);
    expect(pose.z).toBeCloseTo(305, 4);
  });

  test("an empty animation has no pose", async () => {
    expect(liftPoseAt({ nodes: [], totalTime: 0 }, 0, BASE, 0)).toBeUndefined();
  });

  test("an animated rotation advances the orientation", async () => {
    const dbc = transportsDbc({
      animations: [
        { entry: 9, timeSeg: 0, x: 0, y: 0, z: 0 },
        { entry: 9, timeSeg: 4000, x: 0, y: 0, z: 10 },
      ],
      rotations: [
        { entry: 9, timeSeg: 0, x: 0, y: 0, z: 0, w: 1 },
        {
          entry: 9,
          timeSeg: 4000,
          x: 0,
          y: 0,
          z: Math.SQRT1_2,
          w: Math.SQRT1_2,
        },
      ],
    });
    const anim = must(
      (
        await readLiftAnimations(dbc, TRANSPORT_ANIMATION_LAYOUT, {
          file: TRANSPORT_ROTATION_LAYOUT.file,
          fields: TRANSPORT_ROTATION_LAYOUT.fields,
          recordSize: TRANSPORT_ROTATION_LAYOUT.recordSize,
        })
      ).get(9),
    );
    expect(must(liftPoseAt(anim, 2000, BASE, 0)).orientation).toBeCloseTo(
      0.5 + Math.PI / 4,
      3,
    );
  });
});
