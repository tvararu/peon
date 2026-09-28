import { describe, expect, test } from "bun:test";
import { bytes } from "#test-support/hex";
import {
  buildAutoEquipItem,
  buildAutoEquipItemSlot,
  buildAutostoreBagItem,
  buildSplitItem,
  buildSwapInvItem,
  buildSwapItem,
} from "#wow/areas/items/protocol";

const SWORD = 0x40_00_00_00_00_00_12_34n;

describe("items move builders", () => {
  test("CMSG_AUTOEQUIP_ITEM writes the source bag and slot (ItemPackets.cpp:49-53)", () => {
    expect(buildAutoEquipItem({ bag: 255, slot: 24 })).toEqual(bytes("ff 18"));
  });

  test("CMSG_AUTOEQUIP_ITEM_SLOT writes the item guid, then the destination slot (ItemPackets.cpp:35-39)", () => {
    expect(buildAutoEquipItemSlot(SWORD, 15)).toEqual(
      bytes("3412000000000040 0f"),
    );
  });

  test("CMSG_SWAP_ITEM writes the destination bag and slot, then the source (ItemPackets.cpp:41-47)", () => {
    expect(buildSwapItem({ bag: 19, slot: 2 }, { bag: 255, slot: 23 })).toEqual(
      bytes("13 02 ff 17"),
    );
  });

  test("CMSG_SWAP_INV_ITEM writes the destination first, as SwapInventoryItem::Read reads it (ItemPackets.cpp:29-33)", () => {
    expect(buildSwapInvItem(30, 23)).toEqual(bytes("1e 17"));
  });

  test("CMSG_AUTOSTORE_BAG_ITEM writes the source bag and slot, then the destination bag (ItemPackets.cpp:108-113)", () => {
    expect(buildAutostoreBagItem({ bag: 255, slot: 15 }, 0)).toEqual(
      bytes("ff 0f 00"),
    );
  });

  test("CMSG_SPLIT_ITEM writes source, destination and a u32 count (ItemPackets.cpp:20-27, ItemPackets.h:40)", () => {
    expect(
      buildSplitItem({ bag: 255, slot: 25 }, { bag: 19, slot: 0 }, 5),
    ).toEqual(bytes("ff 19 13 00 05000000"));
  });
});
