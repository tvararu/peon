import { describe, expect, jest, test } from "bun:test";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { TravelAfter } from "#harness/contract/details";
import { createRefTable } from "#harness/ops/refs";
import { travelSpec } from "#harness/tools/travel";
import {
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
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
const ROUTE = { destination: 83, nodes: [82, 83], price: 1250 };

async function world() {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [FLIGHT_MASTER]);
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
  return t;
}

function fly(t: TestRuntime) {
  return travelSpec.run({ to: "fly Silvermoon City" }, toolCtx<TravelAfter>(t));
}

describe("travel fly stop", () => {
  test("a stop while the map reply is pending never activates the flight", async () => {
    const t = await world();
    const reply = Promise.withResolvers<{
      currentNode: number;
      kind: "map";
      known: number[];
      status: "ok";
    }>();
    jest
      .spyOn(t.handle.travel.act, "openTaxiMap")
      .mockImplementation(() => reply.promise);
    const pending = fly(t);
    await withFakeTimers(() => elapse(10));
    t.rt.runs.cancel(t.rt.runs.active()?.id ?? "", "tool");
    reply.resolve({
      currentNode: 82,
      kind: "map",
      known: [82, 83],
      status: "ok",
    });
    await expect(pending).rejects.toThrow("stopped_by_tool");
    expect(t.handle.travel.act.activateTaxi).not.toHaveBeenCalled();
  });

  test("a stop while queued for the flight send never activates the flight", async () => {
    const t = await world();
    const planned = Promise.withResolvers<{
      destination: number;
      nodes: number[];
      price: number;
      status: "ok";
    }>();
    jest
      .spyOn(t.handle.travel.act, "planFlight")
      .mockImplementation(() => planned.promise);
    const gate = Promise.withResolvers<void>();
    const pending = fly(t);
    await withFakeTimers(() => elapse(10));
    const holder = t.rt.mutex.run(() => gate.promise);
    planned.resolve({ ...ROUTE, status: "ok" });
    await withFakeTimers(() => elapse(10));
    t.rt.runs.cancel(t.rt.runs.active()?.id ?? "", "tool");
    gate.resolve();
    await holder;
    await expect(pending).rejects.toThrow("stopped_by_tool");
    expect(t.handle.travel.act.activateTaxi).not.toHaveBeenCalled();
  });
});
