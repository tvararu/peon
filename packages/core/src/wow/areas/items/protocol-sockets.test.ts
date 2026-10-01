import { describe, expect, test } from "bun:test";
import {
  itemsEnchantmentLogBody,
  itemsSocketGemsResultBody,
} from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  buildCancelTempEnchantment,
  buildSocketGems,
  parseEnchantmentLog,
  parseSocketGemsResult,
} from "#wow/areas/items/protocol-sockets";
import { PacketReader } from "#wow/protocol/packet";

const ITEM = 0x40_00_00_00_00_00_12_34n;
const GEM_A = 0x40_00_00_00_00_00_00_0an;
const GEM_B = 0x40_00_00_00_00_00_00_0bn;
const ME = 0x0a_00n;

describe("items socket packets", () => {
  test("CMSG_SOCKET_GEMS is the item guid then three gem guids, empty sockets zero (ItemPackets.cpp:143-148)", () => {
    expect(buildSocketGems(ITEM, [GEM_A, GEM_B])).toEqual(
      bytes(
        "3412000000000040 0a00000000000040 0b00000000000040 0000000000000000",
      ),
    );
  });

  test("CMSG_CANCEL_TEMP_ENCHANTMENT is one u32 slot (ItemPackets.cpp:150-153)", () => {
    expect(buildCancelTempEnchantment(15)).toEqual(bytes("0f000000"));
  });

  test("SMSG_SOCKET_GEMS_RESULT is the item then four enchant ids, the last the socket bonus (Item.cpp:1071-1076)", () => {
    const body = itemsSocketGemsResultBody(ITEM, [3101, 0, 0, 3312]);
    expect(body).toEqual(
      bytes("3412000000000040 1d0c0000 00000000 00000000 f00c0000"),
    );
    const r = new PacketReader(body);
    expect(parseSocketGemsResult(r)).toEqual({
      itemGuid: ITEM,
      sockets: [3101, 0, 0],
      bonus: 3312,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ENCHANTMENTLOG is packed target, packed caster, entry, enchant id and no trailing bool (ItemPackets.cpp:115-123)", () => {
    const body = itemsEnchantmentLogBody({
      target: ME,
      caster: 0n,
      entry: 2589,
      enchantId: 3101,
    });
    expect(body).toEqual(bytes("020a 00 1d0a0000 1d0c0000"));
    const r = new PacketReader(body);
    expect(parseEnchantmentLog(r)).toEqual({
      target: ME,
      caster: 0n,
      entry: 2589,
      enchantId: 3101,
    });
    expect(r.remaining).toBe(0);
  });
});
