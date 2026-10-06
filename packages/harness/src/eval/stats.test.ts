import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import { createToolStats } from "#harness/eval/stats";

async function fileAppears(path: string): Promise<void> {
  for (let tries = 0; tries < 1000; tries += 1) {
    if (await Bun.file(path).exists()) return;
    await Bun.sleep(1);
  }
  throw new Error(`${path} never appeared`);
}

describe("createToolStats", () => {
  test("counts calls, statuses, errors and hits per tool", () => {
    const stats = createToolStats({ now: () => 42 });
    stats.call("look");
    stats.call("travel");
    stats.call("travel");
    stats.result({ ms: 30, reason: undefined, status: "DONE", tool: "look" });
    stats.result({
      ms: 900,
      reason: "no_ground",
      status: "REFUSED",
      tool: "travel",
    });
    stats.validationError("travel");
    stats.repeatHit("travel");
    stats.error({ message: "self_not_alive", tool: "travel" });
    expect(stats.snapshot()).toEqual({
      tools: {
        look: {
          calls: 1,
          lastError: undefined,
          p50Ms: 30,
          p95Ms: 30,
          repeatHits: 0,
          statuses: { DONE: 1 },
          validationErrors: 0,
        },
        travel: {
          calls: 2,
          lastError: "self_not_alive",
          p50Ms: 900,
          p95Ms: 900,
          repeatHits: 1,
          statuses: { REFUSED: 1 },
          validationErrors: 1,
        },
      },
      updatedAt: 42,
      v: 1,
    });
  });

  test("computes nearest-rank p50 and p95", () => {
    const stats = createToolStats({ now: () => 0 });
    for (const ms of Array.from({ length: 20 }, (_, i) => (i + 1) * 10))
      stats.result({ ms, reason: undefined, status: "DONE", tool: "look" });
    expect(stats.snapshot().tools["look"]).toMatchObject({
      p50Ms: 100,
      p95Ms: 190,
    });
  });

  test("a tick writes tools.json, and stop writes the last state", async () => {
    const dir = scratchDir("tc-harness-stats");
    const path = join(dir, "tools.json");
    const stats = createToolStats({ now: () => 7 });
    stats.start({ everyMs: 1, path });
    await fileAppears(path);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      tools: {},
      updatedAt: 7,
      v: 1,
    });
    stats.call("look");
    await stats.stop();
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      tools: { look: { calls: 1 } },
    });
  });

  test("stop without start writes nothing", async () => {
    const dir = scratchDir("tc-harness-stats-idle");
    const stats = createToolStats({ now: () => 7 });
    stats.call("look");
    await stats.stop();
    expect(await readdir(dir)).toEqual([]);
    expect(stats.snapshot().tools["look"]).toMatchObject({ calls: 1 });
  });
});
