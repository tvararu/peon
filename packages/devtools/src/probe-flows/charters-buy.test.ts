import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/charters-buy";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const MASTER = 0xf1_30_00_00_00_00_1e_b4n;
const CHARTER = 0x40_00_00_00_00_00_00_31n;

function masterRow(): Row {
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance: 2.5,
    entity: {
      entry: 28774,
      guid: MASTER,
      name: "Andrew Matthews",
      objectType: 3,
      position: { mapId: 571, orientation: 0, x: 0, y: 0, z: 0 },
      rawFields: new Map(),
      scale: 1,
    },
    horizontalDistance: 2.5,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position: { mapId: 571, orientation: 0, x: 0, y: 0, z: 0 },
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: ["gossip", "petitioner", "tabard_designer"],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function carried(): Record<string, unknown> {
  return {
    bag: 255,
    guid: CHARTER,
    item: {
      contained: undefined,
      count: 1,
      creator: undefined,
      durability: undefined,
      enchantments: undefined,
      entry: 5863,
      flags: undefined,
      giftCreator: undefined,
      guid: CHARTER,
      maxDurability: undefined,
      owner: undefined,
      randomPropertyId: undefined,
      spellCharges: undefined,
    },
    region: "backpack",
    slot: 24,
    status: "occupied",
  };
}

function inventory(slots: Record<string, unknown>[]) {
  return {
    bags: [],
    bank: undefined,
    buyback: undefined,
    coinage: 0,
    freeSlots: 0,
    issues: [],
    scope: "carried",
    selfGuid: 1n,
    slots,
    status: "complete",
  } as never;
}

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.queryNearby = () => [masterRow()];
  jest
    .spyOn(handle, "getInventoryState")
    .mockReturnValue(inventory([carried()]));
  jest
    .spyOn(handle.charters.act, "showList")
    .mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.charters.act, "buy")
    .mockResolvedValue({ item: CHARTER, status: "ok" });
  jest.spyOn(handle.charters.act, "query").mockResolvedValue({ status: "ok" });
  jest
    .spyOn(handle.charters.act, "showSignatures")
    .mockResolvedValue({ status: "ok" });
  jest.spyOn(handle.charters.act, "rename").mockResolvedValue({ status: "ok" });
  jest.spyOn(handle.charters, "state").mockReturnValue({
    lastOutcome: undefined,
    offers: {},
    pending: undefined,
    pendingOffer: undefined,
    petitions: {},
  });
  return { args, handle, settle: settleWithin(200) };
}

describe("charters-buy flow", () => {
  test("it asks the petitioner, buys, queries, shows and renames", async () => {
    const ctx = context({ name: "FacAbCdeFghIjKlMn" });
    const out = await flow.run(ctx);
    expect(ctx.handle.charters.act.showList).toHaveBeenCalledWith(MASTER);
    expect(ctx.handle.charters.act.buy).toHaveBeenCalledWith(
      MASTER,
      "FacAbCdeFghIjKlMn",
      1,
    );
    expect(ctx.handle.charters.act.query).toHaveBeenCalledWith(CHARTER);
    expect(ctx.handle.charters.act.showSignatures).toHaveBeenCalledWith(
      CHARTER,
    );
    expect(ctx.handle.charters.act.rename).toHaveBeenCalled();
    expect(out).toMatchObject({
      bought: { status: "ok" },
      queried: { status: "ok" },
      renamed: { status: "ok" },
      showlist: { status: "ok" },
      signatures: { status: "ok" },
    });
  });

  test("it refuses a missing name", async () => {
    const ctx = context({});
    await expect(flow.run(ctx)).rejects.toThrow("charters-buy needs name=");
  });
});
