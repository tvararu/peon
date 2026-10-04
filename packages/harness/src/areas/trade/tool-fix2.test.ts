import { expect, test } from "bun:test";
import { tradeSpec } from "#harness/areas/trade/tool";
import { runGive } from "#harness/areas/trade/tool-give";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  CLOTH,
  tradeState,
  WATER,
  WATER_ARG,
  world,
} from "#test-support/trade-fixtures";

test("a give that waits keeps no mutex: stop cancels the pending request", async () => {
  const t = await world();
  const gate = Promise.withResolvers<{ status: "ok" }>();
  t.acts.requestTrade.mockImplementation(() => gate.promise);
  const pending = runGive(
    { do: "give", items: [WATER_ARG], with: "Fgkllpgpdnj" },
    toolCtx(t),
  );
  for (
    let i = 0;
    i < 100 && t.acts.requestTrade.mock.calls.length === 0;
    i += 1
  )
    await Promise.resolve();
  const probe = await t.rt.mutex.run(async () => "free");
  expect(probe).toBe("free");
  tradeState(t.handle, { phase: "requested_out" });
  t.rt.runs.cancel(t.rt.runs.active()?.id ?? "", "tool");
  gate.resolve({ status: "ok" });
  await pending.catch(() => undefined);
  for (let i = 0; i < 100 && t.acts.cancelTrade.mock.calls.length === 0; i += 1)
    await Promise.resolve();
  expect(t.acts.cancelTrade).toHaveBeenCalled();
});

test("a give cancels an opened trade when a later offer fails", async () => {
  const t = await world();
  t.acts.offerItem.mockRejectedValue(new Error("bag slot changed"));
  tradeState(t.handle, { phase: "open" });
  const pending = runGive(
    { do: "give", items: [WATER_ARG], with: "Fgkllpgpdnj" },
    toolCtx(t),
  );
  await expect(pending).rejects.toThrow("bag slot changed");
  expect(t.acts.requestTrade).toHaveBeenCalled();
  expect(t.acts.cancelTrade).toHaveBeenCalled();
});

test("an offer swaps two offered items without a duplicate-slot error", async () => {
  const t = await world();
  tradeState(t.handle, {
    ownOffer: {
      gold: 0,
      items: [
        { count: 1, entry: 159, guid: WATER, slot: 0 },
        { count: 1, entry: 2589, guid: CLOTH, slot: 1 },
      ],
      spell: 0,
      version: 1,
    },
    phase: "open",
  });
  const out = await tradeSpec.run(
    { do: "offer", items: ["Linen Cloth", WATER_ARG] },
    toolCtx(t),
  );
  expect(t.acts.withdrawItem.mock.calls.length).toBeGreaterThan(0);
  expect(out.status).toBe("DONE");
});

test("an answer decline that the server cancels settles DONE", async () => {
  const t = await world();
  tradeState(t.handle, { phase: "requested_in" });
  t.acts.answerTrade.mockResolvedValue({
    reason: "trade_canceled",
    status: "refused",
  });
  const out = await tradeSpec.run({ accept: false, do: "answer" }, toolCtx(t));
  expect(out.status).toBe("DONE");
});

test("an answer decline that the server refuses busy settles DONE", async () => {
  const t = await world();
  tradeState(t.handle, { phase: "requested_in" });
  t.acts.answerTrade.mockResolvedValue({ reason: "busy", status: "refused" });
  const out = await tradeSpec.run({ accept: false, do: "answer" }, toolCtx(t));
  expect(out.status).toBe("DONE");
  expect(out.detail).toContain("Declined");
});
