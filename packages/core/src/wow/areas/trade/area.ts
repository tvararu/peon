import { defineArea } from "#wow/areas/contract";
import { TRADE_OPCODES } from "#wow/areas/trade/opcodes";
import {
  parseTradeStatus,
  parseTradeStatusExtended,
} from "#wow/areas/trade/protocol";
import { tradeRuntime } from "#wow/areas/trade/runtime";
import { TradeStore } from "#wow/areas/trade/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const tradeArea = defineArea({
  eventTypes: [
    "requested",
    "opened",
    "canceled",
    "refused",
    "unanswered",
    "offer_changed",
    "back_to_trade",
    "they_accepted",
    "completed",
  ],
  name: "trade",
  opcodes: TRADE_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_TRADE_STATUS, (reader) => {
      const parsed = parseTradeStatus(reader);
      if (parsed) store.receiveStatus(parsed);
    });
    wire.on(GameOpcode.SMSG_TRADE_STATUS_EXTENDED, (reader) => {
      const parsed = parseTradeStatusExtended(reader);
      if (parsed) store.receiveExtended(parsed);
    });
  },
  runtime: tradeRuntime,
  store: (deps) => new TradeStore(deps),
});
