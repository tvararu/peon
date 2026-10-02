import { describe, expect, spyOn, test } from "bun:test";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/battlegrounds-queue";

function context(args: Record<string, string>) {
  const handle = createMockHandle();
  const ctx: FlowContext = { args, handle, settle: settleWithin(20) };
  return { ctx, handle };
}

describe("battlegrounds-queue flow", () => {
  test("join reports the act's rejection name instead of throwing", async () => {
    const { ctx, handle } = context({ bg: "3", step: "join-again" });
    const join = spyOn(handle.battlegrounds.act, "join").mockRejectedValue(
      new Error("none"),
    );
    const result = (await flow.run(ctx)) as { error: string; step: string };
    expect(join).toHaveBeenCalledWith(3);
    expect(result).toMatchObject({ error: "none", step: "join-again" });
  });

  test("leave targets the first queued slot", async () => {
    const { ctx, handle } = context({ step: "leave" });
    const leave = spyOn(
      handle.battlegrounds.act,
      "leaveQueue",
    ).mockResolvedValue({ kind: "none", slot: 1 });
    spyOn(handle.battlegrounds, "state").mockReturnValue({
      queue: { slots: [{ kind: "none" }, { kind: "queued" }] },
    } as never);
    const result = (await flow.run(ctx)) as { slot: number };
    expect(leave).toHaveBeenCalledWith(1);
    expect(result.slot).toBe(1);
  });

  test("hello without a battlemaster in view or a guid fails", async () => {
    const { ctx } = context({ step: "hello" });
    await expect(flow.run(ctx)).rejects.toThrow("battlemaster");
  });

  test("an unknown step names the choices", async () => {
    const { ctx } = context({ step: "nope" });
    await expect(flow.run(ctx)).rejects.toThrow("join-again");
  });
});
