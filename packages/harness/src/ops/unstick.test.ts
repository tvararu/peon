import { describe, expect, jest, test } from "bun:test";
import type { PoseView } from "#harness/contract/views";
import { UNSTICK_MAX_YD, unstick } from "#harness/ops/unstick";
import {
  driveGoto,
  MAP_ID,
  objectRow,
  setSelf,
  setUnits,
  toolCtx,
  walked,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("unstick", () => {
  const good: PoseView = {
    ageMs: 0,
    facing: "N",
    mapId: MAP_ID,
    serverFixAgeMs: 0,
    source: "server",
    x: 3,
    y: 4,
    z: 0,
  };

  test("walks at most 5 yd toward the last good pose and names the refused goal", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.lastGoodPose = good;
    t.rt.travel.lastRefusedGoal = "u4";
    const walk = walked(t.handle, 4.8);
    const ctx = toolCtx(t);
    const result = await unstick(ctx);
    expect(walk).toHaveBeenCalledWith(
      { kind: "point", x: 3, y: 4, z: 0 },
      UNSTICK_MAX_YD,
      ctx.signal,
    );
    expect(result).toEqual({
      movedYd: 4.8,
      refusedGoal: "u4",
      toward: "last_good_pose",
    });
  });

  test("nudges back onto the mesh first and reports the nudge", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.lastGoodPose = good;
    t.handle.nudge = jest.fn(async () => ({ arrived: true, movedYd: 1.2 }));
    const walk = walked(t.handle, 4.8);
    const ctx = toolCtx(t);
    const result = await unstick(ctx);
    expect(t.handle.nudge).toHaveBeenCalledWith(UNSTICK_MAX_YD, ctx.signal);
    expect(walk).not.toHaveBeenCalled();
    expect(result).toMatchObject({ movedYd: 1.2, toward: "off_mesh_nudge" });
  });

  test("falls through to the last good pose when the nudge fails", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.lastGoodPose = good;
    t.handle.nudge = jest.fn(async () => ({ arrived: false, movedYd: 0 }));
    walked(t.handle, 4.8);
    const result = await unstick(toolCtx(t));
    expect(t.handle.nudge).toHaveBeenCalled();
    expect(result).toMatchObject({ movedYd: 4.8, toward: "last_good_pose" });
  });

  test("falls through to open ground when the nudge and the walk fail", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.handle.nudge = jest.fn(async () => ({ arrived: false, movedYd: 0 }));
    walked(t.handle, 0);
    driveGoto(t.handle, [{ arrive: { x: -8, y: 0 } }]);
    const result = await unstick(toolCtx(t));
    expect(result).toMatchObject({ toward: "open_ground" });
  });

  test("with no good pose it routes to open ground away from the nearest object", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    setUnits(t.handle, [
      objectRow({ distance: 2, guid: 0x30n, name: "Signpost", x: 2, y: 0 }),
    ]);
    const walk = walked(t.handle, 0);
    const goTo = driveGoto(t.handle, [{ arrive: { x: -8, y: 0 } }]);
    const result = await unstick(toolCtx(t));
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: -8, y: 0 });
    expect(walk).not.toHaveBeenCalled();
    expect(result).toMatchObject({ movedYd: 8, toward: "open_ground" });
  });

  test("samples the other bearings when the first route is refused", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    walked(t.handle, 0);
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
      { arrive: { x: -5.7, y: -5.7 } },
    ]);
    const result = await unstick(toolCtx(t));
    expect(goTo).toHaveBeenCalledTimes(2);
    expect(result.movedYd).toBeCloseTo(8, 0);
  });

  test("reports 0 yd when no bearing and no walk moves you", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    walked(t.handle, 0);
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const result = await unstick(toolCtx(t));
    expect(goTo).toHaveBeenCalledTimes(8);
    expect(result.movedYd).toBe(0);
  });
});
