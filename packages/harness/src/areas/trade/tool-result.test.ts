import { describe, expect, test } from "bun:test";
import { tradeSpec } from "#harness/areas/trade/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { PARTNER, tradeActs, tradeState } from "#test-support/trade-fixtures";

const COMPLETED = {
  gave: {
    gold: 0,
    items: [{ count: 1, entry: 2589, guid: 0x40n, slot: 0 }],
    spell: 0,
    version: 1,
  },
  got: {
    gold: 0,
    items: [{ count: 20, entry: 117, guid: undefined, slot: 0 }],
    spell: 0,
    version: 2,
  },
  kind: "completed",
};

const NAMES: Record<number, string> = {
  117: "Tough Jerky",
  2589: "Linen Cloth",
};

async function namedWorld() {
  const t = await createTestRuntime({});
  t.handle.itemLabel = ((entry: number) => {
    const name = NAMES[entry];
    return name === undefined
      ? { name: null, quality: null }
      : { name, quality: 1 };
  }) as never;
  const acts = tradeActs(t.handle);
  return { ...t, acts };
}

function text(out: { detail: string; body: string[] }): string {
  return [out.detail, ...out.body].join("\n");
}

describe("a completed trade", () => {
  test("accept says what each side gave and got, with names and counts", async () => {
    const t = await namedWorld();
    tradeState(t.handle, { lastOutcome: COMPLETED, phase: "open" });
    const out = await tradeSpec.run({ do: "accept" }, toolCtx(t));
    const said = text(out);
    expect(said).toContain("Linen Cloth");
    expect(said).toContain("20 Tough Jerky");
  });

  test("accept of an empty give says it gave nothing", async () => {
    const t = await namedWorld();
    tradeState(t.handle, {
      lastOutcome: {
        ...COMPLETED,
        gave: { gold: 0, items: [], spell: 0, version: 0 },
      },
      phase: "open",
    });
    const out = await tradeSpec.run({ do: "accept" }, toolCtx(t));
    expect(text(out)).toContain("nothing");
  });
});

describe("trade show without an open trade", () => {
  test("says no trade is open and does not print the last offer as current", async () => {
    const t = await namedWorld();
    tradeState(t.handle, {
      lastOutcome: COMPLETED,
      phase: "closed",
      theirOffer: COMPLETED.got,
      with: PARTNER,
    });
    const out = await tradeSpec.run({ do: "show" }, toolCtx(t));
    expect(out.detail).toContain("No trade is open");
    expect(out.body.join("\n")).not.toContain("their offer");
    expect(out.body.join("\n")).not.toContain("version");
  });

  test("reports the last completed trade as past", async () => {
    const t = await namedWorld();
    tradeState(t.handle, { lastOutcome: COMPLETED, phase: "closed" });
    const out = await tradeSpec.run({ do: "show" }, toolCtx(t));
    expect(text(out)).toContain("20 Tough Jerky");
    expect(text(out)).toContain("completed");
  });
});
