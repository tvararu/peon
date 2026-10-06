import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { accountPaths, loadAccount } from "#tools/probe-account";

const ACCOUNT = "FAC0123456789";
const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { force: true, recursive: true });
});

async function root(): Promise<string> {
  const dir = await mkdtemp(`${tmpdir()}/probe-account-`);
  dirs.push(dir);
  return dir;
}

async function write(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

const config = (account: string) => `account = "${account}"
password = "secret1"
character = "Fprobe"
host = "127.0.0.1"
port = 3724
`;

describe("accountPaths", () => {
  test("follows the soap create layout and the puppet's runtime dir", () => {
    expect(accountPaths("/w", ACCOUNT)).toEqual({
      config: `/w/tmp/factory-account-${ACCOUNT}/config/peon/config.toml`,
      pid: `/w/tmp/factory-account-${ACCOUNT}/runtime/peon/puppet.pid`,
    });
  });
});

describe("loadAccount", () => {
  test("reads the account's client config with SRP-ready credentials", async () => {
    const dir = await root();
    await write(accountPaths(dir, ACCOUNT).config, config(ACCOUNT));
    expect(await loadAccount(dir, ACCOUNT)).toEqual({
      account: ACCOUNT,
      character: "Fprobe",
      host: "127.0.0.1",
      language: 1,
      password: "SECRET1",
      port: 3724,
    });
  });

  test("reads game data from the config's spell data directory", async () => {
    const dir = await root();
    const data = `${dir}/dbc`;
    await write(`${data}/FactionTemplate.dbc`, "WDBC");
    await write(
      accountPaths(dir, ACCOUNT).config,
      `${config(ACCOUNT)}spell_data_dir = "${data}/"\n`,
    );
    const { dbc } = await loadAccount(dir, ACCOUNT);
    const bytes = await dbc?.("FactionTemplate.dbc");
    expect(new TextDecoder().decode(bytes)).toBe("WDBC");
    await expect(dbc?.("Spell.dbc")).rejects.toThrow("missing Spell.dbc");
  });

  test("gives no game data without a spell data directory", async () => {
    const dir = await root();
    await write(accountPaths(dir, ACCOUNT).config, config(ACCOUNT));
    expect((await loadAccount(dir, ACCOUNT)).dbc).toBeUndefined();
  });

  test("refuses an account soap create did not set up here", async () => {
    const dir = await root();
    const load = loadAccount(dir, ACCOUNT);
    await expect(load).rejects.toThrow("no config for FAC0123456789");
  });

  test("refuses a config that logs in another account", async () => {
    const dir = await root();
    await write(accountPaths(dir, ACCOUNT).config, config("FAC0000000000"));
    const load = loadAccount(dir, ACCOUNT);
    await expect(load).rejects.toThrow("logs in FAC0000000000");
  });

  test("refuses while the account's puppet runs", async () => {
    const dir = await root();
    const paths = accountPaths(dir, ACCOUNT);
    await write(paths.config, config(ACCOUNT));
    await write(paths.pid, `${process.pid}\n`);
    const load = loadAccount(dir, ACCOUNT);
    await expect(load).rejects.toThrow("puppet");
  });

  test("ignores a pid file whose process is gone", async () => {
    const dir = await root();
    const paths = accountPaths(dir, ACCOUNT);
    await write(paths.config, config(ACCOUNT));
    await write(paths.pid, "2147483646\n");
    expect((await loadAccount(dir, ACCOUNT)).account).toBe(ACCOUNT);
  });

  test("never puts the password in a refusal", async () => {
    const dir = await root();
    await write(accountPaths(dir, ACCOUNT).config, config("FAC0000000000"));
    const error = await loadAccount(dir, ACCOUNT).catch((e: Error) => e);
    expect(String(error).toUpperCase()).not.toContain("SECRET1");
  });
});
