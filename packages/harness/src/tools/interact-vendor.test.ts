import { describe, expect, test } from "bun:test";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { contentOf, limitProblem, toolCtx } from "#test-support/ops-fixtures";
import {
  coinage,
  good,
  marniel,
  vendorEvent,
} from "#test-support/vendor-fixtures";

function junkSlot(slot: number, name: string) {
  return {
    bag: 255,
    guid: BigInt(0x90 + slot),
    item: {
      contained: undefined,
      count: 1,
      durability: undefined,
      entry: 7000 + slot,
      flags: 0,
      guid: BigInt(0x90 + slot),
      maxDurability: undefined,
      name,
      owner: undefined,
      quality: 0,
      randomPropertyId: 0,
    },
    region: "backpack" as const,
    slot,
    status: "occupied" as const,
  };
}

async function junkSeller(names: readonly string[]) {
  const t = await marniel([]);
  const inventory = t.handle.getInventoryState();
  const slots = names.map((name, index) => junkSlot(23 + index, name));
  t.handle.getInventoryState = () => ({ ...inventory, slots });
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
    const body = res.body.join("\n");
    expect(body).toContain("Refreshing Spring Water 25 copper");
    expect(body).toContain("Tough Hunk of Bread 25 copper");
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

  test("an unanswered buy is unconfirmed and stops buying", async () => {
    const t = await marniel([good(1, 159, "Refreshing Spring Water")]);
    let calls = 0;
    t.handle.buyItem = () => {
      calls += 1;
      vendorEvent(t.handle, "unanswered");
    };
    const res = await interactSpec.run(
      { count: 3, do: "buy", npc: "Marniel Amberlight", what: "water" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'journal(about: "bags")',
      reason: "no_answer",
      status: "UNCONFIRMED",
    });
    expect(calls).toBe(1);
  });

  test("sell_junk with every sale refused fails with the reason", async () => {
    const t = await junkSeller(["Broken Fang", "Torn Hide"]);
    t.handle.sellItem = () => vendorEvent(t.handle, "refused", "cant_sell");
    const res = await interactSpec.run(
      { do: "sell_junk", npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'journal(about: "bags")',
      reason: "cant_sell",
      status: "FAILED",
    });
  });

  test("sell_junk stops at the first unanswered sale", async () => {
    const t = await junkSeller(["Broken Fang", "Torn Hide"]);
    let calls = 0;
    t.handle.sellItem = () => {
      calls += 1;
      vendorEvent(t.handle, "unanswered");
    };
    const res = await interactSpec.run(
      { do: "sell_junk", npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_answer", status: "UNCONFIRMED" });
    expect(calls).toBe(1);
  });

  test("sell_junk is partly done when some sales are refused", async () => {
    const t = await junkSeller(["Broken Fang", "Torn Hide"]);
    let calls = 0;
    t.handle.sellItem = () => {
      calls += 1;
      if (calls === 1) vendorEvent(t.handle, "sold");
      else vendorEvent(t.handle, "refused", "cant_sell");
    };
    const res = await interactSpec.run(
      { do: "sell_junk", npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'journal(about: "bags")',
      reason: "cant_sell",
      status: "PARTLY",
    });
    expect(res.after.sold).toHaveLength(1);
  });
});
