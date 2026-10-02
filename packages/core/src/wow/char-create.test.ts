import { describe, expect, spyOn, test } from "bun:test";
import {
  clientPrivateKey,
  clientSeed,
  FIXTURE_ACCOUNT,
  FIXTURE_PASSWORD,
  sessionKey,
} from "#test-support/fixtures";
import { startMockWorldServer } from "#test-support/mock-world-server";
import {
  buildCharCreate,
  type CharCreateSpec,
  charCreateResult,
  createCharacter,
} from "#wow/char-create";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const spec: CharCreateSpec = {
  class: 7,
  facialHair: 5,
  face: 2,
  gender: 0,
  hairColor: 4,
  hairStyle: 3,
  name: "Fabcdefghij",
  race: 2,
  skin: 1,
};
const AUTH = { realmHost: "127.0.0.1", realmId: 1, sessionKey };
function auth(port: number) {
  return { ...AUTH, realmPort: port };
}

function config(port: number) {
  return {
    account: FIXTURE_ACCOUNT,
    character: spec.name,
    clientSeed,
    host: "127.0.0.1",
    password: FIXTURE_PASSWORD,
    port,
    srpPrivateKey: clientPrivateKey,
  };
}

function trackLongTimers() {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const live: Record<number, unknown> = {};
  let next = 0;
  const set = spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: () => void,
    ms?: number,
  ) => {
    const key = next;
    next += 1;
    const id = realSet(() => {
      clear.mockClear();
      delete live[key];
      fn();
    }, ms);
    if ((ms ?? 0) >= 5000) live[key] = id;
    return id;
  }) as unknown as typeof setTimeout);
  const clear = spyOn(globalThis, "clearTimeout").mockImplementation(((
    id: unknown,
  ) => {
    for (const [key, value] of Object.entries(live))
      if (value === id) delete live[Number(key)];
    realClear(id as Timer);
  }) as unknown as typeof clearTimeout);
  return {
    pending: () => Object.keys(live).length,
    restore() {
      set.mockRestore();
      clear.mockRestore();
      for (const id of Object.values(live)) realClear(id as Timer);
    },
  };
}
describe("buildCharCreate", () => {
  test("writes the name cstring then nine bytes ending in outfit 0", () => {
    const body = buildCharCreate(spec);
    const reader = new PacketReader(body);
    expect(reader.cString()).toBe(spec.name);
    const fields = Array.from({ length: 9 }, () => reader.uint8());
    expect(fields).toEqual([2, 7, 0, 1, 2, 3, 4, 5, 0]);
    expect(body.byteLength).toBe(spec.name.length + 1 + 9);
  });
});

describe("charCreateResult", () => {
  test.each([
    [0x2f, "success"],
    [0x30, "error"],
    [0x31, "failed"],
    [0x32, "name_in_use"],
    [0x33, "disabled"],
    [0x35, "server_limit"],
    [0x36, "account_limit"],
    [0x39, "expansion"],
    [0x3a, "expansion_class"],
    [0x3b, "level_requirement"],
    [0x3c, "unique_class_limit"],
    [0x3e, "restricted_raceclass"],
    [0x7f, "code_0x7f"],
  ])("code 0x%x is %s", (code, name) => {
    expect(charCreateResult(code)).toBe(name);
  });
});

