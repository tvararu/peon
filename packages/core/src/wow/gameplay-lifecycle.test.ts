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
import { type WorldHandle, worldSession } from "#wow/client";
import { GameOpcode } from "#wow/protocol/opcodes";
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

describe("gameplay forced-close lifecycle", () => {
  test("server close silently retires an active mover and its timers", async () => {
    const send = jest.spyOn(worldHandlers, "sendPacket");
    let f: Fixture | undefined;
    try {
      jest.useFakeTimers();
      f = await fixture(21);
      f.handle.move("forward", 10_000);
      expect(f.handle.getControlState()).toMatchObject({
        moving: true,
        owner: "manual",
      });
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
      const duringClose = send.mock.calls.map(([, opcode]) => opcode);
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      expect(f.handle.getControlState()).toMatchObject({
        moving: false,
        owner: "none",
      });
      expect(duringClose).toEqual([]);
      expect(send.mock.calls.map(([, opcode]) => opcode)).toEqual([]);
    } finally {
      try {
        await disposeFixture(f);
      } finally {
        jest.useRealTimers();
        send.mockRestore();
      }
    }
  });
});
