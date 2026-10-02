# auction

The `auction` area lets the character open an auctioneer's house, search it by name and filters with paging, and list its own auctions and bids. World-service code reads it through `session.areas.auction.state()`: `house` (the auctioneer guid and house id from the last `MSG_AUCTION_HELLO`), `pending` (the open or list request in flight), `search`, `owned` and `bids` (the last reply of each kind with rows, total and search delay), `searchDelayMs` (the delay of the last list reply) and `lastOutcome`. The area emits `house_opened` on every hello and `listed` with its kind on every list reply.

The browse acts need an open house and an auctioneer in range:

- `openAuctionHouse(npc)` sends `MSG_AUCTION_HELLO` and settles `ok` on the matching hello. Out of range sends nothing and throws before sending.
- `searchAuctions(query)` sends `CMSG_AUCTION_LIST_ITEMS` with the caller's `from` offset and settles `ok` on the matching `SMSG_AUCTION_LIST_RESULT`. It never sends `getAll = 1`.
- `listOwnAuctions(from)` sends `CMSG_AUCTION_LIST_OWNER_ITEMS` and settles `ok` on `SMSG_AUCTION_OWNER_LIST_RESULT`.
- `listBids(ids)` sends `CMSG_AUCTION_LIST_BIDDER_ITEMS` with exactly `16 + 4n` bytes and settles `ok` on `SMSG_AUCTION_BIDDER_LIST_RESULT`. More than 1000 ids are refused locally.

Each act settles as `ok` or `unanswered` after 10 seconds of silence.

## Wire notes

- `MSG_AUCTION_HELLO` is one `uint64` auctioneer guid (`Handlers/AuctionHouseHandler.cpp:34-37`); out of range or not an auctioneer the server stays silent (`Handlers/AuctionHouseHandler.cpp:39-44`). The reply is `uint64` guid, `uint32` house id, `uint8` enabled (`Handlers/AuctionHouseHandler.cpp:54-74`); the Horde house id is 6.
- `CMSG_AUCTION_LIST_ITEMS` reads the guid, page start, name, level range, filters, usable, getAll and the sort list in order (`Handlers/AuctionHouseHandler.cpp:749-847`); a sort count over 11 is silent (`Handlers/AuctionHouseHandler.cpp:749-847`). The area never sends `getAll = 1` for `CMSG_AUCTION_LIST_ITEMS` (`Handlers/AuctionHouseHandler.cpp:764-765`): a getAll reply for `SMSG_AUCTION_LIST_RESULT` carries up to 55000 rows (`AuctionHouse/AuctionHouseSearcher.cpp:185-195`).
- `SMSG_AUCTION_LIST_RESULT` carries the row count, the rows, the total and the search delay (`AuctionHouse/AuctionHouseSearcher.cpp:142-200`); a row is 148 bytes with seven enchant triples (`AuctionHouse/AuctionHouseSearcher.cpp:174-189`).
- The `SMSG_AUCTION_BIDDER_LIST_RESULT` reply can hold one auction twice (`AuctionHouse/AuctionHouseSearcher.cpp:238-268`); the parser keeps duplicate ids.
- `CMSG_AUCTION_LIST_BIDDER_ITEMS` is the guid, page start, outbid count and the ids (`Handlers/AuctionHouseHandler.cpp:671-720`); the body must be exactly `16 + 4n` bytes and more than 1000 ids stay silent (`Handlers/AuctionHouseHandler.cpp:671-720`).
- The hello settles a pending quest `talk` through `receiveWindow(guid, "auction")`. The gossip route sends the same hello: `HandleAuctionHelloOpcode` answers a gossip choice of `GOSSIP_OPTION_AUCTIONEER` with `SendAuctionHello` for `MSG_AUCTION_HELLO` (`Handlers/AuctionHouseHandler.cpp:34-51`).

## Left out

- `CMSG_AUCTION_SELL_ITEM`, `CMSG_AUCTION_REMOVE_ITEM`, `CMSG_AUCTION_PLACE_BID`, `CMSG_AUCTION_LIST_PENDING_SALES` and `SMSG_AUCTION_LIST_PENDING_SALES`: built by economy-12.
- `SMSG_AUCTION_COMMAND_RESULT`, `SMSG_AUCTION_BIDDER_NOTIFICATION` and `SMSG_AUCTION_OWNER_NOTIFICATION`: built by economy-12.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `MSG_AUCTION_HELLO` | `live` | `auction-browse` flow on an `eversong10` character at the Silvermoon house, exit 0; the server hello follows and the act settles `ok` | `Handlers/AuctionHouseHandler.cpp:34-44` |
| `CMSG_AUCTION_LIST_ITEMS` | `live` | the same run searches with no filter; the list result follows | `Handlers/AuctionHouseHandler.cpp:749-847` |
| `SMSG_AUCTION_LIST_RESULT` | `live` | the same run; `auction-browse` reply with rows, total and delay | `AuctionHouse/AuctionHouseSearcher.cpp:142-200` |
| `CMSG_AUCTION_LIST_OWNER_ITEMS` | `live` | the same run lists owned auctions; the owner list follows | `Handlers/AuctionHouseHandler.cpp:723-746` |
| `SMSG_AUCTION_OWNER_LIST_RESULT` | `live` | the same run; `auction-browse` reply | `AuctionHouse/AuctionHouseSearcher.cpp:205-232` |
| `CMSG_AUCTION_LIST_BIDDER_ITEMS` | `live` | the same run lists bids with no outbid ids; the bidder list follows | `Handlers/AuctionHouseHandler.cpp:671-720` |
| `SMSG_AUCTION_BIDDER_LIST_RESULT` | `live` | the same run; `auction-browse` reply | `AuctionHouse/AuctionHouseSearcher.cpp:245-268` |
| `SMSG_AUCTION_REMOVED_NOTIFICATION` | `dead` | no writer; `Server/Protocol/Opcodes.cpp:784` defines it `STATUS_NEVER` | `Server/Protocol/Opcodes.cpp:784` |
