import { describe, expect, test } from "bun:test";
import type { NamedVendorGood, VendorEvent } from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
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

const MARNIEL = 0x10n;

function good(slot: number, itemId: number, name: string): NamedVendorGood {
  return {
    buyCount: 5,
    displayId: 0,
    extendedCost: 0,
    itemId,
    maxDurability: 0,
    name,
    price: 25,
    quality: 1,
    slot,
    stock: null,
  };
}

function coinage(handle: MockHandle, copper: number): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    coinage: copper,
    freeSlots: 10,
  });
}

function vendorEvent(
  handle: MockHandle,
  type: VendorEvent["type"],
  reason?: string,
): void {
  const state = handle.getVendorState();
  const lastOutcome = reason
    ? {
        action: "buy" as const,
        coinageAfter: undefined,
        moneyDelta: undefined,
        observedAt: 0,
        reason,
        request: {
          action: "buy" as const,
          answer: undefined,
          coinageBefore: undefined,
          count: 1,
          guid: MARNIEL,
          itemId: 159,
          maxPrice: 25,
          minPrice: 25,
          requestedAt: 0,
          slot: 1,
        },
        status: "refused" as const,
      }
    : state.lastOutcome;
  handle.triggerVendorEvent({ at: 0, state: { ...state, lastOutcome }, type });
}

async function marniel(goods: readonly NamedVendorGood[]) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: MARNIEL,
      name: "Marniel Amberlight",
      relation: "friendly",
      roles: ["vendor"],
      x: 3,
      y: 0,
    }),
  ]);
  coinage(t.handle, 50_000);
  t.handle.talk = () =>
    t.handle.triggerQuestEvent({
      source: "packet",
      state: t.handle.getQuestState(),
      type: "window",
    });
  t.handle.openVendor = (guid) => {
    const state = t.handle.getVendorState();
    const window = {
      emptyReason: undefined,
      guid,
      invalidatedReason: undefined,
      items: [...goods],
      openedAt: 0,
    };
    t.handle.getVendorState = () => ({ ...state, window });
    vendorEvent(t.handle, "listed");
  };
  return t;
}

describe("interact vendor", () => {
  test("buy matches part of a name and settles on the purchase", async () => {
    const t = await marniel([
      good(1, 159, "Refreshing Spring Water"),
      good(2, 4540, "Tough Hunk of Bread"),
    ]);
    const slots: number[] = [];
    t.handle.buyItem = (slot) => {
      slots.push(slot);
      coinage(t.handle, 49_975);
      vendorEvent(t.handle, "bought");
    };
    const res = await interactSpec.run(
      { do: "buy", npc: "Marniel Amberlight", what: "water" },
      toolCtx<InteractAfter>(t),
    );
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      "DONE bought Refreshing Spring Water x5 for 25 copper (money 5g 0s 0c -> 4g 99s 75c). Bags: 10 free.",
    );
    expect(slots).toEqual([1]);
  });

  test("two different matches refuse with ready calls", async () => {
    const t = await marniel([
      good(1, 159, "Refreshing Spring Water"),
      good(2, 1179, "Ice Cold Water"),
    ]);
    await expect(
      interactSpec.run(
        { do: "buy", npc: "Marniel Amberlight", what: "water" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: [
        expect.stringContaining('what: "Refreshing Spring Water"'),
        expect.stringContaining('what: "Ice Cold Water"'),
      ],
      reason: "ambiguous_item",
    });
  });

  test("a refused purchase fails with the vendor's reason", async () => {
    const t = await marniel([good(1, 159, "Refreshing Spring Water")]);
    t.handle.buyItem = () =>
      vendorEvent(t.handle, "refused", "not_enough_money");
    const res = await interactSpec.run(
      { do: "buy", npc: "Marniel Amberlight", what: "water" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ reason: "not_enough_money", status: "FAILED" });
  });

  test("talk on a vendor lists the stock", async () => {
    const t = await marniel([
      good(1, 159, "Refreshing Spring Water"),
      good(2, 4540, "Tough Hunk of Bread"),
    ]);
    const res = await interactSpec.run(
      { npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.body).toContain(
      "Sells: Refreshing Spring Water 25 copper, Tough Hunk of Bread 25 copper.",
    );
    expect(res.after.stock).toHaveLength(2);
  });

  test("sell_junk sells every grey item in the bags", async () => {
    const t = await marniel([]);
    const inventory = t.handle.getInventoryState();
    const fang = {
      bag: 255,
      guid: 0x99n,
      item: {
        contained: undefined,
        count: 2,
        durability: undefined,
        entry: 7073,
        flags: 0,
        guid: 0x99n,
        maxDurability: undefined,
        name: "Broken Fang",
        owner: undefined,
        quality: 0,
        randomPropertyId: 0,
      },
      region: "backpack" as const,
      slot: 23,
      status: "occupied" as const,
    };
    t.handle.getInventoryState = () => ({ ...inventory, slots: [fang] });
    const sold: number[] = [];
    t.handle.sellItem = (_bag, slot) => {
      sold.push(slot);
      const after = t.handle.getInventoryState();
      t.handle.getInventoryState = () => ({ ...after, coinage: 50_004 });
      vendorEvent(t.handle, "sold");
    };
    const res = await interactSpec.run(
      { do: "sell_junk", npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(sold).toEqual([23]);
    expect(res).toMatchObject({
      detail:
        "sold 1 of 1 junk items for 4 copper (money 5g 0s 0c -> 5g 0s 4c).",
      status: "DONE",
    });
    expect(res.after.sold).toEqual([
      { count: 2, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
  });
});
