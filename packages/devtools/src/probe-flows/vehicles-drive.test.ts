import { describe, expect, test } from "bun:test";
import type { ControlState, WorldHandle } from "@peon/core";
import {
  fakeMsUntilSettled,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/vehicles-drive";

const VEHICLE = 0xf1_30_00_3e_ea_00_0b_bcn;
const ENTRY = 25_334;

type Vehicles = WorldHandle["vehicles"];

function context(options: {
  controlling: boolean;
  click?: string;
  seat?: string;
}) {
  const handle = createMockHandle();
  handle.queryNearby = () =>
    [{ entity: { entry: ENTRY, guid: VEHICLE }, self: false }] as never;
  const state = {
    ...handle.getControlState(),
    mover: options.controlling ? VEHICLE : undefined,
    pose: {
      mapId: 571,
      orientation: 0,
      source: "server",
      updatedAt: 0,
      x: 100,
      y: 200,
      z: 7,
    },
  } satisfies ControlState;
  handle.getControlState = () => state;
  const targets: { x: number; y: number; z: number }[] = [];
  handle.walkTowardPoint = async (target, yards) => {
    targets.push(target);
    return { pose: state.pose, status: "completed", traveled: yards };
  };
  const vehicles: Vehicles = {
    ...handle.vehicles,
    act: {
      changeSeatOnControlled: async () => ({ status: "no_answer" }),
      exitVehicle: async () => ({ status: "ok" }),
      spellClick: async () =>
        options.click === undefined
          ? { status: "ok" }
          : { reason: options.click, status: "refused" },
    } as unknown as Vehicles["act"],
    state: () =>
      ({
        seat: {
          controlling: options.controlling,
          entry: ENTRY,
          seat: 0,
          vehicle: VEHICLE,
        },
      }) as never,
  };
  Object.assign(handle, { vehicles });
  const ctx: FlowContext & { handle: MockHandle } = {
    args: options.seat === undefined ? {} : { seat: options.seat },
    handle,
    settle: settleWithin(100),
  };
  return { ctx, targets };
}

describe("vehicles-drive flow", () => {
  test("walks ten yards along the facing once the vehicle is controlled, then exits", () =>
    withFakeTimers(async () => {
      const { ctx, targets } = context({ controlling: true });
      const running = flow.run(ctx);
      await fakeMsUntilSettled(running, 1000);
      expect(await running).toMatchObject({
        board: "ok",
        controlled: true,
        exit: "ok",
        mover: `0x${VEHICLE.toString(16)}`,
        traveled: 10,
      });
      expect(targets).toEqual([{ x: 110, y: 200, z: 7 }]);
    }));

  test("asks for a seat change only when seat is given and reports the outcome", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ controlling: true, seat: "1" });
      const running = flow.run(ctx);
      await fakeMsUntilSettled(running, 1000);
      expect(await running).toMatchObject({ changeSeat: "no_answer" });
      const plain = context({ controlling: true });
      const second = flow.run(plain.ctx);
      await fakeMsUntilSettled(second, 1000);
      expect(await second).toMatchObject({ changeSeat: null });
    }));

  test("does not walk when control never arrives", () =>
    withFakeTimers(async () => {
      const { ctx, targets } = context({ controlling: false });
      const running = flow.run(ctx);
      await fakeMsUntilSettled(running, 1000);
      expect(await running).toMatchObject({ controlled: false, traveled: 0 });
      expect(targets).toEqual([]);
    }));

  test("reports a refused click without exiting", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ click: "not_clickable", controlling: false });
      const running = flow.run(ctx);
      await fakeMsUntilSettled(running, 1000);
      expect(await running).toMatchObject({
        board: "not_clickable",
        exit: null,
      });
    }));
});
