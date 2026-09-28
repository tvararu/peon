import { BUYBACK_OPCODES } from "#wow/areas/buyback/opcodes";
import { buybackRuntime } from "#wow/areas/buyback/runtime";
import { BuybackStore } from "#wow/areas/buyback/store";
import { defineArea } from "#wow/areas/contract";
import { parseInventoryChangeFailure } from "#wow/protocol/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import {
  parseBuyFailed,
  parseBuyItem,
  parseSellItemFailure,
} from "#wow/protocol/vendor";

export const buybackArea = defineArea({
  name: "buyback",
  opcodes: BUYBACK_OPCODES,
  eventTypes: [
    "listed",
    "bought_back",
    "bought_in_slot",
    "refused",
    "unanswered",
  ],
  store: (deps, core) => new BuybackStore(deps, core),
  register: (wire, store) => {
    wire.peek(GameOpcode.SMSG_BUY_FAILED, (r) =>
      store.receiveBuyFailure(parseBuyFailed(r)),
    );
    wire.peek(GameOpcode.SMSG_SELL_ITEM, (r) =>
      store.receiveSellFailure(parseSellItemFailure(r)),
    );
    wire.peek(GameOpcode.SMSG_BUY_ITEM, (r) =>
      store.receiveBuyItem(parseBuyItem(r)),
    );
    wire.peek(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, (r) =>
      store.receiveInventoryFailure(parseInventoryChangeFailure(r)),
    );
  },
  runtime: buybackRuntime,
});
