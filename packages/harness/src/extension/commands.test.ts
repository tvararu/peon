import { describe, expect, jest, test } from "bun:test";
import type { GameLogEntry } from "#harness/contract/log";
import type { RunEnd } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";
import { installCommands, LOG_COMMAND_ROWS } from "#harness/extension/commands";
import {
  createPiRecorder,
  createUiRecorder,
  recorderContext,
} from "#test-support/pi-recorder";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function setup() {
  const runtime = await createTestRuntime();
  const fake = createPiRecorder();
  installCommands(fake.pi, runtime.rt);
  const { ui, named } = createUiRecorder();
  const ctx = recorderContext({ ui });
  const run = (name: string, args = "") => fake.run(name, args, ctx);
  return { ...runtime, fake, named, run };
}

function inputs(rt: HarnessRuntime): GameLogEntry[] {
  return rt.log.recent(100).filter((entry) => entry.event === "human/input");
}

function waitForAbort(signal: AbortSignal): Promise<RunEnd<undefined>> {
  return new Promise((resolve) => {
    signal.addEventListener("abort", () =>
      resolve({
        reason: "human_stop",
        status: "cancelled",
        summary: "stopped",
        value: undefined,
      }),
    );
  });
}

describe("installCommands", () => {
  test("/stop stops the active run; humanStop logs it once", async () => {
    const { rt, run, named } = await setup();
    rt.runs.start({
      args: {},
      kind: "engage",
      launch: ({ signal }) => waitForAbort(signal),
      toolCallId: "call-1",
    });
    await run("stop");
    expect(named("notify")).toEqual([["Stopped r1 (engage).", "info"]]);
    expect(inputs(rt)).toHaveLength(1);
    expect(inputs(rt)[0]?.data).toMatchObject({
      stoppedRuns: ["r1"],
      text: "/stop",
      via: "command",
    });
  });

  test("/wake sets the session flag", async () => {
    const { rt, run, named } = await setup();
    await run("wake", "off");
    expect(rt.session.wake).toBe(false);
    await run("wake", "maybe");
    expect(named("notify")).toEqual([
      ["Wake is off.", "info"],
      ["Use /wake on or /wake off.", "warning"],
    ]);
  });

  test("/now prints the last [now] line the model got", async () => {
    const { rt, run, named } = await setup();
    await run("now");
    rt.session.lastNow = "[now 19:13:02] Testchar L10 Priest HP 175/217";
    await run("now");
    expect(named("notify")).toEqual([
      ["No [now] line was sent to the model yet.", "info"],
      ["[now 19:13:02] Testchar L10 Priest HP 175/217", "info"],
    ]);
  });

  test("/log shows up to 20 rows as human-only lines", async () => {
    const { rt, fake, run } = await setup();
    for (let i = 0; i < 25; i += 1)
      rt.log.append({
        class: "log",
        data: {},
        domain: "xp",
        event: "xp/gain",
        text: `xp ${i}`,
      });
    await run("log");
    const rows = fake.entries.filter(
      (entry) => entry.customType === "wow-human",
    );
    expect(rows).toHaveLength(LOG_COMMAND_ROWS);
  });

  test("/snapshot writes a labelled snapshot", async () => {
    const { rt, run, named } = await setup();
    const write = jest.spyOn(rt.snapshots, "write");
    await run("snapshot", "Before Pull!");
    expect(write).toHaveBeenCalledWith("before-pull-");
    expect(named("notify").at(-1)?.[1]).toBe("info");
  });

  test("/connect and /disconnect report the result", async () => {
    const { rt, run, named } = await setup();
    await run("connect");
    rt.disconnect = jest.fn(async () => undefined);
    await run("disconnect");
    rt.connection = () => "offline";
    rt.connect = () => Promise.reject(new Error("auth failed"));
    await run("connect");
    expect(rt.disconnect).toHaveBeenCalledTimes(1);
    expect(named("notify")).toEqual([
      ["The game connection is already up.", "info"],
      ["Disconnected. Run /connect to log in again.", "info"],
      ["Connect failed: auth failed", "error"],
    ]);
  });
});
