import { describe, expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import { ITEM_NAME_WAIT_MS } from "#harness/ops/item-names";
import { engageSpec } from "#harness/tools/engage";
import {
  field,
  KILL,
  lootsFang,
  namedLater,
  outcome,
  pushItem,
  STALKER,
  tactics,
  xp,
} from "#test-support/engage-fixtures";
import { fakeTimed } from "#test-support/fake-time";
import { attackBy, contentOf, die, toolCtx } from "#test-support/ops-fixtures";

describe("engage loot names", () => {
  test("a death while a loot name is pending still reports died", async () => {
    const t = await field();
    tactics(t.handle, () => {
      attackBy(t.handle, STALKER);
      pushItem(t.handle, 4813);
      die(t.handle);
    });
    const started = performance.now();
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(performance.now() - started).toBeLessThan(ITEM_NAME_WAIT_MS / 4);
    expect(res).toMatchObject({
      next: "recover()",
      reason: "died",
      status: "FAILED",
    });
    expect(res.detail).toContain("killed you");
    expect(res.after.loot).toEqual([
      { count: 1, itemId: 4813, name: "item 4813", quality: null },
    ]);
  });

  test("loot named late by the server is reported by name", async () => {
    const t = await field();
    tactics(t.handle, (runId) => {
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle, null);
    const { run } = await fakeTimed(() => {
      namedLater(t.handle, 7073, "Broken Fang", 60);
      return engageSpec.run(
        { target: "Springpaw Stalker" },
        toolCtx<EngageAfter>(t),
      );
    }, ITEM_NAME_WAIT_MS);
    expect(contentOf(await run)).toContain("Looted Broken Fang x1, 12 copper.");
  });
});
