import { describe, expect, jest, test } from "bun:test";
import type { ControlPose, NavPoint, WalkOutcome } from "@peon/core";
import type { Navigation } from "#harness/navigation/planner";
import { nudgeOntoMesh } from "#harness/navigation/travel";

const MAP = 0;
const START: ControlPose = {
  mapId: MAP,
  orientation: 0,
  source: "server",
  updatedAt: 0,
  x: 0,
  y: 0,
  z: 0,
};

function meshFrom(edge: number, throws = false) {
  return {
    snap: (_map: number, from: NavPoint) => {
      if (throws) throw new Error("uncovered map");
      const onMesh = from.x >= edge;
      return { onMesh, point: { ...from, x: Math.max(from.x, edge) } };
    },
    stepHeight: () => 0,
  } as unknown as Navigation;
}

function rig(options: {
  edge?: number;
  throws?: boolean;
  walk?: (point: NavPoint, yards: number, signal?: AbortSignal) => WalkOutcome;
  missing?: boolean;
}) {
  const navigation = meshFrom(options.edge ?? 0.7, options.throws);
  const walkTowardPoint = jest.fn(
    async (point: NavPoint, yards: number, signal?: AbortSignal) =>
      options.walk
        ? options.walk(point, yards, signal)
        : {
            pose: { ...START, x: 1 },
            status: "completed" as const,
            traveled: 1,
          },
  );
  const deps = {
    handle: { getControlState: () => ({ pose: START }), walkTowardPoint },
    navigation: () => {
      if (options.missing) throw new Error("missing_navigation");
      return navigation;
    },
  } as unknown as Parameters<typeof nudgeOntoMesh>[0];
  return { deps, walkTowardPoint };
}

describe("nudgeOntoMesh", () => {
  test("a pose already on the mesh does not move", async () => {
    const { deps, walkTowardPoint } = rig({ edge: -1 });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: false,
      movedYd: 0,
    });
    expect(walkTowardPoint).not.toHaveBeenCalled();
  });

  test("no reachable target does not move", async () => {
    const { deps, walkTowardPoint } = rig({ edge: 50 });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: false,
      movedYd: 0,
    });
    expect(walkTowardPoint).not.toHaveBeenCalled();
  });

  test("a blocked walk reports no arrival", async () => {
    const { deps } = rig({
      walk: () => ({ pose: START, status: "stopped", traveled: 0 }),
    });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: false,
      movedYd: 0,
    });
  });

  test("a partial walk that stays off the mesh reports the distance moved", async () => {
    const { deps } = rig({
      walk: () => ({
        pose: { ...START, x: 0.3 },
        status: "stopped",
        traveled: 0.3,
      }),
    });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: false,
      movedYd: 0.3,
    });
  });

  test("a partial walk that lands on the mesh arrives", async () => {
    const { deps, walkTowardPoint } = rig({
      walk: () => ({
        pose: { ...START, x: 0.9 },
        status: "stopped",
        traveled: 0.9,
      }),
    });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: true,
      movedYd: 0.9,
    });
    expect(walkTowardPoint).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number) }),
      1.5,
      undefined,
    );
  });

  test("an aborted signal rejects instead of walking", async () => {
    const { deps, walkTowardPoint } = rig({});
    const stop = new AbortController();
    stop.abort(new Error("human_stop"));
    await expect(nudgeOntoMesh(deps, 1.5, stop.signal)).rejects.toThrow(
      "human_stop",
    );
    expect(walkTowardPoint).not.toHaveBeenCalled();
  });

  test("an abort during the walk propagates", async () => {
    const stop = new AbortController();
    const { deps } = rig({
      walk: () => {
        stop.abort(new Error("human_stop"));
        throw stop.signal.reason;
      },
    });
    await expect(nudgeOntoMesh(deps, 1.5, stop.signal)).rejects.toThrow(
      "human_stop",
    );
  });

  test("missing navigation reports no nudge", async () => {
    const { deps, walkTowardPoint } = rig({ missing: true });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: false,
      movedYd: 0,
    });
    expect(walkTowardPoint).not.toHaveBeenCalled();
  });

  test("a native failure while snapping reports no nudge", async () => {
    const { deps, walkTowardPoint } = rig({ throws: true });
    expect(await nudgeOntoMesh(deps, 1.5)).toEqual({
      arrived: false,
      movedYd: 0,
    });
    expect(walkTowardPoint).not.toHaveBeenCalled();
  });
});
