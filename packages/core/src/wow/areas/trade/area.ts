import { defineArea } from "#wow/areas/contract";
import { TRADE_OPCODES } from "#wow/areas/trade/opcodes";
import { parseTradeStatus } from "#wow/areas/trade/protocol";
import { tradeRuntime } from "#wow/areas/trade/runtime";
import { TradeStore } from "#wow/areas/trade/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const tradeArea = defineArea({
  eventTypes: ["requested", "opened", "canceled", "refused", "unanswered"],
  name: "trade",
  opcodes: TRADE_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_TRADE_STATUS, (reader) => {
      const parsed = parseTradeStatus(reader);
      if (parsed) store.receiveStatus(parsed);
    });
  },
  runtime: tradeRuntime,
  store: (deps) => new TradeStore(deps),
});
