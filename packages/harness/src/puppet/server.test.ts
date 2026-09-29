import { afterEach, describe, expect, jest, type Mock, test } from "bun:test";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { WorldHandle } from "@peon/core";
import { worldSession } from "@peon/core/session";
import { GameOpcode } from "@peon/core/test-support/internals";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { startMockWorldServer } from "@peon/core/test-support/mock-world-server";
import {
  base,
  fakeAuth,
  waitForEchoProbe,
} from "@peon/core/test-support/world-handlers-fixtures";
import {
  PuppetNotRunning,
  type PuppetPaths,
  type PuppetRequest,
  puppetPaths,
  sendRequest,
} from "#harness/puppet/protocol";
import {
  listenPuppet,
  type PuppetServer,
  type PuppetServerInit,
} from "#harness/puppet/server";

type World = Awaited<ReturnType<typeof startMockWorldServer>>;
type Setup = {
  ws: World;
  handle: WorldHandle;
  paths: PuppetPaths;
  server: PuppetServer;
};

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup(
  init: Partial<Omit<PuppetServerInit, "handle" | "paths">> = {},
  nested = "",
): Promise<Setup> {
  const dir = await mkdtemp(`${tmpdir()}/puppet-`);
  const paths = puppetPaths({ XDG_RUNTIME_DIR: `${dir}${nested}` });
  await mkdir(paths.runtimeDir, { recursive: true });
  const ws = await startMockWorldServer({ coalesceSelfCreate: true });
  const handle = await worldSession(
    { ...base, host: "127.0.0.1", port: ws.port },
    fakeAuth(ws.port),
  );
  cleanups.push(() => rm(dir, { force: true, recursive: true }));
  cleanups.push(() => ws.stop());
  cleanups.push(async () => {
    handle.close();
    await handle.closed;
  });
  await waitForEchoProbe(handle);
  const server = await listenPuppet({ handle, paths, ...init });
  return { handle, paths, server, ws };
}

async function mockSetup(
  init: Partial<Omit<PuppetServerInit, "handle" | "paths">> = {},
): Promise<{
  handle: MockHandle;
  paths: PuppetPaths;
}> {
  const dir = await mkdtemp(`${tmpdir()}/puppet-`);
  const paths = puppetPaths({ XDG_RUNTIME_DIR: dir });
  await mkdir(paths.runtimeDir, { recursive: true });
  const handle = createMockHandle();
  cleanups.push(() => rm(dir, { force: true, recursive: true }));
  const server = await listenPuppet({ handle, paths, ...init });
  cleanups.push(() => server.stop());
  return { handle, paths };
}

async function ask(paths: PuppetPaths, request: PuppetRequest) {
  const reply = await sendRequest(paths.socket, request);
  if (!reply.ok) throw new Error(reply.error);
  return reply.out;
}

const LONG_ROOT =
  "/home/deity/orca/workspaces/peon/pi-harness-eval-worktree/tmp/factory-account-FAC0123456789/runtime";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function completeLogout(ws: World): void {
  ws.waitForCapture((p) => p.opcode === GameOpcode.CMSG_LOGOUT_REQUEST)
    .then(() => ws.inject(GameOpcode.SMSG_LOGOUT_COMPLETE, new Uint8Array(0)))
    .catch(() => undefined);
}

