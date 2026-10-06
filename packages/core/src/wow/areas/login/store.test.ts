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

function withEvents(now: () => number = () => 0) {
  const store = new LoginStore(now);
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
    expect(new LoginStore(() => 0).snapshot()).toEqual({
      accountDataTimes: undefined,
      addons: undefined,
      cacheVersion: undefined,
      danceMoves: undefined,
      features: undefined,
      link: { lastSeq: 0, lastPongAt: undefined, rttMs: undefined },
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
      link: { lastSeq: 0, lastPongAt: undefined, rttMs: undefined },
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

  test("nextPing counts up from 1 with latency 0 before any pong", () => {
    const { store } = withEvents();
    expect(store.nextPing(100)).toEqual({ latencyMs: 0, seq: 1 });
    expect(store.nextPing(200)).toEqual({ latencyMs: 0, seq: 2 });
    expect(store.snapshot().link.lastSeq).toBe(2);
  });

  test("a pong sets the round trip, emits pong, and the next ping carries it", () => {
    let t = 0;
    const { seen, store } = withEvents(() => t);
    store.nextPing(1000);
    t = 1040;
    store.receivePong({ seq: 1 });
    expect(store.snapshot().link).toEqual({
      lastPongAt: 1040,
      lastSeq: 1,
      rttMs: 40,
    });
    expect(seen).toEqual([{ rttMs: 40, seq: 1, type: "pong" }]);
    expect(store.nextPing(2000)).toEqual({ latencyMs: 40, seq: 2 });
  });

  test("a pong answered once is no longer pending", () => {
    let t = 0;
    const { seen, store } = withEvents(() => t);
    store.nextPing(0);
    t = 10;
    store.receivePong({ seq: 1 });
    t = 99;
    store.receivePong({ seq: 1 });
    expect(seen).toHaveLength(1);
    expect(store.snapshot().link.rttMs).toBe(10);
  });

  test("a pong for an unknown sequence changes nothing", () => {
    const { seen, store } = withEvents(() => 50);
    store.nextPing(0);
    store.receivePong({ seq: 7 });
    expect(seen).toEqual([]);
    expect(store.snapshot().link).toEqual({
      lastPongAt: undefined,
      lastSeq: 1,
      rttMs: undefined,
    });
  });

  test("at most 8 pings stay pending, the oldest dropped", () => {
    const { seen, store } = withEvents(() => 100);
    for (let i = 0; i < 9; i++) store.nextPing(i);
    store.receivePong({ seq: 1 });
    expect(seen).toEqual([]);
    store.receivePong({ seq: 2 });
    expect(seen).toEqual([{ rttMs: 99, seq: 2, type: "pong" }]);
  });

  test("the oldest pending ping is dropped even after a pong in between", () => {
    const { seen, store } = withEvents(() => 100);
    for (let i = 0; i < 8; i++) store.nextPing(i);
    store.receivePong({ seq: 5 });
    store.nextPing(8);
    store.nextPing(9);
    store.receivePong({ seq: 1 });
    expect(seen).toEqual([{ rttMs: 96, seq: 5, type: "pong" }]);
    store.receivePong({ seq: 2 });
    expect(seen.at(-1)).toEqual({ rttMs: 99, seq: 2, type: "pong" });
  });
});
