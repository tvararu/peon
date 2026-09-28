import { describe, expect, test } from "bun:test";
import { type LoginEvent, LoginStore } from "#wow/areas/login/store";

const FLAGS = [1, 2, 3, 4, 5, 6, 7, 8];
const TIMES = {
  mask: 0xea,
  serverTime: 1_790_000_000,
  times: [
    [1, 11],
    [3, 33],
  ] as const,
};

function withEvents() {
  const store = new LoginStore();
  const seen: LoginEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

function worldEntry(store: LoginStore): void {
  store.receiveAddonInfo({
    addons: [
      { keyed: true, state: 2 },
      { keyed: false, state: 2 },
      { keyed: true, state: 2 },
    ],
    banned: [{ id: 4 }],
  });
  store.receiveClientCacheVersion({ version: 3 });
  store.receiveTutorialFlags({ flags: FLAGS });
  store.receiveAccountDataTimes(TIMES);
  store.receiveFeatureSystemStatus({ complaints: 2, voice: 0 });
}

describe("LoginStore", () => {
  test("starts empty", () => {
    expect(new LoginStore().snapshot()).toEqual({
      accountDataTimes: undefined,
      addons: undefined,
      cacheVersion: undefined,
      danceMoves: undefined,
      features: undefined,
      tutorials: undefined,
    });
  });

  test("each packet fills its part of the state", () => {
    const { store } = withEvents();
    worldEntry(store);
    store.receiveLearnedDanceMoves({ moves: [0, 0] });
    expect(store.snapshot()).toEqual({
      accountDataTimes: TIMES,
      addons: { banned: 1, count: 3, keyed: 2 },
      cacheVersion: 3,
      danceMoves: [0, 0],
      features: { complaints: 2, voice: 0 },
      tutorials: FLAGS,
    });
  });

  test("login_noise fires once, on the first dance moves packet", () => {
    const { seen, store } = withEvents();
    worldEntry(store);
    expect(seen.map((e) => e.type)).toEqual(["account_data_times"]);
    store.receiveLearnedDanceMoves({ moves: [0, 0] });
    store.receiveAccountDataTimes(TIMES);
    store.receiveLearnedDanceMoves({ moves: [0, 0] });
    expect(seen).toEqual([
      { mask: 0xea, type: "account_data_times" },
      {
        addons: 3,
        cacheVersion: 3,
        complaints: 2,
        keyed: 2,
        type: "login_noise",
        voice: 0,
      },
      { mask: 0xea, type: "account_data_times" },
    ]);
  });

  test("login_noise reports zeros for packets that never came", () => {
    const { seen, store } = withEvents();
    store.receiveLearnedDanceMoves({ moves: [0, 0] });
    expect(seen).toEqual([
      {
        addons: 0,
        cacheVersion: 0,
        complaints: 0,
        keyed: 0,
        type: "login_noise",
        voice: 0,
      },
    ]);
  });

  test("account_data_times fires on each packet with its mask", () => {
    const { seen, store } = withEvents();
    store.receiveAccountDataTimes({ mask: 0x15, serverTime: 1, times: [] });
    store.receiveAccountDataTimes(TIMES);
    expect(seen).toEqual([
      { mask: 0x15, type: "account_data_times" },
      { mask: 0xea, type: "account_data_times" },
    ]);
    expect(store.snapshot().accountDataTimes?.mask).toBe(0xea);
  });

  test("snapshot is a detached copy", () => {
    const { store } = withEvents();
    const flags = [...FLAGS];
    worldEntry(store);
    store.receiveTutorialFlags({ flags });
    flags[0] = 99;
    const first = store.snapshot();
    const second = store.snapshot();
    expect(first.tutorials).toEqual(FLAGS);
    expect(first.tutorials).not.toBe(second.tutorials);
    expect(first.accountDataTimes?.times).not.toBe(
      second.accountDataTimes?.times,
    );
    expect(first.addons).not.toBe(second.addons);
  });

  test("dispose clears listeners", () => {
    const { seen, store } = withEvents();
    store.dispose();
    store.receiveAccountDataTimes(TIMES);
    expect(seen).toEqual([]);
  });
});
