import { describe, expect, test } from "bun:test";
import { EQUIPMENT_SLOT_COUNT } from "#wow/areas/items/protocol-sets";
import {
  type SaveRequest,
  SetSlice,
  type UseRequest,
} from "#wow/areas/items/sets";

const items = (slots: Record<number, bigint>): bigint[] =>
  Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, i) => slots[i] ?? 0n);
const HELM = 0x40_00_00_00_00_00_00_01n;
const saveRequest = (over: Partial<SaveRequest> = {}): SaveRequest => ({
  kind: "create",
  index: 3,
  name: "Tank",
  items: items({ 0: HELM }),
  requestedAt: 1000,
  ...over,
});
const useRequest = (): UseRequest => ({
  index: 3,
  items: items({ 0: HELM }),
  outgoing: [],
  requestedAt: 1000,
});

describe("items sets slice", () => {
  test("a list replaces the known sets and a later list with an empty quest of sets clears them", () => {
    const slice = new SetSlice();
    expect(slice.snapshot().known).toBe(false);
    slice.list([
      { icon: "Ic", index: 3, items: items({}), name: "Tank", setGuid: 7n },
    ]);
    expect(slice.at(3)?.name).toBe("Tank");
    slice.list([]);
    expect(slice.snapshot()).toMatchObject({ sets: [], known: true });
  });

  test("applySaved stores the confirmed set under its index and drops the pending save", () => {
    const slice = new SetSlice();
    slice.beginSave(saveRequest());
    const outcome = slice.applySaved({
      request: saveRequest(),
      packet: { index: 3, setGuid: 9n },
      name: "Tank",
      icon: "INV",
      now: 1001,
    });
    expect(outcome).toMatchObject({
      index: 3,
      setGuid: 9n,
      status: "saved",
    });
    expect(slice.at(3)).toEqual({
      icon: "INV",
      index: 3,
      items: items({ 0: HELM }),
      name: "Tank",
      setGuid: 9n,
    });
    expect(slice.snapshot().savePending).toBeUndefined();
  });

  test("confirmUpdate keeps the old set guid and marks the save unconfirmed", () => {
    const slice = new SetSlice();
    slice.list([
      {
        icon: "Ic",
        index: 3,
        items: items({}),
        name: "Tank",
        setGuid: 9n,
      },
    ]);
    slice.beginSave(saveRequest({ kind: "update" }));
    const outcome = slice.confirmUpdate(
      saveRequest({ kind: "update", items: items({ 0: HELM, 2: 1n }) }),
      "Tank",
      "INV",
      6001,
    );
    expect(outcome).toMatchObject({
      setGuid: 9n,
      status: "saved_unconfirmed",
    });
    expect(slice.at(3)?.items[2]).toBe(1n);
  });

  test("beginSave replaces the last save, and settleSave records a timeout verdict", () => {
    const slice = new SetSlice();
    const first = saveRequest();
    slice.beginSave(first);
    const second = saveRequest({ index: 4 });
    slice.beginSave(second);
    expect(slice.snapshot().savePending).toEqual(second);
    slice.settleSave({
      index: 4,
      observedAt: 6001,
      reason: "server_unanswered",
      request: second,
      setGuid: 0n,
      status: "unanswered",
    });
    const state = slice.snapshot();
    expect(state.savePending).toBeUndefined();
    expect(state.lastSave?.status).toBe("unanswered");
    expect(first).toMatchObject({ index: 3 });
  });

  test("beginUse replaces the last use, settleUse records it, and beginDelete drops the set", () => {
    const slice = new SetSlice();
    slice.list([
      {
        icon: "Ic",
        index: 3,
        items: items({ 0: HELM }),
        name: "Tank",
        setGuid: 9n,
      },
    ]);
    const first = { ...useRequest(), index: 1 };
    slice.beginUse(first);
    expect(slice.snapshot().usePending).toEqual(first);
    slice.beginUse(useRequest());
    expect(slice.snapshot().usePending).toEqual(useRequest());
    slice.settleUse({
      failures: ["bag_is_full"],
      observedAt: 1001,
      reason: "bags_full",
      request: useRequest(),
      status: "bags_full",
    });
    expect(slice.snapshot().lastUse?.failures).toEqual(["bag_is_full"]);
    const removed = slice.beginDelete({
      index: 3,
      setGuid: 9n,
      requestedAt: 1002,
    });
    expect(removed?.setGuid).toBe(9n);
    expect(slice.at(3)).toBeUndefined();
    expect(
      slice.beginDelete({ index: 3, setGuid: 9n, requestedAt: 1003 }),
    ).toBeUndefined();
  });

  test("duplicate set names stay as the server lists them", () => {
    const slice = new SetSlice();
    slice.list([
      { icon: "", index: 0, items: items({}), name: "Peon", setGuid: 1n },
      { icon: "", index: 1, items: items({}), name: "Peon", setGuid: 2n },
    ]);
    expect(slice.snapshot().sets.map((set) => [set.index, set.name])).toEqual([
      [0, "Peon"],
      [1, "Peon"],
    ]);
  });
});
