import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StatusJson } from "#harness/contract/config";
import type { RunEnd } from "#harness/contract/runs";
import { createStatusWriter, statusSnapshot } from "#harness/eval/status";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function fileAppears(path: string): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    if (await Bun.file(path).exists()) return;
    await Bun.sleep(5);
  }
  throw new Error(`${path} never appeared`);
}

describe("statusSnapshot", () => {
  test("reads the session, the active run and the gates", async () => {
    const clock = { now: () => 10_000 };
    const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
    const runs = createRunRegistry({
      clock,
      log,
      sink: createJsonlSink({ file: undefined }),
    });
    const { rt } = await createTestRuntime({ parts: { clock, log, runs } });
    runs.start({
      args: { to: "u4" },
      kind: "travel",
      launch: () => new Promise<RunEnd<number>>(() => {}),
      toolCallId: "c1",
    });
    Object.assign(rt.session, {
      agent: "tool",
      lastToolCallAt: 9000,
      tool: "travel",
    });
    expect(statusSnapshot(rt)).toEqual({
      agent: "tool",
      at: 10_000,
      connection: rt.connection(),
      lastProgress: rt.progress.lastProgress(),
      lastToolCallAt: 9000,
      ready: rt.ready.isReady(),
      run: {
        elapsedMs: 0,
        id: "r1",
        kind: "travel",
        label: "travel u4",
        progress: undefined,
      },
      tool: "travel",
      v: 1,
    });
  });
});

describe("createStatusWriter", () => {
  test("writes status.json on each tick and the last state at stop", async () => {
    const path = join(
      await mkdtemp(join(tmpdir(), "tc-harness-status-")),
      "status.json",
    );
    let calls = 0;
    const snapshot = (): StatusJson => {
      calls += 1;
      return {
        agent: "idle",
        at: calls,
        connection: "online",
        lastProgress: undefined,
        lastToolCallAt: undefined,
        ready: true,
        run: undefined,
        tool: undefined,
        v: 1,
      };
    };
    const writer = createStatusWriter({ path, snapshot });
    writer.start(5);
    await fileAppears(path);
    await writer.stop();
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      agent: "idle",
      at: calls,
      v: 1,
    });
  });
});
