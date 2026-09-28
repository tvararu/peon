import { describe, expect, test } from "bun:test";
import { lootingLootListBody } from "#test-support/areas/looting";
import { buildOptOutOfLoot, parseLootList } from "#wow/areas/looting/protocol";
import { PacketReader } from "#wow/protocol/packet";

const CREATURE = 0xf1_30_00_3d_28_01_28_c6n;
const MASTER = 0x2an;
const LOOTER = 0xdcen;

describe("looting parsers", () => {
  test("SMSG_LOOT_LIST solo form reads u64 creature and two u8 0 (Unit.cpp:13615-13618)", () => {
    const body = lootingLootListBody({ creature: CREATURE });
    expect(body).toEqual(
      new Uint8Array([0xc6, 0x28, 0x01, 0x28, 0x3d, 0x00, 0x30, 0xf1, 0, 0]),
    );
    const reader = new PacketReader(body);
    expect(parseLootList(reader)).toEqual({
      creature: CREATURE,
      master: 0n,
      looter: 0n,
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_LOOT_LIST group form reads packed master and looter (Group.cpp:1085-1101)", () => {
    const body = lootingLootListBody({
      creature: CREATURE,
      master: MASTER,
      looter: LOOTER,
    });
    const reader = new PacketReader(body);
    expect(parseLootList(reader)).toEqual({
      creature: CREATURE,
      master: MASTER,
      looter: LOOTER,
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_LOOT_LIST group form with no master reads the looter after u8 0", () => {
    const body = lootingLootListBody({ creature: CREATURE, looter: LOOTER });
    expect([...body.slice(8)]).toEqual([0, 0b0000_0011, 0xce, 0x0d]);
    expect(parseLootList(new PacketReader(body))).toEqual({
      creature: CREATURE,
      master: 0n,
      looter: LOOTER,
    });
  });

  test("CMSG_OPT_OUT_OF_LOOT writes u32 1 to pass and 0 to stop (GroupHandler.cpp:1143-1152)", () => {
    expect(buildOptOutOfLoot(true)).toEqual(new Uint8Array([1, 0, 0, 0]));
    expect(buildOptOutOfLoot(false)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });
});
