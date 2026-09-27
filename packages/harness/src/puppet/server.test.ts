import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { WorldHandle } from "@tuicraft/core";
import { worldSession } from "@tuicraft/core/session";
import { GameOpcode } from "@tuicraft/core/test-support/internals";
import { startMockWorldServer } from "@tuicraft/core/test-support/mock-world-server";
import {
  base,
  fakeAuth,
  waitForEchoProbe,
} from "@tuicraft/core/test-support/world-handlers-fixtures";
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

async function ask(paths: PuppetPaths, request: PuppetRequest) {
  const reply = await sendRequest(paths.socket, request);
  if (!reply.ok) throw new Error(reply.error);
  return reply.out;
}

const LONG_ROOT =
  "/home/deity/orca/workspaces/tuicraft/pi-harness-eval-worktree/tmp/factory-account-FAC0123456789/runtime";

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
    const { handle, paths, server } = await setup({ logoutWaitMs: 50 });
    expect(await ask(paths, { cmd: "stop" })).toContain("0.05 s");
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
