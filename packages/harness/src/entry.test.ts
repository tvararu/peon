import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import { peonAuthPath } from "#harness/credentials/status";

const ENTRY = join(import.meta.dir, "entry.ts");

let home: string;

beforeEach(async () => {
  home = scratchDir("harness-entry");
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", ENTRY, ...args], {
    env: { HOME: home, PATH: Bun.env["PATH"] ?? "" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
}

test("a usage error prints the usage and exits 2", async () => {
  const result = await run(["--account", "X"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("Usage: mise harness [--profile <path>]");
});

test("--check runs the pre-flight through the dynamic import and exits 0", async () => {
  await mkdir(dirname(peonAuthPath(home)), { recursive: true });
  await Bun.write(
    peonAuthPath(home),
    JSON.stringify({
      "openai-codex": {
        access: "access-never-printed",
        expires: Date.now() + 3_600_000,
        refresh: "r",
        type: "oauth",
      },
    }),
  );
  const profile = join(home, "ledger.json");
  await writeFile(
    profile,
    JSON.stringify({
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      createdAt: "x",
      owner: home,
      password: "pw",
      preset: "fresh",
    }),
  );
  const result = await run(["--profile", profile, "--check"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Login: openai-codex (OAuth).");
  expect(result.stdout).not.toContain("access-never-printed");
  expect(existsSync(join(home, ".pi"))).toBe(false);
}, 15_000);
