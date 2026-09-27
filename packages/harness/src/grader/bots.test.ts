import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { readBots, recordBots } from "#harness/grader/bots";
import { loadScenario } from "#harness/grader/scenarios";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const health = (charactersInWorld: number, factoryOnline = 2) =>
  ok(
    JSON.stringify({
      charactersInWorld,
      factoryOnline,
      ok: true,
      playersOnline: 0,
    }),
  );

describe("readBots", () => {
  test("counts the characters in the world that are not factory or player sessions", async () => {
    const { calls, exec } = fakeExec(() => health(107));
    expect(await readBots(exec, "high")).toEqual({
      charactersInWorld: 107,
      count: 105,
      factoryOnline: 2,
      playersOnline: 0,
      risk: "high",
      source: "health",
    });
    expect(calls[0]?.argv).toEqual([
      "bun",
      "packages/factory/src/main.ts",
      "soap",
      "health",
    ]);
  });

  test("no bots in the world makes the bot risk none", async () => {
    const { exec } = fakeExec(() => health(2));
    expect(await readBots(exec, "high")).toMatchObject({
      count: 0,
      risk: "none",
    });
  });

  test("an unreadable health keeps the catalogue risk and says why", async () => {
    const { exec } = fakeExec(() => failed(1, "service down"));
    expect(await readBots(exec, "med")).toEqual({
      count: null,
      error: "soap health exited 1: service down",
      risk: "med",
      source: "health",
    });
  });
});

describe("recordBots", () => {
  test("adds the bot count to run.json and logs it", async () => {
    const dir = scratchDir("bots");
    await writeFile(`${dir}/run.json`, JSON.stringify({ replica: 1, t0: 5 }));
    const lines: string[] = [];
    const { exec } = fakeExec(() => health(107));
    await recordBots({
      exec,
      log: (line) => lines.push(line),
      runDir: dir,
      scenario: loadScenario("t7-halt-resume"),
    });
    expect(await Bun.file(`${dir}/run.json`).json()).toMatchObject({
      bots: { count: 105, risk: "high" },
      replica: 1,
      t0: 5,
    });
    expect(lines).toEqual(["bots 105 (risk high)"]);
  });
});
