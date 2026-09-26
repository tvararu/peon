import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { Profile } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type { GameLog, HandleObserver } from "#harness/contract/services";
import { BACKOFF_MS, createConnection } from "#harness/runtime/connection";

const profile: Profile = {
  account: "FACABC0123456",
  character: "Fgklibhlflc",
  client: {
    account: "FACABC0123456",
    character: "Fgklibhlflc",
    host: "t1",
    password: "PW",
    port: 3724,
  },
  path: "/p.json",
  source: "soap_session",
};

function setup(login: (n: number) => Promise<WorldHandle>) {
  const drafts: LogDraft[] = [];
  const attached: string[] = [];
  const log = {
    append: (draft: LogDraft) => drafts.push(draft),
  } as unknown as GameLog;
  const runs = { cancelAll: jest.fn(() => []) } as unknown as RunRegistry;
  const observer = (name: string): HandleObserver => ({
    attach: () => {
      attached.push(`attach:${name}`);
      return () => attached.push(`detach:${name}`);
    },
  });
  let calls = 0;
  const connection = createConnection({
    clock: { now: () => 0 },
    log,
    login: () => login(++calls),
    observers: [observer("ready"), observer("router")],
    profile,
    runs,
  });
  return { attached, calls: () => calls, connection, drafts, runs };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("createConnection", () => {
  test("connect logs in with the profile, attaches observers in order and goes online", async () => {
    const handle = createMockHandle();
    const { attached, connection, drafts } = setup(async () => handle);
    const states: string[] = [];
    connection.onConnection((state) => states.push(state));
    await connection.connect();
    expect(connection.handle()).toBe(handle);
    expect(connection.requireHandle()).toBe(handle);
    expect(attached).toEqual(["attach:ready", "attach:router"]);
    expect(states).toEqual(["connecting", "online"]);
    expect(drafts.map((d) => d.event)).toEqual(["session/connected"]);
  });

  test("requireHandle refuses offline with the /connect hint", () => {
    const { connection } = setup(async () => createMockHandle());
    expect(() => connection.requireHandle()).toThrow(
      "offline: the game connection is down.",
    );
  });

  test("a failed first login leaves the connection offline and rejects", async () => {
    const { connection } = setup(async () => {
      throw new Error("auth failed");
    });
    await expect(connection.connect()).rejects.toThrow("auth failed");
    expect(connection.connection()).toBe("offline");
  });

  test("disconnect logs out, detaches observers and goes offline", async () => {
    const handle = createMockHandle();
    const { attached, connection } = setup(async () => handle);
    await connection.connect();
    await connection.disconnect();
    expect(handle.logout).toHaveBeenCalled();
    expect(connection.connection()).toBe("offline");
    expect(connection.handle()).toBeUndefined();
    expect(attached).toContain("detach:router");
  });

  test("a lost socket cancels runs as lost and reconnects after 5 s", async () => {
    jest.useFakeTimers();
    try {
      const first = createMockHandle();
      const second = createMockHandle();
      const { calls, connection, drafts, runs } = setup(async (n) =>
        n === 1 ? first : second,
      );
      await connection.connect();
      first.resolveClosed();
      await flush();
      expect(runs.cancelAll).toHaveBeenCalledWith("lost");
      expect(connection.connection()).toBe("backoff");
      expect(drafts.at(-1)).toMatchObject({
        class: "log",
        event: "session/lost",
      });
      jest.advanceTimersByTime(BACKOFF_MS[0] ?? 0);
      await flush();
      expect(calls()).toBe(2);
      expect(connection.handle()).toBe(second);
      expect(connection.connection()).toBe("online");
    } finally {
      jest.useRealTimers();
    }
  });

  test("after 5 s, 15 s and 45 s of failed retries it wakes the agent once and stays offline", async () => {
    jest.useFakeTimers();
    try {
      const first = createMockHandle();
      const { connection, drafts } = setup(async (n) => {
        if (n === 1) return first;
        throw new Error("realm down");
      });
      await connection.connect();
      first.resolveClosed();
      await flush();
      for (const delay of BACKOFF_MS) {
        jest.advanceTimersByTime(delay);
        await flush();
      }
      expect(connection.connection()).toBe("offline");
      const wakes = drafts.filter((d) => d.class === "wake");
      expect(wakes).toEqual([
        expect.objectContaining({
          event: "session/lost",
          text: "Connection lost. The human must run /connect.",
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
