import { AUCTION_OPCODES } from "#wow/areas/auction/opcodes";
import {
  parseAuctionHello,
  parseAuctionList,
} from "#wow/areas/auction/protocol";
import { auctionRuntime } from "#wow/areas/auction/runtime";
import { AuctionStore } from "#wow/areas/auction/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const auctionArea = defineArea({
  eventTypes: ["house_opened", "listed"],
  name: "auction",
  opcodes: AUCTION_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.MSG_AUCTION_HELLO, (reader) => {
      store.receiveHello(parseAuctionHello(reader));
    });
    wire.on(GameOpcode.SMSG_AUCTION_LIST_RESULT, (reader) => {
      store.receiveList("search", parseAuctionList(reader));
    });
    wire.on(GameOpcode.SMSG_AUCTION_OWNER_LIST_RESULT, (reader) => {
      store.receiveList("owned", parseAuctionList(reader));
    });
    wire.on(GameOpcode.SMSG_AUCTION_BIDDER_LIST_RESULT, (reader) => {
      store.receiveList("bids", parseAuctionList(reader));
    });
  },
  runtime: auctionRuntime,
  store: (deps, core) => new AuctionStore(deps, core),
});
