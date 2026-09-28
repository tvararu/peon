import { describe, expect, test } from "bun:test";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  DESTROY_TWO_OF_STACK,
  DESTROY_WHOLE_STACK,
  INVENTORY_FULL_ON_REWARD,
} from "#test-support/inventory-fixtures";
import {
  buildDestroyItem,
  InventoryResult,
  inventoryResultName,
  isNoChange,
  ownsInventoryFailure,
  parseInventoryChangeFailure,
} from "#wow/protocol/inventory";
import { PacketReader } from "#wow/protocol/packet";

const guid = 0x0102030405060708n;

describe("parseInventoryChangeFailure", () => {
  test("distinguishes explicit OK from inventory-full and preserves unknown errors", () => {
    expect(parseInventoryChangeFailure(new PacketReader(bytes("00")))).toEqual({
      kind: "ok",
      result: 0,
    });
    expect(
      parseInventoryChangeFailure(
        new PacketReader(bytes("32 0807060504030201 1817161514131211 07")),
      ),
    ).toEqual({
      kind: "error",
      result: 50,
      item1: guid,
      item2: 0x1112131415161718n,
      bagType: 7,
      detail: { kind: "none" },
    });
    expect(
      parseInventoryChangeFailure(
        new PacketReader(bytes("ff 0000000000000000 0000000000000000 00")),
      ),
    ).toEqual({
      kind: "error",
      result: 255,
      item1: 0n,
      item2: 0n,
      bagType: 0,
      detail: { kind: "none" },
    });
  });

  test("retains required-level, binding-confirmation and item-category tails", () => {
    expect(
      parseInventoryChangeFailure(
        new PacketReader(
          bytes("57 0000000000000000 0000000000000000 00 50000000"),
        ),
      ),
    ).toMatchObject({
      result: 87,
      detail: { kind: "level", requiredLevel: 80 },
    });
    expect(
      parseInventoryChangeFailure(
        new PacketReader(
          bytes(
            "51 0000000000000000 0000000000000000 00 0807060504030201 18000000 1817161514131211",
          ),
        ),
      ),
    ).toMatchObject({
      result: 81,
      detail: {
        kind: "binding",
        itemGuid: guid,
        slot: 24,
        containerGuid: 0x1112131415161718n,
      },
    });
    expect(
      parseInventoryChangeFailure(
        new PacketReader(
          bytes("59 0000000000000000 0000000000000000 00 7b000000"),
        ),
      ),
    ).toMatchObject({ result: 89, detail: { kind: "limit", category: 123 } });
  });
});

describe("CMSG_DESTROYITEM", () => {
  test("matches wow_messages and the captured client packets", () => {
    expect(buildDestroyItem(255, 36, 0)).toEqual(DESTROY_WHOLE_STACK);
    expect(buildDestroyItem(255, 29, 2)).toEqual(DESTROY_TWO_OF_STACK);
    expect(buildDestroyItem(19, 3, 5)).toEqual(bytes("13 03 05 000000"));
  });

  test("reads the captured full-bags answer to a quest reward", () => {
    const failure = parseInventoryChangeFailure(
      new PacketReader(INVENTORY_FULL_ON_REWARD),
    );
    expect(failure).toMatchObject({ kind: "error", result: 50 });
    expect(inventoryResultName(failure.result)).toBe("inventory_full");
  });
});

describe("inventoryResultName", () => {
  test("names AzerothCore results and keeps unknown codes readable", () => {
    expect(inventoryResultName(50)).toBe("inventory_full");
    expect(inventoryResultName(24)).toBe("cant_drop_soulbound");
    expect(inventoryResultName(23)).toBe("item_not_found");
    expect(inventoryResultName(250)).toBe("inventory_result_250");
  });
});

describe("inventory failure ownership", () => {
  const MINE = 0x40_00_00_00_00_00_00_0an;
  const OTHER = 0x40_00_00_00_00_00_00_0bn;
  const read = (body: Uint8Array) =>
    parseInventoryChangeFailure(new PacketReader(body));

  test("a failure naming the request's item belongs to it (PlayerStorage.cpp:4156-4196)", () => {
    const packet = read(
      itemsInventoryChangeFailureBody({
        result: 1,
        item1: MINE,
        requiredLevel: 10,
      }),
    );
    expect(
      ownsInventoryFailure(packet, { itemGuid: MINE }, [{ itemGuid: OTHER }]),
    ).toBe(true);
  });

  test("a failure with no item belongs to a request only while no other request waits", () => {
    const packet = read(itemsInventoryChangeFailureBody({ result: 23 }));
    const mine = { itemGuid: MINE };
    expect(ownsInventoryFailure(packet, mine, [undefined, undefined])).toBe(
      true,
    );
    expect(
      ownsInventoryFailure(packet, mine, [undefined, { itemGuid: undefined }]),
    ).toBe(false);
    expect(
      ownsInventoryFailure(packet, { itemGuid: undefined }, [undefined]),
    ).toBe(true);
  });

  test("a failure naming another item or an ok result belongs to nobody", () => {
    const other = read(
      itemsInventoryChangeFailureBody({ result: 22, item1: OTHER }),
    );
    expect(ownsInventoryFailure(other, { itemGuid: MINE }, [])).toBe(false);
    expect(ownsInventoryFailure(other, { itemGuid: undefined }, [])).toBe(
      false,
    );
    const ok = read(itemsInventoryChangeFailureBody({ result: 0 }));
    expect(ownsInventoryFailure(ok, { itemGuid: MINE }, [])).toBe(false);
  });

  test("result 59 EQUIP_ERR_NONE is a no-change notice, not a refusal (Item.h:106, ItemHandler.cpp:1001-1006)", () => {
    const none = read(
      itemsInventoryChangeFailureBody({ result: 59, item1: MINE }),
    );
    expect(isNoChange(none)).toBe(true);
    expect(inventoryResultName(InventoryResult.NONE)).toBe("none");
    expect(
      isNoChange(
        read(itemsInventoryChangeFailureBody({ result: 22, item1: MINE })),
      ),
    ).toBe(false);
    expect(
      isNoChange(read(itemsInventoryChangeFailureBody({ result: 0 }))),
    ).toBe(false);
  });
});
