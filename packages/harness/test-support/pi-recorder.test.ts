import { describe, expect, test } from "bun:test";
import {
  createFakeTui,
  createPiRecorder,
  createUiRecorder,
  recorderContext,
} from "#test-support/pi-recorder";

describe("pi recorder", () => {
  test("records handlers, commands and unknown calls", async () => {
    const fake = createPiRecorder();
    const seen: unknown[] = [];
    fake.pi.on("session_start", (event) => {
      seen.push(event);
    });
    fake.pi.registerCommand("now", {
      handler: async (args) => {
        seen.push(args);
      },
    });
    fake.pi.setLabel("x", "y");
    const { ui, named } = createUiRecorder();
    const ctx = recorderContext({ contextPct: 14, ui });
    await fake.fire("session_start", { reason: "startup" }, ctx);
    await fake.run("now", "", ctx);
    ctx.ui.setTitle("hi");
    expect(seen).toEqual([{ reason: "startup" }, ""]);
    expect(fake.calls).toEqual([{ args: ["x", "y"], method: "setLabel" }]);
    expect(named("setTitle")).toEqual([["hi"]]);
    expect(ctx.getContextUsage()?.percent).toBe(14);
  });

  test("the fake tui counts render requests", () => {
    const { tui, renders } = createFakeTui();
    tui.requestRender();
    expect(renders()).toBe(1);
  });
});
