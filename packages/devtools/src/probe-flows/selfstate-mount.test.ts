import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/selfstate-mount";

type Selfstate = WorldHandle["selfstate"];

const OK = { status: "ok" } as const;
const MOUNTED = 3.25;
const WALKING = 2.03;

function context(
  spell: string,
  heights: Array<number | undefined>,
  extra: Record<string, string> = {},
) {
  const handle = createMockHandle();
  const realSelf = handle.selfstate;
  const dismount = jest.fn(async () => OK as { status: string });
  const mountSpecialAnim = jest.fn(() => OK);
  const selfstate: Selfstate = {
    ...realSelf,
    act: { ...realSelf.act, dismount, mountSpecialAnim } as Selfstate["act"],
    state: () => ({ ...realSelf.state(), collisionHeight: heights.shift() }),
  };
  Object.assign(handle, { selfstate });
  const ctx: FlowContext & { handle: MockHandle } = {
    args: { spell, ...extra },
    handle,
    settle: settleWithin(2000),
  };
  return { ctx, dismount, mountSpecialAnim };
}

describe("selfstate-mount flow", () => {
  test("refuses a spell that is not a positive integer", () =>
    withFakeTimers(async () => {
      const { ctx } = context("horse", []);
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "selfstate-mount needs spell=<id>",
      );
    }));

  test("casts the spell, then reports the height the dismount brings", () =>
    withFakeTimers(async () => {
      const { ctx, dismount, mountSpecialAnim } = context("458", [
        undefined,
        MOUNTED,
        WALKING,
      ]);
      expect(await fakeAwait(flow.run(ctx), 3000)).toMatchObject({
        after: WALKING,
        before: null,
        dismount: "ok",
        mounted: MOUNTED,
        spell: 458,
      });
      expect(ctx.handle.cast).toHaveBeenCalledWith(458, 0n);
      expect(dismount).toHaveBeenCalledTimes(1);
      expect(mountSpecialAnim).not.toHaveBeenCalled();
    }));
  test("fails when no collision height arrives after the cast", () =>
    withFakeTimers(async () => {
      const { ctx, dismount } = context("458", []);
      expect(await fakeRejection(flow.run(ctx), 3000)).toContain(
        "no SMSG_MOVE_SET_COLLISION_HGT after casting 458",
      );
      expect(dismount).toHaveBeenCalledTimes(1);
    }));

  test("fails when the height from before the cast never changes", () =>
    withFakeTimers(async () => {
      const { ctx } = context("458", new Array(40).fill(MOUNTED));
      expect(await fakeRejection(flow.run(ctx), 3000)).toContain(
        "no SMSG_MOVE_SET_COLLISION_HGT after casting 458",
      );
    }));

  test("special=1 sends the mount special animation after the mount and before the dismount", () =>
    withFakeTimers(async () => {
      const { ctx, dismount, mountSpecialAnim } = context(
        "458",
        [undefined, MOUNTED, WALKING],
        { special: "1" },
      );
      expect(await fakeAwait(flow.run(ctx), 3000)).toMatchObject({
        special: "ok",
      });
      expect(mountSpecialAnim).toHaveBeenCalledTimes(1);
      expect(mountSpecialAnim.mock.invocationCallOrder[0]).toBeLessThan(
        dismount.mock.invocationCallOrder[0] ?? 0,
      );
    }));

  test("reports the dismounted event the dismount drew", () =>
    withFakeTimers(async () => {
      const { ctx, dismount } = context("458", [undefined, MOUNTED, WALKING]);
      dismount.mockImplementation(async () => {
        ctx.handle.triggerAreaEvent("selfstate", {
          taxi: false,
          type: "dismounted",
        });
        return OK;
      });
      const result = await fakeAwait(flow.run(ctx), 3000);
      expect(result).toMatchObject({
        events: [{ dismounted: { taxi: false } }],
      });
    }));
});
