import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import { seedManagedTools } from "#harness/runtime/managed-tools";

let agentDir = "";

beforeEach(async () => {
  agentDir = scratchDir("harness-tools");
});

afterEach(async () => {
  await rm(agentDir, { force: true, recursive: true });
});

const nothingOnPath = () => null;

describe("seedManagedTools", () => {
  test("puts a silent fd and rg in the agent bin dir when the host has none", async () => {
    await seedManagedTools(agentDir, nothingOnPath);
    for (const name of ["fd", "rg"]) {
      const path = join(agentDir, "bin", name);
      const run = spawnSync(path, ["--version"], { stdio: "pipe" });
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(0);
      expect(run.stdout.toString()).toBe("");
    }
  });

  test("never shadows a host binary", async () => {
    const onPath = (name: string) =>
      name === "fdfind" ? "/usr/bin/fdfind" : null;
    await seedManagedTools(agentDir, onPath);
    const seeded = await Array.fromAsync(
      new Bun.Glob("*").scan(join(agentDir, "bin")),
    );
    expect(seeded).toEqual(["rg"]);
  });

  test("keeps a tool that is already in the bin dir", async () => {
    const path = join(agentDir, "bin", "fd");
    await mkdir(join(agentDir, "bin"), { recursive: true });
    await writeFile(path, "real fd", { mode: 0o755 });
    await seedManagedTools(agentDir, nothingOnPath);
    expect(await readFile(path, "utf8")).toBe("real fd");
  });
});
