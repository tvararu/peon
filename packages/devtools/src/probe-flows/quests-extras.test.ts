import { describe, expect, jest, test } from "bun:test";
import type { Entity, WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/quests-extras";

type QuestState = ReturnType<WorldHandle["getQuestState"]>;

const CMSG_QUESTGIVER_HELLO = 0x1_84;

const CMSG_QUESTGIVER_QUEST_AUTOLAUNCH = 0x1_87;

const PONG_WAIT_MS = 35_000;

const ERONA: Entity = {
  entry: 15_278,
  guid: 0xf1_30n,
  name: "Magistrix Erona",
  objectType: 3,
  position: { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 },
  rawFields: new Map(),
  scale: 1,
};

function context(nearby: Entity[] = [ERONA]): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  const questState = handle.getQuestState();
  handle.getNearbyEntities = jest.fn(() => nearby);
  handle.getQuestState = jest.fn(
    (): QuestState => ({
      ...questState,
      lastError: { at: 0, kind: "stale_dialog" },
    }),
  );
  return { args: {}, handle, settle: settleWithin(100) };
}

function autoLaunched(handle: MockHandle): boolean {
  return handle.sent.some((p) => p.opcode === CMSG_QUESTGIVER_QUEST_AUTOLAUNCH);
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

  test("refuses without sending a hello when Erona is not in view", () =>
    withFakeTimers(async () => {
      const ctx = context([]);
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain("15278");
      expect(
        ctx.handle.sent.some((p) => p.opcode === CMSG_QUESTGIVER_HELLO),
      ).toBe(false);
      expect(autoLaunched(ctx.handle)).toBe(false);
    }));
});
