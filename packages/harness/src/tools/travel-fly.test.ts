import { describe, expect, jest, test } from "bun:test";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { TravelAfter } from "#harness/contract/details";
import { createRefTable } from "#harness/ops/refs";
import { YIELD_AFTER_MS } from "#harness/runs/wait";
import { travelSpec } from "#harness/tools/travel";
import { FLIGHT_WAIT_MS } from "#harness/tools/travel-fly";
import {
  contentOf,
  driveGoto,
  MAP_ID,
  moveTo,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
  type TestRuntime,
} from "#test-support/runtime-fixture";

const MASTER = 0x70n;
const FLIGHT_MASTER = unitRow({
  distance: 3,
  guid: MASTER,
  name: "Dragonhawk Master",
  relation: "friendly",
  roles: ["flight_master"],
  x: 3,
  y: 0,
});
const NODES: Record<
  number,
  { id: number; map: number; name: string; x: number; y: number; z: number }
> = {
  82: { id: 82, map: MAP_ID, name: "Tranquillien", x: 100, y: 0, z: 0 },
  83: { id: 83, map: MAP_ID, name: "Silvermoon City", x: -9480, y: 70, z: 55 },
  90: { id: 90, map: 0, name: "Stormwind", x: 100, y: 0, z: 0 },
  91: { id: 91, map: MAP_ID, name: "Far Camp", x: 900, y: 0, z: 0 },
};
const ROUTE = { destination: 83, nodes: [82, 83], price: 1250 };

type Overrides = { master?: boolean; known?: number[] };

async function world(options: Overrides = {}) {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, options.master === false ? [] : [FLIGHT_MASTER]);
  const act = t.handle.travel.act;
  jest.spyOn(act, "openTaxiMap").mockResolvedValue({
    currentNode: 82,
    kind: "map",
    known: [82, 83],
    status: "ok",
  });
  jest.spyOn(act, "planFlight").mockResolvedValue({ ...ROUTE, status: "ok" });
  jest.spyOn(act, "activateTaxi").mockResolvedValue({
    instant: false,
    nodes: ROUTE.nodes,
    price: ROUTE.price,
    status: "ok",
  });
  jest.spyOn(act, "destinations").mockImplementation((from: number) => {
    const node = NODES[from];
    return Promise.resolve(
      node
        ? { from, list: [], node, status: "ok" as const }
        : { reason: "unknown_node", status: "refused" as const },
    );
  });
  jest.spyOn(t.handle, "walkTowardPoint").mockResolvedValue({
    pose: t.handle.getControlState().pose as never,
    status: "completed",
    traveled: 1,
  });
  if (options.known) {
    const { known } = options;
    Object.defineProperty(t.handle.travel, "state", {
      value: () => ({ known }),
    });
  }
  return t;
}

function land(handle: MockHandle): void {
  handle.triggerAreaEvent("travel", { type: "flight_landed" });
}

function landSoon(handle: MockHandle): void {
  jest.spyOn(handle.travel.act, "activateTaxi").mockImplementation(() => {
    queueMicrotask(() => land(handle));
    return Promise.resolve({
      instant: false,
      nodes: ROUTE.nodes,
      price: ROUTE.price,
      status: "ok" as const,
    });
  });
}

function fly(t: TestRuntime, to = "fly Silvermoon City") {
  return travelSpec.run({ to }, toolCtx<TravelAfter>(t));
}

