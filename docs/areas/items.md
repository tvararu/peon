# items

The `items` area covers gear, bags, containers, item timers, sockets,
equipment sets and refunds. Core reads the whole item template the server
sends for `CMSG_ITEM_QUERY_SINGLE`: `parseItemQueryResponse` in
`packages/core/src/wow/protocol/item.ts` returns the item's slot, class
and race masks, item and required levels, required skill and spell,
stats, damage, armour, resistances, weapon delay, ammo type, bonding,
page text, lock, item set, durability, bag family, sockets, socket bonus,
gem properties, duration and limit category, with the name, quality and
on-use spells it read before.

## Wire notes

- `SMSG_ITEM_QUERY_SINGLE_RESPONSE` is written at
  `Handlers/ItemHandler.cpp:413-536`, and an unknown entry is the entry
  with the high bit set and nothing after it
  (`Handlers/ItemHandler.cpp:542-543`). The field order is: entry,
  class, subclass, sound override, the name (`Handlers/ItemHandler.cpp:418`)
  and three empty names, display id, quality, flags, flags2, buy price,
  sell price, inventory type, allowable class, allowable race, item
  level, required level, required skill and rank, required spell, honor
  rank, city rank, reputation faction and rank, max count, stackable,
  container slots, then the stats count and that many type and value
  pairs (`Handlers/ItemHandler.cpp:443-448`), scaling distribution and
  value, two damage entries of `float` min, `float` max and `uint32`
  school, armour, six resistances, delay, ammo type and the `float`
  ranged range (`Handlers/ItemHandler.cpp:469`).
- Five spell entries of `SMSG_ITEM_QUERY_SINGLE_RESPONSE` follow. A slot with no spell writes `0, 0, 0, -1, 0,
  -1` (`Handlers/ItemHandler.cpp:497-505`); the parser keeps only spells
  with a non-zero id.
- The tail of `SMSG_ITEM_QUERY_SINGLE_RESPONSE` starts at bonding (`Handlers/ItemHandler.cpp:507`): the
  description string, page text, language, page material, start quest,
  lock id, material, sheath, random property, random suffix, block, item
  set, max durability, area, map, bag family, totem category, three
  socket colour and content pairs, socket bonus, gem properties,
  disenchant skill, the `float` armour damage modifier, duration in
  seconds, limit category and holiday (`Handlers/ItemHandler.cpp:536`).
- wow_messages has the same `SMSG_ITEM_QUERY_SINGLE_RESPONSE` order
  (`wow_message_parser/wowm/world/queries/smsg_item_query_single_response.wowm`)
  but differs in sign. AzerothCore wins: it writes max count and
  stackable as `int32` (`Handlers/ItemHandler.cpp:440-441`).
- The template struct declares max count and stackable `int32`
  (`Entities/Item/ItemTemplate.h:644-645`) and armour `uint32`
  (`Entities/Item/ItemTemplate.h:652`); wowm has `u32` for the first two
  and `i32` for armour.
- A stackable of 0 or below means no stack limit
  (`Entities/Item/ItemTemplate.h:727-729`).
- Item ids with known templates, read from the live server's responses:
  25 Worn Shortsword (a main-hand weapon, inventory type 21), 4500
  Traveler's Backpack (a bag, 16 slots), 18854 Insignia of the Alliance
  (a trinket with an on-use spell), 16921 Halo of Transcendence (item set
  211, three stats, fire and frost resistance), 6948 Hearthstone and 159
  Refreshing Spring Water.
- `readInventory` in `packages/core/src/wow/inventory.ts` reads the item
  update fields the server sends to the owner: the remaining time
  (`ITEM_FIELD_DURATION`, counted down in
  `Entities/Item/Item.cpp:319-333`), five signed spell charges
  (`Entities/Item/Item.h:317`), the creator and gift creator guids, the
  raw flags with the soulbound, wrapped, readable and refundable bits
  named (`Entities/Item/ItemTemplate.h:109-121`), and the non-empty
  enchantment slots.
- The 12 enchantment slots (`Entities/Item/Item.h:167-183`, 0 based)
  each take three words from `ITEM_FIELD_ENCHANTMENT_1_1`: id, duration
  and charges (`Entities/Item/Item.h:190-197`). The update-field table
  types the third word as `u16x2`, but AzerothCore writes it as one
  `uint32` (`Entities/Item/Item.cpp:937-939`); core reads the whole
  word as the charges.
