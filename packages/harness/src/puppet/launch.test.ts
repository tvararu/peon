import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { launchPuppet } from "#harness/puppet/launch";

let dir: string;

afterEach(() => rm(dir, { force: true, recursive: true }));

async function entry(source: string): Promise<string> {
  dir = await mkdtemp(`${tmpdir()}/puppet-launch-`);
  const path = `${dir}/entry.ts`;
  await writeFile(path, source);
  return path;
}

async function alive(pidFile: string): Promise<boolean> {
  const pid = Number(await Bun.file(pidFile).text());
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("launchPuppet", () => {
  test("returns once the background process is in the world and leaves it running", async () => {
    const path = await entry(
      `await Bun.write(import.meta.dir + "/pid", String(process.pid));
       process.send({ type: "ready" });
       setTimeout(() => {}, 5000);`,
    );
    await launchPuppet({ entry: path, timeoutMs: 5000 });
    const pidFile = `${dir}/pid`;
    expect(await alive(pidFile)).toBe(true);
    process.kill(Number(await Bun.file(pidFile).text()));
  });

  test("throws the background process's failure", async () => {
    const path = await entry(
      `process.send({ type: "failed", message: "The account ADMIN is protected." });
       setTimeout(() => {}, 5000);`,
    );
    await expect(
      launchPuppet({ entry: path, timeoutMs: 5000 }),
    ).rejects.toThrow("The account ADMIN is protected.");
  });

  test("throws when the background process exits before the world", async () => {
    const path = await entry("process.exit(3);");
    await expect(
      launchPuppet({ entry: path, timeoutMs: 5000 }),
    ).rejects.toThrow(
      "The puppet exited with code 3 before the character reached the world.",
    );
  });

  test("gives up and stops the background process after the timeout", async () => {
    const path = await entry(
      `await Bun.write(import.meta.dir + "/pid", String(process.pid));
       setTimeout(() => {}, 5000);`,
    );
    await expect(launchPuppet({ entry: path, timeoutMs: 300 })).rejects.toThrow(
      "The character did not reach the world within 0.3 s.",
    );
    expect(await alive(`${dir}/pid`)).toBe(false);
  });
});
