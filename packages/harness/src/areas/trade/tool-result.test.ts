import { describe, expect, test } from "bun:test";
import {
  elapse,
  fakeAwait,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { tradeSpec } from "#harness/areas/trade/tool";
import { ITEM_NAME_WAIT_MS } from "#harness/ops/item-names";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  CLOTH_ARG,
  PARTNER,
  tradeActs,
  tradeState,
  world,
} from "#test-support/trade-fixtures";

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

describe("a completed give", () => {
  test("says what each side gave, with names and counts", async () => {
    const t = await world();
    t.handle.itemLabel = ((entry: number) => {
      const name = NAMES[entry];
      return name === undefined
        ? { name: null, quality: null }
        : { name, quality: 1 };
    }) as never;
    tradeState(t.handle, { lastOutcome: COMPLETED, phase: "open" });
    const out = await tradeSpec.run(
      { do: "give", items: [CLOTH_ARG], with: "Fgkllpgpdnj" },
      toolCtx(t),
    );
    const said = text(out);
    expect(said).toContain("Linen Cloth");
    expect(said).toContain("20 Tough Jerky");
  });
});

function lateNamedWorld(afterMs: number) {
  return world().then((t) => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, afterMs);
    t.handle.itemLabel = ((entry: number) => {
      const name = NAMES[entry];
      return ready && name !== undefined
        ? { name, quality: 1 }
        : { name: null, quality: null };
    }) as never;
    return t;
  });
}

describe("a completed trade whose item names are still loading", () => {
  test("accept waits for the names instead of printing item ids", async () => {
    await withFakeTimers(async () => {
      const t = await lateNamedWorld(300);
      tradeState(t.handle, { lastOutcome: COMPLETED, phase: "open" });
      const running = tradeSpec.run({ do: "accept" }, toolCtx(t));
      const said = text(await fakeAwait(running, ITEM_NAME_WAIT_MS));
      expect(said).toContain("20 Tough Jerky");
      expect(said).toContain("Linen Cloth");
      expect(said).not.toContain("item 117");
    });
  });

  test("give waits for the names instead of printing item ids", async () => {
    await withFakeTimers(async () => {
      const t = await lateNamedWorld(300);
      tradeState(t.handle, { lastOutcome: COMPLETED, phase: "open" });
      const running = tradeSpec.run(
        { do: "give", items: [CLOTH_ARG], with: "Fgkllpgpdnj" },
        toolCtx(t),
      );
      const said = text(await fakeAwait(running, ITEM_NAME_WAIT_MS));
      expect(said).toContain("20 Tough Jerky");
      expect(said).not.toContain("item 117");
    });
  });

  test("falls back to the item id once the wait is over", async () => {
    await withFakeTimers(async () => {
      const t = await lateNamedWorld(ITEM_NAME_WAIT_MS * 10);
      tradeState(t.handle, { lastOutcome: COMPLETED, phase: "open" });
      const running = tradeSpec.run({ do: "accept" }, toolCtx(t));
      const said = text(await fakeAwait(running, ITEM_NAME_WAIT_MS * 2));
      expect(said).toContain("20 item 117");
    });
  });

  test("an aborted run stops waiting and still answers", async () => {
    await withFakeTimers(async () => {
      const t = await lateNamedWorld(ITEM_NAME_WAIT_MS * 10);
      tradeState(t.handle, { lastOutcome: COMPLETED, phase: "open" });
      const abort = new AbortController();
      const running = tradeSpec.run({ do: "accept" }, toolCtx(t, abort.signal));
      await elapse(100);
      abort.abort();
      const said = text(await fakeAwait(running, 200));
      expect(said).toContain("completed");
    });
  });

  test("show reports the past trade with names that arrive late", async () => {
    await withFakeTimers(async () => {
      const t = await lateNamedWorld(300);
      tradeState(t.handle, { lastOutcome: COMPLETED, phase: "closed" });
      const running = tradeSpec.run({ do: "show" }, toolCtx(t));
      const said = text(await fakeAwait(running, ITEM_NAME_WAIT_MS));
      expect(said).toContain("20 Tough Jerky");
    });
  });
});

describe("the non-traded service slot", () => {
  const SERVICE = {
    ...COMPLETED,
    got: {
      ...COMPLETED.got,
      items: [
        { count: 20, entry: 117, guid: undefined, slot: 5 },
        { count: 1, entry: 2589, guid: undefined, slot: 6 },
      ],
    },
  };

  test("accept does not claim an item in slot 6 was received", async () => {
    const t = await namedWorld();
    tradeState(t.handle, { lastOutcome: SERVICE, phase: "open" });
    const out = await tradeSpec.run({ do: "accept" }, toolCtx(t));
    const said = text(out);
    expect(said).toContain("20 Tough Jerky");
    expect(said.split("you got")[1]).not.toContain("Linen Cloth");
  });

  test("the past trade does not claim it either", async () => {
    const t = await namedWorld();
    tradeState(t.handle, { lastOutcome: SERVICE, phase: "closed" });
    const out = await tradeSpec.run({ do: "show" }, toolCtx(t));
    expect(text(out).split("you got")[1]).not.toContain("Linen Cloth");
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
