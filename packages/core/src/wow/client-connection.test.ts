import { describe, expect, jest, test } from "bun:test";
import type { Socket } from "bun";
import {
  loginAuthQueueBody,
  loginAuthQueueFirstBody,
  loginCharacterLoginFailedBody,
} from "#test-support/areas/login";
import {
  clientSeed,
  FIXTURE_ACCOUNT,
  FIXTURE_CHARACTER,
  FIXTURE_PASSWORD,
  sessionKey,
} from "#test-support/fixtures";
import { LoginStore } from "#wow/areas/login/store";
import {
  authenticateWorld,
  createWorldConn,
  selectCharacter,
  startPingLoop,
} from "#wow/client-connection";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { SelfStore } from "#wow/self-store";

const HEADER = 6;

function capturingConn() {
  const conn = createWorldConn();
  const frames: Uint8Array[] = [];
  conn.socket = {
    write: (bytes: Uint8Array) => frames.push(bytes),
  } as unknown as Socket;
  const pings = () =>
    frames
      .filter(
        (f) =>
          new DataView(f.buffer, f.byteOffset).getUint32(2, true) ===
          GameOpcode.CMSG_PING,
      )
      .map((f) => {
        const r = new PacketReader(f.subarray(HEADER));
        const seq = r.uint32LE();
        return { latencyMs: r.uint32LE(), seq };
      });
  const wrote = (opcode: number) =>
    frames.some(
      (f) => new DataView(f.buffer, f.byteOffset).getUint32(2, true) === opcode,
    );
  return { conn, pings, wrote };
}

const CONFIG = {
  account: FIXTURE_ACCOUNT,
  character: FIXTURE_CHARACTER,
  clientSeed,
  host: "127.0.0.1",
  password: FIXTURE_PASSWORD,
  port: 0,
};
const AUTH = { realmHost: "127.0.0.1", realmId: 1, realmPort: 0, sessionKey };

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function feed(
  conn: ReturnType<typeof createWorldConn>,
  opcode: number,
  body: Uint8Array,
): void {
  conn.dispatch.handle(opcode, new PacketReader(body));
}

function outcome(promise: Promise<void>) {
  const state: { value: string } = { value: "pending" };
  promise.then(
    () => {
      state.value = "resolved";
    },
    (error: Error) => {
      state.value = error.message;
    },
  );
  return state;
}

async function authenticating() {
  const rig = capturingConn();
  const state = outcome(authenticateWorld(rig.conn, CONFIG, AUTH));
  feed(rig.conn, GameOpcode.SMSG_AUTH_CHALLENGE, new Uint8Array(8));
  await flush();
  return { ...rig, state };
}

function charEnumBody(name: string): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.uint32LE(0x42);
  w.uint32LE(0);
  w.cString(name);
  w.rawBytes(new Uint8Array(3 + 4 + 1 + 1));
  w.rawBytes(new Uint8Array(4 + 4 + 12 + 4 + 4 + 4 + 1 + 12));
  w.rawBytes(new Uint8Array(23 * 9));
  return w.finish();
}

describe("startPingLoop", () => {
  test("writes CMSG_PING with sequences 1 and 2, the second carrying the round trip", () => {
    jest.useFakeTimers();
    const { conn, pings } = capturingConn();
    const login = new LoginStore(() => Date.now());
    const timer = startPingLoop(conn, login, { pingIntervalMs: 100 });
    try {
      jest.advanceTimersByTime(100);
      jest.advanceTimersByTime(25);
      login.receivePong({ seq: 1 });
      jest.advanceTimersByTime(75);
      expect(pings()).toEqual([
        { latencyMs: 0, seq: 1 },
        { latencyMs: 25, seq: 2 },
      ]);
    } finally {
      clearInterval(timer);
      jest.useRealTimers();
    }
  });
});

describe("authenticateWorld", () => {
  test("waits through the queue and resolves on AUTH_OK (WorldSessionMgr.cpp:258, WorldSession.cpp:979-995)", async () => {
    const { conn, state, wrote } = await authenticating();
    expect(wrote(GameOpcode.CMSG_AUTH_SESSION)).toBe(true);
    feed(
      conn,
      GameOpcode.SMSG_AUTH_RESPONSE,
      loginAuthQueueFirstBody({ position: 3 }),
    );
    await flush();
    expect(state.value).toBe("pending");
    feed(
      conn,
      GameOpcode.SMSG_AUTH_RESPONSE,
      loginAuthQueueBody({ position: 1 }),
    );
    await flush();
    expect(state.value).toBe("pending");
    feed(conn, GameOpcode.SMSG_AUTH_RESPONSE, new Uint8Array([0x0c]));
    await flush();
    expect(state.value).toBe("resolved");
  });

  test("gives up on the queue after 10 minutes naming the position", async () => {
    jest.useFakeTimers();
    try {
      const { conn, state } = await authenticating();
      feed(
        conn,
        GameOpcode.SMSG_AUTH_RESPONSE,
        loginAuthQueueFirstBody({ position: 7 }),
      );
      await flush();
      jest.advanceTimersByTime(599_999);
      await flush();
      expect(state.value).toBe("pending");
      jest.advanceTimersByTime(1);
      await flush();
      expect(state.value).toBe(
        "World auth failed: still queued at position 7 after 600 s",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("names the refusal from SharedDefines.h:3584-3601", async () => {
    const { conn, state } = await authenticating();
    feed(conn, GameOpcode.SMSG_AUTH_RESPONSE, new Uint8Array([0x1d]));
    await flush();
    expect(state.value).toBe("World auth failed: already online");
  });
});

describe("selectCharacter", () => {
  test("fails at once with the server's reason on SMSG_CHARACTER_LOGIN_FAILED (CharacterHandler.cpp:2622-2627)", async () => {
    const { conn, wrote } = capturingConn();
    const state = outcome(
      selectCharacter(conn, { self: new SelfStore() }, CONFIG),
    );
    await flush();
    feed(conn, GameOpcode.SMSG_CHAR_ENUM, charEnumBody(FIXTURE_CHARACTER));
    await flush();
    expect(wrote(GameOpcode.CMSG_PLAYER_LOGIN)).toBe(true);
    expect(state.value).toBe("pending");
    feed(
      conn,
      GameOpcode.SMSG_CHARACTER_LOGIN_FAILED,
      loginCharacterLoginFailedBody({ code: 1 }),
    );
    await flush();
    expect(state.value).toBe("Character login failed: no world");
  });
});
