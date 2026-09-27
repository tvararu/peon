import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  decodeReply,
  decodeRequest,
  encodeLine,
  PuppetNotRunning,
  puppetPaths,
  sendRequest,
} from "#harness/puppet/protocol";
import { staleSocket } from "#test-support/puppet-fixtures";

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { force: true, recursive: true });
  dir = undefined;
});

async function tempDir(): Promise<string> {
  dir = await mkdtemp(`${tmpdir()}/puppet-protocol-`);
  return dir;
}

describe("puppetPaths", () => {
  test("puts the socket and pid in the account's runtime dir", () => {
    expect(
      puppetPaths({
        XDG_CONFIG_HOME: "/acc/config",
        XDG_RUNTIME_DIR: "/acc/runtime",
      }),
    ).toEqual({
      configPath: "/acc/config/tuicraft/config.toml",
      pid: "/acc/runtime/tuicraft/puppet.pid",
      runtimeDir: "/acc/runtime/tuicraft",
      socket: "/acc/runtime/tuicraft/puppet.sock",
    });
  });
});

describe("request and reply lines", () => {
  test("a request survives its line", () => {
    const request = { cmd: "whisper", target: "Fevala", text: "hi" } as const;
    expect(decodeRequest(encodeLine(request).trimEnd())).toEqual(request);
  });

  test.each([
    "not json",
    "[]",
    '{"cmd":"walk"}',
    '{"cmd":"whisper","target":"Fevala"}',
  ])("refuses the request %p", (line) => {
    expect(decodeRequest(line)).toBeUndefined();
  });

  test("reads ok and error replies and refuses anything else", () => {
    expect(decodeReply('{"ok":true,"out":"OK"}')).toEqual({
      ok: true,
      out: "OK",
    });
    expect(decodeReply('{"ok":false,"error":"stopping"}')).toEqual({
      error: "stopping",
      ok: false,
    });
    expect(() => decodeReply('{"ok":true}')).toThrow("unreadable reply");
  });
});

describe("sendRequest", () => {
  test("sends one line and returns the reply line", async () => {
    const socket = `${await tempDir()}/s.sock`;
    const seen: string[] = [];
    const listener = Bun.listen({
      socket: {
        data(client, data) {
          seen.push(data.toString());
          client.write(encodeLine({ ok: true, out: "OK" }));
        },
      },
      unix: socket,
    });
    try {
      expect(await sendRequest(socket, { cmd: "read" })).toEqual({
        ok: true,
        out: "OK",
      });
      expect(seen).toEqual(['{"cmd":"read"}\n']);
    } finally {
      listener.stop(true);
    }
  });

  test("names a missing puppet when there is no socket", async () => {
    const socket = `${await tempDir()}/missing.sock`;
    await expect(sendRequest(socket, { cmd: "read" })).rejects.toThrow(
      PuppetNotRunning,
    );
  });

  test("names a missing puppet when the socket is stale", async () => {
    const socket = `${await tempDir()}/stale.sock`;
    await staleSocket(socket);
    await expect(sendRequest(socket, { cmd: "read" })).rejects.toThrow(
      PuppetNotRunning,
    );
  });
});
