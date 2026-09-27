import { describe, expect, test } from "bun:test";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { toolCtx } from "#test-support/ops-fixtures";
import { good, marniel, vendorEvent } from "#test-support/vendor-fixtures";

const LATE_MS = 120;
const STOCK = [good(1, 117, "Tough Jerky"), good(2, 1179, "Ice Cold Water")];

async function buyWith(what: string | undefined) {
  const t = await marniel(STOCK, LATE_MS);
  const slots: number[] = [];
  t.handle.buyItem = (slot) => {
    slots.push(slot);
    vendorEvent(t.handle, "bought");
  };
  const run = interactSpec.run(
    { do: "buy", npc: "Marniel Amberlight", what },
    toolCtx<InteractAfter>(t),
  );
  return { run, slots };
}

describe("interact vendor item names", () => {
  test("talk waits for late names before listing the stock", async () => {
    const t = await marniel(STOCK, LATE_MS);
    const res = await interactSpec.run(
      { npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.body).toContain(
      "Sells: Tough Jerky 25 copper, Ice Cold Water 25 copper.",
    );
    expect(res.after.stock?.map((line) => line.name)).toEqual([
      "Tough Jerky",
      "Ice Cold Water",
    ]);
  });

  test("buy without what lists late names and offers a name", async () => {
    const { run } = await buyWith(undefined);
    await expect(run).rejects.toMatchObject({
      body: ["1. Tough Jerky 25 copper", "2. Ice Cold Water 25 copper"],
      next: 'interact(do: "buy", npc: "u1", what: "Tough Jerky")',
      reason: "what_needed",
    });
  });

  test("buy accepts the item id form after names resolve", async () => {
    const { run, slots } = await buyWith("item 1179");
    const res = await run;
    expect(res.status).toBe("DONE");
    expect(res.detail).toContain("bought Ice Cold Water x5");
    expect(slots).toEqual([2]);
  });

  test("buy accepts the list number and the name", async () => {
    const byLine = await buyWith("2");
    expect((await byLine.run).status).toBe("DONE");
    expect(byLine.slots).toEqual([2]);
    const byName = await buyWith("jerky");
    expect((await byName.run).status).toBe("DONE");
    expect(byName.slots).toEqual([1]);
  });
});

describe("interact vendor unresolved names", () => {
  test("after the bound, ids are listed and item <id> picks exactly", async () => {
    const t = await marniel(STOCK.map((line) => ({ ...line, name: null })));
    const slots: number[] = [];
    t.handle.buyItem = (slot) => {
      slots.push(slot);
      vendorEvent(t.handle, "bought");
    };
    const res = await interactSpec.run(
      { do: "buy", npc: "Marniel Amberlight", what: "item 117" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toContain("bought item 117 x5");
    expect(slots).toEqual([1]);
  });
});
