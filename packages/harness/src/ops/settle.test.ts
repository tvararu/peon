import { describe, expect, jest, test } from "bun:test";
import { settle } from "#harness/ops/settle";

function channel<E>() {
  const subscribers = new Set<(event: E) => void>();
  return {
    emit(event: E) {
      for (const subscriber of subscribers) subscriber(event);
    },
    size: () => subscribers.size,
    subscribe(cb: (event: E) => void) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}

describe("settle", () => {
  test("subscribes before send, so an answer sent inside send counts", async () => {
    const events = channel<number>();
    const answer = await settle({
      match: (n) => n === 3,
      send: () => events.emit(3),
      subscribe: events.subscribe,
      timeoutMs: 1000,
    });
    expect(answer).toBe(3);
    expect(events.size()).toBe(0);
  });

  test("skips events that do not match", async () => {
    const events = channel<number>();
    const pending = settle({
      match: (n) => n > 5,
      subscribe: events.subscribe,
      timeoutMs: 1000,
    });
    events.emit(1);
    events.emit(7);
    expect(await pending).toBe(7);
  });

  test("gives undefined at the timeout and unsubscribes", async () => {
    jest.useFakeTimers();
    try {
      const events = channel<number>();
      const pending = settle({
        match: () => true,
        subscribe: events.subscribe,
        timeoutMs: 2000,
      });
      jest.advanceTimersByTime(2000);
      expect(await pending).toBeUndefined();
      expect(events.size()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("an abort rejects with the signal's reason", async () => {
    const events = channel<number>();
    const controller = new AbortController();
    const pending = settle({
      match: () => false,
      signal: controller.signal,
      subscribe: events.subscribe,
      timeoutMs: 1000,
    });
    controller.abort(new Error("esc"));
    await expect(pending).rejects.toThrow("esc");
    expect(events.size()).toBe(0);
  });

  test("an aborted signal rejects before send", async () => {
    const controller = new AbortController();
    controller.abort(new Error("human_stop"));
    const send = jest.fn();
    const pending = settle({
      match: () => true,
      send,
      signal: controller.signal,
      subscribe: channel<number>().subscribe,
      timeoutMs: 1000,
    });
    await expect(pending).rejects.toThrow("human_stop");
    expect(send).not.toHaveBeenCalled();
  });

  test("awaits an async send", async () => {
    const events = channel<string>();
    const send = () => Promise.resolve().then(() => events.emit("echo"));
    expect(
      await settle({
        match: (text) => text === "echo",
        send,
        subscribe: events.subscribe,
        timeoutMs: 1000,
      }),
    ).toBe("echo");
  });
});
