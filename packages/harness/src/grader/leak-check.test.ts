import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { bunExec } from "#harness/grader/exec";
import { leakCheck } from "#harness/grader/truth";
import { fakeExec, ok } from "#test-support/fake-exec";

const PASSWORD = "pw-secret-123";

async function runDir(): Promise<string> {
  const dir = scratchDir("leak");
  await mkdir(`${dir}/frames`);
  await writeFile(
    `${dir}/account.json`,
    JSON.stringify({ account: "FAC0123456789", password: PASSWORD }),
  );
  await writeFile(`${dir}/gamelog.jsonl`, '{"event":"session/in_world"}\n');
  return dir;
}

describe("leakCheck", () => {
  test("finds no leak in a clean run dir", async () => {
    const dir = await runDir();
    expect(
      await leakCheck({
        exec: bunExec,
        runDir: dir,
        secretFiles: [`${dir}/account.json`, `${dir}/partner.json`],
      }),
    ).toEqual([]);
  });

  test("lists every file that holds the password, but not the secret files", async () => {
    const dir = await runDir();
    await writeFile(`${dir}/frames/00001-5.txt`, `login ${PASSWORD} ok`);
    await writeFile(`${dir}/session.jsonl`, `{"text":"${PASSWORD}"}\n`);
    const files = await leakCheck({
      exec: bunExec,
      runDir: dir,
      secretFiles: [`${dir}/account.json`],
    });
    expect(files).toEqual(["frames/00001-5.txt", "session.jsonl"]);
  });

  test("keeps the password out of argv", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ({
      code: 1,
      stderr: "",
      stdout: "",
    }));
    await leakCheck({
      exec,
      runDir: dir,
      secretFiles: [`${dir}/account.json`],
    });
    expect(calls[0]?.argv.join(" ")).not.toContain(PASSWORD);
    expect(calls[0]?.stdin).toBe(`${PASSWORD}\n`);
    expect(calls[0]?.argv).toEqual([
      "rg",
      "-uu",
      "-l",
      "-F",
      "-f",
      "-",
      "--glob",
      "!account.json",
      dir,
    ]);
  });

  test("returns nothing and runs nothing when no secret file exists", async () => {
    const dir = scratchDir("leak");
    const { calls, exec } = fakeExec(() => ok());
    expect(
      await leakCheck({
        exec,
        runDir: dir,
        secretFiles: [`${dir}/account.json`],
      }),
    ).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("throws when rg fails", async () => {
    const dir = await runDir();
    const { exec } = fakeExec(() => ({
      code: 2,
      stderr: "rg: bad glob",
      stdout: "",
    }));
    await expect(
      leakCheck({ exec, runDir: dir, secretFiles: [`${dir}/account.json`] }),
    ).rejects.toThrow("rg exited 2: rg: bad glob");
  });
});
