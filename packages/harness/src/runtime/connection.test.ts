import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import type { Profile } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type { GameLog, HandleObserver } from "#harness/contract/services";
import {
  BACKOFF_MS,
  createConnection,
  LOGOUT_WAIT_MS,
} from "#harness/runtime/connection";

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

function setup(
  login: (n: number) => Promise<WorldHandle>,
  now: () => number = () => 0,
) {
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
    clock: { now },
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
  test("disconnect emits offline once", async () => {
    const { connection } = setup(async () => createMockHandle());
    await connection.connect();
    const states: string[] = [];
    connection.onConnection((state) => states.push(state));
    await connection.disconnect();
    expect(states).toEqual(["closing", "offline"]);
  });

  test("disconnect during the first login logs out the late handle and stays offline", async () => {
    const handle = createMockHandle();
    const { promise, resolve } = Promise.withResolvers<WorldHandle>();
    const { attached, connection } = setup(() => promise);
    const connecting = connection.connect();
    await connection.disconnect();
    resolve(handle);
    await connecting;
    expect(connection.connection()).toBe("offline");
    expect(connection.handle()).toBeUndefined();
    expect(handle.logout).toHaveBeenCalled();
    expect(attached).toEqual([]);
  });

  test("disconnect during a reconnect login logs out the late handle and stays offline", async () => {
    jest.useFakeTimers();
    try {
      const first = createMockHandle();
      const second = createMockHandle();
      const { promise, resolve } = Promise.withResolvers<WorldHandle>();
      const { connection, drafts } = setup(async (n) =>
        n === 1 ? first : promise,
      );
      const states: string[] = [];
      connection.onConnection((state) => states.push(state));
      await connection.connect();
      first.resolveClosed();
      await flush();
      jest.advanceTimersByTime(BACKOFF_MS[0] ?? 0);
      await flush();
      await connection.disconnect();
      resolve(second);
      await flush();
      expect(states).toEqual([
        "connecting",
        "online",
        "backoff",
        "connecting",
        "offline",
      ]);
      expect(connection.handle()).toBeUndefined();
      expect(second.logout).toHaveBeenCalled();
      expect(
        drafts.filter((d) => d.event === "session/connected"),
      ).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("connect while closing waits for the close and does not treat it as lost", async () => {
    const first = { ...createMockHandle(), logout: jest.fn() };
    const second = createMockHandle();
    const { connection, drafts, runs } = setup(async (n) =>
      n === 1 ? first : second,
    );
    await connection.connect();
    const closing = connection.disconnect();
    const connecting = connection.connect();
    first.resolveClosed();
    await closing;
    await connecting;
    expect(runs.cancelAll).not.toHaveBeenCalled();
    expect(drafts.some((d) => d.event === "session/lost")).toBe(false);
    expect(connection.handle()).toBe(second);
    expect(connection.connection()).toBe("online");
  });

  test("disconnect waits for the server to finish the logout and logs it", async () => {
    jest.useFakeTimers();
    try {
      let now = 1000;
      const handle = { ...createMockHandle(), logout: jest.fn() };
      const { connection, drafts } = setup(
        async () => handle,
        () => now,
      );
      await connection.connect();
      let done = false;
      const closing = connection.disconnect().then(() => {
        done = true;
      });
      await flush();
      jest.advanceTimersByTime(20_000);
      await flush();
      expect(done).toBe(false);
      now += 21_500;
      handle.resolveClosed();
      await closing;
      expect(handle.close).not.toHaveBeenCalled();
      expect(connection.connection()).toBe("offline");
      const row = drafts.find((d) => d.event === "session/logout");
      expect(row?.data).toEqual({ outcome: "complete", waitedMs: 21_500 });
      expect(row?.text).toBe(
        "Logged out; the server closed the session after 21.5 s.",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("disconnect closes the socket when the logout takes longer than 30 s", async () => {
    jest.useFakeTimers();
    try {
      let now = 0;
      const handle = { ...createMockHandle(), logout: jest.fn() };
      const { connection, drafts } = setup(
        async () => handle,
        () => now,
      );
      await connection.connect();
      const closing = connection.disconnect();
      await flush();
      jest.advanceTimersByTime(LOGOUT_WAIT_MS - 1);
      await flush();
      expect(handle.close).not.toHaveBeenCalled();
      now = LOGOUT_WAIT_MS;
      jest.advanceTimersByTime(1);
      await closing;
      expect(handle.close).toHaveBeenCalled();
      expect(connection.connection()).toBe("offline");
      const row = drafts.find((d) => d.event === "session/logout");
      expect(row?.data).toEqual({ outcome: "timeout", waitedMs: 30_000 });
      expect(row?.class).toBe("log");
    } finally {
      jest.useRealTimers();
    }
  });
});
