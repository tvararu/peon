import { describe, expect, test } from "bun:test";
import {
  ATTACKER_GAP_MS,
  createWakeGuard,
  SENDER_GAP_MS,
  SENDER_JOIN_MS,
  type WakeCandidate,
} from "#harness/events/guard";

function clockAt(start = 0) {
  let now = start;
  return {
    clock: { now: () => now },
    tick: (ms: number) => {
      now += ms;
    },
  };
}

const runEnd: WakeCandidate = { class: "wake", data: {}, event: "run/ended" };

function whisper(sender: string): WakeCandidate {
  return { class: "wake", data: { sender }, event: "chat/in" };
}

function attacked(attacker: string): WakeCandidate {
  return { class: "wake", data: { attacker }, event: "combat/attacked" };
}

describe("createWakeGuard", () => {
  test("passes passive and log rows through", () => {
    const guard = createWakeGuard(clockAt().clock);
    expect(guard.admit({ ...runEnd, class: "passive" })).toBe("passive");
    expect(guard.admit({ ...runEnd, class: "log" })).toBe("log");
  });

  test("admits a burst of 3 wakes, then makes wakes passive", () => {
    const guard = createWakeGuard(clockAt().clock);
    const classes = [1, 2, 3, 4].map(() => guard.admit(runEnd));
    expect(classes).toEqual(["wake", "wake", "wake", "passive"]);
  });

  test("refills 6 wakes a minute", () => {
    const { clock, tick } = clockAt();
    const guard = createWakeGuard(clock);
    for (const _ of [1, 2, 3]) guard.admit(runEnd);
    tick(10_000);
    expect(guard.admit(runEnd)).toBe("wake");
    expect(guard.admit(runEnd)).toBe("passive");
  });

  test("joins lines from one sender inside 2 s, then holds them for 20 s", () => {
    const { clock, tick } = clockAt();
    const guard = createWakeGuard(clock);
    expect(guard.admit(whisper("Kaelyn"))).toBe("wake");
    tick(SENDER_JOIN_MS - 1);
    expect(guard.admit(whisper("Kaelyn"))).toBe("wake");
    tick(1);
    expect(guard.admit(whisper("Kaelyn"))).toBe("passive");
    expect(guard.admit(whisper("Bob"))).toBe("wake");
    tick(SENDER_GAP_MS);
    expect(guard.admit(whisper("Kaelyn"))).toBe("wake");
  });

  test("wakes once per attacker per 30 s", () => {
    const { clock, tick } = clockAt();
    const guard = createWakeGuard(clock);
    expect(guard.admit(attacked("2a"))).toBe("wake");
    tick(1000);
    expect(guard.admit(attacked("2a"))).toBe("log");
    expect(guard.admit(attacked("2b"))).toBe("wake");
    tick(ATTACKER_GAP_MS);
    expect(guard.admit(attacked("2a"))).toBe("wake");
  });
});
