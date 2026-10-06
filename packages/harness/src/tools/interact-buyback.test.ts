import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import type { InteractAfter } from "#harness/contract/details";

type BuybackEvent = AreaEventOf<"buyback">;

import { interactSpec } from "#harness/tools/interact";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";
import type { TestRuntime } from "#test-support/runtime-fixture";
import { coinage, marniel } from "#test-support/vendor-fixtures";

const SOLD = {
  count: 1,
  entry: 2589,
  guid: 0x77n,
  price: 35,
  slot: 74,
  soldAt: 10,
};

function buybackList(t: TestRuntime) {
  const state = { ...t.handle.buyback.state(), list: [SOLD] };
  Object.assign(t.handle, {
    buyback: { ...t.handle.buyback, state: () => state },
  });
  t.handle.itemLabel = ((entry: number) =>
    entry === 2589
      ? { name: "Linen Cloth", quality: 1 }
      : undefined) as typeof t.handle.itemLabel;
}

function buybackEvent(t: TestRuntime, event: BuybackEvent) {
  t.handle.triggerAreaEvent("buyback", event);
}

describe("interact buyback", () => {
  test("a named item in the list opens the vendor, buys back and reports", async () => {
    const t = await marniel([]);
    buybackList(t);
    const slots: number[] = [];
    jest.spyOn(t.handle.buyback.act, "buyback").mockImplementation((slot) => {
      slots.push(slot);
      coinage(t.handle, 49_965);
      buybackEvent(t, {
        entry: 2589,
        guid: 0x77n,
        slot: 74,
        type: "bought_back",
      });
      return Promise.resolve({ status: "ok" as const });
    });
    const res = await interactSpec.run(
      { do: "buyback", npc: "Marniel Amberlight", what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(slots).toEqual([74]);
    expect(res.status).toBe("DONE");
    const text = contentOf(res);
    expect(text).toContain("Linen Cloth");
    expect(text).toContain("35 copper");
  });

  test("a name not in the list refuses and names what is there", async () => {
    const t = await marniel([]);
    buybackList(t);
    const buyback = jest.spyOn(t.handle.buyback.act, "buyback");
    await expect(
      interactSpec.run(
        { do: "buyback", npc: "Marniel Amberlight", what: "bread" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: ['what: "Linen Cloth"'],
      reason: "not_in_buyback",
    });
    expect(buyback).not.toHaveBeenCalled();
  });

  test("a refused buyback fails with the vendor reason", async () => {
    const t = await marniel([]);
    buybackList(t);
    jest.spyOn(t.handle.buyback.act, "buyback").mockResolvedValue({
      reason: "cant_find_item",
      status: "refused" as const,
    });
    const res = await interactSpec.run(
      { do: "buyback", npc: "Marniel Amberlight", what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({
      reason: "cant_find_item",
      status: "FAILED",
    });
  });

  test("an unanswered buyback is unconfirmed", async () => {
    const t = await marniel([]);
    buybackList(t);
    jest.spyOn(t.handle.buyback.act, "buyback").mockResolvedValue({
      status: "unanswered" as const,
    });
    const res = await interactSpec.run(
      { do: "buyback", npc: "Marniel Amberlight", what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_answer", status: "UNCONFIRMED" });
  });
});
