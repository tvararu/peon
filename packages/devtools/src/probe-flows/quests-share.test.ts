import { describe, expect, jest, test } from "bun:test";
import {
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/quests-share";

const ESCORT_QUEST = 8488;
const SHARER = 0x2bn;

type Offer = { kind: "share" | "confirm"; questId: number };

function context(offer: Offer): FlowContext {
  const handle = createMockHandle();
  const state = handle.quests.state();
  jest.spyOn(handle.quests, "state").mockReturnValue({
    ...state,
    share: {
      dropped: state.share?.dropped ?? 0,
      offer: { at: 0, from: SHARER, title: "Offered", ...offer },
      push: state.share?.push,
    },
  });
  return { args: { mode: "escort" }, handle, settle: settleWithin(100) };
}

describe("quests-share escort mode", () => {
  test("prints a confirm offer for the escort quest", () =>
    withFakeTimers(async () => {
      const ctx = context({ kind: "confirm", questId: ESCORT_QUEST });
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        from: `0x${SHARER.toString(16)}`,
        questId: ESCORT_QUEST,
      });
    }));

  test("an ordinary shared-quest offer is not an escort prompt", () =>
    withFakeTimers(async () => {
      const ctx = context({ kind: "share", questId: 8329 });
      expect(await fakeRejection(flow.run(ctx), 1000)).not.toBe("resolved");
    }));

  test("a confirm offer for another quest is not the escort prompt", () =>
    withFakeTimers(async () => {
      const ctx = context({ kind: "confirm", questId: 8329 });
      expect(await fakeRejection(flow.run(ctx), 1000)).not.toBe("resolved");
    }));
});
