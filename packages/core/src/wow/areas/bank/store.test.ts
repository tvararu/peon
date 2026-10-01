import { describe, expect, test } from "bun:test";
import {
  BANK_BANKER,
  BANK_CLOTH,
  bankClear,
  bankScene,
  bankSetRoot,
  bankShowBankBody,
} from "#test-support/areas/bank";
import { itemsInventoryChangeFailureBody } from "#test-support/areas/items";
import type { BankEvent } from "#wow/areas/bank/store";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("bank store events", () => {
  test("a second show-bank updates the banker and emits opened again", () => {
    const { rig } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      const other = BANK_BANKER + 1n;
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(other));
      expect(rig.handle.state().banker).toBe(other);
      expect(
        seen
          .filter((event) => event.type === "opened")
          .map((event) => (event.type === "opened" ? event.banker : 0n)),
      ).toEqual([BANK_BANKER, other]);
    } finally {
      rig.dispose();
    }
  });

  test("a bankbag root settles a deposit as moved", () => {
    const { rig, world } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      rig.stores.areas.bank.begin({
        bag: 255,
        guid: BANK_CLOTH,
        kind: "deposit",
        requestedAt: 0,
        slot: 25,
      });
      world.clear(255, 25);
      world.entities.delete(BANK_CLOTH);
      world.put(255, 67, { count: 20, entry: 2589, guid: BANK_CLOTH });
      rig.stores.areas.bank.observeInventory();
      expect(seen.map((event) => event.type)).toContain("moved");
      expect(rig.handle.state().lastOutcome?.status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("a duplicate label in another slot still settles on the guid", () => {
    const { rig, world } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      rig.stores.areas.bank.begin({
        bag: 255,
        guid: BANK_CLOTH,
        kind: "deposit",
        requestedAt: 0,
        slot: 25,
      });
      world.put(255, 26, { count: 20, entry: 2589, guid: BANK_CLOTH + 7n });
      world.clear(255, 25);
      world.entities.delete(BANK_CLOTH);
      world.put(255, 39, { count: 20, entry: 2589, guid: BANK_CLOTH });
      rig.stores.areas.bank.observeInventory();
      expect(seen.at(-1)).toMatchObject({
        guid: BANK_CLOTH,
        kind: "deposit",
        type: "moved",
      });
      expect(rig.handle.state().pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("a guid-less failure settles refused for the pending move", () => {
    const { rig } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      rig.stores.areas.bank.begin({
        bag: 255,
        guid: undefined,
        kind: "deposit",
        requestedAt: 0,
        slot: 26,
      });
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: 0n, result: 50 }),
      );
      expect(seen.at(-1)).toMatchObject({
        reason: "inventory_full",
        type: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("no_change settles a deposit without touching the slots", () => {
    const { rig } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      rig.stores.areas.bank.begin({
        bag: 255,
        guid: BANK_CLOTH,
        kind: "deposit",
        requestedAt: 0,
        slot: 25,
      });
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: BANK_CLOTH, result: 59 }),
      );
      expect(seen.at(-1)).toMatchObject({ kind: "deposit", type: "no_change" });
      expect(rig.handle.state().pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("a slot result with no pending buy is ignored and keeps lastSlotResult", () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      rig.stores.areas.bank.receiveSlotResult("insufficient_funds");
      expect(rig.handle.state().lastSlotResult).toBeUndefined();
      expect(rig.handle.state().pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("an equipped bag guid in the bank roots counts as moved", () => {
    const { rig, world } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      const bagGuid = 0x40_00_00_00_00_00_00_31n;
      rig.stores.areas.bank.begin({
        bag: 255,
        guid: bagGuid,
        kind: "deposit",
        requestedAt: 0,
        slot: 19,
      });
      world.clear(255, 19);
      bankSetRoot(world, 68, bagGuid);
      rig.stores.areas.bank.observeInventory();
      expect(seen.at(-1)).toMatchObject({ kind: "deposit", type: "moved" });
      bankClear(world, 68);
    } finally {
      rig.dispose();
    }
  });

  test("a deposit merged into an existing bank stack settles as moved", () => {
    const { rig, world } = bankScene((seeded) => {
      seeded.put(255, 39, { count: 5, entry: 2589, guid: BANK_CLOTH + 3n });
    });
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      rig.stores.areas.bank.begin({
        bag: 255,
        entry: 2589,
        guid: BANK_CLOTH,
        kind: "deposit",
        slot: 25,
        toCount: 5,
        toGuid: BANK_CLOTH + 3n,
        requestedAt: 0,
      });
      world.clear(255, 25);
      world.entities.delete(BANK_CLOTH);
      world.setCount(BANK_CLOTH + 3n, 25);
      rig.touch();
      rig.stores.areas.bank.observeInventory();
      expect(seen.at(-1)).toMatchObject({ kind: "deposit", type: "moved" });
      expect(rig.handle.state().lastOutcome?.status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("a withdrawal merged into a carried stack settles as moved", () => {
    const { rig, world } = bankScene((seeded) => {
      seeded.clear(255, 25);
      seeded.entities.delete(BANK_CLOTH);
      seeded.put(255, 25, { count: 5, entry: 2589, guid: BANK_CLOTH + 5n });
      seeded.put(255, 39, { count: 20, entry: 2589, guid: BANK_CLOTH });
    });
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      rig.stores.areas.bank.begin({
        bag: 255,
        entry: 2589,
        guid: BANK_CLOTH,
        kind: "withdraw",
        slot: 39,
        toCount: 5,
        toGuid: BANK_CLOTH + 5n,
        requestedAt: 0,
      });
      bankClear(world, 39);
      world.entities.delete(BANK_CLOTH);
      world.setCount(BANK_CLOTH + 5n, 25);
      rig.touch();
      rig.stores.areas.bank.observeInventory();
      expect(seen.at(-1)).toMatchObject({ kind: "withdraw", type: "moved" });
      expect(rig.handle.state().lastOutcome?.status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("result 59 for another item does not settle the pending move", () => {
    const { rig } = bankScene();
    const seen: BankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      seen.length = 0;
      rig.stores.areas.bank.begin({
        bag: 255,
        guid: BANK_CLOTH,
        kind: "deposit",
        requestedAt: 0,
        slot: 25,
      });
      rig.inject(
        GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE,
        itemsInventoryChangeFailureBody({ item1: BANK_CLOTH + 9n, result: 59 }),
      );
      expect(seen).toHaveLength(0);
      expect(rig.handle.state().pending?.kind).toBe("deposit");
    } finally {
      rig.dispose();
    }
  });

  test("a successful purchase after a refusal records ok as the last slot result", () => {
    const { rig } = bankScene();
    try {
      rig.inject(GameOpcode.SMSG_SHOW_BANK, bankShowBankBody(BANK_BANKER));
      rig.stores.areas.bank.begin({
        banker: BANK_BANKER,
        kind: "slot",
        requestedAt: 0,
      });
      rig.stores.areas.bank.receiveSlotResult("insufficient_funds");
      expect(rig.handle.state().lastSlotResult).toBe("insufficient_funds");
      rig.stores.areas.bank.begin({
        banker: BANK_BANKER,
        kind: "slot",
        requestedAt: 1,
      });
      rig.stores.areas.bank.receiveSlotResult("ok");
      expect(rig.handle.state().lastSlotResult).toBe("ok");
      expect(rig.handle.state().lastOutcome?.status).toBe("ok");
    } finally {
      rig.dispose();
    }
  });
});