describe("travel fly", () => {
  test("opens the map, plans from the current node, activates and completes on landing", async () => {
    const t = await world();
    landSoon(t.handle);
    const takeControl = jest.spyOn(t.handle, "takeControl");
    const res = await fly(t);
    const act = t.handle.travel.act;
    expect(act.openTaxiMap).toHaveBeenCalledWith(MASTER);
    expect(act.planFlight).toHaveBeenCalledWith(82, "Silvermoon City");
    expect(act.activateTaxi).toHaveBeenCalledWith(
      MASTER,
      expect.objectContaining({ nodes: [82, 83], price: 1250 }),
    );
    expect(takeControl).toHaveBeenCalledWith("manual_override");
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Silvermoon City");
    expect(res.after.goal).toEqual({
      destination: "Silvermoon City",
      kind: "fly",
    });
  });

  test("after the landing it steps 1 yd ahead so the server pose and ground height follow", async () => {
    const t = await world();
    landSoon(t.handle);
    moveTo(t.handle, { x: 10, y: 20, z: 11.5 });
    const step = jest.spyOn(t.handle, "walkTowardPoint").mockResolvedValue({
      pose: t.handle.getControlState().pose as never,
      status: "completed",
      traveled: 1,
    });
    const res = await fly(t);
    expect(res.status).toBe("DONE");
    expect(step).toHaveBeenCalledTimes(1);
    expect(step.mock.calls[0]?.[0]).toMatchObject({ x: 11, y: 20, z: 11.5 });
    expect(step.mock.calls[0]?.[1]).toBe(1);
  });

  test("a step that cannot start is reported but the flight still counts as landed", async () => {
    const t = await world();
    landSoon(t.handle);
    jest.spyOn(t.handle, "walkTowardPoint").mockResolvedValue({
      pose: t.handle.getControlState().pose as never,
      reason: "obstructed",
      status: "stopped",
      traveled: 0,
    });
    const res = await fly(t);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("obstructed");
  });

  test("a thrown step is reported the same way", async () => {
    const t = await world();
    landSoon(t.handle);
    jest
      .spyOn(t.handle, "walkTowardPoint")
      .mockRejectedValue(new Error("no_pose"));
    const res = await fly(t);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("no_pose");
  });

  test("an instant teleport takes no settling step", async () => {
    const t = await world();
    jest.spyOn(t.handle.travel.act, "activateTaxi").mockResolvedValue({
      instant: true,
      nodes: ROUTE.nodes,
      price: ROUTE.price,
      status: "ok",
    });
    const res = await fly(t);
    expect(res.status).toBe("DONE");
    expect(t.handle.walkTowardPoint).not.toHaveBeenCalled();
  });

  test("a landing that arrives before the activate act returns still completes", async () => {
    const t = await world();
    jest.spyOn(t.handle.travel.act, "activateTaxi").mockImplementation(() => {
      land(t.handle);
      return Promise.resolve({
        instant: false,
        nodes: ROUTE.nodes,
        price: ROUTE.price,
        status: "ok" as const,
      });
    });
    const res = await fly(t);
    expect(res.status).toBe("DONE");
  });

  test("a learned reply opens the map again", async () => {
    const t = await world();
    landSoon(t.handle);
    jest
      .spyOn(t.handle.travel.act, "openTaxiMap")
      .mockResolvedValueOnce({ kind: "learned", status: "ok" })
      .mockResolvedValueOnce({
        currentNode: 82,
        kind: "map",
        known: [82, 83],
        status: "ok",
      });
    const res = await fly(t);
    expect(t.handle.travel.act.openTaxiMap).toHaveBeenCalledTimes(2);
    expect(res.status).toBe("DONE");
  });

  test("a flight master 40 yd away is walked to before the map opens", async () => {
    const t = await world();
    setUnits(t.handle, [
      unitRow({ ...flightMasterInit(), distance: 40, x: 40 }),
    ]);
    landSoon(t.handle);
    const order: string[] = [];
    driveGoto(t.handle, [
      { arrive: { x: 38, y: 0 }, onArrive: () => order.push("walked") },
    ]);
    jest.spyOn(t.handle.travel.act, "openTaxiMap").mockImplementation(() => {
      order.push("map");
      return Promise.resolve({
        currentNode: 82,
        kind: "map" as const,
        known: [82, 83],
        status: "ok" as const,
      });
    });
    const res = await fly(t);
    expect(order).toEqual(["walked", "map"]);
    expect(res.status).toBe("DONE");
  });

  test("a walk that does not reach the flight master reports it and never opens the map", async () => {
    const t = await world();
    setUnits(t.handle, [
      unitRow({ ...flightMasterInit(), distance: 40, x: 40 }),
    ]);
    driveGoto(t.handle, [{ refuse: "stop: unreachable" }]);
    const res = await fly(t);
    expect(res).toMatchObject({ reason: "unreachable", status: "FAILED" });
    expect(t.handle.travel.act.openTaxiMap).not.toHaveBeenCalled();
  });

  test("with no flight master in view and no known node it refuses with look", async () => {
    const t = await world({ master: false });
    await expect(fly(t)).rejects.toMatchObject({
      next: 'look(find: "flight_master")',
      reason: "no_flight_master",
    });
    expect(t.handle.travel.act.openTaxiMap).not.toHaveBeenCalled();
  });

  test("with no flight master in view it walks to the nearest known node on this map", async () => {
    const t = await world({ known: [82, 83, 90, 91], master: false });
    landSoon(t.handle);
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 98, y: 0 },
        onArrive: () => setUnits(t.handle, [FLIGHT_MASTER]),
      },
    ]);
    const res = await fly(t);
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo.mock.calls[0]?.[0]).toMatchObject({ x: 100, y: 0 });
    expect(res.status).toBe("DONE");
  });

  test("known nodes beyond 300 yd or on another map are not walked to", async () => {
    const t = await world({ known: [83, 90, 91], master: false });
    const goTo = driveGoto(t.handle, [{ arrive: { x: 0, y: 0 } }]);
    await expect(fly(t)).rejects.toMatchObject({
      reason: "no_flight_master",
    });
    expect(goTo).not.toHaveBeenCalled();
  });

  test("a node walk that finds no flight master there still refuses", async () => {
    const t = await world({ known: [82], master: false });
    driveGoto(t.handle, [{ arrive: { x: 98, y: 0 } }]);
    await expect(fly(t)).rejects.toMatchObject({
      reason: "no_flight_master",
    });
    expect(t.handle.travel.act.openTaxiMap).not.toHaveBeenCalled();
  });

  test("planFlight refusals give one refusal each and never activate", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ reason: "unknown_node", status: "refused" }, "unknown_destination"],
      [{ reason: "not_known", status: "refused" }, "not_known"],
      [{ reason: "no_route", status: "refused" }, "no_route"],
      [{ reason: "missing_taxi_data", status: "refused" }, "missing_taxi_data"],
    ];
    for (const [outcome, reason] of cases) {
      const t = await world();
      jest
        .spyOn(t.handle.travel.act, "planFlight")
        .mockResolvedValue(outcome as never);
      await expect(fly(t)).rejects.toMatchObject({ reason });
      expect(t.handle.travel.act.activateTaxi).not.toHaveBeenCalled();
    }
  });

  test("an ambiguous destination lists the matches", async () => {
    const t = await world();
    jest.spyOn(t.handle.travel.act, "planFlight").mockResolvedValue({
      matches: [
        { name: "Silvermoon City", node: 83 },
        { name: "Silvermoon Sunwell", node: 99 },
      ],
      reason: "ambiguous",
      status: "refused",
    });
    const refusal = await fly(t, "fly Silvermoon").catch((e: unknown) => e);
    expect(refusal).toMatchObject({ reason: "ambiguous" });
    const text = JSON.stringify(refusal);
    expect(text).toContain("Silvermoon City");
    expect(text).toContain("Silvermoon Sunwell");
  });

  test("a destination equal to the current node refuses as already there", async () => {
    const t = await world();
    jest.spyOn(t.handle.travel.act, "planFlight").mockResolvedValue({
      destination: 82,
      nodes: [82],
      price: 0,
      status: "ok",
    });
    await expect(fly(t, "fly Tranquillien")).rejects.toMatchObject({
      reason: "already_there",
    });
    expect(t.handle.travel.act.activateTaxi).not.toHaveBeenCalled();
  });

  test("each activate refusal gives its short name; mounted has no next call", async () => {
    const reasons = [
      "not_enough_money",
      "too_far",
      "busy",
      "not_known",
      "shapeshifted",
      "moving",
      "not_standing",
      "server_error",
    ];
    for (const reason of reasons) {
      const t = await world();
      jest
        .spyOn(t.handle.travel.act, "activateTaxi")
        .mockResolvedValue({ reason, status: "refused" });
      await expect(fly(t)).rejects.toMatchObject({ reason });
    }
    const t = await world();
    jest
      .spyOn(t.handle.travel.act, "activateTaxi")
      .mockResolvedValue({ reason: "mounted", status: "refused" });
    const refusal = await fly(t).catch((e: unknown) => e);
    expect(refusal).toMatchObject({
      detail: "Get off your mount first.",
      next: undefined,
      reason: "mounted",
    });
  });

  test("an activate with no answer is unconfirmed and waits for nothing", async () => {
    const t = await world();
    jest
      .spyOn(t.handle.travel.act, "activateTaxi")
      .mockResolvedValue({ status: "no_answer" });
    const res = await fly(t);
    expect(res.status).toBe("UNCONFIRMED");
  });

  test("a map that never shows is unconfirmed and plans nothing", async () => {
    const t = await world();
    jest
      .spyOn(t.handle.travel.act, "openTaxiMap")
      .mockResolvedValue({ status: "no_answer" });
    const res = await fly(t);
    expect(res.status).toBe("UNCONFIRMED");
    expect(t.handle.travel.act.planFlight).not.toHaveBeenCalled();
  });

  test("a call while the flight runs yields at 120 s and later calls find it running", async () => {
    const t = await world();
    await withFakeTimers(async () => {
      const pending = fly(t);
      await elapse(10);
      jest.advanceTimersByTime(YIELD_AFTER_MS);
      const res = await pending;
      expect(res.status).toBe("RUNNING");
      const progress = t.rt.runs.list()[0];
      expect(progress?.status).toBe("running");
      await expect(fly(t)).rejects.toMatchObject({ reason: "busy" });
      land(t.handle);
      await elapse(10);
      expect(t.rt.runs.list()[0]?.status).toBe("succeeded");
    });
  });

  test("the wait for landing gives up after the cap and releases its listener", async () => {
    const t = await world();
    const off = jest.fn();
    const onEvent = t.handle.travel.onEvent.bind(t.handle.travel);
    jest.spyOn(t.handle.travel, "onEvent").mockImplementation((cb) => {
      const unsubscribe = onEvent(cb);
      return () => {
        off();
        unsubscribe();
      };
    });
    await withFakeTimers(async () => {
      const pending = fly(t);
      await elapse(10);
      jest.advanceTimersByTime(FLIGHT_WAIT_MS);
      await pending;
      await elapse(10);
    });
    expect(t.rt.runs.list()[0]).toMatchObject({
      reason: "no_landing",
      status: "failed",
    });
    expect(off).toHaveBeenCalled();
  });

  test("a stopped run releases the landing listener", async () => {
    const t = await world();
    const off = jest.fn();
    const onEvent = t.handle.travel.onEvent.bind(t.handle.travel);
    jest.spyOn(t.handle.travel, "onEvent").mockImplementation((cb) => {
      const unsubscribe = onEvent(cb);
      return () => {
        off();
        unsubscribe();
      };
    });
    const pending = fly(t);
    await withFakeTimers(() => elapse(10));
    const [run] = t.rt.runs.list();
    if (!run) throw new Error("no run");
    t.rt.runs.cancel(run.id, "tool");
    await pending;
    expect(off).toHaveBeenCalled();
  });

  test("a bare fly asks for a destination", async () => {
    const t = await world();
    await expect(fly(t, "fly ")).rejects.toMatchObject({
      reason: "no_destination",
    });
  });

  test("while already on a flight it refuses before any act", async () => {
    const t = await world();
    const state = t.handle.getControlState();
    t.handle.getControlState = () => ({ ...state, blockedReason: "in_flight" });
    await expect(fly(t)).rejects.toMatchObject({ reason: "in_flight" });
    expect(t.handle.travel.act.openTaxiMap).not.toHaveBeenCalled();
  });
});

function flightMasterInit() {
  return {
    guid: MASTER,
    name: "Dragonhawk Master",
    relation: "friendly" as const,
    roles: ["flight_master" as const],
    y: 0,
  };
}
