import { describe, expect, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/trade-offer";

type Phase = "idle" | "requested_in" | "open";

type Scenario = FlowContext & { calls: string[]; handle: MockHandle };

function scenario(requestAt: number | null = 500): Scenario {
  const handle = createMockHandle();
  const calls: string[] = [];
  let phase: Phase = "idle";
  const trade = {
    act: {
      acceptTrade: async () => {
        calls.push("acceptTrade");
        if (phase !== "open") throw new Error("no trade is open");
        return { status: "ok" as const };
      },
      answerTrade: (async (answer: string) => {
        calls.push(`answer:${answer}`);
        if (phase !== "requested_in") throw new Error("no_request");
        phase = "open";
        return { status: "ok" as const };
      }) as WorldHandle["trade"]["act"]["answerTrade"],
      offerGold: async (copper: number) => {
        calls.push(`gold:${copper}`);
        if (phase !== "open") throw new Error("no trade is open");
        return { gold: copper };
      },
      offerItem: (async (tradeSlot: number, bag: number, slot: number) => {
        calls.push(`item:${tradeSlot}/${bag}/${slot}`);
        if (phase !== "open") throw new Error("no trade is open");
        return { slot: tradeSlot };
      }) as WorldHandle["trade"]["act"]["offerItem"],
      unacceptTrade: async () => ({ unaccepted: true }),
    },
    state: () => ({
      from: 0xbn,
      lastOutcome: undefined,
      phase,
      selfAccepted: false,
      theirOffer: { gold: 0, items: [], spell: 0, version: 0 },
    }),
  };
  Object.assign(handle, {
    getInventoryState: () => ({
      slots: [
        {
          bag: 0,
          item: { count: 1, entry: 2589 },
          slot: 1,
          status: "occupied",
        },
      ],
      status: "complete",
    }),
    trade,
  });
  if (requestAt !== null)
    setTimeout(() => {
      phase = "requested_in";
    }, requestAt);
  return {
    args: { gold: "40", offer: "2589:1", slot: "0" },
    calls,
    handle,
    settle: settleWithin(0),
  };
}

describe("trade-offer flow", () => {
  test("answers the request and offers only after the window opens", () =>
    withFakeTimers(async () => {
      const ctx = scenario();
      const result = await fakeAwait(flow.run(ctx), 30_000);
      expect(ctx.calls).toEqual([
        "answer:yes",
        "item:0/0/1",
        "gold:40",
        "acceptTrade",
      ]);
      expect(result).toMatchObject({
        answered: { status: "ok" },
        opened: "open",
        requested: "0xb",
      });
    }));

  test("returns no_request when no trade request arrives", () =>
    withFakeTimers(async () => {
      const ctx = scenario(null);
      const result = await fakeAwait(flow.run({ ...ctx, args: {} }), 70_000);
      expect(result).toMatchObject({ outcome: "no_request" });
    }));
});
