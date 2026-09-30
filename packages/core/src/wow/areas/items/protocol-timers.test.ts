import { describe, expect, test } from "bun:test";
import {
  itemsItemCooldownBody,
  itemsItemEnchantTimeUpdateBody,
  itemsItemTimeUpdateBody,
  itemsSetProficiencyBody,
} from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  parseItemCooldown,
  parseItemEnchantTimeUpdate,
  parseItemTimeUpdate,
  parseSetProficiency,
} from "#wow/areas/items/protocol-timers";
import { PacketReader } from "#wow/protocol/packet";

const ITEM = 0x40_00_00_00_00_00_12_34n;
const ME = 0x0a_00n;

describe("items timer parsers", () => {
  test("SMSG_ITEM_COOLDOWN is the item guid and the spell (Player.cpp:12058-12061)", () => {
    const body = itemsItemCooldownBody(ITEM, 7000);
    expect(body).toEqual(bytes("3412000000000040 581b0000"));
    const r = new PacketReader(body);
    expect(parseItemCooldown(r)).toEqual({ itemGuid: ITEM, spell: 7000 });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ITEM_TIME_UPDATE is the item guid and the seconds left (Item.cpp:1088-1091)", () => {
    const body = itemsItemTimeUpdateBody(ITEM, 3600);
    expect(body).toEqual(bytes("3412000000000040 100e0000"));
    const r = new PacketReader(body);
    expect(parseItemTimeUpdate(r)).toEqual({ itemGuid: ITEM, seconds: 3600 });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ITEM_ENCHANT_TIME_UPDATE is item, slot, seconds, player (ItemPackets.cpp:125-133)", () => {
    const body = itemsItemEnchantTimeUpdateBody({
      item: ITEM,
      player: ME,
      seconds: 1800,
      slot: 1,
    });
    expect(body).toEqual(
      bytes("3412000000000040 01000000 08070000 000a000000000000"),
    );
    const r = new PacketReader(body);
    expect(parseItemEnchantTimeUpdate(r)).toEqual({
      itemGuid: ITEM,
      playerGuid: ME,
      seconds: 1800,
      slot: 1,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_SET_PROFICIENCY is the item class and the subclass mask (Player.cpp:10282-10285)", () => {
    const body = itemsSetProficiencyBody(2, 0x00_01_e5_ff);
    expect(body).toEqual(bytes("02 ffe50100"));
    const r = new PacketReader(body);
    expect(parseSetProficiency(r)).toEqual({
      itemClass: 2,
      mask: 0x00_01_e5_ff,
    });
    expect(r.remaining).toBe(0);
  });
});
