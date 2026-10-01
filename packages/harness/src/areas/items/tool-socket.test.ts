import { describe, expect, jest, test } from "bun:test";
import { gearSpec } from "#harness/areas/items/tool";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

type Occupied = {
  bag: number;
  entry: number;
  guid: bigint;
  name: string;
  slot: number;
};

const RING = 0x40_00_00_00_00_00_00_01n;
const GEM = 0x40_00_00_00_00_00_00_02n;

function slots(items: Occupied[]) {
  return items.map(
    (item) =>
      ({
        bag: item.bag,
        guid: item.guid,
        item: {
          contained: undefined,
          count: 1,
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
        region: "backpack",
        slot: item.slot,
        status: "occupied",
      }) as never,
  );
}

function stocked(handle: MockHandle, items: Occupied[]): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    slots: slots(items),
  });
}

function socketActs(handle: MockHandle) {
  type ItemsHandle = { act: Record<string, unknown> };
  const items = handle.items as unknown as ItemsHandle;
  items.act = { ...items.act };
  const act = items.act;
  return {
    socket: jest.spyOn(act, "socket").mockResolvedValue({
      bonus: 3312,
      observedAt: 0,
      reason: undefined,
      request: {
        entry: 40_000,
        gems: [GEM],
        itemGuid: RING,
        requestedAt: 0,
      },
      sockets: [3101, 0, 0],
      status: "confirmed",
    }),
  };
}

describe("gear tool socket", () => {
  test("socket passes the item guid and the gem guids", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 40_000, guid: RING, name: "Sturdy Ring", slot: 25 },
      { bag: 255, entry: 32_000, guid: GEM, name: "Bold Bloodstone", slot: 26 },
    ]);
    const acts = socketActs(t.handle);
    const res = await gearSpec.run(
      { do: "socket", gems: "Bold Bloodstone", item: "Sturdy Ring" },
      toolCtx(t),
    );
    expect(acts.socket).toHaveBeenCalledWith(RING, [GEM]);
    expect(contentOf(res)).toContain("Sturdy Ring");
  });

  test("a refused socket names the reason", async () => {
    const t = await createTestRuntime();
    stocked(t.handle, [
      { bag: 255, entry: 40_000, guid: RING, name: "Sturdy Ring", slot: 25 },
      { bag: 255, entry: 32_000, guid: GEM, name: "Bold Bloodstone", slot: 26 },
    ]);
    const acts = socketActs(t.handle);
    acts.socket.mockResolvedValue({
      bonus: undefined,
      observedAt: 0,
      reason: "cant_do_right_now",
      request: {
        entry: 40_000,
        gems: [GEM],
        itemGuid: RING,
        requestedAt: 0,
      },
      sockets: undefined,
      status: "refused",
    });
    const res = await gearSpec
      .run(
        { do: "socket", gems: "Bold Bloodstone", item: "Sturdy Ring" },
        toolCtx(t),
      )
      .catch((error) => error);
    expect(res).toMatchObject({ reason: "cant_do_right_now" });
  });
});
