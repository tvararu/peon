import { describe, expect, test } from "bun:test";
import { CooldownStore } from "#wow/cooldown-store";

function setup() {
  let now = 1000;
  const store = new CooldownStore(
    () => now,
    (id) =>
      id === 17
        ? {
            category: 5,
            recoveryTimeMs: 2000,
            categoryRecoveryTimeMs: 4000,
            startRecoveryTimeMs: 1500,
          }
        : undefined,
  );
  return { store, advance: (ms: number) => (now += ms) };
}

describe("CooldownStore", () => {
  test("the longest of spell, category and global cooldown wins", () => {
    const { store } = setup();
    store.beginGlobal(17);
    expect(store.readyAt(17)).toBe(2500);
    store.predict(17);
    expect(store.readyAt(17)).toBe(5000);
    expect(store.list(new Set([17]))).toEqual([
      { spellId: 17, until: 5000, remainingMs: 4000, source: "predicted" },
    ]);
  });

  test("server cooldowns expire and release clears the category", () => {
    const { store, advance } = setup();
    store.observe(17, 3000);
    store.predict(17);
    store.release(17);
    expect(store.list(new Set([17]))).toEqual([]);
    store.observe(18, 500);
    advance(500);
    expect(store.list(new Set())).toEqual([]);
  });

  test("shift moves a known spell cooldown and marks it from the server (Player.cpp:11277-11281)", () => {
    const { store } = setup();
    store.observe(18, 3000);
    store.shift(18, -1000);
    expect(store.readyAt(18)).toBe(3000);
    store.shift(18, 2500);
    expect(store.list(new Set([18]))).toEqual([
      { spellId: 18, until: 5500, remainingMs: 4500, source: "server" },
    ]);
  });

  test("shift moves only the spell cooldown, never its category (Player.cpp:11277-11281)", () => {
    const { store } = setup();
    store.predict(17);
    store.shift(17, 4000);
    expect(store.list(new Set([17]))).toEqual([
      { spellId: 17, until: 7000, remainingMs: 6000, source: "server" },
    ]);
    store.shift(17, -5000);
    expect(store.list(new Set([17]))).toEqual([
      { spellId: 17, until: 5000, remainingMs: 4000, source: "predicted" },
    ]);
  });

  test("shift creates no entry for a spell with no cooldown (Player.cpp:11277-11279)", () => {
    const { store } = setup();
    store.shift(18, 5000);
    expect(store.readyAt(18)).toBe(0);
    expect(store.list(new Set([18]))).toEqual([]);
  });
});
