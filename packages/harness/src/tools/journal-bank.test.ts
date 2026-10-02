import { describe, expect, test } from "bun:test";
import { journalTool } from "#harness/tools/journal";
import type { MockHandle, TestRuntime } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type SlotInit = {
  bag: number;
  slot: number;
  region: string;
  guid: bigint | undefined;
  entry: number | undefined;
  name: string | undefined;
  count?: number;
};

function slotOf(item: SlotInit) {
  return {
    bag: item.bag,
    guid: item.guid,
    item: {
      contained: undefined,
      count: item.count ?? 1,
      durability: undefined,
      entry: item.entry,
      flags: 0,
      guid: item.guid,
      maxDurability: undefined,
      name: item.name,
      owner: undefined,
      quality: 1,
      randomPropertyId: 0,
    },
    region: item.region,
    slot: item.slot,
    status: item.guid === undefined ? "empty" : "occupied",
  } as never;
}

function banked(
  handle: MockHandle,
  items: SlotInit[],
  bagSlots: number | undefined = 0,
): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    bank: { bags: [], issues: [], slots: items.map(slotOf) },
  });
  Object.assign(handle.bank, {
    state: () => ({
      bagSlots,
      banker: undefined,
      lastOutcome: undefined,
      lastSlotResult: undefined,
      pending: undefined,
    }),
  });
  handle.itemLabel = ((entry: number) =>
    entry === 2589 ? { name: "Linen Cloth", quality: 1 } : undefined) as never;
}

const CLOTH: SlotInit = {
  bag: 255,
  count: 20,
  entry: 2589,
  guid: 0x40_00_00_00_00_00_00_21n,
  name: "Linen Cloth",
  region: "bank",
  slot: 39,
};

async function world(): Promise<TestRuntime> {
  return await createTestRuntime();
}

describe("journal about bank", () => {
  test("it lists the stored cloth with free and bag slots", async () => {
    const t = await world();
    banked(t.handle, [CLOTH, { ...CLOTH, guid: 0x22n, slot: 40 }]);
    const out = await runTool(journalTool.definition(t.rt), {
      about: "bank",
    });
    expect(out.details.result.status).toBe("DONE");
    expect(out.text).toContain("Linen Cloth");
    expect(out.text).toContain("x20");
    expect(out.text).toContain("26 free bank slots");
    expect(out.text).toContain("0 bag slots");
    expect(out.details.result.after).toMatchObject({ about: "bank" });
  });

  test("an empty bank names the free slots", async () => {
    const t = await world();
    banked(t.handle, []);
    const out = await runTool(journalTool.definition(t.rt), {
      about: "bank",
    });
    expect(out.text).toContain("Bank: empty.");
    expect(out.text).toContain("28 free bank slots");
  });

  test("bank bags read away from the banker", async () => {
    const t = await world();
    banked(t.handle, [
      {
        bag: 67,
        count: 5,
        entry: 2589,
        guid: 0x23n,
        name: "Linen Cloth",
        region: "bank_bag_item",
        slot: 1,
      },
    ]);
    const open = t.handle.bank.act.openBank;
    const out = await runTool(journalTool.definition(t.rt), {
      about: "bank",
    });
    expect(out.text).toContain("Linen Cloth");
    expect(t.handle.bank.act.openBank).toBe(open);
  });

  test("a full bank still fits the line cap", async () => {
    const t = await world();
    banked(
      t.handle,
      Array.from({ length: 28 }, (_, index) => ({
        bag: 255,
        count: 20,
        entry: 1000 + index,
        guid: BigInt(0x30 + index),
        name: `Trade Good ${index}`,
        region: "bank",
        slot: 39 + index,
      })),
    );
    const out = await runTool(journalTool.definition(t.rt), {
      about: "bank",
    });
    expect(out.text.split("\n").length).toBeLessThanOrEqual(24);
    expect(out.text).toContain("Trade Good 0");
  });
  test("a sparse live bank still reports the true free count", async () => {
    const t = await world();
    const sparse = Array.from({ length: 28 }, (_, index) => ({
      bag: 255,
      region: "bank",
      slot: 39 + index,
      ...(index < 2
        ? {
            count: 20,
            entry: 2589,
            guid: BigInt(0x30 + index),
            name: "Linen Cloth",
          }
        : {
            count: undefined,
            entry: undefined,
            guid: undefined,
            name: undefined,
          }),
    }));
    banked(t.handle, sparse);
    const out = await runTool(journalTool.definition(t.rt), { about: "bank" });
    expect(out.text).toContain("26 free bank slots");
  });

  test("an unknown bank says so", async () => {
    const t = await world();
    const inventory = t.handle.getInventoryState();
    t.handle.getInventoryState = () => ({ ...inventory, bank: undefined });
    const out = await runTool(journalTool.definition(t.rt), {
      about: "bank",
    });
    expect(out.text).toContain("unknown");
  });
});
