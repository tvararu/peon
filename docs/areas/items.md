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
  entry of the loaded ammo.
- Item 5806 Fool's Stout is a timed item: a copy added to a hunter's
  bags read `duration` 7200 live. The `eversong10-hunter` preset loads
  ammo 2515 Sharp Arrow.

## Left out

- `CMSG_AUTOEQUIP_ITEM`, `CMSG_AUTOEQUIP_ITEM_SLOT`, `CMSG_SWAP_ITEM`,
  `CMSG_SWAP_INV_ITEM`, `CMSG_AUTOSTORE_BAG_ITEM` and `CMSG_SPLIT_ITEM`:
  built by `items-3a`.
- `CMSG_OPEN_ITEM`, `CMSG_READ_ITEM`, `SMSG_READ_ITEM_OK`,
  `SMSG_READ_ITEM_FAILED`, `CMSG_ITEM_TEXT_QUERY` and
  `SMSG_ITEM_TEXT_QUERY_RESPONSE`: built by `items-4`.
- `CMSG_SET_AMMO`: built by `items-8`.
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

No verb yet; `items-5a` adds the `gear` tool and its row.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
