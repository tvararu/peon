import { describe, expect, jest, test } from "bun:test";
import {
  clientPrivateKey,
  clientSeed,
  FIXTURE_ACCOUNT,
  FIXTURE_CHARACTER,
  FIXTURE_PASSWORD,
  sessionKey,
} from "#test-support/fixtures";
import { startMockWorldServer } from "#test-support/mock-world-server";
import { unitsPacket } from "#test-support/unit-packets";
import { writePackedGuid } from "#test-support/world-handlers-fixtures";
import { type WorldHandle, worldSession } from "#wow/client";
import type { NativeMap } from "#wow/navigation-native";
import { UpdateType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import * as worldHandlers from "#wow/world-handlers";

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const selfGuid = 0x42;
const targetGuid = 0x99;

type Fixture = {
  handle: WorldHandle;
  stop: () => void;
  inject: (opcode: number, body: Uint8Array) => void;
};

async function bounded<T>(pending: Promise<T>): Promise<T> {
  const timeout = Promise.withResolvers<never>();
  const timer = realSetTimeout(
    () => timeout.reject(new Error("gameplay_fixture_timeout")),
    2000,
  );
  try {
    return await Promise.race([pending, timeout.promise]);
  } finally {
    realClearTimeout(timer);
  }
}

async function disposeFixture(f: Fixture | undefined): Promise<void> {
  if (!f) return;
  try {
    f.handle.close();
  } finally {
    f.stop();
  }
  await bounded(f.handle.closed);
}

async function fixture(targetX: number): Promise<Fixture> {
  const server = await startMockWorldServer({ loginMapId: 530 });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    server.stop();
  };
  let handle: WorldHandle | undefined;
  try {
    handle = await bounded(
      worldSession(
        {
          account: FIXTURE_ACCOUNT,
          password: FIXTURE_PASSWORD,
          character: FIXTURE_CHARACTER,
          srpPrivateKey: clientPrivateKey,
          clientSeed,
          host: "127.0.0.1",
          port: server.port,
          navigation: { covers: () => true, open: () => openMap() },
          dbc: () => Promise.reject(new Error("fixture spells unread")),
        },
        {
          sessionKey,
          realmHost: "127.0.0.1",
          realmPort: server.port,
          realmId: 1,
        },
      ),
    );
    const ready = Promise.withResolvers<void>();
    handle.onMessage((message) => {
      if (message.message === "gameplay-lifecycle-ready") ready.resolve();
    });
    server.inject(
      GameOpcode.SMSG_UPDATE_OBJECT,
      unitsPacket(selfGuid, targetGuid, targetX),
    );
    handle.sendSay("gameplay-lifecycle-ready");
    await bounded(ready.promise);
    return {
      handle,
      stop,
      inject: (opcode, body) => server.inject(opcode, body),
    };
  } catch (error) {
    handle?.close();
    stop();
    throw error;
  }
}

function missingMap(): NativeMap {
  throw new Error("navigation library not found: fixture-native");
}

let openMap = missingMap;

function flatMap(): NativeMap {
  return {
    loadAdtAt() {},
    findHeights: () => [3],
    findHeight: () => 3,
    lineOfSight: () => true,
    findPath: (from, to) => [from, to],
    close() {},
  };
}

describe("gameplay forced-close lifecycle", () => {
  test("an out-of-range update for the navigated creature stops its route as target_lost", async () => {
    openMap = flatMap;
    let f: Fixture | undefined;
    try {
      f = await fixture(60);
      const handle = f.handle;
      const stopped = Promise.withResolvers<string | undefined>();
      handle.onControlEvent((event) => {
        if (event.type === "movement_stopped") stopped.resolve(event.reason);
      });
      handle.goTo({ guid: BigInt(targetGuid), kind: "guid" });
      expect(handle.getNavigationState()).toMatchObject({
        active: true,
        target: BigInt(targetGuid),
      });
      const outOfRange = new PacketWriter();
      outOfRange.uint32LE(1);
      outOfRange.uint8(UpdateType.OUT_OF_RANGE);
      outOfRange.uint32LE(1);
      writePackedGuid(outOfRange, BigInt(targetGuid));
      f.inject(GameOpcode.SMSG_UPDATE_OBJECT, outOfRange.finish());
      expect(await bounded(stopped.promise)).toBe("target_lost");
      expect(handle.getNavigationState()).toMatchObject({
        active: false,
        blockedReason: "target_lost",
        refusal: "stop",
      });
    } finally {
      try {
        await disposeFixture(f);
      } finally {
        openMap = missingMap;
      }
    }
  });
  test("server close silently retires an active route owner and its timers", async () => {
    openMap = flatMap;
    const send = jest.spyOn(worldHandlers, "sendPacket");
    let f: Fixture | undefined;
    try {
      jest.useFakeTimers();
      f = await fixture(21);
      f.handle.goTo({ kind: "point", x: 21, y: 2, z: 3 });
      expect(f.handle.getControlState()).toMatchObject({
        moving: true,
        owner: "manual",
      });
      expect(f.handle.getNavigationState().active).toBe(true);
      expect(
        send.mock.calls.some(
          ([, opcode]) => opcode === GameOpcode.MSG_MOVE_START_FORWARD,
        ),
      ).toBe(true);
      send.mockClear();
      send.mockImplementation(() => {});
      f.stop();
      await expect(bounded(f.handle.closed)).resolves.toBeUndefined();
      expect(f.handle.getControlState()).toMatchObject({
        moving: false,
        owner: "none",
      });
      expect(f.handle.getNavigationState().active).toBe(false);
      const duringClose = send.mock.calls.map(([, opcode]) => opcode);
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(f.handle.getControlState()).toMatchObject({
        moving: false,
        owner: "none",
      });
      expect(f.handle.getNavigationState().active).toBe(false);
      expect(duringClose).toEqual([]);
      expect(send.mock.calls.map(([, opcode]) => opcode)).toEqual([]);
    } finally {
      try {
        await disposeFixture(f);
      } finally {
        jest.useRealTimers();
        send.mockRestore();
        openMap = missingMap;
      }
    }
  });
});
