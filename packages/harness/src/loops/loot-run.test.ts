import { describe, expect, test } from "bun:test";
import type { RewardsEvent } from "@peon/core";
import { fakeTimed } from "@peon/core/test-support/fake-time";
import { EventWaiter } from "#harness/loops/event-waiter";
import { lootObject } from "#harness/loops/loot-run";
import { fakeLoot } from "#test-support/encounter-cycle-fixtures";

const idle = new AbortController().signal;

function objectRun(loot: ReturnType<typeof fakeLoot>) {
  const events = new EventWaiter<RewardsEvent>();
  loot.onEvent((event) => events.push(event));
  const bags = {
    questItems: () => new Set<number>(),
    stackSize: async () => undefined,
  };
  return { bags, events, rewards: loot, signal: idle };
}

describe("lootObject", () => {
  test("takes the items and money of the window the server opens for the object", async () => {
    const loot = fakeLoot({
      coinageAfter: 20,
      coinageBefore: 0,
      items: [0, 1],
      money: 20,
    });
    const run = objectRun(loot);
    const looted = lootObject(run, 2n);
    loot.open(2n);
    expect(await looted).toEqual({
      ok: true,
      record: {
        coinageAfter: 20,
        coinageBefore: 0,
        guid: "2",
        moneyTaken: 20,
        slotsLeft: [],
        slotsTaken: [0, 1],
      },
    });
    expect(loot.snapshot().loot.phase).toBe("closed");
  });

  test("never asks the server to open a loot window itself", async () => {
    const loot = fakeLoot({ items: [0] });
    const run = objectRun(loot);
    const looted = lootObject(run, 2n);
    await Bun.sleep(1);
    expect(loot.snapshot().loot.phase).toBe("closed");
    loot.open(2n);
    expect(await looted).toMatchObject({ ok: true });
  });

  test("a failed open stops with the failure reason", async () => {
    const loot = fakeLoot({ openFailure: "cast_failed" });
    const run = objectRun(loot);
    const looted = lootObject(run, 2n);
    loot.open(2n);
    expect(await looted).toEqual({
      cause: "loot_denied:cast_failed",
      ok: false,
    });
  });

  test("no window within 5 s stops as a timeout", async () => {
    const loot = fakeLoot({ items: [0] });
    const { ms, run } = await fakeTimed(
      () => lootObject(objectRun(loot), 2n),
      6000,
    );
    expect(await run).toEqual({ cause: "loot_denied:timeout", ok: false });
    expect(ms).toBeGreaterThanOrEqual(5000);
  });
});
