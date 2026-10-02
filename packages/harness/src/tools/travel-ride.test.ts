import { describe, expect, jest, test } from "bun:test";
import { travelTaxiDbc } from "@peon/core/test-support/areas/travel";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { TravelAfter } from "#harness/contract/details";
import { createRefTable } from "#harness/ops/refs";
import { travelSpec } from "#harness/tools/travel";
import {
  driveGoto,
  MAP_ID,
  setSelf,
  toolCtx,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type TestRuntime,
  testProfile,
} from "#test-support/runtime-fixture";

const SHIP = 0x1fc0_0000_0000_0001n;
const NODES = [
  { id: 1, map: MAP_ID, name: "Transport, Orgrimmar", x: 0, y: 0, z: 0 },
  { id: 2, map: MAP_ID, name: "Thunder Bluff", x: 5000, y: 0, z: 0 },
];
const HERE = {
  mapId: MAP_ID,
  moving: false,
  orientation: 0,
  x: 10,
  y: 0,
  z: 5,
};
const THERE = { ...HERE, x: 5010 };
const AWAY = { ...HERE, moving: true, x: 800 };

type Pose = typeof HERE;
type World = { t: TestRuntime; pose: { now: Pose | undefined } };

function entry(): never {
  return {
    entry: 20,
    guid: SHIP,
    kind: "motion",
    mapId: MAP_ID,
  } as never;
}

async function world(init: { dbc?: boolean } = {}): Promise<World> {
  const profile = testProfile();
  const dbc =
    init.dbc === false ? undefined : travelTaxiDbc({ nodes: NODES, paths: [] });
  const t = await createTestRuntime({
    parts: {
      profile: { ...profile, client: { ...profile.client, dbc } },
      refs: createRefTable(),
    },
  });
  setSelf(t.handle, { x: 0, y: 0 });
  const pose: World["pose"] = { now: HERE };
  const act = t.handle.transports.act;
  jest.spyOn(t.handle.transports, "state").mockReturnValue({
    data: { animCount: 0, pathCount: 1, status: "ready" },
    templates: new Map(),
    transports: new Map([[SHIP, entry()]]),
  });
  jest.spyOn(act, "poseAt").mockImplementation(() => pose.now);
  jest.spyOn(act, "board").mockImplementation(() => {
    pose.now = AWAY;
    return { status: "ok" };
  });
  jest.spyOn(act, "leave").mockReturnValue({ status: "ok" });
  driveGoto(t.handle, [{}]);
  return { pose, t };
}

function ride(t: TestRuntime, to = "ride Thunder Bluff") {
  return travelSpec.run({ to }, toolCtx<TravelAfter>(t));
}

describe("travel ride", () => {
  test("boards at the dock, rides, leaves at the named stop and holds the order", async () => {
    const { t, pose } = await world();
    const calls: string[] = [];
    const act = t.handle.transports.act;
    jest.spyOn(act, "board").mockImplementation(() => {
      calls.push("board");
      pose.now = AWAY;
      return { status: "ok" };
    });
    jest.spyOn(act, "leave").mockImplementation(() => {
      calls.push("leave");
      return { status: "ok" };
    });
    const res = await withFakeTimers(async () => {
      const pending = ride(t);
      await elapse(3000);
      pose.now = THERE;
      await elapse(3000);
      return await pending;
    });
    expect(calls).toEqual(["board", "leave"]);
    expect(act.board).toHaveBeenCalledWith(SHIP);
    expect(res.status).toBe("DONE");
    expect(res.detail).toContain("Thunder Bluff");
  });

  test("waits for the transport to dock before it boards", async () => {
    const { t, pose } = await world();
    pose.now = { ...HERE, moving: true };
    const act = t.handle.transports.act;
    const res = await withFakeTimers(async () => {
      const pending = ride(t);
      await elapse(4000);
      expect(act.board).not.toHaveBeenCalled();
      pose.now = HERE;
      await elapse(2000);
      expect(act.board).toHaveBeenCalledTimes(1);
      pose.now = THERE;
      await elapse(3000);
      return await pending;
    });
    expect(res.status).toBe("DONE");
  });

  test("walks to the dock when it is out of boarding range", async () => {
    const { t, pose } = await world();
    pose.now = { ...HERE, x: 200 };
    const goTo = driveGoto(t.handle, [{ arrive: { x: 190, y: 0 } }]);
    await withFakeTimers(async () => {
      const pending = ride(t);
      await elapse(2000);
      pose.now = { ...THERE, x: 5200 };
      await elapse(3000);
      await pending;
    });
    expect(goTo).toHaveBeenCalled();
    expect(t.handle.transports.act.board).toHaveBeenCalledWith(SHIP);
  });

  test("refuses transport_data_missing when no pose can be computed", async () => {
    const { t, pose } = await world();
    pose.now = undefined;
    await expect(ride(t)).rejects.toMatchObject({
      reason: "transport_data_missing",
    });
    expect(t.handle.transports.act.board).not.toHaveBeenCalled();
  });

  test("refuses transport_data_missing without the node file", async () => {
    const { t } = await world({ dbc: false });
    await expect(ride(t)).rejects.toMatchObject({
      reason: "transport_data_missing",
    });
  });

  test("refuses when the dock already serves the named stop", async () => {
    const { t } = await world();
    await expect(ride(t, "ride Orgrimmar")).rejects.toMatchObject({
      reason: "already_there",
    });
    expect(t.handle.transports.act.board).not.toHaveBeenCalled();
  });

  test("refuses a ride with no stop named", async () => {
    const { t } = await world();
    await expect(ride(t, "ride")).rejects.toMatchObject({ reason: "no_stop" });
  });

  test("a stop while riding leaves the character aboard and rejects", async () => {
    const { t } = await world();
    const act = t.handle.transports.act;
    const pending = withFakeTimers(async () => {
      const run = ride(t);
      const settled = run.then(
        () => "resolved",
        (error: Error) => error.message,
      );
      await elapse(3000);
      t.rt.runs.cancel(t.rt.runs.active()?.id ?? "", "tool");
      await elapse(1000);
      return await settled;
    });
    expect(await pending).toBe("stopped_by_tool");
    expect(act.board).toHaveBeenCalledTimes(1);
    expect(act.leave).not.toHaveBeenCalled();
  });

  test("a leave the ground refuses is reported with its reason", async () => {
    const { t, pose } = await world();
    jest.spyOn(t.handle.transports.act, "leave").mockReturnValue({
      reason: "ground_height_unavailable",
      status: "refused",
    });
    const res = await withFakeTimers(async () => {
      const pending = ride(t);
      await elapse(3000);
      pose.now = THERE;
      await elapse(3000);
      return await pending;
    });
    expect(res.status).not.toBe("DONE");
    expect(res.reason).toBe("ground_height_unavailable");
  });

  test("a refused board is reported with its reason", async () => {
    const { t } = await world();
    jest
      .spyOn(t.handle.transports.act, "board")
      .mockReturnValue({ reason: "too_far", status: "refused" });
    const res = await withFakeTimers(async () => {
      const pending = ride(t);
      await elapse(3000);
      return await pending;
    });
    expect(res.status).toBe("REFUSED");
    expect(res.reason).toBe("too_far");
  });
});
