import { describe, expect, jest, test } from "bun:test";
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
import { flow } from "#tools/probe-flows/quests-extras";

type QuestState = ReturnType<WorldHandle["getQuestState"]>;

const CMSG_QUESTGIVER_QUEST_AUTOLAUNCH = 0x1_87;

const PONG_WAIT_MS = 35_000;

function context(): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  const questState = handle.getQuestState();
  handle.getQuestState = jest.fn(
    (): QuestState => ({
      ...questState,
      lastError: { at: 0, kind: "stale_dialog" },
    }),
  );
  return { args: {}, handle, settle: settleWithin(100) };
}

function autoLaunched(handle: MockHandle): boolean {
  return handle.sent.some(
    (p) => p.opcode === CMSG_QUESTGIVER_QUEST_AUTOLAUNCH,
  );
}

describe("quests-extras flow", () => {
  test("ignores a pong that does not answer a ping sent after the auto-launch", () =>
    withFakeTimers(async () => {
      const ctx = context();
      const running = flow.run(ctx);
      await elapse(150);
      ctx.handle.triggerAreaEvent("login", { rttMs: 12, seq: 0, type: "pong" });
      await elapse(PONG_WAIT_MS);
      expect(autoLaunched(ctx.handle)).toBe(true);
      expect(await fakeAwait(running, 1000)).toMatchObject({ ping: false });
    }));

  test("a pong after the auto-launch reports the round trip", () =>
    withFakeTimers(async () => {
      const ctx = context();
      const running = flow.run(ctx);
      await elapse(150);
      ctx.handle.triggerAreaEvent("login", { rttMs: 40, seq: 1, type: "pong" });
      expect(autoLaunched(ctx.handle)).toBe(true);
      expect(await fakeAwait(running, 1000)).toMatchObject({
        ping: { rttMs: 40, seq: 1 },
      });
    }));

  test("reports no ping when no pong arrives", () =>
    withFakeTimers(async () => {
      const ctx = context();
      const result = await fakeAwait(flow.run(ctx), PONG_WAIT_MS + 5000);
      expect(autoLaunched(ctx.handle)).toBe(true);
      expect(result).toMatchObject({ ping: false });
    }));

});
