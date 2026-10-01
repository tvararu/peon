import { describe, expect, jest, test } from "bun:test";
import type { InteractAfter } from "#harness/contract/details";
import { unitViews } from "#harness/ops/views";
import { interactSpec } from "#harness/tools/interact";
import { flightExtra } from "#harness/tools/interact-flight";
import {
  contentOf,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { answer } from "#test-support/quest-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const MASTER = 0x60n;
const FROM = { id: 82, map: 530, name: "Tranquillien", x: 1, y: 2, z: 3 };
const LIST = [
  { known: true, name: "Silvermoon City", node: 83, price: 1250 },
  { known: false, name: "Light's Hope Chapel", node: 84, price: 90_000 },
  { known: true, name: "Eversong Woods", node: 85, price: 40 },
];

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: MASTER,
      name: "Dragonhawk Master",
      relation: "friendly",
      roles: ["flight_master"],
      x: 3,
      y: 0,
    }),
    unitRow({
      distance: 4,
      guid: 0x61n,
      name: "Innkeeper Delaniel",
      relation: "friendly",
      roles: ["innkeeper"],
      x: 4,
      y: 0,
    }),
  ]);
  t.handle.cancelInteraction = () => undefined;
  jest.spyOn(t.handle.travel.act, "openTaxiMap").mockResolvedValue({
    currentNode: 82,
    kind: "map",
    known: [82, 83, 85],
    status: "ok",
  });
  jest.spyOn(t.handle.travel.act, "destinations").mockResolvedValue({
    from: 82,
    list: LIST,
    node: FROM,
    status: "ok",
  });
  const ctx = toolCtx<InteractAfter>(t);
  const view = (guid: bigint, name: string) => {
    const unit = unitViews(ctx).find((one) => one.name === name);
    if (!unit) throw new Error("unit missing");
    return { guid, unit };
  };
  return {
    ctx,
    innkeeper: view(0x61n, "Innkeeper Delaniel"),
    master: view(MASTER, "Dragonhawk Master"),
    t,
  };
}

describe("interact flight talk", () => {
  test("a flight master lists known destinations with prices and a travel call", async () => {
    const { ctx, t } = await world();
    t.handle.talk = () => answer(t.handle, "window", {});
    const res = await interactSpec.run({ npc: "Dragonhawk Master" }, ctx);
    const text = contentOf(res);
    expect(text).toContain("Tranquillien");
    expect(text).toContain("Silvermoon City");
    expect(text).toContain("12s 50c");
    expect(text).toContain("Eversong Woods");
    expect(text).not.toContain("Light's Hope Chapel");
    expect(res.next).toBe('travel(to: "fly Silvermoon City")');
    expect(t.handle.travel.act.openTaxiMap).toHaveBeenCalledWith(MASTER);
    expect(t.handle.travel.act.destinations).toHaveBeenCalledWith(82);
  });

  test("a unit without the flight master role opens no taxi map", async () => {
    const { ctx, innkeeper, t } = await world();
    const part = await flightExtra({
      ctx,
      npc: innkeeper,
    });
    expect(part.lines).toEqual([]);
    expect(t.handle.travel.act.openTaxiMap).not.toHaveBeenCalled();
  });

  test("a learned reply reopens the map once and notes the new path", async () => {
    const { ctx, master, t } = await world();
    const open = jest.spyOn(t.handle.travel.act, "openTaxiMap");
    open.mockReset();
    open
      .mockResolvedValueOnce({ kind: "learned", status: "ok" })
      .mockResolvedValueOnce({
        currentNode: 82,
        kind: "map",
        known: [82, 83],
        status: "ok",
      });
    const part = await flightExtra({
      ctx,
      npc: master,
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(part.lines.join("\n")).toContain("Learned the flight path");
    expect(part.lines.join("\n")).toContain("Silvermoon City");
  });

  test("a missing catalog prints no list and no error", async () => {
    const { ctx, master, t } = await world();
    jest.spyOn(t.handle.travel.act, "destinations").mockResolvedValue({
      reason: "missing_taxi_data",
      status: "refused",
    });
    const part = await flightExtra({
      ctx,
      npc: master,
    });
    expect(part.lines).toEqual([]);
  });

  test("a silent flight master says so and keeps the talk result", async () => {
    const { ctx, master, t } = await world();
    jest
      .spyOn(t.handle.travel.act, "openTaxiMap")
      .mockResolvedValue({ status: "no_answer" });
    const part = await flightExtra({
      ctx,
      npc: master,
    });
    expect(part.lines.join(" ")).toContain("did not show");
  });

  test("no known destination from here lists none and names no next call", async () => {
    const { ctx, master, t } = await world();
    jest.spyOn(t.handle.travel.act, "destinations").mockResolvedValue({
      from: 82,
      list: LIST.map((one) => ({ ...one, known: false })),
      node: FROM,
      status: "ok",
    });
    const part = await flightExtra({
      ctx,
      npc: master,
    });
    expect(part.lines.join(" ")).toContain("No other flight path");
    expect(part.next).toBeUndefined();
  });
});
