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
type Spells = WorldHandle["spells"];

const OK = { ok: true } as const;
const MOUNTED = 3.25;
const WALKING = 2.03;

function context(spell: string, heights: Array<number | undefined>) {
  const handle = createMockHandle();
  const realSelf = handle.selfstate;
  const selfstate: Selfstate = {
    ...realSelf,
    state: () => ({ ...realSelf.state(), collisionHeight: heights.shift() }),
  };
  const cancelAura = jest.fn(() => OK);
  const spells: Spells = {
    ...handle.spells,
    act: { cancelAura } as unknown as Spells["act"],
  };
  Object.assign(handle, { selfstate, spells });
  const ctx: FlowContext & { handle: MockHandle } = {
    args: { spell },
    handle,
    settle: settleWithin(2000),
  };
  return { cancelAura, ctx };
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
      const { cancelAura, ctx } = context("458", [
        undefined,
        MOUNTED,
        WALKING,
      ]);
      expect(await fakeAwait(flow.run(ctx), 3000)).toMatchObject({
        after: WALKING,
        before: null,
        cancel: "ok",
        mounted: MOUNTED,
        spell: 458,
      });
      expect(ctx.handle.cast).toHaveBeenCalledWith(458, 0n);
      expect(cancelAura).toHaveBeenCalledWith(458);
    }));
});