describe("puppet server over the socket", () => {
  test("writes its pid beside the socket", async () => {
    const { paths } = await setup();
    expect(await Bun.file(paths.pid).text()).toBe(`${process.pid}\n`);
    expect(await ask(paths, { cmd: "status" })).toBe("");
  });

  test("binds and answers when the socket path is longer than a Unix socket address allows", async () => {
    const { paths, server, ws } = await setup({}, LONG_ROOT);
    expect(paths.socket.length).toBeGreaterThan(108);
    expect(await exists(paths.socket)).toBe(true);
    expect(await ask(paths, { cmd: "status" })).toBe("");
    completeLogout(ws);
    await ask(paths, { cmd: "stop" });
    await server.done;
    expect(await exists(paths.socket)).toBe(false);
  });

  test("send whispers, and read drains the chat since the last read in the CLI's shape", async () => {
    const { handle, paths } = await setup();
    await ask(paths, { cmd: "read" });
    const echoed = new Promise<void>((resolve) => {
      handle.onMessage((msg) => {
        if (msg.message === "hey, what level are you?") resolve();
      });
    });
    expect(
      await ask(paths, {
        cmd: "whisper",
        target: "Fevala",
        text: "hey, what level are you?",
      }),
    ).toBe("OK");
    await echoed;
    expect(await ask(paths, { cmd: "read" })).toBe(
      '{"command":"read","data":null,"error":null,"events":[{"message":"hey, what level are you?","sender":"Testchar","type":"WHISPER_FROM"}],"kind":"events"}',
    );
    expect(await ask(paths, { cmd: "read" })).toBe(
      '{"command":"read","data":null,"error":null,"events":[],"kind":"events"}',
    );
  });

  test("read keeps only the newest chat events once the buffer is full", async () => {
    const { handle, paths } = await setup({ chatCapacity: 2 });
    await ask(paths, { cmd: "read" });
    for (const word of ["one", "two", "three"]) {
      const echoed = new Promise<void>((resolve) => {
        handle.onMessage((msg) => {
          if (msg.message === word) resolve();
        });
      });
      handle.sendSay(word);
      await echoed;
    }
    const reply = JSON.parse(await ask(paths, { cmd: "read" }));
    expect(reply.events.map((e: { message: string }) => e.message)).toEqual([
      "two",
      "three",
    ]);
  });

  test("nearby prints the core nearby rows with the CLI's row fields", async () => {
    const { paths } = await setup();
    const reply = JSON.parse(await ask(paths, { cmd: "nearby" }));
    expect(reply).toMatchObject({
      command: "nearby",
      error: null,
      events: [],
      kind: "result",
    });
    expect(reply.data).toHaveLength(1);
    expect(reply.data[0]).toMatchObject({
      distance: 0,
      name: "Testchar",
      self: true,
      type: "player",
    });
    expect(Object.keys(reply.data[0])).toEqual([
      "bearingRadians",
      "distance",
      "entry",
      "guid",
      "horizontalDistance",
      "name",
      "originSource",
      "originUpdatedAt",
      "self",
      "turnRadians",
      "type",
      "level",
      "health",
      "maxHealth",
      "target",
      "unitFlags",
      "npcFlags",
      "factionTemplate",
      "mapId",
      "orientation",
      "positionAgeMs",
      "positionKind",
      "positionObservedAt",
      "positionSource",
      "x",
      "y",
      "z",
    ]);
  });

  test("stop logs out, waits for the server, then removes the socket and pid", async () => {
    const { paths, server, ws } = await setup();
    completeLogout(ws);
    expect(await ask(paths, { cmd: "stop" })).toBe("Logged out.");
    await server.done;
    expect(await exists(paths.socket)).toBe(false);
    expect(await exists(paths.pid)).toBe(false);
    await expect(sendRequest(paths.socket, { cmd: "read" })).rejects.toThrow(
      PuppetNotRunning,
    );
  });

  test("stop closes the socket when the server does not finish the logout in time", async () => {
    const { handle, paths, server } = await setup({ logoutWaitMs: 1 });
    expect(await ask(paths, { cmd: "stop" })).toContain("0.001 s");
    await handle.closed;
    await server.done;
    expect(await exists(paths.socket)).toBe(false);
  });

  test("a lost connection ends the puppet and removes its socket", async () => {
    const { paths, server, ws } = await setup();
    ws.stop();
    await server.done;
    expect(await exists(paths.socket)).toBe(false);
  });
});

