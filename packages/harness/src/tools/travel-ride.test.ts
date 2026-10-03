import { describe, expect, jest, test } from "bun:test";
import { transportsDbc } from "@peon/core/test-support/areas/transports";
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
const DECOY = 0x1fc0_0000_0000_0002n;
const PATH = 7;
const STOPS = [
  { actionFlag: 2, index: 0, mapId: MAP_ID, path: PATH, x: 0, y: 0, z: 5 },
  { actionFlag: 2, index: 1, mapId: MAP_ID, path: PATH, x: 5000, y: 0, z: 5 },
  { actionFlag: 2, index: 0, mapId: MAP_ID, path: 8, x: 0, y: 0, z: 5 },
  { actionFlag: 2, index: 1, mapId: MAP_ID, path: 8, x: 9000, y: 0, z: 5 },
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

function entry(guid: bigint, id: number): never {
  return { entry: id, guid, kind: "motion", mapId: MAP_ID } as never;
}

function template(entryId: number, path: number): never {
  return { entry: entryId, taxiPathId: path } as never;
}

async function world(init: { dbc?: boolean } = {}): Promise<World> {
  const profile = testProfile();
  const dbc = init.dbc === false ? undefined : bothFiles();
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
    templates: new Map([
      [20, template(20, PATH)],
      [21, template(21, 8)],
    ]),
    transports: new Map([
      [SHIP, entry(SHIP, 20)],
      [DECOY, entry(DECOY, 21)],
    ]),
  });
  jest
    .spyOn(act, "poseAt")
    .mockImplementation((guid, offsetMs?: number) =>
      offsetMs === undefined ||
      offsetMs === 0 ||
      pose.now === undefined ||
      pose.now.moving === false
        ? guid === SHIP || pose.now === undefined
          ? pose.now
          : HERE
        : { ...HERE, moving: false },
    );
  jest.spyOn(act, "board").mockImplementation(() => {
    pose.now = AWAY;
    return { status: "ok" };
  });
  jest.spyOn(act, "leave").mockReturnValue({ status: "ok" });
  driveGoto(t.handle, [{}]);
  return { pose, t };
}

function bothFiles() {
  const nodes = travelTaxiDbc({ nodes: NODES, paths: [] });
  const paths = transportsDbc({ nodes: STOPS });
  return (file: string) =>
    file === "TaxiPathNode.dbc" ? paths(file) : nodes(file);
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
  test("a docked wait names the transport and tells the agent to keep waiting", async () => {
    const { t, pose } = await world();
    pose.now = { ...HERE, moving: true };
    const act = t.handle.transports.act;
    const ctx = toolCtx<TravelAfter>(t);
    const res = await withFakeTimers(async () => {
      const pending = travelSpec.run({ to: "ride Thunder Bluff" }, ctx);
      await elapse(4000);
      expect(act.board).not.toHaveBeenCalled();
      for (
        let i = 0;
        i < 10 &&
        !(t.rt.runs.list()[0]?.progress ?? "").includes("Thunder Bluff");
        i++
      )
        await elapse(600);
      expect(t.rt.runs.list()[0]?.progress).toContain("Thunder Bluff");
      const waiting = ctx.updates.find((u) =>
        u.detail?.includes("Thunder Bluff"),
      );
      expect(waiting).toMatchObject({ status: "RUNNING" });
      expect(waiting?.detail).toContain("waiting at the dock");
      expect(waiting?.detail).toContain("expected in about");
      expect(waiting?.next).toContain("keep waiting");
      pose.now = HERE;
      await elapse(2000);
      pose.now = THERE;
      await elapse(3000);
      return await pending;
    });
    expect(res.status).toBe("DONE");
  });
  test("while aboard and riding, the run says it is riding and to keep waiting", async () => {
    const { t, pose } = await world();
    const ctx = toolCtx<TravelAfter>(t);
    const res = await withFakeTimers(async () => {
      const pending = travelSpec.run({ to: "ride Thunder Bluff" }, ctx);
      await elapse(6000);
      const riding = ctx.updates.find((u) => u.detail?.includes("riding"));
      expect(riding).toMatchObject({ status: "RUNNING" });
      expect(riding?.detail).toContain("Thunder Bluff");
      expect(riding?.next).toContain("keep waiting");
      pose.now = THERE;
      await elapse(3000);
      return await pending;
    });
    expect(res.status).toBe("DONE");
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

  test("boards the transport that serves the stop, not another one docked beside it", async () => {
    const { t, pose } = await world();
    pose.now = { ...HERE, moving: true };
    const act = t.handle.transports.act;
    await withFakeTimers(async () => {
      const pending = ride(t);
      await elapse(4000);
      expect(act.board).not.toHaveBeenCalled();
      pose.now = HERE;
      await elapse(2000);
      pose.now = THERE;
      await elapse(3000);
      await pending;
    });
    expect(act.board).toHaveBeenCalledWith(SHIP);
    expect(act.board).not.toHaveBeenCalledWith(DECOY);
  });

  test("refuses no_route when no transport in view goes to the stop", async () => {
    const { t } = await world();
    await expect(ride(t, "ride Undercity")).rejects.toMatchObject({
      reason: "no_route",
    });
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
