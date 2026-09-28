# buyback

The `buyback` area lets the character undo a sale at a vendor and buy an
item straight into a chosen bag position. World-service code reads it
through `session.areas.buyback.state()`: `list` (each filled buyback
slot, 74 to 85, with the sold item's guid, entry and stack count, its
price in copper and its sale time), `pending` (the buyback or slot
purchase in flight) and `lastOutcome`. The area emits `listed` when the
list changes, `bought_back`, `bought_in_slot`, `refused` and
`unanswered`.

The acts need an open vendor window and no pending legacy vendor
request:

- `buyback(slot)` buys back the item in buyback slot 74 to 85. It
  refuses locally an empty slot and a price above the coinage.
- `buyInSlot({ vendorSlot, bag, slot, count })` buys the vendor's good
  in list slot `vendorSlot` into an empty backpack slot (bag 255, slots
  23 to 38) or an empty slot of an equipped bag (bags 19 to 22).

Each act settles as `ok`, `refused` with the server's reason, or
`unanswered` after 5 seconds of silence.

## Wire notes

- `CMSG_BUYBACK_ITEM` is the vendor guid, then the slot as `uint32`
  (`Server/Packets/ItemPackets.cpp:78-82`). wow_messages types the slot
  as `BuybackSlot`, 69 to 81
  (`wow_message_parser/wowm/world/item/cmsg_buyback_item.wowm:3-22`).
- The buyback slots are AzerothCore's raw inventory slots 74 to 85
  (`Entities/Player/Player.h:711-712`). AzerothCore wins over the 69 to
  81 of wow_messages, and the builder throws outside 74 to 85.
- `CMSG_BUY_ITEM_IN_SLOT` is the vendor guid, the item entry, the vendor
  list slot, the bag guid, the bag slot as `uint8` and the count as
  `uint32` (`Server/Packets/ItemPackets.cpp:84-92`,
  `Server/Packets/ItemPackets.h:145-150`), 29 bytes. wow_messages reads a
  `u8` amount
  (`wow_message_parser/wowm/world/item/cmsg_buy_item_in_slot.wowm:11-21`);
  AzerothCore wins. The vendor slot is the 1-based slot of
  `SMSG_LIST_INVENTORY`; the server drops slot 0 as a cheat
  (`Handlers/ItemHandler.cpp:800-804`). The bag guid is the character's
  own guid for the backpack or the guid of an equipped bag
  (`Handlers/ItemHandler.cpp:806-826`).
- The buyback slots are `PLAYER_FIELD_INV` words 74 to 85, with
  `BUYBACK_PRICE_1` and `BUYBACK_TIMESTAMP_1` for the price and the sale
  time (`Entities/Player/PlayerStorage.cpp:4107-4114`). The sale time is
  seconds since the login plus 30 hours, not a wall-clock time. The
  inventory read lists them in `buyback`, not in the carried `slots`.
- The server never sends a buyback item's object: a sale destroys it for
  the client (`Entities/Player/PlayerStorage.cpp:3108-3121`) and the
  self create block skips slots 74 to 85
  (`Entities/Player/Player.cpp:3989-4018`). The area remembers the entry
  and count of every carried item, so a sold item keeps them; an item
  sold before the area saw it lists them as unknown.
- The buyback list lasts one session: after a relog the list is empty.
- `CMSG_BUYBACK_ITEM` gets no reply packet on success: the buyback slot
  empties, the money drops and the item returns to the bags
  (`Handlers/ItemHandler.cpp:771-788`). The act settles `ok` when the
  slot no longer holds the item and either the bags hold it or the
  coinage fell.
- The area peeks the legacy vendor replies and leaves their owners in
  place. A refusal of `CMSG_BUYBACK_ITEM` is `SMSG_BUY_FAILED` with the item entry and
  `not_enough_money` (`Handlers/ItemHandler.cpp:766-769`), with item 0
  and `cant_find_item` for an empty slot (`Handlers/ItemHandler.cpp:795`),
  `SMSG_SELL_ITEM` with item 0 and `cant_find_vendor` out of range
  (`Handlers/ItemHandler.cpp:750-756`), or
  `SMSG_INVENTORY_CHANGE_FAILURE` naming the item when the bags are full
  (`Handlers/ItemHandler.cpp:791`). A slot purchase settles on
  `SMSG_BUY_ITEM` for its vendor and list slot
  (`Entities/Player/Player.cpp:10866-10871`), and is refused by
  `SMSG_BUY_FAILED` for its item
  (`Entities/Player/PlayerStorage.cpp:4199-4209`) or by an inventory
  failure with no item guid when no other request claims one
  (`Entities/Player/Player.cpp:10833-10837`).
- The legacy vendor store settles only its own request, and the acts
  refuse to start while it has one, so a buyback reply never settles a
  legacy buy or sell.

## Left out

- The money refusal of a buyback is a rig test only. The act refuses a
  price above the coinage before it sends, and the list is empty after
  the relog that staging money needs.

## Capabilities row

Proposed in economy-2.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_BUYBACK_ITEM` | `live` | probe flow `buyback-vendor` (`--arg npc=295 --arg sell=4865`) at the Goldshire inn on an `elwynn10` character, exit 0; a 12-byte send, the update that empties slot 74 and returns the item to the backpack follows, and the act settles `ok` | `Server/Packets/ItemPackets.cpp:78-82` |
| `CMSG_BUY_ITEM_IN_SLOT` | `live` | probe flow `buyback-vendor` (`--expect SMSG_BUY_ITEM`), exit 0; a 29-byte send for item 159 into an empty backpack slot, `SMSG_BUY_ITEM` follows, and the act settles `ok` | `Server/Packets/ItemPackets.cpp:84-92` |
