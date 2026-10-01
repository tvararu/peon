import type { PacketReader } from "#wow/protocol/packet";
import { PacketWriter } from "#wow/protocol/packet";

export const EQUIPMENT_SLOT_COUNT = 19;
export const MAX_EQUIPMENT_SET_INDEX = 10;
export const MAX_SET_NAME_BYTES = 16;
export const MAX_SET_ICON_BYTES = 100;
export const IGNORED_SLOT = 1n;
export const SET_USE_OK = 0;
export const SET_USE_BAGS_FULL = 4;

export type EquipmentSetEntry = {
  setGuid: bigint;
  index: number;
  name: string;
  icon: string;
  items: bigint[];
};
export type EquipmentSetSavedPacket = { index: number; setGuid: bigint };
export type EquipmentSetUseEntry = { guid: bigint; bag: number; slot: number };
export type SaveKind = "create" | "update";
export type SaveStatus = "saved" | "saved_unconfirmed" | "unanswered";
export type UseStatus = "ok" | "bags_full" | "unanswered";
export type SetsListedEvent = {
  type: "sets_listed";
  sets: EquipmentSetEntry[];
};
export type SetSaveRequestedEvent = {
  type: "set_save_requested";
  index: number;
  kind: SaveKind;
  name: string;
};
export type SetSavedEvent = {
  type: "set_saved";
  index: number;
  setGuid: bigint;
  kind: SaveKind;
  name: string;
  status: SaveStatus;
  reason: string | undefined;
};
export type SetUseRequestedEvent = { type: "set_use_requested"; index: number };
export type SetUsedEvent = {
  type: "set_used";
  index: number;
  status: UseStatus;
  reason: string | undefined;
  failures: string[];
};
export type SetDeletedEvent = {
  type: "set_deleted";
  index: number;
  setGuid: bigint;
};

function checkSlots(count: number): void {
  if (count !== EQUIPMENT_SLOT_COUNT)
    throw new Error(
      `an equipment set holds ${EQUIPMENT_SLOT_COUNT} slots, got ${count}`,
    );
}

export function checkSetFields(
  index: number,
  name: string,
  icon: string,
): void {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_EQUIPMENT_SET_INDEX)
    throw new Error(
      `set index ${index} is not between 0 and ${MAX_EQUIPMENT_SET_INDEX - 1}`,
    );
  if (new TextEncoder().encode(name).length > MAX_SET_NAME_BYTES)
    throw new Error(`set name is over ${MAX_SET_NAME_BYTES} bytes`);
  if (new TextEncoder().encode(icon).length > MAX_SET_ICON_BYTES)
    throw new Error(`set icon is over ${MAX_SET_ICON_BYTES} bytes`);
}

export function buildEquipmentSetSave(set: EquipmentSetEntry): Uint8Array {
  checkSetFields(set.index, set.name, set.icon);
  checkSlots(set.items.length);
  const w = new PacketWriter();
  w.packedGuidBig(set.setGuid);
  w.uint32LE(set.index);
  w.cString(set.name);
  w.cString(set.icon);
  for (const item of set.items) w.packedGuidBig(item);
  return w.finish();
}

export function buildEquipmentSetUse(
  entries: readonly EquipmentSetUseEntry[],
): Uint8Array {
  checkSlots(entries.length);
  const w = new PacketWriter();
  for (const entry of entries) {
    w.packedGuidBig(entry.guid);
    w.uint8(entry.bag);
    w.uint8(entry.slot);
  }
  return w.finish();
}

export function buildEquipmentSetDelete(setGuid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(setGuid);
  return w.finish();
}

export function parseEquipmentSetList(r: PacketReader): EquipmentSetEntry[] {
  const count = r.uint32LE();
  const sets: EquipmentSetEntry[] = [];
  for (let i = 0; i < count; i++) {
    const setGuid = r.packedGuidBig();
    const index = r.uint32LE();
    const name = r.cString();
    const icon = r.cString();
    const items: bigint[] = [];
    for (let slot = 0; slot < EQUIPMENT_SLOT_COUNT; slot++)
      items.push(r.packedGuidBig());
    sets.push({ icon, index, items, name, setGuid });
  }
  return sets;
}

export function parseEquipmentSetSaved(
  r: PacketReader,
): EquipmentSetSavedPacket {
  const index = r.uint32LE();
  return { index, setGuid: r.packedGuidBig() };
}

export function parseEquipmentSetUseResult(r: PacketReader): number {
  return r.uint8();
}