describe("puppet call", () => {
  test("calls the handle method with the decoded arguments and names it", async () => {
    const { handle, paths } = await mockSetup();
    expect(
      await ask(paths, { args: ["Fabc"], cmd: "call", method: "invite" }),
    ).toBe(
      '{"command":"call","data":{"method":"invite"},"error":null,"events":[],"kind":"result"}',
    );
    expect(handle.invite).toHaveBeenCalledWith("Fabc");
  });

  test("passes a guid argument to the handle as a bigint", async () => {
    const { handle, paths } = await mockSetup();
    await ask(paths, { args: ["42"], cmd: "call", method: "selectTarget" });
    expect(handle.selectTarget).toHaveBeenCalledWith(42n);
  });

  test("refuses a method outside the allow-list without calling anything", async () => {
    const { handle, paths } = await mockSetup();
    const reply = await sendRequest(paths.socket, {
      args: [],
      cmd: "call",
      method: "logout",
    });
    expect(reply.ok).toBe(false);
    expect(handle.logout).not.toHaveBeenCalled();
  });

  test("a method that throws replies ok: false with its message", async () => {
    const { handle, paths } = await mockSetup();
    (handle.invite as Mock<(name: string) => void>).mockImplementation(() => {
      throw new Error("Not in the world.");
    });
    expect(
      await sendRequest(paths.socket, {
        args: ["Fabc"],
        cmd: "call",
        method: "invite",
      }),
    ).toEqual({ error: "Not in the world.", ok: false });
  });

  test.each<[string, unknown, string]>([
    ["refused", { reason: "busy", status: "refused" }, "refused: busy"],
    ["no_answer", { status: "no_answer" }, "no_answer"],
  ])(
    "an outcome with status %s replies ok: false naming it",
    async (_, outcome, error) => {
      const { handle, paths } = await mockSetup();
      const invite = handle.invite as unknown as Mock<
        (name: string) => Promise<unknown>
      >;
      invite.mockResolvedValue(outcome);
      expect(
        await sendRequest(paths.socket, {
          args: ["Fabc"],
          cmd: "call",
          method: "invite",
        }),
      ).toEqual({ error, ok: false });
    },
  );

  test("a rejected call replies ok: false with its message", async () => {
    const { handle, paths } = await mockSetup();
    const invite = handle.invite as unknown as Mock<
      (name: string) => Promise<unknown>
    >;
    invite.mockRejectedValue(new Error("Not in the world."));
    expect(
      await sendRequest(paths.socket, {
        args: ["Fabc"],
        cmd: "call",
        method: "invite",
      }),
    ).toEqual({ error: "Not in the world.", ok: false });
  });

  test.each<unknown>([{ status: "ok" }, { status: "done" }, { locks: [] }])(
    "an outcome %p replies ok: true",
    async (outcome) => {
      const { handle, paths } = await mockSetup();
      const invite = handle.invite as unknown as Mock<
        (name: string) => Promise<unknown>
      >;
      invite.mockResolvedValue(outcome);
      const reply = await sendRequest(paths.socket, {
        args: ["Fabc"],
        cmd: "call",
        method: "invite",
      });
      expect(reply.ok).toBe(true);
    },
  );

  test("a call during logout replies that the puppet is stopping", async () => {
    const { paths, server, ws } = await setup();
    const stopping = ask(paths, { cmd: "stop" });
    await ws.waitForCapture((p) => p.opcode === GameOpcode.CMSG_LOGOUT_REQUEST);
    expect(
      await sendRequest(paths.socket, {
        args: ["Fabc"],
        cmd: "call",
        method: "invite",
      }),
    ).toEqual({ error: "The puppet is stopping.", ok: false });
    ws.inject(GameOpcode.SMSG_LOGOUT_COMPLETE, new Uint8Array(0));
    expect(await stopping).toBe("Logged out.");
    await server.done;
  });
});

type EventRow = { at: number; hook: string; event: unknown };

async function drain(paths: PuppetPaths): Promise<EventRow[]> {
  return JSON.parse(await ask(paths, { cmd: "events" })).events;
}

function emitPacketError(handle: MockHandle, opcode: number, error: Error) {
  const subscribe = handle.onPacketError as Mock<MockHandle["onPacketError"]>;
  for (const [cb] of subscribe.mock.calls) cb(opcode, error);
}

function emitArea(handle: MockHandle, area: string, event: object): void {
  const trigger = handle.triggerAreaEvent as (
    area: string,
    event: object,
  ) => void;
  trigger(area, event);
}

