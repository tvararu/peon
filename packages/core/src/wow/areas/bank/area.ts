import { BANK_OPCODES } from "#wow/areas/bank/opcodes";
import { parseBuyBankSlotResult } from "#wow/areas/bank/protocol";
import { bankRuntime } from "#wow/areas/bank/runtime";
import { BankStore } from "#wow/areas/bank/store";
import { defineArea } from "#wow/areas/contract";
import { parseInventoryChangeFailure } from "#wow/protocol/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";

export const bankArea = defineArea({
  eventTypes: [
    "opened",
    "moved",
    "slot_bought",
    "refused",
    "no_change",
    "unanswered",
  ],
  name: "bank",
  opcodes: BANK_OPCODES,
  register: (wire, store) => {
    wire.peek(GameOpcode.SMSG_SHOW_BANK, (reader) => {
      store.receiveShowBank(reader.uint64LE());
    });
    wire.on(GameOpcode.SMSG_BUY_BANK_SLOT_RESULT, (reader) => {
      store.receiveSlotResult(parseBuyBankSlotResult(reader).name);
    });
    wire.peek(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, (reader) => {
      store.receiveInventoryFailure(parseInventoryChangeFailure(reader));
    });
  },
  runtime: bankRuntime,
  store: (deps, core) => new BankStore(deps, core),
});
