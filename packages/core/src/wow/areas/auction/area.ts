import { AUCTION_OPCODES } from "#wow/areas/auction/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const auctionArea = defineArea({
  name: "auction",
  opcodes: AUCTION_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
