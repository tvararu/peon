import { describe, expect, jest, test } from "bun:test";
import {
  BANK_BANKER,
  BANK_CLOTH,
  bankBagSlots,
  bankBuyBankSlotResultBody,
  bankClear,
  bankScene,
  bankSetRoot,
  bankShowBankBody,
} from "#test-support/areas/bank";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import type { BankEvent } from "#wow/areas/bank/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function guidsOf(rig: { sent: readonly { body: Uint8Array | undefined }[] }) {
  return rig.sent.map((packet) => packet.body);
}

describe("bank store", () => {
  test("SMSG_SHOW_BANK sets the banker and emits opened; the legacy quest store still sees it", () => {
    const { rig } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      expect(rig.handle.state().banker).toBe(BANK_BANKER);
      expect(seen.map((event) => event.type)).toContain("opened");
      expect(rig.stores.quests.snapshot().lastError).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("bagSlots follows byte 2 of PLAYER_BYTES_2 (Player.h:1291, update-fields.ts:156)", () => {
    const { rig, world } = bankScene();
    try {
      expect(rig.handle.state().bagSlots).toBeUndefined();
      bankBagSlots(world, 2);
      rig.touch();
      expect(rig.handle.state().bagSlots).toBe(2);
    } finally {
      rig.dispose();
    }
  });
});

describe("bank acts", () => {
  test("openBank sends CMSG_BANKER_ACTIVATE and settles on opened", async () => {
    const { rig } = bankScene();
    const events: BankEvent[] = [];
    rig.handle.onEvent((event) => events.push(event));
    try {
      const pending = rig.handle.act.openBank(BANK_BANKER);
      await flush();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_BANKER_ACTIVATE,
      ]);
      expect(guidsOf(rig).length).toBe(1);
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      expect(await pending).toEqual({ status: "ok" });
      expect(events.map((event) => event.type)).toContain("opened");
    } finally {
      rig.dispose();
    }
  });

  test("deposit sends CMSG_AUTOBANK_ITEM and settles ok when the guid reaches a bank position", async () => {
    const { rig, world } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_AUTOBANK_ITEM,
      ]);
      world.clear(255, 25);
      world.entities.delete(BANK_CLOTH);
      world.put(255, 39, { count: 20, entry: 2589, guid: BANK_CLOTH });
      rig.touch();
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a deposit merges into the roomy stack when the first bank stack is full", async () => {
    const full = BANK_CLOTH + 21n;
    const roomy = BANK_CLOTH + 22n;
    const { rig, world } = bankScene((seeded) => {
      seeded.clear(255, 25);
      seeded.entities.delete(BANK_CLOTH);
      seeded.put(255, 25, { count: 5, entry: 2589, guid: BANK_CLOTH });
      seeded.put(255, 39, { count: 20, entry: 2589, guid: full });
      seeded.put(255, 40, { count: 10, entry: 2589, guid: roomy });
    });
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_AUTOBANK_ITEM,
      ]);
      world.clear(255, 25);
      world.entities.delete(BANK_CLOTH);
      world.setCount(roomy, 15);
      rig.touch();
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a show-bank notice during a pending move does not settle it", async () => {
    const { rig, world } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      expect(rig.handle.state().pending?.kind).toBe("deposit");
      expect(seen.map((event) => event.type)).toContain("opened");
      world.clear(255, 25);
      world.entities.delete(BANK_CLOTH);
      world.put(255, 39, { count: 20, entry: 2589, guid: BANK_CLOTH });
      rig.touch();
      expect(await pending).toEqual({ status: "ok" });
      expect(seen.at(-1)).toMatchObject({
        guid: BANK_CLOTH,
        kind: "deposit",
        type: "moved",
      });
    } finally {
      rig.dispose();
    }
  });

  test("withdraw sends CMSG_AUTOSTORE_BANK_ITEM and settles ok when the guid returns to the bags", async () => {
    const { rig, world } = bankScene((seeded) => {
      seeded.clear(255, 25);
      seeded.entities.delete(BANK_CLOTH);
      seeded.put(255, 39, { count: 20, entry: 2589, guid: BANK_CLOTH });
    });
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.withdraw(255, 39);
      await flush();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_AUTOSTORE_BANK_ITEM,
      ]);
      bankClear(world, 39);
      world.entities.delete(BANK_CLOTH);
      world.put(255, 25, { count: 20, entry: 2589, guid: BANK_CLOTH });
      rig.touch();
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("withdraw from a carried position is refused locally (BankHandler.cpp:123-150)", () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      expect(() => rig.handle.act.withdraw(255, 25)).toThrow(
        "not a bank position",
      );
    } finally {
      rig.dispose();
    }
  });

  test("deposit and withdraw throw without a banker in range", () => {
    const { rig } = bankScene();
    try {
      expect(() => rig.handle.act.deposit(255, 25)).toThrow(
        "no banker is open",
      );
      expect(() => rig.handle.act.withdraw(255, 39)).toThrow(
        "no banker is open",
      );
    } finally {
      rig.dispose();
    }
  });

  test("an owned inventory failure settles refused with its name (PlayerStorage.cpp:2135-2142)", async () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: BANK_CLOTH, result: 50 }),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "inventory_full",
      });
    } finally {
      rig.dispose();
    }
  });

  test("result 59 settles no_change (BankHandler.cpp:84-88)", async () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: BANK_CLOTH, result: 59 }),
      );
      expect(await pending).toEqual({ status: "no_change" });
    } finally {
      rig.dispose();
    }
  });

  test("buyBankSlot sends CMSG_BUY_BANK_SLOT and settles ok", async () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.buyBankSlot();
      await flush();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_BUY_BANK_SLOT,
      ]);
      rig.inject(
        GameOpcode.SMSG_BUY_BANK_SLOT_RESULT,
        bankBuyBankSlotResultBody(3),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("buyBankSlot with insufficient funds settles refused (BankHandler.cpp:168-175)", async () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.buyBankSlot();
      await flush();
      rig.inject(
        GameOpcode.SMSG_BUY_BANK_SLOT_RESULT,
        bankBuyBankSlotResultBody(1),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "insufficient_funds",
      });
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 5 s settles unanswered", async () => {
    jest.useFakeTimers();
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().pending).toBeDefined();
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "unanswered" });
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });

  test("run abort rejects a pending deposit", async () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      rig.dispose();
      await expect(pending).rejects.toThrow();
    } finally {
      void bankSetRoot;
      void bankClear;
    }
  });

  test("a second act while one is pending is refused locally", async () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const pending = rig.handle.act.deposit(255, 25);
      await flush();
      await expect(rig.handle.act.buyBankSlot()).rejects.toThrow(
        "already pending",
      );
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_AUTOBANK_ITEM,
      ]);
      rig.dispose();
      await expect(pending).rejects.toThrow();
    } finally {
      void bankSetRoot;
      void bankClear;
    }
  });
});
