import { describe, expect, mock, test } from "bun:test";
import { refusalCode, travelLeg } from "#harness/ops/travel-leg";
import {
  driveGoto,
  objectRow,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("refusalCode", () => {
  test.each([
    ["unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)", "no_ground"],
    [
      "pick_destination: ambiguous ground column at destination",
      "ambiguous_floor",
    ],
    [
      "pick_destination: destination is not on a ground floor",
      "ambiguous_floor",
    ],
    ["stop: start snapped off the requested ground position", "start_off_mesh"],
    ["stop: ground corridor changes surface", "surface_change"],
    ["stop: no_pose", "no_pose"],
    [
      "unreachable: pathfind_find_path failed (UNKNOWN_PATH)",
      "pathfind_find_path_failed_unknown_path",
    ],
    ["", "refused"],
  ])("%s -> %s", (text, code) => {
    expect(refusalCode(text)).toBe(code);
  });
});

describe("travelLeg", () => {
  test("arrives at a point and remembers the start pose", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [{ arrive: { x: 10, y: 0 } }]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 10, y: 0 },
      within: 1,
    });
    expect(leg.status).toBe("arrived");
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: 10, y: 0 });
    expect(t.rt.travel.lastGoodPose?.x).toBe(0);
  });

  test("does not move when the unit is already within range", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 2,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 2,
        y: 0,
      }),
    ]);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 2, y: 0 } }]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg.status).toBe("arrived");
    expect(goTo).not.toHaveBeenCalled();
  });

  test("maps a planner refusal to its code and keeps no good pose", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)" },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      floorRetried: false,
      reason: "no_ground",
      status: "refused",
    });
    expect(t.rt.travel.lastGoodPose).toBeUndefined();
  });

  test("core resolved the floor: a unit goal arrives on the first plan", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 30,
        y: 0,
        z: 72.7,
      }),
    ]);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 29, y: 0, z: 72.7 } }]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: false, status: "arrived" });
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledWith({ guid: 0x10n, kind: "guid" });
  });

  test("core refused with one matching floor: retries once on that floor", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 30,
        y: 0,
        z: 72.7,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 30, y: 0, z: 72.6 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 30,
      y: 0,
      z: 72.6,
    });
  });

  test("a unit raised above its floor retries on the floor nearest its height", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { z: 0 });
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Shrine of Dath'Remar",
        relation: "neutral",
        x: 30,
        y: 0,
        z: 42.5,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [30.2, 41.6, 55],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 30, y: 0, z: 41.6 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Shrine of Dath'Remar" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 30,
      y: 0,
      z: 41.6,
    });
  });

  test("a raised game object retries on the floor nearest its height", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { z: 0 });
    setUnits(t.handle, [
      objectRow({
        distance: 52,
        guid: 0xf110_0000_0000_0070n,
        name: "Shrine of Dath'Remar",
        x: 30,
        y: 0,
        z: 42.5,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [30.2, 41.6, 55],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 30, y: 0, z: 41.6 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0xf110_0000_0000_0070n, kind: "unit", name: "Shrine" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 30,
      y: 0,
      z: 41.6,
    });
  });
  test("a unit over a lower floor still walks to the chosen floor", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { z: 0 });
    setUnits(t.handle, [
      unitRow({
        distance: 10.5,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 1,
        y: 0,
        z: 10.5,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [0, 10],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 1, y: 0, z: 10 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenCalledTimes(2);
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 1,
      y: 0,
      z: 10,
    });
  });

  test("two floors near the unit: retries on the closer floor", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 30,
        y: 0,
        z: 72.75,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 72.8],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 30, y: 0, z: 72.8 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 30,
      y: 0,
      z: 72.8,
    });
  });

  test("a unit whose height is unknown keeps the refusal", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x99n, kind: "unit", name: "Nobody" },
      within: 3,
    });
    expect(leg).toMatchObject({
      floorRetried: false,
      reason: "ambiguous_floor",
      status: "refused",
    });
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  test("a point goal without z on two floors retries once on the floor nearest you", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { z: 79.4 });
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 20, y: 0, z: 80.1 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 20, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 20,
      y: 0,
      z: 80.1,
    });
  });

  test("a point goal with z is never retried on another floor", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { z: 79.4 });
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 20, y: 0, z: 72.6 },
      within: 1,
    });
    expect(leg).toMatchObject({ floorRetried: false, status: "refused" });
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  test("a failed floor retry keeps the refusal and says it retried", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { z: 0 });
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 20, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      floorRetried: true,
      reason: "ambiguous_floor",
      status: "refused",
    });
    expect(goTo).toHaveBeenCalledTimes(2);
  });

  test("a human stop cancels the leg with the cancel code", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [{ hold: true }]);
    const stop = new AbortController();
    const pending = travelLeg(toolCtx(t, stop.signal), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    stop.abort(new Error("human_stop"));
    expect(await pending).toMatchObject({
      reason: "human_stop",
      status: "cancelled",
    });
    expect(t.handle.halt).toHaveBeenCalled();
  });
});

describe("off-mesh nudge", () => {
  test("a refused off-mesh start nudges then replans to arrival", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    const goTo = driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
      { arrive: { x: 50, y: 0 } },
    ]);
    const nudge = mock(async () => ({ arrived: true, movedYd: 1 }));
    t.handle.nudge = nudge;
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      nudgedYd: 1,
      reason: undefined,
      status: "arrived",
    });
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledTimes(2);
  });

  test("a blocked nudge keeps the off-mesh refusal", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    const goTo = driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      nudgedYd: 0,
      reason: "start_off_mesh",
      status: "refused",
    });
    expect(t.handle.nudge).toHaveBeenCalled();
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  test("a partial nudge that stays off the mesh counts its distance", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
    ]);
    t.handle.nudge = mock(async () => ({ arrived: false, movedYd: 0.4 }));
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      nudgedYd: 0.4,
      reason: "start_off_mesh",
      status: "refused",
      traveledYd: 0.4,
    });
  });

  test("a stop during the nudge cancels the leg", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
    ]);
    const stop = new AbortController();
    t.handle.nudge = mock(async () => {
      stop.abort(new Error("human_stop"));
      return { arrived: false, movedYd: 0.4 };
    });
    const leg = await travelLeg(toolCtx(t, stop.signal), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      nudgedYd: 0.4,
      reason: "human_stop",
      status: "cancelled",
    });
  });
});
