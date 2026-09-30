import { describe, expect, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/vehicles-click";

const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;
const ENTRY = 27661;

type Vehicles = WorldHandle["vehicles"];

function context(acts: Partial<Vehicles["act"]>) {
  const handle = createMockHandle();
  handle.queryNearby = () =>
    [{ entity: { entry: ENTRY, guid: VEHICLE }, self: false }] as never;
  const vehicles: Vehicles = {
    ...handle.vehicles,
    act: {
      exitVehicle: async () => ({ status: "ok" }),
      spellClick: async () => ({ status: "ok" }),
      ...acts,
    } as unknown as Vehicles["act"],
    state: () =>
      ({
        seat: { controlling: false, entry: ENTRY, seat: 0, vehicle: VEHICLE },
      }) as unknown as Vehicles extends { state: () => infer S } ? S : never,
  };
  Object.assign(handle, { vehicles });
  const ctx: FlowContext & { handle: MockHandle } = {
    args: { entry: String(ENTRY) },
    handle,
    settle: settleWithin(100),
  };
  return ctx;
}

describe("vehicles-click flow", () => {
  test("clicks the entry unit and reports its seat", async () => {
    const ctx = context({});
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(result).toMatchObject({
      board: "ok",
      entry: ENTRY,
      exit: "ok",
      guid: `0x${VEHICLE.toString(16)}`,
      seat: 0,
    });
  });

  test("rejects when no unit of the entry is nearby", async () => {
    const handle = createMockHandle();
    handle.queryNearby = () => [];
    const ctx: FlowContext & { handle: MockHandle } = {
      args: { entry: String(ENTRY) },
      handle,
      settle: settleWithin(100),
    };
    await expect(flow.run(ctx)).rejects.toThrow(String(ENTRY));
  });

  test("reports the refusal when the click is refused", async () => {
    const ctx = context({
      spellClick: async () => ({ status: "refused", reason: "not_clickable" }),
    });
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(result).toMatchObject({ board: "not_clickable", exit: null });
  });
});
