import { describe, expect, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/pets-bar";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spell = Awaited<ReturnType<WorldHandle["getSpellbook"]>>[number];

const REQUEST_PET_INFO = 0x2_79;
const ME = 0x2an;
const PET = 0xf1_40_00_0c_9f_00_01_e6n;
const BAR = {
  command: "follow" as const,
  durationMs: 0,
  family: 1,
  flags: 0,
  guid: PET,
  react: "defensive" as const,
  receivedAt: 0,
  slots: [],
  spells: [],
};

function context(args: Record<string, string> = {}) {
  const handle = createMockHandle();
  handle.queryNearby = () => [{ entity: { guid: ME }, self: true } as Row];
  handle.getSpellbook = async () =>
    [
      { id: 883, name: "Call Pet" },
      { id: 2641, name: "Dismiss Pet" },
    ] as Spell[];
  const ctx: FlowContext & { handle: MockHandle } = {
    args,
    handle,
    settle: settleWithin(100),
  };
  return ctx;
}

function show(handle: MockHandle) {
  handle.triggerAreaEvent("pets", { bar: BAR, cleared: false, type: "bar" });
}

function requests(handle: MockHandle) {
  return handle.sent.filter((p) => p.opcode === REQUEST_PET_INFO);
}

describe("pets-bar flow", () => {
  test("with a pet out it asks for the bar again and waits for the reply", async () => {
    const ctx = context();
    const running = flow.run(ctx);
    show(ctx.handle);
    await Bun.sleep(150);
    expect(requests(ctx.handle)).toHaveLength(1);
    show(ctx.handle);
    expect(await running).toMatchObject({
      bars: { cleared: 0, shown: 2 },
      called: null,
      cleared: null,
      replied: true,
    });
    expect(ctx.handle.cast).not.toHaveBeenCalled();
  });

  test("with no pet out it casts Call Pet on the character first", async () => {
    const ctx = context();
    const running = flow.run(ctx);
    await Bun.sleep(150);
    expect(ctx.handle.cast).toHaveBeenCalledWith(883, ME);
    show(ctx.handle);
    await Bun.sleep(150);
    show(ctx.handle);
    expect(await running).toMatchObject({ called: 883, replied: true });
  });

  test("dismiss=1 casts Dismiss Pet and waits for the cleared bar", async () => {
    const ctx = context({ dismiss: "1" });
    const running = flow.run(ctx);
    show(ctx.handle);
    await Bun.sleep(150);
    show(ctx.handle);
    await Bun.sleep(150);
    expect(ctx.handle.cast).toHaveBeenCalledWith(2641, ME);
    ctx.handle.triggerAreaEvent("pets", { cleared: true, type: "bar" });
    expect(await running).toMatchObject({
      bars: { cleared: 1, shown: 2 },
      cleared: true,
      dismissed: 2641,
    });
  });
});
