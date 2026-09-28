import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  timeLoginSetTimeSpeedBody,
  timeQueryResponseBody,
} from "#test-support/areas/time";
import { type TimeEvent, TimeStore } from "#wow/areas/time/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const NOON = { year: 2026, month: 9, day: 28, weekday: 1, hour: 12, minute: 0 };
const SPEED = Math.fround(0.016_666_67);

function clock(start: number) {
  let t = start;
  return {
    advance: (ms: number) => {
      t += ms;
    },
    now: () => t,
  };
}

describe("TimeStore", () => {
  test("starts empty", () => {
    expect(new TimeStore(() => 0).snapshot()).toEqual({
      gameTime: undefined,
      speed: undefined,
      serverTime: undefined,
      dailyResetInSec: undefined,
      receivedAt: undefined,
    });
  });

  test("receiveSetSpeed stores the game time and emits set_speed with a detached state", () => {
    const store = new TimeStore(() => 1000);
    const seen: TimeEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveSetSpeed({ gameTime: NOON, speed: SPEED });
    expect(store.snapshot()).toMatchObject({
      gameTime: NOON,
      speed: SPEED,
      receivedAt: 1000,
    });
    expect(seen.map((e) => e.type)).toEqual(["set_speed"]);
    const [first] = seen;
    if (!first?.state.gameTime) throw new Error("no event");
    first.state.gameTime.hour = 3;
    first.state.speed = 9;
    expect(store.snapshot()).toMatchObject({ gameTime: NOON, speed: SPEED });
  });

  test("receiveQueryReply stores the reset timer and keeps the game time", () => {
    const time = clock(1000);
    const store = new TimeStore(time.now);
    const seen: TimeEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveSetSpeed({ gameTime: NOON, speed: SPEED });
    time.advance(500);
    store.receiveQueryReply({ serverTime: 1_790_000_000, dailyResetInSec: 60 });
    expect(store.snapshot()).toEqual({
      gameTime: NOON,
      speed: SPEED,
      serverTime: 1_790_000_000,
      dailyResetInSec: 60,
      receivedAt: 1500,
    });
    expect(seen.map((e) => e.type)).toEqual(["set_speed", "query_reply"]);
    expect(seen[1]?.state.dailyResetInSec).toBe(60);
  });

  test("snapshot is a copy", () => {
    const store = new TimeStore(() => 0);
    store.receiveSetSpeed({ gameTime: NOON, speed: SPEED });
    const copy = store.snapshot();
    if (!copy.gameTime) throw new Error("no game time");
    copy.gameTime.minute = 30;
    copy.speed = 1;
    expect(store.snapshot()).toMatchObject({ gameTime: NOON, speed: SPEED });
  });

  test("dispose clears listeners", () => {
    const store = new TimeStore(() => 0);
    const seen: TimeEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.dispose();
    store.receiveQueryReply({ serverTime: 1, dailyResetInSec: 2 });
    expect(seen).toEqual([]);
  });
});

describe("time area wiring", () => {
  test("injected server packets update the handle state", () => {
    const rig = areaRig("time", { now: () => 42 });
    try {
      rig.inject(
        GameOpcode.SMSG_LOGIN_SETTIMESPEED,
        timeLoginSetTimeSpeedBody({ gameTime: NOON, speed: SPEED }),
      );
      expect(rig.handle.state()).toMatchObject({
        gameTime: NOON,
        speed: SPEED,
        receivedAt: 42,
      });
      rig.inject(
        GameOpcode.SMSG_QUERY_TIME_RESPONSE,
        timeQueryResponseBody({
          serverTime: 1_790_000_000,
          dailyResetInSec: 7,
        }),
      );
      expect(rig.handle.state()).toMatchObject({
        serverTime: 1_790_000_000,
        dailyResetInSec: 7,
      });
    } finally {
      rig.dispose();
    }
  });

  test("the handle forwards store events to onEvent", () => {
    const rig = areaRig("time");
    try {
      const seen: string[] = [];
      rig.handle.onEvent((event) => seen.push(event.type));
      rig.inject(
        GameOpcode.SMSG_QUERY_TIME_RESPONSE,
        timeQueryResponseBody({ serverTime: 1, dailyResetInSec: 2 }),
      );
      expect(seen).toEqual(["query_reply"]);
    } finally {
      rig.dispose();
    }
  });
});
