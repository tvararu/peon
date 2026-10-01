import { describe, expect, test } from "bun:test";
import { EntityStore } from "#wow/entity-store";
import { BANK_ROOTS, readBankBagSlots } from "#wow/inventory-bank";
import { ObjectType } from "#wow/protocol/entity-fields";

describe("bank roots", () => {
  test("covers slots 39-66 as bank and 67-73 as bankbag (Player.h:698-705)", () => {
    expect(BANK_ROOTS).toMatchObject([
      { count: 28, first: 39, region: "bank" },
      { count: 7, first: 67, region: "bankbag" },
    ]);
    const [bank, bags] = BANK_ROOTS;
    expect(bank?.offset).toBe(324 + 2 * 39);
    expect(bags?.offset).toBe(324 + 2 * 67);
  });

  test("reads the bought bag-slot count from byte 2 of PLAYER_BYTES_2 (Player.h:1291)", () => {
    const entities = new EntityStore();
    entities.create(1n, ObjectType.PLAYER, { createComplete: true });
    const lookup = (guid: bigint) => entities.get(guid);
    expect(readBankBagSlots(1n, lookup)).toBeUndefined();
    entities.update(1n, {}, new Map([[154, 0x00_03_00_00]]));
    expect(readBankBagSlots(1n, lookup)).toBe(3);
    expect(readBankBagSlots(9n, lookup)).toBeUndefined();
  });
});
