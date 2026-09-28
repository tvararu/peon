import { describe, expect, test } from "bun:test";
import { timeQueryResponseBody } from "#test-support/areas/time";
import {
  clientPrivateKey,
  clientSeed,
  FIXTURE_ACCOUNT,
  FIXTURE_CHARACTER,
  FIXTURE_PASSWORD,
  sessionKey,
} from "#test-support/fixtures";
import { startMockAuthServer } from "#test-support/mock-auth-server";
import { startMockWorldServer } from "#test-support/mock-world-server";
import type { AuthResult } from "#wow/auth";
import { authHandshake } from "#wow/auth";
import { worldSession } from "#wow/client";
import {
  ObjectType,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import type { QuestEvent } from "#wow/quests";

const base = {
  account: FIXTURE_ACCOUNT,
  password: FIXTURE_PASSWORD,
  character: FIXTURE_CHARACTER,
  srpPrivateKey: clientPrivateKey,
  clientSeed,
};

function fakeAuth(port: number): AuthResult {
  return {
    sessionKey,
    realmHost: "127.0.0.1",
    realmPort: port,
    realmId: 1,
  };
}

function observedObject(x: number, y: number, z: number): Uint8Array {
  const packet = new PacketWriter();
  packet.uint32LE(1);
  packet.uint8(UpdateType.CREATE_OBJECT);
  packet.packedGuid(0x99, 0);
  packet.uint8(ObjectType.GAMEOBJECT);
  packet.uint16LE(UpdateFlag.HAS_POSITION);
  packet.floatLE(x);
  packet.floatLE(y);
  packet.floatLE(z);
  packet.floatLE(0);
  packet.uint8(0);
  return packet.finish();
}

describe("session lifecycle", () => {
  test("full login flow: auth → world → character select → login", async () => {
    const worldServer = await startMockWorldServer();
    const authServer = await startMockAuthServer({
      realmAddress: `127.0.0.1:${worldServer.port}`,
    });
    try {
      const auth = await authHandshake({
        ...base,
        host: "127.0.0.1",
        port: authServer.port,
      });
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: worldServer.port },
        auth,
      );

      handle.close();
      await handle.closed;
    } finally {
      authServer.stop();
      worldServer.stop();
    }
  });

  test("rejects when world auth status is not 0x0c", async () => {
    const ws = await startMockWorldServer({ authStatus: 0x01 });
    try {
      await expect(
        worldSession(
          { ...base, host: "127.0.0.1", port: ws.port },
          fakeAuth(ws.port),
        ),
      ).rejects.toThrow("World auth failed: status 0x1");
    } finally {
      ws.stop();
    }
  });

  test("rejects with named message for system error (0x0d)", async () => {
    const ws = await startMockWorldServer({ authStatus: 0x0d });
    try {
      await expect(
        worldSession(
          { ...base, host: "127.0.0.1", port: ws.port },
          fakeAuth(ws.port),
        ),
      ).rejects.toThrow("World auth failed: system error");
    } finally {
      ws.stop();
    }
  });

  test("rejects with named message for account in use (0x15)", async () => {
    const ws = await startMockWorldServer({ authStatus: 0x15 });
    try {
      await expect(
        worldSession(
          { ...base, host: "127.0.0.1", port: ws.port },
          fakeAuth(ws.port),
        ),
      ).rejects.toThrow("World auth failed: account in use");
    } finally {
      ws.stop();
    }
  });

  test("rejects when character is not found", async () => {
    const ws = await startMockWorldServer();
    try {
      await expect(
        worldSession(
          {
            ...base,
            character: "Nonexistent",
            host: "127.0.0.1",
            port: ws.port,
          },
          fakeAuth(ws.port),
        ),
      ).rejects.toThrow('Character "Nonexistent" not found');
    } finally {
      ws.stop();
    }
  });

  test("ping interval fires and server handles CMSG_PING", async () => {
    const ws = await startMockWorldServer();
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: ws.port, pingIntervalMs: 1 },
        fakeAuth(ws.port),
      );
      await ws.waitForCapture((p) => p.opcode === GameOpcode.CMSG_PING);
      handle.close();
      await handle.closed;
    } finally {
      ws.stop();
    }
  });

  test("coalesced login verify stamps map on the self create", async () => {
    const worldServer = await startMockWorldServer({
      loginMapId: 530,
      coalesceSelfCreate: true,
    });
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: worldServer.port },
        fakeAuth(worldServer.port),
      );
      expect(handle.getControlState().pose?.mapId).toBe(530);
      const self = handle.getNearbyEntities().find((e) => e.guid === 0x42n);
      expect(self?.position?.mapId).toBe(530);
      handle.close();
      await handle.closed;
    } finally {
      worldServer.stop();
    }
  });

  test("manual reissue extends the same direction without stopping", async () => {
    const server = await startMockWorldServer({
      loginMapId: 530,
      coalesceSelfCreate: true,
    });
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: server.port },
        fakeAuth(server.port),
      );
      try {
        const events: string[] = [];
        handle.onControlEvent((event) => events.push(event.type));
        handle.move("forward", 1000);
        handle.move("forward", 1000);
        expect(events.filter((type) => type === "movement_started")).toEqual([
          "movement_started",
        ]);
        expect(events).not.toContain("movement_stopped");
        expect(handle.getControlState().moving).toBe(true);
      } finally {
        handle.close();
        await handle.closed;
      }
    } finally {
      server.stop();
    }
  });

  test("face-guid turns toward a currently observed object and refuses a lost GUID", async () => {
    const server = await startMockWorldServer({
      loginMapId: 530,
      coalesceSelfCreate: true,
    });
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: server.port },
        fakeAuth(server.port),
      );
      try {
        const appeared = Promise.withResolvers<void>();
        handle.onEntityEvent((event) => {
          if (event.type === "appear" && event.entity.guid === 0x99n)
            appeared.resolve();
        });
        server.inject(GameOpcode.SMSG_UPDATE_OBJECT, observedObject(1, 12, 3));
        await appeared.promise;
        handle.faceGuid(0x99n);
        expect(handle.getControlState().pose?.orientation).toBeCloseTo(
          Math.PI / 2,
          4,
        );
        expect(() => handle.faceGuid(0x123n)).toThrow("target_not_observed");
      } finally {
        handle.close();
        await handle.closed;
      }
    } finally {
      server.stop();
    }
  });

  test("turning and moving keep auto-attack running until halt", async () => {
    const server = await startMockWorldServer({
      loginMapId: 530,
      coalesceSelfCreate: true,
    });
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: server.port },
        fakeAuth(server.port),
      );
      try {
        const appeared = Promise.withResolvers<void>();
        handle.onEntityEvent((event) => {
          if (event.type === "appear" && event.entity.guid === 0x99n)
            appeared.resolve();
        });
        server.inject(GameOpcode.SMSG_UPDATE_OBJECT, observedObject(1, 12, 3));
        await appeared.promise;
        handle.attack(0x99n);
        handle.faceGuid(0x99n);
        handle.face(1);
        handle.move("forward", 1000);
        expect(handle.getCombatState().pendingAttack).toBe(0x99n);
        handle.halt();
        await server.waitForCapture(
          (p) => p.opcode === GameOpcode.CMSG_ATTACKSTOP,
        );
        const opcodes = server.captured.map((p) => p.opcode);
        expect(
          opcodes.filter((op) => op === GameOpcode.CMSG_ATTACKSTOP),
        ).toHaveLength(1);
        expect(opcodes.indexOf(GameOpcode.CMSG_ATTACKSTOP)).toBeGreaterThan(
          opcodes.lastIndexOf(GameOpcode.MSG_MOVE_SET_FACING),
        );
      } finally {
        handle.close();
        await handle.closed;
      }
    } finally {
      server.stop();
    }
  });

  test("world transfer invalidates quest authority before another self CREATE", async () => {
    const worldServer = await startMockWorldServer({
      coalesceSelfCreate: true,
    });
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: worldServer.port },
        fakeAuth(worldServer.port),
      );
      expect(handle.getQuestState().log.complete).toBe(true);
      const events: QuestEvent[] = [];
      handle.onQuestEvent((event) => events.push(event));
      const packet = new PacketWriter();
      packet.uint32LE(530);
      for (const value of [1, 2, 3, 0]) packet.floatLE(value);
      worldServer.inject(GameOpcode.SMSG_NEW_WORLD, packet.finish());
      await worldServer.waitForCapture(
        (p) => p.opcode === GameOpcode.MSG_MOVE_WORLDPORT_ACK,
      );
      expect(handle.getQuestState().log.complete).toBe(false);
      expect(
        events.some(
          (event) => event.type === "accepted" || event.type === "removed",
        ),
      ).toBe(false);
      handle.close();
      await handle.closed;
    } finally {
      worldServer.stop();
    }
  });

  test("login queries the time once and close rejects a pending query", async () => {
    const worldServer = await startMockWorldServer();
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: worldServer.port },
        fakeAuth(worldServer.port),
      );
      await worldServer.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_QUERY_TIME,
      );
      expect(
        worldServer.captured.filter(
          (p) => p.opcode === GameOpcode.CMSG_QUERY_TIME,
        ),
      ).toHaveLength(1);
      const areaEvents: string[] = [];
      const timeEvents: string[] = [];
      handle.onAreaEvent(({ event }) => areaEvents.push(event.type));
      handle.time.onEvent((event) => timeEvents.push(event.type));
      const answered = handle.time.act.query();
      worldServer.inject(
        GameOpcode.SMSG_QUERY_TIME_RESPONSE,
        timeQueryResponseBody({
          serverTime: 1_790_000_000,
          dailyResetInSec: 3600,
        }),
      );
      expect((await answered).dailyResetInSec).toBe(3600);
      const pending = handle.time.act.query();
      handle.close();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await handle.closed;
      expect(areaEvents).toEqual(["query_reply"]);
      expect(timeEvents).toEqual(["query_reply"]);
    } finally {
      worldServer.stop();
    }
  });
});
