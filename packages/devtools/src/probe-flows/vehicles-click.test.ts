import { describe, expect, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  fakeMsUntilSettled,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/vehicles-click";

const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;
const ENTRY = 27_661;

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
  test("clicks the entry unit and reports its seat", () =>
    withFakeTimers(async () => {
      const ctx = context({});
      const running = flow.run(ctx);
      const ms = await fakeMsUntilSettled(running, 1000);
      expect(await running).toMatchObject({
        board: "ok",
        entry: ENTRY,
        exit: "ok",
        guid: `0x${VEHICLE.toString(16)}`,
        seat: 0,
      });
      expect(ms).toBeLessThanOrEqual(100);
    }));

  test("rejects when no unit of the entry is nearby", () =>
    withFakeTimers(async () => {
      const handle = createMockHandle();
      handle.queryNearby = () => [];
      const ctx: FlowContext & { handle: MockHandle } = {
        args: { entry: String(ENTRY) },
        handle,
        settle: settleWithin(100),
      };
      const running = flow.run(ctx);
      const message = await fakeRejection(running, 1000);
      expect(message).toContain(String(ENTRY));
    }));

  test("reports the refusal when the click is refused", () =>
    withFakeTimers(async () => {
      const ctx = context({
        spellClick: async () => ({
          reason: "not_clickable",
          status: "refused",
        }),
      });
      const running = flow.run(ctx);
      const ms = await fakeMsUntilSettled(running, 1000);
      expect(await running).toMatchObject({
        board: "not_clickable",
        exit: null,
      });
      expect(ms).toBeLessThanOrEqual(100);
    }));
});
