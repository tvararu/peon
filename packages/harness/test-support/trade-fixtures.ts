import { jest } from "bun:test";
import { tradeTool } from "#harness/areas/trade/tool";
import { setUnits, unitRow } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

export const PARTNER = 0x00_00_00_00_00_00_0b_01n;
export const WATER = 0x40_00_00_00_00_00_0c_01n;
export const CLOTH = 0x40_00_00_00_00_00_0c_02n;
export const SHIRT = 0x40_00_00_00_00_00_0c_03n;

export const WATER_ARG = "Refreshing Spring Water";
export const CLOTH_ARG = "Linen Cloth";

export type SlotInit = {
  bag: number;
  entry: number | undefined;
  guid: bigint;
  name: string;
  slot: number;
  count?: number;
};

export function slots(items: SlotInit[]) {
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

export function stocked(handle: MockHandle, items: SlotInit[]): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    coinage: 1000,
    slots: slots(items),
  });
}

export function tradeActs(handle: MockHandle) {
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

export function tradeState(
  handle: MockHandle,
  over: Record<string, unknown> = {},
): void {
  const state = handle.trade.state();
  jest.spyOn(handle.trade, "state").mockReturnValue({ ...state, ...over });
}

export function partnerUnit(distance = 5) {
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

export async function world() {
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
