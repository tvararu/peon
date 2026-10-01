import { describe, expect, jest, test } from "bun:test";
import type { QuestLogSlot, QuestQuery, QuestState } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/quests-daily";

function slot(questId: number, index: number): QuestLogSlot {
  return {
    counters: [0, 0, 0, 0],
    expiresAtSeconds: undefined,
    flags: 0,
    questId,
    slot: index,
  };
}

function known(questId: number, title: string): QuestQuery {
  return {
    data: { title },
    questId,
    receivedAt: 0,
    status: "known",
  } as unknown as QuestQuery;
}

function context(
  quests: Partial<QuestState> = {},
  daily: ReadonlySet<number> | undefined = new Set([14_179]),
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  const questState = handle.getQuestState();
  handle.getQuestState = jest.fn(
    (): QuestState => ({ ...questState, ...quests }),
  );
  jest.spyOn(handle.quests, "state").mockReturnValue({
    completed: undefined,
    daily,
    gossipPoi: undefined,
    marks: new Map(),
    pois: new Map(),
    texts: new Map(),
  });
  return { args: {}, handle, settle: settleWithin(100) };
}

describe("quests-daily flow", () => {
  test("prints the line with the queried title", () =>
    withFakeTimers(async () => {
      const ctx = context(
        {
          queries: [known(14_179, "Call to Arms: Eye of the Storm")],
        },
        new Set([14_179]),
      );
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        counts: [],
        daily: [14_179],
        lines: ["#14179 Call to Arms: Eye of the Storm: done today."],
      });
    }));

  test("an unqueried quest falls back to the bare id in the line", () =>
    withFakeTimers(async () => {
      const ctx = context({}, new Set([14_179]));
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        daily: [14_179],
        lines: ["#14179 quest 14179: done today."],
      });
    }));

  test("a quest still in the log has no done-today line", () =>
    withFakeTimers(async () => {
      const ctx = context(
        { log: { complete: true, slots: [slot(14_179, 0)] } },
        new Set([14_179]),
      );
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        daily: [14_179],
        lines: [],
      });
    }));
});
