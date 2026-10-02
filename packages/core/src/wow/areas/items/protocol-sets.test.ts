import { describe, expect, test } from "bun:test";
import {
  itemsEquipmentSetListBody,
  itemsEquipmentSetSavedBody,
  itemsEquipmentSetUseResultBody,
} from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  buildEquipmentSetDelete,
  buildEquipmentSetSave,
  buildEquipmentSetUse,
  EQUIPMENT_SLOT_COUNT,
  IGNORED_SLOT,
  parseEquipmentSetList,
  parseEquipmentSetSaved,
  parseEquipmentSetUseResult,
} from "#wow/areas/items/protocol-sets";
import { PacketReader } from "#wow/protocol/packet";

const HELM = 0x40_00_00_00_00_00_00_01n;
const staged = (slots: Record<number, bigint>): bigint[] =>
  Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, i) => slots[i] ?? 0n);

describe("items equipment set packets", () => {
  test("the list reads count, then per set guid, index, name, icon and 19 packed guids where raw 1 is ignored and 0 is empty (Player.cpp:14894-14922)", () => {
    const items = staged({ 0: HELM, 1: IGNORED_SLOT });
    const body = itemsEquipmentSetListBody([
      { icon: "INV_Misc_Bag", index: 3, items, name: "Tank", setGuid: 7n },
      { icon: "", index: 0, items: staged({}), name: "", setGuid: 8n },
    ]);
    const sets = parseEquipmentSetList(new PacketReader(body));
    expect(sets).toHaveLength(2);
    expect(sets[0]).toEqual({
      icon: "INV_Misc_Bag",
      index: 3,
      items,
      name: "Tank",
      setGuid: 7n,
    });
    expect(sets[1]).toMatchObject({ index: 0, name: "", setGuid: 8n });
    expect(sets[0]?.items[1]).toBe(1n);
    expect(sets[0]?.items[2]).toBe(0n);
  });

  test("an empty list is the count alone", () => {
    expect(parseEquipmentSetList(new PacketReader(bytes("00000000")))).toEqual(
      [],
    );
  });

  test("the saved reply is u32 index then the packed set guid (Player.cpp:14953-14959)", () => {
    expect(itemsEquipmentSetSavedBody(2, 0x0102n)).toEqual(
      bytes("02000000 03 02 01"),
    );
    expect(
      parseEquipmentSetSaved(new PacketReader(bytes("02000000 03 02 01"))),
    ).toEqual({ index: 2, setGuid: 0x0102n });
  });

  test("the use result is one byte, 0 ok and 4 bags full (CharacterHandler.cpp:1946-1948)", () => {
    expect(parseEquipmentSetUseResult(new PacketReader(bytes("04")))).toBe(4);
    expect(itemsEquipmentSetUseResultBody(0)).toEqual(bytes("00"));
  });

  test("the save body is packed set guid, u32 index, name, icon and 19 packed guids (CharacterHandler.cpp:1778-1847)", () => {
    const body = buildEquipmentSetSave({
      icon: "Ic",
      index: 1,
      items: staged({ 0: HELM, 2: IGNORED_SLOT }),
      name: "Peon",
      setGuid: 0n,
    });
    const head = bytes("00 01000000 50656f6e00 496300");
    expect(body.subarray(0, head.length)).toEqual(head);
    const r = new PacketReader(body.slice(head.length));
    const guids = Array.from({ length: EQUIPMENT_SLOT_COUNT }, () =>
      r.packedGuidBig(),
    );
    expect(guids).toEqual(staged({ 0: HELM, 2: IGNORED_SLOT }));
    expect(r.remaining).toBe(0);
  });

  test("the save body carries a non-zero set guid packed for an update", () => {
    const body = buildEquipmentSetSave({
      icon: "",
      index: 4,
      items: staged({}),
      name: "A",
      setGuid: 0x0102n,
    });
    expect(body.subarray(0, 7)).toEqual(bytes("03 02 01 04000000"));
  });

  test("the save body refuses what the server drops silently", () => {
    const ok = {
      icon: "",
      index: 0,
      items: staged({}),
      name: "A",
      setGuid: 0n,
    };
    expect(() => buildEquipmentSetSave({ ...ok, index: 10 })).toThrow(/index/);
    expect(() => buildEquipmentSetSave({ ...ok, index: -1 })).toThrow(/index/);
    expect(() =>
      buildEquipmentSetSave({ ...ok, name: "x".repeat(17) }),
    ).toThrow(/name/);
    expect(() => buildEquipmentSetSave({ ...ok, name: "é".repeat(9) })).toThrow(
      /name/,
    );
    expect(() =>
      buildEquipmentSetSave({ ...ok, icon: "x".repeat(101) }),
    ).toThrow(/icon/);
    expect(() =>
      buildEquipmentSetSave({ ...ok, items: staged({}).slice(1) }),
    ).toThrow(/19/);
    expect(
      buildEquipmentSetSave({ ...ok, name: "x".repeat(16) }).length,
    ).toBeGreaterThan(0);
  });

  test("the use body is 19 entries of packed guid, source bag and source slot (CharacterHandler.cpp:1859-1950)", () => {
    const entries = staged({}).map((guid) => ({ bag: 0, guid, slot: 0 }));
    entries[0] = { bag: 255, guid: HELM, slot: 23 };
    entries[1] = { bag: 0, guid: IGNORED_SLOT, slot: 0 };
    const body = buildEquipmentSetUse(entries);
    const r = new PacketReader(body);
    const read = entries.map(() => ({
      guid: r.packedGuidBig(),
      bag: r.uint8(),
      slot: r.uint8(),
    }));
    expect(read).toEqual(entries);
    expect(r.remaining).toBe(0);
    expect(() => buildEquipmentSetUse(entries.slice(1))).toThrow(/19/);
  });

  test("the delete body is the packed set guid (CharacterHandler.cpp:1849-1857)", () => {
    expect(buildEquipmentSetDelete(0x0102n)).toEqual(bytes("03 02 01"));
  });
});