- `InventoryState.ammoId` is `PLAYER_AMMO_ID` of the self entity, the
  entry of the loaded ammo. The bags journal marks the row of that entry
  `loaded ammo` and names it in an `Ammo:` line.
- Item 5806 Fool's Stout is a timed item: a copy added to a hunter's
  bags read `duration` 7200 live. The `eversong10-hunter` preset loads
  ammo 2515 Sharp Arrow.
- A bags row is wearable when the template names an equip slot
  (`Entities/Player/PlayerStorage.cpp:129-245`; inventory type 0 names
  none) and the character's class bit is set in the template's allowable
  class (`Entities/Player/PlayerStorage.cpp:2397`) and the character's
  level is at least the required level
  (`Entities/Player/PlayerStorage.cpp:2448`). A wearable row whose item
  level beats the worn item's is an `upgrade`, by item level only; a bag
  row compares slot counts against the best equipped bag.
- A bags row shows `durability C/M` when the observed durability is
  below a quarter of the maximum, and `<time> left` while
  `ITEM_FIELD_DURATION` is nonzero (seconds remaining,
  `Entities/Item/Item.cpp:319-333`).
- `CMSG_SWAP_INV_ITEM` carries the destination slot first, then the
  source slot: `SwapInventoryItem::Read` reads them in that order
  (`Server/Packets/ItemPackets.cpp:29-33`). wow_messages lists the source
  first (`wow_message_parser/wowm/world/item/cmsg_swap_inv_item.wowm`).
  AzerothCore wins. `CMSG_SWAP_ITEM` also carries the destination bag and
  slot before the source (`Server/Packets/ItemPackets.cpp:41-47`).
- `CMSG_SPLIT_ITEM` carries a `uint32` count after the source and
  destination positions (`Server/Packets/ItemPackets.h:40`).
- `CMSG_AUTOSTORE_BAG_ITEM` names one destination bag and no slot
  (`Server/Packets/ItemPackets.cpp:108-113`). Bag 0 is `NULL_BAG`
  (`Entities/Item/Item.h:40`), which lets the server pick any free slot,
  and a bag slot 19-22 limits the pick to that bag
  (`Handlers/ItemHandler.cpp:967-1000`,
  `Entities/Player/PlayerStorage.cpp:605-609`). The gear tool sends every
  unequip through this opcode, so every unequip logs `items/unequipped`;
  a move that starts on worn gear reroutes the same way.
- The items area peeks `SMSG_INVENTORY_CHANGE_FAILURE`. A move owns a
  failure when `item1` is the moving item, or when `item1` is 0 and no
  legacy request (destroy, vendor buy, quest accept or reward, loot take)
  was pending during the move.
- Result 59 `EQUIP_ERR_NONE` (`Entities/Item/Item.h:106`) is a no-change
  notice that the server sends when an item is stored back into its own
  slot (`Handlers/ItemHandler.cpp:1001-1006`); the move settles
  `no_change`, not `refused`.
- Several move paths answer with no packet at all
  (`Handlers/ItemHandler.cpp:41-45,103-110`), so a move with no answer
  settles `unanswered` after 5 seconds.
- A bag equips into the first free bag slot, 19 to 22
  (`Entities/Player/PlayerStorage.cpp:214-218`). `readInventory` numbers
  an item inside a bag with that bag slot as `bag` and a 0-based `slot`,
  as the move opcodes do. The `soap truth` dump numbers the same item
  differently: the hearthstone moved into slot 0 of the bag in slot 19
  shows as `bag` 0, `slot` 0, so truth counts bags from 0 (seen with one
  bag equipped).
- Items used for the move proof: 36 Worn Mace (main hand, required level
  1), 4496 Small Brown Pouch (a 6-slot bag), 4344 Brown Linen Shirt
  (shirt), 2284 Rat Cloth Cloak (required level 10) and 20 of 159
  Refreshing Spring Water.

- `CMSG_OPEN_ITEM` carries the bag and slot
  (`Handlers/SpellHandler.cpp:214-216`). The server opens only an item
  with `ITEM_FLAG_HAS_LOOT` or a wrapped item, and refuses others with
  `EQUIP_ERR_CANT_DO_RIGHT_NOW` naming the item
  (`Handlers/SpellHandler.cpp:244-248`). It answers with the item's loot
  window: `SMSG_LOOT_RESPONSE` names the item guid
  (`Handlers/SpellHandler.cpp:284`, `Entities/Player/Player.cpp:8381-8384`).
  The `open` act asks the rewards store to open that guid first, so the
  loot window lands in `core.rewards`, and closes it with a failure after
  a refusal or 5 seconds with no answer.
