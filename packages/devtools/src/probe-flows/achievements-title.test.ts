import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/achievements-title";

type TitleActs = WorldHandle["achievements"]["act"];

const BIT = 110;

function titles(chosen: number) {
  return { chosen, known: chosen === 0 ? [] : [BIT] };
}

function context(store: { chosen: number }): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  Object.assign(handle, {
    achievements: {
      ...handle.achievements,
      state: () => ({
        count: 0,
        criteria: 0,
        recent: [],
        titles: titles(store.chosen),
      }),
    },
  });
  return { args: { linger: "0" }, handle, settle: settleWithin(200) };
}

describe("achievements-title flow", () => {
  test("chooses the earned bit then clears it", async () => {
    const store = { chosen: 0 };
    const ctx = context(store);
    const setTitle = jest.fn((bit: number | undefined) => {
      if (bit === undefined) {
        store.chosen = 0;
        return { bit: undefined, ok: true };
      }
      store.chosen = bit;
      return { bit, ok: true };
    });
    Object.assign(ctx.handle, {
      achievements: {
        ...ctx.handle.achievements,
        act: { setTitle } as unknown as TitleActs,
        state: () => ({
          count: 0,
          criteria: 0,
          recent: [],
          titles: titles(store.chosen),
        }),
      },
    });
    const running = flow.run(ctx);
    ctx.handle.triggerAreaEvent("achievements", {
      bit: BIT,
      earned: true,
      type: "title_changed",
    });
    const result = (await running) as Record<string, unknown>;
    expect(setTitle).toHaveBeenCalledWith(BIT);
    expect(setTitle).toHaveBeenCalledWith(undefined);
    expect(result["bit"]).toBe(BIT);
    expect(ctx.handle.achievements.state().titles.chosen).toBe(0);
  });

  test("fails when no title is earned", async () => {
    const ctx = context({ chosen: 0 });
    await expect(flow.run(ctx)).rejects.toThrow("no SMSG_TITLE_EARNED");
  });

  test("reports a refused setTitle", async () => {
    const ctx = context({ chosen: 0 });
    const setTitle = () => ({ ok: false, reason: "unknown_title" }) as const;
    Object.assign(ctx.handle, {
      achievements: {
        ...ctx.handle.achievements,
        act: { setTitle } as unknown as TitleActs,
      },
    });
    const running = flow.run(ctx);
    ctx.handle.triggerAreaEvent("achievements", {
      bit: BIT,
      earned: true,
      type: "title_changed",
    });
    await expect(running).rejects.toThrow("setTitle refused");
  });

  test("fails when the chosen title never applies", async () => {
    const ctx = context({ chosen: 0 });
    const setTitle = (bit: number | undefined) => ({ bit, ok: true }) as const;
    Object.assign(ctx.handle, {
      achievements: {
        ...ctx.handle.achievements,
        act: { setTitle } as unknown as TitleActs,
      },
    });
    const running = flow.run(ctx);
    ctx.handle.triggerAreaEvent("achievements", {
      bit: BIT,
      earned: true,
      type: "title_changed",
    });
    await expect(running).rejects.toThrow("never became");
  });
});
