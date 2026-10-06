import { describe, expect, jest, test } from "bun:test";
import type { AreaEvent, AreaState } from "@peon/core";
import { flushMicrotasks } from "@peon/core/test-support/microtasks";
import { areaDrafts, areaRuleSet, attachDrafts } from "#harness/areas/rules";
import { createWorldService } from "#harness/world/hub";
import type { WorldSession } from "#harness/world/service";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const QUERY_TIME = 0x1_ce;
const NOON = { day: 28, hour: 12, minute: 5, month: 9, weekday: 1, year: 2026 };
const SPEED = Math.fround(0.016_666_67);
const SYNCED: AreaState<"time"> = {
  dailyResetInSec: 5400,
  gameTime: NOON,
  receivedAt: 7,
  serverTime: 1_790_000_000,
  speed: SPEED,
  uiTime: undefined,
  uiTimeAt: undefined,
};
const UI_TIMER_UPDATE = 0x4_f6;

function timeEvent(type: "set_speed" | "query_reply"): AreaEvent {
  return { area: "time", event: { state: SYNCED, type } };
}

async function connected() {
  const game = createMockGame();
  const { rt } = await createTestRuntime({
    connect: false,
    parts: { login: async () => game },
  });
  const hub = createWorldService(rt);
  await rt.connect();
  return { game, rt, world: hub.service };
}

describe("time harness rules", () => {
  test("attach turns stored state into one time/synced row", () => {
    const game = Object.assign(createMockGame(), {
      time: { ...createMockGame().time, state: () => SYNCED },
    });
    const rows = attachDrafts(areaRuleSet(), game, testRuleInput());
    expect<unknown[]>(rows).toEqual([
      {
        class: "log",
        data: {
          dailyResetInSec: 5400,
          gameTime: "2026-09-28 12:05",
          serverTime: 1_790_000_000,
          source: "attach",
          speed: SPEED,
        },
        domain: "time",
        event: "time/synced",
        text: "Game time 2026-09-28 12:05. Daily reset in 1h 30m.",
      },
    ]);
  });

  test("attach writes nothing before the server sent any time", () => {
    expect(
      attachDrafts(areaRuleSet(), createMockGame(), testRuleInput()),
    ).toEqual([]);
  });

  test("a query_reply row carries the daily reset and a set_speed row does not", () => {
    const rules = areaRuleSet();
    const [reply] = areaDrafts(
      rules,
      timeEvent("query_reply"),
      testRuleInput(),
    );
    const [speed] = areaDrafts(rules, timeEvent("set_speed"), testRuleInput());
    expect(reply).toMatchObject({
      data: { dailyResetInSec: 5400, source: "query_reply" },
      event: "time/synced",
    });
    expect(speed).toMatchObject({
      data: { source: "set_speed" },
      event: "time/synced",
      text: "Game time 2026-09-28 12:05.",
    });
    expect(speed?.data).not.toHaveProperty("dailyResetInSec");
    expect(speed?.data).not.toHaveProperty("fallback");
  });

  test("a ui_time event writes no row", () => {
    const event: AreaEvent = {
      area: "time",
      event: { state: { ...SYNCED, uiTime: 1_790_000_123 }, type: "ui_time" },
    };
    expect(areaDrafts(areaRuleSet(), event, testRuleInput())).toEqual([]);
  });
});

describe("time through the world service", () => {
  test("claim.areas.time.query refuses not_owner once the claim is lost", async () => {
    const { game, world } = await connected();
    const claim = world.claim("loop", "probe");
    world.claim("agent", "probe");
    await expect(claim?.areas.time.query()).rejects.toThrow("not_owner");
    expect(game.sent.filter((p) => p.opcode === QUERY_TIME)).toEqual([]);
  });

  test("claim.areas.time.query refuses offline with no session", async () => {
    const game = createMockGame();
    const { rt } = await createTestRuntime({
      connect: false,
      parts: { login: async () => game },
    });
    const claim = createWorldService(rt).service.claim("loop", "probe");
    await expect(claim?.areas.time.query()).rejects.toThrow("offline");
    expect(game.sent).toEqual([]);
  });

  test("claim.areas.time.requestUiTime sends one CMSG_WORLD_STATE_UI_TIMER_UPDATE", async () => {
    const { game, world } = await connected();
    const claim = world.claim("loop", "probe");
    jest.useFakeTimers();
    try {
      const settled = claim?.areas.time.requestUiTime().then(
        () => "resolved",
        (error: Error) => error.message,
      );
      await flushMicrotasks();
      expect(
        game.sent.filter((p) => p.opcode === UI_TIMER_UPDATE),
      ).toHaveLength(1);
      jest.advanceTimersByTime(5000);
      expect(await settled).toBe("timeout");
    } finally {
      jest.useRealTimers();
    }
  });

  test("session.areas.time.state() is a frozen copy", async () => {
    const { game, world } = await connected();
    game.triggerAreaEvent("time", { state: SYNCED, type: "query_reply" });
    const session = world.current() as WorldSession;
    const state = session.areas.time.state();
    expect(state).toEqual(game.time.state());
    expect(Object.isFrozen(state)).toBe(true);
    expect(() => Object.assign(state, { speed: 1 })).toThrow(TypeError);
  });
});