- The gear tool snapshots the offered loot slots before taking them:
  receiving a slot removal shrinks the live window. It waits for each
  requested slot to disappear and for its matching item-push receipt
  before releasing the window. AzerothCore sends the removal before
  `SendNewItem` (`Entities/Player/Player.cpp:13896-13921`).
- `CMSG_READ_ITEM` carries the bag and slot
  (`Server/Packets/ItemPackets.cpp:65-69`). `SMSG_READ_ITEM_OK` and
  `SMSG_READ_ITEM_FAILED` carry only the item guid
  (`Handlers/ItemHandler.cpp:559-571`). On a refusal the server sends
  `SMSG_INVENTORY_CHANGE_FAILURE` naming the item before
  `SMSG_READ_ITEM_FAILED` (`Handlers/ItemHandler.cpp:565-571`), so the
  read settles `failed` with the failure's reason. An item with no page
  text draws `EQUIP_ERR_ITEM_NOT_FOUND` with no item
  (`Handlers/ItemHandler.cpp:574-575`).
- `SMSG_ITEM_TEXT_QUERY_RESPONSE` is `0`, the item guid and the text for
  a carried item, or `1` alone (`Handlers/ItemHandler.cpp:1468-1479`).
  The `1` answer names no guid, so it settles the oldest waiting query.