describe("createCharacter", () => {
  test("sends the create request, resolves on success and never logs in", async () => {
    const server = await startMockWorldServer();
    try {
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
      );
      const sent = await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      expect(Array.from(sent.body)).toEqual(Array.from(buildCharCreate(spec)));
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x2f]));
      await expect(done).resolves.toEqual({ result: "success" });
      expect(
        server.captured.some((p) => p.opcode === GameOpcode.CMSG_PLAYER_LOGIN),
      ).toBe(false);
    } finally {
      server.stop();
    }
  });
  test("retains the create request and reply through the trace sink", async () => {
    const server = await startMockWorldServer();
    try {
      const rows: { dir: string; opcode: number; body?: string }[] = [];
      const done = createCharacter(
        {
          ...config(server.port),
          trace: { bodies: true, row: (row) => rows.push(row) },
        },
        auth(server.port),
        spec,
      );
      done.catch(() => {});
      await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x31]));
      await expect(done).rejects.toThrow("failed");
      const sent = rows.find(
        (row) =>
          row.dir === "out" && row.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      expect(sent?.body).toBe(
        Buffer.from(buildCharCreate(spec)).toString("hex"),
      );
      const reply = rows.find(
        (row) => row.dir === "in" && row.opcode === GameOpcode.SMSG_CHAR_CREATE,
      );
      expect(reply?.body).toBe("31");
    } finally {
      server.stop();
    }
  });

  test("rejects with the reason name for any other code", async () => {
    const server = await startMockWorldServer();
    try {
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
      );
      done.catch(() => {});
      await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x3b]));
      await expect(done).rejects.toThrow("level_requirement");
      await expect(done).rejects.toThrow("0x3b");
    } finally {
      server.stop();
    }
  });

  test("rejects when the reply never comes", async () => {
    const server = await startMockWorldServer();
    try {
      await expect(
        createCharacter(config(server.port), auth(server.port), spec, 30),
      ).rejects.toThrow("Timed out");
    } finally {
      server.stop();
    }
  });

  test("rejects when world admission fails", async () => {
    const server = await startMockWorldServer({ authStatus: 0x0d });
    try {
      await expect(
        createCharacter(config(server.port), auth(server.port), spec),
      ).rejects.toThrow("World auth failed");
    } finally {
      server.stop();
    }
  });

  test("settles only after the connection reports its close", async () => {
    const realConnect = Bun.connect;
    const events: string[] = [];
    const openHook = spyOn(Bun, "connect").mockImplementation(((
      options: unknown,
    ) => {
      const opts = options as {
        socket: Record<string, unknown> & { close: () => void };
      };
      const wrapped = {
        ...opts.socket,
        close() {
          events.push("close");
          opts.socket.close();
        },
      };
      return realConnect({
        ...(options as object),
        socket: wrapped,
      } as unknown as Parameters<typeof Bun.connect>[0]);
    }) as unknown as typeof Bun.connect);
    const server = await startMockWorldServer();
    try {
      let outcome = "";
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
      ).then((result) => {
        outcome = result.result;
      });
      await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x2f]));
      await done;
      expect(outcome).toBe("success");
      expect(events).toEqual(["close"]);
    } finally {
      openHook.mockRestore();
      server.stop();
    }
  });

  test("a failure result is recorded before the close settles it", async () => {
    const server = await startMockWorldServer();
    try {
      const order: string[] = [];
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
      );
      done.then(
        () => order.push("resolved"),
        () => order.push("rejected"),
      );
      await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x32]));
      await expect(done).rejects.toThrow("name_in_use");
      expect(order).toEqual(["rejected"]);
    } finally {
      server.stop();
    }
  });

  test("a disconnect while the create reply is pending releases its wait", async () => {
    const timers = trackLongTimers();
    const server = await startMockWorldServer();
    try {
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
        20_000,
      );
      done.catch(() => {});
      await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      expect(timers.pending()).toBeGreaterThan(0);
      server.stop();
      await expect(done).rejects.toThrow("closed");
      expect(timers.pending()).toBe(0);
    } finally {
      timers.restore();
      server.stop();
    }
  });

  test("a disconnect during world authentication releases its wait", async () => {
    const timers = trackLongTimers();
    const listener = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data() {},
        open(socket) {
          socket.end();
        },
      },
    });
    try {
      await expect(
        createCharacter(
          config(listener.port),
          auth(listener.port),
          spec,
          20_000,
        ),
      ).rejects.toThrow("closed");
      expect(timers.pending()).toBe(0);
    } finally {
      timers.restore();
      listener.stop(true);
    }
  });
});