describe("puppet events", () => {
  test("drains group, notice and packet error events in arrival order with their hooks", async () => {
    const { handle, paths } = await mockSetup();
    const before = Date.now();
    handle.triggerGroupEvent({ from: "Fabc", type: "invite_received" });
    handle.triggerNotice({
      at: 5,
      label: "SMSG_X",
      opcode: 291,
      text: "not handled",
      type: "not_implemented",
    });
    emitPacketError(handle, 502, new Error("short packet"));
    handle.triggerDuelEvent({ challenger: "Fabc", type: "duel_requested" });
    handle.triggerGuildEvent({ name: "Fabc", type: "joined" });
    const rows = await drain(paths);
    expect(rows.map(({ hook, event }) => ({ event, hook }))).toEqual([
      { event: { from: "Fabc", type: "invite_received" }, hook: "group" },
      {
        event: {
          at: 5,
          label: "SMSG_X",
          opcode: 291,
          text: "not handled",
          type: "not_implemented",
        },
        hook: "notice",
      },
      { event: { error: "short packet", opcode: 502 }, hook: "packetError" },
      { event: { challenger: "Fabc", type: "duel_requested" }, hook: "duel" },
      { event: { name: "Fabc", type: "joined" }, hook: "guild" },
    ]);
    for (const row of rows) expect(row.at).toBeGreaterThanOrEqual(before);
    expect(await ask(paths, { cmd: "events" })).toBe(
      '{"command":"events","data":null,"error":null,"events":[],"kind":"events"}',
    );
  });

  test("keeps only the newest rows once the buffer is full", async () => {
    const { handle, paths } = await mockSetup({ chatCapacity: 2 });
    for (const name of ["one", "two", "three"])
      handle.triggerGroupEvent({ name, type: "leader_changed" });
    const rows = await drain(paths);
    expect(rows.map(({ event }) => event)).toEqual([
      { name: "two", type: "leader_changed" },
      { name: "three", type: "leader_changed" },
    ]);
  });

  test("an area event keeps its area and prints a bigint guid as a decimal string", async () => {
    const { handle, paths } = await mockSetup();
    emitArea(handle, "alpha", { guid: 0x0700000000000123n, type: "ticked" });
    const rows = await drain(paths);
    expect(rows.map(({ hook, event }) => ({ event, hook }))).toEqual([
      {
        event: {
          area: "alpha",
          event: { guid: "504403158265495843", type: "ticked" },
        },
        hook: "area",
      },
    ]);
  });

  test("events leaves the chat buffer to read", async () => {
    const { handle, paths } = await mockSetup();
    handle.triggerMessage({ message: "hi", sender: "Fabc", type: 1 });
    handle.triggerGroupEvent({ type: "kicked" });
    expect((await drain(paths)).map(({ hook }) => hook)).toEqual(["group"]);
    const read = JSON.parse(await ask(paths, { cmd: "read" }));
    expect(read.events).toHaveLength(1);
  });
});

describe("puppet raw", () => {
  test("sends the opcode and the body bytes through the trace's sender", async () => {
    const send = jest.fn();
    const { paths } = await mockSetup({ send });
    expect(
      await ask(paths, {
        body: "0100000000000000",
        cmd: "raw",
        opcode: GameOpcode.CMSG_PING,
      }),
    ).toBe(
      '{"command":"raw","data":{"opcode":"CMSG_PING","size":8},"error":null,"events":[],"kind":"result"}',
    );
    expect(send).toHaveBeenCalledWith(
      GameOpcode.CMSG_PING,
      new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
    );
  });

  test("an empty body sends zero bytes", async () => {
    const send = jest.fn();
    const { paths } = await mockSetup({ send });
    const out = JSON.parse(
      await ask(paths, {
        body: "",
        cmd: "raw",
        opcode: GameOpcode.MSG_RAID_READY_CHECK,
      }),
    );
    expect(out.data).toEqual({ opcode: "MSG_RAID_READY_CHECK", size: 0 });
    expect(send).toHaveBeenCalledWith(
      GameOpcode.MSG_RAID_READY_CHECK,
      new Uint8Array(0),
    );
  });

  test("refuses raw when the puppet has no packet trace", async () => {
    const { paths } = await mockSetup();
    expect(
      await sendRequest(paths.socket, {
        body: "",
        cmd: "raw",
        opcode: GameOpcode.CMSG_PING,
      }),
    ).toEqual({
      error: "Start the puppet with --packet-trace to send raw packets.",
      ok: false,
    });
  });

  test("replies the sender's failure", async () => {
    const send = jest.fn(() => {
      throw new Error("the session gave the puppet no packet sender.");
    });
    const { paths } = await mockSetup({ send });
    expect(
      await sendRequest(paths.socket, {
        body: "",
        cmd: "raw",
        opcode: GameOpcode.CMSG_PING,
      }),
    ).toEqual({
      error: "the session gave the puppet no packet sender.",
      ok: false,
    });
  });
});
