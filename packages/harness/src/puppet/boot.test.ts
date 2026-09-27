import { afterEach, describe, expect, jest, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { ClientConfig } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { bootPuppet } from "#harness/puppet/boot";
import {
  type PuppetPaths,
  puppetPaths,
  sendRequest,
} from "#harness/puppet/protocol";
import type { PuppetServer } from "#harness/puppet/server";
import { staleSocket, writeAccountConfig } from "#test-support/puppet-fixtures";

const servers: PuppetServer[] = [];
let dir: string;

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  await rm(dir, { force: true, recursive: true });
});

async function account(
  accountName: string,
  character: string,
): Promise<PuppetPaths> {
  dir = await mkdtemp(`${tmpdir()}/puppet-boot-`);
  const paths = puppetPaths({
    XDG_CONFIG_HOME: `${dir}/config`,
    XDG_RUNTIME_DIR: `${dir}/runtime`,
  });
  await writeAccountConfig(paths.configPath, {
    account: accountName,
    character,
  });
  return paths;
}

function login() {
  return jest.fn(async (_config: ClientConfig) => createMockHandle());
}

async function boot(paths: PuppetPaths, fn = login()): Promise<PuppetServer> {
  const server = await bootPuppet({ login: fn, paths });
  servers.push(server);
  return server;
}

describe("bootPuppet", () => {
  test("logs in the character of the account's config.toml and listens", async () => {
    const paths = await account("FAC0123456789", "Fgklgoafpfk");
    const fn = login();
    await boot(paths, fn);
    expect(fn.mock.calls[0]?.[0]).toMatchObject({
      account: "FAC0123456789",
      character: "Fgklgoafpfk",
      host: "127.0.0.1",
    });
    expect(await sendRequest(paths.socket, { cmd: "status" })).toEqual({
      ok: true,
      out: "",
    });
  });

  test.each([
    ["ADMIN", "Fgklgoafpfk", "protected_account"],
    ["rndbot12", "Fgklgoafpfk", "protected_account"],
    ["FAC0123456789", "xiara", "protected_character"],
  ])("refuses %s/%s without logging in", async (name, character, code) => {
    const paths = await account(name, character);
    const fn = login();
    await expect(bootPuppet({ login: fn, paths })).rejects.toMatchObject({
      code,
    });
    expect(fn).not.toHaveBeenCalled();
  });

  test("refuses when the account has no config.toml", async () => {
    dir = await mkdtemp(`${tmpdir()}/puppet-boot-`);
    const fn = login();
    await expect(
      bootPuppet({ login: fn, paths: puppetPaths({ XDG_CONFIG_HOME: dir }) }),
    ).rejects.toMatchObject({ code: "unreadable" });
    expect(fn).not.toHaveBeenCalled();
  });

  test("refuses a second puppet while the first one answers", async () => {
    const paths = await account("FAC0123456789", "Fgklgoafpfk");
    await boot(paths);
    const fn = login();
    await expect(bootPuppet({ login: fn, paths })).rejects.toThrow(
      "already running",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  test("replaces the socket a dead puppet left behind", async () => {
    const paths = await account("FAC0123456789", "Fgklgoafpfk");
    await mkdir(paths.runtimeDir, { recursive: true });
    await staleSocket(paths.socket);
    await boot(paths);
    expect(await sendRequest(paths.socket, { cmd: "status" })).toEqual({
      ok: true,
      out: "",
    });
  });
});
