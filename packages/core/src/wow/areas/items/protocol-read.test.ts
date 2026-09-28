import { describe, expect, test } from "bun:test";
import {
  itemsItemTextQueryResponseBody,
  itemsReadItemResultBody,
} from "#test-support/areas/items";
import { bytes } from "#test-support/hex";
import {
  buildItemTextQuery,
  buildOpenItem,
  buildReadItem,
  parseItemTextResponse,
  parseReadItemResult,
} from "#wow/areas/items/protocol-read";
import { PacketReader } from "#wow/protocol/packet";

const LETTER = 0x40_00_00_00_00_00_12_34n;

describe("items read builders", () => {
  test("CMSG_OPEN_ITEM writes the bag and slot (SpellHandler.cpp:216)", () => {
    expect(buildOpenItem({ bag: 19, slot: 3 })).toEqual(bytes("13 03"));
  });

  test("CMSG_READ_ITEM writes the bag and slot (ItemPackets.cpp:65-69)", () => {
    expect(buildReadItem({ bag: 255, slot: 24 })).toEqual(bytes("ff 18"));
  });

  test("CMSG_ITEM_TEXT_QUERY writes the item guid (ItemHandler.cpp:1461-1465)", () => {
    expect(buildItemTextQuery(LETTER)).toEqual(bytes("3412000000000040"));
  });
});

describe("items read parsers", () => {
  test("SMSG_READ_ITEM_OK and SMSG_READ_ITEM_FAILED carry only the guid (ItemHandler.cpp:559-571)", () => {
    const r = new PacketReader(itemsReadItemResultBody(LETTER));
    expect(parseReadItemResult(r)).toEqual({ guid: LETTER });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ITEM_TEXT_QUERY_RESPONSE with text reads 0, the guid and the text (ItemHandler.cpp:1468-1474)", () => {
    const body = itemsItemTextQueryResponseBody({
      guid: LETTER,
      text: "Dear Mother",
    });
    expect(body).toEqual(bytes("00 3412000000000040 44656172204d6f7468657200"));
    const r = new PacketReader(body);
    expect(parseItemTextResponse(r)).toEqual({
      found: true,
      guid: LETTER,
      text: "Dear Mother",
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_ITEM_TEXT_QUERY_RESPONSE for an unknown item is 1 alone (ItemHandler.cpp:1476-1479)", () => {
    const r = new PacketReader(itemsItemTextQueryResponseBody(undefined));
    expect(parseItemTextResponse(r)).toEqual({ found: false });
    expect(r.remaining).toBe(0);
  });
});
