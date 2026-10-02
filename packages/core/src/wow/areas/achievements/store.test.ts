import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import {
  AchievementStore,
  type AchievementsEvent,
} from "#wow/areas/achievements/store";
import type { PackedTime } from "#wow/protocol/packed-time";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x2an;
const OTHER = 0xdc5n;

function day(date: number): PackedTime {
  return { year: 2026, month: 9, day: date, weekday: 0, hour: 10, minute: 0 };
}

function setup() {
  const deps: SessionDeps = {
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new AchievementStore(deps, testStores(deps));
  const seen: AchievementsEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

describe("AchievementStore", () => {
  test("starts empty", () => {
    expect(setup().store.snapshot()).toEqual({
      count: 0,
      criteria: 0,
      recent: [],
      titles: { chosen: 0, known: [] },
    });
  });

  test("the login data replaces both sets and a criteria update sets one counter", () => {
    const { store, seen } = setup();
    store.replace({
      criteria: [{ at: day(1), counter: 1n, id: 50 }],
      done: [{ at: day(1), id: 99 }],
    });
    store.replace({
      criteria: [
        { at: day(2), counter: 3n, id: 10 },
        { at: day(2), counter: 4n, id: 11 },
      ],
      done: [
        { at: day(3), id: 6 },
        { at: day(5), id: 7 },
      ],
    });
    store.setCriteria({ at: day(6), counter: 9n, id: 10 });
    store.setCriteria({ at: day(6), counter: 1n, id: 12 });
    expect(store.snapshot()).toEqual({
      count: 2,
      criteria: 3,
      recent: [
        { at: day(5), id: 7 },
        { at: day(3), id: 6 },
      ],
      titles: { chosen: 0, known: [] },
    });
    expect(store.counter(10)).toBe(9n);
    expect(store.counter(50)).toBeUndefined();
    expect(seen).toEqual([]);
  });

  test("recent holds the five newest achievements, newest first", () => {
    const { store } = setup();
    store.replace({
      criteria: [],
      done: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ at: day(8 - n), id: n })),
    });
    expect(store.snapshot().recent.map((row) => row.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  test("an own achievement joins the set and emits self: true", () => {
    const { store, seen } = setup();
    store.replace({ criteria: [], done: [{ at: day(1), id: 6 }] });
    store.earned({ at: day(9), guid: ME, id: 7 });
    expect(store.snapshot()).toMatchObject({
      count: 2,
      recent: [
        { at: day(9), id: 7 },
        { at: day(1), id: 6 },
      ],
    });
    expect(seen).toEqual([
      { guid: ME, id: 7, self: true, type: "achievement_earned" },
    ]);
  });

  test("another player's achievement emits self: false and leaves the set alone", () => {
    const { store, seen } = setup();
    store.earned({ at: day(9), guid: OTHER, id: 7 });
    expect(store.snapshot().count).toBe(0);
    expect(seen).toEqual([
      { guid: OTHER, id: 7, self: false, type: "achievement_earned" },
    ]);
  });

  test("deletions drop the achievement or the criterion and emit", () => {
    const { store, seen } = setup();
    store.replace({
      criteria: [{ at: day(1), counter: 2n, id: 10 }],
      done: [{ at: day(1), id: 6 }],
    });
    store.removeAchievement({ id: 6 });
    store.removeCriteria({ id: 10 });
    expect(store.snapshot()).toEqual({
      count: 0,
      criteria: 0,
      recent: [],
      titles: { chosen: 0, known: [] },
    });
    expect(seen).toEqual([
      { id: 6, type: "achievement_removed" },
      { id: 10, type: "criteria_removed" },
    ]);
  });

  test("an earned title joins the known bits and a lost title leaves it", () => {
    const { store, seen } = setup();
    store.titleEarned({ bit: 110, earned: true });
    store.titleEarned({ bit: 40, earned: true });
    expect(store.snapshot().titles).toEqual({ chosen: 0, known: [40, 110] });
    store.titleEarned({ bit: 40, earned: false });
    expect(store.snapshot().titles.known).toEqual([110]);
    expect(seen).toEqual([
      { bit: 110, earned: true, type: "title_changed" },
      { bit: 40, earned: true, type: "title_changed" },
      { bit: 40, earned: false, type: "title_changed" },
    ]);
  });

  test("setTitles replaces the known bits and the chosen bit", () => {
    const { store } = setup();
    store.titleEarned({ bit: 7, earned: true });
    store.setTitles([110], 110);
    expect(store.snapshot().titles).toEqual({ chosen: 110, known: [110] });
    expect(store.knows(110)).toBe(true);
    expect(store.knows(7)).toBe(false);
  });

  test("a realm first emits server_first and changes nothing", () => {
    const { store, seen } = setup();
    store.serverFirst({ guid: OTHER, id: 457, link: 1, name: "Firsty" });
    expect(store.snapshot()).toEqual({
      count: 0,
      criteria: 0,
      recent: [],
      titles: { chosen: 0, known: [] },
    });
    expect(seen).toEqual([
      { guid: OTHER, id: 457, name: "Firsty", type: "server_first" },
    ]);
  });
});
