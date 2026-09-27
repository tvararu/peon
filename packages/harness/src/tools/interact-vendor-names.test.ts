import { describe, expect, test } from "bun:test";
import type { NamedVendorGood } from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import type { Refusal } from "#harness/ops/refusal";
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

describe("interact vendor cancel", () => {
  test("a cancel during the name wait stops talk", async () => {
    const t = await marniel(STOCK, 5000);
    const abort = new AbortController();
    setTimeout(() => abort.abort(new Error("cancelled")), 50);
    const run = interactSpec.run(
      { npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t, abort.signal),
    );
    await expect(run).rejects.toThrow("cancelled");
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

  test("an item <id> the vendor lacks refuses, not a prefix match", async () => {
    const t = await marniel([
      { ...good(1, 1179, "Ice Cold Water"), name: null },
    ]);
    const slots: number[] = [];
    t.handle.buyItem = (slot) => {
      slots.push(slot);
      vendorEvent(t.handle, "bought");
    };
    const run = interactSpec.run(
      { do: "buy", npc: "Marniel Amberlight", what: "item 117" },
      toolCtx<InteractAfter>(t),
    );
    await expect(run).rejects.toMatchObject({ reason: "no_match" });
    expect(slots).toEqual([]);
  });
});

async function buyFrom(stock: readonly NamedVendorGood[], what?: string) {
  const t = await marniel(stock);
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

async function refusalOf(stock: readonly NamedVendorGood[], what?: string) {
  const { run } = await buyFrom(stock, what);
  return run.then(
    () => undefined,
    (error: unknown) => error as Refusal,
  );
}

const WHAT = /what: "([^"]+)"/;

describe("interact buy forms", () => {
  const stock = [good(1, 1179, "Ice Cold Water"), good(2, 159, "Water")];

  test("every listed line buys by its number, its name and item <id>", async () => {
    const refusal = await refusalOf(stock);
    const lines = refusal?.body ?? [];
    expect(lines).toEqual([
      "1. Ice Cold Water 25 copper",
      "2. Water 25 copper",
    ]);
    for (const [index, line] of lines.entries()) {
      const name = line.replace(/^\d+\. /, "").replace(/ 25 copper$/, "");
      const itemId = stock[index]?.itemId;
      for (const what of [String(index + 1), name, `item ${itemId}`]) {
        const { run, slots } = await buyFrom(stock, what);
        expect((await run).status).toBe("DONE");
        expect(slots).toEqual([index + 1]);
      }
    }
  });

  test("the Next line of each refusal buys what it names", async () => {
    for (const what of [undefined, "milk", "wat", "3"]) {
      const next = (await refusalOf(stock, what))?.next ?? "";
      const named = WHAT.exec(next)?.[1];
      expect(named).toBeDefined();
      const { run } = await buyFrom(stock, named);
      expect((await run).status).toBe("DONE");
    }
  });

  test("a number past the list refuses and does not match an item id", async () => {
    const unnamed = stock.map((line) => ({ ...line, name: null }));
    const { run, slots } = await buyFrom(unnamed, "1179");
    await expect(run).rejects.toMatchObject({ reason: "no_match" });
    expect(slots).toEqual([]);
  });

  test("past the bound the Next line uses item <id> and resolves", async () => {
    const unnamed = stock.map((line) => ({ ...line, name: null }));
    const refusal = await refusalOf(unnamed);
    expect(refusal?.next).toBe(
      'interact(do: "buy", npc: "u1", what: "item 1179")',
    );
    const { run, slots } = await buyFrom(unnamed, "item 1179");
    expect((await run).status).toBe("DONE");
    expect(slots).toEqual([1]);
  });
});
