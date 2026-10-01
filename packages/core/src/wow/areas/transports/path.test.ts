import { describe, expect, test } from "bun:test";
import {
  TRANSPORTS_STRAIGHT_NODES,
  TRANSPORTS_STRAIGHT_PATH,
  transportsAnimationDbc,
  transportsDbc,
} from "#test-support/areas/transports";
import { must } from "#test-support/must";
import {
  generateTransportPath,
  readTaxiPaths,
  TAXI_PATH_NODE_LAYOUT,
  type TaxiNode,
} from "#wow/areas/transports/path";
import { openDbc } from "#wow/dbc";

async function nodesOf(
  fixture: Parameters<typeof transportsDbc>[0],
  path: number,
): Promise<readonly TaxiNode[]> {
  const file = await openDbc(transportsDbc(fixture), TAXI_PATH_NODE_LAYOUT);
  return must(readTaxiPaths(file).get(path));
}

const STRAIGHT = { nodes: TRANSPORTS_STRAIGHT_NODES };

async function straight() {
  return must(
    generateTransportPath(
      await nodesOf(STRAIGHT, TRANSPORTS_STRAIGHT_PATH),
      10,
      5,
    ),
  );
}

describe("readTaxiPaths", () => {
  test("groups rows by path and orders them by node index", async () => {
    const nodes = await nodesOf(
      {
        nodes: [
          { path: 3, index: 1, mapId: 0, x: 2, y: 0, z: 0 },
          { path: 4, index: 0, mapId: 0, x: 9, y: 9, z: 9 },
          { path: 3, index: 0, mapId: 0, x: 1, y: 0, z: 0, actionFlag: 2 },
        ],
      },
      3,
    );
    expect(nodes.map((n) => n.x)).toEqual([1, 2]);
    expect(must(nodes[0]).actionFlag).toBe(2);
  });

  test("a file with the wrong layout is rejected", async () => {
    await expect(
      openDbc(
        async () =>
          transportsAnimationDbc([{ entry: 1, timeSeg: 0, x: 0, y: 0, z: 0 }]),
        TAXI_PATH_NODE_LAYOUT,
      ),
    ).rejects.toThrow("unsupported layout");
  });
});

describe("generateTransportPath", () => {
  test("the period is the last departure time in milliseconds", async () => {
    expect((await straight()).period).toBe(32_000);
  });

  test("progress 0 waits at the first stop with the path heading", async () => {
    const pose = must((await straight()).poseAt(0));
    expect(pose).toMatchObject({ mapId: 1, moving: false, x: 100, y: 0, z: 0 });
    expect(pose.orientation).toBeCloseTo(Math.PI, 5);
  });

  test("the stop window lasts the node delay and then departs", async () => {
    const path = await straight();
    expect(must(path.poseAt(4999)).moving).toBe(false);
    expect(must(path.poseAt(5000)).moving).toBe(true);
    expect(must(path.poseAt(5000)).x).toBeCloseTo(100, 3);
  });

  test("a moving pose follows the accelerating spline", async () => {
    const pose = must((await straight()).poseAt(10_500));
    expect(pose.moving).toBe(true);
    expect(pose.x).toBeCloseTo(138.262, 2);
    expect(pose.y).toBeCloseTo(0, 5);
  });

  test("the mid node is reached at full speed after its arrival time", async () => {
    const pose = must((await straight()).poseAt(16_000));
    expect(pose.x).toBeCloseTo(200, 3);
    expect(pose.moving).toBe(true);
  });

  test("the last stop waits for the node delay", async () => {
    const path = await straight();
    const pose = must(path.poseAt(28_000));
    expect(pose).toMatchObject({ moving: false, x: 300 });
  });

  test("progress wraps by the period", async () => {
    const path = await straight();
    expect(must(path.poseAt(32_000 + 10_500)).x).toBeCloseTo(
      must(path.poseAt(10_500)).x,
      6,
    );
  });

  test("a path with fewer than two nodes has no model", () => {
    expect(
      generateTransportPath(
        [{ actionFlag: 0, delay: 0, index: 0, mapId: 0, x: 0, y: 0, z: 0 }],
        10,
        5,
      ),
    ).toBeUndefined();
  });

  test("a zero speed or acceleration has no model", async () => {
    const nodes = await nodesOf(STRAIGHT, TRANSPORTS_STRAIGHT_PATH);
    expect(generateTransportPath(nodes, 0, 5)).toBeUndefined();
    expect(generateTransportPath(nodes, 10, 0)).toBeUndefined();
  });

  test("a map change teleports the transport between map segments", async () => {
    const nodes = await nodesOf(
      {
        nodes: [
          { path: 9, index: 0, mapId: 1, x: 0, y: 0, z: 0 },
          {
            path: 9,
            index: 1,
            mapId: 1,
            x: 100,
            y: 0,
            z: 0,
            actionFlag: 2,
            delay: 2,
          },
          { path: 9, index: 2, mapId: 1, x: 200, y: 0, z: 0 },
          { path: 9, index: 3, mapId: 1, x: 300, y: 0, z: 0 },
          { path: 9, index: 4, mapId: 0, x: 500, y: 500, z: 0 },
          {
            path: 9,
            index: 5,
            mapId: 0,
            x: 600,
            y: 500,
            z: 0,
            actionFlag: 2,
            delay: 2,
          },
          { path: 9, index: 6, mapId: 0, x: 700, y: 500, z: 0 },
          { path: 9, index: 7, mapId: 0, x: 800, y: 500, z: 0 },
        ],
      },
      9,
    );
    const path = must(generateTransportPath(nodes, 10, 5));
    const samples = Array.from({ length: 40 }, (_, i) =>
      must(path.poseAt((i * path.period) / 40)),
    );
    const maps = new Set(samples.map((p) => p.mapId));
    expect(maps).toEqual(new Set([0, 1]));
    for (const pose of samples) expect(pose.x >= 500).toBe(pose.mapId === 0);
    expect(must(path.poseAt(0)).mapId).toBe(1);
  });
});
