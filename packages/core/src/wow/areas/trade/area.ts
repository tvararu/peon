import { defineArea, emptyStore } from "#wow/areas/contract";
import { TRADE_OPCODES } from "#wow/areas/trade/opcodes";

export const tradeArea = defineArea({
  name: "trade",
  opcodes: TRADE_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
