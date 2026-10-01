import { describe, expect, test } from "bun:test";
import { itemsItemNameResponseBody } from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  buildItemNameQuery,
  buildWrapItem,
  parseItemNameResponse,
} from "#wow/areas/items/protocol-names";
import { PacketReader } from "#wow/protocol/packet";

describe("items wrap and name packets", () => {
  test("CMSG_WRAP_ITEM is gift bag, gift slot, item bag, item slot (ItemPackets.cpp:135-141)", () => {
    expect(buildWrapItem({ bag: 255, slot: 24 }, { bag: 19, slot: 3 })).toEqual(
      bytes("ff 18 13 03"),
    );
  });

  test("CMSG_ITEM_NAME_QUERY is u32 entry then u64 guid, zero by default (ItemHandler.cpp:1061-1065)", () => {
    expect(buildItemNameQuery(6473)).toEqual(
      bytes("49190000 0000000000000000"),
    );
    expect(buildItemNameQuery(6473, 0x40_00_00_00_00_00_12_34n)).toEqual(
      bytes("49190000 3412000000000040"),
    );
  });

  test("SMSG_ITEM_NAME_QUERY_RESPONSE ends in a u32 inventory type (ItemHandler.cpp:1077-1081)", () => {
    const body = itemsItemNameResponseBody({
      entry: 6473,
      inventoryType: 5,
      name: "Armor of the Fang",
    });
    expect(body).toEqual(
      bytes(
        `49190000 ${Buffer.from("Armor of the Fang").toString("hex")} 00 05000000`,
      ),
    );
    const r = new PacketReader(body);
    expect(parseItemNameResponse(r)).toEqual({
      entry: 6473,
      inventoryType: 5,
      name: "Armor of the Fang",
    });
    expect(r.remaining).toBe(0);
  });
});
