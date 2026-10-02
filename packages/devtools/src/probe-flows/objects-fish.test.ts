import { describe, expect, mock, test } from "bun:test";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, loadFlows, settleWithin } from "#tools/probe-flows";

const BOBBER = 0xf1_10_8b_07_00_00_00_01n;

function context(args: Record<string, string> = {}): FlowContext {
  const handle = createMockHandle();
  handle.getControlState = (() => ({ selfGuid: 0x42n })) as never;
  handle.queryNearby = () => [];
  return { args, handle, settle: settleWithin(50) };
}

const flows = await loadFlows();

describe("objects-fish flow", () => {
  test("casts Fishing on yourself and reports the waiting state", async () => {
    const ctx = context();
    Object.defineProperty(ctx.handle.objects, "state", {
      value: mock(
        () => ({ fishing: { bobber: BOBBER, phase: "waiting" } }) as never,
      ),
    });
    const result = (await flows.get("objects-fish")?.run(ctx)) as Record<
      string,
      unknown
    >;
    expect(ctx.handle.cast).toHaveBeenCalledWith(7620, 0x42n);
    expect(result).toMatchObject({
      bobber: "0xf1108b0700000001",
      fishing: { bobber: "0xf1108b0700000001", phase: "waiting" },
      seen: [],
    });
  });

  test("rejects a bad seconds argument", async () => {
    await expect(
      flows.get("objects-fish")?.run(context({ seconds: "0" })),
    ).rejects.toThrow("objects-fish needs seconds=");
  });
});
