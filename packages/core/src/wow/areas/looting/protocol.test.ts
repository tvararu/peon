import { describe, expect, test } from "bun:test";
import {
  lootingLootListBody,
  lootingLootMasterListBody,
} from "#test-support/areas/looting";
import {
  buildLootMasterGive,
  buildLootMethod,
  buildOptOutOfLoot,
  LOOT_METHOD_NAMES,
  LOOT_THRESHOLD_NAMES,
  lootErrorName,
  parseLootList,
  parseLootMasterList,
} from "#wow/areas/looting/protocol";
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

  test("CMSG_LOOT_METHOD writes u32 method, u64 master and u32 threshold (GroupHandler.cpp:518-521)", () => {
    expect(buildLootMethod(2, 0xdcen, 2)).toEqual(
      new Uint8Array([2, 0, 0, 0, 0xce, 0x0d, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]),
    );
    expect(buildLootMethod(3, 0n, 4)).toEqual(
      new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0]),
    );
  });

  test("loot method names follow LootMgr.h:56-63 and thresholds start at uncommon (SharedDefines.h:315-323)", () => {
    expect(LOOT_METHOD_NAMES).toEqual([
      "free_for_all",
      "round_robin",
      "master_loot",
      "group_loot",
      "need_before_greed",
    ]);
    expect(LOOT_THRESHOLD_NAMES).toEqual([
      "uncommon",
      "rare",
      "epic",
      "legendary",
      "artifact",
    ]);
  });

  test("SMSG_LOOT_MASTER_LIST reads u8 count then full u64 guids (Group.cpp:1482-1492)", () => {
    const body = lootingLootMasterListBody([LOOTER, MASTER]);
    expect([...body]).toEqual([
      2, 0xce, 0x0d, 0, 0, 0, 0, 0, 0, 0x2a, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const reader = new PacketReader(body);
    expect(parseLootMasterList(reader)).toEqual({
      candidates: [LOOTER, MASTER],
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_LOOT_MASTER_LIST with count 0 reads no guids", () => {
    expect(
      parseLootMasterList(new PacketReader(lootingLootMasterListBody([]))),
    ).toEqual({ candidates: [] });
  });

  test("CMSG_LOOT_MASTER_GIVE writes u64 loot guid, u8 slot, u64 target (LootHandler.cpp:483)", () => {
    expect(buildLootMasterGive(CREATURE, 3, LOOTER)).toEqual(
      new Uint8Array([
        0xc6, 0x28, 0x01, 0x28, 0x3d, 0x00, 0x30, 0xf1, 3, 0xce, 0x0d, 0, 0, 0,
        0, 0, 0,
      ]),
    );
  });

  test("loot error names follow LootMgr.h:96-108", () => {
    expect(lootErrorName(12)).toBe("that player's inventory is full");
    expect(lootErrorName(13)).toBe("player has too many of that item already");
    expect(lootErrorName(14)).toBe("can't assign item to that player");
    expect(lootErrorName(10)).toBe("player not found");
    expect(lootErrorName(0)).toBe("no permission to loot that corpse");
    expect(lootErrorName(99)).toBe("loot error 99");
  });
});
