import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  timeQueryResponseBody,
  timeUiTimerUpdateBody,
} from "#test-support/areas/time";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { timeRuntime } from "#wow/areas/time/runtime";
import { type TimeEvent, TimeStore } from "#wow/areas/time/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

const HOME = { mapId: 530, x: 1, y: 2, z: 3, orientation: 0 };
const REPLY = timeQueryResponseBody({
  serverTime: 1_790_000_000,
  dailyResetInSec: 3600,
});

const UI_REPLY = timeUiTimerUpdateBody({ gameTime: 1_790_000_123 });

function uiRequests(sent: readonly { opcode: number }[]) {
  return sent.filter(
    (p) => p.opcode === GameOpcode.CMSG_WORLD_STATE_UI_TIMER_UPDATE,
  );
}

function queries(sent: readonly { opcode: number }[]) {
  return sent.filter((p) => p.opcode === GameOpcode.CMSG_QUERY_TIME);
}

describe("time runtime", () => {
  test("query sends an empty CMSG_QUERY_TIME and resolves with the reply state", async () => {
    const rig = areaRig("time", { now: () => 9 });
    try {
      const pending = rig.handle.act.query();
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_QUERY_TIME, body: new Uint8Array() },
      ]);
      rig.inject(GameOpcode.SMSG_QUERY_TIME_RESPONSE, REPLY);
      expect(await pending).toMatchObject({
        serverTime: 1_790_000_000,
        dailyResetInSec: 3600,
        receivedAt: 9,
      });
    } finally {
      rig.dispose();
    }
  });

  test("query rejects timeout after 5 s with no reply", async () => {
    jest.useFakeTimers();
    const rig = areaRig("time");
    try {
      const pending = rig.handle.act.query();
      const settled = pending.then(
        () => "resolved",
        (error: Error) => error.message,
      );
      jest.advanceTimersByTime(4999);
      rig.inject(GameOpcode.SMSG_LOGIN_SETTIMESPEED, new Uint8Array(12));
      jest.advanceTimersByTime(1);
      expect(await settled).toBe("timeout");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("login_verified sends one CMSG_QUERY_TIME", async () => {
    const rig = areaRig("time");
    try {
      rig.stores.self.receive({ type: "login_verified", position: HOME });
      expect(queries(rig.sent)).toHaveLength(1);
      rig.stores.self.receive({ type: "new_world", position: HOME });
      expect(queries(rig.sent)).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_QUERY_TIME_RESPONSE, REPLY);
      expect(rig.handle.state().dailyResetInSec).toBe(3600);
    } finally {
      rig.dispose();
    }
  });

  test("requestUiTime sends an empty CMSG_WORLD_STATE_UI_TIMER_UPDATE and resolves with the reply state", async () => {
    const rig = areaRig("time", { now: () => 11 });
    try {
      const pending = rig.handle.act.requestUiTime();
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_WORLD_STATE_UI_TIMER_UPDATE,
          body: new Uint8Array(),
        },
      ]);
      rig.inject(GameOpcode.SMSG_WORLD_STATE_UI_TIMER_UPDATE, UI_REPLY);
      expect(await pending).toMatchObject({
        uiTime: 1_790_000_123,
        uiTimeAt: 11,
      });
      expect(rig.handle.state().uiTime).toBe(1_790_000_123);
    } finally {
      rig.dispose();
    }
  });

  test("two requestUiTime calls at once send one packet and share the answer", async () => {
    const rig = areaRig("time");
    try {
      const first = rig.handle.act.requestUiTime();
      const second = rig.handle.act.requestUiTime();
      expect(uiRequests(rig.sent)).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_WORLD_STATE_UI_TIMER_UPDATE, UI_REPLY);
      const [a, b] = await Promise.all([first, second]);
      expect(a.uiTime).toBe(1_790_000_123);
      expect(b).toEqual(a);
      const third = rig.handle.act.requestUiTime();
      expect(uiRequests(rig.sent)).toHaveLength(2);
      rig.inject(GameOpcode.SMSG_WORLD_STATE_UI_TIMER_UPDATE, UI_REPLY);
      await third;
    } finally {
      rig.dispose();
    }
  });

  test("requestUiTime rejects timeout after 5 s with no reply", async () => {
    jest.useFakeTimers();
    const rig = areaRig("time");
    try {
      const settled = rig.handle.act.requestUiTime().then(
        () => "resolved",
        (error: Error) => error.message,
      );
      jest.advanceTimersByTime(4999);
      rig.inject(GameOpcode.SMSG_QUERY_TIME_RESPONSE, REPLY);
      jest.advanceTimersByTime(1);
      expect(await settled).toBe("timeout");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("login sends no CMSG_WORLD_STATE_UI_TIMER_UPDATE", () => {
    const rig = areaRig("time");
    try {
      rig.stores.self.receive({ type: "login_verified", position: HOME });
      expect(uiRequests(rig.sent)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending query with the abort reason", async () => {
    const rig = areaRig("time");
    const pending = rig.handle.act.query();
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("dispose releases the login_verified subscription", () => {
    const off = jest.fn();
    const onEvent = jest.fn(() => off);
    const core = { self: { onEvent } } as unknown as CoreStores;
    const ctx = {} as AreaRuntimeCtx<TimeEvent>;
    const runtime = timeRuntime(ctx, new TimeStore(() => 0), core);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(off).not.toHaveBeenCalled();
    runtime.dispose();
    expect(off).toHaveBeenCalledTimes(1);
  });
});
