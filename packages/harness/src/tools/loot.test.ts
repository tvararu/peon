import { describe, expect, test } from "bun:test";
import type { LootAfter } from "#harness/contract/details";
import { lootSpec } from "#harness/tools/loot";
import {
  contentOf,
  driveGoto,
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

const CORPSE = 0x20n;

function corpseRow(distance: number, lootable: boolean) {
  return unitRow({
    distance,
    guid: CORPSE,
    hp: 0,
    level: 7,
    lootable,
    name: "Springpaw Stalker",
    x: distance,
    y: 0,
  });
}

function lootsFang(handle: MockHandle, slotsLeft: number[]): void {
  const base = handle.getRewardsState();
  const open = {
    ...base,
    loot: {
      guid: CORPSE,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          name: "Broken Fang",
          quality: 0,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open" as const,
    },
  };
  const pushed = {
    bagSlot: 255,
    count: 1,
    created: 0,
    guid: 0n,
    itemId: 7073,
    observedAt: 0,
    randomPropertyId: 0,
    randomSuffix: 0,
    received: 1,
    showInChat: 1,
    slot: 0,
    totalCount: 1,
  };
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({ ...inventory, freeSlots: 14 });
  handle.lootCorpse = async () => {
    handle.getRewardsState = () => open;
    handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
    handle.triggerRewardsEvent({
      at: 0,
      state: { ...open, lastItemPush: pushed },
      type: "item_push",
    });
    handle.triggerRewardsEvent({
      at: 0,
      state: {
        ...open,
        lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
      },
      type: "money_notice",
    });
    handle.getRewardsState = () => base;
    return {
      ok: true,
      record: {
        coinageAfter: 12,
        coinageBefore: 0,
        guid: "20",
        moneyTaken: 12,
        slotsLeft,
        slotsTaken: [0],
      },
    };
  };
}

describe("loot", () => {
  test("loots the nearest lootable corpse and names what the server pushed", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(2, true)]);
    lootsFang(t.handle, []);
    const res = await lootSpec.run({}, toolCtx<LootAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toMatch(
      /^DONE looted Springpaw Stalker \(u\d+\): Broken Fang x1, 12 copper\. Window closed\. Bags: 14 free\.$/,
    );
    expect(res.after.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
  });

  test("walks into range first when the corpse is farther than 3 yd", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(12, true)]);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 10, y: 0 } }]);
    lootsFang(t.handle, []);
    const res = await lootSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<LootAfter>(t),
    );
    expect(goTo).toHaveBeenCalledWith({ guid: CORPSE, kind: "guid" });
    expect(res.status).toBe("DONE");
  });

  test("a named corpse without the lootable flag refuses", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(2, false)]);
    await expect(
      lootSpec.run({ target: "Springpaw Stalker" }, toolCtx<LootAfter>(t)),
    ).rejects.toMatchObject({
      next: 'look(find: "lootable")',
      reason: "not_lootable",
    });
  });

  test("no lootable corpse within 30 yd refuses", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(42, true)]);
    await expect(lootSpec.run({}, toolCtx<LootAfter>(t))).rejects.toMatchObject(
      {
        detail: "no lootable corpse within 30 yd.",
        reason: "not_lootable",
      },
    );
  });

  test("a named corpse over 30 yd away refuses with a travel step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(42, true)]);
    const refusal = lootSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<LootAfter>(t),
    );
    await expect(refusal).rejects.toMatchObject({ reason: "too_far" });
    await expect(refusal).rejects.toHaveProperty(
      "next",
      expect.stringMatching(/^travel\(to: "u\d+"\)$/),
    );
  });

  test("items left behind give PARTLY with a bags step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(2, true)]);
    lootsFang(t.handle, [1]);
    const res = await lootSpec.run({}, toolCtx<LootAfter>(t));
    expect(res).toMatchObject({
      next: 'journal(about: "bags")',
      reason: "bags_full",
      status: "PARTLY",
    });
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });
});
