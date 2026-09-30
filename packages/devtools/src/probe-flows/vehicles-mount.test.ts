import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/vehicles-mount";

type Spells = WorldHandle["spells"];

const OK = { ok: true } as const;
const ME = 0x2an;
const SPELL = 300;
const VEHICLE = 315;

function context(cancel: jest.Mock) {
  const handle = createMockHandle();
  handle.queryNearby = () => [{ entity: { guid: ME }, self: true }] as never;
  const spells: Spells = {
    ...handle.spells,
    act: { cancelAura: cancel } as unknown as Spells["act"],
  };
  Object.assign(handle, { spells });
  const ctx: FlowContext & { handle: MockHandle } = {
    args: { spell: String(SPELL) },
    handle,
    settle: settleWithin(100),
  };
  return ctx;
}

function mounted(handle: MockHandle, vehicleId: number) {
  handle.triggerAreaEvent("vehicles", {
    guid: ME,
    type: "player_vehicle",
    vehicleId,
  });
}

describe("vehicles-mount flow", () => {
  test("waits for the post-cancel dismount, not the earlier mount event", () =>
    withFakeTimers(async () => {
      const ctx = context(jest.fn(() => OK));
      const running = flow.run(ctx);
      await elapse(8100);
      mounted(ctx.handle, VEHICLE);
      mounted(ctx.handle, VEHICLE);
      await elapse(50);
      expect(ctx.handle.spells.act.cancelAura).toHaveBeenCalledWith(SPELL);
      mounted(ctx.handle, 0);
      expect(await fakeAwait(running, 1000)).toMatchObject({
        dismounted: true,
        spell: SPELL,
      });
    }));

  test("rejects when no post-cancel dismount arrives", () =>
    withFakeTimers(async () => {
      const ctx = context(jest.fn(() => OK));
      const running = flow.run(ctx);
      await elapse(8100);
      mounted(ctx.handle, VEHICLE);
      await elapse(50);
      expect(await fakeRejection(running, 1000)).toContain("dismount");
    }));

  test("rejects when the cancel request is refused", () =>
    withFakeTimers(async () => {
      const cancel = jest.fn(() => ({ ok: false, reason: "not_aura" }));
      const ctx = context(cancel);
      const running = flow.run(ctx);
      expect(await fakeRejection(running, 9000)).toContain("not_aura");
    }));
});
