import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { tradeSpec, tradeTool } from "#harness/areas/trade/tool";
import { tradeParams } from "#harness/areas/trade/tool-shared";
import { contentOf, setUnits, toolCtx } from "#test-support/ops-fixtures";
import { expectSendKind } from "#test-support/tool-harness";
import {
  CLOTH,
  CLOTH_ARG,
  PARTNER,
  partnerUnit,
  stocked,
  tradeState,
  WATER,
  WATER_ARG,
  world,
} from "#test-support/trade-fixtures";

function callOf() {
  return {
    arguments: tradeSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

describe("trade tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: tradeParams },
        callOf(),
      ),
    ).toEqual(tradeSpec.minimalArgs);
  });
});

describe("trade show", () => {
  test("show sends nothing and prints both offers with version and flags", async () => {
    const t = await world();
    tradeState(t.handle, {
      ownOffer: { gold: 10, items: [], spell: 0, version: 1 },
      phase: "open",
      selfAccepted: false,
      theirOffer: { gold: 40, items: [], spell: 0, version: 2 },
      theyAccepted: true,
      with: PARTNER,
    });
    const out = await tradeSpec.run({ do: "show" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Fgkllpgpdnj");
    expect(out.body.join("\n")).toContain("version 2");
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });
});

describe("trade give", () => {
  test("give requests, offers each item and gold, then accepts the seen version", async () => {
    const t = await world();
    const out = await tradeSpec.run(
      {
        do: "give",
        gold: 10,
        items: [WATER_ARG, CLOTH_ARG],
        with: "Fgkllpgpdnj",
      },
      toolCtx(t),
    );
    expect(t.acts.requestTrade).toHaveBeenCalledWith(PARTNER);
    expect(t.acts.offerItem).toHaveBeenCalledTimes(2);
    expect(t.acts.offerItem).toHaveBeenNthCalledWith(1, 0, 255, 24);
    expect(t.acts.offerItem).toHaveBeenNthCalledWith(2, 1, 255, 25);
    expect(t.acts.offerGold).toHaveBeenCalledWith(10);
    expect(t.acts.acceptTrade).toHaveBeenCalled();
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Refreshing Spring Water");
    expect(out.detail).toContain("Linen Cloth");
    expect(out.detail).toContain("10 copper");
  });

  test("give reports the whole stack it offers", async () => {
    const t = await world();
    stocked(t.handle, [
      { bag: 255, count: 20, entry: 159, guid: WATER, name: "Water", slot: 24 },
    ]);
    const out = await tradeSpec.run(
      { do: "give", items: ["Water"], with: "Fgkllpgpdnj" },
      toolCtx(t),
    );
    expect(out.detail).toContain("20 Water");
  });

  test("give refuses an equipped item", async () => {
    const t = await world();
    await expect(
      tradeSpec.run(
        { do: "give", items: ["Apprentice's Shirt"], with: "Fgkllpgpdnj" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "equipped_item" });
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });

  test("give refuses an unnamed item without all", async () => {
    const t = await world();
    await expect(
      tradeSpec.run(
        { do: "give", items: ["Missing Boots"], with: "Fgkllpgpdnj" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "no_such_item" });
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });

  test("give refuses a name two carried items share", async () => {
    const t = await world();
    stocked(t.handle, [
      { bag: 255, entry: 159, guid: WATER, name: "Water", slot: 24 },
      { bag: 255, entry: 159, guid: CLOTH, name: "Water", slot: 25 },
    ]);
    await expect(
      tradeSpec.run(
        { do: "give", items: ["Water"], with: "Fgkllpgpdnj" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "ambiguous_item" });
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });

  test("give picks one of two same-name stacks by bag and slot", async () => {
    const t = await world();
    stocked(t.handle, [
      { bag: 255, count: 15, entry: 159, guid: WATER, name: "Water", slot: 24 },
      { bag: 255, count: 5, entry: 159, guid: CLOTH, name: "Water", slot: 25 },
    ]);
    const out = await tradeSpec.run(
      { do: "give", items: ["bag 255 slot 25"], with: "Fgkllpgpdnj" },
      toolCtx(t),
    );
    expect(t.acts.offerItem).toHaveBeenCalledTimes(1);
    expect(t.acts.offerItem).toHaveBeenCalledWith(0, 255, 25);
    expect(out.detail).toContain("5 Water");
  });

  test("give tells the agent to name a bag and slot for two same-name stacks", async () => {
    const t = await world();
    stocked(t.handle, [
      { bag: 255, entry: 159, guid: WATER, name: "Water", slot: 24 },
      { bag: 255, entry: 159, guid: CLOTH, name: "Water", slot: 25 },
    ]);
    await expect(
      tradeSpec.run(
        { do: "give", items: ["Water"], with: "Fgkllpgpdnj" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({
      detail: expect.stringContaining("bag and slot"),
    });
  });

  test("give refuses more than 6 items", async () => {
    const t = await world();
    await expect(
      tradeSpec.run(
        {
          do: "give",
          items: ["a", "b", "c", "d", "e", "f", "g"],
          with: "Fgkllpgpdnj",
        },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "too_many_items" });
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });

  test("give refuses a player out of range", async () => {
    const t = await world();
    setUnits(t.handle, [partnerUnit(40)]);
    await expect(
      tradeSpec.run(
        { do: "give", items: [WATER_ARG], with: "Fgkllpgpdnj" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "too_far" });
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });

  test("give refuses an unknown player", async () => {
    const t = await world();
    setUnits(t.handle, []);
    await expect(
      tradeSpec.run(
        { do: "give", items: [WATER_ARG], with: "Nobody" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "not_seen" });
    expect(t.acts.requestTrade).not.toHaveBeenCalled();
  });

  test("a refused request settles as refused without offering", async () => {
    const t = await world();
    t.acts.requestTrade.mockResolvedValue({
      reason: "target_to_far",
      status: "refused",
    });
    await expect(
      tradeSpec.run(
        { do: "give", items: [WATER_ARG], with: "Fgkllpgpdnj" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "trade_refused" });
    expect(t.acts.offerItem).not.toHaveBeenCalled();
  });
});

describe("trade answer, offer, accept and cancel", () => {
  test("answer yes and busy call answerTrade", async () => {
    const t = await world();
    tradeState(t.handle, { phase: "requested_in" });
    await tradeSpec.run({ accept: true, do: "answer" }, toolCtx(t));
    expect(t.acts.answerTrade).toHaveBeenCalledWith("yes");
    await tradeSpec.run({ accept: false, do: "answer" }, toolCtx(t));
    expect(t.acts.answerTrade).toHaveBeenCalledWith("busy");
  });

  test("offer matches the named items and gold, withdrawing the rest", async () => {
    const t = await world();
    tradeState(t.handle, {
      ownOffer: {
        gold: 0,
        items: [{ count: 1, entry: 2589, guid: CLOTH, slot: 1 }],
        spell: 0,
        version: 1,
      },
      phase: "open",
    });
    const out = await tradeSpec.run(
      { do: "offer", gold: 10, items: [WATER_ARG] },
      toolCtx(t),
    );
    expect(t.acts.offerItem).toHaveBeenCalledWith(0, 255, 24);
    expect(t.acts.withdrawItem).toHaveBeenCalledWith(1);
    expect(t.acts.offerGold).toHaveBeenCalledWith(10);
    expect(out.status).toBe("DONE");
  });

  test("accept passes the last version the agent saw", async () => {
    const t = await world();
    tradeState(t.handle, {
      phase: "open",
      theirOffer: { gold: 0, items: [], spell: 0, version: 4 },
    });
    const out = await tradeSpec.run({ do: "accept", version: 4 }, toolCtx(t));
    expect(t.acts.acceptTrade).toHaveBeenCalledWith(4);
    expect(out.status).toBe("DONE");
  });

  test("an offer_changed refusal tells the agent to call show", async () => {
    const t = await world();
    tradeState(t.handle, {
      phase: "open",
      theirOffer: { gold: 0, items: [], spell: 0, version: 5 },
    });
    t.acts.acceptTrade.mockRejectedValue(new Error("offer_changed"));
    await expect(
      tradeSpec.run({ do: "accept" }, toolCtx(t)),
    ).rejects.toMatchObject({
      reason: "offer_changed",
    });
  });

  test("cancel calls cancelTrade", async () => {
    const t = await world();
    const out = await tradeSpec.run({ do: "cancel" }, toolCtx(t));
    expect(t.acts.cancelTrade).toHaveBeenCalled();
    expect(out.status).toBe("DONE");
  });

  test("a give that waits registers a trade run", async () => {
    const t = await world();
    const started = jest.spyOn(t.rt.runs, "start");
    await tradeSpec.run(
      { do: "give", items: [WATER_ARG], with: "Fgkllpgpdnj" },
      toolCtx(t),
    );
    expect(t.acts.requestTrade).toHaveBeenCalled();
    expect(started.mock.calls.some((call) => call[0].kind === "trade")).toBe(
      true,
    );
  });

  test("the tool sends inside the world mutex", async () => {
    await expectSendKind(tradeTool, { do: "show" });
  });

  test("trade content fits the line cap", async () => {
    const t = await world();
    const out = await tradeSpec.run({ do: "show" }, toolCtx(t));
    expect(contentOf(out).split("\n").length).toBeLessThanOrEqual(13);
  });
});

describe("trade answer with no pending request", () => {
  test("answer yes refuses no_request and sends nothing", async () => {
    const t = await world();
    tradeState(t.handle, { phase: "none" });
    await expect(
      tradeSpec.run({ accept: true, do: "answer" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "no_request" });
    expect(t.acts.answerTrade).not.toHaveBeenCalled();
  });

  test("answer yes runs again once the request arrives", async () => {
    const t = await world();
    tradeState(t.handle, { phase: "requested_in" });
    const out = await tradeSpec.run({ accept: true, do: "answer" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.acts.answerTrade).toHaveBeenCalledWith("yes");
  });
});
