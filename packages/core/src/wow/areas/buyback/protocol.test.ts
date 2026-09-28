import { describe, expect, test } from "bun:test";
import { bytes } from "#test-support/hex";
import {
  buildBuybackItem,
  buildBuyItemInSlot,
} from "#wow/areas/buyback/protocol";

const VENDOR = 0xf1_30_00_00_12_34_56_78n;
const ME = 0x00_00_00_00_00_00_0a_00n;

describe("buyback builders", () => {
  test("CMSG_BUYBACK_ITEM writes the vendor guid, then the u32 slot (ItemPackets.cpp:78-82)", () => {
    expect(buildBuybackItem(VENDOR, 74)).toEqual(
      bytes("7856341200 0030f1 4a000000"),
    );
  });

  test("the buyback slot is the raw 74-85 of AzerothCore (Player.h:711-712), not wowm's BuybackSlot 69-81", () => {
    expect(buildBuybackItem(VENDOR, 85).subarray(8)).toEqual(bytes("55000000"));
    expect(() => buildBuybackItem(VENDOR, 73)).toThrow("74-85");
    expect(() => buildBuybackItem(VENDOR, 86)).toThrow("74-85");
    expect(() => buildBuybackItem(VENDOR, 69)).toThrow("74-85");
  });

  test("CMSG_BUY_ITEM_IN_SLOT writes u64 vendor, u32 item, u32 vendor slot, u64 bag, u8 bag slot, u32 count (ItemPackets.cpp:84-92)", () => {
    expect(
      buildBuyItemInSlot({
        bagGuid: ME,
        bagSlot: 24,
        count: 5,
        item: 159,
        vendor: VENDOR,
        vendorSlot: 3,
      }),
    ).toEqual(
      bytes("78563412 000030f1 9f000000 03000000 000a000000000000 18 05000000"),
    );
  });

  test("the CMSG_BUY_ITEM_IN_SLOT count is a u32 (ItemPackets.cpp:91), not wowm's u8 amount", () => {
    const body = buildBuyItemInSlot({
      bagGuid: ME,
      bagSlot: 0,
      count: 300,
      item: 159,
      vendor: VENDOR,
      vendorSlot: 1,
    });
    expect(body.length).toBe(29);
    expect(body.subarray(25)).toEqual(bytes("2c010000"));
  });

  test("vendor slot 0 throws, because AzerothCore drops it as a cheat (ItemHandler.cpp:800-804)", () => {
    expect(() =>
      buildBuyItemInSlot({
        bagGuid: ME,
        bagSlot: 0,
        count: 1,
        item: 159,
        vendor: VENDOR,
        vendorSlot: 0,
      }),
    ).toThrow("vendor slot");
  });
});
