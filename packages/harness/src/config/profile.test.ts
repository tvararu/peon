import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serializeConfig } from "@peon/core/lib/config";
import { scratchDir } from "@peon/core/test-support/scratch";
import {
  isProtected,
  loadProfile,
  ProfileError,
} from "#harness/config/profile";

let root: string;

beforeEach(async () => {
  root = scratchDir("harness-profile");
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

type TomlInit = {
  path: string;
  account: string;
  character: string;
  library: string;
};

async function writeToml({
  path,
  account,
  character,
  library,
}: TomlInit): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const config = {
    account,
    character,
    host: "t1",
    language: 1,
    navigation_data_dir: "/nav/data",
    navigation_library: library,
    password: "pw-in-toml",
    port: 3724,
    spell_data_dir: "/spells",
    timeout_minutes: 30,
  };
  await writeFile(path, `${serializeConfig(config)}\n`);
}

async function writeJson(name: string, value: unknown): Promise<string> {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

async function sessionProfile(
  account: string,
  character: string,
): Promise<string> {
  const dir = join(root, `factory-account-${account}`);
  await writeToml({
    account,
    character,
    library: "/patched/libnamigator.so",
    path: join(dir, "config/peon/config.toml"),
  });
  return writeJson("session.json", {
    account,
    character,
    dir,
    password: "secretpw",
    preset: "fresh",
    wrapper: join(root, `puppet-${account}`),
  });
}

describe("loadProfile", () => {
  test("reads a soap session JSON and its account config", async () => {
    const profile = await loadProfile(
      await sessionProfile("FACABC0123456", "Fgklibhlflc"),
      root,
    );
    expect(profile.source).toBe("soap_session");
    expect(profile.account).toBe("FACABC0123456");
    expect(profile.character).toBe("Fgklibhlflc");
    expect(profile.client.password).toBe("SECRETPW");
    expect(profile.client.host).toBe("t1");
    expect(profile.client.spellDataDir).toBe("/spells");
  });

  test("takes the navigation library from the session's config, not from home", async () => {
    await writeToml({
      account: "HOMEACC",
      character: "Homechar",
      library: "/unpatched/libnamigator.so",
      path: join(root, ".config/peon/config.toml"),
    });
    const profile = await loadProfile(
      await sessionProfile("FACABC0123456", "Fgklibhlflc"),
      root,
    );
    expect(profile.client.navigationLibrary).toBe("/patched/libnamigator.so");
    expect(profile.client.navigationDataDir).toBe("/nav/data");
  });

  test("refuses a session whose config logs in as another character", async () => {
    const dir = join(root, "factory-account-FACABC0123456");
    await writeToml({
      account: "FACABC0123456",
      character: "Other",
      library: "/lib.so",
      path: join(dir, "config/peon/config.toml"),
    });
    const path = await writeJson("s.json", {
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      dir,
      password: "pw",
      preset: "fresh",
      wrapper: "/w",
    });
    await expect(loadProfile(path, root)).rejects.toMatchObject({
      code: "unknown_format",
    });
  });

  test("names the missing file when the session's account dir is gone", async () => {
    const path = await writeJson("s.json", {
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      dir: join(root, "gone"),
      password: "pw",
      preset: "fresh",
      wrapper: "/w",
    });
    const error = await loadProfile(path, root).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProfileError);
    expect(error).toMatchObject({ code: "unreadable" });
    expect(String(error)).toContain(join(root, "gone/config/peon/config.toml"));
  });

  test("reads a soap ledger entry with navigation paths from home", async () => {
    await writeToml({
      account: "HOMEACC",
      character: "Homechar",
      library: "/home/lib.so",
      path: join(root, ".config/peon/config.toml"),
    });
    const path = await writeJson("ledger.json", {
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      createdAt: "2026-09-26T00:00:00Z",
      owner: "/w",
      password: "pw",
      preset: "elwynn10",
    });
    const profile = await loadProfile(path, root);
    expect(profile.source).toBe("soap_ledger");
    expect(profile.client.account).toBe("FACABC0123456");
    expect(profile.client.navigationLibrary).toBe("/home/lib.so");
    expect(profile.client.language).toBe(7);
  });

  test("reads a Peon config.toml", async () => {
    const path = join(root, "config.toml");
    await writeToml({
      account: "myacc",
      character: "Mychar",
      library: "/lib.so",
      path,
    });
    const profile = await loadProfile(path, root);
    expect(profile.source).toBe("config_toml");
    expect(profile.account).toBe("MYACC");
  });

  test.each([
    ["ADMIN", "Anyone", "protected_account"],
    ["rndbot123", "Bot", "protected_account"],
    ["FACABC0123456", "xiara", "protected_character"],
  ])("refuses %s / %s", async (account, character, code) => {
    const path = join(root, "config.toml");
    await writeToml({ account, character, library: "/lib.so", path });
    await expect(loadProfile(path, root)).rejects.toMatchObject({ code });
  });

  test("refuses a ledger entry with no password", async () => {
    const path = await writeJson("l.json", {
      account: "A",
      character: "B",
      createdAt: "x",
      owner: "/w",
      preset: "fresh",
    });
    await expect(loadProfile(path, root)).rejects.toMatchObject({
      code: "missing_field",
    });
  });

  test("refuses JSON that is neither a session nor a ledger entry", async () => {
    await expect(
      loadProfile(await writeJson("x.json", { foo: 1 }), root),
    ).rejects.toMatchObject({ code: "unknown_format" });
  });

  test("refuses a file that does not exist", async () => {
    await expect(
      loadProfile(join(root, "missing.json"), root),
    ).rejects.toMatchObject({ code: "unreadable" });
  });
});

test("isProtected matches accounts, the RNDBOT prefix and Xiara", () => {
  expect(isProtected("deity", "Anyone")).toBe(true);
  expect(isProtected("RNDBOT7", "Bot")).toBe(true);
  expect(isProtected("FACABC0123456", "XIARA")).toBe(true);
  expect(isProtected("FACABC0123456", "Fgklibhlflc")).toBe(false);
});
