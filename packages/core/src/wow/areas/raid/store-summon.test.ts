import { describe, expect, test } from "bun:test";
import { SummonStore } from "#wow/areas/raid/store-summon";

const TOM = 0x10n;
const ANN = 0x20n;

describe("summon store", () => {
  test("a request holds the offer until now plus the packet timeout", () => {
    const store = new SummonStore();
    const event = store.receive(
      { summoner: TOM, timeoutMs: 120_000, zoneId: 3430 },
      1000,
      "Tom",
      "Eversong Woods",
    );
    expect(event).toEqual({
      expiresAt: 121_000,
      name: "Tom",
      summoner: TOM,
      timeoutMs: 120_000,
      type: "summon_requested",
      zoneId: 3430,
      zoneName: "Eversong Woods",
    });
    expect(store.current()).toEqual({
      expiresAt: 121_000,
      name: "Tom",
      summoner: TOM,
      zoneId: 3430,
      zoneName: "Eversong Woods",
    });
  });

  test("a second request replaces the first", () => {
    const store = new SummonStore();
    store.receive({ summoner: TOM, timeoutMs: 5000, zoneId: 1 }, 0, "Tom");
    store.receive({ summoner: ANN, timeoutMs: 9000, zoneId: 2 }, 100, "Ann");
    expect(store.current()?.summoner).toBe(ANN);
    expect(store.current()?.expiresAt).toBe(9100);
  });

  test("expiry clears the offer it was set for and reports it once", () => {
    const store = new SummonStore();
    store.receive({ summoner: TOM, timeoutMs: 5000, zoneId: 1 }, 0, "Tom");
    expect(store.expire(5000)).toEqual({
      name: "Tom",
      summoner: TOM,
      type: "summon_expired",
    });
    expect(store.current()).toBeUndefined();
    expect(store.expire(5000)).toBeUndefined();
  });

  test("an old expiry does not clear a newer offer", () => {
    const store = new SummonStore();
    store.receive({ summoner: TOM, timeoutMs: 5000, zoneId: 1 }, 0, "Tom");
    store.receive({ summoner: TOM, timeoutMs: 5000, zoneId: 1 }, 3000, "Tom");
    expect(store.expire(5000)).toBeUndefined();
    expect(store.current()?.expiresAt).toBe(8000);
  });

  test("clear drops the offer", () => {
    const store = new SummonStore();
    store.receive({ summoner: TOM, timeoutMs: 5000, zoneId: 1 }, 0, "Tom");
    store.clear();
    expect(store.current()).toBeUndefined();
  });
});
