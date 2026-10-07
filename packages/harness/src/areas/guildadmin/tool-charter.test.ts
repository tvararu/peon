import { describe, expect, jest, test } from "bun:test";
import { guildSpec } from "#harness/areas/guildadmin/tool";
import { setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import type { MockHandle } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { stocked } from "#test-support/trade-fixtures";

const SELLER = 0xf1_30_00_00_00_00_00_09n;
const CHARTER_GUID = 0xf1_30_00_00_00_00_00_0an;
const FRIEND = 0xf1_30_00_00_00_00_00_0bn;

function seller(handle: MockHandle): void {
  setUnits(handle, [
    unitRow({
      distance: 3,
      guid: SELLER,
      name: "Guild Master",
      relation: "friendly",
      roles: ["petitioner"],
      x: 3,
      y: 0,
    }),
  ]);
}

function charterState(handle: MockHandle, state: unknown): void {
  jest.spyOn(handle.charters, "state").mockReturnValue(state as never);
}

async function world() {
  const t = await createTestRuntime({});
  return {
    ...t,
    acts: {
      buy: jest.spyOn(t.handle.charters.act, "buy"),
      decline: jest.spyOn(t.handle.charters.act, "decline"),
      offer: jest.spyOn(t.handle.charters.act, "offer"),
      query: jest.spyOn(t.handle.charters.act, "query"),
      rename: jest.spyOn(t.handle.charters.act, "rename"),
      showList: jest.spyOn(t.handle.charters.act, "showList"),
      showSignatures: jest.spyOn(t.handle.charters.act, "showSignatures"),
      sign: jest.spyOn(t.handle.charters.act, "sign"),
      turnIn: jest.spyOn(t.handle.charters.act, "turnIn"),
    },
  };
}

describe("guild charter", () => {
  test("buy with no seller in view refuses", async () => {
    const t = await world();
    await expect(
      guildSpec.run(
        { do: "charter", name: "Crimsonpact", step: "buy" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "no_petitioner" });
    expect(t.acts.showList).not.toHaveBeenCalled();
  });

  test("buy without a name refuses before sending", async () => {
    const t = await world();
    seller(t.handle);
    await expect(
      guildSpec.run({ do: "charter", step: "buy" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "missing_arg" });
    expect(t.acts.showList).not.toHaveBeenCalled();
  });

  test("buy asks for the showlist then buys and reports the signatures needed", async () => {
    const t = await world();
    seller(t.handle);
    t.acts.showList.mockResolvedValue({ status: "ok" });
    t.acts.buy.mockResolvedValue({ item: CHARTER_GUID, status: "ok" });
    charterState(t.handle, {
      offers: {
        [`0x${SELLER.toString(16)}`]: [
          { cost: 1000, entry: 5863, index: 1, required: 9 },
        ],
      },
    });
    const out = await guildSpec.run(
      { do: "charter", name: "Crimsonpact", step: "buy" },
      toolCtx(t),
    );
    expect(t.acts.showList).toHaveBeenCalledWith(SELLER);
    expect(t.acts.buy).toHaveBeenCalledWith(SELLER, "Crimsonpact", 1);
    expect(out.status).toBe("DONE");
  });

  test("status reads the signers and the needed count", async () => {
    const t = await world();
    stocked(t.handle, [
      {
        bag: 23,
        entry: 5863,
        guid: CHARTER_GUID,
        name: "Guild Charter",
        slot: 0,
      },
    ]);
    t.acts.query.mockResolvedValue({ item: CHARTER_GUID, status: "ok" });
    t.acts.showSignatures.mockResolvedValue({
      item: CHARTER_GUID,
      status: "ok",
    });
    charterState(t.handle, {
      petitions: {
        [`0x${CHARTER_GUID.toString(16)}`]: {
          kind: "guild",
          name: "Crimsonpact",
          needed: 9,
          signers: [],
        },
      },
    });
    const out = await guildSpec.run(
      { do: "charter", step: "status" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
  });

  test("status with no charter refuses before sending", async () => {
    const t = await world();
    await expect(
      guildSpec.run({ do: "charter", step: "status" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "no_charter" });
    expect(t.acts.query).not.toHaveBeenCalled();
  });

  test("offer to an unseen player refuses", async () => {
    const t = await world();
    stocked(t.handle, [
      {
        bag: 23,
        entry: 5863,
        guid: CHARTER_GUID,
        name: "Guild Charter",
        slot: 0,
      },
    ]);
    await expect(
      guildSpec.run(
        { do: "charter", name: "Stranger", step: "offer" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "not_seen" });
    expect(t.acts.offer).not.toHaveBeenCalled();
  });

  test("offer shows the charter to a player in view", async () => {
    const t = await world();
    seller(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 3,
        guid: SELLER,
        name: "Guild Master",
        relation: "friendly",
        roles: ["petitioner"],
        x: 3,
        y: 0,
      }),
      unitRow({
        distance: 4,
        guid: FRIEND,
        name: "Helper",
        player: true,
        relation: "friendly",
        x: 4,
        y: 0,
      }),
    ]);
    stocked(t.handle, [
      {
        bag: 23,
        entry: 5863,
        guid: CHARTER_GUID,
        name: "Guild Charter",
        slot: 0,
      },
    ]);
    t.acts.offer.mockResolvedValue({ status: "ok" });
    const out = await guildSpec.run(
      { do: "charter", name: "Helper", step: "offer" },
      toolCtx(t),
    );
    expect(t.acts.offer).toHaveBeenCalledWith(CHARTER_GUID, FRIEND);
    expect(out.status).toBe("DONE");
  });

  test("turn_in sends the charter and rename sends the new name", async () => {
    const t = await world();
    seller(t.handle);
    stocked(t.handle, [
      {
        bag: 23,
        entry: 5863,
        guid: CHARTER_GUID,
        name: "Guild Charter",
        slot: 0,
      },
    ]);
    t.acts.turnIn.mockResolvedValue({ status: "ok" });
    const turnedIn = await guildSpec.run(
      { do: "charter", step: "turn_in" },
      toolCtx(t),
    );
    expect(t.acts.turnIn).toHaveBeenCalledWith(CHARTER_GUID, undefined);
    expect(turnedIn.status).toBe("DONE");
    t.acts.rename.mockResolvedValue({ status: "ok" });
    const renamed = await guildSpec.run(
      { do: "charter", name: "Crimsonpact", step: "rename" },
      toolCtx(t),
    );
    expect(t.acts.rename).toHaveBeenCalledWith(CHARTER_GUID, "Crimsonpact");
    expect(renamed.status).toBe("DONE");
  });

  test("sign signs a pending offer and decline needs step charter", async () => {
    const t = await world();
    charterState(t.handle, {
      pendingOffer: { item: CHARTER_GUID, signers: [] },
    });
    t.acts.sign.mockResolvedValue({ status: "ok" });
    const signed = await guildSpec.run({ do: "sign" }, toolCtx(t));
    expect(t.acts.sign).toHaveBeenCalledWith(CHARTER_GUID);
    expect(signed.status).toBe("DONE");
    t.acts.decline.mockResolvedValue({ status: "ok" });
    const declined = await guildSpec.run(
      { do: "decline", step: "charter" },
      toolCtx(t),
    );
    expect(t.acts.decline).toHaveBeenCalledWith(CHARTER_GUID);
    expect(declined.status).toBe("DONE");
  });

  test("sign with no pending offer refuses before sending", async () => {
    const t = await world();
    charterState(t.handle, { pendingOffer: undefined });
    await expect(
      guildSpec.run({ do: "sign" }, toolCtx(t)),
    ).rejects.toMatchObject({
      reason: "no_offer",
    });
    expect(t.acts.sign).not.toHaveBeenCalled();
  });
});
