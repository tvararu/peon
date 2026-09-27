import { describe, expect, jest, test } from "bun:test";
import { mkdir, mkdtemp, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HarnessFlags } from "#harness/contract/config";
import type { DeliverySink } from "#harness/contract/services";
import {
  installEvents,
  NOW_DISPLAY,
  nowMessage,
  nowText,
} from "#harness/events/install";
import { createGameLog } from "#harness/log/store";
import { createTestRuntime, testPaths } from "#test-support/runtime-fixture";

type Handler = (event: unknown, ctx: unknown) => unknown;

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const sent: { message: Record<string, unknown>; options: unknown }[] = [];
  const api = {
    appendEntry: () => {},
    on: (name: string, handler: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return () => {};
    },
    sendMessage: (message: Record<string, unknown>, options?: unknown) => {
      sent.push({ message, options });
    },
  };
  const emit = async (name: string, event: unknown = {}, ctx: unknown = {}) => {
    const results: unknown[] = [];
    for (const handler of handlers.get(name) ?? [])
      results.push(await handler(event, ctx));
    return results;
  };
  return { api: api as unknown as ExtensionAPI, emit, handlers, sent };
}

async function setup(flags: Partial<HarnessFlags> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "tc-harness-install-"));
  const clock = { now: () => 1000 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const paths = testPaths(dir);
  await mkdir(paths.dir, { recursive: true });
  const { rt } = await createTestRuntime({
    flags,
    parts: { clock, log, paths },
  });
  const setSink = jest.fn();
  rt.router.setSink = setSink;
  const pi = fakePi();
  installEvents(pi.api, rt);
  const sink = () => setSink.mock.calls[0]?.[0] as DeliverySink;
  return { log, paths, pi, rt, setSink, sink };
}

type NowResult = {
  message: { content: string; customType: string; display: boolean };
};

async function startAgent(
  pi: ReturnType<typeof fakePi>,
): Promise<NowResult["message"]> {
  const [result] = await pi.emit("before_agent_start", {
    prompt: "hi",
    type: "before_agent_start",
  });
  return (result as NowResult).message;
}

describe("installEvents", () => {
  test("hands the router a sink and injects [now] before each agent run", async () => {
    const { log, pi, rt, setSink } = await setup();
    expect(setSink).toHaveBeenCalledTimes(1);
    const message = await startAgent(pi);
    expect(message).toEqual({
      content: nowText(rt),
      customType: "wow-now",
      display: NOW_DISPLAY,
    });
    expect(message.content.startsWith("[now ")).toBe(true);
    expect(rt.session.lastNow).toBe(message.content);
    expect(
      log.since(0).filter((row) => row.event === "agent/now"),
    ).toHaveLength(1);
  });

  test("adds buffered passive lines after the [now] line", async () => {
    const { log, pi, rt, sink } = await setup();
    const line = log.append({
      class: "passive",
      data: {},
      delivered: false,
      domain: "xp",
      event: "xp/gain",
      text: "You gain 130 XP.",
    });
    sink().passive(line);
    const message = await startAgent(pi);
    expect(message.content).toBe(`${nowText(rt)}\n[game 0s] You gain 130 XP.`);
  });

  test("flushes passive lines at agent_end", async () => {
    const { log, pi, sink } = await setup();
    sink().passive(
      log.append({
        class: "passive",
        data: {},
        delivered: false,
        domain: "xp",
        event: "xp/gain",
        text: "You gain 130 XP.",
      }),
    );
    await pi.emit("agent_end", { messages: [], type: "agent_end" });
    expect(pi.sent).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          content: "[game 0s] You gain 130 XP.",
          customType: "wow-event",
        }),
        options: { triggerTurn: false },
      }),
    ]);
  });

  test("links the session file and re-sends [now] on resume", async () => {
    const { paths, pi } = await setup();
    const file = join(paths.dir, "pi.jsonl");
    await writeFile(file, "");
    const ctx = { sessionManager: { getSessionFile: () => file } };
    await pi.emit(
      "session_start",
      { reason: "startup", type: "session_start" },
      ctx,
    );
    expect(await readlink(paths.session)).toBe(file);
    expect(pi.sent).toEqual([]);
    await pi.emit(
      "session_start",
      { reason: "resume", type: "session_start" },
      ctx,
    );
    expect(pi.sent[0]).toMatchObject({
      message: { customType: "wow-now", display: NOW_DISPLAY },
      options: { triggerTurn: false },
    });
  });

  test("a wake run gets a hidden [now] message on its first request only", async () => {
    const { log, pi, rt } = await setup();
    const wake = {
      content: "[game 0s] r4 travel ended.",
      customType: "wow-event",
      details: { entries: [], kind: "wake" },
      display: true,
      role: "custom",
      timestamp: 1,
    };
    const [first] = await pi.emit("context", {
      messages: [wake],
      type: "context",
    });
    const messages = (
      first as {
        messages: {
          content: string;
          customType?: string;
          display?: boolean;
          role: string;
        }[];
      }
    ).messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      content: nowText(rt),
      customType: "wow-now",
      display: NOW_DISPLAY,
      role: "custom",
    });
    expect(rt.session.lastNow).toBe(nowText(rt));
    expect(
      log.since(0).filter((row) => row.event === "agent/now"),
    ).toHaveLength(1);
    const toolResult = { content: [], role: "toolResult", timestamp: 2 };
    const [later] = await pi.emit("context", {
      messages: [wake, toolResult],
      type: "context",
    });
    expect(later).toBeUndefined();
    const passive = { ...wake, details: { entries: [], kind: "passive" } };
    const [flushOnly] = await pi.emit("context", {
      messages: [passive],
      type: "context",
    });
    expect(flushOnly).toBeUndefined();
  });

  test("adds the per-call message only with --now-per-call", async () => {
    const off = await setup();
    const [none] = await off.pi.emit("context", {
      messages: [],
      type: "context",
    });
    expect(none).toBeUndefined();
    const on = await setup({ nowPerCall: true });
    const [result] = await on.pi.emit("context", {
      messages: [],
      type: "context",
    });
    const messages = (
      result as { messages: { content: string; role: string }[] }
    ).messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: "user" });
    expect(messages[0]?.content.startsWith("[now ")).toBe(true);
  });
});

describe("nowText and nowMessage", () => {
  test("says offline or loading when there is no snapshot", async () => {
    const clock = { now: () => Date.UTC(2026, 8, 26, 19, 13, 31) };
    const offline = await createTestRuntime({
      connect: false,
      parts: { clock },
    });
    expect(nowText(offline.rt)).toBe(
      "[now 19:13:31] the game connection is down.",
    );
    const loading = await createTestRuntime({ parts: { clock }, ready: false });
    expect(nowText(loading.rt)).toBe(
      "[now 19:13:31] the world is still loading.",
    );
  });

  test("builds the hidden message and the visible V6 fallback", () => {
    expect(nowMessage("[now 19:13:31] x")).toEqual({
      content: "[now 19:13:31] x",
      customType: "wow-now",
      display: NOW_DISPLAY,
    });
    expect(nowMessage("[now 19:13:31] x", true).display).toBe(true);
  });
});
