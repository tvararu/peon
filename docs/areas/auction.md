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

## Commands and notices

The command acts need an open house and an auctioneer in range, except `listPendingSales`, which needs only the world:

- `postAuction({ item, count, bid, buyout, hours })` sends `CMSG_AUCTION_SELL_ITEM` and settles `ok` with the new auction id. It refuses locally, before sending, hours other than 12, 24 and 48, a zero bid, a price over `MAX_MONEY_AMOUNT`, a count of 0 or over 1000, an item not in the bags, a soulbound or timed item, a count above the stack, and a non-empty equipped bag.
- `cancelAuction(id)` sends `CMSG_AUCTION_REMOVE_ITEM` and settles `ok` on action 1.
- `bid(id, price)` sends `CMSG_AUCTION_PLACE_BID`. When a held list row has that id it refuses `bid_too_low` for the prices the server drops silently; a price that reaches the buyout is a buyout.
- `listPendingSales()` sends `CMSG_AUCTION_LIST_PENDING_SALES` and settles `ok` with the count.

A command settles `refused` with a word for the server error: `database_error`, `not_enough_money`, `item_not_found`, `higher_bid`, `bid_increment`, `bid_own`, `restricted_account`. The state keeps the newest 20 `notices`: `won` (bidder notice with sum 0), `outbid` (any other sum) and `sold` (owner notice), each also emitted as an event.

- `SMSG_AUCTION_COMMAND_RESULT` is `uint32` auction id, `uint32` action, `uint32` error, and a fourth `uint32` only when the error is 0 and the action is not 0 (`Handlers/AuctionHouseHandler.cpp:77-86`). Actions are sell 0, cancel 1, bid 2; wowm reads an `InventoryResult` for error 1, which AzerothCore never sends.
- `SMSG_AUCTION_BIDDER_NOTIFICATION` is house id, auction id, bidder guid and four `uint32` words (sum, diff, item entry, 0), 32 bytes (`Handlers/AuctionHouseHandler.cpp:89-100`).
- `SMSG_AUCTION_OWNER_NOTIFICATION` is auction id, bid, `uint32` 0, `uint64` 0, item entry, `uint32` 0 and a float 0, 32 bytes (`Handlers/AuctionHouseHandler.cpp:103-114`).
- `CMSG_AUCTION_SELL_ITEM` is the auctioneer guid, a count, that many `uint64` guid and `uint32` count pairs, bid, buyout and the duration in minutes (`Handlers/AuctionHouseHandler.cpp:117-156`); 720, 1440 and 2880 pass (`Handlers/AuctionHouseHandler.cpp:183-193`).
- `CMSG_AUCTION_REMOVE_ITEM` and `CMSG_AUCTION_PLACE_BID` are the auctioneer guid, the auction id and for a bid the price (`Handlers/AuctionHouseHandler.cpp:425-591` for the bid, `Handlers/AuctionHouseHandler.cpp:594-668` for the cancel).
- `SMSG_AUCTION_LIST_PENDING_SALES` is one `uint32` count, always 0 (`Handlers/AuctionHouseHandler.cpp:849-866`).

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
| `CMSG_AUCTION_SELL_ITEM` | `live` | `auction-trade --arg do=post` on an `eversong10` character twice; action 0 with ids 27591 and 27592 (`wave5/artifacts/economy-12/FAC6ABF83D009-20261002T101522Z`, `-T101533Z`) | `Handlers/AuctionHouseHandler.cpp:117-156` |
| `CMSG_AUCTION_REMOVE_ITEM` | `live` | `do=cancel --arg id=27592`; action 1 with the tail 0 (`FAC6ABF83D009-20261002T101539Z`) | `Handlers/AuctionHouseHandler.cpp:594-668` |
| `CMSG_AUCTION_PLACE_BID` | `live` | a second account `do=buyout --arg id=27591 --arg owner=4987`; action 2, `ok` (`FAC6ABF845D34-20261002T102448Z`); `do=bid-own` on the first account answered `bid_own` (`FAC6ABF83D009-20261002T101551Z`) | `Handlers/AuctionHouseHandler.cpp:425-591` |
| `SMSG_AUCTION_COMMAND_RESULT` | `live` | every command above | `Handlers/AuctionHouseHandler.cpp:77-86` |
| `SMSG_AUCTION_BIDDER_NOTIFICATION` | `live` | the buyer's 32-byte notice arrived with the buyout, before the result (`FAC6ABF845D34-20261002T102448Z`) | `Handlers/AuctionHouseHandler.cpp:89-100` |
| `SMSG_AUCTION_OWNER_NOTIFICATION` | `live` | the seller's puppet trace holds the 32-byte notice (`wave5/artifacts/economy-12/seller-puppet-packets.jsonl`) | `Handlers/AuctionHouseHandler.cpp:103-114` |
| `CMSG_AUCTION_LIST_PENDING_SALES` | `live` | `do=pending`; the reply follows (`wave5/artifacts/economy-12/pending.json`) | `Handlers/AuctionHouseHandler.cpp:849-866` |
| `SMSG_AUCTION_LIST_PENDING_SALES` | `live` | the same run; count 0 | `Handlers/AuctionHouseHandler.cpp:849-866` |
| `SMSG_AUCTION_REMOVED_NOTIFICATION` | `dead` | no writer; `Server/Protocol/Opcodes.cpp:784` defines it `STATUS_NEVER` | `Server/Protocol/Opcodes.cpp:784` |
