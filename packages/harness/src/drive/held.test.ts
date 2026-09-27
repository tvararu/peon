import { describe, expect, test } from "bun:test";
import type { MovementInput } from "@peon/core";
import {
  FIRST_LEASE_MS,
  HeldKeys,
  RELEASE_LEASE_MS,
  REPEAT_LEASE_MS,
} from "#harness/drive/held";
import { playCommand, readKey } from "#harness/drive/keys";
import { manualTimers } from "#test-support/drive-fixtures";

function setup() {
  const timers = manualTimers();
  const sent: [MovementInput, number][] = [];
  const held = new HeldKeys({
    changed: () => {},
    send: (input, ms) => sent.push([input, ms]),
    timers,
  });
  return { held, sent, timers };
}

describe("PLAY keys", () => {
  test.each([
    ["w", { key: "w", type: "hold" }],
    ["W", { key: "w", type: "hold" }],
    ["\x1b[A", { key: "w", type: "hold" }],
    ["q", { key: "q", type: "hold" }],
    [" ", { type: "jump" }],
    ["\t", { type: "next_target" }],
    ["2", { slot: 1, type: "slot" }],
    ["=", { slot: 11, type: "slot" }],
    ["f", { type: "interact" }],
    ["\r", { type: "talk" }],
    ["\x1b", { type: "hand_back" }],
    ["\x1b[20~", { type: "stop" }],
    ["\x1c", { type: "stop" }],
    ["\x03", { type: "pass" }],
    ["\x04", { type: "pass" }],
    ["x", { type: "swallow" }],
  ])("%j maps to its command", (data, command) => {
    expect(playCommand(readKey(data)?.id ?? "")).toEqual(command as never);
  });

  test("kitty press, repeat and release sequences keep the key", () => {
    expect(readKey("\x1b[119u")).toEqual({ id: "w", phase: "press" });
    expect(readKey("\x1b[119;1:2u")).toEqual({ id: "w", phase: "repeat" });
    expect(readKey("\x1b[119;1:3u")).toEqual({ id: "w", phase: "release" });
  });
});

describe("HeldKeys", () => {
  test("held keys combine into one input; opposite keys cancel", () => {
    const { held, sent } = setup();
    held.key("w", "press");
    held.key("a", "press");
    held.key("q", "press");
    expect(sent.at(-1)?.[0]).toEqual({
      move: "forward",
      strafe: "left",
      turn: "left",
    });
    held.key("d", "press");
    expect(sent.at(-1)?.[0]).toEqual({ move: "forward", strafe: "left" });
  });

  test("a first press covers the OS repeat delay and each repeat re-arms a short lease", () => {
    const { held, sent, timers } = setup();
    held.key("w", "press");
    expect(sent.at(-1)?.[1]).toBeGreaterThanOrEqual(FIRST_LEASE_MS);
    timers.advance(FIRST_LEASE_MS - 10);
    held.key("w", "press");
    expect(sent.at(-1)).toEqual([
      { move: "forward" },
      expect.any(Number) as never,
    ]);
    const rearm = sent.at(-1)?.[1] ?? 0;
    expect(rearm).toBeGreaterThanOrEqual(REPEAT_LEASE_MS);
    expect(rearm).toBeLessThan(FIRST_LEASE_MS);
    timers.advance(REPEAT_LEASE_MS - 10);
    expect(held.keys()).toEqual(["w"]);
    timers.advance(20);
    expect(held.keys()).toEqual([]);
    expect(sent.at(-1)).toEqual([{}, 1]);
  });

  test("when one of two keys lapses the other keeps driving", () => {
    const { held, sent, timers } = setup();
    held.key("w", "press");
    timers.advance(300);
    held.key("a", "press");
    timers.advance(FIRST_LEASE_MS - 290);
    expect(sent.at(-1)?.[0]).toEqual({ turn: "left" });
  });

  test("with key releases a key stops on release, not on a lease", () => {
    const { held, sent, timers } = setup();
    held.key("w", "press");
    held.key("w", "release");
    expect(sent.at(-1)).toEqual([{}, 1]);
    expect(held.estimated()).toBe(false);
    held.key("w", "press");
    timers.advance(RELEASE_LEASE_MS - 10);
    held.key("w", "repeat");
    timers.advance(RELEASE_LEASE_MS - 10);
    expect(held.keys()).toEqual(["w"]);
    held.key("w", "release");
    expect(held.keys()).toEqual([]);
  });
});
