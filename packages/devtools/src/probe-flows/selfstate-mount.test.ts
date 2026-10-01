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
  mountFieldsAfterReads = 0,
) {
  const handle = createMockHandle();
  const realSelf = handle.selfstate;
  let reads = 0;
  const mounted = () => reads > mountFieldsAfterReads;
  const dismount = jest.fn(async () =>
    mounted() ? OK : ({ reason: "not_mounted", status: "refused" } as const),
  );
  const mountSpecialAnim = jest.fn(() =>
    mounted() ? OK : ({ reason: "not_mounted", status: "refused" } as const),
  );
  const selfstate: Selfstate = {
    ...realSelf,
    act: { ...realSelf.act, dismount, mountSpecialAnim } as Selfstate["act"],
    state: () => {
      reads += 1;
      return {
        ...realSelf.state(),
        collisionHeight: heights.shift(),
        mounted: mounted(),
      };
    },
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

  test("waits for the mount fields when the collision height arrives first", () =>
    withFakeTimers(async () => {
      const { ctx, dismount, mountSpecialAnim } = context(
        "458",
        [undefined, MOUNTED, MOUNTED, MOUNTED, WALKING],
        { special: "1" },
        3,
      );
      expect(await fakeAwait(flow.run(ctx), 3000)).toMatchObject({
        dismount: "ok",
        mounted: MOUNTED,
        special: "ok",
      });
      expect(mountSpecialAnim).toHaveBeenCalledTimes(1);
      expect(dismount).toHaveBeenCalledTimes(1);
    }));
});