- Items used for the open and read proof: 5335 A Sack of Coins (has loot, no lock), 889 A Dusty Unsent Letter (page text, no required level) and 38579 Venomous Tome (page text, required level 20, so a level 10 character's read fails with `cant_equip_level_i`).
- Six gear eval scenarios prove the tool end to end on the live server
  (round 21): `t8-items-equip-upgrade` wears a better weapon and puts a
  bag on, `t8-items-unequip` takes the chest into the bags,
  `t8-items-move` moves the hearthstone into the bag in bag slot 19
  (truth shows it as `bag` 0, counting equipped bags from 0),
  `t8-items-split` splits 5 of 20 water off, `t8-items-open` opens A
  Sack of Coins and keeps the copper and items (the sack's contents are
  random per character, so the check compares the money delta to the
  loot window), and `t8-items-read` reads A Dusty Unsent Letter (its
  page text is empty on this server). The server deletes conjured
  food and water at login, which shows as missing rows in the unequip
  and open baselines.
- `t8-items-ammo` (round 21) loads 200 Rough Arrow (2512) added by the
  setup. The `eversong10-hunter` preset already has 1000 Sharp Arrow
  (2515) loaded, so the task names the Rough Arrows; with "the new
  arrows" the agent took the Sharp Arrows as done (replica 1, `fail`).
  The server answers `CMSG_SET_AMMO` with an update that sets
  `PLAYER_AMMO_ID` to 2512 about 8 ms later.

## Left out


- `SMSG_ITEM_COOLDOWN`, `SMSG_ITEM_TIME_UPDATE`,
  `SMSG_ITEM_ENCHANT_TIME_UPDATE`, `SMSG_DURABILITY_DAMAGE_DEATH` and
  `SMSG_SET_PROFICIENCY`: built by `items-6`.
- `CMSG_SOCKET_GEMS`, `SMSG_SOCKET_GEMS_RESULT`, `SMSG_ENCHANTMENTLOG`
  and `CMSG_CANCEL_TEMP_ENCHANTMENT`: built by `items-7`.
- `SMSG_EQUIPMENT_SET_LIST`, `CMSG_EQUIPMENT_SET_SAVE`,
  `SMSG_EQUIPMENT_SET_SAVED`, `CMSG_DELETEEQUIPMENT_SET`,
  `CMSG_EQUIPMENT_SET_USE` and `SMSG_EQUIPMENT_SET_USE_RESULT`: built by
  `items-9`.
- `CMSG_ITEM_REFUND_INFO`, `SMSG_ITEM_REFUND_INFO_RESPONSE`,
  `CMSG_ITEM_REFUND` and `SMSG_ITEM_REFUND_RESULT`: built by `items-10`.
- `CMSG_WRAP_ITEM`, `CMSG_ITEM_NAME_QUERY` and
  `SMSG_ITEM_NAME_QUERY_RESPONSE`: built by `items-11`.

## Capabilities row

The `gear` tool wears, takes off, moves, splits, opens, reads and loads ammo. The game log writes `items/equipped`, `items/unequipped`, `items/moved` and `items/split` for confirmed moves, `items/refused` and `items/unanswered` as wake rows, `items/upgrade` when a received item level beats the worn one, and `items/read` for reads and item text, and `items/ammo` when ammo is loaded. The harness never equips on its own.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_AUTOEQUIP_ITEM` | `live` | probe flow `items-move` (`do=equip`) on a `fresh` priest, exit 0: the Worn Mace moves from backpack slot 26 to main hand 15 and the bag to bag slot 19 in truth, and each act settles `confirmed`; equipping the level-10 Rat Cloth Cloak draws `SMSG_INVENTORY_CHANGE_FAILURE` result 1 naming the cloak and settles `refused` | `Server/Packets/ItemPackets.cpp:49-53` |
| `CMSG_AUTOEQUIP_ITEM_SLOT` | `live` | probe flow `items-move` (`do=equip_to`), exit 0: the Brown Linen Shirt swaps into slot 3 in truth and the act settles `confirmed` | `Server/Packets/ItemPackets.cpp:35-39` |
| `CMSG_SWAP_ITEM` | `live` | probe flow `items-move` (`do=move`, `to=19:0`), exit 0: the hearthstone moves from backpack slot 25 into the bag in truth and the act settles `confirmed` | `Server/Packets/ItemPackets.cpp:41-47` |
| `CMSG_SWAP_INV_ITEM` | `live` | probe flow `items-move` (`do=move`, `to=31`), exit 0: the Honey Bread moves from backpack slot 23 to 31 in truth and the act settles `confirmed` | `Server/Packets/ItemPackets.cpp:29-33` |
| `CMSG_AUTOSTORE_BAG_ITEM` | `live` | probe flow `items-move` (`do=unequip`), exit 0: the shirt in slot 3 moves to the backpack in truth and the act settles `confirmed` | `Server/Packets/ItemPackets.cpp:108-113` |
| `CMSG_SPLIT_ITEM` | `live` | probe flow `items-move` (`do=split`, `count=5`), exit 0: the stack of 20 water in slot 30 leaves 15, a new stack of 5 is in slot 32 in truth, and the act settles `confirmed` | `Server/Packets/ItemPackets.cpp:20-27` |
| `CMSG_OPEN_ITEM` | `live` | probe flow `items-open` (`do=open`) on an `eversong10` character, exit 0: the item-guid `SMSG_LOOT_RESPONSE` for A Sack of Coins opens the loot window with 1140 copper and one item, and the act resolves with it | `Handlers/SpellHandler.cpp:214-216` |
| `CMSG_READ_ITEM` | `live` | probe flow `items-open` (`do=read`), exit 0: the server answers for the letter and the Venomous Tome | `Server/Packets/ItemPackets.cpp:65-69` |
| `SMSG_READ_ITEM_OK` | `live` | probe flow `items-open` (`do=read`) on A Dusty Unsent Letter, exit 0: the guid is the letter's and the read settles `ok` | `Handlers/ItemHandler.cpp:562` |
| `SMSG_READ_ITEM_FAILED` | `live` | probe flow `items-open` (`do=read`) on the level-20 Venomous Tome, exit 0: `SMSG_INVENTORY_CHANGE_FAILURE` result 1 naming the tome comes first, then this packet with its guid, and the read settles `failed` (`cant_equip_level_i`) | `Handlers/ItemHandler.cpp:567` |
| `CMSG_ITEM_TEXT_QUERY` | `live` | probe flow `items-open` (`do=text`), exit 0: the query carries the letter's guid | `Handlers/ItemHandler.cpp:1461-1465` |
| `SMSG_ITEM_TEXT_QUERY_RESPONSE` | `live` | probe flow `items-open` (`do=text`), exit 0: `0`, the letter's guid and its empty text, and the act returns the text | `Handlers/ItemHandler.cpp:1468-1474` |
| `CMSG_SET_AMMO` | `live` | eval `t8-items-ammo` round 21 replica 2, verdict `pass`: `CMSG_SET_AMMO` with entry 2512 (Rough Arrow), the update that sets `PLAYER_AMMO_ID` to 2512 and the `items/ammo` game-log row | `Handlers/ItemHandler.cpp:1014-1039` |
