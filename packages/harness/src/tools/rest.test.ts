import { describe, expect, jest, test } from "bun:test";
import type { RestAfter } from "#harness/contract/details";
import { restSpec } from "#harness/tools/rest";
import {
  attackBy,
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const STALKER = 0x20n;
const DRINK_SPELL = 430;

function water(handle: MockHandle, count: number): void {
  const inventory = handle.getInventoryState();
  const slot = {
    bag: 255,
    guid: 0x77n,
    item: {
      contained: undefined,
      count,
      durability: undefined,
      entry: 159,
      flags: 0,
      guid: 0x77n,
      itemClass: 0,
      maxDurability: undefined,
      name: "Refreshing Spring Water",
      owner: undefined,
      quality: 1,
      randomPropertyId: 0,
      subclass: 5,
      useSpellIds: [DRINK_SPELL],
    },
    region: "backpack" as const,
    slot: 23,
    status: "occupied" as const,
  };
  handle.getInventoryState = () => ({ ...inventory, slots: [slot] });
}

function drinkAura(handle: MockHandle): void {
  const state = handle.getCombatState();
  const aura = {
    caster: 0n,
    duration: 18_000,
    flags: 0,
    level: 1,
    slot: 0,
    spellId: DRINK_SPELL,
    stacks: 1,
    timeLeft: 18_000,
  };
  handle.triggerCombatEvent({
    state: { ...state, auras: [aura] },
    type: "aura",
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("rest", () => {
  test("drinks, confirms the aura and stops at the threshold", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 60 });
    water(t.handle, 5);
    const used: number[] = [];
    t.handle.useItem = async (_bag, slot) => {
      used.push(slot);
      setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 285 });
      water(t.handle, 4);
      drinkAura(t.handle);
    };
    const res = await restSpec.run({}, toolCtx<RestAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(used).toEqual([23]);
    expect(text).toBe(
      "DONE rested 0 s with Refreshing Spring Water: HP 200/200, mana 95%. 4 food and drink left.",
    );
    expect(res.after).toMatchObject({ auraConfirmed: true, idle: false });
  });

  test("with no food it idles 30 s and says how far another rest gets", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 100, maxHp: 200, maxPower: 300, power: 150 });
      let done = false;
      const pending = restSpec.run({}, toolCtx<RestAfter>(t)).finally(() => {
        done = true;
      });
      for (let tick = 0; tick < 40 && !done; tick += 1) {
        jest.advanceTimersByTime(1000);
        await flush();
      }
      const res = await pending;
      expect(res).toMatchObject({
        after: { durationMs: 30_000, idle: true },
        reason: "time_limit",
        status: "PARTLY",
      });
      expect(res.detail).toBe(
        "rested 30 s without food or drink: HP 100/200, mana 50%. Another rest() will not reach 90% without food or drink.",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("an attacker stops the rest with an engage step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    setUnits(t.handle, [
      unitRow({
        distance: 5,
        guid: STALKER,
        level: 7,
        name: "Springpaw Stalker",
        x: 5,
        y: 0,
      }),
    ]);
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    await Bun.sleep(5);
    attackBy(t.handle, STALKER);
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.detail).toMatch(
      /^Springpaw Stalker \(u\d+\) hit you while resting \(HP 100\/200\)\.$/,
    );
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
  });

  test("refuses while an attacker is on you", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    setUnits(t.handle, [
      unitRow({
        distance: 5,
        guid: STALKER,
        level: 7,
        name: "Springpaw Stalker",
        x: 5,
        y: 0,
      }),
    ]);
    attackBy(t.handle, STALKER);
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { reason: "in_combat" },
    );
  });

  test("refuses when dead", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { next: "recover()", reason: "dead" },
    );
  });

  test("human text yields RUNNING with vitals", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toStartWith(
      "resting, 0 s so far. You: HP 100/200, mana 100%, at 0, 0.",
    );
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
