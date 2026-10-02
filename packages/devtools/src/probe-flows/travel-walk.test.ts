import { describe, expect, test } from "bun:test";
import { withFakeTimers } from "@peon/core/test-support/fake-time";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/travel-walk";

function context(
  args: Record<string, string>,
  walked: Array<{
    status: "completed" | "stopped";
    traveled: number;
    pose: { x: number; y: number; z: number; mapId: number };
  }>,
) {
  const calls: Array<{ x: number; y: number; z: number | undefined }> = [];
  const handle = createMockHandle();
  const steps = [...walked];
  Object.assign(handle, {
    getControlState: () => ({
      pose: {
        mapId: 1,
        source: "server",
        updatedAt: 0,
        x: 360,
        y: -4720,
        z: 14,
      },
    }),
    walkTowardPoint: async (target: { x: number; y: number; z?: number }) => {
      calls.push({ x: target.x, y: target.y, z: target.z });
      const step = steps.shift();
      if (!step) throw new Error("no step left");
      return {
        ...step,
        pose: { ...step.pose, source: "server", updatedAt: 0 },
      };
    },
  });
  const ctx: FlowContext = { args, handle, settle: settleWithin(100) };
  return { calls, ctx };
}

describe("travel-walk flow", () => {
  test("walks in 20 yd server-planned steps and reports the ends", () =>
    withFakeTimers(async () => {
      const { ctx, calls } = context({ x: "310", y: "-4730" }, [
        {
          pose: { mapId: 1, x: 345, y: -4722, z: 13 },
          status: "completed",
          traveled: 20,
        },
        {
          pose: { mapId: 1, x: 325, y: -4726, z: 11 },
          status: "completed",
          traveled: 20,
        },
        {
          pose: { mapId: 1, x: 310, y: -4730, z: 10 },
          status: "completed",
          traveled: 19,
        },
      ]);
      const result = (await flow.run(ctx)) as { traveled: number };
      expect(result.traveled).toBe(59);
      expect(calls).toHaveLength(3);
    }));

  test("refuses text coordinates", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ x: "north", y: "-4730" }, []);
      await expect(flow.run(ctx)).rejects.toThrow("travel-walk needs");
    }));

  test("stops on a refusal with no progress", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ x: "310", y: "-4730" }, [
        {
          pose: { mapId: 1, x: 360, y: -4720, z: 14 },
          status: "stopped",
          traveled: 0,
        },
      ]);
      const result = (await flow.run(ctx)) as {
        traveled: number;
        outcome: { status: string };
      };
      expect(result.traveled).toBe(0);
      expect(result.outcome.status).toBe("stopped");
    }));
});
