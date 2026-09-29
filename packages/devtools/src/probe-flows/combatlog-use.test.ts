import { describe, expect, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/combatlog-use";

type Slots = ReturnType<WorldHandle["getInventoryState"]>["slots"];

const ME = 0x2an;

function slot(
  bag: number,
  index: number,
  region: string,
  entry: number,
): Slots[number] {
  return {
    bag,
    guid: BigInt(index + 1),
    item: { entry },
    region,
    slot: index,
    status: "occupied",
  } as unknown as Slots[number];
}

function context(
  args: Record<string, string>,
  slots: Slots = [],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.getInventoryState = (() => ({
    selfGuid: ME,
    slots,
    status: "complete",
  })) as unknown as MockHandle["getInventoryState"];
  handle.queryNearby = () =>
    [{ entity: { guid: ME }, self: true }] as unknown as ReturnType<
      WorldHandle["queryNearby"]
    >;
  return { args, handle, settle: settleWithin(200) };
}

describe("combatlog-use flow", () => {
  test("item=<id> uses the matching item from the backpack or a bag and counts entries", () =>
    withFakeTimers(async () => {
      const ctx = context({ item: "118" }, [
        slot(255, 23, "equipment", 118),
        slot(255, 24, "backpack", 4540),
        slot(19, 1, "bag_item", 118),
      ]);
      const running = flow.run(ctx);
      await elapse(50);
      ctx.handle.triggerAreaEvent("combatlog", {
        amount: 40,
        at: 1,
        kind: "heal",
        source: ME,
        spellId: 2024,
        target: ME,
        type: "entry",
      });
      const result = await fakeAwait(running, 11_000);
      expect(ctx.handle.useItem).toHaveBeenCalledWith(19, 1);
      expect(result).toMatchObject({ entries: { "heal out": 1 }, item: 118 });
    }));

  test("item=<id> with no such item throws", () => {
    const ctx = context({ item: "118" }, [slot(255, 24, "backpack", 4540)]);
    expect(async () => await flow.run(ctx)).toThrow("118");
  });

  test("spell=<id> casts on the character", () =>
    withFakeTimers(async () => {
      const ctx = context({ spell: "2050" });
      const running = flow.run(ctx);
      await fakeAwait(running, 11_000);
      expect(ctx.handle.cast).toHaveBeenCalledWith(2050, ME);
    }));

  test("neither or both arguments throw", () => {
    expect(async () => await flow.run(context({}))).toThrow("item=");
    expect(
      async () => await flow.run(context({ item: "1", spell: "2" })),
    ).toThrow("item=");
  });
});
