import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { tradeParams, tradeSpec, tradeTool } from "#harness/areas/trade/tool";
import {
  contentOf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

const PARTNER = 0x00_00_00_00_00_00_0b_01n;
const WATER = 0x40_00_00_00_00_00_0c_01n;
const CLOTH = 0x40_00_00_00_00_00_0c_02n;
const SHIRT = 0x40_00_00_00_00_00_0c_03n;

type SlotInit = {
  bag: number;
  entry: number | undefined;
  guid: bigint;
  name: string;
  slot: number;
  count?: number;
};

function slots(items: SlotInit[]) {
  return items.map(
    (item) =>
      ({
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
        region: item.bag === 255 && item.slot <= 22 ? "equipment" : "backpack",
        slot: item.slot,
        status: "occupied",
      }) as never,
  );
}

function stocked(handle: MockHandle, items: SlotInit[]): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    coinage: 1000,
    slots: slots(items),
  });
}

function tradeActs(handle: MockHandle) {
  type Act = MockHandle["trade"]["act"];
  const trade = handle.trade as unknown as { act: Act };
  trade.act = { ...trade.act };
  const act = trade.act;
  return {
    acceptTrade: jest
      .spyOn(act, "acceptTrade")
      .mockResolvedValue({ status: "ok" }),
    answerTrade: jest
      .spyOn(act, "answerTrade")
      .mockResolvedValue({ status: "ok" }),
    cancelTrade: jest
      .spyOn(act, "cancelTrade")
      .mockResolvedValue({ status: "ok" }),
    offerGold: jest
      .spyOn(act, "offerGold")
      .mockImplementation(async (copper) => ({ gold: copper })),
    offerItem: jest
      .spyOn(act, "offerItem")
      .mockImplementation(async (slot) => ({ slot })),
    requestTrade: jest
      .spyOn(act, "requestTrade")
      .mockResolvedValue({ status: "ok" }),
    withdrawItem: jest
      .spyOn(act, "withdrawItem")
      .mockResolvedValue({ cleared: true }),
  };
}

function tradeState(
  handle: MockHandle,
  over: Record<string, unknown> = {},
): void {
  const state = handle.trade.state();
  jest.spyOn(handle.trade, "state").mockReturnValue({ ...state, ...over });
}

function partnerUnit(distance = 5) {
  return unitRow({
    attackable: false,
    distance,
    guid: PARTNER,
    level: 10,
    name: "Fgkllpgpdnj",
    player: true,
    relation: "friendly",
    x: 1,
    y: 1,
  });
}

async function world() {
  const t = await createTestRuntime({});
  setUnits(t.handle, [partnerUnit()]);
  stocked(t.handle, [
    {
      bag: 255,
      entry: 159,
      guid: WATER,
      name: "Refreshing Spring Water",
      slot: 24,
    },
    { bag: 255, entry: 2589, guid: CLOTH, name: "Linen Cloth", slot: 25 },
    { bag: 255, entry: 6096, guid: SHIRT, name: "Apprentice's Shirt", slot: 3 },
  ]);
  const acts = tradeActs(t.handle);
  return { ...t, acts, tool: tradeTool.definition(t.rt) };
}

function callOf() {
  return {
    arguments: tradeSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

const WATER_ARG = "Refreshing Spring Water";
const CLOTH_ARG = "Linen Cloth";

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
    expect(out.detail).toBe(
      "Gave Refreshing Spring Water, Linen Cloth and 10 copper to Fgkllpgpdnj.",
    );
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
