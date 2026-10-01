import { describe, expect, test } from "bun:test";
import { bytes } from "#test-support/hex";
import {
  buildAutobankItem,
  buildAutostoreBankItem,
  buildBankerActivate,
  buildBuyBankSlot,
  BUY_BANK_SLOT_RESULT,
  buyBankSlotResultName,
  parseBuyBankSlotResult,
} from "#wow/areas/bank/protocol";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

function slotResultBody(result: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(result);
  return w.finish();
}

const BANKER = 0xf1_30_00_00_12_34_56_78n;

describe("bank builders", () => {
  test("CMSG_BANKER_ACTIVATE and CMSG_BUY_BANK_SLOT write the banker guid alone (BankHandler.cpp:44-48, :143-146)", () => {
    expect(buildBankerActivate(BANKER)).toEqual(bytes("7856341200 0030f1"));
    expect(buildBuyBankSlot(BANKER)).toEqual(bytes("7856341200 0030f1"));
  });

  test("the autobank packets write u8 bag, u8 slot (BankPackets.cpp:20-30)", () => {
    expect(buildAutobankItem(255, 25)).toEqual(bytes("ff 19"));
    expect(buildAutostoreBankItem(67, 3)).toEqual(bytes("43 03"));
  });

  test("a bag or slot outside one byte is refused", () => {
    expect(() => buildAutobankItem(256, 0)).toThrow("bag");
    expect(() => buildAutostoreBankItem(255, -1)).toThrow("slot");
    expect(() => buildAutobankItem(255, 1.5)).toThrow("slot");
  });
});

describe("SMSG_BUY_BANK_SLOT_RESULT", () => {
  test("reads one u32 and names the four results (BankPackets.cpp:37-42, Player.h:112-115)", () => {
    const read = (result: number) =>
      parseBuyBankSlotResult(
        new PacketReader(slotResultBody(result)),
      );
    expect(read(BUY_BANK_SLOT_RESULT.too_many)).toEqual({
      result: 0,
      name: "too_many",
    });
    expect(read(1).name).toBe("insufficient_funds");
    expect(read(2).name).toBe("not_banker");
    expect(read(3).name).toBe("ok");
  });

  test("an unknown result keeps its number in the name", () => {
    expect(buyBankSlotResultName(9)).toBe("bank_slot_result_9");
  });
});
