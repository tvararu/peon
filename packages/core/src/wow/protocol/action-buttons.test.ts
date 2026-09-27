import { describe, expect, test } from "bun:test";
import { ActionBarStore } from "#wow/action-bar";
import {
  ACTION_BUTTON_SLOTS,
  parseActionButtons,
} from "#wow/protocol/action-buttons";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

function packet(behavior: number, slots: Record<number, number>): Uint8Array {
  const w = new PacketWriter();
  w.uint8(behavior);
  if (behavior === 2) return w.finish();
  for (let slot = 0; slot < ACTION_BUTTON_SLOTS; slot++)
    w.uint32LE(slots[slot] ?? 0);
  return w.finish();
}

const warrior = packet(1, {
  0: 6603,
  1: 78,
  10: 0x80_00_00_00 | 6948,
  11: 0x40_00_00_00 | 3,
  12: 0x20_00_00_00 | 1,
  72: 2457,
  143: 0x41_00_00_00 | 9,
  30: 0x01_00_00_07,
});

describe("parseActionButtons", () => {
  test("unpacks the 24-bit action and 8-bit type of every used slot", () => {
    const r = new PacketReader(warrior);
    expect(parseActionButtons(r)).toEqual({
      behavior: "set",
      buttons: [
        { slot: 0, type: "spell", id: 6603 },
        { slot: 1, type: "spell", id: 78 },
        { slot: 10, type: "item", id: 6948 },
        { slot: 11, type: "macro", id: 3 },
        { slot: 12, type: "equipment_set", id: 1 },
        { slot: 72, type: "spell", id: 2457 },
        { slot: 143, type: "macro", id: 9 },
      ],
    });
    expect(r.remaining).toBe(0);
  });

  test("a clear carries no button data", () => {
    const r = new PacketReader(packet(2, {}));
    expect(parseActionButtons(r)).toEqual({ behavior: "clear" });
    expect(r.remaining).toBe(0);
  });

  test("rejects an unknown behavior", () => {
    expect(() => parseActionButtons(new PacketReader(packet(3, {})))).toThrow(
      "invalid_action_bar_behavior",
    );
  });
});

describe("ActionBarStore", () => {
  test("replaces the bar on each packet and empties it on clear", () => {
    const store = new ActionBarStore();
    expect(store.snapshot()).toEqual([]);
    store.receive(new PacketReader(packet(0, { 0: 6603 })));
    expect(store.snapshot()).toEqual([{ slot: 0, type: "spell", id: 6603 }]);
    store.receive(new PacketReader(warrior));
    expect(store.snapshot()).toHaveLength(7);
    store.receive(new PacketReader(packet(2, {})));
    expect(store.snapshot()).toEqual([]);
  });
});
