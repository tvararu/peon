import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { consoleWaitArgv, waitConsoleRead } from "#harness/grader/console-wait";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACC = "FAC0123456789";
const WAIT = "Battlefield [1] | Waiting for battle | Timer: 600s";
const WAR = "Battlefield [1] | The battle is at War";

const gmReply = (text: string) =>
  JSON.stringify({ account: ACC, ok: true, text, verb: "read" });

async function runDir(): Promise<string> {
  const dir = `${scratchDir("console-wait")}/run`;
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("console-wait", () => {
  test("argv runs a read-only gm read verb", () => {
    expect(
      consoleWaitArgv(ACC, { match: "x", read: "bf-queue", timeoutMinutes: 1 }),
    ).toEqual([
      "bun",
      "packages/factory/src/main.ts",
      "soap",
      "gm",
      ACC,
      "read",
      "bf-queue",
    ]);
  });

  test("a matching read returns the text", async () => {
    const dir = await runDir();
    const { exec } = fakeExec(() => ok(`${gmReply(WAR)}\n`));
    const text = await waitConsoleRead({
      account: ACC,
      exec,
      runDir: dir,
      sleep: async () => undefined,
      wait: { match: "at War", read: "bf-queue", timeoutMinutes: 1 },
    });
    expect(text).toBe(WAR);
  });

  test("it polls every 60 seconds until the text matches", async () => {
    const dir = await runDir();
    const sleeps: number[] = [];
    let calls = 0;
    const { exec } = fakeExec(() => {
      calls += 1;
      return ok(`${gmReply(calls < 3 ? WAIT : WAR)}\n`);
    });
    const text = await waitConsoleRead({
      account: ACC,
      exec,
      runDir: dir,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      wait: { match: "at War", read: "bf-queue", timeoutMinutes: 60 },
    });
    expect(text).toBe(WAR);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([60_000, 60_000]);
  });

  test("an invalid regex throws without calling the server", async () => {
    const { calls, exec } = fakeExec(() => ok(`${gmReply(WAR)}\n`));
    await expect(
      waitConsoleRead({
        account: ACC,
        exec,
        runDir: await runDir(),
        wait: { match: "([", read: "bf-queue", timeoutMinutes: 1 },
      }),
    ).rejects.toThrow("invalid regex");
    expect(calls).toHaveLength(0);
  });

  test("a nonzero exit does not match and the timeout aborts", async () => {
    const { exec } = fakeExec(() => failed(1, "", "down"));
    await expect(
      waitConsoleRead({
        account: ACC,
        exec,
        runDir: await runDir(),
        sleep: async () => undefined,
        wait: { match: "at War", read: "bf-queue", timeoutMinutes: 0 },
      }),
    ).rejects.toThrow("did not match");
  });
});
