import { describe, expect, test } from "bun:test";
import {
  type EquipmentSetEntry,
  EQUIPMENT_SLOT_COUNT,
} from "#wow/areas/items/protocol-sets";
import {
  type InventoryChangeFailure,
  parseInventoryChangeFailure,
} from "#wow/protocol/inventory";
import { itemsWorld } from "#test-support/areas/items-world";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import { testStores } from "#test-support/session-fixtures";
import { type ItemsEvent, ItemsStore } from "#wow/areas/items/store";
import { PacketReader } from "#wow/protocol/packet";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x0a_00n;
const HELM = 0x40_00_00_00_00_00_00_01n;
const CHEST = 0x40_00_00_00_00_00_00_02n;

const items = (slots: Record<number, bigint>): bigint[] =>
  Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, i) => slots[i] ?? 0n);

function setup() {
  const world = itemsWorld(ME);
  world.put(255, 0, { entry: 100, guid: HELM });
  world.put(255, 23, { entry: 200, guid: CHEST });
  let clock = 1000;
  const deps: SessionDeps = {
    getEntity: world.lookup,
    now: () => clock,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new ItemsStore(deps, testStores(deps));
  const events: ItemsEvent[] = [];
  store.onEvent((event) => events.push(event));
  const tick = (ms: number) => {
    clock += ms;
  };
  return { deps, events, store, tick, world };
}

function failure(init: {
  result: number;
  item1?: bigint;
}): InventoryChangeFailure {
  return parseInventoryChangeFailure(
    new PacketReader(
      itemsInventoryChangeFailureBody({
        item1: init.item1 ?? 0n,
        result: init.result,
      }),
    ),
  );
}

const setEntry = (
  over: Partial<EquipmentSetEntry> = {},
): EquipmentSetEntry => ({
  icon: "INV",
  index: 0,
  items: items({ 0: HELM }),
  name: "Peon",
  setGuid: 7n,
  ...over,
});

describe("ItemsStore sets", () => {
  test("receiveSetList reports the sets and keeps the earlier known key", () => {
    const { events, store } = setup();
    store.receiveSetList([setEntry()]);
    expect(events).toEqual([{ sets: [setEntry()], type: "sets_listed" }]);
    expect(store.snapshot()).toMatchObject({ sets: { known: true } });
    store.receiveSetList([]);
    expect(store.snapshot().sets.sets).toEqual([]);
    expect(store.snapshot().sets.known).toBe(true);
  });

  test("beginSave emits set_save_requested; confirmSaved records the server's guid", () => {
    const { events, store } = setup();
    store.beginSave({
      items: items({ 0: HELM }),
      index: 0,
      kind: "create",
      name: "Peon",
      requestedAt: 1000,
    });
    expect(events).toEqual([
      { index: 0, kind: "create", name: "Peon", type: "set_save_requested" },
    ]);
    const outcome = store.confirmSaved(
      { index: 0, setGuid: 9n },
      "Peon",
      "INV",
    );
    expect(outcome?.status).toBe("saved");
    expect(events[1]).toMatchObject({
      index: 0,
      setGuid: 9n,
      status: "saved",
      type: "set_saved",
    });
    expect(
      store.snapshot().sets.sets.find((set) => set.index === 0)?.setGuid,
    ).toBe(9n);
  });

  test("a saved reply for another index is dropped", () => {
    const { events, store } = setup();
    store.beginSave({
      items: items({ 0: HELM }),
      index: 0,
      kind: "create",
      name: "Peon",
      requestedAt: 1000,
    });
    expect(
      store.confirmSaved({ index: 4, setGuid: 9n }, "Peon", "INV"),
    ).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(["set_save_requested"]);
  });

  test("replies with no set guid on the wire are impossible: guid 0 is the create marker", () => {
    const { store } = setup();
    store.beginSave({
      items: items({ 0: HELM }),
      index: 0,
      kind: "create",
      name: "Peon",
      requestedAt: 1000,
    });
    const outcome = store.confirmSaved(
      { index: 0, setGuid: 0n },
      "Peon",
      "INV",
    );
    expect(outcome).toBeUndefined();
  });

  test("beginUse tracks the use and receiveUseResult settles it with failures seen in between", () => {
    const { events, store } = setup();
    store.receiveSetList([setEntry()]);
    store.beginUse({ index: 0, items: items({ 0: HELM }), requestedAt: 1000 });
    store.receiveInventoryFailure(failure({ item1: HELM, result: 39 }));
    store.receiveInventoryFailure(failure({ item1: HELM, result: 59 }));
    store.receiveInventoryFailure(failure({ item1: CHEST, result: 39 }));
    store.receiveUseResult(0);
    expect(events.map((e) => e.type)).toEqual([
      "sets_listed",
      "set_use_requested",
      "set_used",
    ]);
    expect(events[2]).toMatchObject({
      failures: ["cant_do_right_now"],
      index: 0,
      status: "ok",
    });
  });

  test("result 4 rolls the use back into bags_full and keeps the unowned failures out", () => {
    const { store } = setup();
    store.receiveSetList([setEntry()]);
    store.beginUse({ index: 0, items: items({ 0: HELM }), requestedAt: 1000 });
    store.receiveInventoryFailure(failure({ item1: 0x09n, result: 62 }));
    store.receiveUseResult(4);
    expect(store.snapshot().sets.lastUse).toMatchObject({
      failures: [],
      status: "bags_full",
    });
  });

  test("empty quest sets and empty slots stay visible: guid 0 unequips, guid 1 is ignored", () => {
    const { store } = setup();
    store.receiveSetList([setEntry({ items: items({ 5: 1n }) })]);
    expect(
      store.snapshot().sets.sets.find((set) => set.index === 0)?.items[5],
    ).toBe(1n);
    expect(
      store.snapshot().sets.sets.find((set) => set.index === 0)?.items[0],
    ).toBe(0n);
    store.receiveSetList([]);
    expect(store.snapshot().sets.sets).toEqual([]);
  });

  test("beginDelete drops the set at once and emits set_deleted", () => {
    const { events, store } = setup();
    store.receiveSetList([setEntry()]);
    const removed = store.beginDelete({
      index: 0,
      setGuid: 7n,
      requestedAt: 1000,
    });
    expect(removed?.setGuid).toBe(7n);
    expect(events[1]).toMatchObject({ index: 0, type: "set_deleted" });
    expect(
      store.beginDelete({ index: 0, setGuid: 7n, requestedAt: 1001 }),
    ).toBeUndefined();
  });
});
