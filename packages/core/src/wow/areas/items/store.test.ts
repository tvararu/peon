import { describe, expect, test } from "bun:test";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import { itemsWorld } from "#test-support/areas/items-world";
import { testStores } from "#test-support/session-fixtures";
import type { MoveRequest } from "#wow/areas/items/moves";
import { type ItemsEvent, ItemsStore } from "#wow/areas/items/store";
import { parseInventoryChangeFailure } from "#wow/protocol/inventory";
import { PacketReader } from "#wow/protocol/packet";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x0a_00n;
const SWORD = 0x40_00_00_00_00_00_00_01n;
const OTHER = 0x40_00_00_00_00_00_00_09n;

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 23, { entry: 25, guid: SWORD });
  let clock = 1000;
  const deps: SessionDeps = {
    getEntity: world.lookup,
    now: () => clock,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const core = testStores(deps);
  const store = new ItemsStore(deps, core);
  const events: ItemsEvent[] = [];
  store.onEvent((event) => events.push(event));
  const equip: MoveRequest = {
    kind: "equip",
    itemGuid: SWORD,
    entry: 25,
    from: { bag: 255, slot: 23 },
    to: undefined,
    count: 1,
    stackBefore: 1,
    target: undefined,
    requestedAt: clock,
  };
  const tick = (ms: number) => {
    clock += ms;
  };
  return { core, equip, events, store, tick, world };
}

function failure(init: Parameters<typeof itemsInventoryChangeFailureBody>[0]) {
  return parseInventoryChangeFailure(
    new PacketReader(itemsInventoryChangeFailureBody(init)),
  );
}

describe("ItemsStore moves", () => {
  test("begin records the pending move and emits move_requested", () => {
    const { equip, events, store } = setup();
    store.begin(equip);
    expect(store.snapshot().move).toEqual({ last: undefined, pending: equip });
    expect(events).toEqual([
      { entry: 25, itemGuid: SWORD, kind: "equip", type: "move_requested" },
    ]);
  });

  test("an inventory update that shows the end state settles confirmed", () => {
    const { equip, events, store, tick, world } = setup();
    store.begin(equip);
    store.observeInventory();
    expect(store.snapshot().move.pending).toBe(equip);
    world.clear(255, 23);
    world.put(255, 15, { entry: 25, guid: SWORD });
    tick(40);
    store.observeInventory();
    expect(store.snapshot().move).toEqual({
      last: {
        observedAt: 1040,
        reason: undefined,
        request: equip,
        status: "confirmed",
      },
      pending: undefined,
    });
    expect(events.at(-1)).toEqual({
      entry: 25,
      itemGuid: SWORD,
      kind: "equip",
      type: "moved",
    });
  });

  test("a failure naming the moving item settles refused with the result name; another item's does not", () => {
    const { equip, events, store } = setup();
    store.begin(equip);
    store.receiveInventoryFailure(failure({ item1: OTHER, result: 22 }));
    expect(store.snapshot().move.pending).toBe(equip);
    store.receiveInventoryFailure(
      failure({ item1: SWORD, requiredLevel: 10, result: 1 }),
    );
    expect(store.snapshot().move.last).toMatchObject({
      reason: "cant_equip_level_i",
      status: "refused",
    });
    expect(events.at(-1)).toEqual({
      entry: 25,
      itemGuid: SWORD,
      kind: "equip",
      reason: "cant_equip_level_i",
      result: 1,
      type: "move_refused",
    });
  });

  test("result 59 settles no_change", () => {
    const { equip, events, store } = setup();
    store.begin(equip);
    store.receiveInventoryFailure(failure({ item1: SWORD, result: 59 }));
    expect(store.snapshot().move.last).toMatchObject({
      reason: "none",
      status: "no_change",
    });
    expect(events.at(-1)).toMatchObject({ type: "move_no_change" });
  });

  test("a failure with no item settles the move only while no legacy request waits", () => {
    const { core, equip, store } = setup();
    store.begin(equip);
    core.destroy.begin({
      bag: 255,
      count: 1,
      itemGuid: OTHER,
      itemId: 7,
      requestedAt: 0,
      slot: 30,
      stackBefore: 1,
    });
    store.receiveInventoryFailure(failure({ result: 23 }));
    expect(store.snapshot().move.pending).toBe(equip);
    core.destroy.expire();
    store.receiveInventoryFailure(failure({ result: 23 }));
    expect(store.snapshot().move.last).toMatchObject({
      reason: "item_not_found",
      status: "refused",
    });
  });

  test("a legacy claim seen during the move still blocks a failure with no item after the legacy store settled", () => {
    const { core, equip, store } = setup();
    store.begin(equip);
    core.destroy.begin({
      bag: 255,
      count: 1,
      itemGuid: OTHER,
      itemId: 7,
      requestedAt: 0,
      slot: 30,
      stackBefore: 1,
    });
    store.noteClaims();
    core.destroy.expire();
    store.receiveInventoryFailure(failure({ result: 23 }));
    expect(store.snapshot().move.pending).toBe(equip);
  });

  test("expire settles unanswered and nothing settles an idle store", () => {
    const { equip, events, store } = setup();
    store.receiveInventoryFailure(failure({ item1: SWORD, result: 1 }));
    store.observeInventory();
    expect(events).toEqual([]);
    store.begin(equip);
    store.expire();
    expect(store.snapshot().move.last).toMatchObject({
      reason: "server_unanswered",
      status: "unanswered",
    });
    expect(events.at(-1)).toMatchObject({ type: "move_unanswered" });
  });

  test("receiveItem emits item_received", () => {
    const { events, store } = setup();
    store.receiveItem({
      entry: 2488,
      guid: SWORD,
      inventoryType: 13,
      itemLevel: 17,
      wornItemLevel: 2,
    });
    expect(events).toEqual([
      {
        entry: 2488,
        guid: SWORD,
        inventoryType: 13,
        itemLevel: 17,
        type: "item_received",
        wornItemLevel: 2,
      },
    ]);
  });
});
